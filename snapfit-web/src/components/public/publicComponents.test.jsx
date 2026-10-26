import { render, renderHook, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import DataTable from './DataTable';
import FaqAccordion from './FaqAccordion';
import FeatureCard from './FeatureCard';
import Hero from './Hero';
import PageMeta, { usePageMeta } from './PageMeta';
import PricingCard from './PricingCard';
import ProsConsTable from './ProsConsTable';
import SmartLink from './SmartLink';
import TableOfContents from './TableOfContents';

const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
const descriptionTag = () => document.head.querySelector('meta[name="description"]');

describe('DataTable', () => {
  const columns = [
    { key: 'size', label: 'Size' },
    { key: 'chest', label: 'Chest', render: (row) => `${row.chest} cm` },
  ];
  const rows = [
    { size: 'S', chest: 90 },
    { size: 'M', chest: 98 },
  ];

  it('renders a header row and one row per item', () => {
    render(<DataTable columns={columns} rows={rows} caption="Size chart" />);
    const table = screen.getByRole('table', { name: 'Size chart' });
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Size', 'Chest']);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(table.querySelector('thead').className).toContain('bg-deep-blue');
    expect(screen.getByText('98 cm')).toBeTruthy();
  });

  it('labels every cell for the stacked card layout on narrow screens', () => {
    const { container } = render(<DataTable columns={columns} rows={rows} />);
    const cells = [...container.querySelectorAll('tbody td')];
    expect(cells.map((td) => td.querySelector('[data-slot="cell-label"]').textContent)).toEqual(['Size', 'Chest', 'Size', 'Chest']);
    expect(container.querySelector('table').className).not.toMatch(/overflow-x-(auto|scroll)/);
  });
});

describe('ProsConsTable', () => {
  it('puts each pro and con pair on one row under the given labels', () => {
    render(
      <ProsConsTable
        labels={{ pro: 'Pros', con: 'Cons' }}
        rows={[
          { pro: 'Fast', con: 'Needs a photo' },
          { pro: 'Personal', con: 'An estimate' },
        ]}
      />
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.lastChild.textContent))).toEqual([
      ['Fast', 'Needs a photo'],
      ['Personal', 'An estimate'],
    ]);
  });
});

describe('FaqAccordion', () => {
  it('renders each question as a closed native disclosure', () => {
    const { container } = render(
      <FaqAccordion
        items={[
          { question: 'One?', answer: ['First answer.'] },
          { question: 'Two?', answer: ['Second answer.'] },
        ]}
      />
    );
    const details = container.querySelectorAll('details');
    expect(details).toHaveLength(2);
    expect([...details].every((item) => !item.open)).toBe(true);
    expect(details[0].querySelector('summary').textContent).toBe('One?');
  });
});

