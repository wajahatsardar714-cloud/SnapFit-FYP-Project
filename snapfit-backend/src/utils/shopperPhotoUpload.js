const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Shopper photos are only held here while one request is processed, then
// deleted (never persisted). Overridable so tests can watch the folder.
const SHOPPER_TMP_DIR = process.env.UPLOAD_TMP_DIR || path.join(__dirname, '..', '..', 'uploads', 'tmp');
const MAX_SHOPPER_PHOTO_BYTES = 10 * 1024 * 1024;
// Extra live-camera frames (~200 ms apart) a recommendation accepts besides the
// main photo.
const MAX_EXTRA_FRAMES = 4;

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

// Multer reports a `frames` count over maxCount as LIMIT_UNEXPECTED_FILE.
function uploadErrorMessage(err, extraFrames) {
  if (extraFrames > 0 && err.code === 'LIMIT_UNEXPECTED_FILE' && err.field === 'frames') {
    return `At most ${extraFrames} extra frames are allowed`;
  }
  return err.message || 'Image upload failed';
}

// Multer middleware for a shopper photo in the `image` field. errorBody shapes
// the 400 response so each route keeps its existing error format. extraFrames
// (opt-in) also accepts up to that many extra live-camera frames in a repeatable
// `frames` field, exposed as req.frames (always an array). On a rejected upload
// multer deletes every file it already wrote.
function uploadShopperPhoto({
  filenamePrefix = '',
  errorBody = (message) => ({ success: false, message }),
  extraFrames = 0,
} = {}) {
  const upload = makeUpload(filenamePrefix);
  const parse =
    extraFrames > 0
      ? upload.fields([
          { name: 'image', maxCount: 1 },
          { name: 'frames', maxCount: extraFrames },
        ])
      : upload.single('image');
  return (req, res, next) => {
    parse(req, res, (err) => {
      if (err) {
        return res.status(400).json(errorBody(uploadErrorMessage(err, extraFrames)));
      }
      if (extraFrames > 0) {
        const { image = [], frames = [] } = req.files || {};
        req.file = image[0];
        req.frames = frames;
      }
      return next();
    });
  };
}

module.exports = { uploadShopperPhoto, SHOPPER_TMP_DIR, MAX_EXTRA_FRAMES };
