import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReceiptText } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import { ListSkeleton } from '../../components/ui/Skeleton';
import { listReceipts } from '../../services/receiptsApi';
import { formatPeriod, formatReceiptDate, formatReceiptTotal, receiptStatus } from '../../utils/receipts';
import { LoadError } from '../admin/components/PageStatus';

// Every receipt issued to the merchant (one per plan chosen or changed),
// newest first.
function ReceiptsPage() {
  const [receipts, setReceipts] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    return listReceipts()
      .then((res) => setReceipts(res?.receipts || []))
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Receipts</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A receipt is issued each time your plan starts or changes. Open one to print it or download a PDF.
      </p>

      <div className="mt-6">
        {failed ? (
          <LoadError message="Couldn't load your receipts." onRetry={load} />
        ) : !receipts ? (
          <div className="rounded-xl border border-border bg-surface shadow-card">
            <ListSkeleton rows={4} />
          </div>
        ) : receipts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-14 text-center shadow-card">
            <ReceiptText size={36} className="text-muted" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">No receipts yet</p>
            <p className="text-sm text-muted-foreground">
              Your first receipt appears when you <Link to="/dashboard/subscription/plans">choose a plan</Link>.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-surface-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {receipts.map((receipt) => {
                    const status = receiptStatus(receipt.status);
                    return (
                      <tr key={receipt._id} className="text-foreground transition-colors duration-150 hover:bg-surface-2">
                        <td className="whitespace-nowrap px-4 py-3">
                          <Link to={`/dashboard/receipts/${receipt._id}`} className="font-mono font-medium">
                            {receipt.number}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatReceiptDate(receipt.issuedAt)}</td>
                        <td className="px-4 py-3">{receipt.planName || receipt.plan}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatPeriod(receipt.periodStart, receipt.periodEnd)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{formatReceiptTotal(receipt)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReceiptsPage;
