import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, Copy, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Alert from '../../components/ui/Alert';
import ConfirmModal from '../../components/ui/ConfirmModal';

const API_BASE = import.meta.env.VITE_API_URL || 'https://your-api-domain.com/api';
const PLACEHOLDER_KEY = 'sk_live_a1b2c3d4...x9y0';

function CodeBlock({ children, copyText }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(copyText ?? children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-ink-900 p-4 text-sm leading-relaxed text-gray-100">
        <code className="font-mono">{children}</code>
      </pre>
      <Button
        variant="ghost"
        size="sm"
        icon={copied ? <Check size={13} /> : <Copy size={13} />}
        onClick={handleCopy}
        className="absolute right-2 top-2 !bg-white/10 !text-gray-100 hover:!bg-white/20"
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function ApiKeyPage() {
  const [apiKey, setApiKey] = useState(null);
  const [isFullKey, setIsFullKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return api
      .get('/merchant/api-key')
      .then((res) => {
        setApiKey(res.data.apiKey);
        setIsFullKey(false);
      })
      .catch((err) => {
        if (err.response?.status === 404) {
          setApiKey(null);
        } else {
          toast.error('Failed to load API key');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function copyToClipboard(text) {
    await navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }

  async function handleGenerate() {
    setWorking(true);
    try {
      const res = await api.post('/merchant/api-key/generate');
      setApiKey(res.data.apiKey);
      setIsFullKey(true);
      toast.success('API key generated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate API key');
    } finally {
      setWorking(false);
    }
  }

  async function handleRegenerate() {
    setWorking(true);
    try {
      const res = await api.post('/merchant/api-key/regenerate');
      setApiKey(res.data.apiKey);
      setIsFullKey(true);
      setRegenerateOpen(false);
      toast.success('API key regenerated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to regenerate API key');
    } finally {
      setWorking(false);
    }
  }

  const displayKey = apiKey ?? PLACEHOLDER_KEY;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-ink-900">API Key</h1>
      <p className="mt-1 text-sm text-ink-500">Use this key to authenticate requests to the SnapFit API.</p>

      <Card className="mt-6">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="animate-spin text-ink-300" size={24} />
          </div>
        ) : !apiKey ? (
          <div className="flex flex-col items-center py-6 text-center">
            <KeyRound className="text-ink-300" size={32} />
            <p className="mt-3 text-sm text-ink-500">You haven&apos;t generated an API key yet.</p>
            <Button className="mt-4" loading={working} onClick={handleGenerate}>
              Generate API Key
            </Button>
          </div>
        ) : (
          <div>
            {isFullKey && (
              <Alert
                variant="warning"
                description="Copy this key now — you won't be able to see the full key again."
                className="mb-3"
              />
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input label="Live API Key" value={apiKey} readOnly className="font-mono" />
              </div>
              <Button
                variant="ghost"
                icon={<Copy size={16} />}
                onClick={() => copyToClipboard(apiKey)}
                aria-label="Copy API key"
              />
            </div>

            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => setRegenerateOpen(true)}
              disabled={working}
              className="mt-4"
            >
              Regenerate key
            </Button>
          </div>
        )}
      </Card>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-ink-900">Quick start</h2>
        <p className="mt-1 text-sm text-ink-500">
          Pass your key in the <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-ink-700">x-api-key</code>{' '}
          header when calling{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-ink-700">POST {API_BASE}/recommend</code>.
        </p>

        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">cURL</p>
          <CodeBlock>{`curl -X POST ${API_BASE}/recommend \\
  -H "x-api-key: ${displayKey}" \\
  -F "image=@photo.jpg" \\
  -F "productId=12345"`}</CodeBlock>
        </div>

        <Link to="/dashboard/docs" className="mt-4 inline-block text-sm font-medium text-primary underline">
          View full documentation, code examples, and a live tester
        </Link>
      </div>

      <ConfirmModal
        open={regenerateOpen}
        title="Regenerate API key?"
        description="Regenerating creates a brand new key and immediately invalidates your current one. Any integrations using the old key will stop working until you update them."
        confirmLabel="Yes, regenerate"
        tone="danger"
        loading={working}
        onConfirm={handleRegenerate}
        onClose={() => !working && setRegenerateOpen(false)}
      />
    </div>
  );
}

export default ApiKeyPage;
