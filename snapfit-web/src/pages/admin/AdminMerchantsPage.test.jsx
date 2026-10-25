import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listMerchants, setMerchantStatus } from '../../services/adminApi';
import AdminMerchantsPage from './AdminMerchantsPage';

vi.mock('../../services/adminApi', () => ({ listMerchants: vi.fn(), setMerchantStatus: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

function merchant(overrides) {
  return {
    _id: 'm1',
    businessName: 'Blue Tees',
    email: 'blue@shop.dev',
    status: 'active',
    subscription: { plan: 'basic', requestsUsed: 3, requestsLimit: 500 },
    createdAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function page(merchants, { page: current = 1, pages = 1, total = merchants.length } = {}) {
  return { merchants, page: current, pages, total };
}

function renderPage() {
  render(
    <MemoryRouter>
      <AdminMerchantsPage />
    </MemoryRouter>
  );
}

const lastParams = () => listMerchants.mock.calls.at(-1)[0];

beforeEach(() => {
  listMerchants.mockReset();
  setMerchantStatus.mockReset();
  listMerchants.mockResolvedValue(page([merchant()]));
});

describe('AdminMerchantsPage', () => {
  it('lists merchants with their plan, status and usage', async () => {
    renderPage();

    const row = within((await screen.findByText('Blue Tees')).closest('tr'));
    expect(row.getByText('blue@shop.dev')).toBeTruthy();
    expect(row.getByText('Basic')).toBeTruthy();
    expect(row.getByText('Active')).toBeTruthy();
    expect(lastParams()).toEqual({ page: 1, limit: 10 });
  });

  it('searches and filters, starting again from the first page', async () => {
    listMerchants.mockResolvedValue(page([merchant()], { pages: 3, total: 25 }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Next/ }));
    await waitFor(() => expect(lastParams().page).toBe(2));

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '  blue  ' } });
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() => expect(lastParams()).toEqual({ page: 1, limit: 10, search: 'blue' }));

    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'pro' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'suspended' } });
    await waitFor(() =>
      expect(lastParams()).toEqual({ page: 1, limit: 10, search: 'blue', plan: 'pro', status: 'suspended' })
    );
  });

  it('offers to clear filters when nothing matches', async () => {
    renderPage();
    await screen.findByText('Blue Tees');
    listMerchants.mockResolvedValue(page([]));

    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'enterprise' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));

    await waitFor(() => expect(lastParams()).toEqual({ page: 1, limit: 10 }));
  });

  it('suspends a merchant with the reason given', async () => {
    setMerchantStatus.mockResolvedValue({ merchant: merchant({ status: 'suspended' }) });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Suspend Blue Tees' }));
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: ' Payment overdue ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suspend merchant' }));

    await waitFor(() =>
      expect(setMerchantStatus).toHaveBeenCalledWith('m1', { status: 'suspended', reason: 'Payment overdue' })
    );
    await waitFor(() => expect(listMerchants).toHaveBeenCalledTimes(2));
  });

  it('reactivates a suspended merchant', async () => {
    listMerchants.mockResolvedValue(page([merchant({ status: 'suspended' })]));
    setMerchantStatus.mockResolvedValue({ merchant: merchant() });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Reactivate Blue Tees' }));
    expect(screen.queryByLabelText('Reason (optional)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate merchant' }));

    await waitFor(() => expect(setMerchantStatus).toHaveBeenCalledWith('m1', { status: 'active' }));
  });
});
