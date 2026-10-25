import ButtonLink from './ButtonLink';

/**
 * A row of button links that wraps (full width on the narrowest phones).
 *   actions    [{ label, to, variant? }] -- variant as in ButtonLink
 *   align      'start' | 'center'
 *   className  extra classes
 */
function ActionLinks({ actions = [], align = 'start', className = '' }) {
  return (
    <div className={`flex flex-col gap-3 min-[400px]:flex-row min-[400px]:flex-wrap ${align === 'center' ? 'justify-center' : ''} ${className}`}>
      {actions.map((action) => (
        <ButtonLink key={action.label} to={action.to} live={action.live} variant={action.variant}>
          {action.label}
        </ButtonLink>
      ))}
    </div>
  );
}

export default ActionLinks;
