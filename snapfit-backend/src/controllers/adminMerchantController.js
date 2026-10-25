const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const Merchant = require('../models/Merchant');
const SizeChart = require('../models/SizeChart');
const ProductMapping = require('../models/ProductMapping');
const Recommendation = require('../models/Recommendation');
const AuditLog = require('../models/AuditLog');
const { assignUniqueApiKey, maskApiKey } = require('./apiKeyController');
const { deleteMerchantWithData } = require('./merchantController');
const { tryOnStatus } = require('./productMappingController');
const { PLANS } = require('../config/plans');

const { MERCHANTS_ONLY } = Merchant;
const { EXCLUDE_DEMO } = Recommendation;

const RECENT_RECOMMENDATIONS_LIMIT = 20;

// Responds 400 with the first validation message; true when it did.
function sendValidationError(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ message: errors.array()[0].msg });
  return true;
}

function pageCount(total, limit) {
  return Math.max(1, Math.ceil(total / limit));
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function recordAudit(req, action, merchant, details) {
  return AuditLog.create({
    adminId: req.merchant.merchantId,
    adminEmail: req.merchant.email,
    action,
    targetType: 'merchant',
    targetId: merchant._id,
    targetLabel: merchant.businessName || merchant.email,
    details,
  });
}

// { merchantId -> number of `Model` records }, for the given merchants.
async function countByMerchant(Model, merchantIds, filter = {}) {
  const rows = await Model.aggregate([
    { $match: { merchantId: { $in: merchantIds }, ...filter } },
    { $group: { _id: '$merchantId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

// The admin view of merchant accounts -- never the password or the full API key.
async function summarizeMerchants(merchants) {
  const ids = merchants.map((m) => m._id);
  const [sizeCharts, products, recommendations] = await Promise.all([
    countByMerchant(SizeChart, ids),
    countByMerchant(ProductMapping, ids),
    countByMerchant(Recommendation, ids, EXCLUDE_DEMO),
  ]);

  return merchants.map((merchant) => {
    const id = String(merchant._id);
    return {
      _id: merchant._id,
      name: merchant.name,
      email: merchant.email,
      businessName: merchant.businessName ?? null,
      businessType: merchant.businessType ?? null,
      phone: merchant.phone ?? null,
      status: merchant.status,
      suspendedAt: merchant.suspendedAt ?? null,
      suspendedReason: merchant.suspendedReason ?? null,
      subscription: merchant.toObject().subscription,
      hasApiKey: Boolean(merchant.apiKey),
      createdAt: merchant.createdAt,
      counts: {
        sizeCharts: sizeCharts.get(id) || 0,
        products: products.get(id) || 0,
        recommendations: recommendations.get(id) || 0,
      },
    };
  });
}

async function summarizeMerchant(merchant) {
  const [summary] = await summarizeMerchants([merchant]);
  return summary;
}

function subscriptionSnapshot(subscription) {
  return {
    plan: subscription.plan,
    status: subscription.status,
    requestsLimit: subscription.requestsLimit ?? null,
    requestsUsed: subscription.requestsUsed,
    endDate: subscription.endDate ?? null,
  };
}

async function listMerchants(req, res) {
  if (sendValidationError(req, res)) return undefined;
  const { search, plan, status, page = 1, limit = 20 } = req.query;

  const filter = { ...MERCHANTS_ONLY };
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = ['name', 'email', 'businessName'].map((field) => ({ [field]: pattern }));
  }
  if (plan) filter['subscription.plan'] = plan;
  if (status) filter.status = status === 'suspended' ? 'suspended' : { $ne: 'suspended' };

  try {
    const [total, merchants] = await Promise.all([
      Merchant.countDocuments(filter),
      Merchant.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    return res.status(200).json({
      merchants: await summarizeMerchants(merchants),
      total,
      page,
      pages: pageCount(total, limit),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch merchants', error: err.message });
  }
}

async function getMerchant(req, res) {
  const merchant = req.targetMerchant;
  const merchantId = merchant._id;

  try {
    const [summary, sizeCharts, products, recommendations] = await Promise.all([
      summarizeMerchant(merchant),
      SizeChart.find({ merchantId }).sort({ createdAt: -1 }).select('name category sizes isActive').lean(),
      ProductMapping.find({ merchantId }).sort({ createdAt: -1 }),
      Recommendation.find({ merchantId })
        .sort({ createdAt: -1 })
        .limit(RECENT_RECOMMENDATIONS_LIMIT)
        .select('productId recommendedSize confidence status source createdAt')
        .lean(),
    ]);

    return res.status(200).json({
      merchant: summary,
      apiKeyPreview: merchant.apiKey ? maskApiKey(merchant.apiKey) : null,
      sizeCharts: sizeCharts.map((chart) => ({
        _id: chart._id,
        name: chart.name,
        category: chart.category,
        sizesCount: chart.sizes?.length || 0,
        isActive: chart.isActive ?? true,
      })),
      products: products.map((mapping) => ({
        _id: mapping._id,
        productId: mapping.productId,
        productName: mapping.productName ?? null,
        tryOnStatus: tryOnStatus(mapping),
        garmentLength: mapping.garmentLength,
        productImage: mapping.productImage ?? null,
      })),
      recentRecommendations: recommendations.map((r) => ({
        _id: r._id,
        productId: r.productId,
        recommendedSize: r.recommendedSize ?? null,
        confidence: r.confidence ?? null,
        status: r.status,
        source: r.source || 'widget',
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch merchant', error: err.message });
  }
}

const SUBSCRIPTION_FIELDS = ['plan', 'status', 'requestsLimit', 'endDate', 'resetUsage'];

async function updateSubscription(req, res) {
  if (sendValidationError(req, res)) return undefined;
  const body = req.body;
  const has = (field) => Object.hasOwn(body, field);
  if (!SUBSCRIPTION_FIELDS.some(has)) {
    return res.status(400).json({ message: `Provide at least one of: ${SUBSCRIPTION_FIELDS.join(', ')}` });
  }

  const merchant = req.targetMerchant;
  const { subscription } = merchant;
  const before = subscriptionSnapshot(subscription);

  if (has('plan')) {
    subscription.plan = body.plan;
    // A plan change brings that plan's quota unless a limit is given too.
    if (!has('requestsLimit')) subscription.requestsLimit = PLANS[body.plan].requestsLimit;
  }
  if (has('status')) subscription.status = body.status;
  if (has('requestsLimit')) subscription.requestsLimit = body.requestsLimit === null ? null : Number(body.requestsLimit);
  if (has('endDate')) subscription.endDate = body.endDate === null ? null : new Date(body.endDate);
  if (body.resetUsage) subscription.requestsUsed = 0;

  try {
    await merchant.save();
    await recordAudit(req, 'merchant.subscription.update', merchant, {
      before,
      after: subscriptionSnapshot(subscription),
    });

    return res.status(200).json({ merchant: await summarizeMerchant(merchant) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update subscription', error: err.message });
  }
}

async function updateStatus(req, res) {
  if (sendValidationError(req, res)) return undefined;
  const { status, reason } = req.body;
  const merchant = req.targetMerchant;
  const previousStatus = merchant.status;
  const suspending = status === 'suspended';

  merchant.status = status;
  merchant.suspendedAt = suspending ? new Date() : undefined;
  merchant.suspendedReason = (suspending && reason) || undefined;

  try {
    await merchant.save();
    await recordAudit(req, suspending ? 'merchant.suspend' : 'merchant.reactivate', merchant, {
      previousStatus,
      ...(suspending && reason && { reason }),
    });

    return res.status(200).json({ merchant: await summarizeMerchant(merchant) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update account status', error: err.message });
  }
}

async function regenerateApiKey(req, res) {
  const merchant = req.targetMerchant;
  const replacedExistingKey = Boolean(merchant.apiKey);

  try {
    await assignUniqueApiKey(merchant);
    await recordAudit(req, 'merchant.apiKey.regenerate', merchant, { replacedExistingKey });

    return res.status(200).json({ apiKey: merchant.apiKey });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to regenerate API key', error: err.message });
  }
}

async function revokeApiKey(req, res) {
  const merchant = req.targetMerchant;
  if (!merchant.apiKey) {
    return res.status(400).json({ message: 'This merchant has no API key' });
  }

  merchant.apiKey = undefined;

  try {
    await merchant.save();
    await recordAudit(req, 'merchant.apiKey.revoke', merchant);

    return res.status(200).json({ merchant: await summarizeMerchant(merchant) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to revoke API key', error: err.message });
  }
}

async function resetPassword(req, res) {
  if (sendValidationError(req, res)) return undefined;
  const merchant = req.targetMerchant;

  try {
    merchant.password = await bcrypt.hash(req.body.password, 12);
    await merchant.save();
    await recordAudit(req, 'merchant.password.reset', merchant);

    return res.status(200).json({ message: 'Password reset' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to reset password', error: err.message });
  }
}

async function deleteMerchant(req, res) {
  const merchant = req.targetMerchant;

  try {
    await deleteMerchantWithData(merchant._id);
    await recordAudit(req, 'merchant.delete', merchant, { email: merchant.email });

    return res.status(200).json({ message: 'Merchant deleted' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete merchant', error: err.message });
  }
}

async function getAuditLog(req, res) {
  if (sendValidationError(req, res)) return undefined;
  const { page = 1, limit = 50 } = req.query;

  try {
    const [total, entries] = await Promise.all([
      AuditLog.countDocuments(),
      AuditLog.find()
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('adminEmail action targetType targetId targetLabel details createdAt')
        .lean(),
    ]);

    return res.status(200).json({
      entries: entries.map((entry) => ({ ...entry, details: entry.details ?? null })),
      total,
      page,
      pages: pageCount(total, limit),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch audit log', error: err.message });
  }
}

module.exports = {
  listMerchants,
  getMerchant,
  updateSubscription,
  updateStatus,
  regenerateApiKey,
  revokeApiKey,
  resetPassword,
  deleteMerchant,
  getAuditLog,
  summarizeMerchants,
  sendValidationError,
};
