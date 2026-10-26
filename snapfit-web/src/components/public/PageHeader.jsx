import ActionLinks from './ActionLinks';
import Container from './Container';
import { Paragraphs } from './RichText';

/**
 * Plain white page header (no banner): the H1, optional buttons straight under
 * it so they're seen first on any screen, then the intro paragraphs.
 *   title    H1 text
 *   actions  [{ label, to, variant? }] -- see ActionLinks
 *   intro    paragraph texts (see RichText)
 */
function PageHeader({ title, actions = [], intro = [] }) {
  return (
    <section aria-labelledby="page-title" className="bg-surface py-16 md:py-20">
      <Container className="text-center">
        <h1 id="page-title" className="type-h1 break-words text-foreground">
          {title}
        </h1>
        {actions.length > 0 && <ActionLinks actions={actions} align="center" className="mt-8" />}
        {intro.length > 0 && (
          <div className="mt-8 space-y-4">
            <Paragraphs items={intro} className="type-body text-body" />
          </div>
        )}
      </Container>
    </section>
  );
}

export default PageHeader;
