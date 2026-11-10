import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TryOnPreview, { TRY_ON_TIPS } from './TryOnPreview';

const IMAGE = 'data:image/jpeg;base64,TRYON';
const ORIGINAL = 'blob:original-photo';

describe('TryOnPreview', () => {
  it('shows the try-on with the size, and toggles to the original photo', () => {
    render(<TryOnPreview tryOn={{ status: 'success', image: IMAGE }} originalUrl={ORIGINAL} size="M" />);

    expect(screen.getByText('See it on you')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('src')).toBe(IMAGE);
    expect(screen.getByText('Size M')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Original' }));
    expect(screen.getByRole('img').getAttribute('src')).toBe(ORIGINAL);
    expect(screen.queryByText('Size M')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try-on' }));
    expect(screen.getByRole('img').getAttribute('src')).toBe(IMAGE);
  });

  it('suggests a fitted top when the server sends the FITTED_TOP tip', () => {
    render(<TryOnPreview tryOn={{ status: 'success', image: IMAGE, tip: 'FITTED_TOP' }} originalUrl={ORIGINAL} size="M" />);
    expect(screen.getByText(TRY_ON_TIPS.FITTED_TOP)).toBeTruthy();
    expect(screen.getByText(/wear a fitted, short-sleeve top/)).toBeTruthy();
  });

  it('shows no tip when the server sends none, or one it does not know', () => {
    const { rerender } = render(<TryOnPreview tryOn={{ status: 'success', image: IMAGE }} size="M" />);
    expect(screen.queryByText(/fitted, short-sleeve top/)).toBeNull();
    rerender(<TryOnPreview tryOn={{ status: 'success', image: IMAGE, tip: 'SOMETHING_ELSE' }} size="M" />);
    expect(screen.queryByText(/fitted, short-sleeve top/)).toBeNull();
  });

  it('explains a failed preview without an image', () => {
    render(<TryOnPreview tryOn={{ status: 'failed', message: 'Please try again later.' }} size="M" />);
    expect(screen.getByText(/couldn.t create a preview/)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders nothing when the product has no try-on', () => {
    const { container } = render(<TryOnPreview tryOn={{ status: 'unavailable' }} size="M" />);
    expect(container.innerHTML).toBe('');
  });
});
