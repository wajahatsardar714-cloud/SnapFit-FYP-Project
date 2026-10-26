import { Paragraphs } from './RichText';

/**
 * Numbered steps down a connecting line, full width.
 *   steps      [{ title, paragraphs }] in order
 *   headingAs  step heading element, default 'h3'
 */
function StepList({ steps = [], headingAs: Heading = 'h3' }) {
  return (
    <ol>
      {steps.map((step, i) => (
        <li key={step.title} className="relative flex min-w-0 gap-4 pb-10 last:pb-0 sm:gap-6">
          {i < steps.length - 1 && (
            <span aria-hidden="true" className="absolute bottom-2 left-5 top-12 w-px -translate-x-1/2 bg-border sm:left-6" />
          )}
          <span
            aria-hidden="true"
            className="type-button flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-link sm:h-12 sm:w-12"
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface p-5 shadow-card sm:p-6">
            <Heading className="type-h3 break-words text-deep-blue">{step.title}</Heading>
            <div className="type-body mt-3 space-y-3 break-words text-body">
              <Paragraphs items={step.paragraphs} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default StepList;
