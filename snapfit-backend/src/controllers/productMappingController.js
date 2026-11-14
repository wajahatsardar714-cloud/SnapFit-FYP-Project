const { validationResult } = require('express-validator');
const ProductMapping = require('../models/ProductMapping');
const SizeChart = require('../models/SizeChart');
const { notify } = require('../services/notify');
const { storeProductImage, removeProductImages } = require('../utils/productImageUpload');
const { isAbsoluteUrl } = require('../services/storage');

const REQUIRED_ANCHOR_POINTS = ['shoulderLeft', 'shoulderRight', 'hipLeft', 'hipRight'];

function parseAnchorPoints(raw) {
  let points;
  try {
    points = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { error: 'anchorPoints must be valid JSON' };
  }

  if (!points || typeof points !== 'object') {
    return { error: 'anchorPoints is required' };
  }

  const parsed = {};
  for (const key of REQUIRED_ANCHOR_POINTS) {
    const point = points[key];
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      return { error: `anchorPoints.${key} must have x and y between 0 and 1` };
    }
    parsed[key] = { x, y };
  }

  return { points: parsed };
}

// 'ready' (image + all 4 anchor points) | 'image_missing' | 'anchors_missing'
function tryOnStatus(mapping) {
  if (!mapping.productImage) return 'image_missing';
  const anchors = mapping.anchorPoints || {};
  const complete = REQUIRED_ANCHOR_POINTS.every(
    (key) => Number.isFinite(anchors[key]?.x) && Number.isFinite(anchors[key]?.y)
  );
  return complete ? 'ready' : 'anchors_missing';
}

function serializeMapping(mapping) {
  return { ...mapping.toObject(), tryOnStatus: tryOnStatus(mapping) };
}

// Absolute URL the AI service (and widget) can fetch: R2 URLs as they are, old
// /uploads/products paths on this server's own host.
function productImageFetchUrl(productImage, req) {
  if (!productImage) return null;
  return isAbsoluteUrl(productImage) ? productImage : `${req.protocol}://${req.get('host')}${productImage}`;
}

// Product info the shopper-facing widget may see (scoped to the API key's own
// merchant by the caller).
function widgetProductInfo(mapping, req) {
  return {
    productId: mapping.productId,
    productName: mapping.productName || null,
    imageUrl: productImageFetchUrl(mapping.productImage, req),
    tryOnReady: tryOnStatus(mapping) === 'ready',
  };
}

function sendValidationErrors(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  return true;
}

// Stores the request's processed upload (if any) for this product; resolves to
// the mapping fields to set, or null without an upload.
async function storeUpload(req, productId) {
  if (!req.productImageUpload) return null;
  return storeProductImage(req.merchant.merchantId, productId, req.productImageUpload);
}

const imageRefs = (mapping) => ({
  productImage: mapping?.productImage,
  productImageThumb: mapping?.productImageThumb,
});

async function findOwnMapping(req) {
  return ProductMapping.findOne({ _id: req.params.id, merchantId: req.merchant.merchantId });
}

async function mapProduct(req, res) {
  if (sendValidationErrors(req, res)) return undefined;
  const { productId, productName, sizeChartId, garmentLength, sleeveLength } = req.body;

  let stored = null;
  try {
    const chart = await SizeChart.findOne({ _id: sizeChartId, merchantId: req.merchant.merchantId });
    if (!chart) {
      return res.status(404).json({ message: 'Size chart not found' });
    }

    const update = { productName, sizeChartId, garmentLength, sleeveLength };
    let previous = null;
    stored = await storeUpload(req, productId);
    if (stored) {
      const existing = await ProductMapping.findOne({ merchantId: req.merchant.merchantId, productId });
      previous = imageRefs(existing);
      // A new photo invalidates anchor points placed on the old one.
      Object.assign(update, stored, { $unset: { anchorPoints: 1 } });
    }

    const mapping = await ProductMapping.findOneAndUpdate({ merchantId: req.merchant.merchantId, productId }, update, {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    });
    stored = null;
    if (previous) await removeProductImages(previous);

    return res.status(200).json({ mapping: serializeMapping(mapping) });
  } catch (err) {
    if (stored) await removeProductImages(stored);
    return res.status(500).json({ message: 'Failed to map product', error: err.message });
  }
}

