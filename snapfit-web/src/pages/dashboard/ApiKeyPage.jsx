import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import ConfirmModal from '../../components/ConfirmModal';

const API_BASE = import.meta.env.VITE_API_URL || 'https://your-api-domain.com/api';
const PLACEHOLDER_KEY = 'sk_live_a1b2c3d4...x9y0';

function CodeBlock({ children }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
      <code>{children}</code>
    </pre>
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
      <h1 className="text-xl font-bold text-gray-900">API Key</h1>
      <p className="mt-1 text-sm text-gray-500">Use this key to authenticate requests to the SnapFit API.</p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="animate-spin text-gray-400" size={24} />
          </div>
        ) : !apiKey ? (
          <div className="flex flex-col items-center py-6 text-center">
            <KeyRound className="text-gray-300" size={32} />
            <p className="mt-3 text-sm text-gray-500">You haven&apos;t generated an API key yet.</p>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={working}
              className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {working ? 'Generating...' : 'Generate API Key'}
            </button>
          </div>
        ) : (
          <div>
            {isFullKey && (
              <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Copy this key now — you won&apos;t be able to see the full key again.
              </p>
            )}
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-800">
                {apiKey}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(apiKey)}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Copy size={14} />
                Copy
              </button>
            </div>

            <button
              type="button"
              onClick={() => setRegenerateOpen(true)}
              disabled={working}
              className="mt-4 flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={14} />
              Regenerate key
            </button>
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-gray-900">Quick start</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pass your key in the <code className="rounded bg-gray-100 px-1 py-0.5">x-api-key</code> header. (The
          recommendations endpoint below is illustrative — it ships in a later phase.)
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">cURL</p>
            <CodeBlock>{`curl -X POST ${API_BASE}/recommendations \\
  -H "x-api-key: ${displayKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"productId": "12345", "measurements": {"chest": 96}}'`}</CodeBlock>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">JavaScript (fetch)</p>
            <CodeBlock>{`fetch('${API_BASE}/recommendations', {
  method: 'POST',
  headers: {
    'x-api-key': '${displayKey}',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ productId: '12345', measurements: { chest: 96 } }),
});`}</CodeBlock>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Python (requests)</p>
            <CodeBlock>{`import requests

response = requests.post(
    "${API_BASE}/recommendations",
    headers={"x-api-key": "${displayKey}"},
    json={"productId": "12345", "measurements": {"chest": 96}},
)`}</CodeBlock>
          </div>
        </div>

        <button
          type="button"
          onClick={() => toast('Full documentation is coming soon.')}
          className="mt-4 text-sm font-medium text-gray-600 underline hover:text-gray-900"
        >
          View full documentation
        </button>
      </div>

      <ConfirmModal
        open={regenerateOpen}
        title="Regenerate API key?"
        description="This will invalidate your current key. Any integrations using it will stop working until you update them."
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
