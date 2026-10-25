import { FIELD_ERROR_CLASSES, FIELD_LABEL_CLASSES, fieldErrorProps, getFieldClasses } from './fieldStyles';

function Select({ label, error, id, className = '', children, ...rest }) {
  const selectId = id || rest.name;

  return (
    <div>
      {label && (
        <label htmlFor={selectId} className={FIELD_LABEL_CLASSES}>
          {label}
        </label>
      )}
      <select id={selectId} className={getFieldClasses(error, className)} {...fieldErrorProps(selectId, error)} {...rest}>
        {children}
      </select>
      {error && (
        <p id={`${selectId}-error`} className={FIELD_ERROR_CLASSES}>
          {error}
        </p>
      )}
    </div>
  );
}

export default Select;
