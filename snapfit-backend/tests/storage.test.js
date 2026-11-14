const fs = require('fs');
const os = require('os');
const path = require('path');

// The real S3 commands (plain input holders) with a client that never touches
// the network: every constructor config and sent command is recorded.
jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  const send = jest.fn(async () => ({}));
  const configs = [];
  class S3Client {
    constructor(config) {
      configs.push(config);
    }

    send(command) {
      return send(command);
    }
  }
  return { ...actual, S3Client, __send: send, __configs: configs };
});

const s3 = require('@aws-sdk/client-s3');
const {
  createLocalDriver,
  createR2Driver,
  createStorage,
  assertR2Config,
  CACHE_CONTROL,
} = require('../src/services/storage');

const R2_ENV = {
  STORAGE_DRIVER: 'r2',
  R2_ACCOUNT_ID: 'acc123',
  R2_ACCESS_KEY_ID: 'AKIA-test-id',
  R2_SECRET_ACCESS_KEY: 'super-secret-value',
  R2_BUCKET: 'snapfit-test',
  R2_PUBLIC_URL: 'https://cdn.test/',
};
const KEY = 'merchants/m1/products/SKU-1/1700000000000-42.webp';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapfit-storage-'));
  s3.__send.mockReset();
  s3.__send.mockResolvedValue({});
  s3.__configs.length = 0;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const sentInputs = (type) => s3.__send.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd instanceof type).map((cmd) => cmd.input);

describe('local driver', () => {
  it('writes the file flat in the folder and returns its /uploads/products path', async () => {
    const local = createLocalDriver({ dir });
    const result = await local.put(KEY, Buffer.from('img'), 'image/webp');

    expect(result).toEqual({ key: KEY, url: '/uploads/products/1700000000000-42.webp' });
    expect(fs.readFileSync(path.join(dir, '1700000000000-42.webp'), 'utf8')).toBe('img');
    expect(local.urlFor(KEY)).toBe('/uploads/products/1700000000000-42.webp');
  });

  it('removes by path or by key, and reports a missing file without throwing', async () => {
    const local = createLocalDriver({ dir });
    const { url } = await local.put(KEY, Buffer.from('img'));

    expect(await local.remove(url)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(await local.remove(url)).toBe(false);

    await local.put(KEY, Buffer.from('img'));
    expect(await local.remove(KEY)).toBe(true);
  });

  it('never deletes outside the products folder', async () => {
    const outside = path.join(dir, '..', `outside-${Date.now()}.txt`);
    fs.writeFileSync(outside, 'keep');
    const local = createLocalDriver({ dir });
    try {
      expect(await local.remove(`/uploads/products/../${path.basename(outside)}`)).toBe(false);
      expect(await local.remove(outside)).toBe(false);
      expect(await local.remove('/etc/passwd')).toBe(false);
      expect(await local.remove('https://cdn.test/merchants/a/b.webp')).toBe(false);
      expect(fs.existsSync(outside)).toBe(true);
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });
});

describe('r2 driver', () => {
  it('builds the S3 client for the account endpoint with the env credentials', () => {
    createR2Driver({ env: R2_ENV });

    expect(s3.__configs).toEqual([
      {
        region: 'auto',
        endpoint: 'https://acc123.r2.cloudflarestorage.com',
        credentials: { accessKeyId: 'AKIA-test-id', secretAccessKey: 'super-secret-value' },
      },
    ]);
  });

  it('uploads to the bucket with the key, content type and a long immutable cache', async () => {
    const r2 = createR2Driver({ env: R2_ENV });
    const body = Buffer.from('webp-bytes');

    const result = await r2.put(KEY, body, 'image/webp');

    expect(result).toEqual({ key: KEY, url: `https://cdn.test/${KEY}` });
    expect(sentInputs(s3.PutObjectCommand)).toEqual([
      { Bucket: 'snapfit-test', Key: KEY, Body: body, ContentType: 'image/webp', CacheControl: CACHE_CONTROL },
    ]);
    expect(CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
  });

  it('builds public URLs without doubling the slash', () => {
    const r2 = createR2Driver({ env: { ...R2_ENV, R2_PUBLIC_URL: 'https://img.snapfit.test///' } });
    expect(r2.urlFor(KEY)).toBe(`https://img.snapfit.test/${KEY}`);
  });

  it('deletes by public URL or key', async () => {
    const r2 = createR2Driver({ env: R2_ENV });

    expect(await r2.remove(`https://cdn.test/${KEY}`)).toBe(true);
    expect(await r2.remove(KEY)).toBe(true);
    expect(sentInputs(s3.DeleteObjectCommand)).toEqual([
      { Bucket: 'snapfit-test', Key: KEY },
      { Bucket: 'snapfit-test', Key: KEY },
    ]);
  });

  it('never deletes other hosts, keys outside merchants/ or path tricks', async () => {
    const r2 = createR2Driver({ env: R2_ENV });

    for (const ref of [
      `https://evil.test/${KEY}`,
      'https://cdn.test/other/file.webp',
      'https://cdn.test/merchants/../secret',
      'https://cdn.testevil/merchants/a/b.webp',
      'other/file.webp',
      '/uploads/products/x.png',
      '',
      undefined,
    ]) {
      expect(await r2.remove(ref)).toBe(false);
    }
    expect(s3.__send).not.toHaveBeenCalled();
    await expect(r2.put('elsewhere/x.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow(/merchants/);
  });

  it('a failed delete is logged by key only, not thrown', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    s3.__send.mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'AccessDenied' }));
    const r2 = createR2Driver({ env: R2_ENV });

    expect(await r2.remove(KEY)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(KEY));
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/super-secret-value|AKIA-test-id/);
    warn.mockRestore();
  });

  it('fails clearly, naming only the missing variables', () => {
    const env = { ...R2_ENV, R2_BUCKET: '', R2_PUBLIC_URL: undefined };
    expect(() => assertR2Config(env)).toThrow('STORAGE_DRIVER=r2 needs R2_BUCKET, R2_PUBLIC_URL to be set');
    let message = '';
    try {
      createStorage({ env, localDir: dir });
    } catch (err) {
      message = err.message;
    }
    expect(message).toMatch(/R2_BUCKET, R2_PUBLIC_URL/);
    expect(message).not.toMatch(/super-secret-value|AKIA-test-id|acc123/);
  });
});

