import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import api from '../../services/api';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ConfirmModal from '../../components/ui/ConfirmModal';

// Same 3-way mapping as DashboardHomePage's PLAN_STATUS_BADGE_VARIANT -- keeps
// "expired" visually distinct (danger) from a merchant who never picked a plan
// (neutral), rather than collapsing both into one gray state.
const STATUS_BADGE_VARIANT = { active: 'success', expired: 'danger', inactive: 'neutral' };

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatCharts(limit) {
  if (limit == null) return 'Unlimited size charts';
  return `${limit} size chart${limit === 1 ? '' : 's'}`;
}

function usageBarColor(pct) {
  if (pct >= 100) return 'bg-danger';
  if (pct >= 80) return 'bg-warning';
  return 'bg-primary';
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
        <Loader2 className="animate-spin text-ink-300" size={28} />
      </div>
    );
  }

  const { subscription, usage } = data;
  const hasSelectedPlan = Boolean(subscription.startDate);

  if (!hasSelectedPlan) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold text-ink-900">Subscription</h1>
        <Card className="mt-6 border-dashed text-center">
          <p className="text-sm text-ink-500">You haven&apos;t selected a plan yet.</p>
          <Button className="mt-4" onClick={() => navigate('/dashboard/subscription/plans')}>
            Choose a Plan
          </Button>
        </Card>
      </div>
    );
  }

  const pct =
    usage.requestsLimit == null ? 0 : Math.min(100, Math.round((usage.requestsUsed / usage.requestsLimit) * 100));

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-ink-900">Subscription</h1>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold capitalize text-ink-900">{subscription.plan} plan</h2>
          <Badge variant={STATUS_BADGE_VARIANT[subscription.status] || 'neutral'}>
            {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
          </Badge>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-ink-500">Start date</dt>
            <dd className="mt-0.5 font-medium text-ink-900">{formatDate(subscription.startDate)}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Renews / ends</dt>
            <dd className="mt-0.5 font-medium text-ink-900">{formatDate(subscription.endDate)}</dd>
          </div>
        </dl>

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-500">Usage this month</span>
            <span className="font-medium text-ink-900">
              {usage.requestsUsed} / {usage.requestsLimit ?? 'Unlimited'} requests
            </span>
          </div>
          {usage.requestsLimit != null && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full transition-all ${usageBarColor(pct)}`} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        <div className="mt-4 text-sm text-ink-500">
          Size chart limit: <span className="font-medium text-ink-900">{formatCharts(chartsLimit)}</span>
        </div>

        <div className="mt-6 flex gap-3">
          <Button onClick={() => navigate('/dashboard/subscription/plans')}>Change Plan</Button>
          <Button variant="secondary" disabled={subscription.status !== 'active'} onClick={() => setCancelOpen(true)}>
            Cancel Subscription
          </Button>
        </div>
      </Card>

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
