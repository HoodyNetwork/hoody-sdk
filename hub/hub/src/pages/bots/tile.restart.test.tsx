// Vitest on a live page: the bots tile and its computer's runtime mark. The agent's GET /health
// `started` + `pid` name one agent runtime; the tile keys its Bot read by the mark, so a stop and restart that no
// computers answer saw never leaves the Bot answer from before on screen. Contract, in plain words:
//   - A changed mark starts a key with no data: the tile is loading until a Bot answer sent under the new mark lands.
//   - The epoch's first mark: the tile waits for it (no Bot read, no cached answer shown) for at most HEALTH_WAIT_MS,
//     then reads the Bot as today; a failed first health read reads as today at once (the Bots page's shared answer at
//     epoch 0), and later polls, held or failing, keep it until a good mark arrives.
//   - Only a well-formed answer is a mark; a failure or a malformed answer keeps the last good mark.
//   - The list decides first: a stopped, missing, unreachable or failed-list computer is gone or its retry at once.
//   - One health query per computer and epoch, shared by its tiles; none off screen, none from the Bots page.
// Every test runs with fake intervals and a held HEALTH_WAIT_MS timer: nothing polls unless the test moves the clock
// (the Bot read's own 8 s poll, the 15 s health poll), and the bound fires only when the test fires it, so request
// counts and deadlines are the test's, not the worker's speed. Zero-delay timeouts stay real (response bodies and
// TanStack's notify batches run on them).
import { queryClient } from '@core';
import { boot, calls, deferred, onFetch, settle, type Reply } from '@core/test/env';
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Data from './data';
import { useScreenState, useTileBot } from './tileState';

// Read through the namespace so the file loads on code without the mark (the red run of the first test).
const D = Data as unknown as { HEALTH_WAIT_MS?: number; resetRecoveriesForTests?: () => void };
const WAIT = D.HEALTH_WAIT_MS ?? 3000;

const KEY = 'c1~aaaaaaaaaaaaaaaaaaaaaaa1~chief';
const KEY2 = 'c2~aaaaaaaaaaaaaaaaaaaaaaa1~chief';
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
/** Runs what is due now; it moves no fake interval and fires no held bound. */
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const CLOCK = ['setInterval', 'clearInterval'] as const;
// The HEALTH_WAIT_MS timers the tile starts, held until the test fires them (by handle; a cleared one is dropped).
const bounds = new Map<number, () => void>();
let nextBound = 1_000_000;
function holdBounds() {
  bounds.clear();
  if (vi.isMockFunction(globalThis.setTimeout)) return;
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) => {
    if (ms !== WAIT) return realSet(fn, ms, ...a);
    const id = nextBound++;
    bounds.set(id, () => fn(...a));
    return id;
  }) as unknown as typeof setTimeout);
  vi.spyOn(globalThis, 'clearTimeout').mockImplementation(((id?: number) => {
    if (typeof id === 'number' && bounds.delete(id)) return;
    realClear(id);
  }) as unknown as typeof clearTimeout);
}
/** Fires every HEALTH_WAIT_MS timer still running (the bound is reached). */
const reachBound = () =>
  act(async () => {
    const due = [...bounds.values()];
    bounds.clear();
    for (const f of due) f();
    await flush();
  });
const c1 = { id: 'c1', project_id: 'p1', server_name: 'sv1', status: 'running' };
const c2 = { id: 'c2', project_id: 'p1', server_name: 'sv1', status: 'running' };
const T1 = '2026-11-06T01:00:00Z';
const T2 = '2026-11-06T02:00:00Z';

