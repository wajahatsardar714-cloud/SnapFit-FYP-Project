import { ICONS } from './icons';
import { Paragraphs } from './RichText';

/**
 * White card with its icon in the top-right corner on a soft-blue chip.
 *   title       card heading
 *   icon        a name from ./icons (e.g. 'scan', 'ruler')
 *   paragraphs  body texts (see RichText)
 *   headingAs   heading element, default 'h3'
 */
function FeatureCard({ title, icon, paragraphs = [], headingAs: Heading = 'h3' }) {
  const Icon = ICONS[icon];
  return (
    <article className="flex h-full min-w-0 flex-col rounded-xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <Heading className="type-h4 min-w-0 break-words text-deep-blue">{title}</Heading>
        {Icon && (
          <span
            data-slot="icon"
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-link"
          >
            <Icon size={22} strokeWidth={1.75} focusable="false" />
          </span>
        )}
      </div>
      <div className="mt-4 space-y-3 text-[0.9375rem] leading-relaxed text-body">
        <Paragraphs items={paragraphs} />
      </div>
    </article>
  );
}

export default FeatureCard;
