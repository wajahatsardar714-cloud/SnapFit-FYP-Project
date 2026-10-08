import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from disk: Vitest blanks CSS imports (?raw included) by default.
const css = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8');

// The brand palette, exactly as specified. Values are what each theme block
// must define (triplets as hex, *-soft tokens as written).
const LIGHT = {
  primary: '#1A71B8',
  'primary-hover': '#155F9C',
  'primary-soft': 'rgb(229 242 252)',
  'primary-foreground': '#FFFFFF',
  background: '#FFFFFF',
  surface: '#F7FAFC',
  'surface-2': '#EEF6FC',
  foreground: '#17212B',
  'muted-foreground': '#667085',
  muted: '#98A2B3',
  border: '#D9E2EA',
};

const DARK = {
  primary: '#1A71B8',
  'primary-hover': '#2586D0',
  'primary-soft': 'rgb(26 113 184 / 0.16)',
  'primary-foreground': '#FFFFFF',
  background: '#121212',
  surface: '#1C1C1C',
  'surface-2': '#242424',
  foreground: '#FFFFFF',
  'muted-foreground': '#ADADAD',
  muted: '#777777',
  border: '#333333',
};

const SHARED_NAMES = ['success', 'success-soft', 'warning', 'warning-soft', 'danger', 'danger-soft', 'overlay'];

function block(selector) {
  const start = css.indexOf(selector);
  return css.slice(start, css.indexOf('}', start));
}

function readTokens(selector) {
  const tokens = {};
  for (const [, name, value] of block(selector).matchAll(/--color-([\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

const toHex = (triplet) =>
  `#${triplet
    .split(/\s+/)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();

function normalised(tokens) {
  return Object.fromEntries(
    Object.entries(tokens).map(([name, value]) => [name, /^\d+ \d+ \d+$/.test(value) ? toHex(value) : value])
  );
}

describe('theme.css', () => {
  const light = normalised(readTokens("[data-theme='light']"));
  const dark = normalised(readTokens("[data-theme='dark']"));

  it('defines the exact light palette on :root and [data-theme=light]', () => {
    expect(css).toMatch(/:root,\s*\[data-theme='light'\]/);
    expect(light).toMatchObject(LIGHT);
  });

  it('defines the exact dark palette on [data-theme=dark]', () => {
    expect(dark).toMatchObject(DARK);
  });

  it('defines every token in both themes', () => {
    const expected = [...Object.keys(LIGHT), ...SHARED_NAMES].sort();
    expect(Object.keys(light).sort()).toEqual(expected);
    expect(Object.keys(dark).sort()).toEqual(expected);
  });

  it('sets the native colour scheme per theme', () => {
    expect(block("[data-theme='light']")).toContain('color-scheme: light');
    expect(block("[data-theme='dark']")).toContain('color-scheme: dark');
  });
});
