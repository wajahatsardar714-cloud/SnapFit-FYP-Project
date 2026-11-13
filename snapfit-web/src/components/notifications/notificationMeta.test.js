import { describe, expect, it } from 'vitest';
import { formatBadgeCount, formatRelativeTime, notificationGroup, notificationTarget, shortBody } from './notificationMeta';

const NOW = new Date('2026-11-13T12:00:00.000Z').getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();

describe('notification helpers', () => {
  it('caps the badge at 99+ and shows nothing for zero', () => {
    expect(formatBadgeCount(0)).toBe('');
    expect(formatBadgeCount(undefined)).toBe('');
    expect(formatBadgeCount(1)).toBe('1');
    expect(formatBadgeCount(99)).toBe('99');
    expect(formatBadgeCount(100)).toBe('99+');
    expect(formatBadgeCount(2500)).toBe('99+');
  });

  it('says how long ago something happened', () => {
    expect(formatRelativeTime(ago(10 * 1000), NOW)).toBe('just now');
    expect(formatRelativeTime(ago(5 * 60 * 1000), NOW)).toBe('5 min ago');
    expect(formatRelativeTime(ago(3 * 3600 * 1000), NOW)).toBe('3 h ago');
    expect(formatRelativeTime(ago(2 * 86400 * 1000), NOW)).toBe('2 d ago');
    expect(formatRelativeTime(ago(30 * 86400 * 1000), NOW)).toMatch(/2026/);
    expect(formatRelativeTime(null, NOW)).toBe('');
  });

  it('opens the in-app link, or the area notifications page without one', () => {
    expect(notificationTarget({ link: '/dashboard/receipts/r1' }, '/dashboard')).toBe('/dashboard/receipts/r1');
    expect(notificationTarget({ link: null }, '/dashboard')).toBe('/dashboard/notifications');
    expect(notificationTarget({ link: null }, '/admin')).toBe('/admin/notifications');
    expect(notificationTarget({ link: 'https://evil.example' }, '/dashboard')).toBe('/dashboard/notifications');
    expect(notificationTarget({ link: '//evil.example' }, '/dashboard')).toBe('/dashboard/notifications');
  });

  it('groups types by their prefix', () => {
    expect(notificationGroup('subscription.activated')).toBe('subscription');
    expect(notificationGroup('admin.merchant_signed_up')).toBe('admin');
    expect(notificationGroup('announcement')).toBe('announcement');
    expect(notificationGroup('something.new')).toBe('account');
  });

  it('shortens long bodies', () => {
    expect(shortBody('Short')).toBe('Short');
    const long = shortBody('x'.repeat(300));
    expect(long.length).toBeLessThanOrEqual(110);
    expect(long.endsWith('…')).toBe(true);
  });
});
