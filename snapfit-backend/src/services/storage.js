// Where merchant product images live. Two drivers, picked by STORAGE_DRIVER:
//
//   local (default) -- files in uploads/products, served by the back-end at
//                      /uploads/products/<file>. Used by tests and offline dev.
//   r2              -- Cloudflare R2 (S3-compatible) bucket, served from
//                      R2_PUBLIC_URL/<key>.
//
// Both expose { put(key, buffer, contentType) -> { key, url }, remove(keyOrUrl),
// urlFor(key) }. remove() also understands images stored by the other driver
// (old /uploads/products paths after moving to R2), and never deletes anything
// outside the product folder or the bucket's merchants/ prefix.
const fs = require('fs');
const path = require('path');

const LOCAL_URL_PREFIX = '/uploads/products/';
// Every product image key starts here: merchants/<id>/products/<product>/<file>.
const KEY_PREFIX = 'merchants/';
// Keys carry a timestamp + random part, so an object never changes once written.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const R2_VARIABLES = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'];
const DRIVERS = ['local', 'r2'];

function defaultProductsDir(env = process.env) {
  return env.PRODUCT_UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads', 'products');
}

function isAbsoluteUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

// A key we wrote ourselves: merchants/... with no "..", backslashes or empty parts.
function isProductKey(key) {
  if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX)) return false;
  const parts = key.split('/');
  return parts.every((part) => part && part !== '.' && part !== '..') && !key.includes('\\');
}

// --- local ---------------------------------------------------------------------

// Files sit flat in the folder under the key's last part (<timestamp>-<random>.webp),
// exactly as product images always have.
function createLocalDriver({ dir = defaultProductsDir() } = {}) {
  fs.mkdirSync(dir, { recursive: true });

  const fileName = (keyOrPath) => path.basename(String(keyOrPath));

  function urlFor(key) {
    return `${LOCAL_URL_PREFIX}${fileName(key)}`;
  }

  async function put(key, buffer) {
    await fs.promises.writeFile(path.join(dir, fileName(key)), buffer);
    return { key, url: urlFor(key) };
  }

  // Accepts a /uploads/products/<file> path or a key; anything else is ignored.
  async function remove(keyOrUrl) {
    if (typeof keyOrUrl !== 'string') return false;
    if (!keyOrUrl.startsWith(LOCAL_URL_PREFIX) && !isProductKey(keyOrUrl)) return false;
    const name = fileName(keyOrUrl);
    if (!name || name === '.' || name === '..') return false;
    return fs.promises.unlink(path.join(dir, name)).then(
      () => true,
      () => false
    );
  }

  // Disk path of a stored /uploads/products/<file> image, or null.
  function diskPathFor(url) {
    if (typeof url !== 'string' || !url.startsWith(LOCAL_URL_PREFIX)) return null;
    return path.join(dir, fileName(url));
  }

  return { driver: 'local', dir, put, remove, urlFor, diskPathFor };
}

// --- r2 ------------------------------------------------------------------------

function missingR2Variables(env = process.env) {
  return R2_VARIABLES.filter((name) => !String(env[name] || '').trim());
}

// Names the missing variables only, never their values.
function assertR2Config(env = process.env) {
  const missing = missingR2Variables(env);
  if (missing.length) {
    throw new Error(
      `STORAGE_DRIVER=r2 needs ${missing.join(', ')} to be set (see snapfit-backend/.env.example)`
    );
  }
}

function createR2Driver({ env = process.env, client } = {}) {
  assertR2Config(env);
  const accountId = env.R2_ACCOUNT_ID.trim();
  const bucket = env.R2_BUCKET.trim();
  const publicUrl = env.R2_PUBLIC_URL.trim().replace(/\/+$/, '');
  const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

  const s3 =
    client ||
    new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID.trim(), secretAccessKey: env.R2_SECRET_ACCESS_KEY.trim() },
    });

  function urlFor(key) {
    return `${publicUrl}/${key}`;
  }

  // The key of one of our public URLs (or a bare key), or null for anything else.
  function keyOf(keyOrUrl) {
    if (typeof keyOrUrl !== 'string') return null;
    let key = keyOrUrl;
    if (isAbsoluteUrl(keyOrUrl)) {
      if (!keyOrUrl.startsWith(`${publicUrl}/`)) return null;
      key = keyOrUrl.slice(publicUrl.length + 1).split(/[?#]/)[0];
    }
    return isProductKey(key) ? key : null;
  }

  async function put(key, buffer, contentType) {
    if (!isProductKey(key)) throw new Error('Refusing to store an object outside merchants/');
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: CACHE_CONTROL,
      })
    );
    return { key, url: urlFor(key) };
  }

  async function remove(keyOrUrl) {
    const key = keyOf(keyOrUrl);
    if (!key) return false;
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (err) {
      // A leftover object costs little; failing the merchant's request costs more.
      console.warn(`Could not delete product image ${key}: ${err.name || 'Error'}`);
      return false;
    }
  }

  return { driver: 'r2', bucket, publicUrl, put, remove, urlFor, keyOf, client: s3 };
}

// --- the storage the app uses ---------------------------------------------------

function driverName(env = process.env) {
  const name = String(env.STORAGE_DRIVER || 'local').trim().toLowerCase();
  if (!DRIVERS.includes(name)) {
    throw new Error(`STORAGE_DRIVER must be one of ${DRIVERS.join(' | ')} (got "${env.STORAGE_DRIVER}")`);
  }
  return name;
}

// The active driver for put/urlFor, plus a remove() that sends each image to the
// driver that stored it: /uploads/products/... to the local folder, R2 URLs (and
// bare keys, when R2 is active) to the bucket.
function createStorage({ env = process.env, s3Client, localDir } = {}) {
  const name = driverName(env);
  const local = createLocalDriver({ dir: localDir || defaultProductsDir(env) });
  let r2 = null;
  if (name === 'r2') {
    r2 = createR2Driver({ env, client: s3Client });
  } else if (missingR2Variables(env).length === 0) {
    // Back on local after a move to R2: still able to clean up R2 images.
    r2 = createR2Driver({ env, client: s3Client });
  }
  const active = name === 'r2' ? r2 : local;

  async function remove(keyOrUrl) {
    if (typeof keyOrUrl !== 'string' || !keyOrUrl) return false;
    if (keyOrUrl.startsWith(LOCAL_URL_PREFIX)) return local.remove(keyOrUrl);
    if (isAbsoluteUrl(keyOrUrl)) return r2 ? r2.remove(keyOrUrl) : false;
    return active.remove(keyOrUrl);
  }

  return {
    driver: name,
    put: active.put,
    urlFor: active.urlFor,
    remove,
    local,
    r2,
  };
}

let current = null;

// Built once from process.env; the first call (app start) fails fast on bad config.
function getStorage() {
  if (!current) current = createStorage();
  return current;
}

// Tests swap in their own storage (e.g. R2 with a mocked client); null resets.
function setStorage(storage) {
  current = storage;
}

module.exports = {
  getStorage,
  setStorage,
  createStorage,
  createLocalDriver,
  createR2Driver,
  assertR2Config,
  isAbsoluteUrl,
  isProductKey,
  defaultProductsDir,
  LOCAL_URL_PREFIX,
  KEY_PREFIX,
  CACHE_CONTROL,
  R2_VARIABLES,
};
