const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { identifyMerchantByApiKey } = require('../middlewares/apiKeyMiddleware');
const {
  createHandoffSession,
  getHandoffStatus,
  getHandoffPhoto,
  uploadHandoffPhoto,
} = require('../controllers/handoffController');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'tmp');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `handoff-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

function uploadImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Image upload failed' });
    }
    next();
  });
}

// Desktop: create + poll + fetch (merchant-authenticated, but NOT billable --
// only the eventual /api/recommend call on the retrieved photo counts against
// the plan's quota, exactly as it already does for any other capture method).
router.post('/sessions', identifyMerchantByApiKey, createHandoffSession);
router.get('/sessions/:sessionId', identifyMerchantByApiKey, getHandoffStatus);
router.get('/sessions/:sessionId/photo', identifyMerchantByApiKey, getHandoffPhoto);

// Phone: upload, scoped only by the random sessionId from the QR code.
router.post('/sessions/:sessionId/photo', uploadImage, uploadHandoffPhoto);

module.exports = router;
