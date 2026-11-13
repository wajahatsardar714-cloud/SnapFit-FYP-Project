const { validationResult } = require('express-validator');
const DeviceToken = require('../models/DeviceToken');

// Phones registering for push notifications. A token moves to the latest
// account that registers it, so a shared phone only gets the signed-in
// account's pushes.

async function registerDevice(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  const { token, platform = 'android' } = req.body;

  const upsert = () =>
    DeviceToken.updateOne(
      { token },
      { token, merchant: req.merchant.merchantId, platform, lastSeenAt: new Date() },
      { upsert: true }
    );

  try {
    try {
      await upsert();
    } catch (err) {
      // Two first-time registrations of one token can race on the unique
      // index; the second one then simply updates.
      if (err.code !== 11000) throw err;
      await upsert();
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to register device', error: err.message });
  }
}

// Signing out on a phone: forget its token. Only the caller's own token is
// removed; an unknown token is not an error.
async function removeDevice(req, res) {
  try {
    await DeviceToken.deleteOne({ token: req.params.token, merchant: req.merchant.merchantId });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to remove device', error: err.message });
  }
}

module.exports = { registerDevice, removeDevice };
