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
const ProductMapping = require('../src/models/ProductMapping');
const Recommendation = require('../src/models/Recommendation');

const AI_RESULT = {
  confidence: 0.9,
  features: { ratios: {} },
  size_recommendation: { recommended_size: 'M', confidence: 0.95, fit_scores: { M: 0.95 }, body_type: 'average', notes: 'M fits.' },
  measurements: {},
  sizeComparison: [],
};

// Distinct pixels per frame, so the forwarded buffers can be told apart.
const frame = (i) => makePng(32, 32, [40 * i, 80, 120]);

let merchant;

beforeEach(async () => {
  merchant = await createMerchant();
  const chart = await createChart(merchant);
  await ProductMapping.create({ merchantId: merchant._id, productId: 'SKU-1', sizeChartId: chart._id });
  analyzeImage.mockReset();
  tryOnImage.mockReset();
});

function attachFrames(req, count) {
  for (let i = 1; i <= count; i += 1) {
    req.attach('frames', frame(i), { filename: `frame-${i}.png`, contentType: 'image/png' });
  }
  return req;
}

function postRecommend({ frames = 0, fields = { userHeight: '178' }, withImage = true } = {}) {
  const req = request(app).post('/api/recommend').set('x-api-key', merchant.apiKey).field('productId', 'SKU-1');
  if (withImage) {
    req.attach('image', makePng(64, 64), { filename: 'me.png', contentType: 'image/png' });
  }
  Object.entries(fields).forEach(([key, value]) => req.field(key, value));
  return attachFrames(req, frames);
}

const savedRecommendation = () => Recommendation.findOne({ merchantId: merchant._id }).lean();

describe('POST /api/recommend with extra frames', () => {
  it('forwards each frame to the AI service and returns and stores framesUsed', async () => {
    analyzeImage.mockResolvedValue({ ...AI_RESULT, framesUsed: 3 });

    const res = await postRecommend({ frames: 3 });

    expect(res.status).toBe(200);
    expect(res.body.recommendation.framesUsed).toBe(3);
    const [imageSent, , { frames }] = analyzeImage.mock.calls[0];
    expect(imageSent.equals(makePng(64, 64))).toBe(true);
    expect(frames).toHaveLength(3);
    frames.forEach((sent, i) => expect(sent.equals(frame(i + 1))).toBe(true));
    expect((await savedRecommendation()).framesUsed).toBe(3);
    expect(env.listTmpPhotos()).toEqual([]);
  });

  it('accepts up to 4 frames', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);

    const res = await postRecommend({ frames: 4 });

    expect(res.status).toBe(200);
    expect(analyzeImage.mock.calls[0][2].frames).toHaveLength(4);
    expect(env.listTmpPhotos()).toEqual([]);
  });

  it('keeps single-image requests unchanged, with framesUsed defaulting to 1', async () => {
    analyzeImage.mockResolvedValue(AI_RESULT);

    const res = await postRecommend();

    expect(res.status).toBe(200);
    expect(analyzeImage.mock.calls[0][2].frames).toEqual([]);
    expect(res.body.recommendation.framesUsed).toBe(1);
    expect((await savedRecommendation()).framesUsed).toBe(1);
  });

  it('rejects more than 4 frames and leaves no temp files', async () => {
    const res = await postRecommend({ frames: 5 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'At most 4 extra frames are allowed' });
    expect(analyzeImage).not.toHaveBeenCalled();
    expect(env.listTmpPhotos()).toEqual([]);
  });

  it('rejects a frame that is not an image', async () => {
    const res = await postRecommend({ frames: 1 }).attach('frames', Buffer.from('not an image'), {
      filename: 'notes.txt',
      contentType: 'text/plain',
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Only image files are allowed' });
    expect(analyzeImage).not.toHaveBeenCalled();
    expect(env.listTmpPhotos()).toEqual([]);
  });

  it('deletes the photo and frames when the analysis fails', async () => {
    analyzeImage.mockRejectedValue(new AiServiceError('NO_BODY_DETECTED', 422));

    const res = await postRecommend({ frames: 2 });

    expect(res.status).toBe(422);
    expect(env.listTmpPhotos()).toEqual([]);
  });

  it('deletes the frames when the request is invalid', async () => {
    const res = await postRecommend({ frames: 2, fields: {} });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('userHeight is required');
    expect(env.listTmpPhotos()).toEqual([]);
  });

  it('still requires the main image, deleting frames sent without it', async () => {
    const res = await postRecommend({ frames: 2, withImage: false });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'An image file is required' });
    expect(analyzeImage).not.toHaveBeenCalled();
    expect(env.listTmpPhotos()).toEqual([]);
  });
});

describe('single-image routes', () => {
  it('POST /api/try-on still rejects a frames field', async () => {
    const req = request(app)
      .post('/api/try-on')
      .set('x-api-key', merchant.apiKey)
      .attach('image', makePng(64, 64), { filename: 'me.png', contentType: 'image/png' })
      .field('productId', 'SKU-1');

    const res = await attachFrames(req, 1);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'Unexpected field' });
    expect(tryOnImage).not.toHaveBeenCalled();
    expect(env.listTmpPhotos()).toEqual([]);
  });

  it('the handoff photo upload still rejects a frames field', async () => {
    const req = request(app)
      .post('/api/handoff/sessions/some-session/photo')
      .attach('image', makePng(64, 64), { filename: 'me.png', contentType: 'image/png' });

    const res = await attachFrames(req, 1);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Unexpected field' });
    expect(env.listTmpPhotos()).toEqual([]);
  });
});
