import CardGrid from '../../components/public/CardGrid';
import CtaBanner from '../../components/public/CtaBanner';
import FaqAccordion from '../../components/public/FaqAccordion';
import FeatureCard from '../../components/public/FeatureCard';
import Hero from '../../components/public/Hero';
import { usePageMeta } from '../../components/public/PageMeta';
import PricingCard from '../../components/public/PricingCard';
import ProsConsTable from '../../components/public/ProsConsTable';
import Prose from '../../components/public/Prose';
import Section from '../../components/public/Section';
import SizingMock from '../../components/public/SizingMock';
import StepList from '../../components/public/StepList';
import TableOfContents from '../../components/public/TableOfContents';
import { hero, intro, meta, sections, tableOfContents } from '../../content/home';

// How each content `layout` renders inside its Section (see content/home.js).
const LAYOUTS = {
  prose: (section) => <Prose paragraphs={section.paragraphs} subsections={section.subsections} />,
  steps: (section) => <StepList steps={section.items} />,
  features: (section) => (
    <CardGrid>
      {section.items.map((item) => (
        <FeatureCard key={item.title} {...item} />
      ))}
    </CardGrid>
  ),
  prosCons: (section) => (
    <>
      <ProsConsTable rows={section.rows} labels={section.labels} caption={section.title} />
      <Prose paragraphs={section.outro} className="mt-10" />
    </>
  ),
  pricing: (section) => (
    <>
      <CardGrid>
        {section.plans.map((plan) => (
          <PricingCard key={plan.name} {...plan} />
        ))}
      </CardGrid>
      <Prose subsections={section.subsections} className="mt-16" />
    </>
  ),
  faq: (section) => <FaqAccordion items={section.items} />,
};

const tocItems = sections.map(({ id, title }) => ({ id, label: title }));

function HomePage() {
  usePageMeta(meta.title, meta.description, meta.keywords);

  return (
    <>
      <Hero {...hero} visual={<SizingMock labels={hero.visualLabels} />} />

      <Section>
        <Prose paragraphs={intro} />
        <div className="mt-12">
          <TableOfContents title={tableOfContents.title} items={tocItems} />
        </div>
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

export default HomePage;
