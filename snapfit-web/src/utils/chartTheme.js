import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';

// Recharts takes colours as plain strings (SVG attributes can't use CSS
// variables), so they're read from the live theme tokens in theme.css.

const rgb = (triplet, alpha = 1) => (alpha === 1 ? `rgb(${triplet})` : `rgb(${triplet} / ${alpha})`);

// Reads "--color-<name>" from an element's computed style.
export function cssTokenReader(element = document.documentElement) {
  const style = getComputedStyle(element);
  return (name) => style.getPropertyValue(`--color-${name}`).trim();
}

/**
 * Chart colours from a token reader (name -> "r g b" triplet).
 * Series stay on-brand: the primary blue, lighter tints of it, then the
 * neutral greys -- no extra hues. Status colours are kept for meaning
 * (fit results, the confidence gauge).
 */
export function getChartTheme(readToken = cssTokenReader()) {
  const primary = readToken('primary');
  const mutedForeground = readToken('muted-foreground');
  return {
    primary: rgb(primary),
    series: [rgb(primary), rgb(primary, 0.75), rgb(primary, 0.55), rgb(primary, 0.35), rgb(mutedForeground), rgb(readToken('muted'))],
    grid: rgb(readToken('border')),
    axis: rgb(mutedForeground),
    background: rgb(readToken('background')),
    foreground: rgb(readToken('foreground')),
    success: rgb(readToken('success')),
    warning: rgb(readToken('warning')),
    danger: rgb(readToken('danger')),
  };
}

// Chart colours for the current theme; recomputed when the theme changes.
export function useChartTheme() {
  const { theme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getChartTheme(), [theme]);
}
