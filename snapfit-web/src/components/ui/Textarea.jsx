import { FIELD_ERROR_CLASSES, FIELD_LABEL_CLASSES, fieldErrorProps, getFieldClasses } from './fieldStyles';

function Textarea({ label, error, id, className = '', rows = 4, ...rest }) {
  const textareaId = id || rest.name;

  return (
    <div>
      {label && (
        <label htmlFor={textareaId} className={FIELD_LABEL_CLASSES}>
          {label}
        </label>
      )}
      <textarea id={textareaId} rows={rows} className={getFieldClasses(error, className)} {...fieldErrorProps(textareaId, error)} {...rest} />
      {error && (
        <p id={`${textareaId}-error`} className={FIELD_ERROR_CLASSES}>
          {error}
        </p>
      )}
    </div>
  );
}

export default Textarea;
