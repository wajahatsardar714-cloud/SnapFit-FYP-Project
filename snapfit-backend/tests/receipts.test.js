const request = require('supertest');
const { setupTestEnv, tokenFor, createMerchant, createSuperAdmin } = require('./helpers/testApp');

setupTestEnv();
const app = require('../src/app');
const Receipt = require('../src/models/Receipt');
const AuditLog = require('../src/models/AuditLog');
const { issueReceipt, serializeReceipt } = require('../src/services/receipts');
const { receiptConfig } = require('../src/config/receipt');

const auth = (account) => ({ Authorization: `Bearer ${tokenFor(account)}` });
const DAY_MS = 24 * 60 * 60 * 1000;

const RECEIPT_KEYS = [
  '_id',
  'number',
  'status',
  'reason',
  'issuedAt',
  'merchantId',
  'seller',
  'merchant',
  'plan',
  'planName',
  'periodStart',
  'periodEnd',
  'currency',
  'amount',
  'taxRate',
  'taxAmount',
  'total',
  'priceNote',
  'paymentMethod',
  'voidedAt',
].sort();

// Collects a binary response body (supertest leaves application/pdf as a stream).
function binary(req) {
  return req.buffer(true).parse((res, callback) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  });
}

function subscribed(plan, overrides = {}) {
  const now = new Date('2026-11-13T10:00:00Z');
  return createMerchant({
    businessName: 'Ali Clothing',
    name: 'Ali Khan',
    phone: '0300 1234567',
    subscription: { plan, status: 'active', startDate: now, endDate: new Date(now.getTime() + 30 * DAY_MS) },
    ...overrides,
  });
}

describe('receipt config', () => {
  it('is SnapFit in USD with no tax and the demo payment method', () => {
    expect(receiptConfig()).toMatchObject({
      company: 'SnapFit',
      currency: 'USD',
      taxRate: 0,
      paymentMethod: 'Demo (no charge)',
    });
  });

  it('reads the optional seller details from the env, and puts them on the receipt JSON', async () => {
    process.env.RECEIPT_EMAIL = 'billing@snapfit.test';
    process.env.RECEIPT_ADDRESS = '12 Mall Road, Lahore';
    try {
      expect(receiptConfig()).toMatchObject({ email: 'billing@snapfit.test', address: '12 Mall Road, Lahore', website: null });
      const merchant = await subscribed('small');
      const receipt = await issueReceipt(merchant, 'plan_selected');
      const res = await request(app).get('/api/receipts').set(auth(merchant));
      expect(res.body.receipts[0].seller).toEqual({
        name: 'SnapFit',
        address: '12 Mall Road, Lahore',
        email: 'billing@snapfit.test',
        website: null,
      });
      expect(serializeReceipt(receipt).seller.email).toBe('billing@snapfit.test');
    } finally {
      delete process.env.RECEIPT_EMAIL;
      delete process.env.RECEIPT_ADDRESS;
    }
  });
});

describe('issuing receipts', () => {
  it('numbers them in order within the year, starting again each year', async () => {
    const merchant = await subscribed('small');

    const first = await issueReceipt(merchant, 'plan_selected', { now: new Date('2026-03-01T00:00:00Z') });
    const second = await issueReceipt(merchant, 'plan_changed', { now: new Date('2026-04-01T00:00:00Z') });
    const nextYear = await issueReceipt(merchant, 'plan_changed', { now: new Date('2027-01-02T00:00:00Z') });

    expect([first.number, second.number, nextYear.number]).toEqual(['SF-2026-000001', 'SF-2026-000002', 'SF-2027-000001']);
  });

  it('never gives two receipts the same number, even at the same moment', async () => {
    const merchant = await subscribed('small');

    const receipts = await Promise.all(Array.from({ length: 8 }, () => issueReceipt(merchant, 'plan_selected')));

    expect(new Set(receipts.map((r) => r.number)).size).toBe(8);
  });

  it('snapshots the merchant, plan, period and price', async () => {
    const merchant = await subscribed('medium');

    const receipt = serializeReceipt(await issueReceipt(merchant, 'plan_selected'));

    expect(Object.keys(receipt).sort()).toEqual(RECEIPT_KEYS);
    expect(receipt).toMatchObject({
      status: 'issued',
      reason: 'plan_selected',
      seller: { name: 'SnapFit', address: null, email: null, website: null },
      merchant: { businessName: 'Ali Clothing', name: 'Ali Khan', email: merchant.email, phone: '0300 1234567' },
      plan: 'medium',
      planName: 'Medium',
      periodStart: merchant.subscription.startDate,
      periodEnd: merchant.subscription.endDate,
      currency: 'USD',
      amount: 99,
      taxRate: 0,
      taxAmount: 0,
      total: 99,
      priceNote: null,
      paymentMethod: 'Demo (no charge)',
      voidedAt: null,
    });
  });

  it('prices Enterprise at 0 with a custom price note', async () => {
    const merchant = await subscribed('enterprise');

    const receipt = await issueReceipt(merchant, 'plan_selected');

    expect(receipt).toMatchObject({ amount: 0, total: 0, priceNote: 'Custom price as agreed' });
  });
});

