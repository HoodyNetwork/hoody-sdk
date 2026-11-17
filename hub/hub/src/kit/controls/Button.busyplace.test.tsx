// Where a busy Button's dots sit, one rule for every kind: never before the label. A button with an end mark (the end
// glyph or an end icon) shows the dots in that mark's place; a button with only a start icon drops the icon and shows
// the dots at the end, in a box of the icon's width, so the width stays; a button with no mark at all shows the dots
// over its middle, the label kept in place (its width and the button's name) under them. The widths as drawn are
// busy.spec.ts.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';

/** The button's children in order, the label as `label` and a busy mark as `dots` (where it sits named after it). */
const order = (btn: HTMLElement) =>
  [...btn.children].map((c) => {
    if (c.hasAttribute('data-btn-label')) return 'label';
    if (c.querySelector('[data-spinner-slot]') || c.hasAttribute('data-spinner-slot')) return `dots:${c.getAttribute('data-spinner-slot') || c.querySelector('[data-spinner-slot]')!.getAttribute('data-spinner-slot')}`;
    if (c.hasAttribute('data-glyph-mark')) return 'glyph';
    return c.tagName.toLowerCase();
  });

describe('a busy Button: the dots never sit before the label', () => {
  it.each([
    ['primary (end glyph)', () => <Button variant="primary" busy>Primary</Button>, ['label', 'dots:glyph']],
    ['secondary (end glyph)', () => <Button variant="secondary" busy>Secondary</Button>, ['label', 'dots:glyph']],
    ['ghost (no mark)', () => <Button variant="ghost" busy>Ghost</Button>, ['label', 'dots:over']],
    ['danger (no mark)', () => <Button variant="secondary" tone="danger" busy>Danger</Button>, ['label', 'dots:over']],
    ['primary danger (no mark)', () => <Button variant="primary" tone="danger" busy>Primary danger</Button>, ['label', 'dots:over']],
    ['row (no mark)', () => <Button variant="row" busy>Row</Button>, ['label', 'dots:over']],
    ['no glyph asked (no mark)', () => <Button size="sm" busy chip={false}>Wait</Button>, ['label', 'dots:over']],
    ['an end icon', () => <Button variant="ghost" iconEnd="external" busy>Open site</Button>, ['label', 'dots:end']],
    ['a start icon only', () => <Button variant="ghost" icon="download" busy>Download</Button>, ['label', 'dots:end']],
  ])('%s', (_what, el, want) => {
    render(el());
    const btn = screen.getByRole('button');
    expect(order(btn)).toEqual(want);
    // One busy mark, and the label is still the button's name.
    expect(btn.querySelectorAll('[data-spinner-slot]')).toHaveLength(1);
    expect(btn.querySelector('[data-btn-label]')?.textContent).toBeTruthy();
  });

  it('a start icon gives its place up while busy and comes back after', () => {
    const { rerender } = render(<Button variant="ghost" icon="download">Download</Button>);
    const btn = screen.getByRole('button');
    expect(btn.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    rerender(<Button variant="ghost" icon="download" busy>Download</Button>);
    expect(btn.firstElementChild?.hasAttribute('data-btn-label')).toBe(true);
    rerender(<Button variant="ghost" icon="download">Download</Button>);
    expect(btn.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(btn.querySelector('[data-spinner-slot]')).toBeNull();
  });
});
