// fixture-graph.ts: which hub modules belong to fixtures and tests, by the IMPORT GRAPH rather than by file name.
// A data file named anything (fixtureData.ts, mockKeys.ts, crypto.vectors.ts) that only fixture or
// test code reaches is fixture-only, and the ship artifact check (verify.ts) refuses it in the bundle.
//   roots     every module the name rules already call test / fixture / harness (graph/build.ts isExcluded, plus the
//             ship list's fixture names): tests, specs, fixtures, worlds, shots, scenarios, vectors, fixture entry/boot
//   reach     everything the roots import (web and terminal resolution)
//   live      what the web app reaches from its entry (src/app/main.tsx) plus what the terminal ship entry reaches
//             (src/term/entry.live.ts, terminal resolution), never entering a root
//   fixture-only = roots + (reach - live)
// The static live graph is the reference; the bundle is what the build really kept. A fixture-only module in the
// bundle means the build reached it some way the source graph does not show (a define that did not fold, a computed
// import, a glob): the finding names the module and the bundle's importers.
import fs from 'node:fs';
import path from 'node:path';
import { isExcluded, walk } from '../graph/build';
import { ModuleResolver, type Target } from '../graph/modres';
import { readStrictGlobals, scanFile, type FileFacts, type ScanConfig } from '../graph/scan';

const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs)$/;
const CORE_FIXTURE_BARREL = 'src/core/index.fixtures.ts';
const CORE_LIVE_BARREL = 'src/core/index.ts';
/** Fixture names of the ship list (verify.ts FORBIDDEN) that isExcluded does not already cover. */
const ROOT_NAMES: readonly RegExp[] = [
  /(^|\/)src\/term\/entry\.fixture\.ts$/, /(^|\/)src\/term\/app\/boot\.ts$/, /(^|\/)src\/term\/(test|scenario)\//,
  /(^|\/)src\/core\/(world|fixtures|fixture-boot)\.ts$/, /(^|\/)src\/pages\/[^/]+\/(.*\/)?(fixtures|.*-fixtures|world)\.ts$/,
  /(^|\/)src\/pages\/demo\//, /(^|\/)src\/kit\/gallery\//, /\.scenario\.tsx?$/, /\.vectors\.ts$/, /\.fixture\.tsx?$/,
];
export const isFixtureRoot = (id: string): boolean => !/\.d\.ts$/.test(id) && (isExcluded(id) || ROOT_NAMES.some((re) => re.test(id)));
/** The web app's entry (index.html's module script) and the terminal ship entry. */
export const WEB_ENTRIES: readonly string[] = ['src/app/main.tsx'];
/** The ship entry exports two mounts (build/ship-entry.ts): the live one and the sample account's (entry.demo.ts), so
 *  both are entries; a fixture root stays refused under either. The JSX runtimes count as entries: the transform imports them into every component, no source line does. That
 *  includes the classic factory the loader uses for a file Bun's automatic JSX refuses (a key after a spread,
 *  loader.ts transpile()): a test importing it directly must not make it fixture-only. */
export const TERM_ENTRIES: readonly string[] = ['src/term/entry.live.ts', 'src/term/entry.demo.ts', 'src/term/jsx/jsx-runtime.ts', 'src/term/jsx/jsx-dev-runtime.ts', 'src/term/jsx/classic.ts'];

export interface FixtureGraph { roots: string[]; fixtureOnly: Set<string>; live: Set<string> }

export function fixtureGraph(hub: string, o: { webEntries?: readonly string[]; termEntries?: readonly string[]; scan?: ScanConfig } = {}): FixtureGraph {
  hub = path.resolve(hub);
  const all: string[] = [];
  walk(path.join(hub, 'src'), all);
  const res = new ModuleResolver(hub, new Set(all));
  const code = all.filter((a) => CODE.test(a));
  const id = (abs: string): string => path.relative(hub, abs).split(path.sep).join('/');
  const ids = new Set(code.map(id));
  const cfg: ScanConfig = o.scan ?? { globals: readStrictGlobals(null) };
  const factsMemo = new Map<string, FileFacts | null>();
  const facts = (m: string): FileFacts | null => {
    if (!factsMemo.has(m)) { try { factsMemo.set(m, scanFile(path.join(hub, m), fs.readFileSync(path.join(hub, m), 'utf8'), cfg)); } catch { factsMemo.set(m, null); } }
    return factsMemo.get(m)!;
  };
  const globRe = (p: string): RegExp => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.') + '$');
  type Mode = 'web' | 'term';
  const edgeMemo = new Map<string, string[]>();
  const edges = (mode: Mode, m: string): string[] => {
    const key = mode + '|' + m;
    const hit = edgeMemo.get(key);
    if (hit) return hit;
    const out = new Set<string>();
    const f = facts(m);
    const from = path.join(hub, m);
    const resolve = (spec: string): Target => (mode === 'web' ? res.resolve(spec, from) : res.resolveTerm(spec, from));
    const addId = (t: string): void => {
      if (!ids.has(t)) return;
      out.add(t);
      // '@core' is the fixture barrel in tsconfig and vite (a build folds its dev-only part); the live barrel it
      // re-exports is what a build ships, so the edge reaches it too (the fixture barrel stays a root).
      if (t === CORE_FIXTURE_BARREL) out.add(CORE_LIVE_BARREL);
    };
    const add = (spec: string): void => { const t = resolve(spec); if (t.kind === 'file') addId(id(t.file)); };
    for (const imp of f?.imports ?? []) {
      if (imp.kind !== 'glob') { add(imp.spec); continue; }
      const dir = path.dirname(from);
      const pos = (imp.patterns ?? []).filter((p) => !p.startsWith('!')).map((p) => globRe(path.resolve(dir, p)));
      const neg = (imp.patterns ?? []).filter((p) => p.startsWith('!')).map((p) => globRe(path.resolve(dir, p.slice(1))));
      for (const a of code) {
        if (!pos.some((r) => r.test(a)) || neg.some((r) => r.test(a))) continue;
        const sib = mode === 'term' ? res.siblingOf(a) : null;
        addId(id(sib ?? a));
      }
    }
    for (const r of f?.reexports ?? []) add(r.spec);
    for (const s of f?.stars ?? []) add(s.spec);
    const list = [...out].sort();
    edgeMemo.set(key, list);
    return list;
  };
  const roots = [...ids].filter(isFixtureRoot).sort();
  const rootSet = new Set(roots);
  const closure = (mode: Mode, start: Iterable<string>, enter: (m: string) => boolean): Set<string> => {
    const seen = new Set<string>();
    const todo = [...start].filter((m) => ids.has(m) && enter(m));
    while (todo.length) {
      const m = todo.pop()!;
      if (seen.has(m)) continue;
      seen.add(m);
      for (const t of edges(mode, m)) if (!seen.has(t) && enter(t)) todo.push(t);
    }
    return seen;
  };
  const notRoot = (m: string): boolean => !rootSet.has(m);
  const live = new Set([...closure('web', o.webEntries ?? WEB_ENTRIES, notRoot), ...closure('term', o.termEntries ?? TERM_ENTRIES, notRoot)]);
  const reach = new Set([...closure('web', roots, () => true), ...closure('term', roots, () => true)]);
  const fixtureOnly = new Set([...roots, ...[...reach].filter((m) => !live.has(m))]);
  return { roots, fixtureOnly, live };
}
