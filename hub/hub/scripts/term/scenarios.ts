#!/usr/bin/env bun
// Shared behaviour scenarios, terminal side (and the reviewer report). From hub/, NODE_ENV=test:
//   bun scripts/term/scenarios.ts [--report] [--json] [--mutants] [--web-results <file.json>] [paths or component names...]
// - runs every src/**/*.scenario.ts (or the ones named) through the terminal driver (src/term/scenario/term-driver.ts);
// - --parity-md <file> (with --report) writes the markdown parity report; see parityMarkdown.
// - --report adds a parity table (per scenario file: term and web passes, owner, cases passing on one side only) and,
//   per component: the contract obligations (contract.ts: unread / ignored / unsupported props), the web
//   side's results when given (--web-results: the JSON the web runner writes, see src/term/docs/scenarios.md), mutants;
// - --mutants: for each prop the sibling reads that a case exercises with an assertion (and each safety prop it reads),
//   a child process loads the sibling with that prop's handling dropped, then flipped (in memory), and runs the
//   scenarios; a mutant no case kills fails the run, and so does a case whose `covers` names a prop its mutant does not
//   fail (covers is a claim).
// Exit 1 when a terminal case fails, a mutant survives (with --mutants), or (with --report) an obligation fails.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import path from 'node:path';
import { noInputs } from './fail-closed';
import fs from 'node:fs';
import { HUB, SRC } from './resolve';
import { installTermLoader } from './loader';
import { addSourceHook, installSemShim, shimmed } from '../../src/term/scenario/source-hooks';

const args = process.argv.slice(2);
const flag = (f: string): boolean => args.includes(f);
const opt = (f: string): string | undefined => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const named = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1]!.startsWith('--') && ['--web-results', '--mutant', '--case', '--override', '--parity-md'].includes(args[i - 1]!)));

// A mutant child: `--mutant <sibling abs path>::<component>::<prop>` (set by the parent; never by hand).
const overridden: string[] = [];
const mutant = opt('--mutant');
if (mutant) {
  const [file, component, prop, mode] = mutant.split('::') as [string, string, string, 'drop' | 'flip' | undefined];
  const { mutateSource } = await import('./contract');
  addSourceHook((f, src) => (f === file ? mutateSource(f, src, component, prop, mode ?? 'drop').code : src));
}
// --override <src-relative path>=<file>: load another text for one source file (try a change to a file you do not own).
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--override') continue;
  const [rel, alt] = args[i + 1]!.split('=') as [string, string];
  const target = path.join(HUB, rel);
  const text = fs.readFileSync(alt, 'utf8');
  overridden.push(rel);
  addSourceHook((f, src) => (f === target ? text : src));
}
installSemShim();
installTermLoader({ flavour: 'dev', fixtures: true });
await import(path.join(SRC, 'term/env/preinstall.ts'));
// Strict globals, as the ship process and render.ts: a sibling's `window.innerWidth` read fails as TERM_GLOBAL naming
// the global (not a ReferenceError per case). TanStack Query's focus/online managers get no window listener (render.ts).
{
  const qc = await import(Bun.resolveSync('@tanstack/query-core', SRC)) as { focusManager: { setEventListener(f: () => undefined): void }; onlineManager: { setEventListener(f: () => undefined): void } };
  qc.focusManager.setEventListener(() => undefined);
  qc.onlineManager.setEventListener(() => undefined);
  const sg = await import(path.join(SRC, 'term/env/strict-globals.ts')) as typeof import('../../src/term/env/strict-globals');
  sg.activeStrictGlobals() ?? sg.installStrictGlobals();
}

const { runScenarioFile, filesOf } = await import('../../src/term/scenario/run');
const { termDriver } = await import('../../src/term/scenario/term-driver');
type FileResult = Awaited<ReturnType<typeof runScenarioFile>>;

