const request = require('supertest');
const { setupTestEnv, tokenFor, createMerchant, createSuperAdmin } = require('./helpers/testApp');

setupTestEnv();
const app = require('../src/app');
const Recommendation = require('../src/models/Recommendation');

const DAY_MS = 24 * 60 * 60 * 1000;

let admin;
let shopA;
let shopB;

const get = (url) => request(app).get(`/api/admin${url}`).set('Authorization', `Bearer ${tokenFor(admin)}`);

// Noon UTC `daysAgo` days ago, and its YYYY-MM-DD date.
function daysAgo(n) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  return new Date(d.getTime() - n * DAY_MS);
}
const dateKey = (date) => date.toISOString().slice(0, 10);

// Raw inserts so createdAt is exactly what the test says; records without
// `source` stand for traffic stored before the field existed.
function insertRecs(merchant, specs) {
  return Recommendation.collection.insertMany(
    specs.map(({ ago = 0, ...fields }) => ({ merchantId: merchant._id, createdAt: daysAgo(ago), ...fields }))
  );
}

beforeEach(async () => {
  admin = await createSuperAdmin();
  shopA = await createMerchant({ businessName: 'Shop A', subscription: { plan: 'pro', status: 'active' } });
  shopB = await createMerchant({ businessName: 'Shop B', status: 'suspended', subscription: { plan: 'free', status: 'inactive' } });
  await createMerchant({ businessName: 'Shop C', subscription: { plan: 'pro', status: 'active' } });

  await insertRecs(shopA, [
    { status: 'success', recommendedSize: 'M', source: 'widget' },
    { status: 'low_confidence', recommendedSize: 'L', source: 'widget' },
    { status: 'failed', ago: 2 },
    { status: 'success', recommendedSize: 'M', ago: 40 },
    // Demo runs never count.
    { status: 'success', recommendedSize: 'XXL', source: 'admin_demo' },
    { status: 'failed', source: 'admin_demo', ago: 2 },
  ]);
  await insertRecs(shopB, [{ status: 'success', recommendedSize: 'S', ago: 2 }]);
});

describe('GET /api/admin/overview', () => {
  it('reports platform totals, plans, a filled 30-day series and the newest merchants', async () => {
    const res = await get('/overview');

    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({
      merchants: 3,
      activeMerchants: 2,
      suspendedMerchants: 1,
      recommendations: 5,
      recommendationsLast30Days: 4,
      successRate: 0.8,
    });
    expect(res.body.byPlan).toEqual({ free: 1, basic: 0, pro: 2, enterprise: 0 });

    const { daily } = res.body;
    expect(daily).toHaveLength(30);
    expect(daily[29]).toEqual({ date: dateKey(daysAgo(0)), total: 2, success: 2, failed: 0 });
    expect(daily[27]).toEqual({ date: dateKey(daysAgo(2)), total: 2, success: 1, failed: 1 });
    expect(daily[0]).toEqual({ date: dateKey(daysAgo(29)), total: 0, success: 0, failed: 0 });
    expect(daily.reduce((sum, d) => sum + d.total, 0)).toBe(4);

    expect(res.body.recentMerchants.map((m) => m.businessName)).toEqual(['Shop C', 'Shop B', 'Shop A']);
    expect(res.body.recentMerchants[2].counts.recommendations).toBe(4);
    expect(res.text).not.toMatch(/"password"/);
    expect(res.text).not.toContain(shopA.apiKey);
  });

  it('reports a success rate of 0 with no traffic', async () => {
    await Recommendation.deleteMany({});

    const res = await get('/overview');

    expect(res.body.totals).toMatchObject({ recommendations: 0, successRate: 0 });
  });

  it('caps recent merchants at 5', async () => {
    for (let i = 0; i < 4; i += 1) await createMerchant();

    expect((await get('/overview')).body.recentMerchants).toHaveLength(5);
  });
});

describe('GET /api/admin/analytics', () => {
  it('breaks the window down by day, status, merchant and size, without demo runs', async () => {
    const res = await get('/analytics?days=7');

    expect(res.status).toBe(200);
    expect(res.body.daily).toHaveLength(7);
    expect(res.body.daily[6].date).toBe(dateKey(daysAgo(0)));
    expect(res.body.statusBreakdown).toEqual({ success: 2, low_confidence: 1, failed: 1 });
    expect(res.body.topMerchants).toEqual([
      { merchantId: String(shopA._id), businessName: 'Shop A', count: 3 },
      { merchantId: String(shopB._id), businessName: 'Shop B', count: 1 },
    ]);
    expect(res.body.sizes).toEqual([
      { size: 'L', count: 1 },
      { size: 'M', count: 1 },
      { size: 'S', count: 1 },
    ]);
  });

  it('defaults to 30 days and reaches back up to 365', async () => {
    expect((await get('/analytics')).body.daily).toHaveLength(30);

    const year = await get('/analytics?days=365');
    expect(year.body.daily).toHaveLength(365);
    expect(year.body.statusBreakdown.success).toBe(3);
  });

  it('limits top merchants to 10', async () => {
    for (let i = 0; i < 11; i += 1) {
      const merchant = await createMerchant();
      await insertRecs(merchant, [{ status: 'success' }]);
    }

    expect((await get('/analytics')).body.topMerchants).toHaveLength(10);
  });

  it.each(['0', '366', 'abc', '2.5'])('rejects days=%p', async (days) => {
    const res = await get(`/analytics?days=${days}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'days must be an integer between 1 and 365' });
  });
});

describe('GET /api/admin/analytics/export', () => {
  it('exports every non-demo recommendation with the merchant columns', async () => {
    const res = await get('/analytics/export');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="snapfit-recommendations-\d{4}-\d{2}-\d{2}\.csv"/);
    const [header, ...rows] = res.text.split('\n');
    expect(header).toBe(
      'Merchant,Merchant Email,Date,Product ID,Recommended Size,Confidence,Status,Error,User Height (cm),Clothing Fit'
    );
    expect(rows).toHaveLength(5);
    expect(rows[0].startsWith(`Shop A,${shopA.email},`)).toBe(true);
    expect(rows.some((row) => row.startsWith(`Shop B,${shopB.email},`))).toBe(true);
    expect(res.text).not.toContain('XXL');
  });
});
