// The CSS translator as a library (the command is ../css-translate.ts, which adds only the argument handling and the
// test boundary). A program that must reach the network (the live launcher, through style-table.ts) imports THIS
// file: nothing here, or below it, imports netns-first.ts (css-translate/table.term.test.ts holds that).
//
//   buildTable({ width? }) → { table, results, tokens }      build in memory
//   loadTable(file) / useTable(table)                        set the table styleOf() reads
//   styleOf(classId) → ClassEntry | undefined                (builds the default table on first use if none was set)
//   moduleExports(cssPath) → { local: classId }              what a CSS-module import evaluates to (parses the CSS only)
//   cssModuleSource(cssPath) → 'export default {…};'         the same as module source, for a Vite `load` hook
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStyleLookup, moduleKey } from './lookup';
import { moduleClassNames, moduleRootVars, translateModule, type GlobalVars, type ModuleResult } from './module';
import { bandOf, mergeThresholds, thresholdsOf, type Thresholds } from './breakpoints';
import { envFor, WIDTH_CLASSES } from './queries';
import { loadTokens, type TokenSet } from './tokens';
import type { ClassEntry, Table, WidthClass } from './types';
import { UNIT_MODEL_DOC } from './units';

export type { ClassEntry, Table, TermStyle, TermText, TermBorder, GridPlan, Variant, When, Outcome } from './types';
export { createStyleLookup, moduleKey };

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const HUB_SRC = path.resolve(HERE, '../../../src');

/** Every *.module.css under src, relative to src, sorted. */
export function listModules(src: string = HUB_SRC): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== 'dist') walk(p);
      } else if (e.name.endsWith('.module.css')) out.push(path.relative(src, p).split(path.sep).join('/'));
    }
  };
  walk(src);
  return out.sort();
}

export function widthClassOf(w: string | WidthClass | undefined): WidthClass {
  if (w === undefined) return WIDTH_CLASSES.narrow!;
  if (typeof w !== 'string') return w;
  if (WIDTH_CLASSES[w]) return WIDTH_CLASSES[w]!;
  const n = Number(w);
  if (Number.isInteger(n) && n > 0) return { name: `${n}cols`, cols: n, rows: 40 };
  throw new Error(`unknown width class ${w} (narrow, medium, wide or a column count)`);
}

export interface BuildOptions {
  src?: string;
  width?: string | WidthClass;
  /** Only these module paths (relative to src); every module's :root vars are still read. */
  only?: string[];
  /** The stylesheets already read (loadSources of the same src); read here when absent. */
  sources?: Sources;
}

export interface Build {
  table: Table;
  results: ModuleResult[];
  tokens: TokenSet;
  globals: GlobalVars;
}

/** The stylesheets as read at one moment: every module's text, tokens.css, and the lengths their width conditions
 *  compare with. A runner that builds several band tables reads them once (style-table.ts) and passes them to each
 *  build, so a further band costs no directory walk, read or hash. */
export interface Sources { src: string; modules: string[]; css: Map<string, string>; tokensCss: string; /** sha1 of every text. */ sig: string; tokensEdges: Thresholds; edges: Map<string, Thresholds>; /** All of them merged: the bands' edges. */ thresholds: Thresholds; /** Every module's `:root` custom properties (the first declaration of a name wins). */ roots: Map<string, { value: string; from: string }>; /** tokens.css resolved, per band of its own conditions. */ tokens: Map<string, TokenSet> }

export function loadSources(src: string = HUB_SRC): Sources {
  const tokensCss = fs.readFileSync(path.join(src, 'kit/tokens.css'), 'utf8');
  const modules = listModules(src);
  const css = new Map(modules.map((m) => [m, fs.readFileSync(path.join(src, m), 'utf8')]));
  const hasher = new Bun.CryptoHasher('sha1');
  hasher.update(src); hasher.update(tokensCss);
  for (const [m, text] of css) { hasher.update(m); hasher.update(text); }
  const tokensEdges = thresholdsOf(tokensCss);
  const edges = new Map([...css].map(([m, text]) => [m, thresholdsOf(text)]));
  const roots = new Map<string, { value: string; from: string }>();
  for (const [m, text] of css) for (const [k, v] of moduleRootVars(text)) if (!roots.has(k)) roots.set(k, { value: v, from: `:root in ${m}` });
  return { src, modules, css, tokensCss, sig: hasher.digest('hex'), tokensEdges, edges, thresholds: mergeThresholds([tokensEdges, ...edges.values()]), roots, tokens: new Map() };
}

