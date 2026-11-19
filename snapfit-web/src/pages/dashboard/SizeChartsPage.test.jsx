import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import api from '../../services/api';
import SizeChartsPage from './SizeChartsPage';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const SIZES = [
  { _id: 's1', label: 'S', measurements: { chest: { min: 86, max: 91 } } },
  { _id: 's2', label: 'M', measurements: { chest: { min: 91, max: 96 } } },
];
const CHART = {
  _id: 'c1',
  merchantId: 'merchant-1',
  name: 'Tees',
  category: 'tops',
  gender: 'unisex',
  unit: 'cm',
  sizes: SIZES,
  isActive: true,
  createdAt: '2026-01-01',
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/dashboard/size-charts']}>
      <Routes>
        <Route path="/dashboard/size-charts" element={<SizeChartsPage />} />
        <Route path="/dashboard/size-charts/:id/edit" element={<p>Editing chart</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async (url) =>
    url === '/charts'
      ? { data: { charts: [CHART], pagination: { page: 1, totalPages: 1, total: 1 } } }
      : { data: { chart: CHART } }
  );
});

describe('SizeChartsPage duplicate', () => {
  it('fetches the chart, creates a "(copy)" of it and opens the copy for editing', async () => {
    api.post.mockResolvedValue({ data: { chart: { _id: 'c9', name: 'Tees (copy)' } } });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate Tees' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.get).toHaveBeenCalledWith('/charts/c1');
    expect(api.post).toHaveBeenCalledWith('/charts', {
      name: 'Tees (copy)',
      category: 'tops',
      gender: 'unisex',
      unit: 'cm',
      sizes: [
        { label: 'S', measurements: { chest: { min: 86, max: 91 } } },
        { label: 'M', measurements: { chest: { min: 91, max: 96 } } },
      ],
    });
    expect(await screen.findByText('Editing chart')).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith('Created "Tees (copy)"');
  });

  it("shows the server's plan-limit message and stays on the list", async () => {
    const message = 'Your Basic plan allows up to 3 size charts. Upgrade to add more.';
    api.post.mockRejectedValue({ response: { status: 403, data: { message } } });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Duplicate Tees' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    expect(screen.queryByText('Editing chart')).toBeNull();
    expect(screen.getByRole('button', { name: 'Duplicate Tees' }).disabled).toBe(false);
  });
});
