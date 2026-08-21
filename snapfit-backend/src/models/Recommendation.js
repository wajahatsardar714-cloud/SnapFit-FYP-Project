const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema(
  {
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant' },
    productId: { type: String },
    sizeChartId: { type: mongoose.Schema.Types.ObjectId, ref: 'SizeChart' },
    recommendedSize: { type: String },
    confidence: { type: Number },
    bodyFeatures: {
      shoulderToHipRatio: { type: Number },
      torsoToLegRatio: { type: Number },
      shoulderWidthNorm: { type: Number },
      hipWidthNorm: { type: Number },
      chestWidthNorm: { type: Number },
    },
    userHeight: { type: Number },
    status: { type: String, enum: ['success', 'failed', 'low_confidence'] },
    errorMessage: { type: String },
    ipAddress: { type: String },
  },
  { timestamps: true }
);

recommendationSchema.index({ merchantId: 1 });
recommendationSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Recommendation', recommendationSchema);
