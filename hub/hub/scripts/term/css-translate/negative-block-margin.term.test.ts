// A negative block margin never reaches the terminal. On the web `margin-top: calc(-1 * var(--sp-3))` pulls a paragraph
// into the 12px gap above it; a terminal parent often draws no row there, so -1 row put the paragraph ON the previous
// line and the two texts mixed (Scripts build step: "Adds ac404tfor unknown.cities."). No row may draw over another:
// top and bottom clamp at 0. Inline (left/right) negatives keep their value: they pull into padding, not over a row.
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { buildTable, HUB_SRC } from '../css-translate';
import { translateDecls, type Scope, type SrcDecl } from './translate';

const scope = (): Scope => ({ global: () => undefined, module: () => undefined });
let order = 0;
const decls = (css: string): SrcDecl[] => css.split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
  const i = x.indexOf(':');
  return { prop: x.slice(0, i).trim(), value: x.slice(i + 1).trim(), important: false, order: order++, spec: [0, 1, 0] as [number, number, number], file: 't', line: 0 };
});
const tr = (css: string) => translateDecls(decls(css), scope());
const style = (css: string) => tr(css).style as Record<string, unknown>;
const kind = (css: string, prop: string) => [...tr(css).outcomes.values()].find((o) => o.decl.startsWith(prop + ':'))?.kind;

describe('negative block margins', () => {
  test('top and bottom clamp at 0 and are reported lossy', () => {
    expect(style('margin-top: -12px').marginTop).toBe(0);
    expect(style('margin-bottom: -16px').marginBottom).toBe(0);
    expect(style('margin-top: -48px').marginTop).toBe(0);
    expect(kind('margin-top: -12px', 'margin-top')).toBe('lossy');
    expect(kind('margin-bottom: -16px', 'margin-bottom')).toBe('lossy');
  });
  test('positive block margins and inline negatives are as before', () => {
    expect(style('margin-top: 12px').marginTop).toBe(1);
    expect(style('margin-bottom: 24px').marginBottom).toBe(2);
    expect(style('margin-left: -8px').marginLeft).toBe(-1);
    expect(style('margin-right: -4px').marginRight).toBe(-1);
    expect(kind('margin-left: -8px', 'margin-left')).toBe('translated');
  });
  test('padding is untouched', () => {
    expect(style('padding-top: 12px').paddingTop).toBe(1);
  });
});

describe('the whole tree', () => {
  // Every place a style can sit (the class, its variants, its child rules): the entry's JSON is searched whole.
  const negatives = (width: string): string[] =>
    buildTable({ width }).results.flatMap((r) => r.entries).filter((e) => /"margin(Top|Bottom)":-\d/.test(JSON.stringify(e))).map((e) => e.id);
  test('no class, at any width, carries a negative top or bottom margin', () => {
    for (const w of ['narrow', 'medium', 'wide']) expect(negatives(w)).toEqual([]);
  }, 120_000);
  // The classes that lose a pull today, by name: a new one shows here, to be looked at (does it pull into its parent's
  // gap, as Layouts .settingsWide does on the web, or onto a sibling's row?). Layouts and DataTable have terminal
  // siblings, so only Flow .lead and launch .fade are drawn from these.
  test('exactly these classes carry a clamped negative block margin', () => {
    const clamped = new Set<string>();
    for (const w of ['narrow', 'medium', 'wide'])
      for (const e of buildTable({ width: w }).results.flatMap((r) => r.entries))
        if (JSON.stringify(e).includes('would draw over the neighbouring row')) clamped.add(e.id);
    expect([...clamped].sort()).toEqual([
      'kit/data/DataTable.module.css#cardBottom',
      'kit/layouts/Layouts.module.css#settingsWide',
      'pages/apps/launch/launch.module.css#fade',
      'pages/scripts/new/Flow.module.css#lead',
    ]);
  }, 120_000);
  test('the Scripts build step: .lead (margin: calc(-1 * var(--sp-3)) 0 0) sits under the line before it, not on it', () => {
    expect(fs.readFileSync(path.join(HUB_SRC, 'pages/scripts/new/Flow.module.css'), 'utf8')).toMatch(/\.lead\s*\{[^}]*margin:\s*calc\(-1 \* var\(--sp-3\)\) 0 0/);
    const flow = buildTable({ width: 'narrow' }).results.find((x) => x.path === 'pages/scripts/new/Flow.module.css')!;
    const lead = flow.entries.find((e) => e.id.endsWith('#lead'))!;
    expect((lead.style as Record<string, unknown>).marginTop).toBe(0);
  }, 120_000);
});
