const bcrypt = require('bcryptjs');
const express = require('express');
const request = require('supertest');
const { setupTestEnv, tokenFor, createMerchant, createSuperAdmin, createChart } = require('./helpers/testApp');

setupTestEnv({ replSet: true });
const app = require('../src/app');
const Merchant = require('../src/models/Merchant');
const Notification = require('../src/models/Notification');
const DeviceToken = require('../src/models/DeviceToken');
const Receipt = require('../src/models/Receipt');
const ProductMapping = require('../src/models/ProductMapping');
const { validateApiKey } = require('../src/middlewares/apiKeyMiddleware');
const { notify } = require('../src/services/notify');
const { NOTIFICATION_TYPES, typesForRole } = require('../src/config/notificationTypes');

const auth = (account) => ({ Authorization: `Bearer ${tokenFor(account)}` });
const DAY_MS = 24 * 60 * 60 * 1000;

const notificationsOf = (account) => Notification.find({ recipient: account._id }).sort({ createdAt: 1, _id: 1 }).lean();
const typesOf = async (account) => (await notificationsOf(account)).map((n) => n.type);

const ANCHORS = {
  shoulderLeft: { x: 0.3, y: 0.2 },
  shoulderRight: { x: 0.7, y: 0.2 },
  hipLeft: { x: 0.3, y: 0.7 },
  hipRight: { x: 0.7, y: 0.7 },
};

const NOTIFICATION_KEYS = ['_id', 'type', 'title', 'body', 'link', 'important', 'read', 'readAt', 'createdAt'].sort();

let errorSpy;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
  jest.restoreAllMocks();
});

describe('notification type table', () => {
  it('matches the contract: roles, importance, push and links', () => {
    expect(typesForRole('merchant')).toHaveLength(18);
    expect(typesForRole('superadmin')).toEqual([
      'admin.merchant_signed_up',
      'admin.plan_selected',
      'admin.merchant_limit_reached',
    ]);
    const notImportant = Object.keys(NOTIFICATION_TYPES).filter((t) => !NOTIFICATION_TYPES[t].important);
    expect(notImportant.sort()).toEqual(
      [
        'account.welcome',
        'usage.80',
        'usage.reset',
        'product.tryon_ready',
        'admin.merchant_signed_up',
        'admin.plan_selected',
        'admin.merchant_limit_reached',
      ].sort()
    );
    const noPush = Object.keys(NOTIFICATION_TYPES).filter((t) => !NOTIFICATION_TYPES[t].push);
    expect(noPush.sort()).toEqual(['product.tryon_ready', 'usage.reset']);
    expect(NOTIFICATION_TYPES['account.suspended'].link({})).toBeNull();
    expect(NOTIFICATION_TYPES['subscription.activated'].link({ receiptId: 'r1' })).toBe('/dashboard/receipts/r1');
    expect(NOTIFICATION_TYPES.announcement.link({})).toBe('/dashboard/notifications');
    expect(NOTIFICATION_TYPES['admin.plan_selected'].link({ merchantId: 'm1' })).toBe('/admin/merchants/m1');
  });
});

describe('GET /api/notifications', () => {
  it('lists only the caller’s own, newest first, with paging and the unread count', async () => {
    const merchant = await createMerchant();
    const other = await createMerchant();
    for (let i = 1; i <= 3; i += 1) {
      await Notification.create({
        recipient: merchant._id,
        type: 'usage.reset',
        title: `N${i}`,
        createdAt: new Date(Date.now() - (10 - i) * 1000),
        read: i === 1,
      });
    }
    await Notification.create({ recipient: other._id, type: 'usage.reset', title: 'Other' });

    const res = await request(app).get('/api/notifications?page=1&limit=2').set(auth(merchant));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ unreadCount: 2, page: 1, limit: 2, total: 3 });
    expect(res.body.notifications.map((n) => n.title)).toEqual(['N3', 'N2']);
    expect(Object.keys(res.body.notifications[0]).sort()).toEqual(NOTIFICATION_KEYS);

    const unread = await request(app).get('/api/notifications?unread=true').set(auth(merchant));
    expect(unread.body.notifications.map((n) => n.title)).toEqual(['N3', 'N2']);
    expect(unread.body.total).toBe(2);

    const count = await request(app).get('/api/notifications/unread-count').set(auth(merchant));
    expect(count.body).toEqual({ unreadCount: 2 });
  });

  it('works for the super admin too, and needs a token', async () => {
    const admin = await createSuperAdmin();
    await Notification.create({ recipient: admin._id, type: 'admin.merchant_signed_up', title: 'Hi' });

    const res = await request(app).get('/api/notifications').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });

  it('rejects a bad limit', async () => {
    const merchant = await createMerchant();
    const res = await request(app).get('/api/notifications?limit=500').set(auth(merchant));
    expect(res.status).toBe(400);
  });
});

