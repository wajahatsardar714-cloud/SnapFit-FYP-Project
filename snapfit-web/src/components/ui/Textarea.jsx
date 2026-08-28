import { FIELD_LABEL_CLASSES, getFieldClasses } from './fieldStyles';

function Textarea({ label, error, id, className = '', rows = 4, ...rest }) {
  const textareaId = id || rest.name;

  return (
    <div>
      {label && (
        <label htmlFor={textareaId} className={FIELD_LABEL_CLASSES}>
          {label}
        </label>
      )}
      <textarea id={textareaId} rows={rows} className={getFieldClasses(error, className)} {...rest} />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export default Textarea;