describe('createStorage', () => {
  it('defaults to the local driver', async () => {
    const storage = createStorage({ env: {}, localDir: dir });
    expect(storage.driver).toBe('local');
    expect(storage.r2).toBeNull();
    expect((await storage.put(KEY, Buffer.from('x'), 'image/webp')).url).toBe('/uploads/products/1700000000000-42.webp');
    // R2 URLs are left alone when R2 is not set up.
    expect(await storage.remove(`https://cdn.test/${KEY}`)).toBe(false);
  });

  it('rejects an unknown driver', () => {
    expect(() => createStorage({ env: { STORAGE_DRIVER: 's3' }, localDir: dir })).toThrow(/local \| r2/);
  });

  it('with r2, stores in the bucket but still removes old local images from disk', async () => {
    const storage = createStorage({ env: R2_ENV, localDir: dir });
    fs.writeFileSync(path.join(dir, 'old.png'), 'old');

    expect(storage.driver).toBe('r2');
    expect((await storage.put(KEY, Buffer.from('x'), 'image/webp')).url).toBe(`https://cdn.test/${KEY}`);
    expect(await storage.remove('/uploads/products/old.png')).toBe(true);
    expect(fs.existsSync(path.join(dir, 'old.png'))).toBe(false);
    expect(await storage.remove(`https://cdn.test/${KEY}`)).toBe(true);
    expect(sentInputs(s3.DeleteObjectCommand)).toEqual([{ Bucket: 'snapfit-test', Key: KEY }]);
  });

  it('back on local with R2 still configured, R2 images can still be removed', async () => {
    const storage = createStorage({ env: { ...R2_ENV, STORAGE_DRIVER: 'local' }, localDir: dir });
    expect(storage.driver).toBe('local');
    expect(await storage.remove(`https://cdn.test/${KEY}`)).toBe(true);
    expect(sentInputs(s3.DeleteObjectCommand)).toEqual([{ Bucket: 'snapfit-test', Key: KEY }]);
  });
});