describe('reading and deleting notifications', () => {
  let merchant;
  let mine;
  let theirs;
  beforeEach(async () => {
    merchant = await createMerchant();
    const other = await createMerchant();
    mine = await Notification.create({ recipient: merchant._id, type: 'usage.reset', title: 'Mine' });
    await Notification.create({ recipient: merchant._id, type: 'usage.reset', title: 'Mine 2' });
    theirs = await Notification.create({ recipient: other._id, type: 'usage.reset', title: 'Theirs' });
  });

  it('marks one as read, keeping the first read time', async () => {
    const res = await request(app).patch(`/api/notifications/${mine._id}/read`).set(auth(merchant));

    expect(res.status).toBe(200);
    expect(res.body.notification).toMatchObject({ _id: String(mine._id), read: true });
    const firstReadAt = res.body.notification.readAt;
    expect(firstReadAt).toBeTruthy();
    const again = await request(app).patch(`/api/notifications/${mine._id}/read`).set(auth(merchant));
    expect(again.body.notification.readAt).toBe(firstReadAt);
  });

  it("404s for someone else's notification or a bad id", async () => {
    expect((await request(app).patch(`/api/notifications/${theirs._id}/read`).set(auth(merchant))).status).toBe(404);
    expect((await request(app).patch('/api/notifications/nope/read').set(auth(merchant))).status).toBe(404);
    expect((await request(app).delete(`/api/notifications/${theirs._id}`).set(auth(merchant))).status).toBe(404);
    expect((await Notification.findById(theirs._id)).read).toBe(false);
  });

  it('marks all of my own as read', async () => {
    const res = await request(app).post('/api/notifications/read-all').set(auth(merchant));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 2 });
    expect((await Notification.findById(theirs._id)).read).toBe(false);
  });

  it('deletes my own', async () => {
    const res = await request(app).delete(`/api/notifications/${mine._id}`).set(auth(merchant));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(await Notification.findById(mine._id)).toBeNull();
  });
});

describe('notification preferences', () => {
  it('lists the merchant types, all on by default, important ones flagged', async () => {
    const merchant = await createMerchant();

    const res = await request(app).get('/api/notifications/preferences').set(auth(merchant));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.preferences)).toEqual(typesForRole('merchant'));
    expect(Object.values(res.body.preferences).every((on) => on === true)).toBe(true);
    expect(res.body.types.find((t) => t.type === 'usage.80')).toEqual({
      type: 'usage.80',
      label: '80% of requests used',
      group: 'Usage',
      important: false,
    });
    expect(res.body.types.find((t) => t.type === 'usage.100').important).toBe(true);
  });

  it('lists only the admin types for the super admin, and saves its choices', async () => {
    const admin = await createSuperAdmin();

    const res = await request(app)
      .put('/api/notifications/preferences')
      .set(auth(admin))
      .send({ preferences: { 'admin.plan_selected': false } });

    expect(res.status).toBe(200);
    expect(res.body.preferences).toEqual({
      'admin.merchant_signed_up': true,
      'admin.plan_selected': false,
      'admin.merchant_limit_reached': true,
    });
    const bad = await request(app)
      .put('/api/notifications/preferences')
      .set(auth(admin))
      .send({ preferences: { 'usage.80': false } });
    expect(bad.status).toBe(400);
  });

  it('mutes a non-important type and turns it back on', async () => {
    const merchant = await createMerchant();
    const put = (preferences) =>
      request(app).put('/api/notifications/preferences').set(auth(merchant)).send({ preferences });

    const off = await put({ 'usage.80': false, 'usage.100': true });
    expect(off.status).toBe(200);
    expect(off.body.preferences['usage.80']).toBe(false);
    expect(off.body.preferences['usage.100']).toBe(true);

    expect(await notify(merchant, 'usage.80', { data: { used: 8, limit: 10 } })).toBeNull();
    expect(await notify(merchant, 'usage.100', { data: { limit: 10 } })).not.toBeNull();

    const on = await put({ 'usage.80': true });
    expect(on.body.preferences['usage.80']).toBe(true);
    expect(await notify(merchant, 'usage.80', { data: { used: 8, limit: 10 } })).not.toBeNull();
    expect(await typesOf(merchant)).toEqual(['usage.100', 'usage.80']);
  });

  it.each([
    [{ 'usage.100': false }, 'usage.100 is important and can\'t be turned off'],
    [{ 'not.a.type': false }, 'Unknown notification type: not.a.type'],
    [{ 'usage.80': 'no' }, 'usage.80 must be true or false'],
  ])('rejects %p', async (preferences, message) => {
    const merchant = await createMerchant();

    const res = await request(app).put('/api/notifications/preferences').set(auth(merchant)).send({ preferences });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message });
  });

  it('rejects a missing preferences object', async () => {
    const merchant = await createMerchant();
    const res = await request(app).put('/api/notifications/preferences').set(auth(merchant)).send({});
    expect(res.status).toBe(400);
  });

  it('can never mute an important type, even if one was stored', async () => {
    const merchant = await createMerchant({ notificationPreferences: { 'usage:100': false } });

    expect(await notify(merchant, 'usage.100', { data: { limit: 10 } })).not.toBeNull();
  });
});