// One module's translation depends on the width only through the outcome of ITS OWN width conditions (its band) and
// through the global custom properties it read (tokens.css changes three of them under 600 px). Kept per module and
// band for this process, with the globals it looked up and their values: a table for another band re-translates only
// the modules whose own conditions changed or that read a global whose value changed (a handful), not all (seconds).
interface Kept { deps: Map<string, string | undefined>; result: ModuleResult }
const moduleMemo = new Map<string, Kept[]>();
let memoOf = '';

export function buildTable(opts: BuildOptions = {}): Build {
  const src = opts.src ?? HUB_SRC;
  const width = widthClassOf(opts.width);
  const env = envFor(width);
  const from = opts.sources ?? loadSources(src);
  const { tokensCss, modules, css } = from;
  // The memo holds for one set of stylesheets (any edit drops it: :root vars and tokens reach every module).
  if (from.sig !== memoOf) { moduleMemo.clear(); memoOf = from.sig; }
  const containerPx = env.containerWidthPx ?? env.widthPx;
  const tokensBand = bandOf(env.widthPx, from.tokensEdges.media);
  const bandOfModule = (m: string, text: string): string => { const t = from.edges.get(m) ?? thresholdsOf(text); return `${bandOf(env.widthPx, t.media)}/${bandOf(containerPx, t.container)}/${env.heightPx}`; };
  const { roots } = from;
  const tokensKey = `${tokensBand}/${bandOf(containerPx, from.tokensEdges.container)}/${env.heightPx}`;
  let tokens = from.tokens.get(tokensKey);
  if (!tokens) { tokens = loadTokens(tokensCss, env); from.tokens.set(tokensKey, tokens); }
  const globals: GlobalVars = {
    get(name) {
      const t = tokens.values.get(name);
      if (t !== undefined) return { value: t, from: 'tokens.css' };
      return roots.get(name);
    },
  };
  const results: ModuleResult[] = [];
  const table: Table = {
    version: 1,
    generated: new Date().toISOString(),
    widthClass: width,
    unitModel: UNIT_MODEL_DOC,
    modules: {},
    classes: {},
  };
  for (const m of opts.only ?? modules) {
    const text = css.get(m) ?? fs.readFileSync(path.join(src, m), 'utf8');
    const memoKey = `${m}\0${bandOfModule(m, text)}`;
    const kept = css.has(m) ? moduleMemo.get(memoKey) : undefined;
    let r = kept?.find((k) => { for (const [name, value] of k.deps) if (globals.get(name)?.value !== value) return false; return true; })?.result;
    if (!r) {
      const deps = new Map<string, string | undefined>();
      r = translateModule(m, text, env, { get(name) { const g = globals.get(name); deps.set(name, g?.value); return g; } });
      if (css.has(m)) { if (kept) kept.push({ deps, result: r }); else moduleMemo.set(memoKey, [{ deps, result: r }]); }
    }
    results.push(r);
    table.modules[m] = r.exports;
    for (const e of r.entries) table.classes[e.id] = e;
  }
  return { table, results, tokens, globals };
}

let current: Table | undefined;

export function useTable(t: Table): void {
  current = t;
}

export function loadTable(file: string): Table {
  current = JSON.parse(fs.readFileSync(file, 'utf8')) as Table;
  return current;
}

export function styleOf(classId: string, table?: Table): ClassEntry | undefined {
  const t = table ?? (current ??= buildTable().table);
  return t.classes[classId];
}

/** Local class name → class id for one CSS module (absolute, `hub/src/…`, `src/…` or src-relative path). */
export function moduleExports(cssPath: string, src: string = HUB_SRC): Record<string, string> {
  const key = moduleKey(path.isAbsolute(cssPath) && !cssPath.includes('/hub/src/') ? path.relative(src, cssPath) : cssPath);
  const text = fs.readFileSync(path.join(src, key), 'utf8');
  const out: Record<string, string> = {};
  for (const n of moduleClassNames(text)) out[n] = `${key}#${n}`;
  return out;
}

export function cssModuleSource(cssPath: string, src: string = HUB_SRC): string {
  return `export default ${JSON.stringify(moduleExports(cssPath, src))};\n`;
}
