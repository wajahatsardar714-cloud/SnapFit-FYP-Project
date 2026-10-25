import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import { getOverview } from '../../services/adminApi';
import DailyRequestsChart from './components/DailyRequestsChart';
import { LoadError, PageLoader } from './components/PageStatus';
import { AccountStatusBadge, PlanBadge } from './components/AdminBadges';
import { PLANS, capitalize, formatDate, formatNumber, formatPercent } from './adminFormat';

function PlanBreakdown({ byPlan }) {
  const total = PLANS.reduce((sum, plan) => sum + (byPlan[plan] || 0), 0);

  return (
    <ul className="space-y-4">
      {PLANS.map((plan) => {
        const count = byPlan[plan] || 0;
        const pct = total ? Math.round((count / total) * 100) : 0;
        return (
          <li key={plan}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{capitalize(plan)}</span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{formatNumber(count)}</span> · {pct}%
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <div className="h-full rounded-full bg-admin" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AdminOverviewPage() {
  const [overview, setOverview] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    getOverview()
      .then(setOverview)
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (failed) return <LoadError message="Couldn't load the overview." onRetry={load} />;
  if (!overview) return <PageLoader />;

  const { totals, byPlan, daily, recentMerchants } = overview;

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Platform overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">Every merchant and request across SnapFit.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Merchants"
          value={formatNumber(totals.merchants)}
          sub={`${formatNumber(totals.activeMerchants)} active · ${formatNumber(totals.suspendedMerchants)} suspended`}
        />
        <StatCard label="Recommendations" value={formatNumber(totals.recommendations)} sub="All time" />
        <StatCard label="Last 30 days" value={formatNumber(totals.recommendationsLast30Days)} sub="Recommendations" />
        <StatCard label="Success rate" value={formatPercent(totals.successRate)} sub="Of all attempts" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium text-foreground">Requests per day</h2>
          <DailyRequestsChart daily={daily} />
        </Card>
        <Card>
          <h2 className="mb-4 text-sm font-medium text-foreground">Merchants by plan</h2>
          <PlanBreakdown byPlan={byPlan} />
        </Card>
      </div>

      <Card className="mt-4" padding="sm">
        <div className="flex items-center justify-between px-2 pb-3">
          <h2 className="text-sm font-medium text-foreground">Recent merchants</h2>
          <Link to="/admin/merchants" className="text-sm font-medium">
            View all
          </Link>
        </div>
        {recentMerchants.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">No merchants have signed up yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-surface-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5">Business</th>
                  <th className="px-4 py-2.5">Plan</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentMerchants.map((m) => (
                  <tr key={m._id} className="text-foreground">
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/merchants/${m._id}`} className="font-medium">
                        {m.businessName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <PlanBadge plan={m.subscription?.plan} />
                    </td>
                    <td className="px-4 py-2.5">
                      <AccountStatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatDate(m.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default AdminOverviewPage;
