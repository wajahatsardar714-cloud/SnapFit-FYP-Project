// Client-side mirror of the backend's product-image rules
// (snapfit-backend/src/utils/productImageUpload.js). The server re-checks the
// real file contents and resolution; this just fails fast in the browser.
export const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_MIN_SIDE_PX = 400;
export const PRODUCT_IMAGE_ACCEPT = PRODUCT_IMAGE_TYPES.join(',');
export const PRODUCT_IMAGE_HINT = `JPG, PNG or WebP, up to 5MB, at least ${PRODUCT_IMAGE_MIN_SIDE_PX}px on the shorter side. A transparent PNG or a plain-background flat-lay works best — try-on removes the background.`;

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

export function validateProductImageFile(file) {
  if (!PRODUCT_IMAGE_TYPES.includes(file.type)) return 'Product images must be JPEG, PNG or WebP.';
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) return 'Product images must be 5MB or smaller.';
  return null;
}

export function resolveProductImageUrl(productImage) {
  if (!productImage) return null;
  return productImage.startsWith('http') ? productImage : `${API_ORIGIN}${productImage}`;
}

// Matches the backend's mapping.tryOnStatus values.
export const TRY_ON_STATUS = {
  ready: { label: 'Try-on ready', variant: 'success' },
  image_missing: { label: 'Image missing', variant: 'warning' },
  anchors_missing: { label: 'Anchors missing', variant: 'warning' },
};
