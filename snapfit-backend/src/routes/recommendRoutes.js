const express = require('express');
const { validateApiKey } = require('../middlewares/apiKeyMiddleware');
const { recommend } = require('../controllers/recommendController');
const { uploadShopperPhoto, MAX_EXTRA_FRAMES } = require('../utils/shopperPhotoUpload');

const router = express.Router();

router.post('/', validateApiKey, uploadShopperPhoto({ extraFrames: MAX_EXTRA_FRAMES }), recommend);

module.exports = router;
