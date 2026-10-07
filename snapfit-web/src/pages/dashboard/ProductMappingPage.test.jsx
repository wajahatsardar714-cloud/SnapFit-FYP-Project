import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../services/api';
import ProductMappingPage from './ProductMappingPage';

vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const chart = { _id: 'c1', name: 'Tees', category: 'tops', sizes: [], isActive: true };

const MAPPINGS = [
  { _id: 'm1', productId: 'SKU-READY', sizeChartId: chart, productImage: '/uploads/products/a.png', tryOnStatus: 'ready' },
  { _id: 'm2', productId: 'SKU-NOIMG', sizeChartId: chart, tryOnStatus: 'image_missing' },
  { _id: 'm3', productId: 'SKU-NOPTS', sizeChartId: chart, productImage: '/uploads/products/b.png', tryOnStatus: 'anchors_missing' },
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
