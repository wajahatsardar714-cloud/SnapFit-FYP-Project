import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMerchant, listMerchants } from '../../services/adminApi';
import AdminDemoStudioPage from './AdminDemoStudioPage';

vi.mock('../../services/adminApi', async (importOriginal) => ({
  demoRecommendPath: (await importOriginal()).demoRecommendPath,
  listMerchants: vi.fn(),
  getMerchant: vi.fn(),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ token: 'admin.jwt' }) }));
// The widget's own requests are covered by its tests; here only what the
// studio hands it matters.
vi.mock('../../components/widget/SnapFitWidget', () => ({
  default: (props) => <pre data-testid="widget">{JSON.stringify(props)}</pre>,
}));

const widgetProps = () => JSON.parse(screen.getByTestId('widget').textContent);

beforeEach(() => {
  localStorage.clear();
  listMerchants.mockResolvedValue({ merchants: [{ _id: 'm1', businessName: 'Blue Tees', status: 'active' }] });
  getMerchant.mockResolvedValue({
    products: [
      { _id: 'p1', productId: 'SKU-1', productName: 'Crew Tee', tryOnStatus: 'ready' },
      { _id: 'p2', productId: 'SKU-2', productName: 'Polo', tryOnStatus: 'image_missing' },
    ],
  });
});

function renderStudio() {
  render(
    <MemoryRouter>
      <AdminDemoStudioPage />
    </MemoryRouter>
  );
}

async function chooseBlueTees() {
  fireEvent.change(await screen.findByLabelText('Merchant'), { target: { value: 'm1' } });
  await screen.findByTestId('widget');
}

describe('AdminDemoStudioPage', () => {
  it('runs the widget on the admin session for the chosen merchant, without an API key', async () => {
    renderStudio();
    await chooseBlueTees();

    expect(getMerchant).toHaveBeenCalledWith('m1');
    expect(widgetProps()).toEqual({
      authToken: 'admin.jwt',
      endpoint: '/admin/demo/recommend?merchantId=m1',
      productId: 'SKU-1',
      apiUrl: expect.any(String),
    });

    fireEvent.change(screen.getByLabelText('Product'), { target: { value: 'SKU-2' } });
    await waitFor(() => expect(widgetProps().productId).toBe('SKU-2'));
  });

  it('switches to a pasted API key, kept in this browser', async () => {
    renderStudio();
    await chooseBlueTees();

    fireEvent.click(screen.getByRole('radio', { name: 'Use an API key instead' }));
    fireEvent.change(screen.getByLabelText('Merchant API key'), { target: { value: ' sk_live_pasted ' } });

    expect(widgetProps()).toEqual({ apiKey: 'sk_live_pasted', productId: 'SKU-1', apiUrl: expect.any(String) });
    expect(localStorage.getItem('snapfit_admin_demo_api_key')).toBe('sk_live_pasted');
  });

  it('says so when the merchant has no products', async () => {
    getMerchant.mockResolvedValue({ products: [] });
    renderStudio();

    fireEvent.change(await screen.findByLabelText('Merchant'), { target: { value: 'm1' } });

    expect(await screen.findByText('This merchant has no mapped products yet.')).toBeTruthy();
    expect(screen.queryByTestId('widget')).toBeNull();
  });
});
