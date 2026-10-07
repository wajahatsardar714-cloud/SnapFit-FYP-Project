const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Shopper photos are only held here while one request is processed, then
// deleted (never persisted). Overridable so tests can watch the folder.
const SHOPPER_TMP_DIR = process.env.UPLOAD_TMP_DIR || path.join(__dirname, '..', '..', 'uploads', 'tmp');
const MAX_SHOPPER_PHOTO_BYTES = 10 * 1024 * 1024;

fs.mkdirSync(SHOPPER_TMP_DIR, { recursive: true });

function makeUpload(filenamePrefix) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, SHOPPER_TMP_DIR),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `${filenamePrefix}${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { fileSize: MAX_SHOPPER_PHOTO_BYTES },
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed'));
      }
      return cb(null, true);
    },
  });
}

// Multer middleware for a shopper photo in the `image` field. errorBody shapes
// the 400 response so each route keeps its existing error format.
function uploadShopperPhoto({ filenamePrefix = '', errorBody = (message) => ({ success: false, message }) } = {}) {
  const upload = makeUpload(filenamePrefix);
  return (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err) {
        return res.status(400).json(errorBody(err.message || 'Image upload failed'));
      }
      return next();
    });
  };
}

module.exports = { uploadShopperPhoto, SHOPPER_TMP_DIR };
