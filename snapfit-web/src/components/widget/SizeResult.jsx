const MEASUREMENT_LABELS = {
  shoulderWidth: 'Shoulders',
  chest: 'Chest',
  waist: 'Waist',
  hip: 'Hips',
  torsoLength: 'Torso length',
  inseam: 'Inseam',
};

const STATUS_STYLES = {
  within: 'bg-green-50 font-semibold text-green-800',
  below: 'text-gray-500',
  above: 'text-gray-500',
};

export function confidenceTone(confidence) {
  const pct = confidence * 100;
  if (pct > 70) return { bar: 'bg-green-500', text: 'text-green-700' };
  if (pct >= 50) return { bar: 'bg-yellow-500', text: 'text-yellow-700' };
  return { bar: 'bg-red-500', text: 'text-red-700' };
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
          <tr className="text-gray-500">
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
                className={`px-1 py-1 text-center font-medium ${size.label === result.size ? 'text-gray-900' : ''}`}
              >
                {size.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const estimated = result.measurements?.[row.name]?.estimated;
            return (
              <tr key={row.name}>
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-gray-600">
                  {MEASUREMENT_LABELS[row.name] || row.name}
                </th>
                <td className="py-1.5 pr-2 text-right font-medium text-gray-900">
                  {estimated && (
                    <span className="mr-0.5 text-gray-400" title="Estimated from your photo">
                      ≈
                    </span>
                  )}
                  {Math.round(row.userValue)}
                </td>
                {columns.map((size) => {
                  const entry = size.perMeasurement.find((m) => m.name === row.name);
                  return (
                    <td key={size.label} className={`rounded px-1 py-1.5 text-center ${entry ? STATUS_STYLES[entry.status] : 'text-gray-300'}`}>
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
        <p className="mt-1 text-[11px] text-gray-400">≈ estimated from your photo — circumferences can&apos;t be measured directly.</p>
      )}
    </div>
  );
}

// Size recommendation result: size, confidence bar, measurement comparison
// against the recommended and neighbouring sizes, and fit notes.
function SizeResult({ result }) {
  const tone = confidenceTone(result.confidence);
  const pct = Math.round(result.confidence * 100);
  const fitNotes = result.fitNotes?.length ? result.fitNotes : result.notes ? [result.notes] : [];

  return (
    <div className="text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-900 text-2xl font-bold text-white">
        {result.size}
      </div>
      {result.alternativeSize && (
        <p className="mt-2 text-xs text-gray-500">
          Also consider <span className="font-semibold text-gray-700">{result.alternativeSize}</span>
        </p>
      )}

      <div className="mt-4 text-left">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Confidence</span>
          <span className={tone.text}>{pct}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {result.bodyType && (
        <p className="mt-3 text-xs uppercase tracking-wide text-gray-400">
          Body type: <span className="font-medium text-gray-600">{result.bodyType}</span>
        </p>
      )}

      <ComparisonTable result={result} />

      {fitNotes.length > 0 && (
        <ul className="mt-3 space-y-1 text-left text-sm text-gray-600">
          {fitNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SizeResult;
