// Vitest on a live page: a message to the Bot itself goes once, with an Idempotency-Key. A lost answer is held (also after a
// reload) and never sent again; Check again reads the message by the HELD key and only a found message frees it. A miss, a 503 and
// anything else conclude nothing. Stop names the turn it was pressed for, never a later one.
import { CoreQueryProvider, queryClient } from '@core';
import { reloadChangesForTests } from '@core/changes';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { registerTargets, sayAnswerOf, useFrozenTurn, useSay, useStopTurn } from './data';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = `c1~${R1}~chief`;
const OTHER = `c1~${R1}~scout`;
/** The same Bot id on another computer: another Bot. */
const ELSEWHERE = `c2~${R1}~chief`;
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};
const path = (c: { url: string }) => new URL(c.url).pathname;
const posts = () => calls.filter((c) => c.method === 'POST' && /\/bots\/[^/]+\/messages$/.test(path(c)));
const byKey = () => calls.filter((c) => c.method === 'GET' && /\/bots\/[^/]+\/messages\/by-key\//.test(path(c)));
const cancels = () => calls.filter((c) => c.method === 'POST' && /\/bots\/[^/]+\/cancel$/.test(path(c)));

interface World {
  /** The POST's answer: a body, or lost (network). */
  post?: 'lost' | object;
  /** The by-key read: found body, or a refusal. */
  read?: { status: number; body: unknown; headers?: Record<string, string> };
}
function serve(w: World) {
  onFetch((c) => {
    const p = path(c);
    if (c.method === 'POST' && /\/messages$/.test(p)) return w.post === 'lost' || w.post === undefined ? { status: 0, network: true } : { status: 200, body: w.post };
    if (c.method === 'POST' && /\/cancel$/.test(p)) return { status: 200, body: { matched: c.body?.turn_id === 'turn-1' } };
    if (/\/messages\/by-key\//.test(p)) return w.read ?? { status: 404, body: { code: 'message_not_found', message: 'x' } };
    if (/\/log$/.test(p)) return { status: 200, body: { items: [], meta: {} } };
    return { status: 200, body: { data: { id: 'chief', uid: 'u1', name: 'Chief' } } };
  });
}

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }, { id: 'c2', project_id: 'p1', server_name: 'sv2' }]);
});

const mount = async (key = KEY) => {
  const h = renderHook(() => useSay(key), { wrapper: CoreQueryProvider });
  await act(flush);
  return h;
};
const send = async (h: Awaited<ReturnType<typeof mount>>, text: string) => {
  let out: Awaited<ReturnType<ReturnType<typeof useSay>['send']>> | undefined;
  await act(async () => {
    out = await h.result.current.send(text);
  });
  await act(flush);
  return out!;
};
const check = async (h: Awaited<ReturnType<typeof mount>>) => {
  let out: Awaited<ReturnType<ReturnType<typeof useSay>['check']>> | undefined;
  await act(async () => {
    out = await h.result.current.check();
  });
  await act(flush);
  return out!;
};

describe('the answer', () => {
  it('posted names its turn; queued has none; any other shape is no answer', () => {
    expect(sayAnswerOf({ message_id: 'm1', state: 'posted', turn_id: 't1' })).toEqual({ messageId: 'm1', state: 'posted', turnId: 't1' });
    expect(sayAnswerOf({ message_id: 'm1', state: 'queued' })).toEqual({ messageId: 'm1', state: 'queued', turnId: null });
    expect(sayAnswerOf({ message_id: 'm1', state: 'accepted' })).toBeNull();
    expect(sayAnswerOf({ message_id: 'm1', state: 'posted' })).toBeNull();
    expect(sayAnswerOf({ state: 'posted' })).toBeNull();
  });
});

