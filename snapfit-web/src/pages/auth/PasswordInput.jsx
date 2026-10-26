import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { FIELD_ERROR_CLASSES, FIELD_LABEL_CLASSES, fieldErrorProps, getFieldClasses } from '../../components/ui/fieldStyles';

// A password field with a show/hide toggle: a pressed-state button inside the
// input's right edge. Takes the same props as ui/Input (minus `type`).
function PasswordInput({ label, error, id, className = '', ...rest }) {
  const [visible, setVisible] = useState(false);
  const inputId = id || rest.name;
  const Icon = visible ? EyeOff : Eye;

  return (
    <div>
      <label htmlFor={inputId} className={FIELD_LABEL_CLASSES}>
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          className={getFieldClasses(error, `pr-11 ${className}`)}
          {...fieldErrorProps(inputId, error)}
          {...rest}
          type={visible ? 'text' : 'password'}
        />
        <button
          type="button"
          aria-label="Show password"
          aria-pressed={visible}
          aria-controls={inputId}
          onClick={() => setVisible((prev) => !prev)}
          disabled={rest.disabled}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed"
        >
          <Icon aria-hidden="true" focusable="false" size={18} />
        </button>
      </div>
      {error && (
        <p id={`${inputId}-error`} className={FIELD_ERROR_CLASSES}>
          {error}
        </p>
      )}
    </div>
  );
}

export default PasswordInput;
