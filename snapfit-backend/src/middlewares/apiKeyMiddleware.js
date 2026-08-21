const Merchant = require('../models/Merchant');

async function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ message: 'No API key provided' });
  }

  try {
    const merchant = await Merchant.findOne({ apiKey });
    if (!merchant) {
      return res.status(401).json({ message: 'Invalid API key' });
    }

    const { subscription } = merchant;

    if (subscription.status !== 'active') {
      return res.status(403).json({ message: 'Subscription is not active' });
    }

    if (subscription.endDate && subscription.endDate.getTime() < Date.now()) {
      return res.status(403).json({ message: 'Subscription has expired' });
    }

    if (subscription.requestsLimit != null && subscription.requestsUsed >= subscription.requestsLimit) {
      return res.status(403).json({ message: 'Monthly request limit reached' });
    }

    subscription.requestsUsed += 1;
    await merchant.save();

    req.merchant = merchant;
    return next();
  } catch (err) {
    return res.status(500).json({ message: 'API key validation failed', error: err.message });
  }
}

module.exports = { validateApiKey };
