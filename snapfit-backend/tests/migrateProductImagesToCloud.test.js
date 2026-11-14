const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { setupTestEnv, createMerchant, createChart } = require('./helpers/testApp');
const { makePng } = require('./helpers/images');

const env = setupTestEnv();
const ProductMapping = require('../src/models/ProductMapping');
const { createStorage } = require('../src/services/storage');
const { migrateProductImagesToCloud, printSummary } = require('../scripts/migrateProductImagesToCloud');

const PUBLIC_URL = 'https://cdn.snapfit.test';
const R2_ENV = {
  STORAGE_DRIVER: 'r2',
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'snapfit-test',
  R2_PUBLIC_URL: PUBLIC_URL,
};
const ANCHORS = {
  shoulderLeft: { x: 0.3, y: 0.2 },
  shoulderRight: { x: 0.7, y: 0.2 },
  hipLeft: { x: 0.32, y: 0.6 },
  hipRight: { x: 0.68, y: 0.6 },
};

const send = jest.fn(async () => ({}));
let storage;
let merchant;
let chart;

beforeEach(async () => {
  send.mockReset();
  send.mockResolvedValue({});
  storage = createStorage({ env: R2_ENV, s3Client: { send }, localDir: env.uploadDir });
  merchant = await createMerchant();
  chart = await createChart(merchant);
});
afterEach(() => jest.restoreAllMocks());

const inputs = (type) => send.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd instanceof type).map((cmd) => cmd.input);

async function localMapping(productId, fileName, bytes, extra = {}) {
  fs.writeFileSync(path.join(env.uploadDir, fileName), bytes);
  return ProductMapping.create({
    merchantId: merchant._id,
    productId,
    sizeChartId: chart._id,
    productImage: `/uploads/products/${fileName}`,
    anchorPoints: ANCHORS,
    ...extra,
  });
}

