// The ship bundle's class-style tables in one file (ship-entry.ts reads it). The translator builds one table per width
// band (css-translate/breakpoints.ts: @media by the terminal's px, @container by the page pane's px); a table is about
// 3.2 MB, most of it diagnostics the runtime never reads, and there are about 200 reachable bands. But a stylesheet's
// classes change only at ITS OWN breakpoints (and at those of the globals it reads, tokens.css), so the pack keeps, per
// module, one set of entries per band of that module: the first as a whole, the others as differences from it.
// bandsOf() rebuilds exactly the runtime fields of any band's table. Runtime-safe (no imports but types): the bundle
// carries it, so the ten lines of band naming are repeated here (pinned equal to breakpoints.ts by the test).
import type { ClassEntry, Table } from '../css-translate/types';

export const PACK_VERSION = 2;
export interface Edges { media: number[]; container: number[] }
type PackedEntry = Omit<ClassEntry, 'id' | 'outcomes' | 'notes'>;
interface PackedModule {
  /** Local class names (class id = `${module}#${name}`). */
  names: string[];
  /** The px lengths this module's classes can change at: its own conditions' and the globals' (tokens.css). */
  edges: Edges;
  /** The entries of the module's first band, keyed by class id, in source order. */
  classes: Record<string, PackedEntry>;
  /** Every band of this module the build made a table for. One not named here has no table (bandsOf: null), never a guess. */
  subs: string[];
  /** Per band that differs from the first: the entries that differ (null = absent in that band). */
  diff: Record<string, Record<string, PackedEntry | null>>;
  /**
   * Per band whose classes are not in the order "the first band's, minus the absent, then the new ones": that band's
   * local names in its own order. The resolver breaks equal-specificity ties by this order (jsx/css-table.ts).
   */
  order?: Record<string, string[]>;
}
export interface PackedTables {
  packVersion: typeof PACK_VERSION;
  version: Table['version'];
  generated: string;
  unitModel: Table['unitModel'];
  /** Px per cell column: a band is judged at cols x cellPx. */
  cellPx: number;
  rows: number;
  /** Every module's edges together: they name the band of a whole table. */
  edges: Edges;
  modules: Record<string, PackedModule>;
}
/** One band's table as the build made it, with a size that lies in the band. */
export interface BandTable { cols: number; paneCols: number; table: Table }

// --- band naming: the same rule as css-translate/breakpoints.ts bandOf / bandKey ---
function bandOf(px: number, thresholds: readonly number[]): string {
  let floor = 0;
  for (const t of thresholds) { if (t === px) return `${px}e`; if (t < px && t > floor) floor = t; }
  return `${floor}`;
}
export const packBandKey = (viewportPx: number, containerPx: number, e: Edges): string => `m${bandOf(viewportPx, e.media)}c${bandOf(containerPx, e.container)}`;

/** Diagnostics the runtime never reads: outcomes, notes, and every `detail` text. */
function strip<T>(v: T): T {
  if (Array.isArray(v)) return v.map(strip) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (k !== 'outcomes' && k !== 'notes' && k !== 'detail' && k !== 'id') out[k] = strip(x);
    return out as T;
  }
  return v;
}

/**
 * Packs every band's table. `moduleEdges`: per module, the px lengths its entries can change at. Refuses (the build
 * fails) when two tables that share a module band disagree on that module: its entries would then depend on something
 * the edges do not name, and the bundle would draw one of the two at random.
 */
