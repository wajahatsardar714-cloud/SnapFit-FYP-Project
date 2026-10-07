const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { setupTestEnv, tokenFor, createMerchant, createChart } = require('./helpers/testApp');
const { makePng, GIF_1X1 } = require('./helpers/images');

const env = setupTestEnv();
const app = require('../src/app');
const ProductMapping = require('../src/models/ProductMapping');

const ANCHORS = {
  shoulderLeft: { x: 0.3, y: 0.2 },
  shoulderRight: { x: 0.7, y: 0.2 },
  hipLeft: { x: 0.32, y: 0.6 },
  hipRight: { x: 0.68, y: 0.6 },
};

let merchant;
let token;
let mapping;

beforeEach(async () => {
  merchant = await createMerchant();
  token = tokenFor(merchant);
  const chart = await createChart(merchant);
  mapping = await ProductMapping.create({ merchantId: merchant._id, productId: 'SKU-1', sizeChartId: chart._id });
});

const auth = () => ({ Authorization: `Bearer ${token}` });
const diskPath = (productImage) => path.join(env.uploadDir, path.basename(productImage));

function uploadImage(id, buffer, filename = 'tee.png', contentType = 'image/png') {
  return request(app).put(`/api/products/${id}/image`).set(auth()).attach('image', buffer, { filename, contentType });
}

describe('PUT /api/products/:id/image', () => {
  it('stores a valid image and reports anchors as the missing piece', async () => {
    const res = await uploadImage(mapping._id, makePng(500, 640));

    expect(res.status).toBe(200);
    expect(res.body.mapping.productImage).toMatch(/^\/uploads\/products\/.+\.png$/);
    expect(res.body.mapping.tryOnStatus).toBe('anchors_missing');
    expect(fs.existsSync(diskPath(res.body.mapping.productImage))).toBe(true);
  });

  it('serves the stored image', async () => {
    const res = await uploadImage(mapping._id, makePng(500, 640));
    const served = await request(app).get(res.body.mapping.productImage);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
  });

  it('rejects formats other than JPEG, PNG and WebP', async () => {
    const res = await uploadImage(mapping._id, GIF_1X1, 'tee.gif', 'image/gif');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Product images must be JPEG, PNG or WebP');
    expect(env.listUploads()).toEqual([]);
  });

  it('rejects a file whose content is not really an image', async () => {
    const res = await uploadImage(mapping._id, Buffer.from('definitely not a png'));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('This file could not be read as an image');
    expect(env.listUploads()).toEqual([]);
  });

  it('rejects files over 5MB', async () => {
    const res = await uploadImage(mapping._id, Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Product images must be 5MB or smaller');
    expect(env.listUploads()).toEqual([]);
  });

  it('rejects images under 400px on the short side', async () => {
    const res = await uploadImage(mapping._id, makePng(900, 300));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 400px.*900×300/);
    expect(env.listUploads()).toEqual([]);
  });

  it("refuses another merchant's product and discards the upload", async () => {
    const other = await createMerchant();
    const otherChart = await createChart(other);
    const otherMapping = await ProductMapping.create({ merchantId: other._id, productId: 'SKU-X', sizeChartId: otherChart._id });

    const res = await uploadImage(otherMapping._id, makePng(500, 500));

    expect(res.status).toBe(404);
    expect(env.listUploads()).toEqual([]);
    expect((await ProductMapping.findById(otherMapping._id)).productImage).toBeUndefined();
  });

  it('requires a file and a valid id, and a logged-in merchant', async () => {
    expect((await request(app).put(`/api/products/${mapping._id}/image`).set(auth())).status).toBe(400);
    expect((await uploadImage('not-an-id', makePng(500, 500))).body.message).toBe('Invalid product mapping ID');
    expect((await request(app).put(`/api/products/${mapping._id}/image`)).status).toBe(401);
  });

  it('replacing deletes the old file and clears anchors placed on it', async () => {
    const first = await uploadImage(mapping._id, makePng(500, 500));
    await request(app)
      .put(`/api/products/${mapping._id}/anchor-points`)
      .set(auth())
      .field('anchorPoints', JSON.stringify(ANCHORS));

    const second = await uploadImage(mapping._id, makePng(600, 600, [10, 10, 10]));

    expect(second.status).toBe(200);
    expect(fs.existsSync(diskPath(first.body.mapping.productImage))).toBe(false);
    expect(fs.existsSync(diskPath(second.body.mapping.productImage))).toBe(true);
    expect(second.body.mapping.anchorPoints).toBeUndefined();
    expect(second.body.mapping.tryOnStatus).toBe('anchors_missing');
  });
});

describe('DELETE /api/products/:id/image', () => {
  it('clears the field and removes the file', async () => {
    const uploaded = await uploadImage(mapping._id, makePng(500, 500));

    const res = await request(app).delete(`/api/products/${mapping._id}/image`).set(auth());

    expect(res.status).toBe(200);
    expect(res.body.mapping.productImage).toBeUndefined();
    expect(res.body.mapping.tryOnStatus).toBe('image_missing');
    expect(fs.existsSync(diskPath(uploaded.body.mapping.productImage))).toBe(false);
  });
});

describe('product mappings', () => {
  it('accepts an optional image when the mapping is created', async () => {
    const chart = await createChart(merchant, { name: 'Shirts' });

    const res = await request(app)
      .post('/api/products/map')
      .set(auth())
      .field('productId', 'SKU-2')
      .field('sizeChartId', String(chart._id))
      .attach('image', makePng(500, 700), { filename: 'shirt.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.mapping.productImage).toMatch(/^\/uploads\/products\//);
    expect(res.body.mapping.tryOnStatus).toBe('anchors_missing');
  });

  it('still accepts plain JSON and validates required fields', async () => {
    const chart = await createChart(merchant, { name: 'Shirts' });
    const ok = await request(app).post('/api/products/map').set(auth()).send({ productId: 'SKU-3', sizeChartId: String(chart._id) });
    expect(ok.status).toBe(200);
    expect(ok.body.mapping.tryOnStatus).toBe('image_missing');

    const missing = await request(app).post('/api/products/map').set(auth()).send({ sizeChartId: String(chart._id) });
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe('Product ID is required');
  });

  it('reports try-on readiness for each mapping', async () => {
    await uploadImage(mapping._id, makePng(500, 500));
    await request(app)
      .put(`/api/products/${mapping._id}/anchor-points`)
      .set(auth())
      .field('anchorPoints', JSON.stringify(ANCHORS));

    const res = await request(app).get('/api/products/mappings').set(auth());

    expect(res.body.mappings).toHaveLength(1);
    expect(res.body.mappings[0].tryOnStatus).toBe('ready');
  });

  it('removing a mapping deletes its image file', async () => {
    const uploaded = await uploadImage(mapping._id, makePng(500, 500));

    const res = await request(app).delete(`/api/products/map/${mapping._id}`).set(auth());

    expect(res.status).toBe(200);
    expect(fs.existsSync(diskPath(uploaded.body.mapping.productImage))).toBe(false);
  });
});
