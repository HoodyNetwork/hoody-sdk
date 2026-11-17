#!/usr/bin/env bun
// The terminal Hub's gates as ONE command. Every problem is printed as `file  rule  what happened  -> what to do`.
//
//   bun scripts/term/check.ts [--page <id> | --affected | --changed [a,b,...]] [--record] [--jobs N] [--update]
//                             [--only a,b,...] [--skip e] [--json out.json] [--scenario a,b,...]
//
//   --scenario a,b  limit scenarios, web-scenarios and mutants to these scenario files (a path, a path ending or a
//                   component name, as scenarios.ts); alone it runs just those three gates. Any other bare word is
//                   refused (check-args.ts): `check.ts --only web-scenarios SegmentedControl` used to run every file.
//
//   (a) graph   graph.ts --check, rules R1-R6; the ratchet (graph/baseline.json) only goes down: graph.ts
//               --update-baseline drops gone entries and never records new ones (check.ts --update does not touch it)
//   (b) contract  the sibling contract, strict (contract.ts)
//   (c) types   typecheck.ts (terminal files under the web tsconfig)
//   (d) tests   every *.term.test.ts(x), one bun test process per file (a wedged file fails alone)
//   (d2) scenarios  the shared behaviour scenarios, terminal side (scenarios.ts)
//   (d3) web-scenarios  the same scenario files on the web components (vitest in a gate slot)
//   (d4) mutants  scenarios.ts --mutants; scoped runs only (--page: the page's own files; --changed), or --only mutants
//   (e) pages   goldens.ts: every page x every fixture state x 80x24 + 120x40, frames as .txt beside the page; crash,
//               new placeholder, new strict-global trap, new refused element member or more untranslatable classes fail
//   (e2) secrets  no fixture secret in a page's frame or semantics (secrets.ts), the same pages as (e)
//   (f) kit     every kit export classified (kit-classes.ts); the placeholder-allowed list only shrinks
//   (g) icons   the icon test (src/kit/icons.term.test.tsx)
//
// --affected runs (e) only for pages whose last green run loaded a changed file (goldens.ts); --jobs N runs N pages at
// once (default 1; frames are identical for any N, goldens-identity.ts). --page limits (e) to one page and skips (a)-(d),(f),(g) unless --only names them. --update writes new frames and
// shrinks allowances; review the diff. Children run with NODE_ENV=test and no .env.
//
// --changed [a,b]: only what a change touches (changed.ts): the files given, else those whose content differs from the
// record; contract and types limited to them and their importers, the terminal tests among or beside them, the pages
// whose last run loaded one (as --affected), kit and icons only when a kit file is in it. graph runs whole (20 s).
// NEW versus already red (red-record.ts): every run prints the failures not in the record first. `--record` (a full
// run, on the tree before your change) writes the record; a full run writes one when none exists. The record is a
// view, never an allowance: a recorded failure still fails.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import { installGroupReaper, runGroup } from './child-group';
import { inGateSlot, slotEnv } from './gate-slot';
import { mutantProblems, pageScopeOf, webScenarioProblems, type PageScope } from './page-scope';
import fs from 'node:fs';
import path from 'node:path';
import { HUB } from './resolve';
import type { Problem, PageResult } from './goldens';
import { contractReport, failLine } from './check-report';
import { argProblems, matchScenarios, scenarioScope } from './check-args';
import { gateNames, judgeTestRun, noTestFiles } from './fail-closed';
import { childEnv } from './child-env';
import { confine } from './netns';
import { exitMessage, writeStepLog } from './step-log';
import { secretsGateRefusal } from './secrets-gate-env';
import { changedFiles, scopeOf, treeHashes, type Scope } from './changed';
import { readRecord, signatureOf, splitNew, writeRecord, type RedRecord } from './red-record';

