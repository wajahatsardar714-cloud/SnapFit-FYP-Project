import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { homePathFor, roleOf } from '../../utils/roles';
import ButtonLink from './ButtonLink';
import Container from './Container';
import Logo from './Logo';
import SmartLink from './SmartLink';

const MENU_ID = 'site-menu';

// A page link is current on that page and below it ("/guide" on "/guide/x");
// "/" only on the homepage itself.
function isCurrent(to, pathname) {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
}

function NavLinks({ links, pathname, className, linkClassName }) {
  return (
    <ul className={className}>
      {links.map((link) => {
        const current = isCurrent(link.to, pathname);
        return (
          <li key={link.label}>
            <SmartLink
              to={link.to}
              aria-current={current ? 'page' : undefined}
              className={`${linkClassName} rounded-lg font-semibold transition-colors duration-150 hover:bg-primary-soft hover:text-link ${
                current ? 'text-link' : 'text-navy'
              }`}
            >
              {link.label}
            </SmartLink>
          </li>
        );
      })}
    </ul>
  );
}

// Login + Get Started, or the account's home (Dashboard/Admin) once signed in.
function AccountActions({ nav, className, buttonClassName = '' }) {
  const { isAuthenticated, merchant } = useAuth();
  if (isAuthenticated) {
    return (
      <div className={className}>
        <ButtonLink to={homePathFor(merchant)} size="sm" className={buttonClassName}>
          {nav.account[roleOf(merchant)]}
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className={className}>
      <ButtonLink to={nav.login.to} variant="outline" size="sm" className={buttonClassName}>
        {nav.login.label}
      </ButtonLink>
      <ButtonLink to={nav.register.to} size="sm" className={buttonClassName}>
        {nav.register.label}
      </ButtonLink>
    </div>
  );
}

/**
 * Sticky white site header: logo, navigation and account buttons. Below lg the
 * links and buttons move into a toggle menu (closes on navigation and Escape).
 *   brand  { name, homeLabel }
 *   nav    { navLabel, links: [{ label, to }], login, register: { label, to },
 *            account: { merchant, superadmin } labels, menu: { open, close } }
 */
function SiteHeader({ brand, nav }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.key]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => event.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link to="/" aria-label={brand.homeLabel} className="shrink-0 rounded-lg">
          <Logo name={brand.name} />
        </Link>

        <nav aria-label={nav.navLabel} className="hidden lg:block">
          <NavLinks links={nav.links} pathname={location.pathname} className="flex items-center gap-1" linkClassName="block px-3 py-2 text-[0.9375rem]" />
        </nav>
        <AccountActions nav={nav} className="hidden items-center gap-2 lg:flex" />

        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls={MENU_ID}
          aria-label={menuOpen ? nav.menu.close : nav.menu.open}
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-navy hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
        >
          {menuOpen ? <X aria-hidden="true" size={24} /> : <Menu aria-hidden="true" size={24} />}
        </button>
      </Container>

      <div id={MENU_ID} hidden={!menuOpen} className="border-t border-border bg-surface lg:hidden">
        <Container className="py-4">
          <nav aria-label={nav.navLabel}>
            <NavLinks links={nav.links} pathname={location.pathname} className="space-y-1" linkClassName="block px-3 py-3 text-base" />
          </nav>
          <AccountActions nav={nav} className="mt-4 grid gap-3 border-t border-border pt-4" buttonClassName="w-full" />
        </Container>
      </div>
    </header>
  );
}

export default SiteHeader;