export function scenarioFiles(filter: string[] = []): string[] {
  const all = [...new Bun.Glob('**/*.scenario.ts').scanSync(SRC)].map((f) => path.join(SRC, f)).sort();
  if (!filter.length) return all;
  return all.filter((f) => filter.some((n) => f.endsWith(n) || path.basename(f).startsWith(n + '.') || f.includes(n)));
}

async function runTerm(files: string[], component?: string): Promise<Array<FileResult & { file: string }>> {
  const out: Array<FileResult & { file: string }> = [];
  for (const file of files) {
    const mod = await import(file) as { default?: unknown };
    for (const sf of filesOf(mod)) {
      if (component && sf.component !== component) continue;
      out.push({ ...(await runScenarioFile(sf, termDriver())), file: path.relative(HUB, file) });
    }
  }
  return out;
}

const t0 = performance.now();
const files = scenarioFiles(named);
const results = await runTerm(files, mutant?.split('::')[1]);

if (mutant) {
  // Child: one line of JSON for the parent.
  const failed = results.flatMap((r) => r.cases.filter((c) => !c.ok).map((c) => `${r.component}: ${c.name}`));
  process.stdout.write('MUTANT-RESULT ' + JSON.stringify({ killedBy: failed }) + '\n');
  process.exit(0);
}

let bad = 0;
const lines: string[] = [];
// The same first error line in many cases (one global read behind every case) prints in full once, then by reference.
const firstSeen = new Map<string, string>();
for (const r of results) {
  const fails = r.cases.filter((c) => !c.ok);
  bad += fails.length;
  lines.push(`${fails.length ? 'FAIL' : 'ok  '} ${r.component} (${r.file}) term ${r.cases.filter((c) => c.ok && !c.skipped).length}/${r.cases.length}`);
  for (const c of r.cases) {
    if (c.skipped) lines.push(`       skip  ${c.name}: ${c.skipped}`);
    else if (!c.ok) {
      const head = c.error!.split('\n')[0]!;
      const prior = firstSeen.get(head);
      if (prior && !flag('--verbose')) { lines.push(`       FAIL  ${c.name}: same error as ${prior} (${head.slice(0, 160)})`); continue; }
      firstSeen.set(head, `${r.component} "${c.name}"`);
      lines.push(`       FAIL  ${c.name}\n${c.error!.split('\n').slice(0, flag('--verbose') ? 80 : 14).map((l) => '             ' + l).join('\n')}`);
    }
  }
}
if (overridden.length) lines.push(`OVERRIDDEN (not the files on disk): ${overridden.join(', ')}`);
if (shimmed.size) lines.push(`sem shim active: ${[...shimmed].map(([f, p]) => `${f} [${p.join(', ')}]`).join('; ')}`);

