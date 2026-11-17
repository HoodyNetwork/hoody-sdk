// The terminal Hub's module-graph analyser and coverage board. For every module, kit export and page it says whether
// it runs in the terminal as shared code, needs a `.term` sibling (and which file), or already has one; it orders the
// sibling files to write (the work-list) and, with --check, enforces R1-R6 (scripts/term/graph/rules.ts).
//
//   bun hub/scripts/term/graph.ts [--json out.json] [--md out.md] [--check] [--rules R1,R2] [--no-R3]
//                                 [--update-baseline] [--baseline file] [--seams file] [--hub dir]
//                                 [--css-modules-ok] [--top 40] [--quiet] [--allow-growth]
//
// --update-baseline only LOWERS the ratchet (drops gone entries); new entries keep failing. --allow-growth records them
// too and prints each (a reviewed exception, never routine).
//
// Re-reads the whole tree every run (no cache): new siblings show up as soon as they exist.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { listSources, ModuleGraph, scanAll } from './graph/build';
import type { FileFacts } from './graph/scan';
import { analyse, type AnalyseOptions, type Analysis } from './graph/analyse';
import { readStrictGlobals, readStringArray } from './graph/scan';
import { ALL_RULES, BASELINE_DOC, measure, parseBaseline, runRules, type Baseline, type Finding, type RuleId } from './graph/rules';
import { kitSummary, renderMd } from './graph/report';

export interface RunOptions {
  hub: string;
  json?: string;
  md?: string;
  check?: boolean;
  rules?: RuleId[];
  updateBaseline?: boolean;
  baseline?: string;
  /** Extra hand-off names for synthetic tests; the real list is derived (graph/handoffs.ts). */
  handoffNames?: string[];
  seams?: string;
  cssModulesOk?: boolean;
  top?: number;
  quiet?: boolean;
  /** With updateBaseline: also record NEW entries (the only way the ratchet grows; prints each). */
  allowGrowth?: boolean;
  /** Overrides for fixtures. */
  shellEntries?: string[];
  termEntries?: string[];
}

export interface RunResult { analysis: Analysis; findings: Finding[] | null; exitCode: number; graph: ModuleGraph; ms: number }

const HERE = path.dirname(new URL(import.meta.url).pathname);
const readOpt = (f: string) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
/** WEB_ONLY_PACKAGES of the terminal resolver (scripts/term/resolve.ts), so the graph and the build agree. */
const readWebPackages = (hub: string) => readStringArray(readOpt(path.join(hub, 'scripts/term/resolve.ts')), 'WEB_ONLY_PACKAGES');

/** run() with the parse spread over worker threads (the CLI path). */
export async function runParallel(o: RunOptions & { workers?: number }): Promise<RunResult> {
  const t0 = performance.now();
  const globals = readStrictGlobals(readOpt(path.join(path.resolve(o.hub), 'src/term/env/strict-globals.ts')));
  const workers = o.workers ?? Math.max(1, Math.min(4, os.availableParallelism() - 1));
  const webPackages = readWebPackages(path.resolve(o.hub));
  const pre = await scanAll(listSources(o.hub).runtime, { globals, ...(webPackages ? { webPackages } : {}) }, workers);
  return run(o, pre, t0);
}

