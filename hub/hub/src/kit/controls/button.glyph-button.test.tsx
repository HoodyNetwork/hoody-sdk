// Every primary and secondary button (md and sm) carries the end glyph inside its plate, after the label: a plus for a
// label starting with "New", else the arrow (an end icon keeps its pixel twin); the start icon gives way to it.
// Secondary is the grey plate; the label is 13 px mono uppercase with 0.3 px tracking. Computed colours and sizes are in
// d3button.spec.ts (Playwright); here the markup and the declarations.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, LinkButton } from './Button';

const read = (f: string) => readFileSync(join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const css = read('Button.module.css');
const tokens = read('../tokens.css');
/** The first rule whose selector list starts a line as `sel`, from its selector to its closing brace. */
function block(src: string, sel: string): string {
  const i = src.indexOf(`\n${sel} {`);
  expect(i, sel).toBeGreaterThanOrEqual(0);
  return src.slice(i, src.indexOf('}', i));
}
/** The :root block of the light theme, and of the dark one. */
const light = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf(':root[data-hx-theme="dark"] {'));
const dark = block(tokens, ':root[data-hx-theme="dark"]');
const glyph = (el: HTMLElement) => el.querySelector(':scope > [data-glyph-mark] path')?.getAttribute('d');
const PLUS = 'M4 0H6V4H10V6H6V10H4V6H0V4H4V0Z';

