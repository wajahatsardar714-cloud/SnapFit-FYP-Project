import { formatPlanName } from '../../utils/plans';

// Limits from the API contract for POST /admin/announcements.
export const TITLE_MAX = 120;
export const BODY_MAX = 2000;

export const EMPTY_ANNOUNCEMENT = {
  title: '',
  body: '',
  link: '',
  audienceType: 'all', // 'all' | 'plan' | 'merchants'
  plans: [],
  merchants: [], // [{ _id, businessName, email }]
  schedule: false,
  scheduledAt: '', // datetime-local value, in the admin's own time zone
};

// An in-app path: starts with one "/" and has no spaces.
const IN_APP_PATH = /^\/(?!\/)\S*$/;

export function validateAnnouncement(form, now = new Date()) {
  const errors = {};
  const title = form.title.trim();
  const body = form.body.trim();
  const link = form.link.trim();

  if (!title) errors.title = 'Enter a title.';
  else if (title.length > TITLE_MAX) errors.title = `Keep the title to ${TITLE_MAX} characters or fewer.`;

  if (!body) errors.body = 'Enter a message.';
  else if (body.length > BODY_MAX) errors.body = `Keep the message to ${BODY_MAX} characters or fewer.`;

  if (link && !IN_APP_PATH.test(link)) errors.link = 'Use an in-app path that starts with "/", e.g. /dashboard/subscription.';

  if (form.audienceType === 'plan' && form.plans.length === 0) errors.plans = 'Choose at least one plan.';
  if (form.audienceType === 'merchants' && form.merchants.length === 0) errors.merchants = 'Add at least one merchant.';

  if (form.schedule) {
    const when = form.scheduledAt ? new Date(form.scheduledAt) : null;
    if (!when || Number.isNaN(when.getTime())) errors.scheduledAt = 'Choose the date and time to send it.';
    else if (when <= now) errors.scheduledAt = 'Choose a time in the future.';
  }

  return errors;
}

export function buildAnnouncementPayload(form) {
  const payload = { title: form.title.trim(), body: form.body.trim() };
  const link = form.link.trim();
  if (link) payload.link = link;

  if (form.audienceType === 'plan') payload.audience = { type: 'plan', plans: [...form.plans] };
  else if (form.audienceType === 'merchants') payload.audience = { type: 'merchants', merchantIds: form.merchants.map((m) => m._id) };
  else payload.audience = { type: 'all' };

  if (form.schedule && form.scheduledAt) payload.scheduledAt = new Date(form.scheduledAt).toISOString();
  return payload;
}

// "All merchants", "Plan: Small", "Plans: Small, Medium", "3 merchants".
export function audienceSummary(audience) {
  if (!audience || audience.type === 'all') return 'All merchants';
  if (audience.type === 'plan') {
    const plans = audience.plans || [];
    return `${plans.length === 1 ? 'Plan' : 'Plans'}: ${plans.map(formatPlanName).join(', ') || '—'}`;
  }
  const count = audience.merchantIds?.length ?? 0;
  return `${count} merchant${count === 1 ? '' : 's'}`;
}

// The form's audience, in the same shape the API stores.
export function formAudience(form) {
  return buildAnnouncementPayload({ ...form, title: '', body: '', link: '', schedule: false }).audience;
}

// <input type="datetime-local"> value for a Date, in local time.
export function toDateTimeLocal(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
