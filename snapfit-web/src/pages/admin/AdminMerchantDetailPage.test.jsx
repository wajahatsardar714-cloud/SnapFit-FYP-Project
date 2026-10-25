import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteMerchant,
  getMerchant,
  regenerateApiKey,
  resetMerchantPassword,
  setMerchantStatus,
  updateSubscription,
} from '../../services/adminApi';
import AdminMerchantDetailPage from './AdminMerchantDetailPage';

vi.mock('../../services/adminApi', () => ({
  getMerchant: vi.fn(),
  updateSubscription: vi.fn(),
  setMerchantStatus: vi.fn(),
  regenerateApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  resetMerchantPassword: vi.fn(),
  deleteMerchant: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../components/ui/toast', () => ({ notifyInfo: vi.fn() }));

const MERCHANT = {
  _id: 'm1',
  name: 'Ali',
  businessName: 'Blue Tees',
  email: 'blue@shop.dev',
  status: 'active',
  hasApiKey: true,
  subscription: { plan: 'basic', status: 'active', requestsLimit: 500, requestsUsed: 120, endDate: null },
  createdAt: '2026-01-02T00:00:00.000Z',
  counts: { sizeCharts: 1, products: 2, recommendations: 3 },
};

function detail(merchant = MERCHANT) {
  return { merchant, apiKeyPreview: 'sk_live_…ab12', sizeCharts: [], products: [], recentRecommendations: [] };
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/admin/merchants/m1']}>
      <Routes>
        <Route path="/admin/merchants/:id" element={<AdminMerchantDetailPage />} />
        <Route path="/admin/merchants" element={<p>Merchants list</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const limitsForm = () => screen.findByRole('form', { name: 'Plan and limits' });

beforeEach(() => {
  vi.clearAllMocks();
  getMerchant.mockResolvedValue(detail());
  updateSubscription.mockImplementation(async (_id, body) => ({
    merchant: { ...MERCHANT, subscription: { ...MERCHANT.subscription, ...body } },
  }));
});

describe('AdminMerchantDetailPage limits editor', () => {
  it('sends only what changed, a cleared limit as unlimited (null) and the usage reset', async () => {
    renderPage();
    await limitsForm();

    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'pro' } });
    fireEvent.click(screen.getByLabelText('Unlimited requests'));
    fireEvent.click(screen.getByLabelText('Reset requests used to 0'));
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));

    await waitFor(() =>
      expect(updateSubscription).toHaveBeenCalledWith('m1', { plan: 'pro', requestsLimit: null, resetUsage: true })
    );
  });

  it('sends a custom whole-number limit and rejects an empty one', async () => {
    renderPage();
    await limitsForm();

    fireEvent.change(screen.getByLabelText('Request limit'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));
    expect(await screen.findByText(/whole number of requests/)).toBeTruthy();
    expect(updateSubscription).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Request limit'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));
    await waitFor(() => expect(updateSubscription).toHaveBeenCalledWith('m1', { requestsLimit: 2000 }));
  });

  it('saves nothing when nothing changed', async () => {
    renderPage();
    await limitsForm();

    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));

    expect(updateSubscription).not.toHaveBeenCalled();
  });
});

describe('AdminMerchantDetailPage account actions', () => {
  it('suspends with a reason', async () => {
    setMerchantStatus.mockResolvedValue({ merchant: { ...MERCHANT, status: 'suspended' } });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Suspend merchant' }));
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Chargeback' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Suspend merchant' }).at(-1));

    await waitFor(() =>
      expect(setMerchantStatus).toHaveBeenCalledWith('m1', { status: 'suspended', reason: 'Chargeback' })
    );
  });

  it('regenerates the API key and shows the new key once', async () => {
    regenerateApiKey.mockResolvedValue({ apiKey: 'sk_live_newkey123' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate key' }));

    expect((await screen.findByLabelText('API key')).value).toBe('sk_live_newkey123');
    expect(regenerateApiKey).toHaveBeenCalledWith('m1');
  });

  it('resets the password, requiring at least 8 characters', async () => {
    resetMerchantPassword.mockResolvedValue({ message: 'Password reset' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Reset password' }));
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset password' }).at(-1));
    expect(await screen.findByText('Use at least 8 characters.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPass123' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset password' }).at(-1));
    await waitFor(() => expect(resetMerchantPassword).toHaveBeenCalledWith('m1', 'NewPass123'));
  });

  it('deletes only after the business name is typed, then returns to the list', async () => {
    deleteMerchant.mockResolvedValue({ message: 'Merchant deleted' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete merchant' }));
    const confirm = screen.getAllByRole('button', { name: 'Delete merchant' }).at(-1);
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Type "Blue Tees" to confirm'), { target: { value: 'Blue Tees' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(deleteMerchant).toHaveBeenCalledWith('m1'));
    expect(await screen.findByText('Merchants list')).toBeTruthy();
  });
});
