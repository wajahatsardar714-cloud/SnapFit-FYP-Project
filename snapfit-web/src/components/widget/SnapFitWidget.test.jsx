import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SnapFitWidget from './SnapFitWidget';

const RECOMMENDATION = { size: 'M', confidence: 0.9, notes: 'M fits.', fitNotes: [] };

function respondWith(body) {
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, recommendation: RECOMMENDATION, ...body }) }));
}

async function getMySize() {
  render(<SnapFitWidget apiKey="sk_live_test" productId="SKU-1" apiUrl="https://api.test/api" />);
  fireEvent.click(screen.getByRole('button', { name: 'Check My Size' }));
  fireEvent.click(screen.getByRole('button', { name: /Upload a Photo/ }));
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File(['photo'], 'me.jpg', { type: 'image/jpeg' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Get My Size' }));
  await screen.findByText('M fits.');
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  delete globalThis.fetch;
});

describe('SnapFitWidget result', () => {
  it('asks for size and try-on in one request', async () => {
    respondWith({ tryOn: { status: 'unavailable' } });
    await getMySize();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.test/api/recommend');
    expect(init.body.get('includeTryOn')).toBe('true');
  });

  it('shows the try-on view for a try-on-ready product', async () => {
    respondWith({ tryOn: { status: 'success', image: 'data:image/jpeg;base64,X' } });
    await getMySize();

    expect(screen.getByText('See it on you')).toBeTruthy();
    expect(screen.getByAltText('You wearing size M')).toBeTruthy();
  });

  it('hides the try-on view when the product is not try-on ready', async () => {
    respondWith({ tryOn: { status: 'unavailable' } });
    await getMySize();

    expect(screen.queryByText('See it on you')).toBeNull();
  });

  it('still shows the size when the try-on fails', async () => {
    respondWith({ tryOn: { status: 'failed', message: 'Please try again in a moment.' } });
    await getMySize();

    expect(screen.getByText('M', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText(/couldn.t create a preview/)).toBeTruthy();
  });
});
