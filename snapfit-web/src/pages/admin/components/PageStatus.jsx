import { Loader2, RefreshCw } from 'lucide-react';
import Alert from '../../../components/ui/Alert';
import Button from '../../../components/ui/Button';

export function PageLoader() {
  return (
    <div className="flex justify-center py-16" role="status" aria-label="Loading">
      <Loader2 className="animate-spin text-muted" size={28} />
    </div>
  );
}

export function LoadError({ message, onRetry }) {
  return (
    <div className="space-y-3">
      <Alert variant="danger" title={message} />
      <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
