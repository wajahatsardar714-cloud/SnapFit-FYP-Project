jest.mock('axios');

const axios = require('axios');
const { analyzeImage, AiServiceError } = require('../src/services/aiService');
const { aiErrorResponse } = require('../src/utils/aiErrors');

const FAILED_CHECKS = [
  { id: 'visibility', message: 'Step back so your feet are visible' },
  { id: 'pose', message: 'Straighten your arms' },
];

beforeEach(() => {
  process.env.AI_SERVICE_URL = 'http://ai.test';
});

describe('aiService error mapping', () => {
  it('keeps the code and failed checks from a structured POSE_INVALID detail', async () => {
    axios.post.mockRejectedValue({
      response: { status: 422, data: { detail: { code: 'POSE_INVALID', failed_checks: FAILED_CHECKS } } },
    });

    const err = await analyzeImage(Buffer.from('img'), { sizes: [] }).catch((e) => e);

    expect(err).toBeInstanceOf(AiServiceError);
    expect(err.message).toBe('POSE_INVALID');
    expect(err.statusCode).toBe(422);
    expect(err.details).toEqual(FAILED_CHECKS);
  });

  it('still maps plain string details as before', async () => {
    axios.post.mockRejectedValue({ response: { status: 422, data: { detail: 'NO_BODY_DETECTED' } } });

    const err = await analyzeImage(Buffer.from('img'), { sizes: [] }).catch((e) => e);

    expect(err.message).toBe('NO_BODY_DETECTED');
    expect(err.details).toBeUndefined();
  });

  it('reports timeouts and unreachable services', async () => {
    axios.post.mockRejectedValueOnce({ code: 'ECONNABORTED' }).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(analyzeImage(Buffer.from('img'), {})).rejects.toMatchObject({ message: 'AI_SERVICE_TIMEOUT', statusCode: 504 });
    await expect(analyzeImage(Buffer.from('img'), {})).rejects.toMatchObject({ message: 'AI_SERVICE_UNREACHABLE', statusCode: 502 });
  });
});

describe('aiErrorResponse', () => {
  it('turns POSE_INVALID into the first instruction plus the full check list', () => {
    const { status, body } = aiErrorResponse(new AiServiceError('POSE_INVALID', 422, FAILED_CHECKS), { fallback: 'x' });

    expect(status).toBe(422);
    expect(body).toEqual({
      success: false,
      code: 'POSE_INVALID',
      message: 'We need a better photo: Step back so your feet are visible.',
      poseChecks: FAILED_CHECKS,
    });
  });

  it('uses endpoint messages, then shared messages, then the fallback', () => {
    const messages = { PRODUCT_ANCHOR_POINTS_NOT_FOUND: 'Not set up' };
    const respond = (code) => aiErrorResponse(new AiServiceError(code, 404), { messages, fallback: 'Fallback' }).body.message;

    expect(respond('PRODUCT_ANCHOR_POINTS_NOT_FOUND')).toBe('Not set up');
    expect(respond('NO_BODY_DETECTED')).toMatch(/could not detect a person/);
    expect(respond('MISSING_ANCHOR_POINT:hipLeft')).toBe('Fallback');
  });

  it('defaults non-AI errors to 502', () => {
    expect(aiErrorResponse(new Error('boom'), { fallback: 'Fallback' }).status).toBe(502);
  });
});
