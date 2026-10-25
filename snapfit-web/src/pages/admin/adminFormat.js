export const PLANS = ['free', 'basic', 'pro', 'enterprise'];
export const SUBSCRIPTION_STATUSES = ['active', 'inactive', 'expired'];
export const ACCOUNT_STATUSES = ['active', 'suspended'];

export const PLAN_BADGE_VARIANT = { free: 'neutral', basic: 'info', pro: 'success', enterprise: 'warning' };
export const ACCOUNT_STATUS_BADGE_VARIANT = { active: 'success', suspended: 'danger' };
export const SUBSCRIPTION_STATUS_BADGE_VARIANT = { active: 'success', inactive: 'neutral', expired: 'warning' };
export const RECOMMENDATION_STATUS_VARIANT = { success: 'success', low_confidence: 'warning', failed: 'danger' };

export const capitalize = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : '');

// "low_confidence" -> "Low confidence"
export const humanize = (value) => capitalize(String(value ?? '').replace(/_/g, ' '));

export const formatNumber = (value) => (value ?? 0).toLocaleString();

export const formatPercent = (ratio) => (ratio == null ? '—' : `${Math.round(ratio * 1000) / 10}%`);

export function formatDate(value) {
  return value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

export function formatDateTime(value) {
  return value
    ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';
}

export const formatShortDate = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// "1,240 / 5,000", or "1,240 / Unlimited" when there is no cap (null limit).
export function formatUsage(subscription) {
  const used = formatNumber(subscription?.requestsUsed);
  const limit = subscription?.requestsLimit;
  return `${used} / ${limit == null ? 'Unlimited' : formatNumber(limit)}`;
}

// Audit actions are machine names ("merchant.suspend", "update_subscription",
// "apiKeyRegenerated"); show them as words: "Merchant suspend", ...
export function formatAction(action) {
  return capitalize(
    String(action ?? '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[._-]+/g, ' ')
      .trim()
      .toLowerCase()
  );
}
