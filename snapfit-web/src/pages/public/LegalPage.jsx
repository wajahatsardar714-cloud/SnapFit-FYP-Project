import Hero from '../../components/public/Hero';
import { usePageMeta } from '../../components/public/PageMeta';
import Prose from '../../components/public/Prose';
import Section from '../../components/public/Section';
import * as legal from '../../content/legal';

/**
 * One template for the legal pages (Privacy Policy, Terms of Service, Cookie
 * Policy): a navy header with the H1, the last-updated line and the page's
 * description, then each H2 section with its paragraphs, full width.
 *   page  'privacy' | 'terms' | 'cookies' -- a page from content/legal.js
 */
function LegalPage({ page }) {
  const { meta, title, lastUpdated, sections } = legal[page];
  usePageMeta(meta.title, meta.description);

  return (
    <>
      <Hero title={title} note={lastUpdated} description={meta.description} />
      <Section tone="surface">
        <Prose subsections={sections} headingAs="h2" />
      </Section>
    </>
  );
}

export default LegalPage;
