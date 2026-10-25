import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../services/api';
import ProductMappingPage from './ProductMappingPage';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const chart = { _id: 'c1', name: 'Tees', category: 'tops', sizes: [], isActive: true };

const MAPPINGS = [
  {
    _id: 'm1',
    productId: 'SKU-READY',
    sizeChartId: chart,
    productImage: '/uploads/products/a.png',
    tryOnStatus: 'ready',
    garmentLength: 'long',
  },
  { _id: 'm2', productId: 'SKU-NOIMG', sizeChartId: chart, tryOnStatus: 'image_missing' },
  {
    _id: 'm3',
    productId: 'SKU-NOPTS',
    sizeChartId: chart,
    productImage: '/uploads/products/b.png',
    tryOnStatus: 'anchors_missing',
    garmentLength: 'cropped',
  },
];

beforeEach(() => {
  api.get.mockImplementation(async (url) =>
    url === '/charts' ? { data: { charts: [chart] } } : { data: { mappings: MAPPINGS } }
  );
});

async function rowFor(productId) {
  const cell = await screen.findByText(productId);
  return within(cell.closest('tr'));
}

describe('ProductMappingPage try-on column', () => {
  it('shows the readiness badge and the right actions for each product', async () => {
    render(
      <MemoryRouter>
        <ProductMappingPage />
      </MemoryRouter>
    );

    const ready = await rowFor('SKU-READY');
    expect(ready.getByText('Try-on ready')).toBeTruthy();
    expect(ready.getByText('Replace image')).toBeTruthy();
    expect(ready.getByText('Edit points')).toBeTruthy();
    expect(ready.getByRole('img').getAttribute('src')).toMatch(/\/uploads\/products\/a\.png$/);

    const noImage = await rowFor('SKU-NOIMG');
    expect(noImage.getByText('Image missing')).toBeTruthy();
    expect(noImage.getByText('Add image')).toBeTruthy();
    expect(noImage.queryByText(/points/)).toBeNull();
    expect(noImage.queryByRole('img')).toBeNull();

    const noPoints = await rowFor('SKU-NOPTS');
    expect(noPoints.getByText('Anchors missing')).toBeTruthy();
    expect(noPoints.getByText('Place points')).toBeTruthy();
    expect(noPoints.getByText('Remove image')).toBeTruthy();
  });

  it('explains what kind of product photo works best', async () => {
    render(
      <MemoryRouter>
        <ProductMappingPage />
      </MemoryRouter>
    );
    expect(await screen.findByText(/transparent PNG or a plain-background flat-lay/)).toBeTruthy();
  });
});

describe('ProductMappingPage garment length', () => {
  function renderPage() {
    render(
      <MemoryRouter>
        <ProductMappingPage />
      </MemoryRouter>
    );
  }

  async function fillForm(garmentLength) {
    fireEvent.change(await screen.findByLabelText('Product ID'), { target: { value: 'SKU-NEW' } });
    fireEvent.change(screen.getByLabelText('Size Chart'), { target: { value: 'c1' } });
    if (garmentLength) fireEvent.change(screen.getByLabelText('Garment length'), { target: { value: garmentLength } });
  }

  beforeEach(() => {
    api.post.mockReset();
    api.post.mockResolvedValue({ data: { mapping: { _id: 'new', productId: 'SKU-NEW' } } });
  });

  it('shows the length of each mapping, regular when none is stored', async () => {
    renderPage();
    expect((await rowFor('SKU-READY')).getByText('Long')).toBeTruthy();
    expect((await rowFor('SKU-NOIMG')).getByText('Regular')).toBeTruthy();
    expect((await rowFor('SKU-NOPTS')).getByText('Cropped')).toBeTruthy();
  });

  it('offers the three lengths, regular by default, and sends the choice as JSON', async () => {
    renderPage();
    const select = await screen.findByLabelText('Garment length');
    expect(select.value).toBe('regular');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Cropped — ends at the waist',
      'Regular — ends at the hips',
      'Long — ends at mid-thigh',
    ]);

    await fillForm('long');
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('/products/map', expect.objectContaining({ garmentLength: 'long' }));
  });

  it('sends the length with the product image in the multipart form', async () => {
    renderPage();
    await fillForm('cropped');
    fireEvent.change(document.getElementById('mapping-image'), {
      target: { files: [new File(['png'], 'tee.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const payload = api.post.mock.calls[0][1];
    expect(payload).toBeInstanceOf(FormData);
    expect(payload.get('garmentLength')).toBe('cropped');
    expect(payload.get('image').name).toBe('tee.png');
  });
});
