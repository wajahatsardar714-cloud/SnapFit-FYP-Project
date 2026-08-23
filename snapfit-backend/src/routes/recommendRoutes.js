const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { validateApiKey } = require('../middlewares/apiKeyMiddleware');
const { recommend } = require('../controllers/recommendController');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'tmp');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
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
      return res.status(400).json({ success: false, message: err.message || 'Image upload failed' });
    }
    next();
  });
}

router.post('/', validateApiKey, uploadImage, recommend);

module.exports = router;
