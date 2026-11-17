// The build-failing rules of the terminal module graph (`graph.ts --check`). Each one is switchable and prints what to
// do. R1 sibling hygiene, R2 sibling exports = base exports, R3 web-only edges (identified-site ratchet), R4 raw-element
// sites (identified-site ratchet), R5 OpenTUI only under src/term/prim/, R6 graph integrity (errors: unresolved imports
// and names, web-only siblings, handoff inconsistencies, contract drift; run-time imports of test/fixture files are an
// identified-site ratchet, because the web design folds them away at build time and build.ts checks the artifact),
// R7 refused code (no ratchet, never baselined): code from a string (`new Function`, `Function()`, `eval()`), `import()` or
// `require()` of a computed specifier, and a non-web module re-exporting react-aria / react-stately (web-only packages
// reached through a shared module's names). createElement('box') and runtime imports of prim/otui count as R5.
//
// Ratchets (R3, R4) record IDENTIFIED sites, never totals: removing one offender and adding another fails. A site not in
// the baseline is an error; a baseline entry that no longer occurs is an error too until --update-baseline records the
// decrease; a missing or unreadable baseline is an error. The walk is the COMPLETE reachable terminal graph of each
// entry: it goes on through web-only modules, so an earlier blocker never hides the debt behind it.
import type { ModuleGraph } from './build';
import type { Analysis } from './analyse';

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';
export const ALL_RULES: readonly RuleId[] = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'];
/** react-aria and react-stately, any entry: web-only, and a shared module re-exporting them hands them to the terminal. */
const ARIA_PACKAGE = /^(react-aria|react-aria-components|react-stately)(\/|$)|^@react-(aria|stately|types)\//;

export interface Finding { rule: RuleId; severity: 'error' | 'warn' | 'info'; file?: string; message: string }

/** Baseline format v2. Sorted arrays of site ids. */
export interface Baseline {
  version: 2;
  _doc?: string;
  /** "<entry>|<importer> -> <web-only module>": an import edge, in the complete terminal graph of entry ('term-entry',
   *  'shell', 'page:<id>'), that reaches a web-only module the terminal runs. */
  webOnlyEdges: string[];
  /** "<file>#<tag>#<n>": the n-th raw intrinsic <tag> element of the module the terminal runs (n from 1; not a line
   *  number, so an edit above does not churn the list). */
  rawSites: string[];
  /** "<importer> -> <excluded file>": a run-time import of a test/fixture file in the complete terminal graph. The web
   *  build folds these away (__HUB_FIXTURES__ = false + its dev-only side-effect rule); the ship build's artifact
   *  check (scripts/term/build.ts) is the hard gate; this list keeps new ones from appearing unseen. */
  excludedEdges: string[];
}

export const BASELINE_DOC = 'Terminal graph ratchet v2 (scripts/term/graph/rules.ts): identified web-only import edges per entry and raw intrinsic element sites per file. A site not listed fails --check; a listed site that is gone fails until `bun scripts/term/graph.ts --update-baseline` records the decrease. Never hand-edit to add a site: fix the import, or update in a reviewed change.';

interface Entry { key: string; starts: string[] }

function entriesOf(a: Analysis): Entry[] {
  const out: Entry[] = [{ key: 'term-entry', starts: a.termEntry.entry }, { key: 'shell', starts: a.shell.entry }];
  for (const [p, e] of Object.entries(a.pages)) out.push({ key: 'page:' + p, starts: e.entry });
  return out;
}

export interface Reach {
  visited: Set<string>;
  edges: { from: string; to: string; line: number }[];
  excluded: { from: string; to: string; line: number }[];
  unresolved: { from: string; spec: string; line: number }[];
  unresolvedNames: { from: string; spec: string; name: string; line: number }[];
}

/** The complete reachable terminal graph from `starts`: never stops at a web-only module. */
export function reachAll(g: ModuleGraph, starts: readonly string[]): Reach {
  const r: Reach = { visited: new Set(), edges: [], excluded: [], unresolved: [], unresolvedNames: [] };
  const queue = [...starts];
  while (queue.length) {
    const id = queue.pop()!;
    if (r.visited.has(id)) continue;
    r.visited.add(id);
    const m = g.mods.get(id);
    if (!m || m.excluded || !m.facts) continue;
    const e = g.edges('term', id);
    for (const x of e.edges) { r.edges.push({ from: id, to: x.to, line: x.line }); queue.push(x.to); }
    for (const x of e.excludedTargets) r.excluded.push({ from: id, to: x.to, line: x.line });
    for (const x of e.unresolved) r.unresolved.push({ from: id, spec: x.spec, line: x.line });
    for (const x of e.unresolvedNames) r.unresolvedNames.push({ from: id, ...x });
  }
  return r;
}

