import { CalendarClock, ExternalLink, Users } from 'lucide-react';
import Card from '../../../components/ui/Card';
import NotificationIcon from '../../../components/notifications/NotificationIcon';
import { formatDateTime } from '../adminFormat';
import { audienceSummary, formAudience } from '../announcementForm';

// How the announcement will look in a merchant's notifications, updated as
// the admin types.
function AnnouncementPreview({ form }) {
  const title = form.title.trim();
  const body = form.body.trim();
  const link = form.link.trim();
  const scheduled = form.schedule && form.scheduledAt;

  return (
    <Card>
      <h2 className="text-sm font-semibold text-foreground">Preview</h2>
      <p className="mt-1 text-xs text-muted-foreground">What merchants will see in their notifications.</p>

      <div aria-label="Notification preview" className="mt-4 overflow-hidden rounded-xl border border-border bg-background">
        <div className="flex gap-3 bg-primary-soft px-4 py-3">
          <NotificationIcon type="announcement" size="sm" />
          <div className="min-w-0 flex-1">
            <p className={`break-words text-sm font-semibold ${title ? 'text-foreground' : 'text-muted'}`}>
              {title || 'Your announcement title'}
            </p>
            <p className={`mt-0.5 whitespace-pre-line break-words text-xs ${body ? 'text-muted-foreground' : 'text-muted'}`}>
              {body || 'The message merchants will read.'}
            </p>
            <p className="mt-1 text-xs text-muted">just now</p>
          </div>
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users size={14} aria-hidden="true" />
          <dt className="sr-only">Audience</dt>
          <dd className="text-foreground">{audienceSummary(formAudience(form))}</dd>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarClock size={14} aria-hidden="true" />
          <dt className="sr-only">When</dt>
          <dd className="text-foreground">{scheduled ? `Scheduled for ${formatDateTime(form.scheduledAt)}` : 'Sent as soon as you confirm'}</dd>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <ExternalLink size={14} aria-hidden="true" />
          <dt className="sr-only">Opens</dt>
          <dd className="break-all text-foreground">{link ? `Opens ${link}` : 'Opens the notifications page'}</dd>
        </div>
      </dl>
    </Card>
  );
}

export default AnnouncementPreview;
