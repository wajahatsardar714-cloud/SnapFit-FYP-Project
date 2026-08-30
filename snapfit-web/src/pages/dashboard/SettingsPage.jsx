import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, KeyRound, User } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Modal from '../../components/ui/Modal';

const BUSINESS_TYPE_OPTIONS = ['clothing', 'footwear', 'accessories'];

const TABS = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'security', label: 'Security', icon: KeyRound },
  { key: 'danger', label: 'Danger Zone', icon: AlertTriangle },
];

function ProfileTab() {
  const { merchant, updateMerchant } = useAuth();
  const [form, setForm] = useState({
    name: merchant.name || '',
    businessName: merchant.businessName || '',
    phone: merchant.phone || '',
    businessType: merchant.businessType || '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Name is required';
    if (!form.businessName.trim()) nextErrors.businessName = 'Business name is required';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const res = await api.put('/merchant/profile', form);
      updateMerchant(res.data.merchant);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Card.Header>
        <h2 className="text-sm font-semibold text-ink-900">Profile</h2>
      </Card.Header>
      <Card.Body>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Email" value={merchant.email} readOnly />
          <div />
          <Input
            id="profile-name"
            name="name"
            label="Your Name"
            value={form.name}
            onChange={handleChange}
            error={errors.name}
          />
          <Input
            id="profile-businessName"
            name="businessName"
            label="Business Name"
            value={form.businessName}
            onChange={handleChange}
            error={errors.businessName}
          />
          <Input id="profile-phone" name="phone" label="Phone (optional)" value={form.phone} onChange={handleChange} />
          <Select
            id="profile-businessType"
            name="businessType"
            label="Business Type"
            value={form.businessType}
            onChange={handleChange}
          >
            <option value="">Not specified</option>
            {BUSINESS_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </option>
            ))}
          </Select>
          <div className="flex items-end justify-end sm:col-span-2">
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </form>
      </Card.Body>
    </Card>
  );
}

function SecurityTab() {
  const initialForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }

  function validate() {
    const nextErrors = {};
    if (!form.currentPassword) nextErrors.currentPassword = 'Current password is required';
    if (form.newPassword.length < 8) nextErrors.newPassword = 'New password must be at least 8 characters';
    if (form.confirmPassword !== form.newPassword) nextErrors.confirmPassword = 'Passwords do not match';
    return nextErrors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setFormError('Please fix the highlighted errors below.');
      return;
    }

    setErrors({});
    setFormError('');
    setSaving(true);
    try {
      await api.put('/merchant/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      toast.success('Password updated');
      setForm(initialForm);
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to change password';
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Card.Header>
        <h2 className="text-sm font-semibold text-ink-900">Security</h2>
      </Card.Header>
      <Card.Body>
        {formError && <Alert variant="danger" description={formError} className="mb-4" />}
        <form onSubmit={handleSubmit} className="grid max-w-sm grid-cols-1 gap-4">
          <Input
            id="security-currentPassword"
            name="currentPassword"
            type="password"
            label="Current Password"
            value={form.currentPassword}
            onChange={handleChange}
            error={errors.currentPassword}
          />
          <Input
            id="security-newPassword"
            name="newPassword"
            type="password"
            label="New Password"
            value={form.newPassword}
            onChange={handleChange}
            error={errors.newPassword}
          />
          <Input
            id="security-confirmPassword"
            name="confirmPassword"
            type="password"
            label="Confirm New Password"
            value={form.confirmPassword}
            onChange={handleChange}
            error={errors.confirmPassword}
          />
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              Update Password
            </Button>
          </div>
        </form>
      </Card.Body>
    </Card>
  );
}

function DangerZoneTab() {
  const { merchant, logout } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canConfirm = typedName.trim() === merchant.businessName;

  function closeModal() {
    if (deleting) return;
    setModalOpen(false);
    setTypedName('');
  }

  async function handleDelete() {
    if (!canConfirm) return;
    setDeleting(true);
    try {
      await api.delete('/merchant/account', { data: { businessName: typedName.trim() } });
      toast.success('Your account has been deleted');
      logout();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete account');
      setDeleting(false);
    }
  }

  return (
    <>
      <Card className="!border-danger-border">
        <Card.Header>
          <h2 className="text-sm font-semibold text-danger-text">Danger Zone</h2>
        </Card.Header>
        <Card.Body>
          <p className="text-sm text-ink-700">
            Permanently delete your SnapFit account, API key, size charts, product mappings, and recommendation
            history. This action cannot be undone.
          </p>
          <Button variant="danger" className="mt-4" onClick={() => setModalOpen(true)}>
            Delete Account
          </Button>
        </Card.Body>
      </Card>

      <Modal open={modalOpen} onClose={closeModal} title="Delete your account?">
        <p className="mt-2 text-sm text-ink-500">
          This will permanently delete <span className="font-medium text-ink-700">{merchant.businessName}</span>
          &apos;s account, including all size charts, product mappings, and recommendation history. This cannot be
          undone.
        </p>
        <div className="mt-4">
          <Input
            label={`Type "${merchant.businessName}" to confirm`}
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={closeModal} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" loading={deleting} disabled={!canConfirm} onClick={handleDelete}>
            Yes, delete my account
          </Button>
        </div>
      </Modal>
    </>
  );
}

function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div>
      <h1 className="text-xl font-semibold text-ink-900">Settings</h1>
      <p className="mt-1 text-sm text-ink-500">Manage your profile, security, and account.</p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-4">
        <Card className="h-fit lg:col-span-1">
          <nav className="space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150 ${
                  activeTab === tab.key ? 'bg-primary-50 font-medium text-primary-700' : 'text-ink-700 hover:bg-gray-50'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </nav>
        </Card>

        <div className="lg:col-span-3">
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'security' && <SecurityTab />}
          {activeTab === 'danger' && <DangerZoneTab />}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
