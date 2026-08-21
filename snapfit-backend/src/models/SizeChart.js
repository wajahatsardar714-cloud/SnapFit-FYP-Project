const mongoose = require('mongoose');

const rangeSchema = new mongoose.Schema(
  {
    min: { type: Number },
    max: { type: Number },
  },
  { _id: false }
);

const sizeChartSchema = new mongoose.Schema(
  {
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true },
    name: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: ['tops', 'bottoms', 'dresses', 'footwear', 'outerwear'],
    },
    gender: { type: String, enum: ['male', 'female', 'unisex'] },
    sizes: [
      {
        label: { type: String },
        measurements: {
          chest: rangeSchema,
          waist: rangeSchema,
          hip: rangeSchema,
          shoulderWidth: rangeSchema,
          torsoLength: rangeSchema,
          inseam: rangeSchema,
        },
      },
    ],
    unit: { type: String, enum: ['cm', 'inches'], default: 'inches' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

sizeChartSchema.index({ merchantId: 1 });

module.exports = mongoose.model('SizeChart', sizeChartSchema);
