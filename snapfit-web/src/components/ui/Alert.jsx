import { AlertCircle, AlertTriangle, CheckCircle2, Info as InfoIcon } from 'lucide-react';

const VARIANT_CONFIG = {
  success: { classes: 'bg-success-bg border-success-border text-success-text', Icon: CheckCircle2 },
  danger: { classes: 'bg-danger-bg border-danger-border text-danger-text', Icon: AlertCircle },
  warning: { classes: 'bg-warning-bg border-warning-border text-warning-text', Icon: AlertTriangle },
  info: { classes: 'bg-info-bg border-info-border text-info-text', Icon: InfoIcon },
};

// A persistent inline banner (top of a form/page) -- not a toast. See ./toast.jsx
// for the transient equivalent, styled to match.
function Alert({ variant = 'info', title, description, className = '' }) {
  const { classes, Icon } = VARIANT_CONFIG[variant];

  return (
    <div className={`flex gap-3 rounded-lg border px-4 py-3 ${classes} ${className}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div>
        {title && <p className="text-sm font-medium">{title}</p>}
        {description && <p className={title ? 'mt-0.5 text-sm opacity-90' : 'text-sm'}>{description}</p>}
      </div>
    </div>
  );
}

export default Alert;
