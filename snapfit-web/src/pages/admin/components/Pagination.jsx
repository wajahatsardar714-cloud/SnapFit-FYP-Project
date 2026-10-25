import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '../../../components/ui/Button';

function Pagination({ page, pages, total, onChange }) {
  if (pages <= 1) return null;

  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Page {page} of {pages} ({total.toLocaleString()} total)
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<ChevronLeft size={14} />}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Prev
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
          <ChevronRight size={14} />
        </Button>
      </div>
    </nav>
  );
}

export default Pagination;
