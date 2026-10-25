const Merchant = require('../models/Merchant');

// Active means subscribed with no end date, or one still in the future.
function isSubscriptionActive(subscription) {
  if (subscription?.status !== 'active') return false;
  return !subscription.endDate || subscription.endDate.getTime() > Date.now();
}

// Locks a dashboard feature until the merchant subscribes -- mount after
// `protect` and `requireMerchant`.
async function requireActiveSubscription(req, res, next) {
  try {
    const account = await Merchant.findById(req.merchant.merchantId).select('subscription').lean();
    if (!isSubscriptionActive(account?.subscription)) {
      return res.status(403).json({ message: 'An active subscription is required', code: 'SUBSCRIPTION_REQUIRED' });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ message: 'Failed to check subscription', error: err.message });
  }
}

module.exports = { requireActiveSubscription };
