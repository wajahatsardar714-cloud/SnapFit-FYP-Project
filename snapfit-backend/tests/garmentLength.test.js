const request = require('supertest');
const { setupTestEnv, tokenFor, createMerchant, createChart } = require('./helpers/testApp');
const { makePng } = require('./helpers/images');

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
let chart;

beforeEach(async () => {
  merchant = await createMerchant();
  token = tokenFor(merchant);
  chart = await createChart(merchant);
});

const auth = () => ({ Authorization: `Bearer ${token}` });
const mapJson = (body) =>
  request(app)
    .post('/api/products/map')
    .set(auth())
    .send({ productId: 'SKU-1', sizeChartId: String(chart._id), ...body });

describe('POST /api/products/map garmentLength', () => {
  it('defaults to regular', async () => {
    const res = await mapJson({});
    expect(res.status).toBe(200);
    expect(res.body.mapping.garmentLength).toBe('regular');
  });

  it('stores the given length and updates it when the product is mapped again', async () => {
    const first = await mapJson({ garmentLength: 'long' });
    expect(first.body.mapping.garmentLength).toBe('long');

    const second = await mapJson({ garmentLength: 'cropped' });
    expect(second.status).toBe(200);
    expect(second.body.mapping.garmentLength).toBe('cropped');
    expect(await ProductMapping.countDocuments({ merchantId: merchant._id })).toBe(1);
  });

  it('keeps the stored length when a later mapping leaves it out', async () => {
    await mapJson({ garmentLength: 'long' });
    const res = await mapJson({ productName: 'Renamed' });
    expect(res.body.mapping.garmentLength).toBe('long');
  });

  it('accepts it in a multipart body alongside the image', async () => {
    const res = await request(app)
      .post('/api/products/map')
      .set(auth())
      .field('productId', 'SKU-2')
      .field('sizeChartId', String(chart._id))
      .field('garmentLength', 'cropped')
      .attach('image', makePng(500, 700), { filename: 'top.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.mapping.garmentLength).toBe('cropped');
  });

  it('rejects unknown lengths (JSON and multipart) without keeping the upload', async () => {
    const json = await mapJson({ garmentLength: 'maxi' });
    expect(json.status).toBe(400);
    expect(json.body.message).toBe('Garment length must be cropped, regular or long');

    const multipart = await request(app)
      .post('/api/products/map')
      .set(auth())
      .field('productId', 'SKU-2')
      .field('sizeChartId', String(chart._id))
      .field('garmentLength', '')
      .attach('image', makePng(500, 700), { filename: 'top.png', contentType: 'image/png' });
    expect(multipart.status).toBe(400);
    expect(env.listUploads()).toEqual([]);
    expect(await ProductMapping.countDocuments()).toBe(0);
  });

  it('is listed with each mapping', async () => {
    await mapJson({ garmentLength: 'long' });
    const res = await request(app).get('/api/products/mappings').set(auth());
    expect(res.body.mappings[0].garmentLength).toBe('long');
  });
});

describe('GET /api/products/anchor-points', () => {
  const readyMapping = (overrides = {}) => ({
    merchantId: merchant._id,
    productId: 'SKU-1',
    sizeChartId: chart._id,
    productImage: '/uploads/products/tee.png',
    anchorPoints: ANCHORS,
    ...overrides,
  });
  const lookup = () =>
    request(app).get('/api/products/anchor-points').query({ merchantId: String(merchant._id), productId: 'SKU-1' });

  it('returns the garment length with the anchor points and image', async () => {
    await ProductMapping.create(readyMapping({ garmentLength: 'long' }));

    const res = await lookup();

    expect(res.status).toBe(200);
    expect(res.body.anchorPoints).toEqual(ANCHORS);
    expect(res.body.imageUrl).toMatch(/\/uploads\/products\/tee\.png$/);
    expect(res.body.garmentLength).toBe('long');
  });

  it('reports regular for mappings saved before the field existed', async () => {
    await ProductMapping.collection.insertOne(readyMapping());

    expect((await lookup()).body.garmentLength).toBe('regular');
  });
});
