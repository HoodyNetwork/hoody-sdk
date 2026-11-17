// Vitest: the column plan's numbers for a row's controls equal what the kit Button draws. The plan cannot measure a
// button before the first paint, so rowControlMetrics.ts mirrors the tokens; this reads kit/tokens.css and
// Button.module.css and fails when either side moves alone.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CELL_PAD, HOVER_W, MENU_W, ROW_BUTTON, ROW_CONTROL_GAP, inlineWidth } from './rowControlMetrics';

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = strip(readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8'));
const button = strip(readFileSync(path.join(__dirname, '..', 'controls', 'Button.module.css'), 'utf8'));
const root = tokens.slice(tokens.indexOf(':root {'), tokens.indexOf('[data-hx-theme="dark"]'));
/** A root token's value as written. */
const raw = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(root)?.[1]?.trim() ?? '';
/** A root token in px: a px literal, another token, or a calc() that only adds tokens. */
function px(name: string): number {
  const v = raw(name);
  if (/^-?[\d.]+px$/.test(v)) return parseFloat(v);
  const one = /^var\((--[\w-]+)\)$/.exec(v);
  if (one) return px(one[1]!);
  const sum = /^calc\((.+)\)$/.exec(v);
  if (sum) return sum[1]!.split('+').reduce((n, part) => n + px(/var\((--[\w-]+)\)/.exec(part)![1]!), 0);
  throw new Error(`${name}: ${v}`);
}
const rule = (sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.[\]()]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(button)?.[1] ?? '';

describe('row control metrics follow the kit Button', () => {
  it('the label type and the plate padding are the tokens the button reads', () => {
    expect(ROW_BUTTON.size).toBe(px('--fs-md'));
    expect(ROW_BUTTON.tracking).toBe(px('--btn-tracking'));
    expect(ROW_BUTTON.pad).toBe(px('--btn-pad'));
    expect(ROW_BUTTON.padIcon).toBe(px('--btn-pad-icon'));
    expect(ROW_BUTTON.gap).toBe(px('--btn-gap'));
    expect(ROW_BUTTON.icon).toBe(px('--icon-md'));
    expect(ROW_BUTTON.frame).toBe(px('--bw'));
    expect(ROW_CONTROL_GAP).toBe(px('--sp-2'));
    const base = rule('.button');
    expect(base).toMatch(/padding-inline:\s*var\(--btn-pad\)/);
    expect(base).toMatch(/gap:\s*var\(--btn-gap\)/);
    expect(base).toMatch(/font-size:\s*var\(--fs-md\)/);
    expect(base).toMatch(/letter-spacing:\s*var\(--btn-tracking\)/);
    expect(base).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(base).toMatch(/border:\s*var\(--bw\) solid/);
    expect(rule('.button.iconStart')).toMatch(/padding-inline-end:\s*var\(--btn-pad-icon\)/);
    // sm keeps the base padding: a rule that changes it must change inlineWidth.
    expect(rule('.sm')).not.toMatch(/padding|font-size|gap/);
  });

  it('the three-dot and the hover icons fit the widths the plan reserves', () => {
    const sm = px('--btn-h-sm');
    expect(rule('.sm')).toMatch(/--plate-h:\s*var\(--btn-h-sm\)/);
    expect(rule('.iconOnly')).toMatch(/inline-size:\s*max\(var\(--plate-h\), var\(--icon-hit\)\)/);
    const fineIcon = Math.max(sm, px('--icon-hit'));
    expect(HOVER_W).toBeGreaterThanOrEqual(fineIcon + px('--sp-half'));
    expect(MENU_W).toBeGreaterThanOrEqual(fineIcon + px('--sp-2'));
    // A coarse pointer's three-dot is --icon-hit there (44).
    expect(tokens).toMatch(/--icon-hit:\s*44px/);
    expect(MENU_W).toBeGreaterThanOrEqual(44);
    expect(CELL_PAD).toBeGreaterThanOrEqual(px('--sp-2'));
  });

  it('an inline word button is reserved at least its drawn width', () => {
    // "Start" with a start icon: 5 characters of 13 px Geist Mono (0.6 em) with 0.3 px tracking, the plate around them.
    const drawn = 5 * (7.8 + 0.3) + 14 + 16 + 8 + 16 + 2;
    expect(inlineWidth('Start', true)).toBe(Math.ceil(drawn) + 8);
    expect(inlineWidth('Start', false)).toBe(Math.ceil(5 * 8.1 + 28 + 2) + 8);
    expect(inlineWidth('Resume', false) - inlineWidth('Start', false)).toBeGreaterThanOrEqual(8);
  });
});
