const request = require('supertest');
const { setupTestEnv, tokenFor, createMerchant, createSuperAdmin } = require('./helpers/testApp');

setupTestEnv();
const app = require('../src/app');
const Merchant = require('../src/models/Merchant');

const DAY_MS = 24 * 60 * 60 * 1000;
const SUBSCRIPTION_REQUIRED = { message: 'An active subscription is required', code: 'SUBSCRIPTION_REQUIRED' };

const auth = (account) => ({ Authorization: `Bearer ${tokenFor(account)}` });

const LOCKED_ROUTES = [
  ['get', '/api/charts'],
  ['post', '/api/charts'],
  ['get', '/api/charts/000000000000000000000000'],
  ['put', '/api/charts/000000000000000000000000'],
  ['delete', '/api/charts/000000000000000000000000'],
  ['get', '/api/products/mappings'],
  ['post', '/api/products/map'],
  ['delete', '/api/products/map/000000000000000000000000'],
  ['put', '/api/products/000000000000000000000000/anchor-points'],
  ['get', '/api/merchant/api-key'],
  ['post', '/api/merchant/api-key/generate'],
  ['post', '/api/merchant/api-key/regenerate'],
  ['get', '/api/analytics/dashboard'],
  ['get', '/api/analytics/usage'],
  ['get', '/api/analytics/breakdown'],
  ['get', '/api/analytics/recent'],
  ['get', '/api/analytics/export'],
  ['get', '/api/feedback/stats'],
];

const LOCKED_OUT = {
  inactive: { plan: 'small', status: 'inactive' },
  expired: { plan: 'small', status: 'expired' },
  'active past its end date': { plan: 'small', status: 'active', endDate: new Date(Date.now() - DAY_MS) },
};

describe('requireActiveSubscription', () => {
  describe.each(Object.entries(LOCKED_OUT))('a merchant whose subscription is %s', (_, subscription) => {
    it.each(LOCKED_ROUTES)('gets 403 SUBSCRIPTION_REQUIRED on %s %s', async (method, path) => {
      const merchant = await createMerchant({ subscription });

      const res = await request(app)[method](path).set(auth(merchant));

      expect(res.status).toBe(403);
      expect(res.body).toEqual(SUBSCRIPTION_REQUIRED);
    });
  });

  it('locks out a merchant stored without any subscription', async () => {
    const { insertedId } = await Merchant.collection.insertOne({
      name: 'No Plan',
      email: 'noplan@test.dev',
      password: 'hashed',
      businessName: 'No Plan Shop',
    });
    const merchant = await Merchant.findById(insertedId);

    for (const [method, path] of LOCKED_ROUTES) {
      const res = await request(app)[method](path).set(auth(merchant));
      expect(res.body).toEqual(SUBSCRIPTION_REQUIRED);
    }
  });

  it.each([
    ['no end date', {}],
    ['an end date still ahead', { endDate: new Date(Date.now() + DAY_MS) }],
  ])('lets an active merchant with %s through', async (_, extra) => {
    const merchant = await createMerchant({ subscription: { plan: 'small', status: 'active', ...extra } });
    const headers = auth(merchant);

    expect((await request(app).get('/api/charts').set(headers)).status).toBe(200);
    expect((await request(app).get('/api/products/mappings').set(headers)).status).toBe(200);
    expect((await request(app).post('/api/merchant/api-key/generate').set(headers)).status).toBe(201);
    expect((await request(app).get('/api/analytics/dashboard').set(headers)).status).toBe(200);
    expect((await request(app).get('/api/feedback/stats').set(headers)).status).toBe(200);
  });

  it('leaves auth, subscription and account settings reachable while inactive', async () => {
    const merchant = await createMerchant({ subscription: { plan: 'small', status: 'inactive' } });
    const headers = auth(merchant);

    expect((await request(app).get('/api/auth/me').set(headers)).status).toBe(200);
    expect((await request(app).get('/api/subscription/status').set(headers)).status).toBe(200);
    expect((await request(app).get('/api/subscription/plans')).status).toBe(200);
    const profile = await request(app)
      .put('/api/merchant/profile')
      .set(headers)
      .send({ name: 'Renamed', businessName: 'Renamed Shop' });
    expect(profile.status).toBe(200);
    expect((await request(app).put('/api/merchant/password').set(headers).send({})).status).toBe(400);

    const select = await request(app).post('/api/subscription/select').set(headers).send({ plan: 'medium' });
    expect(select.status).toBe(200);
    expect((await request(app).get('/api/charts').set(headers)).status).toBe(200);
  });

  it('keeps the public anchor-point lookup open', async () => {
    expect((await request(app).get('/api/products/anchor-points')).status).toBe(400);
  });

  it('never locks the super admin out of the admin API', async () => {
    const admin = await createSuperAdmin();
    const headers = auth(admin);

    for (const path of ['/api/admin/overview', '/api/admin/merchants', '/api/admin/analytics', '/api/admin/audit-log']) {
      expect((await request(app).get(path).set(headers)).status).toBe(200);
    }
  });
});