const argv = process.argv.slice(2);
// Fail closed on the command line (check-args.ts): a word check.ts does not read made a narrow ask run wide.
{ const bad = argProblems(argv); if (bad.length) { process.stderr.write(`check: ${bad.join('; ')}\n`); process.exit(2); } }
const arg = (n: string): string | undefined => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
// --scenario a,b: the scenario files (scenarios.ts matching); alone it runs only the three scenario gates.
const scenarioArg = arg('scenario')?.split(',').map((x) => x.trim()).filter(Boolean) ?? null;
const scenarioPick = scenarioArg ? matchScenarios([...new Bun.Glob('src/**/*.scenario.ts').scanSync(HUB)], scenarioArg) : null;
if (scenarioPick?.unmatched.length) { process.stderr.write(`check: --scenario ${scenarioPick.unmatched.map((n) => JSON.stringify(n)).join(', ')} matches no src/**/*.scenario.ts file\n`); process.exit(2); }
const update = argv.includes('--update'); // the ONLY switch that writes (goldens, allowances, kit list)
const page = arg('page');
const only = arg('only')?.split(',') ?? (page ? ['pages'] : scenarioPick ? ['scenarios', 'web-scenarios', 'mutants'] : null);
const skip = new Set(arg('skip')?.split(',') ?? []);
const GATES = ['graph', 'contract', 'types', 'tests', 'scenarios', 'web-scenarios', 'mutants', 'pages', 'secrets', 'kit', 'icons'] as const;
type Gate = (typeof GATES)[number];
// Fail closed: an unknown gate name would run nothing and pass (`--only tsts`).
const unknownGates = gateNames([...(only ?? []), ...skip], GATES);
if (unknownGates.length) { process.stderr.write(`check: unknown gate ${unknownGates.map((n) => JSON.stringify(n)).join(', ')} (gates: ${GATES.join(', ')})\n`); process.exit(2); }
const want = (g: Gate): boolean => (only ? only.includes(g) : true) && !skip.has(g);
const record: RedRecord | null = readRecord();
const changedAt = argv.indexOf('--changed');
const changedList = changedAt >= 0 && argv[changedAt + 1] && !argv[changedAt + 1]!.startsWith('--') ? argv[changedAt + 1]!.split(',').filter(Boolean) : null;
let scope: Scope | null = null;
if (changedAt >= 0) {
  if (!changedList && !record) { process.stderr.write('check --changed: no record to compare with (.term-cache/check-red.json). Name the files (`--changed a,b`), or run `bun scripts/term/check.ts --record` on the tree before your change.\n'); process.exit(2); }
  const t0 = performance.now();
  scope = scopeOf(changedList ?? changedFiles(record!.tree, treeHashes()));
  process.stdout.write(`changed: ${scope.changed.length} files${changedList ? '' : ` since the record (${record!.at})`}; in scope with importers: ${scope.files.length}; tests: ${scope.tests.length} (${((performance.now() - t0) / 1000).toFixed(1)} s)\n${scope.changed.slice(0, 12).map((f) => `   ${f}`).join('\n')}${scope.changed.length > 12 ? `\n   (+${scope.changed.length - 12})` : ''}\n`);
  if (!scope.changed.length) { process.stdout.write('check --changed: nothing changed; nothing to check.\n'); process.exit(0); }
}
const limited = !!scope || !!page || argv.includes('--affected') || !!scenarioPick;
if (argv.includes('--record') && (limited || only || skip.size)) { process.stderr.write('check --record: a record is a whole run (no --changed, --page, --affected, --only or --skip).\n'); process.exit(2); }
const skipped: string[] = [];
// Minimal env for every gate child (child-env.ts): no caller token, profile or .env value reaches a gate.
const env = childEnv({ FORCE_COLOR: '0' });

// With --page: what the page reaches beyond its goldens (page-scope.ts): its closure is its last golden run's files.
let pageScope: PageScope | null = null;
if (page) {
  const { pageClosure } = await import('./goldens');
  const closure = pageClosure(page);
  if (!closure) process.stdout.write(`     ${page}: no golden run recorded yet, so only src/pages/${page}/ is in scope for scenarios, tests and types\n`);
  pageScope = pageScopeOf(HUB, page, closure);
}

