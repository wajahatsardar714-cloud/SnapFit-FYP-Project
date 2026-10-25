import { useState } from 'react';
import toast from 'react-hot-toast';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import { notifyInfo } from '../../../components/ui/toast';
import { updateSubscription } from '../../../services/adminApi';
import { PLANS, formatPlanName } from '../../../utils/plans';
import { SUBSCRIPTION_STATUSES, capitalize } from '../adminFormat';

const CHECKBOX_CLASSES = 'h-4 w-4 accent-admin';

function formFrom(subscription = {}) {
  return {
    plan: subscription.plan || PLANS[0],
    status: subscription.status || 'active',
    unlimited: subscription.requestsLimit == null,
    requestsLimit: subscription.requestsLimit == null ? '' : String(subscription.requestsLimit),
    endDate: subscription.endDate ? subscription.endDate.slice(0, 10) : '',
    resetUsage: false,
  };
}

// Only what changed goes to the backend (so e.g. a plan change alone lets the
// server apply that plan's defaults). A null limit means unlimited; an empty
// end date means none.
function changesFrom(form, subscription = {}) {
  const initial = formFrom(subscription);
  const body = {};
  if (form.plan !== initial.plan) body.plan = form.plan;
  if (form.status !== initial.status) body.status = form.status;
  if (form.unlimited !== initial.unlimited || form.requestsLimit !== initial.requestsLimit) {
    body.requestsLimit = form.unlimited ? null : Number(form.requestsLimit);
  }
  if (form.endDate !== initial.endDate) body.endDate = form.endDate ? new Date(form.endDate).toISOString() : null;
  if (form.resetUsage) body.resetUsage = true;
  return body;
}

function LimitsEditor({ merchant, onUpdated }) {
  const { subscription } = merchant;
  const [form, setForm] = useState(() => formFrom(subscription));
  const [syncedSubscription, setSyncedSubscription] = useState(subscription);
  const [limitError, setLimitError] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-sync with whatever the server saved (it may adjust e.g. the limit).
  // Done while rendering rather than in an effect, so a mount-time effect can't
  // land after the admin's first edit and wipe it.
  if (subscription !== syncedSubscription) {
    setSyncedSubscription(subscription);
    setForm(formFrom(subscription));
  }

  function update(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
    setLimitError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.unlimited && !/^\d+$/.test(form.requestsLimit)) {
      setLimitError('Enter a whole number of requests (0 or more), or choose unlimited.');
      return;
    }
    const body = changesFrom(form, subscription);
    if (Object.keys(body).length === 0) {
      notifyInfo('Nothing to save — no limits were changed.');
      return;
    }

    setSaving(true);
    try {
      const res = await updateSubscription(merchant._id, body);
      onUpdated(res.merchant);
      toast.success('Subscription updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update the subscription');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Card.Header>
        <h2 className="text-sm font-semibold text-foreground">Plan & limits</h2>
        <p className="mt-1 text-xs text-muted-foreground">Override the merchant&apos;s plan, request quota and billing period.</p>
      </Card.Header>
      <Card.Body>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Plan and limits">
          <Select id="limits-plan" label="Plan" value={form.plan} onChange={(e) => update({ plan: e.target.value })}>
            {PLANS.map((plan) => (
              <option key={plan} value={plan}>
                {formatPlanName(plan)}
              </option>
            ))}
          </Select>
          <Select
            id="limits-status"
            label="Subscription status"
            value={form.status}
            onChange={(e) => update({ status: e.target.value })}
          >
            {SUBSCRIPTION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {capitalize(status)}
              </option>
            ))}
          </Select>

          <div>
            <Input
              id="limits-requests"
              label="Request limit"
              type="number"
              min="0"
              step="1"
              value={form.unlimited ? '' : form.requestsLimit}
              placeholder={form.unlimited ? 'Unlimited' : 'e.g. 5000'}
              disabled={form.unlimited}
              onChange={(e) => update({ requestsLimit: e.target.value })}
              error={limitError}
            />
            <label className="mt-2 flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className={CHECKBOX_CLASSES}
                checked={form.unlimited}
                onChange={(e) => update({ unlimited: e.target.checked })}
              />
              Unlimited requests
            </label>
          </div>

          <div>
            <Input
              id="limits-end-date"
              label="End date"
              type="date"
              value={form.endDate}
              onChange={(e) => update({ endDate: e.target.value })}
            />
            <p className="mt-1 text-xs text-muted-foreground">Leave empty for no end date.</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
            <input
              type="checkbox"
              className={CHECKBOX_CLASSES}
              checked={form.resetUsage}
              onChange={(e) => update({ resetUsage: e.target.checked })}
            />
            Reset requests used to 0
          </label>

          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={saving}>
              Save limits
            </Button>
          </div>
        </form>
      </Card.Body>
    </Card>
  );
}

export default LimitsEditor;