const webOnly = (a: Analysis, id: string): boolean => a.modules[id]?.class === 'web-only';

/** The identified sites of the current tree (what --update-baseline writes). */
export function measure(g: ModuleGraph, a: Analysis): Baseline {
  const edges = new Set<string>();
  const raw = new Set<string>();
  const excluded = new Set<string>();
  const ran = new Set<string>();
  for (const en of entriesOf(a)) {
    const r = reachAll(g, en.starts);
    for (const e of r.edges) if (webOnly(a, e.to)) edges.add(`${en.key}|${e.from} -> ${e.to}`);
    for (const x of r.excluded) excluded.add(`${x.from} -> ${x.to}`);
    for (const v of r.visited) ran.add(v);
  }
  for (const id of ran) {
    const m = g.mods.get(id);
    if (!m?.facts || m.excluded) continue;
    for (const [tag, n] of Object.entries(m.facts.raw)) for (let i = 1; i <= n; i++) raw.add(`${id}#${tag}#${i}`);
  }
  return { version: 2, webOnlyEdges: [...edges].sort(), rawSites: [...raw].sort(), excludedEdges: [...excluded].sort() };
}

/** Reads a baseline file's text: null = missing; throws on an unreadable or old-format file. */
export function parseBaseline(text: string | null): Baseline | null {
  if (text === null) return null;
  const j = JSON.parse(text) as Partial<Baseline> & { version?: number };
  if (j.version !== 2 || !Array.isArray(j.webOnlyEdges) || !Array.isArray(j.rawSites) || !Array.isArray(j.excludedEdges)) throw new Error('TERM_BASELINE_FORMAT: graph baseline is not v2 ({version: 2, webOnlyEdges: [], rawSites: [], excludedEdges: []}); run --update-baseline');
  return j as Baseline;
}

