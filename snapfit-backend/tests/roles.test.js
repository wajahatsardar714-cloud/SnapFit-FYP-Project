const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { setupTestEnv, tokenFor, createMerchant, createSuperAdmin } = require('./helpers/testApp');

setupTestEnv();
const app = require('../src/app');
const Merchant = require('../src/models/Merchant');

const SUSPENDED_MESSAGE = 'This account has been suspended. Contact support.';
const PASSWORD = 'correct-horse-battery';

const auth = (account) => ({ Authorization: `Bearer ${tokenFor(account)}` });

async function createLoginMerchant(overrides = {}) {
  return createMerchant({ password: await bcrypt.hash(PASSWORD, 4), ...overrides });
}

describe('Merchant model defaults', () => {
  it('loads accounts stored before roles existed as active merchants', async () => {
    const { insertedId } = await Merchant.collection.insertOne({
      name: 'Legacy',
      email: 'legacy@test.dev',
      password: 'hashed',
      businessName: 'Old Shop',
      subscription: { plan: 'small', status: 'inactive', requestsUsed: 0 },
    });

    const legacy = await Merchant.findById(insertedId);

    expect(legacy.role).toBe('merchant');
    expect(legacy.status).toBe('active');
    const res = await request(app).get('/api/subscription/status').set(auth(legacy));
    expect(res.status).toBe(200);
  });

  it('requires a business name for merchants but not for the super admin', async () => {
    await expect(Merchant.create({ name: 'No Shop', email: 'noshop@test.dev', password: 'x' })).rejects.toThrow(
      /businessName/
    );
    await expect(createSuperAdmin()).resolves.toBeTruthy();
  });
});

describe('POST /api/auth/register', () => {
  it('ignores role and status in the body', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Sneaky',
      email: 'sneaky@test.dev',
      password: 'longenough1',
      businessName: 'Sneaky Shop',
      role: 'superadmin',
      status: 'suspended',
    });

    expect(res.status).toBe(201);
    expect(res.body.merchant).toMatchObject({ role: 'merchant', status: 'active' });
    expect(res.body.merchant.password).toBeUndefined();
    expect(jwt.decode(res.body.token).role).toBe('merchant');
    const stored = await Merchant.findOne({ email: 'sneaky@test.dev' });
    expect(stored).toMatchObject({ role: 'merchant', status: 'active' });
  });
});

describe('POST /api/auth/login', () => {
  const login = (email, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });

  it('puts the role in the token and the sanitized account', async () => {
    const merchant = await createLoginMerchant();

    const res = await login(merchant.email);

    expect(res.status).toBe(200);
    expect(jwt.decode(res.body.token)).toMatchObject({ merchantId: String(merchant._id), role: 'merchant' });
    expect(res.body.merchant).toMatchObject({ role: 'merchant', status: 'active', email: merchant.email });
    expect(res.body.merchant.password).toBeUndefined();
  });

  it('logs the super admin in with role superadmin', async () => {
    await createSuperAdmin({ password: await bcrypt.hash(PASSWORD, 4) });

    const res = await login('admin@snapfit.test');

    expect(res.status).toBe(200);
    expect(jwt.decode(res.body.token).role).toBe('superadmin');
    expect(res.body.merchant).toMatchObject({ role: 'superadmin', status: 'active' });
  });

  it('refuses a suspended account with 403', async () => {
    const merchant = await createLoginMerchant({ status: 'suspended', suspendedAt: new Date() });

    const res = await login(merchant.email);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: SUSPENDED_MESSAGE });
  });

  it('still answers 401 for a suspended account with the wrong password', async () => {
    const merchant = await createLoginMerchant({ status: 'suspended' });

    const res = await login(merchant.email, 'wrong-password');

    expect(res.status).toBe(401);
  });
});