describe('POST /api/devices and DELETE /api/devices/:token', () => {
  it('registers a token, moves it to the latest account, and removes it', async () => {
    const first = await createMerchant();
    const second = await createMerchant();

    const res = await request(app).post('/api/devices').set(auth(first)).send({ token: 'tok-1', platform: 'android' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    await request(app).post('/api/devices').set(auth(first)).send({ token: 'tok-1', platform: 'android' });
    expect(await DeviceToken.countDocuments()).toBe(1);

    await request(app).post('/api/devices').set(auth(second)).send({ token: 'tok-1', platform: 'android' });
    expect(String((await DeviceToken.findOne({ token: 'tok-1' })).merchant)).toBe(String(second._id));

    // The old account can't remove a token that is no longer theirs.
    await request(app).delete('/api/devices/tok-1').set(auth(first));
    expect(await DeviceToken.countDocuments()).toBe(1);
    const del = await request(app).delete('/api/devices/tok-1').set(auth(second));
    expect(del.body).toEqual({ success: true });
    expect(await DeviceToken.countDocuments()).toBe(0);
  });

  it('works for the super admin, and validates the body', async () => {
    const admin = await createSuperAdmin();
    expect((await request(app).post('/api/devices').set(auth(admin)).send({ token: 'a' })).status).toBe(200);
    expect((await request(app).post('/api/devices').set(auth(admin)).send({})).status).toBe(400);
    expect((await request(app).post('/api/devices').set(auth(admin)).send({ token: 'b', platform: 'nokia' })).status).toBe(
      400
    );
    expect((await request(app).post('/api/devices').send({ token: 'c' })).status).toBe(401);
  });
});

describe('accounts without an active subscription', () => {
  it.each(['inactive', 'expired'])(
    'a %s merchant can still use notifications, devices and receipts',
    async (status) => {
      const merchant = await createMerchant({ subscription: { plan: 'small', status, requestsUsed: 0 } });
      const n = await notify(merchant, 'subscription.cancelled');
      const { issueReceipt } = require('../src/services/receipts');
      const receipt = await issueReceipt(merchant, 'plan_selected');
      const a = auth(merchant);

      expect((await request(app).get('/api/notifications').set(a)).status).toBe(200);
      expect((await request(app).get('/api/notifications/unread-count').set(a)).body).toEqual({ unreadCount: 1 });
      expect((await request(app).patch(`/api/notifications/${n._id}/read`).set(a)).status).toBe(200);
      expect((await request(app).post('/api/notifications/read-all').set(a)).status).toBe(200);
      expect((await request(app).get('/api/notifications/preferences').set(a)).status).toBe(200);
      expect(
        (await request(app).put('/api/notifications/preferences').set(a).send({ preferences: { 'usage.80': false } }))
          .status
      ).toBe(200);
      expect((await request(app).delete(`/api/notifications/${n._id}`).set(a)).status).toBe(200);
      expect((await request(app).post('/api/devices').set(a).send({ token: 'lapsed-phone' })).status).toBe(200);
      expect((await request(app).delete('/api/devices/lapsed-phone').set(a)).status).toBe(200);
      expect((await request(app).get('/api/receipts').set(a)).body.receipts).toHaveLength(1);
      expect((await request(app).get(`/api/receipts/${receipt._id}`).set(a)).status).toBe(200);
      const pdf = await request(app).get(`/api/receipts/${receipt._id}/pdf`).set(a);
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
    }
  );
});

describe('events that send notifications', () => {
  let admin;
  beforeEach(async () => {
    admin = await createSuperAdmin();
  });
  const adminCall = (method, url, body) => request(app)[method](`/api/admin${url}`).set(auth(admin)).send(body);

  it('sign-up: a welcome for the merchant, a heads-up for the super admin', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Ali',
      email: 'ali@shop.dev',
      password: 'longenough1',
      businessName: 'Ali Clothing',
    });

    expect(res.status).toBe(201);
    const merchant = await Merchant.findOne({ email: 'ali@shop.dev' });
    const [welcome] = await notificationsOf(merchant);
    expect(welcome).toMatchObject({
      type: 'account.welcome',
      title: 'Welcome to SnapFit',
      link: '/dashboard/subscription/plans',
      important: false,
      read: false,
    });
    const [signedUp] = await notificationsOf(admin);
    expect(signedUp).toMatchObject({
      type: 'admin.merchant_signed_up',
      link: `/admin/merchants/${merchant._id}`,
    });
    expect(signedUp.body).toContain('Ali Clothing');
  });

  it("a failed notification never fails the action that caused it", async () => {
    jest.spyOn(Notification, 'create').mockRejectedValue(new Error('database down'));

    const res = await request(app).post('/api/auth/register').send({
      name: 'Bo',
      email: 'bo@shop.dev',
      password: 'longenough1',
      businessName: 'Bo Shop',
    });

    expect(res.status).toBe(201);
    expect(await Merchant.countDocuments({ email: 'bo@shop.dev' })).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('a failed notification never fails a plan change either', async () => {
    jest.spyOn(Notification, 'create').mockRejectedValue(new Error('database down'));
    const merchant = await createMerchant({ subscription: { plan: 'small', status: 'inactive' } });

    const res = await request(app).post('/api/subscription/select').set(auth(merchant)).send({ plan: 'medium' });

    expect(res.status).toBe(200);
    expect(res.body.subscription.status).toBe('active');
  });

  it('merchant password change', async () => {
    const merchant = await createMerchant({ password: await bcrypt.hash('old-password', 4) });

    const res = await request(app)
      .put('/api/merchant/password')
      .set(auth(merchant))
      .send({ currentPassword: 'old-password', newPassword: 'new-password' });

    expect(res.status).toBe(200);
    const [n] = await notificationsOf(merchant);
    expect(n).toMatchObject({ type: 'account.password_changed', important: true, link: '/dashboard/settings' });
  });

  it('admin password reset, suspend and reactivate', async () => {
    const merchant = await createMerchant();

    await adminCall('post', `/merchants/${merchant._id}/reset-password`, { password: 'brand-new-pass' });
    await adminCall('patch', `/merchants/${merchant._id}/status`, { status: 'suspended', reason: 'Spam' });
    await adminCall('patch', `/merchants/${merchant._id}/status`, { status: 'suspended' });
    await adminCall('patch', `/merchants/${merchant._id}/status`, { status: 'active' });

    const list = await notificationsOf(merchant);
    expect(list.map((n) => n.type)).toEqual([
      'account.password_reset_by_admin',
      'account.suspended',
      'account.reactivated',
    ]);
    expect(list[1]).toMatchObject({ link: null, body: 'Reason: Spam. Contact SnapFit support for help.' });
    expect(list[2].link).toBe('/dashboard');
  });

  it('API key regenerated by the merchant or by the super admin', async () => {
    const merchant = await createMerchant({ subscription: { plan: 'small', status: 'active', requestsLimit: 500 } });

    expect((await request(app).post('/api/merchant/api-key/regenerate').set(auth(merchant))).status).toBe(200);
    expect((await adminCall('post', `/merchants/${merchant._id}/api-key`)).status).toBe(200);

    const list = await notificationsOf(merchant);
    expect(list.map((n) => n.type)).toEqual(['security.api_key_regenerated', 'security.api_key_regenerated']);
    expect(list[0].link).toBe('/dashboard/api-key');
    expect(list[1].body).toContain('The SnapFit team');
  });

  it('choosing a plan: activated + receipt for the merchant, plan_selected for the admin', async () => {
    const merchant = await createMerchant({ subscription: { plan: 'small', status: 'inactive' } });

    const res = await request(app).post('/api/subscription/select').set(auth(merchant)).send({ plan: 'medium' });

    expect(res.status).toBe(200);
    const receipt = await Receipt.findOne({ merchantId: merchant._id });
    expect(receipt).toMatchObject({ reason: 'plan_selected', plan: 'medium', amount: 99 });
    const [activated] = await notificationsOf(merchant);
    expect(activated).toMatchObject({
      type: 'subscription.activated',
      title: 'Your Medium plan is active',
      link: `/dashboard/receipts/${receipt._id}`,
    });
    expect(activated.body).toContain(`Your receipt ${receipt.number} is ready.`);
    const [selected] = await notificationsOf(admin);
    expect(selected).toMatchObject({ type: 'admin.plan_selected', link: `/admin/merchants/${merchant._id}` });
  });

  it('choosing a plan while one is running: changed, with a plan_changed receipt', async () => {
    const merchant = await createMerchant({
      subscription: { plan: 'small', status: 'active', endDate: new Date(Date.now() + 5 * DAY_MS) },
    });

    await request(app).post('/api/subscription/select').set(auth(merchant)).send({ plan: 'enterprise' });

    const receipt = await Receipt.findOne({ merchantId: merchant._id });
    expect(receipt).toMatchObject({ reason: 'plan_changed', amount: 0, priceNote: 'Custom price as agreed' });
    expect(await typesOf(merchant)).toEqual(['subscription.changed']);
  });

  it('cancelling a plan', async () => {
    const merchant = await createMerchant();

    await request(app).post('/api/subscription/cancel').set(auth(merchant));

    const [n] = await notificationsOf(merchant);
    expect(n).toMatchObject({ type: 'subscription.cancelled', link: '/dashboard/subscription' });
  });

  it('admin subscription edit: admin_updated (+ receipt on a plan change) and usage.reset', async () => {
    const merchant = await createMerchant({
      subscription: { plan: 'small', status: 'active', requestsLimit: 500, requestsUsed: 42 },
    });

    await adminCall('patch', `/merchants/${merchant._id}/subscription`, { requestsLimit: 900, resetUsage: true });
    await adminCall('patch', `/merchants/${merchant._id}/subscription`, { plan: 'medium' });

    const list = await notificationsOf(merchant);
    expect(list.map((n) => n.type)).toEqual(['subscription.admin_updated', 'usage.reset', 'subscription.admin_updated']);
    expect(list[0]).toMatchObject({ link: '/dashboard/subscription' });
    expect(list[0].body).toBe(
      'The SnapFit team changed your subscription: your monthly request limit is now 900, your request count was reset to 0.'
    );
    const receipt = await Receipt.findOne({ merchantId: merchant._id });
    expect(receipt).toMatchObject({ reason: 'admin_change', plan: 'medium' });
    expect(list[2].link).toBe(`/dashboard/receipts/${receipt._id}`);
    expect(await Receipt.countDocuments()).toBe(1);
  });

  it('an admin edit that changes nothing sends nothing', async () => {
    const merchant = await createMerchant();

    await adminCall('patch', `/merchants/${merchant._id}/subscription`, { plan: 'small', status: 'active' });

    expect(await typesOf(merchant)).toEqual([]);
  });

  it('a product becoming try-on ready (once, not on every anchor save)', async () => {
    const merchant = await createMerchant();
    const chart = await createChart(merchant);
    const mapping = await ProductMapping.create({
      merchantId: merchant._id,
      productId: 'SKU-1',
      productName: 'Blue Tee',
      sizeChartId: chart._id,
      productImage: '/uploads/products/missing.png',
    });
    const save = () =>
      request(app).put(`/api/products/${mapping._id}/anchor-points`).set(auth(merchant)).send({ anchorPoints: ANCHORS });

    expect((await save()).body.mapping.tryOnStatus).toBe('ready');
    await save();

    const list = await notificationsOf(merchant);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      type: 'product.tryon_ready',
      title: 'Blue Tee is ready for try-on',
      link: '/dashboard/product-mapping',
    });
  });

  it('deleting a merchant removes their notifications and device tokens', async () => {
    const merchant = await createMerchant();
    await notify(merchant, 'account.reactivated');
    await DeviceToken.create({ token: 'gone', merchant: merchant._id });

    await adminCall('delete', `/merchants/${merchant._id}`);

    expect(await Notification.countDocuments({ recipient: merchant._id })).toBe(0);
    expect(await DeviceToken.countDocuments()).toBe(0);
  });
});

