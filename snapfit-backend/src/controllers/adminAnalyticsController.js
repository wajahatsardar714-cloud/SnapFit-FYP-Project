const Merchant = require('../models/Merchant');
const Recommendation = require('../models/Recommendation');
const { PLAN_IDS, DEFAULT_PLAN } = require('../config/plans');
const { sendCsv, CSV_COLUMNS } = require('./analyticsController');
const { summarizeMerchants, sendValidationError } = require('./adminMerchantController');

const { MERCHANTS_ONLY } = Merchant;
const { EXCLUDE_DEMO } = Recommendation;

const DAY_MS = 24 * 60 * 60 * 1000;
const OVERVIEW_DAYS = 30;
const RECENT_MERCHANTS_LIMIT = 5;
const TOP_MERCHANTS_LIMIT = 10;
// Statuses that produced a size for the shopper.
const SUCCEEDED_STATUSES = ['success', 'low_confidence'];

// UTC midnight `days - 1` days ago: the first day of a `days`-long window ending today.
function windowStart(days) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return new Date(start.getTime() - (days - 1) * DAY_MS);
}

// Per-day totals (UTC dates) of real shopper recommendations, every day of the
// window present.
async function dailySeries(days) {
  const start = windowStart(days);
  const rows = await Recommendation.aggregate([
    { $match: { ...EXCLUDE_DEMO, createdAt: { $gte: start } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        total: { $sum: 1 },
        success: { $sum: { $cond: [{ $in: ['$status', SUCCEEDED_STATUSES] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
      },
    },
  ]);

  const byDate = new Map(rows.map((row) => [row._id, row]));
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    const { total = 0, success = 0, failed = 0 } = byDate.get(date) || {};
    return { date, total, success, failed };
  });
}

async function getOverview(req, res) {
  try {
    const [
      merchants,
      suspendedMerchants,
      recommendations,
      recommendationsLast30Days,
      succeeded,
      planRows,
      daily,
      newestMerchants,
    ] = await Promise.all([
      Merchant.countDocuments(MERCHANTS_ONLY),
      Merchant.countDocuments({ ...MERCHANTS_ONLY, status: 'suspended' }),
      Recommendation.countDocuments(EXCLUDE_DEMO),
      Recommendation.countDocuments({ ...EXCLUDE_DEMO, createdAt: { $gte: windowStart(OVERVIEW_DAYS) } }),
      Recommendation.countDocuments({ ...EXCLUDE_DEMO, status: { $in: SUCCEEDED_STATUSES } }),
      Merchant.aggregate([
        { $match: MERCHANTS_ONLY },
        { $group: { _id: { $ifNull: ['$subscription.plan', DEFAULT_PLAN] }, count: { $sum: 1 } } },
      ]),
      dailySeries(OVERVIEW_DAYS),
      Merchant.find(MERCHANTS_ONLY).sort({ createdAt: -1, _id: -1 }).limit(RECENT_MERCHANTS_LIMIT),
    ]);

    const planCounts = new Map(planRows.map((row) => [row._id, row.count]));

    return res.status(200).json({
      totals: {
        merchants,
        activeMerchants: merchants - suspendedMerchants,
        suspendedMerchants,
        recommendations,
        recommendationsLast30Days,
        successRate: recommendations > 0 ? Math.round((succeeded / recommendations) * 1000) / 1000 : 0,
      },
      byPlan: Object.fromEntries(PLAN_IDS.map((plan) => [plan, planCounts.get(plan) || 0])),
      daily,
      recentMerchants: await summarizeMerchants(newestMerchants),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch overview', error: err.message });
  }
}

async function getAnalytics(req, res) {
  if (sendValidationError(req, res)) return undefined;
  const { days = OVERVIEW_DAYS } = req.query;
  const match = { ...EXCLUDE_DEMO, createdAt: { $gte: windowStart(days) } };

  try {
    const [daily, statusRows, topRows, sizeRows] = await Promise.all([
      dailySeries(days),
      Recommendation.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Recommendation.aggregate([
        { $match: match },
        { $group: { _id: '$merchantId', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: TOP_MERCHANTS_LIMIT },
        { $lookup: { from: Merchant.collection.name, localField: '_id', foreignField: '_id', as: 'merchant' } },
      ]),
      Recommendation.aggregate([
        { $match: { ...match, recommendedSize: { $ne: null } } },
        { $group: { _id: '$recommendedSize', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
    ]);

    const statusCounts = new Map(statusRows.map((row) => [row._id, row.count]));

    return res.status(200).json({
      daily,
      statusBreakdown: {
        success: statusCounts.get('success') || 0,
        low_confidence: statusCounts.get('low_confidence') || 0,
        failed: statusCounts.get('failed') || 0,
      },
      topMerchants: topRows.map((row) => ({
        merchantId: row._id,
        businessName: row.merchant[0]?.businessName ?? null,
        count: row.count,
      })),
      sizes: sizeRows.map((row) => ({ size: row._id, count: row.count })),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch analytics', error: err.message });
  }
}

async function exportAnalytics(req, res) {
  try {
    const recommendations = await Recommendation.find(EXCLUDE_DEMO).sort({ createdAt: 1 }).lean();
    const merchantIds = [...new Set(recommendations.filter((r) => r.merchantId).map((r) => String(r.merchantId)))];
    const merchants = await Merchant.find({ _id: { $in: merchantIds } })
      .select('businessName email')
      .lean();
    const merchantsById = new Map(merchants.map((m) => [String(m._id), m]));
    const merchantOf = (r) => merchantsById.get(String(r.merchantId));

    const columns = [
      { header: 'Merchant', get: (r) => merchantOf(r)?.businessName },
      { header: 'Merchant Email', get: (r) => merchantOf(r)?.email },
      ...CSV_COLUMNS,
    ];

    return sendCsv(res, columns, recommendations, 'snapfit-recommendations');
  } catch (err) {
    return res.status(500).json({ message: 'Failed to export analytics', error: err.message });
  }
}

module.exports = { getOverview, getAnalytics, exportAnalytics };