interface GateResult { gate: Gate; ok: boolean; ms: number; summary: string; problems: Problem[] }
const results: GateResult[] = [];

// Every child in a process group of its own (child-group.ts): a signal to this runner stops them all (TERM, grace, KILL).
installGroupReaper();
let currentGate = 'check';
let gateLogs: string[] = [];
async function run(cmd: string[], timeoutMs: number): Promise<{ code: number; out: string; log?: string }> {
  // Every child inside the OS network boundary (netns.sh); the JS fence in its env is the diagnostic.
  const r = await runGroup(confine(cmd), { cwd: HUB, env, timeoutMs });
  // A failed step keeps its whole output (step-log.ts); its problem line names the log.
  const log = r.code !== 0 ? writeStepLog(currentGate, cmd, r) : undefined;
  if (log) gateLogs.push(log);
  return { code: r.code, out: r.out, ...(log ? { log } : {}) };
}
async function gate(g: Gate, f: () => Promise<Omit<GateResult, 'gate' | 'ms'>> | Omit<GateResult, 'gate' | 'ms'>): Promise<void> {
  if (!want(g)) return;
  currentGate = g;
  gateLogs = [];
  const t0 = performance.now();
  process.stdout.write(`… ${g}\n`);
  let r: Omit<GateResult, 'gate' | 'ms'>;
  try { r = await f(); } catch (e) { r = { ok: false, summary: 'gate itself failed', problems: [{ file: 'scripts/term/check.ts', rule: g, message: String((e as Error)?.stack ?? e).split('\n').slice(0, 3).join(' | '), fix: 'Fix the gate (scripts/term).' }] }; }
  const ms = Math.round(performance.now() - t0);
  results.push({ gate: g, ms, ...r });
  // A failing gate's line says why (its first problems): never a bare FAIL with a timing (check-report.ts).
  process.stdout.write(`${r.ok ? 'ok  ' : 'FAIL'} ${g} (${(ms / 1000).toFixed(1)} s): ${(r.ok ? r.summary : failLine(r.summary, r.problems) + (gateLogs.length ? ` (full output: ${gateLogs.join(', ')})` : '')).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '\ufffd')}\n`);
}

// (a) graph: graph.ts --check is the judge; its error lines become problems.
await gate('graph', async () => {
  const r = await run(['bun', 'scripts/term/graph.ts', '--check'], 600_000);
  const problems: Problem[] = r.out.split('\n').filter((l) => /^ERROR\s+R\d/.test(l)).map((l) => {
    const m = /^ERROR\s+(R\d+)\s+(\S+)\s+(.*)$/.exec(l);
    const msg = m?.[3] ?? l;
    const cut = msg.indexOf('. ');
    return { file: m?.[2] ?? 'scripts/term/graph/baseline.json', rule: m?.[1] ?? 'graph', message: cut > 0 ? msg.slice(0, cut) : msg, fix: cut > 0 ? msg.slice(cut + 2) : 'Run `bun scripts/term/graph.ts --check` (docs: src/term/docs/gates.md).' };
  });
  if (r.code !== 0 && problems.length === 0) problems.push({ file: 'scripts/term/graph.ts', rule: 'graph', message: exitMessage(r), fix: '`bun scripts/term/graph.ts --check`' });
  return { ok: r.code === 0, summary: r.out.trim().split('\n').filter((l) => /^(graph|check):/.test(l)).join('; '), problems };
});

// (b) contract
const contractOnly = scope ? scope.files.filter((f) => /\.term\.tsx?$/.test(f) && !/\.test\./.test(f)) : null;
if (contractOnly && !contractOnly.length && want('contract')) skipped.push('contract (no sibling in scope)');
if (!contractOnly || contractOnly.length) await gate('contract', async () => {
  const r = await run(['bun', 'scripts/term/contract.ts', ...(contractOnly ? ['--only', contractOnly.join(',')] : [])], 600_000);
  // Every head that makes contract.ts exit 1 (FAIL, FIXED-but-listed debt, DEBT ADDED, no input) with its detail lines.
  return contractReport(r.out, r.code);
});

