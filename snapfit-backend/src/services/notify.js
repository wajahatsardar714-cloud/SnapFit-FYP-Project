const Merchant = require('../models/Merchant');
const Notification = require('../models/Notification');
const { NOTIFICATION_TYPES, preferenceKey } = require('../config/notificationTypes');
const { buildMessage } = require('./notificationTemplates');
const { sendPush } = require('./push');

// Creating notifications. A notification is a side effect: these functions
// never throw, so a failed notification can never fail the action (sign-up,
// plan change, ...) that caused it -- errors are only logged.

function idOf(merchantOrId) {
  return merchantOrId?._id ?? merchantOrId;
}

// True when the account has turned this type off. Important types never are.
function isMuted(preferences, type) {
  if (NOTIFICATION_TYPES[type]?.important) return false;
  if (!preferences) return false;
  const key = preferenceKey(type);
  const value = preferences instanceof Map ? preferences.get(key) : preferences[key];
  return value === false;
}

// The title, body, link and importance of a notification of `type`, from the
// type's template and default link unless given.
function composeNotification(type, { title, body, link, data = {} } = {}) {
  const config = NOTIFICATION_TYPES[type];
  const message = buildMessage(type, data);
  return {
    type,
    title: title ?? message.title,
    body: body ?? message.body,
    link: link !== undefined ? link : config.link(data),
    important: config.important,
  };
}

function serializeNotification(notification) {
  return {
    _id: notification._id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link ?? null,
    important: Boolean(notification.important),
    read: Boolean(notification.read),
    readAt: notification.readAt ?? null,
    createdAt: notification.createdAt,
  };
}

async function pushIfEnabled(notification) {
  if (!NOTIFICATION_TYPES[notification.type].push) return;
  await sendPush(notification.recipient, {
    notificationId: notification._id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
  });
}

// Sends one notification to one account (a Merchant document or its id):
// saves it for the in-app list and pushes it to the account's phones when the
// type is a push type. Skipped when the account has muted the type. Resolves to
// the saved notification, or null when skipped or failed.
async function notify(merchantOrId, type, options = {}) {
  try {
    if (!NOTIFICATION_TYPES[type]) throw new Error(`Unknown notification type "${type}"`);
    const recipient = idOf(merchantOrId);
    if (!recipient) throw new Error('No recipient');

    if (!NOTIFICATION_TYPES[type].important) {
      const account = await Merchant.findById(recipient).select('notificationPreferences').lean();
      if (!account) return null;
      if (isMuted(account.notificationPreferences, type)) return null;
    }

    const notification = await Notification.create({ recipient, ...composeNotification(type, options) });
    await pushIfEnabled(notification);
    return notification;
  } catch (err) {
    console.error(`Notification "${type}" failed:`, err.message);
    return null;
  }
}

// Sends the same notification to many accounts at once (e.g. an announcement),
// leaving out those who muted the type. `extra` is stored on each one (e.g. the
// announcement id). Resolves to the number saved.
async function notifyMany(recipientIds, type, options = {}, extra = {}) {
  try {
    if (!NOTIFICATION_TYPES[type]) throw new Error(`Unknown notification type "${type}"`);
    let recipients = recipientIds.map(idOf);
    if (!NOTIFICATION_TYPES[type].important) {
      const accounts = await Merchant.find({ _id: { $in: recipients } }).select('notificationPreferences').lean();
      recipients = accounts.filter((a) => !isMuted(a.notificationPreferences, type)).map((a) => a._id);
    }
    if (recipients.length === 0) return 0;

    const message = composeNotification(type, options);
    const notifications = await Notification.insertMany(
      recipients.map((recipient) => ({ recipient, ...message, ...extra }))
    );
    for (const notification of notifications) {
      await pushIfEnabled(notification);
    }
    return notifications.length;
  } catch (err) {
    console.error(`Notification "${type}" to many accounts failed:`, err.message);
    return 0;
  }
}

// Sends a notification to every super admin account.
async function notifyAdmins(type, options = {}) {
  try {
    const admins = await Merchant.find({ role: 'superadmin' }).select('_id').lean();
    const sent = await Promise.all(admins.map((admin) => notify(admin._id, type, options)));
    return sent.filter(Boolean);
  } catch (err) {
    console.error(`Admin notification "${type}" failed:`, err.message);
    return [];
  }
}

module.exports = { notify, notifyMany, notifyAdmins, isMuted, composeNotification, serializeNotification };
