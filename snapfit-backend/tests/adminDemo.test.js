jest.mock('../src/services/aiService', () => {
  const actual = jest.requireActual('../src/services/aiService');
  return { ...actual, analyzeImage: jest.fn(), tryOnImage: jest.fn() };
});

const request = require('supertest');
const { setupTestEnv, tokenFor, createMerchant, createSuperAdmin, createChart } = require('./helpers/testApp');
const { makePng } = require('./helpers/images');

const env = setupTestEnv();
const app = require('../src/app');
const { analyzeImage, tryOnImage } = require('../src/services/aiService');
const Merchant = require('../src/models/Merchant');
const ProductMapping = require('../src/models/ProductMapping');
const Recommendation = require('../src/models/Recommendation');

const AI_RESULT = {
  confidence: 0.9,
  features: { ratios: {} },
  size_recommendation: { recommended_size: 'M', confidence: 0.95, fit_scores: { M: 0.95 }, body_type: 'average', notes: 'M fits.' },
  measurements: {},
  sizeComparison: [],
  alternativeSize: null,
  fitNotes: [],
};
const TRY_ON_IMAGE = 'data:image/jpeg;base64,AAAA';

let admin;
let merchant;

beforeEach(async () => {
  admin = await createSuperAdmin();
  // A merchant whose widget would be refused: suspended, no active plan, quota used up.
  merchant = await createMerchant({
    status: 'suspended',
    subscription: { plan: 'small', status: 'inactive', requestsLimit: 1, requestsUsed: 1 },
  });
  const chart = await createChart(merchant);
  await ProductMapping.create({ merchantId: merchant._id, productId: 'SKU-1', sizeChartId: chart._id });
  analyzeImage.mockReset();
  tryOnImage.mockReset();
});

function demo(path, merchantId, { token = tokenFor(admin), frames = 0, fields = {} } = {}) {
  const req = request(app)
    .post(`/api/admin/demo/${path}?merchantId=${merchantId}`)
    .set('Authorization', `Bearer ${token}`)
    .attach('image', makePng(64, 64), { filename: 'me.png', contentType: 'image/png' })
    .field('productId', 'SKU-1');
  for (let i = 0; i < frames; i += 1) {
    req.attach('frames', makePng(64, 64), { filename: `frame${i}.png`, contentType: 'image/png' });
  }
  Object.entries(fields).forEach(([key, value]) => req.field(key, value));
  return req;
}

const demoRecommend = (merchantId, options = {}) =>
  demo('recommend', merchantId, { ...options, fields: { userHeight: '178', ...options.fields } });

