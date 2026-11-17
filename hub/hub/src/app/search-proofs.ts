// The search proof inventory: every @search / @reload test of a list view, by file and title, and the helper(s)
// it must complete (app/e2e-search.ts). The helpers hold the proof. Two checks read it:
// - the run checker (app/search-proofs-run.ts, in hub:check's Playwright step): each row ran, passed and completed its
//   helpers, read from the run's report. That is the execution claim.
// - the static lint below (app/conformance.test.ts, pages/billing/servers-spec-tags.test.ts): a listed test exists and
//   names its helpers, and every tagged test is listed. It claims only that a listed test names the helper, never that
//   the call runs. Pure: it takes spec sources as text.
import type * as TSModule from 'typescript';

/** S = expectSearchStaysOutOfUrl, R = expectLinkSearchDroppedOnReload. */
export type ProofHelper = 'S' | 'R';
export const HELPER_NAME: Record<ProofHelper, string> = { S: 'expectSearchStaysOutOfUrl', R: 'expectLinkSearchDroppedOnReload' };

export interface ProofRow {
  /** Hub-relative spec path. */
  file: string;
  /** The start of the test's title as written (a template title keeps `${l.name}`). */
  test: string;
  helpers: ProofHelper[];
  /** A parameterised title: the names its `LISTS` array literal must declare, in order. */
  cases?: string[];
}

const S: ProofHelper[] = ['S'];
const R: ProofHelper[] = ['R'];
const SR: ProofHelper[] = ['S', 'R'];
const page = (id: string, search: string, reload: string): ProofRow[] => [
  { file: `src/pages/${id}/page.spec.ts`, test: search, helpers: S },
  { file: `src/pages/${id}/page.spec.ts`, test: reload, helpers: R },
];
const SEARCH_STD = '@search the search box narrows the rows and never writes ?q';

export const SEARCH_PROOF_TESTS: readonly ProofRow[] = [
  { file: 'src/kit/data/DataTable.spec.ts', test: '@search search folds case', helpers: S },
  { file: 'src/kit/data/DataTable.spec.ts', test: '@reload chips and sort survive', helpers: R },
  ...page('account', '@search the sessions table', '@reload a reload keeps the ended list'),
  { file: 'src/pages/ai/auto.spec.ts', test: '@search ${l.name}:', helpers: S, cases: ['Workflows', 'Loops', 'TODOs'] },
  { file: 'src/pages/ai/auto.spec.ts', test: '@reload ${l.name}:', helpers: R, cases: ['Workflows', 'Loops', 'TODOs'] },
  ...page('ai', '@search the Accounts search', '@reload the Accounts search'),
  { file: 'src/pages/ai/memory.spec.ts', test: '@search the ranked search narrows the memories', helpers: S },
  { file: 'src/pages/ai/skills.spec.ts', test: '@search the search box narrows the skills', helpers: S },
  { file: 'src/pages/ai/skills.spec.ts', test: '@reload State, sort and page survive', helpers: R },
  ...page('api', '@search the search box narrows the endpoints', '@reload service, sort and the open endpoint survive'),
  ...page('billing', '@search the search box narrows the subscriptions', '@reload sort survives a reload'),
  { file: 'src/pages/billing/page.spec.ts', test: 'servers: search narrows the list', helpers: S },
  { file: 'src/pages/billing/page.spec.ts', test: 'servers: filter, sort and page survive', helpers: R },
  ...page('bots', '@search search narrows the table', '@reload chip, sort and page survive'),
  { file: 'src/pages/computers/list.spec.ts', test: '@search the search box narrows the rows to matching computers', helpers: S },
  { file: 'src/pages/computers/page.spec.ts', test: '@search @reload search narrows the table', helpers: SR },
  ...page('demo', SEARCH_STD, '@reload chip, sort, page and the open row survive'),
  ...page('files', '@search the search box narrows the rows and never writes ?aq', '@reload the folder, chip, sort and page'),
  ...page('keys', SEARCH_STD, '@reload chip, sort, page and the open key'),
  { file: 'src/pages/logs/page.spec.ts', test: '@search @no-match search narrows the list', helpers: S },
  { file: 'src/pages/logs/page.spec.ts', test: '@filter @search @reload severity and search from a link', helpers: R },
  { file: 'src/pages/logs/page.spec.ts', test: '@search typing in the search box never writes q', helpers: S },
  { file: 'src/pages/logs/page.spec.ts', test: '@search @reload the Program output search', helpers: SR },
  { file: 'src/pages/logs/page.spec.ts', test: '@reload a filter and the time cursor survive', helpers: R },
  ...page('notes', SEARCH_STD, '@reload filter, sort and page survive'),
  ...page('notifications', SEARCH_STD, '@reload sort and page 2 survive'),
  { file: 'src/pages/notifications/notices.spec.ts', test: '@search the search box narrows the rows and never writes ?q', helpers: S },
  { file: 'src/pages/notifications/notices.spec.ts', test: '@reload the status chip, sort and page 2 survive a reload, the search does not', helpers: R },
  ...page('programs', SEARCH_STD, '@reload State filter, sort, page and the open row'),
  ...page('schedules', SEARCH_STD, '@reload chip, sort, page and the open row survive'),
  ...page('scripts', '@search search narrows the rows', '@reload chip, sort and page survive'),
  ...page('support', '@search the search box narrows the loaded rows', '@reload status and the open ticket'),
  ...page('tunnels', SEARCH_STD, '@reload chip, sort, page and the open row survive'),
  ...page('vault', SEARCH_STD, '@reload partition, chip, sort, page and the open entry'),
  ...page('vms', SEARCH_STD, '@reload sort and page survive a reload'),
  { file: 'templates/page-list-detail/page.spec.ts', test: SEARCH_STD, helpers: S },
  { file: 'templates/page-list-detail/page.spec.ts', test: '@reload chip, sort, page and the open row survive', helpers: R },
  { file: 'templates/page-table/page.spec.ts', test: SEARCH_STD, helpers: S },
  { file: 'templates/page-table/page.spec.ts', test: '@reload chip, sort, page and the open drawer survive', helpers: R },
];

