import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { getNotificationPreferences, updateNotificationPreferences } from '../../services/notificationsApi';
import NotificationPreferences from './NotificationPreferences';
import SettingsPage from '../../pages/dashboard/SettingsPage';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/api', () => ({ default: {} }));
vi.mock('../../services/notificationsApi', () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ merchant: { email: 'shop@test.com', name: 'Ali', businessName: 'Blue Tees' }, updateMerchant: vi.fn() }),
}));
vi.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));

const TYPES = [
  { type: 'account.welcome', label: 'Welcome message', group: 'Account', important: false },
  { type: 'account.password_changed', label: 'Password changed', group: 'Account', important: true },
  { type: 'usage.80', label: 'Usage at 80%', group: 'Usage', important: false },
  { type: 'usage.reset', label: 'Monthly usage reset', group: 'Usage', important: false },
  { type: 'product.tryon_ready', label: 'Try-on image ready', group: 'Products', important: false },
];

const PREFERENCES = {
  'account.welcome': true,
  'account.password_changed': true,
  'usage.80': true,
  'usage.reset': false,
  'product.tryon_ready': true,
};

const toggle = (label) => screen.getByRole('switch', { name: label });

beforeEach(() => {
  vi.clearAllMocks();
  getNotificationPreferences.mockResolvedValue({ preferences: PREFERENCES, types: TYPES });
  updateNotificationPreferences.mockImplementation(async (preferences) => ({
    preferences: { ...PREFERENCES, ...preferences },
    types: TYPES,
  }));
});

describe('NotificationPreferences', () => {
  it('groups the types and locks important ones as always on', async () => {
    render(<NotificationPreferences />);

    const account = (await screen.findByText('Account')).closest('fieldset');
    expect(within(account).getAllByRole('switch')).toHaveLength(2);
    expect(screen.getByText('Usage').closest('fieldset')).toBeTruthy();
    expect(screen.getByText('Products').closest('fieldset')).toBeTruthy();

    const locked = toggle('Password changed');
    expect(locked.getAttribute('aria-checked')).toBe('true');
    expect(locked.disabled).toBe(true);
    expect(within(account).getByText('Always on')).toBeTruthy();
    expect(screen.getAllByText('Always on')).toHaveLength(1);

    expect(toggle('Monthly usage reset').getAttribute('aria-checked')).toBe('false');
    expect(toggle('Usage at 80%').disabled).toBe(false);
  });

  it('saves only the changeable types with PUT', async () => {
    render(<NotificationPreferences />);
    await screen.findByText('Account');

    const save = screen.getByRole('button', { name: 'Save preferences' });
    expect(save.disabled).toBe(true);

    fireEvent.click(toggle('Usage at 80%'));
    fireEvent.click(toggle('Monthly usage reset'));
    fireEvent.click(toggle('Password changed')); // locked: no effect
    expect(toggle('Usage at 80%').getAttribute('aria-checked')).toBe('false');
    expect(save.disabled).toBe(false);

    fireEvent.click(save);

    await waitFor(() =>
      expect(updateNotificationPreferences).toHaveBeenCalledWith({
        'account.welcome': true,
        'usage.80': false,
        'usage.reset': true,
        'product.tryon_ready': true,
      })
    );
    expect(Object.keys(updateNotificationPreferences.mock.calls[0][0])).not.toContain('account.password_changed');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Notification preferences saved'));
    expect(screen.getByRole('button', { name: 'Save preferences' }).disabled).toBe(true);
  });

  it('shows the server message when saving fails', async () => {
    updateNotificationPreferences.mockRejectedValue({ response: { data: { message: 'Unknown notification type' } } });
    render(<NotificationPreferences />);
    await screen.findByText('Account');

    fireEvent.click(toggle('Usage at 80%'));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    expect(await screen.findByText('Unknown notification type')).toBeTruthy();
  });

  it('is a tab in the merchant settings, opened by ?tab=notifications', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/settings?tab=notifications']}>
        <SettingsPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('Password changed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Notifications' }).getAttribute('aria-current')).toBe('true');
  });
});