// The parity report: one row per scenario file (web and term pass/total, cases skipped on each side with the stated reason),
// totals, then every failing case with its owner and a classification from src/term/scenario/parity-notes.json
// ({ "<file>::<component>::<case>": "component difference | scenario fault | driver limit: <why>" }); a failure with no
// note reads "UNCLASSIFIED". `limits` in the same file lists the drivers' known limits (each with its evidence).
function parityMarkdown(files: string[], ownerOf: (s: string) => string): string {
  type WebRow = { component: string; file?: string; cases: Array<{ name: string; ok: boolean; skipped?: string; error?: string }> };
  const webFiles = args.flatMap((a, i) => (a === '--web-results' && args[i + 1] ? [args[i + 1]!] : []));
  const webMap = new Map<string, WebRow>();
  for (const f of webFiles) for (const w of JSON.parse(fs.readFileSync(f, 'utf8')) as WebRow[]) webMap.set(`${(w.file ?? '').replace(/^\//, '')}::${w.component}`, w);
  const notesFile = path.join(HUB, 'src/term/scenario/parity-notes.json');
  const notes = fs.existsSync(notesFile) ? JSON.parse(fs.readFileSync(notesFile, 'utf8')) as { cases?: Record<string, string>; limits?: string[] } : {};
  const esc = (t: string): string => t.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const out: string[] = [];
  const stamp = new Date().toISOString().slice(0, 16) + 'Z';
  out.push('# Terminal / web parity of the scenario files', '',
    `Generated ${stamp} by \`bun scripts/term/scenarios.ts --report --web-results <json> --parity-md <this file>\`. Both columns come`,
    `from one source state: the web JSON was written by one full web run (${webFiles.map((f) => path.basename(f)).join(', ')}) just before this terminal run.`,
    'Counts are cases PASSING / cases RUN on that side; a case limited to the other side (`only`) is listed under skipped with its stated reason.', '');
  // Same source state: name every scenario / sibling / web file written after the web results (empty = identical inputs).
  const webTime = Math.min(...webFiles.map((f) => fs.statSync(f).mtimeMs));
  const moved = [...new Bun.Glob('**/*.{scenario.ts,term.tsx,term.ts,tsx}').scanSync(SRC)].filter((f) => !/\.(test|spec)\./.test(f) && fs.statSync(path.join(SRC, f)).mtimeMs > webTime).sort();
  out.push(moved.length ? `**Not the same source state:** written after the web results: ${moved.map((f) => '`src/' + f + '`').join(', ')}.` : 'Same source state: no scenario, sibling or web component file was written between the web run and this terminal run.', '',
    '| scenario file | owner | web | term | skipped on web | skipped on term |', '|---|---|---|---|---|---|');
  let wp = 0; let wn = 0; let tp = 0; let tn = 0; let ws = 0; let ts0 = 0;
  const fails: string[] = [];
  const skips: string[] = [];
  for (const f of files) {
    const rs = results.filter((r) => r.file === f);
    const owner = ownerOf(f.replace(/\.scenario\.ts$/, '.term.tsx'));
    const term = rs.flatMap((r) => r.cases.map((c) => ({ comp: r.component, ...c })));
    const web = rs.flatMap((r) => { const w = webMap.get(`${f}::${r.component}`); return w ? w.cases.map((c) => ({ comp: r.component, ...c })) : []; });
    const ran = (xs: typeof term) => xs.filter((c) => !c.skipped);
    const tRun = ran(term); const wRun = ran(web);
    const tSk = term.filter((c) => c.skipped); const wSk = web.filter((c) => c.skipped);
    tp += tRun.filter((c) => c.ok).length; tn += tRun.length; wp += wRun.filter((c) => c.ok).length; wn += wRun.length; ws += wSk.length; ts0 += tSk.length;
    out.push(`| ${f} | ${owner} | ${web.length ? `${wRun.filter((c) => c.ok).length}/${wRun.length}` : 'not run'} | ${tRun.filter((c) => c.ok).length}/${tRun.length} | ${wSk.length || ''} | ${tSk.length || ''} |`);
    for (const [side, xs] of [['web', wSk], ['term', tSk]] as const) for (const c of xs) skips.push(`| ${f} | ${esc(c.comp)}: ${esc(c.name)} | ${side} | ${esc(c.skipped ?? '')} |`);
    for (const [side, xs] of [['web', wRun], ['term', tRun]] as const) for (const c of xs.filter((x) => !x.ok)) {
      const key = `${f}::${c.comp}::${c.name}`;
      fails.push(`| ${side} | ${f} | ${esc(c.comp)}: ${esc(c.name)} | ${owner} | ${esc(notes.cases?.[key] ?? 'UNCLASSIFIED')} | ${esc((c.error ?? '').split('\n')[0]!.slice(0, 160))} |`);
    }
  }
  out.push(`| **TOTAL** (${files.length} files) | | **${wp}/${wn}** | **${tp}/${tn}** | ${ws} | ${ts0} |`, '');
  out.push(`## Failing cases (${fails.length})`, '');
  if (fails.length) out.push('| side | file | case | owner | classification | first error line |', '|---|---|---|---|---|---|', ...fails, ''); else out.push('None.', '');
  out.push('## Driver limits', '', ...(notes.limits ?? ['None recorded.']).map((l) => `- ${l}`), '');
  out.push(`## Skipped cases (${skips.length}), with the reason the scenario states`, '', '| file | case | skipped on | reason |', '|---|---|---|---|', ...skips, '');
  return out.join('\n');
}