describe('the glyph button', () => {
  it('a small secondary and a small primary carry the glyph; the label is still the name', () => {
    render(
      <>
        <Button size="sm">Open</Button>
        <Button size="sm" variant="primary">Add funds</Button>
      </>,
    );
    for (const name of ['Open', 'Add funds']) {
      const b = screen.getByRole('button', { name });
      expect(b).toHaveAttribute('data-glyph', '');
      expect(b.querySelector(':scope > [data-glyph-mark]')).toHaveAttribute('aria-hidden', 'true');
      // The glyph comes after the label, inside the same plate.
      expect(b.lastElementChild).toBe(b.querySelector('[data-glyph-mark]'));
      expect(b.firstElementChild).toBe(b.querySelector('[data-btn-label]'));
    }
  });

  it('a label starting with "New" gets the plus, every other the arrow; the start icon is gone', () => {
    render(
      <>
        <Button variant="primary" icon="plus">New note</Button>
        <Button size="sm" icon="upload">New folder</Button>
        <Button variant="primary" icon="plus">Get a computer</Button>
        <Button>Newsletter</Button>
        <LinkButton href="#/bots" icon="plus">New Bot</LinkButton>
      </>,
    );
    const note = screen.getByRole('button', { name: 'New note' });
    expect(glyph(note)).toBe(PLUS);
    expect(glyph(screen.getByRole('button', { name: 'New folder' }))).toBe(PLUS);
    expect(glyph(screen.getByRole('link', { name: 'New Bot' }))).toBe(PLUS);
    const get = screen.getByRole('button', { name: 'Get a computer' });
    expect(glyph(get)).not.toBe(PLUS);
    expect(glyph(get)).toBe(glyph(screen.getByRole('button', { name: 'Newsletter' })));
    // The glyph is the one mark: no start icon before the label or inside it.
    for (const b of [note, get, screen.getByRole('link', { name: 'New Bot' })]) {
      expect(b.querySelector('[data-btn-label] svg')).toBeNull();
      expect(b.querySelectorAll('svg')).toHaveLength(1);
      expect(b.firstElementChild).toBe(b.querySelector('[data-btn-label]'));
    }
  });

  it('a page-chosen glyph and an end icon twin still win over the arrow', () => {
    render(
      <>
        <Button chipIcon="plus">Add</Button>
        <LinkButton href="https://example.invalid/" iconEnd="external">Docs</LinkButton>
        <LinkButton href="https://example.invalid/new" iconEnd="external">New tab</LinkButton>
        <Button chipIcon="down">New export</Button>
      </>,
    );
    expect(glyph(screen.getByRole('button', { name: 'New export' })), 'a glyph set by the page comes before the plus').not.toBe(PLUS);
    expect(glyph(screen.getByRole('button', { name: 'Add' }))).toBe(PLUS);
    expect(glyph(screen.getByRole('link', { name: 'New tab' })), 'the plus comes before an end icon twin').toBe(PLUS);
    expect(glyph(screen.getByRole('link', { name: 'Docs' }))).not.toBe(glyph(screen.getByRole('button', { name: 'Add' })));
  });

  it('secondary is the grey plate: #e3e3e3 inside a #7a7a7a line, #1c1c1c text; hover #d6d6d6 inside the ink line', () => {
    // It restates only its ink: the plate, its line and its states are the family's base rules.
    const b = block(css, '.secondary,\n.row');
    expect(b).toMatch(/color:\s*var\(--hx-btn-text\);/);
    expect(b).not.toMatch(/--plate|background|border/);
    expect(css).not.toMatch(/\.secondary\[data-(hovered|pressed)\]/);
    const base = block(css, '.button');
    expect(base).toMatch(/--plate:\s*var\(--hx-btn-plate\);/);
    expect(base).toMatch(/--plate-line:\s*var\(--hx-btn-line\);/);
    const hover = block(css, '.button[data-hovered]');
    expect(hover).toMatch(/--plate:\s*var\(--hx-btn-plate-hover\);/);
    expect(hover).toMatch(/--plate-line:\s*var\(--hx-btn-line-hover\);/);
    for (const [name, value] of [['plate', '#e3e3e3'], ['plate-hover', '#d6d6d6'], ['plate-press', '#cacaca'], ['line', '#7a7a7a'], ['line-hover', '#101010'], ['text', '#1c1c1c']] as const)
      expect(light, name).toMatch(new RegExp(`--hx-btn-${name}:\\s*${value};`));
    for (const [name, value] of [['plate', '#222225'], ['plate-hover', '#2d2d31'], ['plate-press', '#38383d'], ['line', '#6d6d70'], ['line-hover', '#ededed'], ['text', '#ececec']] as const)
      expect(dark, name).toMatch(new RegExp(`--hx-btn-${name}:\\s*${value};`));
  });

  it('every md and sm button pads 14 px each side; the glyph sits 10 px after the label in a 12 px box', () => {
    expect(tokens).toMatch(/--btn-pad:\s*calc\(var\(--sp-3\) \+ var\(--sp-half\)\);/);
    expect(block(css, '.button')).toMatch(/padding-inline:\s*var\(--btn-pad\);/);
    // sm keeps the family's padding: only its height and cut differ. There is no smaller padding token.
    expect(block(css, '.sm')).not.toMatch(/padding/);
    expect(tokens).not.toMatch(/--btn-pad-sm\b/);
    expect(tokens).toMatch(/--btn-glyph-gap:\s*10px;/);
    expect(tokens).toMatch(/--btn-glyph:\s*12px;/);
    expect(tokens).toMatch(/--btn-gap:\s*var\(--sp-2\);/);
    expect(block(css, '.glyph')).toMatch(/margin-inline-start:\s*calc\(var\(--btn-glyph-gap\) - var\(--btn-gap\)\);/);
    expect(block(css, '.glyph')).toMatch(/inline-size:\s*var\(--btn-glyph\);/);
  });

  it('the label: 13 px mono capitals with 0.3 px tracking on every button', () => {
    expect(tokens).toMatch(/--btn-tracking:\s*0\.3px;/);
    const base = block(css, '.button');
    expect(base).toMatch(/letter-spacing:\s*var\(--btn-tracking\);/);
    expect(base).toMatch(/font-family:\s*var\(--font-mono\);/);
    expect(base).toMatch(/font-size:\s*var\(--fs-md\);/);
    expect(base).toMatch(/text-transform:\s*var\(--case-caps\);/);
    expect(tokens).toMatch(/--fs-md:\s*13px;/);
  });
});
