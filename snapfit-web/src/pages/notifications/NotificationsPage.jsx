import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Bell, Check, CheckCheck, Trash2 } from 'lucide-react';
import Button from '../../components/ui/Button';
import { ListSkeleton } from '../../components/ui/Skeleton';
import NotificationIcon from '../../components/notifications/NotificationIcon';
import { formatRelativeTime, notificationTarget } from '../../components/notifications/notificationMeta';
import {
  NOTIFICATIONS_CHANGED_EVENT,
  deleteNotification,
  emitNotificationsChanged,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationsApi';
import { LoadError } from '../admin/components/PageStatus';

export const PAGE_SIZE = 20;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
];

function NotificationRow({ notification, onOpen, onMarkRead, onDelete, busy }) {
  const unread = !notification.read;
  const created = notification.createdAt ? new Date(notification.createdAt) : null;

  return (
    <li className={`flex gap-4 px-4 py-4 sm:px-6 animate-fade-in ${unread ? 'bg-primary-soft' : ''}`}>
      <NotificationIcon type={notification.type} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpen(notification)}
            className={`rounded text-left text-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              unread ? 'font-semibold' : 'font-medium'
            }`}
          >
            {notification.title}
          </button>
          {unread && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
              Unread
            </span>
          )}
        </div>
        {notification.body && <p className="mt-1 text-sm text-body">{notification.body}</p>}
        {created && (
          <time dateTime={created.toISOString()} title={created.toLocaleString()} className="mt-1.5 block text-xs text-muted">
            {formatRelativeTime(notification.createdAt)}
          </time>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-1">
        {unread && (
          <button
            type="button"
            onClick={() => onMarkRead(notification)}
            disabled={busy}
            aria-label={`Mark "${notification.title}" as read`}
            title="Mark as read"
            className="rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:bg-surface-2 hover:text-primary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Check size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(notification)}
          disabled={busy}
          aria-label={`Delete "${notification.title}"`}
          title="Delete"
          className="rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:bg-danger-soft hover:text-danger disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}

// Every notification for the signed-in account, newest first, 20 at a time.
// Used by both areas; `basePath` ("/dashboard" or "/admin") is where links
// without a target fall back to.
function NotificationsPage({ basePath = '/dashboard' }) {
  const navigate = useNavigate();
  const source = useRef({});
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const applyPage = useCallback((res, append) => {
    const next = res?.notifications || [];
    setItems((prev) => (append && prev ? [...prev, ...next.filter((n) => !prev.some((p) => p._id === n._id))] : next));
    setPage(res?.page || 1);
    setTotal(res?.total ?? next.length);
    if (typeof res?.unreadCount === 'number') setUnreadCount(res.unreadCount);
  }, []);

  const load = useCallback(() => {
    setFailed(false);
    return listNotifications({ page: 1, limit: PAGE_SIZE, unread: filter === 'unread' })
      .then((res) => applyPage(res, false))
      .catch(() => setFailed(true));
  }, [filter, applyPage]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  // The bell changed something (e.g. "Mark all as read"): reload.
  useEffect(() => {
    function onChanged(e) {
      if (e.detail?.source !== source.current) load();
    }
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await listNotifications({ page: page + 1, limit: PAGE_SIZE, unread: filter === 'unread' });
      applyPage(res, true);
    } catch {
      toast.error("Couldn't load more notifications");
    } finally {
      setLoadingMore(false);
    }
  }

  const changed = () => emitNotificationsChanged(source.current);

  function setRead(id) {
    setItems((prev) => prev.map((n) => (n._id === id ? { ...n, read: true, readAt: n.readAt || new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markRead(notification) {
    setBusyId(notification._id);
    try {
      await markNotificationRead(notification._id);
      setRead(notification._id);
      changed();
    } catch {
      toast.error("Couldn't mark the notification as read");
    } finally {
      setBusyId(null);
    }
  }

  function openNotification(notification) {
    if (!notification.read) {
      setRead(notification._id);
      markNotificationRead(notification._id).then(changed).catch(() => {});
    }
    navigate(notificationTarget(notification, basePath));
  }

  async function remove(notification) {
    setBusyId(notification._id);
    try {
      await deleteNotification(notification._id);
      setItems((prev) => prev.filter((n) => n._id !== notification._id));
      setTotal((t) => Math.max(0, t - 1));
      if (!notification.read) setUnreadCount((c) => Math.max(0, c - 1));
      toast.success('Notification deleted');
      changed();
    } catch {
      toast.error("Couldn't delete the notification");
    } finally {
      setBusyId(null);
    }
  }

  async function markAll() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
      changed();
    } catch {
      toast.error("Couldn't mark your notifications as read");
    } finally {
      setMarkingAll(false);
    }
  }

  const hasMore = Boolean(items) && items.length < total;
  const anyUnread = unreadCount > 0 || Boolean(items?.some((n) => !n.read));

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {unreadCount > 0 ? `${unreadCount} unread` : 'Updates about your account, plan and SnapFit.'}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<CheckCheck size={14} />}
          onClick={markAll}
          loading={markingAll}
          disabled={!anyUnread}
        >
          Mark all as read
        </Button>
      </div>

      <div role="group" aria-label="Filter notifications" className="mt-6 inline-flex rounded-lg border border-border bg-surface-2 p-1">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              filter === key ? 'bg-background text-primary shadow-card' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {failed ? (
          <LoadError message="Couldn't load your notifications." onRetry={load} />
        ) : !items ? (
          <div className="rounded-xl border border-border bg-surface shadow-card">
            <ListSkeleton rows={5} />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-14 text-center shadow-card">
            <Bell size={36} className="text-muted" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-sm text-muted-foreground">
              {filter === 'unread' ? "You're all caught up." : "We'll let you know when something needs your attention."}
            </p>
            {filter === 'unread' && (
              <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
                Show all
              </Button>
            )}
          </div>
        ) : (
          <>
            <ul aria-label="Notifications" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-card">
              {items.map((notification) => (
                <NotificationRow
                  key={notification._id}
                  notification={notification}
                  busy={busyId === notification._id}
                  onOpen={openNotification}
                  onMarkRead={markRead}
                  onDelete={remove}
                />
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {items.length} of {total}
              </span>
              {hasMore && (
                <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore}>
                  Load more
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Choose which updates you get in{' '}
        <Link to={basePath === '/admin' ? '/admin/settings' : `${basePath}/settings?tab=notifications`}>{basePath === '/admin' ? 'Settings' : 'Settings → Notifications'}</Link>.
      </p>
    </div>
  );
}

export default NotificationsPage;
