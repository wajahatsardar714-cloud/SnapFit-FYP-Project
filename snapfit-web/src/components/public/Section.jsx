import { SectionIdContext } from './anchors';
import Container from './Container';
import SectionHeading from './SectionHeading';

const TONE_CLASSES = {
  default: 'bg-background',
  surface: 'bg-surface',
};

/**
 * A page section: vertical rhythm, the full-width container and (when `title` is
 * given) a centred SectionHeading labelling the <section>.
 *   id             section id: the deep-link target (its heading gets `${id}-title`
 *                  and a "#" link to it; items inside derive their ids from it)
 *   eyebrow, title, intro   passed to SectionHeading
 *   tone           'default' (page grey) | 'surface' (white), to alternate
 *   className      extra classes on the <section>
 */
function Section({ id, eyebrow, title, intro, tone = 'default', className = '', children }) {
  const headingId = title && id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={`scroll-mt-20 py-16 md:py-24 ${TONE_CLASSES[tone]} ${className}`}>
      <Container>
        {title && <SectionHeading id={headingId} anchor={id} eyebrow={eyebrow} title={title} intro={intro} />}
        {children && (
          <SectionIdContext.Provider value={id ?? null}>
            <div className={title ? 'mt-12' : ''}>{children}</div>
          </SectionIdContext.Provider>
        )}
      </Container>
    </section>
  );
}

export default Section;
