import { describe, expect, it } from 'vitest';
import { API_BASE, API_KEY_PLACEHOLDER, buildWidgetSnippet } from './widgetSnippet';

describe('buildWidgetSnippet', () => {
  it('uses the docs example product and a placeholder key by default', () => {
    const snippet = buildWidgetSnippet();
    expect(snippet).toContain('productId="SKU-1029"');
    expect(snippet).toContain(`apiKey="${API_KEY_PLACEHOLDER}"`);
    expect(snippet).toContain(`apiUrl="${API_BASE}"`);
    expect(snippet.startsWith("import SnapFitWidget from './SnapFitWidget';")).toBe(true);
  });

  it('fills in the given product ID', () => {
    expect(buildWidgetSnippet('TEE-42')).toContain('productId="TEE-42"');
  });

  it('writes an ID with a quote as a JS string so the JSX stays valid', () => {
    expect(buildWidgetSnippet('5" TEE')).toContain('productId={"5\\" TEE"}');
  });
});
