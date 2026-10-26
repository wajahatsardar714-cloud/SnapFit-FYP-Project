import { fireEvent, render, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './services/api';
import App from './App';

vi.mock('./services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAccountSuspendedHandler: vi.fn(),
  setSubscriptionRequiredHandler: vi.fn(),
}));

// The signed-in areas are stood in for by their location, so these tests stay
// about routing rather than the dashboards themselves.
function AreaStub({ name }) {
  const { pathname, search } = useLocation();
  return (
    <p>
      {name} at {pathname}
      {search}
    </p>
  );
}
vi.mock('./layouts/DashboardLayout', () => ({ default: () => <AreaStub name="Dashboard" /> }));
vi.mock('./layouts/AdminLayout', () => ({ default: () => <AreaStub name="Admin" /> }));

const MERCHANT = { _id: 'm1', email: 'shop@test.com', businessName: 'Shop', role: 'merchant', status: 'active' };
const ADMIN = { _id: 'a1', email: 'admin@test.com', businessName: 'SnapFit', role: 'superadmin', status: 'active' };

function renderAt(path) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

const header = () => screen.getByRole('banner');

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('public routes', () => {
  it('renders the homepage at / inside the site header and footer', async () => {
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'AI Clothing Size Estimation and Recommendation for Online Stores' })
    ).toBeTruthy();
    expect(header()).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Skip to main content' }).getAttribute('href')).toBe('#main-content');
  });

  it('renders the pricing page at /pricing', async () => {
    api.get.mockResolvedValue({ data: { plans: [] } });
    renderAt('/pricing');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'SnapFit Pricing Plans for AI Clothing Size Estimation' })
    ).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/subscription/plans');
  });

  it('renders the login page at /login', async () => {
    renderAt('/login');
    expect(await screen.findByRole('heading', { name: 'Log in to SnapFit' })).toBeTruthy();
  });
});

describe('site header', () => {
  it('offers Login and Get Started to visitors', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    const nav = within(header()).getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Home', '/'],
      ['Pricing', '/pricing'],
      ['Guide', '/guide'],
    ]);
    expect(within(nav).getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(within(header()).getByRole('link', { name: 'Login' }).getAttribute('href')).toBe('/login');
    expect(within(header()).getByRole('link', { name: 'Get Started' }).getAttribute('href')).toBe('/register');
    expect(within(header()).queryByRole('link', { name: 'Dashboard' })).toBeNull();
  });

  it('keeps legal pages and in-page anchors out of the header, in both menus', async () => {
    renderAt('/guide');
    await screen.findByRole('heading', { level: 1 });
    const hrefs = within(header())
      .getAllByRole('link', { hidden: true })
      .map((link) => link.getAttribute('href'));
    expect(hrefs.filter((href) => href.includes('#'))).toEqual([]);
    for (const page of ['/privacy', '/terms', '/cookies']) expect(hrefs).not.toContain(page);
    for (const nav of within(header()).getAllByRole('navigation', { name: 'Main', hidden: true })) {
      expect(within(nav).getByRole('link', { name: 'Guide', hidden: true }).getAttribute('aria-current')).toBe('page');
      expect(within(nav).getByRole('link', { name: 'Home', hidden: true }).getAttribute('aria-current')).toBeNull();
    }
  });

  it('shows the Dashboard button to a signed-in merchant', async () => {
    localStorage.setItem('token', 'jwt');
    api.get.mockResolvedValue({ data: { merchant: MERCHANT } });
    renderAt('/');
    const button = await within(header()).findByRole('link', { name: 'Dashboard' });
    expect(button.getAttribute('href')).toBe('/dashboard');
    expect(within(header()).queryByRole('link', { name: 'Login' })).toBeNull();
  });

  it('shows the Admin button to a signed-in super admin', async () => {
    localStorage.setItem('token', 'jwt');
    api.get.mockResolvedValue({ data: { merchant: ADMIN } });
    renderAt('/pricing');
    const button = await within(header()).findByRole('link', { name: 'Admin' });
    expect(button.getAttribute('href')).toBe('/admin');
  });

  it('opens and closes the mobile menu', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    const toggle = within(header()).getByRole('button', { name: 'Open menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(toggle.getAttribute('aria-controls')).hidden).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Close menu');
    expect(document.getElementById(toggle.getAttribute('aria-controls')).hidden).toBe(false);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('site footer', () => {
  const footerLinks = (title) => {
    const heading = within(screen.getByRole('contentinfo')).getByRole('heading', { level: 2, name: title });
    return within(heading.parentElement)
      .getAllByRole('link')
      .map((link) => [link.textContent, link.getAttribute('href')]);
  };

  it('links every page, the legal pages and the contact email', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    expect(footerLinks('Product')).toEqual([
      ['Home', '/'],
      ['Pricing', '/pricing'],
      ['Guide', '/guide'],
    ]);
    expect(footerLinks('Account')).toEqual([
      ['Login', '/login'],
      ['Register', '/register'],
    ]);
    expect(footerLinks('Legal')).toEqual([
      ['Privacy Policy', '/privacy'],
      ['Terms of Service', '/terms'],
      ['Cookie Policy', '/cookies'],
    ]);
    expect(footerLinks('Contact')).toEqual([['wajahatsardar714@gmail.com', 'mailto:wajahatsardar714@gmail.com']]);
    expect(screen.getByRole('contentinfo').textContent).not.toContain('snapfit.example');
  });
});

describe('auth flows', () => {
  async function logIn() {
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  }

  it('sends a super admin to the admin console after login', async () => {
    api.post.mockResolvedValue({ data: { token: 'jwt', merchant: ADMIN } });
    renderAt('/login');
    await logIn();
    expect(await screen.findByText('Admin at /admin')).toBeTruthy();
  });

  async function register(path) {
    api.post.mockResolvedValue({ data: { token: 'jwt', merchant: MERCHANT } });
    renderAt(path);
    fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Sam Shop' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sam@shop.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secret123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Secret123' } });
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Sam Shop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  }

  it('takes a new merchant from ?plan= straight to that plan', async () => {
    await register('/register?plan=medium');
    expect(await screen.findByText('Dashboard at /dashboard/subscription/plans?plan=medium')).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith('/auth/register', expect.objectContaining({ email: 'sam@shop.test' }));
  });

  it('goes to the dashboard after registering without a plan, or with an unknown one', async () => {
    await register('/register?plan=platinum');
    expect(await screen.findByText('Dashboard at /dashboard')).toBeTruthy();
  });

  it('shows field errors on the register form', async () => {
    renderAt('/register');
    fireEvent.click(await screen.findByRole('button', { name: 'Create account' }));
    const name = screen.getByLabelText('Full name');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(name.getAttribute('aria-describedby')).textContent).toBe('Name is required');
    expect(api.post).not.toHaveBeenCalled();
  });
});
