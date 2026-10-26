import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { slugify } from './components/public/anchors';
import { withLink } from './content/links';
import api from './services/api';

vi.mock('./services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  setAccountSuspendedHandler: vi.fn(),
  setSubscriptionRequiredHandler: vi.fn(),
}));

function renderAt(path) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

async function pageMain() {
  await screen.findByRole('heading', { level: 1 });
  return screen.getByRole('main');
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { plans: [] } });
});

describe('withLink', () => {
  it('links one phrase and keeps the paragraph word for word', () => {
    const parts = withLink('Try SnapFit sizing today.', 'SnapFit sizing', '/');
    expect(parts).toEqual(['Try ', { text: 'SnapFit sizing', to: '/' }, ' today.']);
    expect(parts.map((part) => (typeof part === 'string' ? part : part.text)).join('')).toBe('Try SnapFit sizing today.');
  });

  it('refuses a phrase that is not in the paragraph', () => {
    expect(() => withLink('Try SnapFit today.', 'missing words', '/')).toThrow(/missing words/);
  });
});

describe('internal links to the homepage', () => {
  it.each(['/pricing', '/guide', '/login', '/register', '/privacy', '/terms', '/cookies'])(
    '%s links the homepage once, from a word in its text',
    async (path) => {
      renderAt(path);
      const main = await pageMain();

      const homeLinks = within(main)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href') === '/');
      expect(homeLinks).toHaveLength(1);
      const [link] = homeLinks;
      // Inside running text, not a button-style call to action or a bare URL.
      expect(link.closest('p')).not.toBeNull();
      expect(link.textContent).not.toMatch(/^(https?:\/\/|\/)/);
      expect(link.textContent.trim().length).toBeGreaterThan(0);
    }
  );

  it('the homepage links its integration questions to the guide', async () => {
    renderAt('/');
    const main = await pageMain();
    expect(within(main).getByRole('link', { name: 'integration documentation' }).getAttribute('href')).toBe('/guide');
  });
});

describe('deep links', () => {
  it('slugs headings into stable anchors', () => {
    expect(slugify('Can I Use SnapFit on a Custom Website?')).toBe('can-i-use-snapfit-on-a-custom-website');
    expect(slugify("Use Your Store's Size Charts")).toBe('use-your-store-s-size-charts');
  });

  it('gives sections a "#" link and their items their own ids', async () => {
    renderAt('/guide');
    const main = await pageMain();

    const anchor = within(main).getByRole('link', { name: 'Link to the section How SnapFit Works' });
    const sectionId = anchor.getAttribute('href').slice(1);
    expect(document.getElementById(sectionId).tagName).toBe('SECTION');
    expect(document.getElementById(`${sectionId}-${slugify('Body Landmark Detection')}`)).not.toBeNull();
  });

  it.each(['/', '/pricing', '/guide', '/login', '/register', '/privacy', '/terms', '/cookies'])(
    '%s has no duplicate anchor ids',
    async (path) => {
      renderAt(path);
      await pageMain();
      const ids = [...document.body.querySelectorAll('[id]')].map((element) => element.id);
      expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    }
  );

  it('opens the FAQ question a link points at', async () => {
    renderAt('/guide');
    const main = await pageMain();
    const question = within(main).getByText('Does SnapFit Work with Shopify?').closest('details');
    expect(question.open).toBe(false);

    renderAt(`/guide#${question.id}`);
    await waitFor(() => expect(document.getElementById(question.id).open).toBe(true));
  });

  it('gives each page a canonical permalink', async () => {
    renderAt('/pricing?utm_source=ad#plans');
    await pageMain();
    expect(document.head.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(
      `${window.location.origin}/pricing`
    );
  });
});

describe('unknown URLs', () => {
  it('show a not-found page that links back into the site from its text', async () => {
    renderAt('/no-such-page');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    const home = within(screen.getByRole('main')).getByRole('link', { name: 'SnapFit homepage' });
    expect(home.getAttribute('href')).toBe('/');
    expect(home.closest('p')).not.toBeNull();
  });
});
