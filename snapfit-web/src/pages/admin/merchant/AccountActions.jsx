import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Ban, KeyRound, RotateCcw, Trash2 } from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Modal from '../../../components/ui/Modal';
import { deleteMerchant, resetMerchantPassword } from '../../../services/adminApi';
import MerchantStatusDialog from '../components/MerchantStatusDialog';

const MIN_PASSWORD_LENGTH = 8;

function ResetPasswordModal({ merchant, open, onClose }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function close() {
    if (saving) return;
    setPassword('');
    setError('');
    onClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setSaving(true);
    try {
      const res = await resetMerchantPassword(merchant._id, password);
      toast.success(res.message || 'Password reset');
      setSaving(false);
      setPassword('');
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset the password');
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title={`Reset ${merchant.businessName}'s password`} className="max-w-md">
      <form onSubmit={handleSubmit}>
        <p className="mt-2 text-sm text-muted-foreground">
          Sets a new password for {merchant.email}. Share it with the merchant securely.
        </p>
        <div className="mt-4">
          <Input
            id="reset-password"
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            error={error}
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Reset password
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteMerchantModal({ merchant, open, onClose }) {
  const navigate = useNavigate();
  const [typedName, setTypedName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const canConfirm = typedName.trim() === merchant.businessName;

  function close() {
    if (deleting) return;
    setTypedName('');
    onClose();
  }

  async function handleDelete(e) {
    e.preventDefault();
    if (!canConfirm) return;
    setDeleting(true);
    try {
      await deleteMerchant(merchant._id);
      toast.success(`${merchant.businessName} was deleted`);
      navigate('/admin/merchants', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete the merchant');
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Delete this merchant?" className="max-w-md">
      <form onSubmit={handleDelete}>
        <p className="mt-2 text-sm text-muted-foreground">
          This permanently deletes <span className="font-medium text-foreground">{merchant.businessName}</span>, their API key,
          size charts, product mappings and recommendation history. This cannot be undone.
        </p>
        <div className="mt-4">
          <Input
            id="delete-confirm-name"
            label={`Type "${merchant.businessName}" to confirm`}
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={close} disabled={deleting}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={deleting} disabled={!canConfirm}>
            Delete merchant
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AccountActions({ merchant, onUpdated }) {
  const [dialog, setDialog] = useState(null); // null | 'status' | 'password' | 'delete'
  const suspended = merchant.status === 'suspended';
  const closeDialog = () => setDialog(null);

  return (
    <Card>
      <Card.Header>
        <h2 className="text-sm font-semibold text-foreground">Account</h2>
      </Card.Header>
      <Card.Body className="flex flex-col items-start gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={suspended ? <RotateCcw size={14} /> : <Ban size={14} />}
          onClick={() => setDialog('status')}
        >
          {suspended ? 'Reactivate merchant' : 'Suspend merchant'}
        </Button>
        <Button variant="secondary" size="sm" icon={<KeyRound size={14} />} onClick={() => setDialog('password')}>
          Reset password
        </Button>
        <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setDialog('delete')}>
          Delete merchant
        </Button>
      </Card.Body>

      <MerchantStatusDialog merchant={dialog === 'status' ? merchant : null} onClose={closeDialog} onUpdated={onUpdated} />
      <ResetPasswordModal merchant={merchant} open={dialog === 'password'} onClose={closeDialog} />
      <DeleteMerchantModal merchant={merchant} open={dialog === 'delete'} onClose={closeDialog} />
    </Card>
  );
}

export default AccountActions;
