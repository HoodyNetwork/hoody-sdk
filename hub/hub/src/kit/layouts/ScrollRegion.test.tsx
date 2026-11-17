// ScrollRegion: one named tab stop over the caller's content, scrolling on the axis it is given, framed when asked.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import postcss from 'postcss';
import { describe, expect, it, vi } from 'vitest';
import { ScrollRegion } from './ScrollRegion';
import s from './ScrollRegion.module.css';

/** A class of the module, by name; a missing one fails here instead of passing toHaveClass vacuously. */
const cls = (name: string): string => {
  const v = s[name];
  if (!v) throw new Error(`ScrollRegion.module.css has no .${name}`);
  return v;
};
const css = postcss.parse(readFileSync(join(import.meta.dirname, 'ScrollRegion.module.css'), 'utf8'));
const decls = (selector: string): Record<string, string> => {
  const out: Record<string, string> = {};
  css.walkRules((r) => {
    if (r.parent === css && r.selector === selector) r.walkDecls((d) => void (out[d.prop] = d.value));
  });
  return out;
};

describe('ScrollRegion', () => {
  it('is a named region with one tab stop, around its content', async () => {
    render(
      <>
        <button type="button">Before</button>
        <ScrollRegion label="Plans">
          <p>row one</p>
        </ScrollRegion>
      </>,
    );
    const region = screen.getByRole('region', { name: 'Plans' });
    expect(region).toHaveTextContent('row one');
    await userEvent.tab();
    await userEvent.tab();
    expect(region).toHaveFocus();
  });

  it('scrolls down by default, sideways or both when asked, and keeps the caller\'s class', () => {
    const { rerender } = render(<ScrollRegion label="Doc">x</ScrollRegion>);
    const region = () => screen.getByRole('region', { name: 'Doc' });
    expect(region()).toHaveAttribute('data-axis', 'block');
    expect(region()).toHaveClass(cls('region'), cls('block'));
    rerender(
      <ScrollRegion label="Doc" axis="inline" className="wide">
        x
      </ScrollRegion>,
    );
    expect(region()).toHaveAttribute('data-axis', 'inline');
    expect(region()).toHaveClass(cls('inline'), 'wide');
    expect(region()).not.toHaveClass(cls('block'));
    rerender(
      <ScrollRegion label="Doc" axis="both">
        x
      </ScrollRegion>,
    );
    expect(region()).toHaveClass(cls('both'));
    // Each axis class is the overflow it names.
    expect(decls('.block')).toMatchObject({ 'overflow-x': 'hidden', 'overflow-y': 'auto' });
    expect(decls('.inline')).toMatchObject({ 'overflow-x': 'auto', 'overflow-y': 'hidden' });
    expect(decls('.both')).toMatchObject({ overflow: 'auto' });
  });

  it('is one stop before the controls inside it: Tab goes on into them', async () => {
    render(
      <ScrollRegion label="Plans" axis="inline">
        <button type="button">Choose</button>
      </ScrollRegion>,
    );
    await userEvent.tab();
    expect(screen.getByRole('region', { name: 'Plans' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Choose' })).toHaveFocus();
  });

  it('shows focus with a ring, and with an outline that forced-colors mode keeps', () => {
    const focus = decls('.region:focus-visible');
    expect(focus['box-shadow']).toBe('var(--focus-ring)');
    expect(focus.outline).toMatch(/^var\(--bw-2\) solid transparent$/);
  });

  it('draws the card frame only when asked', () => {
    const { rerender } = render(<ScrollRegion label="Plans">x</ScrollRegion>);
    expect(screen.getByRole('region', { name: 'Plans' })).not.toHaveAttribute('data-framed');
    expect(screen.getByRole('region', { name: 'Plans' })).not.toHaveClass(cls('framed'));
    rerender(
      <ScrollRegion label="Plans" axis="inline" framed>
        x
      </ScrollRegion>,
    );
    expect(screen.getByRole('region', { name: 'Plans' })).toHaveAttribute('data-framed', '');
    expect(screen.getByRole('region', { name: 'Plans' })).toHaveClass(cls('framed'));
    expect(decls('.framed')).toMatchObject({ border: 'var(--bw) solid var(--hx-panel-line)', background: 'var(--hx-card)' });
  });

  it('is positioned, so absolute content inside (visually hidden header text) stays in its clip', () => {
    // Without it a wide table's hidden header text escapes the clip and the whole page scrolls sideways (billing plans).
    expect(decls('.region').position).toBe('relative');
  });

  it('refuses an empty label', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ScrollRegion label=" ">x</ScrollRegion>)).toThrow(/needs a label/);
  });
});
