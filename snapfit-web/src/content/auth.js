// Login and register page content. Edit text here -- the auth pages render it.

export const login = {
  meta: {
    title: 'Log In | SnapFit',
    description: 'Log in to your SnapFit account to manage size charts, API keys and your subscription.',
  },
  title: 'Log in to SnapFit',
  subtitle: 'Sign in to your SnapFit account',
  switchPrompt: { text: "Don't have an account?", link: { label: 'Create one', to: '/register' } },
};

export const register = {
  meta: {
    title: 'Create Your Account | SnapFit',
    description: 'Create a SnapFit merchant account and bring AI clothing size estimation to your online store.',
  },
  title: 'Create your merchant account',
  subtitle: 'Start integrating SnapFit into your store',
  switchPrompt: { text: 'Already have an account?', link: { label: 'Sign in', to: '/login' } },
};

// Beside the form on large screens. Real product capabilities only.
export const panel = {
  title: 'Size recommendations for your store',
  points: [
    { icon: 'ruler', text: 'AI-powered size recommendations from a single photo' },
    { icon: 'scan', text: 'Guided capture works on desktop or phone — no app needed' },
    { icon: 'table', text: 'Match estimates against your own product size charts' },
  ],
};
