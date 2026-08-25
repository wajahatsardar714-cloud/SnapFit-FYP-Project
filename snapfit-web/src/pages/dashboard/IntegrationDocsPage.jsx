import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, Eye, EyeOff, Info, Loader2, UploadCloud } from 'lucide-react';
import api from '../../services/api';
import Badge from '../../components/Badge';

const API_BASE = import.meta.env.VITE_API_URL || 'https://your-api-domain.com/api';

const SECTIONS = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'endpoints', label: 'Endpoints' },
  { id: 'code-examples', label: 'Code Examples' },
  { id: 'widget-integration', label: 'Widget Integration' },
  { id: 'error-codes', label: 'Error Codes' },
  { id: 'rate-limits', label: 'Rate Limits' },
  { id: 'try-it-out', label: 'Try It Out' },
];

// ---------------------------------------------------------------------------
// Lightweight syntax highlighting — no external dependency, just tagged spans.
// ---------------------------------------------------------------------------

const TOKEN_RULES = {
  javascript: [
    ['comment', /\/\/.*/],
    ['string', /`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/],
    ['keyword', /\b(const|let|var|async|await|function|return|if|else|import|from|export|default|new|try|catch|throw)\b/],
    ['number', /\b\d+(?:\.\d+)?\b/],
  ],
  python: [
    ['comment', /#.*/],
    ['string', /"""[\s\S]*?"""|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/],
    ['keyword', /\b(import|from|def|return|if|else|elif|try|except|with|as|open|None|True|False|async|await)\b/],
    ['number', /\b\d+(?:\.\d+)?\b/],
  ],
  bash: [
    ['comment', /#.*/],
    ['string', /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/],
    ['flag', /\s-{1,2}[A-Za-z][A-Za-z-]*/],
    ['keyword', /\bcurl\b/],
  ],
  json: [
    ['key', /"[^"\\]*"(?=\s*:)/],
    ['string', /"(?:[^"\\]|\\.)*"/],
    ['keyword', /\b(true|false|null)\b/],
    ['number', /-?\b\d+(?:\.\d+)?\b/],
  ],
};

const TOKEN_CLASS = {
  comment: 'text-gray-500 italic',
  string: 'text-emerald-400',
  keyword: 'text-sky-400',
  number: 'text-orange-400',
  flag: 'text-purple-400',
  key: 'text-sky-300',
};

function highlight(code, lang) {
  const rules = TOKEN_RULES[lang];
  if (!rules) return [{ text: code, cls: '' }];

  const combined = new RegExp(rules.map(([name, re]) => `(?<${name}>${re.source})`).join('|'), 'gm');
  const tokens = [];
  let lastIndex = 0;

  for (const match of code.matchAll(combined)) {
    if (match.index > lastIndex) {
      tokens.push({ text: code.slice(lastIndex, match.index), cls: '' });
    }
    const name = Object.keys(match.groups).find((key) => match.groups[key] !== undefined);
    tokens.push({ text: match[0], cls: TOKEN_CLASS[name] || '' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < code.length) {
    tokens.push({ text: code.slice(lastIndex), cls: '' });
  }
  return tokens;
}

function CodeBlock({ code, lang = 'text', label }) {
  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    toast.success('Copied to clipboard');
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label || lang}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-gray-200"
        >
          <Copy size={12} />
          Copy
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-xs leading-relaxed">
        <code>
          {highlight(code, lang).map((t, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <span key={i} className={t.cls}>
              {t.text}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared doc building blocks
// ---------------------------------------------------------------------------

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      <div className="mt-3 space-y-4 text-sm leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}

function EndpointHeader({ method, path }) {
  return (
    <div className="flex items-center gap-2">
      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-700">
        {method}
      </span>
      <code className="text-sm font-semibold text-gray-900">{path}</code>
    </div>
  );
}

function ParamsTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
            <th className="px-4 py-2 font-medium">Field</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.field} className="border-b border-gray-50 align-top last:border-0">
              <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-gray-800">
                {r.field}
                {r.required && <span className="ml-1 text-red-500">*</span>}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-gray-500">{r.type}</td>
              <td className="px-4 py-2 text-gray-600">{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function statusTone(status) {
  if (status < 300) return 'green';
  if (status < 500) return 'amber';
  return 'red';
}

function ErrorTable({ caption, rows }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {caption}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Message</th>
              <th className="px-4 py-2 font-medium">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.internalCode || r.code} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-2">
                  <Badge color={statusTone(r.status)}>{r.status}</Badge>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-800">
                  {r.code}
                  {r.internalCode && (
                    <div className="mt-0.5 font-sans text-[10px] normal-case tracking-normal text-gray-400">
                      internal code: {r.internalCode}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-600">{r.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Callout({ children }) {
  return (
    <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <Info size={16} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error code data (sourced directly from the backend + AI service source)
// ---------------------------------------------------------------------------

const AUTH_ERRORS = [
  { code: 'No API key provided', status: 401, meaning: 'The x-api-key header is missing from the request.' },
  { code: 'Invalid API key', status: 401, meaning: 'No merchant matches this key.' },
  { code: 'Subscription is not active', status: 403, meaning: 'No plan has been selected, or it was cancelled.' },
  { code: 'Subscription has expired', status: 403, meaning: "The plan's billing period has ended." },
  {
    code: 'Monthly request limit reached',
    status: 403,
    meaning: "The plan's request quota is used up — upgrade to continue.",
  },
];

const RECOMMEND_VALIDATION_ERRORS = [
  { code: 'An image file is required', status: 400, meaning: 'The multipart body is missing the image field.' },
  { code: 'productId is required', status: 400, meaning: 'The productId field was empty or missing.' },
  { code: 'userHeight must be a positive number', status: 400, meaning: 'userHeight was provided but is not a positive number.' },
  {
    code: 'Only image files are allowed',
    status: 400,
    meaning: 'The uploaded file is not an image — rejected by content type before reaching the AI service.',
  },
  {
    code: 'File too large',
    status: 400,
    meaning: 'The image exceeds the 10MB upload limit — rejected before reaching the AI service.',
  },
  {
    code: 'No size chart is mapped to product "…"',
    status: 404,
    meaning: 'This productId has no size chart mapped yet — map it from Product Mapping first.',
  },
];

const PHOTO_VALIDATION_ERRORS = [
  {
    code: 'This file could not be read as an image. Please upload a JPG or PNG photo.',
    internalCode: 'INVALID_IMAGE',
    status: 400,
    meaning: "The file isn't decodable as an image.",
  },
  {
    code: 'This image resolution is too low. Please upload a higher-resolution photo.',
    internalCode: 'RESOLUTION_TOO_LOW',
    status: 400,
    meaning: 'The image is smaller than 200×200 pixels.',
  },
  {
    code: 'We could not detect a person in this photo. Please upload a clear, full-body photo.',
    internalCode: 'NO_BODY_DETECTED',
    status: 422,
    meaning: 'No person could be detected in the photo.',
  },
];

const AI_SERVICE_GENERIC_MESSAGE =
  'We could not process your photo right now. Please try again with a clear, front-facing full-body photo.';

const AI_SERVICE_FAILURE_CAUSES = [
  { status: 500, cause: 'AI_SERVICE_NOT_CONFIGURED', meaning: "The AI service URL isn't configured on the server." },
  { status: 502, cause: 'AI_SERVICE_UNREACHABLE', meaning: 'The AI service could not be reached — safe to retry.' },
  { status: 504, cause: 'AI_SERVICE_TIMEOUT', meaning: 'The AI service took longer than 30s to respond — safe to retry.' },
  { status: 422, cause: 'EMPTY_SIZE_CHART', meaning: 'The mapped size chart has no sizes defined yet.' },
  {
    status: 422,
    cause: 'NO_COMPARABLE_MEASUREMENTS',
    meaning: "None of the photo's estimated measurements overlap the size chart's fields.",
  },
  {
    status: 400,
    cause: 'INVALID_SIZE_CHART_JSON',
    meaning: "The size chart couldn't be parsed — an integration bug on our side, not the shopper's photo.",
  },
];

const FEEDBACK_VALIDATION_ERRORS = [
  { code: 'A valid recommendationId is required', status: 400, meaning: 'recommendationId is missing or not a valid id.' },
  {
    code: 'fitResult must be one of: too_small, slightly_small, perfect, slightly_large, too_large',
    status: 400,
    meaning: 'fitResult was missing or not one of the five accepted values.',
  },
  { code: 'Recommendation not found', status: 404, meaning: "The recommendationId doesn't belong to this merchant." },
];

// ---------------------------------------------------------------------------
// "Try it out" — makes a real call against this account's live API
// ---------------------------------------------------------------------------

function TryItOut() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [productId, setProductId] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState(null);

  const canSend = Boolean(apiKey && productId && file) && !sending;

  async function handleSend() {
    setSending(true);
    setResponse(null);

    const formData = new FormData();
    formData.append('image', file);
    formData.append('productId', productId);

    try {
      const res = await fetch(`${API_BASE.replace(/\/$/, '')}/recommend`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: formData,
      });
      const body = await res.json().catch(() => ({ message: 'Response was not valid JSON' }));
      setResponse({ status: res.status, ok: res.ok, body });
    } catch {
      setResponse({ status: 0, ok: false, body: { message: 'Request failed — is the API reachable?' } });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div>
          <label htmlFor="tryitout-key" className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            API Key
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="tryitout-key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk_live_..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="shrink-0 rounded-md border border-gray-300 p-2 text-gray-500 hover:bg-gray-50"
              aria-label={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            From your{' '}
            <Link to="/dashboard/api-key" className="underline">
              API Key page
            </Link>
            . Never shared outside your browser — this calls the API directly.
          </p>
        </div>

        <div>
          <label htmlFor="tryitout-product" className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Product ID
          </label>
          <input
            id="tryitout-product"
            type="text"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder="e.g. SKU-1029"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
          <p className="mt-1 text-xs text-gray-400">
            Must already be{' '}
            <Link to="/dashboard/product-mapping" className="underline">
              mapped to a size chart
            </Link>
            .
          </p>
        </div>

        <div>
          <label htmlFor="tryitout-image" className="block text-xs font-medium uppercase tracking-wide text-gray-500">
            Photo
          </label>
          <label
            htmlFor="tryitout-image"
            className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-50"
          >
            <UploadCloud size={16} className="shrink-0 text-gray-400" />
            {file ? file.name : 'Choose a full-body JPG or PNG'}
          </label>
          <input
            id="tryitout-image"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending && <Loader2 size={14} className="animate-spin" />}
          {sending ? 'Sending...' : 'Send Test Request'}
        </button>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
          Response {response && <span className={response.ok ? 'text-green-600' : 'text-red-600'}>({response.status})</span>}
        </p>
        {response ? (
          <CodeBlock code={JSON.stringify(response.body, null, 2)} lang="json" label={`${response.status} response`} />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-400">
            Send a request to see the response here
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function formatPrice(plan) {
  if (plan.price === 0) return 'Free';
  if (plan.price == null) return 'Custom';
  return `$${plan.price}/mo`;
}

function formatRequests(limit) {
  return limit == null ? 'Unlimited' : limit.toLocaleString();
}

function formatCharts(limit) {
  return limit == null ? 'Unlimited' : limit;
}

function IntegrationDocsPage() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const [plans, setPlans] = useState([]);

  useEffect(() => {
    api
      .get('/subscription/plans')
      .then((res) => setPlans(res.data.plans))
      .catch(() => toast.error('Failed to load plan limits'));
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
    );

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const jsExample = `async function checkSize(apiKey, productId, imageFile) {
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('productId', productId);
  // formData.append('userHeight', '178'); // optional, improves accuracy

  const res = await fetch('${API_BASE}/recommend', {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message);
  }
  return data.recommendation; // { size, confidence, bodyType, notes, fitScores }
}`;

  const pythonExample = `import requests

API_KEY = "sk_live_..."

with open("photo.jpg", "rb") as image_file:
    response = requests.post(
        "${API_BASE}/recommend",
        headers={"x-api-key": API_KEY},
        files={"image": image_file},
        data={"productId": "SKU-1029", "userHeight": "178"},
    )

result = response.json()
if response.ok and result["success"]:
    print(result["recommendation"]["size"])
else:
    print("Error:", result["message"])`;

  const curlExample = `curl -X POST ${API_BASE}/recommend \\
  -H "x-api-key: sk_live_..." \\
  -F "image=@photo.jpg" \\
  -F "productId=SKU-1029" \\
  -F "userHeight=178"`;

  const widgetExample = `import SnapFitWidget from './SnapFitWidget';

<SnapFitWidget
  apiKey="sk_live_..."
  productId="SKU-1029"
  apiUrl="${API_BASE}"
  buttonLabel="Check My Size"
/>`;

  const recommendSuccessExample = `{
  "success": true,
  "recommendation": {
    "size": "M",
    "confidence": 0.82,
    "bodyType": "average",
    "notes": "M is a close fit. L is also within range.",
    "fitScores": { "S": 0.41, "M": 0.82, "L": 0.35 }
  }
}`;

  const recommendErrorExample = `{
  "success": false,
  "message": "We could not detect a person in this photo. Please upload a clear, full-body photo."
}`;

  const feedbackRequestExample = `{
  "recommendationId": "66f1a2b3c4d5e6f7a8b9c0d1",
  "fitResult": "perfect",
  "comment": "True to size, fits great."
}`;

  const feedbackResponseExample = `{
  "success": true,
  "feedback": {
    "_id": "66f1a2b3c4d5e6f7a8b9c0d2",
    "recommendationId": "66f1a2b3c4d5e6f7a8b9c0d1",
    "merchantId": "66f0...",
    "fitResult": "perfect",
    "comment": "True to size, fits great.",
    "createdAt": "2026-08-25T18:00:00.000Z"
  }
}`;

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Integration Docs</h1>
      <p className="mt-1 text-sm text-gray-500">Everything you need to call the SnapFit API from your storefront.</p>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-6 space-y-1 text-sm">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`block rounded-md px-3 py-1.5 transition ${
                  activeId === s.id ? 'bg-gray-900 font-medium text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-12">
          <Section id="getting-started" title="Getting Started">
            <p>
              SnapFit has three moving parts: your storefront calls the SnapFit API, which forwards the shopper&apos;s
              photo to our computer-vision service and returns a recommended size for one of your mapped products.
            </p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                <Link to="/dashboard/size-charts/new" className="font-medium text-gray-900 underline">
                  Create a size chart
                </Link>{' '}
                with the measurement ranges for each size you sell.
              </li>
              <li>
                <Link to="/dashboard/product-mapping" className="font-medium text-gray-900 underline">
                  Map a product
                </Link>{' '}
                (your own product ID) to that size chart.
              </li>
              <li>
                <Link to="/dashboard/api-key" className="font-medium text-gray-900 underline">
                  Generate an API key
                </Link>{' '}
                to authenticate requests.
              </li>
              <li>
                Call <code className="rounded bg-gray-100 px-1 py-0.5">POST /api/recommend</code> from your storefront —
                either with the <a href="#widget-integration" className="font-medium text-gray-900 underline">
                  embeddable widget
                </a>{' '}
                or your own code (see <a href="#code-examples" className="font-medium text-gray-900 underline">
                  Code Examples
                </a>
                ).
              </li>
              <li>
                Optionally, submit <code className="rounded bg-gray-100 px-1 py-0.5">POST /api/feedback</code> to
                track fit accuracy over time.
              </li>
            </ol>
          </Section>

          <Section id="authentication" title="Authentication">
            <p>
              Customer-facing endpoints (<code className="rounded bg-gray-100 px-1 py-0.5">/api/recommend</code> and{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">/api/feedback</code>) are authenticated with a single
              API key sent in the <code className="rounded bg-gray-100 px-1 py-0.5">x-api-key</code> header. This is
              separate from the session token your dashboard login uses.
            </p>
            <CodeBlock code={`x-api-key: sk_live_a1b2c3d4e5f6...`} lang="bash" label="Header" />
            <Callout>
              Because this key is called directly from the shopper&apos;s browser (for example, by the embeddable
              widget), treat it as a storefront-scoped key rather than a secret — SnapFit doesn&apos;t yet support a
              separate publishable/secret key pair. Every accepted call counts against your plan&apos;s request limit.
            </Callout>
            <p>
              Get your key from the{' '}
              <Link to="/dashboard/api-key" className="font-medium text-gray-900 underline">
                API Key page
              </Link>
              . A missing or invalid key returns <code className="rounded bg-gray-100 px-1 py-0.5">401</code>; an
              inactive or expired plan returns <code className="rounded bg-gray-100 px-1 py-0.5">403</code> — see{' '}
              <a href="#error-codes" className="font-medium text-gray-900 underline">
                Error Codes
              </a>
              .
            </p>
          </Section>

          <Section id="endpoints" title="Endpoints">
            <div className="space-y-8">
              <div className="space-y-3">
                <EndpointHeader method="POST" path="/api/recommend" />
                <p>Analyzes a shopper&apos;s photo against a product&apos;s size chart and returns a recommended size.</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Request body (multipart/form-data)</p>
                <ParamsTable
                  rows={[
                    { field: 'image', type: 'file', required: true, description: 'JPG or PNG photo, up to 10MB.' },
                    { field: 'productId', type: 'string', required: true, description: 'Must already be mapped to a size chart.' },
                    {
                      field: 'userHeight',
                      type: 'number',
                      required: false,
                      description: "Shopper's height in centimeters. Switches matching from ratio-based to measurement-based, improving accuracy.",
                    },
                  ]}
                />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Success response — 200</p>
                <CodeBlock code={recommendSuccessExample} lang="json" />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Error response — 4xx/5xx</p>
                <CodeBlock code={recommendErrorExample} lang="json" />
                <Callout>
                  The success response does not currently include the created recommendation&apos;s id, so there is no
                  way for the storefront to reference it in a later{' '}
                  <code className="rounded bg-amber-100 px-1 py-0.5">/api/feedback</code> call yet — this is a known
                  gap, not something to build around.
                </Callout>
              </div>

              <div className="space-y-3 border-t border-gray-100 pt-6">
                <EndpointHeader method="POST" path="/api/feedback" />
                <p>Records how a size recommendation actually fit, for accuracy reporting on the Analytics page.</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Request body (application/json)</p>
                <ParamsTable
                  rows={[
                    { field: 'recommendationId', type: 'string', required: true, description: 'Id of the recommendation this feedback is about.' },
                    {
                      field: 'fitResult',
                      type: 'string',
                      required: true,
                      description: 'One of: too_small, slightly_small, perfect, slightly_large, too_large.',
                    },
                    { field: 'comment', type: 'string', required: false, description: 'Optional free-text note from the shopper.' },
                  ]}
                />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Example request</p>
                <CodeBlock code={feedbackRequestExample} lang="json" />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Success response — 201</p>
                <CodeBlock code={feedbackResponseExample} lang="json" />
              </div>
            </div>
          </Section>

          <Section id="code-examples" title="Code Examples">
            <p>All three examples send the same request: a photo, a product ID, and your API key.</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">JavaScript</p>
            <CodeBlock code={jsExample} lang="javascript" />
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Python</p>
            <CodeBlock code={pythonExample} lang="python" />
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">cURL</p>
            <CodeBlock code={curlExample} lang="bash" />
          </Section>

          <Section id="widget-integration" title="Widget Integration">
            <p>
              The fastest way to add SnapFit to a React storefront is the <code className="rounded bg-gray-100 px-1 py-0.5">SnapFitWidget</code> component
              — it handles the upload UI, loading/result/error states, and calls{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">/api/recommend</code> for you.
            </p>
            <CodeBlock code={widgetExample} lang="javascript" label="React" />
            <ParamsTable
              rows={[
                { field: 'apiKey', type: 'string', required: true, description: 'Your live API key.' },
                { field: 'productId', type: 'string', required: true, description: 'The product being viewed.' },
                { field: 'apiUrl', type: 'string', required: true, description: 'Base URL of the SnapFit API (no trailing /recommend).' },
                { field: 'buttonLabel', type: 'string', required: false, description: 'Defaults to "Check My Size".' },
              ]}
            />
            <p>
              See it running on the{' '}
              <Link to="/demo/size-check" className="font-medium text-gray-900 underline">
                live demo page
              </Link>
              , which renders the widget the same way a real product page would.
            </p>
            <Callout>
              A drop-in script-tag/iframe embed for non-React storefronts isn&apos;t published yet. Until then, any
              stack can integrate directly against the REST API using the snippets in Code Examples above.
            </Callout>
          </Section>

          <Section id="error-codes" title="Error Codes">
            <p>
              <code className="rounded bg-gray-100 px-1 py-0.5">/api/recommend</code> errors include{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">success: false</code> alongside{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">message</code>. Auth-layer errors (the x-api-key check)
              and every <code className="rounded bg-gray-100 px-1 py-0.5">/api/feedback</code> error return just{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">{'{ "message": "..." }'}</code>, with no{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">success</code> field.
            </p>
            <ErrorTable caption="Authentication & Quota" rows={AUTH_ERRORS} />
            <ErrorTable caption="Request Validation — /api/recommend" rows={RECOMMEND_VALIDATION_ERRORS} />
            <ErrorTable caption="Photo Validation" rows={PHOTO_VALIDATION_ERRORS} />

            <div className="overflow-hidden rounded-xl border border-gray-200">
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                AI Service & Size-Matching Failures
              </div>
              <div className="px-4 pt-3">
                <p className="text-sm text-gray-600">
                  Several distinct backend-side conditions all return the same message —{' '}
                  <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">&quot;{AI_SERVICE_GENERIC_MESSAGE}&quot;</code>{' '}
                  — so use the HTTP status (and, if you&apos;re inspecting your own recommendation logs, the internal
                  cause below) to tell them apart.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Internal Cause</th>
                      <th className="px-4 py-2 font-medium">Meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AI_SERVICE_FAILURE_CAUSES.map((c) => (
                      <tr key={c.cause} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-2">
                          <Badge color={statusTone(c.status)}>{c.status}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-gray-800">{c.cause}</td>
                        <td className="px-4 py-2 text-gray-600">{c.meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <ErrorTable caption="Request Validation — /api/feedback" rows={FEEDBACK_VALIDATION_ERRORS} />
          </Section>

          <Section id="rate-limits" title="Rate Limits">
            <p>
              Every request that passes API key validation counts against your plan&apos;s monthly limit — once it&apos;s
              reached, <code className="rounded bg-gray-100 px-1 py-0.5">/api/recommend</code> and{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">/api/feedback</code> return{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5">403 Monthly request limit reached</code> until you{' '}
              <Link to="/dashboard/subscription/plans" className="font-medium text-gray-900 underline">
                upgrade your plan
              </Link>
              .
            </p>
            {plans.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-2 font-medium">Plan</th>
                      <th className="px-4 py-2 font-medium">Price</th>
                      <th className="px-4 py-2 font-medium">Requests / mo</th>
                      <th className="px-4 py-2 font-medium">Size Charts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((p) => (
                      <tr key={p.plan} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-2 font-medium capitalize text-gray-900">{p.name}</td>
                        <td className="px-4 py-2 text-gray-600">{formatPrice(p)}</td>
                        <td className="px-4 py-2 text-gray-600">{formatRequests(p.requestsLimit)}</td>
                        <td className="px-4 py-2 text-gray-600">{formatCharts(p.chartsLimit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section id="try-it-out" title="Try It Out">
            <p>Send a real request to your account&apos;s API using a photo from this device.</p>
            <TryItOut />
          </Section>
        </div>
      </div>
    </div>
  );
}

export default IntegrationDocsPage;
