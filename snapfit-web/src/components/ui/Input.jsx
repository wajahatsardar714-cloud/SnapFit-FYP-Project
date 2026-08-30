import { FIELD_LABEL_CLASSES, getFieldClasses } from './fieldStyles';

function Input({ label, error, id, className = '', ...rest }) {
  const inputId = id || rest.name;

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className={FIELD_LABEL_CLASSES}>
          {label}
        </label>
      )}
      <input id={inputId} className={getFieldClasses(error, className)} {...rest} />
      {typeof error === 'string' && error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export default Input;
