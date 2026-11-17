// Grid patterns → flex plans, and class-level translation behaviours.
import { describe, expect, test } from 'bun:test';
import { planGrid, splitTracks } from './grid';
import { translateDecls, type Scope, type SrcDecl } from './translate';

describe('planGrid', () => {
  test('one column (the commonest template) → column box, exact', () => {
    const g = planGrid({ columns: 'minmax(0, 1fr)' });
    expect(g).toMatchObject({ ok: true, plan: { pattern: 'column', axis: 'column', tracks: 0, childStyles: [] } });
    expect(planGrid({})).toMatchObject({ ok: true, plan: { pattern: 'column' } });
  });
  test('one column with a row template → per-child heights', () => {
    const g = planGrid({ columns: 'minmax(0, 1fr)', rows: 'minmax(0, 1fr) auto' });
    expect(g).toMatchObject({ ok: true, plan: { pattern: 'column', tracks: 2, childStyles: [{ flexGrow: 1, flexBasis: 0 }, { flexGrow: 0, flexShrink: 0 }] } });
  });
  test('N equal columns', () => {
    for (const c of ['repeat(2, minmax(0, 1fr))', '1fr 1fr']) {
      const g = planGrid({ columns: c });
      expect(g).toMatchObject({ ok: true, plan: { pattern: 'equal-n', tracks: 2, axis: 'row', fallback: 'chunk', aligned: true } });
      if (g.ok) expect(g.plan.childStyles).toEqual([
        { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
        { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
      ]);
    }
    expect(planGrid({ columns: 'repeat(4, minmax(0, 1fr))' })).toMatchObject({ plan: { tracks: 4 } });
  });
  test('1fr auto, auto 1fr, auto 1fr auto → fill-auto (not aligned across rows)', () => {
    const a = planGrid({ columns: 'minmax(0, 1fr) auto' });
    expect(a).toMatchObject({ ok: true, plan: { pattern: 'fill-auto', aligned: false, childStyles: [{ flexGrow: 1 }, { flexGrow: 0, flexShrink: 0 }] } });
    const b = planGrid({ columns: 'auto 1fr' });
    expect(b).toMatchObject({ plan: { pattern: 'fill-auto', childStyles: [{ flexShrink: 0 }, { flexGrow: 1 }] } });
    expect(planGrid({ columns: 'auto minmax(0, 1fr) auto' })).toMatchObject({ plan: { pattern: 'fill-auto', tracks: 3 } });
  });
  test('fixed and fr tracks (a table row) → tracks, aligned', () => {
    const g = planGrid({ columns: '88px 148px 116px minmax(0, 1fr) 172px 68px' });
    expect(g).toMatchObject({ ok: true, plan: { pattern: 'tracks', tracks: 6, aligned: true } });
    if (g.ok) expect(g.plan.childStyles.map((c) => c.width ?? 'grow')).toEqual([11, 18, 14, 'grow', 21, 8]);
    expect(planGrid({ columns: '200px minmax(0, 1fr)' })).toMatchObject({ plan: { childStyles: [{ width: 25, flexShrink: 0 }, { flexGrow: 1 }] } });
    expect(planGrid({ columns: 'minmax(0, 2fr) minmax(0, 1fr)' })).toMatchObject({ plan: { pattern: 'tracks', childStyles: [{ flexGrow: 2 }, { flexGrow: 1 }] } });
  });
  test('grid-auto-flow: column → a row of auto items', () => {
    expect(planGrid({ autoFlow: 'column' })).toMatchObject({ ok: true, plan: { pattern: 'auto-flow-column', axis: 'row', tracks: 0 } });
  });
  test('auto-fit / auto-fill of minmax(L, Nfr): a wrapping row, every item basis L, growing N', () => {
    for (const k of ['auto-fit', 'auto-fill']) {
      const g = planGrid({ columns: `repeat(${k}, minmax(224px, 1fr))` });
      expect(g).toMatchObject({ ok: true, plan: { pattern: 'auto-fit', tracks: 1, axis: 'row', fallback: 'wrap', childStyles: [{ flexGrow: 1, flexShrink: 1, minWidth: 0 }] } });
      expect((g as { plan: { childStyles: Array<{ flexBasis: number }> } }).plan.childStyles[0]!.flexBasis).toBeGreaterThan(20);
    }
    // The min is often capped at the container, `min(100%, L)` either way round: still L (nested calls and commas).
    const plain = planGrid({ columns: 'repeat(auto-fit, minmax(260px, 1fr))' });
    for (const min of ['min(100%, 260px)', 'min(260px, 100%)', 'min(100%, calc(2 * 130px))']) {
      expect(planGrid({ columns: `repeat(auto-fit, minmax(${min}, 1fr))` })).toMatchObject({ ok: true, plan: { ...(plain as { plan: object }).plan, source: expect.any(String) } });
    }
    expect(planGrid({ columns: 'repeat(auto-fill, minmax(min(18rem, 100%), 2fr))' })).toMatchObject({ ok: true, plan: { pattern: 'auto-fit', childStyles: [{ flexGrow: 2 }] } });
    expect(planGrid({ columns: 'repeat(auto-fit, minmax(min(50%, 260px), 1fr))' })).toMatchObject({ ok: false });
    expect(planGrid({ columns: 'repeat(auto-fit, minmax(min(100%, 10vw), 1fr))' })).toMatchObject({ ok: false });
    // Any other auto-fit shape stays untranslated.
    expect(planGrid({ columns: 'repeat(auto-fit, 100px)' })).toMatchObject({ ok: false });
    expect(planGrid({ columns: 'repeat(auto-fit, minmax(10vw, 1fr))' })).toMatchObject({ ok: false });
    expect(planGrid({ columns: 'repeat(auto-fit, minmax(220px, 1fr)) 40px' })).toMatchObject({ ok: false });
  });
  test('not translated: areas, subgrid, unresolved var', () => {
    expect(planGrid({ columns: 'minmax(0, 1fr) auto', areas: "'name pct' 'bar bar'" })).toMatchObject({ ok: false, why: 'grid-template-areas' });
    expect(planGrid({ columns: 'subgrid' })).toMatchObject({ ok: false, why: 'subgrid' });
    expect(planGrid({ columns: 'var(--cols) 1fr' })).toMatchObject({ ok: false });
    expect(planGrid({ columns: 'minmax(0, 720px)' })).toMatchObject({ ok: false });
  });
  test('splitTracks strips line names and expands repeat', () => {
    expect(splitTracks('[a] 1fr [b] repeat(2, 10px auto)').tracks).toEqual(['1fr', '10px', 'auto', '10px', 'auto']);
  });
});

// ── class-level behaviours ──
const TOKENS: Record<string, string> = {
  '--sp-1': '4px',
  '--sp-2': '8px',
  '--sp-3': '12px',
  '--hx-muted': 'var(--hx-muted-text)',
  '--hx-muted-text': '#939393',
  '--hx-line': '#ffffff17',
  '--bw': '1px',
  '--fw-semibold': '600',
  '--t-small': '400 12px/16px var(--font-text)',
};
const scope = (module: Record<string, string> = {}): Scope => ({
  global: (n) => (TOKENS[n] !== undefined ? { value: TOKENS[n]!, from: 'tokens.css' } : undefined),
  module: (n) => (module[n] !== undefined ? { value: module[n]!, from: '.list' } : undefined),
});
let order = 0;
const decls = (css: string): SrcDecl[] =>
  css
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const i = x.indexOf(':');
      return { prop: x.slice(0, i).trim(), value: x.slice(i + 1).trim(), important: false, order: order++, spec: [0, 1, 0] as [number, number, number], file: 't', line: 0 };
    });
