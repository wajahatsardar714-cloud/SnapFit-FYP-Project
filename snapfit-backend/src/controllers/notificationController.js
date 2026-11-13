const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Merchant = require('../models/Merchant');
const Notification = require('../models/Notification');
const { NOTIFICATION_TYPES, typesForRole, preferenceKey } = require('../config/notificationTypes');
const { isMuted, serializeNotification } = require('../services/notify');

// The signed-in account's own notifications (merchant or super admin) and its
// notification settings. Another account's notification is always a 404.

const NOT_FOUND = 'Notification not found';

function sendValidationError(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ message: errors.array()[0].msg });
  return true;
}

function ownFilter(req, extra = {}) {
  return { recipient: req.merchant.merchantId, ...extra };
}

function unreadCountFor(req) {
  return Notification.countDocuments(ownFilter(req, { read: false }));
}

async function listNotifications(req, res) {
  if (sendValidationError(req, res)) return undefined;
  const { page = 1, limit = 20, unread = false } = req.query;
  const filter = ownFilter(req, unread ? { read: false } : {});

  try {
    const [total, notifications, unreadCount] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      unreadCountFor(req),
    ]);

    return res.status(200).json({
      notifications: notifications.map(serializeNotification),
      unreadCount,
      page,
      limit,
      total,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch notifications', error: err.message });
  }
}

async function getUnreadCount(req, res) {
  try {
    return res.status(200).json({ unreadCount: await unreadCountFor(req) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to count notifications', error: err.message });
  }
}

async function markRead(req, res) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ message: NOT_FOUND });

  try {
    const existing = await Notification.findOne(ownFilter(req, { _id: req.params.id }));
    if (!existing) return res.status(404).json({ message: NOT_FOUND });

    // Reading it again keeps the first read time.
    if (!existing.read) {
      existing.read = true;
      existing.readAt = new Date();
      await existing.save();
    }

    return res.status(200).json({ notification: serializeNotification(existing) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update notification', error: err.message });
  }
}

async function markAllRead(req, res) {
  try {
    const result = await Notification.updateMany(ownFilter(req, { read: false }), {
      read: true,
      readAt: new Date(),
    });
    return res.status(200).json({ updated: result.modifiedCount });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update notifications', error: err.message });
  }
}

async function deleteNotification(req, res) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(404).json({ message: NOT_FOUND });

  try {
    const result = await Notification.deleteOne(ownFilter(req, { _id: req.params.id }));
    if (result.deletedCount === 0) return res.status(404).json({ message: NOT_FOUND });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete notification', error: err.message });
  }
}

// { preferences: { type: on? }, types: [{ type, label, group, important }] }
// for the types this account's role can receive.
function preferencesResponse(role, storedPreferences) {
  const types = typesForRole(role);
  return {
    preferences: Object.fromEntries(types.map((type) => [type, !isMuted(storedPreferences, type)])),
    types: types.map((type) => {
      const { label, group, important } = NOTIFICATION_TYPES[type];
      return { type, label, group, important };
    }),
  };
}

async function loadPreferences(req) {
  const account = await Merchant.findById(req.merchant.merchantId).select('notificationPreferences').lean();
  return account?.notificationPreferences;
}

async function getPreferences(req, res) {
  try {
    return res.status(200).json(preferencesResponse(req.merchant.role, await loadPreferences(req)));
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch notification settings', error: err.message });
  }
}

async function updatePreferences(req, res) {
  const { preferences } = req.body || {};
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    return res.status(400).json({ message: 'preferences must be an object of notification type to true or false' });
  }

  const allowed = new Set(typesForRole(req.merchant.role));
  const update = {};
  for (const [type, value] of Object.entries(preferences)) {
    if (!allowed.has(type)) {
      return res.status(400).json({ message: `Unknown notification type: ${type}` });
    }
    if (typeof value !== 'boolean') {
      return res.status(400).json({ message: `${type} must be true or false` });
    }
    if (NOTIFICATION_TYPES[type].important) {
      if (!value) return res.status(400).json({ message: `${type} is important and can't be turned off` });
    } else {
      update[`notificationPreferences.${preferenceKey(type)}`] = value;
    }
  }

  try {
    // updateOne, not save(): the super admin's unused subscription may hold a
    // plan id the schema no longer accepts.
    if (Object.keys(update).length) {
      await Merchant.updateOne({ _id: req.merchant.merchantId }, { $set: update });
    }
    return res.status(200).json(preferencesResponse(req.merchant.role, await loadPreferences(req)));
  } catch (err) {
    return res.status(500).json({ message: 'Failed to save notification settings', error: err.message });
  }
}

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
  getPreferences,
  updatePreferences,
};
