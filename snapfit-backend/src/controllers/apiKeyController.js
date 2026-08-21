const crypto = require('crypto');
const Merchant = require('../models/Merchant');

const MAX_GENERATION_ATTEMPTS = 5;

function generateKey() {
  return `sk_live_${crypto.randomBytes(16).toString('hex')}`;
}

function maskApiKey(key) {
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

async function assignUniqueApiKey(merchant) {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    merchant.apiKey = generateKey();
    try {
      await merchant.save();
      return;
    } catch (err) {
      const isDuplicateKey = err.code === 11000;
      if (!isDuplicateKey || attempt === MAX_GENERATION_ATTEMPTS - 1) {
        throw err;
      }
    }
  }
}

async function generateApiKey(req, res) {
  try {
    const merchant = await Merchant.findById(req.merchant.merchantId);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    await assignUniqueApiKey(merchant);

    return res.status(201).json({ apiKey: merchant.apiKey });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to generate API key', error: err.message });
  }
}

async function getApiKey(req, res) {
  try {
    const merchant = await Merchant.findById(req.merchant.merchantId);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    if (!merchant.apiKey) {
      return res.status(404).json({ message: 'No API key has been generated yet' });
    }

    return res.status(200).json({ apiKey: maskApiKey(merchant.apiKey) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch API key', error: err.message });
  }
}

async function regenerateApiKey(req, res) {
  try {
    const merchant = await Merchant.findById(req.merchant.merchantId);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    await assignUniqueApiKey(merchant);

    return res.status(200).json({ apiKey: merchant.apiKey });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to regenerate API key', error: err.message });
  }
}

module.exports = { generateApiKey, getApiKey, regenerateApiKey };
