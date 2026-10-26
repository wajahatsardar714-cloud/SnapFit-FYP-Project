import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import api, { setAccountSuspendedHandler, setSubscriptionRequiredHandler } from '../services/api';
import { AuthProvider } from '../context/AuthContext';
import LoginPage from '../pages/auth/LoginPage';
import { ROLES } from '../utils/roles';
import ProtectedRoute from './ProtectedRoute';

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAccountSuspendedHandler: vi.fn(),
  setSubscriptionRequiredHandler: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const SUSPENDED = 'This account has been suspended. Contact support.';
const MERCHANT = { _id: 'm1', email: 'shop@test.com', businessName: 'Shop', role: 'merchant', status: 'active' };
const ADMIN = { _id: 'a1', email: 'admin@test.com', businessName: 'SnapFit', role: 'superadmin', status: 'active' };

function renderApp(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard/subscription/plans" element={<p>Plan selection</p>} />
          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute role={ROLES.MERCHANT}>
                <p>Merchant home</p>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute role={ROLES.SUPER_ADMIN}>
                <p>Admin home</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function logIn() {
  fireEvent.change(await screen.findByLabelText('Business email'), { target: { value: 'user@test.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('login routing by role', () => {
  it('sends a super admin to /admin', async () => {
    api.post.mockResolvedValue({ data: { token: 'jwt', merchant: ADMIN } });
    renderApp('/login');
    await logIn();
    expect(await screen.findByText('Admin home')).toBeTruthy();
    expect(localStorage.getItem('token')).toBe('jwt');
  });

  it('sends a merchant to /dashboard', async () => {
    api.post.mockResolvedValue({ data: { token: 'jwt', merchant: MERCHANT } });
    renderApp('/login');
    await logIn();
    expect(await screen.findByText('Merchant home')).toBeTruthy();
  });

  it('shows the suspension message on the login form', async () => {
    api.post.mockRejectedValue({ response: { status: 403, data: { message: SUSPENDED } } });
    renderApp('/login');
    await logIn();
    expect(await screen.findByText(SUSPENDED)).toBeTruthy();
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('ProtectedRoute roles', () => {
  it('sends a reloaded super admin from the merchant area to /admin', async () => {
    localStorage.setItem('token', 'jwt');
    api.get.mockResolvedValue({ data: { merchant: ADMIN } });
    renderApp('/dashboard/analytics');
    expect(await screen.findByText('Admin home')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });

  it('keeps a merchant out of /admin', async () => {
    localStorage.setItem('token', 'jwt');
    api.get.mockResolvedValue({ data: { merchant: MERCHANT } });
    renderApp('/admin/merchants');
    expect(await screen.findByText('Merchant home')).toBeTruthy();
    expect(screen.queryByText('Admin home')).toBeNull();
  });

  it('lets each role into its own area', async () => {
    localStorage.setItem('token', 'jwt');
    api.get.mockResolvedValue({ data: { merchant: ADMIN } });
    renderApp('/admin');
    expect(await screen.findByText('Admin home')).toBeTruthy();
  });

  it('sends a signed-out visitor to the login page', async () => {
    renderApp('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: 'Log In to Your SnapFit Account' })).toBeTruthy();
  });
});

describe('suspension during a session', () => {
  it('logs the user out with a toast', async () => {
    localStorage.setItem('token', 'jwt');
    api.get.mockResolvedValue({ data: { merchant: MERCHANT } });
    renderApp('/dashboard');
    await screen.findByText('Merchant home');

    const handler = setAccountSuspendedHandler.mock.calls.findLast(([fn]) => typeof fn === 'function')[0];
    act(() => handler(SUSPENDED));

    expect(toast.error).toHaveBeenCalledWith(SUSPENDED, { id: 'account-suspended' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Log In to Your SnapFit Account' })).toBeTruthy();
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('subscription required during a session', () => {
  it('refreshes the account and sends the merchant to plan selection', async () => {
    localStorage.setItem('token', 'jwt');
    api.get.mockResolvedValue({ data: { merchant: MERCHANT } });
    renderApp('/dashboard/analytics');
    await screen.findByText('Merchant home');
    api.get.mockClear();

    const handler = setSubscriptionRequiredHandler.mock.calls.findLast(([fn]) => typeof fn === 'function')[0];
    act(() => handler('An active subscription is required'));

    expect(toast.error).toHaveBeenCalledWith('An active subscription is required', { id: 'subscription-required' });
    expect(await screen.findByText('Plan selection')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });
});