// (c) types
const typeRoots = scope ? scope.files.filter((f) => /\.term\.(test\.)?tsx?$/.test(f) || f.startsWith('scripts/term/')) : pageScope ? pageScope.roots : null;
if (typeRoots && !typeRoots.length && want('types')) skipped.push('types (no terminal file in scope)');
if (!typeRoots || typeRoots.length) await gate('types', async () => {
  const r = await run(['bun', 'scripts/term/typecheck.ts', ...(typeRoots ? ['--roots', typeRoots.join(',')] : [])], 600_000);
  const problems: Problem[] = r.out.split('\n').filter((l) => /^(src|scripts|\(program\))[^:]*:\d+: /.test(l)).map((l) => {
    const [, file, line, msg] = /^([^:]+):(\d+): (.*)$/.exec(l)!;
    return { file: `${file}:${line}`, rule: 'types', message: msg!, fix: 'Fix the type error in that file; re-run `bun scripts/term/typecheck.ts` (docs: src/term/docs/gates.md).' };
  });
  // The exit code decides, not the parsed lines: a crash, a timeout or an unparsed diagnostic must fail the gate too.
  if (r.code !== 0 && problems.length === 0) problems.push({ file: 'scripts/term/typecheck.ts', rule: 'types', message: exitMessage(r), fix: 'Run `bun scripts/term/typecheck.ts` and read its output.' });
  return { ok: r.code === 0 && problems.length === 0, summary: r.out.trim().split('\n').pop() ?? '', problems };
});

