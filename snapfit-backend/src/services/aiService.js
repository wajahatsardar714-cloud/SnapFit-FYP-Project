const axios = require('axios');
const FormData = require('form-data');

const AI_REQUEST_TIMEOUT_MS = 30000;

class AiServiceError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'AiServiceError';
    this.statusCode = statusCode;
  }
}

async function analyzeImage(imageBuffer, sizeChart, userHeight) {
  const baseUrl = process.env.AI_SERVICE_URL;
  if (!baseUrl) {
    throw new AiServiceError('AI_SERVICE_NOT_CONFIGURED', 500);
  }

  const form = new FormData();
  form.append('image', imageBuffer, { filename: 'upload.jpg' });
  form.append('size_chart', JSON.stringify(sizeChart));
  if (userHeight != null) {
    form.append('user_height', String(userHeight));
  }

  try {
    const response = await axios.post(`${baseUrl}/analyze`, form, {
      headers: form.getHeaders(),
      timeout: AI_REQUEST_TIMEOUT_MS,
    });
    return response.data;
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      throw new AiServiceError('AI_SERVICE_TIMEOUT', 504);
    }
    if (err.response) {
      const detail = err.response.data && err.response.data.detail;
      throw new AiServiceError(detail || 'AI_SERVICE_ERROR', err.response.status);
    }
    throw new AiServiceError('AI_SERVICE_UNREACHABLE', 502);
  }
}

async function tryOnImage(imageBuffer, merchantId, productId) {
  const baseUrl = process.env.AI_SERVICE_URL;
  if (!baseUrl) {
    throw new AiServiceError('AI_SERVICE_NOT_CONFIGURED', 500);
  }

  const form = new FormData();
  form.append('image', imageBuffer, { filename: 'upload.jpg' });
  form.append('product_id', productId);
  form.append('merchant_id', String(merchantId));

  try {
    const response = await axios.post(`${baseUrl}/try-on`, form, {
      headers: form.getHeaders(),
      timeout: AI_REQUEST_TIMEOUT_MS,
    });
    return response.data;
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      throw new AiServiceError('AI_SERVICE_TIMEOUT', 504);
    }
    if (err.response) {
      const detail = err.response.data && err.response.data.detail;
      throw new AiServiceError(detail || 'AI_SERVICE_ERROR', err.response.status);
    }
    throw new AiServiceError('AI_SERVICE_UNREACHABLE', 502);
  }
}

module.exports = { analyzeImage, tryOnImage, AiServiceError };
