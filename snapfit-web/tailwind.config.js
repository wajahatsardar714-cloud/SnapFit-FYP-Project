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
      // Light, purposeful motion: entrances, the size-check scan and loading
      // placeholders. index.css switches all of it off for prefers-reduced-motion.
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.6)' },
          '70%': { opacity: '1', transform: 'scale(1.06)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'grow-x': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        // A line sweeping down and up over the body outline while analysing.
        scan: { '0%, 100%': { top: '4%' }, '50%': { top: '92%' } },
        // An indeterminate bar: a short segment sliding across.
        progress: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(250%)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
      },
      animation: {
        'fade-in': 'fade-in 300ms ease-out both',
        'fade-up': 'fade-up 450ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'scale-in': 'scale-in 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'grow-x': 'grow-x 800ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        scan: 'scan 2.4s ease-in-out infinite',
        progress: 'progress 1.4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
