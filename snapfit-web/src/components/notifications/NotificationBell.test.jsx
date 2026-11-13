import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationsApi';
import NotificationBell, { PANEL_LIMIT, POLL_INTERVAL_MS } from './NotificationBell';

const auth = { merchant: { _id: 'm1', role: 'merchant' } };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/notificationsApi', () => ({
  NOTIFICATIONS_CHANGED_EVENT: 'snapfit:notifications-changed',
  emitNotificationsChanged: vi.fn(),
  getUnreadCount: vi.fn(),
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

const NOTIFICATIONS = [
  {
    _id: 'n1',
    type: 'subscription.activated',
    title: 'Your Medium plan is active',
    body: 'Your subscription runs until 12 Dec 2026. Your receipt SF-2026-000012 is ready.',
    link: '/dashboard/receipts/r12',
    important: true,
    read: false,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    _id: 'n2',
    type: 'account.suspended',
    title: 'Account notice',
    body: 'Read this.',
    link: null,
    important: true,
    read: false,
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    _id: 'n3',
    type: 'usage.reset',
    title: 'Usage reset',
    body: 'A new month.',
    link: '/dashboard/analytics',
    important: false,
    read: true,
    createdAt: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
  },
];

function Where() {
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

function renderBell(basePath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[`${basePath}`]}>
      <NotificationBell basePath={basePath} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

const bell = () => screen.getByRole('button', { name: /^Notifications/ });
const where = () => screen.getByTestId('where').textContent;

beforeEach(() => {
  vi.clearAllMocks();
  auth.merchant = { _id: 'm1', role: 'merchant' };
  getUnreadCount.mockResolvedValue({ unreadCount: 2 });
  listNotifications.mockResolvedValue({ notifications: NOTIFICATIONS, unreadCount: 2, page: 1, limit: 8, total: 3 });
  markNotificationRead.mockResolvedValue({ notification: { ...NOTIFICATIONS[0], read: true } });
  markAllNotificationsRead.mockResolvedValue({ updated: 2 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotificationBell badge and polling', () => {
  it('shows the unread count on the bell and announces it', async () => {
    renderBell();
    expect(await screen.findByRole('button', { name: 'Notifications, 2 unread' })).toBeTruthy();
    expect(screen.getByTestId('notification-badge').textContent).toBe('2');
    expect(screen.getByText('2 unread notifications').getAttribute('aria-live')).toBe('polite');
  });

  it('caps the badge at 99+', async () => {
    getUnreadCount.mockResolvedValue({ unreadCount: 250 });
    renderBell();
    await screen.findByRole('button', { name: 'Notifications, 250 unread' });
    expect(screen.getByTestId('notification-badge').textContent).toBe('99+');
  });

  it('shows no badge when everything is read', async () => {
    getUnreadCount.mockResolvedValue({ unreadCount: 0 });
    renderBell();
    await waitFor(() => expect(getUnreadCount).toHaveBeenCalled());
    expect(screen.queryByTestId('notification-badge')).toBeNull();
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
  });

  it('polls every 30 seconds and on window focus, and stops when unmounted', async () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const { unmount } = renderBell();
    await waitFor(() => expect(getUnreadCount).toHaveBeenCalledTimes(1));

    const call = setIntervalSpy.mock.calls.find(([, ms]) => ms === POLL_INTERVAL_MS);
    expect(call).toBeTruthy();
    const timerId = setIntervalSpy.mock.results[setIntervalSpy.mock.calls.indexOf(call)].value;

    getUnreadCount.mockResolvedValue({ unreadCount: 5 });
    await act(async () => {
      call[0]();
    });
    expect(getUnreadCount).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('button', { name: 'Notifications, 5 unread' })).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(getUnreadCount).toHaveBeenCalledTimes(3);

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledWith(timerId);
    window.dispatchEvent(new Event('focus'));
    expect(getUnreadCount).toHaveBeenCalledTimes(3);
  });

  it('does not poll when signed out', async () => {
    auth.merchant = null;
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    renderBell();
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(getUnreadCount).not.toHaveBeenCalled();
    expect(setIntervalSpy.mock.calls.some(([, ms]) => ms === POLL_INTERVAL_MS)).toBe(false);
  });
});

describe('NotificationBell dropdown', () => {
  it('lists the latest notifications with title, body, time and unread dots', async () => {
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));

    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(listNotifications).toHaveBeenCalledWith({ page: 1, limit: PANEL_LIMIT });
    expect(await within(panel).findByText('Your Medium plan is active')).toBeTruthy();
    expect(within(panel).getByText(/receipt SF-2026-000012 is ready/)).toBeTruthy();
    expect(within(panel).getByText('5 min ago')).toBeTruthy();
    expect(within(panel).getByText('2 h ago')).toBeTruthy();
    expect(within(panel).getAllByTestId('unread-dot')).toHaveLength(2);
    expect(bell().getAttribute('aria-expanded')).toBe('true');
  });

  it('opens a notification: marks it read and goes to its link', async () => {
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    fireEvent.click(await screen.findByText('Your Medium plan is active'));

    expect(markNotificationRead).toHaveBeenCalledWith('n1');
    expect(where()).toBe('/dashboard/receipts/r12');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeTruthy();
  });

  it('opens the notifications page when a notification has no link', async () => {
    renderBell('/admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    fireEvent.click(await screen.findByText('Account notice'));
    expect(where()).toBe('/admin/notifications');
  });

  it('does not mark an already read notification again', async () => {
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    fireEvent.click(await screen.findByText('Usage reset'));
    expect(markNotificationRead).not.toHaveBeenCalled();
    expect(where()).toBe('/dashboard/analytics');
  });

  it('marks all as read', async () => {
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    await within(panel).findByText('Your Medium plan is active');

    fireEvent.click(within(panel).getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeTruthy();
    expect(within(panel).queryAllByTestId('unread-dot')).toHaveLength(0);
    expect(screen.queryByTestId('notification-badge')).toBeNull();
  });

  it('links to the full notifications page and shows an empty state', async () => {
    listNotifications.mockResolvedValue({ notifications: [], unreadCount: 0, page: 1, limit: 8, total: 0 });
    getUnreadCount.mockResolvedValue({ unreadCount: 0 });
    renderBell();
    await waitFor(() => expect(getUnreadCount).toHaveBeenCalled());
    fireEvent.click(bell());

    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(await within(panel).findByText("You're all caught up.")).toBeTruthy();
    const viewAll = within(panel).getByRole('link', { name: 'View all' });
    expect(viewAll.getAttribute('href')).toBe('/dashboard/notifications');
    fireEvent.click(viewAll);
    expect(where()).toBe('/dashboard/notifications');
  });

  it('closes with Escape', async () => {
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    await screen.findByRole('dialog', { name: 'Notifications' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
