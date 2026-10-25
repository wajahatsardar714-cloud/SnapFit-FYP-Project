import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartTheme } from '../../../utils/chartTheme';
import { formatShortDate } from '../adminFormat';

// Each series keeps a meaningful colour: all requests in the admin accent,
// successes green, failures red.
const SERIES = [
  { key: 'total', label: 'Total', colour: 'admin', dot: 'bg-admin' },
  { key: 'success', label: 'Success', colour: 'success', dot: 'bg-success' },
  { key: 'failed', label: 'Failed', colour: 'danger', dot: 'bg-danger' },
];

const axisTick = (chart) => ({ fontSize: 12, fill: chart.axis });

function DailyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-card">
      <p className="text-xs text-muted-foreground">{formatShortDate(label)}</p>
      {SERIES.map(({ key, label: seriesLabel, dot }) => (
        <p key={key} className="mt-0.5 flex items-center gap-1.5 text-foreground">
          <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
          {seriesLabel}: <span className="font-semibold">{payload[0].payload[key] ?? 0}</span>
        </p>
      ))}
    </div>
  );
}

// Requests per day ({ date, total, success, failed }[]) as overlaid areas.
function DailyRequestsChart({ daily, height = 260 }) {
  const chart = useChartTheme();

  if (daily.every((day) => !day.total)) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No requests in this period
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {SERIES.map(({ key, label, dot }) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={daily} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={chart.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            tick={axisTick(chart)}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis allowDecimals={false} tick={axisTick(chart)} axisLine={false} tickLine={false} width={36} />
          <Tooltip content={<DailyTooltip />} cursor={{ stroke: chart.grid, strokeWidth: 1 }} />
          {SERIES.map(({ key, colour }) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={chart[colour]}
              strokeWidth={2}
              fill={chart[colour]}
              fillOpacity={key === 'total' ? 0.08 : 0}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: chart.background }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </>
  );
}

export default DailyRequestsChart;
