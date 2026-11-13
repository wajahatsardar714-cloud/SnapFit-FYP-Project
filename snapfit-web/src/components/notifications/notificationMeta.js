import { CreditCard, Gauge, Megaphone, ShieldAlert, Shirt, Store, User } from 'lucide-react';

// How each family of notification types looks: the part of the type before the
// dot ("subscription.activated" -> "subscription") picks the icon and tint.
const GROUPS = {
  account: { Icon: User, tint: 'bg-primary-soft text-primary' },
  security: { Icon: ShieldAlert, tint: 'bg-danger-soft text-danger' },
  subscription: { Icon: CreditCard, tint: 'bg-success-soft text-success' },
  usage: { Icon: Gauge, tint: 'bg-warning-soft text-warning' },
  product: { Icon: Shirt, tint: 'bg-primary-soft text-primary' },
  announcement: { Icon: Megaphone, tint: 'bg-admin-soft text-admin' },
  admin: { Icon: Store, tint: 'bg-admin-soft text-admin' },
};

export function notificationGroup(type) {
  const key = String(type || '').split('.')[0];
  return GROUPS[key] ? key : 'account';
}

export function notificationStyle(type) {
  return GROUPS[notificationGroup(type)];
}

// The bell's badge: the count, capped at "99+". Nothing when there is none.
export function formatBadgeCount(count) {
  if (!count || count < 1) return '';
  return count > 99 ? '99+' : String(count);
}

// "just now", "5 min ago", "3 h ago", "2 d ago", then the date.
export function formatRelativeTime(value, now = Date.now()) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Where a notification opens: its in-app link, or the area's notifications
// page when it has none (or something that isn't an in-app path).
export function notificationTarget(notification, basePath) {
  const link = notification?.link;
  if (typeof link === 'string' && link.startsWith('/') && !link.startsWith('//')) return link;
  return `${basePath}/notifications`;
}

// A long body cut to a line or two for the bell's dropdown.
export function shortBody(body, max = 110) {
  const text = String(body || '').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
