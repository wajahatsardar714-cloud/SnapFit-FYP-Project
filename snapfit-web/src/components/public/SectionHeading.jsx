import { Paragraphs } from './RichText';

const TONE_CLASSES = {
  default: { eyebrow: 'text-link', title: 'text-foreground', intro: 'text-body' },
  inverse: { eyebrow: 'text-inverse-accent', title: 'text-inverse', intro: 'text-inverse-muted' },
};

/**
 * Centred section heading: a short eyebrow label, the heading, optional intro.
 *   eyebrow    small label above the heading (2-3 words)
 *   title      heading text
 *   id         id for the heading element (Section points aria-labelledby at it)
 *   as         heading element, default 'h2'
 *   intro      paragraph texts under the heading (see RichText)
 *   tone       'default' (light backgrounds) | 'inverse' (navy backgrounds)
 *   className  extra classes on the wrapper
 */
function SectionHeading({ eyebrow, title, id, as: Heading = 'h2', intro = [], tone = 'default', className = '' }) {
  const colours = TONE_CLASSES[tone];
  return (
    <div className={`mx-auto max-w-3xl text-center ${className}`}>
      {eyebrow && <p className={`type-label uppercase tracking-widest ${colours.eyebrow}`}>{eyebrow}</p>}
      <Heading id={id} className={`type-h2 mt-3 break-words ${colours.title}`}>
        {title}
      </Heading>
      {intro.length > 0 && (
        <div className="mx-auto mt-5 max-w-reading space-y-4">
          <Paragraphs items={intro} className={`type-body ${colours.intro}`} />
        </div>
      )}
    </div>
  );
}

export default SectionHeading;
