import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, ThemeProvider } from '../../context/ThemeContext';
import SnapFitWidget from './SnapFitWidget';

beforeEach(() => {
  localStorage.setItem(THEME_STORAGE_KEY, 'dark');
});

describe('SnapFitWidget theme', () => {
  it('stays light even when the app is in dark mode', () => {
    render(
      <ThemeProvider>
        <SnapFitWidget apiKey="sk_live_test" productId="SKU-1" apiUrl="https://api.test/api" />
      </ThemeProvider>
    );

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const button = screen.getByRole('button', { name: 'Check My Size' });
    expect(button.closest('[data-theme]').getAttribute('data-theme')).toBe('light');
  });
});
