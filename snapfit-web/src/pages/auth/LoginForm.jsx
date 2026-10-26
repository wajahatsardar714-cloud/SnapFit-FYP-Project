import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homePathFor } from '../../utils/roles';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { RichText } from '../../components/public/RichText';
import PasswordInput from './PasswordInput';

const PASSWORD_HELP_ID = 'password-help';

/**
 * The login form: business email, password with show/hide, remember me and a
 * forgot-password note. Sends the account to its home (dashboard or admin).
 *   passwordHelp  RichText shown by "Forgot password?" (see content/auth.js)
 */
function LoginForm({ passwordHelp }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', remember: true });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [showPasswordHelp, setShowPasswordHelp] = useState(false);

  function handleChange(e) {
    const { name, type, value, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const account = await login(form.email, form.password, { remember: form.remember });
      navigate(homePathFor(account));
    } catch (err) {
      setFormError(err.response?.data?.message || 'Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {formError && (
        <div className="mb-6">
          <Alert variant="danger" title={formError} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Business email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={handleChange}
          disabled={submitting}
        />
        <PasswordInput
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={handleChange}
          disabled={submitting}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="remember"
              checked={form.remember}
              onChange={handleChange}
              disabled={submitting}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Remember me
          </label>
          <button
            type="button"
            aria-expanded={showPasswordHelp}
            aria-controls={PASSWORD_HELP_ID}
            onClick={() => setShowPasswordHelp((prev) => !prev)}
            className="rounded text-sm font-semibold text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Forgot password?
          </button>
        </div>

        <p
          id={PASSWORD_HELP_ID}
          hidden={!showPasswordHelp}
          className="break-words rounded-lg border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-body"
        >
          <RichText text={passwordHelp} />
        </p>

        <Button type="submit" size="lg" loading={submitting} disabled={submitting} className="w-full">
          {submitting ? 'Logging in...' : 'Log In'}
        </Button>
      </form>
    </>
  );
}

export default LoginForm;
