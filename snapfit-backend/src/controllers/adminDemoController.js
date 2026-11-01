const ProductMapping = require('../models/ProductMapping');
const { tryOnStatus } = require('./productMappingController');
const { DEMO_NOT_SET_UP, demoConfig } = require('../middlewares/adminMiddleware');

// The demo studio's product (GET /api/admin/demo): just what the demo page
// shows -- no merchant details. 503 until the server's .env names it.
async function getDemoProduct(req, res) {
  try {
    const { merchantId, productId } = demoConfig();
    const mapping = merchantId ? await ProductMapping.findOne({ merchantId, productId }).catch(() => null) : null;
    if (!mapping) {
      return res.status(503).json({ message: DEMO_NOT_SET_UP });
    }
    return res.status(200).json({
      product: {
        productId: mapping.productId,
        productName: mapping.productName || null,
        productImage: mapping.productImage || null,
        tryOnStatus: tryOnStatus(mapping),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load the demo product', error: err.message });
  }
}

module.exports = { getDemoProduct };
