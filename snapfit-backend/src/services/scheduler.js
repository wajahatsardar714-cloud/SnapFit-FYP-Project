const Merchant = require('../models/Merchant');
const { notify } = require('./notify');
const { claimAlert, planName } = require('./subscriptionAlerts');
const { sendDueAnnouncements } = require('./announcements');

// A small in-process timer for the time-based jobs: plan-ending reminders,
// marking ended plans as expired, and sending scheduled announcements. Started
// by server.js only (never in tests); tests call runScheduledJobs with a fake
// "now". Every job is safe to run again: each reminder is claimed in the
// database before it is sent.
//
// Request usage is not reset on a timer anywhere in SnapFit -- it starts again
// at 0 when a plan is chosen, or when the super admin resets it -- so there is
// no monthly usage.reset job here.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RUN_EVERY_MS = HOUR_MS;

let timer = null;

function activeEndingBetween(from, to) {
  return {
    ...Merchant.MERCHANTS_ONLY,
    'subscription.status': 'active',
    'subscription.endDate': { $gt: from, $lte: to },
  };
}

function reminderData(merchant) {
  return { planName: planName(merchant.subscription), endDate: merchant.subscription.endDate };
}

// "Your plan ends tomorrow": plans ending within a day.
async function sendEndingTomorrow(now) {
  const merchants = await Merchant.find({
    ...activeEndingBetween(now, new Date(now.getTime() + DAY_MS)),
    'subscription.alerts.expiring1dAt': null,
  })
    .select('subscription')
    .lean();

  let sent = 0;
  for (const merchant of merchants) {
    if (await claimAlert(merchant._id, 'expiring1dAt', now)) {
      // Too late for the 7-day reminder: never send it after this one.
      await claimAlert(merchant._id, 'expiring7dAt', now);
      await notify(merchant._id, 'subscription.expiring_1d', { data: reminderData(merchant) });
      sent += 1;
    }
  }
  return sent;
}

// "Your plan ends in 7 days": plans ending in 1 to 7 days.
async function sendEndingInAWeek(now) {
  const merchants = await Merchant.find({
    ...activeEndingBetween(new Date(now.getTime() + DAY_MS), new Date(now.getTime() + 7 * DAY_MS)),
    'subscription.alerts.expiring7dAt': null,
  })
    .select('subscription')
    .lean();

  let sent = 0;
  for (const merchant of merchants) {
    if (await claimAlert(merchant._id, 'expiring7dAt', now)) {
      await notify(merchant._id, 'subscription.expiring_7d', { data: reminderData(merchant) });
      sent += 1;
    }
  }
  return sent;
}

// Active plans past their end date become 'expired' (the API key and the
// dashboard already stop working at the end date), and the merchant is told.
async function expireEndedPlans(now) {
  const merchants = await Merchant.find({
    ...Merchant.MERCHANTS_ONLY,
    'subscription.status': 'active',
    'subscription.endDate': { $lte: now },
  })
    .select('subscription')
    .lean();

  let expired = 0;
  for (const merchant of merchants) {
    // Only if still active and ended, so a plan renewed meanwhile is left alone.
    const result = await Merchant.updateOne(
      { _id: merchant._id, 'subscription.status': 'active', 'subscription.endDate': { $lte: now } },
      { $set: { 'subscription.status': 'expired' } }
    );
    if (result.modifiedCount === 1) {
      await notify(merchant._id, 'subscription.expired', { data: reminderData(merchant) });
      expired += 1;
    }
  }
  return expired;
}

// One pass of every job. Each job's failure is logged and the others still run.
async function runScheduledJobs(now = new Date()) {
  const results = {};
  const jobs = {
    expiring1d: sendEndingTomorrow,
    expiring7d: sendEndingInAWeek,
    expired: expireEndedPlans,
    announcements: sendDueAnnouncements,
  };
  for (const [name, job] of Object.entries(jobs)) {
    try {
      results[name] = await job(now);
    } catch (err) {
      console.error(`Scheduled job "${name}" failed:`, err.message);
      results[name] = 0;
    }
  }
  return results;
}

// Runs the jobs now and then every hour. Does nothing under NODE_ENV=test.
function startScheduler({ intervalMs = RUN_EVERY_MS } = {}) {
  if (process.env.NODE_ENV === 'test' || timer) return null;
  let running = false;
  const tick = async () => {
    if (running) return; // a slow pass is never overlapped by the next
    running = true;
    try {
      await runScheduledJobs(new Date());
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return timer;
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { runScheduledJobs, startScheduler, stopScheduler, RUN_EVERY_MS };
