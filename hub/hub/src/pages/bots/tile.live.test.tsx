// Vitest on a live page: what the bots tile shows for a Bot key, through core's real queries over a recorded fetch. A Bot
// whose computer the computers list does not have is gone (never a skeleton forever); a failed computers list is a retry;
// the agent's not_found for the Bot is gone, any other failure a retry.
import { CoreQueryProvider, queryClient } from '@core';
import { boot, calls, deferred, onFetch, settle } from '@core/test/env';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTargets } from './data';
import { COMPUTER_POLL_MS, useOnScreen, useTileBot } from './tileState';

const KEY = 'c1~aaaaaaaaaaaaaaaaaaaaaaa1~chief';
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const c1 = { id: 'c1', project_id: 'p1', server_name: 'sv1', status: 'running' };

interface World {
  /** The computers list, or its failure status. */
  computers?: object[] | number;
  /** The Bot read's status (200 answers Chief). */
  bot?: number;
  /** The computers list answers this late (ms). */
  computersLate?: number;
  /** The Bot read's answer waits for this. */
  botHold?: Promise<void>;
  /** The held Bot read then fails (500). */
  botHoldFails?: boolean;
}
function serve(w: World) {
  onFetch((c) => {
    const u = new URL(c.url);
    if (/\/computers$/.test(u.pathname)) {
      if (typeof w.computers === 'number') return { status: w.computers, body: { error: { code: 'internal_error', message: 'x' } } };
      return { status: 200, body: { data: { computers: w.computers ?? [c1] } }, delayMs: w.computersLate };
    }
    if (/\/bots\/chief$/.test(u.pathname)) {
      const st = w.bot ?? 200;
      if (st !== 200) return { status: st, body: { error: { code: st === 404 ? 'not_found' : 'internal_error', message: 'x' } } };
      const ok = { status: 200, body: { data: { id: 'chief', uid: 'u1', name: 'Chief' } } };
      const failed = { status: 500, body: { error: { code: 'internal_error', message: 'x' } } };
      return w.botHold ? w.botHold.then(() => (w.botHoldFails ? failed : ok)) : ok;
    }
    return { status: 200, body: { items: [], meta: { total: 0 } } };
  });
}
const mount = async (w: World, onScreen = true) => {
  serve(w);
  const { result } = renderHook(() => useTileBot(KEY, onScreen), { wrapper: CoreQueryProvider });
  await act(flush);
  return result;
};
const show = async (w: World) => (await mount(w)).current;
/** Re-reads only the reads named (query key slot 6 is the read's name), or every read. */
const reread = async (names?: string[]) =>
  act(async () => {
    await queryClient.invalidateQueries(names ? { predicate: (q) => names.includes(q.queryKey[6] as string) } : undefined);
    await flush();
  });
/** Chief read once from a running computer, then the world changes to `next` and every read is refreshed. */
const afterRef = async (next: World) => {
  const result = await mount({});
  expect(result.current.show).toBe('ready');
  serve(next);
  await reread();
  return result;
};
const after = async (next: World) => (await afterRef(next)).current;
const containerReads = () => calls.filter((c) => new URL(c.url).pathname.endsWith('/computers')).length;

