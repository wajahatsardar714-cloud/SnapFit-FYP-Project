import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Copy, KeyRound } from 'lucide-react';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Alert from '../../../components/ui/Alert';
import Modal from '../../../components/ui/Modal';
import ConfirmModal from '../../../components/ui/ConfirmModal';
import { regenerateApiKey, revokeApiKey } from '../../../services/adminApi';

function NewKeyModal({ apiKey, onClose }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
    } catch {
      toast.error("Couldn't copy — select the key and copy it manually");
    }
  }

  return (
    <Modal open={Boolean(apiKey)} onClose={onClose} title="New API key" className="max-w-lg">
      <Alert
        className="mt-3"
        variant="warning"
        description="Copy it now and share it securely — it won't be shown again."
      />
      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <Input id="new-api-key" label="API key" value={apiKey || ''} readOnly className="font-mono" />
        </div>
        <Button variant="secondary" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}

// The merchant's live key: only a preview is ever readable. Regenerating
// shows the new key once; the old one stops working straight away.
function ApiKeyCard({ merchant, apiKeyPreview, onRegenerated, onRevoked }) {
  const [confirming, setConfirming] = useState(null); // null | 'regenerate' | 'revoke'
  const [working, setWorking] = useState(false);
  const [newKey, setNewKey] = useState(null);

  async function handleConfirm() {
    setWorking(true);
    try {
      if (confirming === 'regenerate') {
        const res = await regenerateApiKey(merchant._id);
        setNewKey(res.apiKey);
        onRegenerated();
      } else {
        const res = await revokeApiKey(merchant._id);
        onRevoked(res.merchant);
        toast.success('API key revoked');
      }
      setConfirming(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update the API key');
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card>
      <Card.Header>
        <h2 className="text-sm font-semibold text-foreground">API key</h2>
      </Card.Header>
      <Card.Body>
        <div className="flex items-center gap-3">
          <KeyRound size={18} className="text-muted-foreground" aria-hidden="true" />
          {merchant.hasApiKey ? (
            <code className="rounded bg-surface-2 px-2 py-1 font-mono text-sm text-foreground">{apiKeyPreview || 'Active key'}</code>
          ) : (
            <span className="text-sm text-muted-foreground">No API key</span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setConfirming('regenerate')}>
            {merchant.hasApiKey ? 'Regenerate key' : 'Generate key'}
          </Button>
          {merchant.hasApiKey && (
            <Button variant="ghost" size="sm" className="!text-danger hover:!bg-danger-soft" onClick={() => setConfirming('revoke')}>
              Revoke key
            </Button>
          )}
        </div>
      </Card.Body>

      <ConfirmModal
        open={Boolean(confirming)}
        title={confirming === 'revoke' ? 'Revoke this API key?' : 'Generate a new API key?'}
        description={
          confirming === 'revoke'
            ? "The merchant's widget and integrations stop working until a new key is generated."
            : merchant.hasApiKey
              ? 'The current key stops working immediately; the merchant must update their integration.'
              : 'The new key is shown once so you can pass it on.'
        }
        confirmLabel={confirming === 'revoke' ? 'Revoke key' : 'Generate key'}
        tone={confirming === 'revoke' || merchant.hasApiKey ? 'danger' : 'default'}
        loading={working}
        onConfirm={handleConfirm}
        onClose={() => !working && setConfirming(null)}
      />
      <NewKeyModal apiKey={newKey} onClose={() => setNewKey(null)} />
    </Card>
  );
}

export default ApiKeyCard;
