const fs = require('fs');
const path = require('path');
const request = require('supertest');
const sharp = require('sharp');
const { setupTestEnv, tokenFor, createMerchant, createChart } = require('./helpers/testApp');
const { makePng } = require('./helpers/images');

const env = setupTestEnv();
const app = require('../src/app');
const ProductMapping = require('../src/models/ProductMapping');
const { processProductImage, safeProductId, productImageKeys } = require('../src/utils/productImageUpload');

const solid = (width, height, { channels = 3, background = { r: 200, g: 60, b: 60 } } = {}) =>
  sharp({ create: { width, height, channels, background } });

// A JPEG stored sideways with EXIF "rotate 90° clockwise" (orientation 6), as
// phone cameras write them: 800x500 in the file, 500x800 when shown upright.
const sidewaysJpeg = () => solid(800, 500).jpeg().withMetadata({ orientation: 6 }).toBuffer();

describe('processProductImage', () => {
  it('re-encodes as WebP and keeps a size up to 1600px as it is', async () => {
    const { image, contentType, width, height } = await processProductImage(makePng(1200, 900));
    const meta = await sharp(image).metadata();

    expect(contentType).toBe('image/webp');
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([1200, 900]);
    expect([width, height]).toEqual([1200, 900]);
  });

  it('shrinks only when the longest side is over 1600px, keeping the aspect ratio', async () => {
    const wide = await sharp((await processProductImage(await solid(2400, 1800).png().toBuffer())).image).metadata();
    expect([wide.width, wide.height]).toEqual([1600, 1200]);

    const tall = await sharp((await processProductImage(await solid(1000, 2000).jpeg().toBuffer())).image).metadata();
    expect([tall.width, tall.height]).toEqual([800, 1600]);

    const exact = await sharp((await processProductImage(makePng(1600, 400))).image).metadata();
    expect([exact.width, exact.height]).toEqual([1600, 400]);
  });

  it('turns the image upright from its EXIF orientation and strips the metadata', async () => {
    const input = await sidewaysJpeg();
    expect((await sharp(input).metadata()).orientation).toBe(6);

    const meta = await sharp((await processProductImage(input)).image).metadata();

    expect([meta.width, meta.height]).toEqual([500, 800]);
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
  });

  it('makes a thumbnail of at most 400px on the longest side', async () => {
    const { thumb } = await processProductImage(await solid(2000, 1000).png().toBuffer());
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([400, 200]);
  });

  it('keeps transparency, which the try-on uses as the garment mask', async () => {
    const transparent = await solid(500, 500, { channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const meta = await sharp((await processProductImage(transparent)).image).metadata();
    expect(meta.hasAlpha).toBe(true);
  });
});

describe('storage keys', () => {
  it('puts each image under its merchant and product', () => {
    const keys = productImageKeys('m1', 'SKU 1/ä', { now: 1700000000000 });
    expect(keys.image).toMatch(/^merchants\/m1\/products\/SKU_1__\/1700000000000-\d+\.webp$/);
    expect(keys.thumb).toBe(keys.image.replace(/\.webp$/, '-thumb.webp'));
  });

  it('turns any product ID into one safe path part', () => {
    expect(safeProductId('../..')).toBe('.._..');
    expect(safeProductId('..')).toBe('_');
    expect(safeProductId('')).toBe('_');
    expect(safeProductId('a/b\\c')).toBe('a_b_c');
    expect(safeProductId('x'.repeat(300))).toHaveLength(100);
  });
});

describe('PUT /api/products/:id/image pipeline', () => {
  let token;
  let mapping;

  beforeEach(async () => {
    const merchant = await createMerchant();
    token = tokenFor(merchant);
    const chart = await createChart(merchant);
    mapping = await ProductMapping.create({ merchantId: merchant._id, productId: 'SKU-1', sizeChartId: chart._id });
  });

  const upload = (buffer, filename = 'tee.jpg', contentType = 'image/jpeg') =>
    request(app)
      .put(`/api/products/${mapping._id}/image`)
      .set({ Authorization: `Bearer ${token}` })
      .attach('image', buffer, { filename, contentType });
  const stored = (url) => fs.readFileSync(path.join(env.uploadDir, path.basename(url)));

  it('stores an upright, downscaled WebP and its thumbnail', async () => {
    const big = await solid(2000, 1250).jpeg().withMetadata({ orientation: 6 }).toBuffer();

    const res = await upload(big);

    expect(res.status).toBe(200);
    const image = await sharp(stored(res.body.mapping.productImage)).metadata();
    expect(image.format).toBe('webp');
    expect([image.width, image.height]).toEqual([1000, 1600]);
    expect(image.orientation).toBeUndefined();
    const thumb = await sharp(stored(res.body.mapping.productImageThumb)).metadata();
    expect([thumb.width, thumb.height]).toEqual([250, 400]);
  });

  it('keeps anchor points sent with a new image unchanged (they are 0-1 fractions)', async () => {
    const anchors = {
      shoulderLeft: { x: 0.3, y: 0.2 },
      shoulderRight: { x: 0.7, y: 0.2 },
      hipLeft: { x: 0.32, y: 0.6 },
      hipRight: { x: 0.68, y: 0.6 },
    };
    const res = await request(app)
      .put(`/api/products/${mapping._id}/anchor-points`)
      .set({ Authorization: `Bearer ${token}` })
      .field('anchorPoints', JSON.stringify(anchors))
      .attach('image', await solid(3200, 2400).png().toBuffer(), { filename: 'big.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.mapping.anchorPoints).toEqual(anchors);
    expect(res.body.mapping.tryOnStatus).toBe('ready');
    const image = await sharp(stored(res.body.mapping.productImage)).metadata();
    expect(image.width / image.height).toBeCloseTo(3200 / 2400, 5);
  });

  it('rejects an image whose header looks fine but whose pixels cannot be decoded', async () => {
    const broken = makePng(500, 500).subarray(0, 60);
    const res = await upload(broken, 'tee.png', 'image/png');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This file could not be read as an image');
    expect(env.listUploads()).toEqual([]);
  });

  it('rejects non-images, too small and too big files without storing anything', async () => {
    expect((await upload(Buffer.from('not an image'))).status).toBe(400);
    expect((await upload(await solid(1200, 399).jpeg().toBuffer())).body.message).toMatch(/at least 400px/);
    expect((await upload(Buffer.alloc(5 * 1024 * 1024 + 1))).body.message).toBe('Product images must be 5MB or smaller');
    expect(env.listUploads()).toEqual([]);
  });
});
