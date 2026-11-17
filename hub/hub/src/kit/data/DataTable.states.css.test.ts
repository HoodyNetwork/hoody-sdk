// Vitest: state looks the table's stylesheets must carry, read from the CSS text. A menu item that is disabled looks
// unavailable; the small row controls reach the coarse-pointer floor without moving the layout; selection survives
// forced colours; Track's focus mark is the kit's focus colour. Dead column classes stay gone.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(path.join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const table = read('DataTable.module.css');
const track = read('Track.module.css');

/** Every `selector { body }` pair of a stylesheet, flat: a rule inside an at-rule is listed with its own selector. */
const rules = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim().replace(/\s+/g, ' '), body: m[2]! }));
/** The text of the first `@media (query) { … }` block whose prelude holds `query`, braces balanced. */
function media(css: string, query: string, has?: string): string {
  let from = 0;
  for (;;) {
    const at = css.indexOf(`@media ${query}`, from);
    if (at < 0) return '';
    const open = css.indexOf('{', at);
    let depth = 1;
    let i = open + 1;
    for (; i < css.length && depth > 0; i += 1) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
    const block = css.slice(open + 1, i - 1);
    if (!has || block.includes(has)) return block;
    from = i;
  }
}

describe('DataTable state looks', () => {
  it('a disabled menu item reads unavailable, and a focused one keeps that look', () => {
    const all = rules(table);
    const off = all.findIndex((r) => r.sel.split(',').some((s) => s.trim() === '.menuItem[data-disabled]') && /color:\s*var\(--pop-off\)/.test(r.body));
    const focused = all.findIndex((r) => r.sel === '.menuItem[data-focused]');
    expect(off, 'a .menuItem[data-disabled] rule in --pop-off').toBeGreaterThan(-1);
    expect(off, 'written after the focused rule').toBeGreaterThan(focused);
    expect(all.some((r) => /\.menuItem\[data-disabled\] \.menuCheck/.test(r.sel) && /color:\s*var\(--pop-off\)/.test(r.body)), 'its check mark too').toBe(true);
  });

  it('the dead action-column classes are gone', () => {
    expect(table).not.toMatch(/\.colActions(Wide)?\b/);
  });

  it('the expander and a chip’s clear button reach the touch floor on a coarse pointer', () => {
    const all = rules(table);
    // The expander's hit area grows around its drawn box (a pseudo-element), so the first cell's layout does not move.
    const hit = all.find((r) => r.sel === '.expander::before');
    expect(hit?.body).toMatch(/var\(--touch-min\)/);
    expect(all.find((r) => r.sel === '.expander')?.body).toMatch(/position:\s*relative/);
    const coarse = media(table, '(pointer: coarse)', '.chipX');
    expect(rules(coarse).find((r) => r.sel === '.chipX')?.body).toMatch(/min-inline-size:\s*var\(--touch-min\)/);
  });

  it('forced colours keep the selected and the current row told apart from the rest', () => {
    // Fills and shadows are dropped there; an outline in a system colour is kept, inset in the first cell, and neither
    // narrows the column (no inline border: surfaces G5) nor repaints the cell's content.
    const forced = rules(media(table, '(forced-colors: active)', '.selected'));
    const mark = forced.find((r) => r.sel === '.selected > td:first-child, .active > td:first-child');
    expect(mark?.body).toMatch(/outline:[^;]*solid Highlight/);
    expect(mark?.body).toMatch(/outline-offset:\s*calc\(var\(--bw-2\) \* -2\)/);
    expect(mark?.body).not.toMatch(/border/);
  });

  it('forced colours keep a marked row (rowMark: unread, this session) told apart, under selection and the current row', () => {
    // The mark's wash and bar are a fill and a shadow, both dropped there: an inset outline in the text colour stands in,
    // only on rows that are neither selected nor current, so their Highlight outline still wins.
    const forced = rules(media(table, '(forced-colors: active)', '.selected'));
    const mark = forced.find((r) => r.sel === '.tr[data-mark]:not(.selected, .active) > td:first-child');
    expect(mark?.body).toMatch(/outline:[^;]*solid CanvasText/);
    expect(mark?.body).toMatch(/outline-offset:\s*calc\(var\(--bw-2\) \* -2\)/);
    expect(mark?.body).not.toMatch(/border/);
  });
});

describe('Track focus', () => {
  it('uses the kit focus colour, never ink', () => {
    const forced = media(track, '(forced-colors: active)');
    const focus = rules(track.replace(forced, '')).filter((r) => r.sel.includes(':focus-visible'));
    expect(focus.length).toBeGreaterThan(0);
    for (const r of focus) {
      expect(r.body, r.sel).toMatch(/box-shadow:\s*var\(--focus-ring(-inset)?\)/);
      expect(r.body, r.sel).not.toMatch(/var\(--hx-ink\)/);
    }
    // The ring is a shadow, which forced colours drop: each focusable part has a system-colour outline there.
    for (const r of focus) expect(rules(forced).find((f) => f.sel === r.sel)?.body, r.sel).toMatch(/outline:[^;]*Highlight/);
  });
});