describe('migrateProductImagesToCloud', () => {
  it('a dry run lists what would move and changes nothing', async () => {
    await localMapping('SKU-1', 'a.png', makePng(500, 500));

    const summary = await migrateProductImagesToCloud({ storage, dryRun: true });

    expect(summary.found).toBe(1);
    expect(summary.migrated).toEqual([
      expect.objectContaining({
        productId: 'SKU-1',
        from: '/uploads/products/a.png',
        to: expect.stringMatching(new RegExp(`^${PUBLIC_URL}/merchants/${merchant._id}/products/SKU-1/\\d+-\\d+\\.png$`)),
      }),
    ]);
    expect(send).not.toHaveBeenCalled();
    expect((await ProductMapping.findOne({ productId: 'SKU-1' })).productImage).toBe('/uploads/products/a.png');
  });

  it('a dry run works without R2 set up', async () => {
    await localMapping('SKU-1', 'a.png', makePng(500, 500));
    const localOnly = createStorage({ env: {}, localDir: env.uploadDir });

    const summary = await migrateProductImagesToCloud({ storage: localOnly, dryRun: true });

    expect(summary.migrated[0].to).toMatch(/^merchants\/.+\.png$/);
    await expect(migrateProductImagesToCloud({ storage: localOnly })).rejects.toThrow(/R2 is not configured/);
  });

  it('uploads the file byte for byte, adds a thumbnail, updates the mapping and keeps the local file', async () => {
    const png = makePng(500, 640);
    const jpeg = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#336699' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    await localMapping('SKU-1', 'a.png', png);
    await localMapping('SKU-2', 'b.jpg', jpeg);
    // Already in the cloud: left alone.
    await ProductMapping.create({
      merchantId: merchant._id,
      productId: 'SKU-3',
      sizeChartId: chart._id,
      productImage: `${PUBLIC_URL}/merchants/x/products/SKU-3/1-1.webp`,
    });

    const summary = await migrateProductImagesToCloud({ storage });

    expect(summary.found).toBe(2);
    expect(summary.migrated).toHaveLength(2);
    expect(summary.failed).toEqual([]);

    const puts = inputs(PutObjectCommand);
    const byKey = Object.fromEntries(puts.map((p) => [p.Key, p]));
    const one = await ProductMapping.findOne({ productId: 'SKU-1' });
    const two = await ProductMapping.findOne({ productId: 'SKU-2' });

    for (const [mapping, bytes, ext, type] of [
      [one, png, 'png', 'image/png'],
      [two, jpeg, 'jpg', 'image/jpeg'],
    ]) {
      expect(mapping.productImage).toMatch(new RegExp(`^${PUBLIC_URL}/merchants/${merchant._id}/products/${mapping.productId}/\\d+-\\d+\\.${ext}$`));
      expect(mapping.productImageThumb).toBe(mapping.productImage.replace(new RegExp(`\\.${ext}$`), '-thumb.webp'));
      // Anchor points stay as they were: the image itself is unchanged.
      expect(mapping.toObject().anchorPoints).toEqual(ANCHORS);

      const image = byKey[mapping.productImage.slice(PUBLIC_URL.length + 1)];
      expect(image.Bucket).toBe('snapfit-test');
      expect(image.ContentType).toBe(type);
      expect(image.CacheControl).toBe('public, max-age=31536000, immutable');
      expect(Buffer.compare(image.Body, bytes)).toBe(0);

      const thumb = byKey[mapping.productImageThumb.slice(PUBLIC_URL.length + 1)];
      expect(thumb.ContentType).toBe('image/webp');
      const meta = await sharp(thumb.Body).metadata();
      expect(meta.format).toBe('webp');
      expect(Math.max(meta.width, meta.height)).toBe(400);
    }
    // The sideways JPEG (600x800 in the file, 800x600 upright) gets an upright thumbnail.
    const twoThumb = await sharp(byKey[two.productImageThumb.slice(PUBLIC_URL.length + 1)].Body).metadata();
    expect([twoThumb.width, twoThumb.height]).toEqual([400, 300]);

    expect(env.listUploads().sort()).toEqual(['a.png', 'b.jpg']);
    expect(inputs(DeleteObjectCommand)).toEqual([]);
  });

  it('a second run finds nothing to move', async () => {
    await localMapping('SKU-1', 'a.png', makePng(500, 500));
    await migrateProductImagesToCloud({ storage });
    send.mockClear();

    const second = await migrateProductImagesToCloud({ storage });

    expect(second).toEqual({ found: 0, migrated: [], skipped: [], failed: [] });
    expect(send).not.toHaveBeenCalled();
  });

  it('skips missing and unreadable files', async () => {
    await ProductMapping.create({
      merchantId: merchant._id,
      productId: 'GONE',
      sizeChartId: chart._id,
      productImage: '/uploads/products/gone.png',
    });
    await localMapping('JUNK', 'junk.png', Buffer.from('not an image'));

    const summary = await migrateProductImagesToCloud({ storage });

    expect(summary.skipped.map((s) => [s.productId, s.reason]).sort()).toEqual([
      ['GONE', 'file not found on disk'],
      ['JUNK', 'not a JPEG, PNG or WebP image'],
    ]);
    expect(send).not.toHaveBeenCalled();
  });

  it('a failed database update removes what was uploaded and leaves the mapping local', async () => {
    await localMapping('SKU-1', 'a.png', makePng(500, 500));
    jest.spyOn(ProductMapping, 'updateOne').mockRejectedValueOnce(new Error('db down'));

    const summary = await migrateProductImagesToCloud({ storage });

    expect(summary.failed).toEqual([expect.objectContaining({ productId: 'SKU-1', reason: 'db down' })]);
    expect(inputs(DeleteObjectCommand).map((i) => i.Key).sort()).toEqual(inputs(PutObjectCommand).map((i) => i.Key).sort());
    expect((await ProductMapping.findOne({ productId: 'SKU-1' })).productImage).toBe('/uploads/products/a.png');
    expect(env.listUploads()).toEqual(['a.png']);
  });

  it('a failed upload is reported and the mapping stays local', async () => {
    await localMapping('SKU-1', 'a.png', makePng(500, 500));
    send.mockRejectedValueOnce(new Error('R2 down'));

    const summary = await migrateProductImagesToCloud({ storage });

    expect(summary.failed).toEqual([expect.objectContaining({ productId: 'SKU-1', reason: 'R2 down' })]);
    expect((await ProductMapping.findOne({ productId: 'SKU-1' })).productImage).toBe('/uploads/products/a.png');
  });

  it('prints a summary', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    printSummary(
      { found: 2, migrated: [{ productId: 'A', from: '/uploads/products/a.png', to: `${PUBLIC_URL}/k.png` }], skipped: [{ productId: 'B', from: '/uploads/products/b.png', reason: 'file not found on disk' }], failed: [] },
      { dryRun: true }
    );
    const out = log.mock.calls.flat().join('\n');
    expect(out).toMatch('would move  A: /uploads/products/a.png -> https://cdn.snapfit.test/k.png');
    expect(out).toMatch('Dry run: 1 would move, 1 skipped, 0 failed.');
  });
});
