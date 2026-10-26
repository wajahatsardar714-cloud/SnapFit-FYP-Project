import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../services/api';
import { AuthProvider, useAuth } from '../../context/AuthContext';
import { login as content } from '../../content/auth';
import LoginPage from './LoginPage';
import SignInPage from './SignInPage';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAccountSuspendedHandler: vi.fn(),
  setSubscriptionRequiredHandler: vi.fn(),
}));

const MERCHANT = { _id: 'm1', email: 'shop@test.com', businessName: 'Shop', role: 'merchant', status: 'active' };
const ADMIN = { _id: 'a1', email: 'admin@test.com', businessName: 'SnapFit', role: 'superadmin', status: 'active' };
const SUSPENDED = 'This account has been suspended. Contact support.';
const SUPPORT_EMAIL = 'wajahatsardar714@gmail.com';

function SignedIn({ name }) {
  const { logout } = useAuth();
  return (
    <>
      <p>{name}</p>
      <button type="button" onClick={logout}>
        Log out
      </button>
    </>
  );
}

// /login is the content page; /signin is the bare form its buttons open.
function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/dashboard" element={<SignedIn name="Merchant home" />} />
          <Route path="/admin" element={<SignedIn name="Admin home" />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

const renderLogin = () => renderAt('/login');
const renderSignIn = () => renderAt('/signin');

// A paragraph whose text (links included) is exactly `text`.
const paragraph = (text) => screen.getByText((_, el) => el.tagName === 'P' && el.textContent === text);

async function logIn({ remember = true } = {}) {
  fireEvent.change(await screen.findByLabelText('Business email'), { target: { value: 'user@test.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
  if (!remember) fireEvent.click(screen.getByLabelText('Remember me'));
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('LoginPage content', () => {
  it('sets the SEO title and meta description', () => {
    renderLogin();
    expect(document.title).toBe('Log In to SnapFit | AI Clothing Size Estimation');
    expect(document.head.querySelector('meta[name="description"]').getAttribute('content')).toBe(
      'Log in to your SnapFit account to manage your subscription, access your sizing integration, and continue setting up your online store.'
    );
  });

  it('renders the H1 and every H2 with its eyebrow, without a side panel', () => {
    const { container } = renderLogin();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Log In to Your SnapFit Account');
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Access Your SnapFit Account',
      'Manage Your SnapFit Setup',
      'Forgot Your Password?',
      'Troubleshooting Login Problems',
      'Frequently Asked Questions',
      'Continue with SnapFit',
    ]);
    for (const { id, eyebrow, title } of [content.formSection, ...content.sections]) {
      const section = container.querySelector(`#${id}`);
      expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe(title);
      expect(within(section).getByText(eyebrow)).toBeTruthy();
    }
    expect(within(container.querySelector('#access-account')).getByText('Merchant Sign-In')).toBeTruthy();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByText('Size recommendations for your store')).toBeNull();
  });

  it('keeps the copy verbatim, with its links', () => {
    renderLogin();
    for (const sentence of [
      'Welcome back to SnapFit. Log in to access your account and continue managing your AI clothing size estimation setup.',
      'Enter the email address and password associated with your registered account.',
      'For security, avoid sharing your password with other people. Use a unique password that you do not use for unrelated websites.',
      'Never share a password reset link or verification code with someone you do not trust.',
      'For questions about plan details, billing, or account access, contact SnapFit using the support email listed below.',
      'New to SnapFit? Visit the Register page to create an account or explore the available plans on the Pricing page.',
    ]) {
      expect(paragraph(sentence)).toBeTruthy();
    }
    expect(screen.getByRole('heading', { level: 3, name: 'Review Your Subscription' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Register page' }).getAttribute('href')).toBe('/register');
    expect(screen.getByRole('link', { name: 'Pricing page' }).getAttribute('href')).toBe('/pricing');
  });

  it('lists the questions as FAQ disclosures', () => {
    const { container } = renderLogin();
    const questions = [...container.querySelectorAll('#faq details summary')].map((summary) => summary.textContent);
    expect(questions).toEqual([
      'How Do I Log In to SnapFit?',
      'What If I Forget My Password?',
      'Can I Change My Subscription After Logging In?',
      'Where Can I Find My API Credentials?',
      'How Can I Contact SnapFit Support?',
    ]);
    const support = within(container.querySelector('#faq')).getByRole('link', { name: SUPPORT_EMAIL });
    expect(support.getAttribute('href')).toBe(`mailto:${SUPPORT_EMAIL}`);
  });

  it('puts the buttons right after the H1, before the description', () => {
    renderLogin();
    const h1 = screen.getByRole('heading', { level: 1 });
    const button = screen.getByRole('link', { name: 'Log In' });
    const intro = screen.getByText((_, el) => el.tagName === 'P' && el.textContent.startsWith('Welcome back to SnapFit.'));
    const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(h1, button)).toBe(true);
    expect(follows(button, intro)).toBe(true);
  });

  it('has no form, only buttons to the log-in and sign-up forms', () => {
    renderLogin();
    for (const line of ['Login form fields:', 'Show or hide password', 'Remember me, if supported', 'Log In button']) {
      expect(screen.queryByText(line)).toBeNull();
    }
    expect(screen.queryByLabelText('Business email')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log In' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Log In' }).getAttribute('href')).toBe('/signin');
    expect(screen.getByRole('link', { name: 'Sign Up' }).getAttribute('href')).toBe('/signup');
  });
});

describe('SignInPage', () => {
  it('is the bare form: a heading and the fields, no page content', () => {
    renderSignIn();
    expect(document.title).toBe('Log In | SnapFit');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Log In');
    expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([]);
    expect(screen.queryByText('Welcome back to SnapFit', { exact: false })).toBeNull();
    expect(screen.getByRole('link', { name: 'SnapFit home' }).getAttribute('href')).toBe('/');
    expect(screen.getByLabelText('Business email').getAttribute('type')).toBe('email');
    expect(screen.getByLabelText('Remember me').checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log In' }).getAttribute('type')).toBe('submit');
  });

  it('shows and hides the password', () => {
    renderSignIn();
    const password = screen.getByLabelText('Password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(password.getAttribute('type')).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);
    expect(password.getAttribute('type')).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(toggle);
    expect(password.getAttribute('type')).toBe('password');
  });

  it('reveals how to reset a password', () => {
    renderSignIn();
    const toggle = screen.getByRole('button', { name: 'Forgot password?' });
    const note = document.getElementById(toggle.getAttribute('aria-controls'));
    expect(note.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    expect(note.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(note.textContent).toBe(
      `Contact ${SUPPORT_EMAIL} from your account email and we'll help you reset your password.`
    );
    expect(within(note).getByRole('link', { name: SUPPORT_EMAIL }).getAttribute('href')).toBe(`mailto:${SUPPORT_EMAIL}`);
  });

  it('remembers the session in localStorage by default, and logout clears it', async () => {
    api.post.mockResolvedValue({ data: { token: 'jwt', merchant: MERCHANT } });
    renderSignIn();
    await logIn();
    expect(await screen.findByText('Merchant home')).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'user@test.com', password: 'secret123' });
    expect(localStorage.getItem('token')).toBe('jwt');
    expect(sessionStorage.getItem('token')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Log In' })).toBeTruthy();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('keeps the session in sessionStorage when Remember me is unchecked, and logout clears it', async () => {
    api.post.mockResolvedValue({ data: { token: 'jwt', merchant: ADMIN } });
    renderSignIn();
    await logIn({ remember: false });
    expect(await screen.findByText('Admin home')).toBeTruthy();
    expect(sessionStorage.getItem('token')).toBe('jwt');
    expect(localStorage.getItem('token')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await screen.findByRole('heading', { level: 1, name: 'Log In' });
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('restores a session-only login on reload', async () => {
    sessionStorage.setItem('token', 'jwt');
    api.get.mockResolvedValue({ data: { merchant: MERCHANT } });
    renderSignIn();
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledWith('/auth/me'));
  });

  it('shows the suspension message and stores no token', async () => {
    api.post.mockRejectedValue({ response: { status: 403, data: { message: SUSPENDED } } });
    renderSignIn();
    await logIn();
    expect(await screen.findByText(SUSPENDED)).toBeTruthy();
    expect(localStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
  });
});
