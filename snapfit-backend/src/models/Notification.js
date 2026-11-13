const mongoose = require('mongoose');

// Notifications are kept for 90 days, then MongoDB's TTL monitor deletes them.
const NOTIFICATION_TTL_SECONDS = 90 * 24 * 60 * 60;

// One in-app notification for one account (a merchant or the super admin).
// `type` is an id from config/notificationTypes; `link` is an in-app path.
const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: null },
    important: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    // Set on notifications created by an admin announcement, to count reads.
    announcement: { type: mongoose.Schema.Types.ObjectId, ref: 'Announcement' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_TTL_SECONDS });
notificationSchema.index({ announcement: 1 }, { sparse: true });

const Notification = mongoose.model('Notification', notificationSchema);
Notification.TTL_SECONDS = NOTIFICATION_TTL_SECONDS;

module.exports = Notification;
