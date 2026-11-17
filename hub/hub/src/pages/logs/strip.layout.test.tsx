// The problem strip is its question on a line of its own with the chips as one start-aligned group under it, light and
// dark, and every chip is one square 30 px chip in both themes (no pill, no theme branch). The look is
// read from the module's own rules (vitest CSS modules are non-scoped, so class names are the module's own).
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@app/testing';
import { ProblemStrip } from './parts/Bands';
import type * as R from './rules';
import strings from './strings.en.json';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => {
  const n = o?.count;
  const raw = table[k] ?? (n === undefined ? undefined : table[`${k}_${n === 1 ? 'one' : 'other'}`]) ?? k;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''));
}) as never;

const css = fs.readFileSync(path.join(__dirname, 'parts/Logs.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every rule as [selectors, declarations], at-rule bodies included (their inner rules are matched too). */
function rules(): [string[], Map<string, string>][] {
  const out: [string[], Map<string, string>][] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1]!.trim();
    if (sel.startsWith('@')) continue;
    const decls = new Map<string, string>();
    for (const d of m[2]!.split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim().replace(/\s+/g, ' '));
    }
    out.push([sel.split(',').map((x) => x.trim().replace(/\s+/g, ' ')), decls]);
  }
  return out;
}
/** A value that clears a native control's own look (the chip's button reset), never a chip shape or colour. */
const RESET = /^(?:none|0|transparent)$/;
const rule = (sel: string) => rules().find(([sels]) => sels.includes(sel))?.[1] ?? new Map<string, string>();

const group = (key: string, program: string, cls: string, count: number): R.ProblemGroup =>
  ({ key, program, method: 'GET', path: '/x', cls, count, newest: {} as R.ProblemGroup['newest'] });
const groups = (n: number, exact = true): R.Groups => ({
  groups: Array.from({ length: n }, (_, i) => group(`k${i}`, i === 0 ? '' : `prog${i}`, i % 2 ? '5xx' : '4xx', i + 1)),
  read: 10, total: exact ? 10 : 400, exact,
});
const strip = (g: R.Groups, closed = false) =>
  render(<ProblemStrip t={t} groups={g} closed={closed} onToggle={() => {}} onGroup={() => {}} onAround={() => {}} onExplain={() => {}} />).container
    .firstElementChild as HTMLElement;

describe('problem strip layout', () => {
  afterEach(cleanup);

  it('is a column: the heading line (a 40 px row) over the chips, with no padding of its own', () => {
    const r = rule('.strip');
    expect(r.get('display')).toBe('flex');
    expect(r.get('flex-direction')).toBe('column');
    expect(r.get('padding-block')).toBe('0');
    const h = rule('.stripHead');
    expect(h.get('min-block-size')).toBe('40px');
    expect(h.get('align-items')).toBe('center');
  });

  it('puts the question on its own line and every chip in one group under it that wraps from the start', () => {
    const el = strip(groups(3));
    const kids = [...el.children];
    expect(kids.map((k) => [...k.classList])).toEqual([['stripHead'], ['chips']]);
    const head = [...kids[0]!.children];
    expect(head).toHaveLength(1);
    expect(head[0]!.tagName).toBe('BUTTON');
    expect(head[0]!.getAttribute('aria-expanded')).toBe('true');
    expect([...kids[1]!.children].map((k) => k.className)).toEqual(['chipGroup', 'chipGroup', 'chipGroup']);
    const r = rule('.chips');
    expect(r.get('display')).toBe('flex');
    expect(r.get('flex-wrap')).toBe('wrap');
    expect(r.get('justify-content')).toBe('flex-start');
    expect(r.has('flex'), 'the chips are a row of their own, not a column beside the question').toBe(false);
    expect(r.get('gap')).toBe('var(--sp-2)');
  });

  it('ends the heading line with the sampled-read note when the read is a sample; the chip group holds only chips', () => {
    const el = strip(groups(2, false));
    expect([...el.children[0]!.children].map((k) => (k.tagName === 'BUTTON' ? 'BUTTON' : k.className))).toEqual(['BUTTON', 'one']);
    expect([...el.children[1]!.children].map((k) => k.className)).toEqual(['chipGroup', 'chipGroup']);
  });

  it('shows only the question while closed', () => {
    const el = strip(groups(3), true);
    expect(el.children).toHaveLength(1);
    expect([...el.children[0]!.classList]).toEqual(['stripHead']);
    expect(el.children[0]!.children).toHaveLength(1);
    expect(el.querySelector('.chips')).toBeNull();
  });

  it('gives the Live switch group a 10 px gap', () => {
    expect(rule('.barActs').get('column-gap')).toBe('calc(var(--sp-2) + var(--sp-half))');
    expect(rule('.barActs').has('gap')).toBe(false);
  });
});

describe('one square chip in both themes', () => {
  afterEach(cleanup);

  it('is square, 30 px, on the input fill with the panel line', () => {
    const r = rule('.chipGroup');
    expect(r.get('border-radius')).toBe('var(--r-0)');
    expect(r.get('min-block-size')).toBe('max(30px, var(--xs-press-h))');
    expect(r.get('padding-block')).toBe('0');
    expect(r.get('padding-inline')).toBe('var(--sp-3) calc(var(--sp-1) + var(--sp-half))');
    expect(r.get('background')).toBe('var(--hx-input-bg)');
    expect(r.get('border')).toBe('1px solid var(--hx-panel-line)');
  });

  it('keeps its label at least the More press reach away, so a press never covers the label', () => {
    const r = rule('.chipGroup');
    expect(r.get('column-gap')).toBe('max(var(--sp-2), var(--xs-press-out))');
    expect(r.has('gap')).toBe(false);
  });

  it('is never shorter than the xs More press (the kit token: the 24 px box plus its coarse reach each way), so stacked rows never share a press', () => {
    const tokens = fs.readFileSync(path.join(__dirname, '../../kit/tokens.css'), 'utf8');
    expect(tokens).toMatch(/--xs-press-h: calc\(var\(--ctl-h-xs\) \+ 2 \* var\(--xs-press-out\)\);/);
    expect(css).not.toMatch(/pointer:\s*coarse/);
    expect([...css.matchAll(/\.chipGroup\s*\{/g)]).toHaveLength(1);
  });

  it('has no other rule that reshapes or recolours a chip (no theme branch)', () => {
    const others = rules().filter(([sels]) => sels.some((x) => /\.chip(Group|Main)\b/.test(x) && x !== '.chipGroup'));
    for (const [sels, d] of others)
      for (const p of ['border-radius', 'background', 'background-color', 'border', 'border-color', 'block-size', 'height', 'min-block-size'])
        expect(d.has(p) && !RESET.test(d.get(p)!), `${sels.join(', ')} sets ${p}: ${d.get(p)}`).toBe(false);
    expect(css).not.toMatch(/data-hx-theme[^{]*\.chip/);
  });

  it('draws every chip, one problem or many, from the same class, with a 24 px More button that fits the 30 px chip', () => {
    for (const n of [1, 5]) {
      const el = strip(groups(n));
      const chips = [...el.children[1]!.children];
      expect(chips).toHaveLength(n);
      for (const c of chips) {
        expect([...c.classList]).toEqual(['chipGroup']);
        const more = c.querySelector('button[aria-haspopup]');
        expect(more?.classList.contains('xs'), 'the More trigger is the xs icon button').toBe(true);
      }
      cleanup();
    }
  });
});
