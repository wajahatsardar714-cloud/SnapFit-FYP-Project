const fs = require('fs/promises');
const { tryOnImage } = require('../services/aiService');
const { aiErrorResponse, TRY_ON_ERROR_MESSAGES, TRY_ON_FALLBACK_MESSAGE } = require('../utils/aiErrors');

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
