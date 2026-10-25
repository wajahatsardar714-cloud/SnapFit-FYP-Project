// Subscription plans, in display order. Prices and limits come from the public
// GET /subscription/plans endpoint -- only the ids and how to show them live here.
export const PLANS = ['small', 'medium', 'enterprise'];

export const RECOMMENDED_PLAN = 'medium';

const PLAN_NAMES = { small: 'Small', medium: 'Medium', enterprise: 'Enterprise' };

export const PLAN_BADGE_VARIANT = { small: 'neutral', medium: 'info', enterprise: 'success' };

export function isPlanId(value) {
  return PLANS.includes(value);
}

// "medium" -> "Medium". An id this build doesn't know is still shown, capitalized.
export function formatPlanName(plan) {
  if (!plan) return 'None';
  return PLAN_NAMES[plan] || plan.charAt(0).toUpperCase() + plan.slice(1);
}

// A null price is a custom (contact us) plan.
export function formatPlanPrice(price) {
  return price == null ? 'Custom' : `$${price.toLocaleString()}/month`;
}

// A null limit means no cap.
export function formatLimit(limit) {
  return limit == null ? 'Unlimited' : limit.toLocaleString();
}

export function formatRequestsLimit(limit) {
  return limit == null ? 'Unlimited requests' : `${formatLimit(limit)} requests/month`;
}

export function formatChartsLimit(limit) {
  if (limit == null) return 'Unlimited size charts';
  return `${formatLimit(limit)} size chart${limit === 1 ? '' : 's'}`;
}

// Same rule the backend uses to unlock the merchant APIs: an active
// subscription whose end date (if any) is still ahead.
export function isSubscribed(merchant, now = new Date()) {
  const subscription = merchant?.subscription;
  if (subscription?.status !== 'active') return false;
  return !subscription.endDate || new Date(subscription.endDate) > now;
}
