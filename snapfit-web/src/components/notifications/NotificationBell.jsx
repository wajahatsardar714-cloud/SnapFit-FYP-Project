import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  NOTIFICATIONS_CHANGED_EVENT,
  emitNotificationsChanged,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationsApi';
import { Skeleton } from '../ui/Skeleton';
import NotificationIcon from './NotificationIcon';
import { formatBadgeCount, formatRelativeTime, notificationTarget, shortBody } from './notificationMeta';

export const POLL_INTERVAL_MS = 30_000;
export const PANEL_LIMIT = 8;

const DEFAULT_BUTTON_CLASSES =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2';

function PanelItem({ notification, onOpen }) {
  const unread = !notification.read;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(notification)}
        className={`flex w-full gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${
          unread ? 'bg-primary-soft' : ''
        }`}
      >
        <NotificationIcon type={notification.type} size="sm" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${unread ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>
            {notification.title}
          </span>
          {notification.body && (
            <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{shortBody(notification.body)}</span>
          )}
          <span className="mt-1 block text-xs text-muted">{formatRelativeTime(notification.createdAt)}</span>
        </span>
        {unread && (
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" data-testid="unread-dot">
            <span className="sr-only">Unread</span>
          </span>
        )}
      </button>
    </li>
  );
}

function PanelBody({ items, failed, onOpen }) {
  if (failed) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Couldn&apos;t load notifications.</p>;
  }
  if (!items) {
    return (
      <div role="status" aria-label="Loading notifications" className="space-y-3 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <Bell size={28} className="text-muted" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
      </div>
    );
  }
  return (
    <ul className="max-h-[26rem] divide-y divide-border overflow-y-auto">
      {items.map((notification) => (
        <PanelItem key={notification._id} notification={notification} onOpen={onOpen} />
      ))}
    </ul>
  );
}

// The header bell: unread badge (polled every 30 s and when the window gets
// focus), and a dropdown of the latest notifications. `basePath` is the
// signed-in area ("/dashboard" or "/admin") whose notifications page it opens.
function NotificationBell({ basePath, buttonClassName = DEFAULT_BUTTON_CLASSES }) {
  const { merchant } = useAuth();
  const signedIn = Boolean(merchant);
  const navigate = useNavigate();
  const location = useLocation();
  const panelId = useId();
  const source = useRef({});
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const refreshCount = useCallback(
    () =>
      getUnreadCount()
        .then((res) => setCount(Number(res?.unreadCount) || 0))
        .catch(() => {}),
    []
  );

  const loadPanel = useCallback(() => {
    setFailed(false);
    return listNotifications({ page: 1, limit: PANEL_LIMIT })
      .then((res) => {
        setItems(res?.notifications || []);
        if (typeof res?.unreadCount === 'number') setCount(res.unreadCount);
      })
      .catch(() => {
        setItems([]);
        setFailed(true);
      });
  }, []);

  // Poll only while signed in; everything stops when the bell unmounts.
  useEffect(() => {
    if (!signedIn) {
      setCount(0);
      return undefined;
    }
    refreshCount();
    const timer = window.setInterval(() => {
      if (!document.hidden) refreshCount();
    }, POLL_INTERVAL_MS);
    window.addEventListener('focus', refreshCount);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshCount);
    };
  }, [signedIn, refreshCount]);

  // The notifications page changed something: catch up.
  useEffect(() => {
    if (!signedIn) return undefined;
    function onChanged(e) {
      if (e.detail?.source === source.current) return;
      refreshCount();
      if (open) loadPanel();
    }
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
  }, [signedIn, open, refreshCount, loadPanel]);

  // The layout persists across pages: close the panel when the page changes.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setItems(null);
    setOpen(true);
    loadPanel();
  }

  function openNotification(notification) {
    setOpen(false);
    if (!notification.read) {
      setCount((c) => Math.max(0, c - 1));
      markNotificationRead(notification._id)
        .then(() => emitNotificationsChanged(source.current))
        .catch(() => {});
    }
    navigate(notificationTarget(notification, basePath));
  }

  async function markAll() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev);
      setCount(0);
      emitNotificationsChanged(source.current);
    } catch {
      toast.error("Couldn't mark your notifications as read");
    } finally {
      setMarkingAll(false);
    }
  }

  const badge = formatBadgeCount(count);
  const hasUnread = count > 0 || Boolean(items?.some((n) => !n.read));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className={`relative rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:bg-surface-2 ${buttonClassName}`}
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        <Bell size={18} />
        {badge && (
          <span
            aria-hidden="true"
            data-testid="notification-badge"
            className="absolute -right-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-primary-foreground animate-scale-in"
          >
            {badge}
          </span>
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {count > 0 ? `${count} unread notification${count === 1 ? '' : 's'}` : ''}
      </span>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            id={panelId}
            role="dialog"
            aria-label="Notifications"
            className="absolute right-0 z-20 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] animate-fade-in overflow-hidden rounded-xl border border-border bg-surface shadow-card"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              <button
                type="button"
                onClick={markAll}
                disabled={!hasUnread || markingAll}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-link transition-colors duration-150 hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <CheckCheck size={14} aria-hidden="true" />
                Mark all as read
              </button>
            </div>

            <PanelBody items={items} failed={failed} onOpen={openNotification} />

            <div className="border-t border-border px-4 py-2.5 text-center">
              <Link
                to={`${basePath}/notifications`}
                onClick={() => setOpen(false)}
                className="text-sm font-medium"
              >
                View all
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default NotificationBell;
