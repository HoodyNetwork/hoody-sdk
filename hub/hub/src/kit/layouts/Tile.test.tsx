// Tile (keycap tiles): the kit owns the tile's look, a faint 1 px solid edge (the tile's own text
// colour at 14%) and the --hx-tile-fill fill; `plain` keeps the edge's room and draws neither. The page keeps only its layout of what is inside.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { Tile } from '@kit';
import s from './Layouts.module.css';

const cls = (name: string): string => {
  const v = s[name];
  if (!v) throw new Error(`Layouts.module.css has no .${name}`);
  return v;
};
const read = (rel: string) => postcss.parse(readFileSync(join(import.meta.dirname, rel), 'utf8'));
const decls = (css: postcss.Root, selector: string): Record<string, string> => {
  const out: Record<string, string> = {};
  css.walkRules((r) => {
    if (r.parent === css && r.selector.split(',').map((x) => x.trim()).includes(selector)) r.walkDecls((d) => void (out[d.prop] = d.value));
  });
  return out;
};

describe('Tile', () => {
  it('is a div around its content: the edge, the fill and the stacked layout by default', () => {
    const { container } = render(<Tile><span>keys</span></Tile>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el).toHaveTextContent('keys');
    expect(el).toHaveClass(cls('tile'), cls('tileFill'), cls('tileStack'));
    expect(el).not.toHaveClass(cls('tileCenter'));
  });

  it('plain drops the edge line and the fill; layout center centres one row', () => {
    const { container } = render(<Tile plain layout="center">all</Tile>);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass(cls('tile'), cls('tileCenter'));
    expect(el).not.toHaveClass(cls('tileFill'));
    expect(el).not.toHaveClass(cls('tileStack'));
  });

  it('draws its look from the tokens: a faint 1 px solid edge in its own text colour, never dashed, the --hx-tile-fill fill, a --tile-pad-y padding', () => {
    const css = read('Layouts.module.css');
    expect(decls(css, '.tile')).toEqual({
      display: 'flex',
      padding: 'var(--tile-pad-y, var(--sp-3)) calc(var(--sp-3) + var(--sp-half))',
      border: 'var(--bw) solid transparent',
    });
    expect(decls(css, '.tileFill')).toEqual({ 'border-color': 'color-mix(in srgb, currentcolor 14%, transparent)', background: 'var(--hx-tile-fill)' });
    // A level card's body ends with no line of its own.
    expect(Object.keys(decls(css, '.levelRows')).filter((p) => p.startsWith('border'))).toEqual([]);
    expect(css.toString()).not.toMatch(/dashed\s+var\(--hx-dash-line\)/);
  });

  it("Home's keycap tiles take their look from the kit: the page CSS draws no edge and no fill of its own", () => {
    const home = readFileSync(join(import.meta.dirname, '../../pages/home/parts/home.module.css'), 'utf8');
    expect(home).not.toMatch(/dashed|--hx-dash-line|--hx-tile-fill/);
  });
});
