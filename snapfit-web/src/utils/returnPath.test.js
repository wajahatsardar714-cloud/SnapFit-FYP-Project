import { describe, expect, it } from 'vitest';
import { returnPathFrom, signInPathFor } from './returnPath';

describe('signInPathFor', () => {
  it('keeps the whole page (path, query and hash) in ?next=', () => {
    expect(signInPathFor({ pathname: '/dashboard/analytics', search: '?range=30d', hash: '#usage' })).toBe(
      '/signin?next=%2Fdashboard%2Fanalytics%3Frange%3D30d%23usage'
    );
  });

  it('round-trips through returnPathFrom', () => {
    const page = { pathname: '/admin/merchants/m1', search: '?tab=usage', hash: '' };
    const search = signInPathFor(page).split('?').slice(1).join('?');
    expect(returnPathFrom(`?${search}`)).toBe('/admin/merchants/m1?tab=usage');
  });
});

describe('returnPathFrom', () => {
  it('returns a page on this site', () => {
    expect(returnPathFrom('?next=%2Fdashboard')).toBe('/dashboard');
  });

  it.each([
    ['no next', ''],
    ['an empty next', '?next='],
    ['another site', '?next=%2F%2Fevil.example'],
    ['another site, backslash form', '?next=%2F%5Cevil.example'],
    ['a full URL', '?next=https%3A%2F%2Fevil.example'],
    ['a relative path', '?next=dashboard'],
  ])('ignores %s', (_, search) => {
    expect(returnPathFrom(search)).toBeNull();
  });
});
