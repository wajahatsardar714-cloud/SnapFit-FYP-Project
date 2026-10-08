import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from './ThemeContext';

const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;
const htmlTheme = () => document.documentElement.getAttribute('data-theme');

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ThemeProvider', () => {
  it('defaults to light when nothing is saved', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('light');
    expect(htmlTheme()).toBe('light');
  });

  it('toggling sets data-theme on <html> and saves the choice', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(htmlTheme()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    act(() => result.current.toggleTheme());
    expect(htmlTheme()).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('restores a saved dark theme on mount', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('dark');
    expect(htmlTheme()).toBe('dark');
  });

  it('ignores an unknown saved value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('light');
  });

  it('keeps working when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe('light');

    act(() => result.current.setTheme('dark'));
    expect(result.current.theme).toBe('dark');
    expect(htmlTheme()).toBe('dark');
  });
});
