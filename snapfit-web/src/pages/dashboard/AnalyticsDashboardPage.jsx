import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '../../services/api';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import StatCard from '../../components/ui/StatCard';

const AUTO_REFRESH_MS = 60000;
const PERIOD_OPTIONS = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
];

// Fixed order, used per-category for the size-distribution and confidence-bucket
// bar charts -- assigned by category identity (not rank) so a given size/bucket
// keeps the same color as counts change between refreshes.
const CHART_COLORS = ['#4F46E5', '#8B5CF6', '#06B6D4', '#F59E0B', '#F43F5E', '#10B981'];
const GRID_STROKE = '#E5E7EB';
const AXIS_TICK_STYLE = { fontSize: 12, fill: '#6B7280' };

const CANONICAL_SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

// Must match the exact bucket labels snapfit-backend/src/controllers/
// analyticsController.js's CONFIDENCE_BUCKETS produces, in order.
const CONFIDENCE_BUCKET_ORDER = ['<50%', '50-70%', '70-90%', '>90%'];

// Fit-result severity mapped onto the theme's status colors -- meaningful
// red/amber/green coloring for this specific chart, not the rotating
// categorical sequence (which is for size/confidence-bucket categories instead).
const FIT_LABELS = {
  too_small: 'Too Small',
  slightly_small: 'Slightly Small',
  perfect: 'Perfect',
  slightly_large: 'Slightly Large',
  too_large: 'Too Large',
};
const FIT_COLORS = {
  too_small: '#EF4444',
  slightly_small: '#F59E0B',
  perfect: '#10B981',
  slightly_large: '#F59E0B',
  too_large: '#EF4444',
};

const RECOMMENDATION_STATUS_VARIANT = { success: 'success', low_confidence: 'warning', failed: 'danger' };

// Background zones for the confidence gauge (proportions of the 180deg sweep,
// not literal percentages -- recharts scales each Pie's slices relative to its
// own data sum).
const GAUGE_ZONES = [
  { value: 50, fill: '#EF4444' },
  { value: 25, fill: '#F59E0B' },
  { value: 25, fill: '#10B981' },
];

function sortByCanonicalOrder(items, getKey) {
  return [...items].sort((a, b) => {
    const ai = CANONICAL_SIZE_ORDER.indexOf(getKey(a));
    const bi = CANONICAL_SIZE_ORDER.indexOf(getKey(b));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return getKey(a).localeCompare(getKey(b));
  });
}

function calcTrend(current, previous) {
  if (previous === 0) {
    return current > 0 ? { pct: 100, up: true } : null;
  }
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  return { pct: Math.abs(pct), up: pct >= 0 };
}

function confidenceTextColor(confidence) {
  if (confidence == null) return 'text-ink-500';
  const pct = confidence * 100;
  if (pct > 75) return 'text-success';
  if (pct >= 50) return 'text-warning';
  return 'text-danger';
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

// Matches Card.jsx's own visual language (white bg, surface-border, rounded-lg,
// shadow-card) rather than recharts' default tooltip chrome.
function ChartTooltip({ active, label, children }) {
  if (!active) return null;
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card px-3 py-2 text-sm shadow-card">
      {label && <p className="text-xs text-ink-500">{label}</p>}
      {children}
    </div>
  );
}

function AreaChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const count = payload[0].value;
  return (
    <ChartTooltip active label={formatFullDate(label)}>
      <p className="font-semibold text-ink-900">
        {count} recommendation{count === 1 ? '' : 's'}
      </p>
    </ChartTooltip>
  );
}

// Shared by every "one value per category" bar chart (size distribution,
// confidence buckets, feedback accuracy).
function CategoryTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const label = entry.payload.displayLabel ?? entry.payload.name ?? entry.name;
  return (
    <ChartTooltip active>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.payload.fill }} />
        <span className="text-ink-700">{label}</span>
      </div>
      <p className="mt-0.5 font-semibold text-ink-900">
        {entry.value} recommendation{entry.value === 1 ? '' : 's'}
      </p>
    </ChartTooltip>
  );
}

