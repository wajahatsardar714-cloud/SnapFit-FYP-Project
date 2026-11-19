import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { buildWidgetSnippet } from '../../utils/widgetSnippet';
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
    sleeveLength: 'long',
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
    expect(noPoints.getByText('Set anchor points')).toBeTruthy();
    expect(noPoints.getByText('Replace image')).toBeTruthy();
    expect(noPoints.getByText('Remove image')).toBeTruthy();
  });

  it('offers the next missing step beside the badge, and nothing when try-on is ready', async () => {
    render(
      <MemoryRouter>
        <ProductMappingPage />
      </MemoryRouter>
    );

    const ready = await rowFor('SKU-READY');
    expect(ready.queryByRole('button', { name: /Add image for/ })).toBeNull();
    expect(ready.queryByRole('link', { name: /Set anchor points for/ })).toBeNull();

    const noImage = await rowFor('SKU-NOIMG');
    const addImage = noImage.getByRole('button', { name: 'Add image for SKU-NOIMG' });
    const fileInput = noImage.getByLabelText('Product image for SKU-NOIMG');
    const clickSpy = vi.spyOn(fileInput, 'click');
    fireEvent.click(addImage);
    expect(clickSpy).toHaveBeenCalled();
    expect(noImage.queryByRole('link', { name: /Set anchor points for/ })).toBeNull();

    const noPoints = await rowFor('SKU-NOPTS');
    expect(noPoints.getByRole('link', { name: 'Set anchor points for SKU-NOPTS' }).getAttribute('href')).toBe(
      '/dashboard/product-mapping/m3/anchor-points'
    );
    expect(noPoints.queryByRole('button', { name: /Add image for/ })).toBeNull();
  });

  it('uploads the file chosen through the "Add image" step', async () => {
    api.put.mockResolvedValue({ data: {} });
    render(
      <MemoryRouter>
        <ProductMappingPage />
      </MemoryRouter>
    );
    const noImage = await rowFor('SKU-NOIMG');
    fireEvent.change(noImage.getByLabelText('Product image for SKU-NOIMG'), {
      target: { files: [new File(['png'], 'tee.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/products/m2/image', expect.any(FormData)));
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

  async function fillForm(garmentLength, sleeveLength) {
    fireEvent.change(await screen.findByLabelText('Product ID'), { target: { value: 'SKU-NEW' } });
    fireEvent.change(screen.getByLabelText('Size Chart'), { target: { value: 'c1' } });
    if (garmentLength) fireEvent.change(screen.getByLabelText('Garment length'), { target: { value: garmentLength } });
    if (sleeveLength) fireEvent.change(screen.getByLabelText('Sleeve length'), { target: { value: sleeveLength } });
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

  it('shows the sleeve length of each mapping, short when none is stored', async () => {
    renderPage();
    expect((await rowFor('SKU-READY')).getByText('Short')).toBeTruthy();
    expect((await rowFor('SKU-NOIMG')).getByText('Short')).toBeTruthy();
    expect((await rowFor('SKU-NOPTS')).getByText('Long')).toBeTruthy();
  });

  it('offers the three sleeve lengths, short by default, and sends the choice as JSON', async () => {
    renderPage();
    const select = await screen.findByLabelText('Sleeve length');
    expect(select.value).toBe('short');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'None — sleeveless',
      'Short — half sleeves',
      'Long — full sleeves',
    ]);

    await fillForm(null, 'long');
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(
      '/products/map',
      expect.objectContaining({ garmentLength: 'regular', sleeveLength: 'long' })
    );
  });

  it('sends the sleeve length with the product image in the multipart form', async () => {
    renderPage();
    await fillForm('long', 'none');
    fireEvent.change(document.getElementById('mapping-image'), {
      target: { files: [new File(['png'], 'tee.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const payload = api.post.mock.calls[0][1];
    expect(payload).toBeInstanceOf(FormData);
    expect(payload.get('sleeveLength')).toBe('none');
    expect(payload.get('garmentLength')).toBe('long');
  });

  it('resets the sleeve length to short on cancel', async () => {
    renderPage();
    await fillForm(null, 'none');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Sleeve length').value).toBe('short');
  });
});

describe('ProductMappingPage setup shortcuts', () => {
  const kurtas = { _id: 'c2', name: 'Kurtas', category: 'tops', sizes: [], isActive: true };
  const NAMED = [
    { ...MAPPINGS[0], productName: 'Classic Crew Tee' },
    { ...MAPPINGS[1], productName: 'Lawn Kurta', sizeChartId: kurtas, garmentLength: 'long', sleeveLength: 'long' },
    MAPPINGS[2],
  ];

  function renderPage() {
    render(
      <MemoryRouter>
        <ProductMappingPage />
      </MemoryRouter>
    );
  }

  const field = (label) => screen.getByLabelText(label);

  beforeEach(() => {
    api.get.mockImplementation(async (url) =>
      url === '/charts' ? { data: { charts: [chart, kurtas] } } : { data: { mappings: NAMED } }
    );
    api.post.mockReset();
    api.post.mockResolvedValue({ data: { mapping: { _id: 'new', productId: 'SKU-NEW' } } });
  });

  it('fills the form from a mapping on Edit and posts the same upsert on save', async () => {
    renderPage();
    const row = await rowFor('SKU-NOIMG');
    fireEvent.click(row.getByRole('button', { name: 'Edit mapping for SKU-NOIMG' }));

    expect(screen.getByRole('heading', { name: 'Edit mapping for SKU-NOIMG' })).toBeTruthy();
    expect(field('Product ID').value).toBe('SKU-NOIMG');
    expect(field('Product ID').readOnly).toBe(true);
    expect(field('Product Name (optional)').value).toBe('Lawn Kurta');
    expect(field('Size Chart').value).toBe('c2');
    expect(field('Garment length').value).toBe('long');
    expect(field('Sleeve length').value).toBe('long');
    expect(document.activeElement).toBe(field('Product Name (optional)'));
    expect(screen.queryByRole('button', { name: 'Map' })).toBeNull();

    fireEvent.change(field('Product Name (optional)'), { target: { value: 'Lawn Kurta 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith('/products/map', {
      productId: 'SKU-NOIMG',
      productName: 'Lawn Kurta 2',
      sizeChartId: 'c2',
      garmentLength: 'long',
      sleeveLength: 'long',
    });
    // Saving an edit resets the form fully.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Map' })).toBeTruthy());
    expect(field('Product ID').value).toBe('');
    expect(field('Size Chart').value).toBe('');
    expect(field('Garment length').value).toBe('regular');
  });

  it('Cancel edit leaves edit mode and resets every field', async () => {
    renderPage();
    fireEvent.click((await rowFor('SKU-READY')).getByRole('button', { name: 'Edit mapping for SKU-READY' }));
    expect(field('Garment length').value).toBe('long');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));

    expect(screen.getByRole('heading', { name: 'Map a product' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Map' })).toBeTruthy();
    expect(field('Product ID').value).toBe('');
    expect(field('Product ID').readOnly).toBe(false);
    expect(field('Product Name (optional)').value).toBe('');
    expect(field('Size Chart').value).toBe('');
    expect(field('Garment length').value).toBe('regular');
    expect(field('Sleeve length').value).toBe('short');
  });

  it('filters the mappings by product ID or name, ignoring case', async () => {
    renderPage();
    await rowFor('SKU-READY');
    const search = screen.getByRole('searchbox', { name: 'Search mappings' });

    fireEvent.change(search, { target: { value: 'kurta' } });
    expect(screen.getByText('SKU-NOIMG')).toBeTruthy();
    expect(screen.queryByText('SKU-READY')).toBeNull();
    expect(screen.queryByText('SKU-NOPTS')).toBeNull();

    fireEvent.change(search, { target: { value: 'sku-nop' } });
    expect(screen.getByText('SKU-NOPTS')).toBeTruthy();
    expect(screen.queryByText('SKU-NOIMG')).toBeNull();

    fireEvent.change(search, { target: { value: 'jacket' } });
    expect(screen.getByText(/No mappings match/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('SKU-READY')).toBeTruthy();
  });

  it('keeps the chart and lengths after a new mapping, clearing only ID, name and image', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText('Product ID'), { target: { value: 'SKU-NEW' } });
    fireEvent.change(field('Product Name (optional)'), { target: { value: 'New Kurta' } });
    fireEvent.change(field('Size Chart'), { target: { value: 'c2' } });
    fireEvent.change(field('Garment length'), { target: { value: 'long' } });
    fireEvent.change(field('Sleeve length'), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    await waitFor(() => expect(field('Product ID').value).toBe(''));
    expect(field('Product Name (optional)').value).toBe('');
    expect(field('Size Chart').value).toBe('c2');
    expect(field('Garment length').value).toBe('long');
    expect(field('Sleeve length').value).toBe('none');
    expect(screen.getByText('Choose a flat-lay photo')).toBeTruthy();
  });

  it('explains the product ID and warns when it is already mapped, with a switch to edit it', async () => {
    renderPage();
    const productId = await screen.findByLabelText('Product ID');
    expect(screen.getByText('Use the same product ID or SKU as in your store.')).toBeTruthy();
    expect(productId.getAttribute('aria-describedby')).toBe('mapping-productId-hint');

    fireEvent.change(productId, { target: { value: 'SKU-NEW' } });
    expect(screen.queryByText(/already mapped/)).toBeNull();

    fireEvent.change(productId, { target: { value: 'SKU-NOIMG' } });
    expect(screen.getByText(/This product is already mapped — saving will update it\./)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Edit it instead' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(field('Product Name (optional)').value).toBe('Lawn Kurta');
    expect(field('Size Chart').value).toBe('c2');
    expect(screen.queryByText(/already mapped/)).toBeNull();
  });

  it('copies the widget snippet with this product ID and a placeholder key', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();

    fireEvent.click((await rowFor('SKU-NOPTS')).getByRole('button', { name: 'Copy widget code for SKU-NOPTS' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const snippet = writeText.mock.calls[0][0];
    expect(snippet).toBe(buildWidgetSnippet('SKU-NOPTS'));
    expect(snippet).toContain('productId="SKU-NOPTS"');
    expect(snippet).toContain('apiKey="sk_live_..."');
    expect(snippet).toContain('<SnapFitWidget');
    expect(toast.success).toHaveBeenCalledWith('Widget code copied');
  });
});
