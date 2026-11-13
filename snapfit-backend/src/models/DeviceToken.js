const mongoose = require('mongoose');

// A phone's push (FCM) registration token. A token belongs to one account at a
// time: the latest account to register it on that phone.
const deviceTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true },
    merchant: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true, index: true },
    platform: { type: String, enum: ['android', 'ios'], default: 'android' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);
