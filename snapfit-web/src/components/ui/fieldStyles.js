export const FIELD_LABEL_CLASSES = 'mb-1 block text-[13px] font-semibold text-foreground';

export const FIELD_ERROR_CLASSES = 'mt-1 text-[13px] font-medium text-danger';

export function getFieldClasses(error, extra = '') {
  return [
    'w-full rounded-lg border bg-surface px-3 py-2 text-sm text-foreground transition-colors duration-150',
    'placeholder:text-muted focus:outline-none focus:ring-2',
    'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted',
    error
      ? 'border-danger focus:border-danger focus:ring-danger/30'
      : 'border-border focus:border-primary focus:ring-primary/40',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

// Ties a field to its error message for assistive tech. Only string errors are
// shown as text (a boolean just turns the field red).
export function fieldErrorProps(fieldId, error) {
  if (!error) return {};
  return {
    'aria-invalid': true,
    ...(typeof error === 'string' && { 'aria-describedby': `${fieldId}-error` }),
  };
}
