const express = require('express');
const { protect, requireMerchant } = require('../middlewares/authMiddleware');
const { requireActiveSubscription } = require('../middlewares/subscriptionMiddleware');
const {
  createChart,
  getCharts,
  getChartById,
  updateChart,
  deleteChart,
} = require('../controllers/sizeChartController');

const router = express.Router();

router.use(protect, requireMerchant, requireActiveSubscription);

router.post('/', createChart);
router.get('/', getCharts);
router.get('/:id', getChartById);
router.put('/:id', updateChart);
router.delete('/:id', deleteChart);

module.exports = router;
