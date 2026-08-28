export const FIELD_LABEL_CLASSES = 'mb-1 block text-sm font-medium text-ink-700';

export function getFieldClasses(error, extra = '') {
  return [
    'w-full rounded-lg border px-3 py-2 text-sm text-ink-700 transition-colors duration-150',
    'placeholder:text-ink-300 focus:outline-none focus:ring-2',
    'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-ink-300',
    error
      ? 'border-danger focus:border-danger focus:ring-danger-border'
      : 'border-surface-border focus:border-primary focus:ring-primary-100',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}
