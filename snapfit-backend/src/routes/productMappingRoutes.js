const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middlewares/authMiddleware');
const {
  mapProduct,
  getProductMappings,
  removeMapping,
  saveAnchorPoints,
  getAnchorPointsForProduct,
} = require('../controllers/productMappingController');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'products');
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

function uploadProductImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Image upload failed' });
    }
    next();
  });
}

// Internal, service-to-service lookup for the AI microservice's try-on endpoint
// (Phase 12 / Prompt 30) -- no merchant credential exists in that context, so this
// is deliberately not behind `protect`. It only discloses a product photo URL and
// its click points, not merchant account data, which keeps the exposure low for an
// FYP-scope deployment; a hardened production setup would put this behind a
// shared internal secret or network-level isolation instead.
router.get('/anchor-points', getAnchorPointsForProduct);

router.use(protect);

router.post('/map', mapProduct);
router.get('/mappings', getProductMappings);
router.delete('/map/:id', removeMapping);
router.put('/:id/anchor-points', uploadProductImage, saveAnchorPoints);

module.exports = router;
