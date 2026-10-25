import { Link } from 'react-router-dom';
import Container from './Container';
import FooterWidget from './FooterWidget';
import Logo from './Logo';

/**
 * Navy site footer: brand blurb, link columns (FooterWidget each), contact and
 * a copyright bar.
 *   brand   { name, homeLabel }
 *   footer  { blurb, columns: [{ title, links }], contact: { title, links },
 *             copyright -- '{year}' becomes the current year }
 */
function SiteFooter({ brand, footer }) {
  const columns = footer.contact ? [...footer.columns, footer.contact] : footer.columns;
  const copyright = footer.copyright.replace('{year}', new Date().getFullYear());

  return (
    <footer className="bg-navy text-inverse-muted">
      <Container className="grid grid-cols-1 gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(5,minmax(0,1fr))] lg:gap-8">
        <div className="min-w-0 sm:col-span-2 lg:col-span-1">
          <Link to="/" aria-label={brand.homeLabel} className="inline-block rounded-lg">
            <Logo name={brand.name} tone="inverse" />
          </Link>
          <p className="mt-4 max-w-xs break-words text-[0.9375rem] leading-relaxed">{footer.blurb}</p>
        </div>
        {columns.map((column) => (
          <FooterWidget key={column.title} title={column.title} links={column.links} />
        ))}
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
