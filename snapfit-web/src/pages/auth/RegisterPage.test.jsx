import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../services/api';
import { AuthProvider } from '../../context/AuthContext';
import { register as content } from '../../content/auth';
import RegisterPage from './RegisterPage';
import SignUpPage from './SignUpPage';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAccountSuspendedHandler: vi.fn(),
  setSubscriptionRequiredHandler: vi.fn(),
}));

const MERCHANT = { _id: 'm1', email: 'sam@shop.test', businessName: 'Sam Shop', role: 'merchant', status: 'active' };

function Landing() {
  const { pathname, search } = useLocation();
  return (
    <p>
      Landed at {pathname}
      {search}
    </p>
  );
}

// /register is the content page; /signup is the bare form its buttons open.
function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/dashboard/*" element={<Landing />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

const renderRegister = () => renderAt('/register');
const renderSignUp = (search = '') => renderAt(`/signup${search}`);

// A paragraph or list item whose text (links included) is exactly `text`.
const block = (text) => screen.getByText((_, el) => ['P', 'LI'].includes(el.tagName) && el.textContent === text);

function fillForm() {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Sam Shop' } });
  fireEvent.change(screen.getByLabelText('Business email'), { target: { value: 'sam@shop.test' } });
  fireEvent.change(screen.getByLabelText('Store name'), { target: { value: 'Sam Shop' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Secret123' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Secret123' } });
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  api.post.mockResolvedValue({ data: { token: 'jwt', merchant: MERCHANT } });
});

describe('RegisterPage content', () => {
  it('sets the SEO title and meta description', () => {
    renderRegister();
    expect(document.title).toBe('Create Your SnapFit Account | AI Size Estimation');
    expect(document.head.querySelector('meta[name="description"]').getAttribute('content')).toBe(
      'Register for SnapFit and bring AI-powered clothing size estimation and personalized size recommendations to your online store.'
    );
  });

  it('renders the H1 and every H2 with its eyebrow, without a side panel', () => {
    const { container } = renderRegister();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Create Your SnapFit Account');
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Create Your Account',
      'Get Started with AI Clothing Size Estimation',
      'Choose a SnapFit Subscription Plan',
      'What Happens After Registration?',
      'Why Choose SnapFit?',
      'Frequently Asked Questions',
      'Start with SnapFit Today',
    ]);
    for (const { id, eyebrow, title } of [content.formSection, ...content.sections]) {
      const section = container.querySelector(`#${id}`);
      expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe(title);
      expect(within(section).getByText(eyebrow)).toBeTruthy();
    }
    expect(within(container.querySelector('#faq')).getByText('Registration Questions')).toBeTruthy();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByText('Size recommendations for your store')).toBeNull();
  });

  it('keeps the copy verbatim, with the field list as help text', () => {
    renderRegister();
    for (const text of [
      'Create your account to get started with SnapFit, explore your subscription options, and prepare your store for an AI-assisted sizing experience.',
      'Your registration form may request the following information:',
      'Full name: Identify the person responsible for the account.',
      'Store name: Identify the clothing store you want to connect with SnapFit.',
      'Subscription plan: Select a suitable plan when required by the registration process.',
      'Review your information before submitting the form. You should also read the Privacy Policy and Terms of Service to understand how the service operates and how your account information is handled.',
      'If you are unsure which plan fits your business, review the Pricing page before completing your registration.',
      'This approach can help customers make more informed size choices without relying only on generic size labels. However, recommendations are estimates and cannot guarantee a perfect fit.',
      'Ready to get started? Register for SnapFit and take the first step toward a more informed clothing size selection process.',
    ]) {
      expect(block(text)).toBeTruthy();
    }
    expect(screen.getByRole('heading', { level: 3, name: 'Configure Product Size Charts' })).toBeTruthy();
  });

  it('links the legal pages, pricing and support', () => {
    const { container } = renderRegister();
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: 'Pricing page' }).getAttribute('href')).toBe('/pricing');
    const support = within(container.querySelector('#faq')).getByRole('link', { name: 'wajahatsardar714@gmail.com' });
    expect(support.getAttribute('href')).toBe('mailto:wajahatsardar714@gmail.com');
  });

  it('lists the questions as FAQ disclosures', () => {
    const { container } = renderRegister();
    expect([...container.querySelectorAll('#faq details summary')].map((summary) => summary.textContent)).toEqual([
      'Is Registration Free?',
      'Can I Register My Shopify Store?',
      'Can I Use SnapFit on a Custom Website?',
      'What Happens If I Have Trouble Registering?',
    ]);
  });
});

describe('RegisterPage buttons', () => {
  it('puts the buttons right after the H1, before the description', () => {
    renderRegister();
    const h1 = screen.getByRole('heading', { level: 1 });
    const button = screen.getByRole('link', { name: 'Sign Up' });
    const intro = screen.getByText((_, el) => el.tagName === 'P' && el.textContent.startsWith('Make clothing size selection easier'));
    const follows = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(h1, button)).toBe(true);
    expect(follows(button, intro)).toBe(true);
  });

  it('has no form, only buttons to the sign-up and log-in forms', () => {
    renderRegister();
    expect(screen.queryByLabelText('Full name')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign Up' }).getAttribute('href')).toBe('/signup');
    expect(screen.getByRole('link', { name: 'Log In' }).getAttribute('href')).toBe('/signin');
  });
});

describe('SignUpPage', () => {
  it('is the bare form: a heading and the fields, no page content', () => {
    renderSignUp();
    expect(document.title).toBe('Sign Up | SnapFit');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sign Up');
    expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([]);
    expect(screen.queryByText('Your registration form may request the following information:')).toBeNull();
    expect(screen.getByRole('link', { name: 'SnapFit home' }).getAttribute('href')).toBe('/');
  });

  it('labels the fields as the content names them', () => {
    renderSignUp();
    for (const label of ['Full name', 'Business email', 'Store name', 'Password', 'Confirm password', 'Subscription plan']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    const plan = screen.getByLabelText('Subscription plan');
    expect([...plan.options].map((option) => [option.value, option.textContent])).toEqual([
      ['', 'Choose later'],
      ['small', 'Small'],
      ['medium', 'Medium'],
      ['enterprise', 'Enterprise'],
    ]);
    expect(plan.value).toBe('');
  });

  it('preselects the plan from ?plan=', () => {
    renderSignUp('?plan=Enterprise');
    expect(screen.getByLabelText('Subscription plan').value).toBe('enterprise');
  });

  it('sends a merchant who chose a plan to plan selection, without posting the plan', async () => {
    renderSignUp();
    fillForm();
    fireEvent.change(screen.getByLabelText('Subscription plan'), { target: { value: 'small' } });
    submit();
    expect(await screen.findByText('Landed at /dashboard/subscription/plans?plan=small')).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      name: 'Sam Shop',
      email: 'sam@shop.test',
      password: 'Secret123',
      businessName: 'Sam Shop',
    });
    expect(localStorage.getItem('token')).toBe('jwt');
  });

  it('goes to the dashboard when the merchant chooses later', async () => {
    renderSignUp('?plan=medium');
    fillForm();
    fireEvent.change(screen.getByLabelText('Subscription plan'), { target: { value: '' } });
    submit();
    expect(await screen.findByText('Landed at /dashboard')).toBeTruthy();
  });

  it('flags a missing store name', () => {
    renderSignUp();
    submit();
    const store = screen.getByLabelText('Store name');
    expect(store.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(store.getAttribute('aria-describedby')).textContent).toBe('Store name is required');
    expect(api.post).not.toHaveBeenCalled();
  });
});
