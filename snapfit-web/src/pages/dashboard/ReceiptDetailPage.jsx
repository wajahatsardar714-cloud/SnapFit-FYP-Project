import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { PageSkeleton } from '../../components/ui/Skeleton';
import ReceiptDocument from '../../components/receipts/ReceiptDocument';
import { downloadReceiptPdf, getReceipt } from '../../services/receiptsApi';
import { saveBlob } from '../../utils/download';
import { LoadError } from '../admin/components/PageStatus';

function BackLink() {
  return (
    <Link to="/dashboard/receipts" className="inline-flex items-center gap-1 text-sm font-medium print:hidden">
      <ArrowLeft size={14} aria-hidden="true" />
      All receipts
    </Link>
  );
}

// One receipt, laid out for reading and printing. Print hides the dashboard
// chrome (sidebar, header, these buttons) so only the receipt is on paper.
function ReceiptDetailPage() {
  const { id } = useParams();
  const [receipt, setReceipt] = useState(null);
  const [failed, setFailed] = useState(null); // null | 'missing' | 'error'
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(() => {
    setFailed(null);
    return getReceipt(id)
      .then((res) => {
        if (res?.receipt) setReceipt(res.receipt);
        else setFailed('missing');
      })
      .catch((err) => setFailed(err.response?.status === 404 ? 'missing' : 'error'));
  }, [id]);

  useEffect(() => {
    setReceipt(null);
    load();
  }, [load]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const { blob, filename } = await downloadReceiptPdf(receipt._id, receipt.number);
      saveBlob(blob, filename);
    } catch {
      toast.error("Couldn't download the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  // The page title becomes the suggested file name in "Save as PDF".
  function handlePrint() {
    const previous = document.title;
    document.title = `SnapFit receipt ${receipt.number}`;
    try {
      window.print();
    } finally {
      document.title = previous;
    }
  }

  if (failed === 'missing') {
    return (
      <div className="max-w-3xl space-y-4">
        <BackLink />
        <Alert variant="warning" title="Receipt not found" description="It may have been removed, or the link is wrong." />
      </div>
    );
  }
  if (failed) {
    return (
      <div className="max-w-3xl space-y-4">
        <BackLink />
        <LoadError message="Couldn't load this receipt." onRetry={load} />
      </div>
    );
  }
  if (!receipt) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink />
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<Printer size={14} />} onClick={handlePrint}>
            Print
          </Button>
          <Button size="sm" icon={<Download size={14} />} loading={downloading} onClick={handleDownload}>
            Download PDF
          </Button>
        </div>
      </div>

      <ReceiptDocument receipt={receipt} />
    </div>
  );
}

export default ReceiptDetailPage;
