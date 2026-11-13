const { setupTestEnv, createMerchant, createSuperAdmin } = require('./helpers/testApp');

// firebase-admin is mocked: no test ever talks to Firebase.
const mockSend = jest.fn();
const mockInitializeApp = jest.fn(() => ({ name: 'snapfit-push' }));
const mockCert = jest.fn((serviceAccount) => ({ serviceAccount }));
jest.mock('firebase-admin/app', () => ({
  initializeApp: (...args) => mockInitializeApp(...args),
  getApps: () => [],
  cert: (...args) => mockCert(...args),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEachForMulticast: (...args) => mockSend(...args) }),
}));

setupTestEnv();
const DeviceToken = require('../src/models/DeviceToken');
const Notification = require('../src/models/Notification');
const { sendPush, isPushEnabled, resetPushForTests } = require('../src/services/push');
const { notify, notifyAdmins } = require('../src/services/notify');

const SERVICE_ACCOUNT = { project_id: 'snapfit-test', client_email: 'push@snapfit.test', private_key: 'key' };

beforeEach(() => {
  mockSend.mockReset();
  mockInitializeApp.mockClear();
  mockCert.mockClear();
  resetPushForTests();
});
afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
});

function allOk(tokens) {
  return { responses: tokens.map(() => ({ success: true })) };
}

describe('when FIREBASE_SERVICE_ACCOUNT is not set', () => {
  it('is a no-op that never loads Firebase', async () => {
    const merchant = await createMerchant();
    await DeviceToken.create({ token: 'tok-1', merchant: merchant._id });

    expect(isPushEnabled()).toBe(false);
    expect(await sendPush(merchant._id, { notificationId: 'n1', type: 'usage.80', title: 'T', body: 'B' })).toBe(0);
    const notification = await notify(merchant, 'subscription.cancelled');

    expect(notification).not.toBeNull();
    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('when FIREBASE_SERVICE_ACCOUNT is set', () => {
  beforeEach(() => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(SERVICE_ACCOUNT);
    mockSend.mockImplementation(async ({ tokens }) => allOk(tokens));
  });

  it('sets Firebase up once from the JSON in the env', async () => {
    expect(isPushEnabled()).toBe(true);
    expect(isPushEnabled()).toBe(true);
    expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    expect(mockCert).toHaveBeenCalledWith(SERVICE_ACCOUNT);
  });

  it("pushes a push-type notification to all of the account's phones", async () => {
    const merchant = await createMerchant();
    const other = await createMerchant();
    await DeviceToken.create({ token: 'phone-a', merchant: merchant._id });
    await DeviceToken.create({ token: 'phone-b', merchant: merchant._id });
    await DeviceToken.create({ token: 'not-mine', merchant: other._id });

    const notification = await notify(merchant, 'subscription.cancelled', { data: { planName: 'Small' } });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [message] = mockSend.mock.calls[0];
    expect(message.tokens.sort()).toEqual(['phone-a', 'phone-b']);
    expect(message).toMatchObject({
      notification: { title: 'Your subscription is cancelled', body: notification.body },
      data: { notificationId: String(notification._id), type: 'subscription.cancelled', link: '/dashboard/subscription' },
      android: { priority: 'high', notification: { channelId: 'snapfit_default' } },
    });
  });

  it('sends an empty link for a notification with none', async () => {
    const merchant = await createMerchant();
    await DeviceToken.create({ token: 'phone-a', merchant: merchant._id });

    await notify(merchant, 'account.suspended');

    expect(mockSend.mock.calls[0][0].data.link).toBe('');
  });

  it('never pushes in-app-only types', async () => {
    const merchant = await createMerchant();
    await DeviceToken.create({ token: 'phone-a', merchant: merchant._id });

    await notify(merchant, 'usage.reset');
    await notify(merchant, 'product.tryon_ready', { data: { productName: 'Tee' } });

    expect(await Notification.countDocuments({ recipient: merchant._id })).toBe(2);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('pushes admin types to the super admin', async () => {
    const admin = await createSuperAdmin();
    await DeviceToken.create({ token: 'admin-phone', merchant: admin._id });

    await notifyAdmins('admin.merchant_signed_up', { data: { businessName: 'Shop', merchantId: 'm1' } });

    expect(mockSend.mock.calls[0][0]).toMatchObject({
      tokens: ['admin-phone'],
      data: { type: 'admin.merchant_signed_up', link: '/admin/merchants/m1' },
    });
  });

  it('forgets tokens Firebase reports as dead, keeping the rest', async () => {
    const merchant = await createMerchant();
    for (const token of ['good', 'unregistered', 'invalid', 'flaky']) {
      await DeviceToken.create({ token, merchant: merchant._id });
    }
    mockSend.mockImplementation(async ({ tokens }) => ({
      responses: tokens.map((token) => {
        if (token === 'unregistered') return { success: false, error: { code: 'messaging/registration-token-not-registered' } };
        if (token === 'invalid') return { success: false, error: { code: 'messaging/invalid-registration-token' } };
        if (token === 'flaky') return { success: false, error: { code: 'messaging/internal-error' } };
        return { success: true };
      }),
    }));

    const delivered = await sendPush(merchant._id, { notificationId: 'n1', type: 'usage.80', title: 'T', body: 'B' });

    expect(delivered).toBe(1);
    expect((await DeviceToken.find().lean()).map((d) => d.token).sort()).toEqual(['flaky', 'good']);
  });

  it('does nothing for an account with no phones', async () => {
    const merchant = await createMerchant();

    await notify(merchant, 'subscription.cancelled');

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a Firebase failure never fails the notification', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const merchant = await createMerchant();
    await DeviceToken.create({ token: 'phone-a', merchant: merchant._id });
    mockSend.mockRejectedValue(new Error('FCM down'));

    const notification = await notify(merchant, 'subscription.cancelled');

    expect(notification).not.toBeNull();
    expect(await Notification.countDocuments()).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('FIREBASE_SERVICE_ACCOUNT as a file path', () => {
  it('reads the service account from the file', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'snapfit-fcm-')), 'service-account.json');
    fs.writeFileSync(file, JSON.stringify(SERVICE_ACCOUNT));
    process.env.FIREBASE_SERVICE_ACCOUNT = file;

    try {
      expect(isPushEnabled()).toBe(true);
      expect(mockCert).toHaveBeenCalledWith(SERVICE_ACCOUNT);
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });
});

describe('a bad FIREBASE_SERVICE_ACCOUNT', () => {
  it('turns push off instead of crashing', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.FIREBASE_SERVICE_ACCOUNT = 'D:/no/such/service-account.json';

    expect(isPushEnabled()).toBe(false);
    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
