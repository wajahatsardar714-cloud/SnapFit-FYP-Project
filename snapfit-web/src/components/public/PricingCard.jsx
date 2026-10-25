import { Check } from 'lucide-react';
import ButtonLink from './ButtonLink';
import { Paragraphs } from './RichText';

/**
 * One plan. White card; `recommended` adds the blue border and a badge.
 *   name         plan name (heading)
 *   price        price label, e.g. '$29' (optional -- the homepage shows none)
 *   priceNote    text after the price, e.g. '/month' (optional)
 *   description  paragraph texts (see RichText) or a single string
 *   features     bullet points (optional)
 *   cta          { label, to } -- the card's button
 *   recommended  highlight this plan
 *   badge        badge text when recommended, default 'Recommended'
 *   headingAs    heading element, default 'h3'
 */
function PricingCard({
  name,
  price,
  priceNote,
  description = [],
  features = [],
  cta,
  recommended = false,
  badge = 'Recommended',
  headingAs: Heading = 'h3',
}) {
  const paragraphs = Array.isArray(description) ? description : [description];
  return (
    <article
      className={`relative flex h-full min-w-0 flex-col rounded-xl bg-surface p-6 shadow-card sm:p-8 ${
        recommended ? 'border-2 border-primary' : 'border border-border'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading className="type-h3 break-words text-deep-blue">{name}</Heading>
        {recommended && (
          <span className="type-label rounded-full bg-primary px-3 py-1 text-primary-foreground">{badge}</span>
        )}
      </div>

      {price && (
        <p className="mt-4 break-words text-foreground">
          <span className="type-h2">{price}</span>
          {priceNote && <span className="ml-1 text-muted-foreground">{priceNote}</span>}
        </p>
      )}

      <div className="mt-4 space-y-3 break-words text-[0.9375rem] leading-relaxed text-body">
        <Paragraphs items={paragraphs} />
      </div>

      {features.length > 0 && (
        <ul className="mt-6 space-y-3 text-[0.9375rem] text-body">
          {features.map((feature) => (
            <li key={feature} className="flex min-w-0 items-start gap-2.5">
              <Check aria-hidden="true" focusable="false" size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-success" />
              <span className="min-w-0 break-words">{feature}</span>
            </li>
          ))}
        </ul>
      )}

      {cta && (
        <div className="mt-auto pt-8">
          <ButtonLink to={cta.to} variant={recommended ? 'primary' : 'outline'} className="w-full">
            {cta.label}
          </ButtonLink>
        </div>
      )}
    </article>
  );
}

export default PricingCard;
