const request = require('supertest');
const { setupTestEnv, tokenFor, createMerchant, createSuperAdmin } = require('./helpers/testApp');

setupTestEnv();
const app = require('../src/app');
const Announcement = require('../src/models/Announcement');
const Notification = require('../src/models/Notification');
const AuditLog = require('../src/models/AuditLog');
const { sendDueAnnouncements } = require('../src/services/announcements');

const auth = (account) => ({ Authorization: `Bearer ${tokenFor(account)}` });
const HOUR_MS = 60 * 60 * 1000;

const ANNOUNCEMENT_KEYS = [
  '_id',
  'title',
  'body',
  'link',
  'audience',
  'status',
  'scheduledAt',
  'sentAt',
  'cancelledAt',
  'recipientCount',
  'readCount',
  'createdAt',
  'createdBy',
].sort();

let admin;
let small;
let medium;
let inactive;
let suspended;
beforeEach(async () => {
  admin = await createSuperAdmin();
  small = await createMerchant({ subscription: { plan: 'small', status: 'active' } });
  medium = await createMerchant({ subscription: { plan: 'medium', status: 'active' } });
  // On the default plan but never subscribed.
  inactive = await createMerchant({ subscription: { plan: 'medium', status: 'inactive' } });
  suspended = await createMerchant({ status: 'suspended', subscription: { plan: 'medium', status: 'active' } });
});

const post = (body) => request(app).post('/api/admin/announcements').set(auth(admin)).send(body);
const recipientsOf = async (announcement) =>
  (await Notification.find({ announcement: announcement._id }).lean()).map((n) => String(n.recipient)).sort();
const ids = (...accounts) => accounts.map((a) => String(a._id)).sort();

