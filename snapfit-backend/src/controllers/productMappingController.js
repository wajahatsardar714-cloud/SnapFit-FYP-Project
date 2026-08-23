const ProductMapping = require('../models/ProductMapping');
const SizeChart = require('../models/SizeChart');

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

module.exports = { mapProduct, getProductMappings, removeMapping, getChartForProduct };