export function run(o: RunOptions, prescanned?: ReadonlyMap<string, FileFacts>, started?: number): RunResult {
  const t0 = started ?? performance.now();
  const hub = path.resolve(o.hub);
  const baselinePath = o.baseline ?? path.join(HERE, 'graph', 'baseline.json');
  const seams = (JSON.parse(readOpt(o.seams ?? path.join(HERE, 'graph', 'seams.json')) ?? '{"files":[]}') as { files?: string[] }).files ?? [];
  const globals = readStrictGlobals(readOpt(path.join(hub, 'src/term/env/strict-globals.ts')));
  const webPackages = readWebPackages(hub);
  const g = new ModuleGraph({ hub, scan: { globals, ...(webPackages ? { webPackages } : {}) }, handoff: new Set(), ...(prescanned ? { prescanned } : {}) });
  const contractText = readOpt(path.join(hub, 'src/term/kit/contract.names.gen.ts'));
  const contract = contractText
    ? {
      components: [...(readStringArray(contractText, 'WEB_COMPONENTS') ?? []), ...(readStringArray(contractText, 'GENERIC_COMPONENTS') ?? [])],
      hooks: readStringArray(contractText, 'WEB_HOOKS') ?? [],
      values: readStringArray(contractText, 'WEB_VALUES') ?? [],
    }
    : null;
  const ao: AnalyseOptions = {
    cssModulesOk: o.cssModulesOk ?? false,
    barrel: 'src/kit/index.ts',
    pagesDir: 'src/pages',
    shellEntries: o.shellEntries ?? ['src/shell/AppShell.tsx', 'src/shell/LockRoot.tsx'],
    termEntries: o.termEntries ?? ['src/term/entry.ts'],
    // Hand-offs are derived from the code (graph/handoffs.ts); these stay empty outside synthetic tests.
    handoffNames: o.handoffNames ?? [],
    handoffFiles: [],
    seams,
    passThrough: ['src/pages/', 'src/shell/'],
    kitImpure: readStringArray(readOpt(path.join(hub, 'vite.config.mts')), 'KIT_IMPURE'),
    contract,
  };
  const a = analyse(g, ao);
  let findings: Finding[] | null = null;
  let exitCode = 0;
  let baseline: Baseline | null = null;
  let baselineError: string | undefined;
  try { baseline = parseBaseline(readOpt(baselinePath)); } catch (e) { baselineError = `${baselinePath}: ${(e as Error).message}`; }
  if (o.check) {
    findings = runRules(g, a, new Set(o.rules ?? ALL_RULES), baseline, undefined, baselineError);
    if (findings.some((f) => f.severity === 'error')) exitCode = 1;
  }
  // The ratchet only shrinks: --update-baseline drops what is gone and NEVER records anything new (a new web-only edge
  // or raw site keeps failing until it is fixed). Recording growth needs --allow-growth on top, which prints every
  // added entry for review.
  const grown: string[] = [];
  let lowered = 0;
  if (o.updateBaseline) {
    const m = measure(g, a);
    const keep = (cur: string[], old: string[] | undefined, kind: string): string[] => {
      if (!old) return cur;
      const was = new Set(old);
      const added = cur.filter((x) => !was.has(x));
      for (const x of added) grown.push(`${kind} ${x}`);
      return o.allowGrowth ? cur : cur.filter((x) => was.has(x));
    };
    const next = {
      version: 2 as const, _doc: BASELINE_DOC,
      webOnlyEdges: keep(m.webOnlyEdges, baseline?.webOnlyEdges, 'web-only edge'),
      rawSites: keep(m.rawSites, baseline?.rawSites, 'raw element site'),
      excludedEdges: keep(m.excludedEdges, baseline?.excludedEdges, 'excluded edge'),
    };
    fs.writeFileSync(baselinePath, JSON.stringify(next, null, 1) + '\n');
    if (grown.length && !o.allowGrowth) exitCode = 1;
    const size = (b: { webOnlyEdges: string[]; rawSites: string[]; excludedEdges: string[] } | null): number => (b ? b.webOnlyEdges.length + b.rawSites.length + b.excludedEdges.length : 0);
    lowered = size(baseline) - size(next) + (o.allowGrowth ? grown.length : 0);
    // Judge against what was just written (always: an update prints what remains), so the printed check is the
    // tree's state now, never the stale lines from before the write.
    findings = runRules(g, a, new Set(o.rules ?? ALL_RULES), next, undefined, undefined);
    exitCode = findings.some((f) => f.severity === 'error') || (grown.length && !o.allowGrowth) ? 1 : 0;
  }
  const ms = Math.round(performance.now() - t0);
  const runtime = g.runtimeIds();
  const meta = {
    generatedAt: new Date().toISOString(), hub, ms, runtime: runtime.length,
    excluded: [...g.mods.values()].filter((m) => m.excluded).length,
    siblings: runtime.filter((id) => g.mods.get(id)!.isSibling).length,
    command: 'bun hub/scripts/term/graph.ts' + (o.cssModulesOk ? ' --css-modules-ok' : ''), top: o.top ?? 40,
  };
  if (o.json) {
    const out = {
      meta, options: ao, kitSummary: kitSummary(a), kitSafeIfCssModulesTranslate: a.kitSafeIfCssModulesTranslate,
      totals: {
        modules: Object.values(a.modules).filter((m) => !m.isSibling).reduce<Record<string, number>>((acc, m) => ((acc[m.class] = (acc[m.class] ?? 0) + 1), acc), {}),
        sites: a.sites, blockedSites: a.blockedSites, worklist: a.worklist.length, cssOnly: a.cssOnly.length,
      },
      worklist: a.worklist, kit: a.kit, pages: a.pages, shell: a.shell, termEntry: a.termEntry, barrel: a.barrel,
      surprises: { fixInPlace: a.fixInPlace, trapped: a.trapped, moduleScope: a.moduleScope, cssOnly: a.cssOnly, emptyKept: a.emptyKept, excludedEdges: a.excludedEdges, unresolved: a.unresolved, unresolvedNames: a.unresolvedNames, typeofGuards: a.typeofGuards, webOnlySiblings: a.webOnlySiblings, contractDrift: a.contractDrift, handoffs: a.handoffs, handoffCheck: a.handoffCheck },
      modules: a.modules, check: findings,
    };
    fs.writeFileSync(o.json, JSON.stringify(out, null, 1) + '\n');
  }
  if (o.md) fs.writeFileSync(o.md, renderMd(a, meta, findings));
  if (!o.quiet) {
    const ks = kitSummary(a);
    console.log(`graph: ${runtime.length} modules, ${meta.siblings} siblings, ${ms} ms; kit shared: ${ks.component.shared} components, ${ks.hook.shared} hooks, ${ks.value.shared} values; work-list ${a.worklist.length} files; pages native-ready ${Object.values(a.pages).filter((p) => p.status === 'native-ready').length}/${Object.keys(a.pages).length}`);
    if (findings) {
      for (const f of findings) if (f.severity !== 'info') console.log(`${f.severity === 'error' ? 'ERROR' : 'warn '} ${f.rule} ${f.message}`);
      const n = (s: string) => findings!.filter((f) => f.severity === s).length;
      console.log(`check: ${n('error')} errors, ${n('warn')} warnings, ${n('info')} notes`);
    }
    if (o.updateBaseline) console.log(`baseline written: ${baselinePath}: lowered by ${lowered} entries; remaining: ${findings?.filter((f) => f.severity === 'error').length ?? 0} errors (the check above is against the new baseline)`);
  }
  // Growth is printed even with --quiet: it is the thing a reviewer must read.
  if (grown.length) {
    console.log(o.allowGrowth ? `baseline GREW by ${grown.length} (recorded with --allow-growth; review each):` : `baseline NOT raised: ${grown.length} new entries stay failing (fix them; recording growth needs --allow-growth, reviewed):`);
    for (const x of grown) console.log(`  + ${x}`);
  }
  // --quiet still says why it failed.
  if (o.quiet && exitCode !== 0 && findings) for (const f of findings) if (f.severity === 'error') console.log(`ERROR ${f.rule} ${f.message}`);
  return { analysis: a, findings, exitCode, graph: g, ms };
}

