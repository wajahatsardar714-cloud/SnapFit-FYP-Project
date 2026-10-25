const jwt = require('jsonwebtoken');
const Merchant = require('../models/Merchant');

const ACCOUNT_SUSPENDED_MESSAGE = 'This account has been suspended. Contact support.';

// Verifies the Bearer JWT, then re-checks the account itself on every request,
// so a deleted or suspended account loses access even with a still-valid token.
// req.merchant is the token payload ({ merchantId, email, role }), with the role
// taken from the account rather than trusted from the token.
async function protect(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No authentication token provided' });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Authentication token has expired' });
    }
    return res.status(401).json({ message: 'Invalid authentication token' });
  }

  try {
    const account = await Merchant.findById(decoded.merchantId).select('role status').lean();
    if (!account) {
      return res.status(401).json({ message: 'This account no longer exists' });
    }
    if (account.status === 'suspended') {
      return res.status(403).json({ message: ACCOUNT_SUSPENDED_MESSAGE });
    }

    req.merchant = { ...decoded, role: account.role || 'merchant' };
    return next();
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(401).json({ message: 'Invalid authentication token' });
    }
    return res.status(500).json({ message: 'Authentication failed', error: err.message });
  }
}

// Role gates -- mount after `protect`.
function requireSuperAdmin(req, res, next) {
  if (req.merchant.role !== 'superadmin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }
  return next();
}

function requireMerchant(req, res, next) {
  if (req.merchant.role !== 'merchant') {
    return res.status(403).json({ message: 'Merchant account required' });
  }
  return next();
}

module.exports = { protect, requireSuperAdmin, requireMerchant, ACCOUNT_SUSPENDED_MESSAGE };
