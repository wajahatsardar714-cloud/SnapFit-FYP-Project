import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Colours live only in src/styles/theme.css. This guard fails on hex colours
// and raw Tailwind palette classes anywhere else in src/. A line that really
// needs one must say why with a "theme-allow: <reason>" comment.
const SRC = resolve(process.cwd(), 'src');
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/;
const PALETTE =
  /\b(?:bg|text|border|ring|ring-offset|fill|stroke|divide|placeholder|outline|from|to|via|shadow|accent|caret|decoration)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/;

// Files still being converted in a later theme section.
const PENDING = new Set([
  'components/widget/PoseGuideOverlay.jsx',
  'hooks/useLivePoseDetection.js',
  'pages/dashboard/AnalyticsDashboardPage.jsx',
  'pages/dashboard/AnchorPointsPage.jsx',
  'pages/demo/AiTestPage.jsx',
]);

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__fixtures__' ? [] : sourceFiles(full);
    return /\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name) ? [full] : [];
  });
}

function violations() {
  return sourceFiles(SRC).flatMap((file) => {
    const rel = relative(SRC, file).replace(/\\/g, '/');
    if (PENDING.has(rel)) return [];
    return readFileSync(file, 'utf8')
      .split('\n')
      .map((line, i) => ({ line, at: `${rel}:${i + 1}` }))
      .filter(({ line }) => (HEX.test(line) || PALETTE.test(line)) && !line.includes('theme-allow:'))
      .map(({ line, at }) => `${at}  ${line.trim()}`);
  });
}

describe('theme guard', () => {
  it('finds no hard-coded colours outside theme.css', () => {
    expect(violations()).toEqual([]);
  });
});
