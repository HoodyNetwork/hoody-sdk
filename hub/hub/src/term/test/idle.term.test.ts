// The settle signal (src/term/app/idle.ts): idle = no query in flight, no mutation, no view importing, no short timer
// or immediate pending; then still frames. A case that never goes idle names what is still under way.
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { libTimer } from '../../../scripts/term/idle-lib-fixture.js';
import { HELD_SITES, heldTimerCount, timerLedgerState, idleState, pendingText, releaseHeldTimers, SHORT_TIMER_MS, timersOf, trackTimers, untrackTimers, whenIdle } from '../app/idle';

// Another file in this process may have turned the ledger on (render.ts does at load): each test starts from a plain
// ledger, and the state found is put back at the end.
let found = { on: false, holdLong: false };
beforeAll(() => { found = timerLedgerState(); });
beforeEach(() => { untrackTimers(); trackTimers(); });
afterEach(() => { untrackTimers(); });
afterAll(() => { if (found.on) trackTimers({ holdLong: found.holdLong }); });

const still = (): (() => Promise<string>) => async () => 'frame';

test('a query that never answers keeps the app busy and is named when the deadline passes', async () => {
  const qc = new QueryClient();
  qc.fetchQuery({ queryKey: ['schedules', 'list'], queryFn: () => new Promise<never>(() => {}) }).catch(() => {});
  const r = await whenIdle({ queryClient: qc, frame: still(), deadlineMs: 150 });
  expect(r.settled).toBe(false);
  expect(r.pending.queries).toEqual(['["schedules","list"]']);
  expect(pendingText(r.pending)).toContain('["schedules","list"]');
  qc.clear();
});

test('settles only after the answer arrives, then still frames', async () => {
  const qc = new QueryClient();
  let answered = false;
  void qc.fetchQuery({ queryKey: ['k'], queryFn: () => new Promise((r) => setTimeout(() => { answered = true; r(1); }, 60)) });
  const r = await whenIdle({ queryClient: qc, frame: async () => (answered ? 'done' : 'skeleton'), still: 3, deadlineMs: 3000 });
  expect(r.settled).toBe(true);
  expect(r.frame).toBe('done');
  expect(idleState(qc).idle).toBe(true);
  qc.clear();
});

test('a pending short timer is work; a long one (a toast, a poll) is not; a cleared one is gone', () => {
  const qc = new QueryClient();
  const short = setTimeout(() => {}, SHORT_TIMER_MS);
  const long = setTimeout(() => {}, SHORT_TIMER_MS + 1);
  const s = idleState(qc);
  expect(s.idle).toBe(false);
  expect(s.timers.length).toBe(1);
  expect(s.timers[0]).toContain('idle.term.test.ts');
  clearTimeout(short);
  clearTimeout(long);
  expect(idleState(qc).idle).toBe(true);
});

test('an immediate (React scheduler work) is pending until it runs', async () => {
  const qc = new QueryClient();
  setImmediate(() => {});
  expect(idleState(qc).immediates).toBe(1);
  await new Promise((r) => setTimeout(r, 5));
  expect(idleState(qc).idle).toBe(true);
});

test('a view still importing is not idle; a frame that keeps changing never settles', async () => {
  const qc = new QueryClient();
  expect(idleState(qc, 1).idle).toBe(false);
  let n = 0;
  const r = await whenIdle({ queryClient: qc, frame: async () => String(n++), deadlineMs: 120 });
  expect(r.settled).toBe(false);
  expect(pendingText(r.pending)).toBe('nothing pending (the frame kept changing)');
});

test('holdLong: a long fixture delay never fires until released; a query waiting on it is held, not waited on', async () => {
  untrackTimers();
  trackTimers({ holdLong: true });
  // This file stands in for a fixture answer site (src/app/fixtures.ts, src/core/transport.ts).
  HELD_SITES.push(/idle\.term\.test\.ts/);
  const qc = new QueryClient();
  let fired = 0;
  const n0 = heldTimerCount();
  const t = setTimeout(() => { fired++; }, 5000);
  expect(heldTimerCount()).toBe(n0 + 1);
  void qc.fetchQuery({ queryKey: ['slow'], queryFn: () => new Promise((r) => setTimeout(() => r(1), 2500)) });
  const r = await whenIdle({ queryClient: qc, frame: still(), deadlineMs: 2000 });
  expect(r.settled).toBe(true);
  expect(r.pending.held).toEqual(['["slow"]']);
  const n1 = heldTimerCount();
  clearTimeout(t);
  expect(heldTimerCount()).toBe(n1 - 1);
  expect(releaseHeldTimers()).toBeGreaterThanOrEqual(1);
  await new Promise((res) => setTimeout(res, 20));
  expect(fired).toBe(0);
  expect(qc.getQueryData(['slow'])).toBe(1);
  expect(idleState(qc).idle).toBe(true);
  HELD_SITES.pop();
});

test('holdLong holds fixture delays only: another long Hub timer (a toast, a ready timeout) runs', () => {
  untrackTimers();
  trackTimers({ holdLong: true });
  const n0 = heldTimerCount();
  const t = setTimeout(() => {}, 5000);
  expect(heldTimerCount()).toBe(n0);
  clearTimeout(t);
});

test('a timer a library sets (not a Hub frame) is neither counted nor held: React and TanStack keep running', async () => {
  untrackTimers();
  trackTimers({ holdLong: true });
  const qc = new QueryClient();
  const lib = libTimer;
  const n0 = heldTimerCount();
  let fired = 0;
  lib(() => { fired++; }, 1100);
  lib(() => { fired++; }, 10);
  expect(heldTimerCount()).toBe(n0);
  expect(idleState(qc).timers).toEqual([]);
  await new Promise((r) => timersOf().setTimeout(r, 1200));
  expect(fired).toBe(2);
}, 5000);
