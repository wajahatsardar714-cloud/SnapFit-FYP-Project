const Merchant = require('../models/Merchant');
const Announcement = require('../models/Announcement');
const { notifyMany } = require('./notify');

// Delivering super admin announcements as notifications.

// Who an audience reaches:
//   all        every merchant account that is not suspended
//   plan       merchants with an active subscription on one of the plans
//   merchants  exactly the chosen merchant accounts
function audienceFilter(audience) {
  const { MERCHANTS_ONLY } = Merchant;
  if (audience.type === 'merchants') {
    return { ...MERCHANTS_ONLY, _id: { $in: audience.merchantIds || [] } };
  }
  const filter = { ...MERCHANTS_ONLY, status: { $ne: 'suspended' } };
  if (audience.type === 'plan') {
    filter['subscription.plan'] = { $in: audience.plans || [] };
    filter['subscription.status'] = 'active';
  }
  return filter;
}

// Sends the announcement to its audience now and records how many it reached.
// The caller has already marked it sent, so it can never go out twice.
async function deliverAnnouncement(announcement) {
  const recipients = await Merchant.find(audienceFilter(announcement.audience)).select('_id').lean();
  const recipientCount = await notifyMany(
    recipients.map((r) => r._id),
    'announcement',
    { title: announcement.title, body: announcement.body, data: { link: announcement.link } },
    { announcement: announcement._id }
  );
  announcement.recipientCount = recipientCount;
  await Announcement.updateOne({ _id: announcement._id }, { recipientCount });
  return recipientCount;
}

// Sends every scheduled announcement whose time has come. Each one is claimed
// (scheduled -> sent) in a single update first, so two runs never both send it.
async function sendDueAnnouncements(now = new Date()) {
  const due = await Announcement.find({ status: 'scheduled', scheduledAt: { $lte: now } }).select('_id').lean();
  let sent = 0;
  for (const { _id } of due) {
    const announcement = await Announcement.findOneAndUpdate(
      { _id, status: 'scheduled' },
      { status: 'sent', sentAt: now },
      { new: true }
    );
    if (announcement) {
      await deliverAnnouncement(announcement);
      sent += 1;
    }
  }
  return sent;
}

module.exports = { audienceFilter, deliverAnnouncement, sendDueAnnouncements };
