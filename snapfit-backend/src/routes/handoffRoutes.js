const express = require('express');
const { identifyMerchantByApiKey } = require('../middlewares/apiKeyMiddleware');
const {
  createHandoffSession,
  getHandoffStatus,
  getHandoffPhoto,
  uploadHandoffPhoto,
} = require('../controllers/handoffController');
const { uploadShopperPhoto } = require('../utils/shopperPhotoUpload');

const router = express.Router();

const uploadImage = uploadShopperPhoto({ filenamePrefix: 'handoff-', errorBody: (message) => ({ message }) });

// Desktop: create + poll + fetch (merchant-authenticated, but NOT billable --
// only the eventual /api/recommend call on the retrieved photo counts against
// the plan's quota, exactly as it already does for any other capture method).
router.post('/sessions', identifyMerchantByApiKey, createHandoffSession);
router.get('/sessions/:sessionId', identifyMerchantByApiKey, getHandoffStatus);
router.get('/sessions/:sessionId/photo', identifyMerchantByApiKey, getHandoffPhoto);

// Phone: upload, scoped only by the random sessionId from the QR code.
router.post('/sessions/:sessionId/photo', uploadImage, uploadHandoffPhoto);

// Dev-only, key-less desktop side for the web app's public /test/ai page, so the
// QR phone handoff can be tested without logging in for an API key. Sessions are
// scoped to a fixed pseudo-merchant; the phone still uploads via the shared
// /sessions/:sessionId/photo route above. Never mounted in production.
if (process.env.NODE_ENV !== 'production') {
  const useTestBenchMerchant = (req, res, next) => {
    req.merchant = { _id: 'ai-test-bench' };
    next();
  };

  router.post('/test-sessions', useTestBenchMerchant, createHandoffSession);
  router.get('/test-sessions/:sessionId', useTestBenchMerchant, getHandoffStatus);
  router.get('/test-sessions/:sessionId/photo', useTestBenchMerchant, getHandoffPhoto);
}

module.exports = router;
