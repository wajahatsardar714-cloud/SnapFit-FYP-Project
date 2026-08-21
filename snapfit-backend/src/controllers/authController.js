const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const Merchant = require('../models/Merchant');

const JWT_EXPIRY = '7d';

function generateToken(merchant) {
  return jwt.sign(
    { merchantId: merchant._id, email: merchant.email },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function sanitizeMerchant(merchant) {
  const { password, ...rest } = merchant.toObject();
  return rest;
}

async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { name, email, password, businessName, phone, businessType } = req.body;

  try {
    const existing = await Merchant.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const merchant = await Merchant.create({
      name,
      email,
      password: hashedPassword,
      businessName,
      phone,
      businessType,
    });

    const token = generateToken(merchant);

    return res.status(201).json({ token, merchant: sanitizeMerchant(merchant) });
  } catch (err) {
    return res.status(500).json({ message: 'Registration failed', error: err.message });
  }
}

async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const merchant = await Merchant.findOne({ email: email.toLowerCase() });
    if (!merchant) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, merchant.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(merchant);

    return res.status(200).json({ token, merchant: sanitizeMerchant(merchant) });
  } catch (err) {
    return res.status(500).json({ message: 'Login failed', error: err.message });
  }
}

async function getMe(req, res) {
  try {
    const merchant = await Merchant.findById(req.merchant.merchantId);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    return res.status(200).json({ merchant: sanitizeMerchant(merchant) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch merchant', error: err.message });
  }
}

module.exports = { register, login, getMe };
