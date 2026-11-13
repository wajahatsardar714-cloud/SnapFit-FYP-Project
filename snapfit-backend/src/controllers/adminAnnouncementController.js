const mongoose = require('mongoose');
const Merchant = require('../models/Merchant');
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { deliverAnnouncement } = require('../services/announcements');
const { sendValidationError } = require('./adminMerchantController');

// Super admin announcements: a message to all merchants, the merchants on some
// plans, or chosen merchants -- sent now or at a scheduled time.

const NOT_FOUND = 'Announcement not found';

function recordAudit(req, action, announcement, details) {
  return AuditLog.create({
    adminId: req.merchant.merchantId,
    adminEmail: req.merchant.email,
    action,
    targetType: 'announcement',
    targetId: announcement._id,
    targetLabel: announcement.title,
    details,
  });
}

// { announcementId -> notifications read }, for the given announcements.
async function readCounts(ids) {
  const rows = await Notification.aggregate([
    { $match: { announcement: { $in: ids }, read: true } },
    { $group: { _id: '$announcement', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

function audienceJson(audience) {
  return {
    type: audience.type,
    plans: audience.plans || [],
    merchantIds: (audience.merchantIds || []).map(String),
  };
}

async function serializeAnnouncements(announcements) {
  const counts = await readCounts(announcements.map((a) => a._id));
  return announcements.map((a) => ({
    _id: a._id,
    title: a.title,
    body: a.body,
    link: a.link ?? null,
    audience: audienceJson(a.audience),
    status: a.status,
    scheduledAt: a.scheduledAt ?? null,
    sentAt: a.sentAt ?? null,
    cancelledAt: a.cancelledAt ?? null,
    recipientCount: a.recipientCount || 0,
    readCount: counts.get(String(a._id)) || 0,
    createdAt: a.createdAt,
    createdBy: { email: a.createdBy?.email ?? null },
  }));
}

async function serializeAnnouncement(announcement) {
  await announcement.populate('createdBy', 'email');
  const [json] = await serializeAnnouncements([announcement]);
  return json;
}

async function createAnnouncement(req, res) {
  if (sendValidationError(req, res)) return undefined;
  const { title, body, link, audience, scheduledAt } = req.body;

  const cleanAudience = { type: audience.type };
  if (audience.type === 'plan') cleanAudience.plans = [...new Set(audience.plans)];
  if (audience.type === 'merchants') cleanAudience.merchantIds = [...new Set(audience.merchantIds.map(String))];

  try {
    if (audience.type === 'merchants') {
      const found = await Merchant.countDocuments({
        _id: { $in: cleanAudience.merchantIds.map((id) => new mongoose.Types.ObjectId(id)) },
        ...Merchant.MERCHANTS_ONLY,
      });
      if (found !== cleanAudience.merchantIds.length) {
        return res.status(400).json({ message: 'One or more merchants were not found' });
      }
    }

    const now = new Date();
    const scheduled = Boolean(scheduledAt);
    const announcement = await Announcement.create({
      title,
      body,
      link: link || null,
      audience: cleanAudience,
      status: scheduled ? 'scheduled' : 'sent',
      scheduledAt: scheduled ? new Date(scheduledAt) : null,
      sentAt: scheduled ? null : now,
      createdBy: req.merchant.merchantId,
    });

    if (!scheduled) await deliverAnnouncement(announcement);

    await recordAudit(req, scheduled ? 'announcement.schedule' : 'announcement.send', announcement, {
      audience: audienceJson(cleanAudience),
      ...(scheduled ? { scheduledAt: announcement.scheduledAt } : { recipientCount: announcement.recipientCount }),
    });

    return res.status(201).json({ announcement: await serializeAnnouncement(announcement) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create announcement', error: err.message });
  }
}

async function listAnnouncements(req, res) {
  try {
    const announcements = await Announcement.find()
      .sort({ createdAt: -1, _id: -1 })
      .populate('createdBy', 'email')
      .lean();
    return res.status(200).json({ announcements: await serializeAnnouncements(announcements) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch announcements', error: err.message });
  }
}

async function cancelAnnouncement(req, res) {
  const { announcementId } = req.params;
  if (!mongoose.isObjectIdOrHexString(announcementId)) return res.status(404).json({ message: NOT_FOUND });

  try {
    const announcement = await Announcement.findOneAndUpdate(
      { _id: announcementId, status: 'scheduled' },
      { status: 'cancelled', cancelledAt: new Date() },
      { new: true }
    );
    if (!announcement) {
      const exists = await Announcement.exists({ _id: announcementId });
      if (!exists) return res.status(404).json({ message: NOT_FOUND });
      return res.status(409).json({ message: 'Only a scheduled announcement can be cancelled' });
    }

    await recordAudit(req, 'announcement.cancel', announcement, { scheduledAt: announcement.scheduledAt });

    return res.status(200).json({ announcement: await serializeAnnouncement(announcement) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to cancel announcement', error: err.message });
  }
}

module.exports = { createAnnouncement, listAnnouncements, cancelAnnouncement };
