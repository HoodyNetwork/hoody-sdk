// The runs' reads and leases: the snapshot is read whole in the realm shown at
// 5 s while a run is going and 30 s otherwise, only while the page is shown; a running run keeps its chat open (a pinned
// hold, at most 8 chats) and the hold follows the run's state, the listing and the mount.
import { act, renderHook } from '@testing-library/react';
import { CoreQueryProvider, queryClient, streamComputer } from '@core';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, settle, R1, TARGET } from '@core/test/env';
import type { LeaseHandle, LeaseManager, LeaseRef } from '@kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PIN_CAP, RUNS_FAST_MS, RUNS_SLOW_MS, type Run } from './runs';
import { adoptResumeHold, dropResumeHold, refOf, resetResumeHolds, resumeHoldKeys, RESUME_HOLD_MAX_MS, settleResumeHolds, useRunLeases, useRuns } from './runsData';

const path = (u: string) => new URL(u).pathname;
const runCalls = () => calls.filter((c) => path(c.url).endsWith('/agent/workflows/runs'));
const T0 = '2026-11-02T10:00:00Z';
const row = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  run_id: 'run-1', workflow_name: 'release', session_id: 'sess-1', started_at: T0, current_idx: 1, total_steps: 3, status: 'running', realm: 'global', ...o,
});
let items: unknown[] = [];
let meta: Record<string, unknown> | null = null;

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  calls.length = 0;
  items = [];
  meta = null;
  onFetch((c) => (path(c.url).endsWith('/agent/workflows/runs') ? { status: 200, body: { items, meta: meta ?? { total: items.length } } } : { status: 404, body: { error: 'no', code: 'not_found' } }));
});
afterEach(() => {
  setVisibility('visible');
});

const flush = async () => {
  for (let i = 0; i < 10; i++) await act(async () => { await settle(); });
};
function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
  document.dispatchEvent(new Event('visibilitychange'));
}
const intervals = () => queryClient.getQueryCache().findAll().filter((x) => JSON.stringify(x.queryKey).includes('wf.runs')).flatMap((q) => q.observers.map((o) => o.options.refetchInterval));

describe('useRuns: the snapshot', () => {
  it('reads the whole listing in the realm shown: limit 0, no page', async () => {
    items = [row()];
    const h = renderHook(() => useRuns(null), { wrapper: CoreQueryProvider });
    await flush();
    expect(runCalls()).toHaveLength(1);
    const u = new URL(runCalls()[0]!.url);
    expect(u.searchParams.get('limit')).toBe('0');
    expect(u.searchParams.get('page')).toBeNull();
    expect(h.result.current.list?.runs.map((r) => r.id)).toEqual(['run-1']);
  });
  it('a named realm is asked for', async () => {
    const h = renderHook(() => useRuns(R1), { wrapper: CoreQueryProvider });
    await flush();
    expect(new URL(runCalls()[0]!.url).searchParams.get('realm')).toBe(R1);
    h.unmount();
  });
  it('a row it cannot read is counted, the others stay', async () => {
    items = [row(), row({ run_id: 'run-2', status: 'paused' })];
    const h = renderHook(() => useRuns(null), { wrapper: CoreQueryProvider });
    await flush();
    expect(h.result.current.list).toMatchObject({ skipped: 1 });
    expect(h.result.current.list?.runs).toHaveLength(1);
  });
  it('a listing that disagrees with its envelope is a failed read, never "no runs"', async () => {
    items = [row()];
    meta = { total: 4 };
    const h = renderHook(() => useRuns(null), { wrapper: CoreQueryProvider });
    await flush();
    expect(h.result.current.list).toBeUndefined();
    expect(h.result.current.error).not.toBeNull();
  });
  it('nothing is read while disabled', async () => {
    renderHook(() => useRuns(null, false), { wrapper: CoreQueryProvider });
    await flush();
    expect(runCalls()).toHaveLength(0);
  });
});

