import { Loader2 } from 'lucide-react';

const VARIANT_CLASSES = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-700',
  secondary: 'bg-white border border-surface-border text-ink-700 shadow-sm hover:bg-gray-50',
  danger: 'bg-danger text-white shadow-sm hover:bg-danger-text',
  ghost: 'bg-transparent text-ink-700 hover:bg-gray-100',
};

const SIZE_CLASSES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon = null,
  className = '',
  children,
  type = 'button',
  ...rest
}) {
  const leading = loading ? <Loader2 size={16} className="animate-spin" /> : icon;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {leading}
      {children}
    </button>
  );
}

export default Button;
