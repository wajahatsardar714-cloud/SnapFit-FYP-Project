import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDemoProduct } from '../../services/adminApi';
import AdminDemoStudioPage from './AdminDemoStudioPage';

vi.mock('../../services/adminApi', async (importOriginal) => ({
  DEMO_RECOMMEND_PATH: (await importOriginal()).DEMO_RECOMMEND_PATH,
  getDemoProduct: vi.fn(),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ token: 'admin.jwt' }) }));
// The widget's own requests are covered by its tests; here only what the
// studio hands it matters.
vi.mock('../../components/widget/SnapFitWidget', () => ({
  default: (props) => <pre data-testid="widget">{JSON.stringify(props)}</pre>,
}));

const widgetProps = () => JSON.parse(screen.getByTestId('widget').textContent);

function renderStudio() {
  render(
    <MemoryRouter>
      <AdminDemoStudioPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  getDemoProduct.mockResolvedValue({
    product: { productId: 'demo-product-1', productName: 'White Crew Neck T-Shirt', productImage: null, tryOnStatus: 'ready' },
  });
});

describe('AdminDemoStudioPage', () => {
  it('shows only the demo product and runs it on the admin session, without an API key', async () => {
    renderStudio();

    expect(await screen.findByRole('heading', { level: 2, name: 'White Crew Neck T-Shirt' })).toBeTruthy();
    expect(screen.getByText('Try-on ready')).toBeTruthy();
    expect(widgetProps()).toEqual({
      authToken: 'admin.jwt',
      endpoint: '/admin/demo/recommend',
      productId: 'demo-product-1',
      apiUrl: expect.any(String),
    });
  });

  it('never offers a merchant, a product picker or an API key', async () => {
    renderStudio();
    await screen.findByTestId('widget');

    expect(screen.queryByLabelText('Merchant')).toBeNull();
    expect(screen.queryByLabelText('Product')).toBeNull();
    expect(screen.queryByLabelText('Merchant API key')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it("says what's wrong when the server has no demo product set up", async () => {
    getDemoProduct.mockRejectedValue({ response: { data: { message: 'The demo product is not set up.' } } });
    renderStudio();

    expect(await screen.findByText('The demo product is not set up.')).toBeTruthy();
    expect(screen.queryByTestId('widget')).toBeNull();
  });
});
