jest.mock('../src/services/aiService', () => {
  const actual = jest.requireActual('../src/services/aiService');
  return { ...actual, analyzeImage: jest.fn(), tryOnImage: jest.fn() };
});

const request = require('supertest');
const { setupTestEnv, createMerchant, createChart } = require('./helpers/testApp');
const { makePng } = require('./helpers/images');

const env = setupTestEnv();
const app = require('../src/app');
const { analyzeImage, AiServiceError } = require('../src/services/aiService');
const Merchant = require('../src/models/Merchant');
const ProductMapping = require('../src/models/ProductMapping');
const Recommendation = require('../src/models/Recommendation');

const AI_RESULT = {
  confidence: 0.93,
  features: { ratios: { shoulder_to_hip_ratio: 1.5, shoulder_width_ratio: 0.25, hip_width_ratio: 0.17, torso_length_ratio: 0.35, leg_length_ratio: 0.6 } },
  size_recommendation: { recommended_size: 'M', confidence: 0.97, fit_scores: { S: 0.1, M: 0.97, L: 0.6 }, body_type: 'average', notes: 'M fits.' },
  measurements: {
    chest: { value: 97.2, unit: 'cm', estimated: true },
    shoulderWidth: { value: 44.1, unit: 'cm', estimated: false },
  },
  sizeComparison: [
    { label: 'S', score: 0.1, perMeasurement: [{ name: 'chest', userValue: 97.2, min: 86, max: 94, status: 'above' }] },
    { label: 'M', score: 0.97, perMeasurement: [{ name: 'chest', userValue: 97.2, min: 94, max: 102, status: 'within' }] },
    { label: 'L', score: 0.6, perMeasurement: [{ name: 'chest', userValue: 97.2, min: 102, max: 110, status: 'below' }] },
  ],
  recommendedSize: 'M',
  alternativeSize: 'L',
  fitNotes: [],
};

let merchant;

beforeEach(async () => {
  merchant = await createMerchant();
  const chart = await createChart(merchant);
  await ProductMapping.create({ merchantId: merchant._id, productId: 'SKU-1', sizeChartId: chart._id });
  analyzeImage.mockReset();
});

function postRecommend(fields = {}) {
  const req = request(app)
    .post('/api/recommend')
    .set('x-api-key', merchant.apiKey)
    .attach('image', makePng(64, 64), { filename: 'me.png', contentType: 'image/png' })
    .field('productId', 'SKU-1');
  Object.entries(fields).forEach(([key, value]) => req.field(key, value));
  return req;
}

describe('POST /api/recommend', () => {
  it('returns the original fields plus the measurement comparison', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);

    const res = await postRecommend({ userHeight: '178' });

    expect(res.status).toBe(200);
    expect(res.body.recommendation).toEqual({
      size: 'M',
      confidence: 0.97,
      bodyType: 'average',
      notes: 'M fits.',
      fitScores: { S: 0.1, M: 0.97, L: 0.6 },
      alternativeSize: 'L',
      measurements: AI_RESULT.measurements,
      sizeComparison: AI_RESULT.sizeComparison,
      fitNotes: [],
    });
    expect(res.body.product).toEqual({ productId: 'SKU-1', productName: null, imageUrl: null, tryOnReady: false });
  });

  it('passes the chart with its category and the height to the AI service', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);

    await postRecommend({ userHeight: '178' });

    const [, chartSent, heightSent] = analyzeImage.mock.calls[0];
    expect(chartSent.category).toBe('tops');
    expect(chartSent.sizes.map((s) => s.label)).toEqual(['S', 'M', 'L']);
    expect(heightSent).toBe(178);
  });

  it('stores measurement numbers and size scores, never the photo', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);

    await postRecommend({ userHeight: '178' });

    const saved = await Recommendation.findOne({ merchantId: merchant._id }).lean();
    expect(saved.recommendedSize).toBe('M');
    expect(saved.alternativeSize).toBe('L');
    expect(saved.measurements).toEqual({ chest: 97.2, shoulderWidth: 44.1 });
    expect(saved.sizeScores).toEqual([
      { label: 'S', score: 0.1 },
      { label: 'M', score: 0.97 },
      { label: 'L', score: 0.6 },
    ]);
    expect(Object.keys(saved)).not.toContain('image');
    expect(env.listTmpPhotos()).toEqual([]);
  });

  it('counts one request against the plan', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);
    await postRecommend();
    expect((await Merchant.findById(merchant._id)).subscription.requestsUsed).toBe(1);
  });

  it('forwards POSE_INVALID checks and deletes the photo', async () => {
    const checks = [{ id: 'pose', message: 'Straighten your arms' }];
    analyzeImage.mockRejectedValue(new AiServiceError('POSE_INVALID', 422, checks));

    const res = await postRecommend();

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ success: false, code: 'POSE_INVALID', poseChecks: checks });
    expect(env.listTmpPhotos()).toEqual([]);
  });
});
