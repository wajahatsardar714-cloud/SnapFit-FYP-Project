// The product image routes with STORAGE_DRIVER=r2: a mocked S3 client stands in
// for Cloudflare, so no request leaves the machine.
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { setupTestEnv, tokenFor, createMerchant, createChart } = require('./helpers/testApp');
const { makePng } = require('./helpers/images');

const env = setupTestEnv({ replSet: true });
const app = require('../src/app');
const ProductMapping = require('../src/models/ProductMapping');
const { createStorage, setStorage } = require('../src/services/storage');
const { deleteMerchantWithData } = require('../src/controllers/merchantController');

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
let merchant;
let token;
let mapping;

beforeAll(() => setStorage(createStorage({ env: R2_ENV, s3Client: { send }, localDir: env.uploadDir })));
afterAll(() => setStorage(null));
afterEach(() => jest.restoreAllMocks());

beforeEach(async () => {
  send.mockReset();
  send.mockResolvedValue({});
  merchant = await createMerchant();
  token = tokenFor(merchant);
  const chart = await createChart(merchant);
  mapping = await ProductMapping.create({ merchantId: merchant._id, productId: 'SKU 1', sizeChartId: chart._id });
});

const auth = () => ({ Authorization: `Bearer ${token}` });
const inputs = (type) => send.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd instanceof type).map((cmd) => cmd.input);
const keyOf = (url) => url.slice(PUBLIC_URL.length + 1);

function uploadImage(id = mapping._id) {
  return request(app)
    .put(`/api/products/${id}/image`)
    .set(auth())
    .attach('image', makePng(500, 640), { filename: 'tee.png', contentType: 'image/png' });
}