/** Tagged tests that are not search scenarios: they stay as written. */
export const SEARCH_PROOF_EXCLUDED: readonly { file: string; test: string; reason: string }[] = [
  { file: 'src/pages/logs/page.spec.ts', test: '@filter @reload a source and how it went', reason: 'no search: a source and an outcome filter across a reload' },
  { file: 'src/pages/logs/page.spec.ts', test: '@reload a More source chosen', reason: 'no search: which More source a bare link restores' },
  { file: 'src/pages/computers/list.spec.ts', test: '@reload a sort survives a reload', reason: 'sort only' },
  { file: 'src/pages/computers/list.spec.ts', test: '@reload a page survives a reload', reason: 'paging only' },
];

// ── the scanner ──────────────────────────────────────────────────────────────────────────────────────────────────────

const CONTROL_HEADS = new Set(['if', 'while', 'for', 'with']);
const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'await', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'else']);

/** `src` with every comment blanked, and with every string, template text and regex literal blanked too when
 *  `strings` (delimiters kept; a template's `${…}` code kept). Blanks are spaces, newlines stay, so offsets carry over. */
export function blank(src: string, strings: boolean): string {
  const out = src.split('');
  const wipe = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  // The brace depth at which each open template's `${…}` closes.
  const resume: number[] = [];
  let depth = 0;
  // The last significant code token: '' at the start, an operator character, or 'v' for a value (name, literal, `)`).
  let prev = '';
  // The last word, and for each open parenthesis whether it is a control head (`if (…)`, `while (…)`, `for (…)`,
  // `with (…)`): after its `)` a statement starts, so a `/` there opens a regex (`if (x) /re/.test(y)`).
  let word = '';
  const parens: boolean[] = [];
  // From `start` (just inside a template's text) to its closing backtick or its next `${`; the index to go on from.
  const templateText = (start: number): number => {
    let j = start;
    while (j < src.length && src[j] !== '`' && !(src[j] === '$' && src[j + 1] === '{')) j += src[j] === '\\' ? 2 : 1;
    if (strings) wipe(start, j);
    if (src[j] === '$') {
      resume.push(depth);
      depth++;
      prev = '{';
      return j + 2;
    }
    prev = 'v';
    return j + 1;
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i] ?? '';
    const n = src[i + 1] ?? '';
    if (c === '/' && n === '/') {
      const e = src.indexOf('\n', i);
      const end = e < 0 ? src.length : e;
      wipe(i, end);
      i = end;
      continue;
    }
    if (c === '/' && n === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e < 0 ? src.length : e + 2;
      wipe(i, end);
      i = end;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      if (strings) wipe(i + 1, j);
      i = j + 1;
      prev = 'v';
      continue;
    }
    if (c === '`') {
      i = templateText(i + 1);
      continue;
    }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev))) {
      // A regex literal, up to its closing slash (outside a class) and its flags.
      let j = i + 1;
      let inClass = false;
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        j++;
      }
      if (strings) wipe(i + 1, j);
      j++;
      while (/[a-z]/i.test(src[j] ?? '')) j++;
      i = j;
      prev = 'v';
      continue;
    }
    if (/[\w$]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w$]/.test(src[j] ?? '')) j++;
      // A name right after `.` (or `?.`) is a property, never a keyword or a control head: `o.for(2) / 2` and
      // `o.return / 2` divide.
      const property = prev === '.';
      word = property ? '' : src.slice(i, j);
      prev = KEYWORDS_BEFORE_REGEX.has(word) ? '(' : 'v';
      i = j;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (resume.length > 0 && resume[resume.length - 1] === depth) {
        resume.pop();
        i = templateText(i + 1);
        continue;
      }
    }
    if (!/\s/.test(c)) {
      if (c === '(') parens.push(CONTROL_HEADS.has(word) && prev === 'v');
      prev = c === ')' ? (parens.pop() ? '(' : 'v') : c === ']' ? 'v' : c;
      word = '';
    }
    i++;
  }
  return out.join('');
}

