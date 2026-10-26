import { ChevronDown } from 'lucide-react';
import { useAnchorId } from './anchors';
import { Paragraphs } from './RichText';

/**
 * Questions and answers as native <details> disclosures (no JavaScript): white
 * when closed, soft blue when open. Each question gets an id for deep links;
 * ScrollToHash opens the one a link points at.
 *   items  [{ question, answer }] -- `answer` is an array of paragraph texts
 *          (see RichText)
 */
function FaqAccordion({ items = [] }) {
  const anchorId = useAnchorId();
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details
          key={item.question}
          id={anchorId(item.question)}
          className="group min-w-0 scroll-mt-24 rounded-xl border border-border bg-surface shadow-card open:border-primary/40 open:bg-primary-soft"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 text-foreground sm:px-6 [&::-webkit-details-marker]:hidden">
            <span className="type-h4 min-w-0 break-words">{item.question}</span>
            <ChevronDown
              aria-hidden="true"
              focusable="false"
              size={20}
              className="shrink-0 text-link motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180"
            />
          </summary>
          <div className="type-body space-y-3 break-words px-5 pb-5 text-body sm:px-6">
            <Paragraphs items={item.answer} />
          </div>
        </details>
      ))}
    </div>
  );
}

export default FaqAccordion;
