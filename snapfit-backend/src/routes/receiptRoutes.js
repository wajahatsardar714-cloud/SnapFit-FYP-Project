const express = require('express');
const { protect, requireMerchant } = require('../middlewares/authMiddleware');
const { listMyReceipts, getMyReceipt, getMyReceiptPdf } = require('../controllers/receiptController');

const router = express.Router();

// A merchant's own receipts. Not behind the active-subscription gate: a
// merchant whose plan has ended can still open past receipts.
router.use(protect, requireMerchant);

router.get('/', listMyReceipts);
router.get('/:id', getMyReceipt);
router.get('/:id/pdf', getMyReceiptPdf);

module.exports = router;
