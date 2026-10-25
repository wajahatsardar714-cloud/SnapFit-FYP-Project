const express = require('express');
const { validateApiKey } = require('../middlewares/apiKeyMiddleware');
const { recommend } = require('../controllers/recommendController');
const { uploadShopperPhoto } = require('../utils/shopperPhotoUpload');

// Extra live-camera frames (~200 ms apart) allowed besides the main photo.
const MAX_EXTRA_FRAMES = 4;

const router = express.Router();

router.post('/', validateApiKey, uploadShopperPhoto({ extraFrames: MAX_EXTRA_FRAMES }), recommend);

module.exports = router;
