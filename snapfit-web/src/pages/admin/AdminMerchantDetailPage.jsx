import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FlaskConical, Shirt } from 'lucide-react';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import { getMerchant } from '../../services/adminApi';
import { TRY_ON_STATUS, resolveProductImageUrl } from '../../utils/productImage';
import { AccountStatusBadge, PlanBadge, SubscriptionStatusBadge } from './components/AdminBadges';
import { LoadError, PageLoader } from './components/PageStatus';
import UsageBar from './components/UsageBar';
import LimitsEditor from './merchant/LimitsEditor';
import ApiKeyCard from './merchant/ApiKeyCard';
import AccountActions from './merchant/AccountActions';
import { RECOMMENDATION_STATUS_VARIANT, capitalize, formatDate, formatDateTime, formatNumber, humanize } from './adminFormat';

const TH = 'px-4 py-2.5';
const TD = 'px-4 py-2.5';

function ListCard({ title, count, empty, children }) {
  return (
    <Card padding="sm">
      <h2 className="px-2 pb-3 text-sm font-medium text-foreground">
        {title} <span className="text-muted-foreground">({formatNumber(count)})</span>
      </h2>
      {count === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">{children}</table>
        </div>
      )}
    </Card>
  );
}

function HeadRow({ columns }) {
  return (
    <thead>
      <tr className="bg-surface-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {columns.map((column) => (
          <th key={column} className={TH}>
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function ProfileField({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children || '—'}</dd>
    </div>
  );
}

function AdminMerchantDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState(null);
  const [failed, setFailed] = useState(false);

  // Refreshes in place once loaded, so open dialogs (e.g. a new API key on
  // screen) survive a reload of the data behind them.
  const load = useCallback(() => {
    setFailed(false);
    return getMerchant(id)
      .then(setDetail)
      .catch(() => setFailed(true));
  }, [id]);

  useEffect(() => {
    setDetail(null);
    load();
  }, [load]);

  const applyMerchant = useCallback((merchant) => {
    setDetail((prev) => ({ ...prev, merchant: { ...prev.merchant, ...merchant } }));
  }, []);

  if (failed) return <LoadError message="Couldn't load this merchant." onRetry={load} />;
  if (!detail) return <PageLoader />;

  const { merchant, apiKeyPreview, sizeCharts, products, recentRecommendations } = detail;
  const { subscription = {} } = merchant;

  return (
    <div>
      <Link to="/admin/merchants" className="inline-flex items-center gap-1 text-sm font-medium">
        <ArrowLeft size={14} aria-hidden="true" />
        All merchants
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{merchant.businessName}</h1>
            <AccountStatusBadge status={merchant.status} />
            <PlanBadge plan={subscription.plan} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{merchant.email}</p>
        </div>
        <Link
          to={`/admin/demo?merchantId=${merchant._id}`}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors duration-150 hover:bg-surface-2 hover:text-foreground"
        >
          <FlaskConical size={14} aria-hidden="true" />
          Open in demo studio
        </Link>
      </div>

      {merchant.status === 'suspended' && (
        <Alert
          className="mt-4"
          variant="danger"
          title={`Suspended${merchant.suspendedAt ? ` on ${formatDate(merchant.suspendedAt)}` : ''}`}
          description={merchant.suspendedReason ? `Reason: ${merchant.suspendedReason}` : 'No reason was given.'}
        />
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h2 className="text-sm font-semibold text-foreground">Profile</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <ProfileField label="Contact name">{merchant.name}</ProfileField>
              <ProfileField label="Phone">{merchant.phone}</ProfileField>
              <ProfileField label="Business type">{capitalize(merchant.businessType)}</ProfileField>
              <ProfileField label="Joined">{formatDate(merchant.createdAt)}</ProfileField>
              <ProfileField label="Subscription">
                <SubscriptionStatusBadge status={subscription.status} />
              </ProfileField>
              <ProfileField label="Period">
                {formatDate(subscription.startDate)} – {subscription.endDate ? formatDate(subscription.endDate) : 'no end date'}
              </ProfileField>
            </dl>
            <div className="mt-6">
              <UsageBar subscription={subscription} />
            </div>
          </Card>

          <LimitsEditor merchant={merchant} onUpdated={applyMerchant} />
        </div>

        <div className="space-y-4">
          <ApiKeyCard merchant={merchant} apiKeyPreview={apiKeyPreview} onRegenerated={load} onRevoked={applyMerchant} />
          <AccountActions merchant={merchant} onUpdated={applyMerchant} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ListCard title="Size charts" count={sizeCharts.length} empty="No size charts yet.">
          <HeadRow columns={['Name', 'Category', 'Sizes', 'Status']} />
          <tbody className="divide-y divide-border">
            {sizeCharts.map((chart) => (
              <tr key={chart._id} className="text-foreground">
                <td className={`${TD} font-medium`}>{chart.name}</td>
                <td className={`${TD} capitalize`}>{chart.category}</td>
                <td className={TD}>{chart.sizesCount}</td>
                <td className={TD}>
                  <Badge variant={chart.isActive ? 'success' : 'neutral'}>{chart.isActive ? 'Active' : 'Inactive'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </ListCard>

        <ListCard title="Products" count={products.length} empty="No products mapped yet.">
          <HeadRow columns={['Product', 'Try-on', 'Length']} />
          <tbody className="divide-y divide-border">
            {products.map((product) => {
              const imageUrl = resolveProductImageUrl(product.productImage);
              const tryOn = TRY_ON_STATUS[product.tryOnStatus];
              return (
                <tr key={product._id} className="text-foreground">
                  <td className={TD}>
                    <div className="flex items-center gap-3">
                      {imageUrl ? (
                        <img src={imageUrl} alt="" className="h-9 w-9 rounded-md border border-border object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-2">
                          <Shirt size={16} className="text-muted" aria-hidden="true" />
                        </span>
                      )}
                      <div>
                        <p className="font-medium">{product.productName || product.productId}</p>
                        <p className="font-mono text-xs text-muted-foreground">{product.productId}</p>
                      </div>
                    </div>
                  </td>
                  <td className={TD}>{tryOn ? <Badge variant={tryOn.variant}>{tryOn.label}</Badge> : '—'}</td>
                  <td className={`${TD} capitalize`}>{product.garmentLength || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </ListCard>
      </div>

      <div className="mt-4">
        <ListCard title="Recent recommendations" count={recentRecommendations.length} empty="No recommendations yet.">
          <HeadRow columns={['Product', 'Size', 'Confidence', 'Status', 'Source', 'Time']} />
          <tbody className="divide-y divide-border">
            {recentRecommendations.map((r) => (
              <tr key={r._id} className="text-foreground">
                <td className={`${TD} font-mono text-xs`}>{r.productId}</td>
                <td className={`${TD} font-medium`}>{r.recommendedSize || '—'}</td>
                <td className={TD}>{r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '—'}</td>
                <td className={TD}>
                  <Badge variant={RECOMMENDATION_STATUS_VARIANT[r.status] || 'neutral'}>{humanize(r.status)}</Badge>
                </td>
                <td className={`${TD} text-muted-foreground`}>{humanize(r.source) || '—'}</td>
                <td className={`whitespace-nowrap ${TD} text-muted-foreground`}>{formatDateTime(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </ListCard>
      </div>
    </div>
  );
}

export default AdminMerchantDetailPage;