describe('a message to the Bot', () => {
  it('is posted once to /bots/{id}/messages with an Idempotency-Key; a busy Bot answers queued', async () => {
    serve({ post: { message_id: 'm1', state: 'queued' } });
    const h = await mount();
    const r = await send(h, 'deploy the staging build');
    expect(r.outcome).toBe('done');
    expect(r.data).toEqual({ messageId: 'm1', state: 'queued', turnId: null });
    expect(posts()).toHaveLength(1);
    expect(posts()[0]?.body).toEqual({ text: 'deploy the staging build' });
    expect(posts()[0]?.headers['idempotency-key']).toBeTruthy();
    expect(h.result.current.held).toBe(false);
    // The composer sends only the message: no gate decision, no other POST.
    expect(calls.filter((c) => c.method === 'POST').map(path)).toEqual([path(posts()[0]!)]);
  });

  it('a 2xx that names no message (or a posted one without its turn) is not done: held for a read-back, never shown sent', async () => {
    for (const body of [{ ok: true }, { message_id: 'm1', state: 'posted' }]) {
      boot({ realm: R1 });
      queryClient.clear();
      registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
      serve({ post: body });
      const h = await mount();
      expect((await send(h, 'first')).outcome).toBe('pending');
      expect(h.result.current.held).toBe(true);
      h.unmount();
    }
  });

  it('a lost answer is held: a second press, other words included, sends nothing', async () => {
    serve({ post: 'lost' });
    const h = await mount();
    expect((await send(h, 'first')).outcome).toBe('pending');
    expect(h.result.current.held).toBe(true);
    const again = await send(h, 'second');
    expect(again.outcome).not.toBe('done');
    expect(posts()).toHaveLength(1);
  });

  it('after a reload the lost send is read back by the key it was sent with; found frees it, and the next message has a new key', async () => {
    const w: World = { post: 'lost' };
    serve(w);
    const a = await mount();
    await send(a, 'first');
    const key = posts()[0]!.headers['idempotency-key']!;
    a.unmount();
    // The reload: memory is gone, the stored hold comes back.
    reloadChangesForTests();
    queryClient.clear();
    const b = await mount();
    expect(b.result.current.held).toBe(true);
    w.read = { status: 200, body: { message_id: 'm1', state: 'posted', turn_id: 'turn-1' } };
    const r = await check(b);
    expect(r).toEqual({ t: 'found', answer: { messageId: 'm1', state: 'posted', turnId: 'turn-1' } });
    expect(byKey().map((c) => decodeURIComponent(path(c).split('/').pop()!))).toEqual([key]);
    expect(b.result.current.held).toBe(false);
    expect(posts()).toHaveLength(1);
    w.post = { message_id: 'm2', state: 'posted', turn_id: 'turn-2' };
    await send(b, 'first');
    expect(posts()).toHaveLength(2);
    expect(posts()[1]!.headers['idempotency-key']).not.toBe(key);
  });

  it('a miss, a bare 503 and a bad shape conclude nothing: still held, nothing posted', async () => {
    const w: World = { post: 'lost' };
    serve(w);
    const h = await mount();
    await send(h, 'first');
    expect(await check(h)).toEqual({ t: 'missing' });
    w.read = { status: 503, body: { code: 'service_unavailable', message: 'x' } };
    expect(await check(h)).toEqual({ t: 'unknown' });
    w.read = { status: 200, body: { message_id: 'm1', state: 'posted' } };
    expect(await check(h)).toEqual({ t: 'unknown' });
    expect(h.result.current.held).toBe(true);
    expect(posts()).toHaveLength(1);
  });

  it('a held message of one Bot holds only that Bot; Stop tracking frees it', async () => {
    serve({ post: 'lost' });
    const h = await mount();
    await send(h, 'first');
    const k1 = posts()[0]!.headers['idempotency-key'];
    // Another Bot, and the same Bot id on another computer, still send: each its own message and key.
    for (const key of [OTHER, ELSEWHERE]) {
      const o = await mount(key);
      expect(o.result.current.held).toBe(false);
      expect((await send(o, 'first')).outcome).toBe('pending');
    }
    expect(posts()).toHaveLength(3);
    expect(new Set(posts().map((c) => c.headers['idempotency-key'])).size).toBe(3);
    await act(async () => {
      await h.result.current.stopTracking();
    });
    await act(flush);
    expect(h.result.current.held).toBe(false);
    // After Stop tracking, a new message is a new request with a new key (core: a key replays only for the same variables).
    await send(h, 'another message');
    expect(posts()).toHaveLength(4);
    expect(posts()[3]!.headers['idempotency-key']).not.toBe(k1);
  });
});

describe('Stop', () => {
  it('the confirm freezes the first turn it reads, none included; a turn that starts later is never taken', () => {
    let now = 1000;
    const h = renderHook((p: { open: boolean; turn: string | null | undefined }) => useFrozenTurn(p.open, KEY, p.turn, () => now), {
      initialProps: { open: true, turn: undefined as string | null | undefined },
    });
    // Opened before the view was read: nothing frozen yet (Stop waits), not "none".
    expect(h.result.current).toBeNull();
    now = 2000;
    // The first read freezes its turn, with the time it was read.
    h.rerender({ open: true, turn: 'turn-0' });
    expect(h.result.current).toEqual({ turn: 'turn-0', at: 2000 });
    now = 3000;
    h.rerender({ open: true, turn: 'turn-1' });
    expect(h.result.current).toEqual({ turn: 'turn-0', at: 2000 });
    h.rerender({ open: false, turn: 'turn-1' });
    expect(h.result.current).toBeNull();
    h.rerender({ open: true, turn: 'turn-1' });
    expect(h.result.current).toEqual({ turn: 'turn-1', at: 3000 });
    h.rerender({ open: false, turn: null });
    // Opened while no turn runs: none, also after a turn starts.
    h.rerender({ open: true, turn: null });
    expect(h.result.current).toEqual({ turn: null, at: 3000 });
    h.rerender({ open: true, turn: 'turn-3' });
    expect(h.result.current?.turn).toBeNull();
  });

  it('another Bot under the same open confirm freezes again, never keeping the turn of the first Bot', () => {
    const h = renderHook((p: { key: string; turn: string | null | undefined }) => useFrozenTurn(true, p.key, p.turn, () => 5), {
      initialProps: { key: KEY, turn: 'turn-0' as string | null | undefined },
    });
    expect(h.result.current?.turn).toBe('turn-0');
    h.rerender({ key: 'other', turn: undefined });
    expect(h.result.current).toBeNull();
    h.rerender({ key: 'other', turn: 'turn-9' });
    expect(h.result.current?.turn).toBe('turn-9');
  });

  it('sends the turn named at the press, never a later one', async () => {
    serve({});
    const h = renderHook(() => useStopTurn({ botKey: KEY }), { wrapper: CoreQueryProvider });
    await act(flush);
    let r: { data?: { matched: boolean } } = {};
    await act(async () => {
      r = await h.result.current.run({ turnId: 'turn-0' });
    });
    expect(cancels().map((c) => c.body)).toEqual([{ turn_id: 'turn-0' }]);
    expect(r.data).toEqual({ matched: false });
  });
});
