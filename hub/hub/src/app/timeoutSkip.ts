// After a vitest timeout the rest of that file is skipped, and the first timeout is the real red (app/test-setup.ts).
// vitest stops waiting for a timed-out test but cannot stop its body, which is usually still inside an unfinished
// `await act(async ...)`. React's act queue is shared, so every later render in the file is queued into that act and
// never mounts: each later test would fail falsely (findBy* finds nothing, a probe stays unset) after waiting out its
// own timeout. Fails closed: a test that has started is never touched (the timed-out one's retries and repeats run, and a
// concurrent or shuffled test that already started or finished keeps its result), the tests not yet started are marked
// skipped before they start (so none of their hooks run), and a file whose tests were skipped must end red.

/** vitest 5's own timeout errors, whole: a test body or a hook (runner makeTimeoutError: the timeout, the optional
 *  "while waiting for <operation names>", which may hold any character, and the fixed advice line), or an aroundEach /
 *  aroundAll phase (makeAroundHookTimeoutError). The timeout is a JavaScript number as interpolated: whole, fractional,
 *  exponent (1e-7, 1e+21) or Infinity. A user error that only starts or ends the same way does not match (`$` without
 *  the m flag is the end of the string). */
const NUM = String.raw`(?:\d+(?:\.\d+)?(?:e[+-]\d+)?|Infinity)`;
const MS = String.raw`${NUM}ms(?: while waiting for [\s\S]*)?`;
const AROUND = String.raw`The (?:setup|teardown) phase of "around(?:Each|All)" hook timed out after ${NUM}ms\.`;
const advice = (k: 'test' | 'hook') => String.raw`\.\nIf this is a long-running ${k}, pass a timeout value as the last argument or configure it globally with "${k}Timeout"\.`;
const TIMED_OUT = new RegExp(`^(?:Test timed out in ${MS}${advice('test')}|Hook timed out in ${MS}${advice('hook')}|${AROUND})$`);

export const isVitestTimeout = (message: unknown): boolean => typeof message === 'string' && TIMED_OUT.test(message);

/** The parts of a vitest task this reads and writes (a test, a suite or the file). */
export interface SkipTask {
  type: string;
  name: string;
  mode: string;
  tasks?: SkipTask[];
  result?: { state?: string; errors?: ReadonlyArray<{ message?: unknown }>; note?: string };
}

const timedOut = (t: SkipTask): boolean => !!t.result?.errors?.some((e) => isVitestTimeout(e.message));
const tests = (t: SkipTask): SkipTask[] => (t.type === 'test' ? [t] : (t.tasks ?? []).flatMap(tests));
const runnable = (t: SkipTask): boolean => t.mode === 'run' || t.mode === 'queued';
/** vitest sets a task's result when it starts (runTest, runSuite), with no await between its mode check and that write. */
const notStarted = (t: SkipTask): boolean => runnable(t) && !t.result;

export const skipNote = (test: string): string =>
  `not run: "${test}" above timed out and its act() may still be open, so later results in this file would be false; the timeout is the real failure`;

/** One per setup module. Marks are per file (a Map keyed by the file's path). */
export function timeoutSkip() {
  const marks = new Map<string, { test: string; skipped: number; file: SkipTask }>();
  /** Marks every runnable test of the file that has not started skipped, with the note; a suite that has not started
   *  and holds only such tests is skipped whole, so its beforeAll/afterAll do not run either. */
  const skipRest = (filepath: string, file: SkipTask, by: string): void => {
    const mark = marks.get(filepath) ?? { test: by, skipped: 0, file };
    marks.set(filepath, mark);
    const walk = (t: SkipTask): void => {
      for (const c of t.tasks ?? []) {
        if (c.type === 'test') {
          if (notStarted(c)) {
            c.mode = 'skip';
            c.result = { state: 'skip', note: skipNote(mark.test) };
            mark.skipped++;
          }
          continue;
        }
        const inside = tests(c);
        if (notStarted(c) && inside.length && inside.every(notStarted)) c.mode = 'skip';
        walk(c);
      }
    };
    walk(file);
  };
  return {
    /** The end of one attempt of `test` (setup afterEach): its own timeout skips the tests not yet started. Its retries
     *  and repeats are not touched. */
    attemptDone(filepath: string, file: SkipTask, test: SkipTask): void {
      if (timedOut(test)) skipRest(filepath, file, marks.get(filepath)?.test ?? test.name);
    },
    /** The start of `test` (setup beforeEach): a finished test or suite of the file that failed on a timeout (a hook's
     *  included, and one whose afterEach never reached the setup's) skips the tests not yet started. This one has started
     *  and runs. */
    testStart(filepath: string, file: SkipTask, test: SkipTask): void {
      const failed = (function find(t: SkipTask): SkipTask | undefined {
        for (const c of t.tasks ?? []) {
          if (c !== test && c.result?.state === 'fail' && timedOut(c)) return c;
          const inner = c.type === 'suite' ? find(c) : undefined;
          if (inner) return inner;
        }
        return undefined;
      })(file);
      if (failed) skipRest(filepath, file, marks.get(filepath)?.test ?? failed.name);
    },
    /** The end of the file (setup afterAll; the setup module is loaded once per test file): a file whose tests were
     *  skipped must still hold a timeout failure. If a retry or a repeat passed it, this error makes the file red. */
    fileDone(): void {
      for (const mark of marks.values()) {
        if (!mark.skipped) continue;
        const red = (function any(t: SkipTask): boolean {
          return (t.tasks ?? []).some((c) => (c.result?.state === 'fail' && timedOut(c)) || any(c));
        })(mark.file);
        if (!red) throw new Error(`${mark.skipped} test(s) were skipped after "${mark.test}" timed out, and no timeout failure is left in this file (a retry or a repeat passed it); the file is red so the skips hide nothing`);
      }
    },
  };
}