describe('uploading with R2', () => {
  it('stores the WebP image and thumbnail in the bucket and saves their public URLs', async () => {
    const res = await uploadImage();

    expect(res.status).toBe(200);
    const { productImage, productImageThumb } = res.body.mapping;
    const base = `merchants/${merchant._id}/products/SKU_1/`;
    expect(productImage).toMatch(new RegExp(`^${PUBLIC_URL}/${base}\\d+-\\d+\\.webp$`));
    expect(productImageThumb).toBe(productImage.replace(/\.webp$/, '-thumb.webp'));

    const puts = inputs(PutObjectCommand);
    expect(puts.map(({ Body, ...rest }) => rest)).toEqual([
      { Bucket: 'snapfit-test', Key: keyOf(productImage), ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' },
      { Bucket: 'snapfit-test', Key: keyOf(productImageThumb), ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' },
    ]);
    expect(puts.every(({ Body }) => Buffer.isBuffer(Body) && Body.subarray(8, 12).toString() === 'WEBP')).toBe(true);
    // Nothing lands on the server's disk.
    expect(env.listUploads()).toEqual([]);
  });

  it('nothing is stored when the product is not the merchant’s own', async () => {
    const other = await createMerchant();
    const otherMapping = await ProductMapping.create({
      merchantId: other._id,
      productId: 'X',
      sizeChartId: (await createChart(other))._id,
    });
    expect((await uploadImage(otherMapping._id)).status).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });

  it('a failed thumbnail upload removes the image just stored and leaves the mapping alone', async () => {
    send.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('R2 down'));

    const res = await uploadImage();

    expect(res.status).toBe(500);
    const [image] = inputs(PutObjectCommand);
    expect(inputs(DeleteObjectCommand)).toEqual([{ Bucket: 'snapfit-test', Key: image.Key }]);
    expect((await ProductMapping.findById(mapping._id)).productImage).toBeUndefined();
  });

  it('a failed save removes both stored objects', async () => {
    jest.spyOn(ProductMapping.prototype, 'save').mockRejectedValueOnce(new Error('db down'));

    const res = await uploadImage();

    expect(res.status).toBe(500);
    expect(inputs(DeleteObjectCommand).map((i) => i.Key).sort()).toEqual(inputs(PutObjectCommand).map((i) => i.Key).sort());
  });
});

describe('replacing and removing with R2', () => {
  it('replacing an R2 image deletes the old image and thumbnail from the bucket', async () => {
    const first = (await uploadImage()).body.mapping;
    send.mockClear();

    const second = await uploadImage();

    expect(second.status).toBe(200);
    expect(inputs(DeleteObjectCommand)).toEqual([
      { Bucket: 'snapfit-test', Key: keyOf(first.productImage) },
      { Bucket: 'snapfit-test', Key: keyOf(first.productImageThumb) },
    ]);
  });

  it('replacing an old local image deletes the file from disk, not from the bucket', async () => {
    fs.writeFileSync(path.join(env.uploadDir, 'legacy.png'), makePng(500, 500));
    await ProductMapping.updateOne({ _id: mapping._id }, { productImage: '/uploads/products/legacy.png' });

    const res = await uploadImage();

    expect(res.status).toBe(200);
    expect(env.listUploads()).toEqual([]);
    expect(inputs(DeleteObjectCommand)).toEqual([]);
  });

  it('a new image sent with anchor points replaces both old objects', async () => {
    const first = (await uploadImage()).body.mapping;
    send.mockClear();

    const res = await request(app)
      .put(`/api/products/${mapping._id}/anchor-points`)
      .set(auth())
      .field('anchorPoints', JSON.stringify(ANCHORS))
      .attach('image', makePng(500, 500), { filename: 'tee.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.mapping.productImage).not.toBe(first.productImage);
    expect(inputs(DeleteObjectCommand).map((i) => i.Key)).toEqual([keyOf(first.productImage), keyOf(first.productImageThumb)]);
  });

  it('mapping again with a new image (POST /map) replaces both old objects', async () => {
    const first = (await uploadImage()).body.mapping;
    send.mockClear();

    const res = await request(app)
      .post('/api/products/map')
      .set(auth())
      .field('productId', 'SKU 1')
      .field('sizeChartId', String(mapping.sizeChartId))
      .attach('image', makePng(500, 500), { filename: 'tee.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.mapping.productImageThumb).toMatch(/-thumb\.webp$/);
    expect(inputs(DeleteObjectCommand).map((i) => i.Key)).toEqual([keyOf(first.productImage), keyOf(first.productImageThumb)]);
  });

  it('removing the image deletes both objects and clears both fields', async () => {
    const first = (await uploadImage()).body.mapping;
    send.mockClear();

    const res = await request(app).delete(`/api/products/${mapping._id}/image`).set(auth());

    expect(res.status).toBe(200);
    expect(res.body.mapping.productImage).toBeUndefined();
    expect(res.body.mapping.productImageThumb).toBeUndefined();
    expect(inputs(DeleteObjectCommand).map((i) => i.Key)).toEqual([keyOf(first.productImage), keyOf(first.productImageThumb)]);
  });

  it('deleting the mapping deletes both objects', async () => {
    const first = (await uploadImage()).body.mapping;
    send.mockClear();

    expect((await request(app).delete(`/api/products/map/${mapping._id}`).set(auth())).status).toBe(200);
    expect(inputs(DeleteObjectCommand).map((i) => i.Key)).toEqual([keyOf(first.productImage), keyOf(first.productImageThumb)]);
  });

  it('deleting a merchant removes every R2 object and old local file it owned', async () => {
    const first = (await uploadImage()).body.mapping;
    fs.writeFileSync(path.join(env.uploadDir, 'legacy.png'), makePng(500, 500));
    await ProductMapping.create({
      merchantId: merchant._id,
      productId: 'SKU-OLD',
      sizeChartId: mapping.sizeChartId,
      productImage: '/uploads/products/legacy.png',
    });
    send.mockClear();

    await deleteMerchantWithData(merchant._id);

    expect(inputs(DeleteObjectCommand).map((i) => i.Key).sort()).toEqual(
      [keyOf(first.productImage), keyOf(first.productImageThumb)].sort()
    );
    expect(env.listUploads()).toEqual([]);
  });

  it('never deletes an image URL from another host', async () => {
    await ProductMapping.updateOne(
      { _id: mapping._id },
      { productImage: 'https://elsewhere.test/merchants/x/products/y/1.webp' }
    );

    expect((await request(app).delete(`/api/products/${mapping._id}/image`).set(auth())).status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the try-on image URL', () => {
  async function anchorLookup() {
    return request(app).get('/api/products/anchor-points').query({ merchantId: String(merchant._id), productId: 'SKU 1' });
  }

  it('sends an R2 URL to the AI service as it is', async () => {
    const url = `${PUBLIC_URL}/merchants/${merchant._id}/products/SKU_1/1-2.webp`;
    await ProductMapping.updateOne({ _id: mapping._id }, { productImage: url, anchorPoints: ANCHORS });

    const res = await anchorLookup();

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toBe(url);
  });

  it('prefixes an old local path with this server’s address', async () => {
    await ProductMapping.updateOne({ _id: mapping._id }, { productImage: '/uploads/products/tee.png', anchorPoints: ANCHORS });

    const res = await anchorLookup();

    expect(res.body.imageUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/uploads\/products\/tee\.png$/);
  });

  it('the widget product info follows the same rule', () => {
    const { productImageFetchUrl } = require('../src/controllers/productMappingController');
    const req = { protocol: 'https', get: () => 'api.snapfit.test' };
    expect(productImageFetchUrl(`${PUBLIC_URL}/a.webp`, req)).toBe(`${PUBLIC_URL}/a.webp`);
    expect(productImageFetchUrl('HTTP://cdn.test/a.webp', req)).toBe('HTTP://cdn.test/a.webp');
    expect(productImageFetchUrl('/uploads/products/a.png', req)).toBe('https://api.snapfit.test/uploads/products/a.png');
    expect(productImageFetchUrl(undefined, req)).toBeNull();
  });
});
