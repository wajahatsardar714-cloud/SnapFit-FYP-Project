import { Fragment } from 'react';
import bannerAdvancedAi from '../../assets/banners/snapfit-banner-1.webp';
import bannerShopperTools from '../../assets/banners/snapfit-banner-2.webp';
import CardGrid from '../../components/public/CardGrid';
import CtaBanner from '../../components/public/CtaBanner';
import FaqAccordion from '../../components/public/FaqAccordion';
import FeatureCard from '../../components/public/FeatureCard';
import Hero from '../../components/public/Hero';
import Logo from '../../components/public/Logo';
import { usePageMeta } from '../../components/public/PageMeta';
import PricingCard from '../../components/public/PricingCard';
import PromoBanner from '../../components/public/PromoBanner';
import ProsConsTable from '../../components/public/ProsConsTable';
import Prose from '../../components/public/Prose';
import Section from '../../components/public/Section';
import SizingMock from '../../components/public/SizingMock';
import StepList from '../../components/public/StepList';
import TableOfContents from '../../components/public/TableOfContents';
import { banners, hero, intro, meta, sections, tableOfContents } from '../../content/home';
import { brand } from '../../content/site';

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

// The image for each banner in content/home.js (Vite hashes them for caching).
const BANNER_IMAGES = { 'advanced-ai': bannerAdvancedAi, 'shopper-tools': bannerShopperTools };

// The promo banners that follow a block: 'contents' or a section id.
function BannersAfter({ id, className = '' }) {
  const placed = banners.filter((banner) => banner.after === id);
  if (placed.length === 0) return null;
  return (
    <div className={`space-y-12 ${className}`}>
      {placed.map((banner) => (
        <PromoBanner key={banner.id} src={BANNER_IMAGES[banner.id]} alt={banner.alt} />
      ))}
    </div>
  );
}

const hasBannersAfter = (id) => banners.some((banner) => banner.after === id);

function HomePage() {
  usePageMeta(meta.title, meta.description, meta.keywords);

  return (
    <>
      <Hero
        {...hero}
        badge={
          // A white circle behind the navy badge, so it stands out on the navy hero.
          <span className="inline-flex h-[153px] w-[153px] items-center justify-center rounded-full bg-inverse shadow-card md:h-[170px] md:w-[170px]">
            <Logo name={brand.name} size="xl" />
          </span>
        }
        actionsFirst
        centered
        visual={<SizingMock labels={hero.visualLabels} />}
      />

      <Section>
        <Prose paragraphs={intro} />
        <div className="mt-12">
          <TableOfContents title={tableOfContents.title} items={tocItems} />
        </div>
        <BannersAfter id="contents" className="mt-12" />
      </Section>

      {sections.map((section, index) => {
        const tone = index % 2 === 0 ? 'surface' : 'default';
        return (
          <Fragment key={section.id}>
            {section.layout === 'cta' ? (
              <CtaBanner {...section} />
            ) : (
              <Section id={section.id} eyebrow={section.eyebrow} title={section.title} intro={section.intro} tone={tone}>
                {LAYOUTS[section.layout](section)}
              </Section>
            )}
            {/* A banner after a section shares its background, without a second top gap. */}
            {hasBannersAfter(section.id) && (
              <Section tone={tone} className="pt-0 md:pt-0">
                <BannersAfter id={section.id} />
              </Section>
            )}
          </Fragment>
        );
      })}
    </>
  );
}

export default HomePage;