describe('usage alerts (counted API requests)', () => {
  // The real API-key middleware on a stub route, so each call is one billable
  // request.
  const usageApp = express();
  usageApp.post('/billable', validateApiKey, (req, res) => res.json({ ok: true }));
  const hit = (merchant) => request(usageApp).post('/billable').set('x-api-key', merchant.apiKey);

  let admin;
  beforeEach(async () => {
    admin = await createSuperAdmin();
  });

  it('warns at 80% and at 100% once each, and tells the admin at 100%', async () => {
    const merchant = await createMerchant({
      subscription: { plan: 'small', status: 'active', requestsLimit: 10, requestsUsed: 7 },
    });

    await hit(merchant); // 8 of 10
    await hit(merchant); // 9
    await hit(merchant); // 10
    expect((await hit(merchant)).status).toBe(403); // over the limit

    const list = await notificationsOf(merchant);
    expect(list.map((n) => n.type)).toEqual(['usage.80', 'usage.100']);
    expect(list[0]).toMatchObject({ body: expect.stringContaining('8 of 10'), link: '/dashboard/analytics' });
    expect(list[1]).toMatchObject({ important: true, link: '/dashboard/subscription' });
    expect(await typesOf(admin)).toEqual(['admin.merchant_limit_reached']);
  });

  it('does not warn again in the same month, but does after the usage is reset', async () => {
    const merchant = await createMerchant({
      subscription: { plan: 'small', status: 'active', requestsLimit: 10, requestsUsed: 7 },
    });
    await hit(merchant);
    await Merchant.updateOne({ _id: merchant._id }, { 'subscription.requestsUsed': 7 });
    await hit(merchant);
    expect(await typesOf(merchant)).toEqual(['usage.80']);

    await request(app)
      .patch(`/api/admin/merchants/${merchant._id}/subscription`)
      .set(auth(admin))
      .send({ resetUsage: true });
    await Merchant.updateOne({ _id: merchant._id }, { 'subscription.requestsUsed': 7 });
    await hit(merchant);

    expect((await typesOf(merchant)).filter((t) => t === 'usage.80')).toHaveLength(2);
  });

  it('jumping straight to 100% sends only the 100% alert', async () => {
    const merchant = await createMerchant({
      subscription: { plan: 'small', status: 'active', requestsLimit: 1, requestsUsed: 0 },
    });

    await hit(merchant);

    expect(await typesOf(merchant)).toEqual(['usage.100']);
  });

  it('a new plan period starts the alerts again', async () => {
    const merchant = await createMerchant({
      subscription: { plan: 'small', status: 'active', requestsLimit: 10, requestsUsed: 7 },
    });
    await hit(merchant);
    await request(app).post('/api/subscription/select').set(auth(merchant)).send({ plan: 'small' });
    await Merchant.updateOne({ _id: merchant._id }, { 'subscription.requestsLimit': 10, 'subscription.requestsUsed': 7 });

    await hit(merchant);

    expect((await typesOf(merchant)).filter((t) => t === 'usage.80')).toHaveLength(2);
  });

  it('never alerts on an unlimited plan', async () => {
    const merchant = await createMerchant({
      subscription: { plan: 'enterprise', status: 'active', requestsLimit: null, requestsUsed: 100000 },
    });

    expect((await hit(merchant)).status).toBe(200);
    expect(await typesOf(merchant)).toEqual([]);
  });

  it('respects a muted 80% alert', async () => {
    const merchant = await createMerchant({
      notificationPreferences: { 'usage:80': false },
      subscription: { plan: 'small', status: 'active', requestsLimit: 10, requestsUsed: 7 },
    });

    await hit(merchant);

    expect(await typesOf(merchant)).toEqual([]);
  });
});
