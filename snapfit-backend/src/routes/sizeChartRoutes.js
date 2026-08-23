const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const {
  createChart,
  getCharts,
  getChartById,
  updateChart,
  deleteChart,
} = require('../controllers/sizeChartController');

const router = express.Router();

router.use(protect);

router.post('/', createChart);
router.get('/', getCharts);
router.get('/:id', getChartById);
router.put('/:id', updateChart);
router.delete('/:id', deleteChart);

module.exports = router;
