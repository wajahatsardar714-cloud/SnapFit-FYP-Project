const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { setupTestEnv, tokenFor, createMerchant, createSuperAdmin, createChart } = require('./helpers/testApp');

const env = setupTestEnv({ replSet: true });
const app = require('../src/app');
const Merchant = require('../src/models/Merchant');
const SizeChart = require('../src/models/SizeChart');
const ProductMapping = require('../src/models/ProductMapping');
const Recommendation = require('../src/models/Recommendation');
const Feedback = require('../src/models/Feedback');
const AuditLog = require('../src/models/AuditLog');

const ANCHORS = {
  shoulderLeft: { x: 0.3, y: 0.2 },
  shoulderRight: { x: 0.7, y: 0.2 },
  hipLeft: { x: 0.3, y: 0.7 },
  hipRight: { x: 0.7, y: 0.7 },
};

const SUMMARY_KEYS = [
  '_id',
  'name',
  'email',
  'businessName',
  'businessType',
  'phone',
  'status',
  'suspendedAt',
  'suspendedReason',
  'subscription',
  'hasApiKey',
  'createdAt',
  'counts',
].sort();

let admin;
let adminAuth;

beforeEach(async () => {
  admin = await createSuperAdmin();
  adminAuth = { Authorization: `Bearer ${tokenFor(admin)}` };
});

const get = (url) => request(app).get(`/api/admin${url}`).set(adminAuth);
const patch = (url, body) => request(app).patch(`/api/admin${url}`).set(adminAuth).send(body);
const post = (url, body) => request(app).post(`/api/admin${url}`).set(adminAuth).send(body);
const del = (url) => request(app).delete(`/api/admin${url}`).set(adminAuth);

// No response may ever carry a password hash or a full API key.
function expectNoSecrets(res, merchants) {
  expect(res.text).not.toMatch(/"password"/);
  merchants.filter((m) => m.apiKey).forEach((m) => expect(res.text).not.toContain(m.apiKey));
}

const auditEntries = () => AuditLog.find().sort({ createdAt: 1 }).lean();

