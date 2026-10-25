import ActionLinks from './ActionLinks';
import Container from './Container';
import SectionHeading from './SectionHeading';

/**
 * Closing call to action: a navy panel with a centred heading, text and buttons.
 *   id          section id (the heading gets `${id}-title`)
 *   eyebrow     small label above the heading
 *   title       heading text (an h2)
 *   paragraphs  paragraph texts (see RichText)
 *   actions     [{ label, to, variant? }] -- see ActionLinks
 */
function CtaBanner({ id, eyebrow, title, paragraphs = [], actions = [] }) {
  const headingId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-20 bg-background py-16 md:py-24">
      <Container>
        <div className="rounded-2xl bg-navy px-5 py-12 sm:px-10 md:py-16">
          <SectionHeading id={headingId} eyebrow={eyebrow} title={title} intro={paragraphs} tone="inverse" />
          <ActionLinks actions={actions} align="center" className="mt-8" />
        </div>
      </Container>
    </section>
  );
}

export default CtaBanner;
