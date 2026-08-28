import toast from 'react-hot-toast';
import { AlertTriangle, Info as InfoIcon } from 'lucide-react';

// react-hot-toast has no native "warning"/"info" type (only success/error/loading)
// -- these render through toast.custom() with markup matching Alert's variant
// colors, so all four Alert variants look consistent whether shown as a
// persistent banner or a transient toast. Global styling for the native
// toast.success()/toast.error() calls already used throughout the app lives in
// the <Toaster toastOptions> config in App.jsx, so none of those call sites
// needed to change.
const VARIANT_CONFIG = {
  warning: { classes: 'border-warning-border text-warning-text', Icon: AlertTriangle, iconClass: 'text-warning' },
  info: { classes: 'border-info-border text-info-text', Icon: InfoIcon, iconClass: 'text-info' },
};

function CustomToast({ variant, message }) {
  const { classes, Icon, iconClass } = VARIANT_CONFIG[variant];
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border bg-surface-card px-4 py-3 shadow-card ${classes}`}>
      <Icon size={18} className={`shrink-0 ${iconClass}`} />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

export function notifyWarning(message) {
  return toast.custom(<CustomToast variant="warning" message={message} />);
}

export function notifyInfo(message) {
  return toast.custom(<CustomToast variant="info" message={message} />);
}
