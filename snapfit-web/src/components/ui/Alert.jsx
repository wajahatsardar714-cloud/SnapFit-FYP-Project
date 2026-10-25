import { AlertCircle, AlertTriangle, CheckCircle2, Info as InfoIcon } from 'lucide-react';

const VARIANT_CONFIG = {
  success: { classes: 'bg-success-soft border-success/30 text-success', Icon: CheckCircle2 },
  danger: { classes: 'bg-danger-soft border-danger/30 text-danger', Icon: AlertCircle },
  warning: { classes: 'bg-warning-soft border-warning/30 text-warning', Icon: AlertTriangle },
  info: { classes: 'bg-primary-soft border-primary/30 text-link', Icon: InfoIcon },
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