describe('POST /api/admin/demo/recommend', () => {
  it('answers like /api/recommend without an API key, frames included', async () => {
    analyzeImage.mockResolvedValue({ ...AI_RESULT, framesUsed: 3 });

    const res = await demoRecommend(merchant._id, { frames: 2, fields: { clothingFit: 'loose' } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      recommendation: { size: 'M', confidence: 0.95, framesUsed: 3 },
      product: { productId: 'SKU-1', tryOnReady: false },
    });
    const [, , options] = analyzeImage.mock.calls[0];
    expect(options).toMatchObject({ userHeight: 178, clothingFit: 'loose' });
    expect(options.frames).toHaveLength(2);
    expect(env.listTmpPhotos()).toEqual([]);
  });

  it('stores the run as admin_demo and never counts usage', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);

    await demoRecommend(merchant._id);

    const saved = await Recommendation.find({ merchantId: merchant._id }).lean();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ source: 'admin_demo', status: 'success', recommendedSize: 'M' });
    expect((await Merchant.findById(merchant._id)).subscription.requestsUsed).toBe(1);
  });

  it('tags failed demo analyses too', async () => {
    analyzeImage.mockResolvedValue({ ...AI_RESULT, size_recommendation: null });

    const res = await demoRecommend(merchant._id);

    expect(res.status).toBe(502);
    expect((await Recommendation.findOne({ merchantId: merchant._id })).source).toBe('admin_demo');
  });

  it('keeps demo runs out of the merchant and admin analytics', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);
    await Merchant.updateOne({ _id: merchant._id }, { status: 'active', 'subscription.status': 'active' });
    await demoRecommend(merchant._id);
    await Recommendation.create({ merchantId: merchant._id, productId: 'SKU-1', recommendedSize: 'L', status: 'success' });

    const merchantAuth = { Authorization: `Bearer ${tokenFor(merchant)}` };
    const dashboard = await request(app).get('/api/analytics/dashboard').set(merchantAuth);
    const recent = await request(app).get('/api/analytics/recent').set(merchantAuth);
    const breakdown = await request(app).get('/api/analytics/breakdown').set(merchantAuth);
    const usage = await request(app).get('/api/analytics/usage').set(merchantAuth);
    const csv = await request(app).get('/api/analytics/export').set(merchantAuth);
    const adminAuth = { Authorization: `Bearer ${tokenFor(admin)}` };
    const overview = await request(app).get('/api/admin/overview').set(adminAuth);
    const analytics = await request(app).get('/api/admin/analytics').set(adminAuth);
    const adminCsv = await request(app).get('/api/admin/analytics/export').set(adminAuth);

    expect(dashboard.body).toMatchObject({ totalRecommendations: 1, mostRecommendedSizes: [{ size: 'L', count: 1 }] });
    expect(recent.body.recommendations.map((r) => r.recommendedSize)).toEqual(['L']);
    expect(breakdown.body.sizeDistribution).toEqual([{ size: 'L', count: 1 }]);
    expect(usage.body.data.reduce((sum, d) => sum + d.count, 0)).toBe(1);
    expect(csv.text.split('\n')).toHaveLength(2);
    expect(overview.body.totals.recommendations).toBe(1);
    expect(analytics.body.sizes).toEqual([{ size: 'L', count: 1 }]);
    expect(adminCsv.text.split('\n')).toHaveLength(2);
  });

  it('stores real widget calls as widget', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);
    await Merchant.updateOne(
      { _id: merchant._id },
      { status: 'active', subscription: { plan: 'small', status: 'active', requestsLimit: 10, requestsUsed: 0 } }
    );

    const res = await request(app)
      .post('/api/recommend')
      .set('x-api-key', merchant.apiKey)
      .attach('image', makePng(64, 64), { filename: 'me.png', contentType: 'image/png' })
      .field('productId', 'SKU-1')
      .field('userHeight', '178');

    expect(res.status).toBe(200);
    expect((await Recommendation.findOne({ merchantId: merchant._id })).source).toBe('widget');
  });

  it('validates the body exactly like /api/recommend', async () => {
    const res = await demoRecommend(merchant._id, { fields: { userHeight: '50' } });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'userHeight must be between 100 and 230 cm' });
    expect(env.listTmpPhotos()).toEqual([]);
  });

  it('allows at most 4 extra frames', async () => {
    const res = await demoRecommend(merchant._id, { frames: 5 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('At most 4 extra frames are allowed');
  });

  it.each([
    ['an unknown merchant', () => '64b000000000000000000000'],
    ['a malformed id', () => 'nope'],
    ['the super admin', () => admin._id],
  ])('404s for %s', async (label, id) => {
    const res = await demoRecommend(id());

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Merchant not found' });
    expect(analyzeImage).not.toHaveBeenCalled();
  });

  it('is for the super admin only', async () => {
    const res = await demoRecommend(merchant._id, { token: tokenFor(merchant) });

    expect([401, 403]).toContain(res.status);
    expect(analyzeImage).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/demo/try-on', () => {
  it('answers like /api/try-on for the given merchant, without an API key or usage', async () => {
    tryOnImage.mockResolvedValue({ image: TRY_ON_IMAGE });

    const res = await demo('try-on', merchant._id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, image: TRY_ON_IMAGE });
    const [, merchantId, productId] = tryOnImage.mock.calls[0];
    expect(String(merchantId)).toBe(String(merchant._id));
    expect(productId).toBe('SKU-1');
    expect((await Merchant.findById(merchant._id)).subscription.requestsUsed).toBe(1);
    expect(env.listTmpPhotos()).toEqual([]);
  });

  it('requires a product id like the public route', async () => {
    const res = await request(app)
      .post(`/api/admin/demo/try-on?merchantId=${merchant._id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .attach('image', makePng(64, 64), { filename: 'me.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'productId is required' });
  });

  it('404s for an unknown merchant', async () => {
    const res = await demo('try-on', '64b000000000000000000000');

    expect(res.status).toBe(404);
    expect(tryOnImage).not.toHaveBeenCalled();
  });
});