function ChartCard({ title, action, children, isEmpty, emptyLabel }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink-700">{title}</h2>
        {action}
      </div>
      {isEmpty ? (
        <div className="flex h-[260px] items-center justify-center text-sm text-ink-500">{emptyLabel}</div>
      ) : (
        <div className="mt-3">{children}</div>
      )}
    </Card>
  );
}

// A half-donut gauge: 3 flat colored zones (danger/warning/success) plus a thin
// dark marker slice showing where the actual average confidence sits. The
// marker is a second, separately-scaled Pie sharing the same angle range --
// this keeps it perfectly aligned with the zone track without any manual
// pixel/coordinate math against a separately-positioned overlay.
function ConfidenceGauge({ confidence }) {
  const pct = confidence != null ? Math.round(confidence * 100) : null;
  const markerCenter = pct ?? 0;
  const halfWidth = 1.25;
  const before = Math.max(0.01, markerCenter - halfWidth);
  const after = Math.max(0.01, 100 - markerCenter - halfWidth);
  const markerData = [
    { value: before, fill: 'transparent' },
    { value: halfWidth * 2, fill: '#111827' },
    { value: after, fill: 'transparent' },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[140px] w-full max-w-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={GAUGE_ZONES}
              dataKey="value"
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius="60%"
              outerRadius="90%"
              stroke="none"
              isAnimationActive={false}
            >
              {GAUGE_ZONES.map((zone, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <Cell key={i} fill={zone.fill} />
              ))}
            </Pie>
            {pct != null && (
              <Pie
                data={markerData}
                dataKey="value"
                cx="50%"
                cy="100%"
                startAngle={180}
                endAngle={0}
                innerRadius="55%"
                outerRadius="95%"
                stroke="none"
                isAnimationActive={false}
              >
                {markerData.map((marker, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <Cell key={i} fill={marker.fill} />
                ))}
              </Pie>
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <p className={`text-2xl font-semibold ${confidenceTextColor(confidence)}`}>{pct != null ? `${pct}%` : '—'}</p>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-4 text-xs text-ink-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-danger" />
          0-50%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-warning" />
          50-75%
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-success" />
          75-100%
        </span>
      </div>
    </div>
  );
}

function AnalyticsDashboardPage() {
  const [period, setPeriod] = useState('30d');
  const [dashboard, setDashboard] = useState(null);
  const [usage, setUsage] = useState([]);
  const [sizeDistribution, setSizeDistribution] = useState([]);
  const [confidenceDistribution, setConfidenceDistribution] = useState([]);
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
      setConfidenceDistribution(breakdownRes.data.confidenceDistribution);
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
        <Loader2 className="animate-spin text-ink-300" size={28} />
      </div>
    );
  }

  const sizeChartData = sortByCanonicalOrder(sizeDistribution, (s) => s.size).map((s, i) => ({
    ...s,
    displayLabel: s.size,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const confidenceChartData = CONFIDENCE_BUCKET_ORDER.map((range, i) => {
    const bucket = confidenceDistribution.find((b) => b.range === range);
    return { range, count: bucket?.count || 0, displayLabel: range, fill: CHART_COLORS[i % CHART_COLORS.length] };
  });

  const feedbackChartData = feedbackStats
    ? feedbackStats.breakdown.map((b) => ({ ...b, displayLabel: FIT_LABELS[b.fitResult], fill: FIT_COLORS[b.fitResult] }))
    : [];

  const trend = calcTrend(dashboard.recommendationsThisMonth, dashboard.recommendationsLastMonth);
  const { requestsUsed, requestsLimit } = dashboard.usage;

  return (
    <div className={refreshing ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Analytics</h1>
          <p className="mt-1 text-sm text-ink-500">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ''}</p>
        </div>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />} onClick={() => loadAll({ silent: true })} disabled={refreshing}>
          Refresh
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total Recommendations"
          value={dashboard.totalRecommendations.toLocaleString()}
          sub="All time"
          badge={
            trend && (
              <Badge variant={trend.up ? 'success' : 'danger'}>
                {trend.up ? '↑' : '↓'} {trend.pct}%
              </Badge>
            )
          }
        />
        <StatCard label="Success Rate" value={`${dashboard.successRate}%`} sub="Of all attempts" />
        <StatCard
          label="Average Confidence"
          value={dashboard.averageConfidence != null ? `${Math.round(dashboard.averageConfidence * 100)}%` : '—'}
          sub="Across successful recommendations"
        />
        <StatCard label="API Requests" value={`${requestsUsed} / ${requestsLimit ?? '∞'}`} sub="Used this billing cycle" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Recommendations Over Time"
          action={
            <div className="flex rounded-lg border border-surface-border p-0.5 text-xs">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handlePeriodChange(opt.key)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors duration-150 ${
                    period === opt.key ? 'bg-primary text-white' : 'text-ink-500 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          }
          isEmpty={usage.every((u) => u.count === 0)}
          emptyLabel="No recommendations in this period"
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={usage} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={AXIS_TICK_STYLE}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis allowDecimals={false} tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<AreaChartTooltip />} cursor={{ stroke: GRID_STROKE, strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#4F46E5"
                strokeWidth={2}
                fill="#4F46E5"
                fillOpacity={0.08}
                dot={{ r: 3, fill: '#4F46E5', strokeWidth: 2, stroke: '#FFFFFF' }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#FFFFFF' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Average Confidence">
          <ConfidenceGauge confidence={dashboard.averageConfidence} />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Size Distribution" isEmpty={sizeChartData.length === 0} emptyLabel="No sized recommendations yet">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sizeChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="size" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<CategoryTooltip />} cursor={{ fill: 'rgba(79,70,229,0.04)' }} />
              <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={40}>
                {sizeChartData.map((entry) => (
                  <Cell key={entry.size} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Confidence Buckets"
          isEmpty={confidenceChartData.every((b) => b.count === 0)}
          emptyLabel="No confidence data yet"
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={confidenceChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="range" tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<CategoryTooltip />} cursor={{ fill: 'rgba(79,70,229,0.04)' }} />
              <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={40}>
                {confidenceChartData.map((entry) => (
                  <Cell key={entry.range} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
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
              <p className="text-xs text-ink-500">
                <span className="font-semibold text-ink-900">{feedbackStats.accuracyRate}%</span> of customers report an
                acceptable fit
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={feedbackChartData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                  <XAxis
                    dataKey="displayLabel"
                    tick={{ ...AXIS_TICK_STYLE, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis allowDecimals={false} tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} width={24} />
                  <Tooltip content={<CategoryTooltip />} cursor={{ fill: 'rgba(79,70,229,0.04)' }} />
                  <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={40}>
                    {feedbackChartData.map((entry) => (
                      <Cell key={entry.fitResult} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </ChartCard>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink-700">Recent Recommendations</h2>
            <Button
              variant="secondary"
              size="sm"
              icon={exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              onClick={handleExportCsv}
              disabled={exporting}
            >
              Export CSV
            </Button>
          </div>

          {recent.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-sm text-ink-500">No recommendations yet</div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-500">
                    <th className="py-2 pr-3 font-medium">Size</th>
                    <th className="py-2 pr-3 font-medium">Confidence</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r._id} className="border-b border-surface-border last:border-0">
                      <td className="py-2 pr-3 font-medium text-ink-900">{r.recommendedSize || '—'}</td>
                      <td className={`py-2 pr-3 font-medium ${confidenceTextColor(r.confidence)}`}>
                        {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={RECOMMENDATION_STATUS_VARIANT[r.status] || 'neutral'}>{r.status.replace('_', ' ')}</Badge>
                      </td>
                      <td className="py-2 text-ink-500">{formatDateTime(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default AnalyticsDashboardPage;
