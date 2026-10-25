// Moves merchants from the old plans (free / basic / pro / enterprise) to
// small / medium / enterprise. Safe to run more than once; usage counters and the
// super admin are left alone.
//
//   node scripts/migratePlans.js
const path = require('path');
const mongoose = require('mongoose');
const Merchant = require('../src/models/Merchant');
const { PLANS } = require('../src/config/plans');

// Old plan -> the subscription fields it becomes. There is no free plan any
// more, so free merchants land on Small without being subscribed to it.
const PLAN_MIGRATIONS = {
  free: { plan: 'small', status: 'inactive', requestsLimit: PLANS.small.requestsLimit },
  basic: { plan: 'small' },
  pro: { plan: 'medium' },
};

// Resolves to { oldPlan -> number of merchants moved off it }.
async function migratePlans() {
  const moved = {};
  for (const [from, fields] of Object.entries(PLAN_MIGRATIONS)) {
    const update = Object.fromEntries(Object.entries(fields).map(([key, value]) => [`subscription.${key}`, value]));
    const { modifiedCount } = await Merchant.updateMany(
      { ...Merchant.MERCHANTS_ONLY, 'subscription.plan': from },
      { $set: update }
    );
    moved[from] = modifiedCount;
  }
  return moved;
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const moved = await migratePlans();
    Object.entries(moved).forEach(([from, count]) => {
      console.log(`${from} -> ${PLAN_MIGRATIONS[from].plan}: ${count} merchant${count === 1 ? '' : 's'}`);
    });
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Plan migration failed:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { migratePlans, PLAN_MIGRATIONS };