const kinds = (t: ReturnType<typeof translateDecls>): string[] => [...t.outcomes.values()].map((o) => `${o.decl} → ${o.kind}`);

describe('translateDecls', () => {
  test('display: flex defaults to a row (Yoga defaults to column)', () => {
    expect(translateDecls(decls('display: flex'), scope()).style).toEqual({ flexDirection: 'row' });
    expect(translateDecls(decls('display: flex; flex-direction: column'), scope()).style.flexDirection).toBe('column');
    expect(translateDecls(decls('display: block'), scope()).style.flexDirection).toBe('column');
  });
  test('gap splits by axis on the spacing scale', () => {
    expect(translateDecls(decls('display: flex; gap: var(--sp-2)'), scope()).style).toMatchObject({ rowGap: 0, columnGap: 1 });
    expect(translateDecls(decls('display: flex; gap: var(--sp-1) var(--sp-3)'), scope()).style).toMatchObject({ rowGap: 0, columnGap: 1 });
  });
  test('padding shorthand and logical sides', () => {
    expect(translateDecls(decls('padding: var(--sp-1) var(--sp-3); padding-inline-start: 16px'), scope()).style).toEqual({
      paddingTop: 0,
      paddingRight: 1,
      paddingBottom: 0,
      paddingLeft: 2,
    });
  });
  test('colours keep the first global token; local chains are followed', () => {
    const t = translateDecls(decls('color: var(--hx-muted); background: var(--local)'), scope({ '--local': 'var(--hx-line)' }));
    expect(t.text).toMatchObject({ fg: 'token:--hx-muted', bg: 'token:--hx-line' });
  });
  test('font shorthand gives weight; semibold is bold', () => {
    expect(translateDecls(decls('font: var(--t-small)'), scope()).text).toMatchObject({ bold: false, italic: false });
    expect(translateDecls(decls('font-weight: var(--fw-semibold)'), scope()).text.bold).toBe(true);
  });
  test('nowrap + ellipsis → one truncated line', () => {
    expect(translateDecls(decls('overflow: hidden; text-overflow: ellipsis; white-space: nowrap'), scope())).toMatchObject({
      style: { overflow: 'hidden' },
      text: { wrap: 'none', truncate: true },
    });
  });
  test('sticky is a run-time marker (translated, src/term/jsx/sticky.ts), fixed is not expressible, absolute is translated', () => {
    expect(kinds(translateDecls(decls('position: sticky; top: 0'), scope()))).toEqual(['position: sticky → translated', 'top: 0 → translated']);
    expect(translateDecls(decls('position: sticky; top: 0'), scope()).style).toEqual({ sticky: { top: 0 } });
    expect(kinds(translateDecls(decls('position: fixed; inset: 0'), scope()))).toEqual(['position: fixed → unexpressible', 'inset: 0 → unexpressible']);
    expect(translateDecls(decls('position: absolute; inset-inline-end: 12px; top: 40px'), scope()).style).toEqual({ position: 'absolute', right: 1, top: 2 });
  });
  test('a sized box keeps CSS shrink', () => {
    expect(translateDecls(decls('inline-size: 20px'), scope()).style).toEqual({ width: 2, flexShrink: 1 });
    expect(translateDecls(decls('flex: none; inline-size: 20px'), scope()).style).toMatchObject({ width: 2, flexShrink: 0 });
  });
  test('a one-sided rule is a lossy divider; a frame is a border', () => {
    const d = translateDecls(decls('border-block-end: var(--bw) solid var(--hx-line)'), scope());
    expect(d.border).toEqual({ sides: ['bottom'], style: 'single', color: 'token:--hx-line', divider: true });
    expect(kinds(d)[0]).toMatch(/lossy$/);
    const f = translateDecls(decls('border: 1px solid var(--hx-line)'), scope());
    expect(f.border).toEqual({ sides: ['top', 'right', 'bottom', 'left'], style: 'single', color: 'token:--hx-line' });
    expect(translateDecls(decls('border: 0'), scope()).border).toBeNull();
  });
  test('the visually-hidden pattern → hidden', () => {
    const t = translateDecls(decls('position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap'), scope());
    expect(t.hidden).toBe(true);
    expect(t.style).toEqual({});
  });
  test('display: grid uses planGrid; areas are reported', () => {
    expect(translateDecls(decls('display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-2)'), scope())).toMatchObject({
      style: { flexDirection: 'column', rowGap: 0, columnGap: 1 },
      grid: { pattern: 'column' },
    });
    const a = translateDecls(decls("display: grid; grid-template-areas: 'a b'"), scope());
    expect(a.gridFailure?.why).toBe('grid-template-areas');
    expect(a.style.flexDirection).toBeUndefined();
  });
  test('grid-column: 1 / -1 → spans every track', () => {
    expect(translateDecls(decls('grid-column: 1 / -1'), scope()).gridItem).toEqual({ spanAll: true });
    expect(kinds(translateDecls(decls('grid-column: 2 / 3'), scope()))[0]).toMatch(/unexpressible$/);
  });
  test('module custom properties resolve (an ancestor declares them)', () => {
    const t = translateDecls(decls('display: grid; grid-template-columns: var(--cols)'), scope({ '--cols': '88px minmax(0, 1fr)' }));
    expect(t.grid).toMatchObject({ pattern: 'tracks', tracks: 2 });
    expect(t.notes.some((n) => n.includes('--cols taken from .list'))).toBe(true);
  });
  test('a run-time custom property is not guessed', () => {
    expect(kinds(translateDecls(decls('inline-size: var(--trigger-width)'), scope()))).toEqual(['inline-size: var(--trigger-width) → unexpressible']);
  });
  test('the cascade: later wins, !important wins, specificity wins', () => {
    const ds = decls('gap: var(--sp-3); gap: var(--sp-2)');
    const t = translateDecls(ds, scope());
    expect(t.style.columnGap).toBe(1);
    expect(t.outcomes.get(ds[0]!)!.kind).toBe('overridden');
    const hi = decls('padding-left: 16px')[0]!;
    const lo = decls('padding-left: 4px')[0]!;
    hi.spec = [0, 2, 0];
    expect(translateDecls([hi, lo], scope()).style.paddingLeft).toBe(2);
  });
  test('paint is ignored with a reason', () => {
    expect(kinds(translateDecls(decls('border-radius: 4px; box-shadow: none; cursor: pointer; font-size: 12px'), scope()))).toEqual([
      'border-radius: 4px → paint',
      'box-shadow: none → paint',
      'cursor: pointer → paint',
      'font-size: 12px → paint',
    ]);
  });
});
