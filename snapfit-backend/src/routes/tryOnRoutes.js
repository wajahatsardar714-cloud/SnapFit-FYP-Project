const express = require('express');
const { validateApiKey } = require('../middlewares/apiKeyMiddleware');
const { tryOn } = require('../controllers/tryOnController');
const { uploadShopperPhoto } = require('../utils/shopperPhotoUpload');

const router = express.Router();

router.post('/', validateApiKey, uploadShopperPhoto(), tryOn);

module.exports = router;