describe('merchant receipt routes', () => {
  let merchant;
  let mine;
  let older;
  let theirs;
  beforeEach(async () => {
    merchant = await subscribed('medium');
    const other = await subscribed('small');
    older = await issueReceipt(merchant, 'plan_selected', { now: new Date('2026-10-01T00:00:00Z') });
    mine = await issueReceipt(merchant, 'plan_changed', { now: new Date('2026-11-01T00:00:00Z') });
    theirs = await issueReceipt(other, 'plan_selected');
  });

  it('GET /api/receipts lists my own, newest first, without my phone number', async () => {
    const res = await request(app).get('/api/receipts').set(auth(merchant));

    expect(res.status).toBe(200);
    expect(res.body.receipts.map((r) => r.number)).toEqual([mine.number, older.number]);
    expect(res.body.receipts[0].merchant).toEqual({
      businessName: 'Ali Clothing',
      name: 'Ali Khan',
      email: merchant.email,
    });
  });

  it('GET /api/receipts/:id shows one of mine in full, and 404s for others', async () => {
    const res = await request(app).get(`/api/receipts/${mine._id}`).set(auth(merchant));

    expect(res.status).toBe(200);
    expect(res.body.receipt).toMatchObject({ number: mine.number, merchant: { phone: '0300 1234567' } });
    expect((await request(app).get(`/api/receipts/${theirs._id}`).set(auth(merchant))).status).toBe(404);
    expect((await request(app).get('/api/receipts/not-an-id').set(auth(merchant))).status).toBe(404);
  });

  it('GET /api/receipts/:id/pdf returns the PDF inline', async () => {
    const res = await binary(request(app).get(`/api/receipts/${mine._id}/pdf`).set(auth(merchant)));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(`inline; filename="SnapFit-receipt-${mine.number}.pdf"`);
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await request(app).get(`/api/receipts/${theirs._id}/pdf`).set(auth(merchant))).status).toBe(404);
  });

  it('are for merchants only and need a token', async () => {
    const admin = await createSuperAdmin();
    expect((await request(app).get('/api/receipts').set(auth(admin))).status).toBe(403);
    expect((await request(app).get('/api/receipts')).status).toBe(401);
  });

  it('still work after the plan has ended', async () => {
    const lapsed = await subscribed('small', { subscription: { plan: 'small', status: 'expired' } });
    await issueReceipt(lapsed, 'plan_selected');

    const res = await request(app).get('/api/receipts').set(auth(lapsed));

    expect(res.status).toBe(200);
    expect(res.body.receipts).toHaveLength(1);
  });
});

describe('super admin receipt routes', () => {
  let admin;
  let merchant;
  let receipt;
  beforeEach(async () => {
    admin = await createSuperAdmin();
    merchant = await subscribed('medium');
    receipt = await issueReceipt(merchant, 'plan_selected');
    await issueReceipt(await subscribed('small'), 'plan_selected');
  });

  const adminGet = (url) => request(app).get(`/api/admin${url}`).set(auth(admin));
  const adminPost = (url) => request(app).post(`/api/admin${url}`).set(auth(admin));

  it('lists every receipt, or one merchant’s', async () => {
    expect((await adminGet('/receipts')).body.receipts).toHaveLength(2);
    const one = await adminGet(`/receipts?merchantId=${merchant._id}`);
    expect(one.body.receipts.map((r) => r.number)).toEqual([receipt.number]);
    expect(one.body.receipts[0].merchant.phone).toBeUndefined();
    expect((await adminGet('/receipts?merchantId=nope')).status).toBe(400);
  });

  it('downloads any receipt as a PDF', async () => {
    const res = await binary(request(app).get(`/api/admin/receipts/${receipt._id}/pdf`).set(auth(admin)));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
    expect((await adminGet('/receipts/64b000000000000000000000/pdf')).status).toBe(404);
  });

  it('voids a receipt once, with an audit entry, and still renders it', async () => {
    const res = await adminPost(`/receipts/${receipt._id}/void`);

    expect(res.status).toBe(200);
    expect(res.body.receipt).toMatchObject({ number: receipt.number, status: 'void' });
    expect(res.body.receipt.voidedAt).toBeTruthy();
    const [entry] = await AuditLog.find().lean();
    expect(entry).toMatchObject({
      action: 'receipt.void',
      targetType: 'receipt',
      targetId: receipt._id,
      targetLabel: receipt.number,
      adminEmail: admin.email,
    });

    expect((await adminPost(`/receipts/${receipt._id}/void`)).status).toBe(409);
    expect((await adminPost('/receipts/64b000000000000000000000/void')).status).toBe(404);
    const pdf = await binary(request(app).get(`/api/receipts/${receipt._id}/pdf`).set(auth(merchant)));
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
    expect((await Receipt.findById(receipt._id)).status).toBe('void');
  });

  it('are for the super admin only', async () => {
    const res = await request(app).get('/api/admin/receipts').set(auth(merchant));
    expect(res.status).toBe(403);
    expect((await request(app).post(`/api/admin/receipts/${receipt._id}/void`).set(auth(merchant))).status).toBe(403);
  });
});
