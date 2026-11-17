// Vitest: the kit's press and hold feedback. jsdom draws no CSS, so the stylesheet's
// rules are read as text; page.drag.test.tsx covers when the Board sets each state.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRESS_HOLD_MS, pressClasses } from './pressFeedback';

const css = readFileSync(join(import.meta.dirname, 'PressFeedback.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string) => {
  const at = css.indexOf(`${sel} {`);
  expect(at, sel).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
};

describe('pressClasses', () => {
  it('press: the card ring and the header fill; hold: the header bar only; none otherwise', () => {
    const press = pressClasses('press');
    expect(press.card).toBeTruthy();
    expect(press.head).toBeTruthy();
    const hold = pressClasses('hold');
    expect(hold.card).toBeUndefined();
    expect(hold.head).toBeTruthy();
    expect(hold.head).not.toBe(press.head);
    expect(hold.headStyle).toEqual({ '--press-hold': `${PRESS_HOLD_MS}ms` });
    expect(press.headStyle).toBeUndefined();
    expect(pressClasses(undefined)).toEqual({});
    expect(pressClasses(null)).toEqual({});
  });
});

describe('PressFeedback.module.css', () => {
  it('the ring: an accent border with an ink line inside, a layer above the card children, never taking the pointer', () => {
    const r = rule('.pressed::before');
    expect(r).toMatch(/inset:\s*0/);
    expect(r).toMatch(/z-index:\s*var\(--z-raised\)/);
    expect(r).toMatch(/border:\s*var\(--bw-2\) solid var\(--hx-acc\)/);
    expect(r).toMatch(/box-shadow:\s*inset 0 0 0 var\(--bw\) var\(--hx-ink\)/);
    expect(r).toMatch(/pointer-events:\s*none/);
  });

  it('the pressed header: selected fill and grabbing cursor, two classes so it wins over the owner header rule', () => {
    const r = rule('.pressed > .pressedHead');
    expect(r).toMatch(/background:\s*var\(--hx-selected\)/);
    expect(r).toMatch(/cursor:\s*grabbing/);
  });

  it("the hold bar: accent with an ink line, filling from the start edge (right in RTL) over the hold time --press-hold, still when motion is reduced", () => {
    const r = rule('.holdHead::after');
    expect(r).toMatch(/background:\s*var\(--hx-acc\)/);
    expect(r).toMatch(/box-shadow:\s*0 calc\(-1 \* var\(--bw\)\) 0 var\(--hx-ink\)/);
    expect(r).toMatch(/transform-origin:\s*left center/);
    expect(r).toMatch(/animation:\s*holdFill var\(--press-hold\) linear forwards/);
    expect(rule('.holdHead:dir(rtl)::after')).toMatch(/transform-origin:\s*right center/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.holdHead::after\s*\{\s*animation:\s*none;/);
  });
});