function parseArgs(argv: string[]): RunOptions {
  const o: RunOptions = { hub: path.resolve(HERE, '..', '..') };
  const rules = new Set<RuleId>(ALL_RULES);
  let only: RuleId[] | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === '--json') o.json = path.resolve(val());
    else if (a === '--md') o.md = path.resolve(val());
    else if (a === '--check') o.check = true;
    else if (a === '--update-baseline') o.updateBaseline = true;
    else if (a === '--baseline') o.baseline = path.resolve(val());
    else if (a === '--seams') o.seams = path.resolve(val());
    else if (a === '--hub') o.hub = path.resolve(val());
    else if (a === '--css-modules-ok') o.cssModulesOk = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--allow-growth') o.allowGrowth = true;
    else if (a === '--top') o.top = Number(val());
    else if (a === '--rules') only = val().split(',').map((r) => r.trim().toUpperCase() as RuleId);
    else if (/^--no-R[1-6]$/i.test(a)) rules.delete(a.slice(5).toUpperCase() as RuleId);
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 9).join('\n')); process.exit(0); }
    else throw new Error(`unknown argument ${a}`);
  }
  for (const r of only ?? []) if (!ALL_RULES.includes(r)) throw new Error(`unknown rule ${r}`);
  o.rules = (only ?? [...rules]).filter((r) => rules.has(r));
  return o;
}

if (import.meta.main) {
  try {
    const r = await runParallel(parseArgs(process.argv.slice(2)));
    process.exit(r.exitCode);
  } catch (e) {
    console.error('graph: ' + (e instanceof Error ? e.message : String(e)));
    process.exit(2);
  }
}
