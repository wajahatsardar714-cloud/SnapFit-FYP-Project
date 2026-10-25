const express = require('express');
const { validateApiKey } = require('../middlewares/apiKeyMiddleware');
const { protect, requireMerchant } = require('../middlewares/authMiddleware');
const { requireActiveSubscription } = require('../middlewares/subscriptionMiddleware');
const { submitFeedback, getFeedbackStats } = require('../controllers/feedbackController');

const router = express.Router();

router.post('/', validateApiKey, submitFeedback);
router.get('/stats', protect, requireMerchant, requireActiveSubscription, getFeedbackStats);

module.exports = router;