// (d) tests
const testFiles = (): string[] => [...new Bun.Glob('{src,scripts}/**/*.term.test.{ts,tsx}').scanSync(HUB)].filter((f) => !f.includes('node_modules')).sort();
const scopedTests = scope ? scope.tests : pageScope ? pageScope.tests : null;
if (scopedTests && !scopedTests.length && want('tests')) skipped.push('tests (no terminal test in scope)');
if (!scopedTests || scopedTests.length) await gate('tests', async () => {
  const problems: Problem[] = [];
  let pass = 0;
  let fail = 0;
  const files = (scopedTests ?? testFiles()).filter((f) => f !== 'src/kit/icons.term.test.tsx');
  const none = noTestFiles(files.length);
  if (none) return { ok: false, summary: none, problems: [{ file: 'scripts/term/check.ts', rule: 'test', message: none, fix: 'Run from hub/ with the term test files present (docs: src/term/docs/gates.md).' }] };
  for (const f of files) {
    const r = await run(['bun', 'test', '--preload', './scripts/term/test-preload.ts', f], 300_000);
    const p = Number(/^\s*(\d+) pass/m.exec(r.out)?.[1] ?? 0);
    const x = Number(/^\s*(\d+) fail/m.exec(r.out)?.[1] ?? 0);
    pass += p;
    fail += x;
    // A green exit that checked nothing (no tests, all skipped, stopped early) fails too (fail-closed.ts).
    const empty = r.code === 0 ? judgeTestRun(fs.readFileSync(path.join(HUB, f), 'utf8'), r.out) : null;
    if (empty) problems.push({ file: f, rule: 'test', message: empty, fix: `\`NODE_ENV=test bun test --preload ./scripts/term/test-preload.ts ${f}\`; a test file runs every test it declares (docs: src/term/docs/gates.md).` });
    if (r.code !== 0) {
      const names = [...r.out.matchAll(/^\(fail\) (.+?)(?: \[\d.*)?$/gm)].map((m) => m[1]!).slice(0, 5);
      const err = /^(?:error|Error|TypeError|ReferenceError)[^\n]*/m.exec(r.out)?.[0];
      problems.push({ file: f, rule: 'test', message: r.code === 124 ? 'timed out (300 s)' : `${x} failing${names.length ? ': ' + names.join(' | ') : ''}${!names.length && err ? ': ' + err : ''}`, fix: `\`NODE_ENV=test bun test --preload ./scripts/term/test-preload.ts ${f}\`; a golden that moved on purpose: UPDATE_GOLDEN=1 and review.` });
    }
  }
  // The fence's child-process chain cannot run inside a test (no subprocess there): its live proof runs here, on a
  // whole run or when a fence test is in scope (net-guard-proof.ts).
  const FENCE_TESTS = ['scripts/term/test-net-guard.term.test.ts', 'scripts/term/netns.term.test.ts', 'scripts/term/net-policy.term.test.ts', 'scripts/term/net-exec.term.test.ts', 'scripts/term/child-env.term.test.ts', 'scripts/term/node-test-env.term.test.ts'];
  if (!scopedTests || files.some((f) => FENCE_TESTS.includes(f))) {
    const r = await run(['bun', 'scripts/term/net-guard-proof.ts'], 300_000);
    if (r.code !== 0) problems.push({ file: 'scripts/term/net-guard-proof.ts', rule: 'test', message: `the network fence does not follow the gate's children: ${r.out.trim().split('\n').filter((l) => /^(FAIL|\s+missing)/.test(l)).slice(0, 4).join(' | ')}`, fix: '`NODE_ENV=test bun scripts/term/net-guard-proof.ts`; the rules are scripts/term/net-policy.mjs (docs: src/term/docs/gates.md).' });
  }
  return { ok: problems.length === 0, summary: `${files.length} files, ${pass} pass, ${fail} fail`, problems };
});

// (d2) scenarios: the shared behaviour scenarios, terminal side (scenarios.ts). Scoped: --page = the page's own
// scenario files; --changed = scenario files in scope or beside a changed file.
{
  let filters: string[] | null = null;
  if (pageScope) filters = pageScope.scenarios;
  else if (scope) {
    const all = new Set([...new Bun.Glob('src/**/*.scenario.ts').scanSync(HUB)]);
    const mine = new Set(scope.files.filter((f) => f.endsWith('.scenario.ts')));
    for (const f of scope.changed) { const t = f.replace(/(\.term)?\.(tsx?|mts)$/, '.scenario.ts'); if (all.has(t)) mine.add(t); }
    filters = [...mine].sort();
  }
  filters = scenarioScope(filters, scenarioPick?.files ?? null);
  const none = filters !== null && !filters.length;
  if (none && want('scenarios')) skipped.push(`scenarios (no scenario file in scope)`);
  if (!none) await gate('scenarios', async () => {
    const r = await run(['bun', 'scripts/term/scenarios.ts', ...(filters ?? [])], 900_000);
    const problems: Problem[] = [];
    for (const m of r.out.matchAll(/^FAIL (\S+) \(([^)]+)\) term (\d+)\/(\d+)\n((?: {7}.*\n?)*)/gm)) {
      const cases = [...m[5]!.matchAll(/^ {7}FAIL {2}(.+?)(?::| *$)/gm)].map((x) => x[1]!.trim()).slice(0, 5);
      problems.push({ file: m[2]!, rule: 'scenario', message: `${m[1]}: ${Number(m[4]) - Number(m[3])} of ${m[4]} cases fail${cases.length ? `: ${cases.join(' | ')}` : ''}`, fix: `\`NODE_ENV=test bun scripts/term/scenarios.ts ${m[2]}\` shows each failing case with the tree and frame (docs: src/term/docs/scenarios.md).` });
    }
    if (r.code !== 0 && !problems.length) problems.push({ file: 'scripts/term/scenarios.ts', rule: 'scenario', message: exitMessage(r), fix: '`NODE_ENV=test bun scripts/term/scenarios.ts` and read its output.' });
    return { ok: r.code === 0, summary: r.out.trim().split('\n').filter((l) => /components, \d+ cases/.test(l)).pop() ?? '', problems };
  });

  // (d3) web-scenarios: the same scenario files on the WEB component (vitest, src/term/scenario/scenarios.web.test.ts),
  // in a gate slot. Same scope as (d2); a whole run takes every file.
  if (none && want('web-scenarios')) skipped.push('web-scenarios (no scenario file in scope)');
  if (!none) await gate('web-scenarios', async () => {
    // A gate slot of its own, unless the caller already holds one (HUB_GATE_SLOT_HELD=1: gate-slot.ts / gate-slot.sh).
    const narrow = ['/bin/bash', '-p', path.join(HUB, 'scripts/term/vitest-narrow.sh'), 'hub/src/term/scenario/scenarios.web.test.ts'];
    const cmd = inGateSlot(narrow, env);
    const p = await runGroup(confine(cmd), { cwd: HUB, env: slotEnv({ ...env, NO_COLOR: '1', ...(filters ? { HUB_SCENARIO: filters.join(',') } : {}) }), timeoutMs: 1_200_000 });
    // eslint-disable-next-line no-control-regex
    const out = p.out.replace(/\x1b\[[0-9;]*m/g, '');
    const code = p.code;
    const problems = webScenarioProblems(out, code);
    return { ok: code === 0 && problems.length === 0, summary: /Tests\s+[^\n]+/.exec(out)?.[0]?.trim() ?? '', problems };
  });

  // (d4) mutants: scenarios.ts --mutants over the same files (one child per exercised prop per mode, so only a scoped
  // run, --page or --changed, or `--only mutants`); a mutant no scenario kills fails.
  // --page: the page's OWN scenario files only (the kit's mutants run when a kit file changes, via --changed).
  const mFilters = pageScope ? filters!.filter((f) => f.startsWith(`src/pages/${page}/`)) : filters;
  const mutantsScoped = mFilters !== null || (only?.includes('mutants') ?? false);
  if (want('mutants') && !mutantsScoped) skipped.push('mutants (whole run: only with --page, --changed or --only mutants)');
  else if (mFilters !== null && !mFilters.length && want('mutants')) skipped.push('mutants (no scenario file of its own in scope)');
  else if (want('mutants')) await gate('mutants', async () => {
    const r = await run(['bun', 'scripts/term/scenarios.ts', '--mutants', ...(mFilters ?? [])], 1_800_000);
    const problems = mutantProblems(r.out, r.code);
    return { ok: r.code === 0 && problems.length === 0, summary: `${[...r.out.matchAll(/^ {4}mutant /gm)].length} mutants`, problems };
  });
}

// The pages the page gate and the secret gate look at: --page, else (--affected, --changed) those a change touched.
let pageIds: string[] | null = null;
if (want('pages') || want('secrets')) {
  const { allPageIds, affectedPages, unchangedRedPages } = await import('./goldens');
  let ids = page ? [page] : allPageIds();
  if (argv.includes('--affected') || scope) {
    const sel = affectedPages(ids);
    // One shared reason (a global input: every page) prints once, naming the input, not once per page.
    const one = sel.length > 1 && sel.every((x) => x.why === sel[0]!.why) ? sel[0]!.why : null;
    process.stdout.write(`     affected: ${sel.length} of ${ids.length} pages${one ? `, all because ${one}` : ''}\n${one ? '' : sel.map((x) => `       ${x.id}: ${x.why}`).join('\n')}${sel.length && !one ? '\n' : ''}`);
    const stillRed = unchangedRedPages(ids, sel.map((x) => x.id));
    if (stillRed.length) process.stdout.write(`     not re-run, red at their last run and unchanged since: ${stillRed.join(', ')}\n`);
    ids = sel.map((x) => x.id);
  }
  pageIds = ids;
}

// (e) pages
const pageResults: PageResult[] = [];
if (pageIds && !pageIds.length && want('pages')) skipped.push('pages (no page affected)');
if (!pageIds || pageIds.length) await gate('pages', async () => {
  const { runGoldenPages, summaryRow } = await import('./goldens');
  const ids = pageIds ?? [];
  const jobs = Math.max(1, Number(arg('jobs') ?? 1) || 1);
  const r = await runGoldenPages(ids, { jobs, update, quiet: true });
  pageResults.push(...r.results);
  const problems: Problem[] = [...r.died, ...r.results.flatMap((x) => x.problems)];
  for (const res of r.results) process.stdout.write(`     ${summaryRow(res)}${Object.keys(res.crashes).length ? `  crashes ${Object.keys(res.crashes).join(', ')}` : ''}\n`);
  const zero = pageResults.filter((x) => x.zeroPlaceholders && !Object.keys(x.crashes).some((k) => k !== 'strict')).length;
  return { ok: problems.length === 0, summary: `${pageResults.length} pages, ${pageResults.reduce((a, x) => a + x.frames, 0)} frames in ${(r.ms / 1000).toFixed(0)} s (jobs ${jobs}); zero placeholders and no crash: ${zero}/${pageResults.length}`, problems };
});

// (e2) secrets: no fixture secret, vault value or token in a page's frame or semantics (secrets.ts), same pages.
if (pageIds && !pageIds.length && want('secrets')) skipped.push('secrets (no page affected)');
if (!pageIds || pageIds.length) await gate('secrets', async () => {
  // A narrowed run (SECRETS_CASES) never stands in for the gate: refused, nothing run (secrets-gate-env.ts).
  const refused = secretsGateRefusal(env);
  if (refused) return { ok: false, summary: 'secrets: refused, SECRETS_CASES is set', problems: [refused] };
  const whole = !page && !scope && !argv.includes('--affected');
  const r = await run(['bun', 'scripts/term/secrets.ts', ...(whole ? [] : pageIds ?? [])], 3_600_000);
  const problems: Problem[] = [];
  let cur = '';
  for (const l of r.out.split('\n')) {
    const h = /^(ok {3}|FAIL |ERROR) (\S+): (.*)$/.exec(l);
    if (h) { cur = h[2]!; if (h[1] === 'ERROR') problems.push({ file: `src/pages/${cur}`, rule: 'secrets', message: h[3]!, fix: `\`NODE_ENV=test bun scripts/term/secrets.ts ${cur}\` and fix what fails the page's run.` }); continue; }
    const leak = /^ {7}(.+?): (.+ shows a .+)$/.exec(l);
    if (leak && cur) problems.push({ file: `src/pages/${cur}`, rule: 'secrets', message: `${leak[1]}: ${leak[2]}`, fix: 'A secret drawn or in the semantics tree: show it only in SecretField (masked); never put it in a label (docs: src/term/docs/gates.md).' });
    const stale = /^STALE allow row (\S+)/.exec(l);
    if (stale) problems.push({ file: 'scripts/term/secrets.allow.json', rule: 'secrets', message: `allow row ${stale[1]} matches nothing`, fix: 'Remove the row.' });
  }
  if (r.code !== 0 && !problems.length) problems.push({ file: 'scripts/term/secrets.ts', rule: 'secrets', message: exitMessage(r), fix: '`NODE_ENV=test bun scripts/term/secrets.ts` and read its output.' });
  return { ok: r.code === 0, summary: r.out.trim().split('\n').filter((l) => l.startsWith('secrets:')).pop() ?? '', problems };
});

// (f) kit, (g) icons: whole (cheap), only when the change touches a kit.
const kitTouched = !scope || scope.files.some((f) => /^src\/(kit|term\/kit)\//.test(f));
if (!kitTouched) { if (want('kit')) skipped.push('kit (no kit file in scope)'); if (want('icons')) skipped.push('icons (no kit file in scope)'); }
if (kitTouched) await gate('kit', async () => {
  const { runParallel } = await import('./graph');
  const { classifyKit } = await import('./kit-classes');
  const r = await runParallel({ hub: HUB, quiet: true });
  const k = await classifyKit(r.analysis, { update });
  return { ok: k.problems.length === 0, summary: Object.entries(k.counts).map(([c, n]) => `${c} ${n}`).join(', '), problems: k.problems };
});

// (g) icons
if (kitTouched) await gate('icons', async () => {
  const f = 'src/kit/icons.term.test.tsx';
  const r = await run(['bun', 'test', '--preload', './scripts/term/test-preload.ts', f], 300_000);
  const pass = /^\s*(\d+) pass/m.exec(r.out)?.[1] ?? '0';
  return { ok: r.code === 0, summary: `${pass} pass`, problems: r.code === 0 ? [] : [{ file: f, rule: 'icons', message: (/^\(fail\) .+$/m.exec(r.out)?.[0] ?? r.out.trim().split('\n').slice(-2).join(' | ')).slice(0, 300), fix: 'An icon name without a terminal glyph (or a glyph of the wrong width): add it to the icon table (src/kit/icons.term.tsx; checked by src/kit/icons.term.test.tsx).' }] };
});

// Report.
const seenP = new Set<string>();
const { safeDiagnostic } = await import('../../src/term/prim/safe');
const all = results.flatMap((r) => r.problems.map((p) => ({ gate: r.gate, ...p, message: safeDiagnostic(p.message, 3000), fix: safeDiagnostic(p.fix, 600), file: safeDiagnostic(p.file, 300) }))).filter((p) => { const k = p.gate + p.file + p.rule + p.message; if (seenP.has(k)) return false; seenP.add(k); return true; });
const line = (p: (typeof all)[number]): string => `${p.file}  [${p.gate}/${p.rule}]  ${p.message}\n    -> ${p.fix}\n`;
const fresh = all.filter((p) => splitNew(p.gate, [p], record).fresh.length === 1);
const known = all.filter((p) => !fresh.includes(p));
if (!record && all.length) {
  process.stdout.write('\nProblems (file  rule  what  -> do), no record to tell new from already red (`check.ts --record` on the tree before your change):\n');
  for (const p of all) process.stdout.write(line(p));
} else if (all.length) {
  process.stdout.write(`\nNEW since the record of ${record!.at} (${fresh.length}; file  rule  what  -> do):\n`);
  for (const p of fresh) process.stdout.write(line(p));
  if (!fresh.length) process.stdout.write('  none\n');
  if (known.length) {
    process.stdout.write(`\nAlready red at the record (${known.length}; still failing, the record is no allowance):\n`);
    for (const p of known) process.stdout.write(line(p));
  }
}
for (const s of skipped) process.stdout.write(`skip ${s}\n`);
process.stdout.write(`\n${results.map((r) => `${r.ok ? 'ok' : 'FAIL'} ${r.gate}`).join(' · ')}${record ? `  (new: ${fresh.length}, already red: ${known.length})` : ''}\n`);
// The record: on --record, or the first whole run with none.
if (!limited && !only && !skip.size && (argv.includes('--record') || !record) && results.length) {
  const gates: Record<string, string[]> = {};
  for (const r of results) gates[r.gate] = [...new Set(all.filter((p) => p.gate === r.gate).map((p) => signatureOf(r.gate, p)))].sort();
  writeRecord({ at: new Date().toISOString().slice(0, 19) + 'Z', tree: treeHashes(), gates });
  process.stdout.write(`recorded this run's failures (${Object.values(gates).reduce((n, g) => n + g.length, 0)}) as the comparison for later runs: .term-cache/check-red.json\n`);
}
const out = arg('json');
if (out) fs.writeFileSync(out, JSON.stringify({ results, pages: pageResults }, null, 2));
// No gate ran (every one skipped): nothing was checked, so it is not a pass.
if (results.length === 0) { process.stderr.write('check: no gate ran (--only/--skip left nothing)\n'); process.exit(2); }
process.exit(results.every((r) => r.ok) ? 0 : 1);
