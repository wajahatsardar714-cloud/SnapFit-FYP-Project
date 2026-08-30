/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          // Fills a gap in F.1's original scale (100 jumped straight to 500) --
          // needed by F.5's hover:border-primary-200. Standard indigo-200.
          200: '#C7D2FE',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          DEFAULT: '#4F46E5',
        },
        accent: {
          DEFAULT: '#8B5CF6',
          hover: '#7C3AED',
        },
        success: { DEFAULT: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', text: '#047857' },
        danger: { DEFAULT: '#EF4444', bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
        warning: { DEFAULT: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
        info: { DEFAULT: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
        ink: {
          900: '#111827', // headings
          700: '#374151', // body text
          500: '#6B7280', // muted text
          300: '#D1D5DB', // disabled/placeholder
        },
        surface: {
          page: '#F9FAFB',
          card: '#FFFFFF',
          border: '#E5E7EB',
        },
      },
      borderRadius: {
        xl: '0.875rem',
      },
      boxShadow: {
        // The ONLY shadow allowed on default-state cards -- no heavier shadows,
        // drop shadows, or glow effects anywhere in this theme.
        card: '0 1px 2px 0 rgba(16, 24, 40, 0.05)',
      },
    },
  },
  plugins: [],
};
