const bcrypt = require('bcryptjs');
const { setupTestEnv, createMerchant } = require('./helpers/testApp');

setupTestEnv();
const Merchant = require('../src/models/Merchant');
const { ensureSuperAdmin } = require('../src/config/superAdmin');

const EMAIL = 'Owner@SnapFit.test';
const PASSWORD = 'first-secret-pass';

let logs;

beforeEach(() => {
  process.env.SUPERADMIN_EMAIL = EMAIL;
  process.env.SUPERADMIN_PASSWORD = PASSWORD;
  logs = [];
  ['log', 'warn', 'error'].forEach((level) => {
    jest.spyOn(console, level).mockImplementation((...args) => logs.push({ level, text: args.join(' ') }));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.SUPERADMIN_EMAIL;
  delete process.env.SUPERADMIN_PASSWORD;
});

const findAdmins = () => Merchant.find({ role: 'superadmin' });
const allLogs = () => logs.map((l) => l.text).join('\n');

describe('ensureSuperAdmin', () => {
  it('creates the super admin with a bcrypt hash and a normalized email', async () => {
    await ensureSuperAdmin();

    const admins = await findAdmins();
    expect(admins).toHaveLength(1);
    const [admin] = admins;
    expect(admin.email).toBe('owner@snapfit.test');
    expect(admin.status).toBe('active');
    expect(admin.businessName).toBeUndefined();
    expect(admin.password).not.toBe(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, admin.password)).toBe(true);
    expect(bcrypt.getRounds(admin.password)).toBe(12);
  });

  it('is idempotent: a second run changes nothing', async () => {
    await ensureSuperAdmin();
    const { password: firstHash } = await Merchant.findOne({ role: 'superadmin' });

    await ensureSuperAdmin();

    const admins = await findAdmins();
    expect(admins).toHaveLength(1);
    expect(admins[0].password).toBe(firstHash);
  });

  it('updates the password hash when the env password changed', async () => {
    await ensureSuperAdmin();
    process.env.SUPERADMIN_PASSWORD = 'second-secret-pass';

    await ensureSuperAdmin();

    const admins = await findAdmins();
    expect(admins).toHaveLength(1);
    expect(await bcrypt.compare('second-secret-pass', admins[0].password)).toBe(true);
  });

  it('updates the password of a super admin stored with a retired plan id', async () => {
    await Merchant.collection.insertOne({
      name: 'Super Admin',
      email: 'owner@snapfit.test',
      password: await bcrypt.hash('old-secret-pass', 4),
      role: 'superadmin',
      subscription: { plan: 'free', status: 'inactive', requestsUsed: 0 },
    });

    await ensureSuperAdmin();

    const [admin] = await findAdmins();
    expect(await bcrypt.compare(PASSWORD, admin.password)).toBe(true);
  });

  it.each([
    ['SUPERADMIN_EMAIL'],
    ['SUPERADMIN_PASSWORD'],
  ])('warns and skips when %s is missing', async (name) => {
    delete process.env[name];

    await ensureSuperAdmin();

    expect(await findAdmins()).toHaveLength(0);
    expect(logs.some((l) => l.level === 'warn')).toBe(true);
  });

  it('skips a password shorter than 8 characters', async () => {
    process.env.SUPERADMIN_PASSWORD = 'short';

    await ensureSuperAdmin();

    expect(await findAdmins()).toHaveLength(0);
    expect(logs.some((l) => l.level === 'warn')).toBe(true);
  });

  it('refuses to convert a merchant who owns that email', async () => {
    const merchant = await createMerchant({ email: 'owner@snapfit.test' });

    await ensureSuperAdmin();

    expect(await findAdmins()).toHaveLength(0);
    const unchanged = await Merchant.findById(merchant._id);
    expect(unchanged.role).toBe('merchant');
    expect(unchanged.password).toBe('hashed');
    expect(logs.some((l) => l.level === 'error')).toBe(true);
  });

  it('never logs the password', async () => {
    await ensureSuperAdmin();
    process.env.SUPERADMIN_PASSWORD = 'second-secret-pass';
    await ensureSuperAdmin();

    expect(logs.length).toBeGreaterThan(0);
    expect(allLogs()).not.toContain(PASSWORD);
    expect(allLogs()).not.toContain('second-secret-pass');
  });
});
