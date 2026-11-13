const { formatDate } = require('../utils/formatDate');

// The default title and body for each notification type, in short, plain
// English. `data` carries the details a message needs (plan name, dates,
// receipt number, ...); anything missing is simply left out.

function receiptSentence(data) {
  return data.receiptNumber ? ` Your receipt ${data.receiptNumber} is ready.` : '';
}

function untilSentence(data) {
  return data.endDate ? `Your subscription runs until ${formatDate(data.endDate)}.` : 'Your subscription is active.';
}

// 'Medium ' (with a trailing space) or '' when the plan is unknown.
function planWords(data) {
  return data.planName ? `${data.planName} ` : '';
}

function shopName(data) {
  return data.businessName || data.email || 'A merchant';
}

const TEMPLATES = {
  'account.welcome': () => ({
    title: 'Welcome to SnapFit',
    body: 'Your account is ready. Choose a plan to start using SnapFit on your store.',
  }),
  'account.password_changed': () => ({
    title: 'Your password was changed',
    body: 'If you did not do this, contact SnapFit support straight away.',
  }),
  'account.password_reset_by_admin': () => ({
    title: 'Your password was reset',
    body: 'The SnapFit team set a new password for your account. Sign in with it, then change it in Settings.',
  }),
  'account.suspended': (data) => ({
    title: 'Your account is suspended',
    body: data.reason
      ? `Reason: ${data.reason}. Contact SnapFit support for help.`
      : 'Contact SnapFit support for help.',
  }),
  'account.reactivated': () => ({
    title: 'Your account is active again',
    body: 'You can use SnapFit as normal.',
  }),
  'security.api_key_regenerated': (data) => ({
    title: 'Your API key was changed',
    body: `${data.byAdmin ? 'The SnapFit team made a new API key for you. ' : ''}Put the new key on your store, or the SnapFit widget will stop working.`,
  }),
  'subscription.activated': (data) => ({
    title: `Your ${planWords(data)}plan is active`,
    body: `${untilSentence(data)}${receiptSentence(data)}`,
  }),
  'subscription.changed': (data) => ({
    title: `You are now on the ${data.planName || 'new'} plan`,
    body: `${untilSentence(data)}${receiptSentence(data)}`,
  }),
  'subscription.cancelled': (data) => ({
    title: 'Your subscription is cancelled',
    body: `Your ${planWords(data)}plan has stopped. Choose a plan any time to start again.`,
  }),
  'subscription.expiring_7d': (data) => ({
    title: 'Your plan ends in 7 days',
    body: `Your ${planWords(data)}plan ends on ${formatDate(data.endDate)}. Renew it to keep SnapFit running on your store.`,
  }),
  'subscription.expiring_1d': (data) => ({
    title: 'Your plan ends tomorrow',
    body: `Your ${planWords(data)}plan ends on ${formatDate(data.endDate)}. Renew it to keep SnapFit running on your store.`,
  }),
  'subscription.expired': (data) => ({
    title: 'Your plan has ended',
    body: `Your ${planWords(data)}plan ended on ${formatDate(data.endDate)}. Choose a plan to turn SnapFit back on.`,
  }),
  'subscription.admin_updated': (data) => ({
    title: 'Your subscription was updated',
    body: `The SnapFit team changed your subscription${data.changes?.length ? `: ${data.changes.join(', ')}` : ''}.${receiptSentence(data)}`,
  }),
  'usage.80': (data) => ({
    title: 'You have used 80% of your requests',
    body: `You have used ${data.used} of ${data.limit} requests this month. Upgrade your plan if you need more.`,
  }),
  'usage.100': (data) => ({
    title: 'You have used all your requests',
    body: `You have used all ${data.limit} requests this month. The widget is paused until you upgrade or your plan renews.`,
  }),
  'usage.reset': () => ({
    title: 'Your request count was reset',
    body: 'Your monthly request count is back to 0.',
  }),
  'product.tryon_ready': (data) => ({
    title: `${data.productName || data.productId || 'Your product'} is ready for try-on`,
    body: 'Shoppers can now try it on with the SnapFit widget.',
  }),
  announcement: (data) => ({
    title: data.title || 'News from SnapFit',
    body: data.body || '',
  }),
  'admin.merchant_signed_up': (data) => ({
    title: 'New merchant signed up',
    body: `${shopName(data)}${data.businessName && data.email ? ` (${data.email})` : ''} created an account.`,
  }),
  'admin.plan_selected': (data) => ({
    title: `${shopName(data)} chose the ${planWords(data)}plan`,
    body: data.receiptNumber ? `Receipt ${data.receiptNumber} was issued.` : 'A new subscription started.',
  }),
  'admin.merchant_limit_reached': (data) => ({
    title: `${shopName(data)} reached its request limit`,
    body: `They have used all ${data.limit} requests${data.planName ? ` on the ${data.planName} plan` : ''} this month.`,
  }),
};

function buildMessage(type, data = {}) {
  const template = TEMPLATES[type];
  return template ? template(data) : { title: 'SnapFit', body: '' };
}

module.exports = { buildMessage, TEMPLATES };
