// One change feed per computer within the stream budget: the feed takes the computer's
// change-feed slot, follows GET /changes/stream's frames, reconnects after a drop, and says why when the budget has no
// slot for it (the group is then unknown, never empty).
import { createStreamBudget, type ModeInfo, type StreamBudget, type WatchSpec } from '@core';
import { boot, TARGET, R1 } from '@core/test/env';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEED_BACKOFF_MS, useChangeFeed, type FeedConnect, type FeedEvents } from './allChats';
import { digest, type Part } from './AllReads';
import type { ChatsAt, ChatsRead } from './data';

const AT: ChatsAt = { target: TARGET, realm: R1 };
const COMPUTER = `${TARGET.project.id}/${TARGET.container.id}`;

/** A fake GET /changes/stream: each connect is recorded with its handlers. */
function fakeConnect() {
  const opened: Array<{ at: ChatsAt; ev: FeedEvents; closed: boolean }> = [];
  const connect: FeedConnect = (at, ev) => {
    const c = { at, ev, closed: false };
    opened.push(c);
    return { close: () => { c.closed = true; } };
  };
  return { connect, opened, last: () => opened[opened.length - 1]! };
}
const snap = (tokens: Record<string, string>, scope = 's1') => JSON.stringify({ scope, tokens });

/** A budget that never gives a slot: every watch is degraded for `why` at once; retry() is counted. */
function refusingBudget(why: 'locks' | 'budget') {
  const specs: WatchSpec[] = [];
  let retries = 0;
  const b: StreamBudget = {
    watch(spec) {
      specs.push(spec);
      const m: ModeInfo = { mode: 'degraded', why };
      queueMicrotask(() => spec.onMode?.(m));
      return { set() {}, retry() { retries++; }, mode: () => m, release() {} };
    },
    slotsInUse: () => 0,
    reset() {},
  };
  return { b, specs, retries: () => retries };
}

beforeEach(() => boot({ realm: R1 }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a computer change feed in the stream budget', () => {
  it('takes one change-feed slot on its computer and follows the frames; live once the stream is open', async () => {
    const budget = createStreamBudget();
    const f = fakeConnect();
    const { result } = renderHook(() => useChangeFeed(AT, { budget, connect: f.connect }));
    await act(async () => {});
    expect(f.opened).toHaveLength(1);
    expect(budget.slotsInUse(COMPUTER)).toBe(1);
    expect(f.last().at.realm).toBe(R1);
    expect(result.current.live).toBe(false);
    await act(async () => {
      f.last().ev.state('open');
      f.last().ev.frame('snapshot', snap({ sessions: 't1', gates: 'g1' }));
    });
    expect(result.current).toMatchObject({ live: true, tokens: { scope: 's1', tokens: { sessions: 't1', gates: 'g1' } } });
    await act(async () => f.last().ev.frame('changed', JSON.stringify({ topic: 'sessions', token: 't2' })));
    expect(result.current.tokens?.tokens.sessions).toBe('t2');
    expect(result.current.why).toBeUndefined();
  });

  it('a dropped stream keeps the slot and the tokens, is not live, and reconnects after the backoff', async () => {
    vi.useFakeTimers();
    const budget = createStreamBudget();
    const f = fakeConnect();
    const { result } = renderHook(() => useChangeFeed(AT, { budget, connect: f.connect }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => {
      f.last().ev.state('open');
      f.last().ev.frame('snapshot', snap({ sessions: 't1' }));
    });
    await act(async () => f.last().ev.state('down'));
    expect(result.current).toMatchObject({ live: false, why: 'reconnecting', tokens: { tokens: { sessions: 't1' } } });
    expect(budget.slotsInUse(COMPUTER)).toBe(1);
    expect(f.opened).toHaveLength(1);
    // A frame the dropped connection still delivers moves nothing (its stream is over).
    await act(async () => f.opened[0]!.ev.frame('changed', JSON.stringify({ topic: 'sessions', token: 'late' })));
    expect(result.current.tokens?.tokens.sessions).toBe('t1');
    await act(async () => { await vi.advanceTimersByTimeAsync(FEED_BACKOFF_MS[0]!); });
    expect(f.opened).toHaveLength(2);
    expect(f.opened[0]!.closed).toBe(true);
    await act(async () => f.last().ev.state('open'));
    expect(result.current.live).toBe(true);
  });

  it('a stream that is over for good frees the slot and reads as closed (unknown, with a retry)', async () => {
    const budget = createStreamBudget();
    const f = fakeConnect();
    const { result } = renderHook(() => useChangeFeed(AT, { budget, connect: f.connect }));
    await act(async () => {});
    await act(async () => f.last().ev.state('over'));
    expect(result.current).toMatchObject({ live: false, why: 'closed' });
    expect(budget.slotsInUse(COMPUTER)).toBe(0);
    await act(async () => result.current.retry());
    expect(f.opened).toHaveLength(2);
  });

  it('no slot (another tab holds them): the feed says locks and never connects; Try again asks the budget again', async () => {
    const r = refusingBudget('locks');
    const f = fakeConnect();
    const { result } = renderHook(() => useChangeFeed(AT, { budget: r.b, connect: f.connect }));
    await act(async () => {});
    expect(r.specs[0]).toMatchObject({ computer: COMPUTER, kind: 'changes', level: 'stream', rank: 'changes' });
    expect(result.current).toMatchObject({ live: false, why: 'locks', tokens: null });
    expect(f.opened).toHaveLength(0);
    act(() => result.current.retry());
    expect(r.retries()).toBe(1);
  });

  it('All realms: GET /changes/stream takes one realm, so no feed is asked for', async () => {
    const budget = createStreamBudget();
    const f = fakeConnect();
    const { result } = renderHook(() => useChangeFeed({ ...AT, realm: 'all' }, { budget, connect: f.connect }));
    await act(async () => {});
    expect(f.opened).toHaveLength(0);
    expect(budget.slotsInUse(COMPUTER)).toBe(0);
    expect(result.current).toMatchObject({ live: false, why: 'allRealms' });
  });

  it('unmount releases the slot and closes the stream', async () => {
    const budget = createStreamBudget();
    const f = fakeConnect();
    const { unmount } = renderHook(() => useChangeFeed(AT, { budget, connect: f.connect }));
    await act(async () => {});
    unmount();
    await act(async () => {});
    expect(f.last().closed).toBe(true);
    expect(budget.slotsInUse(COMPUTER)).toBe(0);
  });
});

describe('a computer part wakes the list when what it shows changes', () => {
  const read = (o: Partial<ChatsRead>): ChatsRead => ({
    rows: [], total: 3, shown: 3, loaded: 3, loadMore: undefined, loadingMore: false, gatesMore: false, moreGates: undefined, needs: 0,
    gatesError: null, sources: [], folders: [], isPending: false, error: null, refetch: () => undefined, reread: async () => false, ...o,
  });
  const feed = { tokens: null, live: true, why: undefined, retry: () => undefined } as unknown as Part['feed'];
  const base = digest({ feed, read: read({}) });
  for (const [what, o] of [
    ['the count shown', { shown: 4 }],
    ['the agent total', { total: 4 }],
    ['whether coverage is proven complete', { sources: [{ kind: 'sessions', computer: '', state: 'pending' }] }],
    ['the session continuation', { loadMore: () => undefined }],
  ] as const)
    it(`${what} changes the digest`, () => {
      expect(digest({ feed, read: read(o as Partial<ChatsRead>) })).not.toBe(base);
    });
});
