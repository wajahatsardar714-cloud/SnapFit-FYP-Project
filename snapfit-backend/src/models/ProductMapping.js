const mongoose = require('mongoose');

const anchorPointSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const productMappingSchema = new mongoose.Schema(
  {
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant' },
    productId: { type: String, required: true },
    productName: { type: String },
    sizeChartId: { type: mongoose.Schema.Types.ObjectId, ref: 'SizeChart', required: true },
    // Optional flat-lay product image + 4 normalized (0-1) anchor points, used by
    // the virtual try-on overlay (Phase 12) to warp the product image onto a
    // customer's photo via their corresponding BlazePose landmarks.
    productImage: { type: String },
    anchorPoints: {
      shoulderLeft: { type: anchorPointSchema },
      shoulderRight: { type: anchorPointSchema },
      hipLeft: { type: anchorPointSchema },
      hipRight: { type: anchorPointSchema },
    },
  },
  { timestamps: true }
);

productMappingSchema.index({ merchantId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('ProductMapping', productMappingSchema);
