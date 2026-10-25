// The subscription plans -- the one place their prices and limits are set. A
// null price is quoted per merchant; a null limit is unlimited.
const PLANS = {
  small: { plan: 'small', name: 'Small', price: 29, requestsLimit: 500, chartsLimit: 5 },
  medium: { plan: 'medium', name: 'Medium', price: 99, requestsLimit: 5000, chartsLimit: null },
  enterprise: { plan: 'enterprise', name: 'Enterprise', price: null, requestsLimit: null, chartsLimit: null },
};

const PLAN_IDS = Object.keys(PLANS);

// The plan a new account starts on, inactive until the merchant subscribes.
const DEFAULT_PLAN = 'small';

module.exports = { PLANS, PLAN_IDS, DEFAULT_PLAN };
