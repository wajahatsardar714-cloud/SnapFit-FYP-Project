const axios = require('axios');
const FormData = require('form-data');

const AI_REQUEST_TIMEOUT_MS = 30000;
// A photorealistic try-on runs on a remote GPU (10-70 s), so requests that ask
// for one get longer. Must exceed the AI service's own GPU timeout.
const AI_TRY_ON_TIMEOUT_MS = 150000;

class AiServiceError extends Error {
  // details: extra structured data some codes carry, e.g. POSE_INVALID's list of
  // failed pose checks ([{ id, message }]).
  constructor(message, statusCode, details) {
    super(message);
    this.name = 'AiServiceError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function getBaseUrl() {
  const baseUrl = process.env.AI_SERVICE_URL;
  if (!baseUrl) {
    throw new AiServiceError('AI_SERVICE_NOT_CONFIGURED', 500);
  }
  return baseUrl;
}

// FastAPI errors arrive as { detail: "CODE" }, or { detail: { code, ... } } for
// codes that carry extra data.
function toAiServiceError(err) {
  if (err.code === 'ECONNABORTED') {
    return new AiServiceError('AI_SERVICE_TIMEOUT', 504);
  }
  if (err.response) {
    const detail = err.response.data && err.response.data.detail;
    if (detail && typeof detail === 'object') {
      return new AiServiceError(detail.code || 'AI_SERVICE_ERROR', err.response.status, detail.failed_checks);
    }
    return new AiServiceError(detail || 'AI_SERVICE_ERROR', err.response.status);
  }
  return new AiServiceError('AI_SERVICE_UNREACHABLE', 502);
}

async function postForm(path, form, timeout = AI_REQUEST_TIMEOUT_MS) {
  const baseUrl = getBaseUrl();
  try {
    const response = await axios.post(`${baseUrl}${path}`, form, {
      headers: form.getHeaders(),
      timeout,
    });
    return response.data;
  } catch (err) {
    throw toAiServiceError(err);
  }
}

// tryOn: optional { merchantId, productId } -- also renders the virtual try-on
// from the same photo and pose in this one call (result in response.tryOn).
async function analyzeImage(imageBuffer, sizeChart, userHeight, tryOn = null) {
  const form = new FormData();
  form.append('image', imageBuffer, { filename: 'upload.jpg' });
  form.append('size_chart', JSON.stringify(sizeChart));
  if (userHeight != null) {
    form.append('user_height', String(userHeight));
  }
  if (tryOn) {
    form.append('try_on_product_id', tryOn.productId);
    form.append('merchant_id', String(tryOn.merchantId));
  }
  return postForm('/analyze', form, tryOn ? AI_TRY_ON_TIMEOUT_MS : AI_REQUEST_TIMEOUT_MS);
}

async function tryOnImage(imageBuffer, merchantId, productId) {
  const form = new FormData();
  form.append('image', imageBuffer, { filename: 'upload.jpg' });
  form.append('product_id', productId);
  form.append('merchant_id', String(merchantId));
  return postForm('/try-on', form, AI_TRY_ON_TIMEOUT_MS);
}

module.exports = { analyzeImage, tryOnImage, AiServiceError };
