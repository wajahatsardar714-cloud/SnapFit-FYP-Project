const mongoose = require('mongoose');

// One entry per mutating super admin action. `details` carries non-secret
// context (e.g. a subscription's before/after) -- never passwords or API keys.
const auditLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true },
    adminEmail: { type: String, required: true },
    action: { type: String, required: true },
    targetType: { type: String, enum: ['merchant'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    targetLabel: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
