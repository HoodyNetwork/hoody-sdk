// useDisconnect sends only on the computer a press was asked on: disconnect and Disconnect again name it, and another
// computer shown by then sends nothing (a second layer behind the view's own binding of its confirm). Disconnect again
// frees only the hold shown, and is busy from its press; an answer after the page left starts no follow-up read.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@app/testing';
import { heldChanges } from '@core';
import { resetChanges, subscribeChanges } from '@core/changes';
import { bump, identity, setIdentity } from '@core/ctx';
import { transport } from '@core/transport';
import { DISCONNECT_LOCK, FOLLOW_UP_MS, resetDisconnectForTests, useDisconnect } from './disconnect';
import { MAX_BINDINGS, MAX_SESSIONS, parseBindings, parseTunnels, type Snapshot } from './logic';
import { routes } from './routes';

const target = { project: { id: 'p1' }, container: { id: 'c-now', server_name: 'sv1' } };

describe('useDisconnect: the computer asked on', () => {
  it('a press asked on another computer sends nothing, for Disconnect and for Disconnect again', async () => {
    resetDisconnectForTests();
    const fetch = vi.spyOn(transport(), 'fetch');
    const { result } = renderHook(() => useDisconnect({ computer: 'c-now', target, snap: null, refresh: () => Promise.resolve() }));
    let a: unknown = 'unset';
    let b: unknown = 'unset';
    await act(async () => {
      a = await result.current.disconnect('S-1', 'c-before');
      b = await result.current.again('S-1', 'hold-1', 'c-before');
    });
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});

describe('useDisconnect: Disconnect again and the follow-up reads', () => {
  /** A DELETE whose answer is lost (the change is held), counted; other routes as the fixtures answer. */
  function lostDeletes(): { n: number } {
    const c = { n: 0 };
    const tr = transport();
    const real = tr.fetch.bind(tr);
    vi.spyOn(tr, 'fetch').mockImplementation((url, init, meta) => {
      if (meta.route.id !== routes.disconnect.id) return real(url, init, meta);
      c.n++;
      return Promise.reject(new TypeError('Failed to fetch'));
    });
    return c;
  }
  function freshChanges(): void {
    // eslint-disable-next-line no-restricted-globals -- each test starts with no held change kept by an earlier one
    localStorage.removeItem('hub.v3.changes');
    resetChanges();
    resetDisconnectForTests();
  }
  const holdOf = (id: string): string | undefined => heldChanges(DISCONNECT_LOCK).find((h) => (h.identity as { id?: unknown } | undefined)?.id === id)?.hold;

  it('a hold token that is no longer the hold shown frees nothing and sends nothing', async () => {
    freshChanges();
    const sent = lostDeletes();
    const { result } = renderHook(() => useDisconnect({ computer: 'c-now', target, snap: null, refresh: () => Promise.resolve() }));
    await act(async () => {
      await result.current.disconnect('S-1', 'c-now');
    });
    expect(result.current.of('S-1').state).toBe('pending');
    expect(sent.n).toBe(1);
    let r: unknown = 'unset';
    await act(async () => {
      r = await result.current.again('S-1', 'not-the-hold', 'c-now');
    });
    expect(r).toBeNull();
    expect(sent.n).toBe(1);
    expect(result.current.of('S-1').state).toBe('pending');
    vi.restoreAllMocks();
  });

  it('Disconnect again is busy from the press, while the hold is freed, so its confirm cannot be cancelled before the send', async () => {
    freshChanges();
    const sent = lostDeletes();
    const { result } = renderHook(() => useDisconnect({ computer: 'c-now', target, snap: null, refresh: () => Promise.resolve() }));
    await act(async () => {
      await result.current.disconnect('S-1', 'c-now');
    });
    const hold = holdOf('S-1');
    expect(hold).toBeTruthy();
    let p: Promise<unknown> = Promise.resolve();
    act(() => {
      p = result.current.again('S-1', hold as string, 'c-now');
    });
    expect(result.current.of('S-1').state).toBe('sending');
    await act(async () => {
      await p;
    });
    expect(sent.n).toBe(2);
    vi.restoreAllMocks();
  });

  it('a second press while the first is out sends nothing and shows nothing of its own (never Not sent)', async () => {
    freshChanges();
    let answer: (r: Response) => void = () => undefined;
    let n = 0;
    const tr = transport();
    const real = tr.fetch.bind(tr);
    vi.spyOn(tr, 'fetch').mockImplementation((url, init, meta) => {
      if (meta.route.id !== routes.disconnect.id) return real(url, init, meta);
      n++;
      return new Promise<Response>((res) => {
        answer = res;
      });
    });
    const { result } = renderHook(() => useDisconnect({ computer: 'c-now', target, snap: null, refresh: () => Promise.resolve() }));
    let first: Promise<unknown> = Promise.resolve();
    let second: unknown = 'unset';
    act(() => {
      first = result.current.disconnect('S-1', 'c-now');
    });
    await act(async () => {
      second = await result.current.disconnect('S-1', 'c-now');
    });
    expect(second).toBeNull();
    await waitFor(() => expect(n).toBe(1));
    await act(async () => {
      answer(new Response(JSON.stringify({ sessionId: 'S-1', status: 'closing' }), { status: 202, headers: { 'content-type': 'application/json' } }));
      await first;
    });
    expect(n).toBe(1);
    expect(result.current.of('S-1').state).toBe('closing');
    vi.restoreAllMocks();
  });

  it('an answer that comes after the page left starts no follow-up read', async () => {
    freshChanges();
    let answer: (r: Response) => void = () => undefined;
    const tr = transport();
    const real = tr.fetch.bind(tr);
    vi.spyOn(tr, 'fetch').mockImplementation((url, init, meta) => {
      if (meta.route.id !== routes.disconnect.id) return real(url, init, meta);
      return new Promise<Response>((res) => {
        answer = res;
      });
    });
    const refresh = vi.fn(() => Promise.resolve());
    const { result, unmount } = renderHook(() => useDisconnect({ computer: 'c-now', target, snap: null, refresh }));
    let p: Promise<unknown> = Promise.resolve();
    act(() => {
      p = result.current.disconnect('S-1', 'c-now');
    });
    await waitFor(() => expect(tr.fetch).toHaveBeenCalled());
    unmount();
    await act(async () => {
      answer(new Response(JSON.stringify({ ok: true }), { status: 202, headers: { 'content-type': 'application/json' } }));
      await p;
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, FOLLOW_UP_MS + 200));
    });
    expect(refresh).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('useDisconnect: marks belong to the account shown; a cut list proves nothing', () => {
  function freshChanges(): void {
    // eslint-disable-next-line no-restricted-globals -- each test starts with no held change kept by an earlier one
    localStorage.removeItem('hub.v3.changes');
    resetChanges();
    resetDisconnectForTests();
  }
  /** Every DELETE answers with the given status (a refusal: "Could not disconnect"), counted. */
  function answering(status: number): { n: number } {
    const c = { n: 0 };
    const tr = transport();
    const real = tr.fetch.bind(tr);
    vi.spyOn(tr, 'fetch').mockImplementation((url, init, meta) => {
      if (meta.route.id !== routes.disconnect.id) return real(url, init, meta);
      c.n++;
      return Promise.resolve(new Response(JSON.stringify({ code: 'FORBIDDEN', error: 'no' }), { status, headers: { 'content-type': 'application/json' } }));
    });
    return c;
  }
  const before = identity();
  const switchAccount = (id: string) => {
    setIdentity({ id, banned: false });
    bump('account');
  };
  afterEach(() => {
    setIdentity(before);
    bump('account');
    vi.restoreAllMocks();
  });

  it('another account shown drops this tab\'s marks: no "Could not disconnect" carried over', async () => {
    freshChanges();
    answering(403);
    const { result } = renderHook(() => useDisconnect({ computer: 'c-now', target, snap: null, refresh: () => Promise.resolve() }));
    await act(async () => {
      await result.current.disconnect('S-1', 'c-now');
    });
    expect(result.current.of('S-1').state).toBe('failed');
    await act(async () => {
      switchAccount('someone-else');
    });
    expect(result.current.of('S-1').state).toBe('idle');
    expect(result.current.failed).toEqual([]);
  });

  it('an answer to a press made under another account leaves no mark', async () => {
    freshChanges();
    let answer: (r: Response) => void = () => undefined;
    const tr = transport();
    const real = tr.fetch.bind(tr);
    vi.spyOn(tr, 'fetch').mockImplementation((url, init, meta) => {
      if (meta.route.id !== routes.disconnect.id) return real(url, init, meta);
      return new Promise<Response>((res) => {
        answer = res;
      });
    });
    const { result } = renderHook(() => useDisconnect({ computer: 'c-now', target, snap: null, refresh: () => Promise.resolve() }));
    let p: Promise<unknown> = Promise.resolve();
    act(() => {
      p = result.current.disconnect('S-1', 'c-now');
    });
    await waitFor(() => expect(tr.fetch).toHaveBeenCalled());
    await act(async () => {
      switchAccount('someone-else');
    });
    await act(async () => {
      answer(new Response(JSON.stringify({ code: 'FORBIDDEN', error: 'no' }), { status: 403, headers: { 'content-type': 'application/json' } }));
      await p;
    });
    await expect(p).resolves.toBeNull();
    expect(result.current.of('S-1').state).toBe('idle');
    expect(result.current.failed).toEqual([]);
  });

  it('an account change before the press is admitted (core: stale) leaves no "Not sent" mark', async () => {
    freshChanges();
    const c = answering(403);
    const { result } = renderHook(() => useDisconnect({ computer: 'c-now', target, snap: null, refresh: () => Promise.resolve() }));
    let p: Promise<unknown> = Promise.resolve();
    await act(async () => {
      p = result.current.disconnect('S-1', 'c-now');
      switchAccount('someone-else');
      await p;
    });
    await expect(p).resolves.toBeNull();
    expect(c.n).toBe(0);
    expect(result.current.of('S-1').state).toBe('idle');
    expect(result.current.failed).toEqual([]);
  });

  it('a realm switch (same account) keeps the marks, as core keeps its holds', async () => {
    freshChanges();
    answering(403);
    const { result } = renderHook(() => useDisconnect({ computer: 'c-now', target, snap: null, refresh: () => Promise.resolve() }));
    await act(async () => {
      await result.current.disconnect('S-1', 'c-now');
    });
    await act(async () => {
      bump('switch');
    });
    expect(result.current.of('S-1').state).toBe('failed');
  });

  it('an account round trip while Tunnels is closed drops the marks it had', async () => {
    freshChanges();
    answering(403);
    const first = renderHook(() => useDisconnect({ computer: 'c-now', target, snap: null, refresh: () => Promise.resolve() }));
    await act(async () => {
      await first.result.current.disconnect('S-1', 'c-now');
    });
    expect(first.result.current.of('S-1').state).toBe('failed');
    first.unmount();
    act(() => {
      switchAccount('someone-else');
      setIdentity(before);
      bump('account');
    });
    const again = renderHook(() => useDisconnect({ computer: 'c-now', target, snap: null, refresh: () => Promise.resolve() }));
    expect(again.result.current.of('S-1').state).toBe('idle');
    expect(again.result.current.failed).toEqual([]);
  });

  it('Disconnect again whose account changes while the hold is freed sends nothing and leaves no mark', async () => {
    freshChanges();
    let deletes = 0;
    const tr = transport();
    const real = tr.fetch.bind(tr);
    vi.spyOn(tr, 'fetch').mockImplementation((url, init, meta) => {
      if (meta.route.id !== routes.disconnect.id) return real(url, init, meta);
      deletes++;
      // The first is lost (held); a second one, if sent, is refused (it would leave "Could not disconnect").
      if (deletes === 1) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(new Response(JSON.stringify({ code: 'FORBIDDEN', error: 'no' }), { status: 403, headers: { 'content-type': 'application/json' } }));
    });
    const { result } = renderHook(() => useDisconnect({ computer: 'c-now', target, snap: null, refresh: () => Promise.resolve() }));
    await act(async () => {
      await result.current.disconnect('S-1', 'c-now');
    });
    const hold = heldChanges(DISCONNECT_LOCK).find((h) => (h.identity as { id?: unknown } | undefined)?.id === 'S-1')?.hold;
    expect(hold).toBeTruthy();
    // The account changes once the dismiss has freed the hold (core says so to its listeners), before Disconnect again
    // goes on to its send.
    let armed = true;
    const stop = subscribeChanges(() => {
      if (!armed || heldChanges(DISCONNECT_LOCK).some((h) => h.hold === hold)) return;
      armed = false;
      switchAccount('someone-else');
    });
    let r: unknown = 'unset';
    await act(async () => {
      r = await result.current.again('S-1', hold as string, 'c-now');
    });
    stop();
    expect(armed).toBe(false);
    expect(r).toBeNull();
    expect(deletes).toBe(1);
    expect(result.current.of('S-1').state).not.toBe('failed');
    expect(result.current.failed).toEqual([]);
  });

  it('a held disconnect read from a cut list stays held: never settled, no Disconnect again, no read-back', async () => {
    freshChanges();
    const tr = transport();
    const real = tr.fetch.bind(tr);
    let deletes = 0;
    let reads = 0;
    vi.spyOn(tr, 'fetch').mockImplementation((url, init, meta) => {
      if (meta.route.id === routes.disconnect.id) {
        deletes++;
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      if (meta.route.id === routes.tunnels.id || meta.route.id === routes.bindings.id) reads++;
      return real(url, init, meta);
    });
    // Neither list names S-1, but both are cut at their bound: nothing can say it is gone.
    const cut: Snapshot = {
      tunnels: parseTunnels({ sessions: Array.from({ length: MAX_SESSIONS + 1 }, (_, i) => ({ sessionId: `S-x${i}` })), orphanedSessions: 0 }),
      sessions: {},
      bindings: parseBindings({ bindings: Array.from({ length: MAX_BINDINGS + 1 }, (_, i) => ({ port: 1000 + (i % 60000), mode: 'expose', sessionId: `S-x${i}`, bindId: i })) }),
      at: 0,
    };
    let snap: Snapshot | null = null;
    const { result, rerender } = renderHook(() => useDisconnect({ computer: 'c-now', target, snap, refresh: () => Promise.resolve() }));
    await act(async () => {
      await result.current.disconnect('S-1', 'c-now');
    });
    expect(result.current.of('S-1').state).toBe('pending');
    // A read well past STILL_MS after the send.
    snap = { ...cut, at: Date.now() + 60_000 };
    await act(async () => {
      rerender();
    });
    const d = result.current.of('S-1');
    expect(d.state).toBe('pending');
    expect(d.again).toBeUndefined();
    expect(d.canSend).toBe(false);
    expect(result.current.held).toEqual(['S-1']);
    expect(reads).toBe(0);
    expect(deletes).toBe(1);
  });
});