type Health = { started: string; pid: number } | { fail: number } | { raw: unknown } | { network: true } | { hold: Promise<Health> };
interface World {
  /** The computers list, or its failure status. */
  computers?: object[] | number;
  /** The Bot's name in the Bot read's answer (taken when the read is sent). */
  name?: string;
  /** The Bot read's status (200 answers the Bot). */
  bot?: number;
  /** The Bot read's answer waits for this. */
  botHold?: Promise<void>;
  /** c1's health answer (default T1, pid 10). */
  health?: Health;
  /** c2's health answer (default T1, pid 20). */
  health2?: Health;
}
const healthReply = async (h: Health): Promise<Reply> => {
  if ('hold' in h) return healthReply(await h.hold);
  if ('fail' in h) return { status: h.fail, body: { error: { code: 'internal_error', message: 'x' } } };
  if ('network' in h) return { status: 0, network: true };
  if ('raw' in h) return { status: 200, body: h.raw };
  return { status: 200, body: { status: 'ok', service: 'hoody-agent', started: h.started, pid: h.pid } };
};
const isC2 = (url: string) => url.includes('c2');
function serve(w: World) {
  onFetch((c) => {
    const u = new URL(c.url);
    if (/\/computers$/.test(u.pathname)) {
      if (typeof w.computers === 'number') return { status: w.computers, body: { error: { code: 'internal_error', message: 'x' } } };
      return { status: 200, body: { data: { computers: w.computers ?? [c1] } } };
    }
    if (/\/health$/.test(u.pathname)) return healthReply(isC2(c.url) ? (w.health2 ?? { started: T1, pid: 20 }) : (w.health ?? { started: T1, pid: 10 }));
    if (/\/bots\/chief$/.test(u.pathname)) {
      const st = w.bot ?? 200;
      if (st !== 200) return { status: st, body: { error: { code: st === 404 ? 'not_found' : 'internal_error', message: 'x' } } };
      const ok = { status: 200, body: { id: 'chief', uid: 'u1', name: w.name ?? 'Old' } };
      return w.botHold ? w.botHold.then(() => ok) : ok;
    }
    return { status: 200, body: { items: [], meta: { total: 0 } } };
  });
}
const healthReads = (c = 'c1') => calls.filter((x) => new URL(x.url).pathname.endsWith('/health') && isC2(x.url) === (c === 'c2')).length;
const botReads = () => calls.filter((c) => new URL(c.url).pathname.endsWith('/bots/chief')).length;
const named = (n: string) => (q: { queryKey: readonly unknown[] }) => q.queryKey[6] === n;
/** The params of the Bot reads that hold an answer (a Bot key, or the tile's {key, epoch, mark}). */
const answeredViews = () =>
  queryClient
    .getQueryCache()
    .findAll({ predicate: named('view') })
    .filter((q) => q.state.data !== undefined)
    .map((q) => q.queryKey[7]);

const mount = async (w: World, key = KEY, onScreen = true) => {
  serve(w);
  const h = renderHook(() => useTileBot(key, onScreen), { wrapper: wrap });
  await act(flush);
  return h;
};
/** The Bots page's own read of the Bot (the plain key), as the page leaves it in the cache. */
const primePage = async (w: World) => {
  serve(w);
  const h = renderHook(
    () => {
      Data.useComputers();
      return Data.useBotView(KEY);
    },
    { wrapper: wrap },
  );
  await act(flush);
  expect(h.result.current.bot?.name).toBe(w.name ?? 'Old');
  return h;
};
/** A poll of the read (joins a fetch in flight, as the interval does); not awaited, a held answer stays held. */
const poll = (n: string, rounds = 20) =>
  act(async () => {
    void queryClient.refetchQueries({ predicate: named(n) }, { cancelRefetch: false });
    for (let i = 0; i < rounds; i++) await settle();
  });
/** Re-reads the named reads (cancels one in flight). */
const reread = (n: string) =>
  act(async () => {
    await queryClient.invalidateQueries({ predicate: named(n) });
    await flush();
  });
const release = (h: { res: () => void }) =>
  act(async () => {
    h.res();
    await flush();
  });
/** Moves the fake clock by `ms` and runs what that made due. */
const pass = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
    await flush();
  });
/** c1's agentMark key of `epoch` once the list gave its address (project p1), not one made before it. */
const routed = (k: readonly unknown[], epoch: number) => {
  const j = JSON.stringify(k);
  return j.includes(JSON.stringify({ computerId: 'c1', epoch })) && j.includes('["p1","c1"]');
};
/** The committed runtime mark of c1 in `epoch` (the agentMark query's data), if any. */
const markOf = (epoch: number) =>
  queryClient
    .getQueryCache()
    .findAll({ predicate: named('agentMark') })
    .find((q) => routed(q.queryKey, epoch))?.state.data;

