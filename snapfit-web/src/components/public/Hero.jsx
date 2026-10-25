import ActionLinks from './ActionLinks';
import Container from './Container';

/**
 * Navy page hero: the page's H1, a short description and buttons, with an
 * optional visual beside the text (below it on phones).
 *   title        H1 text
 *   description  supporting sentence
 *   actions      [{ label, to, variant? }] -- see ActionLinks
 *   visual       node shown beside the text (decorative art, a screenshot...)
 */
function Hero({ title, description, actions = [], visual }) {
  return (
    <section aria-labelledby="hero-title" className="bg-navy">
      <Container className="grid grid-cols-1 items-center gap-12 py-16 md:py-20 lg:grid-cols-2 lg:gap-16 lg:py-24">
        <div className="min-w-0">
          <h1 id="hero-title" className="type-h1 break-words text-inverse">
            {title}
          </h1>
          {description && (
            <p className="mt-6 max-w-reading break-words text-lg leading-relaxed text-inverse-accent md:text-xl">{description}</p>
          )}
          <ActionLinks actions={actions} className="mt-8" />
        </div>
        {visual && <div className="flex min-w-0 justify-center">{visual}</div>}
      </Container>
    </section>
  );
}

export default Hero;
