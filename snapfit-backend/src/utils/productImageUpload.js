const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const { imageSize } = require('image-size');
const { getStorage, defaultProductsDir } = require('../services/storage');

// Overridable (PRODUCT_UPLOAD_DIR) so tests never write into the real uploads folder.
const PRODUCTS_DIR = defaultProductsDir();
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const MIN_PRODUCT_IMAGE_SIDE_PX = 400;
// Stored images are downscaled to fit this box (never upscaled)...
const MAX_STORED_SIDE_PX = 1600;
// ...and get a small copy for lists and cards.
const THUMB_SIDE_PX = 400;
const WEBP_QUALITY = 85;
const THUMB_WEBP_QUALITY = 80;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// What image-size reports for the same formats, read from the file's own bytes.
const ALLOWED_DETECTED_TYPES = ['jpg', 'png', 'webp'];
const NOT_AN_IMAGE = 'This file could not be read as an image';

// Kept in memory: the bytes are checked and re-encoded before anything is stored.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Product images must be JPEG, PNG or WebP'));
    }
    return cb(null, true);
  },
});

// Checks the uploaded bytes themselves (not the client-declared type): real
// JPEG/PNG/WebP, and large enough to warp onto a customer photo.
function checkImageBuffer(buffer) {
  let dimensions;
  try {
    dimensions = imageSize(buffer);
  } catch {
    return NOT_AN_IMAGE;
  }
  if (!ALLOWED_DETECTED_TYPES.includes(dimensions.type)) {
    return 'Product images must be JPEG, PNG or WebP';
  }
  if (Math.min(dimensions.width, dimensions.height) < MIN_PRODUCT_IMAGE_SIDE_PX) {
    return `Product images must be at least ${MIN_PRODUCT_IMAGE_SIDE_PX}px on the shorter side (this one is ${dimensions.width}×${dimensions.height})`;
  }
  return null;
}

// Upright (EXIF orientation applied), metadata stripped (sharp keeps none unless
// asked), WebP, and shrunk only when the longest side is over 1600px. Resizing
// keeps the aspect ratio, so anchor points -- stored as 0-1 fractions of the
// image's width and height -- mean the same spot on the stored image as on the
// one the merchant clicked.
async function processProductImage(buffer) {
  const { data: image, info } = await sharp(buffer)
    .rotate()
    .resize({ width: MAX_STORED_SIDE_PX, height: MAX_STORED_SIDE_PX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  const thumb = await makeThumbnail(image);
  return { image, thumb, width: info.width, height: info.height, contentType: 'image/webp' };
}

// Storage keys must be plain path parts; product IDs are free text.
function safeProductId(productId) {
  const safe = String(productId ?? '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 100);
  return !safe || /^\.+$/.test(safe) ? '_' : safe;
}

// merchants/<merchantId>/products/<safeProductId>/<timestamp>-<random>.<ext>
// and the matching ...-thumb.webp. `ext` is only not webp for images moved
// as-is by the cloud migration.
function productImageKeys(merchantId, productId, { ext = 'webp', now = Date.now() } = {}) {
  const base = `merchants/${merchantId}/products/${safeProductId(productId)}/${now}-${crypto.randomInt(1e9)}`;
  return { image: `${base}.${ext}`, thumb: `${base}-thumb.webp` };
}

// The 400px thumbnail stored next to every image.
function makeThumbnail(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: THUMB_SIDE_PX, height: THUMB_SIDE_PX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: THUMB_WEBP_QUALITY })
    .toBuffer();
}

// Stores a processed upload; resolves to the fields to save on the mapping.
async function storeProductImage(merchantId, productId, processed, storage = getStorage()) {
  const keys = productImageKeys(merchantId, productId);
  const image = await storage.put(keys.image, processed.image, processed.contentType);
  try {
    const thumb = await storage.put(keys.thumb, processed.thumb, processed.contentType);
    return { productImage: image.url, productImageThumb: thumb.url };
  } catch (err) {
    await storage.remove(image.url);
    throw err;
  }
}

// Removes a mapping's stored image and thumbnail (either may be missing; old
// local paths and R2 URLs both work).
function removeProductImages({ productImage, productImageThumb } = {}, storage = getStorage()) {
  return Promise.all([productImage, productImageThumb].filter(Boolean).map((ref) => storage.remove(ref)));
}

// Multer `image` field, content validation, then processing: on success
// req.productImageUpload holds the WebP image + thumbnail, ready for
// storeProductImage once the controller knows which product it belongs to. With
// { required: true } a missing file is a 400; otherwise the request continues
// without one.
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
      const problem = checkImageBuffer(req.file.buffer);
      if (problem) {
        return res.status(400).json({ message: problem });
      }
      try {
        req.productImageUpload = await processProductImage(req.file.buffer);
      } catch {
        return res.status(400).json({ message: NOT_AN_IMAGE });
      }
      return next();
    });
  };
}

module.exports = {
  uploadProductImage,
  processProductImage,
  makeThumbnail,
  checkImageBuffer,
  storeProductImage,
  removeProductImages,
  productImageKeys,
  safeProductId,
  PRODUCTS_DIR,
  MAX_PRODUCT_IMAGE_BYTES,
  MIN_PRODUCT_IMAGE_SIDE_PX,
  MAX_STORED_SIDE_PX,
  THUMB_SIDE_PX,
};
