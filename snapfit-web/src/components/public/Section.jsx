import Container from './Container';
import SectionHeading from './SectionHeading';

const TONE_CLASSES = {
  default: 'bg-background',
  surface: 'bg-surface',
};

/**
 * A page section: vertical rhythm, a container and (when `title` is given) a
 * centred SectionHeading labelling the <section>.
 *   id             section id (anchor target; the heading gets `${id}-title`)
 *   eyebrow, title, intro   passed to SectionHeading
 *   tone           'default' (page grey) | 'surface' (white), to alternate
 *   containerSize  Container size, default 'default'
 *   className      extra classes on the <section>
 */
function Section({ id, eyebrow, title, intro, tone = 'default', containerSize = 'default', className = '', children }) {
  const headingId = title && id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={`scroll-mt-20 py-16 md:py-24 ${TONE_CLASSES[tone]} ${className}`}>
      <Container size={containerSize}>
        {title && <SectionHeading id={headingId} eyebrow={eyebrow} title={title} intro={intro} />}
        {children && <div className={title ? 'mt-12' : ''}>{children}</div>}
      </Container>
    </section>
  );
}

export default Section;
