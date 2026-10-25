import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import PageLoader from '../components/PageLoader';
import ScrollToHash from '../components/public/ScrollToHash';
import SiteFooter from '../components/public/SiteFooter';
import SiteHeader from '../components/public/SiteHeader';
import { brand, footer, header } from '../content/site';

const MAIN_ID = 'main-content';

// Public site shell (home, pricing, login, register): skip link, header, the
// page, footer. Always the light palette, even when the dashboard is set to
// dark. overflow-x-clip is only a safety net -- content must fit on its own --
// and, unlike overflow-hidden, it keeps the sticky header working.
function PublicLayout() {
  return (
    <div data-theme="light" className="flex min-h-screen flex-col overflow-x-clip bg-background">
      <a
        href={`#${MAIN_ID}`}
        className="sr-only rounded-lg bg-surface px-4 py-2 font-semibold text-link shadow-card focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      >
        {header.skipLink}
      </a>
      <SiteHeader brand={brand} nav={header} />
      <main id={MAIN_ID} tabIndex={-1} className="flex-1 focus:outline-none">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
          <ScrollToHash />
        </Suspense>
      </main>
      <SiteFooter brand={brand} footer={footer} />
    </div>
  );
}

export default PublicLayout;
