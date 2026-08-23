import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Download, Loader2, RefreshCw } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '../../services/api';

const AUTO_REFRESH_MS = 60000;
const PERIOD_OPTIONS = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
];

// Categorical palette (fixed order, adjacent-pair CVD-validated) — assigned by
// size identity, never by rank, so a size's color stays stable as counts change.
const CATEGORICAL_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const CANONICAL_SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

// Fit-result severity mapped onto the reserved status palette (good/warning/critical),
// symmetric around "perfect" regardless of which direction the miss is on.
const FIT_LABELS = {
  too_small: 'Too Small',
  slightly_small: 'Slightly Small',
  perfect: 'Perfect',
  slightly_large: 'Slightly Large',
  too_large: 'Too Large',
};
const FIT_COLORS = {
  too_small: '#d03b3b',
  slightly_small: '#fab219',
  perfect: '#0ca30c',
  slightly_large: '#fab219',
  too_large: '#d03b3b',
};

const STATUS_BADGE = {
  success: 'bg-green-100 text-green-700',
  low_confidence: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
};

function sortSizeLabels(labels) {
  return [...labels].sort((a, b) => {
    const ai = CANONICAL_SIZE_ORDER.indexOf(a);
    const bi = CANONICAL_SIZE_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

function calcTrend(current, previous) {
  if (previous === 0) {
    return current > 0 ? { pct: 100, up: true } : null;
  }
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  return { pct: Math.abs(pct), up: pct >= 0 };
}

function formatShortDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatFullDate(value) {
  return new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatCard({ label, value, sub, trend }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {trend && (
          <span
            className={`flex items-center gap-0.5 text-xs font-semibold ${
              trend.up ? 'text-green-700' : 'text-red-600'
            }`}
          >
            {trend.up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {trend.pct}%
          </span>
        )}
      </div>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, action, children, isEmpty, emptyLabel }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {isEmpty ? (
        <div className="flex h-[260px] items-center justify-center text-sm text-gray-400">{emptyLabel}</div>
      ) : (
        <div className="mt-2">{children}</div>
      )}
    </div>
  );
}

function LineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const count = payload[0].value;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="text-gray-400">{formatFullDate(label)}</p>
      <p className="mt-0.5 font-semibold text-gray-900">
        {count} recommendation{count === 1 ? '' : 's'}
      </p>
    </div>
  );
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="flex items-center gap-1.5 text-gray-600">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.payload.fill }} />
        Size {entry.name}
      </p>
      <p className="mt-0.5 font-semibold text-gray-900">{entry.value} recommendations</p>
    </div>
  );
}

function PieLegend({ payload }) {
  return (
    <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-600">
      {(payload || []).map((entry) => (
        <li key={entry.value} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.value}
        </li>
      ))}
    </ul>
  );
}

function FeedbackTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="text-gray-400">{entry.payload.label}</p>
      <p className="mt-0.5 font-semibold text-gray-900">
        {entry.value} response{entry.value === 1 ? '' : 's'}
      </p>
    </div>
  );
}

