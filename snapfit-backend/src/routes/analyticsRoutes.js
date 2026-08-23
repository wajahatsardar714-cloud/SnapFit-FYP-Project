const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const {
  getDashboardStats,
  getUsageOverTime,
  getRecommendationBreakdown,
  getRecentRecommendations,
  exportReport,
} = require('../controllers/analyticsController');

const router = express.Router();

router.use(protect);

router.get('/dashboard', getDashboardStats);
router.get('/usage', getUsageOverTime);
router.get('/breakdown', getRecommendationBreakdown);
router.get('/recent', getRecentRecommendations);
router.get('/export', exportReport);

module.exports = router;
