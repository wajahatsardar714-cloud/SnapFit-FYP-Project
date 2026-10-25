const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer, MongoMemoryReplSet } = require('mongodb-memory-server');

// Starting mongod can take a while when several test files boot one at once.
const DB_STARTUP_TIMEOUT_MS = 60000;

// Call at the top of a test file, before requiring the app: isolates uploads in
// a temp folder and gives every file its own in-memory MongoDB. Pass
// { replSet: true } for code that uses transactions (e.g. deleting a merchant).
function setupTestEnv({ replSet = false } = {}) {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapfit-products-'));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapfit-tmp-'));
  process.env.PRODUCT_UPLOAD_DIR = uploadDir;
  process.env.UPLOAD_TMP_DIR = tmpDir;
  process.env.JWT_SECRET = 'test-secret';
  process.env.AI_SERVICE_URL = 'http://ai.test';

  let mongo;
  beforeAll(async () => {
    mongo = replSet ? await MongoMemoryReplSet.create({ replSet: { count: 1 } }) : await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }, DB_STARTUP_TIMEOUT_MS);
  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    // Each test checks only its own files.
    fs.readdirSync(uploadDir).forEach((name) => fs.rmSync(path.join(uploadDir, name), { force: true }));
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
    fs.rmSync(uploadDir, { recursive: true, force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  return {
    uploadDir,
    listUploads: () => fs.readdirSync(uploadDir),
    listTmpPhotos: () => fs.readdirSync(tmpDir),
  };
}

function tokenFor(merchant) {
  return jwt.sign({ merchantId: merchant._id, email: merchant.email, role: merchant.role }, process.env.JWT_SECRET);
}

let merchantCount = 0;
async function createMerchant(overrides = {}) {
  const Merchant = require('../../src/models/Merchant');
  merchantCount += 1;
  return Merchant.create({
    name: 'Test Merchant',
    email: `merchant${merchantCount}@test.dev`,
    password: 'hashed',
    businessName: 'Test Shop',
    apiKey: `sk_test_${merchantCount}_${Date.now()}`,
    subscription: { plan: 'basic', status: 'active', requestsLimit: 500, requestsUsed: 0 },
    ...overrides,
  });
}

async function createSuperAdmin(overrides = {}) {
  const Merchant = require('../../src/models/Merchant');
  return Merchant.create({
    name: 'Super Admin',
    email: 'admin@snapfit.test',
    password: 'hashed',
    role: 'superadmin',
    ...overrides,
  });
}

async function createChart(merchant, overrides = {}) {
  const SizeChart = require('../../src/models/SizeChart');
  return SizeChart.create({
    merchantId: merchant._id,
    name: 'Tees',
    category: 'tops',
    unit: 'cm',
    sizes: [
      { label: 'S', measurements: { chest: { min: 86, max: 94 } } },
      { label: 'M', measurements: { chest: { min: 94, max: 102 } } },
      { label: 'L', measurements: { chest: { min: 102, max: 110 } } },
    ],
    ...overrides,
  });
}

module.exports = { setupTestEnv, tokenFor, createMerchant, createSuperAdmin, createChart };
