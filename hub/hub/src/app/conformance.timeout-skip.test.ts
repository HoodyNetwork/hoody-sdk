// After a vitest timeout the rest of that file is skipped, and the first timeout is the real red (app/timeoutSkip.ts,
// wired in app/test-setup.ts). The rule on task trees first, then live runs of it: HUB_TIMEOUT_SKIP_FIXTURE=<case>
// runs one case below, red by design. Each case expects (counts from the run's own report):
//   body:     2 failed (an assertion, then a real timeout in an open act()), 1 passed (an assertion skips nothing), 3 skipped
//   retry:    the retried test passes on its 2nd try, 2 skipped, and the file is red (setup afterAll names the timeout)
//   repeats:  the repeated test fails (one of its 3 runs timed out) after running all 3 times, 2 skipped
//   teardown: 1 failed (the timeout), 2 skipped, and no afterEach ran for a test whose beforeEach did not
//   hook:     1 failed (its describe's afterEach timed out), the next test runs, the one after it is skipped
//   around:   1 failed (its describe's aroundEach setup timed out), the next test runs, the one after it is skipped
//   concurrent: 2 failed (a timeout, and a sibling that had started and fails later keeps its own failure), 1 passed,
//             then the next test is skipped
import { act } from '@testing-library/react';
import { afterAll, afterEach, aroundEach, beforeEach, describe, expect, it } from 'vitest';
import { isVitestTimeout, skipNote, timeoutSkip, type SkipTask } from './timeoutSkip';

const CASE = process.env.HUB_TIMEOUT_SKIP_FIXTURE ?? '';
const vitestMsg = (k: 'Test' | 'Hook', ms: number | string, waiting = '') =>
  `${k} timed out in ${ms}ms${waiting}.\nIf this is a long-running ${k.toLowerCase()}, pass a timeout value as the last argument or configure it globally with "${k.toLowerCase()}Timeout".`;
const timeoutErr = [{ message: vitestMsg('Test', 15000) }];
const test = (name: string, result?: SkipTask['result'], mode = 'run'): SkipTask => ({ type: 'test', name, mode, result });
const suite = (name: string, tasks: SkipTask[], result?: SkipTask['result'], mode = 'run'): SkipTask => ({ type: 'suite', name, mode, tasks, result });
const skipped = (f: SkipTask): string[] => (function all(t: SkipTask): SkipTask[] { return t.type === 'test' ? [t] : (t.tasks ?? []).flatMap(all); })(f).filter((t) => t.mode === 'skip').map((t) => t.name);

