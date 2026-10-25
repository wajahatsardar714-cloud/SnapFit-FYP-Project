const bcrypt = require('bcryptjs');
const request = require('supertest');
const { setupTestEnv, tokenFor, createMerchant, createChart } = require('./helpers/testApp');

setupTestEnv();
const app = require('../src/app');
const Merchant = require('../src/models/Merchant');
const { PLANS, PLAN_IDS, DEFAULT_PLAN } = require('../src/config/plans');

const auth = (account) => ({ Authorization: `Bearer ${tokenFor(account)}` });

describe('plan config', () => {
  it('offers Small, Medium and Enterprise, with no free plan', () => {
    expect(PLAN_IDS).toEqual(['small', 'medium', 'enterprise']);
    expect(PLANS).toEqual({
      small: { plan: 'small', name: 'Small', price: 29, requestsLimit: 500, chartsLimit: 5 },
      medium: { plan: 'medium', name: 'Medium', price: 99, requestsLimit: 5000, chartsLimit: null },
      enterprise: { plan: 'enterprise', name: 'Enterprise', price: null, requestsLimit: null, chartsLimit: null },
    });
  });

  it('is what the Merchant model accepts', () => {
    expect(Merchant.schema.path('subscription.plan').enumValues).toEqual(PLAN_IDS);
    expect(DEFAULT_PLAN).toBe('small');
  });
});

describe('GET /api/subscription/plans', () => {
  it('lists every plan without a token', async () => {
    const res = await request(app).get('/api/subscription/plans');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ plans: Object.values(PLANS) });
  });
});

describe('POST /api/subscription/select', () => {
  const select = (merchant, plan) => request(app).post('/api/subscription/select').set(auth(merchant)).send({ plan });

  it.each(PLAN_IDS)('subscribes an inactive merchant to %s with its quota', async (plan) => {
    const merchant = await createMerchant({ subscription: { status: 'inactive', requestsUsed: 3 } });

    const res = await select(merchant, plan);

    expect(res.status).toBe(200);
    expect(res.body.subscription).toMatchObject({
      plan,
      status: 'active',
      requestsUsed: 0,
      requestsLimit: PLANS[plan].requestsLimit,
    });
    expect(new Date(res.body.subscription.endDate).getTime()).toBeGreaterThan(Date.now());
  });

  it.each(['free', 'basic', 'pro', 'gold', undefined])('rejects plan %p', async (plan) => {
    const merchant = await createMerchant();

    const res = await select(merchant, plan);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid plan selected' });
  });

  it('needs a token', async () => {
    expect((await request(app).post('/api/subscription/select').send({ plan: 'small' })).status).toBe(401);
  });
});

describe('new accounts', () => {
  it('start on the Small plan, not yet subscribed', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'New',
      email: 'new@test.dev',
      password: 'longenough1',
      businessName: 'New Shop',
    });

    expect(res.status).toBe(201);
    expect(res.body.merchant.subscription).toMatchObject({ plan: 'small', status: 'inactive', requestsUsed: 0 });
  });
});

describe('the signed-in account', () => {
  it('carries its subscription on login and /me', async () => {
    const password = 'correct-horse-battery';
    const merchant = await createMerchant({
      password: await bcrypt.hash(password, 4),
      subscription: { plan: 'medium', status: 'active', requestsLimit: 5000, requestsUsed: 12 },
    });
    const expected = { plan: 'medium', status: 'active', requestsLimit: 5000, requestsUsed: 12 };

    const login = await request(app).post('/api/auth/login').send({ email: merchant.email, password });
    const me = await request(app).get('/api/auth/me').set(auth(merchant));

    expect(login.body.merchant.subscription).toMatchObject(expected);
    expect(me.body.merchant.subscription).toMatchObject(expected);
  });
});

describe('size chart limits', () => {
  const newChart = {
    name: 'Tees',
    category: 'tops',
    sizes: [
      { label: 'S', measurements: { chest: { min: 86, max: 94 } } },
      { label: 'M', measurements: { chest: { min: 94, max: 102 } } },
    ],
  };

  it("stop at the Small plan's chart limit, naming the plan", async () => {
    const merchant = await createMerchant();
    for (let i = 0; i < PLANS.small.chartsLimit; i += 1) await createChart(merchant);

    const res = await request(app).post('/api/charts').set(auth(merchant)).send(newChart);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Your Small plan allows up to 5 size charts. Upgrade to add more.' });
  });

  it('do not apply on the Medium plan', async () => {
    const merchant = await createMerchant({ subscription: { plan: 'medium', status: 'active' } });
    for (let i = 0; i < PLANS.small.chartsLimit; i += 1) await createChart(merchant);

    const res = await request(app).post('/api/charts').set(auth(merchant)).send(newChart);

    expect(res.status).toBe(201);
  });
});
