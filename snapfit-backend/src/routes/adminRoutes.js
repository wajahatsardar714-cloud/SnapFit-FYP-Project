const express = require('express');
const { body, query } = require('express-validator');
const { protect, requireSuperAdmin } = require('../middlewares/authMiddleware');
const { loadTargetMerchant, loadDemoMerchant, useDemoProduct } = require('../middlewares/adminMiddleware');
const { getDemoProduct } = require('../controllers/adminDemoController');
const { createHandoffSession, getHandoffStatus, getHandoffPhoto } = require('../controllers/handoffController');
const Merchant = require('../models/Merchant');
const { PLAN_IDS } = require('../config/plans');
const { uploadShopperPhoto, MAX_EXTRA_FRAMES } = require('../utils/shopperPhotoUpload');
const {
  listMerchants,
  getMerchant,
  updateSubscription,
  updateStatus,
  regenerateApiKey,
  revokeApiKey,
  resetPassword,
  deleteMerchant,
  getAuditLog,
} = require('../controllers/adminMerchantController');
const { getOverview, getAnalytics, exportAnalytics } = require('../controllers/adminAnalyticsController');
const { recommend } = require('../controllers/recommendController');
const { tryOn } = require('../controllers/tryOnController');

const SUBSCRIPTION_STATUSES = Merchant.schema.path('subscription.status').enumValues;
const ACCOUNT_STATUSES = Merchant.schema.path('status').enumValues;

const router = express.Router();

// A repeated query param (?plan=a&plan=b) arrives as an array, and validators
// like isIn check it item by item -- so reject it before they run.
function singleQuery(field) {
  return query(field).not().isArray().withMessage(`${field} must be given once`).bail();
}

function paginationValidation(maxLimit) {
  return [
    singleQuery('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer').toInt(),
    singleQuery('limit')
      .optional()
      .isInt({ min: 1, max: maxLimit })
      .withMessage(`limit must be an integer between 1 and ${maxLimit}`)
      .toInt(),
  ];
}

const listMerchantsValidation = [
  singleQuery('search')
    .optional()
    .isString()
    .withMessage('search must be text')
    .trim()
    .isLength({ max: 100 })
    .withMessage('search must be at most 100 characters'),
  singleQuery('plan')
    .optional({ values: 'falsy' })
    .isIn(PLAN_IDS)
    .withMessage(`plan must be one of: ${PLAN_IDS.join(', ')}`),
  singleQuery('status')
    .optional({ values: 'falsy' })
    .isIn(ACCOUNT_STATUSES)
    .withMessage(`status must be one of: ${ACCOUNT_STATUSES.join(', ')}`),
  ...paginationValidation(100),
];

const subscriptionValidation = [
  body('plan').optional().isIn(PLAN_IDS).withMessage(`plan must be one of: ${PLAN_IDS.join(', ')}`),
  body('status')
    .optional()
    .isIn(SUBSCRIPTION_STATUSES)
    .withMessage(`status must be one of: ${SUBSCRIPTION_STATUSES.join(', ')}`),
  body('requestsLimit')
    .optional({ values: 'null' })
    .isInt({ min: 0 })
    .withMessage('requestsLimit must be a non-negative integer, or null for unlimited'),
  body('endDate')
    .optional({ values: 'null' })
    .isISO8601({ strict: true })
    .withMessage('endDate must be an ISO 8601 date, or null for no end date'),
  body('resetUsage').optional().isBoolean({ strict: true }).withMessage('resetUsage must be true or false').toBoolean(true),
];

const statusValidation = [
  body('status').isIn(ACCOUNT_STATUSES).withMessage(`status must be one of: ${ACCOUNT_STATUSES.join(', ')}`),
  body('reason')
    .optional({ values: 'null' })
    .isString()
    .withMessage('reason must be text')
    .trim()
    .isLength({ max: 500 })
    .withMessage('reason must be at most 500 characters'),
];

const passwordValidation = [
  body('password')
    .isString()
    .withMessage('Password must be at least 8 characters')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
];

const analyticsValidation = [
  singleQuery('days').optional().isInt({ min: 1, max: 365 }).withMessage('days must be an integer between 1 and 365').toInt(),
];

router.use(protect, requireSuperAdmin);
router.param('id', loadTargetMerchant);

router.get('/overview', getOverview);

router.get('/merchants', listMerchantsValidation, listMerchants);
router.get('/merchants/:id', getMerchant);
router.patch('/merchants/:id/subscription', subscriptionValidation, updateSubscription);
router.patch('/merchants/:id/status', statusValidation, updateStatus);
router.post('/merchants/:id/api-key', regenerateApiKey);
router.delete('/merchants/:id/api-key', revokeApiKey);
router.post('/merchants/:id/reset-password', passwordValidation, resetPassword);
router.delete('/merchants/:id', deleteMerchant);

router.get('/analytics', analyticsValidation, getAnalytics);
router.get('/analytics/export', exportAnalytics);

router.get('/audit-log', paginationValidation(100), getAuditLog);

// The demo studio: the public widget endpoints on SnapFit's own demo store and
// product (from the server's .env), without an API key and never billed --
// same upload rules and controllers as /api/recommend and /api/try-on. The
// admin never picks a merchant.
router.get('/demo', getDemoProduct);
router.post(
  '/demo/recommend',
  loadDemoMerchant,
  uploadShopperPhoto({ extraFrames: MAX_EXTRA_FRAMES }),
  useDemoProduct,
  recommend
);
router.post('/demo/try-on', loadDemoMerchant, uploadShopperPhoto(), useDemoProduct, tryOn);
// "Use my phone" for the demo studio: the desktop side of the QR handoff, on
// the admin session and the demo store. The phone uploads through the public
// /api/handoff/sessions/:sessionId/photo route, scoped by the QR's session id.
router.post('/demo/handoff', loadDemoMerchant, createHandoffSession);
router.get('/demo/handoff/:sessionId', loadDemoMerchant, getHandoffStatus);
router.get('/demo/handoff/:sessionId/photo', loadDemoMerchant, getHandoffPhoto);

module.exports = router;
