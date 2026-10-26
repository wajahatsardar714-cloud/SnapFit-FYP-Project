import CardGrid from '../../components/public/CardGrid';
import FaqAccordion from '../../components/public/FaqAccordion';
import FeatureCard from '../../components/public/FeatureCard';
import PageHeader from '../../components/public/PageHeader';
import { usePageMeta } from '../../components/public/PageMeta';
import Prose from '../../components/public/Prose';
import Section from '../../components/public/Section';
import StepList from '../../components/public/StepList';
import TableOfContents from '../../components/public/TableOfContents';
import { header, intro, meta, sections, tableOfContents } from '../../content/guide';

// How each content `layout` renders inside its Section (see content/guide.js).
const LAYOUTS = {
  prose: (section) => <Prose paragraphs={section.paragraphs} />,
  steps: (section) => <StepList steps={section.items} />,
  cards: (section) => (
    <CardGrid>
      {section.items.map((item) => (
        <FeatureCard key={item.title} {...item} />
      ))}
    </CardGrid>
  ),
  faq: (section) => <FaqAccordion items={section.items} />,
};

const tocItems = sections.map(({ id, title }) => ({ id, label: title }));

function GuidePage() {
  usePageMeta(meta.title, meta.description, meta.keywords);

  return (
    <>
      <PageHeader title={header.title} intro={[header.description]} />

      <Section>
        <Prose paragraphs={intro} />
        <div className="mt-12">
          <TableOfContents title={tableOfContents.title} items={tocItems} />
        </div>
      </Section>

      {sections.map((section, index) => (
        <Section
          key={section.id}
          id={section.id}
          eyebrow={section.eyebrow}
          title={section.title}
          tone={index % 2 === 0 ? 'surface' : 'default'}
        >
          {LAYOUTS[section.layout](section)}
        </Section>
      ))}
    </>
  );
}

export default GuidePage;
