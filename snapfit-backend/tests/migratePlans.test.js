const { setupTestEnv } = require('./helpers/testApp');

setupTestEnv();
const Merchant = require('../src/models/Merchant');
const { migratePlans } = require('../scripts/migratePlans');

const END_DATE = new Date('2027-01-31T00:00:00.000Z');

// Old plan ids no longer pass the schema, so accounts are stored as they were
// before the rename.
async function insertAccount(email, subscription, fields = {}) {
  await Merchant.collection.insertOne({ name: email, email, password: 'hashed', businessName: 'Shop', subscription, ...fields });
}

const subscriptionOf = async (email) => (await Merchant.findOne({ email }).lean()).subscription;

beforeEach(async () => {
  await insertAccount('free@test.dev', { plan: 'free', status: 'active', requestsLimit: 50, requestsUsed: 7 });
  await insertAccount('basic@test.dev', { plan: 'basic', status: 'active', requestsLimit: 500, requestsUsed: 40, endDate: END_DATE });
  await insertAccount('pro@test.dev', { plan: 'pro', status: 'expired', requestsLimit: 5000, requestsUsed: 900 });
  await insertAccount('enterprise@test.dev', { plan: 'enterprise', status: 'active', requestsLimit: null, requestsUsed: 3 });
  await insertAccount('admin@test.dev', { plan: 'free', status: 'inactive', requestsUsed: 0 }, { role: 'superadmin' });
});

describe('migratePlans', () => {
  it('maps free to an inactive Small plan with its quota, keeping usage', async () => {
    await migratePlans();

    expect(await subscriptionOf('free@test.dev')).toEqual({
      plan: 'small',
      status: 'inactive',
      requestsLimit: 500,
      requestsUsed: 7,
    });
  });

  it('maps basic to small and pro to medium, leaving the rest of the subscription', async () => {
    await migratePlans();

    expect(await subscriptionOf('basic@test.dev')).toEqual({
      plan: 'small',
      status: 'active',
      requestsLimit: 500,
      requestsUsed: 40,
      endDate: END_DATE,
    });
    expect(await subscriptionOf('pro@test.dev')).toEqual({
      plan: 'medium',
      status: 'expired',
      requestsLimit: 5000,
      requestsUsed: 900,
    });
  });

  it('keeps enterprise and never touches the super admin', async () => {
    const adminBefore = await Merchant.findOne({ email: 'admin@test.dev' }).lean();

    await migratePlans();

    expect(await subscriptionOf('enterprise@test.dev')).toEqual({
      plan: 'enterprise',
      status: 'active',
      requestsLimit: null,
      requestsUsed: 3,
    });
    expect(await Merchant.findOne({ email: 'admin@test.dev' }).lean()).toEqual(adminBefore);
  });

  it('reports what it moved and is idempotent', async () => {
    await insertAccount('basic2@test.dev', { plan: 'basic', status: 'inactive', requestsUsed: 0 });

    expect(await migratePlans()).toEqual({ free: 1, basic: 2, pro: 1 });
    const afterFirstRun = await Merchant.find().sort({ email: 1 }).lean();

    expect(await migratePlans()).toEqual({ free: 0, basic: 0, pro: 0 });
    expect(await Merchant.find().sort({ email: 1 }).lean()).toEqual(afterFirstRun);
  });

  it('leaves every merchant on a plan the model accepts', async () => {
    await migratePlans();

    const merchants = await Merchant.find(Merchant.MERCHANTS_ONLY);
    await Promise.all(merchants.map((merchant) => expect(merchant.validate()).resolves.toBeUndefined()));
  });
});
