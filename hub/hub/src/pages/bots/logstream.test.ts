// Vitest: the Bot log's stream only wakes reads. Each frame wakes one log read (a state frame a view read
// too), coalesced to one in flight and one queued; it reports live only while open; it reopens with backoff that starts over
// only after a connection stayed open for the longest delay, never after a definite 4xx; close() ends everything, a queued
// read included.
import type { StreamState } from '@core';
import { describe, expect, it, vi } from 'vitest';
import { coalesced, LOG_WAKER_DELAYS, startLogWaker } from './logstream';

type H = { onEvent(name: string): void; onState(s: StreamState): void };
const OPEN: StreamState = { state: 'open', status: 200 };
const BUDGET: StreamState = { state: 'error', status: 0, code: 'budget', retryAfterMs: null, retryAfter: null };
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

/** A waker over fake opens, reads that settle when the test says, and a recorded timer. */
function world() {
  const opens: { h: H; close: ReturnType<typeof vi.fn> }[] = [];
  const pending: { log: (() => void)[]; view: (() => void)[] } = { log: [], view: [] };
  const reads = { log: 0, view: 0 };
  const live: boolean[] = [];
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const clock = { t: 0 };
  const w = startLogWaker({
    now: () => clock.t,
    open: (h) => {
      const close = vi.fn();
      opens.push({ h, close });
      return { close };
    },
    readLog: () => {
      reads.log += 1;
      return new Promise<void>((r) => pending.log.push(r));
    },
    readView: () => {
      reads.view += 1;
      return new Promise<void>((r) => pending.view.push(r));
    },
    onLive: (v) => live.push(v),
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => {
      (t as { cleared: boolean }).cleared = true;
    },
  });
  const settle = async (kind: 'log' | 'view') => {
    const r = pending[kind].shift();
    r?.();
    await flush();
  };
  const last = () => opens[opens.length - 1]!;
  return { w, opens, reads, live, timers, settle, last, clock };
}

describe('coalesced reads', () => {
  it('a wake while a read runs asks for exactly one more after it, however many wakes come', async () => {
    let n = 0;
    const done: (() => void)[] = [];
    const { wake } = coalesced(() => {
      n += 1;
      return new Promise<void>((r) => done.push(r));
    });
    wake();
    for (let i = 0; i < 10; i++) wake();
    expect(n).toBe(1);
    done.shift()!();
    await flush();
    expect(n).toBe(2);
    done.shift()!();
    await flush();
    expect(n).toBe(2);
  });
  it('a failed read still lets the next wake read', async () => {
    let n = 0;
    const { wake } = coalesced(() => {
      n += 1;
      return Promise.reject(new Error('x'));
    });
    wake();
    await flush();
    wake();
    await flush();
    expect(n).toBe(2);
  });
});

describe('the log stream wakes reads', () => {
  it('opens one stream; a row frame wakes exactly one log read and no view read', () => {
    const s = world();
    expect(s.opens).toHaveLength(1);
    s.last().h.onState(OPEN);
    s.last().h.onEvent('row');
    expect(s.reads).toEqual({ log: 1, view: 0 });
  });
  it('a burst of frames is at most two log reads: one in flight, one queued', async () => {
    const s = world();
    s.last().h.onState(OPEN);
    for (let i = 0; i < 25; i++) s.last().h.onEvent('row');
    expect(s.reads.log).toBe(1);
    await s.settle('log');
    expect(s.reads.log).toBe(2);
    await s.settle('log');
    expect(s.reads.log).toBe(2);
  });
  it('a state frame wakes a view read and a log read', () => {
    const s = world();
    s.last().h.onEvent('state');
    expect(s.reads).toEqual({ log: 1, view: 1 });
  });
  it.each(['archived', 'lagged', 'end'])('an %s frame wakes a log read', (name) => {
    const s = world();
    s.last().h.onEvent(name);
    expect(s.reads.log).toBe(1);
  });
  it('a frame too large to read wakes both reads and keeps the stream', () => {
    const s = world();
    s.last().h.onState(OPEN);
    s.last().h.onState({ state: 'gap', reason: 'frame_too_large' });
    expect(s.reads).toEqual({ log: 1, view: 1 });
    expect(s.timers).toHaveLength(0);
    expect(s.live).toEqual([true]);
  });
});

