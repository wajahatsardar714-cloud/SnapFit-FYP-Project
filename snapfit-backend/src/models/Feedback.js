const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    recommendationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recommendation' },
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant' },
    fitResult: {
      type: String,
      enum: ['too_small', 'slightly_small', 'perfect', 'slightly_large', 'too_large'],
    },
    comment: { type: String },
  },
  { timestamps: true }
);

feedbackSchema.index({ recommendationId: 1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
