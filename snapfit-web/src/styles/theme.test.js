import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from disk: Vitest blanks CSS imports (?raw included) by default.
const css = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8');

// The brand palette, exactly as specified. Values are what each theme block
// must define (triplets as hex, *-soft tokens as written).
const LIGHT = {
  primary: '#377DFF',
  'primary-hover': '#1A56C7',
  'primary-soft': 'rgb(234 242 255)',
  'primary-foreground': '#FFFFFF',
  link: '#1F64E0',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  'surface-2': '#F1F5F9',
  foreground: '#172033',
  body: '#475569',
  'muted-foreground': '#64748B',
  muted: '#94A3B8',
  border: '#E2E8F0',
  navy: '#101D2C',
  'navy-raised': '#1D2E44',
  'deep-blue': '#1D3557',
  inverse: '#FFFFFF',
  'inverse-muted': '#B6C2D1',
  'inverse-accent': '#9DC2FF',
  success: '#0F766E',
  danger: '#B91C1C',
};

const DARK = {
  primary: '#377DFF',
  'primary-hover': '#5A93FF',
  'primary-soft': 'rgb(55 125 255 / 0.16)',
  'primary-foreground': '#FFFFFF',
  link: '#7AA7FF',
  background: '#121212',
  surface: '#1C1C1C',
  'surface-2': '#242424',
  foreground: '#FFFFFF',
  body: '#D6D6D6',
  'muted-foreground': '#ADADAD',
  muted: '#777777',
  border: '#333333',
  navy: '#0B1520',
  'navy-raised': '#16263A',
  'deep-blue': '#1D3557',
  inverse: '#FFFFFF',
  'inverse-muted': '#B6C2D1',
  'inverse-accent': '#9DC2FF',
  success: '#2DD4BF',
  danger: '#F87171',
};

const SHARED_NAMES = ['success-soft', 'warning', 'warning-soft', 'danger-soft', 'overlay'];
// The super admin console's own accent (values differ per theme).
const ADMIN_NAMES = ['admin', 'admin-soft', 'admin-foreground'];

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
    const expected = [...Object.keys(LIGHT), ...SHARED_NAMES, ...ADMIN_NAMES].sort();
    expect(Object.keys(light).sort()).toEqual(expected);
    expect(Object.keys(dark).sort()).toEqual(expected);
  });

  it('sets the native colour scheme per theme', () => {
    expect(block("[data-theme='light']")).toContain('color-scheme: light');
    expect(block("[data-theme='dark']")).toContain('color-scheme: dark');
  });
});
