import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Circle,
  KeyRound,
  Loader2,
  Package,
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import StatCard from '../../components/ui/StatCard';

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Same "no comparison base" guard AnalyticsDashboardPage's calcTrend uses --
// division by a zero previous-month count would otherwise produce Infinity/NaN.
function calcMonthTrend(current, previous) {
  if (previous === 0) {
    return current > 0 ? { pct: 100, up: true } : null;
  }
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  return { pct: Math.abs(pct), up: pct >= 0 };
}

// Restores the 3-way distinction the pre-restyle STATUS_COLORS map had
// (active/inactive/expired) -- a plain success/neutral split would collapse an
// expired subscription into the same gray as "no plan selected," losing the
// warning cue that the merchant's plan has actually lapsed.
const PLAN_STATUS_BADGE_VARIANT = { active: 'success', expired: 'danger', inactive: 'neutral' };

function confidenceTextColor(confidence) {
  if (confidence == null) return 'text-ink-500';
  const pct = confidence * 100;
  if (pct > 75) return 'text-success';
  if (pct >= 50) return 'text-warning';
  return 'text-danger';
}

function QuickActionCard({ to, icon: Icon, label, description }) {
  return (
    <Link to={to} className="block">
      <Card className="flex items-start gap-3 transition-colors hover:border-primary-200">
        <Icon size={18} className="mt-0.5 shrink-0 text-primary-600" />
        <div>
          <p className="text-sm font-medium text-ink-700">{label}</p>
          <p className="mt-0.5 text-xs text-ink-500">{description}</p>
        </div>
      </Card>
    </Link>
  );
}

function ChecklistItem({ done, label, to }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 hover:bg-gray-50">
      {done ? (
        <CheckCircle2 size={18} className="shrink-0 text-success" />
      ) : (
        <Circle size={18} className="shrink-0 text-ink-300" />
      )}
      <span className={done ? 'text-ink-500 line-through' : 'text-ink-700'}>{label}</span>
    </Link>
  );
}

