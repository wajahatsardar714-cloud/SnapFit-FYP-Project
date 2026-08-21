import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import api from '../../services/api';
import ConfirmModal from '../../components/ConfirmModal';
import Badge from '../../components/Badge';

const STATUS_COLORS = { active: 'green', inactive: 'gray', expired: 'red' };

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatCharts(limit) {
  if (limit == null) return 'Unlimited size charts';
  return `${limit} size chart${limit === 1 ? '' : 's'}`;
}

function SubscriptionStatusPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [chartsLimit, setChartsLimit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([api.get('/subscription/status'), api.get('/subscription/plans')])
      .then(([statusRes, plansRes]) => {
        setData(statusRes.data);
        const match = plansRes.data.plans.find((p) => p.plan === statusRes.data.subscription.plan);
        setChartsLimit(match ? match.chartsLimit : null);
      })
      .catch(() => toast.error('Failed to load subscription'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmCancel() {
    setCancelling(true);
    try {
      await api.post('/subscription/cancel');
      toast.success('Subscription cancelled');
      setCancelOpen(false);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel subscription');
    } finally {
      setCancelling(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    );
  }

  const { subscription, usage } = data;
  const hasSelectedPlan = Boolean(subscription.startDate);

  if (!hasSelectedPlan) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-xl font-bold text-gray-900">Subscription</h1>
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">You haven&apos;t selected a plan yet.</p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/subscription/plans')}
            className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Choose a Plan
          </button>
        </div>
      </div>
    );
  }

  const pct =
    usage.requestsLimit == null ? 0 : Math.min(100, Math.round((usage.requestsUsed / usage.requestsLimit) * 100));
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-gray-900';

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">Subscription</h1>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold capitalize text-gray-900">{subscription.plan} plan</h2>
          <Badge color={STATUS_COLORS[subscription.status] || 'gray'}>
            {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
          </Badge>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Start date</dt>
            <dd className="mt-0.5 font-medium text-gray-900">{formatDate(subscription.startDate)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Renews / ends</dt>
            <dd className="mt-0.5 font-medium text-gray-900">{formatDate(subscription.endDate)}</dd>
          </div>
        </dl>

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Usage this month</span>
            <span className="font-medium text-gray-900">
              {usage.requestsUsed} / {usage.requestsLimit ?? 'Unlimited'} requests
            </span>
          </div>
          {usage.requestsLimit != null && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        <div className="mt-4 text-sm text-gray-500">
          Size chart limit: <span className="font-medium text-gray-900">{formatCharts(chartsLimit)}</span>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard/subscription/plans')}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Change Plan
          </button>
          <button
            type="button"
            onClick={() => setCancelOpen(true)}
            disabled={subscription.status !== 'active'}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel Subscription
          </button>
        </div>
      </div>

      <ConfirmModal
        open={cancelOpen}
        title="Cancel your subscription?"
        description="Your plan will be marked inactive immediately. You can re-subscribe at any time."
        confirmLabel="Yes, cancel"
        tone="danger"
        loading={cancelling}
        onConfirm={confirmCancel}
        onClose={() => !cancelling && setCancelOpen(false)}
      />
    </div>
  );
}

export default SubscriptionStatusPage;
