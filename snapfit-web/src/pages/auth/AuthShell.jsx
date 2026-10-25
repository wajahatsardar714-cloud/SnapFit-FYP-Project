import { Link } from 'react-router-dom';
import Container from '../../components/public/Container';
import { usePageMeta } from '../../components/public/PageMeta';
import AuthSidePanel from './AuthSidePanel';

// Shared frame for the login and register pages (inside PublicLayout): a white
// form card beside the navy value panel. `content` is login or register from
// content/auth.js; `children` is the form.
function AuthShell({ content, children }) {
  usePageMeta(content.meta.title, content.meta.description);
  const { switchPrompt } = content;

  return (
    <Container className="grid grid-cols-1 items-start gap-8 py-12 md:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-12">
      <div className="mx-auto w-full min-w-0 max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8 lg:max-w-none">
        <h1 className="type-h3 break-words text-foreground">{content.title}</h1>
        <p className="mt-1 text-[0.9375rem] text-body">{content.subtitle}</p>

        {children}

        <p className="mt-6 text-center text-sm text-body">
          {switchPrompt.text}{' '}
          <Link to={switchPrompt.link.to} className="font-semibold text-link hover:underline">
            {switchPrompt.link.label}
          </Link>
        </p>
      </div>
      <AuthSidePanel />
    </Container>
  );
}

export default AuthShell;
