const fs = require('fs/promises');
const Recommendation = require('../models/Recommendation');
const { getChartForProduct } = require('./productMappingController');
const { analyzeImage, AiServiceError } = require('../services/aiService');

const LOW_CONFIDENCE_THRESHOLD = 0.5;

const AI_ERROR_MESSAGES = {
  NO_BODY_DETECTED: 'We could not detect a person in this photo. Please upload a clear, full-body photo.',
  INVALID_IMAGE: 'This file could not be read as an image. Please upload a JPG or PNG photo.',
  FILE_TOO_LARGE: 'This image is too large. Please upload a photo under 10MB.',
  RESOLUTION_TOO_LOW: 'This image resolution is too low. Please upload a higher-resolution photo.',
};

function friendlyAiErrorMessage(err) {
  return (
    AI_ERROR_MESSAGES[err.message] ||
    'We could not process your photo right now. Please try again with a clear, front-facing full-body photo.'
  );
}

async function cleanupUpload(file) {
  if (file) {
    await fs.unlink(file.path).catch(() => {});
  }
}

async function recommend(req, res) {
  const merchant = req.merchant;
  const { productId } = req.body;
  const rawUserHeight = req.body.userHeight;

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'An image file is required' });
  }

  if (!productId || !String(productId).trim()) {
    await cleanupUpload(req.file);
    return res.status(400).json({ success: false, message: 'productId is required' });
  }

  let userHeight;
  if (rawUserHeight != null && rawUserHeight !== '') {
    userHeight = Number(rawUserHeight);
    if (Number.isNaN(userHeight) || userHeight <= 0) {
      await cleanupUpload(req.file);
      return res.status(400).json({ success: false, message: 'userHeight must be a positive number' });
    }
  }

  let sizeChart;
  try {
    sizeChart = await getChartForProduct(merchant._id, productId);
  } catch (err) {
    await cleanupUpload(req.file);
    return res.status(500).json({ success: false, message: 'Failed to look up product mapping', error: err.message });
  }

  if (!sizeChart) {
    await cleanupUpload(req.file);
    return res.status(404).json({
      success: false,
      message: `No size chart is mapped to product "${productId}". Map this product to a size chart before requesting a recommendation.`,
    });
  }

  let aiResult;
  try {
    const imageBuffer = await fs.readFile(req.file.path);
    aiResult = await analyzeImage(imageBuffer, sizeChart.toObject(), userHeight);
  } catch (err) {
    await cleanupUpload(req.file);

    await Recommendation.create({
      merchantId: merchant._id,
      productId,
      sizeChartId: sizeChart._id,
      userHeight,
      status: 'failed',
      errorMessage: err.message,
      ipAddress: req.ip,
    });

    const statusCode = err instanceof AiServiceError ? err.statusCode : 502;
    return res.status(statusCode).json({ success: false, message: friendlyAiErrorMessage(err) });
  }

  await cleanupUpload(req.file);

  const sizeRecommendation = aiResult.size_recommendation;
  if (!sizeRecommendation) {
    await Recommendation.create({
      merchantId: merchant._id,
      productId,
      sizeChartId: sizeChart._id,
      confidence: aiResult.confidence,
      userHeight,
      status: 'failed',
      errorMessage: 'NO_SIZE_RECOMMENDATION',
      ipAddress: req.ip,
    });
    return res.status(502).json({ success: false, message: 'A size recommendation could not be produced for this photo.' });
  }

  const ratios = aiResult.features?.ratios || {};
  const status = sizeRecommendation.confidence < LOW_CONFIDENCE_THRESHOLD ? 'low_confidence' : 'success';

  await Recommendation.create({
    merchantId: merchant._id,
    productId,
    sizeChartId: sizeChart._id,
    recommendedSize: sizeRecommendation.recommended_size,
    confidence: sizeRecommendation.confidence,
    bodyFeatures: {
      shoulderToHipRatio: ratios.shoulder_to_hip_ratio,
      torsoToLegRatio: ratios.leg_length_ratio ? ratios.torso_length_ratio / ratios.leg_length_ratio : undefined,
      shoulderWidthNorm: ratios.shoulder_width_ratio,
      hipWidthNorm: ratios.hip_width_ratio,
      chestWidthNorm: ratios.chest_width_estimate_ratio,
    },
    userHeight,
    status,
    ipAddress: req.ip,
  });

  return res.status(200).json({
    success: true,
    recommendation: {
      size: sizeRecommendation.recommended_size,
      confidence: sizeRecommendation.confidence,
      bodyType: sizeRecommendation.body_type,
      notes: sizeRecommendation.notes,
      fitScores: sizeRecommendation.fit_scores,
    },
  });
}

module.exports = { recommend };
