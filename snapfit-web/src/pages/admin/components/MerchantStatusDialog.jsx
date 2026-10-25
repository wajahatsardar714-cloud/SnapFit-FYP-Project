import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import Textarea from '../../../components/ui/Textarea';
import { setMerchantStatus } from '../../../services/adminApi';

// Suspends an active merchant (with an optional reason shown to admins) or
// reactivates a suspended one. `merchant` null keeps the dialog closed.
function MerchantStatusDialog({ merchant, onClose, onUpdated }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const suspending = merchant?.status !== 'suspended';

  useEffect(() => {
    setReason('');
  }, [merchant?._id]);

  function close() {
    if (!saving) onClose();
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = suspending ? { status: 'suspended', reason: reason.trim() || undefined } : { status: 'active' };
      const res = await setMerchantStatus(merchant._id, body);
      toast.success(suspending ? `${merchant.businessName} suspended` : `${merchant.businessName} reactivated`);
      onUpdated(res.merchant);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update the account status');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(merchant)}
      onClose={close}
      title={suspending ? `Suspend ${merchant?.businessName}?` : `Reactivate ${merchant?.businessName}?`}
      className="max-w-md"
    >
      <form onSubmit={handleConfirm}>
        <p className="mt-2 text-sm text-muted-foreground">
          {suspending
            ? 'The merchant is signed out, cannot log in, and their API key stops working until the account is reactivated.'
            : 'The merchant can log in again and their API key starts working again.'}
        </p>
        {suspending && (
          <div className="mt-4">
            <Textarea
              id="suspend-reason"
              label="Reason (optional)"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Payment overdue"
            />
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant={suspending ? 'danger' : 'primary'} loading={saving}>
            {suspending ? 'Suspend merchant' : 'Reactivate merchant'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default MerchantStatusDialog;
