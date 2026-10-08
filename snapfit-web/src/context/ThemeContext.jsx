import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Must match the inline script in index.html, which applies the saved theme
// before React loads (no flash of the wrong theme on reload).
export const THEME_STORAGE_KEY = 'snapfit-theme';
export const THEMES = ['light', 'dark'];
const DEFAULT_THEME = 'light';

// 'system' (follow the OS) is supported but not offered in the UI yet.
function resolveTheme(preference) {
  if (preference === 'system') {
    const prefersDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }
  return THEMES.includes(preference) ? preference : DEFAULT_THEME;
}

function readStoredPreference() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function storePreference(preference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage blocked (private mode, disabled cookies): the choice still
    // applies for this visit.
  }
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readStoredPreference);
  const theme = resolveTheme(preference);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    setPreference(next);
    storePreference(next);
  }, []);

  const toggleTheme = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [setTheme, theme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