async function getProductMappings(req, res) {
  try {
    const mappings = await ProductMapping.find({ merchantId: req.merchant.merchantId })
      .populate('sizeChartId', 'name category')
      .sort({ createdAt: -1 });

    return res.status(200).json({ mappings: mappings.map(serializeMapping) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch product mappings', error: err.message });
  }
}

async function removeMapping(req, res) {
  if (sendValidationErrors(req, res)) return undefined;
  try {
    const mapping = await ProductMapping.findOneAndDelete({
      _id: req.params.id,
      merchantId: req.merchant.merchantId,
    });

    if (!mapping) {
      return res.status(404).json({ message: 'Product mapping not found' });
    }
    await removeProductImages(imageRefs(mapping));

    return res.status(200).json({ message: 'Product mapping removed' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to remove product mapping', error: err.message });
  }
}

// Mapping + its populated size chart, for the recommendation API.
async function getMappingForProduct(merchantId, productId) {
  return ProductMapping.findOne({ merchantId, productId }).populate('sizeChartId');
}

async function setProductImage(req, res) {
  if (sendValidationErrors(req, res)) return undefined;
  let stored = null;
  try {
    const mapping = await findOwnMapping(req);
    if (!mapping) {
      return res.status(404).json({ message: 'Product mapping not found' });
    }

    const previous = imageRefs(mapping);
    stored = await storeUpload(req, mapping.productId);
    Object.assign(mapping, stored);
    // A new photo invalidates anchor points placed on the old one.
    mapping.anchorPoints = undefined;
    await mapping.save();
    stored = null;
    await removeProductImages(previous);

    return res.status(200).json({ mapping: serializeMapping(mapping) });
  } catch (err) {
    if (stored) await removeProductImages(stored);
    return res.status(500).json({ message: 'Failed to save product image', error: err.message });
  }
}

async function deleteProductImage(req, res) {
  if (sendValidationErrors(req, res)) return undefined;
  try {
    const mapping = await findOwnMapping(req);
    if (!mapping) {
      return res.status(404).json({ message: 'Product mapping not found' });
    }

    const previous = imageRefs(mapping);
    mapping.productImage = undefined;
    mapping.productImageThumb = undefined;
    mapping.anchorPoints = undefined;
    await mapping.save();
    await removeProductImages(previous);

    return res.status(200).json({ mapping: serializeMapping(mapping) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to remove product image', error: err.message });
  }
}

// Anchor points are 0-1 fractions of the image's width and height. With a new
// image in the same request they were placed on the merchant's own preview of
// it; the stored copy is that image upright and, at most, evenly shrunk, so the
// same fractions mark the same spots on it.
async function saveAnchorPoints(req, res) {
  if (sendValidationErrors(req, res)) return undefined;
  const { error, points } = parseAnchorPoints(req.body.anchorPoints);
  if (error) {
    return res.status(400).json({ message: error });
  }

  let stored = null;
  try {
    const mapping = await findOwnMapping(req);
    if (!mapping) {
      return res.status(404).json({ message: 'Product mapping not found' });
    }

    if (!req.productImageUpload && !mapping.productImage) {
      return res.status(400).json({ message: 'A product image is required' });
    }

    const wasReady = tryOnStatus(mapping) === 'ready';
    const previous = imageRefs(mapping);
    stored = await storeUpload(req, mapping.productId);
    if (stored) Object.assign(mapping, stored);
    mapping.anchorPoints = points;
    await mapping.save();

    if (stored) {
      stored = null;
      await removeProductImages(previous);
    }
    // Anchor points are the last step that makes a product try-on ready.
    if (!wasReady && tryOnStatus(mapping) === 'ready') {
      await notify(req.merchant.merchantId, 'product.tryon_ready', {
        data: { productId: mapping.productId, productName: mapping.productName },
      });
    }

    return res.status(200).json({ mapping: serializeMapping(mapping) });
  } catch (err) {
    if (stored) await removeProductImages(stored);
    return res.status(500).json({ message: 'Failed to save anchor points', error: err.message });
  }
}

async function getAnchorPointsForProduct(req, res) {
  const { merchantId, productId } = req.query;
  if (!merchantId || !productId) {
    return res.status(400).json({ message: 'merchantId and productId are required' });
  }

  try {
    const mapping = await ProductMapping.findOne({ merchantId, productId });
    if (!mapping || tryOnStatus(mapping) !== 'ready') {
      return res.status(404).json({ message: 'No anchor points configured for this product' });
    }

    return res.status(200).json({
      anchorPoints: mapping.anchorPoints,
      imageUrl: productImageFetchUrl(mapping.productImage, req),
      garmentLength: mapping.garmentLength,
      sleeveLength: mapping.sleeveLength,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid merchantId' });
    }
    return res.status(500).json({ message: 'Failed to fetch anchor points', error: err.message });
  }
}

module.exports = {
  mapProduct,
  getProductMappings,
  removeMapping,
  getMappingForProduct,
  setProductImage,
  deleteProductImage,
  saveAnchorPoints,
  getAnchorPointsForProduct,
  tryOnStatus,
  widgetProductInfo,
  productImageFetchUrl,
};
