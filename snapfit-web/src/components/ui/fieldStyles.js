export const FIELD_LABEL_CLASSES = 'mb-1 block text-sm font-medium text-foreground';

export function getFieldClasses(error, extra = '') {
  return [
    'w-full rounded-lg border px-3 py-2 text-sm text-foreground transition-colors duration-150',
    'placeholder:text-muted focus:outline-none focus:ring-2',
    'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-muted',
    error
      ? 'border-danger focus:border-danger focus:ring-danger/30'
      : 'border-border focus:border-primary focus:ring-primary/20',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}
