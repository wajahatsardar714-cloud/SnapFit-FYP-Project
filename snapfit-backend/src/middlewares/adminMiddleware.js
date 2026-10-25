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

// Lets the super admin run the public widget endpoints as ?merchantId=<id>
// without that merchant's API key: puts the merchant where the API-key
// middleware would, skipping its subscription, suspension and quota checks, and
// tags stored recommendations as demo runs so analytics leave them out.
async function loadDemoMerchant(req, res, next) {
  try {
    const merchant = await findMerchantAccount(req.query.merchantId);
    if (!merchant) {
      return res.status(404).json({ success: false, message: 'Merchant not found' });
    }
    req.merchant = merchant;
    req.recommendationSource = 'admin_demo';
    return next();
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Failed to load merchant', error: err.message });
  }
}

module.exports = { loadTargetMerchant, loadDemoMerchant };
