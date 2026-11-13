import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarClock, Send } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import Alert from '../../components/ui/Alert';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { ListSkeleton } from '../../components/ui/Skeleton';
import { FIELD_ERROR_CLASSES } from '../../components/ui/fieldStyles';
import { createAnnouncement, listAnnouncements } from '../../services/announcementsApi';
import { PLANS, formatPlanName } from '../../utils/plans';
import { LoadError } from './components/PageStatus';
import MerchantPicker from './announcements/MerchantPicker';
import AnnouncementPreview from './announcements/AnnouncementPreview';
import AnnouncementHistory from './announcements/AnnouncementHistory';
import {
  BODY_MAX,
  EMPTY_ANNOUNCEMENT,
  TITLE_MAX,
  audienceSummary,
  buildAnnouncementPayload,
  formAudience,
  toDateTimeLocal,
  validateAnnouncement,
} from './announcementForm';
import { formatDateTime } from './adminFormat';

const AUDIENCES = [
  { value: 'all', label: 'All merchants', hint: 'Every merchant account' },
  { value: 'plan', label: 'By plan', hint: 'Merchants on the plans you choose' },
  { value: 'merchants', label: 'Specific merchants', hint: 'Only the merchants you pick' },
];

function Counter({ value, max }) {
  const over = value > max;
  return (
    <p className={`mt-1 text-right text-xs ${over ? 'font-medium text-danger' : 'text-muted-foreground'}`}>
      {value}/{max}
    </p>
  );
}

