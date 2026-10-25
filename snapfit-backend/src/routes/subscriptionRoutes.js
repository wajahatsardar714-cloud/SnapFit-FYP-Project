const express = require('express');
const { protect, requireMerchant } = require('../middlewares/authMiddleware');
const {
  getPlans,
  selectPlan,
  getSubscriptionStatus,
  cancelSubscription,
} = require('../controllers/subscriptionController');

const router = express.Router();

router.get('/plans', getPlans);
router.post('/select', protect, requireMerchant, selectPlan);
router.get('/status', protect, requireMerchant, getSubscriptionStatus);
router.post('/cancel', protect, requireMerchant, cancelSubscription);

module.exports = router;
