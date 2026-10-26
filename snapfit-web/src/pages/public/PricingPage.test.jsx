import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hero, meta, sections } from '../../content/pricing';
import api from '../../services/api';
import { paragraph } from '../../test/text';
import PricingPage from './PricingPage';

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));

const PLANS = [
  { plan: 'small', name: 'Small', price: 29, requestsLimit: 1000, chartsLimit: 3 },
  { plan: 'medium', name: 'Medium', price: 79, requestsLimit: 10000, chartsLimit: 20 },
  { plan: 'enterprise', name: 'Enterprise', price: null, requestsLimit: null, chartsLimit: null },
];

let container;

function renderPage() {
  ({ container } = render(
    <MemoryRouter initialEntries={['/pricing']}>
      <PricingPage />
    </MemoryRouter>
  ));
}

const section = (id) => container.querySelector(`#${id}`);
const planCards = () => [...section('plans').querySelectorAll('article')];

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { plans: PLANS } });
});

describe('PricingPage', () => {
  beforeEach(renderPage);

  it('sets the SEO title, description and keywords', () => {
    expect(document.title).toBe('SnapFit Pricing Plans | AI Clothing Size Estimation');
    expect(document.head.querySelector('meta[name="description"]').getAttribute('content')).toBe(
      'Explore SnapFit pricing plans for AI clothing size estimation. Find the right plan for your online store and simplify clothing size recommendations.'
    );
    expect(document.head.querySelector('meta[name="keywords"]').getAttribute('content')).toContain(
      'AI sizing solution for online stores'
    );
  });

  it('has the H1, the short description and buttons to register and log in', () => {
    const heroRegion = screen.getByRole('region', { name: hero.title });
    expect(within(heroRegion).getByRole('heading', { level: 1 }).textContent).toBe(
      'SnapFit Pricing Plans for AI Clothing Size Estimation'
    );
    expect(within(heroRegion).getByText(meta.description)).toBeTruthy();
    expect(within(heroRegion).getByRole('link', { name: 'Get Started' }).getAttribute('href')).toBe('/signup');
    expect(within(heroRegion).getByRole('link', { name: 'Log In' }).getAttribute('href')).toBe('/signin');
  });

  it('renders every H2 with its eyebrow', () => {
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Choose the Right SnapFit Pricing Plan',
      'Compare SnapFit Pricing Plans',
      'What Is Included in an AI Clothing Size Estimation Solution?',
      'How to Choose the Right SnapFit Plan',
      'How SnapFit Pricing Works',
      'Why Choose SnapFit for Clothing Size Recommendations?',
      'Frequently Asked Questions About SnapFit Pricing',
      'Find the Right SnapFit Plan for Your Business',
    ]);
    for (const { id, eyebrow, title } of sections) {
      expect(within(section(id)).getByText(eyebrow)).toBeTruthy();
      expect(within(section(id)).getByRole('heading', { level: 2 }).textContent).toBe(title);
    }
    expect(within(section('plans')).getByText('Three Subscription Tiers')).toBeTruthy();
    expect(within(section('faq')).getByText('Pricing Questions')).toBeTruthy();
  });

  it('keeps the copy verbatim', () => {
    for (const sentence of [
      'Choosing the right sizing solution can make a difference in how customers shop at your online clothing store. SnapFit offers an AI-powered clothing size estimation and recommendation platform that helps retailers provide personalized sizing guidance through their existing e-commerce websites.',
      'Before subscribing, consider how many customers may use the sizing tool, which product categories you want to support, and whether your website requires a standard or custom integration.',
      "The table below provides a framework for comparing SnapFit's three subscription tiers. Check the current pricing page or account interface for confirmed prices and plan limits before subscribing.",
      'SnapFit uses MediaPipe BlazePose to detect relevant body landmarks from a customer photo. The measurement engine processes the available information to estimate supported body measurements.',
      'Check the actual upgrade process, billing terms, and any usage restrictions before making a long-term decision.',
      'Before launching, test the photo upload process, recommendation output, error handling, and product-page button. Confirm that customers receive clear guidance throughout the sizing workflow.',
      'Ready to explore SnapFit? Review the available pricing plans, create your account, and take the next step toward introducing AI-powered clothing size recommendations to your online store.',
    ]) {
      expect(screen.getByText(paragraph(sentence))).toBeTruthy();
    }
    for (const h3 of ['Photo-Based Body Measurement', 'Consider Your Store Size', 'Configure Product Size Charts', "Use Your Store's Size Charts"]) {
      expect(screen.getByRole('heading', { level: 3, name: h3 })).toBeTruthy();
    }
  });

  it('lists every H2 in a table of contents that starts collapsed', () => {
    const toc = screen.getByRole('navigation', { name: 'Table of contents' });
    expect(toc.querySelector('details').open).toBe(false);
    const links = within(toc).getAllByRole('link', { hidden: true });
    expect(links.map((link) => link.textContent)).toEqual(sections.map((s) => s.title));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(sections.map((s) => `#${s.id}`));
  });

  it('shows three plan cards, Medium recommended, with their verbatim text and register links', () => {
    const cards = planCards();
    expect(cards.map((card) => card.querySelector('h3').textContent)).toEqual(['Small Plan', 'Medium Plan', 'Enterprise Plan']);
    expect(cards[1].className).toContain('border-primary');
    expect(within(cards[1]).getByText('Recommended')).toBeTruthy();
    expect(within(cards[0]).queryByText('Recommended')).toBeNull();
    expect(within(cards[0]).getByText('Best for: Smaller online retailers looking for an entry-level sizing solution.')).toBeTruthy();
    expect(
      within(cards[2]).getByText(
        'Get started: Review the Enterprise plan details and contact SnapFit for clarification about available options.'
      )
    ).toBeTruthy();
    expect(cards.map((card) => within(card).getByRole('link', { name: 'Get started' }).getAttribute('href'))).toEqual([
      '/signup?plan=small',
      '/signup?plan=medium',
      '/signup?plan=enterprise',
    ]);
  });

  it('adds the published prices and limits from the plans endpoint', async () => {
    expect(api.get).toHaveBeenCalledWith('/subscription/plans');
    const [small, medium, enterprise] = planCards();
    expect(await within(small).findByText('$29')).toBeTruthy();
    expect(within(small).getByText('/ month')).toBeTruthy();
    expect(within(small).getByText('1,000 requests/month')).toBeTruthy();
    expect(within(medium).getByText('$79')).toBeTruthy();
    expect(within(medium).getByText('10,000 requests/month')).toBeTruthy();
    expect(within(enterprise).getByText('Custom')).toBeTruthy();
    expect(within(enterprise).queryByText('/ month')).toBeNull();
    expect(within(enterprise).getByText('Unlimited requests')).toBeTruthy();
    expect(within(enterprise).getByText('Unlimited size charts')).toBeTruthy();
    expect(screen.queryByText(sections[0].unavailableNote)).toBeNull();
  });

  it('compares the plans in the site table: 4 columns, 8 rows', () => {
    const table = within(section('compare')).getByRole('table', { name: 'Compare SnapFit Pricing Plans' });
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Feature',
      'Small',
      'Medium',
      'Enterprise',
    ]);
    const rows = table.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(8);
    const cells = (row) => [...row.cells].map((cell) => cell.lastChild.textContent);
    expect(cells(rows[0])).toEqual(['Intended business size', 'Smaller stores', 'Growing stores', 'Larger businesses']);
    expect(cells(rows[5])).toEqual([
      'Custom integration requirements',
      'Confirm compatibility',
      'Confirm compatibility',
      'Discuss requirements',
    ]);
    expect(cells(rows[7])).toEqual(['Pricing', 'See current pricing', 'See current pricing', 'See current pricing']);
  });

  it('shows the included features and selection tips as icon cards, and the pricing steps in order', () => {
    expect(section('whats-included').querySelectorAll('article')).toHaveLength(4);
    expect(section('choose-a-plan').querySelectorAll('article')).toHaveLength(5);
    expect(section('why-snapfit').querySelectorAll('article')).toHaveLength(5);
    for (const card of section('whats-included').querySelectorAll('article')) {
      expect(card.querySelector('[data-slot="icon"] svg')).toBeTruthy();
    }
    const steps = within(section('how-pricing-works')).getAllByRole('listitem');
    expect(steps.map((step) => step.querySelector('h3').textContent)).toEqual([
      'Choose a Subscription Plan',
      'Create Your SnapFit Account',
      'Access Your API Credentials',
      'Integrate SnapFit with Your Website',
      'Configure Product Size Charts',
      'Test the Customer Experience',
    ]);
  });

  it('renders the FAQ as native details, linking the pricing page to the plans', () => {
    const items = section('faq').querySelectorAll('details');
    expect(items).toHaveLength(11);
    expect(items[0].querySelector('summary').textContent).toBe('How Much Does SnapFit Cost?');
    expect(items[0].textContent).toContain(
      'The price of each plan should be confirmed on the current pricing page, along with its included features, usage allowances, and billing terms.'
    );
    const links = within(section('faq')).getAllByRole('link', { name: 'pricing page', hidden: true });
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#plans', '#plans']);
    expect(items[10].querySelector('summary').textContent).toBe('How Can I Get Help Choosing a Plan?');
  });

  it('ends with the call to action', () => {
    const cta = section('find-your-plan');
    expect(within(cta).getByRole('link', { name: 'Get Started' }).getAttribute('href')).toBe('/signup');
    expect(within(cta).getByRole('link', { name: 'Compare plans' }).getAttribute('href')).toBe('#plans');
  });
});

describe('PricingPage without published plans', () => {
  it('keeps the cards, without prices, and adds a muted note when the plans fail to load', async () => {
    api.get.mockRejectedValue(new Error('Network Error'));
    renderPage();

    const note = await screen.findByText(sections[0].unavailableNote);
    expect(note.className).toContain('text-muted-foreground');
    const cards = planCards();
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.textContent).not.toMatch(/\$\d|Custom|Unlimited|requests\/month/);
      expect(within(card).getByRole('link', { name: 'Get started' })).toBeTruthy();
    }
  });

  it('shows the cards without prices or a note while the plans load', async () => {
    api.get.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(planCards()).toHaveLength(3);
    expect(section('plans').textContent).not.toMatch(/\$\d/);
    expect(screen.queryByText(sections[0].unavailableNote)).toBeNull();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
  });
});
