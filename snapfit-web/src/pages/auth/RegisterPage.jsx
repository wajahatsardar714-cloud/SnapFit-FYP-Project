import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import AuthSidePanel from './AuthSidePanel';

const BUSINESS_TYPES = [
  { value: '', label: 'Select a business type' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'footwear', label: 'Footwear' },
  { value: 'accessories', label: 'Accessories' },
];

// Purely a client-side strength hint, not an extra submission gate -- the
// backend only enforces the 8-character minimum today (see authController.js),
// so these are shown as guidance rather than blocking validation errors.
const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'At least 1 number', test: (pw) => /\d/.test(pw) },
  { label: 'At least 1 uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
];

const initialForm = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  businessName: '',
  phone: '',
  businessType: '',
};

function validate(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Name is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email';
  if (form.password.length < 8) errors.password = 'Password must be at least 8 characters';
  if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match';
  if (!form.businessName.trim()) errors.businessName = 'Business name is required';
  return errors;
}

function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      const { confirmPassword, ...payload } = form;
      if (!payload.phone) delete payload.phone;
      if (!payload.businessType) delete payload.businessType;
      await register(payload);
      // Existing backend has no email-verification gate (isVerified is just a
      // static flag, never checked before allowing dashboard access) -- so the
      // existing "register -> already authenticated -> go straight to the
      // dashboard" behavior is the correct, real success path, not a stand-in
      // for a verification flow that doesn't exist.
      navigate('/dashboard');
    } catch (err) {
      setFormError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:w-[58%] sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-md">
          <Link to="/login" className="text-lg font-bold text-primary-600">
            SnapFit
          </Link>

          <h1 className="mt-8 text-2xl font-semibold text-ink-900">Create your merchant account</h1>
          <p className="mt-1 text-sm text-ink-500">Start integrating SnapFit into your store</p>

          {formError && (
            <div className="mt-6">
              <Alert variant="danger" title={formError} />
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <Input
              label="Full name"
              name="name"
              value={form.name}
              onChange={handleChange}
              error={errors.name}
              autoComplete="name"
              disabled={submitting}
            />
            <Input
              label="Email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              error={errors.email}
              autoComplete="email"
              disabled={submitting}
            />

            <div>
              <Input
                label="Password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                error={errors.password}
                autoComplete="new-password"
                disabled={submitting}
              />
              <ul className="mt-2 space-y-1">
                {PASSWORD_RULES.map((rule) => {
                  const met = rule.test(form.password);
                  return (
                    <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${met ? 'text-success' : 'text-ink-500'}`}>
                      <Check size={12} className={met ? 'text-success' : 'text-ink-300'} />
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
            </div>

            <Input
              label="Confirm password"
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              error={errors.confirmPassword}
              autoComplete="new-password"
              disabled={submitting}
            />
            <Input
              label="Business name"
              name="businessName"
              value={form.businessName}
              onChange={handleChange}
              error={errors.businessName}
              disabled={submitting}
            />
            <Input
              label="Phone (optional)"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              autoComplete="tel"
              disabled={submitting}
            />

            <Select
              label="Business type"
              name="businessType"
              value={form.businessType}
              onChange={handleChange}
              disabled={submitting}
            >
              {BUSINESS_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <Button type="submit" loading={submitting} disabled={submitting} className="w-full">
              {submitting ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-500">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <AuthSidePanel />
    </div>
  );
}

export default RegisterPage;
