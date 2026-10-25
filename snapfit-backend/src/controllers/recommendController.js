const fs = require('fs/promises');
const Recommendation = require('../models/Recommendation');
const { getMappingForProduct, widgetProductInfo } = require('./productMappingController');
const { analyzeImage } = require('../services/aiService');
const { aiErrorResponse, TRY_ON_ERROR_MESSAGES, TRY_ON_FALLBACK_MESSAGE } = require('../utils/aiErrors');

const LOW_CONFIDENCE_THRESHOLD = 0.5;

const RECOMMEND_FALLBACK_MESSAGE =
  'We could not process your photo right now. Please try again with a clear, front-facing full-body photo.';

// The try-on part of a combined recommend + try-on response. Never an error
// status: a try-on problem must not hide the size result.
function tryOnResult(aiTryOn, requested) {
  if (!requested) return { status: 'unavailable' };
  // engine: 'catvton' (GPU diffusion model) or 'warp' (local fallback).
  if (aiTryOn?.image) return { status: 'success', image: aiTryOn.image, engine: aiTryOn.engine || 'warp' };
  const code = aiTryOn?.error;
  if (code === 'TRYON_NOT_AVAILABLE') return { status: 'unavailable' };
  return { status: 'failed', message: TRY_ON_ERROR_MESSAGES[code] || TRY_ON_FALLBACK_MESSAGE };
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
  // Optional: also render the virtual try-on in the same call -- one upload,
  // one pose detection, and one request against the plan's quota.
  const includeTryOn = String(req.body.includeTryOn) === 'true';

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

  let mapping;
  try {
    mapping = await getMappingForProduct(merchant._id, productId);
  } catch (err) {
    await cleanupUpload(req.file);
    return res.status(500).json({ success: false, message: 'Failed to look up product mapping', error: err.message });
  }

  const sizeChart = mapping?.sizeChartId;
  if (!sizeChart) {
    await cleanupUpload(req.file);
    return res.status(404).json({
      success: false,
      message: `No size chart is mapped to product "${productId}". Map this product to a size chart before requesting a recommendation.`,
    });
  }

  const product = widgetProductInfo(mapping, req);
  const requestTryOn = includeTryOn && product.tryOnReady;

  let aiResult;
  try {
    const imageBuffer = await fs.readFile(req.file.path);
    aiResult = await analyzeImage(
      imageBuffer,
      sizeChart.toObject(),
      userHeight,
      requestTryOn ? { merchantId: merchant._id, productId } : null
    );
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

    const { status: statusCode, body } = aiErrorResponse(err, { fallback: RECOMMEND_FALLBACK_MESSAGE });
    return res.status(statusCode).json(body);
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
  const measurements = aiResult.measurements || {};
  const sizeComparison = aiResult.sizeComparison || [];
  const status = sizeRecommendation.confidence < LOW_CONFIDENCE_THRESHOLD ? 'low_confidence' : 'success';

  await Recommendation.create({
    merchantId: merchant._id,
    productId,
    sizeChartId: sizeChart._id,
    recommendedSize: sizeRecommendation.recommended_size,
    alternativeSize: aiResult.alternativeSize || undefined,
    confidence: sizeRecommendation.confidence,
    bodyFeatures: {
      shoulderToHipRatio: ratios.shoulder_to_hip_ratio,
      torsoToLegRatio: ratios.leg_length_ratio ? ratios.torso_length_ratio / ratios.leg_length_ratio : undefined,
      shoulderWidthNorm: ratios.shoulder_width_ratio,
      hipWidthNorm: ratios.hip_width_ratio,
      chestWidthNorm: ratios.chest_width_estimate_ratio,
    },
    measurements: Object.fromEntries(Object.entries(measurements).map(([name, m]) => [name, m.value])),
    sizeScores: sizeComparison.map(({ label, score }) => ({ label, score })),
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
      alternativeSize: aiResult.alternativeSize ?? null,
      measurements,
      sizeComparison,
      fitNotes: aiResult.fitNotes || [],
    },
    product,
    ...(includeTryOn && { tryOn: tryOnResult(aiResult.tryOn, requestTryOn) }),
  });
}

module.exports = { recommend };
