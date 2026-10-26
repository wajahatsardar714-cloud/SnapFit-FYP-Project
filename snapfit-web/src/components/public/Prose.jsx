import { Paragraphs } from './RichText';

/**
 * Long-form text across the full container width.
 *   paragraphs   paragraph texts (see RichText)
 *   subsections  [{ title, paragraphs }] -- each title renders as `headingAs`
 *   headingAs    subsection heading element, default 'h3'
 *   className    extra classes on the wrapper
 */
function Prose({ paragraphs = [], subsections = [], headingAs: Heading = 'h3', className = '' }) {
  return (
    <div className={`type-body min-w-0 break-words text-body ${className}`}>
      {paragraphs.length > 0 && (
        <div className="space-y-5">
          <Paragraphs items={paragraphs} />
        </div>
      )}
      {subsections.map((subsection) => (
        <div key={subsection.title} className="mt-10 first:mt-0">
          <Heading className="type-h3 text-deep-blue">{subsection.title}</Heading>
          <div className="mt-3 space-y-5">
            <Paragraphs items={subsection.paragraphs} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default Prose;
