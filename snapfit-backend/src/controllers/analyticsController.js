const mongoose = require('mongoose');
const Merchant = require('../models/Merchant');
const Recommendation = require('../models/Recommendation');

const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

const CONFIDENCE_BUCKETS = [
  { boundary: 0, label: '<50%' },
  { boundary: 0.5, label: '50-70%' },
  { boundary: 0.7, label: '70-90%' },
  { boundary: 0.9, label: '>90%' },
];

const CSV_COLUMNS = [
  { header: 'Date', get: (r) => r.createdAt.toISOString() },
  { header: 'Product ID', get: (r) => r.productId },
  { header: 'Recommended Size', get: (r) => r.recommendedSize },
  { header: 'Confidence', get: (r) => r.confidence },
  { header: 'Status', get: (r) => r.status },
  { header: 'Error', get: (r) => r.errorMessage },
  { header: 'User Height (cm)', get: (r) => r.userHeight },
];

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toCsvValue(value) {
  if (value == null) return '';
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

async function getDashboardStats(req, res) {
  try {
    const merchantId = req.merchant.merchantId;
    const merchantObjectId = new mongoose.Types.ObjectId(merchantId);

    const [merchant, totalRecommendations, recommendationsThisMonth, successCount, avgConfidenceAgg, sizeAgg] =
      await Promise.all([
        Merchant.findById(merchantId),
        Recommendation.countDocuments({ merchantId }),
        Recommendation.countDocuments({ merchantId, createdAt: { $gte: startOfMonth() } }),
        Recommendation.countDocuments({ merchantId, status: 'success' }),
        Recommendation.aggregate([
          { $match: { merchantId: merchantObjectId, confidence: { $ne: null } } },
          { $group: { _id: null, avgConfidence: { $avg: '$confidence' } } },
        ]),
        Recommendation.aggregate([
          { $match: { merchantId: merchantObjectId, recommendedSize: { $ne: null } } },
          { $group: { _id: '$recommendedSize', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
      ]);

    if (!merchant) {
      return res.status(404).json({ message: 'Merchant not found' });
    }

    const successRate = totalRecommendations > 0 ? Math.round((successCount / totalRecommendations) * 1000) / 10 : 0;
    const averageConfidence =
      avgConfidenceAgg[0]?.avgConfidence != null ? Math.round(avgConfidenceAgg[0].avgConfidence * 100) / 100 : null;

    const { requestsUsed, requestsLimit } = merchant.subscription;

    return res.status(200).json({
      totalRecommendations,
      recommendationsThisMonth,
      successRate,
      averageConfidence,
      mostRecommendedSizes: sizeAgg.map((s) => ({ size: s._id, count: s.count })),
      usage: {
        requestsUsed,
        requestsLimit,
        requestsRemaining: requestsLimit == null ? null : Math.max(requestsLimit - requestsUsed, 0),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch dashboard stats', error: err.message });
  }
}

async function getUsageOverTime(req, res) {
  try {
    const merchantId = new mongoose.Types.ObjectId(req.merchant.merchantId);
    const period = PERIOD_DAYS[req.query.period] ? req.query.period : '30d';
    const days = PERIOD_DAYS[period];

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (days - 1));

    const results = await Recommendation.aggregate([
      { $match: { merchantId, createdAt: { $gte: startDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]);

    const countsByDate = new Map(results.map((r) => [r._id, r.count]));
    const data = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      data.push({ date: key, count: countsByDate.get(key) || 0 });
    }

    return res.status(200).json({ period, data });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch usage over time', error: err.message });
  }
}

async function getRecommendationBreakdown(req, res) {
  try {
    const merchantId = new mongoose.Types.ObjectId(req.merchant.merchantId);

    const [sizeAgg, confidenceAgg, errorAgg] = await Promise.all([
      Recommendation.aggregate([
        { $match: { merchantId, recommendedSize: { $ne: null } } },
        { $group: { _id: '$recommendedSize', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Recommendation.aggregate([
        { $match: { merchantId, confidence: { $ne: null } } },
        {
          $bucket: {
            groupBy: '$confidence',
            boundaries: CONFIDENCE_BUCKETS.map((b) => b.boundary).concat(1.0001),
            output: { count: { $sum: 1 } },
          },
        },
      ]),
      Recommendation.aggregate([
        { $match: { merchantId, status: 'failed', errorMessage: { $ne: null } } },
        { $group: { _id: '$errorMessage', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const confidenceCounts = new Map(confidenceAgg.map((b) => [b._id, b.count]));
    const confidenceDistribution = CONFIDENCE_BUCKETS.map((b) => ({
      range: b.label,
      count: confidenceCounts.get(b.boundary) || 0,
    }));

    return res.status(200).json({
      sizeDistribution: sizeAgg.map((s) => ({ size: s._id, count: s.count })),
      confidenceDistribution,
      errorBreakdown: errorAgg.map((e) => ({ error: e._id, count: e.count })),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch recommendation breakdown', error: err.message });
  }
}

async function exportReport(req, res) {
  try {
    const merchantId = req.merchant.merchantId;
    const filter = { merchantId };

    if (req.query.startDate) {
      const start = new Date(req.query.startDate);
      if (Number.isNaN(start.getTime())) {
        return res.status(400).json({ message: 'Invalid startDate' });
      }
      filter.createdAt = { ...filter.createdAt, $gte: start };
    }
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      if (Number.isNaN(end.getTime())) {
        return res.status(400).json({ message: 'Invalid endDate' });
      }
      filter.createdAt = { ...filter.createdAt, $lte: end };
    }

    const recommendations = await Recommendation.find(filter).sort({ createdAt: 1 }).lean();

    const headerRow = CSV_COLUMNS.map((c) => c.header).join(',');
    const rows = recommendations.map((r) => CSV_COLUMNS.map((c) => toCsvValue(c.get(r))).join(','));
    const csv = [headerRow, ...rows].join('\n');

    const filenameDate = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="recommendations-${filenameDate}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to export report', error: err.message });
  }
}

module.exports = { getDashboardStats, getUsageOverTime, getRecommendationBreakdown, exportReport };
