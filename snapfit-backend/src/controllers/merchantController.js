const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const Merchant = require('../models/Merchant');
const SizeChart = require('../models/SizeChart');
const ProductMapping = require('../models/ProductMapping');
const Recommendation = require('../models/Recommendation');
const Feedback = require('../models/Feedback');
const { removeProductImage } = require('../utils/productImageUpload');

function sanitizeMerchant(merchant) {
  const { password, ...rest } = merchant.toObject();
  return rest;
}

// Deletes a merchant together with everything they own: size charts, product
// mappings (and their stored product photos), recommendations and feedback.
async function deleteMerchantWithData(merchantId) {
  const productImages = (await ProductMapping.find({ merchantId, productImage: { $ne: null } }).select('productImage'))
    .map((mapping) => mapping.productImage);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await SizeChart.deleteMany({ merchantId }, { session });
      await ProductMapping.deleteMany({ merchantId }, { session });
      await Recommendation.deleteMany({ merchantId }, { session });
      await Feedback.deleteMany({ merchantId }, { session });
      await Merchant.deleteOne({ _id: merchantId }, { session });
    });
  } finally {
    await session.endSession();
  }

  // Files go only once the records are gone, so a failed transaction never
  // leaves mappings pointing at missing photos.
  await Promise.all(productImages.map(removeProductImage));
}

async function updateProfile(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { name, businessName, phone, businessType } = req.body;

  try {
    const merchant = await Merchant.findById(req.merchant.merchantId);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    merchant.name = name;
    merchant.businessName = businessName;
    merchant.phone = phone || undefined;
    if (businessType) merchant.businessType = businessType;

    await merchant.save();

    return res.status(200).json({ merchant: sanitizeMerchant(merchant) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update profile', error: err.message });
  }
}

async function changePassword(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;

  try {
    const merchant = await Merchant.findById(req.merchant.merchantId);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, merchant.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    merchant.password = await bcrypt.hash(newPassword, 12);
    await merchant.save();

    return res.status(200).json({ message: 'Password updated' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to change password', error: err.message });
  }
}

async function deleteAccount(req, res) {
  const { businessName } = req.body;

  try {
    const merchant = await Merchant.findById(req.merchant.merchantId);
    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    if (!businessName || businessName !== merchant.businessName) {
      return res.status(400).json({ message: 'Business name does not match' });
    }

    await deleteMerchantWithData(merchant._id);

    return res.status(200).json({ message: 'Account deleted' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete account', error: err.message });
  }
}

module.exports = { updateProfile, changePassword, deleteAccount, deleteMerchantWithData };
