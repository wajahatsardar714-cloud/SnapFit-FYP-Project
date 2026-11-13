const fs = require('fs');
const DeviceToken = require('../models/DeviceToken');

// Phone push notifications through Firebase Cloud Messaging. Push is switched
// on only when FIREBASE_SERVICE_ACCOUNT is set (a path to the service-account
// JSON file, or the JSON itself); otherwise every send is a no-op, so the rest
// of SnapFit works the same without Firebase.

// FCM accepts at most 500 tokens per multicast.
const MAX_TOKENS_PER_SEND = 500;
// The Android notification channel the mobile app creates.
const ANDROID_CHANNEL_ID = 'snapfit_default';
// FCM error codes that mean the token will never work again.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

let messaging; // the firebase-admin Messaging client, once set up
let disabled = false; // true once we know push is off (logged once)

function readServiceAccount(value) {
  const text = value.trim().startsWith('{') ? value : fs.readFileSync(value, 'utf8');
  return JSON.parse(text);
}

// The Messaging client, set up on first use; null when push is off or the
// service account can't be loaded.
function getMessagingClient() {
  if (messaging) return messaging;
  if (disabled) return null;

  const config = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!config) {
    disabled = true;
    if (process.env.NODE_ENV !== 'test') {
      console.log('Push notifications disabled: FIREBASE_SERVICE_ACCOUNT is not set');
    }
    return null;
  }

  try {
    // Loaded only when push is configured: firebase-admin is large.
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    const appName = 'snapfit-push';
    const app =
      getApps().find((existing) => existing.name === appName) ||
      initializeApp({ credential: cert(readServiceAccount(config)) }, appName);
    messaging = getMessaging(app);
    return messaging;
  } catch (err) {
    disabled = true;
    console.error('Push notifications disabled: could not load FIREBASE_SERVICE_ACCOUNT:', err.message);
    return null;
  }
}

function isPushEnabled() {
  return Boolean(getMessagingClient());
}

// Sends one notification to every phone the account is signed in on, and
// forgets tokens FCM reports as dead. Never throws; resolves to the number of
// phones it reached.
async function sendPush(recipientId, { notificationId, type, title, body, link }) {
  try {
    const client = getMessagingClient();
    if (!client) return 0;

    const tokens = (await DeviceToken.find({ merchant: recipientId }).select('token').lean()).map((d) => d.token);
    if (tokens.length === 0) return 0;

    let delivered = 0;
    const deadTokens = [];
    for (let start = 0; start < tokens.length; start += MAX_TOKENS_PER_SEND) {
      const batch = tokens.slice(start, start + MAX_TOKENS_PER_SEND);
      const result = await client.sendEachForMulticast({
        tokens: batch,
        notification: { title, body: body || '' },
        // FCM data values must be strings.
        data: { notificationId: String(notificationId), type, link: link || '' },
        android: { priority: 'high', notification: { channelId: ANDROID_CHANNEL_ID } },
      });
      result.responses.forEach((response, index) => {
        if (response.success) delivered += 1;
        else if (DEAD_TOKEN_CODES.has(response.error?.code)) deadTokens.push(batch[index]);
      });
    }

    if (deadTokens.length) await DeviceToken.deleteMany({ token: { $in: deadTokens } });
    return delivered;
  } catch (err) {
    console.error(`Push notification failed (${type}):`, err.message);
    return 0;
  }
}

// Tests only: forget the client so the next send re-reads the env.
function resetPushForTests() {
  messaging = undefined;
  disabled = false;
}

module.exports = { sendPush, isPushEnabled, resetPushForTests, ANDROID_CHANNEL_ID };
