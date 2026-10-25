import Container from '../../components/public/Container';
import { usePageMeta } from '../../components/public/PageMeta';
import { meta, title } from '../../content/pricing';

// Placeholder until the full pricing page lands; rendered inside PublicLayout.
function PricingPage() {
  usePageMeta(meta.title, meta.description);

  return (
    <Container as="section" className="py-16 md:py-24">
      <h1 className="type-h1 break-words text-center text-foreground">{title}</h1>
    </Container>
  );
}

export default PricingPage;
