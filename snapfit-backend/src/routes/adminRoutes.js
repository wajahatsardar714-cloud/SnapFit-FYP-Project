const express = require('express');
const { body, query } = require('express-validator');
const { protect, requireSuperAdmin } = require('../middlewares/authMiddleware');
const { loadTargetMerchant, loadDemoMerchant, useDemoProduct } = require('../middlewares/adminMiddleware');
const { getDemoProduct } = require('../controllers/adminDemoController');
const { createHandoffSession, getHandoffStatus, getHandoffPhoto } = require('../controllers/handoffController');
const Merchant = require('../models/Merchant');
const { PLAN_IDS } = require('../config/plans');
const Announcement = require('../models/Announcement');
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
const {
  createAnnouncement,
  listAnnouncements,
  cancelAnnouncement,
} = require('../controllers/adminAnnouncementController');
const { adminListReceipts, adminGetReceiptPdf, adminVoidReceipt } = require('../controllers/receiptController');

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

// In-app links are paths inside the dashboard, never another site.
const IN_APP_LINK = /^\/(?![/\\])\S*$/;

const announcementValidation = [
  body('title')
    .isString()
    .withMessage('title is required')
    .trim()
    .isLength({ min: 1, max: 120 })
    .withMessage('title must be 1 to 120 characters'),
  body('body')
    .isString()
    .withMessage('body is required')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('body must be 1 to 2000 characters'),
  body('link')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('link must be an in-app path starting with "/"')
    .trim()
    .isLength({ max: 500 })
    .withMessage('link must be at most 500 characters')
    .matches(IN_APP_LINK)
    .withMessage('link must be an in-app path starting with "/"'),
  body('audience').isObject().withMessage('audience is required'),
  body('audience.type')
    .isIn(Announcement.AUDIENCE_TYPES)
    .withMessage(`audience.type must be one of: ${Announcement.AUDIENCE_TYPES.join(', ')}`),
  body('audience.plans')
    .if(body('audience.type').equals('plan'))
    .isArray({ min: 1 })
    .withMessage('Choose at least one plan'),
  body('audience.plans.*')
    .if(body('audience.type').equals('plan'))
    .isIn(PLAN_IDS)
    .withMessage(`plans must be from: ${PLAN_IDS.join(', ')}`),
  body('audience.merchantIds')
    .if(body('audience.type').equals('merchants'))
    .isArray({ min: 1, max: 1000 })
    .withMessage('Choose at least one merchant'),
  body('audience.merchantIds.*')
    .if(body('audience.type').equals('merchants'))
    .isMongoId()
    .withMessage('merchantIds must be merchant ids'),
  body('scheduledAt')
    .optional({ values: 'falsy' })
    .isISO8601({ strict: true })
    .withMessage('scheduledAt must be an ISO 8601 date')
    .bail()
    .custom((value) => new Date(value).getTime() > Date.now())
    .withMessage('scheduledAt must be in the future'),
];

const receiptListValidation = [
  singleQuery('merchantId').optional({ values: 'falsy' }).isMongoId().withMessage('merchantId must be a merchant id'),
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

// Announcements and receipts use their own param names, so the merchant :id
// loader above never runs for them.
router.post('/announcements', announcementValidation, createAnnouncement);
router.get('/announcements', listAnnouncements);
router.post('/announcements/:announcementId/cancel', cancelAnnouncement);

router.get('/receipts', receiptListValidation, adminListReceipts);
router.get('/receipts/:receiptId/pdf', adminGetReceiptPdf);
router.post('/receipts/:receiptId/void', adminVoidReceipt);

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
