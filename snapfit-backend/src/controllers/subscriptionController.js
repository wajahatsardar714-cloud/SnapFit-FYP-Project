const Merchant = require('../models/Merchant');
const { PLANS } = require('../config/plans');
const { isSubscriptionActive } = require('../middlewares/subscriptionMiddleware');
const { issueReceiptSafely } = require('../services/receipts');
const { notify, notifyAdmins } = require('../services/notify');

const DAY_MS = 24 * 60 * 60 * 1000;

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

    // Choosing a plan while one is running is a change; otherwise a new start.
    const wasActive = isSubscriptionActive(merchant.subscription);
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

    const receipt = await issueReceiptSafely(merchant, wasActive ? 'plan_changed' : 'plan_selected');
    const data = {
      planName: PLANS[plan].name,
      endDate: merchant.subscription.endDate,
      receiptId: receipt?._id,
      receiptNumber: receipt?.number,
    };
    await Promise.all([
      notify(merchant, wasActive ? 'subscription.changed' : 'subscription.activated', { data }),
      notifyAdmins('admin.plan_selected', {
        data: { ...data, merchantId: merchant._id, businessName: merchant.businessName, email: merchant.email },
      }),
    ]);

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
    await notify(merchant, 'subscription.cancelled', { data: { planName: PLANS[merchant.subscription.plan]?.name } });

    return res.status(200).json({ subscription: merchant.subscription });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to cancel subscription', error: err.message });
  }
}

module.exports = { getPlans, selectPlan, getSubscriptionStatus, cancelSubscription };