let report: unknown = null;
if (flag('--report') || flag('--mutants')) {
  const { reportObligations } = await import('./contract');
  // --web-results may repeat (one JSON per web run); later files win per (file, component).
  type WebRow = { component: string; file?: string; cases: Array<{ name: string; ok: boolean; skipped?: string; error?: string }> };
  const webFiles = args.flatMap((a, i) => (a === '--web-results' && args[i + 1] ? [args[i + 1]!] : []));
  const webMap = new Map<string, WebRow>();
  for (const f of webFiles) for (const w of JSON.parse(fs.readFileSync(f, 'utf8')) as WebRow[]) webMap.set(`${(w.file ?? '').replace(/^\//, '')}::${w.component}`, w);
  const web = webFiles.length ? [...webMap.values()] : null;
  const webOf = (file: string, component: string): WebRow | undefined => webMap.get(`${file}::${component}`) ?? web?.find((x) => x.component === component && !x.file);
  const ob = reportObligations();
  const mut = flag('--mutants') ? await runMutants(ob) : null;
  report = { obligations: ob, web, mutants: mut };
  lines.push('', '== report ==');
  for (const r of results) {
    const o = ob.components.find((c) => c.component === r.component && c.scenario === r.file);
    const w = webOf(r.file, r.component);
    lines.push(`${r.component}  scenarios ${r.cases.length}  term ${r.cases.filter((c) => c.ok).length}/${r.cases.length}  web ${w ? `${w.cases.filter((c) => c.ok).length}/${w.cases.length}` : 'not run'}`);
    if (w) for (const c of w.cases.filter((x) => !x.ok)) lines.push(`    web FAIL ${c.name}: ${(c.error ?? '').split('\n')[0]}`);
    if (o) {
      lines.push(`    unread props: ${o.unread.length ? o.unread.join(', ') : 'none'}${o.unsure.length ? `  (cannot tell: ${o.unsure.join('; ')})` : ''}`);
      lines.push(`    ignored: ${Object.keys(o.ignored).join(', ') || 'none'}`);
      lines.push(`    behavioural not exercised: ${o.uncovered.length ? o.uncovered.join(', ') : 'none'}  unsupported: ${Object.keys(o.unsupported).join(', ') || 'none'}`);
      if (o.staleIgnored.length) lines.push(`    ignored but read (stale entry): ${o.staleIgnored.join(', ')}`);
    }
    const m = mut?.filter((x) => x.component === r.component);
    if (m?.length) for (const x of m) {
      lines.push(`    mutant ${x.prop}: ${x.killedBy.length ? `killed by ${x.killedBy.length} (${x.killedBy[0]})${x.mode === 'flip' ? ' when flipped' : ''}` : x.error ? `ERROR ${x.error}` : `SURVIVED -> add a case to ${r.file} that sets ${x.prop} and expects what it changes (calls, nodes or focus)`}`);
      for (const k of x.coversUnproven ?? []) lines.push(`    covers ${x.prop} UNPROVEN in "${k}": the case passes with ${x.prop} dropped or flipped -> assert what ${x.prop} changes there, or remove it from covers`);
    }
  }
  for (const c of ob.components.filter((x) => !results.some((r) => r.component === x.component))) lines.push(`${c.component}  ${c.scenario ? 'scenario has no terminal result' : 'NO SCENARIO FILE'} (${c.sibling})`);
  if (flag('--report')) {
    // Parity: per scenario FILE, cases passing on each platform and the cases that pass on only one.
    const { ownerOf } = await import('./contract');
    const files = [...new Set(results.map((r) => r.file))].sort();
    const rows: string[][] = [['scenario file', 'owner', 'term', 'web', 'only one side']];
    let tt = 0; let tn = 0; let wt = 0; let wn = 0;
    for (const f of files) {
      const rs = results.filter((r) => r.file === f);
      const term = rs.flatMap((r) => r.cases.filter((c) => !c.skipped).map((c) => ({ k: `${r.component}: ${c.name}`, ok: c.ok })));
      const ws = rs.map((r) => webOf(f, r.component)).filter((x): x is WebRow => !!x);
      const webCases = ws.flatMap((w) => w.cases.filter((c) => !c.skipped).map((c) => ({ k: `${w.component}: ${c.name}`, ok: c.ok })));
      const tp = term.filter((c) => c.ok).length; const wp = webCases.filter((c) => c.ok).length;
      tt += tp; tn += term.length; wt += wp; wn += webCases.length;
      const termOk = new Set(term.filter((c) => c.ok).map((c) => c.k)); const webOk = new Set(webCases.filter((c) => c.ok).map((c) => c.k));
      const odd = ws.length ? [...term.map((c) => c.k), ...webCases.map((c) => c.k)].filter((k, i, a) => a.indexOf(k) === i && termOk.has(k) !== webOk.has(k)).length : 0;
      const sib = f.replace(/\.scenario\.ts$/, '.term.tsx');
      rows.push([f, ownerOf(sib), `${tp}/${term.length}`, ws.length ? `${wp}/${webCases.length}` : 'not run', ws.length ? String(odd) : '-']);
    }
    rows.push(['TOTAL', '', `${tt}/${tn}`, wn ? `${wt}/${wn}` : 'not run', '']);
    const mdOut = opt('--parity-md');
    if (mdOut) fs.writeFileSync(mdOut, parityMarkdown(files, ownerOf));
    const wid = rows[0]!.map((_c, i) => Math.max(...rows.map((r) => r[i]!.length)));
    lines.push('', '== parity (cases passing; skipped cases left out) ==', ...rows.map((r) => r.map((c, i) => c.padEnd(wid[i]!)).join('  ').trimEnd()));
    bad += ob.failing;
  }
  if (mut) bad += mut.filter((x) => !x.killedBy.length || x.coversUnproven?.length).length;
}
// Fail closed (fail-closed.ts): no scenario file, or files with no case, checked nothing.
const scenarioEmpty = noInputs('scenarios.ts', named.length ? `scenario file matching ${named.join(' ')}` : 'scenario file', files.length)
  ?? noInputs('scenarios.ts', 'scenario case', results.reduce((n, r) => n + r.cases.length, 0));
