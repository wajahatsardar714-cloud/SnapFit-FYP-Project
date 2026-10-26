import { ChevronDown } from 'lucide-react';
import { Paragraphs } from './RichText';

/**
 * Questions and answers as native <details> disclosures (no JavaScript): white
 * when closed, soft blue when open.
 *   items  [{ question, answer }] -- `answer` is an array of paragraph texts
 *          (see RichText)
 */
function FaqAccordion({ items = [] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <details
          key={item.question}
          className="group min-w-0 rounded-xl border border-border bg-surface shadow-card open:border-primary/40 open:bg-primary-soft"
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
