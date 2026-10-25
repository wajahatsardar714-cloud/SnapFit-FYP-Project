import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, KeyRound, ShieldCheck, Shirt } from 'lucide-react';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Alert from '../../components/ui/Alert';
import SnapFitWidget from '../../components/widget/SnapFitWidget';
import { useAuth } from '../../context/AuthContext';
import { demoRecommendPath, getMerchant, listMerchants } from '../../services/adminApi';
import { TRY_ON_STATUS, resolveProductImageUrl } from '../../utils/productImage';
import { LoadError, PageLoader } from './components/PageStatus';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const API_KEY_STORAGE_KEY = 'snapfit_admin_demo_api_key';
// Enough to list every merchant of a small platform in one picker.
const MERCHANT_PICKER_LIMIT = 100;

const MODES = [
  { key: 'admin', label: 'Admin session', icon: ShieldCheck },
  { key: 'apiKey', label: 'Use an API key instead', icon: KeyRound },
];

function readStoredApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function storeApiKey(value) {
  try {
    if (value) localStorage.setItem(API_KEY_STORAGE_KEY, value);
    else localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // Storage blocked: the key still works for this visit.
  }
}

function StorePreview({ product, widget }) {
  const imageUrl = resolveProductImageUrl(product.productImage);
  const tryOn = TRY_ON_STATUS[product.tryOnStatus];

  return (
    // Stands in for the merchant's store page: always light, like the widget.
    <div data-theme="light" className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex h-60 items-center justify-center bg-surface-2">
        {imageUrl ? (
          <img src={imageUrl} alt={product.productName || product.productId} className="h-full object-contain p-4" />
        ) : (
          <Shirt size={56} className="text-muted" aria-hidden="true" />
        )}
      </div>
      <div className="p-6">
        <p className="font-mono text-xs text-muted-foreground">{product.productId}</p>
        <h2 className="mt-1 text-xl font-bold text-foreground">{product.productName || product.productId}</h2>
        {tryOn && (
          <div className="mt-2">
            <Badge variant={tryOn.variant}>{tryOn.label}</Badge>
          </div>
        )}
        <div className="mt-5">{widget}</div>
      </div>
    </div>
  );
}

// Runs the real size estimation + measurement + try-on for any merchant's
// product. Admin session mode needs no API key and uses no quota; API key mode
// behaves exactly like the merchant's own storefront widget.
function AdminDemoStudioPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const merchantId = searchParams.get('merchantId') || '';
  const [merchants, setMerchants] = useState(null);
  const [merchantsFailed, setMerchantsFailed] = useState(false);
  const [products, setProducts] = useState(null);
  const [productsFailed, setProductsFailed] = useState(false);
  const [productId, setProductId] = useState('');
  const [mode, setMode] = useState('admin');
  const [apiKey, setApiKey] = useState(readStoredApiKey);

  const loadMerchants = useCallback(() => {
    setMerchantsFailed(false);
    listMerchants({ limit: MERCHANT_PICKER_LIMIT })
      .then((res) => setMerchants(res.merchants))
      .catch(() => setMerchantsFailed(true));
  }, []);

  useEffect(() => {
    loadMerchants();
  }, [loadMerchants]);

  useEffect(() => {
    setProducts(null);
    setProductsFailed(false);
    setProductId('');
    if (!merchantId) return undefined;
    let cancelled = false;
    getMerchant(merchantId)
      .then((res) => {
        if (cancelled) return;
        setProducts(res.products);
        setProductId(res.products[0]?.productId || '');
      })
      .catch(() => !cancelled && setProductsFailed(true));
    return () => {
      cancelled = true;
    };
  }, [merchantId]);

  function chooseMerchant(id) {
    setSearchParams(id ? { merchantId: id } : {}, { replace: true });
  }

  function changeApiKey(value) {
    setApiKey(value);
    storeApiKey(value.trim());
  }

  const product = products?.find((p) => p.productId === productId);
  const widget =
    mode === 'admin' ? (
      <SnapFitWidget
        key={`admin-${merchantId}-${productId}`}
        authToken={token}
        endpoint={demoRecommendPath(merchantId)}
        productId={productId}
        apiUrl={API_URL}
      />
    ) : (
      <SnapFitWidget key={`key-${productId}`} apiKey={apiKey.trim()} productId={productId} apiUrl={API_URL} />
    );

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Demo studio</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Try the real sizing, measurement and try-on pipeline on any merchant&apos;s product.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h2 className="text-sm font-semibold text-foreground">1. Product</h2>
            {merchantsFailed ? (
              <div className="mt-4">
                <LoadError message="Couldn't load merchants." onRetry={loadMerchants} />
              </div>
            ) : !merchants ? (
              <PageLoader />
            ) : (
              <div className="mt-4 space-y-4">
                <Select id="demo-merchant" label="Merchant" value={merchantId} onChange={(e) => chooseMerchant(e.target.value)}>
                  <option value="">Choose a merchant…</option>
                  {merchants.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.businessName}
                      {m.status === 'suspended' ? ' (suspended)' : ''}
                    </option>
                  ))}
                </Select>
                {productsFailed && <Alert variant="danger" description="Couldn't load this merchant's products." />}
                {products?.length === 0 && (
                  <Alert variant="warning" description="This merchant has no mapped products yet." />
                )}
                {products?.length > 0 && (
                  <Select id="demo-product" label="Product" value={productId} onChange={(e) => setProductId(e.target.value)}>
                    {products.map((p) => (
                      <option key={p._id} value={p.productId}>
                        {p.productName ? `${p.productName} (${p.productId})` : p.productId}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-foreground">2. Authentication</h2>
            <div role="radiogroup" aria-label="Authentication" className="mt-4 grid gap-2">
              {MODES.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={mode === key}
                  onClick={() => setMode(key)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin/40 ${
                    mode === key ? 'border-admin bg-admin-soft font-medium text-admin' : 'border-border text-foreground hover:bg-surface-2'
                  }`}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            {mode === 'admin' ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Runs with your admin session: no API key needed and nothing counts against the merchant&apos;s quota.
              </p>
            ) : (
              <div className="mt-4">
                <Input
                  id="demo-api-key"
                  label="Merchant API key"
                  value={apiKey}
                  onChange={(e) => changeApiKey(e.target.value)}
                  placeholder="sk_live_..."
                  autoComplete="off"
                  className="font-mono"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the selected merchant&apos;s key; it is saved in this browser only. Requests count against their quota,
                  exactly like their storefront.
                </p>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-foreground">AI test bench</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Inspect body measurements and pose landmarks straight from the AI service.
            </p>
            <a
              href="/test/ai"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium"
            >
              Open the AI test page
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </Card>
        </div>

        <div className="lg:col-span-3">
          {product ? (
            <StorePreview product={product} widget={widget} />
          ) : (
            <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 text-center">
              <Shirt size={36} className="text-muted" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Choose a merchant and product to load the widget.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDemoStudioPage;
