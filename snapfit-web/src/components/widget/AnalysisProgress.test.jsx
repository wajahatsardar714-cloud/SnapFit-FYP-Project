import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnalysisProgress from './AnalysisProgress';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const advance = (seconds) => act(() => vi.advanceTimersByTime(seconds * 1000));

describe('AnalysisProgress', () => {
  it('moves through the try-on stages as time passes', () => {
    render(<AnalysisProgress includesTryOn />);
    expect(screen.getByRole('status').textContent).toBe('Measuring you…');
    expect(screen.getByText('0 s elapsed')).toBeTruthy();

    advance(5);
    expect(screen.getByRole('status').textContent).toBe('Creating your try-on preview — this can take up to a minute.');
    expect(screen.getByText('5 s elapsed')).toBeTruthy();

    advance(25);
    expect(screen.getByRole('status').textContent).toBe('Almost there — your preview is still rendering…');
    expect(screen.getByText('30 s elapsed')).toBeTruthy();
  });

  it('stays on the measuring message without a try-on', () => {
    render(<AnalysisProgress includesTryOn={false} />);
    advance(40);
    expect(screen.getByRole('status').textContent).toBe('Measuring you…');
  });

  it('stops its timer when unmounted', () => {
    const { unmount } = render(<AnalysisProgress includesTryOn />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
