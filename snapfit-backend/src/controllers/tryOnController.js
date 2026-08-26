const fs = require('fs/promises');
const { tryOnImage, AiServiceError } = require('../services/aiService');

const TRY_ON_ERROR_MESSAGES = {
  NO_BODY_DETECTED: 'We could not detect a person in this photo. Please upload a clear, full-body photo.',
  INVALID_IMAGE: 'This file could not be read as an image. Please upload a JPG or PNG photo.',
  RESOLUTION_TOO_LOW: 'This image resolution is too low. Please upload a higher-resolution photo.',
  PRODUCT_ANCHOR_POINTS_NOT_FOUND: 'A photo preview is not set up for this product yet.',
  INVALID_PRODUCT_IMAGE: 'This product does not have a usable preview photo yet.',
};

function friendlyTryOnErrorMessage(err) {
  // MISSING_ANCHOR_POINT:<key> carries extra detail after the colon -- match on
  // the code alone.
  const code = String(err.message || '').split(':')[0];
  return TRY_ON_ERROR_MESSAGES[code] || 'We could not generate a photo preview right now. Please try again in a moment.';
}

async function cleanupUpload(file) {
  if (file) {
    await fs.unlink(file.path).catch(() => {});
  }
}

async function tryOn(req, res) {
  const merchant = req.merchant;
  const { productId } = req.body;

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'An image file is required' });
  }
  if (!productId || !String(productId).trim()) {
    await cleanupUpload(req.file);
    return res.status(400).json({ success: false, message: 'productId is required' });
  }

  try {
    const imageBuffer = await fs.readFile(req.file.path);
    const aiResult = await tryOnImage(imageBuffer, merchant._id, productId);
    await cleanupUpload(req.file);
    return res.status(200).json({ success: true, image: aiResult.image });
  } catch (err) {
    await cleanupUpload(req.file);
    const statusCode = err instanceof AiServiceError ? err.statusCode : 502;
    return res.status(statusCode).json({ success: false, message: friendlyTryOnErrorMessage(err) });
  }
}

module.exports = { tryOn };
