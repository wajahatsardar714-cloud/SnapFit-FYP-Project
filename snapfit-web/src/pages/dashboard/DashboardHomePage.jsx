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
import Badge from '../../components/Badge';

const STATUS_BADGE = {
  success: 'green',
  low_confidence: 'amber',
  failed: 'red',
};

const STATUS_COLORS = { active: 'green', inactive: 'gray', expired: 'red' };

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function QuickActionCard({ to, icon: Icon, label, description }) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow-md"
    >
      <div className="rounded-lg bg-gray-100 p-2 text-gray-700">
        <Icon size={18} />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      </div>
    </Link>
  );
}

function ChecklistItem({ done, label, to }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-gray-50"
    >
      {done ? (
        <CheckCircle2 size={18} className="shrink-0 text-green-600" />
      ) : (
        <Circle size={18} className="shrink-0 text-gray-300" />
      )}
      <span className={done ? 'text-gray-400 line-through' : 'text-gray-700'}>{label}</span>
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
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    );
  }

  const subscription = merchant.subscription;
  const usage = dashboard.usage;
  const hasSelectedPlan = Boolean(subscription?.startDate);
  const pct =
    usage.requestsLimit == null ? 0 : Math.min(100, Math.round((usage.requestsUsed / usage.requestsLimit) * 100));
  const nearLimit = usage.requestsLimit != null && pct >= 80;
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-gray-900';

  const checklist = [
    { label: 'Create your first size chart', done: hasChart, to: '/dashboard/size-charts/new' },
    { label: 'Map a product to a size chart', done: hasMapping, to: '/dashboard/product-mapping' },
    { label: 'Get your API key', done: hasApiKey, to: '/dashboard/api-key' },
    { label: 'Make your first API call', done: dashboard.totalRecommendations > 0, to: '/dashboard/api-key' },
  ];
  const checklistDone = checklist.every((item) => item.done);

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Welcome back, {merchant.businessName}</h1>
      <p className="mt-1 text-sm text-gray-500">Here&apos;s what&apos;s happening with your SnapFit integration.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Requests Today" value={requestsToday.toLocaleString()} sub="Recommendations served" />
        <StatCard
          label="Active Plan"
          value={hasSelectedPlan ? subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1) : 'None'}
          sub={hasSelectedPlan ? subscription.status : 'No plan selected yet'}
        />
        <StatCard
          label="Confidence Avg"
          value={dashboard.averageConfidence != null ? `${Math.round(dashboard.averageConfidence * 100)}%` : '—'}
          sub="Across successful recommendations"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-900">Quick actions</h2>
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

          <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
            </div>
            {recent.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-gray-500">No recommendations yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                      <th className="px-6 py-3 font-medium">Product</th>
                      <th className="px-6 py-3 font-medium">Size</th>
                      <th className="px-6 py-3 font-medium">Confidence</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr key={r._id} className="border-b border-gray-50 last:border-0">
                        <td className="px-6 py-3 font-mono text-xs text-gray-700">{r.productId}</td>
                        <td className="px-6 py-3 font-medium text-gray-900">{r.recommendedSize || '—'}</td>
                        <td className="px-6 py-3 text-gray-700">
                          {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '—'}
                        </td>
                        <td className="px-6 py-3">
                          <Badge color={STATUS_BADGE[r.status] || 'gray'}>{r.status.replace('_', ' ')}</Badge>
                        </td>
                        <td className="px-6 py-3 text-gray-500">{formatDateTime(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-900">Plan Usage</span>
              <Badge color={STATUS_COLORS[subscription?.status] || 'gray'}>
                {hasSelectedPlan ? subscription.status : 'inactive'}
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <span>
                {usage.requestsUsed} / {usage.requestsLimit ?? 'Unlimited'} requests
              </span>
              {usage.requestsLimit != null && <span>{pct}%</span>}
            </div>
            {usage.requestsLimit != null && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
            )}
            {(nearLimit || !hasSelectedPlan) && (
              <Link
                to="/dashboard/subscription/plans"
                className="mt-3 block rounded-md bg-gray-900 px-3 py-2 text-center text-xs font-medium text-white hover:bg-gray-800"
              >
                {hasSelectedPlan ? "You're nearing your plan limit — Upgrade" : 'Choose a Plan'}
              </Link>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">Getting Started</h2>
            {checklistDone ? (
              <p className="mt-3 text-xs text-gray-500">You&apos;re all set up.</p>
            ) : (
              <div className="mt-2 -mx-1">
                {checklist.map((item) => (
                  <ChecklistItem key={item.label} done={item.done} label={item.label} to={item.to} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardHomePage;