function AnalyticsDashboardPage() {
  const [period, setPeriod] = useState('30d');
  const [dashboard, setDashboard] = useState(null);
  const [usage, setUsage] = useState([]);
  const [sizeDistribution, setSizeDistribution] = useState([]);
  const [feedbackStats, setFeedbackStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const periodRef = useRef(period);
  periodRef.current = period;

  const loadAll = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const [dashboardRes, usageRes, breakdownRes, feedbackRes, recentRes] = await Promise.all([
        api.get('/analytics/dashboard'),
        api.get('/analytics/usage', { params: { period: periodRef.current } }),
        api.get('/analytics/breakdown'),
        api.get('/feedback/stats'),
        api.get('/analytics/recent'),
      ]);

      setDashboard(dashboardRes.data);
      setUsage(usageRes.data.data);
      setSizeDistribution(breakdownRes.data.sizeDistribution);
      setFeedbackStats(feedbackRes.data);
      setRecent(recentRes.data.recommendations);
      setLastUpdated(new Date());
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadUsageOnly = useCallback(async (nextPeriod) => {
    try {
      const res = await api.get('/analytics/usage', { params: { period: nextPeriod } });
      setUsage(res.data.data);
    } catch {
      toast.error('Failed to load usage over time');
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const interval = setInterval(() => loadAll({ silent: true }), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadAll]);

  function handlePeriodChange(nextPeriod) {
    setPeriod(nextPeriod);
    loadUsageOnly(nextPeriod);
  }

  async function handleExportCsv() {
    setExporting(true);
    try {
      const res = await api.get('/analytics/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `recommendations-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export report');
    } finally {
      setExporting(false);
    }
  }

  if (loading || !dashboard) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    );
  }

  const sizeLabels = sortSizeLabels(sizeDistribution.map((s) => s.size));
  const sizeColorMap = new Map(sizeLabels.map((label, i) => [label, CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]]));
  const sizeChartData = sizeDistribution.map((s) => ({ ...s, fill: sizeColorMap.get(s.size) }));

  const feedbackChartData = feedbackStats
    ? feedbackStats.breakdown.map((b) => ({ ...b, label: FIT_LABELS[b.fitResult] }))
    : [];

  const trend = calcTrend(dashboard.recommendationsThisMonth, dashboard.recommendationsLastMonth);
  const { requestsUsed, requestsLimit } = dashboard.usage;

  return (
    <div className={refreshing ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadAll({ silent: true })}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Recommendations"
          value={dashboard.totalRecommendations.toLocaleString()}
          sub="All time"
          trend={trend}
        />
        <StatCard label="Success Rate" value={`${dashboard.successRate}%`} sub="Of all attempts" />
        <StatCard
          label="Average Confidence"
          value={dashboard.averageConfidence != null ? `${Math.round(dashboard.averageConfidence * 100)}%` : '—'}
          sub="Across successful recommendations"
        />
        <StatCard
          label="API Requests"
          value={`${requestsUsed} / ${requestsLimit ?? '∞'}`}
          sub="Used this billing cycle"
        />
      </div>

      <div className="mt-4 flex justify-end">
        <div className="flex rounded-md border border-gray-300 p-0.5 text-xs">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => handlePeriodChange(opt.key)}
              className={`rounded px-3 py-1.5 font-medium ${
                period === opt.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Recommendations Over Time"
          isEmpty={usage.every((u) => u.count === 0)}
          emptyLabel="No recommendations in this period"
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={usage} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e1e0d9" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fontSize: 12, fill: '#898781' }}
                axisLine={{ stroke: '#c3c2b7' }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: '#898781' }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip content={<LineTooltip />} cursor={{ stroke: '#c3c2b7', strokeWidth: 1 }} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#2a78d6"
                strokeWidth={2}
                dot={{ r: 3, fill: '#2a78d6', strokeWidth: 2, stroke: '#fcfcfb' }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fcfcfb' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Size Distribution"
          isEmpty={sizeChartData.length === 0}
          emptyLabel="No sized recommendations yet"
        >
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={sizeChartData}
                dataKey="count"
                nameKey="size"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                stroke="#fcfcfb"
                strokeWidth={2}
              >
                {sizeChartData.map((entry) => (
                  <Cell key={entry.size} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend content={<PieLegend />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Feedback Accuracy"
          isEmpty={!feedbackStats || feedbackStats.totalFeedback === 0}
          emptyLabel="No feedback submitted yet"
        >
          {feedbackStats && feedbackStats.totalFeedback > 0 && (
            <>
              <p className="text-xs text-gray-500">
                <span className="font-semibold text-gray-900">{feedbackStats.accuracyRate}%</span> of customers report
                an acceptable fit
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={feedbackChartData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e1e0d9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#898781' }}
                    axisLine={{ stroke: '#c3c2b7' }}
                    tickLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: '#898781' }}
                    axisLine={false}
                    tickLine={false}
                    width={24}
                  />
                  <Tooltip content={<FeedbackTooltip />} cursor={{ fill: 'rgba(11,11,11,0.04)' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {feedbackChartData.map((entry) => (
                      <Cell key={entry.fitResult} fill={FIT_COLORS[entry.fitResult]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </ChartCard>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Recent Recommendations</h2>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Export CSV
            </button>
          </div>

          {recent.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-gray-400">
              No recommendations yet
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="py-2 pr-3 font-medium">Size</th>
                    <th className="py-2 pr-3 font-medium">Confidence</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r._id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-3 font-medium text-gray-900">{r.recommendedSize || '—'}</td>
                      <td className="py-2 pr-3 text-gray-700">
                        {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2 text-gray-500">{formatDateTime(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AnalyticsDashboardPage;
