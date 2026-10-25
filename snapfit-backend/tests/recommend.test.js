jest.mock('../src/services/aiService', () => {
  const actual = jest.requireActual('../src/services/aiService');
  return { ...actual, analyzeImage: jest.fn(), tryOnImage: jest.fn() };
});

const request = require('supertest');
const { setupTestEnv, tokenFor, createMerchant, createChart } = require('./helpers/testApp');
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

// Sends a valid height unless the test overrides it; a field set to undefined
// is left out of the request.
function postRecommend(fields = {}) {
  const req = request(app)
    .post('/api/recommend')
    .set('x-api-key', merchant.apiKey)
    .attach('image', makePng(64, 64), { filename: 'me.png', contentType: 'image/png' })
    .field('productId', 'SKU-1');
  Object.entries({ userHeight: '178', ...fields })
    .filter(([, value]) => value !== undefined)
    .forEach(([key, value]) => req.field(key, value));
  return req;
}

const analyzeOptions = () => analyzeImage.mock.calls[0][2];

describe('POST /api/recommend', () => {
  it('returns the original fields plus the measurement comparison', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);

    const res = await postRecommend();

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
      photoTips: [],
      warnings: [],
      framesUsed: 1,
    });
    expect(res.body.product).toEqual({ productId: 'SKU-1', productName: null, imageUrl: null, tryOnReady: false });
  });

  it('passes the chart with its category, the height and the clothing fit to the AI service', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);

    await postRecommend({ clothingFit: 'loose' });

    const [, chartSent] = analyzeImage.mock.calls[0];
    expect(chartSent.category).toBe('tops');
    expect(chartSent.sizes.map((s) => s.label)).toEqual(['S', 'M', 'L']);
    expect(analyzeOptions()).toEqual({ userHeight: 178, clothingFit: 'loose', tryOn: null, frames: [] });
  });

  it('passes the AI photo tips and warnings through', async () => {
    const photoTips = [{ id: 'lighting', message: 'Use brighter, even lighting' }];
    const warnings = [{ id: 'baggy_clothing', message: 'Loose clothing may hide your shape' }];
    analyzeImage.mockResolvedValue({ ...AI_RESULT, photoTips, warnings });

    const res = await postRecommend();

    expect(res.status).toBe(200);
    expect(res.body.recommendation.photoTips).toEqual(photoTips);
    expect(res.body.recommendation.warnings).toEqual(warnings);
  });

  it('stores measurement numbers and size scores, never the photo', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);

    await postRecommend();

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

describe('POST /api/recommend shopper inputs', () => {
  async function expectRejected(fields, message) {
    const res = await postRecommend(fields);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message });
    expect(analyzeImage).not.toHaveBeenCalled();
    expect(env.listTmpPhotos()).toEqual([]);
  }

  it.each([undefined, '', '  '])('requires userHeight (%p)', async (userHeight) => {
    await expectRejected({ userHeight }, 'userHeight is required');
  });

  it.each(['99', '231', 'abc', '-170'])('rejects userHeight %p outside 100-230 cm', async (userHeight) => {
    await expectRejected({ userHeight }, 'userHeight must be between 100 and 230 cm');
  });

  it.each([
    ['100', 100],
    ['230', 230],
    ['172.5', 172.5],
  ])('accepts userHeight %p', async (userHeight, expected) => {
    analyzeImage.mockResolvedValue(AI_RESULT);

    const res = await postRecommend({ userHeight });

    expect(res.status).toBe(200);
    expect(analyzeOptions().userHeight).toBe(expected);
  });

  it('defaults clothingFit to regular', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);

    await postRecommend();

    expect(analyzeOptions().clothingFit).toBe('regular');
    expect((await Recommendation.findOne({ merchantId: merchant._id })).clothingFit).toBe('regular');
  });

  it.each(['fitted', 'regular', 'loose'])('forwards and stores clothingFit %p', async (clothingFit) => {
    analyzeImage.mockResolvedValue(AI_RESULT);

    const res = await postRecommend({ clothingFit });

    expect(res.status).toBe(200);
    expect(analyzeOptions().clothingFit).toBe(clothingFit);
    expect((await Recommendation.findOne({ merchantId: merchant._id })).clothingFit).toBe(clothingFit);
  });

  it.each(['baggy', 'Loose'])('rejects clothingFit %p', async (clothingFit) => {
    await expectRejected({ clothingFit }, 'clothingFit must be fitted, regular or loose');
  });

  it('stores the clothing fit on failed analyses too', async () => {
    analyzeImage.mockRejectedValue(new AiServiceError('NO_BODY_DETECTED', 422));

    await postRecommend({ clothingFit: 'fitted' });

    const saved = await Recommendation.findOne({ merchantId: merchant._id });
    expect(saved).toMatchObject({ status: 'failed', userHeight: 178, clothingFit: 'fitted' });
  });
});

describe('GET /api/analytics/export', () => {
  it('has a Clothing Fit column next to the height', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);
    await postRecommend({ userHeight: '181', clothingFit: 'loose' });

    const res = await request(app).get('/api/analytics/export').set('Authorization', `Bearer ${tokenFor(merchant)}`);

    expect(res.status).toBe(200);
    const [header, row] = res.text.split('\n').map((line) => line.split(','));
    const heightColumn = header.indexOf('User Height (cm)');
    expect(header[heightColumn + 1]).toBe('Clothing Fit');
    expect(row[heightColumn]).toBe('181');
    expect(row[heightColumn + 1]).toBe('loose');
  });
});
