// Vitest: a search source that is still getting ready (the kit's SOURCE_WARMING, or SOURCE_BACKOFF while nix waits
// out a failed background search: 60 s and up) is asked again by itself, on its own schedule: each answer that still
// says so arms one ask, waiting longer each time (WARM_RETRY_MS doubling, capped at WARM_RETRY_MAX_MS), never while
// its read is out, at most WARM_RETRIES times. The answer to the last ask, still warming, makes it read as not
// answering (its Try again shows); Try again starts that source over. A new query (back to an earlier one too) starts
// from none, and a done answer stops it, as does a failed one (each shape the search source can answer,
// pinned one by one).
// The sources are a scripted stand-in for coreSource: per read (source, words and the computer the context names, as
// core's query key), an answer the test gives, whether a read is out (a refetch sends one; the next answer ends it),
// and when the answer came; useQueryHash names that read.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { act, renderHook } from '@app/testing';
import { useFind, warmRetryDelay } from './data';
import { WARM_RETRIES, WARM_RETRY_MAX_MS, WARM_RETRY_MS } from './logic';

type Entry = { data?: unknown; at: number; fetching: boolean; error: Error | null };
const S = vi.hoisted(() => ({
  entries: new Map<string, Entry>(),
  /** The sources asked again, in order, and the reads they were (source|words|computer). */
  asks: [] as string[],
  askIds: [] as string[],
  /** The computer the context names (core's query key carries it). */
  ctx: 'c1',
  clock: 0,
  version: 0,
  subs: new Set<() => void>(),
}));
const notify = () => {
  S.version++;
  for (const f of S.subs) f();
};

vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const { useSyncExternalStore } = await import('react');
  const subscribe = (f: () => void) => {
    S.subs.add(f);
    return () => void S.subs.delete(f);
  };
  return {
    ...real,
    useCurrentComputer: () => null,
    coreSource: () => ({
      useQueryHash: (key: string, p?: { q?: string }) => `${key}|${p?.q ?? ''}|${S.ctx}`,
      useQuery: (key: string, p?: { q?: string }) => {
        useSyncExternalStore(subscribe, () => S.version);
        const id = `${key}|${p?.q ?? ''}|${S.ctx}`;
        const e = S.entries.get(id);
        return {
          data: e?.data,
          error: e?.error ?? null,
          isPending: e?.data === undefined && !e?.error,
          isFetching: !!e?.fetching,
          dataUpdatedAt: e?.at ?? 0,
          refetch: () => {
            S.asks.push(key.replace('search.', ''));
            S.askIds.push(id);
            S.entries.set(id, { at: 0, error: null, ...S.entries.get(id), fetching: true });
            notify();
            return Promise.resolve({});
          },
        };
      },
      useQueries: () => [],
      useMutation: () => ({}),
    }),
  };
});

/** The source `kind` answers query `q` (on the context's computer, or `o.on`): still getting ready, or done; with
 *  o.failed it also says it failed; o.at gives the answer's time (else a new one). A read that was out ends. */
const answer = (kind: string, q: string, warming: boolean, o: { failed?: boolean; at?: number; on?: string } = {}) =>
  act(() => {
    S.entries.set(`search.${kind}|${q}|${o.on ?? S.ctx}`, { data: { rows: [], partial: false, warming, failed: !!o.failed }, at: o.at ?? ++S.clock, fetching: false, error: null });
    notify();
  });
/** The context moves to another computer. */
const moveTo = (computer: string) =>
  act(() => {
    S.ctx = computer;
    notify();
  });
/** The read of `kind` for `q` fails (the answer it had stays, as TanStack keeps it). */
const fail = (kind: string, q: string) =>
  act(() => {
    const id = `search.${kind}|${q}|${S.ctx}`;
    S.entries.set(id, { at: 0, ...S.entries.get(id), fetching: false, error: new Error('unreachable') });
    notify();
  });
/** A read of `kind` for `q` sent by something else (a refresh, a refocus) is out. */
const outside = (kind: string, q: string) =>
  act(() => {
    const id = `search.${kind}|${q}|${S.ctx}`;
    S.entries.set(id, { at: 0, error: null, ...S.entries.get(id), fetching: true });
    notify();
  });
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const find = (q: string) => renderHook(({ q: words }) => useFind(words), { initialProps: { q } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  S.entries.clear();
  S.asks.length = 0;
  S.askIds.length = 0;
  S.clock = 0;
  S.ctx = 'c1';
});
afterEach(() => {
  vi.useRealTimers();
});

