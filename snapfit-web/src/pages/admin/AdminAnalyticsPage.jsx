import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatCard from '../../components/ui/StatCard';
import { exportAnalyticsCsv, getAnalytics } from '../../services/adminApi';
import { useChartTheme } from '../../utils/chartTheme';
import { saveBlob } from '../../utils/download';
import DailyRequestsChart from './components/DailyRequestsChart';
import { LoadError, PageLoader } from './components/PageStatus';
import { formatNumber, formatPercent } from './adminFormat';

const DAY_OPTIONS = [7, 30, 90];
const CANONICAL_SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

const STATUS_ROWS = [
  { key: 'success', label: 'Success', bar: 'bg-success' },
  { key: 'low_confidence', label: 'Low confidence', bar: 'bg-warning' },
  { key: 'failed', label: 'Failed', bar: 'bg-danger' },
];

// Known sizes in wearing order, anything else alphabetically after them.
function sortSizes(sizes) {
  const rank = (size) => {
    const i = CANONICAL_SIZE_ORDER.indexOf(size);
    return i === -1 ? CANONICAL_SIZE_ORDER.length : i;
  };
  return [...sizes].sort((a, b) => rank(a.size) - rank(b.size) || String(a.size).localeCompare(String(b.size)));
}

function ShareBar({ label, count, total, barClass, children }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <li>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-foreground">{children || label}</span>
        <span className="shrink-0 text-muted-foreground">
          <span className="font-semibold text-foreground">{formatNumber(count)}</span> · {pct}%
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

function SizeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { size, count } = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-card">
      <p className="text-xs text-muted-foreground">Size {size}</p>
      <p className="font-semibold text-foreground">
        {formatNumber(count)} recommendation{count === 1 ? '' : 's'}
      </p>
    </div>
  );
}

function AdminAnalyticsPage() {
  const chart = useChartTheme();
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState(null);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    getAnalytics(days)
      .then(setAnalytics)
      .catch(() => setFailed(true));
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      const csv = await exportAnalyticsCsv();
      saveBlob(new Blob([csv], { type: 'text/csv' }), `snapfit-recommendations-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      toast.error('Failed to export the report');
    } finally {
      setExporting(false);
    }
  }

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Platform analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Recommendations across every merchant.</p>
      </div>
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Period" className="flex rounded-lg border border-border p-0.5 text-xs">
          {DAY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={days === option}
              onClick={() => setDays(option)}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors duration-150 ${
                days === option ? 'bg-admin text-admin-foreground' : 'text-muted-foreground hover:bg-surface-2'
              }`}
            >
              {option} days
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" icon={<Download size={14} />} loading={exporting} onClick={handleExport}>
          Export CSV
        </Button>
      </div>
    </div>
  );

  if (failed) {
    return (
      <div className="space-y-6">
        {header}
        <LoadError message="Couldn't load analytics." onRetry={load} />
      </div>
    );
  }
  if (!analytics) {
    return (
      <div>
        {header}
        <PageLoader />
      </div>
    );
  }

  const { daily, statusBreakdown, topMerchants, sizes } = analytics;
  const totals = daily.reduce(
    (sum, day) => ({ total: sum.total + day.total, success: sum.success + day.success, failed: sum.failed + day.failed }),
    { total: 0, success: 0, failed: 0 }
  );
  const statusTotal = STATUS_ROWS.reduce((sum, row) => sum + (statusBreakdown[row.key] || 0), 0);
  const topTotal = topMerchants.reduce((sum, m) => sum + m.count, 0);
  const sizeData = sortSizes(sizes);

  return (
    <div>
      {header}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Requests" value={formatNumber(totals.total)} sub={`Last ${days} days`} />
        <StatCard label="Successful" value={formatNumber(totals.success)} sub={`Last ${days} days`} />
        <StatCard label="Failed" value={formatNumber(totals.failed)} sub={`Last ${days} days`} />
        <StatCard
          label="Success rate"
          value={formatPercent(totals.total ? totals.success / totals.total : null)}
          sub={`Last ${days} days`}
        />
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 text-sm font-medium text-foreground">Requests per day</h2>
        <DailyRequestsChart daily={daily} />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-4 text-sm font-medium text-foreground">Status breakdown</h2>
          {statusTotal === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No recommendations yet</p>
          ) : (
            <ul className="space-y-4">
              {STATUS_ROWS.map((row) => (
                <ShareBar
                  key={row.key}
                  label={row.label}
                  count={statusBreakdown[row.key] || 0}
                  total={statusTotal}
                  barClass={row.bar}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-medium text-foreground">Top merchants</h2>
          {topMerchants.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No merchant activity yet</p>
          ) : (
            <ol className="space-y-4">
              {topMerchants.map((m) => (
                <ShareBar key={m.merchantId} count={m.count} total={topTotal} barClass="bg-admin">
                  <Link to={`/admin/merchants/${m.merchantId}`}>{m.businessName}</Link>
                </ShareBar>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-medium text-foreground">Recommended sizes</h2>
          {sizeData.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No sized recommendations yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sizeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="size" tick={{ fontSize: 12, fill: chart.axis }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: chart.axis }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<SizeTooltip />} cursor={{ fill: chart.grid, fillOpacity: 0.3 }} />
                <Bar dataKey="count" fill={chart.admin} radius={[2, 2, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}

export default AdminAnalyticsPage;
