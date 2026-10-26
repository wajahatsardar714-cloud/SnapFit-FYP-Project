import CardGrid from '../../components/public/CardGrid';
import Container from '../../components/public/Container';
import CtaBanner from '../../components/public/CtaBanner';
import FaqAccordion from '../../components/public/FaqAccordion';
import FeatureCard from '../../components/public/FeatureCard';
import { usePageMeta } from '../../components/public/PageMeta';
import Prose from '../../components/public/Prose';
import { Paragraphs } from '../../components/public/RichText';
import Section from '../../components/public/Section';
import StepList from '../../components/public/StepList';

// Section text runs the full container width rather than Prose's reading column.
const FULL_WIDTH = '!max-w-none';

// How each content `layout` renders inside its Section (see content/auth.js).
const LAYOUTS = {
  prose: (section) => <Prose paragraphs={section.paragraphs} className={FULL_WIDTH} />,
  steps: (section) => <StepList steps={section.items} />,
  cards: (section) => (
    <CardGrid columns={section.columns}>
      {section.items.map((item) => (
        <FeatureCard key={item.title} {...item} />
      ))}
    </CardGrid>
  ),
  faq: (section) => <FaqAccordion items={section.items} />,
};

/**
 * The login and register page (inside PublicLayout): the H1 and intro, the
 * form section with the form in a centred card, then the content sections.
 *   content   login or register from content/auth.js
 *   aside     shown beside the form card on wide screens, below it on phones
 *   children  the form
 */
function AuthShell({ content, aside, children }) {
  usePageMeta(content.meta.title, content.meta.description);
  const { formSection, sections } = content;

  return (
    <>
      <section aria-labelledby="auth-title" className="bg-surface py-16 md:py-20">
        <Container className="text-center">
          <h1 id="auth-title" className="type-h1 break-words text-foreground">
            {content.title}
          </h1>
          <div className="mx-auto mt-6 max-w-reading space-y-4">
            <Paragraphs items={content.intro} className="type-body text-body" />
          </div>
        </Container>
      </section>

      <Section id={formSection.id} eyebrow={formSection.eyebrow} title={formSection.title} intro={formSection.intro}>
        <div
          className={
            aside ? 'grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:gap-12' : undefined
          }
        >
          <div className="mx-auto w-full min-w-0 max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
            {children}
          </div>
          {aside}
        </div>
        {formSection.notes && <Prose paragraphs={formSection.notes} className="mt-10" />}
      </Section>

      {sections.map((section, index) =>
        section.layout === 'cta' ? (
          <CtaBanner key={section.id} {...section} />
        ) : (
          <Section
            key={section.id}
            id={section.id}
            eyebrow={section.eyebrow}
            title={section.title}
            intro={section.intro}
            tone={index % 2 === 0 ? 'surface' : 'default'}
          >
            {LAYOUTS[section.layout](section)}
          </Section>
        )
      )}
    </>
  );
}

export default AuthShell;
