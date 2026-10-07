const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { imageSize } = require('image-size');

// Overridable so tests never write into the real uploads folder.
const PRODUCTS_DIR = process.env.PRODUCT_UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads', 'products');
const PRODUCT_IMAGE_URL_PREFIX = '/uploads/products/';
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const MIN_PRODUCT_IMAGE_SIDE_PX = 400;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// What image-size reports for the same formats, read from the file's own bytes.
const ALLOWED_DETECTED_TYPES = ['jpg', 'png', 'webp'];
const EXTENSION_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PRODUCTS_DIR),
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${EXTENSION_BY_MIME[file.mimetype]}`);
    },
  }),
  limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Product images must be JPEG, PNG or WebP'));
    }
    return cb(null, true);
  },
});

function removeFile(filePath) {
  return fs.promises.unlink(filePath).catch(() => {});
}

// Absolute disk path for a stored productImage URL path ("/uploads/products/x.png").
// Returns null for anything outside the products folder.
function productImageDiskPath(productImage) {
  if (!productImage || !productImage.startsWith(PRODUCT_IMAGE_URL_PREFIX)) return null;
  return path.join(PRODUCTS_DIR, path.basename(productImage));
}

function removeProductImage(productImage) {
  const diskPath = productImageDiskPath(productImage);
  return diskPath ? removeFile(diskPath) : Promise.resolve();
}

// Checks the uploaded bytes themselves (not the client-declared type): real
// JPEG/PNG/WebP, and large enough to warp onto a customer photo.
function checkImageFile(filePath) {
  let dimensions;
  try {
    dimensions = imageSize(fs.readFileSync(filePath));
  } catch {
    return 'This file could not be read as an image';
  }
  if (!ALLOWED_DETECTED_TYPES.includes(dimensions.type)) {
    return 'Product images must be JPEG, PNG or WebP';
  }
  if (Math.min(dimensions.width, dimensions.height) < MIN_PRODUCT_IMAGE_SIDE_PX) {
    return `Product images must be at least ${MIN_PRODUCT_IMAGE_SIDE_PX}px on the shorter side (this one is ${dimensions.width}×${dimensions.height})`;
  }
  return null;
}

// Multer `image` field, then content validation. With { required: true } a
// missing file is a 400; otherwise the request continues without one.
function uploadProductImage({ required = false } = {}) {
  return (req, res, next) => {
    upload.single('image')(req, res, async (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? `Product images must be ${MAX_PRODUCT_IMAGE_BYTES / (1024 * 1024)}MB or smaller`
            : err.message || 'Image upload failed';
        return res.status(400).json({ message });
      }
      if (!req.file) {
        return required ? res.status(400).json({ message: 'An image file is required' }) : next();
      }
      const problem = checkImageFile(req.file.path);
      if (problem) {
        await removeFile(req.file.path);
        return res.status(400).json({ message: problem });
      }
      return next();
    });
  };
}

function productImageUrlPath(file) {
  return `${PRODUCT_IMAGE_URL_PREFIX}${file.filename}`;
}

module.exports = {
  uploadProductImage,
  productImageUrlPath,
  removeProductImage,
  removeFile,
  PRODUCTS_DIR,
  MAX_PRODUCT_IMAGE_BYTES,
  MIN_PRODUCT_IMAGE_SIDE_PX,
};
