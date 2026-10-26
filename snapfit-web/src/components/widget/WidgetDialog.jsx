import { useEffect, useId } from 'react';
import { ArrowLeft, X } from 'lucide-react';

/**
 * The widget's modal: a top bar (optional Back, the title, Close) over a body
 * that scrolls on its own, capped to the screen height. A bottom sheet on
 * phones, a centred card from `sm` up. Escape closes it; the page behind stops
 * scrolling while it's open.
 *   title          step title (the dialog's accessible name)
 *   wide           wider card, for the result (try-on beside the measurements)
 *   onBack         shows a Back button when given
 *   onClose        Close button, Escape and backdrop click
 *   closeDisabled  blocks closing (while a request is in flight)
 */
function WidgetDialog({ title, wide = false, onBack, onClose, closeDisabled = false, children }) {
  const titleId = useId();

  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !closeDisabled) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, closeDisabled]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-overlay/50" onClick={closeDisabled ? undefined : onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl ${
          wide ? 'sm:max-w-5xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 sm:px-6">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="-ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back
            </button>
          )}
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={closeDisabled}
            className="-mr-2 rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">{children}</div>
      </div>
    </div>
  );
}

export default WidgetDialog;
