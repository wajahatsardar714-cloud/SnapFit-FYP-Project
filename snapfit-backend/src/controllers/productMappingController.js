const { validationResult } = require('express-validator');
const ProductMapping = require('../models/ProductMapping');
const SizeChart = require('../models/SizeChart');
const { productImageUrlPath, removeFile, removeProductImage } = require('../utils/productImageUpload');

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

// Product info the shopper-facing widget may see (scoped to the API key's own
// merchant by the caller).
function widgetProductInfo(mapping, req) {
  return {
    productId: mapping.productId,
    productName: mapping.productName || null,
    imageUrl: mapping.productImage ? `${req.protocol}://${req.get('host')}${mapping.productImage}` : null,
    tryOnReady: tryOnStatus(mapping) === 'ready',
  };
}

function sendValidationErrors(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ message: errors.array()[0].msg, errors: errors.array() });
  return true;
}

async function discardUpload(req) {
  if (req.file) await removeFile(req.file.path);
}

async function findOwnMapping(req) {
  return ProductMapping.findOne({ _id: req.params.id, merchantId: req.merchant.merchantId });
}

async function mapProduct(req, res) {
  if (sendValidationErrors(req, res)) {
    await discardUpload(req);
    return undefined;
  }
  const { productId, productName, sizeChartId } = req.body;

  try {
    const chart = await SizeChart.findOne({ _id: sizeChartId, merchantId: req.merchant.merchantId });
    if (!chart) {
      await discardUpload(req);
      return res.status(404).json({ message: 'Size chart not found' });
    }

    const update = { productName, sizeChartId };
    let previousImage = null;
    if (req.file) {
      const existing = await ProductMapping.findOne({ merchantId: req.merchant.merchantId, productId });
      previousImage = existing?.productImage || null;
      // A new photo invalidates anchor points placed on the old one.
      Object.assign(update, { productImage: productImageUrlPath(req.file), $unset: { anchorPoints: 1 } });
    }

    const mapping = await ProductMapping.findOneAndUpdate({ merchantId: req.merchant.merchantId, productId }, update, {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    });
    if (previousImage) await removeProductImage(previousImage);

    return res.status(200).json({ mapping: serializeMapping(mapping) });
  } catch (err) {
    await discardUpload(req);
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
    await removeProductImage(mapping.productImage);

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
  if (sendValidationErrors(req, res)) {
    await discardUpload(req);
    return undefined;
  }
  try {
    const mapping = await findOwnMapping(req);
    if (!mapping) {
      await discardUpload(req);
      return res.status(404).json({ message: 'Product mapping not found' });
    }

    const previousImage = mapping.productImage;
    mapping.productImage = productImageUrlPath(req.file);
    // A new photo invalidates anchor points placed on the old one.
    mapping.anchorPoints = undefined;
    await mapping.save();
    await removeProductImage(previousImage);

    return res.status(200).json({ mapping: serializeMapping(mapping) });
  } catch (err) {
    await discardUpload(req);
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

    const previousImage = mapping.productImage;
    mapping.productImage = undefined;
    mapping.anchorPoints = undefined;
    await mapping.save();
    await removeProductImage(previousImage);

    return res.status(200).json({ mapping: serializeMapping(mapping) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to remove product image', error: err.message });
  }
}

async function saveAnchorPoints(req, res) {
  if (sendValidationErrors(req, res)) {
    await discardUpload(req);
    return undefined;
  }
  const { error, points } = parseAnchorPoints(req.body.anchorPoints);
  if (error) {
    await discardUpload(req);
    return res.status(400).json({ message: error });
  }

  try {
    const mapping = await findOwnMapping(req);
    if (!mapping) {
      await discardUpload(req);
      return res.status(404).json({ message: 'Product mapping not found' });
    }

    if (!req.file && !mapping.productImage) {
      return res.status(400).json({ message: 'A product image is required' });
    }

    const previousImage = mapping.productImage;
    if (req.file) {
      mapping.productImage = productImageUrlPath(req.file);
    }
    mapping.anchorPoints = points;
    await mapping.save();

    if (req.file) await removeProductImage(previousImage);

    return res.status(200).json({ mapping: serializeMapping(mapping) });
  } catch (err) {
    await discardUpload(req);
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
      imageUrl: `${req.protocol}://${req.get('host')}${mapping.productImage}`,
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
};
