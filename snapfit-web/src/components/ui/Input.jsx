import { FIELD_ERROR_CLASSES, FIELD_LABEL_CLASSES, fieldErrorProps, getFieldClasses } from './fieldStyles';

function Input({ label, error, id, className = '', ...rest }) {
  const inputId = id || rest.name;

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className={FIELD_LABEL_CLASSES}>
          {label}
        </label>
      )}
      <input id={inputId} className={getFieldClasses(error, className)} {...fieldErrorProps(inputId, error)} {...rest} />
      {typeof error === 'string' && error && (
        <p id={`${inputId}-error`} className={FIELD_ERROR_CLASSES}>
          {error}
        </p>
      )}
    </div>
  );
}

export default Input;
