// Builds the CSS translator's table for a terminal width and installs it behind the compat runtime's styleOf.
// The table is cached under hub/.term-cache, keyed by the stylesheets' sizes and times and the translator's own files.
import fs from 'node:fs';
import path from 'node:path';
// The library, not the command (css-translate.ts starts with the test boundary; the live launcher loads this file).
import { buildTable, listModules, loadSources, type Sources } from './css-translate/table';
import { bandKey, mergeThresholds, type Thresholds } from './css-translate/breakpoints';
import type { Table } from './css-translate/types';
import { HUB, SRC } from './resolve';

/** One cell is this many px wide (css-translate/units.ts CELL_W_PX; a test holds the two equal). */
const CELL_PX = 8;

/** The files whose code builds a table: they are loaded once, so their state is read once, when this module loads. */
const CODE_FILES = (): string[] => [path.join(SRC, 'term/prim/tokens.ts'),
  // Two globs: Bun's Glob matches nothing for `css-translate{.ts,/*.ts}` (a brace with a slash), so translator edits
  // never changed the stamp and a stale table was served.
  ...['css-translate.ts', 'css-translate/*.ts'].flatMap((g) => [...new Bun.Glob(g).scanSync(import.meta.dirname)]).map((f) => path.join(import.meta.dirname, f))].sort();

const statLines = (files: string[]): string => files.map((f) => { const st = fs.statSync(f); return `${f}:${st.size}:${st.mtimeMs}\n`; }).join('');

/**
 * A stamp function: the code files' state as it was when it was made (the code this process runs), plus the stylesheets'
 * state each time it is called (they are read fresh by every build). Reading the code files at call time named a table
 * after code the process had not loaded: a process started before a translator edit and building just after it wrote
 * the OLD translation under the NEW stamp, and every later run read it (once, the medium table lost
 * `inline-size: min(100%, 760px)` for a day). Exported for its test.
 */
export function makeStamp(codeFiles: string[], dataFiles: () => string[]): () => string {
  const code = statLines(codeFiles);
  return () => {
    const h = new Bun.CryptoHasher('sha1');
    h.update(code);
    h.update(statLines([...dataFiles()].sort()));
    return h.digest('hex').slice(0, 16);
  };
}

const stampNow = makeStamp(CODE_FILES(), () => [...listModules(SRC).map((m) => path.join(SRC, m)), path.join(SRC, 'kit/tokens.css')]);

/** The cache directory (HUB_TERM_CACHE overrides; several workers and test runs share the default). */
export const cacheDir = (): string => process.env.HUB_TERM_CACHE || path.join(HUB, '.term-cache');
const memo = new Map<string, Table>();

// The stylesheets, their stamp and the bands' edges, read ONCE per process, at the first table: every band of a run
// is cut from the same texts under the same stamp, and entering a new band (a resize) walks no directory (the walk and
// the stats were 44% of a resize). A stylesheet edited while a process runs is seen by the next process.
let once: { stamp: string; sources: Sources } | null = null;
const read = (): { stamp: string; sources: Sources } => (once ??= { stamp: stampNow(), sources: loadSources(SRC) });
const stamp = (): string => read().stamp;
const thresholds = (): Thresholds => read().sources.thresholds;

/**
 * The band key of a terminal `cols` wide whose page pane is `paneCols` wide (css-translate/breakpoints.ts): @media
 * conditions are judged by cols x 8 px, @container conditions by paneCols x 8 px. Two sizes with one key draw from one
 * table. Outside a shell (a kit test) the pane is the terminal.
 */
export function styleKeyFor(cols: number, paneCols: number = cols): string {
  return bandKey(cols * CELL_PX, Math.min(paneCols, cols) * CELL_PX, thresholds());
}

/**
 * The table for a terminal width and pane width, from the cache when its stamp matches. Safe with several processes at once: a writer writes a
 * file of its own and renames it into place (a reader never sees half a file), a cache file that does not parse is
 * rebuilt in memory, and only files of another stamp older than an hour are removed (a sibling process may still be
 * reading a fresh one).
 */
