// Display helpers for subscription receipts. There is no payment gateway, so a
// receipt never says "Paid" on its own: it states the demo payment method.

export const RECEIPT_STATUS = {
  issued: { label: 'Issued', variant: 'success' },
  void: { label: 'Void', variant: 'danger' },
};

export function receiptStatus(status) {
  return RECEIPT_STATUS[status] || { label: status ? status.charAt(0).toUpperCase() + status.slice(1) : '—', variant: 'neutral' };
}

const REASONS = {
  plan_selected: 'New subscription',
  plan_changed: 'Plan change',
  admin_change: 'Updated by SnapFit',
};

export function receiptReason(reason) {
  return REASONS[reason] || '';
}

export function formatMoney(amount, currency = 'USD') {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || ''}`.trim();
  }
}

export function formatReceiptDate(value) {
  return value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export function formatPeriod(start, end) {
  if (!start && !end) return '—';
  return `${formatReceiptDate(start)} – ${end ? formatReceiptDate(end) : 'no end date'}`;
}

// "0%" / "7.5%". The rate may be a fraction (0.075) or already a percentage (7.5).
export function formatTaxRate(rate) {
  const value = Number(rate) || 0;
  const pct = value > 0 && value <= 1 ? value * 100 : value;
  return `${Math.round(pct * 100) / 100}%`;
}

// A total of 0 with a note (Enterprise at a custom price) shows the note.
export function formatReceiptTotal(receipt) {
  if (!receipt) return '—';
  if (!receipt.total && receipt.priceNote) return receipt.priceNote;
  return formatMoney(receipt.total, receipt.currency);
}
