import CardGrid from '../../components/public/CardGrid';
import CtaBanner from '../../components/public/CtaBanner';
import FaqAccordion from '../../components/public/FaqAccordion';
import FeatureCard from '../../components/public/FeatureCard';
import PageHeader from '../../components/public/PageHeader';
import { usePageMeta } from '../../components/public/PageMeta';
import Prose from '../../components/public/Prose';
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
 * The login and register content pages (inside PublicLayout): the H1 with the
 * Log In / Sign Up buttons right under it (they open the bare form screens),
 * the intro, the account section, then the content sections. No form here.
 *   content   login or register from content/auth.js
 *   below     shown in the account section (e.g. what the sign-up form asks for)
 */
function AuthShell({ content, below }) {
  usePageMeta(content.meta.title, content.meta.description);
  const { formSection, sections } = content;

  return (
    <>
      <PageHeader title={content.title} actions={content.actions} intro={content.intro} />

      <Section id={formSection.id} eyebrow={formSection.eyebrow} title={formSection.title} intro={formSection.intro}>
        {below}
        {formSection.notes && <Prose paragraphs={formSection.notes} className={below ? 'mt-10' : ''} />}
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
