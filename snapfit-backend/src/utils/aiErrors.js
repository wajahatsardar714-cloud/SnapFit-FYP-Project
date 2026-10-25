const { AiServiceError } = require('../services/aiService');

const TRY_ON_ERROR_MESSAGES = {
  TRYON_NOT_AVAILABLE: 'A photo preview is not set up for this product yet.',
  INVALID_PRODUCT_IMAGE: 'This product does not have a usable preview photo yet.',
};
const TRY_ON_FALLBACK_MESSAGE = 'We could not generate a photo preview right now. Please try again in a moment.';

const AI_ERROR_MESSAGES = {
  NO_BODY_DETECTED: 'We could not detect a person in this photo. Please upload a clear, full-body photo.',
  INVALID_IMAGE: 'This file could not be read as an image. Please upload a JPG or PNG photo.',
  FILE_TOO_LARGE: 'This image is too large. Please upload a photo under 10MB.',
  RESOLUTION_TOO_LOW: 'This image resolution is too low. Please upload a higher-resolution photo.',
  INVALID_USER_HEIGHT: 'Please enter your height between 100 and 230 cm.',
  INVALID_CLOTHING_FIT: 'Please choose how your clothes fit: fitted, regular or loose.',
};

// Shapes an AI-service failure into the widget's error response:
// { status, body: { success: false, message, code?, poseChecks? } }.
// `messages` adds or overrides per-endpoint messages; `fallback` covers unknown
// codes. POSE_INVALID carries the failed pose checks so the widget can tell the
// shopper exactly what to fix.
function aiErrorResponse(err, { messages = {}, fallback }) {
  const statusCode = err instanceof AiServiceError ? err.statusCode : 502;
  // Codes like MISSING_ANCHOR_POINT:<key> carry detail after the colon.
  const code = String(err.message || '').split(':')[0];

  if (code === 'POSE_INVALID' && Array.isArray(err.details) && err.details.length > 0) {
    return {
      status: statusCode,
      body: {
        success: false,
        code,
        message: `We need a better photo: ${err.details[0].message}.`,
        poseChecks: err.details,
      },
    };
  }

  const message = messages[code] || AI_ERROR_MESSAGES[code] || fallback;
  return { status: statusCode, body: { success: false, message } };
}

module.exports = { aiErrorResponse, TRY_ON_ERROR_MESSAGES, TRY_ON_FALLBACK_MESSAGE };
