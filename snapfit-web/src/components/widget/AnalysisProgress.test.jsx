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

  it('ticks off the steps as time passes, ending on the try-on', () => {
    render(<AnalysisProgress includesTryOn />);
    const steps = () => screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(steps()).toEqual([
      'Finding your pose',
      'Measuring your body',
      'Matching the size chart',
      'Creating your try-on preview',
    ]);

    advance(6);
    // Every step but the try-on is done (a check); the try-on is current.
    const items = screen.getAllByRole('listitem');
    expect(items.slice(0, 3).every((item) => item.querySelector('svg'))).toBe(true);
    expect(items[3].querySelector('svg')).toBeNull();
  });

  it('leaves the try-on step out when no try-on was asked for', () => {
    render(<AnalysisProgress includesTryOn={false} />);
    expect(screen.queryByText('Creating your try-on preview')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('stops its timer when unmounted', () => {
    const { unmount } = render(<AnalysisProgress includesTryOn />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
