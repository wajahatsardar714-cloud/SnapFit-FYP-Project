const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const { generateApiKey, getApiKey, regenerateApiKey } = require('../controllers/apiKeyController');

const router = express.Router();

router.post('/generate', protect, generateApiKey);
router.get('/', protect, getApiKey);
router.post('/regenerate', protect, regenerateApiKey);

module.exports = router;
