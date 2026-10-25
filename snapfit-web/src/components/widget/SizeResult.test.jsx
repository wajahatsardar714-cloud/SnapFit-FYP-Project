import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SizeResult from './SizeResult';

const per = (name, userValue, min, max, status) => ({ name, userValue, min, max, status });

const RESULT = {
  size: 'M',
  confidence: 0.86,
  alternativeSize: 'L',
  bodyType: 'average',
  notes: 'Based on your proportions, M is the best fit.',
  measurements: {
    chest: { value: 101.4, unit: 'cm', estimated: true },
    shoulderWidth: { value: 44.2, unit: 'cm', estimated: false },
  },
  sizeComparison: [
    { label: 'XS', score: 0, perMeasurement: [per('chest', 101.4, 78, 86, 'above'), per('shoulderWidth', 44.2, 37, 40, 'above')] },
    { label: 'S', score: 0.1, perMeasurement: [per('chest', 101.4, 86, 94, 'above'), per('shoulderWidth', 44.2, 40, 43, 'above')] },
    { label: 'M', score: 0.97, perMeasurement: [per('chest', 101.4, 94, 102, 'within'), per('shoulderWidth', 44.2, 43, 46, 'within')] },
    { label: 'L', score: 0.6, perMeasurement: [per('chest', 101.4, 102, 110, 'below'), per('shoulderWidth', 44.2, 46, 49, 'below')] },
  ],
  fitNotes: ['Chest is near the top of M; consider L for a looser fit.'],
};

describe('SizeResult', () => {
  it('shows the size, alternative and confidence', () => {
    render(<SizeResult result={RESULT} />);
    expect(screen.getByText('M', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText('L', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('86%')).toBeTruthy();
  });

  it('compares measurements with the recommended and neighbouring sizes', () => {
    render(<SizeResult result={RESULT} />);
    const table = within(screen.getByRole('table'));

    expect(table.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['cm', 'You', 'S', 'M', 'L']);
    const chestRow = within(table.getByRole('row', { name: /Chest/ }));
    expect(chestRow.getAllByRole('cell').map((td) => td.textContent)).toEqual(['≈101', '86–94', '94–102', '102–110']);
    const shoulderRow = within(table.getByRole('row', { name: /Shoulders/ }));
    expect(shoulderRow.getAllByRole('cell')[0].textContent).toBe('44');
  });

  it('marks estimated measurements and shows fit notes', () => {
    render(<SizeResult result={RESULT} />);
    expect(screen.getByTitle('Estimated from your photo')).toBeTruthy();
    expect(screen.getByText(/estimated from your photo — circumferences/)).toBeTruthy();
    expect(screen.getByText('Chest is near the top of M; consider L for a looser fit.')).toBeTruthy();
  });

  it('shows warnings above the size', () => {
    const warning = { id: 'possible_child', message: 'This looks like a child; check the size chart.' };
    render(<SizeResult result={{ ...RESULT, warnings: [warning] }} />);

    const warnings = screen.getByRole('list', { name: 'Warnings' });
    expect(within(warnings).getByText(warning.message)).toBeTruthy();
    const size = screen.getByText('M', { selector: 'div' });
    expect(warnings.compareDocumentPosition(size) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lists tips for a better photo', () => {
    const tips = [
      { id: 'dim_light', message: 'Find brighter light.' },
      { id: 'glare', message: 'Avoid glare behind you.' },
    ];
    render(<SizeResult result={{ ...RESULT, photoTips: tips }} />);

    const section = within(screen.getByRole('region', { name: 'Tips for a better photo' }));
    expect(section.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Find brighter light.', 'Avoid glare behind you.']);
  });

  it('shows neither warnings nor photo tips when both are empty', () => {
    render(<SizeResult result={{ ...RESULT, warnings: [], photoTips: [] }} />);
    expect(screen.queryByRole('list', { name: 'Warnings' })).toBeNull();
    expect(screen.queryByText('Tips for a better photo')).toBeNull();
  });

  it('says how many camera frames were combined', () => {
    render(<SizeResult result={{ ...RESULT, framesUsed: 5 }} />);
    expect(screen.getByText('Measured from 5 camera frames')).toBeTruthy();
  });

  it('says nothing about frames for a single photo', () => {
    const { rerender } = render(<SizeResult result={{ ...RESULT, framesUsed: 1 }} />);
    expect(screen.queryByText(/camera frames/)).toBeNull();

    rerender(<SizeResult result={RESULT} />);
    expect(screen.queryByText(/camera frames/)).toBeNull();
  });

  it('still renders a legacy result without measurements', () => {
    render(<SizeResult result={{ size: 'S', confidence: 0.4, notes: 'Proportions only.' }} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Proportions only.')).toBeTruthy();
  });
});
