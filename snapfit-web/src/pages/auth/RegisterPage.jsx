import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { register as content } from '../../content/auth';
import { PLANS, formatPlanName, isPlanId } from '../../utils/plans';
import AuthShell from './AuthShell';
import PasswordInput from './PasswordInput';
import RegisterFieldHelp from './RegisterFieldHelp';

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

// A pricing link may preselect a plan with ?plan=; after sign-up a merchant who
// chose a plan lands on plan selection with it ('' is "Choose later").
function afterRegisterPath(plan) {
  return plan ? `/dashboard/subscription/plans?plan=${plan}` : '/dashboard';
}

function initialForm(planParam) {
  return {
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    phone: '',
    businessType: '',
    plan: isPlanId(planParam) ? planParam : '',
  };
}

function validate(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Name is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email';
  if (form.password.length < 8) errors.password = 'Password must be at least 8 characters';
  if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match';
  if (!form.businessName.trim()) errors.businessName = 'Store name is required';
  return errors;
}

function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(() => initialForm(searchParams.get('plan')?.toLowerCase()));
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
      // The plan is chosen on plan selection after sign-up, not sent with it.
      const { confirmPassword, plan, ...payload } = form;
      if (!payload.phone) delete payload.phone;
      if (!payload.businessType) delete payload.businessType;
      await register(payload);
      // Existing backend has no email-verification gate (isVerified is just a
      // static flag, never checked before allowing dashboard access) -- so the
      // existing "register -> already authenticated -> go straight to the
      // dashboard" behavior is the correct, real success path, not a stand-in
      // for a verification flow that doesn't exist.
      navigate(afterRegisterPath(plan));
    } catch (err) {
      setFormError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell content={content} aside={<RegisterFieldHelp {...content.fieldHelp} />}>
      {formError && (
        <div className="mb-6">
          <Alert variant="danger" title={formError} />
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
          label="Business email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          error={errors.email}
          autoComplete="email"
          disabled={submitting}
        />
        <Input
          label="Store name"
          name="businessName"
          value={form.businessName}
          onChange={handleChange}
          error={errors.businessName}
          autoComplete="organization"
          disabled={submitting}
        />

        <div>
          <PasswordInput
            label="Password"
            name="password"
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
                <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${met ? 'text-success' : 'text-muted-foreground'}`}>
                  <Check size={12} className={met ? 'text-success' : 'text-muted'} />
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

        <Select label="Subscription plan" name="plan" value={form.plan} onChange={handleChange} disabled={submitting}>
          <option value="">Choose later</option>
          {PLANS.map((plan) => (
            <option key={plan} value={plan}>
              {formatPlanName(plan)}
            </option>
          ))}
        </Select>

        <Button type="submit" size="lg" loading={submitting} disabled={submitting} className="w-full">
          {submitting ? 'Creating account...' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}

export default RegisterPage;