export function runRules(g: ModuleGraph, a: Analysis, rules: ReadonlySet<RuleId>, baseline: Baseline | null, primDir = 'src/term/prim/', baselineError?: string): Finding[] {
  const out: Finding[] = [];
  if (rules.has('R1')) {
    for (const m of g.mods.values()) {
      if (m.excluded) continue;
      if (m.isSibling && !m.base) {
        out.push({ rule: 'R1', severity: 'error', file: m.id, message: `${m.id} is a .term sibling with no base file (${m.id.replace(/\.term\.(tsx?)$/, '.ts')} or .tsx): the resolver never selects it. Rename it to the file it replaces, or drop the .term suffix if it is terminal-only code.` });
      }
      if (m.isSibling && m.base && m.facts) {
        for (const imp of m.facts.imports) {
          const runtime = imp.kind !== 'named' || imp.names.length > 0;
          if (!runtime || imp.kind === 'glob') continue;
          const t = g.resolveSpec('web', imp.spec, m.id);
          if (t.kind === 'file' && t.file === m.base) out.push({ rule: 'R1', severity: 'error', file: m.id, message: `${m.id}:${imp.line} value-imports its own web twin ${m.base} ('${imp.spec}'): the terminal resolver refuses it (TERM_TWIN_VALUE_IMPORT, scripts/term/resolve.ts). Import types only, or move what you need to a module both import.` });
        }
      }
      if (m.sibling) {
        const mo = a.modules[m.id];
        if (mo && mo.reasons.length === 0 && !isHandoffBase(a, m.id) && !drawsHandoff(g.mods.get(m.sibling))) {
          out.push({ rule: 'R1', severity: 'warn', file: m.sibling, message: `${m.sibling} replaces ${m.id}, which is not web-only (no CSS, web package, browser global or DOM member): the base already runs in the terminal. Delete the sibling, or note why it must differ.` });
        }
      }
    }
  }
  if (rules.has('R2')) {
    for (const m of g.mods.values()) {
      if (m.excluded || !m.isSibling || !m.base) continue;
      const base = runtimeNames(g, 'web', m.base);
      const sib = runtimeNames(g, 'term', m.id);
      const missing = [...base].filter((n) => !sib.has(n)).sort();
      const extra = [...sib].filter((n) => !base.has(n)).sort();
      if (missing.length || extra.length) {
        out.push({ rule: 'R2', severity: 'error', file: m.id, message: `${m.id} must export the same runtime names as ${m.base}.` + (missing.length ? ` Missing: ${missing.join(', ')} (implement them; for pure helpers move them to a module both files import: a sibling may not value-import its own web twin).` : '') + (extra.length ? ` Extra: ${extra.join(', ')} (move terminal-only helpers to a file without the .term suffix).` : '') });
      }
    }
  }
  if (rules.has('R3') || rules.has('R4') || rules.has('R6')) {
    if (!baseline) {
      for (const rule of (['R3', 'R4', 'R6'] as const).filter((r) => rules.has(r))) out.push({ rule, severity: 'error', message: baselineError ?? 'no graph baseline (scripts/term/graph/baseline.json): run `bun scripts/term/graph.ts --update-baseline` in a reviewed change.' });
    } else {
      const cur = measure(g, a);
      const diff = (rule: RuleId, now: string[], was: string[], what: string, hint: (site: string) => string) => {
        const before = new Set(was);
        const after = new Set(now);
        if (rule === 'R3') {
          // One finding per new edge, naming every entry that reaches it (not one per entry).
          const byEdge = new Map<string, string[]>();
          for (const s of now) if (!before.has(s)) { const i = s.indexOf('|'); const e = s.slice(i + 1); byEdge.set(e, [...(byEdge.get(e) ?? []), s.slice(0, i)]); }
          for (const [e, entries] of byEdge) out.push({ rule, severity: 'error', file: e.split(' -> ')[0], message: `new ${what}: ${e} (from ${entries.slice(0, 4).join(', ')}${entries.length > 4 ? ` +${entries.length - 4}` : ''}). ${hint(`${entries[0]}|${e}`)}` });
        } else for (const s of now) if (!before.has(s)) out.push({ rule, severity: 'error', file: s.split('#')[0]?.split(' -> ')[0], message: `new ${what}: ${s}. ${hint(s)}` });
        const gone = was.filter((s) => !after.has(s));
        if (gone.length) out.push({ rule, severity: 'error', message: `${gone.length} recorded ${what}${gone.length === 1 ? ' is' : 's are'} gone (${gone.slice(0, 5).join('; ')}${gone.length > 5 ? '; ...' : ''}): record the decrease with \`bun scripts/term/graph.ts --update-baseline\`.` });
      };
      if (rules.has('R3')) diff('R3', cur.webOnlyEdges, baseline.webOnlyEdges, 'web-only edge', (site) => r3Hint(site, a));
      if (rules.has('R4')) diff('R4', cur.rawSites, baseline.rawSites, 'raw element site', (s) => `Use the terminal prims / kit components instead of raw elements in ${s.split('#')[0]}, or write a .term sibling for that file.`);
      if (rules.has('R6')) diff('R6', cur.excludedEdges, baseline.excludedEdges, 'run-time import of a test/fixture file', () => 'Keep fixtures behind the fixture entry (src/term/entry.fixture.ts) or a __HUB_FIXTURES__ branch the ship build folds away.');
    }
  }
  // R3, the hand-off wrapper form: `<Handoff>{<WebPart/>}</Handoff>` in a shared file. The terminal Handoff never draws
  // its children, but the value import of the web part still loads it (and its web-only closure) in the terminal and the
  // ship build. Not a ratchet: every such import fails until it moves into a .web file.
  if (rules.has('R3')) {
    for (const m of g.mods.values()) {
      if (m.excluded || !m.facts?.handoffOnly?.length || m.isSibling || /\.web\.(tsx?|mts)$/.test(m.id)) continue;
      for (const h of m.facts.handoffOnly) {
        const t = g.resolveSpec('web', h.spec, m.id);
        const web = t.kind === 'file' ? webOnly(a, t.file) : g.isWebPackage(h.spec);
        if (!web) continue;
        out.push({ rule: 'R3', severity: 'error', file: m.id, message: `${m.id}:${h.line} imports ${h.local} ('${h.spec}', web-only) only to pass it as <Handoff> children: the terminal Handoff never draws them, yet the import loads the module in the terminal and the ship build. Move the import and the JSX that uses it into a .web.tsx file (with a .web.term.tsx neighbour that renders nothing), or give the part its own component with a .term sibling.` });
      }
    }
  }
  if (rules.has('R5')) {
    for (const m of g.mods.values()) {
      if (m.excluded || !m.facts || m.id.startsWith(primDir)) continue;
      for (const t of m.facts.opentuiTags) out.push({ rule: 'R5', severity: 'error', file: m.id, message: `${m.id}:${t.line} uses the OpenTUI intrinsic <${t.tag}>; only ${primDir}** may. Use a prim from ${primDir} (or a kit component).` });
      for (const t of m.facts.opentuiImports) out.push({ rule: 'R5', severity: 'error', file: m.id, message: `${m.id}:${t.line} imports ${t.spec}; only ${primDir}** may. Wrap what you need in a prim under ${primDir}.` });
    }
  }
  if (rules.has('R7')) {
    for (const m of g.mods.values()) {
      if (m.excluded || !m.facts) continue;
      for (const f of m.facts.forbidden ?? []) out.push({ rule: 'R7', severity: 'error', file: m.id, message: `${m.id}:${f.line} uses ${f.what}. The terminal graph, the strict loader and the ship build follow only literal imports; write a literal import (a map of literal import() calls for a choice), never build code at run time.` });
      if (/\.web\.(tsx?|mts)$/.test(m.id)) continue;
      for (const r of [...m.facts.reexports.filter((x) => !x.type), ...m.facts.stars]) {
        if (ARIA_PACKAGE.test(r.spec)) out.push({ rule: 'R7', severity: 'error', file: m.id, message: `${m.id}:${r.line} re-exports '${r.spec}' (web-only) from a shared module, so every importer reaches it in the terminal. Import it where it is used (a .web.ts file or a component with a .term sibling) instead of re-exporting it.` });
      }
    }
  }
  if (rules.has('R6')) {
    const seen = new Set<string>();
    const once = (f: Finding) => { const k = f.message; if (!seen.has(k)) { seen.add(k); out.push(f); } };
    for (const en of entriesOf(a)) {
      const r = reachAll(g, en.starts);
      for (const x of r.unresolved) once({ rule: 'R6', severity: 'error', file: x.from, message: `${x.from}:${x.line} imports '${x.spec}', which does not resolve in the terminal build (reached from ${en.key}).` });
      for (const x of r.unresolvedNames) once({ rule: 'R6', severity: 'error', file: x.from, message: `${x.from}:${x.line} imports ${x.name} from '${x.spec}', which the terminal module does not export (reached from ${en.key}).` });
    }
    for (const s of a.webOnlySiblings) once({ rule: 'R6', severity: 'error', file: s, message: `${s} is a terminal sibling but is itself web-only (CSS, web package, browser global or DOM member).` });
    for (const h of a.handoffCheck) once({ rule: 'R6', severity: 'error', message: `hand-off: ${h}` });
    for (const n of a.contractDrift.notInContract) once({ rule: 'R6', severity: 'error', message: `kit barrel exports ${n}, which src/term/kit/contract.names.gen.ts does not list (regenerate the contract names).` });
    for (const n of a.contractDrift.notInBarrel) once({ rule: 'R6', severity: 'error', message: `src/term/kit/contract.names.gen.ts lists ${n}, which the kit barrel no longer exports (regenerate the contract names).` });
  }
  return out;
}

