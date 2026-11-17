// The AI button's marks, its "needs you" dot and its running count, sit on the button's top end corner, out of the
// plate, so the sparkle and the word stay whole (inside the plate, the dot covered the sparkle's top
// and end points on the 32 px icon button below 1024 and the "I" of "AI" above; the kit's 18 px count covered the
// sparkle). Read from the sources as bellCount.test.ts reads the bell's count.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const css = read('TopBar.module.css');
const tsx = read('TopBar.tsx').replace(/\s+/g, ' ');
/** The body of the first top-level rule for `sel`. */
const rule = (src: string, sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.>*]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? '';
const px = (body: string, prop: string) => {
  const m = new RegExp(`(?:^|[;\\s])${prop}:\\s*(-?\\d+)px;`).exec(body);
  return m ? Number(m[1]) : NaN;
};
const tokens = fs.readFileSync(path.join(__dirname, '../kit/tokens.css'), 'utf8');
const token = (name: string) => Number(new RegExp(`${name}:\\s*(\\d+)px;`).exec(tokens)?.[1] ?? NaN);
const decls = (body: string) => body.split(';').map((d) => d.trim()).filter(Boolean);

describe('the AI button marks', () => {
  const dot = rule(css, '.askDot');
  const count = rule(css, '.count');

  it('the AI slot places its running count with .count and its dot with .askDot', () => {
    expect(tsx).toMatch(/<CountMark n=\{running\} tone="accent" className=\{s\.count\} \/> : waiting && <span className=\{s\.askDot\} aria-hidden="true" \/>/);
  });

  it('the dot sits out of the plate on the top and end sides, never over the icon or the word', () => {
    expect(px(dot, 'inset-block-start')).toBe(-3);
    expect(px(dot, 'inset-inline-end')).toBe(-3);
    expect(dot).toMatch(/position:\s*absolute;/);
    expect(dot).toMatch(/pointer-events:\s*none;/);
  });

  it("the dot's ring is the bar's own ground, so on the bar it draws no halo", () => {
    const ground = /(?:^|[;\s])background:\s*(var\(--[\w-]+\));/.exec(rule(css, '.bar'))?.[1];
    expect(ground).toBe('var(--hx-card)');
    expect(dot).toMatch(new RegExp(`(?:^|[;\\s])border:\\s*var\\(--bw-2\\) solid ${ground!.replace(/[()]/g, '\\$&')};`));
  });

  it('the count stands level with the bell count (5 px above) and takes its small box', () => {
    expect(px(count, 'inset-block-start')).toBe(px(rule(css, '.bellCount'), 'inset-block-start'));
    expect(px(count, 'inset-inline-end')).toBe(-3);
    expect(count).toMatch(/position:\s*absolute;/);
    expect(count).toMatch(/pointer-events:\s*none;/);
    expect(decls(rule(css, '.count > *'))).toEqual(decls(rule(css, '.bellCount > *')));
  });

  it('both stay clear of the next button where the actions stand half a step apart (below 1024)', () => {
    // .end's gap below 1024 is --sp-1; a mark reaches past the plate's end by -inset-inline-end.
    expect(css).toMatch(/@media \(width < 1024px\) \{[\s\S]*?\.end \{\s*gap:\s*var\(--sp-1\);/);
    expect(-px(dot, 'inset-inline-end')).toBeLessThan(token('--sp-1'));
    expect(-px(count, 'inset-inline-end')).toBeLessThan(token('--sp-1'));
  });

  it('both keep to the plate top under a coarse pointer, as the bell count, in a rule after their own', () => {
    const coarse = /@media \(pointer: coarse\) \{\s*\.count,\s*\.askDot \{\s*inset-block-start:\s*0;\s*\}\s*\}/.exec(css);
    expect(coarse).not.toBeNull();
    expect(coarse!.index).toBeGreaterThan(css.indexOf('.askDot {'));
    expect(coarse!.index).toBeGreaterThan(css.indexOf('.count {'));
  });
});
