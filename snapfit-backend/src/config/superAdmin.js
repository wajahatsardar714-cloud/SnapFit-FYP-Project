const bcrypt = require('bcryptjs');
const Merchant = require('../models/Merchant');

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Creates the platform's single super admin from SUPERADMIN_EMAIL /
// SUPERADMIN_PASSWORD, or brings its password in line with the env. Safe to run
// on every start. A merchant who already owns that email is never converted.
// The password is never logged.
async function ensureSuperAdmin() {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email || !password) {
    console.warn('SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD not set — skipping super admin setup');
    return;
  }
  if (!EMAIL_PATTERN.test(email)) {
    console.warn('SUPERADMIN_EMAIL is not a valid email address — skipping super admin setup');
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.warn(`SUPERADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters — skipping super admin setup`);
    return;
  }

  try {
    const existing = await Merchant.findOne({ email });

    if (!existing) {
      await Merchant.create({
        name: 'Super Admin',
        email,
        password: await bcrypt.hash(password, 12),
        role: 'superadmin',
      });
      console.log(`Super admin account created for ${email}`);
      return;
    }

    if (existing.role !== 'superadmin') {
      console.error(`SUPERADMIN_EMAIL ${email} belongs to a merchant account — refusing to convert it; super admin setup skipped`);
      return;
    }

    if (!(await bcrypt.compare(password, existing.password))) {
      // Only the password is written: the super admin's unused subscription may
      // still hold a plan id the schema no longer accepts.
      await Merchant.updateOne({ _id: existing._id }, { password: await bcrypt.hash(password, 12) });
      console.log(`Super admin password updated for ${email}`);
    }
  } catch (err) {
    console.error('Super admin setup failed:', err.message);
  }
}

module.exports = { ensureSuperAdmin };