describe('TableOfContents', () => {
  it('lists links to the section ids, collapsed by default', () => {
    const { container } = inRouter(
      <TableOfContents
        title="Table of contents"
        items={[
          { id: 'one', label: 'Section one' },
          { id: 'two', label: 'Section two' },
        ]}
      />
    );
    expect(container.querySelector('details').open).toBe(false);
    const nav = screen.getByRole('navigation', { name: 'Table of contents' });
    expect(within(nav).getAllByRole('link', { hidden: true }).map((a) => a.getAttribute('href'))).toEqual(['#one', '#two']);
  });

  it('marks the section in the URL hash as current', () => {
    render(
      <MemoryRouter initialEntries={['/#two']}>
        <TableOfContents title="Contents" items={[{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }]} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Two', hidden: true }).getAttribute('aria-current')).toBe('location');
    expect(screen.getByRole('link', { name: 'One', hidden: true }).getAttribute('aria-current')).toBeNull();
  });
});

describe('FeatureCard', () => {
  it('shows the icon chip in the top-right slot after the heading', () => {
    const { container } = render(<FeatureCard title="Fast sizing" icon="ruler" paragraphs={['Body text.']} />);
    const icon = container.querySelector('[data-slot="icon"]');
    const row = icon.parentElement;
    expect(row.firstElementChild).toBe(screen.getByRole('heading', { level: 3, name: 'Fast sizing' }));
    expect(row.lastElementChild).toBe(icon);
    expect(row.className).toContain('justify-between');
    expect(icon.className).toContain('bg-primary-soft');
    expect(icon.querySelector('svg')).toBeTruthy();
  });
});

describe('Hero', () => {
  const heroGrid = () => screen.getByRole('region', { name: 'Title' }).firstElementChild;

  it('puts the visual beside the text from desktop', () => {
    inRouter(<Hero title="Title" visual={<span>Art</span>} />);
    expect(heroGrid().className).toContain('lg:grid-cols-2');
    expect(screen.getByText('Art')).toBeTruthy();
  });

  it('gives the text the full width without a visual', () => {
    inRouter(<Hero title="Title" />);
    expect(heroGrid().className).not.toContain('lg:grid-cols-2');
    expect(heroGrid().children).toHaveLength(1);
  });
});

describe('PricingCard', () => {
  it('highlights the recommended plan with a blue border and badge', () => {
    inRouter(
      <>
        <PricingCard name="Small" description="For new stores." cta={{ label: 'Choose Small', to: '/register?plan=small' }} />
        <PricingCard
          name="Medium"
          price="$49"
          priceNote="/month"
          features={['More checks']}
          recommended
          cta={{ label: 'Choose Medium', to: '/register?plan=medium' }}
        />
      </>
    );
    const medium = screen.getByRole('heading', { name: 'Medium' }).closest('article');
    expect(medium.className).toContain('border-primary');
    expect(within(medium).getByText('Recommended')).toBeTruthy();
    expect(within(medium).getByText('$49')).toBeTruthy();
    expect(within(medium).getByRole('link', { name: 'Choose Medium' }).getAttribute('href')).toBe('/register?plan=medium');

    const small = screen.getByRole('heading', { name: 'Small' }).closest('article');
    expect(small.className).not.toContain('border-primary');
    expect(within(small).queryByText('Recommended')).toBeNull();
  });
});

describe('SmartLink', () => {
  it('renders plain text for a page that is not live yet', () => {
    inRouter(
      <>
        <SmartLink to="/privacy" live={false}>
          Privacy Policy
        </SmartLink>
        <SmartLink to="/pricing">Pricing</SmartLink>
      </>
    );
    expect(screen.queryByRole('link', { name: 'Privacy Policy' })).toBeNull();
    expect(screen.getByText('Privacy Policy')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pricing' }).getAttribute('href')).toBe('/pricing');
  });
});

describe('usePageMeta', () => {
  const canonicalTag = () => document.head.querySelector('link[rel="canonical"]');
  const atPath = (path) =>
    function Router({ children }) {
      return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
    };

  it('sets the title, description and canonical permalink, and restores them on unmount', () => {
    document.title = 'Before';
    const { unmount } = renderHook(() => usePageMeta('Page title', 'Page description', ['a', 'b']), {
      wrapper: atPath('/pricing?ref=ad#plans'),
    });
    expect(document.title).toBe('Page title');
    expect(descriptionTag().getAttribute('content')).toBe('Page description');
    expect(document.head.querySelector('meta[name="keywords"]').getAttribute('content')).toBe('a, b');
    expect(canonicalTag().getAttribute('href')).toBe(`${window.location.origin}/pricing`);

    unmount();
    expect(document.title).toBe('Before');
    expect(descriptionTag()).toBeNull();
    expect(document.head.querySelector('meta[name="keywords"]')).toBeNull();
    expect(canonicalTag()).toBeNull();
  });

  it('works as a component too', () => {
    render(<PageMeta title="Component title" description="Component description" />, { wrapper: atPath('/') });
    expect(document.title).toBe('Component title');
    expect(descriptionTag().getAttribute('content')).toBe('Component description');
  });
});
