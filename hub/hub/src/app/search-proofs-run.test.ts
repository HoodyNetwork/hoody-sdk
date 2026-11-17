// The run checker on fake Playwright JSON reports: absent, skipped, failed, mark missing are red;
// a retried test counts only its final result, so flaky-then-pass with its marks is green.
import { describe, expect, it } from 'vitest';
import type { ProofRow } from './search-proofs';
import { runReportPath, searchProofReportProblems, searchProofRunCheck, searchProofRunProblems, templatePageId, templateRowFiles } from './search-proofs-run';

// `marks` are helper letters, marked on this spec's own id; `raw` are mark descriptions as written (another test's id).
type Result = { status: string; retry?: number; marks?: string[]; raw?: string[] };
const idOf = (title: string) => `id-${title.replace(/\W+/g, '-')}`;
const spec = (title: string, ...results: Result[]) => ({
  id: idOf(title),
  title,
  file: 'pages/demo/page.spec.ts',
  tests: [
    {
      results: results.map((r) => ({
        status: r.status,
        retry: r.retry ?? 0,
        annotations: [...(r.marks ?? []).map((h) => `${h} ${idOf(title)}`), ...(r.raw ?? [])].map((d) => ({ type: 'l064', description: d })),
      })),
    },
  ],
});
const report = (specs: object[], suites: object[] = []) => ({ suites: [{ title: 'pages/demo/page.spec.ts', file: 'pages/demo/page.spec.ts', specs, suites }] });

const rows: ProofRow[] = [
  { file: 'src/pages/demo/page.spec.ts', test: '@search one', helpers: ['S'] },
  { file: 'src/pages/demo/page.spec.ts', test: '@reload two', helpers: ['S', 'R'] },
];
const good = () => [spec('@search one narrows', { status: 'passed', marks: ['S'] }), spec('@reload two survives', { status: 'passed', marks: ['S', 'R'] })];

