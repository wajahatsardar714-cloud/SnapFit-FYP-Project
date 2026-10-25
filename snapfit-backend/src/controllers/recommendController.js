const fs = require('fs/promises');
const Recommendation = require('../models/Recommendation');
const { getMappingForProduct, widgetProductInfo } = require('./productMappingController');
const { analyzeImage } = require('../services/aiService');
const { aiErrorResponse, TRY_ON_ERROR_MESSAGES, TRY_ON_FALLBACK_MESSAGE } = require('../utils/aiErrors');

const LOW_CONFIDENCE_THRESHOLD = 0.5;
const MIN_USER_HEIGHT_CM = 100;
const MAX_USER_HEIGHT_CM = 230;
const CLOTHING_FITS = Recommendation.schema.path('clothingFit').enumValues;

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

// Deletes the request's temp photos: the main image and any extra frames.
async function cleanupUpload(req) {
  const files = [req.file, ...req.frames].filter(Boolean);
  await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => {})));
}

// The shopper's own inputs: height in cm (required) and how the clothes in the
// photo fit (default 'regular'). Returns { error } when one is invalid.
function parseShopperInputs(body) {
  const rawUserHeight = body.userHeight;
  if (rawUserHeight == null || String(rawUserHeight).trim() === '') {
    return { error: 'userHeight is required' };
  }
  const userHeight = Number(rawUserHeight);
  if (Number.isNaN(userHeight) || userHeight < MIN_USER_HEIGHT_CM || userHeight > MAX_USER_HEIGHT_CM) {
    return { error: `userHeight must be between ${MIN_USER_HEIGHT_CM} and ${MAX_USER_HEIGHT_CM} cm` };
  }

  const clothingFit = body.clothingFit || 'regular';
  if (!CLOTHING_FITS.includes(clothingFit)) {
    return { error: 'clothingFit must be fitted, regular or loose' };
  }

  return { userHeight, clothingFit };
}

async function recommend(req, res) {
  const merchant = req.merchant;
  const { productId } = req.body;
  // Optional: also render the virtual try-on in the same call -- one upload,
  // one pose detection, and one request against the plan's quota.
  const includeTryOn = String(req.body.includeTryOn) === 'true';

  if (!req.file) {
    await cleanupUpload(req);
    return res.status(400).json({ success: false, message: 'An image file is required' });
  }

  if (!productId || !String(productId).trim()) {
    await cleanupUpload(req);
    return res.status(400).json({ success: false, message: 'productId is required' });
  }

  const { userHeight, clothingFit, error } = parseShopperInputs(req.body);
  if (error) {
    await cleanupUpload(req);
    return res.status(400).json({ success: false, message: error });
  }

  let mapping;
  try {
    mapping = await getMappingForProduct(merchant._id, productId);
  } catch (err) {
    await cleanupUpload(req);
    return res.status(500).json({ success: false, message: 'Failed to look up product mapping', error: err.message });
  }

  const sizeChart = mapping?.sizeChartId;
  if (!sizeChart) {
    await cleanupUpload(req);
    return res.status(404).json({
      success: false,
      message: `No size chart is mapped to product "${productId}". Map this product to a size chart before requesting a recommendation.`,
    });
  }

  const product = widgetProductInfo(mapping, req);
  const requestTryOn = includeTryOn && product.tryOnReady;

  let aiResult;
  try {
    const [imageBuffer, ...frameBuffers] = await Promise.all(
      [req.file, ...req.frames].map((file) => fs.readFile(file.path))
    );
    aiResult = await analyzeImage(imageBuffer, sizeChart.toObject(), {
      userHeight,
      clothingFit,
      tryOn: requestTryOn ? { merchantId: merchant._id, productId } : null,
      frames: frameBuffers,
    });
  } catch (err) {
    await cleanupUpload(req);

    await Recommendation.create({
      merchantId: merchant._id,
      productId,
      sizeChartId: sizeChart._id,
      userHeight,
      clothingFit,
      status: 'failed',
      errorMessage: err.message,
      ipAddress: req.ip,
    });

    const { status: statusCode, body } = aiErrorResponse(err, { fallback: RECOMMEND_FALLBACK_MESSAGE });
    return res.status(statusCode).json(body);
  }

  await cleanupUpload(req);

  const framesUsed = aiResult.framesUsed ?? 1;
  const sizeRecommendation = aiResult.size_recommendation;
  if (!sizeRecommendation) {
    await Recommendation.create({
      merchantId: merchant._id,
      productId,
      sizeChartId: sizeChart._id,
      confidence: aiResult.confidence,
      userHeight,
      clothingFit,
      framesUsed,
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
    clothingFit,
    framesUsed,
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
      photoTips: aiResult.photoTips || [],
      warnings: aiResult.warnings || [],
      framesUsed,
    },
    product,
    ...(includeTryOn && { tryOn: tryOnResult(aiResult.tryOn, requestTryOn) }),
  });
}

module.exports = { recommend };
