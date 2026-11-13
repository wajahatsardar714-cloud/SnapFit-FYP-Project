import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Ban, Download } from 'lucide-react';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import ConfirmModal from '../../../components/ui/ConfirmModal';
import { ListSkeleton } from '../../../components/ui/Skeleton';
import { downloadAdminReceiptPdf, listMerchantReceipts, voidReceipt } from '../../../services/receiptsApi';
import { saveBlob } from '../../../utils/download';
import { formatPeriod, formatReceiptDate, formatReceiptTotal, receiptStatus } from '../../../utils/receipts';
import { LoadError } from '../components/PageStatus';

const CELL = 'px-4 py-2.5';

// The merchant's receipts, with the PDF and a void action (a voided receipt
// stays on record, marked VOID).
function MerchantReceipts({ merchantId }) {
  const [receipts, setReceipts] = useState(null);
  const [failed, setFailed] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const load = useCallback(() => {
    setFailed(false);
    return listMerchantReceipts(merchantId)
      .then((res) => setReceipts(res?.receipts || []))
      .catch(() => setFailed(true));
  }, [merchantId]);

  useEffect(() => {
    setReceipts(null);
    load();
  }, [load]);

  async function download(receipt) {
    setDownloadingId(receipt._id);
    try {
      const { blob, filename } = await downloadAdminReceiptPdf(receipt._id, receipt.number);
      saveBlob(blob, filename);
    } catch {
      toast.error("Couldn't download the PDF");
    } finally {
      setDownloadingId(null);
    }
  }

  async function confirmVoid() {
    setVoiding(true);
    try {
      const res = await voidReceipt(voidTarget._id);
      const updated = res?.receipt || { ...voidTarget, status: 'void', voidedAt: new Date().toISOString() };
      setReceipts((prev) => prev.map((r) => (r._id === voidTarget._id ? { ...r, ...updated } : r)));
      toast.success(`Receipt ${voidTarget.number} voided`);
      setVoidTarget(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't void the receipt");
    } finally {
      setVoiding(false);
    }
  }

  return (
    <Card padding="sm">
      <h2 className="px-2 pb-3 text-sm font-medium text-foreground">
        Receipts {receipts && <span className="text-muted-foreground">({receipts.length})</span>}
      </h2>
      {failed ? (
        <div className="px-2 pb-2">
          <LoadError message="Couldn't load the receipts." onRetry={load} />
        </div>
      ) : !receipts ? (
        <ListSkeleton rows={2} />
      ) : receipts.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">No receipts issued yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-surface-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className={CELL}>Receipt</th>
                <th className={CELL}>Issued</th>
                <th className={CELL}>Plan</th>
                <th className={CELL}>Period</th>
                <th className={`${CELL} text-right`}>Total</th>
                <th className={CELL}>Status</th>
                <th className={CELL}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {receipts.map((receipt) => {
                const status = receiptStatus(receipt.status);
                return (
                  <tr key={receipt._id} className="text-foreground">
                    <td className={`${CELL} whitespace-nowrap font-mono text-xs font-medium`}>{receipt.number}</td>
                    <td className={`${CELL} whitespace-nowrap text-muted-foreground`}>{formatReceiptDate(receipt.issuedAt)}</td>
                    <td className={CELL}>{receipt.planName || receipt.plan}</td>
                    <td className={`${CELL} whitespace-nowrap text-muted-foreground`}>
                      {formatPeriod(receipt.periodStart, receipt.periodEnd)}
                    </td>
                    <td className={`${CELL} whitespace-nowrap text-right font-medium`}>{formatReceiptTotal(receipt)}</td>
                    <td className={CELL}>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    <td className={CELL}>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Download size={14} />}
                          loading={downloadingId === receipt._id}
                          onClick={() => download(receipt)}
                          aria-label={`Download PDF of ${receipt.number}`}
                        >
                          PDF
                        </Button>
                        {receipt.status !== 'void' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Ban size={14} />}
                            className="!text-danger hover:!bg-danger-soft"
                            onClick={() => setVoidTarget(receipt)}
                            aria-label={`Void ${receipt.number}`}
                          >
                            Void
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={Boolean(voidTarget)}
        title={`Void receipt ${voidTarget?.number ?? ''}?`}
        description="The receipt stays on record but is marked VOID for the merchant and on its PDF. This cannot be undone."
        confirmLabel="Void receipt"
        tone="danger"
        loading={voiding}
        onConfirm={confirmVoid}
        onClose={() => !voiding && setVoidTarget(null)}
      />
    </Card>
  );
}

export default MerchantReceipts;
