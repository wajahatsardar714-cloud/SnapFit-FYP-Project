import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Lock, RefreshCw } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import { ListSkeleton } from '../ui/Skeleton';
import { getNotificationPreferences, updateNotificationPreferences } from '../../services/notificationsApi';

// Types in the order the server lists them, gathered under their group.
function groupTypes(types) {
  const groups = [];
  for (const type of types) {
    const name = type.group || 'Other';
    let group = groups.find((g) => g.name === name);
    if (!group) {
      group = { name, types: [] };
      groups.push(group);
    }
    group.types.push(type);
  }
  return groups;
}

function Switch({ id, checked, disabled, onChange, labelledBy }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${
        checked ? 'border-primary bg-primary' : 'border-border bg-surface-2'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 rounded-full shadow-card transition-transform duration-150 ${
          checked ? 'translate-x-6 bg-primary-foreground' : 'translate-x-1 bg-muted'
        }`}
      />
    </button>
  );
}

// Which notifications the account gets, one switch per type. Important types
// (security, billing, announcements) can't be muted and show as "Always on".
function NotificationPreferences() {
  const [types, setTypes] = useState(null);
  const [saved, setSaved] = useState({});
  const [draft, setDraft] = useState({});
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const apply = useCallback((res) => {
    const prefs = res?.preferences || {};
    setTypes(res?.types || []);
    setSaved(prefs);
    setDraft(prefs);
  }, []);

  const load = useCallback(() => {
    setFailed(false);
    return getNotificationPreferences()
      .then(apply)
      .catch(() => setFailed(true));
  }, [apply]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => groupTypes(types || []), [types]);
  const mutable = useMemo(() => (types || []).filter((t) => !t.important), [types]);
  const isOn = (prefs, type) => prefs[type] !== false;
  const dirty = mutable.some((t) => isOn(draft, t.type) !== isOn(saved, t.type));

  async function save() {
    setSaving(true);
    setError('');
    // Only the types the account may change; important ones always stay on.
    const preferences = Object.fromEntries(mutable.map((t) => [t.type, isOn(draft, t.type)]));
    try {
      apply(await updateNotificationPreferences(preferences));
      toast.success('Notification preferences saved');
    } catch (err) {
      const message = err.response?.data?.message || "Couldn't save your notification preferences";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Card.Header>
        <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose which updates appear in your notifications. Important account and billing messages are always sent.
        </p>
      </Card.Header>
      <Card.Body>
        {failed ? (
          <div className="space-y-3">
            <Alert variant="danger" title="Couldn't load your notification preferences." />
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={load}>
              Try again
            </Button>
          </div>
        ) : !types ? (
          <ListSkeleton rows={4} />
        ) : types.length === 0 ? (
          <p className="text-sm text-muted-foreground">There are no notification settings for this account.</p>
        ) : (
          <div className="space-y-6">
            {error && <Alert variant="danger" description={error} />}
            {groups.map((group) => (
              <fieldset key={group.name}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.name}</legend>
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {group.types.map((t) => {
                    const labelId = `pref-${t.type.replace(/[^\w-]/g, '-')}-label`;
                    return (
                      <li key={t.type} className="flex items-center justify-between gap-4 px-4 py-3">
                        <span id={labelId} className="text-sm text-foreground">
                          {t.label}
                        </span>
                        <span className="flex items-center gap-3">
                          {t.important && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                              <Lock size={12} aria-hidden="true" />
                              Always on
                            </span>
                          )}
                          <Switch
                            id={`pref-${t.type}`}
                            labelledBy={labelId}
                            checked={t.important ? true : isOn(draft, t.type)}
                            disabled={t.important || saving}
                            onChange={(value) => setDraft((prev) => ({ ...prev, [t.type]: value }))}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(saved)}>
                Reset
              </Button>
              <Button onClick={save} loading={saving} disabled={!dirty}>
                Save preferences
              </Button>
            </div>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

export default NotificationPreferences;
