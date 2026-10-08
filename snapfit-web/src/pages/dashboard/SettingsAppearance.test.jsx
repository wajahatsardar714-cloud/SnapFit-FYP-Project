import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { ThemeProvider } from '../../context/ThemeContext';
import { AppearanceTab } from './SettingsPage';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/api', () => ({ default: {} }));

beforeEach(() => {
  localStorage.clear();
  toast.success.mockClear();
});

function renderTab() {
  return render(
    <ThemeProvider>
      <AppearanceTab />
    </ThemeProvider>
  );
}

describe('Settings > Appearance', () => {
  it('shows Light and Dark with the current theme selected', () => {
    renderTab();
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('false');
  });

  it('switches the theme instantly and confirms with a toast', () => {
    renderTab();
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
    expect(toast.success).toHaveBeenCalledWith('Switched to dark mode');
  });

  it('does nothing when the current theme is chosen again', () => {
    renderTab();
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
