import { describe, expect, it } from 'vitest';

// The public site has one content width: no reading column or narrow container
// left in its components, pages or layout.
const sources = import.meta.glob(
  ['./*.jsx', '../../pages/public/*.jsx', '../../layouts/PublicLayout.jsx', '!./*.test.jsx', '!../../pages/public/*.test.jsx'],
  { query: '?raw', import: 'default', eager: true }
);

describe('public site width', () => {
  it('scans the public components, pages and layout', () => {
    const files = Object.keys(sources);
    expect(files).toEqual(expect.arrayContaining(['./Prose.jsx', './Container.jsx', '../../pages/public/LegalPage.jsx']));
  });

  it('uses no reading column or narrow container anywhere', () => {
    const narrow = /max-w-(reading|3xl|2xl|prose)\b|size=["'](reading|narrow)["']|containerSize/;
    expect(Object.keys(sources).filter((file) => narrow.test(sources[file]))).toEqual([]);
  });
});
