import { useEffect, useState } from 'react';
import CardGrid from '../../components/public/CardGrid';
import DataTable from '../../components/public/DataTable';
import FaqAccordion from '../../components/public/FaqAccordion';
import FeatureCard from '../../components/public/FeatureCard';
import PageHeader from '../../components/public/PageHeader';
import { usePageMeta } from '../../components/public/PageMeta';
import PricingCard from '../../components/public/PricingCard';
import Prose from '../../components/public/Prose';
import Section from '../../components/public/Section';
import StepList from '../../components/public/StepList';
import TableOfContents from '../../components/public/TableOfContents';
import { header, intro, meta, sections, tableOfContents } from '../../content/pricing';
import api from '../../services/api';
import { RECOMMENDED_PLAN, formatChartsLimit, formatPlanPrice, formatRequestsLimit } from '../../utils/plans';

// Prices and limits from the public plans endpoint, keyed by plan id. `failed`
// is set when they could not be loaded; until then (or after) the cards show
// their text without a price.
function usePublishedPlans() {
  const [state, setState] = useState({ byId: {}, failed: false });

  useEffect(() => {
    let active = true;
    api
      .get('/subscription/plans')
      .then((res) => {
        if (active) setState({ byId: Object.fromEntries(res.data.plans.map((p) => [p.plan, p])), failed: false });
      })
      .catch(() => {
        if (active) setState({ byId: {}, failed: true });
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

// The card's price line and limit bullets for a published plan. A null price
// is a custom plan ("Custom", no "/ month").
function publishedDetails(published, priceNote) {
  if (!published) return {};
  const custom = published.price == null;
  return {
    price: custom ? formatPlanPrice(published.price) : `$${published.price.toLocaleString()}`,
    priceNote: custom ? undefined : priceNote,
    features: [formatRequestsLimit(published.requestsLimit), formatChartsLimit(published.chartsLimit)],
  };
}

function PlanCards({ section, published }) {
  return (
    <>
      <CardGrid>
        {section.plans.map(({ plan, ...card }) => (
          <PricingCard
            key={plan}
            {...card}
            {...publishedDetails(published.byId[plan], section.priceNote)}
            recommended={plan === RECOMMENDED_PLAN}
            badge={section.badge}
          />
        ))}
      </CardGrid>
      {published.failed && <p className="mt-8 text-center text-sm text-muted-foreground">{section.unavailableNote}</p>}
    </>
  );
}

// How each content `layout` renders inside its Section (see content/pricing.js).
const LAYOUTS = {
  plans: (section, published) => <PlanCards section={section} published={published} />,
  table: (section) => <DataTable columns={section.columns} rows={section.rows} caption={section.title} />,
  features: (section) => (
    <CardGrid columns={section.columns}>
      {section.items.map((item) => (
        <FeatureCard key={item.title} {...item} />
      ))}
    </CardGrid>
  ),
  steps: (section) => <StepList steps={section.items} />,
  faq: (section) => <FaqAccordion items={section.items} />,
  prose: (section) => <Prose paragraphs={section.paragraphs} />,
};

const tocItems = sections.map(({ id, title }) => ({ id, label: title }));

function PricingPage() {
  usePageMeta(meta.title, meta.description, meta.keywords);
  const published = usePublishedPlans();

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
          intro={section.intro}
          tone={index % 2 === 0 ? 'surface' : 'default'}
        >
          {LAYOUTS[section.layout](section, published)}
        </Section>
      ))}
    </>
  );
}

export default PricingPage;
