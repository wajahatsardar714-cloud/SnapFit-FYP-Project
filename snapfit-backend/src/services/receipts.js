const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const Receipt = require('../models/Receipt');
const Counter = require('../models/Counter');
const { PLANS } = require('../config/plans');
const { receiptConfig } = require('../config/receipt');
const { formatDate } = require('../utils/formatDate');

// Subscription receipts: issuing (with a sequential number per year), voiding,
// the JSON the API returns and the PDF.

const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'snapfit-logo.png');

const REASON_LABELS = {
  plan_selected: 'New subscription',
  plan_changed: 'Plan change',
  admin_change: 'Plan change by SnapFit',
};

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

// "SF-2026-000012": the 12th receipt of 2026.
async function nextReceiptNumber(date) {
  const year = date.getUTCFullYear();
  const seq = await Counter.next(`receipt-${year}`);
  return `SF-${year}-${String(seq).padStart(6, '0')}`;
}

// Issues a receipt for the merchant's current subscription. `reason` is
// 'plan_selected', 'plan_changed' or 'admin_change'.
async function issueReceipt(merchant, reason, { now = new Date() } = {}) {
  const config = receiptConfig();
  const { subscription } = merchant;
  const plan = PLANS[subscription.plan];
  const hasPrice = plan.price != null;
  const amount = hasPrice ? plan.price : 0;
  const taxAmount = roundMoney(amount * config.taxRate);

  return Receipt.create({
    number: await nextReceiptNumber(now),
    status: 'issued',
    reason,
    issuedAt: now,
    merchantId: merchant._id,
    merchant: {
      businessName: merchant.businessName ?? null,
      name: merchant.name ?? null,
      email: merchant.email ?? null,
      phone: merchant.phone ?? null,
    },
    plan: plan.plan,
    planName: plan.name,
    periodStart: subscription.startDate ?? now,
    periodEnd: subscription.endDate ?? null,
    currency: config.currency,
    amount,
    taxRate: config.taxRate,
    taxAmount,
    total: roundMoney(amount + taxAmount),
    priceNote: hasPrice ? null : config.customPriceNote,
    paymentMethod: config.paymentMethod,
  });
}

// issueReceipt, but resolves to null (logged) when it fails, so the plan
// change that asked for it still goes through.
async function issueReceiptSafely(merchant, reason, options) {
  try {
    return await issueReceipt(merchant, reason, options);
  } catch (err) {
    console.error('Issuing a receipt failed:', err.message);
    return null;
  }
}

// Marks a receipt void (it stays on record). Resolves to null when it already
// was.
async function voidReceipt(receiptId, { now = new Date() } = {}) {
  return Receipt.findOneAndUpdate({ _id: receiptId, status: 'issued' }, { status: 'void', voidedAt: now }, { new: true });
}

// The seller block shown on receipts (the PDF and the apps alike), from the
// current receipt config; unset details are null.
function sellerDetails() {
  const config = receiptConfig();
  return { name: config.company, address: config.address, email: config.email, website: config.website };
}

// The receipt as the API returns it. A summary (for lists) leaves out the
// merchant's phone number.
function serializeReceipt(receipt, { summary = false } = {}) {
  const merchant = {
    businessName: receipt.merchant?.businessName ?? null,
    name: receipt.merchant?.name ?? null,
    email: receipt.merchant?.email ?? null,
  };
  if (!summary) merchant.phone = receipt.merchant?.phone ?? null;

  return {
    _id: receipt._id,
    number: receipt.number,
    status: receipt.status,
    reason: receipt.reason,
    issuedAt: receipt.issuedAt,
    merchantId: receipt.merchantId,
    seller: sellerDetails(),
    merchant,
    plan: receipt.plan,
    planName: receipt.planName,
    periodStart: receipt.periodStart ?? null,
    periodEnd: receipt.periodEnd ?? null,
    currency: receipt.currency,
    amount: receipt.amount,
    taxRate: receipt.taxRate,
    taxAmount: receipt.taxAmount,
    total: receipt.total,
    priceNote: receipt.priceNote ?? null,
    paymentMethod: receipt.paymentMethod,
    voidedAt: receipt.voidedAt ?? null,
  };
}

