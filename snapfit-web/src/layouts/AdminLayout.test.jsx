import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AdminLayout from './AdminLayout';
import { getUnreadCount } from '../services/notificationsApi';

const logout = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ merchant: { email: 'owner@snapfit.dev', role: 'superadmin' }, logout }),
}));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
vi.mock('../services/notificationsApi', () => ({
  NOTIFICATIONS_CHANGED_EVENT: 'snapfit:notifications-changed',
  emitNotificationsChanged: vi.fn(),
  getUnreadCount: vi.fn(() => Promise.resolve({ unreadCount: 0 })),
  listNotifications: vi.fn(() => Promise.resolve({ notifications: [], unreadCount: 0, page: 1, limit: 8, total: 0 })),
  markNotificationRead: vi.fn(() => Promise.resolve({})),
  markAllNotificationsRead: vi.fn(() => Promise.resolve({ updated: 0 })),
}));

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="merchants" element={<p>Merchants page</p>} />
          <Route path="notifications" element={<p>Notifications page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminLayout', () => {
  it('marks the area as the super admin console and renders the page inside it', () => {
    renderAt('/admin/merchants');

    expect(screen.getAllByText('Super Admin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('owner@snapfit.dev').length).toBeGreaterThan(0);
    expect(screen.getByText('Merchants page')).toBeTruthy();
  });

  it('links every admin page and signs out', () => {
    renderAt('/admin/merchants');

    const nav = within(screen.getAllByRole('navigation', { name: 'Admin' })[0]);
    expect(nav.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/admin',
      '/admin/merchants',
      '/admin/announcements',
      '/admin/analytics',
      '/admin/demo',
      '/admin/audit-log',
      '/admin/settings',
    ]);

    fireEvent.click(screen.getAllByRole('button', { name: /log ?out|sign out/i })[0]);
    expect(logout).toHaveBeenCalled();
  });

  it('has the notification bell in the header', async () => {
    getUnreadCount.mockResolvedValueOnce({ unreadCount: 120 });
    renderAt('/admin/notifications');

    expect(await screen.findByRole('button', { name: 'Notifications, 120 unread' })).toBeTruthy();
    expect(screen.getByTestId('notification-badge').textContent).toBe('99+');
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeTruthy();
  });
});
