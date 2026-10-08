import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getChartTheme } from './chartTheme';

// Token readers built from the real theme.css (jsdom doesn't apply stylesheets).
const css = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8');

function readerFor(selector) {
  const start = css.indexOf(selector);
  const block = css.slice(start, css.indexOf('}', start));
  const tokens = Object.fromEntries([...block.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
  return (name) => tokens[name];
}

describe('getChartTheme', () => {
  const light = getChartTheme(readerFor("[data-theme='light']"));
  const dark = getChartTheme(readerFor("[data-theme='dark']"));

  it('uses the primary blue for the main series in both themes', () => {
    expect(light.primary).toBe('rgb(26 113 184)');
    expect(dark.primary).toBe('rgb(26 113 184)');
    expect(light.series[0]).toBe(light.primary);
  });

  it('gives axis text and grid lines different colours per theme', () => {
    expect(light.axis).toBe('rgb(102 112 133)');
    expect(dark.axis).toBe('rgb(173 173 173)');
    expect(light.grid).toBe('rgb(217 226 234)');
    expect(dark.grid).toBe('rgb(51 51 51)');
  });

  it('keeps series on-brand: blue tints and neutral greys only', () => {
    const allowed = /^rgb\((26 113 184|102 112 133|152 162 179)( \/ 0\.\d+)?\)$/;
    light.series.forEach((colour) => expect(colour).toMatch(allowed));
  });
});