function receiptFilename(receipt) {
  return `SnapFit-receipt-${receipt.number}.pdf`;
}

// ---------------------------------------------------------------- PDF

const COLORS = {
  text: '#1f2937',
  muted: '#6b7280',
  line: '#d1d5db',
  headerFill: '#f3f4f6',
  brand: '#0f2a4a',
  void: '#dc2626',
};

function money(value, currency) {
  const amount = Number(value || 0).toFixed(2);
  return currency === 'USD' ? `$${amount}` : `${amount} ${currency}`;
}

function periodText(receipt) {
  const start = formatDate(receipt.periodStart);
  const end = receipt.periodEnd ? formatDate(receipt.periodEnd) : 'no end date';
  return start ? `${start} to ${end}` : end;
}

// A block of lines under a small grey heading; returns the y below it.
function drawBlock(doc, heading, lines, x, y, width) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.muted).text(heading.toUpperCase(), x, y, { width });
  let cursor = y + 16;
  lines.filter(Boolean).forEach((line, index) => {
    doc
      .font(index === 0 ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(index === 0 ? 11 : 10)
      .fillColor(COLORS.text)
      .text(line, x, cursor, { width });
    cursor = doc.y + 3;
  });
  return cursor;
}

function drawHeader(doc, receipt, left, right) {
  const top = 50;
  if (fs.existsSync(LOGO_PATH)) doc.image(LOGO_PATH, left, top, { height: 60 });

  const isVoid = receipt.status === 'void';
  const infoX = right - 230;
  doc.font('Helvetica-Bold').fontSize(22).fillColor(COLORS.brand).text('Subscription Receipt', infoX, top, {
    width: 230,
    align: 'right',
  });
  const rows = [
    ['Receipt number', receipt.number],
    ['Date issued', formatDate(receipt.issuedAt)],
    ['Status', isVoid ? 'VOID' : 'Issued'],
  ];
  if (isVoid && receipt.voidedAt) rows.push(['Voided on', formatDate(receipt.voidedAt)]);

  let y = top + 34;
  rows.forEach(([label, value]) => {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(label, infoX, y, { width: 110 });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(label === 'Status' && isVoid ? COLORS.void : COLORS.text)
      .text(value, infoX + 110, y - 1, { width: 120, align: 'right' });
    y += 16;
  });
  return Math.max(y, top + 70) + 14;
}

function drawLineItems(doc, receipt, left, right, top) {
  const width = right - left;
  const columns = [
    { title: 'Description', x: left + 10, width: width * 0.46 },
    { title: 'Period', x: left + 10 + width * 0.48, width: width * 0.3 },
    { title: 'Amount', x: right - 10 - width * 0.18, width: width * 0.18, align: 'right' },
  ];

  doc.rect(left, top, width, 24).fill(COLORS.headerFill);
  columns.forEach((col) => {
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text(col.title.toUpperCase(), col.x, top + 8, { width: col.width, align: col.align || 'left' });
  });

  const rowTop = top + 34;
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(COLORS.text)
    .text(`SnapFit ${receipt.planName} plan`, columns[0].x, rowTop, { width: columns[0].width });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(`Monthly subscription - ${REASON_LABELS[receipt.reason] || 'Subscription'}`, { width: columns[0].width });
  if (receipt.priceNote) doc.text(receipt.priceNote, { width: columns[0].width });
  const descriptionBottom = doc.y;

  doc.font('Helvetica').fontSize(10).fillColor(COLORS.text).text(periodText(receipt), columns[1].x, rowTop, {
    width: columns[1].width,
  });
  doc.text(money(receipt.amount, receipt.currency), columns[2].x, rowTop, { width: columns[2].width, align: 'right' });

  const bottom = Math.max(descriptionBottom, doc.y) + 10;
  doc.moveTo(left, bottom).lineTo(right, bottom).lineWidth(0.5).strokeColor(COLORS.line).stroke();
  return bottom + 14;
}

