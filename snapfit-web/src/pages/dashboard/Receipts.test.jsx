import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { downloadReceiptPdf, getReceipt, listReceipts } from '../../services/receiptsApi';
import { saveBlob } from '../../utils/download';
import ReceiptsPage from './ReceiptsPage';
import ReceiptDetailPage from './ReceiptDetailPage';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../utils/download', () => ({ saveBlob: vi.fn() }));
vi.mock('../../services/receiptsApi', () => ({
  listReceipts: vi.fn(),
  getReceipt: vi.fn(),
  downloadReceiptPdf: vi.fn(),
}));

const RECEIPT = {
  _id: 'r12',
  number: 'SF-2026-000012',
  status: 'issued',
  reason: 'plan_selected',
  issuedAt: '2026-11-12T10:00:00.000Z',
  merchant: { businessName: 'Blue Tees', name: 'Ali Khan', email: 'blue@shop.dev', phone: '+92 300 0000000' },
  plan: 'medium',
  planName: 'Medium',
  periodStart: '2026-11-12T10:00:00.000Z',
  periodEnd: '2026-12-12T10:00:00.000Z',
  currency: 'USD',
  amount: 99,
  taxRate: 0,
  taxAmount: 0,
  total: 99,
  priceNote: null,
  paymentMethod: 'Demo (no charge)',
  voidedAt: null,
};

const VOIDED = {
  ...RECEIPT,
  _id: 'r11',
  number: 'SF-2026-000011',
  status: 'void',
  plan: 'enterprise',
  planName: 'Enterprise',
  amount: 0,
  total: 0,
  priceNote: 'Custom price as agreed',
  voidedAt: '2026-11-12T11:00:00.000Z',
};

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard/receipts" element={<ReceiptsPage />} />
        <Route path="/dashboard/receipts/:id" element={<ReceiptDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const originalPrint = window.print;

beforeEach(() => {
  vi.clearAllMocks();
  listReceipts.mockResolvedValue({ receipts: [RECEIPT, VOIDED] });
  getReceipt.mockResolvedValue({ receipt: RECEIPT });
});

afterEach(() => {
  window.print = originalPrint;
});

describe('ReceiptsPage', () => {
  it('lists each receipt with its number, date, plan, period, total and status', async () => {
    renderAt('/dashboard/receipts');

    const issued = within((await screen.findByRole('link', { name: 'SF-2026-000012' })).closest('tr'));
    expect(issued.getByRole('link').getAttribute('href')).toBe('/dashboard/receipts/r12');
    expect(issued.getByText('Medium')).toBeTruthy();
    expect(issued.getByText('$99.00')).toBeTruthy();
    expect(issued.getByText('Issued')).toBeTruthy();
    expect(issued.getByText(/12 Nov 2026 – 12 Dec 2026/)).toBeTruthy();

    const voided = within(screen.getByRole('link', { name: 'SF-2026-000011' }).closest('tr'));
    expect(voided.getByText('Void')).toBeTruthy();
    expect(voided.getByText('Custom price as agreed')).toBeTruthy();
  });

  it('shows an empty state', async () => {
    listReceipts.mockResolvedValue({ receipts: [] });
    renderAt('/dashboard/receipts');
    expect(await screen.findByText('No receipts yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'choose a plan' }).getAttribute('href')).toBe('/dashboard/subscription/plans');
  });
});

describe('ReceiptDetailPage', () => {
  it('renders a receipt: seller, bill-to, line item, totals and the demo payment method', async () => {
    renderAt('/dashboard/receipts/r12');

    const receipt = await screen.findByRole('article', { name: 'Receipt SF-2026-000012' });
    expect(getReceipt).toHaveBeenCalledWith('r12');
    expect(receipt.getAttribute('data-theme')).toBe('light');
    const doc = within(receipt);
    expect(doc.getByRole('img', { name: 'SnapFit' })).toBeTruthy();
    expect(doc.getByRole('heading', { name: 'Receipt' })).toBeTruthy();
    expect(doc.getByText('SF-2026-000012')).toBeTruthy();
    expect(doc.getByText('Blue Tees')).toBeTruthy();
    expect(doc.getByText('Ali Khan')).toBeTruthy();
    expect(doc.getByText('blue@shop.dev')).toBeTruthy();
    expect(doc.getByText('+92 300 0000000')).toBeTruthy();
    expect(doc.getByText('SnapFit Medium plan')).toBeTruthy();
    expect(doc.getByText('Tax (0%)')).toBeTruthy();
    expect(doc.getAllByText('$99.00').length).toBeGreaterThanOrEqual(3);
    expect(doc.getByText('Demo (no charge)')).toBeTruthy();
    expect(doc.getByText('New subscription')).toBeTruthy();
    expect(doc.queryByText('VOID')).toBeNull();
    expect(doc.queryByText(/^Paid$/)).toBeNull();
  });

  it('shows a VOID banner on a voided receipt', async () => {
    getReceipt.mockResolvedValue({ receipt: VOIDED });
    renderAt('/dashboard/receipts/r11');

    const doc = within(await screen.findByRole('article', { name: 'Receipt SF-2026-000011' }));
    expect(doc.getByText('VOID')).toBeTruthy();
    expect(doc.getByText(/voided on 12 Nov 2026/)).toBeTruthy();
    expect(doc.getAllByText('Custom price as agreed').length).toBeGreaterThan(0);
  });

  it('downloads the PDF through the API and saves it', async () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    downloadReceiptPdf.mockResolvedValue({ blob, filename: 'SnapFit-receipt-SF-2026-000012.pdf' });
    renderAt('/dashboard/receipts/r12');

    fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }));

    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'SnapFit-receipt-SF-2026-000012.pdf'));
    expect(downloadReceiptPdf).toHaveBeenCalledWith('r12', 'SF-2026-000012');
  });

  it('says so when the download fails', async () => {
    downloadReceiptPdf.mockRejectedValue(new Error('Network'));
    renderAt('/dashboard/receipts/r12');
    fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it('prints with the toolbar hidden from paper', async () => {
    window.print = vi.fn();
    renderAt('/dashboard/receipts/r12');

    const print = await screen.findByRole('button', { name: 'Print' });
    expect(print.parentElement.parentElement.className).toContain('print:hidden');
    fireEvent.click(print);
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('says when a receipt does not exist', async () => {
    getReceipt.mockRejectedValue({ response: { status: 404 } });
    renderAt('/dashboard/receipts/nope');
    expect(await screen.findByText('Receipt not found')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'All receipts' }).getAttribute('href')).toBe('/dashboard/receipts');
  });
});
