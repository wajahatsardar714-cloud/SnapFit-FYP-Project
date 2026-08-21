const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const {
  getPlans,
  selectPlan,
  getSubscriptionStatus,
  cancelSubscription,
} = require('../controllers/subscriptionController');

const router = express.Router();

router.get('/plans', getPlans);
router.post('/select', protect, selectPlan);
router.get('/status', protect, getSubscriptionStatus);
router.post('/cancel', protect, cancelSubscription);

module.exports = router;
