// The search-proof inventory, checked against what a Playwright run did (a source scanner
// cannot prove a call runs). Each row of SEARCH_PROOF_TESTS must match one test of the run's JSON report, by spec and
// full title path, whose final result passed and carries the `l064` mark of each of its helpers, naming that test's own
// id (S and R add the mark when they complete, app/e2e-search.ts). hub:check's Playwright step runs it on the report it just wrote
// (scripts/lib.ts searchProofGate); a missing or unreadable report is red. Pure: the caller passes the read.
// Rows of specs the Playwright config does not run (templates/) stay with the static lint (app/search-proofs.ts), except
// in a run that maps them: scripts/check-templates.ts --run fills each template in as a page and maps its spec back.
import { HELPER_NAME, SEARCH_PROOF_TESTS, type ProofHelper, type ProofRow } from './search-proofs';

/** The annotation type S and R push (app/e2e-search.ts PROOF_ANNOTATION). */
const MARK = 'l064';
/** Rows name specs hub-relative; the report names them relative to its rootDir (hub/src, the config's testDir). */
const RUN_ROOT = 'src/';
const hubRelative = (f: string) => (f.startsWith(RUN_ROOT) ? f : RUN_ROOT + f);

/** Which rows a run covers: its spec files (hub-relative; null = every spec) and its --grep, if any. */
export interface RunScope {
  files?: readonly string[] | null;
  grep?: RegExp;
  /** Report file -> row file, both hub-relative: a template filled in as a page (src/pages/zztable/page.spec.ts) answers
   *  its template's rows (templates/page-table/page.spec.ts). A row file a map names is checked like any src/ row. Only
   *  that one shape is accepted (templateMapProblems): any other entry is a problem, never a credit. */
  fileMap?: Readonly<Record<string, string>>;
}

/** The page id a template is filled in under (scripts/check-templates.ts --run): page-list-detail -> zzlistdetail. */
export const templatePageId = (layout: string) => `zz${layout.replace(/^page-/, '').replace(/-/g, '')}`;
const TEMPLATE_SPEC = /^templates\/(page-[a-z][a-z0-9-]*)\/page\.spec\.ts$/;

/** The template spec files the inventory holds rows for: a template run must prove every one. */
export const templateRowFiles = (rows: readonly ProofRow[] = SEARCH_PROOF_TESTS) => [...new Set(rows.map((r) => r.file).filter((f) => TEMPLATE_SPEC.test(f)))].sort();

/** A map may only send a template's own filled-in page to that template (src/pages/zz<layout>/page.spec.ts
 *  -> templates/page-<layout>/page.spec.ts), one to one; anything else could credit a row with another spec's test. */
export function templateMapProblems(fileMap: Readonly<Record<string, string>>): string[] {
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const [from, to] of Object.entries(fileMap)) {
    const m = TEMPLATE_SPEC.exec(to);
    if (!m) bad.push(`fileMap: ${from} -> ${to}: only a templates/page-<layout>/page.spec.ts row file can be mapped`);
    else if (from !== `src/pages/${templatePageId(m[1]!)}/page.spec.ts`) bad.push(`fileMap: ${from} -> ${to}: ${to} is answered only by src/pages/${templatePageId(m[1]!)}/page.spec.ts`);
    if (seen.has(to)) bad.push(`fileMap: ${to} is mapped from more than one report file`);
    seen.add(to);
  }
  return bad;
}

interface RunTest {
  file: string;
  path: string[];
  status: string;
  /** The helpers marked on this test itself: a mark `"<h> <id>"` whose id is this spec's own. */
  marks: string[];
  /** Helpers marked for another test only: a copy of a beforeAll hook's mark (Playwright copies a hook's annotations
   *  onto every later test of its describe), or a mark with no id. Never credited. */
  foreign: string[];
  /** How many runs the report merged into this spec (one per project and --repeat-each copy). The id check needs one. */
  copies: number;
}

interface JsonSuite {
  title?: string;
  file?: string;
  specs?: { id?: string; title?: string; file?: string; tests?: { results?: { status?: string; retry?: number; annotations?: { type?: string; description?: string }[] }[] }[] }[];
  suites?: JsonSuite[];
}

/** Every test of the report with its final result (a retried test counts only its last try). */
function testsOf(report: unknown, fileMap: Readonly<Record<string, string>> = {}): RunTest[] | null {
  const suites = (report as { suites?: unknown } | null)?.suites;
  if (!Array.isArray(suites)) return null;
  const out: RunTest[] = [];
  const walk = (s: JsonSuite, path: string[], top: boolean) => {
    const here = top ? path : [...path, s.title ?? ''];
    for (const spec of s.specs ?? []) {
      // The JSON reporter merges every project and --repeat-each copy of a spec into one spec and keeps the first copy's
      // id, so a later copy's own mark would not match it: the gate refuses such a report rather
      // than compare ids it cannot pair. Playwright 1.64.1 hashes the project, the file and the titles joined by U+001E
      // (common/index.js), so two tests of one file never share an id however their titles split across describes.
      const copies = (spec.tests ?? []).length;
      for (const t of spec.tests ?? []) {
        const results = [...(t.results ?? [])].sort((a, b) => (a.retry ?? 0) - (b.retry ?? 0));
        const last = results.at(-1);
        const own = spec.id ? ` ${spec.id}` : null;
        const marks: string[] = [];
        const foreign: string[] = [];
        for (const a of last?.annotations ?? []) {
          if (a.type !== MARK) continue;
          const d = a.description ?? '';
          const h = d.slice(0, 1);
          if (own !== null && d === h + own) marks.push(h);
          else foreign.push(h);
        }
        out.push({
          file: ((f) => (Object.hasOwn(fileMap, f) ? fileMap[f]! : f))(hubRelative(spec.file ?? s.file ?? '')),
          path: [...here, spec.title ?? ''],
          status: last?.status ?? 'not run',
          marks,
          foreign,
          copies,
        });
      }
    }
    for (const sub of s.suites ?? []) walk(sub, here, false);
  };
  for (const s of suites as JsonSuite[]) walk(s, [], true);
  return out;
}

