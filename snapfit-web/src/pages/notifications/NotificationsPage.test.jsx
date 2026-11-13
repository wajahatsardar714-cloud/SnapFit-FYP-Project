import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteNotification,
  emitNotificationsChanged,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationsApi';
import NotificationsPage, { PAGE_SIZE } from './NotificationsPage';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/notificationsApi', () => ({
  NOTIFICATIONS_CHANGED_EVENT: 'snapfit:notifications-changed',
  emitNotificationsChanged: vi.fn(),
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  deleteNotification: vi.fn(),
}));

function note(i, overrides = {}) {
  return {
    _id: `n${i}`,
    type: 'usage.80',
    title: `Notification ${i}`,
    body: `Body ${i}`,
    link: '/dashboard/analytics',
    important: false,
    read: false,
    readAt: null,
    createdAt: new Date(Date.now() - i * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function pageOf(notifications, { page = 1, total = notifications.length, unreadCount } = {}) {
  return {
    notifications,
    page,
    limit: PAGE_SIZE,
    total,
    unreadCount: unreadCount ?? notifications.filter((n) => !n.read).length,
  };
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderPage(basePath = '/dashboard') {
  render(
    <MemoryRouter initialEntries={[`${basePath}/notifications`]}>
      <Routes>
        <Route path={`${basePath}/notifications`} element={<NotificationsPage basePath={basePath} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

const list = () => screen.findByRole('list', { name: 'Notifications' });
const row = (title) => screen.getByText(title).closest('li');

beforeEach(() => {
  vi.clearAllMocks();
  listNotifications.mockResolvedValue(pageOf([note(1), note(2, { read: true })]));
  markNotificationRead.mockResolvedValue({ notification: {} });
  markAllNotificationsRead.mockResolvedValue({ updated: 1 });
  deleteNotification.mockResolvedValue({ success: true });
});

describe('NotificationsPage', () => {
  it('shows a loading skeleton, then the list newest first', async () => {
    renderPage();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();

    const items = within(await list()).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Notification 1')).toBeTruthy();
    expect(within(items[0]).getByText('Unread')).toBeTruthy();
    expect(within(items[1]).queryByText('Unread')).toBeNull();
    expect(listNotifications).toHaveBeenCalledWith({ page: 1, limit: PAGE_SIZE, unread: false });
    expect(screen.getByText('1 unread')).toBeTruthy();
  });

  it('filters to unread only', async () => {
    renderPage();
    await list();
    listNotifications.mockResolvedValue(pageOf([note(1)]));

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));

    await waitFor(() => expect(listNotifications).toHaveBeenLastCalledWith({ page: 1, limit: PAGE_SIZE, unread: true }));
    expect(screen.getByRole('button', { name: 'Unread' }).getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByText('Notification 1')).toBeTruthy();
    expect(screen.queryByText('Notification 2')).toBeNull();
  });

  it('loads more pages until everything is shown', async () => {
    const first = Array.from({ length: PAGE_SIZE }, (_, i) => note(i + 1, { read: true }));
    listNotifications.mockResolvedValueOnce(pageOf(first, { total: PAGE_SIZE + 2 }));
    listNotifications.mockResolvedValueOnce(pageOf([note(21, { read: true }), note(22, { read: true })], { page: 2, total: PAGE_SIZE + 2 }));
    renderPage();

    await list();
    expect(screen.getByText(`Showing ${PAGE_SIZE} of ${PAGE_SIZE + 2}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Notification 22')).toBeTruthy();
    expect(listNotifications).toHaveBeenLastCalledWith({ page: 2, limit: PAGE_SIZE, unread: false });
    expect(screen.getByText(`Showing ${PAGE_SIZE + 2} of ${PAGE_SIZE + 2}`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('marks one as read and tells the bell', async () => {
    renderPage();
    await list();

    fireEvent.click(screen.getByRole('button', { name: 'Mark "Notification 1" as read' }));

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('n1'));
    await waitFor(() => expect(within(row('Notification 1')).queryByText('Unread')).toBeNull());
    expect(emitNotificationsChanged).toHaveBeenCalled();
  });

  it('marks all as read', async () => {
    renderPage();
    await list();

    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Unread', { selector: 'span' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Mark all as read' }).disabled).toBe(true);
  });

  it('deletes a notification', async () => {
    renderPage();
    await list();

    fireEvent.click(screen.getByRole('button', { name: 'Delete "Notification 2"' }));

    await waitFor(() => expect(deleteNotification).toHaveBeenCalledWith('n2'));
    await waitFor(() => expect(screen.queryByText('Notification 2')).toBeNull());
    expect(screen.getByText('Showing 1 of 1')).toBeTruthy();
  });

  it('opens a notification link and marks it read', async () => {
    renderPage();
    await list();

    fireEvent.click(screen.getByRole('button', { name: 'Notification 1' }));

    expect(markNotificationRead).toHaveBeenCalledWith('n1');
    expect(screen.getByTestId('where').textContent).toBe('/dashboard/analytics');
  });

  it('falls back to the admin notifications page for a link-less notification', async () => {
    listNotifications.mockResolvedValue(pageOf([note(1, { link: null, read: true })]));
    renderPage('/admin');
    await list();
    fireEvent.click(screen.getByRole('button', { name: 'Notification 1' }));
    // Already on the page: it stays there.
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeTruthy();
  });

  it('shows an empty state for each filter', async () => {
    listNotifications.mockResolvedValue(pageOf([]));
    renderPage();
    expect(await screen.findByText('No notifications yet')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(await screen.findByText('No unread notifications')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(await screen.findByText('No notifications yet')).toBeTruthy();
  });

  it('reloads when the bell changes the notifications', async () => {
    renderPage();
    await list();
    expect(listNotifications).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new CustomEvent('snapfit:notifications-changed', { detail: { source: 'bell' } }));
    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(2));
  });
});