describe('useRuns: the cadence', () => {
  it('30 s while no run is going', async () => {
    items = [row({ status: 'completed', finished_at: '2026-11-02T10:01:00Z' })];
    const h = renderHook(() => useRuns(null), { wrapper: CoreQueryProvider });
    await flush();
    expect(intervals()).toEqual([RUNS_SLOW_MS]);
    expect(RUNS_SLOW_MS).toBe(30_000);
    h.unmount();
  });
  it('5 s while a run is going, and back to 30 s when it ended', async () => {
    items = [row()];
    const h = renderHook(() => useRuns(null), { wrapper: CoreQueryProvider });
    await flush();
    expect(intervals()).toEqual([RUNS_FAST_MS]);
    expect(RUNS_FAST_MS).toBe(5_000);
    items = [row({ status: 'completed', finished_at: '2026-11-02T10:01:00Z' })];
    await act(async () => { h.result.current.refetch(); });
    await flush();
    expect(intervals()).toEqual([RUNS_SLOW_MS]);
  });
  it('a hidden tab reads nothing and polls nothing; shown again, it reads', async () => {
    items = [row()];
    renderHook(() => useRuns(null), { wrapper: CoreQueryProvider });
    await flush();
    expect(runCalls()).toHaveLength(1);
    act(() => setVisibility('hidden'));
    await flush();
    expect(intervals()).toEqual([false]);
    const seen = runCalls().length;
    await act(async () => { await queryClient.invalidateQueries(); });
    await flush();
    expect(runCalls()).toHaveLength(seen);
    act(() => setVisibility('visible'));
    await flush();
    expect(intervals()).toEqual([RUNS_FAST_MS]);
    expect(runCalls().length).toBeGreaterThan(seen);
  });
  it('a tab that starts hidden reads nothing', async () => {
    setVisibility('hidden');
    renderHook(() => useRuns(null), { wrapper: CoreQueryProvider });
    await flush();
    expect(runCalls()).toHaveLength(0);
  });
});

// A lease manager that records what is tracked and closed.
function fake() {
  const tracked: Array<{ ref: LeaseRef; need: Record<string, boolean> | undefined; closed: boolean }> = [];
  const mgr = {
    track(ref: LeaseRef, need?: Record<string, boolean>): LeaseHandle {
      const t = { ref, need, closed: false };
      tracked.push(t);
      return { set() {}, close() { t.closed = true; } };
    },
  } as unknown as LeaseManager;
  return { mgr, tracked, open: () => tracked.filter((t) => !t.closed).map((t) => t.ref.sid) };
}
const run = (id: string, o: Partial<Run> = {}): Run => ({
  id, workflow: 'release', sid: `s-${id}`, realm: 'global', state: 'running', step: null, startedAt: 0, finishedAt: null, cost: null, error: null, lastStep: null,
  resumedFrom: null, cwd: null, ...o,
});

