const express = require('express');
const { validateApiKey } = require('../middlewares/apiKeyMiddleware');
const { recommend } = require('../controllers/recommendController');
const { uploadShopperPhoto } = require('../utils/shopperPhotoUpload');

const router = express.Router();

router.post('/', validateApiKey, uploadShopperPhoto(), recommend);

module.exports = router;
