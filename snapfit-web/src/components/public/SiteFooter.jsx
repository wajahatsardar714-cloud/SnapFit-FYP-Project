import { Link } from 'react-router-dom';
import Container from './Container';
import FooterWidget from './FooterWidget';
import Logo from './Logo';

/**
 * Navy site footer: brand blurb, link columns (a FooterWidget each) and a
 * copyright bar. The columns stack on phones, sit two-up on tablets and share
 * one row from desktop, however many there are.
 *   brand   { name, homeLabel }
 *   footer  { blurb, columns: [{ title, links }],
 *             copyright -- '{year}' becomes the current year }
 */
function SiteFooter({ brand, footer }) {
  const copyright = footer.copyright.replace('{year}', new Date().getFullYear());

  return (
    <footer className="bg-navy text-inverse-muted">
      <Container className="grid grid-cols-1 gap-10 py-14 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-16">
        <div className="min-w-0">
          <Link to="/" aria-label={brand.homeLabel} className="inline-block rounded-lg">
            <Logo name={brand.name} tone="inverse" />
          </Link>
          <p className="mt-4 max-w-xs break-words text-[0.9375rem] leading-relaxed">{footer.blurb}</p>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-10 sm:grid-cols-2 lg:flex lg:justify-between lg:gap-8">
          {footer.columns.map((column) => (
            <FooterWidget key={column.title} title={column.title} links={column.links} />
          ))}
        </div>
      </Container>
      <div className="border-t border-inverse/10">
        <Container className="py-6">
          <p className="text-sm">{copyright}</p>
        </Container>
      </div>
    </footer>
  );
}

export default SiteFooter;
