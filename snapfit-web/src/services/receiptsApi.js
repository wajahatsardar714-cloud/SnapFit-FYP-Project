import api from './api';

// Subscription receipts. A merchant reads their own (/api/receipts); the super
// admin reads any merchant's and can void one (/api/admin/receipts).
const data = (request) => request.then((res) => res.data);
const receiptPath = (id) => `/receipts/${encodeURIComponent(id)}`;
const adminReceiptPath = (id) => `/admin/receipts/${encodeURIComponent(id)}`;

export const listReceipts = () => data(api.get('/receipts'));

export const getReceipt = (id) => data(api.get(receiptPath(id)));

// 'inline; filename="SnapFit-receipt-SF-2026-000012.pdf"' -> the file name.
export function filenameFromDisposition(header, fallback) {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header || '');
  return match ? decodeURIComponent(match[1].trim()) : fallback;
}

export const receiptFilename = (number) => `SnapFit-receipt-${number || 'receipt'}.pdf`;

// The PDF is fetched with the auth header (a plain link would not carry it),
// so it comes back as a blob for the caller to save.
async function fetchPdf(path, number) {
  const res = await api.get(path, { responseType: 'blob' });
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/pdf' });
  return { blob, filename: filenameFromDisposition(res.headers?.['content-disposition'], receiptFilename(number)) };
}

export const downloadReceiptPdf = (id, number) => fetchPdf(`${receiptPath(id)}/pdf`, number);

// Super admin only.
export const listMerchantReceipts = (merchantId) => data(api.get('/admin/receipts', { params: { merchantId } }));

export const downloadAdminReceiptPdf = (id, number) => fetchPdf(`${adminReceiptPath(id)}/pdf`, number);

export const voidReceipt = (id) => data(api.post(`${adminReceiptPath(id)}/void`));
