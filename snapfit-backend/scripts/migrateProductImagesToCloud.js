// One-time move of product images kept on this server's disk
// (productImage = "/uploads/products/<file>") to the R2 bucket.
//
//   node scripts/migrateProductImagesToCloud.js --dry-run   # list what would move
//   node scripts/migrateProductImagesToCloud.js             # move them
//
// Needs MONGODB_URI and the R2_* variables in snapfit-backend/.env. Each image
// is uploaded byte for byte (same format, same size), so anchor points placed on
// it stay valid; a 400px WebP thumbnail is added next to it. The mapping is
// updated only after both uploads succeed, and only if it still points at the
// same local file. Local files are kept, as a backup. Safe to run again: moved
// mappings no longer start with /uploads/products/ and are not picked up.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { imageSize } = require('image-size');
const ProductMapping = require('../src/models/ProductMapping');
const { createStorage, assertR2Config, LOCAL_URL_PREFIX } = require('../src/services/storage');
const { productImageKeys, makeThumbnail } = require('../src/utils/productImageUpload');

const FORMATS = {
  jpg: { ext: 'jpg', contentType: 'image/jpeg' },
  png: { ext: 'png', contentType: 'image/png' },
  webp: { ext: 'webp', contentType: 'image/webp' },
};
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function formatOf(buffer) {
  try {
    return FORMATS[imageSize(buffer).type] || null;
  } catch {
    return null;
  }
}

// Resolves to { found, migrated, skipped, failed }; migrated/skipped/failed list
// { mappingId, productId, from, to?, reason? }. `storage` is from createStorage()
// and must have R2 set up (storage.r2), except for a dry run.
async function migrateProductImagesToCloud({ storage, dryRun = false } = {}) {
  const r2 = storage.r2;
  if (!dryRun && !r2) throw new Error('R2 is not configured (set the R2_* variables)');

  const mappings = await ProductMapping.find({ productImage: { $regex: `^${escapeRegExp(LOCAL_URL_PREFIX)}` } })
    .select('merchantId productId productImage')
    .lean();
  const summary = { found: mappings.length, migrated: [], skipped: [], failed: [] };

  for (const mapping of mappings) {
    const entry = { mappingId: String(mapping._id), productId: mapping.productId, from: mapping.productImage };
    const diskPath = storage.local.diskPathFor(mapping.productImage);
    let buffer;
    try {
      buffer = await fs.promises.readFile(diskPath);
    } catch {
      summary.skipped.push({ ...entry, reason: 'file not found on disk' });
      continue;
    }
    const format = formatOf(buffer);
    if (!format) {
      summary.skipped.push({ ...entry, reason: 'not a JPEG, PNG or WebP image' });
      continue;
    }

    const keys = productImageKeys(String(mapping.merchantId), mapping.productId, { ext: format.ext });
    if (dryRun) {
      summary.migrated.push({ ...entry, to: r2 ? r2.urlFor(keys.image) : keys.image });
      continue;
    }

    const uploaded = [];
    try {
      const thumbBuffer = await makeThumbnail(buffer);
      const image = await r2.put(keys.image, buffer, format.contentType);
      uploaded.push(image.url);
      const thumb = await r2.put(keys.thumb, thumbBuffer, 'image/webp');
      uploaded.push(thumb.url);

      const { modifiedCount } = await ProductMapping.updateOne(
        { _id: mapping._id, productImage: mapping.productImage },
        { $set: { productImage: image.url, productImageThumb: thumb.url } }
      );
      if (!modifiedCount) {
        await Promise.all(uploaded.map((url) => r2.remove(url)));
        summary.skipped.push({ ...entry, reason: 'image changed while migrating' });
        continue;
      }
      summary.migrated.push({ ...entry, to: image.url });
    } catch (err) {
      await Promise.all(uploaded.map((url) => r2.remove(url)));
      summary.failed.push({ ...entry, reason: err.message });
    }
  }
  return summary;
}

function printSummary(summary, { dryRun }) {
  const verb = dryRun ? 'would move' : 'moved';
  console.log(`${summary.found} product image(s) on local disk.`);
  summary.migrated.forEach((m) => console.log(`  ${verb}  ${m.productId}: ${m.from} -> ${m.to}`));
  summary.skipped.forEach((m) => console.log(`  skipped ${m.productId}: ${m.from} (${m.reason})`));
  summary.failed.forEach((m) => console.log(`  FAILED  ${m.productId}: ${m.from} (${m.reason})`));
  console.log(
    `${dryRun ? 'Dry run: ' : ''}${summary.migrated.length} ${verb}, ${summary.skipped.length} skipped, ${summary.failed.length} failed.`
  );
  if (!dryRun && summary.migrated.length) {
    console.log('Local files were kept in uploads/products as a backup; delete them once you have checked the images.');
  }
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const dryRun = process.argv.includes('--dry-run');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (!dryRun) assertR2Config(process.env);

  const storage = createStorage();
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const summary = await migrateProductImagesToCloud({ storage, dryRun });
    printSummary(summary, { dryRun });
    if (summary.failed.length) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Product image migration failed:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { migrateProductImagesToCloud, printSummary };
