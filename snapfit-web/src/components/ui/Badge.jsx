const VARIANT_CLASSES = {
  success: 'bg-success-bg text-success-text border-success-border',
  danger: 'bg-danger-bg text-danger-text border-danger-border',
  warning: 'bg-warning-bg text-warning-text border-warning-border',
  info: 'bg-info-bg text-info-text border-info-border',
  neutral: 'bg-gray-100 text-ink-700 border-surface-border',
};

function Badge({ variant = 'neutral', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export default Badge;
