import { useState } from 'react';
import toast from 'react-hot-toast';
import { Megaphone } from 'lucide-react';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import ConfirmModal from '../../../components/ui/ConfirmModal';
import { cancelAnnouncement } from '../../../services/announcementsApi';
import { formatDateTime, formatNumber } from '../adminFormat';
import { audienceSummary } from '../announcementForm';

const STATUS = {
  scheduled: { label: 'Scheduled', variant: 'info' },
  sent: { label: 'Sent', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
};

function when(announcement) {
  if (announcement.status === 'sent') return `Sent ${formatDateTime(announcement.sentAt || announcement.createdAt)}`;
  if (announcement.status === 'scheduled') return `Scheduled for ${formatDateTime(announcement.scheduledAt)}`;
  return announcement.scheduledAt ? `Was due ${formatDateTime(announcement.scheduledAt)}` : '—';
}

function readSummary({ status, readCount, recipientCount }) {
  if (status !== 'sent') return '—';
  const read = readCount ?? 0;
  const pct = recipientCount ? ` (${Math.round((read / recipientCount) * 100)}%)` : '';
  return `${formatNumber(read)}${pct}`;
}

// Past and scheduled announcements, newest first. A scheduled one can still be
// cancelled.
function AnnouncementHistory({ announcements, onCancelled }) {
  const [target, setTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  async function confirmCancel() {
    setCancelling(true);
    try {
      const res = await cancelAnnouncement(target._id);
      toast.success('Scheduled announcement cancelled');
      onCancelled(res?.announcement || { ...target, status: 'cancelled' });
      setTarget(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't cancel the announcement");
    } finally {
      setCancelling(false);
    }
  }

  if (announcements.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-12 text-center shadow-card">
        <Megaphone size={32} className="text-muted" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No announcements yet. The ones you send or schedule appear here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-surface-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Announcement</th>
                <th className="px-4 py-3">Audience</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3 text-right">Recipients</th>
                <th className="px-4 py-3 text-right">Read</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {announcements.map((a) => {
                const status = STATUS[a.status] || { label: a.status, variant: 'neutral' };
                return (
                  <tr key={a._id} className="align-top text-foreground">
                    <td className="max-w-xs px-4 py-3">
                      <p className="font-medium">{a.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
                      {a.createdBy?.email && <p className="mt-1 text-xs text-muted">by {a.createdBy.email}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{audienceSummary(a.audience)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{when(a)}</td>
                    <td className="px-4 py-3 text-right">{a.status === 'sent' ? formatNumber(a.recipientCount) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{readSummary(a)}</td>
                    <td className="px-4 py-3 text-right">
                      {a.status === 'scheduled' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="!text-danger hover:!bg-danger-soft"
                          onClick={() => setTarget(a)}
                          aria-label={`Cancel "${a.title}"`}
                        >
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(target)}
        title="Cancel this announcement?"
        description={target ? `"${target.title}" will not be sent. You can compose it again later.` : ''}
        confirmLabel="Cancel announcement"
        cancelLabel="Keep it"
        tone="danger"
        loading={cancelling}
        onConfirm={confirmCancel}
        onClose={() => !cancelling && setTarget(null)}
      />
    </>
  );
}

export default AnnouncementHistory;
