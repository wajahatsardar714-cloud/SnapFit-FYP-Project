import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { getAuditLog } from '../../services/adminApi';
import Pagination from './components/Pagination';
import { LoadError, PageLoader } from './components/PageStatus';
import { formatAction, formatDateTime, humanize } from './adminFormat';

const PAGE_SIZE = 20;

function JsonBlock({ label, value }) {
  return (
    <div className="min-w-0 flex-1">
      {label && <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>}
      <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs text-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

// Changes are logged as { before, after } where it makes sense; any other
// details object is shown as it is.
function EntryDetails({ details }) {
  if (!details || Object.keys(details).length === 0) return <span className="text-muted-foreground">—</span>;
  const hasDiff = 'before' in details || 'after' in details;

  return (
    <details>
      <summary className="cursor-pointer select-none text-sm font-medium text-primary">
        {hasDiff ? 'Before / after' : 'Details'}
      </summary>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        {hasDiff ? (
          <>
            <JsonBlock label="Before" value={details.before ?? null} />
            <JsonBlock label="After" value={details.after ?? null} />
          </>
        ) : (
          <JsonBlock value={details} />
        )}
      </div>
    </details>
  );
}

function Target({ entry }) {
  const label = entry.targetLabel || entry.targetId || '—';
  if (entry.targetType === 'merchant' && entry.targetId && !entry.action?.includes('delete')) {
    return <Link to={`/admin/merchants/${entry.targetId}`}>{label}</Link>;
  }
  return <span>{label}</span>;
}

function AdminAuditLogPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    getAuditLog({ page, limit: PAGE_SIZE })
      .then(setResult)
      .catch(() => setFailed(true));
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Audit log</h1>
      <p className="mt-1 text-sm text-muted-foreground">Every change made from the admin console, newest first.</p>

      <div className="mt-6">
        {failed ? (
          <LoadError message="Couldn't load the audit log." onRetry={load} />
        ) : !result ? (
          <PageLoader />
        ) : result.entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-14 text-center shadow-card">
            <ScrollText size={36} className="text-muted" />
            <p className="text-sm text-muted-foreground">No admin actions have been recorded yet.</p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-surface-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Admin</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Target</th>
                      <th className="px-4 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.entries.map((entry) => (
                      <tr key={entry._id} className="align-top text-foreground">
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(entry.createdAt)}</td>
                        <td className="px-4 py-3">{entry.adminEmail}</td>
                        <td className="px-4 py-3 font-medium">{formatAction(entry.action)}</td>
                        <td className="px-4 py-3">
                          <Target entry={entry} />
                          {entry.targetType && <p className="text-xs text-muted-foreground">{humanize(entry.targetType)}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <EntryDetails details={entry.details} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <Pagination page={result.page} pages={result.pages} total={result.total} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

export default AdminAuditLogPage;
