const mongoose = require('mongoose');
const Feedback = require('../models/Feedback');
const Recommendation = require('../models/Recommendation');

const FIT_RESULTS = ['too_small', 'slightly_small', 'perfect', 'slightly_large', 'too_large'];
const ACCEPTABLE_FITS = ['slightly_small', 'perfect', 'slightly_large'];

async function submitFeedback(req, res) {
  const { recommendationId, fitResult, comment } = req.body;
  const merchant = req.merchant;

  if (!recommendationId || !mongoose.Types.ObjectId.isValid(recommendationId)) {
    return res.status(400).json({ message: 'A valid recommendationId is required' });
  }
  if (!FIT_RESULTS.includes(fitResult)) {
    return res.status(400).json({ message: `fitResult must be one of: ${FIT_RESULTS.join(', ')}` });
  }

  try {
    const recommendation = await Recommendation.findOne({ _id: recommendationId, merchantId: merchant._id });
    if (!recommendation) {
      return res.status(404).json({ message: 'Recommendation not found' });
    }

    const feedback = await Feedback.create({
      recommendationId,
      merchantId: merchant._id,
      fitResult,
      comment,
    });

    return res.status(201).json({ success: true, feedback });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to submit feedback', error: err.message });
  }
}

async function getFeedbackStats(req, res) {
  try {
    const merchantId = new mongoose.Types.ObjectId(req.merchant.merchantId);

    const [totalCount, breakdownAgg, perSizeAgg] = await Promise.all([
      Feedback.countDocuments({ merchantId }),
      Feedback.aggregate([{ $match: { merchantId } }, { $group: { _id: '$fitResult', count: { $sum: 1 } } }]),
      Feedback.aggregate([
        { $match: { merchantId } },
        {
          $lookup: {
            from: 'recommendations',
            localField: 'recommendationId',
            foreignField: '_id',
            as: 'recommendation',
          },
        },
        { $unwind: '$recommendation' },
        { $group: { _id: '$recommendation.recommendedSize', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    const breakdownCounts = new Map(breakdownAgg.map((b) => [b._id, b.count]));
    const acceptableCount = ACCEPTABLE_FITS.reduce((sum, key) => sum + (breakdownCounts.get(key) || 0), 0);
    const accuracyRate = totalCount > 0 ? Math.round((acceptableCount / totalCount) * 1000) / 10 : 0;

    const breakdown = FIT_RESULTS.map((key) => ({ fitResult: key, count: breakdownCounts.get(key) || 0 }));

    return res.status(200).json({
      totalFeedback: totalCount,
      accuracyRate,
      breakdown,
      feedbackPerSize: perSizeAgg.map((s) => ({ size: s._id, count: s.count })),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch feedback stats', error: err.message });
  }
}

module.exports = { submitFeedback, getFeedbackStats };
