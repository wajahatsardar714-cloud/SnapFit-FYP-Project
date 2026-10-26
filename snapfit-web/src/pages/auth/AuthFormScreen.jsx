import { Link } from 'react-router-dom';
import Logo from '../../components/public/Logo';
import { usePageMeta } from '../../components/public/PageMeta';
import { brand } from '../../content/site';

/**
 * A bare form screen (no site header, footer or page content): the logo back
 * to the homepage, a heading and the form in a card. Always the light palette,
 * like the public site.
 *   content   { meta: { title, description }, title } from content/auth.js
 *   children  the form
 */
function AuthFormScreen({ content, children }) {
  usePageMeta(content.meta.title, content.meta.description);

  return (
    <div data-theme="light" className="flex min-h-screen flex-col items-center bg-background px-4 py-10 sm:py-16">
      <Link to="/" aria-label={brand.homeLabel} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Logo name={brand.name} />
      </Link>
      <main className="mt-8 w-full min-w-0 max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
        <h1 className="type-h3 break-words text-foreground">{content.title}</h1>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

export default AuthFormScreen;
