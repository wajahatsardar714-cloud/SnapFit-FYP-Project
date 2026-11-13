const request = require('supertest');
const { setupTestEnv, tokenFor, createMerchant, createSuperAdmin } = require('./helpers/testApp');

setupTestEnv();
const app = require('../src/app');
const Merchant = require('../src/models/Merchant');
const Notification = require('../src/models/Notification');
const Announcement = require('../src/models/Announcement');
const { runScheduledJobs, startScheduler } = require('../src/services/scheduler');

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date('2026-11-13T10:00:00Z');
const later = (ms) => new Date(NOW.getTime() + ms);

const typesOf = async (account) =>
  (await Notification.find({ recipient: account._id }).sort({ createdAt: 1, _id: 1 }).lean()).map((n) => n.type);

function endingIn(ms, overrides = {}) {
  return createMerchant({
    subscription: { plan: 'medium', status: 'active', startDate: later(ms - 30 * DAY_MS), endDate: later(ms) },
    ...overrides,
  });
}

describe('plan-ending reminders', () => {
  it('sends the 7-day reminder once, then the 1-day reminder once', async () => {
    const merchant = await endingIn(6 * DAY_MS);

    await runScheduledJobs(NOW);
    await runScheduledJobs(later(HOUR_MS));
    expect(await typesOf(merchant)).toEqual(['subscription.expiring_7d']);

    await runScheduledJobs(later(5 * DAY_MS + HOUR_MS));
    await runScheduledJobs(later(5 * DAY_MS + 2 * HOUR_MS));
    expect(await typesOf(merchant)).toEqual(['subscription.expiring_7d', 'subscription.expiring_1d']);

    const [weekNotice, dayNotice] = await Notification.find({ recipient: merchant._id }).sort({ createdAt: 1 }).lean();
    expect(weekNotice).toMatchObject({
      title: 'Your plan ends in 7 days',
      body: 'Your Medium plan ends on 19 Nov 2026. Renew it to keep SnapFit running on your store.',
      link: '/dashboard/subscription',
      important: true,
    });
    expect(dayNotice.title).toBe('Your plan ends tomorrow');
  });

  it('skips the 7-day reminder when the plan already ends within a day', async () => {
    const merchant = await endingIn(12 * HOUR_MS);

    await runScheduledJobs(NOW);
    await runScheduledJobs(later(HOUR_MS));

    expect(await typesOf(merchant)).toEqual(['subscription.expiring_1d']);
  });

  it('leaves plans far from their end, inactive plans and the super admin alone', async () => {
    const far = await endingIn(20 * DAY_MS);
    const cancelled = await createMerchant({
      subscription: { plan: 'small', status: 'inactive', endDate: later(3 * DAY_MS) },
    });
    const admin = await createSuperAdmin();

    await runScheduledJobs(NOW);

    expect(await typesOf(far)).toEqual([]);
    expect(await typesOf(cancelled)).toEqual([]);
    expect(await typesOf(admin)).toEqual([]);
  });

  it('reminds again when the super admin moves the end date', async () => {
    const admin = await createSuperAdmin();
    const merchant = await endingIn(6 * DAY_MS);
    await runScheduledJobs(NOW);

    const res = await request(app)
      .patch(`/api/admin/merchants/${merchant._id}/subscription`)
      .set({ Authorization: `Bearer ${tokenFor(admin)}` })
      .send({ endDate: later(5 * DAY_MS).toISOString() });
    expect(res.status).toBe(200);
    await runScheduledJobs(later(HOUR_MS));

    expect(await typesOf(merchant)).toEqual([
      'subscription.expiring_7d',
      'subscription.admin_updated',
      'subscription.expiring_7d',
    ]);
  });
});

describe('ending plans', () => {
  it('marks an ended active plan expired and tells the merchant once', async () => {
    const merchant = await endingIn(-HOUR_MS);

    const first = await runScheduledJobs(NOW);
    const second = await runScheduledJobs(later(HOUR_MS));

    expect(first.expired).toBe(1);
    expect(second.expired).toBe(0);
    expect((await Merchant.findById(merchant._id)).subscription.status).toBe('expired');
    const notifications = await Notification.find({ recipient: merchant._id }).lean();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      type: 'subscription.expired',
      title: 'Your plan has ended',
      link: '/dashboard/subscription/plans',
    });
  });

  it('leaves plans with no end date alone', async () => {
    const merchant = await createMerchant({ subscription: { plan: 'enterprise', status: 'active' } });

    await runScheduledJobs(NOW);

    expect((await Merchant.findById(merchant._id)).subscription.status).toBe('active');
    expect(await typesOf(merchant)).toEqual([]);
  });
});

describe('scheduled announcements', () => {
  it('sends those whose time has come', async () => {
    const admin = await createSuperAdmin();
    const merchant = await createMerchant();
    await Announcement.create({
      title: 'Due',
      body: 'Now',
      audience: { type: 'all' },
      status: 'scheduled',
      scheduledAt: later(-HOUR_MS),
      createdBy: admin._id,
    });
    await Announcement.create({
      title: 'Not yet',
      body: 'Later',
      audience: { type: 'all' },
      status: 'scheduled',
      scheduledAt: later(DAY_MS),
      createdBy: admin._id,
    });

    const result = await runScheduledJobs(NOW);

    expect(result.announcements).toBe(1);
    const [n] = await Notification.find({ recipient: merchant._id }).lean();
    expect(n).toMatchObject({ type: 'announcement', title: 'Due' });
    expect(await Announcement.countDocuments({ status: 'scheduled' })).toBe(1);
  });
});

describe('the timer', () => {
  it('never starts in tests', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(startScheduler()).toBeNull();
  });

  it('keeps running the other jobs when one fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Announcement, 'find').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const merchant = await endingIn(-HOUR_MS);

    const result = await runScheduledJobs(NOW);

    expect(result).toMatchObject({ expired: 1, announcements: 0 });
    expect(await typesOf(merchant)).toEqual(['subscription.expired']);
    expect(errorSpy).toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
