// The packed style tables (build/style-pack.ts) rebuild every runtime field of every band's table.
import { describe, expect, test } from 'bun:test';
import { everyBand, PACK_MAX_COLS, styleKeyFor, tableFor } from '../style-table';
import { bandKey } from '../css-translate/breakpoints';
import { assertPack, bandsOf, packBandKey, packBands, PACK_VERSION } from './style-pack';
import type { ClassEntry, Table } from '../css-translate/types';
import { ASSET_BUDGETS } from './verify';

const runtimeView = (t: Table) => JSON.parse(JSON.stringify(t, (k, v) => (k === 'outcomes' || k === 'notes' || k === 'detail' ? undefined : v)));

describe('style pack', () => {
  const every = everyBand();
  const packed = packBands(every.bands, every.edges, every.all, every.cellPx);
  const bands = bandsOf(() => packed);
  const firstBand = (): { cols: number; paneCols: number; table: Table } => every.bands[Symbol.iterator]().next().value!;

  test('names a band exactly as the dev runtime does', () => {
    for (const [c, p] of [[1, 1], [19, 12], [20, 20], [60, 60], [75, 75], [80, 80], [96, 96], [100, 70], [120, 95], [128, 128], [160, 135], [240, 215], [480, 480], [900, 900]] as const) {
      expect(bands.keyFor(c, p)).toBe(styleKeyFor(c, p));
      expect(packBandKey(c * 8, p * 8, every.all)).toBe(bandKey(c * 8, p * 8, every.all));
    }
  });

  // Every band the build enumerates, then two sizes past the range. Key order is compared as it is: the resolver breaks
  // equal-specificity ties by the order of `classes` (jsx/css-table.ts).
  test('every band unpacks to its table minus diagnostics, classes in the same order', () => {
    const check = (c: number, p: number, want: Table): void => {
      const got = bands.tableOf(bands.keyFor(c, p))!;
      expect(Object.keys(got.classes)).toEqual(Object.keys(want.classes));
      expect(runtimeView(got)).toEqual(runtimeView({ ...want, generated: packed.generated, unitModel: packed.unitModel, widthClass: got.widthClass }));
    };
    let n = 0;
    for (const b of every.bands) { check(b.cols, b.paneCols, b.table); n++; }
    expect(n).toBeGreaterThan(150);
    for (const [c, p] of [[600, 600], [900, 640]] as const) check(c, p, tableFor(c, p));
  }, 600_000);

  test('a band whose classes come in another order than the first band keeps its own order', () => {
    const a = firstBand();
    const m = Object.keys(a.table.modules).find((x) => Object.keys(a.table.modules[x]!).length > 1)!;
    const ids = Object.values(a.table.modules[m]!).filter((id) => id in a.table.classes);
    expect(ids.length).toBeGreaterThan(1);
    const turned: Table['classes'] = {};
    for (const id of Object.keys(a.table.classes).reverse()) turned[id] = a.table.classes[id]!;
    const other = { cols: PACK_MAX_COLS, paneCols: PACK_MAX_COLS, table: { ...a.table, classes: turned } };
    const edges = Object.fromEntries(Object.keys(a.table.modules).map((x) => [x, every.all]));
    const two = bandsOf(() => packBands([a, other], edges, every.all, every.cellPx));
    const of = (t: Table): string[] => Object.keys(t.classes).filter((id) => id.startsWith(`${m}#`));
    expect(of(two.tableOf(two.keyFor(other.cols, other.paneCols))!)).toEqual(of(other.table));
    expect(of(two.tableOf(two.keyFor(a.cols, a.paneCols))!)).toEqual(of(a.table));
  }, 120_000);

  // A band the build never made a table for would have nothing to draw from: every size's band of every module is in
  // the pack, and past PACK_MAX_COLS no breakpoint is left to cross.
  test('every terminal and pane size lands on a band the pack holds, for every module', () => {
    const mods = Object.entries(packed.modules);
    for (const [m, pm] of mods) expect([m, Math.max(0, ...pm.edges.media, ...pm.edges.container) < PACK_MAX_COLS * packed.cellPx]).toEqual([m, true]);
    const missing = new Set<string>();
    for (const [m, pm] of mods) {
      const has = new Set(pm.subs);
      for (const sub of Object.keys(pm.diff)) expect(has.has(sub)).toBe(true);
      const seen = new Set<string>();
      for (let c = 1; c <= PACK_MAX_COLS; c++) for (let p = 1; p <= c; p++) {
        const sub = packBandKey(c * packed.cellPx, p * packed.cellPx, pm.edges);
        if (!seen.has(sub)) { seen.add(sub); if (!has.has(sub)) missing.add(`${m} ${sub}`); }
      }
    }
    expect([...missing]).toEqual([]);
    const one = Object.entries(packed.modules).find(([, pm]) => pm.subs.length > 1)!;
    const cut = bandsOf(() => ({ ...packed, modules: { ...packed.modules, [one[0]]: { ...one[1], subs: one[1].subs.slice(0, 1) } } }));
    let nulls = 0;
    for (const b of every.sizes) if (cut.tableOf(cut.keyFor(b[0], b[1])) === null) nulls++;
    expect(nulls).toBeGreaterThan(0);
  }, 300_000);

  test('a key nobody named has no table; a pack of another version is refused by name', () => {
    expect(bandsOf(() => packed).tableOf('m0c0')).toBeNull();
    expect(packed.packVersion).toBe(PACK_VERSION);
    expect(() => assertPack({ ...packed, packVersion: 1 })).toThrow('TERM_STYLE_PACK_VERSION');
    expect(() => assertPack(null)).toThrow('TERM_STYLE_PACK_VERSION');
  });

  test('two tables of one module band that disagree fail the build', () => {
    const a = firstBand();
    const m = Object.keys(a.table.modules).find((x) => Object.keys(a.table.modules[x]!).length > 0)!;
    const id = Object.values(a.table.modules[m]!)[0]!;
    const other: Table = { ...a.table, classes: { ...a.table.classes, [id]: { ...a.table.classes[id]!, hidden: !a.table.classes[id]!.hidden } as ClassEntry } };
    expect(() => packBands([a, { ...a, table: other }], every.edges, every.all, every.cellPx)).toThrow('TERM_STYLE_PACK');
  }, 120_000);

  const size = JSON.stringify(packed).length;
  const differing = Object.values(packed.modules).reduce((n, m) => n + Object.keys(m.diff).length, 0);
  const reordered = Object.values(packed.modules).reduce((n, m) => n + Object.keys(m.order ?? {}).length, 0);
  // The build refuses an asset over its verify.ts budget: the test holds the same number, not a looser one.
  const cap = ASSET_BUDGETS.find((b) => b.cls === 'class-style tables')!.maxEach;
  test(`under the verify.ts asset budget of ${cap} bytes (${size} bytes; ${differing} module bands differ, ${reordered} in another class order)`, () => {
    expect(size).toBeLessThanOrEqual(cap);
  });
});
