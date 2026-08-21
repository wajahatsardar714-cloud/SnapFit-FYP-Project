const mongoose = require('mongoose');

const merchantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    phone: { type: String },
    businessName: { type: String, required: true },
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Merchant', merchantSchema);
