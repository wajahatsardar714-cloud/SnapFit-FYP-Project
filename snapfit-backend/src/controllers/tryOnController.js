const fs = require('fs/promises');
const { tryOnImage } = require('../services/aiService');
const { aiErrorResponse } = require('../utils/aiErrors');

const TRY_ON_ERROR_MESSAGES = {
  PRODUCT_ANCHOR_POINTS_NOT_FOUND: 'A photo preview is not set up for this product yet.',
  INVALID_PRODUCT_IMAGE: 'This product does not have a usable preview photo yet.',
};
const TRY_ON_FALLBACK_MESSAGE = 'We could not generate a photo preview right now. Please try again in a moment.';

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
    const { status: statusCode, body } = aiErrorResponse(err, {
      messages: TRY_ON_ERROR_MESSAGES,
      fallback: TRY_ON_FALLBACK_MESSAGE,
    });
    return res.status(statusCode).json(body);
  }
}

module.exports = { tryOn };
