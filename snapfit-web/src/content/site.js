// Site-wide public content: brand, header navigation and footer. Edit text and
// links here -- the components in src/components/public only render it.
//
// A link is { label, to, live? }. `to` is a route ("/pricing"), a section on
// the homepage ("/#faq"), or an external/mailto URL. `live: false` renders the
// label as plain text, for pages that are planned but not built yet.

// Pages referenced from several places. Flip `live` to true once a page exists
// and every link to it (footer, FAQ answers, ...) starts working.
export const PAGES = {
  pricing: { to: '/pricing', live: true },
  privacy: { to: '/privacy', live: false },
  terms: { to: '/terms', live: false },
};

export const brand = {
  name: 'SnapFit',
  homeLabel: 'SnapFit home',
};

export const header = {
  skipLink: 'Skip to main content',
  navLabel: 'Main',
  links: [
    { label: 'Home', to: '/' },
    { label: 'How it works', to: '/#how-it-works' },
    { label: 'Features', to: '/#features' },
    { label: 'Pricing', to: PAGES.pricing.to },
    { label: 'FAQ', to: '/#faq' },
  ],
  login: { label: 'Login', to: '/login' },
  register: { label: 'Get Started', to: '/register' },
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
        { label: 'How it works', to: '/#how-it-works' },
        { label: 'Features', to: '/#features' },
        { label: 'Pricing', ...PAGES.pricing },
        { label: 'FAQ', to: '/#faq' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'Integration steps', to: '/#integration' },
        { label: 'Accuracy and limitations', to: '/#accuracy' },
        { label: 'Photo privacy', to: '/#privacy' },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Get Started', to: '/register' },
        { label: 'Log In', to: '/login' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy Policy', ...PAGES.privacy },
        { label: 'Terms', ...PAGES.terms },
      ],
    },
  ],
  // Placeholder address (.example is a reserved domain): replace it with the
  // real support inbox before launch.
  contact: {
    title: 'Contact',
    links: [{ label: 'support@snapfit.example', to: 'mailto:support@snapfit.example' }],
  },
  // {year} is replaced with the current year.
  copyright: '© {year} SnapFit. All rights reserved.',
};
