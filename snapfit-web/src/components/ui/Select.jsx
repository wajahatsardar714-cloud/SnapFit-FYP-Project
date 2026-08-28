import { FIELD_LABEL_CLASSES, getFieldClasses } from './fieldStyles';

function Select({ label, error, id, className = '', children, ...rest }) {
  const selectId = id || rest.name;

  return (
    <div>
      {label && (
        <label htmlFor={selectId} className={FIELD_LABEL_CLASSES}>
          {label}
        </label>
      )}
      <select id={selectId} className={getFieldClasses(error, `bg-white ${className}`)} {...rest}>
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export default Select;
