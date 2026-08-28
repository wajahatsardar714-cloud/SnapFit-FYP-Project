const Merchant = require('../models/Merchant');

async function resolveMerchant(req, res, { countUsage }) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    res.status(401).json({ message: 'No API key provided' });
    return null;
  }

  const merchant = await Merchant.findOne({ apiKey });
  if (!merchant) {
    res.status(401).json({ message: 'Invalid API key' });
    return null;
  }

  const { subscription } = merchant;

  if (subscription.status !== 'active') {
    res.status(403).json({ message: 'Subscription is not active' });
    return null;
  }

  if (subscription.endDate && subscription.endDate.getTime() < Date.now()) {
    res.status(403).json({ message: 'Subscription has expired' });
    return null;
  }

  if (countUsage) {
    if (subscription.requestsLimit != null && subscription.requestsUsed >= subscription.requestsLimit) {
      res.status(403).json({ message: 'Monthly request limit reached' });
      return null;
    }
    subscription.requestsUsed += 1;
    await merchant.save();
  }

  return merchant;
}

// Gates a billable action (a photo actually being analyzed) -- counts against the
// merchant's monthly plan quota.
async function validateApiKey(req, res, next) {
  try {
    const merchant = await resolveMerchant(req, res, { countUsage: true });
    if (!merchant) return undefined;
    req.merchant = merchant;
    return next();
  } catch (err) {
    return res.status(500).json({ message: 'API key validation failed', error: err.message });
  }
}

// Same auth/subscription checks, but for cheap orchestration calls (e.g. polling
// a QR-handoff session) that aren't themselves a billable recommendation --
// otherwise a shopper's phone taking a few seconds to capture a photo would burn
// through the merchant's quota on poll requests alone.
async function identifyMerchantByApiKey(req, res, next) {
  try {
    const merchant = await resolveMerchant(req, res, { countUsage: false });
    if (!merchant) return undefined;
    req.merchant = merchant;
    return next();
  } catch (err) {
    return res.status(500).json({ message: 'API key validation failed', error: err.message });
  }
}

module.exports = { validateApiKey, identifyMerchantByApiKey };
