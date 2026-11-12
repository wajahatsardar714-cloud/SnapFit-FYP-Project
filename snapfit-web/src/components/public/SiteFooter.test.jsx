import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { brand, footer } from '../../content/site';
import SiteFooter from './SiteFooter';

describe('SiteFooter', () => {
  it('shows the copyright line for this year, centred', () => {
    render(
      <MemoryRouter>
        <SiteFooter brand={brand} footer={footer} />
      </MemoryRouter>
    );
    const copyright = screen.getByText(`© ${new Date().getFullYear()} SnapFit. All rights reserved.`);
    expect(copyright.className).toContain('text-center');
  });
});