function DashboardHomePage() {
  const { merchant } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [requestsToday, setRequestsToday] = useState(0);
  const [recent, setRecent] = useState([]);
  const [hasChart, setHasChart] = useState(false);
  const [hasMapping, setHasMapping] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardRes, usageRes, recentRes, chartsRes, mappingsRes, apiKeyRes] = await Promise.all([
        api.get('/analytics/dashboard'),
        api.get('/analytics/usage', { params: { period: '7d' } }),
        api.get('/analytics/recent'),
        api.get('/charts', { params: { limit: 1 } }),
        api.get('/products/mappings'),
        api.get('/merchant/api-key').catch((err) => (err.response?.status === 404 ? { data: { apiKey: null } } : Promise.reject(err))),
      ]);

      setDashboard(dashboardRes.data);
      setRequestsToday(usageRes.data.data.at(-1)?.count ?? 0);
      setRecent(recentRes.data.recommendations.slice(0, 5));
      setHasChart(chartsRes.data.pagination.total > 0);
      setHasMapping(mappingsRes.data.mappings.length > 0);
      setHasApiKey(Boolean(apiKeyRes.data.apiKey));
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !dashboard) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-ink-300" size={28} />
      </div>
    );
  }

  const subscription = merchant.subscription;
  const usage = dashboard.usage;
  const hasSelectedPlan = Boolean(subscription?.startDate);
  const pct =
    usage.requestsLimit == null ? 0 : Math.min(100, Math.round((usage.requestsUsed / usage.requestsLimit) * 100));
  const nearLimit = usage.requestsLimit != null && pct > 80;

  const monthTrend = calcMonthTrend(dashboard.recommendationsThisMonth, dashboard.recommendationsLastMonth);
  const confidencePct = dashboard.averageConfidence != null ? Math.round(dashboard.averageConfidence * 100) : null;

  const checklist = [
    { label: 'Create your first size chart', done: hasChart, to: '/dashboard/size-charts/new' },
    { label: 'Map a product to a size chart', done: hasMapping, to: '/dashboard/product-mapping' },
    { label: 'Get your API key', done: hasApiKey, to: '/dashboard/api-key' },
    { label: 'Make your first API call', done: dashboard.totalRecommendations > 0, to: '/dashboard/api-key' },
  ];
  const checklistDone = checklist.every((item) => item.done);

  return (
    <div>
      <h1 className="text-xl font-semibold text-ink-900">Welcome back, {merchant.businessName}</h1>
      <p className="mt-1 text-sm text-ink-500">Here&apos;s what&apos;s happening with your SnapFit integration.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Requests Today" value={requestsToday.toLocaleString()} sub="Recommendations served" />
        <StatCard
          label="This Month"
          value={dashboard.recommendationsThisMonth.toLocaleString()}
          sub="vs last month"
          badge={
            monthTrend && (
              <Badge variant={monthTrend.up ? 'success' : 'danger'}>
                {monthTrend.up ? '↑' : '↓'} {monthTrend.pct}%
              </Badge>
            )
          }
        />
        <StatCard
          label="Active Plan"
          value={hasSelectedPlan ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1) : 'None'}
          sub={hasSelectedPlan ? subscription.status : 'No plan selected yet'}
        />
        <StatCard
          label="Confidence Avg"
          value={confidencePct != null ? `${confidencePct}%` : '—'}
          sub="Across successful recommendations"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink-900">Quick actions</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <QuickActionCard
              to="/dashboard/size-charts"
              icon={Package}
              label="Manage Size Charts"
              description="Create and edit the charts used for fit matching"
            />
            <QuickActionCard
              to="/dashboard/api-key"
              icon={KeyRound}
              label="View API Key"
              description="Copy or regenerate your live API key"
            />
            <QuickActionCard
              to="/dashboard/analytics"
              icon={BarChart3}
              label="View Analytics"
              description="Track usage, accuracy, and size trends"
            />
            <QuickActionCard
              to="/dashboard/docs"
              icon={BookOpen}
              label="Integration Docs"
              description="Full API reference, code samples, and a live tester"
            />
          </div>

          <div className="mt-6">
            <Card>
              <Card.Header>
                <h2 className="text-sm font-semibold text-ink-900">Recent Activity</h2>
              </Card.Header>
              <Card.Body padding="sm">
                {recent.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-ink-500">No recommendations yet.</p>
                ) : (
                  <ul className="divide-y divide-surface-border">
                    {recent.map((r) => (
                      <li key={r._id} className="flex items-center justify-between gap-4 px-2 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-xs text-ink-700">{r.productId}</p>
                          <p className="mt-0.5 text-xs text-ink-500">{formatDateTime(r.createdAt)}</p>
                        </div>
                        <Badge variant="neutral">{r.recommendedSize || '—'}</Badge>
                        <span className={`w-12 shrink-0 text-right text-sm font-medium ${confidenceTextColor(r.confidence)}`}>
                          {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card.Body>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-ink-900">Plan Usage</span>
              <Badge variant={hasSelectedPlan ? PLAN_STATUS_BADGE_VARIANT[subscription.status] || 'neutral' : 'neutral'}>
                {hasSelectedPlan ? subscription.status : 'inactive'}
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
              <span>
                {usage.requestsUsed} / {usage.requestsLimit ?? 'Unlimited'} requests
              </span>
              {usage.requestsLimit != null && <span>{pct}%</span>}
            </div>
            {usage.requestsLimit != null && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}
            {(nearLimit || !hasSelectedPlan) && (
              <Link to="/dashboard/subscription/plans" className="mt-3 block">
                <Button variant="secondary" size="sm" className="w-full">
                  {hasSelectedPlan ? "You're nearing your plan limit — Upgrade" : 'Choose a Plan'}
                </Button>
              </Link>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-ink-900">Getting Started</h2>
            {checklistDone ? (
              <p className="mt-3 text-xs text-ink-500">You&apos;re all set up.</p>
            ) : (
              <div className="mt-2 -mx-1">
                {checklist.map((item) => (
                  <ChecklistItem key={item.label} done={item.done} label={item.label} to={item.to} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default DashboardHomePage;
