const fs = require('fs/promises');
const path = require('path');
const ProductMapping = require('../models/ProductMapping');
const SizeChart = require('../models/SizeChart');

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

async function mapProduct(req, res) {
  const { productId, productName, sizeChartId } = req.body;

  if (!productId || !String(productId).trim()) {
    return res.status(400).json({ message: 'Product ID is required' });
  }
  if (!sizeChartId) {
    return res.status(400).json({ message: 'Size chart is required' });
  }

  try {
    const chart = await SizeChart.findOne({ _id: sizeChartId, merchantId: req.merchant.merchantId });
    if (!chart) {
      return res.status(404).json({ message: 'Size chart not found' });
    }

    const mapping = await ProductMapping.findOneAndUpdate(
      { merchantId: req.merchant.merchantId, productId },
      { productName, sizeChartId },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ mapping });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid size chart ID' });
    }
    return res.status(500).json({ message: 'Failed to map product', error: err.message });
  }
}

async function getProductMappings(req, res) {
  try {
    const mappings = await ProductMapping.find({ merchantId: req.merchant.merchantId })
      .populate('sizeChartId', 'name category')
      .sort({ createdAt: -1 });

    return res.status(200).json({ mappings });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch product mappings', error: err.message });
  }
}

async function removeMapping(req, res) {
  try {
    const mapping = await ProductMapping.findOneAndDelete({
      _id: req.params.id,
      merchantId: req.merchant.merchantId,
    });

    if (!mapping) {
      return res.status(404).json({ message: 'Product mapping not found' });
    }

    return res.status(200).json({ message: 'Product mapping removed' });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ message: 'Product mapping not found' });
    }
    return res.status(500).json({ message: 'Failed to remove product mapping', error: err.message });
  }
}

// Helper for the future recommendation API — not exposed as its own route yet.
async function getChartForProduct(merchantId, productId) {
  const mapping = await ProductMapping.findOne({ merchantId, productId }).populate('sizeChartId');
  return mapping ? mapping.sizeChartId : null;
}

async function saveAnchorPoints(req, res) {
  const { error, points } = parseAnchorPoints(req.body.anchorPoints);
  if (error) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ message: error });
  }

  try {
    const mapping = await ProductMapping.findOne({ _id: req.params.id, merchantId: req.merchant.merchantId });
    if (!mapping) {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ message: 'Product mapping not found' });
    }

    if (!req.file && !mapping.productImage) {
      return res.status(400).json({ message: 'A product image is required' });
    }

    const previousImagePath = mapping.productImage;
    if (req.file) {
      mapping.productImage = `/uploads/products/${req.file.filename}`;
    }
    mapping.anchorPoints = points;
    await mapping.save();

    if (req.file && previousImagePath) {
      const absolutePrevious = path.join(__dirname, '..', '..', previousImagePath);
      await fs.unlink(absolutePrevious).catch(() => {});
    }

    return res.status(200).json({ mapping });
  } catch (err) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    if (err.name === 'CastError') {
      return res.status(404).json({ message: 'Product mapping not found' });
    }
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
    if (!mapping || !mapping.anchorPoints || !mapping.productImage) {
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
  getChartForProduct,
  saveAnchorPoints,
  getAnchorPointsForProduct,
};
