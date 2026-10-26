import { Paragraphs } from './RichText';

const TONE_CLASSES = {
  default: { eyebrow: 'text-link', title: 'text-foreground', intro: 'text-body' },
  inverse: { eyebrow: 'text-inverse-accent', title: 'text-inverse', intro: 'text-inverse-muted' },
};

/**
 * Centred, full-width section heading: a short eyebrow label, the heading, optional intro.
 *   eyebrow    small label above the heading (2-3 words)
 *   title      heading text
 *   id         id for the heading element (Section points aria-labelledby at it)
 *   anchor     section id to deep-link to: adds a "#" link, shown on hover/focus
 *   as         heading element, default 'h2'
 *   intro      paragraph texts under the heading (see RichText)
 *   tone       'default' (light backgrounds) | 'inverse' (navy backgrounds)
 *   className  extra classes on the wrapper
 */
function SectionHeading({ eyebrow, title, id, anchor, as: Heading = 'h2', intro = [], tone = 'default', className = '' }) {
  const colours = TONE_CLASSES[tone];
  return (
    <div className={`text-center ${className}`}>
      {eyebrow && <p className={`type-label uppercase tracking-widest ${colours.eyebrow}`}>{eyebrow}</p>}
      <div className="group mt-3 break-words">
        <Heading id={id} className={`type-h2 inline ${colours.title}`}>
          {title}
        </Heading>
        {anchor && (
          <a
            href={`#${anchor}`}
            aria-label={`Link to the section ${title}`}
            className="type-h4 ml-2 align-middle text-link no-underline opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          >
            #
          </a>
        )}
      </div>
      {intro.length > 0 && (
        <div className="mt-5 space-y-4">
          <Paragraphs items={intro} className={`type-body ${colours.intro}`} />
        </div>
      )}
    </div>
  );
}

export default SectionHeading;