export function packBands(bands: Iterable<BandTable>, moduleEdges: Readonly<Record<string, Edges>>, all: Edges, cellPx: number): PackedTables {
  let first: Table | null = null;
  const seen = new Map<string, Map<string, { json: string; entries: Record<string, PackedEntry> }>>();
  for (const { cols, paneCols, table } of bands) {
    if (!first) first = table;
    else if (JSON.stringify(table.modules) !== JSON.stringify(first.modules)) throw new Error(`TERM_STYLE_PACK: the ${table.widthClass.name} table names other classes than the ${first.widthClass.name} one`);
    const byModule = new Map<string, Record<string, PackedEntry>>();
    for (const [id, e] of Object.entries(table.classes)) {
      const m = id.slice(0, id.indexOf('#'));
      let into = byModule.get(m);
      if (!into) byModule.set(m, into = {});
      into[id] = strip(e) as PackedEntry;
    }
    for (const m of Object.keys(table.modules)) {
      const edges = moduleEdges[m];
      if (!edges) throw new Error(`TERM_STYLE_PACK: no edges for ${m}`);
      const sub = packBandKey(cols * cellPx, paneCols * cellPx, edges);
      const entries = byModule.get(m) ?? {};
      const json = JSON.stringify(entries);
      let bySub = seen.get(m);
      if (!bySub) seen.set(m, bySub = new Map());
      const had = bySub.get(sub);
      if (!had) bySub.set(sub, { json, entries });
      else if (had.json !== json) throw new Error(`TERM_STYLE_PACK: ${m} differs between two tables of its band ${sub} (at ${table.widthClass.name})`);
    }
  }
  if (!first) throw new Error('TERM_STYLE_PACK: no table to pack');
  const modules: Record<string, PackedModule> = {};
  for (const [m, map] of Object.entries(first.modules)) {
    for (const [name, id] of Object.entries(map)) if (id !== `${m}#${name}`) throw new Error(`TERM_STYLE_PACK: class id ${id} is not ${m}#${name}`);
    const all = [...seen.get(m)!];
    const base = all[0]![1];
    const diff: PackedModule['diff'] = {};
    const order: NonNullable<PackedModule['order']> = {};
    for (const [sub, v] of all.slice(1)) {
      if (v.json === base.json) continue;
      const d: Record<string, PackedEntry | null> = {};
      for (const [id, e] of Object.entries(v.entries)) if (JSON.stringify(e) !== JSON.stringify(base.entries[id])) d[id] = e;
      for (const id of Object.keys(base.entries)) if (!(id in v.entries)) d[id] = null;
      diff[sub] = d;
      const ids = Object.keys(v.entries);
      const plain = [...Object.keys(base.entries).filter((id) => id in v.entries), ...ids.filter((id) => !(id in base.entries))];
      if (ids.join('\0') !== plain.join('\0')) order[sub] = ids.map((id) => id.slice(m.length + 1));
    }
    modules[m] = { names: Object.keys(map), edges: moduleEdges[m]!, subs: all.map(([sub]) => sub), classes: base.entries, diff, ...(Object.keys(order).length ? { order } : {}) };
  }
  return { packVersion: PACK_VERSION, version: first.version, generated: first.generated, unitModel: first.unitModel, cellPx, rows: first.widthClass.rows, edges: all, modules };
}

/** A pack of another version (a bundle whose asset and code disagree) is refused by name, never half-read. */
export function assertPack(p: unknown): asserts p is PackedTables {
  const v = (p as { packVersion?: unknown } | null)?.packVersion;
  if (v !== PACK_VERSION) throw new Error(`TERM_STYLE_PACK_VERSION: the style tables are pack version ${String(v)}, this bundle reads ${PACK_VERSION}`);
}

/**
 * The pack as a styles source (app/styles.ts stylesFromBands): `keyFor` names the band of a terminal and its page
 * pane, `tableOf` rebuilds that band's table (outcomes empty, ids restored, classes in the order the build had them).
 * A key is only asked for after keyFor named it; a band the build made no table for is null. `pack` is read on the
 * first call.
 */
export function bandsOf(pack: () => PackedTables): { keyFor(cols: number, paneCols: number): string; tableOf(key: string): Table | null } {
  let p: PackedTables | null = null;
  const get = (): PackedTables => p ??= pack();
  const sizes = new Map<string, [number, number]>();
  // One module band's entries are shared by every table that draws that band.
  const built = new Map<string, Record<string, ClassEntry>>();
  const moduleClasses = (m: string, pm: PackedModule, sub: string): Record<string, ClassEntry> | null => {
    if (!pm.subs.includes(sub)) return null;
    const d = pm.diff[sub];
    const at = `${m}\0${d ? sub : ''}`;
    let out = built.get(at);
    if (out) return out;
    out = {};
    const put = (id: string): void => {
      const x = d && id in d ? d[id] : pm.classes[id];
      if (x && !(id in out!)) out![id] = { ...x, id, outcomes: [] } as ClassEntry;
    };
    const own = pm.order?.[sub];
    if (own) for (const n of own) put(`${m}#${n}`);
    else { Object.keys(pm.classes).forEach(put); if (d) Object.keys(d).forEach(put); }
    built.set(at, out);
    return out;
  };
  return {
    keyFor(cols, paneCols) {
      const pk = get();
      const pane = Math.min(paneCols, cols);
      const k = packBandKey(cols * pk.cellPx, pane * pk.cellPx, pk.edges);
      if (!sizes.has(k)) sizes.set(k, [cols, pane]);
      return k;
    },
    tableOf(key) {
      const at = sizes.get(key);
      if (!at) return null;
      const pk = get();
      const [cols, pane] = at;
      const classes: Record<string, ClassEntry> = {};
      const modules: Table['modules'] = {};
      for (const [m, pm] of Object.entries(pk.modules)) {
        modules[m] = Object.fromEntries(pm.names.map((n) => [n, `${m}#${n}`]));
        const mine = moduleClasses(m, pm, packBandKey(cols * pk.cellPx, pane * pk.cellPx, pm.edges));
        if (!mine) return null;
        Object.assign(classes, mine);
      }
      return { version: pk.version, generated: pk.generated, widthClass: { name: key, cols, rows: pk.rows, containerCols: pane }, unitModel: pk.unitModel, modules, classes };
    },
  };
}
