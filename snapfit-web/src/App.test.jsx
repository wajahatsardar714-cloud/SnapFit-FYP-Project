import { fireEvent, render, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './services/api';
import App from './App';

vi.mock('./services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAccountSuspendedHandler: vi.fn(),
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

  it('renders the pricing placeholder at /pricing', async () => {
    renderAt('/pricing');
    expect(await screen.findByRole('heading', { level: 1, name: 'SnapFit Pricing Plans' })).toBeTruthy();
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
      ['How it works', '/#how-it-works'],
      ['Features', '/#features'],
      ['Pricing', '/pricing'],
      ['FAQ', '/#faq'],
    ]);
    expect(within(header()).getByRole('link', { name: 'Login' }).getAttribute('href')).toBe('/login');
    expect(within(header()).getByRole('link', { name: 'Get Started' }).getAttribute('href')).toBe('/register');
    expect(within(header()).queryByRole('link', { name: 'Dashboard' })).toBeNull();
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
