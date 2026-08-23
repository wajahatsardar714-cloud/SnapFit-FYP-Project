const Merchant = require('../models/Merchant');

const DAY_MS = 24 * 60 * 60 * 1000;

const PLANS = {
  free: { plan: 'free', name: 'Free', price: 0, requestsLimit: 50, chartsLimit: 1 },
  basic: { plan: 'basic', name: 'Basic', price: 29, requestsLimit: 500, chartsLimit: 5 },
  pro: { plan: 'pro', name: 'Pro', price: 99, requestsLimit: 5000, chartsLimit: null },
  enterprise: { plan: 'enterprise', name: 'Enterprise', price: null, requestsLimit: null, chartsLimit: null },
};

function getPlans(req, res) {
  return res.status(200).json({ plans: Object.values(PLANS) });
}

async function selectPlan(req, res) {
  const { plan } = req.body;

  if (!PLANS[plan]) {
    return res.status(400).json({ message: 'Invalid plan selected' });
  }

  try {
    const merchant = await Merchant.findById(req.merchant.merchantId);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    const now = new Date();
    merchant.subscription = {
      plan,
      status: 'active',
      startDate: now,
      endDate: new Date(now.getTime() + 30 * DAY_MS),
      requestsLimit: PLANS[plan].requestsLimit,
      requestsUsed: 0,
    };

    await merchant.save();

    return res.status(200).json({ subscription: merchant.subscription });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to select plan', error: err.message });
  }
}

async function getSubscriptionStatus(req, res) {
  try {
    const merchant = await Merchant.findById(req.merchant.merchantId);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    const { subscription } = merchant;
    const limit = subscription.requestsLimit;

    return res.status(200).json({
      subscription,
      usage: {
        requestsUsed: subscription.requestsUsed,
        requestsLimit: limit,
        requestsRemaining: limit == null ? null : Math.max(limit - subscription.requestsUsed, 0),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch subscription status', error: err.message });
  }
}

async function cancelSubscription(req, res) {
  try {
    const merchant = await Merchant.findById(req.merchant.merchantId);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    merchant.subscription.status = 'inactive';
    await merchant.save();

    return res.status(200).json({ subscription: merchant.subscription });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to cancel subscription', error: err.message });
  }
}

module.exports = { getPlans, selectPlan, getSubscriptionStatus, cancelSubscription, PLANS };