describe('searchProofRunProblems', () => {
  it('a run where every row ran, passed and completed its helpers is clean', () => {
    expect(searchProofRunProblems(report(good()), {}, rows)).toEqual([]);
  });
  it('a row absent from the run is red', () => {
    expect(searchProofRunProblems(report(good().slice(1)), {}, rows)).toEqual(['src/pages/demo/page.spec.ts: "@search one" did not run']);
  });
  it('a skipped row is red', () => {
    const r = report([spec('@search one narrows', { status: 'skipped' }), good()[1]!]);
    expect(searchProofRunProblems(r, {}, rows)).toEqual(['src/pages/demo/page.spec.ts › @search one narrows: skipped']);
  });
  it('a failed row is red, and so is a failed final retry', () => {
    const r = report([spec('@search one narrows', { status: 'failed' }), spec('@reload two survives', { status: 'passed', marks: ['S', 'R'] }, { status: 'timedOut', retry: 1 })]);
    expect(searchProofRunProblems(r, {}, rows)).toEqual([
      'src/pages/demo/page.spec.ts › @search one narrows: failed',
      'src/pages/demo/page.spec.ts › @reload two survives: timedOut',
    ]);
  });
  it('flaky then pass: only the final result counts, so it is green with its marks (and red without them)', () => {
    const flaky = report([spec('@search one narrows', { status: 'failed' }, { status: 'passed', retry: 1, marks: ['S'] }), good()[1]!]);
    expect(searchProofRunProblems(flaky, {}, rows)).toEqual([]);
    const earlyMarks = report([spec('@search one narrows', { status: 'failed', marks: ['S'] }, { status: 'passed', retry: 1 }), good()[1]!]);
    expect(searchProofRunProblems(earlyMarks, {}, rows)).toEqual(['src/pages/demo/page.spec.ts › @search one narrows: passed without completing expectSearchStaysOutOfUrl']);
  });
  it('a passed row whose helper never completed (no mark) is red, per helper', () => {
    const r = report([good()[0]!, spec('@reload two survives', { status: 'passed', marks: ['S'] })]);
    expect(searchProofRunProblems(r, {}, rows)).toEqual(['src/pages/demo/page.spec.ts › @reload two survives: passed without completing expectLinkSearchDroppedOnReload']);
  });
  it('a report with no suites (empty, or not a report) is red, never "nothing to check"', () => {
    expect(searchProofRunProblems({}, {}, rows)).toEqual(['the Playwright report has no suites: nothing it ran can be checked']);
    expect(searchProofRunProblems(null, {}, rows)).toHaveLength(1);
    expect(searchProofRunProblems(report([]), {}, rows)).toHaveLength(2);
  });
  it('a parameterised row is one row per case, matched with its describe in the title path; a case that did not run is red', () => {
    const auto: ProofRow[] = [{ file: 'src/pages/demo/page.spec.ts', test: '@search ${l.name}:', helpers: ['S'], cases: ['Loops', 'TODOs'] }];
    const describe = (name: string, ...s: object[]) => ({ title: name, file: 'pages/demo/page.spec.ts', specs: s });
    const r = report([], [describe('Loops', spec('@search Loops: narrows', { status: 'passed', marks: ['S'] }))]);
    expect(searchProofRunProblems(r, {}, auto)).toEqual(['src/pages/demo/page.spec.ts: "@search TODOs:" did not run']);
    const both = report([], [describe('Loops', spec('@search Loops: narrows', { status: 'passed', marks: ['S'] })), describe('TODOs', spec('@search TODOs: narrows', { status: 'passed' }))]);
    expect(searchProofRunProblems(both, {}, auto)).toEqual(['src/pages/demo/page.spec.ts › TODOs › @search TODOs: narrows: passed without completing expectSearchStaysOutOfUrl']);
  });
  it('two tests answering one row are red', () => {
    const r = report([...good(), spec('@search one again', { status: 'passed', marks: ['S'] })]);
    expect(searchProofRunProblems(r, {}, rows)[0]).toMatch(/"@search one" matches 2 tests/);
  });
  it('scope: only the run’s spec files and its --grep; rows of specs Playwright does not run (templates/) are the lint’s', () => {
    const other: ProofRow[] = [...rows, { file: 'src/pages/keys/page.spec.ts', test: '@search k', helpers: ['S'] }, { file: 'templates/page-table/page.spec.ts', test: '@search t', helpers: ['S'] }];
    expect(searchProofRunProblems(report(good()), { files: ['src/pages/demo/page.spec.ts'] }, other)).toEqual([]);
    expect(searchProofRunProblems(report(good()), {}, other)).toEqual(['src/pages/keys/page.spec.ts: "@search k" did not run']);
    expect(searchProofRunProblems(report(good().slice(1)), { grep: /@reload/ }, rows)).toEqual([]);
  });
  it('templates-search-proofs-unrun: a fileMap (check-templates --run) has the filled-in page answer its template rows; unmapped template rows stay the lint’s', () => {
    const tpl: ProofRow[] = [
      { file: 'templates/page-table/page.spec.ts', test: '@search one', helpers: ['S'] },
      { file: 'templates/page-table/page.spec.ts', test: '@reload two', helpers: ['S', 'R'] },
      { file: 'templates/page-wizard/page.spec.ts', test: '@search w', helpers: ['S'] },
    ];
    // The same fake run, as the filled-in page src/pages/zztable/ reports it.
    const asTable = (r: object) => JSON.parse(JSON.stringify(r).replaceAll('pages/demo/', 'pages/zztable/')) as object;
    const fileMap = { 'src/pages/zztable/page.spec.ts': 'templates/page-table/page.spec.ts' };
    const files = ['templates/page-table/page.spec.ts'];
    // Mapped, ran, passed, marked: checked and clean; the unmapped wizard row is skipped.
    expect(searchProofRunCheck(asTable(report(good())), { files, fileMap }, tpl)).toEqual({ problems: [], checked: 2, skipped: 1 });
    // Mapped but absent, or passed without its mark, is red under the template's own name.
    expect(searchProofRunProblems(asTable(report(good().slice(0, 1))), { files, fileMap }, tpl)).toEqual(['templates/page-table/page.spec.ts: "@reload two" did not run']);
    expect(searchProofRunProblems(asTable(report([spec('@search one narrows', { status: 'passed' }), good()[1]!])), { files, fileMap }, tpl)).toEqual([
      'templates/page-table/page.spec.ts › @search one narrows: passed without completing expectSearchStaysOutOfUrl',
    ]);
    // Without the map the same report proves nothing of the template rows: they are skipped, never credited.
    expect(searchProofRunCheck(asTable(report(good())), {}, tpl)).toEqual({ problems: [], checked: 0, skipped: 3 });
  });
  it('templates-search-proofs: a map that could credit a row with another spec is red, never checked', () => {
    const tpl: ProofRow[] = [{ file: 'templates/page-table/page.spec.ts', test: '@search one', helpers: ['S'] }];
    const r = report(good());
    // Another template's page answering page-table, a src/ row as target, and two report files on one row: all refused.
    expect(searchProofRunCheck(r, { fileMap: { 'src/pages/zzlistdetail/page.spec.ts': 'templates/page-table/page.spec.ts' } }, tpl)).toEqual({
      problems: ['fileMap: src/pages/zzlistdetail/page.spec.ts -> templates/page-table/page.spec.ts: templates/page-table/page.spec.ts is answered only by src/pages/zztable/page.spec.ts'],
      checked: 0,
      skipped: 0,
    });
    expect(searchProofRunProblems(r, { fileMap: { 'src/pages/demo/page.spec.ts': 'src/pages/keys/page.spec.ts' } }, tpl)).toEqual([
      'fileMap: src/pages/demo/page.spec.ts -> src/pages/keys/page.spec.ts: only a templates/page-<layout>/page.spec.ts row file can be mapped',
    ]);
    expect(
      searchProofRunProblems(r, { fileMap: { 'src/pages/zztable/page.spec.ts': 'templates/page-table/page.spec.ts', 'src/pages/demo/page.spec.ts': 'templates/page-table/page.spec.ts' } }, tpl),
    ).toEqual([
      'fileMap: src/pages/demo/page.spec.ts -> templates/page-table/page.spec.ts: templates/page-table/page.spec.ts is answered only by src/pages/zztable/page.spec.ts',
      'fileMap: templates/page-table/page.spec.ts is mapped from more than one report file',
    ]);
  });
  it('templates-search-proofs: the template files a run must prove come from the inventory, and their pages from the layout', () => {
    expect(templateRowFiles()).toEqual(['templates/page-list-detail/page.spec.ts', 'templates/page-table/page.spec.ts']);
    expect(templatePageId('page-list-detail')).toBe('zzlistdetail');
  });
  it('--grep: a listed test the run selected by any part of its full title is checked, even when the row prefix does not match', () => {
    const r = report([spec('@search one narrows', { status: 'passed' }), good()[1]!]);
    expect(searchProofRunCheck(r, { grep: /narrows/ }, rows)).toEqual({
      problems: ['src/pages/demo/page.spec.ts › @search one narrows: passed without completing expectSearchStaysOutOfUrl'],
      checked: 2,
      skipped: 0,
    });
    // A row the grep names but the run lacks is still red; one neither named nor run is skipped.
    expect(searchProofRunCheck(report([]), { grep: /one/ }, rows)).toEqual({ problems: ['src/pages/demo/page.spec.ts: "@search one" did not run'], checked: 1, skipped: 1 });
  });
  it("a mark names its test; a beforeAll copy (another test's id), a bare mark or a spec with no id credits nothing", () => {
    // Playwright 1.64.1 copies a beforeAll hook's annotations onto every later test of the describe (workerProcessEntry
    // _runAllHooksForSuite, then extraAnnotations at each test's start): each copy still names the first test.
    const first = idOf('@search one narrows');
    const copied = report([spec('@search one narrows', { status: 'passed', marks: ['S'] }), spec('@reload two survives', { status: 'passed', raw: [`S ${first}`, `R ${first}`] })]);
    expect(searchProofRunProblems(copied, {}, rows)).toEqual([
      "src/pages/demo/page.spec.ts › @reload two survives: passed without completing expectSearchStaysOutOfUrl itself (its only mark names another test: a hook's copy)",
      "src/pages/demo/page.spec.ts › @reload two survives: passed without completing expectLinkSearchDroppedOnReload itself (its only mark names another test: a hook's copy)",
    ]);
    const bare = report([spec('@search one narrows', { status: 'passed', raw: ['S'] }), good()[1]!]);
    expect(searchProofRunProblems(bare, {}, rows)).toEqual([
      "src/pages/demo/page.spec.ts › @search one narrows: passed without completing expectSearchStaysOutOfUrl itself (its only mark names another test: a hook's copy)",
    ]);
    const noId = report([{ ...spec('@search one narrows', { status: 'passed', marks: ['S'] }), id: undefined }, good()[1]!]);
    expect(searchProofRunProblems(noId, {}, rows)).toHaveLength(1);
    // Its own mark beside a copy is enough: the copy is ignored, never counted against it.
    const both = report([good()[0]!, spec('@reload two survives', { status: 'passed', marks: ['S', 'R'], raw: [`S ${first}`] })]);
    expect(searchProofRunProblems(both, {}, rows)).toEqual([]);
  });
  it('a spec the report merged from several projects or --repeat-each copies is one clear problem, never an id compare', () => {
    const two = spec('@search one narrows', { status: 'passed', marks: ['S'] });
    const merged = { ...two, tests: [...two.tests, ...two.tests] };
    expect(searchProofRunProblems(report([merged, good()[1]!]), {}, rows)).toEqual([
      'src/pages/demo/page.spec.ts › @search one narrows: the report merges 2 runs of this test (several projects or --repeat-each): the search proof gate needs one project and no --repeat-each',
    ]);
  });
  it('each run writes its own report file', () => {
    const a = runReportPath('/w/playwright');
    const b = runReportPath('/w/playwright');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^\/w\/playwright-report-[0-9a-f-]{36}\.json$/);
  });
  it('the gate: a missing or unreadable report is red, and so is one that is not JSON; a good one is checked', () => {
    const missing = () => {
      throw new Error("ENOENT: no such file or directory, open 'r.json'");
    };
    expect(searchProofReportProblems(missing, 'r.json', {}, rows)).toEqual([`the Playwright report r.json is missing or unreadable (ENOENT: no such file or directory, open 'r.json')`]);
    expect(searchProofReportProblems(() => '{"suites": [', 'r.json', {}, rows)[0]).toMatch(/^the Playwright report r\.json is not JSON/);
    expect(searchProofReportProblems(() => '', 'r.json', {}, rows)[0]).toMatch(/^the Playwright report r\.json is not JSON/);
    expect(searchProofReportProblems(() => JSON.stringify(report(good())), 'r.json', {}, rows)).toEqual([]);
  });
  it('a page-scoped run (hub:check --page X) whose specs hold no inventory row requires nothing and says how many it skipped', () => {
    const other = { suites: [{ title: 'pages/home/page.spec.ts', file: 'pages/home/page.spec.ts', specs: [{ title: 'home opens', file: 'pages/home/page.spec.ts', tests: [{ results: [{ status: 'passed', retry: 0 }] }] }] }] };
    const auto: ProofRow = { file: 'src/pages/ai/auto.spec.ts', test: '@search ${l.name}:', helpers: ['S'], cases: ['Loops', 'TODOs'] };
    const all = [...rows, auto, { file: 'templates/page-table/page.spec.ts', test: '@search t', helpers: ['S'] as ProofRow['helpers'] }];
    expect(searchProofRunCheck(other, { files: ['src/pages/home/page.spec.ts'] }, all)).toEqual({ problems: [], checked: 0, skipped: 5 });
    // The same run asked for its own page's rows checks them (and only them).
    expect(searchProofRunCheck(report(good()), { files: ['src/pages/demo/page.spec.ts'] }, all)).toEqual({ problems: [], checked: 2, skipped: 3 });
  });
});
