const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema(
  {
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant' },
    productId: { type: String },
    sizeChartId: { type: mongoose.Schema.Types.ObjectId, ref: 'SizeChart' },
    recommendedSize: { type: String },
    alternativeSize: { type: String },
    confidence: { type: Number },
    bodyFeatures: {
      shoulderToHipRatio: { type: Number },
      torsoToLegRatio: { type: Number },
      shoulderWidthNorm: { type: Number },
      hipWidthNorm: { type: Number },
      chestWidthNorm: { type: Number },
    },
    // Estimated body measurements in cm (numbers only -- the photo itself is
    // never stored).
    measurements: {
      shoulderWidth: { type: Number },
      chest: { type: Number },
      waist: { type: Number },
      hip: { type: Number },
      torsoLength: { type: Number },
      inseam: { type: Number },
    },
    sizeScores: [{ _id: false, label: { type: String }, score: { type: Number } }],
    userHeight: { type: Number },
    // How the clothes the shopper wears in the photo fit.
    clothingFit: { type: String, enum: ['fitted', 'regular', 'loose'], default: 'regular' },
    // How many photos (main image + live-camera frames) the analysis combined.
    framesUsed: { type: Number, default: 1 },
    status: { type: String, enum: ['success', 'failed', 'low_confidence'] },
    errorMessage: { type: String },
    ipAddress: { type: String },
  },
  { timestamps: true }
);

recommendationSchema.index({ merchantId: 1 });
recommendationSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Recommendation', recommendationSchema);