export function tableFor(cols: number, paneCols: number = cols): Table {
  const pane = Math.min(paneCols, cols);
  const key = styleKeyFor(cols, pane);
  const dir = cacheDir();
  const name = `css-table.${key}.${stamp()}.json`;
  const hit = memo.get(name);
  if (hit) return hit;
  const file = path.join(dir, name);
  let table: Table | null = null;
  try { table = JSON.parse(fs.readFileSync(file, 'utf8')) as Table; } catch { table = null; }
  if (!table) {
    // Rows: the one height condition in the tree (the web sidebar's `height <= 900px`) holds at any terminal height.
    table = buildTable({ sources: read().sources, width: { name: key, cols, rows: 40, containerCols: pane } }).table;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(table));
      fs.renameSync(tmp, file);
      const now = Date.now();
      for (const old of fs.readdirSync(dir)) {
        if (old === name || !old.startsWith('css-table.')) continue;
        try { if (now - fs.statSync(path.join(dir, old)).mtimeMs > 3_600_000) fs.unlinkSync(path.join(dir, old)); } catch { /* another process removed it */ }
      }
    } catch { /* a read-only or full cache only costs the next run a rebuild */ }
  }
  memo.set(name, table);
  return table;
}

/** The band tables as a pair for a styles source: `keyFor` names a size's band (and remembers one size of it),
 *  `tableOf` builds or reads that band's table. A key is only asked for after keyFor named it. */
export function bandTables(): { keyFor(cols: number, paneCols: number): string; tableOf(key: string): Table | null } {
  const sizes = new Map<string, [number, number]>();
  return {
    keyFor(cols, paneCols) { const k = styleKeyFor(cols, paneCols); if (!sizes.has(k)) sizes.set(k, [cols, Math.min(paneCols, cols)]); return k; },
    tableOf(key) { const at = sizes.get(key); return at ? tableFor(at[0], at[1]) : null; },
  };
}

/** The widest terminal the ship pack enumerates: past the largest breakpoint (2200 px) every size is one band. */
export const PACK_MAX_COLS = 480;

/**
 * Every band a terminal of 1..PACK_MAX_COLS columns can reach (the pane never wider than the terminal),
 * each with its table, built in this process and not written to the cache (about 200 tables of 3 MB): the ship build's
 * input (build/style-pack.ts packBands). `edges`: per module, the px lengths its classes can change at (its own
 * conditions' and tokens.css's); `all`: every module's together; `sizes`: one [cols, pane] per band.
 */
export function everyBand(): { cellPx: number; all: Thresholds; edges: Record<string, Thresholds>; sizes: [number, number][]; bands: Iterable<{ cols: number; paneCols: number; table: Table }> } {
  const { sources } = read();
  const sizes = new Map<string, [number, number]>();
  for (let cols = 1; cols <= PACK_MAX_COLS; cols++) for (let pane = 1; pane <= cols; pane++) {
    const k = styleKeyFor(cols, pane);
    if (!sizes.has(k)) sizes.set(k, [cols, pane]);
  }
  const edges: Record<string, Thresholds> = {};
  for (const m of sources.modules) edges[m] = mergeThresholds([sources.edges.get(m) ?? { media: [], container: [] }, sources.tokensEdges]);
  return {
    cellPx: CELL_PX, all: sources.thresholds, edges, sizes: [...sizes.values()],
    bands: { *[Symbol.iterator]() { for (const [key, [cols, pane]] of sizes) yield { cols, paneCols: pane, table: buildTable({ sources, width: { name: key, cols, rows: 40, containerCols: pane } }).table }; } },
  };
}

/** Call after installTermLoader: the modules are imported through it, so they are the ones the pages use. */
export async function installStyleTable(cols: number): Promise<void> {
  const style = await import(path.join(SRC, 'term/jsx/style.ts')) as typeof import('../../src/term/jsx/style');
  const adapter = await import(path.join(SRC, 'term/jsx/css-table.ts')) as typeof import('../../src/term/jsx/css-table');
  // One resolver per band, built on first use; setStyleWidth (render.ts resize, dev.ts on 'resize') and setStylePane
  // (the shell's pane box) re-select. A key is always asked for after keyFor named it, so its sizes are known.
  const made = new Map<string, ReturnType<typeof adapter.resolverFor>>();
  const bands = bandTables();
  const forKey = (k: string) => { let r = made.get(k); if (!r) { const t = bands.tableOf(k); if (!t) return null; r = adapter.resolverFor(t); made.set(k, r); } return r; };
  style.setStyleTables(forKey, bands.keyFor, cols);
}
