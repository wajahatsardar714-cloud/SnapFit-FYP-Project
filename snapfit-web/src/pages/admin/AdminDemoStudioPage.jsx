import { useCallback, useEffect, useState } from 'react';
import { Shirt } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import SnapFitWidget from '../../components/widget/SnapFitWidget';
import { useAuth } from '../../context/AuthContext';
import { DEMO_RECOMMEND_PATH, getDemoProduct } from '../../services/adminApi';
import { TRY_ON_STATUS, resolveProductImageUrl } from '../../utils/productImage';
import { LoadError, PageLoader } from './components/PageStatus';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Runs the real size estimation, measurement and try-on pipeline on SnapFit's
// own demo product (set on the server). It runs on the super admin's session:
// no API key, nothing billed, and no merchant account is ever chosen or shown.
function AdminDemoStudioPage() {
  const { token } = useAuth();
  const [product, setProduct] = useState(null);
  const [failed, setFailed] = useState('');

  const load = useCallback(() => {
    setFailed('');
    getDemoProduct()
      .then((res) => setProduct(res.product))
      .catch((err) => setFailed(err.response?.data?.message || "Couldn't load the demo product."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const imageUrl = resolveProductImageUrl(product?.productImage);
  const tryOn = product && TRY_ON_STATUS[product.tryOnStatus];
  const name = product?.productName || product?.productId;

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Demo studio</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Try the real sizing, measurement and try-on pipeline on the demo product. Runs on your admin session: no API key
        needed and nothing is billed.
      </p>

      <div className="mt-6 max-w-2xl">
        {failed ? (
          <LoadError message={failed} onRetry={load} />
        ) : !product ? (
          <PageLoader />
        ) : (
          // Stands in for a store's product page: always light, like the widget.
          <div data-theme="light" className="overflow-hidden rounded-xl border border-border bg-background">
            <div className="flex h-72 items-center justify-center bg-surface-2">
              {imageUrl ? (
                <img src={imageUrl} alt={name} className="h-full object-contain p-4" />
              ) : (
                <Shirt size={56} className="text-muted" aria-hidden="true" />
              )}
            </div>
            <div className="p-6">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Demo product</p>
              <h2 className="mt-1 text-xl font-bold text-foreground">{name}</h2>
              {tryOn && (
                <div className="mt-2">
                  <Badge variant={tryOn.variant}>{tryOn.label}</Badge>
                </div>
              )}
              <div className="mt-5">
                <SnapFitWidget authToken={token} endpoint={DEMO_RECOMMEND_PATH} productId={product.productId} apiUrl={API_URL} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDemoStudioPage;
