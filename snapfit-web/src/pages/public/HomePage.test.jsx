import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { hero, meta, sections } from '../../content/home';
import HomePage from './HomePage';

let container;

beforeEach(() => {
  ({ container } = render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  ));
});

const section = (id) => container.querySelector(`#${id}`);

describe('HomePage', () => {
  it('sets the SEO title, description and keywords', () => {
    expect(document.title).toBe('AI Clothing Size Estimation for Online Stores | SnapFit');
    expect(document.head.querySelector('meta[name="description"]').getAttribute('content')).toBe(
      'Help shoppers find the right clothing size with SnapFit AI clothing size estimation. Integrate photo-based sizing into your online store.'
    );
    expect(document.head.querySelector('meta[name="keywords"]').getAttribute('content')).toContain('size recommendation API');
  });

  it('has the H1 and hero buttons that link to register and login', () => {
    const heroRegion = screen.getByRole('region', { name: hero.title });
    expect(within(heroRegion).getByRole('heading', { level: 1 }).textContent).toBe(
      'AI Clothing Size Estimation and Recommendation for Online Stores'
    );
    expect(within(heroRegion).getByRole('link', { name: 'Get Started' }).getAttribute('href')).toBe('/register');
    expect(within(heroRegion).getByRole('link', { name: 'Log In' }).getAttribute('href')).toBe('/login');
    expect(within(heroRegion).getByText(meta.description)).toBeTruthy();
  });

  it('renders every H2 with its eyebrow, in a section the nav can link to', () => {
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(h2s).toEqual([
      'What Is SnapFit AI Clothing Size Estimation?',
      'How SnapFit Works',
      'Key Features of SnapFit',
      'Benefits of AI Clothing Size Estimation for Online Stores',
      'SnapFit Pros and Cons',
      'How to Integrate SnapFit with Your Online Store',
      'SnapFit Pricing Plans',
      'Measurement Accuracy and Limitations',
      'Privacy and Customer Photo Handling',
      'AI Clothing Size Estimation vs. Virtual Try-On',
      'Frequently Asked Questions',
      'Get Started with SnapFit',
    ]);
    for (const { id, eyebrow, title } of sections) {
      expect(within(section(id)).getByText(eyebrow)).toBeTruthy();
      expect(within(section(id)).getByRole('heading', { level: 2 }).textContent).toBe(title);
    }
    for (const id of ['how-it-works', 'features', 'faq']) expect(section(id)).toBeTruthy();
    expect(within(section('how-it-works')).getByText('Workflow')).toBeTruthy();
    expect(within(section('pros-and-cons')).getByText('Trade-offs')).toBeTruthy();
    expect(within(section('faq')).getByText('Questions')).toBeTruthy();
  });

  it('keeps the copy verbatim', () => {
    for (const sentence of [
      "SnapFit helps online clothing stores address this challenge with AI clothing size estimation and personalized size recommendations. Our platform uses a customer's photo to estimate supported body measurements, compare those estimates with the retailer's product size chart, and recommend a suitable clothing size.",
      'The resulting recommendation depends on the available image information, the supported measurements, and the quality of the product size chart. It is an estimate rather than a guarantee of how a garment will fit.',
      'Do not expose secret credentials in public code, customer-facing pages, or repositories. Use the recommended authentication method for the integration.',
      'For current prices and plan details, review the SnapFit pricing page.',
      'Get started with SnapFit today and bring AI clothing size estimation to your online store.',
    ]) {
      expect(screen.getByText(sentence)).toBeTruthy();
    }
    expect(screen.getByRole('heading', { level: 3, name: 'Upload a Single Photo' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'The Importance of Accurate Size Charts' })).toBeTruthy();
  });

  it('lists every H2 in a table of contents that starts collapsed', () => {
    const toc = screen.getByRole('navigation', { name: 'Table of contents' });
    expect(toc.querySelector('details').open).toBe(false);
    const links = within(toc).getAllByRole('link', { hidden: true });
    expect(links.map((link) => link.textContent)).toEqual(sections.map((s) => s.title));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(sections.map((s) => `#${s.id}`));
    for (const { id } of sections) expect(section(id)).toBeTruthy();
  });

  it('shows the steps as ordered lists', () => {
    const steps = within(section('how-it-works')).getAllByRole('listitem');
    expect(steps).toHaveLength(5);
    expect(within(section('integration')).getAllByRole('listitem')).toHaveLength(6);
  });

  it('puts each feature card icon in the top-right slot', () => {
    for (const id of ['features', 'benefits']) {
      const cards = section(id).querySelectorAll('article');
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        const icon = card.querySelector('[data-slot="icon"]');
        expect(icon.parentElement.firstElementChild.tagName).toBe('H3');
        expect(icon.parentElement.lastElementChild).toBe(icon);
      }
    }
    expect(section('features').querySelectorAll('article')).toHaveLength(7);
    expect(section('benefits').querySelectorAll('article')).toHaveLength(5);
  });

  it('pairs the 8 pros and cons row by row', () => {
    const table = within(section('pros-and-cons')).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Pros', 'Cons']);
    const rows = table.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(8);
    expect([...rows[0].cells].map((cell) => cell.lastChild.textContent)).toEqual([
      'Provides photo-based sizing assistance',
      'Estimates may be affected by image quality',
    ]);
    expect([...rows[7].cells].map((cell) => cell.lastChild.textContent)).toEqual([
      'Can scale with business requirements',
      'Higher usage or enterprise needs may require a larger plan',
    ]);
  });

  it('shows three plan cards with Medium recommended and no prices', () => {
    const cards = section('pricing').querySelectorAll('article');
    expect([...cards].map((card) => card.querySelector('h3').textContent)).toEqual(['Small Plan', 'Medium Plan', 'Enterprise Plan']);
    expect(cards[1].className).toContain('border-primary');
    expect(within(cards[1]).getByText('Recommended')).toBeTruthy();
    for (const card of cards) {
      expect(within(card).getByRole('link', { name: 'View pricing' }).getAttribute('href')).toBe('/pricing');
      expect(card.textContent).not.toMatch(/\$\d/);
    }
  });

  it('renders the FAQ as native details, with the Pricing page linked', () => {
    const items = section('faq').querySelectorAll('details');
    expect(items).toHaveLength(12);
    expect(items[0].querySelector('summary').textContent).toBe('What Is AI Clothing Size Estimation?');
    expect(within(section('faq')).getByRole('link', { name: 'Pricing page', hidden: true }).getAttribute('href')).toBe('/pricing');
    // The Privacy Policy page doesn't exist yet: plain text, same words.
    expect(within(section('faq')).queryByRole('link', { name: 'Privacy Policy', hidden: true })).toBeNull();
    expect(items[11].textContent).toContain(
      "Store owners and shoppers should review SnapFit's Privacy Policy for details about processing, storage, access, and deletion."
    );
  });

  it('ends with the call to action', () => {
    const cta = section('get-started');
    expect(within(cta).getByRole('link', { name: 'Get Started' }).getAttribute('href')).toBe('/register');
    expect(within(cta).getByRole('link', { name: 'View pricing' }).getAttribute('href')).toBe('/pricing');
  });
});
