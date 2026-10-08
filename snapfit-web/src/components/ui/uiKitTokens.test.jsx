import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Badge from './Badge';
import Button from './Button';
import Card from './Card';
import Input from './Input';

const RAW_PALETTE = /\b(?:bg|text|border|ring)-(?:gray|indigo|blue|white|black|red|green|yellow|amber)\b/;
const classesOf = (element) => element.className.split(/\s+/);

describe('UI kit uses theme tokens', () => {
  it('Button primary is blue with white text and the hover blue', () => {
    render(<Button>Save</Button>);
    const classes = classesOf(screen.getByRole('button', { name: 'Save' }));
    expect(classes).toEqual(expect.arrayContaining(['bg-primary', 'text-primary-foreground', 'hover:bg-primary-hover']));
    expect(classes).toEqual(expect.arrayContaining(['focus-visible:ring-2', 'focus-visible:ring-primary/40']));
  });

  it('Button secondary and ghost use surface and primary tokens', () => {
    render(
      <>
        <Button variant="secondary">Cancel</Button>
        <Button variant="ghost">More</Button>
      </>
    );
    expect(classesOf(screen.getByRole('button', { name: 'Cancel' }))).toEqual(
      expect.arrayContaining(['bg-surface', 'border-border', 'text-foreground'])
    );
    expect(classesOf(screen.getByRole('button', { name: 'More' }))).toEqual(expect.arrayContaining(['text-primary']));
  });

  it('Card sits on the surface token with a border', () => {
    render(<Card data-testid="card">content</Card>);
    expect(classesOf(screen.getByTestId('card'))).toEqual(expect.arrayContaining(['bg-surface', 'border-border']));
  });

  it('Input uses background, border, muted placeholder and the primary focus ring', () => {
    render(<Input name="email" label="Email" />);
    const classes = classesOf(screen.getByLabelText('Email'));
    expect(classes).toEqual(
      expect.arrayContaining(['bg-background', 'border-border', 'placeholder:text-muted', 'focus:ring-primary/40'])
    );
  });

  it('Badge info uses primary soft', () => {
    render(<Badge variant="info">Pro</Badge>);
    expect(classesOf(screen.getByText('Pro'))).toEqual(expect.arrayContaining(['bg-primary-soft', 'text-primary']));
  });

  it('none of them use raw palette classes', () => {
    render(
      <>
        <Button>One</Button>
        <Button variant="danger">Two</Button>
        <Card data-testid="card">x</Card>
        <Input name="a" label="A" />
        <Badge>Neutral</Badge>
      </>
    );
    for (const element of [
      ...screen.getAllByRole('button'),
      screen.getByTestId('card'),
      screen.getByLabelText('A'),
      screen.getByText('Neutral'),
    ]) {
      expect(element.className).not.toMatch(RAW_PALETTE);
    }
  });
});
