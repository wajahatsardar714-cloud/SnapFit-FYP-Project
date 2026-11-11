import ActionLinks from './ActionLinks';
import Container from './Container';

/**
 * Navy page hero: the page's H1, a short description and buttons, with an
 * optional visual beside the text (below it on phones).
 *   title         H1 text
 *   brandTitle    large name shown first in the H1, the title then becoming a
 *                 smaller line under it (the homepage: "SnapFit")
 *   note          small line under the H1, e.g. a "Last Updated" date
 *   badge         node shown under the H1, e.g. the logo
 *   description   supporting sentence
 *   actions       [{ label, to, variant? }] -- see ActionLinks
 *   actionsFirst  buttons before the description instead of after it
 *   centered      centre the text, badge and buttons in their column
 *   visual        node shown beside the text (decorative art, a screenshot...);
 *                 without one the text keeps the full width
 */
function Hero({
  title,
  brandTitle,
  note,
  badge,
  description,
  actions = [],
  actionsFirst = false,
  centered = false,
  visual,
}) {
  const descriptionBlock = description && (
    <p className={`${actionsFirst ? 'mt-8' : 'mt-6'} break-words text-lg leading-relaxed text-inverse-accent md:text-xl`}>
      {description}
    </p>
  );
  const actionBlock = actions.length > 0 && (
    <ActionLinks actions={actions} align={centered ? 'center' : 'start'} className="mt-8" />
  );

  return (
    <section aria-labelledby="hero-title" className="bg-navy">
      <Container
        className={`grid grid-cols-1 items-center gap-12 py-16 md:py-20 lg:gap-16 lg:py-24 ${visual ? 'lg:grid-cols-2' : ''}`}
      >
        <div className={`min-w-0 animate-fade-up ${centered ? 'text-center' : ''}`}>
          <h1 id="hero-title" className={`break-words text-inverse ${brandTitle ? '' : 'type-h1'}`}>
            {brandTitle ? (
              <>
                <span className="type-h1 block">{brandTitle}</span>{' '}
                <span className="mt-3 block text-lg font-semibold leading-snug text-inverse-accent md:text-xl">
                  {title}
                </span>
              </>
            ) : (
              title
            )}
          </h1>
          {note && <p className="type-label mt-4 break-words text-inverse-muted">{note}</p>}
          {badge && <div className={`mt-6 ${centered ? 'flex justify-center' : ''}`}>{badge}</div>}
          {actionsFirst ? (
            <>
              {actionBlock}
              {descriptionBlock}
            </>
          ) : (
            <>
              {descriptionBlock}
              {actionBlock}
            </>
          )}
        </div>
        {visual && <div className="flex min-w-0 animate-fade-up justify-center [animation-delay:150ms]">{visual}</div>}
      </Container>
    </section>
  );
}

export default Hero;
