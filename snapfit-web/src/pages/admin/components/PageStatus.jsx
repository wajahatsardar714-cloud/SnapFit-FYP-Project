import { RefreshCw } from 'lucide-react';
import Alert from '../../../components/ui/Alert';
import Button from '../../../components/ui/Button';

// Shimmering placeholders in the shape of an admin page.
export { PageSkeleton as PageLoader } from '../../../components/ui/Skeleton';

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