if (scenarioEmpty) { lines.push(scenarioEmpty); bad += 1; }
lines.push(`${results.length} components, ${results.reduce((n, r) => n + r.cases.length, 0)} cases, ${bad} failing, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
if (flag('--json')) writeAllStdout(JSON.stringify({ results, report, shimmed: Object.fromEntries(shimmed) }, null, 2) + '\n');
else process.stdout.write(lines.join('\n') + '\n');
process.exit(bad ? 1 : 0);

// ---------------------------------------------------------------------------------------------------------------
interface MutantResult { component: string; sibling: string; prop: string; killedBy: string[]; mode?: string; error?: string; coversUnproven?: string[] }
/** Mutants: every prop the sibling reads (or hands on) that a scenario case exercises with an assertion, and every
 *  safety prop it reads. Each is first dropped (reads become undefined), then, if nothing failed, flipped (a boolean
 *  negated, unset set). Killed = a case that passes unmutated fails mutated. A case that names the prop in `covers` must
 *  itself be among the killers: `covers` is a claim the mutant checks. */
async function runMutants(ob: Awaited<ReturnType<typeof import('./contract').reportObligations>>): Promise<MutantResult[]> {
  const { SAFETY_PROPS, staticScenarios } = await import('./contract');
  const out: MutantResult[] = [];
  const baseFail = new Set(results.flatMap((r) => r.cases.filter((x) => !x.ok).map((x) => `${r.component}: ${x.name}`)));
  for (const c of ob.components) {
    if (!c.scenario) continue;
    if (named.length && !files.some((f) => f.endsWith(c.scenario!))) continue;
    const st = staticScenarios(path.join(HUB, c.scenario)).find((x) => x.component === c.component);
    const exercised = new Set([...(st?.perCase ?? []).filter((k) => k.asserts).flatMap((k) => [...k.props, ...k.covers])]);
    const handled = new Set([...c.read, ...(c.forwarded ?? [])]);
    // A prop listed in `ignored` is declared look only: not mutated (contract.ts fails one that reaches a handler).
    const lookOnly = new Set(Object.keys(st?.ignored ?? {}));
    const props = [...handled].filter((p) => (exercised.has(p) && !lookOnly.has(p)) || SAFETY_PROPS.includes(p)).sort();
    const fileCases = results.filter((r) => r.file === c.scenario).flatMap((r) => r.cases.filter((x) => !x.skipped));
    const passing = fileCases.filter((x) => x.ok).length;
    for (const prop of props) {
      // A mutant can only be judged against cases that pass unmutated. When most of the scenario file's cases fail
      // (a broken baseline: the loader mid-edit, a crash), every mutant would read SURVIVED: it is an error instead.
      if (!passing || passing * 2 < fileCases.length) { out.push({ component: c.component, sibling: c.sibling, prop, killedBy: [], error: `baseline failing: ${fileCases.length - passing}/${fileCases.length} cases of ${c.scenario} fail unmutated; re-run when they pass` }); continue; }
      const abs = path.join(HUB, c.sibling);
      const passOn = args.flatMap((a, i) => (a === '--override' ? [a, args[i + 1]!] : []));
      const killers = new Set<string>();
      let error: string | undefined;
      let mode: string | undefined;
      for (const m of ['drop', 'flip'] as const) {
        // Child process: a fresh module graph with the mutated sibling. NODE_ENV=test is set explicitly (never inherited).
        const p = Bun.spawnSync(['bun', path.join(HUB, 'scripts/term/scenarios.ts'), ...passOn, '--mutant', `${abs}::${c.component}::${prop}::${m}`, path.join(HUB, c.scenario)], {
          cwd: HUB, env: { ...process.env, NODE_ENV: 'test' }, stdout: 'pipe', stderr: 'pipe',
        });
        const text = p.stdout.toString();
        const r = /^MUTANT-RESULT (.*)$/m.exec(text);
        if (!r) { error = (p.stderr.toString() || text).split('\n').filter(Boolean).slice(-3).join(' | '); break; }
        for (const k of (JSON.parse(r[1]!) as { killedBy: string[] }).killedBy) if (!baseFail.has(k)) killers.add(k);
        mode = m;
        // Both modes run when a case covers the prop (each covering case must fall to one of them); else stop at a kill.
        if (killers.size && !(st?.perCase ?? []).some((k) => k.covers.includes(prop))) break;
      }
      const coversUnproven = (st?.perCase ?? []).filter((k) => k.covers.includes(prop) && !killers.has(`${c.component}: ${k.name}`)).map((k) => k.name);
      out.push({ component: c.component, sibling: c.sibling, prop, killedBy: [...killers], ...(mode ? { mode } : {}), ...(error ? { error } : {}), ...(coversUnproven.length ? { coversUnproven } : {}) });
    }
  }
  return out;
}

// process.stdout.write to a pipe is asynchronous: a process.exit right after it cut --json output at 64 KB. Write
// synchronously, whole, to fd 1.
function writeAllStdout(text: string): void {
  const buf = Buffer.from(text);
  for (let off = 0; off < buf.length;) {
    try { off += fs.writeSync(1, buf, off); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EAGAIN') throw e; }
  }
}
