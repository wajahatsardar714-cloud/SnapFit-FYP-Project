const express = require('express');
const { protect, requireMerchant } = require('../middlewares/authMiddleware');
const { generateApiKey, getApiKey, regenerateApiKey } = require('../controllers/apiKeyController');

const router = express.Router();

router.use(protect, requireMerchant);

router.post('/generate', generateApiKey);
router.get('/', getApiKey);
router.post('/regenerate', regenerateApiKey);

module.exports = router;