/** A row's titles as run: a parameterised row once per case, `${l.name}` replaced. */
const titlesOf = (row: ProofRow) => (row.cases ? row.cases.map((c) => row.test.replace('${l.name}', c)) : [row.test]);

/** What one run's report says of the inventory: the problems, the rows checked, and the rows skipped because their spec
 *  (or, under --grep, their test) was not in this run, or because Playwright never runs their spec (templates/, unless
 *  the run's fileMap names it). A
 *  page-scoped hub:check run checks only its own page's rows and is never red for rows it did not run. */
export interface RunCheck {
  problems: string[];
  checked: number;
  skipped: number;
}

export function searchProofRunCheck(report: unknown, scope: RunScope = {}, rows: readonly ProofRow[] = SEARCH_PROOF_TESTS): RunCheck {
  const mapBad = scope.fileMap ? templateMapProblems(scope.fileMap) : [];
  if (mapBad.length) return { problems: mapBad, checked: 0, skipped: 0 };
  const tests = testsOf(report, scope.fileMap);
  const mapped = new Set(Object.values(scope.fileMap ?? {}));
  if (!tests) return { problems: ['the Playwright report has no suites: nothing it ran can be checked'], checked: 0, skipped: 0 };
  const bad: string[] = [];
  let checked = 0;
  let skipped = 0;
  for (const row of rows) {
    const titles = titlesOf(row);
    if ((!row.file.startsWith(RUN_ROOT) && !mapped.has(row.file)) || (scope.files && !scope.files.includes(row.file))) {
      skipped += titles.length;
      continue;
    }
    for (const title of titles) {
      const hits = tests.filter((t) => t.file === row.file && (t.path.at(-1) ?? '').startsWith(title));
      // Under --grep a row is required when the run selected its test (the report lists only selected tests, and
      // Playwright matches the whole title path, not the row's prefix) or when the grep names the
      // row itself, so a named row that is gone is still red.
      if (scope.grep && hits.length === 0 && !scope.grep.test(title)) {
        skipped++;
        continue;
      }
      checked++;
      if (hits.length === 0) {
        bad.push(`${row.file}: "${title}" did not run`);
        continue;
      }
      const merged = hits.find((h) => h.copies !== 1);
      if (merged) {
        bad.push(`${row.file} › ${merged.path.join(' › ')}: the report merges ${merged.copies} runs of this test (several projects or --repeat-each): the search proof gate needs one project and no --repeat-each`);
        continue;
      }
      if (hits.length > 1) {
        bad.push(`${row.file}: "${title}" matches ${hits.length} tests (${hits.map((t) => t.path.join(' › ')).join('; ')})`);
        continue;
      }
      const t = hits[0]!;
      const label = `${row.file} › ${t.path.join(' › ')}`;
      if (t.status !== 'passed') {
        bad.push(`${label}: ${t.status}`);
        continue;
      }
      for (const h of row.helpers as ProofHelper[]) {
        if (t.marks.includes(h)) continue;
        bad.push(
          t.foreign.includes(h)
            ? `${label}: passed without completing ${HELPER_NAME[h]} itself (its only mark names another test: a hook's copy)`
            : `${label}: passed without completing ${HELPER_NAME[h]}`,
        );
      }
    }
  }
  return { problems: bad, checked, skipped };
}

/** Every problem of the inventory against one run's report. */
export const searchProofRunProblems = (report: unknown, scope: RunScope = {}, rows: readonly ProofRow[] = SEARCH_PROOF_TESTS): string[] =>
  searchProofRunCheck(report, scope, rows).problems;

/** The gate's whole check: read the report (`read` throws when it is missing), parse it, check it. A report that cannot
 *  be read or parsed is red, never "nothing to check". */
export function searchProofReport(read: () => string, where: string, scope: RunScope = {}, rows: readonly ProofRow[] = SEARCH_PROOF_TESTS): RunCheck {
  let text: string;
  try {
    text = read();
  } catch (e) {
    return { problems: [`the Playwright report ${where} is missing or unreadable (${(e as Error).message})`], checked: 0, skipped: 0 };
  }
  let report: unknown;
  try {
    report = JSON.parse(text);
  } catch (e) {
    return { problems: [`the Playwright report ${where} is not JSON (${(e as Error).message})`], checked: 0, skipped: 0 };
  }
  return searchProofRunCheck(report, scope, rows);
}

export const searchProofReportProblems = (read: () => string, where: string, scope: RunScope = {}, rows: readonly ProofRow[] = SEARCH_PROOF_TESTS): string[] =>
  searchProofReport(read, where, scope, rows).problems;

/** A report file of its own for each run (two concurrent checks sharing one path could read each other's
 *  report). */
export const runReportPath = (outDir: string, id: string = globalThis.crypto.randomUUID()) => `${outDir}-report-${id}.json`;
