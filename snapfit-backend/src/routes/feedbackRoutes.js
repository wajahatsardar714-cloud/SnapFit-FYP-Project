const express = require('express');
const { validateApiKey } = require('../middlewares/apiKeyMiddleware');
const { protect } = require('../middlewares/authMiddleware');
const { submitFeedback, getFeedbackStats } = require('../controllers/feedbackController');

const router = express.Router();

router.post('/', validateApiKey, submitFeedback);
router.get('/stats', protect, getFeedbackStats);

module.exports = router;
