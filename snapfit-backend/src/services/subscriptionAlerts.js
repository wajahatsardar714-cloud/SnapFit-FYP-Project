const Merchant = require('../models/Merchant');
const { PLANS } = require('../config/plans');
const { notify, notifyAdmins } = require('./notify');

// One-off subscription reminders (usage 80% / 100%, plan ending soon). Each is
// sent at most once per billing period: its time is stored in
// subscription.alerts, and the flag is claimed in a single conditional update
// first, so two requests at the same moment can never both send it.

const USAGE_WARNING_PERCENT = 80;

// Sets subscription.alerts.<field> unless it is already set; true when this
// call set it. `filter` narrows which subscription may be claimed.
async function claimAlert(merchantId, field, now = new Date(), filter = {}) {
  const path = `subscription.alerts.${field}`;
  const result = await Merchant.updateOne({ _id: merchantId, [path]: null, ...filter }, { $set: { [path]: now } });
  return result.modifiedCount === 1;
}

function planName(subscription) {
  return PLANS[subscription?.plan]?.name || null;
}

function isWarningLevel(used, limit) {
  return used * 100 >= limit * USAGE_WARNING_PERCENT;
}

// After a billable request is counted: tells the merchant when they reach 80%
// and 100% of their monthly requests, and the super admin at 100%. Never
// throws.
async function checkUsageAlerts(merchant) {
  try {
    const { subscription } = merchant;
    const used = subscription.requestsUsed;
    const limit = subscription.requestsLimit;
    if (limit == null || limit <= 0) return;
    const alerts = subscription.alerts || {};
    const data = { used, limit, planName: planName(subscription) };

    if (used >= limit) {
      if (alerts.usage100At || !(await claimAlert(merchant._id, 'usage100At'))) return;
      // Reaching 100% at once also covers the 80% warning.
      await claimAlert(merchant._id, 'usage80At');
      await notify(merchant._id, 'usage.100', { data });
      await notifyAdmins('admin.merchant_limit_reached', {
        data: { ...data, merchantId: merchant._id, businessName: merchant.businessName, email: merchant.email },
      });
    } else if (isWarningLevel(used, limit)) {
      if (alerts.usage80At || !(await claimAlert(merchant._id, 'usage80At'))) return;
      await notify(merchant._id, 'usage.80', { data });
    }
  } catch (err) {
    console.error('Usage alert check failed:', err.message);
  }
}

// After an admin edits a subscription (on the document, before it is saved):
// clears the usage reminders the new usage/limit is no longer past, so they can
// be sent again, and the expiry reminders when the end date moved.
function refreshAlerts(subscription, { endDateChanged = false } = {}) {
  if (!subscription.alerts) return;
  const used = subscription.requestsUsed || 0;
  const limit = subscription.requestsLimit;
  const unlimited = limit == null;

  if (subscription.alerts.usage100At && (unlimited || used < limit)) subscription.alerts.usage100At = undefined;
  if (subscription.alerts.usage80At && (unlimited || !isWarningLevel(used, limit))) {
    subscription.alerts.usage80At = undefined;
  }
  if (endDateChanged) {
    subscription.alerts.expiring7dAt = undefined;
    subscription.alerts.expiring1dAt = undefined;
  }
}

module.exports = { claimAlert, checkUsageAlerts, refreshAlerts, planName, USAGE_WARNING_PERCENT };
