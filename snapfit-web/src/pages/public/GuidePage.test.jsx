import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from '../../App';
import { header, meta, sections } from '../../content/guide';
import GuidePage from './GuidePage';

function renderGuide() {
  return render(
    <MemoryRouter>
      <GuidePage />
    </MemoryRouter>
  );
}

const section = (container, id) => container.querySelector(`#${id}`);

describe('GuidePage', () => {
  it('renders at /guide inside the site header and footer', async () => {
    localStorage.clear();
    window.history.pushState({}, '', '/guide');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: header.title })).toBeTruthy();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });

  it('sets the SEO title, description and keywords', () => {
    renderGuide();
    expect(document.title).toBe('SnapFit Guide | Setup, API Integration and AI Sizing');
    expect(document.head.querySelector('meta[name="description"]').getAttribute('content')).toBe(
      'Learn how to set up SnapFit, integrate its AI clothing size estimation API, configure size charts, troubleshoot issues, and manage your account.'
    );
    expect(document.head.querySelector('meta[name="keywords"]').getAttribute('content')).toBe(
      'SnapFit guide, AI clothing size estimation guide, SnapFit API integration, clothing size recommendation setup'
    );
  });

  it('opens with a plain header: the H1 and description, no banner or buttons', () => {
    renderGuide();
    const top = screen.getByRole('region', { name: header.title });
    expect(within(top).getByRole('heading', { level: 1 }).textContent).toBe(
      'SnapFit Guide: Setup, Integration, and AI Clothing Size Estimation'
    );
    expect(within(top).getByText(meta.description)).toBeTruthy();
    expect(within(top).queryAllByRole('link')).toEqual([]);
    expect(top.className).not.toContain('bg-navy');
  });

  it('renders every H2 with its eyebrow in its own section', () => {
    const { container } = renderGuide();
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'What Is SnapFit?',
      'How SnapFit Works',
      'How to Get Started with SnapFit',
      'SnapFit API Integration Guide',
      'Configure Product Categories and Size Charts',
      'Photo Requirements and Measurement Limitations',
      'Privacy and Responsible Data Handling',
      'Troubleshooting Common Issues',
      'Frequently Asked Questions',
      'Start Using SnapFit',
    ]);
    for (const { id, eyebrow, title } of sections) {
      expect(within(section(container, id)).getByText(eyebrow)).toBeTruthy();
      expect(within(section(container, id)).getByRole('heading', { level: 2 }).textContent).toBe(title);
    }
    expect(within(section(container, 'how-it-works')).getByText('Photo to Size')).toBeTruthy();
    expect(within(section(container, 'faq')).getByText('Retailer Questions')).toBeTruthy();
  });

  it('keeps the copy verbatim', () => {
    renderGuide();
    for (const sentence of [
      'Welcome to the SnapFit Guide. This resource helps online clothing retailers understand how SnapFit works, prepare their store for integration, configure product size charts, and provide AI-assisted clothing size recommendations to customers.',
      'The service estimates supported measurements rather than directly observing every body dimension. Its recommendations should be treated as guidance, not a guarantee of perfect garment fit.',
      'SnapFit is designed around an API-driven architecture, which allows compatible websites to connect to its sizing service.',
      'When product specifications change, update the associated size charts. Regular checks can help prevent outdated data from producing unsuitable recommendations.',
      'Images with poor lighting, unusual camera angles, obstructed body landmarks, or loose clothing may provide less useful information.',
    ]) {
      expect(screen.getByText(sentence)).toBeTruthy();
    }
    for (const name of ['Customer Photo Submission', 'Test the Complete Experience', 'The API Request Fails']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeTruthy();
    }
  });

  it('lists every H2 in a table of contents that starts collapsed', () => {
    const { container } = renderGuide();
    const toc = screen.getByRole('navigation', { name: 'Table of contents' });
    expect(toc.querySelector('details').open).toBe(false);
    const links = within(toc).getAllByRole('link', { hidden: true });
    expect(links.map((link) => link.textContent)).toEqual(sections.map((s) => s.title));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(sections.map((s) => `#${s.id}`));
    for (const { id } of sections) expect(section(container, id)).toBeTruthy();
  });

  it('shows the workflow and setup as ordered steps and the fixes as icon cards', () => {
    const { container } = renderGuide();
    expect(within(section(container, 'how-it-works')).getAllByRole('listitem')).toHaveLength(5);
    expect(within(section(container, 'get-started')).getAllByRole('listitem')).toHaveLength(6);
    const cards = section(container, 'troubleshooting').querySelectorAll('article');
    expect(cards).toHaveLength(5);
    for (const card of cards) expect(card.querySelector('[data-slot="icon"] svg')).toBeTruthy();
  });

  it('renders the FAQ as native details with the support email linked', () => {
    const { container } = renderGuide();
    const faq = section(container, 'faq');
    const items = faq.querySelectorAll('details');
    expect([...items].map((item) => item.querySelector('summary').textContent)).toEqual([
      'Does SnapFit Work with Shopify?',
      'Can I Use SnapFit on a Custom Website?',
      'Does SnapFit Guarantee the Correct Size?',
      'Where Can I Get Help?',
    ]);
    for (const item of items) expect(item.open).toBe(false);
    expect(within(faq).getByRole('link', { name: 'wajahatsardar714@gmail.com', hidden: true }).getAttribute('href')).toBe(
      'mailto:wajahatsardar714@gmail.com'
    );
    expect(items[3].textContent).toContain(
      'For questions about registration, subscriptions, or integration, contact wajahatsardar714@gmail.com. Do not send passwords or secret API credentials in support messages.'
    );
  });

  it('links the Privacy Policy, Pricing page and legal policies without changing the words', () => {
    const { container } = renderGuide();
    const privacy = section(container, 'privacy');
    expect(within(privacy).getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy');
    expect(privacy.textContent).toContain(
      "Review SnapFit's Privacy Policy for the actual data collection, processing, retention, and deletion practices."
    );

    const cta = section(container, 'start-using-snapfit');
    expect(within(cta).getByRole('link', { name: 'Pricing page' }).getAttribute('href')).toBe('/pricing');
    expect(within(cta).getByRole('link', { name: 'legal policies' }).getAttribute('href')).toBe('/privacy');
    expect(cta.textContent).toContain(
      'Use this guide alongside the official API documentation, Pricing page, and legal policies to prepare your store and maintain a reliable sizing experience.'
    );
    // A normal closing section now, without the banner's buttons.
    expect(within(cta).queryByRole('link', { name: 'Get Started' })).toBeNull();
    expect(cta.className).not.toContain('bg-navy');
  });
});
