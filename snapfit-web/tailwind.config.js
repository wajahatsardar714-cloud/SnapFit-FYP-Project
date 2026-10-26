// Every colour comes from a CSS variable in src/styles/theme.css; this file
// only names them. Triplet variables get opacity-modifier support.
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // ThemeContext sets data-theme on <html>; dark: variants follow it.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      // Manrope (loaded in index.html) for the whole app, with a system stack
      // while it loads or if it can't.
      fontFamily: {
        sans: [
          'Manrope',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        primary: {
          DEFAULT: token('primary'),
          hover: token('primary-hover'),
          soft: 'var(--color-primary-soft)',
          foreground: token('primary-foreground'),
        },
        link: token('link'),
        background: token('background'),
        surface: {
          DEFAULT: token('surface'),
          2: token('surface-2'),
        },
        foreground: token('foreground'),
        body: token('body'),
        'muted-foreground': token('muted-foreground'),
        muted: token('muted'),
        border: token('border'),
        navy: {
          DEFAULT: token('navy'),
          raised: token('navy-raised'),
        },
        'deep-blue': token('deep-blue'),
        inverse: {
          DEFAULT: token('inverse'),
          muted: token('inverse-muted'),
          accent: token('inverse-accent'),
        },
        success: { DEFAULT: token('success'), soft: 'var(--color-success-soft)' },
        warning: { DEFAULT: token('warning'), soft: 'var(--color-warning-soft)' },
        danger: { DEFAULT: token('danger'), soft: 'var(--color-danger-soft)' },
        overlay: token('overlay'),
        admin: {
          DEFAULT: token('admin'),
          soft: 'var(--color-admin-soft)',
          foreground: token('admin-foreground'),
        },
      },
      // Focus-ring offsets take the page background instead of always white.
      ringOffsetColor: {
        DEFAULT: 'rgb(var(--color-background))',
      },
      borderRadius: {
        xl: '0.875rem',
      },
      boxShadow: {
        // The only shadow allowed on default-state cards (none in dark mode).
        card: 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
};
