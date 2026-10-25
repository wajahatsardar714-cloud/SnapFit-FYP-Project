import { Check, X } from 'lucide-react';
import DataTable from './DataTable';

function Item({ Icon, tone, text }) {
  return (
    <span className="flex min-w-0 items-start gap-2.5">
      <Icon aria-hidden="true" focusable="false" size={18} strokeWidth={2.25} className={`mt-1 shrink-0 ${tone}`} />
      <span className="min-w-0">{text}</span>
    </span>
  );
}

/**
 * Pros and cons side by side, one pair per row (built on DataTable).
 *   rows     [{ pro, con }]
 *   labels   { pro, con } column headings, default 'Pros' / 'Cons'
 *   caption  accessible caption (visually hidden)
 */
function ProsConsTable({ rows, labels = { pro: 'Pros', con: 'Cons' }, caption }) {
  const columns = [
    { key: 'pro', label: labels.pro, render: (row) => <Item Icon={Check} tone="text-success" text={row.pro} /> },
    { key: 'con', label: labels.con, render: (row) => <Item Icon={X} tone="text-danger" text={row.con} /> },
  ];
  return <DataTable columns={columns} rows={rows} caption={caption} rowKey={(row) => row.pro} />;
}

export default ProsConsTable;
