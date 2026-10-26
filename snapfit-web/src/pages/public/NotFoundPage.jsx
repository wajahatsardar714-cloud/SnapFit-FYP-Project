import Hero from '../../components/public/Hero';
import { usePageMeta } from '../../components/public/PageMeta';
import Prose from '../../components/public/Prose';
import Section from '../../components/public/Section';
import { notFound } from '../../content/site';

// Catch-all for URLs that aren't a page: says so and links back into the site.
function NotFoundPage() {
  usePageMeta(notFound.meta.title, notFound.meta.description);

  return (
    <>
      <Hero title={notFound.title} />
      <Section tone="surface">
        <Prose paragraphs={notFound.paragraphs} />
      </Section>
    </>
  );
}

export default NotFoundPage;
