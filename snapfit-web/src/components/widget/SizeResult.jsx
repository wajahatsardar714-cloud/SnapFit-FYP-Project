import { useId } from 'react';
import { AlertTriangle, Lightbulb } from 'lucide-react';

const MEASUREMENT_LABELS = {
  shoulderWidth: 'Shoulders',
  chest: 'Chest',
  waist: 'Waist',
  hip: 'Hips',
  torsoLength: 'Torso length',
  inseam: 'Inseam',
};

const STATUS_STYLES = {
  within: 'bg-success-soft font-semibold text-success',
  below: 'text-muted-foreground',
  above: 'text-muted-foreground',
};

export function confidenceTone(confidence) {
  const pct = confidence * 100;
  if (pct > 70) return { bar: 'bg-success', text: 'text-success' };
  if (pct >= 50) return { bar: 'bg-warning', text: 'text-warning' };
  return { bar: 'bg-danger', text: 'text-danger' };
}

const formatRange = (entry) => (entry ? `${Math.round(entry.min)}–${Math.round(entry.max)}` : '—');

// The recommended size plus its neighbours in chart order, so the table shows
// where the shopper sits relative to the sizes either side.
function columnsAround(sizeComparison, recommended) {
  const index = sizeComparison.findIndex((size) => size.label === recommended);
  if (index === -1) return [];
  return sizeComparison.slice(Math.max(0, index - 1), index + 2);
}

function ComparisonTable({ result }) {
  const columns = columnsAround(result.sizeComparison || [], result.size);
  const recommendedEntry = columns.find((size) => size.label === result.size);
  const rows = recommendedEntry?.perMeasurement || [];
  if (rows.length === 0) return null;

  const hasEstimates = rows.some((row) => result.measurements?.[row.name]?.estimated);

  return (
    <div className="mt-4 text-left">
      <table className="w-full text-xs" aria-label="Your measurements compared with the size chart">
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="py-1 pr-2 text-left font-medium">
              cm
            </th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">
              You
            </th>
            {columns.map((size) => (
              <th
                key={size.label}
                scope="col"
                className={`px-1 py-1 text-center font-medium ${size.label === result.size ? 'text-foreground' : ''}`}
              >
                {size.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const estimated = result.measurements?.[row.name]?.estimated;
            return (
              <tr key={row.name}>
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-muted-foreground">
                  {MEASUREMENT_LABELS[row.name] || row.name}
                </th>
                <td className="py-1.5 pr-2 text-right font-medium text-foreground">
                  {estimated && (
                    <span className="mr-0.5 text-muted-foreground" title="Estimated from your photo">
                      ≈
                    </span>
                  )}
                  {Math.round(row.userValue)}
                </td>
                {columns.map((size) => {
                  const entry = size.perMeasurement.find((m) => m.name === row.name);
                  return (
                    <td key={size.label} className={`rounded px-1 py-1.5 text-center ${entry ? STATUS_STYLES[entry.status] : 'text-muted'}`}>
                      {formatRange(entry)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasEstimates && (
        <p className="mt-1 text-[11px] text-muted-foreground">≈ estimated from your photo — circumferences can&apos;t be measured directly.</p>
      )}
    </div>
  );
}

// Server-written warnings about the result itself (e.g. a possible child),
// shown above the size so they're read before it.
function Warnings({ warnings }) {
  if (warnings.length === 0) return null;
  return (
    <ul aria-label="Warnings" className="mb-4 space-y-1 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-left text-sm text-foreground">
      {warnings.map((warning) => (
        <li key={warning.id} className="flex gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          {warning.message}
        </li>
      ))}
    </ul>
  );
}

function PhotoTips({ tips }) {
  const headingId = useId();
  if (tips.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-left">
      <h3 id={headingId} className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Lightbulb size={14} className="text-muted-foreground" aria-hidden="true" />
        Tips for a better photo
      </h3>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
        {tips.map((tip) => (
          <li key={tip.id}>{tip.message}</li>
        ))}
      </ul>
    </section>
  );
}

// Size recommendation result: warnings, size, confidence bar, measurement
// comparison against the recommended and neighbouring sizes, fit notes and
// tips for a better photo.
function SizeResult({ result }) {
  const tone = confidenceTone(result.confidence);
  const pct = Math.round(result.confidence * 100);
  const fitNotes = result.fitNotes?.length ? result.fitNotes : result.notes ? [result.notes] : [];

  return (
    <div className="text-center">
      <Warnings warnings={result.warnings || []} />

      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
        {result.size}
      </div>
      {result.alternativeSize && (
        <p className="mt-2 text-xs text-muted-foreground">
          Also consider <span className="font-semibold text-foreground">{result.alternativeSize}</span>
        </p>
      )}

      <div className="mt-4 text-left">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Confidence</span>
          <span className={tone.text}>{pct}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {result.bodyType && (
        <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
          Body type: <span className="font-medium text-muted-foreground">{result.bodyType}</span>
        </p>
      )}

      <ComparisonTable result={result} />

      {fitNotes.length > 0 && (
        <ul className="mt-3 space-y-1 text-left text-sm text-muted-foreground">
          {fitNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <PhotoTips tips={result.photoTips || []} />
    </div>
  );
}

export default SizeResult;
