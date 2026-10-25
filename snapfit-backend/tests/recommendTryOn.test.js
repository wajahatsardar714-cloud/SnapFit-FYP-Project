jest.mock('../src/services/aiService', () => {
  const actual = jest.requireActual('../src/services/aiService');
  return { ...actual, analyzeImage: jest.fn(), tryOnImage: jest.fn() };
});

const request = require('supertest');
const { setupTestEnv, createMerchant, createChart } = require('./helpers/testApp');
const { makePng } = require('./helpers/images');

const env = setupTestEnv();
const app = require('../src/app');
const { analyzeImage, tryOnImage, AiServiceError } = require('../src/services/aiService');
const Merchant = require('../src/models/Merchant');
const ProductMapping = require('../src/models/ProductMapping');

const TRY_ON_IMAGE = 'data:image/jpeg;base64,AAAA';
const ANCHORS = {
  shoulderLeft: { x: 0.3, y: 0.2 },
  shoulderRight: { x: 0.7, y: 0.2 },
  hipLeft: { x: 0.3, y: 0.7 },
  hipRight: { x: 0.7, y: 0.7 },
};

function aiResult(tryOn) {
  return {
    confidence: 0.9,
    features: { ratios: {} },
    size_recommendation: { recommended_size: 'M', confidence: 0.95, fit_scores: { M: 0.95 }, body_type: 'average', notes: 'M fits.' },
    measurements: {},
    sizeComparison: [],
    alternativeSize: null,
    fitNotes: [],
    tryOn,
  };
}

let merchant;

async function mapProduct(productId, { ready }) {
  const chart = await createChart(merchant, { name: productId });
  return ProductMapping.create({
    merchantId: merchant._id,
    productId,
    sizeChartId: chart._id,
    ...(ready && { productImage: '/uploads/products/tee.png', anchorPoints: ANCHORS }),
  });
}

beforeEach(async () => {
  merchant = await createMerchant();
  await mapProduct('SKU-READY', { ready: true });
  await mapProduct('SKU-PLAIN', { ready: false });
  analyzeImage.mockReset();
  tryOnImage.mockReset();
});

function post(path, productId, fields = {}) {
  const req = request(app)
    .post(path)
    .set('x-api-key', merchant.apiKey)
    .attach('image', makePng(64, 64), { filename: 'me.png', contentType: 'image/png' })
    .field('productId', productId);
  Object.entries(fields).forEach(([key, value]) => req.field(key, value));
  return req;
}

const requestsUsed = async () => (await Merchant.findById(merchant._id)).subscription.requestsUsed;

describe('POST /api/recommend with includeTryOn=true', () => {
  it('returns the size and the try-on from one AI call, billed once', async () => {
    analyzeImage.mockResolvedValue(aiResult({ image: TRY_ON_IMAGE, engine: 'catvton' }));

    const res = await post('/api/recommend', 'SKU-READY', { includeTryOn: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.recommendation.size).toBe('M');
    expect(res.body.tryOn).toEqual({ status: 'success', image: TRY_ON_IMAGE, engine: 'catvton' });
    expect(analyzeImage).toHaveBeenCalledTimes(1);
    expect(analyzeImage.mock.calls[0][3]).toEqual({ merchantId: merchant._id, productId: 'SKU-READY' });
    expect(tryOnImage).not.toHaveBeenCalled();
    expect(await requestsUsed()).toBe(1);
    expect(env.listTmpPhotos()).toEqual([]);
  });

  it('skips the try-on for a product that is not try-on ready', async () => {
    analyzeImage.mockResolvedValue(aiResult(null));

    const res = await post('/api/recommend', 'SKU-PLAIN', { includeTryOn: 'true' });

    expect(res.status).toBe(200);
    expect(analyzeImage.mock.calls[0][3]).toBeNull();
    expect(res.body.tryOn).toEqual({ status: 'unavailable' });
    expect(res.body.product.tryOnReady).toBe(false);
  });

  it('keeps the size result when the try-on fails', async () => {
    analyzeImage.mockResolvedValue(aiResult({ error: 'ENCODE_FAILED' }));

    const res = await post('/api/recommend', 'SKU-READY', { includeTryOn: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.recommendation.size).toBe('M');
    expect(res.body.tryOn).toEqual({
      status: 'failed',
      message: 'We could not generate a photo preview right now. Please try again in a moment.',
    });
  });

  it('deletes the photo and bills once when the analysis fails', async () => {
    analyzeImage.mockRejectedValue(new AiServiceError('NO_BODY_DETECTED', 422));

    const res = await post('/api/recommend', 'SKU-READY', { includeTryOn: 'true' });

    expect(res.status).toBe(422);
    expect(env.listTmpPhotos()).toEqual([]);
    expect(await requestsUsed()).toBe(1);
  });

  it('leaves the response shape unchanged without includeTryOn', async () => {
    analyzeImage.mockResolvedValue(aiResult(null));
    const res = await post('/api/recommend', 'SKU-READY');
    expect(res.body).not.toHaveProperty('tryOn');
    expect(analyzeImage.mock.calls[0][3]).toBeNull();
  });
});

describe('POST /api/try-on (existing integrations)', () => {
  it('still returns the try-on image', async () => {
    tryOnImage.mockResolvedValue({ image: TRY_ON_IMAGE });
    const res = await post('/api/try-on', 'SKU-READY');
    expect(res.body).toEqual({ success: true, image: TRY_ON_IMAGE });
    expect(env.listTmpPhotos()).toEqual([]);
  });

  it('explains when the product has no try-on set up', async () => {
    tryOnImage.mockRejectedValue(new AiServiceError('TRYON_NOT_AVAILABLE', 404));
    const res = await post('/api/try-on', 'SKU-PLAIN');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('A photo preview is not set up for this product yet.');
  });
});
