const mongoose = require('mongoose');

const merchantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    phone: { type: String },
    // The super admin runs the platform and has no shop of its own.
    businessName: {
      type: String,
      required() {
        return this.role !== 'superadmin';
      },
    },
    businessType: {
      type: String,
      enum: ['clothing', 'footwear', 'accessories'],
    },
    apiKey: { type: String, unique: true, sparse: true },
    subscription: {
      plan: {
        type: String,
        enum: ['free', 'basic', 'pro', 'enterprise'],
        default: 'free',
      },
      status: {
        type: String,
        enum: ['active', 'inactive', 'expired'],
        default: 'inactive',
      },
      startDate: { type: Date },
      endDate: { type: Date },
      requestsLimit: { type: Number },
      requestsUsed: { type: Number, default: 0 },
    },
    isVerified: { type: Boolean, default: false },
    // Accounts created before roles existed load with these defaults, so they
    // behave as active merchants.
    role: { type: String, enum: ['merchant', 'superadmin'], default: 'merchant' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    suspendedAt: { type: Date },
    suspendedReason: { type: String },
  },
  { timestamps: true }
);

const Merchant = mongoose.model('Merchant', merchantSchema);

// Query filter for merchant accounts (everything but the super admin), including
// accounts stored before `role` existed.
Merchant.MERCHANTS_ONLY = { role: { $ne: 'superadmin' } };

module.exports = Merchant;
