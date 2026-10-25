import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../services/api';
import IntegrationDocsPage from './IntegrationDocsPage';

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  api.get.mockResolvedValue({ data: { plans: [] } });
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
});

afterEach(() => {
  delete globalThis.IntersectionObserver;
  delete globalThis.fetch;
});

function renderPage() {
  render(
    <MemoryRouter>
      <IntegrationDocsPage />
    </MemoryRouter>
  );
}

// The first params table on the page is the /api/recommend request body.
function recommendFieldRow(field) {
  const table = screen.getAllByRole('table')[0];
  return within(table).getByText(field).closest('tr');
}

describe('IntegrationDocsPage /api/recommend', () => {
  it('documents userHeight as required with its range, and the new clothingFit field', () => {
    renderPage();

    const height = recommendFieldRow('userHeight');
    expect(within(height).getByText('*')).toBeTruthy();
    expect(height.textContent).toMatch(/between 100 and 230/);

    const fit = recommendFieldRow('clothingFit');
    expect(within(fit).queryByText('*')).toBeNull();
    expect(fit.textContent).toMatch(/fitted, regular \(default\) or loose/);
  });

  it('documents the optional camera frames and how many were used', () => {
    renderPage();

    const frames = recommendFieldRow('frames');
    expect(within(frames).queryByText('*')).toBeNull();
    expect(frames.textContent).toMatch(/Up to 4 extra JPEG frames/);
    expect(screen.getByText('At most 4 extra frames are allowed')).toBeTruthy();

    const example = [...document.querySelectorAll('code')].find((el) => el.textContent.includes('"recommendation": {'));
    expect(example.textContent).toContain('"framesUsed": 5');
  });

  it('lists the new validation errors', () => {
    renderPage();

    expect(screen.getByText('userHeight is required')).toBeTruthy();
    expect(screen.getByText('userHeight must be between 100 and 230 cm')).toBeTruthy();
    expect(screen.getByText('clothingFit must be fitted, regular or loose')).toBeTruthy();
    expect(screen.queryByText('userHeight must be a positive number')).toBeNull();
  });

  it('shows photoTips and warnings in the success response', () => {
    renderPage();

    const example = [...document.querySelectorAll('code')].find((el) => el.textContent.includes('"recommendation": {'));
    expect(example.textContent).toContain('"photoTips"');
    expect(example.textContent).toContain('"warnings"');
  });

  it('sends height and clothing fit from Try It Out', async () => {
    globalThis.fetch = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ success: true }) }));
    renderPage();

    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk_live_test' } });
    fireEvent.change(screen.getByLabelText('Product ID'), { target: { value: 'SKU-1' } });
    fireEvent.change(screen.getByLabelText('Photo'), {
      target: { files: [new File(['photo'], 'me.jpg', { type: 'image/jpeg' })] },
    });
    const send = screen.getByRole('button', { name: 'Send Test Request' });
    expect(send.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Height (cm)'), { target: { value: '178' } });
    fireEvent.change(screen.getByLabelText('Clothing fit'), { target: { value: 'loose' } });
    fireEvent.click(send);
    await screen.findByText('200 response');

    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/recommend$/);
    expect(init.body.get('userHeight')).toBe('178');
    expect(init.body.get('clothingFit')).toBe('loose');
  });
});
