import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Reveal from './Reveal';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Reveal', () => {
  it('shows its content straight away where it cannot animate', () => {
    render(<Reveal>Hello</Reveal>);
    expect(screen.getByText('Hello').className).toContain('opacity-100');
  });

  it('starts hidden and appears once scrolled into view', () => {
    let onChange;
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function Observer(callback) {
        onChange = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
      })
    );
    render(<Reveal>Hello</Reveal>);
    expect(screen.getByText('Hello').className).toContain('opacity-0');

    act(() => onChange([{ isIntersecting: true }]));
    expect(screen.getByText('Hello').className).toContain('opacity-100');
  });
});