describe('POST /api/admin/announcements', () => {
  it('sends to every merchant now (not the admin or suspended accounts)', async () => {
    const res = await post({ title: '  New feature  ', body: 'Try-on is faster.', audience: { type: 'all' } });

    expect(res.status).toBe(201);
    const { announcement } = res.body;
    expect(Object.keys(announcement).sort()).toEqual(ANNOUNCEMENT_KEYS);
    expect(announcement).toMatchObject({
      title: 'New feature',
      body: 'Try-on is faster.',
      link: null,
      audience: { type: 'all', plans: [], merchantIds: [] },
      status: 'sent',
      scheduledAt: null,
      recipientCount: 3,
      readCount: 0,
      createdBy: { email: admin.email },
    });
    expect(announcement.sentAt).toBeTruthy();
    expect(await recipientsOf(announcement)).toEqual(ids(small, medium, inactive));

    const [notification] = await Notification.find({ recipient: small._id }).lean();
    expect(notification).toMatchObject({
      type: 'announcement',
      title: 'New feature',
      body: 'Try-on is faster.',
      link: '/dashboard/notifications',
      important: true,
    });

    const [entry] = await AuditLog.find().lean();
    expect(entry).toMatchObject({
      action: 'announcement.send',
      targetType: 'announcement',
      targetLabel: 'New feature',
      details: { recipientCount: 3 },
    });
  });

  it('sends to merchants with an active subscription on the chosen plans', async () => {
    const res = await post({
      title: 'Medium news',
      body: 'Hello',
      link: '/dashboard/analytics',
      audience: { type: 'plan', plans: ['medium'] },
    });

    expect(res.status).toBe(201);
    expect(res.body.announcement.recipientCount).toBe(1);
    expect(await recipientsOf(res.body.announcement)).toEqual(ids(medium));
    const [notification] = await Notification.find({ recipient: medium._id }).lean();
    expect(notification.link).toBe('/dashboard/analytics');
  });

  it('sends to chosen merchants only', async () => {
    const res = await post({
      title: 'Just you',
      body: 'Hello',
      audience: { type: 'merchants', merchantIds: [String(small._id), String(suspended._id)] },
    });

    expect(res.status).toBe(201);
    expect(await recipientsOf(res.body.announcement)).toEqual(ids(small, suspended));
  });

  it('rejects merchant ids that are not merchants', async () => {
    const res = await post({
      title: 'Hi',
      body: 'Hello',
      audience: { type: 'merchants', merchantIds: [String(small._id), String(admin._id)] },
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'One or more merchants were not found' });
    expect(await Announcement.countDocuments()).toBe(0);
  });

  it('schedules for later without sending anything yet', async () => {
    const scheduledAt = new Date(Date.now() + 2 * HOUR_MS).toISOString();

    const res = await post({ title: 'Later', body: 'Soon', audience: { type: 'all' }, scheduledAt });

    expect(res.status).toBe(201);
    expect(res.body.announcement).toMatchObject({ status: 'scheduled', scheduledAt, sentAt: null, recipientCount: 0 });
    expect(await Notification.countDocuments()).toBe(0);
    const [entry] = await AuditLog.find().lean();
    expect(entry.action).toBe('announcement.schedule');

    expect(await sendDueAnnouncements(new Date())).toBe(0);
    expect(await sendDueAnnouncements(new Date(Date.now() + 3 * HOUR_MS))).toBe(1);
    expect(await Notification.countDocuments()).toBe(3);
    const stored = await Announcement.findById(res.body.announcement._id);
    expect(stored).toMatchObject({ status: 'sent', recipientCount: 3 });
    // Never twice.
    expect(await sendDueAnnouncements(new Date(Date.now() + 4 * HOUR_MS))).toBe(0);
    expect(await Notification.countDocuments()).toBe(3);
  });

  it.each([
    [{ title: '', body: 'b', audience: { type: 'all' } }, 'title must be 1 to 120 characters'],
    [{ title: 'x'.repeat(121), body: 'b', audience: { type: 'all' } }, 'title must be 1 to 120 characters'],
    [{ title: 't', body: 'x'.repeat(2001), audience: { type: 'all' } }, 'body must be 1 to 2000 characters'],
    [{ title: 't', body: 'b', link: 'https://evil.test', audience: { type: 'all' } }, 'link must be an in-app path starting with "/"'],
    [{ title: 't', body: 'b', link: '//evil.test', audience: { type: 'all' } }, 'link must be an in-app path starting with "/"'],
    [{ title: 't', body: 'b' }, 'audience is required'],
    [{ title: 't', body: 'b', audience: { type: 'everyone' } }, 'audience.type must be one of: all, plan, merchants'],
    [{ title: 't', body: 'b', audience: { type: 'plan', plans: [] } }, 'Choose at least one plan'],
    [{ title: 't', body: 'b', audience: { type: 'plan', plans: ['gold'] } }, 'plans must be from: small, medium, enterprise'],
    [{ title: 't', body: 'b', audience: { type: 'merchants' } }, 'Choose at least one merchant'],
    [{ title: 't', body: 'b', audience: { type: 'merchants', merchantIds: ['nope'] } }, 'merchantIds must be merchant ids'],
    [{ title: 't', body: 'b', audience: { type: 'all' }, scheduledAt: 'tomorrow' }, 'scheduledAt must be an ISO 8601 date'],
    [
      { title: 't', body: 'b', audience: { type: 'all' }, scheduledAt: '2020-01-01T00:00:00.000Z' },
      'scheduledAt must be in the future',
    ],
  ])('rejects %p', async (body, message) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message });
    expect(await Announcement.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('is for the super admin only', async () => {
    const res = await request(app)
      .post('/api/admin/announcements')
      .set(auth(small))
      .send({ title: 't', body: 'b', audience: { type: 'all' } });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/announcements', () => {
  it('lists newest first with read counts', async () => {
    const first = (await post({ title: 'First', body: 'b', audience: { type: 'all' } })).body.announcement;
    await post({ title: 'Second', body: 'b', audience: { type: 'plan', plans: ['small'] } });
    await Notification.updateOne({ announcement: first._id, recipient: medium._id }, { read: true });

    const res = await request(app).get('/api/admin/announcements').set(auth(admin));

    expect(res.status).toBe(200);
    expect(res.body.announcements.map((a) => a.title)).toEqual(['Second', 'First']);
    expect(res.body.announcements[1]).toMatchObject({ recipientCount: 3, readCount: 1, createdBy: { email: admin.email } });
  });
});

describe('POST /api/admin/announcements/:id/cancel', () => {
  it('cancels a scheduled announcement so it is never sent', async () => {
    const scheduledAt = new Date(Date.now() + HOUR_MS).toISOString();
    const { announcement } = (await post({ title: 'Later', body: 'b', audience: { type: 'all' }, scheduledAt })).body;

    const res = await request(app).post(`/api/admin/announcements/${announcement._id}/cancel`).set(auth(admin));

    expect(res.status).toBe(200);
    expect(res.body.announcement.status).toBe('cancelled');
    expect(await sendDueAnnouncements(new Date(Date.now() + 2 * HOUR_MS))).toBe(0);
    expect(await Notification.countDocuments()).toBe(0);
    const actions = (await AuditLog.find().sort({ createdAt: 1 }).lean()).map((e) => e.action);
    expect(actions).toEqual(['announcement.schedule', 'announcement.cancel']);

    const again = await request(app).post(`/api/admin/announcements/${announcement._id}/cancel`).set(auth(admin));
    expect(again.status).toBe(409);
  });

  it('409s for a sent one and 404s for an unknown one', async () => {
    const { announcement } = (await post({ title: 'Now', body: 'b', audience: { type: 'all' } })).body;

    expect((await request(app).post(`/api/admin/announcements/${announcement._id}/cancel`).set(auth(admin))).status).toBe(
      409
    );
    expect(
      (await request(app).post('/api/admin/announcements/64b000000000000000000000/cancel').set(auth(admin))).status
    ).toBe(404);
    expect((await request(app).post('/api/admin/announcements/nope/cancel').set(auth(admin))).status).toBe(404);
  });
});