function drawTotals(doc, receipt, right, top) {
  const labelX = right - 230;
  const rows = [
    ['Subtotal', money(receipt.amount, receipt.currency)],
    [`Tax (${roundMoney(receipt.taxRate * 100)}%)`, money(receipt.taxAmount, receipt.currency)],
  ];
  let y = top;
  rows.forEach(([label, value]) => {
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted).text(label, labelX, y, { width: 120 });
    doc.fillColor(COLORS.text).text(value, labelX + 120, y, { width: 110, align: 'right' });
    y += 18;
  });
  doc.moveTo(labelX, y).lineTo(right, y).lineWidth(0.5).strokeColor(COLORS.line).stroke();
  y += 8;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.brand).text(`Total (${receipt.currency})`, labelX, y, {
    width: 120,
  });
  doc.text(money(receipt.total, receipt.currency), labelX + 120, y, { width: 110, align: 'right' });
  return y + 34;
}

function drawPayment(doc, receipt, left, right, top) {
  const width = right - left;
  doc.rect(left, top, width, 46).lineWidth(0.5).strokeColor(COLORS.line).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text('PAYMENT METHOD', left + 12, top + 10, { width: width - 24 });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(COLORS.text)
    .text(`${receipt.paymentMethod}. Amount charged: ${money(0, receipt.currency)}.`, left + 12, top + 25, {
      width: width - 24,
    });
}

function drawVoidWatermark(doc) {
  const { width, height } = doc.page;
  doc.save();
  doc.rotate(-35, { origin: [width / 2, height / 2] });
  doc
    .font('Helvetica-Bold')
    .fontSize(150)
    .fillColor(COLORS.void)
    .fillOpacity(0.15)
    .text('VOID', 0, height / 2 - 75, { width, align: 'center', lineBreak: false });
  doc.restore();
}

function drawFooter(doc, left, right) {
  const y = doc.page.height - 70;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(COLORS.line).stroke();
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(receiptConfig().footerNote, left, y + 12, { width: right - left, align: 'center', lineBreak: false });
}

// The receipt as an A4 PDF; resolves to a Buffer.
function renderReceiptPdf(receipt) {
  return new Promise((resolve, reject) => {
    const config = receiptConfig();
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 30, left: 50, right: 50 },
      info: { Title: `SnapFit receipt ${receipt.number}`, Author: config.company },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const half = (right - left) / 2;

    if (receipt.status === 'void') drawVoidWatermark(doc);

    let y = drawHeader(doc, receipt, left, right);
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(COLORS.brand).stroke();
    y += 18;

    const sellerBottom = drawBlock(
      doc,
      'From',
      [config.company, config.address, config.email, config.website],
      left,
      y,
      half - 20
    );
    const merchant = receipt.merchant || {};
    const buyerBottom = drawBlock(
      doc,
      'Bill to',
      [merchant.businessName || merchant.name, merchant.businessName ? merchant.name : null, merchant.email, merchant.phone],
      left + half + 20,
      y,
      half - 20
    );
    y = Math.max(sellerBottom, buyerBottom) + 20;

    y = drawLineItems(doc, receipt, left, right, y);
    y = drawTotals(doc, receipt, right, y);
    drawPayment(doc, receipt, left, right, y);
    drawFooter(doc, left, right);

    doc.end();
  });
}

module.exports = {
  issueReceipt,
  issueReceiptSafely,
  voidReceipt,
  serializeReceipt,
  receiptFilename,
  renderReceiptPdf,
  nextReceiptNumber,
};
