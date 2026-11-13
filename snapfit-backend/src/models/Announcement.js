const mongoose = require('mongoose');
const { PLAN_IDS } = require('../config/plans');

const AUDIENCE_TYPES = ['all', 'plan', 'merchants'];

// A message from the super admin to merchants. Sent at once, or kept as
// `scheduled` until the scheduler sends it at `scheduledAt`.
const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 2000 },
    link: { type: String, default: null },
    audience: {
      type: { type: String, enum: AUDIENCE_TYPES, required: true },
      plans: [{ type: String, enum: PLAN_IDS }],
      merchantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Merchant' }],
    },
    status: { type: String, enum: ['scheduled', 'sent', 'cancelled'], required: true },
    scheduledAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    recipientCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true },
  },
  { timestamps: true }
);

announcementSchema.index({ createdAt: -1 });
announcementSchema.index({ status: 1, scheduledAt: 1 });

const Announcement = mongoose.model('Announcement', announcementSchema);
Announcement.AUDIENCE_TYPES = AUDIENCE_TYPES;

module.exports = Announcement;