describe('live, and coming back', () => {
  it('live only once open; a budget refusal is not live, wakes a log read and opens again after 1 s', () => {
    const s = world();
    expect(s.live).toEqual([]);
    s.last().h.onState(BUDGET);
    expect(s.live).toEqual([]);
    expect(s.reads.log).toBe(1);
    expect(s.timers.map((t) => t.ms)).toEqual([LOG_WAKER_DELAYS[0]]);
    s.timers[0]!.fn();
    expect(s.opens).toHaveLength(2);
    s.last().h.onState(OPEN);
    expect(s.live).toEqual([true]);
  });
  it('a cut while live reports not live; the delays grow 1, 2, 5, 10, 10 s', () => {
    const s = world();
    s.last().h.onState(OPEN);
    const cut = (): void => s.last().h.onState({ state: 'closed', reason: 'budget' });
    for (let i = 0; i < 5; i++) {
      cut();
      s.timers[s.timers.length - 1]!.fn();
    }
    expect(s.timers.map((t) => t.ms)).toEqual([1000, 2000, 5000, 10000, 10000]);
    expect(s.live).toEqual([true, false]);
  });
  it('a stream cut right after its opening state frame, again and again, keeps backing off', () => {
    const s = world();
    for (let i = 0; i < 6; i++) {
      s.last().h.onState(OPEN);
      s.last().h.onEvent('state');
      s.clock.t += 50;
      s.last().h.onState({ state: 'closed', reason: 'server' });
      s.timers[s.timers.length - 1]!.fn();
    }
    expect(s.timers.map((t) => t.ms)).toEqual([1000, 2000, 5000, 10000, 10000, 10000]);
  });
  it('the delays start over only after a connection stayed open for the longest delay', () => {
    const s = world();
    const cycle = (openMs: number): number => {
      s.last().h.onState(OPEN);
      s.clock.t += openMs;
      s.last().h.onState({ state: 'closed', reason: 'server' });
      const t = s.timers[s.timers.length - 1]!;
      t.fn();
      return t.ms;
    };
    expect([cycle(10), cycle(10), cycle(10)]).toEqual([1000, 2000, 5000]);
    expect(cycle(9999)).toBe(10000);
    expect(cycle(10000)).toBe(1000);
  });
  it('a definite 4xx ends it for good; a 429 or 5xx opens again', () => {
    for (const [status, again] of [[404, false], [403, false], [429, true], [408, true], [503, true]] as const) {
      const s = world();
      s.last().h.onState({ state: 'error', status, code: 'x', retryAfterMs: null, retryAfter: null });
      expect(s.timers.length > 0, String(status)).toBe(again);
    }
  });
  it('frames and states of an ended connection change nothing', () => {
    const s = world();
    const first = s.last();
    first.h.onState(BUDGET);
    first.h.onEvent('row');
    first.h.onState(OPEN);
    expect(s.reads.log).toBe(1);
    expect(s.live).toEqual([]);
  });
});

describe('close', () => {
  it('closes the stream, cancels a pending reopen and reports nothing more', () => {
    const s = world();
    s.last().h.onState(OPEN);
    s.w.close();
    expect(s.last().close).toHaveBeenCalledTimes(1);
    s.last().h.onEvent('row');
    s.last().h.onState({ state: 'closed', reason: 'aborted' });
    expect(s.reads.log).toBe(0);
    expect(s.live).toEqual([true]);
    expect(s.timers).toHaveLength(0);
    const t = world();
    t.last().h.onState(BUDGET);
    t.w.close();
    expect(t.timers[0]!.cleared).toBe(true);
  });
  it('a read queued behind a running one never starts after close', async () => {
    const s = world();
    s.last().h.onEvent('state');
    s.last().h.onEvent('state');
    expect(s.reads).toEqual({ log: 1, view: 1 });
    s.w.close();
    await s.settle('log');
    await s.settle('view');
    expect(s.reads).toEqual({ log: 1, view: 1 });
  });
});