beforeEach(() => {
  vi.useFakeTimers({ toFake: [...CLOCK] });
  holdBounds();
  boot({ realm: 'aaaaaaaaaaaaaaaaaaaaaaa1' });
  queryClient.clear();
  Data.registerTargets([]);
  D.resetRecoveriesForTests?.();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('the bots tile and its computer runtime mark', () => {
  it('a stop and restart that no computers answer saw: the Bot answer from before never shows again', async () => {
    const { result } = await mount({ name: 'Old' });
    expect(result.current.show).toBe('ready');
    expect(result.current.bot?.name).toBe('Old');
    const hold = deferred();
    serve({ name: 'New', botHold: hold.p, health: { started: T2, pid: 11 } });
    await poll('agentMark');
    await poll('view');
    expect(result.current.show).toBe('loading');
    expect(result.current.bot).toBeUndefined();
    await release(hold);
    expect(result.current.show).toBe('ready');
    expect(result.current.bot?.name).toBe('New');
  });

  for (const [label, health] of [
    ['a 404', { fail: 404 }],
    ['a 500', { fail: 500 }],
    ['a network failure', { network: true }],
    ['a malformed answer', { raw: {} }],
  ] as [string, Health][]) {
    it(`health that fails at epoch 0 (${label}) shows the Bots page's shared answer, read as today`, async () => {
      await primePage({ name: 'Old' });
      const before = botReads();
      const { result } = await mount({ name: 'Old', health });
      expect(result.current.show).toBe('ready');
      expect(result.current.bot?.name).toBe('Old');
      // Today's key: the page's own query (a mount refreshes it as today), never a key of the tile's own.
      expect(botReads()).toBeLessThanOrEqual(before + 1);
      expect(answeredViews()).toEqual([KEY]);
    });
  }

  it('a health read slower than the bound shows the shared answer, then one re-read under the mark when it lands', async () => {
    await primePage({ name: 'Old' });
    const h = deferred<Health>();
    const { result } = await mount({ name: 'Old', health: { hold: h.p } });
    expect(result.current.show).toBe('loading');
    expect(result.current.bot).toBeUndefined();
    // Just before the bound: still waiting, however long the worker took.
    await act(flush);
    expect(result.current.show).toBe('loading');
    expect(bounds.size).toBe(1);
    await reachBound();
    expect(result.current.show).toBe('ready');
    expect(result.current.bot?.name).toBe('Old');
    expect(answeredViews()).toEqual([KEY]);
    const shared = botReads();
    serve({ name: 'Old' });
    await act(async () => {
      h.res({ started: T1, pid: 10 });
      await flush();
    });
    expect(botReads()).toBe(shared + 1);
    expect(result.current.show).toBe('ready');
  });

  it('with the Bots page answer cached, the tile waits for its first mark showing nothing cached, then reads under the mark', async () => {
    await primePage({ name: 'Old' });
    const h = deferred<Health>();
    const { result } = await mount({ name: 'Fresh', health: { hold: h.p } });
    expect(result.current.show).toBe('loading');
    expect(result.current.bot).toBeUndefined();
    const before = botReads();
    await act(async () => {
      h.res({ started: T1, pid: 10 });
      await flush();
    });
    expect(botReads()).toBe(before + 1);
    expect(result.current.bot?.name).toBe('Fresh');
  });

  it('after a failed first health read, later polls held or failing keep the shared answer; a good mark then re-reads once', async () => {
    await primePage({ name: 'Old' });
    const { result } = await mount({ name: 'Old', health: { fail: 500 } });
    expect(result.current.bot?.name).toBe('Old');
    const h = deferred<Health>();
    serve({ name: 'Old', health: { hold: h.p } });
    await poll('agentMark');
    expect(result.current.show).toBe('ready');
    expect(result.current.bot?.name).toBe('Old');
    await act(async () => {
      h.res({ fail: 503 });
      await flush();
    });
    expect(result.current.show).toBe('ready');
    const before = botReads();
    serve({ name: 'New', health: { started: T1, pid: 10 } });
    await poll('agentMark');
    expect(botReads()).toBe(before + 1);
    expect(result.current.bot?.name).toBe('New');
  });

  it('the same mark again re-reads nothing', async () => {
    const { result } = await mount({});
    const before = botReads();
    await poll('agentMark');
    await poll('agentMark');
    expect(botReads()).toBe(before);
    expect(result.current.show).toBe('ready');
  });

  for (const [label, next] of [
    ['a new pid with the same start', { started: T1, pid: 11 }],
    ['a new start with the same pid', { started: T2, pid: 10 }],
  ] as [string, Health][]) {
    it(`${label} moves the key once`, async () => {
      const { result } = await mount({ name: 'Old' });
      const before = botReads();
      serve({ name: 'New', health: next });
      await poll('agentMark');
      await poll('agentMark');
      expect(botReads()).toBe(before + 1);
      expect(result.current.bot?.name).toBe('New');
    });
  }

  it('a malformed health answer between two identical marks moves nothing', async () => {
    const { result } = await mount({ name: 'Old' });
    const before = botReads();
    const bad: unknown[] = [
      { status: 'ok', started: '2026-02-30T00:00:00Z', pid: 10 },
      { status: 'ok', started: '2026-01-01T24:00:00Z', pid: 10 },
      { status: 'ok', started: '2026-01-01T12:60:00Z', pid: 10 },
      { status: 'ok', started: '2026-11-06T01:00:00.5Z', pid: 10 },
      { status: 'ok', started: '2026-11-06T01:00:00+00:00', pid: 10 },
      { status: 'ok', started: 'garbage', pid: 10 },
      { status: 'ok', started: 5, pid: 10 },
      { started: T2, pid: 10 },
      { status: 'down', started: T2, pid: 10 },
      { status: 'ok', started: T2, pid: 0 },
      { status: 'ok', started: T2, pid: -1 },
      { status: 'ok', started: T2, pid: 1.5 },
      { status: 'ok', started: T2, pid: 2 ** 53 },
      { status: 'ok', started: T2, pid: '11' },
      {},
    ];
    for (const raw of bad) {
      serve({ name: 'New', health: { raw } });
      await poll('agentMark', 4);
      expect(markOf(Data.recoveryEpoch('c1'))).toBe(`${T1}|10`);
      serve({ name: 'New' });
      await poll('agentMark', 4);
    }
    await act(flush);
    expect(botReads()).toBe(before);
    expect(result.current.bot?.name).toBe('Old');
  }, 60000);

  it('a health failure after a good mark (403, 429, 500, network) keeps the mark; a new mark then re-reads once', async () => {
    const { result } = await mount({ name: 'Old' });
    const before = botReads();
    for (const health of [{ fail: 403 }, { fail: 429 }, { fail: 500 }, { network: true }] as Health[]) {
      serve({ name: 'New', health });
      await poll('agentMark');
      expect(result.current.show).toBe('ready');
      expect(result.current.bot?.name).toBe('Old');
    }
    expect(botReads()).toBe(before);
    serve({ name: 'New', health: { started: T2, pid: 11 } });
    await poll('agentMark');
    expect(botReads()).toBe(before + 1);
    expect(result.current.bot?.name).toBe('New');
  });
});

describe('the list decides first, before any wait for the mark', () => {
  it('a visible running computer the agent cannot reach is gone at once, with no health read', async () => {
    const { result } = await mount({ computers: [{ id: 'c1', project_id: 'p1', status: 'running' }] });
    expect(result.current.show).toBe('gone');
    expect(healthReads()).toBe(0);
  });

  it('a failed computers read is its retry at once, not a wait for the mark', async () => {
    const { result } = await mount({ computers: 500 });
    expect(result.current.show).toBe('error');
    expect(result.current.retry).toBeDefined();
    expect(healthReads()).toBe(0);
  });

  it('a computer missing from the list is gone at once', async () => {
    const { result } = await mount({ computers: [{ ...c1, id: 'c9' }] });
    expect(result.current.show).toBe('gone');
    expect(healthReads()).toBe(0);
  });

  it('a stopped computer is gone and a starting one loading, with no health read', async () => {
    expect((await mount({ computers: [{ ...c1, status: 'stopped' }] })).result.current.show).toBe('gone');
    expect((await mount({ computers: [{ ...c1, status: 'starting' }] })).result.current.show).toBe('loading');
    expect(healthReads()).toBe(0);
  });
});

describe('stops, recoveries and late replies', () => {
  it('a health reply that lands while the computer is stopped shows no Bot answer; after the restart nothing from before shows', async () => {
    const { result } = await mount({ name: 'Old' });
    const h = deferred<Health>();
    serve({ name: 'Old', health: { hold: h.p } });
    await poll('agentMark');
    // Stopped: the agent still answers the Bot read; the list decides.
    serve({ computers: [{ ...c1, status: 'stopped' }], name: 'Mid', health: { fail: 503 } });
    await reread('computers');
    expect(result.current.show).toBe('gone');
    const e = Data.recoveryEpoch('c1');
    await act(async () => {
      h.res({ started: T2, pid: 11 });
      await flush();
    });
    // The reply belongs to this epoch and commits; the list still decides what shows.
    expect(markOf(e)).toBe(`${T2}|11`);
    await poll('view');
    expect(result.current.show).toBe('gone');
    // Running again (a new epoch): its own mark, its own Bot read.
    serve({ name: 'New', health: { started: T2, pid: 11 } });
    await reread('computers');
    expect(result.current.show).toBe('ready');
    expect(result.current.bot?.name).toBe('New');
  });

  it('a health reply of the epoch before the restart, delivered after it, changes nothing', async () => {
    const { result } = await mount({ name: 'Old' });
    const e = Data.recoveryEpoch('c1');
    const h = deferred<Health>();
    serve({ name: 'Old', health: { hold: h.p } });
    await poll('agentMark');
    // Another observer of the old epoch's health keeps its read alive (not cancelled when the tile moves on).
    const old = queryClient
      .getQueryCache()
      .findAll({ predicate: named('agentMark') })
      .find((q) => routed(q.queryKey, e));
    expect(old).toBeDefined();
    const keep = new QueryObserver(queryClient, { queryKey: old!.queryKey, enabled: false }).subscribe(() => {});
    serve({ computers: [{ ...c1, status: 'stopped' }], bot: 503, health: { fail: 503 } });
    await reread('computers');
    serve({ name: 'New', health: { started: T2, pid: 11 } });
    await reread('computers');
    expect(result.current.bot?.name).toBe('New');
    const before = botReads();
    await act(async () => {
      h.res({ started: '2026-11-06T09:00:00Z', pid: 99 });
      await flush();
    });
    expect(markOf(e)).toBe('2026-11-06T09:00:00Z|99'); // the old epoch's reply did commit, to its own key
    expect(botReads()).toBe(before);
    expect(result.current.show).toBe('ready');
    expect(result.current.bot?.name).toBe('New');
    keep();
  });

  it('health that sees the new runtime before the list sees the stop: a re-read, then another for the new epoch, never the answer from before', async () => {
    const { result } = await mount({ name: 'Old' });
    const before = botReads();
    serve({ name: 'New', health: { started: T2, pid: 11 } });
    await poll('agentMark');
    expect(result.current.bot?.name).toBe('New');
    serve({ computers: [{ ...c1, status: 'stopped' }], name: 'Old', health: { fail: 503 } });
    await reread('computers');
    expect(result.current.show).toBe('gone');
    serve({ name: 'New', health: { started: T2, pid: 11 } });
    await reread('computers');
    expect(result.current.show).toBe('ready');
    expect(result.current.bot?.name).toBe('New');
    expect(botReads()).toBe(before + 2);
  });

  it('a health sample of an earlier runtime only delays detection: the next changed mark re-reads', async () => {
    const { result } = await mount({ name: 'Old' });
    serve({ computers: [{ ...c1, status: 'stopped' }], bot: 503, health: { fail: 503 } });
    await reread('computers');
    const h = deferred<Health>();
    serve({ name: 'Runtime2', health: { hold: h.p } });
    await reread('computers');
    // The agent restarts again; the held reply is a sample of the runtime before that.
    serve({ name: 'Runtime3', health: { started: '2026-11-06T03:00:00Z', pid: 13 } });
    const r0 = botReads();
    await act(async () => {
      h.res({ started: T2, pid: 12 });
      await flush();
    });
    // The earlier sample commits as the new epoch's mark, and the Bot is read once under it.
    expect(markOf(Data.recoveryEpoch('c1'))).toBe(`${T2}|12`);
    expect(botReads()).toBe(r0 + 1);
    expect(result.current.show).toBe('ready');
    expect(result.current.bot?.name).toBe('Runtime3');
    const before = botReads();
    await poll('agentMark');
    expect(markOf(Data.recoveryEpoch('c1'))).toBe('2026-11-06T03:00:00Z|13');
    expect(botReads()).toBe(before + 1);
    expect(result.current.show).toBe('ready');
    expect(result.current.bot?.name).toBe('Runtime3');
  });

  it('a recovery, then another restart before the new epoch has its first mark: no Bot answer is taken before that mark', async () => {
    const { result } = await mount({ name: 'Old' });
    serve({ computers: [{ ...c1, status: 'stopped' }], bot: 503, health: { fail: 503 } });
    await reread('computers');
    // Back to running; the new epoch's health is held: the Bot is not read yet.
    const h = deferred<Health>();
    serve({ name: 'Between', health: { hold: h.p } });
    const before = botReads();
    await reread('computers');
    expect(result.current.show).toBe('loading');
    expect(botReads()).toBe(before);
    // The agent restarted again meanwhile: the held health answers its latest runtime.
    serve({ name: 'Latest' });
    await act(async () => {
      h.res({ started: T2, pid: 12 });
      await flush();
    });
    expect(botReads()).toBe(before + 1);
    expect(result.current.bot?.name).toBe('Latest');
  });

  it('a computer that leaves the list and comes back, with a health reply held across it, shows no answer from before', async () => {
    const { result } = await mount({ name: 'Old' });
    const h = deferred<Health>();
    serve({ name: 'Old', health: { hold: h.p } });
    await poll('agentMark');
    serve({ computers: [], bot: 503, health: { fail: 503 } });
    await reread('computers');
    expect(result.current.show).toBe('gone');
    serve({ name: 'New', health: { started: T2, pid: 11 } });
    await reread('computers');
    expect(result.current.bot?.name).toBe('New');
    await act(async () => {
      h.res({ started: '2026-11-06T09:00:00Z', pid: 99 });
      await flush();
    });
    expect(result.current.bot?.name).toBe('New');
  });
});

describe('ordering and sharing', () => {
  it('a cancelled health read whose transport answers anyway is not taken', async () => {
    const { result } = await mount({ name: 'Old' });
    const late = deferred();
    // eslint-disable-next-line no-restricted-properties -- a transport that ignores the abort, under the test harness
    const real = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (!String(url).includes('/health')) return real(url, init);
      await late.p; // ignores the abort
      return new Response(JSON.stringify({ status: 'ok', started: T2, pid: 11 }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    serve({ name: 'New' });
    await poll('agentMark');
    await act(async () => {
      await queryClient.cancelQueries({ predicate: named('agentMark') });
      await flush();
    });
    const before = botReads();
    await release(late);
    expect(botReads()).toBe(before);
    expect(result.current.bot?.name).toBe('Old');
  });

  it('the last tile unmounting cancels its health read; a remount sends a new one', async () => {
    const first = await mount({ name: 'Old' });
    const h = deferred<Health>();
    serve({ name: 'Old', health: { hold: h.p } });
    await poll('agentMark');
    const sent = healthReads();
    first.unmount();
    await act(flush);
    serve({ name: 'Old' });
    await act(async () => {
      await queryClient.invalidateQueries({ predicate: named('agentMark') });
      await flush();
    });
    const again = await mount({ name: 'Old' });
    expect(healthReads()).toBeGreaterThan(sent);
    await release({ res: () => h.res({ started: T2, pid: 11 }) });
    expect(again.result.current.bot?.name).toBe('Old');
  });

  it('two tiles of one computer, mounted apart, share one health read in flight and move together', async () => {
    const a = await mount({ name: 'Old' });
    const h = deferred<Health>();
    serve({ name: 'New', health: { hold: h.p } });
    await poll('agentMark');
    const sent = healthReads();
    const b = renderHook(() => useTileBot(KEY), { wrapper: wrap });
    await act(flush);
    await poll('agentMark');
    expect(healthReads()).toBe(sent);
    // One tile remounts while the other stays: the shared read stays in flight.
    b.unmount();
    const b2 = renderHook(() => useTileBot(KEY), { wrapper: wrap });
    await act(flush);
    expect(healthReads()).toBe(sent);
    await act(async () => {
      h.res({ started: T2, pid: 11 });
      await flush();
    });
    expect(a.result.current.bot?.name).toBe('New');
    expect(b2.result.current.bot?.name).toBe('New');
  });

  it('a Bot reply of the old mark, delivered after the key moved, is never shown', async () => {
    const { result } = await mount({ name: 'Old' });
    const hold = deferred();
    serve({ name: 'Stale', botHold: hold.p });
    await poll('view');
    serve({ name: 'New', health: { started: T2, pid: 11 } });
    await poll('agentMark');
    expect(result.current.bot?.name).toBe('New');
    await release(hold);
    expect(result.current.bot?.name).toBe('New');
  });

  it("a restart of another computer moves nothing on this one's tiles", async () => {
    const w: World = { computers: [c1, c2], name: 'Old' };
    const a = await mount(w);
    const b = renderHook(() => useTileBot(KEY2), { wrapper: wrap });
    await act(flush);
    expect(healthReads('c1')).toBeGreaterThan(0);
    expect(healthReads('c2')).toBeGreaterThan(0);
    const before = botReads();
    serve({ ...w, name: 'New', health2: { started: T2, pid: 21 } });
    await poll('agentMark');
    expect(botReads()).toBe(before + 1);
    expect(a.result.current.bot?.name).toBe('Old');
    expect(b.result.current.bot?.name).toBe('New');
  });
});

describe('when health is read', () => {
  it('an off-screen tile sends no health read, and the Bots page alone sends none', async () => {
    await primePage({ name: 'Old' });
    await mount({ name: 'Old' }, KEY, false);
    expect(healthReads()).toBe(0);
  });

  it('health is polled every 15 s while on screen, a read in flight is joined, and a hidden tab polls nothing', async () => {
    await mount({ name: 'Old' });
    const n0 = healthReads();
    await act(async () => {
      vi.advanceTimersByTime(15000);
      await flush();
    });
    expect(healthReads()).toBe(n0 + 1);
    const h = deferred<Health>();
    serve({ name: 'Old', health: { hold: h.p } });
    await act(async () => {
      vi.advanceTimersByTime(15000);
      await flush();
    });
    expect(healthReads()).toBe(n0 + 2);
    await act(async () => {
      vi.advanceTimersByTime(30000);
      await flush();
    });
    expect(healthReads()).toBe(n0 + 2);
    await release({ res: () => h.res({ started: T1, pid: 10 }) });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await act(async () => {
      vi.advanceTimersByTime(45000);
      await flush();
    });
    expect(healthReads()).toBe(n0 + 2);
  });

  it('a fresh mark on re-entry waits for the poll; a stale one is read at once', async () => {
    vi.useFakeTimers({ toFake: [...CLOCK, 'Date'] });
    serve({ name: 'Old' });
    const h = renderHook(({ on }: { on: boolean }) => useTileBot(KEY, on), { wrapper: wrap, initialProps: { on: true } });
    await act(flush);
    const n0 = healthReads();
    h.rerender({ on: false });
    await act(flush);
    h.rerender({ on: true });
    await act(flush);
    expect(healthReads()).toBe(n0);
    h.rerender({ on: false });
    await act(flush);
    vi.setSystemTime(Date.now() + 20000);
    h.rerender({ on: true });
    await act(flush);
    expect(healthReads()).toBe(n0 + 1);
  });

  it('a tile admitted only once seen: off screen until the observer says otherwise sends nothing', async () => {
    serve({ name: 'Old' });
    const h = renderHook(({ seen }: { seen: boolean }) => useTileBot(KEY, true, seen), { wrapper: wrap, initialProps: { seen: false } });
    await act(flush);
    expect(healthReads()).toBe(0);
    expect(h.result.current.show).toBe('ready');
    h.rerender({ seen: true });
    await act(flush);
    expect(healthReads()).toBe(1);
  });

  it('two tiles mounted apart, with the health read held across several polls, send one read in flight', async () => {
    const one = await mount({ name: 'Old' });
    await pass(7000);
    const h = deferred<Health>();
    serve({ name: 'Old', health: { hold: h.p } });
    const two = renderHook(() => useTileBot(KEY), { wrapper: wrap });
    await act(flush);
    expect(two.result.current.bot?.name).toBe('Old');
    const n0 = healthReads();
    await pass(15000);
    // Exactly one poll starts the held read; later polls join it.
    expect(healthReads()).toBe(n0 + 1);
    await pass(15000);
    await pass(15000);
    await pass(15000);
    expect(healthReads()).toBe(n0 + 1);
    serve({ name: 'New', health: { hold: h.p } });
    const b0 = botReads();
    await release({ res: () => h.res({ started: T2, pid: 12 }) });
    // The one answer is a changed mark: both tiles move to the new Bot answer, read once.
    expect(botReads()).toBe(b0 + 1);
    expect(one.result.current.bot?.name).toBe('New');
    expect(two.result.current.bot?.name).toBe('New');
  });

  it('a tile mounted in a hidden tab may read health once, then polls nothing while hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await mount({ name: 'Old' });
    const n0 = healthReads();
    expect(n0).toBeLessThanOrEqual(1);
    await pass(15000);
    await pass(15000);
    expect(healthReads()).toBe(n0);
  });

  it('a tile admitted in a hidden tab may read health once, then polls nothing while hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    serve({ name: 'Old' });
    const h = renderHook(({ seen }: { seen: boolean }) => useTileBot(KEY, true, seen), { wrapper: wrap, initialProps: { seen: false } });
    await act(flush);
    expect(healthReads()).toBe(0);
    h.rerender({ seen: true });
    await act(flush);
    const n0 = healthReads();
    expect(n0).toBeLessThanOrEqual(1);
    await pass(15000);
    await pass(15000);
    expect(healthReads()).toBe(n0);
  });

  it('back in the foreground with no observer change, health is read at the next poll, not at once', async () => {
    await mount({ name: 'Old' });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await pass(15000);
    const n0 = healthReads();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await flush();
    });
    expect(healthReads()).toBe(n0);
    await pass(15000);
    expect(healthReads()).toBe(n0 + 1);
  });

  it('an unmounted tile polls nothing more', async () => {
    const h = await mount({ name: 'Old' });
    h.unmount();
    await act(flush);
    const n0 = healthReads();
    await pass(15000);
    await pass(15000);
    await pass(15000);
    expect(healthReads()).toBe(n0);
  });

  it("the tile's screen state is unknown until the observer's first entry, and true where the browser cannot tell", async () => {
    const ref = { current: document.createElement('div') };
    const saved = globalThis.IntersectionObserver;
    let report: ((e: { isIntersecting: boolean }[]) => void) | undefined;
    class IO {
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
        report = cb;
      }
      observe() {}
      disconnect() {}
    }
    try {
      globalThis.IntersectionObserver = IO as unknown as typeof IntersectionObserver;
      const { result } = renderHook(() => useScreenState(ref));
      expect(result.current).toBe('unknown');
      act(() => report?.([{ isIntersecting: false }]));
      expect(result.current).toBe(false);
      act(() => report?.([{ isIntersecting: true }]));
      expect(result.current).toBe(true);
      // @ts-expect-error -- a browser without IntersectionObserver
      delete globalThis.IntersectionObserver;
      expect(renderHook(() => useScreenState(ref)).result.current).toBe(true);
    } finally {
      globalThis.IntersectionObserver = saved;
    }
  });
});