describe('protect', () => {
  it('returns role and status from /api/auth/me', async () => {
    const merchant = await createMerchant();

    const res = await request(app).get('/api/auth/me').set(auth(merchant));

    expect(res.status).toBe(200);
    expect(res.body.merchant).toMatchObject({ role: 'merchant', status: 'active' });
    expect(res.body.merchant.password).toBeUndefined();
  });

  it('stops an already-issued token once the account is suspended', async () => {
    const merchant = await createMerchant();
    const headers = auth(merchant);
    expect((await request(app).get('/api/auth/me').set(headers)).status).toBe(200);

    await Merchant.updateOne({ _id: merchant._id }, { status: 'suspended' });

    const res = await request(app).get('/api/auth/me').set(headers);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: SUSPENDED_MESSAGE });
  });

  it('rejects the token of a deleted account with 401', async () => {
    const merchant = await createMerchant();
    const headers = auth(merchant);
    await Merchant.deleteOne({ _id: merchant._id });

    const res = await request(app).get('/api/charts').set(headers);

    expect(res.status).toBe(401);
  });

  it('takes the role from the account, not from the token', async () => {
    const merchant = await createMerchant();
    const forged = jwt.sign({ merchantId: merchant._id, email: merchant.email, role: 'superadmin' }, process.env.JWT_SECRET);

    const res = await request(app).get('/api/admin/overview').set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(403);
  });
});

describe('role gates', () => {
  const MERCHANT_ROUTES = [
    ['get', '/api/subscription/status'],
    ['post', '/api/subscription/select'],
    ['post', '/api/subscription/cancel'],
    ['get', '/api/merchant/api-key'],
    ['post', '/api/merchant/api-key/generate'],
    ['post', '/api/merchant/api-key/regenerate'],
    ['put', '/api/merchant/profile'],
    ['put', '/api/merchant/password'],
    ['delete', '/api/merchant/account'],
    ['get', '/api/charts'],
    ['post', '/api/charts'],
    ['get', '/api/products/mappings'],
    ['post', '/api/products/map'],
    ['get', '/api/analytics/dashboard'],
    ['get', '/api/analytics/usage'],
    ['get', '/api/analytics/breakdown'],
    ['get', '/api/analytics/recent'],
    ['get', '/api/analytics/export'],
    ['get', '/api/feedback/stats'],
  ];

  it.each(MERCHANT_ROUTES)('the super admin gets 403 on %s %s', async (method, path) => {
    const admin = await createSuperAdmin();

    const res = await request(app)[method](path).set(auth(admin));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Merchant account required' });
  });

  it('a merchant still reaches their own routes', async () => {
    const merchant = await createMerchant();

    expect((await request(app).get('/api/charts').set(auth(merchant))).status).toBe(200);
    expect((await request(app).get('/api/analytics/dashboard').set(auth(merchant))).status).toBe(200);
  });

  it('leaves the public routes open', async () => {
    expect((await request(app).get('/api/subscription/plans')).status).toBe(200);
    expect((await request(app).get('/api/products/anchor-points')).status).toBe(400);
  });

  it.each([
    ['get', '/api/admin/overview'],
    ['get', '/api/admin/merchants'],
    ['get', '/api/admin/analytics'],
    ['get', '/api/admin/audit-log'],
    ['post', '/api/admin/demo/recommend'],
  ])('a merchant gets 403 on %s %s', async (method, path) => {
    const merchant = await createMerchant();

    const res = await request(app)[method](path).set(auth(merchant));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Super admin access required' });
  });

  it('the admin API needs a token', async () => {
    expect((await request(app).get('/api/admin/overview')).status).toBe(401);
  });
});

describe('API keys of suspended merchants', () => {
  it('are refused on billable and non-billable widget routes', async () => {
    const merchant = await createMerchant({ status: 'suspended' });

    const handoff = await request(app).post('/api/handoff/sessions').set('x-api-key', merchant.apiKey);
    const feedback = await request(app).post('/api/feedback').set('x-api-key', merchant.apiKey).send({});

    for (const res of [handoff, feedback]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ message: 'Merchant account is suspended' });
    }
    expect((await Merchant.findById(merchant._id)).subscription.requestsUsed).toBe(0);
  });
});
