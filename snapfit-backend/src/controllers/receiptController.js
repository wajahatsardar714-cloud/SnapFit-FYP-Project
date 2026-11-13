const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Receipt = require('../models/Receipt');
const AuditLog = require('../models/AuditLog');
const { voidReceipt, serializeReceipt, receiptFilename, renderReceiptPdf } = require('../services/receipts');

// Subscription receipts: merchants see their own; the super admin sees all and
// can void one.

const NOT_FOUND = 'Receipt not found';

function findReceipt(id, filter = {}) {
  if (!mongoose.isObjectIdOrHexString(id)) return Promise.resolve(null);
  return Receipt.findOne({ _id: id, ...filter });
}

async function sendPdf(res, receipt) {
  const pdf = await renderReceiptPdf(receipt);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${receiptFilename(receipt)}"`,
    'Content-Length': pdf.length,
  });
  return res.status(200).send(pdf);
}

// ------------------------------------------------------------ merchant

async function listMyReceipts(req, res) {
  try {
    const receipts = await Receipt.find({ merchantId: req.merchant.merchantId }).sort({ issuedAt: -1, _id: -1 });
    return res.status(200).json({ receipts: receipts.map((r) => serializeReceipt(r, { summary: true })) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch receipts', error: err.message });
  }
}

async function getMyReceipt(req, res) {
  try {
    const receipt = await findReceipt(req.params.id, { merchantId: req.merchant.merchantId });
    if (!receipt) return res.status(404).json({ message: NOT_FOUND });
    return res.status(200).json({ receipt: serializeReceipt(receipt) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch receipt', error: err.message });
  }
}

async function getMyReceiptPdf(req, res) {
  try {
    const receipt = await findReceipt(req.params.id, { merchantId: req.merchant.merchantId });
    if (!receipt) return res.status(404).json({ message: NOT_FOUND });
    return await sendPdf(res, receipt);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create the receipt PDF', error: err.message });
  }
}

// ------------------------------------------------------------ super admin

async function adminListReceipts(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
  const { merchantId } = req.query;

  try {
    const receipts = await Receipt.find(merchantId ? { merchantId } : {}).sort({ issuedAt: -1, _id: -1 });
    return res.status(200).json({ receipts: receipts.map((r) => serializeReceipt(r, { summary: true })) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch receipts', error: err.message });
  }
}

async function adminGetReceiptPdf(req, res) {
  try {
    const receipt = await findReceipt(req.params.receiptId);
    if (!receipt) return res.status(404).json({ message: NOT_FOUND });
    return await sendPdf(res, receipt);
  } catch (err) {
    return res.status(500).json({ message: 'Failed to create the receipt PDF', error: err.message });
  }
}

async function adminVoidReceipt(req, res) {
  try {
    const receipt = await findReceipt(req.params.receiptId);
    if (!receipt) return res.status(404).json({ message: NOT_FOUND });
    if (receipt.status === 'void') return res.status(409).json({ message: 'This receipt is already void' });

    const voided = await voidReceipt(receipt._id);
    if (!voided) return res.status(409).json({ message: 'This receipt is already void' });

    await AuditLog.create({
      adminId: req.merchant.merchantId,
      adminEmail: req.merchant.email,
      action: 'receipt.void',
      targetType: 'receipt',
      targetId: voided._id,
      targetLabel: voided.number,
      details: { merchantId: voided.merchantId, plan: voided.plan, total: voided.total },
    });

    return res.status(200).json({ receipt: serializeReceipt(voided) });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to void receipt', error: err.message });
  }
}

module.exports = {
  listMyReceipts,
  getMyReceipt,
  getMyReceiptPdf,
  adminListReceipts,
  adminGetReceiptPdf,
  adminVoidReceipt,
};
