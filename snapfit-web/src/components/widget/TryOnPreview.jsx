import { useState } from 'react';

// "See it on you": the shopper's own photo with the product, from the
// combined recommend + try-on response. tryOn: { status: 'success', image } |
// { status: 'failed', message } | { status: 'unavailable' }. Renders nothing
// unless the product is try-on ready.
function TryOnPreview({ tryOn, originalUrl, size }) {
  const [view, setView] = useState('tryOn');

  if (tryOn?.status === 'failed') {
    return (
      <p className="text-xs text-muted-foreground">
        We couldn&apos;t create a preview on your photo this time. {tryOn.message}
      </p>
    );
  }
  if (tryOn?.status !== 'success') return null;

  const showTryOn = view === 'tryOn' || !originalUrl;
  const toggleClass = (active) =>
    `rounded px-3 py-1 text-xs font-medium ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`;

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">See it on you</p>
        {originalUrl && (
          <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Preview view">
            <button type="button" aria-pressed={!showTryOn} onClick={() => setView('original')} className={toggleClass(!showTryOn)}>
              Original
            </button>
            <button type="button" aria-pressed={showTryOn} onClick={() => setView('tryOn')} className={toggleClass(showTryOn)}>
              Try-on
            </button>
          </div>
        )}
      </div>
      <div className="relative mt-2">
        <img
          src={showTryOn ? tryOn.image : originalUrl}
          alt={showTryOn ? `You wearing size ${size}` : 'Your photo'}
          className="mx-auto max-h-80 rounded-md object-contain"
        />
        {showTryOn && (
          <span className="absolute left-2 top-2 rounded bg-primary/80 px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            Size {size}
          </span>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Preview is approximate and does not reflect fabric drape or exact fit.</p>
    </div>
  );
}

export default TryOnPreview;
