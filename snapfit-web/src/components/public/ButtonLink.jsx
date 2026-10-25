import SmartLink from './SmartLink';

const VARIANT_CLASSES = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground',
  outline: 'border border-primary bg-surface text-link hover:bg-primary-soft hover:text-link',
  // For navy backgrounds (hero, CTA banner).
  outlineInverse: 'border border-inverse/40 text-inverse hover:bg-inverse/10 hover:text-inverse',
};

const SIZE_CLASSES = {
  sm: 'px-4 py-2 text-sm font-semibold',
  md: 'type-button px-6 py-3',
};

/**
 * A link styled as a button (navigation, not form actions -- use ui/Button
 * for those).
 *   to, live   see SmartLink
 *   variant    'primary' | 'outline' | 'outlineInverse'
 *   size       'sm' | 'md'
 *   className  extra classes (e.g. w-full)
 */
function ButtonLink({ to, live, variant = 'primary', size = 'md', className = '', children, ...rest }) {
  return (
    <SmartLink
      to={to}
      live={live}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-center no-underline transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {children}
    </SmartLink>
  );
}

export default ButtonLink;
