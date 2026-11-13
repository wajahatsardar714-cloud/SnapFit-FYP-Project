// Every kind of notification SnapFit sends -- the one place their audience,
// importance and default link are set. Shared with the web and mobile apps
// through the API contract.
//   role       who receives it: 'merchant' or 'superadmin'
//   important  can't be muted in the notification settings
//   push       also sent as a phone push notification
//   label      the name shown in the notification settings
//   group      the settings section it is listed under
//   link(data) the in-app page it opens (null = none)
const NOTIFICATION_TYPES = {
  'account.welcome': {
    role: 'merchant',
    important: false,
    push: true,
    label: 'Welcome message',
    group: 'Account',
    link: () => '/dashboard/subscription/plans',
  },
  'account.password_changed': {
    role: 'merchant',
    important: true,
    push: true,
    label: 'Password changed',
    group: 'Account',
    link: () => '/dashboard/settings',
  },
  'account.password_reset_by_admin': {
    role: 'merchant',
    important: true,
    push: true,
    label: 'Password reset by SnapFit',
    group: 'Account',
    link: () => '/dashboard/settings',
  },
  'account.suspended': {
    role: 'merchant',
    important: true,
    push: true,
    label: 'Account suspended',
    group: 'Account',
    link: () => null,
  },
  'account.reactivated': {
    role: 'merchant',
    important: true,
    push: true,
    label: 'Account active again',
    group: 'Account',
    link: () => '/dashboard',
  },
  'security.api_key_regenerated': {
    role: 'merchant',
    important: true,
    push: true,
    label: 'New API key',
    group: 'Security',
    link: () => '/dashboard/api-key',
  },
  'subscription.activated': {
    role: 'merchant',
    important: true,
    push: true,
    label: 'Plan activated',
    group: 'Subscription',
    link: receiptLink,
  },
  'subscription.changed': {
    role: 'merchant',
    important: true,
    push: true,
    label: 'Plan changed',
    group: 'Subscription',
    link: receiptLink,
  },
  'subscription.cancelled': {
    role: 'merchant',
    important: true,
    push: true,
    label: 'Plan cancelled',
    group: 'Subscription',
    link: () => '/dashboard/subscription',
  },
  'subscription.expiring_7d': {
    role: 'merchant',
    important: true,
    push: true,
    label: 'Plan ends in 7 days',
    group: 'Subscription',
    link: () => '/dashboard/subscription',
  },
  'subscription.expiring_1d': {
    role: 'merchant',
    important: true,
    push: true,
    label: 'Plan ends tomorrow',
    group: 'Subscription',
    link: () => '/dashboard/subscription',
  },
  'subscription.expired': {
    role: 'merchant',
    important: true,
    push: true,
    label: 'Plan ended',
    group: 'Subscription',
    link: () => '/dashboard/subscription/plans',
  },
  'subscription.admin_updated': {
    role: 'merchant',
    important: true,
    push: true,
    label: 'Plan updated by SnapFit',
    group: 'Subscription',
    link: (data) => (data.receiptId ? `/dashboard/receipts/${data.receiptId}` : '/dashboard/subscription'),
  },
  'usage.80': {
    role: 'merchant',
    important: false,
    push: true,
    label: '80% of requests used',
    group: 'Usage',
    link: () => '/dashboard/analytics',
  },
  'usage.100': {
    role: 'merchant',
    important: true,
    push: true,
    label: 'All requests used',
    group: 'Usage',
    link: () => '/dashboard/subscription',
  },
  'usage.reset': {
    role: 'merchant',
    important: false,
    push: false,
    label: 'Request count reset',
    group: 'Usage',
    link: () => '/dashboard/analytics',
  },
  'product.tryon_ready': {
    role: 'merchant',
    important: false,
    push: false,
    label: 'Product ready for try-on',
    group: 'Products',
    link: () => '/dashboard/product-mapping',
  },
  announcement: {
    role: 'merchant',
    important: true,
    push: true,
    label: 'News from SnapFit',
    group: 'Announcements',
    link: (data) => data.link || '/dashboard/notifications',
  },
  'admin.merchant_signed_up': {
    role: 'superadmin',
    important: false,
    push: true,
    label: 'New merchant signed up',
    group: 'Merchants',
    link: merchantLink,
  },
  'admin.plan_selected': {
    role: 'superadmin',
    important: false,
    push: true,
    label: 'Merchant chose a plan',
    group: 'Merchants',
    link: merchantLink,
  },
  'admin.merchant_limit_reached': {
    role: 'superadmin',
    important: false,
    push: true,
    label: 'Merchant reached its request limit',
    group: 'Merchants',
    link: merchantLink,
  },
};

function receiptLink(data) {
  return data.receiptId ? `/dashboard/receipts/${data.receiptId}` : '/dashboard/receipts';
}

function merchantLink(data) {
  return data.merchantId ? `/admin/merchants/${data.merchantId}` : '/admin/merchants';
}

// The types an account with this role can receive, in display order.
function typesForRole(role) {
  return Object.keys(NOTIFICATION_TYPES).filter((type) => NOTIFICATION_TYPES[type].role === role);
}

// Preference map keys can't hold '.', so types are stored with ':' instead.
function preferenceKey(type) {
  return type.replace(/\./g, ':');
}

module.exports = { NOTIFICATION_TYPES, typesForRole, preferenceKey };