describe.skipIf(CASE !== '')('after a vitest timeout the rest of that file is skipped, and nothing else skips anything', () => {
  it('only vitest\'s own whole timeout messages count: test, hook or around phase, any interpolated number, any operation name', () => {
    expect(isVitestTimeout(vitestMsg('Test', 15000))).toBe(true);
    expect(isVitestTimeout(vitestMsg('Hook', 10000))).toBe(true);
    expect(isVitestTimeout(vitestMsg('Test', 0.5))).toBe(true);
    for (const n of [1e-7, 1e21, Infinity]) expect(isVitestTimeout(vitestMsg('Test', n)), String(n)).toBe(true);
    expect(isVitestTimeout(vitestMsg('Test', 5000, ' while waiting for expect.poll'))).toBe(true);
    expect(isVitestTimeout(vitestMsg('Test', 5000, ' while waiting for a\nmultiline, op'))).toBe(true);
    for (const phase of ['setup', 'teardown']) for (const hook of ['aroundEach', 'aroundAll']) {
      expect(isVitestTimeout(`The ${phase} phase of "${hook}" hook timed out after 300ms.`), `${phase} ${hook}`).toBe(true);
    }
    expect(isVitestTimeout('The setup phase of "beforeEach" hook timed out after 300ms.')).toBe(false);
    expect(isVitestTimeout('The setup phase of "aroundEach" hook timed out after 300ms.\n')).toBe(false);
    expect(isVitestTimeout(`${vitestMsg('Test', 5)}\n`)).toBe(false);
    expect(isVitestTimeout('Test timed out in 5ms')).toBe(false);
    expect(isVitestTimeout('Test timed out in 5ms because the server was slow')).toBe(false);
    expect(isVitestTimeout(`${vitestMsg('Test', 5)} and more`)).toBe(false);
    expect(isVitestTimeout(vitestMsg('Test', 5).replace('testTimeout', 'hookTimeout'))).toBe(false);
    expect(isVitestTimeout('expected 1 to be 2 // Object.is equality')).toBe(false);
    expect(isVitestTimeout(undefined)).toBe(false);
  });
  it('a test\'s own timeout skips the tests after it with the note, and never the test itself or one before it', () => {
    const t = timeoutSkip();
    const a = test('a', { state: 'pass' }), slow = test('slow', { state: 'run', errors: timeoutErr }), c = test('c'), d = test('d');
    const f = suite('file', [a, slow, suite('later', [c]), d]);
    t.attemptDone('/x.test.tsx', f, slow);
    expect(skipped(f)).toEqual(['c', 'd']);
    expect(slow.mode).toBe('run');
    expect(c.result).toEqual({ state: 'skip', note: skipNote('slow') });
    expect((f.tasks![2] as SkipTask).mode).toBe('skip'); // a describe wholly after it: no beforeAll/afterAll either
  });
  it('an assertion failure, any other error, a pass or a look-alike message skips nothing', () => {
    const t = timeoutSkip();
    for (const errors of [[{ message: 'expected 1 to be 2' }], [{ message: 'Test timed out in 5ms' }], [{}], undefined]) {
      const now = test('now', { state: 'fail', errors }), next = test('next');
      const f = suite('file', [now, next]);
      t.attemptDone('/x.test.tsx', f, now);
      t.testStart('/x.test.tsx', f, next);
      expect(skipped(f)).toEqual([]);
    }
  });
  it('a finished test or suite that failed on a timeout (a hook\'s too) skips the tests after the one starting, not that one', () => {
    const t = timeoutSkip();
    const hookFailed = suite('d', [test('in d', { state: 'fail', errors: [{ message: vitestMsg('Hook', 300) }] })]);
    const start = test('start', { state: 'run' }), after = test('after');
    const f = suite('file', [hookFailed, start, after]);
    t.testStart('/x.test.tsx', f, start);
    expect(skipped(f)).toEqual(['after']);
    const s2 = suite('beforeAll failed', [test('x', undefined, 'skip')], { state: 'fail', errors: [{ message: vitestMsg('Hook', 10000) }] });
    const start2 = test('start2', { state: 'run' }), after2 = test('after2');
    const f2 = suite('file2', [s2, start2, after2]);
    t.testStart('/y.test.tsx', f2, start2);
    expect(skipped(f2)).toEqual(['x', 'after2']);
  });
  it('tests the author skipped keep their own state; a test that already started is never re-marked', () => {
    const t = timeoutSkip();
    const slow = test('slow', { state: 'fail', errors: timeoutErr }), own = test('own', undefined, 'todo'), next = test('next');
    const f = suite('file', [slow, own, next]);
    t.attemptDone('/x.test.tsx', f, slow);
    expect(own.mode).toBe('todo');
    expect(own.result).toBeUndefined();
    expect(next.mode).toBe('skip');
  });
  it('a test or suite that has started is never touched: concurrent or shuffled, before or after the timeout in file order', () => {
    const t = timeoutSkip();
    const running = { state: 'run' }, done = { state: 'fail', errors: [{ message: 'expected 1 to be 2' }] };
    const early = test('early, not started (shuffled after)'), slow = test('slow', { state: 'fail', errors: timeoutErr });
    const sib = test('sibling running', running), fin = test('sibling finished', done), next = test('next');
    const started = suite('started suite', [test('ran', { state: 'pass' }), test('not yet')], { state: 'run' });
    const f = suite('file', [early, slow, sib, fin, started, next]);
    t.attemptDone('/x.test.tsx', f, slow);
    expect(skipped(f)).toEqual(['early, not started (shuffled after)', 'not yet', 'next']);
    expect(sib.result).toBe(running);
    expect(fin.result).toBe(done);
    expect(sib.mode).toBe('run');
    expect(started.mode).toBe('run'); // its afterAll still runs: it has started
  });
  it('marks are per file: two files in one helper keep their own first timeout and their own skips', () => {
    const t = timeoutSkip();
    const a1 = test('a-slow', { state: 'fail', errors: timeoutErr }), a2 = test('a-next');
    const b1 = test('b-slow', { state: 'fail', errors: timeoutErr }), b2 = test('b-next'), b0 = test('b-first', { state: 'pass' });
    const fa = suite('a', [a1, a2]), fb = suite('b', [b0, b1, b2]);
    t.attemptDone('/a.test.tsx', fa, a1);
    expect(skipped(fb)).toEqual([]);
    t.attemptDone('/b.test.tsx', fb, b1);
    expect(a2.result?.note).toBe(skipNote('a-slow'));
    expect(b2.result?.note).toBe(skipNote('b-slow'));
    expect(() => t.fileDone()).not.toThrow();
  });
  it('a file whose skips are left with no timeout failure (a retry or repeat passed it) is made red at its end', () => {
    const t = timeoutSkip();
    const slow = test('slow', { state: 'run', errors: timeoutErr }), next = test('next');
    const f = suite('file', [slow, next]);
    t.attemptDone('/x.test.tsx', f, slow);
    slow.result = { state: 'pass', errors: timeoutErr }; // the retry passed
    expect(() => t.fileDone()).toThrow(/1 test\(s\) were skipped after "slow" timed out/);
    slow.result = { state: 'fail', errors: timeoutErr };
    expect(() => t.fileDone()).not.toThrow();
    expect(() => timeoutSkip().fileDone()).not.toThrow(); // nothing skipped by that helper
  });
});