describe('a source still getting ready is asked again by itself, on its own schedule', () => {
  it('the wait starts at WARM_RETRY_MS, doubles, and stops growing at WARM_RETRY_MAX_MS', () => {
    expect(Array.from({ length: 6 }, (_, n) => warmRetryDelay(n))).toEqual([10000, 20000, 40000, 60000, 60000, 60000]);
    expect(WARM_RETRY_MS).toBe(10000);
    expect(WARM_RETRY_MAX_MS).toBe(60000);
  });

  it('three answers that are still getting ready: three asks, each after a longer wait', () => {
    const h = find('gimp');
    answer('nix', 'gimp', true);
    expect(h.result.current.find?.nix?.state).toBe('done');
    expect(h.result.current.find?.nix?.warming).toBe(true);
    for (let n = 0; n < 3; n++) {
      wait(warmRetryDelay(n) - 1);
      expect(S.asks).toHaveLength(n);
      wait(1);
      expect(S.asks).toEqual(Array(n + 1).fill('nix'));
      answer('nix', 'gimp', true);
    }
  });

  it('nothing more is asked while its read is out, however long it takes', () => {
    find('gimp');
    answer('nix', 'gimp', true);
    wait(warmRetryDelay(0));
    expect(S.asks).toEqual(['nix']);
    wait(10 * WARM_RETRY_MAX_MS);
    expect(S.asks).toEqual(['nix']);
  });

  it('a read something else sent holds the wait until its answer, which arms the next one', () => {
    find('gimp');
    answer('nix', 'gimp', true);
    wait(warmRetryDelay(0) - 1);
    outside('nix', 'gimp');
    wait(10 * WARM_RETRY_MAX_MS);
    expect(S.asks).toEqual([]);
    answer('nix', 'gimp', true);
    wait(warmRetryDelay(1));
    expect(S.asks).toEqual(['nix']);
  });

  it('two sources answering at different times keep separate schedules', () => {
    find('gimp');
    answer('nix', 'gimp', true); // t = 0
    wait(5000);
    answer('pkgx', 'gimp', true); // t = 5 s: nix's wait goes on
    wait(5000); // t = 10 s
    expect(S.asks).toEqual(['nix']);
    wait(2000); // t = 12 s
    answer('nix', 'gimp', true); // nix's next wait: 20 s, to t = 32 s; pkgx's first ask stays at t = 15 s
    wait(3000); // t = 15 s
    expect(S.asks).toEqual(['nix', 'pkgx']);
    wait(1000); // t = 16 s
    answer('pkgx', 'gimp', true); // pkgx's next wait: 20 s, to t = 36 s
    wait(16000 - 1); // t = 32 s - 1 ms
    expect(S.asks).toEqual(['nix', 'pkgx']);
    wait(1); // t = 32 s
    expect(S.asks).toEqual(['nix', 'pkgx', 'nix']);
    wait(4000); // t = 36 s
    expect(S.asks).toEqual(['nix', 'pkgx', 'nix', 'pkgx']);
  });

  it('Try again restarts that source alone: its pending ask goes, the next wait is the first again', () => {
    const h = find('gimp');
    answer('nix', 'gimp', true);
    answer('pkgx', 'gimp', true);
    for (let n = 0; n < 3; n++) {
      wait(warmRetryDelay(n));
      answer('nix', 'gimp', true);
      answer('pkgx', 'gimp', true);
    }
    expect(S.asks).toHaveLength(6); // nix and pkgx, three rounds; both now wait warmRetryDelay(3)
    act(() => h.result.current.retry(['nix']));
    expect(S.asks).toHaveLength(7);
    wait(warmRetryDelay(3));
    expect(S.asks.slice(7)).toEqual(['pkgx']); // the manual read is out: nix asks nothing more
    answer('nix', 'gimp', true);
    wait(warmRetryDelay(0));
    expect(S.asks.slice(7)).toEqual(['pkgx', 'nix']);
  });

  it('a new query drops the old one’s wait', () => {
    const h = find('gimp');
    answer('nix', 'gimp', true);
    wait(warmRetryDelay(0) - 1);
    h.rerender({ q: 'gimp2' });
    wait(10 * WARM_RETRY_MAX_MS);
    expect(S.asks).toEqual([]);
  });

  it('a new query starts its own asks from the first wait', () => {
    const h = find('gimp');
    answer('nix', 'gimp', true);
    for (let n = 0; n < 3; n++) {
      wait(warmRetryDelay(n));
      answer('nix', 'gimp', true);
    }
    expect(S.asks).toHaveLength(3);
    h.rerender({ q: 'gimp2' });
    answer('nix', 'gimp2', true);
    wait(warmRetryDelay(0));
    expect(S.asks).toHaveLength(4);
  });

  it('queries keep their own counts: one that ran out passes nothing on, and is not run out when it comes back', () => {
    const h = find('gimp2');
    answer('nix', 'gimp2', true); // gimp2 has an answer still getting ready, kept while gimp runs
    h.rerender({ q: 'gimp' });
    answer('nix', 'gimp', true);
    for (let n = 0; n < WARM_RETRIES; n++) {
      wait(warmRetryDelay(n));
      answer('nix', 'gimp', true);
    }
    expect(h.result.current.find?.nix?.state).toBe('failed');
    // away and straight back, before the other query asked anything: gimp starts over
    h.rerender({ q: 'gimp2' });
    h.rerender({ q: 'gimp' });
    expect(h.result.current.find?.nix?.state).toBe('done');
    expect(h.result.current.find?.nix?.warming).toBe(true);
    let before = S.asks.length;
    wait(warmRetryDelay(0));
    expect(S.asks).toHaveLength(before + 1);
    // and gimp2, kept still getting ready, owes nothing to gimp's asks
    h.rerender({ q: 'gimp2' });
    expect(h.result.current.find?.nix?.state).toBe('done');
    expect(h.result.current.find?.nix?.warming).toBe(true);
    before = S.asks.length;
    wait(warmRetryDelay(0));
    expect(S.asks).toHaveLength(before + 1);
  });

  it('the same words on another computer are another read: its count is its own', () => {
    const h = find('gimp');
    answer('nix', 'gimp', true, { on: 'c2' }); // c2 has an answer still getting ready, kept
    answer('nix', 'gimp', true);
    for (let n = 0; n < WARM_RETRIES; n++) {
      wait(warmRetryDelay(n));
      answer('nix', 'gimp', true);
    }
    expect(h.result.current.find?.nix?.state).toBe('failed');
    moveTo('c2');
    expect(h.result.current.find?.nix?.state).toBe('done');
    expect(h.result.current.find?.nix?.warming).toBe(true);
    const before = S.asks.length;
    wait(warmRetryDelay(0));
    expect(S.askIds.slice(before)).toEqual(['search.nix|gimp|c2']);
  });

  it('two reads whose answers carry the same time: switching starts the new read’s own first wait', () => {
    const h = find('gimp');
    answer('nix', 'gimp2', true, { at: 500 });
    answer('nix', 'gimp', true, { at: 500 });
    wait(5000);
    h.rerender({ q: 'gimp2' });
    wait(warmRetryDelay(0) - 5000); // gimp's wait would have ended here
    expect(S.askIds).toEqual([]);
    wait(5000 - 1);
    expect(S.askIds).toEqual([]);
    wait(1);
    expect(S.askIds).toEqual(['search.nix|gimp2|c1']);
  });

  it('a fresh answer that lands while it waits starts the next wait over, longer', () => {
    find('gimp');
    answer('nix', 'gimp', true);
    wait(warmRetryDelay(0) - 1000);
    answer('nix', 'gimp', true); // came by another way (no read of ours was out)
    wait(1000);
    expect(S.asks).toEqual([]);
    wait(warmRetryDelay(1) - 1000 - 1);
    expect(S.asks).toEqual([]);
    wait(1);
    expect(S.asks).toEqual(['nix']);
  });

  it('a done answer stops the asks', () => {
    const h = find('gimp');
    answer('nix', 'gimp', true);
    wait(warmRetryDelay(0));
    expect(S.asks).toEqual(['nix']);
    answer('nix', 'gimp', false);
    wait(10 * WARM_RETRY_MAX_MS);
    expect(S.asks).toEqual(['nix']);
    expect(h.result.current.find?.nix?.state).toBe('done');
    expect(h.result.current.find?.nix?.warming).toBe(false);
  });

  it('an answer still getting ready that also says it failed is not asked again by itself: Try again only', () => {
    const h = find('gimp');
    answer('nix', 'gimp', true, { failed: true });
    expect(h.result.current.find?.nix?.state).toBe('failed');
    wait(10 * WARM_RETRY_MAX_MS);
    expect(S.asks).toEqual([]);
    act(() => h.result.current.retry(['nix']));
    expect(S.asks).toEqual(['nix']);
    answer('nix', 'gimp', true, { failed: true });
    wait(10 * WARM_RETRY_MAX_MS);
    expect(S.asks).toEqual(['nix']);
  });

  it('a read that fails is not asked again by itself (its Try again is the way)', () => {
    const h = find('gimp');
    answer('nix', 'gimp', true);
    wait(warmRetryDelay(0));
    fail('nix', 'gimp');
    wait(10 * WARM_RETRY_MAX_MS);
    expect(S.asks).toEqual(['nix']);
    expect(h.result.current.find?.nix?.state).toBe('failed');
  });

  it(`after ${WARM_RETRIES} asks, only the last one’s answer, still warming, reads as not answering; Try again starts over`, () => {
    const h = find('gimp');
    answer('nix', 'gimp', true);
    for (let n = 0; n < WARM_RETRIES; n++) {
      wait(warmRetryDelay(n));
      expect(S.asks).toHaveLength(n + 1);
      expect(h.result.current.find?.nix?.state).toBe('done'); // the ask is out: not "didn't answer" yet
      answer('nix', 'gimp', true);
    }
    expect(h.result.current.find?.nix?.state).toBe('failed');
    wait(10 * WARM_RETRY_MAX_MS);
    expect(S.asks).toHaveLength(WARM_RETRIES);

    act(() => h.result.current.retry(['nix']));
    expect(S.asks).toHaveLength(WARM_RETRIES + 1);
    expect(h.result.current.find?.nix?.state).toBe('done');
    answer('nix', 'gimp', true);
    wait(warmRetryDelay(0));
    expect(S.asks).toHaveLength(WARM_RETRIES + 2);
  });
});