describe('useRunLeases: a running run keeps its chat open', () => {
  it('a running run takes a pinned hold on its own chat, on the computer shown, in the run\'s realm', () => {
    const f = fake();
    renderHook(() => useRunLeases([run('a'), run('b', { realm: R1 })], f.mgr));
    expect(f.tracked.map((t) => [t.ref.sid, t.ref.realm, t.ref.computer, t.need])).toEqual([
      ['s-a', 'global', streamComputer(TARGET), { pinned: true }],
      ['s-b', R1, streamComputer(TARGET), { pinned: true }],
    ]);
    expect(f.tracked[0]!.ref.target).toEqual(TARGET);
  });
  it('a run that is no longer running closes its hold; the others keep theirs', () => {
    const f = fake();
    const h = renderHook(({ runs }) => useRunLeases(runs, f.mgr), { initialProps: { runs: [run('a'), run('b')] } });
    h.rerender({ runs: [run('a', { state: 'completed' }), run('b')] });
    expect(f.open()).toEqual(['s-b']);
    expect(f.tracked).toHaveLength(2);
  });
  for (const state of ['failed', 'cancelled'] as const) {
    it(`a ${state} run holds nothing`, () => {
      const f = fake();
      renderHook(() => useRunLeases([run('a', { state })], f.mgr));
      expect(f.tracked).toHaveLength(0);
    });
  }
  it('a row the next read no longer lists closes its hold', () => {
    const f = fake();
    const h = renderHook(({ runs }) => useRunLeases(runs, f.mgr), { initialProps: { runs: [run('a'), run('b')] as Run[] | undefined } });
    h.rerender({ runs: [run('b')] });
    expect(f.open()).toEqual(['s-b']);
    h.rerender({ runs: undefined });
    expect(f.open()).toEqual([]);
  });
  it('a new list with the same running chats takes no new hold and closes none', () => {
    const f = fake();
    const h = renderHook(({ runs }) => useRunLeases(runs, f.mgr), { initialProps: { runs: [run('a')] } });
    h.rerender({ runs: [run('a', { step: 'build' })] });
    h.rerender({ runs: [run('a', { step: 'test' })] });
    expect(f.tracked).toHaveLength(1);
    expect(f.tracked[0]!.closed).toBe(false);
  });
  it('a run that joins takes its own hold and leaves the others as they are', () => {
    const f = fake();
    const h = renderHook(({ runs }) => useRunLeases(runs, f.mgr), { initialProps: { runs: [run('a')] } });
    h.rerender({ runs: [run('b'), run('a')] });
    expect(f.tracked.map((t) => [t.ref.sid, t.closed])).toEqual([['s-a', false], ['s-b', false]]);
  });
  it(`at most ${PIN_CAP} chats are held, the newest first, and the rest are counted`, () => {
    const f = fake();
    const runs = Array.from({ length: 10 }, (_, i) => run(`r${i}`));
    const h = renderHook(() => useRunLeases(runs, f.mgr));
    expect(f.open()).toEqual(runs.slice(0, PIN_CAP).map((r) => r.sid));
    expect(h.result.current.beyond).toBe(2);
    expect(h.result.current.pinned).toHaveLength(PIN_CAP);
  });
  it('a chat two running rows share is held once', () => {
    const f = fake();
    renderHook(() => useRunLeases([run('a', { sid: 'same' }), run('b', { sid: 'same' })], f.mgr));
    expect(f.tracked).toHaveLength(1);
  });
  it('unmounting closes every hold', () => {
    const f = fake();
    const h = renderHook(() => useRunLeases([run('a'), run('b')], f.mgr));
    h.unmount();
    expect(f.open()).toEqual([]);
    expect(f.tracked).toHaveLength(2);
  });
  it('the same chat on another computer is a different hold: the old one closes, the new one is taken there', () => {
    const f = fake();
    const other = { project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv2' } };
    const h = renderHook(() => useRunLeases([run('a')], f.mgr));
    act(() => setTarget(other));
    h.rerender();
    expect(f.tracked.map((t) => [t.ref.sid, t.ref.computer, t.closed])).toEqual([
      ['s-a', streamComputer(TARGET), true],
      ['s-a', streamComputer(other), false],
    ]);
  });
  it('without a computer nothing is held', async () => {
    boot({ realm: R1, target: null });
    const f = fake();
    renderHook(() => useRunLeases([run('a')], f.mgr));
    expect(f.tracked).toHaveLength(0);
  });
});

// The hold a Resume took on its run's chat is handed to the page and kept
// until the page's own pin holds that chat, the resumed run ends, none is listed in time, the computer changes or the page
// goes. Never on a timer while the resumed run runs unpinned.
describe('a Resume\'s hold, handed to the page', () => {
  const orig = run('o', { state: 'failed', sid: 's-o' });
  const child = (o: Partial<Run> = {}) => run('c', { sid: 's-o', resumedFrom: 'o', ...o });
  const hold = () => { const t = { closed: false }; return { t, h: { set() {}, close() { t.closed = true; } } as LeaseHandle }; };
  beforeEach(() => resetResumeHolds());
  it('with no page to keep it (no useRunLeases mounted), it is closed at once', () => {
    const x = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', x.h);
    expect(x.t.closed).toBe(true);
    expect(resumeHoldKeys()).toEqual([]);
  });
  it('kept until the listing shows the resumed run and the page\'s own pin holds the chat, with no gap', () => {
    const f = fake();
    const h = renderHook(({ runs }) => useRunLeases(runs, f.mgr), { initialProps: { runs: [orig] as Run[] } });
    const x = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', x.h);
    h.rerender({ runs: [orig] });
    expect(x.t.closed).toBe(false);
    h.rerender({ runs: [child(), orig] });
    expect(f.open()).toEqual(['s-o']);
    expect(x.t.closed).toBe(true);
    expect(resumeHoldKeys()).toEqual([]);
  });
  it('a resumed run past the pin cap keeps the Resume hold while it runs, and lets go when it ends', () => {
    const f = fake();
    const busy = Array.from({ length: PIN_CAP }, (_, i) => run(`r${i}`, { startedAt: 100 + i }));
    const h = renderHook(({ runs }) => useRunLeases(runs, f.mgr), { initialProps: { runs: [...busy, orig] as Run[] } });
    const x = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', x.h);
    h.rerender({ runs: [...busy, child({ startedAt: 0 }), orig] });
    expect(f.open()).not.toContain('s-o');
    expect(x.t.closed).toBe(false);
    h.rerender({ runs: [...busy, child({ startedAt: 0, state: 'failed' }), orig] });
    expect(x.t.closed).toBe(true);
  });
  it('no resumed run listed within RESUME_HOLD_MAX_MS: the chat dropped the queued resume, the hold ends', () => {
    const f = fake();
    renderHook(() => useRunLeases([orig], f.mgr));
    const x = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', x.h, [], 1_000);
    settleResumeHolds([orig], new Set(), streamComputer(TARGET), 1_000 + RESUME_HOLD_MAX_MS);
    expect(x.t.closed).toBe(false);
    settleResumeHolds([orig], new Set(), streamComputer(TARGET), 1_001 + RESUME_HOLD_MAX_MS);
    expect(x.t.closed).toBe(true);
  });
  it('a listing read that failed (no rows) keeps it', () => {
    const f = fake();
    renderHook(() => useRunLeases([orig], f.mgr));
    const x = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', x.h, [], 0);
    settleResumeHolds(undefined, new Set(), streamComputer(TARGET), RESUME_HOLD_MAX_MS * 3);
    expect(x.t.closed).toBe(false);
  });
  it('another computer shown, or the page unmounting, ends it', () => {
    const f = fake();
    const h = renderHook(() => useRunLeases([orig], f.mgr));
    const x = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', x.h);
    act(() => setTarget({ project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv2' } }));
    h.rerender();
    expect(x.t.closed).toBe(true);
    act(() => setTarget(TARGET));
    const y = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', y.h);
    h.unmount();
    expect(y.t.closed).toBe(true);
  });
  // each attempt keeps its own hold, also two on one chat.
  it('a later Resume on the same chat never closes the earlier attempt\'s hold; each ends on its own', () => {
    const f = fake();
    const h = renderHook(({ runs }) => useRunLeases(runs, f.mgr), { initialProps: { runs: [orig] as Run[] } });
    const x = hold(), y = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', x.h);
    adoptResumeHold(refOf(orig, TARGET), 'o', y.h, ['c']);
    adoptResumeHold(refOf(orig, TARGET), 'o', y.h, ['c']);
    expect([x.t.closed, y.t.closed]).toEqual([false, false]);
    expect(resumeHoldKeys()).toHaveLength(2);
    // The first attempt's run ended: its hold ends; the later attempt's (which knows it) stays.
    h.rerender({ runs: [child({ state: 'failed', step: 'build' }), orig] });
    expect([x.t.closed, y.t.closed]).toEqual([true, false]);
    dropResumeHold(y.h);
    expect(y.t.closed).toBe(true);
    expect(resumeHoldKeys()).toEqual([]);
  });
  // an earlier Resume's run (listed before this one) never settles this Resume's hold.
  it('a run resumed from it before this Resume (an earlier one, failed) does not end the hold; this Resume\'s run does', () => {
    const f = fake();
    const old = run('c0', { sid: 's-o', resumedFrom: 'o', state: 'failed' });
    const h = renderHook(({ runs }) => useRunLeases(runs, f.mgr), { initialProps: { runs: [old, orig] as Run[] } });
    const x = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', x.h, ['c0']);
    h.rerender({ runs: [old, orig] });
    expect(x.t.closed).toBe(false);
    expect(resumeHoldKeys()).toHaveLength(1);
    h.rerender({ runs: [child({ state: 'cancelled' }), old, orig] });
    expect(x.t.closed).toBe(true);
  });
  // a read with the same rows (the same array, as TanStack's structural sharing gives) still settles.
  it('reads that bring the same rows still end it after RESUME_HOLD_MAX_MS; a read before then does not', () => {
    const f = fake();
    const same = [orig];
    const h = renderHook(({ readAt }) => useRunLeases(same, f.mgr, readAt), { initialProps: { readAt: 500 } });
    const x = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', x.h, [], 1_000);
    h.rerender({ readAt: 1_000 + RESUME_HOLD_MAX_MS });
    expect(x.t.closed).toBe(false);
    h.rerender({ readAt: 1_001 + RESUME_HOLD_MAX_MS });
    expect(x.t.closed).toBe(true);
  });
  // a read with rows it could not read may hide the resumed run.
  it('a read with unreadable rows never ends it by the ten-minute rule or another ended resume; a computer change does', () => {
    const f = fake();
    const other = run('c9', { sid: 's-o', resumedFrom: 'o', state: 'failed', step: 'build' });
    const h = renderHook(({ runs, readAt, skipped }) => useRunLeases(runs, f.mgr, readAt, skipped), { initialProps: { runs: [orig] as Run[], readAt: 500, skipped: 1 } });
    const x = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', x.h, [], 1_000);
    h.rerender({ runs: [other, orig], readAt: 2_000 + RESUME_HOLD_MAX_MS, skipped: 1 });
    expect(x.t.closed).toBe(false);
    h.rerender({ runs: [orig], readAt: 3_000 + RESUME_HOLD_MAX_MS, skipped: 0 });
    expect(x.t.closed).toBe(true);
    const y = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', y.h, [], 1_000);
    act(() => setTarget({ project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv2' } }));
    h.rerender({ runs: [orig], readAt: 4_000 + RESUME_HOLD_MAX_MS, skipped: 1 });
    expect(y.t.closed).toBe(true);
    act(() => setTarget(TARGET));
  });
  // an answer that comes back after the page moved to another computer hands over a hold nobody keeps.
  it('a hold handed over for a computer the page no longer shows is closed at once', () => {
    const f = fake();
    renderHook(() => useRunLeases([orig], f.mgr));
    const other = { project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv2' } } as unknown as Parameters<typeof refOf>[1];
    const x = hold();
    adoptResumeHold(refOf(orig, other), 'o', x.h);
    expect(x.t.closed).toBe(true);
    expect(resumeHoldKeys()).toEqual([]);
  });
  // a later attempt's refusal on the same chat takes back only its
  // own hold; the earlier attempt's resume may still be queued there.
  it('dropResumeHold ends only that attempt\'s hold, never an earlier one on the same chat', () => {
    const f = fake();
    renderHook(() => useRunLeases([orig], f.mgr));
    const x = hold(), y = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', x.h);
    adoptResumeHold(refOf(orig, TARGET), 'o', y.h);
    dropResumeHold(y.h);
    expect([x.t.closed, y.t.closed]).toEqual([false, true]);
    expect(resumeHoldKeys()).toHaveLength(1);
  });
  it('a refusal that came back after the handover takes it back (dropResumeHold)', () => {
    const f = fake();
    renderHook(() => useRunLeases([orig], f.mgr));
    const x = hold();
    adoptResumeHold(refOf(orig, TARGET), 'o', x.h);
    dropResumeHold(x.h);
    expect(x.t.closed).toBe(true);
    expect(resumeHoldKeys()).toEqual([]);
  });
});
