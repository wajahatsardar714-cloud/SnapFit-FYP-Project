import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Logo from '../../components/public/Logo';
import { usePageMeta } from '../../components/public/PageMeta';
import { brand } from '../../content/site';

/**
 * A bare form screen (no site header, footer or page content): a "Back to
 * home" link in the top right corner, the logo back to the homepage, a heading
 * and the form in a card. Always the light palette, like the public site.
 *   content   { meta: { title, description }, title } from content/auth.js
 *   children  the form
 */
function AuthFormScreen({ content, children }) {
  usePageMeta(content.meta.title, content.meta.description);

  return (
    <div data-theme="light" className="relative flex min-h-screen flex-col items-center bg-background px-4 py-10 sm:py-16">
      {/* Icon only on phones (the label stays for screen readers), icon and text from sm up. */}
      <Link
        to="/"
        aria-label={brand.backHome}
        className="absolute right-4 top-4 inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors duration-150 hover:bg-primary-soft hover:text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:right-6 sm:top-6"
      >
        <ArrowLeft aria-hidden="true" size={18} />
        <span className="hidden sm:inline">{brand.backHome}</span>
      </Link>
      <Link to="/" aria-label={brand.homeLabel} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Logo name={brand.name} size="lg" />
      </Link>
      <main className="mt-8 w-full min-w-0 max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
        <h1 className="type-h3 break-words text-foreground">{content.title}</h1>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

export default AuthFormScreen;
