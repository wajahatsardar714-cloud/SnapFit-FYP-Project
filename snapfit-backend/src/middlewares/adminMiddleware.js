const mongoose = require('mongoose');
const Merchant = require('../models/Merchant');

// A merchant account by id; null for an unknown or malformed id and for the
// super admin, so the admin API can never act on the super admin itself.
function findMerchantAccount(id) {
  if (!mongoose.isObjectIdOrHexString(id)) return Promise.resolve(null);
  return Merchant.findOne({ _id: id, ...Merchant.MERCHANTS_ONLY });
}

// router.param handler for admin routes with a merchant :id -- loads it into
// req.targetMerchant.
async function loadTargetMerchant(req, res, next, id) {
  try {
    const merchant = await findMerchantAccount(id);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }
    req.targetMerchant = merchant;
    return next();
  } catch (err) {
    return res.status(500).json({ message: 'Failed to load merchant', error: err.message });
  }
}

const DEMO_NOT_SET_UP = 'The demo product is not set up. Set DEMO_MERCHANT_ID and DEMO_PRODUCT_ID on the server.';

// The demo studio's one store and product, from the server's .env. The admin
// never chooses a merchant: the demo runs on SnapFit's own demo store only.
function demoConfig() {
  return { merchantId: process.env.DEMO_MERCHANT_ID, productId: process.env.DEMO_PRODUCT_ID || 'demo-product-1' };
}

// Lets the super admin run the public widget endpoints on the demo store
// without an API key: puts that store where the API-key middleware would,
// skipping its subscription, suspension and quota checks, and tags stored
// recommendations as demo runs so analytics leave them out.
async function loadDemoMerchant(req, res, next) {
  try {
    const merchant = await findMerchantAccount(demoConfig().merchantId);
    if (!merchant) {
      return res.status(503).json({ success: false, message: DEMO_NOT_SET_UP });
    }
    req.merchant = merchant;
    req.recommendationSource = 'admin_demo';
    return next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load the demo store', error: err.message });
  }
}

// After the upload is parsed: the demo always sizes the configured product,
// whatever product id the request carried.
function useDemoProduct(req, res, next) {
  req.body.productId = demoConfig().productId;
  next();
}

module.exports = { loadTargetMerchant, loadDemoMerchant, useDemoProduct, demoConfig, DEMO_NOT_SET_UP };