function AdminAnnouncementsPage() {
  const [form, setForm] = useState(EMPTY_ANNOUNCEMENT);
  const [errors, setErrors] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyFailed, setHistoryFailed] = useState(false);

  const loadHistory = useCallback(() => {
    setHistoryFailed(false);
    return listAnnouncements()
      .then((res) => setHistory(res?.announcements || []))
      .catch(() => setHistoryFailed(true));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function update(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch)) delete next[key];
      if ('audienceType' in patch) {
        delete next.plans;
        delete next.merchants;
      }
      if ('schedule' in patch) delete next.scheduledAt;
      return next;
    });
  }

  function togglePlan(plan) {
    update({ plans: form.plans.includes(plan) ? form.plans.filter((p) => p !== plan) : [...form.plans, plan] });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = validateAnnouncement(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setConfirming(true);
  }

  async function send() {
    setSending(true);
    try {
      const res = await createAnnouncement(buildAnnouncementPayload(form));
      const announcement = res?.announcement;
      if (form.schedule) {
        toast.success(`Announcement scheduled for ${formatDateTime(form.scheduledAt)}`);
      } else {
        const count = announcement?.recipientCount;
        toast.success(count == null ? 'Announcement sent' : `Announcement sent to ${count} merchant${count === 1 ? '' : 's'}`);
      }
      setConfirming(false);
      setForm(EMPTY_ANNOUNCEMENT);
      setErrors({});
      if (announcement) setHistory((prev) => [announcement, ...(prev || []).filter((a) => a._id !== announcement._id)]);
      loadHistory();
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't send the announcement");
    } finally {
      setSending(false);
    }
  }

  function applyCancelled(announcement) {
    setHistory((prev) => prev.map((a) => (a._id === announcement._id ? { ...a, ...announcement } : a)));
  }

  const errorCount = Object.keys(errors).length;
  const summary = audienceSummary(formAudience(form));
  const confirmText = form.schedule
    ? `${summary} will be notified on ${formatDateTime(form.scheduledAt)}. You can cancel it until then.`
    : `${summary} will be notified straight away. This cannot be undone.`;

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">Announcements</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Send a message to merchants&apos; notifications now, or schedule it for later.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">Compose</h2>
          <form noValidate aria-label="Compose announcement" onSubmit={handleSubmit} className="mt-4 space-y-5">
            {errorCount > 0 && (
              <Alert variant="danger" description="Please fix the highlighted fields below." />
            )}

            <div>
              <Input
                id="announcement-title"
                name="title"
                label="Title"
                value={form.title}
                onChange={(e) => update({ title: e.target.value })}
                error={errors.title}
                placeholder="e.g. Scheduled maintenance on Sunday"
              />
              <Counter value={form.title.trim().length} max={TITLE_MAX} />
            </div>

            <div>
              <Textarea
                id="announcement-body"
                name="body"
                label="Message"
                rows={5}
                value={form.body}
                onChange={(e) => update({ body: e.target.value })}
                error={errors.body}
                placeholder="What do merchants need to know?"
              />
              <Counter value={form.body.trim().length} max={BODY_MAX} />
            </div>

            <div>
              <Input
                id="announcement-link"
                name="link"
                label="In-app link (optional)"
                value={form.link}
                onChange={(e) => update({ link: e.target.value })}
                error={errors.link}
                placeholder="/dashboard/subscription/plans"
              />
              {!errors.link && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Where the notification opens. Leave empty to open the notifications page.
                </p>
              )}
            </div>

            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-foreground">Audience</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {AUDIENCES.map((option) => {
                  const checked = form.audienceType === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer gap-2 rounded-lg border px-3 py-2.5 transition-colors duration-150 ${
                        checked ? 'border-admin bg-admin-soft' : 'border-border hover:bg-surface-2'
                      }`}
                    >
                      <input
                        type="radio"
                        name="audience"
                        value={option.value}
                        checked={checked}
                        onChange={() => update({ audienceType: option.value })}
                        className="mt-0.5 accent-admin"
                      />
                      <span>
                        <span className="block text-sm font-medium text-foreground">{option.label}</span>
                        <span className="block text-xs text-muted-foreground">{option.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {form.audienceType === 'plan' && (
              <fieldset aria-describedby={errors.plans ? 'announcement-plans-error' : undefined}>
                <legend className="mb-2 text-[13px] font-semibold text-foreground">Plans</legend>
                <div className="flex flex-wrap gap-4">
                  {PLANS.map((plan) => (
                    <label key={plan} className="inline-flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={form.plans.includes(plan)}
                        onChange={() => togglePlan(plan)}
                        className="accent-admin"
                      />
                      {formatPlanName(plan)}
                    </label>
                  ))}
                </div>
                {errors.plans && (
                  <p id="announcement-plans-error" className={FIELD_ERROR_CLASSES}>
                    {errors.plans}
                  </p>
                )}
              </fieldset>
            )}

            {form.audienceType === 'merchants' && (
              <MerchantPicker selected={form.merchants} onChange={(merchants) => update({ merchants })} error={errors.merchants} />
            )}

            <div className="space-y-3">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={form.schedule}
                  onChange={(e) => update({ schedule: e.target.checked })}
                  className="accent-admin"
                />
                Schedule for later
              </label>
              {form.schedule && (
                <div className="max-w-xs">
                  <Input
                    id="announcement-scheduled-at"
                    name="scheduledAt"
                    type="datetime-local"
                    label="Send at"
                    min={toDateTimeLocal(new Date())}
                    value={form.scheduledAt}
                    onChange={(e) => update({ scheduledAt: e.target.value })}
                    error={errors.scheduledAt}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button
                variant="ghost"
                disabled={sending}
                onClick={() => {
                  setForm(EMPTY_ANNOUNCEMENT);
                  setErrors({});
                }}
              >
                Clear
              </Button>
              <Button type="submit" icon={form.schedule ? <CalendarClock size={16} /> : <Send size={16} />}>
                {form.schedule ? 'Schedule announcement' : 'Send announcement'}
              </Button>
            </div>
          </form>
        </Card>

        <div className="lg:sticky lg:top-0 lg:self-start">
          <AnnouncementPreview form={form} />
        </div>
      </div>

      <section className="mt-8" aria-labelledby="announcement-history-heading">
        <h2 id="announcement-history-heading" className="text-base font-semibold text-foreground">
          History
        </h2>
        <div className="mt-3">
          {historyFailed ? (
            <LoadError message="Couldn't load past announcements." onRetry={loadHistory} />
          ) : !history ? (
            <div className="rounded-xl border border-border bg-surface shadow-card">
              <ListSkeleton rows={3} />
            </div>
          ) : (
            <AnnouncementHistory announcements={history} onCancelled={applyCancelled} />
          )}
        </div>
      </section>

      <ConfirmModal
        open={confirming}
        title={form.schedule ? 'Schedule this announcement?' : 'Send this announcement now?'}
        description={confirmText}
        confirmLabel={form.schedule ? 'Schedule' : 'Send now'}
        loading={sending}
        onConfirm={send}
        onClose={() => !sending && setConfirming(false)}
      />
    </div>
  );
}

export default AdminAnnouncementsPage;