describe('GET /api/admin/merchants', () => {
  it('lists merchants only, newest first, as summaries with counts', async () => {
    const older = await createMerchant({ name: 'Older', createdAt: new Date('2026-01-01') });
    const newer = await createMerchant({ name: 'Newer', businessType: 'clothing', phone: '0300' });
    await createChart(newer);
    await Recommendation.create({ merchantId: newer._id, status: 'success' });
    await Recommendation.create({ merchantId: newer._id, status: 'success', source: 'admin_demo' });

    const res = await get('/merchants');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 2, page: 1, pages: 1 });
    expect(res.body.merchants.map((m) => m.name)).toEqual(['Newer', 'Older']);
    const [summary] = res.body.merchants;
    expect(Object.keys(summary).sort()).toEqual(SUMMARY_KEYS);
    expect(summary).toMatchObject({
      _id: String(newer._id),
      businessType: 'clothing',
      phone: '0300',
      status: 'active',
      suspendedAt: null,
      hasApiKey: true,
      subscription: { plan: 'basic', status: 'active', requestsLimit: 500, requestsUsed: 0 },
      counts: { sizeCharts: 1, products: 0, recommendations: 1 },
    });
    expect(res.body.merchants[1]).toMatchObject({ _id: String(older._id), businessType: null, phone: null });
    expectNoSecrets(res, [older, newer]);
  });

  it('searches name, email and business name case-insensitively, treating input literally', async () => {
    await createMerchant({ name: 'Alice', businessName: 'Blue Tees' });
    await createMerchant({ name: 'Bob', businessName: 'Red (Shirts)', email: 'bob@shop.dev' });
    await createMerchant({ name: 'Carol', businessName: 'Green' });

    const byBusiness = await get('/merchants?search=blue');
    const byEmail = await get('/merchants?search=BOB@SHOP');
    const literal = await get(`/merchants?search=${encodeURIComponent('(shirts)')}`);
    const regexLooking = await get(`/merchants?search=${encodeURIComponent('.*')}`);

    expect(byBusiness.body.merchants.map((m) => m.name)).toEqual(['Alice']);
    expect(byEmail.body.merchants.map((m) => m.name)).toEqual(['Bob']);
    expect(literal.body.merchants.map((m) => m.name)).toEqual(['Bob']);
    expect(regexLooking.body.total).toBe(0);
  });

  it('filters by plan and account status', async () => {
    await createMerchant({ name: 'Free', subscription: { plan: 'free', status: 'inactive' } });
    await createMerchant({ name: 'Pro', subscription: { plan: 'pro', status: 'active' } });
    await createMerchant({ name: 'Suspended', status: 'suspended' });

    expect((await get('/merchants?plan=pro')).body.merchants.map((m) => m.name)).toEqual(['Pro']);
    expect((await get('/merchants?status=suspended')).body.merchants.map((m) => m.name)).toEqual(['Suspended']);
    expect((await get('/merchants?status=active')).body.total).toBe(2);
  });

  it('paginates', async () => {
    for (let i = 0; i < 5; i += 1) {
      await createMerchant({ name: `M${i}`, createdAt: new Date(2026, 0, i + 1) });
    }

    const res = await get('/merchants?page=2&limit=2');

    expect(res.body).toMatchObject({ total: 5, page: 2, pages: 3 });
    expect(res.body.merchants.map((m) => m.name)).toEqual(['M2', 'M1']);
  });

  it.each([
    ['page=0', 'page must be a positive integer'],
    ['limit=101', 'limit must be an integer between 1 and 100'],
    ['plan=gold', 'plan must be one of: free, basic, pro, enterprise'],
    ['status=deleted', 'status must be one of: active, suspended'],
    ['search=a&search=b', 'search must be given once'],
    ['plan=pro&plan=free', 'plan must be given once'],
    ['status=active&status=suspended', 'status must be given once'],
    ['page=1&page=2', 'page must be given once'],
  ])('rejects %s', async (queryString, message) => {
    const res = await get(`/merchants?${queryString}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message });
  });
});

describe('GET /api/admin/merchants/:id', () => {
  it('returns the summary, a masked key, charts, products and recent recommendations', async () => {
    const merchant = await createMerchant({ apiKey: 'sk_live_fake-key-for-tests-cdef' });
    const chart = await createChart(merchant);
    await ProductMapping.create({
      merchantId: merchant._id,
      productId: 'SKU-1',
      productName: 'Tee',
      sizeChartId: chart._id,
      productImage: '/uploads/products/tee.png',
      anchorPoints: ANCHORS,
    });
    await Recommendation.create({ merchantId: merchant._id, productId: 'SKU-1', recommendedSize: 'M', confidence: 0.9, status: 'success' });
    await Recommendation.collection.insertOne({ merchantId: merchant._id, productId: 'SKU-1', status: 'failed', createdAt: new Date() });

    const res = await get(`/merchants/${merchant._id}`);

    expect(res.status).toBe(200);
    expect(res.body.merchant.counts).toEqual({ sizeCharts: 1, products: 1, recommendations: 2 });
    expect(res.body.apiKeyPreview).toBe('sk_live_...cdef');
    expect(res.body.sizeCharts).toEqual([
      { _id: String(chart._id), name: 'Tees', category: 'tops', sizesCount: 3, isActive: true },
    ]);
    expect(res.body.products).toEqual([
      {
        _id: expect.any(String),
        productId: 'SKU-1',
        productName: 'Tee',
        tryOnStatus: 'ready',
        garmentLength: 'regular',
        productImage: '/uploads/products/tee.png',
      },
    ]);
    expect(res.body.recentRecommendations).toHaveLength(2);
    expect(res.body.recentRecommendations.map((r) => r.source)).toEqual(['widget', 'widget']);
    expect(Object.keys(res.body.recentRecommendations[0]).sort()).toEqual(
      ['_id', 'productId', 'recommendedSize', 'confidence', 'status', 'source', 'createdAt'].sort()
    );
    expectNoSecrets(res, [merchant]);
  });

  it('caps recent recommendations at 20 and reports a missing key as null', async () => {
    const merchant = await createMerchant({ apiKey: undefined });
    await Recommendation.insertMany(Array.from({ length: 25 }, () => ({ merchantId: merchant._id, status: 'success' })));

    const res = await get(`/merchants/${merchant._id}`);

    expect(res.body.recentRecommendations).toHaveLength(20);
    expect(res.body.apiKeyPreview).toBeNull();
    expect(res.body.merchant.hasApiKey).toBe(false);
  });

  it.each([
    ['an unknown id', () => '64b000000000000000000000'],
    ['a malformed id', () => 'not-an-id'],
    ['the super admin', () => String(admin._id)],
  ])('404s for %s', async (label, id) => {
    const res = await get(`/merchants/${id()}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Merchant not found' });
  });
});

