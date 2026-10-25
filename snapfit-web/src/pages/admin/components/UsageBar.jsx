import { formatUsage } from '../adminFormat';

// Requests used against the plan's cap; a null limit means unlimited (no bar
// to fill, just the count).
function UsageBar({ subscription }) {
  const used = subscription?.requestsUsed ?? 0;
  const limit = subscription?.requestsLimit;
  const unlimited = limit == null;
  let pct = 0;
  if (!unlimited) pct = limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const tone = pct >= 90 ? 'bg-danger' : pct >= 75 ? 'bg-warning' : 'bg-admin';

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">Requests used</span>
        <span className="font-medium text-foreground">{formatUsage(subscription)}</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="Requests used"
        aria-valuemin={0}
        aria-valuemax={unlimited ? undefined : limit}
        aria-valuenow={used}
        aria-valuetext={formatUsage(subscription)}
      >
        {!unlimited && <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />}
      </div>
      {unlimited && <p className="mt-1 text-xs text-muted-foreground">Unlimited requests on this account</p>}
    </div>
  );
}

export default UsageBar;
