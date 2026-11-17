// The start page's "ways to start" strip, as its stylesheet draws it: four cells in one frame that keep their least
// height at every width, lines between cells that are the cells' own borders (so nothing light sits behind the cells in
// dark, and forced colours keep every boundary), and breakpoints read from the content frame, never the viewport.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type AtRule, type Declaration, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const root = postcss.parse(readFileSync(join(import.meta.dirname, 'NewChat.module.css'), 'utf8'));
const tokens = readFileSync(join(import.meta.dirname, '..', '..', '..', 'kit', 'tokens.css'), 'utf8');

interface Found { at: string; selector: string; prop: string; value: string }
const decls: Found[] = [];
root.walkDecls((d: Declaration) => {
  const rule = d.parent as Rule;
  const at = rule.parent?.type === 'atrule' ? `@${(rule.parent as AtRule).name} ${(rule.parent as AtRule).params}` : '';
  for (const selector of rule.selectors ?? []) decls.push({ at, selector, prop: d.prop, value: d.value });
});
const of = (selector: string, at = '') => decls.filter((d) => d.selector === selector && d.at === at);
const value = (selector: string, prop: string, at = '') => of(selector, at).find((d) => d.prop === prop)?.value;
const atRules: AtRule[] = [];
root.walkAtRules((a) => void atRules.push(a));

describe('the ways-to-start strip', () => {
  it('four cells in one panel-line frame, each at least 132 px tall', () => {
    expect(value('.suggestions', 'grid-template-columns')).toMatch(/^repeat\(4,/);
    expect(value('.suggestions', 'grid-auto-rows')).toBe('minmax(132px, auto)');
    expect(value('.suggestions', 'border')).toBe('var(--bw) solid var(--hx-panel-line)');
  });

  it('keeps the 132 px least height at every width: no narrower layout sets the rows again', () => {
    expect(decls.filter((d) => d.prop === 'grid-auto-rows' || d.prop === 'grid-template-rows' || d.prop === 'min-height' || d.prop === 'min-block-size').map((d) => `${d.at} ${d.selector}`.trim())).toEqual(['.suggestions']);
  });

  it('two columns under 760 px of content and one under the phone breakpoint, both from the content frame', () => {
    const phone = Number(/--bp-phone\s*:\s*(\d+)px/.exec(tokens)?.[1]);
    expect(phone).toBeGreaterThan(0);
    expect(value('.suggestions', 'grid-template-columns', '@container content (width < 760px)')).toMatch(/^repeat\(2,/);
    expect(value('.suggestions', 'grid-template-columns', `@container content (width < ${phone}px)`)).toBe('minmax(0, 1fr)');
    // The wider rule comes first, so the phone rule wins where both hold.
    const order = atRules.filter((a) => a.name === 'container').map((a) => a.params);
    expect(order.indexOf('content (width < 760px)')).toBeLessThan(order.indexOf(`content (width < ${phone}px)`));
  });

  it('no viewport width query: the page sizes from its frame', () => {
    expect(atRules.filter((a) => a.name === 'media' && /width|inline-size/.test(a.params)).map((a) => a.params)).toEqual([]);
  });

  it('the lines between cells are the cells\' borders; the strip paints no fill of its own behind them', () => {
    expect(of('.suggestions').filter((d) => /^background/.test(d.prop))).toEqual([]);
    expect(value('.suggestions > li', 'border')).toBe('0 solid var(--hx-start-cell-line)');
    expect(value('.suggestions > li', 'background')).toBe('var(--hx-card)');
    expect(decls.filter((d) => d.prop === 'gap' && d.selector === '.suggestions')).toEqual([]);
  });

  it('four across: a line before every cell but a row\'s first, and above every row but the first', () => {
    expect(value('.suggestions > li:not(:nth-child(4n + 1))', 'border-inline-start-width')).toBe('var(--bw)');
    expect(value('.suggestions > li:nth-child(n + 5)', 'border-block-start-width')).toBe('var(--bw)');
  });

  it('two across: the line before a row\'s first cell goes, and the second row gets its line above', () => {
    const at = '@container content (width < 760px)';
    expect(value('.suggestions > li:nth-child(odd)', 'border-inline-start-width', at)).toBe('0');
    expect(value('.suggestions > li:nth-child(n + 3)', 'border-block-start-width', at)).toBe('var(--bw)');
  });

  it('one column: no line beside a cell, one above every cell but the first', () => {
    const at = `@container content (width < ${Number(/--bp-phone\s*:\s*(\d+)px/.exec(tokens)?.[1])}px)`;
    expect(value('.suggestions > li:nth-child(n)', 'border-inline-start-width', at)).toBe('0');
    expect(value('.suggestions > li:nth-child(n + 2)', 'border-block-start-width', at)).toBe('var(--bw)');
  });

  it('forced colours: the frame and every cell line take the system text colour', () => {
    const at = '@media (forced-colors: active)';
    expect(value('.suggestions', 'border-color', at)).toBe('CanvasText');
    expect(value('.suggestions > li', 'border-color', at)).toBe('CanvasText');
  });

  it('a cell is a column with no frame of its own; its focus ring is drawn inside the cell, where no neighbour covers it', () => {
    expect(value('.sug', 'flex-direction')).toBe('column');
    expect(value('.sug', 'border')).toBe('0');
    expect(value('.sug:focus-visible', 'box-shadow')).toBe('var(--focus-ring-inset)');
  });

  it('closes the composer plate: no gap between the composer and the strip, whose frame is the plate\'s fourth side', () => {
    expect(of('.start').filter((d) => /gap|margin|padding/.test(d.prop))).toEqual([]);
    expect(value('.start', 'flex-direction')).toBe('column');
    // Nothing in this sheet draws the box above the strip: the kit composer's plate is that box.
    expect(of('.composer > *').map((d) => `${d.prop}: ${d.value}`)).toEqual(['padding: 0']);
  });
});