/** A sibling that draws the kit Handoff (a hand-off for what it replaces) or IS the terminal Handoff (the stand-in):
 *  replacing a base that is not web-only is its purpose. */
function drawsHandoff(m: { facts: { drawsHandoff?: boolean; locals: { name: string }[] } | null } | undefined): boolean {
  return !!m?.facts && (!!m.facts.drawsHandoff || m.facts.locals.some((l) => l.name === 'Handoff'));
}

function isHandoffBase(a: Analysis, id: string): boolean {
  return a.kit.some((k) => k.status === 'handoff' && k.file === id);
}

function runtimeNames(g: ModuleGraph, mode: 'web' | 'term', id: string): Set<string> {
  return new Set([...g.exportsOf(mode, id)].filter(([, k]) => k === 'value').map(([n]) => n));
}

/** What to do about a new web-only edge (`entry|importer -> target`), from what makes the target web-only. A target
 *  that is itself a .term sibling needs fixing in place (a sibling has no sibling); a global read goes through hostEnv(). */
export function r3Hint(site: string, a: Pick<Analysis, 'modules'>): string {
  const edge = site.slice(site.indexOf('|') + 1);
  const [importer, target] = edge.split(' -> ') as [string, string | undefined];
  if (!target) return 'A terminal module now imports a web-only module: import a terminal-safe module instead.';
  const why = (a.modules[target]?.reasons ?? []).slice(0, 3).map((r) => `${r.kind === 'global' || r.kind === 'dom-member' ? `reads ${r.detail}` : r.kind === 'package' ? `imports ${r.detail}` : r.detail || r.kind}${r.lines.length ? ` (line ${r.lines.slice(0, 3).join(', ')})` : ''}`).join('; ');
  const because = why ? ` ${target} ${why}.` : '';
  const global = (a.modules[target]?.reasons ?? []).some((r) => r.kind === 'global' || r.kind === 'dom-member');
  if (/\.term\.tsx?$/.test(target)) return `${importer} reaches ${target}, a terminal sibling that is web-only itself.${because} Fix it in ${target}${global ? ' (read the host through hostEnv(), src/term/env)' : ''}; a sibling has no sibling.`;
  return `${importer} (terminal) imports ${target}, which is web-only.${because} ${global ? `Read the host through hostEnv() in ${target} if the read is all that blocks it, else write` : 'Write'} ${target.replace(/\.(tsx?)$/, '.term.$1')}, or import a terminal-safe module instead.`;
}

