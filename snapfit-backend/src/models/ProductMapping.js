const mongoose = require('mongoose');

const productMappingSchema = new mongoose.Schema(
  {
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant' },
    productId: { type: String, required: true },
    productName: { type: String },
    sizeChartId: { type: mongoose.Schema.Types.ObjectId, ref: 'SizeChart', required: true },
  },
  { timestamps: true }
);

productMappingSchema.index({ merchantId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('ProductMapping', productMappingSchema);
