import logo from '../../assets/snapfit-logo.webp';
import Badge from '../ui/Badge';
import {
  formatMoney,
  formatPeriod,
  formatReceiptDate,
  formatReceiptTotal,
  formatTaxRate,
  receiptReason,
  receiptStatus,
} from '../../utils/receipts';

const DEMO_PAYMENT_METHOD = 'Demo (no charge)';

function Field({ label, children }) {
  return (
    <div className="flex justify-between gap-6 sm:justify-end">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground sm:min-w-[9rem] sm:text-right">{children}</dd>
    </div>
  );
}

function TotalRow({ label, children, strong = false }) {
  return (
    <div className={`flex justify-between gap-6 py-1.5 ${strong ? 'border-t border-border pt-3 text-base font-bold text-foreground' : 'text-sm'}`}>
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className={strong ? '' : 'font-medium text-foreground'}>{children}</dd>
    </div>
  );
}

// A subscription receipt laid out like a printed page. It always uses the
// light palette (data-theme="light"), so it reads as paper in dark mode and
// prints the same.
function ReceiptDocument({ receipt }) {
  const seller = { name: 'SnapFit', ...(receipt.seller || {}) };
  const merchant = receipt.merchant || {};
  const status = receiptStatus(receipt.status);
  const isVoid = receipt.status === 'void';
  const planName = receipt.planName || receipt.plan;
  const hasCustomPrice = !receipt.amount && Boolean(receipt.priceNote);
  const reason = receiptReason(receipt.reason);

  return (
    <article
      data-theme="light"
      aria-label={`Receipt ${receipt.number}`}
      className="receipt-document relative overflow-hidden rounded-xl border border-border bg-surface p-6 text-foreground shadow-card sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none"
    >
      {isVoid && (
        <div className="mb-6 rounded-lg border-2 border-danger bg-danger-soft px-4 py-3 text-center text-danger">
          <p className="text-lg font-bold tracking-[0.3em]">VOID</p>
          <p className="mt-0.5 text-sm">
            This receipt was voided{receipt.voidedAt ? ` on ${formatReceiptDate(receipt.voidedAt)}` : ''} and is no longer valid.
          </p>
        </div>
      )}

      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-border pb-6">
        <div>
          <img src={logo} alt="SnapFit" width={190} height={161} className="h-14 w-auto" />
          <address className="mt-3 text-sm not-italic leading-6 text-body">
            <span className="block font-semibold text-foreground">{seller.name}</span>
            {seller.address && <span className="block whitespace-pre-line">{seller.address}</span>}
            {seller.email && <span className="block">{seller.email}</span>}
            {seller.website && <span className="block">{seller.website}</span>}
          </address>
        </div>
        <div className="w-full sm:w-auto">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-right">Receipt</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <Field label="Receipt no.">
              <span className="font-mono">{receipt.number}</span>
            </Field>
            <Field label="Date issued">{formatReceiptDate(receipt.issuedAt)}</Field>
            <Field label="Status">
              <Badge variant={status.variant}>{status.label}</Badge>
            </Field>
          </dl>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-6 border-b border-border py-6 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billed to</h3>
          <div className="mt-2 text-sm leading-6 text-body">
            <p className="font-semibold text-foreground">{merchant.businessName || '—'}</p>
            {merchant.name && <p>{merchant.name}</p>}
            {merchant.email && <p>{merchant.email}</p>}
            {merchant.phone && <p>{merchant.phone}</p>}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subscription</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Plan:</dt>
              <dd className="font-medium text-foreground">{planName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Billing period:</dt>
              <dd className="font-medium text-foreground">{formatPeriod(receipt.periodStart, receipt.periodEnd)}</dd>
            </div>
            {reason && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Reason:</dt>
                <dd className="font-medium text-foreground">{reason}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      <div className="overflow-x-auto py-6">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4">Period</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border align-top">
              <td className="py-3 pr-4">
                <p className="font-medium text-foreground">SnapFit {planName} plan</p>
                <p className="text-xs text-muted-foreground">Monthly subscription</p>
              </td>
              <td className="whitespace-nowrap py-3 pr-4 text-body">{formatPeriod(receipt.periodStart, receipt.periodEnd)}</td>
              <td className="whitespace-nowrap py-3 text-right font-medium text-foreground">
                {hasCustomPrice ? receipt.priceNote : formatMoney(receipt.amount, receipt.currency)}
              </td>
            </tr>
          </tbody>
        </table>

        <dl className="ml-auto mt-4 w-full max-w-xs">
          <TotalRow label="Subtotal">{formatMoney(receipt.amount, receipt.currency)}</TotalRow>
          <TotalRow label={`Tax (${formatTaxRate(receipt.taxRate)})`}>{formatMoney(receipt.taxAmount, receipt.currency)}</TotalRow>
          <TotalRow label={`Total (${receipt.currency || 'USD'})`} strong>
            {formatReceiptTotal(receipt)}
          </TotalRow>
        </dl>
      </div>

      <section className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
        <p>
          <span className="text-muted-foreground">Payment method: </span>
          <span className="font-semibold text-foreground">{receipt.paymentMethod || DEMO_PAYMENT_METHOD}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          No payment was taken. SnapFit runs without a payment gateway, so this receipt records the plan and price only.
        </p>
      </section>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        Thank you for using {seller.name}. Keep this receipt for your records.
      </footer>
    </article>
  );
}

export default ReceiptDocument;
