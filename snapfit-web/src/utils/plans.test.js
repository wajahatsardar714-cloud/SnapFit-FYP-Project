import { describe, expect, it } from 'vitest';
import {
  PLANS,
  formatChartsLimit,
  formatLimit,
  formatPlanName,
  formatPlanPrice,
  formatRequestsLimit,
  isPlanId,
  isSubscribed,
} from './plans';

const NOW = new Date('2026-10-25T12:00:00.000Z');

function merchantWith(subscription) {
  return { role: 'merchant', subscription };
}

describe('plan ids and names', () => {
  it('lists the plans in display order', () => {
    expect(PLANS).toEqual(['small', 'medium', 'enterprise']);
    expect(PLANS.map(formatPlanName)).toEqual(['Small', 'Medium', 'Enterprise']);
  });

  it('recognises only the current plan ids', () => {
    expect(isPlanId('medium')).toBe(true);
    expect(isPlanId('pro')).toBe(false);
    expect(isPlanId(null)).toBe(false);
  });

  it('names a missing plan "None" and capitalizes an unknown one', () => {
    expect(formatPlanName(undefined)).toBe('None');
    expect(formatPlanName('legacy')).toBe('Legacy');
  });
});

describe('price and limit formatting', () => {
  it('shows a monthly price, or Custom when there is none', () => {
    expect(formatPlanPrice(49)).toBe('$49/month');
    expect(formatPlanPrice(1200)).toBe('$1,200/month');
    expect(formatPlanPrice(null)).toBe('Custom');
  });

  it('shows Unlimited for a null limit', () => {
    expect(formatLimit(null)).toBe('Unlimited');
    expect(formatLimit(5000)).toBe('5,000');
    expect(formatRequestsLimit(null)).toBe('Unlimited requests');
    expect(formatRequestsLimit(5000)).toBe('5,000 requests/month');
    expect(formatChartsLimit(null)).toBe('Unlimited size charts');
    expect(formatChartsLimit(1)).toBe('1 size chart');
    expect(formatChartsLimit(10)).toBe('10 size charts');
  });
});

describe('isSubscribed', () => {
  it('needs an active subscription', () => {
    expect(isSubscribed(merchantWith({ plan: 'small', status: 'active', endDate: null }), NOW)).toBe(true);
    expect(isSubscribed(merchantWith({ plan: 'small', status: 'inactive', endDate: null }), NOW)).toBe(false);
    expect(isSubscribed(merchantWith({ plan: 'small', status: 'expired' }), NOW)).toBe(false);
    expect(isSubscribed(merchantWith(undefined), NOW)).toBe(false);
    expect(isSubscribed(null, NOW)).toBe(false);
  });

  it('treats an active subscription whose end date has passed as expired', () => {
    expect(isSubscribed(merchantWith({ status: 'active', endDate: '2026-11-01T00:00:00.000Z' }), NOW)).toBe(true);
    expect(isSubscribed(merchantWith({ status: 'active', endDate: '2026-10-01T00:00:00.000Z' }), NOW)).toBe(false);
  });
});