beforeEach(() => {
  boot({ realm: 'aaaaaaaaaaaaaaaaaaaaaaa1' });
  queryClient.clear();
  registerTargets([]); // no computer address left from an earlier test
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the bots tile on a live page', () => {
  it('a Bot on a listed computer is shown', async () => {
    const r = await show({});
    expect(r.show).toBe('ready');
    expect(r.bot).toBeDefined();
  });

  it('a computer the list does not have means the Bot is gone, not loading', async () => {
    expect((await show({ computers: [{ ...c1, id: 'c2' }] })).show).toBe('gone');
  });

  it('while the computers list has not answered the tile is loading, not gone', async () => {
    expect((await show({ computersLate: 60_000 })).show).toBe('loading');
  });

  it('a computer that is not running means the Bot is gone', async () => {
    expect((await show({ computers: [{ ...c1, status: 'stopped' }], bot: 503 })).show).toBe('gone');
  });

  it('a starting computer is loading, not gone', async () => {
    expect((await show({ computers: [{ ...c1, status: 'starting' }], bot: 503 })).show).toBe('loading');
  });

  it('a starting computer stays loading whatever the Bot read answers, and shows the Bot once the list says running', async () => {
    const result = await mount({ computers: [{ ...c1, status: 'starting' }], bot: 503 });
    expect(result.current.show).toBe('loading');
    serve({ computers: [{ ...c1, status: 'starting' }] });
    await reread(['view']);
    expect(result.current.show).toBe('loading');
    serve({});
    await reread(['computers']);
    expect(result.current.show).toBe('ready');
  });

  it('a Bot answer from before a stop, delivered after the list says stopped, never brings the Bot back', async () => {
    const result = await mount({});
    expect(result.current.show).toBe('ready');
    // A Bot read sent while the computer still ran, its answer held back.
    const hold = deferred();
    serve({ botHold: hold.p });
    const botReads = () => calls.filter((c) => new URL(c.url).pathname.endsWith('/bots/chief')).length;
    const sent = botReads();
    await act(async () => {
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[6] === 'view' });
      for (let i = 0; i < 50 && botReads() === sent; i++) await flush();
    });
    expect(botReads()).toBe(sent + 1); // on the wire before the stop
    serve({ computers: [{ ...c1, status: 'stopped' }], bot: 503 });
    await reread(['computers']);
    expect(result.current.show).toBe('gone');
    await act(async () => {
      hold.res();
      await flush();
    });
    expect(result.current.show).toBe('gone');
    serve({ computers: 500, bot: 500 });
    await reread();
    expect(result.current.show).toBe('gone');
  });

  it('after a stop, a computer listed running again shows the Bot only from a new Bot answer, never the one kept from before', async () => {
    const result = await mount({});
    serve({ computers: [{ ...c1, status: 'stopped' }], bot: 503 });
    await reread(['computers']);
    expect(result.current.show).toBe('gone');
    serve({ bot: 503 });
    await reread(['computers']);
    expect(result.current.show).toBe('error');
    serve({});
    await act(async () => {
      result.current.retry?.();
      await flush();
    });
    expect(result.current.show).toBe('ready');
  });

  /** Chief read, then its computer listed stopped: the tile is gone. */
  const stoppedAfterReady = async () => {
    const result = await mount({});
    serve({ computers: [{ ...c1, status: 'stopped' }], bot: 503 });
    await reread(['computers']);
    expect(result.current.show).toBe('gone');
    return result;
  };
  const release = (h: { res: () => void }) =>
    act(async () => {
      h.res();
      await flush();
    });

  it('while the new Bot read after a restart is out, the tile is loading, never the Bot kept from before', async () => {
    const result = await stoppedAfterReady();
    const hold = deferred();
    serve({ botHold: hold.p });
    await reread(['computers']);
    expect(result.current.show).toBe('loading');
    await release(hold);
    expect(result.current.show).toBe('ready');
  });

  it('a Bot read sent before the stop and still out at the restart is not taken as the new answer', async () => {
    const result = await mount({});
    const hold = deferred();
    serve({ botHold: hold.p });
    const botReads = () => calls.filter((c) => new URL(c.url).pathname.endsWith('/bots/chief')).length;
    const sent = botReads();
    await act(async () => {
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[6] === 'view' });
      for (let i = 0; i < 50 && botReads() === sent; i++) await flush();
    });
    serve({ computers: [{ ...c1, status: 'stopped' }], bot: 503 });
    await reread(['computers']);
    expect(result.current.show).toBe('gone');
    serve({ bot: 503 });
    await reread(['computers']);
    await release(hold);
    expect(result.current.show).toBe('error');
  });

  it('a stop and restart during the new Bot read: only the latest read decides', async () => {
    const result = await stoppedAfterReady();
    const hold = deferred();
    serve({ botHold: hold.p });
    await reread(['computers']);
    expect(result.current.show).toBe('loading');
    serve({ computers: [{ ...c1, status: 'stopped' }], bot: 503 });
    await reread(['computers']);
    expect(result.current.show).toBe('gone');
    // The second restart's read is held too: the first, which it cancels, must not decide meanwhile.
    const hold2 = deferred();
    serve({ botHold: hold2.p });
    await reread(['computers']);
    expect(result.current.show).toBe('loading');
    serve({ bot: 503 });
    await release(hold2);
    expect(result.current.show).toBe('ready');
    await release(hold);
    expect(result.current.show).toBe('ready');
  });

  // Three cases around a restart (the recovery epoch is in the Bot read's key).
  const botReadsNow = () => calls.filter((c) => new URL(c.url).pathname.endsWith('/bots/chief')).length;

  it("a first Bot load still out when the computer stops is never the answer after it runs again", async () => {
    const hold = deferred();
    const result = await mount({ botHold: hold.p });
    expect(result.current.show).toBe('loading');
    const sent = botReadsNow();
    serve({ computers: [{ ...c1, status: 'stopped' }], bot: 503 });
    await reread(['computers']);
    expect(result.current.show).toBe('gone');
    serve({ bot: 503 });
    await reread(['computers']);
    expect(botReadsNow()).toBeGreaterThan(sent); // a read of its own after the recovery
    expect(result.current.show).toBe('error');
    await release(hold);
    expect(result.current.show).toBe('error');
    expect(result.current.bot).toBeUndefined();
  });

  it('cancelling the Bot read after a restart never restores the Bot kept from before', async () => {
    const result = await stoppedAfterReady();
    const hold = deferred();
    serve({ botHold: hold.p });
    await reread(['computers']);
    expect(result.current.show).toBe('loading');
    await act(async () => {
      await queryClient.cancelQueries({ predicate: (q) => q.queryKey[6] === 'view' });
      await flush();
    });
    expect(result.current.show).toBe('loading');
    expect(result.current.bot).toBeUndefined();
  });

  it('a tile remounted during the Bot read after a restart keeps waiting for that read, never shows the Bot from before', async () => {
    serve({});
    const first = renderHook(() => useTileBot(KEY), { wrapper: CoreQueryProvider });
    await act(flush);
    expect(first.result.current.show).toBe('ready');
    serve({ computers: [{ ...c1, status: 'stopped' }], bot: 503 });
    await reread(['computers']);
    expect(first.result.current.show).toBe('gone');
    const hold = deferred();
    serve({ botHold: hold.p, botHoldFails: true });
    await reread(['computers']);
    expect(first.result.current.show).toBe('loading');
    first.unmount();
    const again = renderHook(() => useTileBot(KEY), { wrapper: CoreQueryProvider });
    await act(flush);
    expect(again.result.current.show).toBe('loading');
    expect(again.result.current.bot).toBeUndefined();
    await release(hold);
    expect(again.result.current.show).toBe('error');
    expect(again.result.current.bot).toBeUndefined();
  });

  it('a computer that leaves the list and comes back running shows the Bot only from a new Bot answer', async () => {
    const result = await mount({});
    serve({ computers: [], bot: 503 });
    await reread(['computers']);
    expect(result.current.show).toBe('gone');
    const hold = deferred();
    serve({ botHold: hold.p });
    await reread(['computers']);
    expect(result.current.show).toBe('loading');
    expect(result.current.bot).toBeUndefined();
    await release(hold);
    expect(result.current.show).toBe('ready');
  });

  it('a running computer the agent reads cannot reach (no server) is gone, not loading forever', async () => {
    expect((await show({ computers: [{ id: 'c1', project_id: 'p1', status: 'running' }] })).show).toBe('gone');
  });

  it('while its computer is not running the tile re-reads the computers list, and a computer that starts brings the Bot back', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const result = await mount({ computers: [{ ...c1, status: 'stopped' }], bot: 503 });
    expect(result.current.show).toBe('gone');
    const before = containerReads();
    serve({});
    await act(async () => {
      vi.advanceTimersByTime(COMPUTER_POLL_MS);
      await flush();
    });
    expect(containerReads()).toBeGreaterThan(before);
    await reread(['view']);
    expect(result.current.show).toBe('ready');
  });

  const stopped = { computers: [{ ...c1, status: 'stopped' }], bot: 503 };
  const tick = async (n = 1) =>
    act(async () => {
      vi.advanceTimersByTime(COMPUTER_POLL_MS * n);
      await flush();
    });

  it('two tiles waiting on stopped computers share one poller: one computers read per period', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await mount(stopped);
    renderHook(() => useTileBot(KEY), { wrapper: CoreQueryProvider });
    await act(flush);
    const before = containerReads();
    await tick();
    expect(containerReads()).toBe(before + 1);
  });

  it('a tile that is off screen does not re-read the computers list', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await mount(stopped, false);
    const before = containerReads();
    await tick(2);
    expect(containerReads()).toBe(before);
  });

  it('a hidden browser tab does not re-read the computers list', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await mount(stopped);
    const before = containerReads();
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await tick(2);
    expect(containerReads()).toBe(before);
    vis.mockRestore();
    await tick();
    expect(containerReads()).toBe(before + 1);
  });

  it('a computers read still in flight is joined, never sent twice', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await mount(stopped);
    serve({ computers: [{ ...c1, status: 'stopped' }], bot: 503, computersLate: 60_000 });
    const before = containerReads();
    // One period at a time, each read let reach the network before the next period.
    await tick();
    await tick();
    await tick();
    expect(containerReads()).toBe(before + 1);
  });

  it('a read that no longer lists the computer stops the re-reads', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const result = await mount(stopped);
    serve({ computers: [{ ...c1, id: 'c2' }], bot: 503 });
    await tick();
    expect(result.current.show).toBe('gone');
    const before = containerReads();
    await tick(2);
    expect(containerReads()).toBe(before);
  });

  it('on screen is what the browser reports, and true where it cannot tell', async () => {
    const el = document.createElement('div');
    const ref = { current: el };
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
      const { result } = renderHook(() => useOnScreen(ref));
      expect(result.current).toBe(true);
      act(() => report?.([{ isIntersecting: false }]));
      expect(result.current).toBe(false);
      act(() => report?.([{ isIntersecting: true }]));
      expect(result.current).toBe(true);
    } finally {
      globalThis.IntersectionObserver = saved;
    }
  });

  it('a running computer is not re-read on a timer', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await mount({});
    const before = containerReads();
    await act(async () => {
      vi.advanceTimersByTime(COMPUTER_POLL_MS * 2);
      await flush();
    });
    expect(containerReads()).toBe(before);
  });

  it('a computer that stops after the Bot was read means the Bot is gone, not its cached view', async () => {
    expect((await after({ computers: [{ ...c1, status: 'stopped' }], bot: 503 })).show).toBe('gone');
  });

  it('a Bot refresh that fails keeps the Bot, marked failed with a retry', async () => {
    const r = await after({ bot: 500 });
    expect(r.show).toBe('ready');
    expect(r.refreshFailed).toBe(true);
    expect(r.retry).toBeTypeOf('function');
  });

  it('a computers refresh that fails keeps the Bot, marked failed with a retry', async () => {
    const r = await after({ computers: 500 });
    expect(r.show).toBe('ready');
    expect(r.refreshFailed).toBe(true);
    expect(r.retry).toBeTypeOf('function');
  });

  it('Retry after a failed Bot refresh that then answers clears the failure mark', async () => {
    const result = await afterRef({ bot: 500 });
    expect(result.current.refreshFailed).toBe(true);
    serve({});
    await act(async () => {
      result.current.retry?.();
      await flush();
    });
    expect(result.current.show).toBe('ready');
    expect(result.current.refreshFailed).toBeUndefined();
  });

  it('Retry after a failed computers refresh that then answers clears the failure mark', async () => {
    const result = await afterRef({ computers: 500 });
    expect(result.current.refreshFailed).toBe(true);
    serve({});
    await act(async () => {
      result.current.retry?.();
      await flush();
    });
    expect(result.current.show).toBe('ready');
    expect(result.current.refreshFailed).toBeUndefined();
  });

  it('a failed computers list is a retry', async () => {
    const r = await show({ computers: 500 });
    expect(r.show).toBe('error');
    expect(r.retry).toBeTypeOf('function');
  });

  it("the agent's not_found for the Bot means it is gone", async () => {
    expect((await show({ bot: 404 })).show).toBe('gone');
  });

  it('any other failure of the Bot read is a retry', async () => {
    expect((await show({ bot: 500 })).show).toBe('error');
  });
});