/** The index of the bracket that closes the one at `open` in blanked code, or -1. */
export function closeOf(code: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const stack: string[] = [];
  for (let i = open; i < code.length; i++) {
    const c = code[i] ?? '';
    if (c in pairs) stack.push(pairs[c] ?? '');
    else if (c === ')' || c === ']' || c === '}') {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

export interface SpecTest {
  title: string;
  /** The test call's code (comments, strings and regex literals blanked), from `test(` to its `)`. */
  code: string;
  /** Why the test does not run as written, or '' when it does. */
  notRun: string;
}

const DESCRIBE = /\btest\.describe(?:\.(only|serial|parallel|skip|fixme))?\s*$/;
const DECLARE = /\btest((?:\.\w+)?)\(\s*(['"`])/g;

/** Every `test(…)` / `test.only|skip|fixme|fail(…)` declaration of a spec: its written title, its code, and whether it
 *  runs. A declaration runs when it is not skipped (by itself, its own `test.skip(…)` call, or a skipped describe) and
 *  every bracket around it is a `test.describe(…)` call, that call's arrow body, or a `for` loop's (a test inside a
 *  function, a condition or a callback of anything else is not taken to run). Comments and strings never count. */
export function specTests(src: string): SpecTest[] {
  const kept = blank(src, false);
  const code = blank(src, true);
  // The brackets open at each point: their character and whether a test inside them runs (and why not).
  type Frame = { c: string; ok: boolean; why: string; isFor: boolean };
  const stack: Frame[] = [];
  let forClosedAt = -1;
  const decls = new Map<number, RegExpExecArray>();
  for (const m of code.matchAll(DECLARE)) if (['', '.only', '.skip', '.fixme', '.fail'].includes(m[1] ?? '')) decls.set(m.index ?? 0, m as RegExpExecArray);
  const out: SpecTest[] = [];
  for (let i = 0; i < code.length; i++) {
    const m = decls.get(i);
    if (m) {
      const open = i + m[0].indexOf('(');
      const close = closeOf(code, open);
      if (close > 0) {
        const q = open + m[0].slice(m[0].indexOf('(')).search(/['"`]/);
        const quote = src[q] ?? "'";
        let e = q + 1;
        while (e < kept.length && kept[e] !== quote) e += kept[e] === '\\' ? 2 : 1;
        const body = code.slice(open, close + 1);
        const outer = stack.find((f) => !f.ok);
        const mod = m[1] ?? '';
        const notRun = outer
          ? outer.why
          : mod === '.skip' || mod === '.fixme' || mod === '.fail'
            ? `is declared ${mod.slice(1)}`
            : /\btest\.(skip|fixme|fail)\(/.test(body)
              ? 'skips itself'
              : '';
        out.push({ title: kept.slice(q + 1, e), code: body, notRun });
      }
    }
    const c = code[i] ?? '';
    if (c === '(') {
      const before = code.slice(Math.max(0, i - 60), i);
      const d = DESCRIBE.exec(before);
      const isFor = /\bfor\s*$/.test(before);
      const skipped = d?.[1] === 'skip' || d?.[1] === 'fixme';
      stack.push({ c, ok: (!!d && !skipped) || isFor, why: skipped ? `is in a skipped describe` : 'is not declared at the top level or in a describe', isFor });
    } else if (c === '{') {
      const before = code.slice(0, i).trimEnd();
      const top = stack[stack.length - 1];
      const arrowOfDescribe = before.endsWith('=>') && !!top && top.c === '(' && top.ok && !top.isFor;
      const forBody = before.endsWith(')') && forClosedAt === before.length - 1;
      stack.push({ c, ok: arrowOfDescribe || forBody, why: top && !top.ok ? top.why : 'is not declared at the top level or in a describe', isFor: false });
    } else if (c === '[') stack.push({ c, ok: false, why: 'is not declared at the top level or in a describe', isFor: false });
    else if (c === ')' || c === '}' || c === ']') {
      const f = stack.pop();
      if (c === ')' && f?.isFor) forClosedAt = i;
    }
  }
  return out;
}

/** Whether a test's code awaits `name(…)` as one of its own statements (not nested in a function, a condition or a
 *  loop of the test body), 'nested' when it calls it only elsewhere, or 'absent'. */
export function reaches(code: string, name: string): 'yes' | 'nested' | 'absent' {
  const hits = [...code.matchAll(new RegExp(`\\b${name}\\(`, 'g'))].map((m) => m.index ?? 0);
  if (hits.length === 0) return 'absent';
  // The callback's body: the first `{` after `=>` at the call's own depth.
  for (const at of hits) {
    const stack: string[] = [];
    let bodyDepth = -1;
    for (let i = 0; i < at; i++) {
      const c = code[i] ?? '';
      if (c === '(' || c === '[' || c === '{') {
        stack.push(c);
        if (c === '{' && bodyDepth < 0 && stack.length === 2 && code.slice(0, i).trimEnd().endsWith('=>')) bodyDepth = 2;
      } else if (c === ')' || c === ']' || c === '}') stack.pop();
    }
    if (bodyDepth !== 2 || stack.length !== 2 || stack[1] !== '{') continue;
    const lead = code.slice(0, at).trimEnd();
    if (!lead.endsWith('await')) continue;
    const prior = lead.slice(0, -'await'.length).trimEnd();
    if (/[;{}]$/.test(prior)) return 'yes';
  }
  return 'nested';
}

// ── where a helper may be called ──────
// The runtime mark says a helper completed while a test was current (test.info() is one worker-wide slot), not who
// called it. A beforeAll or beforeEach hook, a fixture, or a call deferred from another test all run while some test is
// current, and the first test of a describe gets such a mark under its own id, so the id check in the run gate
// (search-proofs-run.ts) never answers WHERE. This rule does, over the whole tree (hub/src and hub/templates, every
// module Playwright can load: .ts .tsx .mts .cts .js .jsx .mjs .cjs), on the TypeScript AST:
// - S and R may be called only by a statement that is exactly `await S(…);` / `await R(…);` (an ExpressionStatement
//   whose expression is an AwaitExpression of a CallExpression whose callee is the identifier), a direct child of the
//   Block body of an inline arrow or function expression passed directly to `test(…)` or `test.only|skip|fixme|fail(…)`,
//   in a *.spec.ts file that imports S/R by name from app/e2e and whose `test` is a named import (no rename) from
//   @playwright/test or app/e2e, with nothing else binding the name `test` (a variable, a parameter, a destructured
//   name, a function or class name, a default or namespace import). An expression-bodied arrow
//   (`async () => await S(…)`) is refused. A call after a top-level return or throw of that body is dead code and refused.
// - "app/e2e" is the module itself, not its spelling: an import path is resolved (relative to the file, or by the hub's
//   path aliases @app/ @kit/ @core/ @shell/, with or without an extension) and must be src/app/e2e or
//   src/app/e2e-search. A module elsewhere that happens to be named e2e is any other module.
// - Every other reference to S or R is red, except their definitions (app/e2e-search.ts), the single named re-export in
//   app/e2e.ts, and the helpers' own tests (kit/e2e-search/helpers.spec.ts).
// - Everywhere: no namespace or default import, no `export *` or `export * as`, no `import()` or `require` of app/e2e or
//   app/e2e-search, no import of S or R under another name, and no destructured name S, R, markProof or
//   PROOF_ANNOTATION (by identifier or string key).
// - The mark (the 'l064' text, the names PROOF_ANNOTATION and markProof, imports and exports included) appears in no file
//   but e2e-search.ts and the gate (search-proofs-run.ts, this file), unit tests (*.test.*) aside; and no module other
//   than a unit test imports a unit test (its code would run under Playwright, outside the rule).
// - A file is parsed when its text, with \u, \x and line-continuation escapes decoded, names a helper, 'e2e', 'l064',
//   PROOF_ANNOTATION or markProof (escaped spellings no longer skip the scan).
// Not covered (stated): a name or a mark assembled at run time (string concatenation, computed keys from variables), and
// a module outside hub/src and hub/templates.
// `ts` is passed in (the conformance test imports typescript) so this module, which the hub:check gate loads, does not.

type TS = typeof TSModule;
type Node = TSModule.Node;
const HELPERS = new Set(Object.values(HELPER_NAME));
const MARK_NAMES = new Set(['PROOF_ANNOTATION', 'markProof']);
const HELPER_MODULES = new Set(['src/app/e2e.ts', 'src/app/e2e-search.ts']);
const ALIASES: [string, string][] = [['@app/', 'src/app/'], ['@kit/', 'src/kit/'], ['@core/', 'src/core/'], ['@shell/', 'src/shell/']];
const MODULE_EXT = /\.(d\.)?[mc]?[jt]sx?$/;
const UNIT_TEST = /\.test(\.[mc]?[jt]sx?)?$/;
const DEFINED_IN = 'src/app/e2e-search.ts';
const REEXPORT_IN = 'src/app/e2e.ts';
const OWN_TESTS = 'src/kit/e2e-search/helpers.spec.ts';
const MARK_OWNERS = new Set([DEFINED_IN, 'src/app/search-proofs-run.ts', 'src/app/search-proofs.ts']);
const TEST_MODS = new Set(['only', 'skip', 'fixme', 'fail']);

/** Playwright's own lookup (playwright/lib/transform, resolveImportSpecifierExtension): the named file when it exists, else the
 * first existing sibling for the first entry whose extension the path ends with ('' matches any). Order matters: a bare
 * `@app/e2e` loads an `e2e.js` before `e2e.ts`, and `e2e.js` loads `e2e.ts` only when no `e2e.js` exists. */
const EXT_LOOKUPS: [string, string[]][] = [
  ['.js', ['.jsx', '.ts', '.tsx']],
  ['.jsx', ['.tsx']],
  ['.cjs', ['.cts']],
  ['.mjs', ['.mts']],
  ['', ['.js', '.ts', '.jsx', '.tsx', '.cjs', '.mjs', '.cts', '.mts']],
];
const byExtension = (path: string, exists: (f: string) => boolean): string | undefined => {
  if (exists(path)) return path;
  const [ext, others] = EXT_LOOKUPS.find(([e]) => path.endsWith(e)) ?? ['', []];
  return others.map((o) => path.slice(0, path.length - ext.length) + o).find(exists);
};

/** The hub-relative file a specifier loads from `file`, resolved as Playwright does against `files` (the scanned tree; the two
 * helper modules count as present, so a probe need not carry them), then a directory's index; an unresolved path keeps its
 * spelling (never a helper module). Null for a package. */
export function resolveModule(file: string, spec: string, files: ReadonlySet<string> = new Set()): string | null {
  const r = resolveSpec(file, spec, files);
  return r && (r.loads ?? r.spelled);
}

/** resolveModule's parts: the path as spelled, and the file it loads (undefined when no file in `files` matches). */
function resolveSpec(file: string, spec: string, files: ReadonlySet<string>): { spelled: string; loads: string | undefined } | null {
  let path: string;
  if (spec.startsWith('.')) path = `${file.slice(0, file.lastIndexOf('/') + 1)}${spec}`;
  else {
    const alias = ALIASES.find(([a]) => spec.startsWith(a));
    if (!alias) return null;
    path = alias[1] + spec.slice(alias[0].length);
  }
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  const rel = out.join('/');
  const exists = (f: string) => files.has(f) || HELPER_MODULES.has(f);
  return { spelled: rel, loads: byExtension(rel, exists) ?? byExtension(`${rel}/index`, exists) };
}

/** The text with \uXXXX, \u{…}, \xXX and line-continuation escapes decoded, for the prefilter only. A continuation is a
 * backslash before any line terminator the TypeScript scanner accepts (CRLF, LF, CR, U+2028, U+2029). An escape past
 * U+10FFFF is not a character: it stays as written (a comment or String.raw may hold one; decoding must never throw). */
const unescape = (text: string) =>
  text.includes('\\')
    ? text
        .replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (raw, a, b, c) => {
          const cp = parseInt(a ?? b ?? c, 16);
          return cp <= 0x10ffff ? String.fromCodePoint(cp) : raw;
        })
        .replace(/\\(?:\r\n|[\n\r\u2028\u2029])/g, '')
    : text;

const scriptKind = (ts: TS, file: string) =>
  file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.jsx') ? ts.ScriptKind.JSX : /\.[mc]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;

/** Every misplaced use of S or R, and every misplaced mark, in `sources` (hub-relative path -> text). Pure. */
export function helperUseProblems(ts: TS, sources: Record<string, string>): string[] {
  const bad: string[] = [];
  let reexports = 0;
  const files = new Set(Object.keys(sources));
  for (const [file, text] of Object.entries(sources)) {
    const isTest = UNIT_TEST.test(file.replace(MODULE_EXT, ''));
    const markCheck = !isTest && !MARK_OWNERS.has(file);
    const plain = unescape(text);
    const mentions =
      [...HELPERS].some((h) => plain.includes(h)) || plain.includes('e2e') || (markCheck && (plain.includes('l064') || [...MARK_NAMES].some((m) => plain.includes(m)))) || (!isTest && /\.test['"`]|\.test\.[mc]?[jt]sx?['"`]/.test(plain));
    if (!mentions || file === DEFINED_IN) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(ts, file));
    const at = (n: Node) => `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
    const isSpec = file.endsWith('.spec.ts') && file !== OWN_TESTS;
    const isHelperModule = (m: string | null) => m !== null && HELPER_MODULES.has(resolveModule(file, m, files) ?? '');
    const isTestModule = (m: string | null) => m === '@playwright/test' || isHelperModule(m);
    // `test` is ours when it is a plain named import from @playwright/test or app/e2e and nothing else binds the name.
    let testImported = false;
    let testRedeclared = false;
    /** The helpers this file imports by name from app/e2e. */
    const helpersImported = new Set<string>();
    const bindsTest = (name: TSModule.BindingName | undefined): boolean => {
      if (!name) return false;
      if (ts.isIdentifier(name)) return name.text === 'test';
      return name.elements.some((e) => !ts.isOmittedExpression(e) && bindsTest(e.name));
    };
    const visitDecl = (n: Node) => {
      if ((ts.isVariableDeclaration(n) || ts.isParameter(n)) && bindsTest(n.name)) testRedeclared = true;
      if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isClassDeclaration(n) || ts.isClassExpression(n) || ts.isEnumDeclaration(n) || ts.isImportEqualsDeclaration(n)) && n.name?.text === 'test') testRedeclared = true;
      if (ts.isImportClause(n) && n.name?.text === 'test') testRedeclared = true;
      if (ts.isNamespaceImport(n) && n.name.text === 'test') testRedeclared = true;
      if (ts.isImportSpecifier(n)) {
        const decl = n.parent.parent.parent;
        const from = ts.isImportDeclaration(decl) && ts.isStringLiteral(decl.moduleSpecifier) ? decl.moduleSpecifier.text : null;
        if (n.name.text === 'test') {
          if (!n.propertyName && isTestModule(from)) testImported = true;
          else testRedeclared = true;
        }
        if (!n.propertyName && HELPERS.has(n.name.text) && isHelperModule(from)) helpersImported.add(n.name.text);
      }
      ts.forEachChild(n, visitDecl);
    };
    visitDecl(sf);
    const testIsOurs = testImported && !testRedeclared;
    /** Whether `call` is `test(…)` / `test.<mod>(…)` with our `test`. */
    const isTestCall = (call: Node): boolean => {
      if (!ts.isCallExpression(call)) return false;
      const e = call.expression;
      if (ts.isIdentifier(e)) return e.text === 'test';
      return ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'test' && TEST_MODS.has(e.name.text);
    };
    /** Why a reference to S or R at `id` is not a body-top awaited call of a test, or '' when it is. */
    const placement = (id: TSModule.Identifier): string => {
      if (!isSpec) return `${file === OWN_TESTS ? '' : 'is referenced outside a spec: only a test body calls it'}`;
      const call = id.parent;
      if (!ts.isCallExpression(call) || call.expression !== id) return 'is used as a value (an alias, an argument, an export or a property): call it as `await ' + id.text + '(…);` in a test body';
      const aw = call.parent;
      const stmt = aw?.parent;
      if (!ts.isAwaitExpression(aw) || !stmt || !ts.isExpressionStatement(stmt)) return 'is not a statement `await ' + id.text + '(…);`';
      const block = stmt.parent;
      const fn = block?.parent;
      if (!ts.isBlock(block) || !fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) || fn.body !== block) return "is called outside a test's own body (a hook, a fixture, a function, a callback, a condition, a loop, a try or a block)";
      const decl = fn.parent;
      if (!isTestCall(decl) || !(decl as TSModule.CallExpression).arguments.includes(fn as TSModule.Expression)) return "is called outside a test's own body (a hook, a fixture, a function, a callback, a condition, a loop, a try or a block)";
      if (!testIsOurs) return 'is called in a test whose `test` is not the named import from @playwright/test or app/e2e';
      if (!helpersImported.has(id.text)) return 'is not the named import from app/e2e';
      const before = block.statements.slice(0, block.statements.indexOf(stmt));
      const dead = before.find((b) => ts.isReturnStatement(b) || ts.isThrowStatement(b));
      if (dead) return `comes after a top-level ${ts.isReturnStatement(dead) ? 'return' : 'throw'} of its test, so it never runs`;
      return '';
    };
    const moduleOf = (n: Node | undefined) => (n && ts.isStringLiteralLike(n) ? n.text : null);
    const markName = (names: (string | undefined)[]) => markCheck && names.some((x) => x !== undefined && MARK_NAMES.has(x));
    /** A module path that names a unit test, loaded from a module that is not one. */
    const loadsUnitTest = (n: Node, m: string | null) => {
      if (!isTest && m && UNIT_TEST.test(m.replace(MODULE_EXT, ''))) bad.push(`${at(n)}: loads the unit test ${m}: its code would run under Playwright, outside this rule`);
    };
    const visit = (n: Node) => {
      if (ts.isImportDeclaration(n)) {
        const m = moduleOf(n.moduleSpecifier);
        const c = n.importClause;
        // `import type` is erased (verbatimModuleSyntax), so it runs nothing; `import { type X }` stays as a load.
        if (!c?.isTypeOnly) loadsUnitTest(n, m);
        if (isHelperModule(m) && c) {
          if (c.name) bad.push(`${at(n)}: imports ${m} as a default: import the helpers by name`);
          if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) bad.push(`${at(n)}: imports ${m} as a namespace: import the helpers by name`);
        }
        if (c?.namedBindings && ts.isNamedImports(c.namedBindings)) {
          for (const el of c.namedBindings.elements) {
            const names = [el.name.text, el.propertyName?.text].filter(Boolean) as string[];
            if (el.propertyName && names.some((x) => HELPERS.has(x))) bad.push(`${at(el)}: imports ${el.propertyName.text} as ${el.name.text}: import the helpers by their own names`);
            else if (HELPERS.has(el.name.text) && !isHelperModule(m)) {
              // Name the file only when one was found: an unresolved spelling loads nothing.
              const loads = m === null ? undefined : resolveSpec(file, m, files)?.loads;
              bad.push(`${at(el)}: imports ${el.name.text} from ${m}${loads?.startsWith('src/app/e2e') ? ` (which loads ${loads})` : ''}, not from app/e2e`);
            }
            if (markName(names)) bad.push(`${at(el)}: imports ${names.join(' as ')}, the search proof mark: only app/e2e-search.ts writes it`);
          }
        }
        return;
      }
      if (ts.isExportDeclaration(n)) {
        const m = moduleOf(n.moduleSpecifier);
        if (!n.isTypeOnly) loadsUnitTest(n, m); // `export type { … } from` is erased like `import type`
        if (isHelperModule(m) && !n.exportClause) bad.push(`${at(n)}: \`export * from '${m}'\` passes the helpers on unchecked`);
        if (isHelperModule(m) && n.exportClause && ts.isNamespaceExport(n.exportClause)) bad.push(`${at(n)}: \`export * as ${n.exportClause.name.text} from '${m}'\` passes the helpers on unchecked`);
        if (n.exportClause && ts.isNamedExports(n.exportClause)) {
          for (const el of n.exportClause.elements) {
            const names = [el.name.text, el.propertyName?.text].filter(Boolean) as string[];
            if (markName(names)) bad.push(`${at(el)}: re-exports ${names.join(' as ')}, the search proof mark: only app/e2e-search.ts writes it`);
            if (!names.some((x) => HELPERS.has(x))) continue;
            if (file === REEXPORT_IN && !el.propertyName && m === './e2e-search') reexports++;
            else bad.push(`${at(el)}: re-exports ${names.join(' as ')}: only app/e2e.ts passes the helpers on, once`);
          }
        }
        return;
      }
      if (ts.isCallExpression(n)) {
        const callee = n.expression;
        const dyn = callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require');
        const m = moduleOf(n.arguments[0]);
        if (dyn) loadsUnitTest(n, m);
        if (dyn && isHelperModule(m)) bad.push(`${at(n)}: loads ${m} with ${ts.isIdentifier(callee) ? 'require' : 'import'}(…): import the helpers by name`);
      }
      if (ts.isBindingElement(n) && file !== OWN_TESTS) {
        const key = n.propertyName ?? n.name;
        const k = ts.isIdentifier(key) || ts.isStringLiteralLike(key) ? key.text : ts.isComputedPropertyName(key) && ts.isStringLiteralLike(key.expression) ? key.expression.text : undefined;
        if (k !== undefined && (HELPERS.has(k) || markName([k]))) bad.push(`${at(n)}: destructures ${k}: import the helpers by name`);
      }
      if (ts.isIdentifier(n) && HELPERS.has(n.text) && !ts.isImportSpecifier(n.parent) && !ts.isExportSpecifier(n.parent) && !(ts.isBindingElement(n.parent) && file !== OWN_TESTS)) {
        const why = file === OWN_TESTS ? '' : placement(n);
        if (why) bad.push(`${at(n)}: ${n.text} ${why}`);
      }
      const lit = ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n);
      if (markCheck && ((lit && n.text.includes('l064')) || (ts.isIdentifier(n) && MARK_NAMES.has(n.text) && !ts.isBindingElement(n.parent)))) bad.push(`${at(n)}: names the search proof mark: only app/e2e-search.ts writes it`);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  if (REEXPORT_IN in sources && reexports > 2) bad.push(`${REEXPORT_IN}: re-exports the helpers more than once`);
  return bad;
}

/** The `name: '…'` entries of a spec's `LISTS` array literal, in order (comments never count). */
export function listCases(src: string): string[] {
  const kept = blank(src, false);
  const at = /\bLISTS\b[^=]*=\s*\[/.exec(kept);
  if (!at) return [];
  const open = (at.index ?? 0) + at[0].length - 1;
  const end = closeOf(blank(src, true), open);
  return [...kept.slice(open, end < 0 ? kept.length : end).matchAll(/\bname:\s*'([^']+)'/g)].map((m) => m[1] ?? '');
}

const TAGGED = /@(search|reload)\b/;

/** Every problem of the inventory against the specs (file -> source). `files` limits the check to those specs. */
export function searchProofProblems(sources: Record<string, string>, rows: readonly ProofRow[] = SEARCH_PROOF_TESTS, excluded = SEARCH_PROOF_EXCLUDED): string[] {
  const bad: string[] = [];
  const claimed = new Map<string, Set<number>>();
  const claim = (file: string, i: number) => (claimed.get(file) ?? claimed.set(file, new Set()).get(file)!).add(i);
  const testsOf = new Map(Object.entries(sources).map(([f, s]) => [f, specTests(s)]));
  for (const row of rows) {
    const tests = testsOf.get(row.file);
    if (!tests) continue;
    const hits = tests.map((t, i) => ({ t, i })).filter(({ t }) => t.title.startsWith(row.test));
    if (hits.length === 0) {
      bad.push(`${row.file}: missing "${row.test}"`);
      continue;
    }
    if (hits.length > 1) bad.push(`${row.file}: "${row.test}" matches ${hits.length} tests`);
    for (const { t, i } of hits) {
      claim(row.file, i);
      if (t.notRun) bad.push(`${row.file}: "${row.test}" ${t.notRun}`);
      for (const h of row.helpers) {
        const r = reaches(t.code, HELPER_NAME[h]);
        if (r === 'absent') bad.push(`${row.file}: "${row.test}" does not call ${HELPER_NAME[h]}`);
        else if (r === 'nested') bad.push(`${row.file}: "${row.test}" calls ${HELPER_NAME[h]} only where it may not run (await it as a statement of the test)`);
      }
    }
    if (row.cases) {
      const got = listCases(sources[row.file] ?? '');
      for (const c of row.cases) if (!got.includes(c)) bad.push(`${row.file}: "${row.test}" missing case ${c}`);
      for (const c of got) if (!row.cases.includes(c)) bad.push(`${row.file}: "${row.test}" unlisted case ${c}`);
    }
  }
  for (const ex of excluded) {
    const tests = testsOf.get(ex.file);
    if (!tests) continue;
    const i = tests.findIndex((t) => t.title.startsWith(ex.test));
    if (i < 0) bad.push(`${ex.file}: excluded test missing "${ex.test}"`);
    else claim(ex.file, i);
  }
  for (const [file, tests] of testsOf) {
    tests.forEach((t, i) => {
      if (TAGGED.test(t.title) && !claimed.get(file)?.has(i)) bad.push(`${file}: unlisted "${t.title}"`);
    });
  }
  return bad;
}
