import { useState } from 'react';
import { ShirtIcon } from 'lucide-react';
import SnapFitWidget from '../../components/widget/SnapFitWidget';

const STORAGE_KEY = 'snapfit_demo_tester_config';
// Optional, local .env only: the demo product's photo and name, so the shop page
// shows the same product the widget sizes and tries on.
const DEMO_PRODUCT_IMAGE = import.meta.env.VITE_DEMO_PRODUCT_IMAGE;
const DEMO_PRODUCT_NAME = import.meta.env.VITE_DEMO_PRODUCT_NAME || 'Classic Crew Neck T-Shirt';

function loadStoredConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function SizeCheckDemo() {
  const stored = loadStoredConfig();
  // VITE_DEMO_API_KEY (optional, local .env only) pre-fills a working key so the
  // demo is usable straight away; a key typed here still takes priority.
  const [apiKey, setApiKey] = useState(stored.apiKey || import.meta.env.VITE_DEMO_API_KEY || '');
  const [productId, setProductId] = useState(stored.productId || 'demo-product-1');
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  function persist(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return (
    // Stands in for a merchant's store page: always light, like the widget.
    <div data-theme="light" className="min-h-screen bg-surface-2 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-dashed border-border bg-background p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tester config</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Fill these in with a real API key and mapped product ID from your dashboard to test the widget below as an
            external merchant site would.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">API Key</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  persist({ apiKey: e.target.value, productId });
                }}
                placeholder="sk_live_..."
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Product ID</label>
              <input
                type="text"
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  persist({ apiKey, productId: e.target.value });
                }}
                placeholder="prod-123"
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <div className="flex h-72 items-center justify-center bg-surface-2">
            {DEMO_PRODUCT_IMAGE ? (
              <img src={DEMO_PRODUCT_IMAGE} alt={DEMO_PRODUCT_NAME} className="h-full object-contain p-4" />
            ) : (
              <ShirtIcon size={64} className="text-muted" />
            )}
          </div>
          <div className="p-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Everyday Essentials</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{DEMO_PRODUCT_NAME}</h1>
            <p className="mt-2 text-xl font-semibold text-foreground">$24.00</p>
            <p className="mt-3 text-sm text-muted-foreground">
              A soft, breathable everyday tee. Not sure which size to order? Use SnapFit to get a personalized
              recommendation from a photo.
            </p>

            <div className="mt-6 flex items-center gap-3">
              <SnapFitWidget apiKey={apiKey} productId={productId} apiUrl={apiUrl} />
              <button
                type="button"
                className="rounded-md border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-2"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SizeCheckDemo;
