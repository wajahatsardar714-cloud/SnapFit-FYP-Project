import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import {
  downloadAdminReceiptPdf,
  downloadReceiptPdf,
  filenameFromDisposition,
  listMerchantReceipts,
  voidReceipt,
} from './receiptsApi';
import { createAnnouncement, cancelAnnouncement } from './announcementsApi';
import { listNotifications, updateNotificationPreferences } from './notificationsApi';

vi.mock('./api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('receiptsApi', () => {
  it('reads the file name from Content-Disposition, with a fallback', () => {
    expect(filenameFromDisposition('inline; filename="SnapFit-receipt-SF-2026-000012.pdf"', 'x.pdf')).toBe(
      'SnapFit-receipt-SF-2026-000012.pdf'
    );
    expect(filenameFromDisposition(undefined, 'x.pdf')).toBe('x.pdf');
  });

  it('fetches the PDF as a blob with the auth-carrying client', async () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    api.get.mockResolvedValue({ data: blob, headers: { 'content-disposition': 'inline; filename="SnapFit-receipt-A.pdf"' } });

    await expect(downloadReceiptPdf('r1', 'A')).resolves.toEqual({ blob, filename: 'SnapFit-receipt-A.pdf' });
    expect(api.get).toHaveBeenCalledWith('/receipts/r1/pdf', { responseType: 'blob' });

    api.get.mockResolvedValue({ data: blob, headers: {} });
    await expect(downloadAdminReceiptPdf('r2', 'SF-2026-000002')).resolves.toEqual({
      blob,
      filename: 'SnapFit-receipt-SF-2026-000002.pdf',
    });
    expect(api.get).toHaveBeenLastCalledWith('/admin/receipts/r2/pdf', { responseType: 'blob' });
  });

  it('lists a merchant receipts and voids one (admin)', async () => {
    api.get.mockResolvedValue({ data: { receipts: [] } });
    api.post.mockResolvedValue({ data: { receipt: { status: 'void' } } });

    await listMerchantReceipts('m1');
    expect(api.get).toHaveBeenCalledWith('/admin/receipts', { params: { merchantId: 'm1' } });
    await expect(voidReceipt('r1')).resolves.toEqual({ receipt: { status: 'void' } });
    expect(api.post).toHaveBeenCalledWith('/admin/receipts/r1/void');
  });
});

describe('notifications and announcements API', () => {
  it('sends unread only when asked', async () => {
    api.get.mockResolvedValue({ data: {} });
    await listNotifications({ page: 2, limit: 20 });
    expect(api.get).toHaveBeenCalledWith('/notifications', { params: { page: 2, limit: 20 } });
    await listNotifications({ unread: true });
    expect(api.get).toHaveBeenLastCalledWith('/notifications', { params: { page: 1, limit: 20, unread: true } });
  });

  it('wraps preferences in { preferences }', async () => {
    api.put.mockResolvedValue({ data: {} });
    await updateNotificationPreferences({ 'usage.80': false });
    expect(api.put).toHaveBeenCalledWith('/notifications/preferences', { preferences: { 'usage.80': false } });
  });

  it('creates and cancels announcements', async () => {
    api.post.mockResolvedValue({ data: { announcement: {} } });
    await createAnnouncement({ title: 'T' });
    expect(api.post).toHaveBeenCalledWith('/admin/announcements', { title: 'T' });
    await cancelAnnouncement('a1');
    expect(api.post).toHaveBeenLastCalledWith('/admin/announcements/a1/cancel');
  });
});