const never = () => act(async () => { await new Promise(() => {}); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ran = (n: number) => () => expect.fail(`test ${n} ran after a timeout in its file`);

describe.runIf(CASE === 'body')('live body (red by design)', () => {
  it('body 1: an assertion failure', () => { expect(1).toBe(2); });
  it('body 2: runs and passes, since an assertion failure skips nothing', () => { expect(1).toBe(1); });
  it('body 3: times out inside an act() that never ends', { timeout: 500 }, never);
  it('body 4: skipped', ran(4));
  it('body 5: skipped', ran(5));
  it('body 6: skipped', ran(6));
});

let tries = 0;
describe.runIf(CASE === 'retry')('live retry (red by design)', () => {
  it('retry 1: times out on its 1st try, passes on its 2nd', { timeout: 500, retry: 1 }, async () => {
    tries++;
    if (tries === 1) await never();
  });
  it('retry 2: skipped', ran(2));
  it('retry 3: skipped', ran(3));
  afterAll(() => { expect(tries, 'the retry ran').toBe(2); });
});

let runs = 0;
describe.runIf(CASE === 'repeats')('live repeats (red by design)', () => {
  it('repeats 1: its 1st run times out, the 2 repeats pass', { timeout: 500, repeats: 2 }, async () => {
    runs++;
    if (runs === 1) await never();
  });
  it('repeats 2: skipped', ran(2));
  it('repeats 3: skipped', ran(3));
  afterAll(() => { expect(runs, 'every repeat ran').toBe(3); });
});

let ready = false;
let orphanTeardowns = 0;
describe.runIf(CASE === 'teardown')('live teardown (red by design)', () => {
  beforeEach(() => { ready = true; });
  afterEach(() => {
    if (!ready) { orphanTeardowns++; throw new Error('afterEach ran for a test whose beforeEach did not'); }
    ready = false;
  });
  it('teardown 1: times out', { timeout: 500 }, never);
  it('teardown 2: skipped', ran(2));
  it('teardown 3: skipped', ran(3));
  afterAll(() => { expect(orphanTeardowns, 'no afterEach ran without its beforeEach').toBe(0); });
});

describe.runIf(CASE === 'hook')('live hook (red by design)', () => {
  describe('a describe whose afterEach times out', () => {
    afterEach(never, 300);
    it('hook 1: passes, then its afterEach times out', () => { expect(1).toBe(1); });
  });
  it('hook 2: runs (the setup afterEach was not reached), and passes', () => { expect(1).toBe(1); });
  it('hook 3: skipped', ran(3));
});

describe.runIf(CASE === 'around')('live around (red by design)', () => {
  describe('a describe whose aroundEach setup times out', () => {
    aroundEach(async () => { await new Promise(() => {}); }, 300);
    it('around 1: never runs, its aroundEach setup times out', () => { expect(1).toBe(1); });
  });
  it('around 2: runs (the setup afterEach was not reached), and passes', () => { expect(1).toBe(1); });
  it('around 3: skipped', ran(3));
});

describe.runIf(CASE === 'concurrent')('live concurrent (red by design)', () => {
  describe.concurrent('three tests at once', () => {
    it('concurrent 1: times out inside an act() that never ends', { timeout: 500 }, never);
    it('concurrent 2: passes at once', () => { expect(1).toBe(1); });
    it('concurrent 3: started before the timeout, fails after it and keeps its failure', { timeout: 5000 }, async () => {
      await sleep(1500);
      expect('its own failure').toBe('kept');
    });
  });
  it('concurrent 4: skipped', ran(4));
});
