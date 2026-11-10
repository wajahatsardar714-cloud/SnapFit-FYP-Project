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

describe('POST /api/products/map sleeveLength', () => {
  it('defaults to short', async () => {
    const res = await mapJson({});
    expect(res.status).toBe(200);
    expect(res.body.mapping.sleeveLength).toBe('short');
  });

  it('stores the given length and updates it when the product is mapped again', async () => {
    const first = await mapJson({ sleeveLength: 'long' });
    expect(first.body.mapping.sleeveLength).toBe('long');

    const second = await mapJson({ sleeveLength: 'none' });
    expect(second.status).toBe(200);
    expect(second.body.mapping.sleeveLength).toBe('none');
    expect(await ProductMapping.countDocuments({ merchantId: merchant._id })).toBe(1);
  });

  it('keeps the stored length when a later mapping leaves it out', async () => {
    await mapJson({ sleeveLength: 'long', garmentLength: 'long' });
    const res = await mapJson({ productName: 'Renamed' });
    expect(res.body.mapping.sleeveLength).toBe('long');
    expect(res.body.mapping.garmentLength).toBe('long');
  });

  it('accepts it in a multipart body alongside the image', async () => {
    const res = await request(app)
      .post('/api/products/map')
      .set(auth())
      .field('productId', 'SKU-2')
      .field('sizeChartId', String(chart._id))
      .field('sleeveLength', 'none')
      .attach('image', makePng(500, 700), { filename: 'top.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.mapping.sleeveLength).toBe('none');
  });

  it('rejects unknown lengths (JSON and multipart) without keeping the upload', async () => {
    const json = await mapJson({ sleeveLength: 'three-quarter' });
    expect(json.status).toBe(400);
    expect(json.body.message).toBe('Sleeve length must be none, short or long');

    const multipart = await request(app)
      .post('/api/products/map')
      .set(auth())
      .field('productId', 'SKU-2')
      .field('sizeChartId', String(chart._id))
      .field('sleeveLength', '')
      .attach('image', makePng(500, 700), { filename: 'top.png', contentType: 'image/png' });
    expect(multipart.status).toBe(400);
    expect(multipart.body.message).toBe('Sleeve length must be none, short or long');
    expect(env.listUploads()).toEqual([]);
    expect(await ProductMapping.countDocuments()).toBe(0);
  });

  it('is listed with each mapping', async () => {
    await mapJson({ sleeveLength: 'long' });
    const res = await request(app).get('/api/products/mappings').set(auth());
    expect(res.body.mappings[0].sleeveLength).toBe('long');
  });
});

describe('GET /api/products/anchor-points sleeveLength', () => {
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

  it('returns the sleeve length with the garment length and anchor points', async () => {
    await ProductMapping.create(readyMapping({ sleeveLength: 'long', garmentLength: 'long' }));

    const res = await lookup();

    expect(res.status).toBe(200);
    expect(res.body.anchorPoints).toEqual(ANCHORS);
    expect(res.body.sleeveLength).toBe('long');
    expect(res.body.garmentLength).toBe('long');
  });

  it('reports short for mappings saved before the field existed', async () => {
    await ProductMapping.collection.insertOne(readyMapping());

    expect((await lookup()).body.sleeveLength).toBe('short');
  });
});
