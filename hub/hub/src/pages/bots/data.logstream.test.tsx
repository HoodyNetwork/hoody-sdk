// Vitest: useLog with `stream` (the Bot pane) holds one budgeted stream of the Bot's log at rank 'bot',
// resumed after the newest row it holds; its frames wake log reads; the log poll is 5 s whenever the stream is not live and
// 30 s while it is; unmount and a hidden page close it (the slot goes back). Without `stream` (the Board tile, the talk
// host) nothing opens.
import { CoreQueryProvider, queryClient } from '@core';
import type * as CoreModule from '@core';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOG_POLL_LIVE_MS, LOG_POLL_MS, registerTargets, useLog } from './data';

type Opened = {
  path: string;
  input: { query?: Record<string, unknown>; onEvent(n: string, d: string, id?: string): void; onState?(s: unknown): void };
  o: { key: string; rank?: string };
  close: ReturnType<typeof vi.fn>;
};
const opened: Opened[] = [];
vi.mock('@core', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();
  return {
    ...actual,
    budgetedStream: (route: { path: string }, input: Opened['input'], o: Opened['o']) => {
      const close = vi.fn();
      opened.push({ path: route.path, input, o, close });
      return { close, setRank: () => {} };
    },
  };
});

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = `c1~${R1}~chief`;
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const logReads = () => calls.filter((c) => c.method === 'GET' && /\/bots\/chief\/log(\?|$)/.test(c.url)).length;
const viewReads = () => calls.filter((c) => c.method === 'GET' && /\/bots\/chief(\?|$)/.test(c.url)).length;
const row = (seq: number) => ({ seq, at: '2026-11-10T10:00:00Z', role: 'bot', text: `row ${seq}` });
const setVisible = (v: boolean) => {
  Object.defineProperty(document, 'visibilityState', { value: v ? 'visible' : 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  opened.length = 0;
  boot({ realm: R1 });
  queryClient.clear();
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
  onFetch((c) => {
    if (/\/bots\/(chief|other)\/log/.test(c.url)) return { status: 200, body: { items: [row(2), row(7)], meta: { has_more: false } } };
    if (/\/bots\/chief(\?|$)/.test(c.url)) return { status: 200, body: { data: { id: 'chief', uid: 'u1', name: 'Chief' } } };
    return { status: 200, body: { data: {} } };
  });
});
afterEach(() => {
  setVisible(true);
  vi.useRealTimers();
});

const mount = async (stream = true) => {
  const r = renderHook(() => useLog(KEY, { stream }), { wrapper: CoreQueryProvider });
  await act(flush);
  return r;
};
const live = (o: Opened) => act(async () => {
  o.input.onState?.({ state: 'open', status: 200 });
  await flush();
});

describe('the Bot pane follows its log stream', () => {
  it('opens one stream after the first log read: the stream route, after the newest row held, at rank bot, named botlog:<realm>/<bot>', async () => {
    await mount();
    expect(opened).toHaveLength(1);
    expect(opened[0]!.path).toBe('/bots/:id/stream');
    expect(opened[0]!.input.query).toEqual({ since: 7 });
    expect(opened[0]!.o).toEqual({ key: `botlog:${R1}/chief`, rank: 'bot' });
  });

  it('without stream (the Board tile, the talk host) no stream opens', async () => {
    await mount(false);
    expect(opened).toHaveLength(0);
  });

  it('a row frame reads the log once; a burst of frames reads it at most twice; a state frame reads the Bot too', async () => {
    await mount();
    const o = opened[0]!;
    await live(o);
    let before = logReads();
    await act(async () => {
      o.input.onEvent('row', '{}', '8');
      await flush();
    });
    expect(logReads()).toBe(before + 1);
    before = logReads();
    await act(async () => {
      for (let i = 0; i < 20; i++) o.input.onEvent('row', '{}', String(9 + i));
      await flush();
    });
    expect(logReads() - before).toBeGreaterThanOrEqual(1);
    expect(logReads() - before).toBeLessThanOrEqual(2);
    const views = viewReads();
    await act(async () => {
      o.input.onEvent('state', '{}', undefined);
      await flush();
    });
    expect(viewReads()).toBe(views + 1);
  });

  it.each(['archived', 'lagged'])('an %s frame reads the log', async (name) => {
    await mount();
    const before = logReads();
    await act(async () => {
      opened[0]!.input.onEvent(name, '{}', undefined);
      await flush();
    });
    expect(logReads()).toBe(before + 1);
  });

  it('the poll is 5 s while the stream is not live, 30 s while it is, and 5 s again after a budget refusal', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await mount();
    const tick = (ms: number) => act(async () => {
      vi.advanceTimersByTime(ms);
      await flush();
    });
    let before = logReads();
    await tick(LOG_POLL_MS);
    expect(logReads()).toBe(before + 1);
    await live(opened[0]!);
    before = logReads();
    await tick(LOG_POLL_MS * 3);
    expect(logReads()).toBe(before);
    await tick(LOG_POLL_LIVE_MS - LOG_POLL_MS * 3);
    expect(logReads()).toBe(before + 1);
    await act(async () => {
      opened[0]!.input.onState?.({ state: 'error', status: 0, code: 'budget', retryAfterMs: null, retryAfter: null });
      await flush();
    });
    before = logReads();
    await tick(LOG_POLL_MS);
    expect(logReads()).toBeGreaterThan(before);
  });

  it('another Bot closes the first stream and opens one for the new Bot', async () => {
    const r = renderHook(({ k }) => useLog(k, { stream: true }), { wrapper: CoreQueryProvider, initialProps: { k: KEY } });
    await act(flush);
    r.rerender({ k: `c1~${R1}~other` });
    await act(flush);
    expect(opened[0]!.close).toHaveBeenCalledTimes(1);
    expect(opened.map((o) => o.o.key)).toEqual([`botlog:${R1}/chief`, `botlog:${R1}/other`]);
  });

  it('unmount closes the stream (its slot goes back)', async () => {
    const r = await mount();
    r.unmount();
    expect(opened[0]!.close).toHaveBeenCalledTimes(1);
  });

  it('a hidden page closes the stream (its slot goes back); visible again opens a new one', async () => {
    await mount();
    await live(opened[0]!);
    await act(async () => {
      setVisible(false);
      await flush();
    });
    expect(opened[0]!.close).toHaveBeenCalledTimes(1);
    await act(async () => {
      setVisible(true);
      await flush();
    });
    expect(opened).toHaveLength(2);
  });
});
