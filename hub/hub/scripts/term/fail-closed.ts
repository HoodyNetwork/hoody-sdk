// fail-closed.ts: the rules that make the term gates fail when they checked nothing. Pure
// functions, one per case, so each case has its own test (fail-closed.term.test.ts):
//   gateNames       an unknown --only/--skip name is an error (`--only tsts` would otherwise run nothing, green)
//   judgeTestRun    one `bun test <file>` run: no summary (the file exited before its tests finished), no tests,
//                   every test skipped, or fewer tests reported than the file declares
//   noInputs        a gate script with zero inputs (contract.ts siblings, scenarios.ts files, secrets.ts files)
//   noTestFiles     the tests gate found no test file at all

/** Names in `asked` that are not gates. Empty when every name is known. */
export function gateNames(asked: readonly string[] | null, known: readonly string[]): string[] {
  return (asked ?? []).filter((n) => !known.includes(n));
}

/** The text with comments, string and template-literal contents blanked (so `test(` inside a fixture string or a
 *  comment is not counted as a declared test). A lexer for counting only, not a parser. */
export function codeOnly(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; else if (c !== '`' && src[i] === '\n') break; i++; }
      i++;
      out += c + c;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Tests the file declares, as a LOWER bound: each lexical `test(`, `it(` and `test.skip(`/`.only(`/`.todo(`/
 * `.if(..)(`/`.skipIf(..)(`/`.each(..)(` call counts once (a loop or an `.each` table declares more, never fewer).
 */
export function declaredTests(src: string): number {
  const code = codeOnly(src);
  return [...code.matchAll(/(?<![\w$.])(?:test|it)\s*(?:\.\s*(?:skip|only|todo|failing|serial|concurrent)\s*)?(?:\.\s*(?:if|skipIf|todoIf|each)\s*\([^()]*(?:\([^()]*\)[^()]*)*\)\s*)?\(/g)].length;
}

export interface TestRunCounts { ran: number | null; pass: number; fail: number; skip: number; todo: number }

/** The counts bun test prints at the end of a run; `ran` is null when the summary line is missing. */
export function testRunCounts(out: string): TestRunCounts {
  const num = (re: RegExp): number => Number(re.exec(out)?.[1] ?? 0);
  const ran = /^Ran (\d+) tests? across \d+ files?\b/m.exec(out);
  return { ran: ran ? Number(ran[1]) : null, pass: num(/^\s*(\d+) pass\b/m), fail: num(/^\s*(\d+) fail\b/m), skip: num(/^\s*(\d+) skip\b/m), todo: num(/^\s*(\d+) todo\b/m) };
}

/** Why one test file's run checked nothing (or less than it declares); null when it ran what it declares. */
export function judgeTestRun(src: string, out: string): string | null {
  const c = testRunCounts(out);
  if (c.ran === null) return 'exited before its tests finished (bun test printed no "Ran N tests" summary)';
  const declared = declaredTests(src);
  if (c.ran === 0 || declared === 0) return 'has no tests (a test file must run at least one)';
  if (c.pass + c.fail === 0) return `every test was skipped (${c.skip} skip, ${c.todo} todo): nothing was checked`;
  if (c.ran < declared) return `reported ${c.ran} tests but declares at least ${declared}: the file stopped before the rest ran`;
  return null;
}

/** The refusal line for a gate script that found nothing to check; null when it had inputs. */
export function noInputs(script: string, what: string, n: number): string | null {
  return n > 0 ? null : `${script}: found no ${what} to check; a gate that checked nothing fails (is the tree or the glob wrong?)`;
}

export function noTestFiles(n: number): string | null {
  return n > 0 ? null : 'found no *.term.test.{ts,tsx} file; the tests gate fails when it ran nothing';
}