describe('PATCH /api/admin/merchants/:id/subscription', () => {
  it('updates the given fields and audits before/after', async () => {
    const merchant = await createMerchant({
      subscription: { plan: 'basic', status: 'active', requestsLimit: 500, requestsUsed: 42 },
    });

    const res = await patch(`/merchants/${merchant._id}/subscription`, {
      status: 'expired',
      requestsLimit: 900,
      endDate: '2027-01-31T00:00:00.000Z',
      resetUsage: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.merchant.subscription).toMatchObject({
      plan: 'basic',
      status: 'expired',
      requestsLimit: 900,
      requestsUsed: 0,
      endDate: '2027-01-31T00:00:00.000Z',
    });
    const [entry] = await auditEntries();
    expect(entry).toMatchObject({
      adminEmail: admin.email,
      action: 'merchant.subscription.update',
      targetType: 'merchant',
      targetId: merchant._id,
      targetLabel: merchant.businessName,
      details: {
        before: { plan: 'basic', status: 'active', requestsLimit: 500, requestsUsed: 42, endDate: null },
        after: { plan: 'basic', status: 'expired', requestsLimit: 900, requestsUsed: 0 },
      },
    });
    expectNoSecrets(res, [merchant]);
  });

  it("applies the new plan's quota unless a limit is given, and null means unlimited", async () => {
    const merchant = await createMerchant();

    const toPro = await patch(`/merchants/${merchant._id}/subscription`, { plan: 'pro' });
    expect(toPro.body.merchant.subscription).toMatchObject({ plan: 'pro', requestsLimit: 5000 });

    const custom = await patch(`/merchants/${merchant._id}/subscription`, { plan: 'basic', requestsLimit: 7 });
    expect(custom.body.merchant.subscription).toMatchObject({ plan: 'basic', requestsLimit: 7 });

    const unlimited = await patch(`/merchants/${merchant._id}/subscription`, { requestsLimit: null, endDate: null });
    expect(unlimited.body.merchant.subscription.requestsLimit).toBeNull();
    expect(unlimited.body.merchant.subscription.endDate ?? null).toBeNull();
  });

  it.each([
    [{}, 'Provide at least one of: plan, status, requestsLimit, endDate, resetUsage'],
    [{ plan: 'gold' }, 'plan must be one of: free, basic, pro, enterprise'],
    [{ status: 'paused' }, 'status must be one of: active, inactive, expired'],
    [{ requestsLimit: -1 }, 'requestsLimit must be a non-negative integer, or null for unlimited'],
    [{ requestsLimit: 1.5 }, 'requestsLimit must be a non-negative integer, or null for unlimited'],
    [{ endDate: 'next week' }, 'endDate must be an ISO 8601 date, or null for no end date'],
    [{ resetUsage: 'yes' }, 'resetUsage must be true or false'],
  ])('rejects %p', async (body, message) => {
    const merchant = await createMerchant();

    const res = await patch(`/merchants/${merchant._id}/subscription`, body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message });
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('404s for the super admin', async () => {
    const res = await patch(`/merchants/${admin._id}/subscription`, { plan: 'pro' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/merchants/:id/status', () => {
  it('suspends with a reason, blocking the API key and the dashboard login', async () => {
    const merchant = await createMerchant();

    const res = await patch(`/merchants/${merchant._id}/status`, { status: 'suspended', reason: '  Chargeback  ' });

    expect(res.status).toBe(200);
    expect(res.body.merchant).toMatchObject({ status: 'suspended', suspendedReason: 'Chargeback' });
    expect(new Date(res.body.merchant.suspendedAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect((await request(app).post('/api/handoff/sessions').set('x-api-key', merchant.apiKey)).status).toBe(403);
    expect((await request(app).get('/api/charts').set('Authorization', `Bearer ${tokenFor(merchant)}`)).status).toBe(403);
    const [entry] = await auditEntries();
    expect(entry).toMatchObject({ action: 'merchant.suspend', details: { previousStatus: 'active', reason: 'Chargeback' } });
  });

  it('reactivates and clears the suspension details', async () => {
    const merchant = await createMerchant({ status: 'suspended', suspendedAt: new Date(), suspendedReason: 'Spam' });

    const res = await patch(`/merchants/${merchant._id}/status`, { status: 'active', reason: 'ignored' });

    expect(res.status).toBe(200);
    expect(res.body.merchant).toMatchObject({ status: 'active', suspendedAt: null, suspendedReason: null });
    const stored = await Merchant.findById(merchant._id).lean();
    expect(stored.suspendedAt).toBeUndefined();
    expect(stored.suspendedReason).toBeUndefined();
    const [entry] = await auditEntries();
    expect(entry).toMatchObject({ action: 'merchant.reactivate', details: { previousStatus: 'suspended' } });
  });

  it.each([
    [{}, 'status must be one of: active, suspended'],
    [{ status: 'banned' }, 'status must be one of: active, suspended'],
    [{ status: 'suspended', reason: 'x'.repeat(501) }, 'reason must be at most 500 characters'],
    [{ status: 'suspended', reason: 42 }, 'reason must be text'],
  ])('rejects %p', async (body, message) => {
    const merchant = await createMerchant();

    const res = await patch(`/merchants/${merchant._id}/status`, body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message });
  });

  it('can never suspend the super admin', async () => {
    const res = await patch(`/merchants/${admin._id}/status`, { status: 'suspended' });

    expect(res.status).toBe(404);
    expect((await Merchant.findById(admin._id)).status).toBe('active');
  });
});

describe('admin API key management', () => {
  it('regenerates a working key and audits without storing it', async () => {
    const merchant = await createMerchant();
    const oldKey = merchant.apiKey;

    const res = await post(`/merchants/${merchant._id}/api-key`);

    expect(res.status).toBe(200);
    expect(res.body.apiKey).toMatch(/^sk_live_[0-9a-f]{32}$/);
    expect((await Merchant.findById(merchant._id)).apiKey).toBe(res.body.apiKey);
    expect((await request(app).post('/api/handoff/sessions').set('x-api-key', oldKey)).status).toBe(401);
    expect((await request(app).post('/api/handoff/sessions').set('x-api-key', res.body.apiKey)).status).toBe(201);
    const entries = await auditEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: 'merchant.apiKey.regenerate', details: { replacedExistingKey: true } });
    expect(JSON.stringify(entries)).not.toContain(res.body.apiKey);
    expect(JSON.stringify(entries)).not.toContain(oldKey);
  });

  it('revokes the key', async () => {
    const merchant = await createMerchant();

    const res = await del(`/merchants/${merchant._id}/api-key`);

    expect(res.status).toBe(200);
    expect(res.body.merchant.hasApiKey).toBe(false);
    expect((await Merchant.findById(merchant._id).lean()).apiKey).toBeUndefined();
    expect((await request(app).post('/api/handoff/sessions').set('x-api-key', merchant.apiKey)).status).toBe(401);
    expect((await auditEntries())[0]).toMatchObject({ action: 'merchant.apiKey.revoke' });
    expectNoSecrets(res, [merchant]);
  });

  it('refuses to revoke a key that does not exist', async () => {
    const merchant = await createMerchant({ apiKey: undefined });

    const res = await del(`/merchants/${merchant._id}/api-key`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'This merchant has no API key' });
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('404s for unknown merchants', async () => {
    expect((await post('/merchants/64b000000000000000000000/api-key')).status).toBe(404);
    expect((await del(`/merchants/${admin._id}/api-key`)).status).toBe(404);
  });
});

describe('POST /api/admin/merchants/:id/reset-password', () => {
  it('sets a new bcrypt password the merchant can log in with', async () => {
    const merchant = await createMerchant();

    const res = await post(`/merchants/${merchant._id}/reset-password`, { password: 'brand-new-pass' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Password reset' });
    const stored = await Merchant.findById(merchant._id);
    expect(await bcrypt.compare('brand-new-pass', stored.password)).toBe(true);
    const login = await request(app).post('/api/auth/login').send({ email: merchant.email, password: 'brand-new-pass' });
    expect(login.status).toBe(200);
    const entries = await auditEntries();
    expect(entries[0]).toMatchObject({ action: 'merchant.password.reset' });
    expect(JSON.stringify(entries)).not.toContain('brand-new-pass');
    expect(JSON.stringify(entries)).not.toContain(stored.password);
  });

  it.each([[{}], [{ password: 'short' }], [{ password: 12345678 }]])('rejects %p', async (body) => {
    const merchant = await createMerchant();

    const res = await post(`/merchants/${merchant._id}/reset-password`, body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Password must be at least 8 characters' });
  });

  it("can't reset the super admin's password", async () => {
    expect((await post(`/merchants/${admin._id}/reset-password`, { password: 'brand-new-pass' })).status).toBe(404);
  });
});

describe('DELETE /api/admin/merchants/:id', () => {
  it('deletes the merchant with all their data and product photos, leaving others alone', async () => {
    const merchant = await createMerchant();
    const other = await createMerchant();
    const chart = await createChart(merchant);
    const otherChart = await createChart(other);
    const photo = path.join(env.uploadDir, 'tee.png');
    fs.writeFileSync(photo, 'png');
    await ProductMapping.create({ merchantId: merchant._id, productId: 'SKU-1', sizeChartId: chart._id, productImage: '/uploads/products/tee.png' });
    await ProductMapping.create({ merchantId: other._id, productId: 'SKU-1', sizeChartId: otherChart._id });
    const rec = await Recommendation.create({ merchantId: merchant._id, status: 'success' });
    await Recommendation.create({ merchantId: other._id, status: 'success' });
    await Feedback.create({ merchantId: merchant._id, recommendationId: rec._id, fitResult: 'perfect' });

    const res = await del(`/merchants/${merchant._id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Merchant deleted' });
    expect(await Merchant.findById(merchant._id)).toBeNull();
    for (const Model of [SizeChart, ProductMapping, Recommendation, Feedback]) {
      expect(await Model.countDocuments({ merchantId: merchant._id })).toBe(0);
    }
    expect(fs.existsSync(photo)).toBe(false);
    expect(await SizeChart.countDocuments({ merchantId: other._id })).toBe(1);
    expect(await ProductMapping.countDocuments({ merchantId: other._id })).toBe(1);
    expect(await Recommendation.countDocuments({ merchantId: other._id })).toBe(1);
    const [entry] = await auditEntries();
    expect(entry).toMatchObject({
      action: 'merchant.delete',
      targetId: merchant._id,
      targetLabel: merchant.businessName,
      details: { email: merchant.email },
    });
  });

  it("can't delete the super admin", async () => {
    const res = await del(`/merchants/${admin._id}`);

    expect(res.status).toBe(404);
    expect(await Merchant.findById(admin._id)).not.toBeNull();
  });
});

describe('GET /api/admin/audit-log', () => {
  it('lists entries newest first with pagination', async () => {
    const merchant = await createMerchant();
    await patch(`/merchants/${merchant._id}/status`, { status: 'suspended' });
    await patch(`/merchants/${merchant._id}/status`, { status: 'active' });
    await post(`/merchants/${merchant._id}/api-key`);

    const res = await get('/audit-log?limit=2');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 3, page: 1, pages: 2 });
    expect(res.body.entries.map((e) => e.action)).toEqual(['merchant.apiKey.regenerate', 'merchant.reactivate']);
    expect(Object.keys(res.body.entries[0]).sort()).toEqual(
      ['_id', 'adminEmail', 'action', 'targetType', 'targetId', 'targetLabel', 'details', 'createdAt'].sort()
    );
    expect(res.body.entries[0]).toMatchObject({ adminEmail: admin.email, targetType: 'merchant', targetId: String(merchant._id) });

    const second = await get('/audit-log?page=2&limit=2');
    expect(second.body.entries.map((e) => e.action)).toEqual(['merchant.suspend']);
  });

  it('rejects bad pagination', async () => {
    const res = await get('/audit-log?limit=0');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'limit must be an integer between 1 and 100' });
  });
});

describe('DELETE /api/merchant/account (self-service)', () => {
  it('now also removes the merchant\'s product photos', async () => {
    const merchant = await createMerchant();
    const chart = await createChart(merchant);
    const photo = path.join(env.uploadDir, 'own.png');
    fs.writeFileSync(photo, 'png');
    await ProductMapping.create({ merchantId: merchant._id, productId: 'SKU-1', sizeChartId: chart._id, productImage: '/uploads/products/own.png' });

    const res = await request(app)
      .delete('/api/merchant/account')
      .set('Authorization', `Bearer ${tokenFor(merchant)}`)
      .send({ businessName: merchant.businessName });

    expect(res.status).toBe(200);
    expect(await Merchant.findById(merchant._id)).toBeNull();
    expect(fs.existsSync(photo)).toBe(false);
  });
});
