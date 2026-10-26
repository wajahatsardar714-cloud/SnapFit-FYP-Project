// Site-wide public content: brand, header navigation and footer. Edit text and
// links here -- the components in src/components/public only render it.
//
// A link is { label, to, live? }. `to` is a route ("/pricing"), a section on
// the homepage ("/#faq"), or an external/mailto URL. `live: false` renders the
// label as plain text, for pages that are planned but not built yet.

// Pages referenced from several places. A page with `live: false` shows as
// plain text everywhere it is linked (footer, FAQ answers, ...) until it exists.
export const PAGES = {
  home: { to: '/', live: true },
  pricing: { to: '/pricing', live: true },
  guide: { to: '/guide', live: true },
  login: { to: '/login', live: true },
  register: { to: '/register', live: true },
  privacy: { to: '/privacy', live: true },
  terms: { to: '/terms', live: true },
  cookies: { to: '/cookies', live: true },
};

export const CONTACT_EMAIL = 'wajahatsardar714@gmail.com';

// The contact address as an inline link ({ text, to }), for content paragraphs.
export const contactEmailLink = { text: CONTACT_EMAIL, to: `mailto:${CONTACT_EMAIL}` };

export const brand = {
  name: 'SnapFit',
  homeLabel: 'SnapFit home',
};

export const header = {
  skipLink: 'Skip to main content',
  navLabel: 'Main',
  links: [
    { label: 'Home', to: PAGES.home.to },
    { label: 'Pricing', to: PAGES.pricing.to },
    { label: 'Guide', to: PAGES.guide.to },
  ],
  login: { label: 'Login', to: PAGES.login.to },
  register: { label: 'Get Started', to: PAGES.register.to },
  // Shown instead of Login/Get Started when signed in, keyed by account role
  // (src/utils/roles.js); the link goes to that role's home.
  account: { merchant: 'Dashboard', superadmin: 'Admin' },
  menu: { open: 'Open menu', close: 'Close menu' },
};

export const footer = {
  blurb: 'AI clothing size estimation and personalized size recommendations for online clothing stores.',
  columns: [
    {
      title: 'Product',
      links: [
        { label: 'Home', ...PAGES.home },
        { label: 'Pricing', ...PAGES.pricing },
        { label: 'Guide', ...PAGES.guide },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Login', ...PAGES.login },
        { label: 'Register', ...PAGES.register },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy Policy', ...PAGES.privacy },
        { label: 'Terms of Service', ...PAGES.terms },
        { label: 'Cookie Policy', ...PAGES.cookies },
      ],
    },
    {
      title: 'Contact',
      links: [{ label: CONTACT_EMAIL, to: contactEmailLink.to }],
    },
  ],
  // {year} is replaced with the current year.
  copyright: '© {year} SnapFit. All rights reserved.',
};

// Shown for any URL that isn't a page (the public layout's catch-all route).
export const notFound = {
  meta: { title: 'Page Not Found | SnapFit', description: 'This page does not exist on the SnapFit website.' },
  title: 'Page not found',
  paragraphs: [
    [
      "The page you are looking for doesn't exist or has moved. Head back to the ",
      { text: 'SnapFit homepage', to: PAGES.home.to },
      ', compare our ',
      { text: 'pricing plans', to: PAGES.pricing.to },
      ', or read the ',
      { text: 'setup guide', to: PAGES.guide.to },
      '.',
    ],
  ],
};
