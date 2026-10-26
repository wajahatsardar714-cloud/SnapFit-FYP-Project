import ActionLinks from '../../components/public/ActionLinks';
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

// How each content `layout` renders inside its Section (see content/auth.js).
const LAYOUTS = {
  prose: (section) => <Prose paragraphs={section.paragraphs} />,
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
 * The login and register content pages (inside PublicLayout): the H1 and
 * intro, the account section with the Log In / Sign Up buttons (which open the
 * bare form screens), then the content sections. No form on these pages.
 *   content   login or register from content/auth.js
 *   below     shown under the buttons (e.g. what the sign-up form asks for)
 */
function AuthShell({ content, below }) {
  usePageMeta(content.meta.title, content.meta.description);
  const { formSection, sections } = content;

  return (
    <>
      <section aria-labelledby="auth-title" className="bg-surface py-16 md:py-20">
        <Container className="text-center">
          <h1 id="auth-title" className="type-h1 break-words text-foreground">
            {content.title}
          </h1>
          <div className="mt-6 space-y-4">
            <Paragraphs items={content.intro} className="type-body text-body" />
          </div>
        </Container>
      </section>

      <Section id={formSection.id} eyebrow={formSection.eyebrow} title={formSection.title} intro={formSection.intro}>
        <ActionLinks actions={content.actions} align="center" />
        {below && <div className="mt-12">{below}</div>}
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
