import { FIELD_ERROR_CLASSES, FIELD_LABEL_CLASSES, fieldErrorProps, getFieldClasses } from './fieldStyles';

function Input({ label, error, hint, id, className = '', ...rest }) {
  const inputId = id || rest.name;
  const errorProps = fieldErrorProps(inputId, error);
  const hintId = hint ? `${inputId}-hint` : null;
  const describedBy = [errorProps['aria-describedby'], hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className={FIELD_LABEL_CLASSES}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={getFieldClasses(error, className)}
        {...errorProps}
        aria-describedby={describedBy}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {typeof error === 'string' && error && (
        <p id={`${inputId}-error`} className={FIELD_ERROR_CLASSES}>
          {error}
        </p>
      )}
    </div>
  );
}

export default Input;
