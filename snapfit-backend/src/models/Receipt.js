const mongoose = require('mongoose');

// A subscription receipt. The merchant's details, the plan and the price are a
// snapshot taken when it was issued, so later edits never change it. There is
// no payment gateway: the payment method is always the demo one.
const receiptSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    status: { type: String, enum: ['issued', 'void'], default: 'issued' },
    reason: { type: String, enum: ['plan_selected', 'plan_changed', 'admin_change'], required: true },
    issuedAt: { type: Date, required: true },
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true },
    merchant: {
      businessName: { type: String, default: null },
      name: { type: String, default: null },
      email: { type: String, default: null },
      phone: { type: String, default: null },
    },
    plan: { type: String, required: true },
    planName: { type: String, required: true },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    currency: { type: String, required: true },
    amount: { type: Number, required: true },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    priceNote: { type: String, default: null },
    paymentMethod: { type: String, required: true },
    voidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

receiptSchema.index({ merchantId: 1, issuedAt: -1 });

module.exports = mongoose.model('Receipt', receiptSchema);
