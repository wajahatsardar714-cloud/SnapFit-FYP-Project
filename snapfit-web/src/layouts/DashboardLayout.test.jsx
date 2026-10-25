import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardLayout from './DashboardLayout';

const auth = { merchant: null, logout: vi.fn() };
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));

const BANNER = 'An active subscription is required';

const SUBSCRIBED = {
  businessName: 'Blue Tees',
  role: 'merchant',
  subscription: { plan: 'medium', status: 'active', endDate: '2999-01-01T00:00:00.000Z' },
};
const UNSUBSCRIBED = { businessName: 'Blue Tees', role: 'merchant', subscription: { plan: 'small', status: 'inactive' } };
const EXPIRED = {
  ...SUBSCRIBED,
  subscription: { plan: 'medium', status: 'active', endDate: '2020-01-01T00:00:00.000Z' },
};
const SUPER_ADMIN = { businessName: 'SnapFit', role: 'superadmin' };

const PAGES = {
  '': 'Home page',
  subscription: 'Subscription page',
  'subscription/plans': 'Plan selection page',
  'size-charts': 'Size charts page',
  'product-mapping': 'Products page',
  'api-key': 'API key page',
  analytics: 'Analytics page',
  docs: 'Docs page',
  settings: 'Settings page',
};

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard/*" element={<DashboardLayout />}>
          {Object.entries(PAGES).map(([route, text]) =>
            route ? (
              <Route key={route} path={route} element={<p>{text}</p>} />
            ) : (
              <Route key="index" index element={<p>{text}</p>} />
            )
          )}
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

const sidebar = () => within(screen.getByRole('navigation'));

beforeEach(() => {
  auth.merchant = UNSUBSCRIBED;
});

describe('subscription gate', () => {
  it.each(['/dashboard', '/dashboard/size-charts', '/dashboard/product-mapping', '/dashboard/api-key', '/dashboard/analytics'])(
    'sends an unsubscribed merchant from %s to plan selection with an explanation',
    (path) => {
      renderAt(path);
      expect(screen.getByText('Plan selection page')).toBeTruthy();
      expect(screen.getByText(BANNER)).toBeTruthy();
    }
  );

  it.each([
    ['/dashboard/subscription', 'Subscription page'],
    ['/dashboard/subscription/plans', 'Plan selection page'],
    ['/dashboard/settings', 'Settings page'],
  ])('lets an unsubscribed merchant open %s', (path, text) => {
    renderAt(path);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('locks the dashboard again once the end date has passed', () => {
    auth.merchant = EXPIRED;
    renderAt('/dashboard/analytics');
    expect(screen.getByText('Plan selection page')).toBeTruthy();
  });

  it('leaves a subscribed merchant unrestricted', () => {
    auth.merchant = SUBSCRIBED;
    renderAt('/dashboard/size-charts');
    expect(screen.getByText('Size charts page')).toBeTruthy();
    expect(screen.queryByText(BANNER)).toBeNull();
  });

  it('never gates the super admin', () => {
    auth.merchant = SUPER_ADMIN;
    renderAt('/dashboard/api-key');
    expect(screen.getByText('API key page')).toBeTruthy();
    expect(screen.queryByText(BANNER)).toBeNull();
  });
});

describe('sidebar', () => {
  it('shows locked pages as disabled, keeping subscription reachable', () => {
    renderAt('/dashboard/subscription');

    for (const label of ['Dashboard', 'API Key', 'Size Charts', 'Analytics', 'Docs']) {
      const item = sidebar().getByRole('link', { name: new RegExp(label) });
      expect(item.getAttribute('aria-disabled')).toBe('true');
      expect(item.getAttribute('href')).toBeNull();
      expect(item.getAttribute('title')).toBe('Subscribe to unlock');
    }
    expect(sidebar().getByRole('link', { name: 'Subscription' }).getAttribute('href')).toBe('/dashboard/subscription');
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
  });

  it('links every page and shows the plan for a subscribed merchant', () => {
    auth.merchant = SUBSCRIBED;
    renderAt('/dashboard');

    const links = sidebar().getAllByRole('link');
    expect(links.every((link) => link.getAttribute('aria-disabled') == null)).toBe(true);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/dashboard',
      '/dashboard/subscription',
      '/dashboard/api-key',
      '/dashboard/size-charts',
      '/dashboard/analytics',
      '/dashboard/docs',
    ]);
    expect(screen.getByText('Medium')).toBeTruthy();
  });
});
