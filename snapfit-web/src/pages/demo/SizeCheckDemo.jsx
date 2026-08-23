import { useState } from 'react';
import { ShirtIcon } from 'lucide-react';
import SnapFitWidget from '../../components/widget/SnapFitWidget';

const STORAGE_KEY = 'snapfit_demo_tester_config';

function loadStoredConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function SizeCheckDemo() {
  const stored = loadStoredConfig();
  const [apiKey, setApiKey] = useState(stored.apiKey || '');
  const [productId, setProductId] = useState(stored.productId || 'demo-product-1');
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  function persist(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tester config</p>
          <p className="mt-1 text-xs text-gray-400">
            Fill these in with a real API key and mapped product ID from your dashboard to test the widget below as an
            external merchant site would.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-gray-600">API Key</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  persist({ apiKey: e.target.value, productId });
                }}
                placeholder="sk_live_..."
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Product ID</label>
              <input
                type="text"
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  persist({ apiKey, productId: e.target.value });
                }}
                placeholder="prod-123"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex h-72 items-center justify-center bg-gray-100">
            <ShirtIcon size={64} className="text-gray-300" />
          </div>
          <div className="p-6">
            <p className="text-xs uppercase tracking-wide text-gray-400">Everyday Essentials</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">Classic Crew Neck T-Shirt</h1>
            <p className="mt-2 text-xl font-semibold text-gray-900">$24.00</p>
            <p className="mt-3 text-sm text-gray-500">
              A soft, breathable everyday tee. Not sure which size to order? Use SnapFit to get a personalized
              recommendation from a photo.
            </p>

            <div className="mt-6 flex items-center gap-3">
              <SnapFitWidget apiKey={apiKey} productId={productId} apiUrl={apiUrl} />
              <button
                type="button"
                className="rounded-md border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
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
