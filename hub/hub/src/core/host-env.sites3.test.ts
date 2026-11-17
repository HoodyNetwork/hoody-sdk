// script-asks.ts, stream-resume.ts, stream-budget.ts and providers/env.ts reach the browser only through the installed
// HostEnv: the stored asks, the other-tab and visibility notices and the stream locks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostEnv, installHostEnv, resetHostEnvForTests, type HostEnv, type HostLocks } from './host-env';
import { defineRoute } from './routes';
import { installTransport, type Transport } from './transport';
import { browserEnv } from './providers/env';
import { dropScriptAsk, putScriptAsk, readScriptAsks, scriptAsksVersion, subscribeScriptAsks, subscribeVersion, SCRIPT_ASKS_KEY, type ScriptAsk } from './script-asks';
import { resumableStream } from './stream-resume';
import { createStreamBudget } from './stream-budget';
import { boot, R1, TARGET } from './test/env';
import { installWebLocks } from './test/web-locks';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
function host(over: Partial<HostEnv> = {}): HostEnv {
  return {
    local: memStore(), session: memStore(), vault: null, locks: navigator.locks as unknown as HostLocks,
    onExternalChange: () => () => {}, visible: () => true, onVisibilityChange: () => () => {}, onLifecycle: () => () => {},
    channel: () => null, ...over,
  };
}
const install = (env: HostEnv): void => { resetHostEnvForTests({ unresolved: true }); installHostEnv(env); };
afterEach(() => { resetHostEnvForTests(); installTransport(null); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

const ask = (askId: string): ScriptAsk => ({
  askId, compId: 'comp-1', path: 'scripts/a.ts', realm: R1, owner: null, sessionId: null, turnId: null,
  phase: 'create', sentAt: 1000, createKey: 'hub-ck-' + askId, turnKey: 'hub-tk-' + askId,
});

describe('script asks through the host', () => {
  beforeEach(() => { boot({ realm: R1 }); installWebLocks(); });

  it('reads and writes the host store, never the window storage', async () => {
    const env = host();
    install(env);
    expect(await putScriptAsk(ask('a1'), null)).toBe('ok');
    expect(env.local!.getItem(SCRIPT_ASKS_KEY)).not.toBeNull();
    expect(localStorage.getItem(SCRIPT_ASKS_KEY)).toBeNull();
    expect((readScriptAsks() as ScriptAsk[]).map((a) => a.askId)).toEqual(['a1']);
    expect(await dropScriptAsk(ask('a1'))).toBe('ok'); // the last drop removes the key, from the host store
    expect(env.local!.getItem(SCRIPT_ASKS_KEY)).toBeNull();
  });

  it('a host with no storage reads unreadable and refuses a write, as a missing global did', async () => {
    install(host({ local: null }));
    expect(readScriptAsks()).toBe('unreadable');
    expect(await putScriptAsk(ask('a1'), null)).toBe('unreadable'); // the storage-failure answer, not any refusal
  });

  it('the version listens through the host once, by key, and lets go with the last subscriber; never the window', () => {
    let cb: ((area: 'local' | 'session', key: string | null) => void) | null = null;
    let registrations = 0, offs = 0;
    install(host({ onExternalChange: (c) => { registrations++; cb = c; return () => { offs++; }; } }));
    const add = vi.spyOn(window, 'addEventListener');
    const a = subscribeVersion(() => {});
    const b = subscribeVersion(() => {});
    expect(registrations).toBe(1);
    expect(add.mock.calls.filter(([n]) => n === 'storage')).toHaveLength(0);
    const v0 = scriptAsksVersion();
    cb!('local', 'hub_unrelated_v1');
    expect(scriptAsksVersion()).toBe(v0);
    cb!('local', SCRIPT_ASKS_KEY);
    expect(scriptAsksVersion()).toBe(v0 + 1);
    cb!('local', null);
    expect(scriptAsksVersion()).toBe(v0 + 2);
    a();
    expect(offs).toBe(0);
    b();
    b();
    expect(offs).toBe(1);
    const c = subscribeVersion(() => {});
    expect(registrations).toBe(2);
    c();
    expect(offs).toBe(2);
  });

  it('subscribeScriptAsks is the host registration, filtered by key, and its unsubscribe is the host one', () => {
    let cb: ((area: 'local' | 'session', key: string | null) => void) | null = null;
    let offs = 0;
    install(host({ onExternalChange: (c) => { cb = c; return () => { offs++; }; } }));
    const fn = vi.fn();
    const off = subscribeScriptAsks(fn);
    cb!('local', 'hub_unrelated_v1');
    expect(fn).not.toHaveBeenCalled();
    cb!('local', SCRIPT_ASKS_KEY);
    cb!('session', null);
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    expect(offs).toBe(1);
  });
});

describe('script asks subscribed while the host env is still unresolved', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  const storageEvent = (key: string | null) => window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }));

  it('the version sees another tab\'s change that arrives right after subscribing (the registration attaches at subscribe)', () => {
    resetHostEnvForTests({ unresolved: true });
    const fn = vi.fn();
    const off = subscribeVersion(fn);
    const v0 = scriptAsksVersion();
    storageEvent(SCRIPT_ASKS_KEY);
    expect(scriptAsksVersion()).toBe(v0 + 1);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    storageEvent(SCRIPT_ASKS_KEY);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('subscribeScriptAsks sees it too, and lets go', () => {
    resetHostEnvForTests({ unresolved: true });
    const fn = vi.fn();
    const off = subscribeScriptAsks(fn);
    storageEvent(SCRIPT_ASKS_KEY);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    storageEvent(SCRIPT_ASKS_KEY);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a registration that fails to attach reaches the subscriber and leaves nothing subscribed', () => {
    resetHostEnvForTests({ unresolved: true });
    const add = vi.spyOn(window, 'addEventListener').mockImplementation(() => { throw new Error('no storage events'); });
    expect(() => subscribeVersion(() => {})).toThrow('no storage events');
    add.mockRestore();
    const fn = vi.fn();
    const off = subscribeVersion(fn); // the failed one did not leave the count at one: this registers afresh
    storageEvent(SCRIPT_ASKS_KEY);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('script asks subscribed next to another held registration that fails', () => {
  beforeEach(() => { boot({ realm: R1 }); });
  it('the failure reaches the subscriber and its own, attached registration is let go of', () => {
    resetHostEnvForTests({ unresolved: true });
    const realAdd = document.addEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation((t: string, ...rest: unknown[]) => { if (t === 'visibilitychange') throw new Error('no visibility'); return (realAdd as (...a: unknown[]) => void)(t, ...rest); });
    hostEnv().onVisibilityChange(() => {}); // held; fails when the env resolves
    const fn = vi.fn();
    expect(() => subscribeScriptAsks(fn)).toThrow('no visibility');
    window.dispatchEvent(new StorageEvent('storage', { key: SCRIPT_ASKS_KEY, storageArea: localStorage }));
    expect(fn).not.toHaveBeenCalled(); // the subscriber got an error, not a subscription: nothing is left attached
  });
});

describe('the resumable stream through the host', () => {
  const route = defineRoute({ method: 'GET', path: '/sessions/:id/stream', scope: 'agent', query: ['since', 'incarnation'], stream: { id: 4096, noId: 1024 }, maxBytes: 1 << 20, timeoutMs: 20000 });
  const transport: Transport = {
    hoody: () => Promise.reject(new Error('not used')),
    fetch(_url, init) {
      const signal = init.signal;
      const body = new ReadableStream<Uint8Array>({ start(ctl) { signal?.addEventListener('abort', () => { try { ctl.error(new DOMException('aborted', 'AbortError')); } catch { /* closed */ } }); } });
      return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    },
  };
  beforeEach(() => { boot({ realm: R1 }); installTransport(transport); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); });

  it('follows the host visibility: registers through it, a hidden page pauses after the wait, a visible one reconnects, close lets go; never the document', async () => {
    let shown = false;
    const cbs: Array<() => void> = [];
    let registrations = 0;
    const released: number[] = []; // per registration: how often it was let go of
    install(host({ visible: () => shown, onVisibilityChange: (c) => { const id = registrations++; released[id] = 0; cbs.push(c); return () => { released[id] = (released[id] as number) + 1; }; } }));
    const add = vi.spyOn(document, 'addEventListener');
    const states: string[] = [];
    const h = resumableStream(route, { params: { id: 's1' }, target: TARGET, realm: R1, onEvent: () => {}, onState: (s) => { states.push(s.state); }, onResync: () => {} });
    const mine = registrations; // the inner stream (kit-io) listens through the host as well
    expect(mine).toBeGreaterThanOrEqual(2);
    expect(add.mock.calls.filter(([n]) => n === 'visibilitychange')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(states).toContain('paused');
    expect(states.at(-1)).toBe('paused');
    shown = true;
    for (const c of cbs) c();
    await vi.advanceTimersByTimeAsync(10);
    expect(states.at(-1)).not.toBe('paused');
    h.close();
    expect(released).toHaveLength(registrations);
    expect(released.every((n) => n === 1)).toBe(true); // each registration made was let go of, exactly once
    const after = states.length;
    for (const c of cbs) c(); // a late host notice after close acts on nothing
    await vi.advanceTimersByTimeAsync(70_000);
    expect(states).toHaveLength(after);
  });
});

describe('the resumable stream waiting between attempts', () => {
  const route = defineRoute({ method: 'GET', path: '/sessions/:id/stream', scope: 'agent', query: ['since', 'incarnation'], stream: { id: 4096, noId: 1024 }, maxBytes: 1 << 20, timeoutMs: 20000 });
  const down: Transport = { hoody: () => Promise.reject(new Error('not used')), fetch: () => Promise.reject(new TypeError('Failed to fetch')) };
  beforeEach(() => { boot({ realm: R1 }); installTransport(down); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); });

  it('with no stream open, a page the host reports hidden pauses it after the wait (the host decides, not the document)', async () => {
    const shown = false;
    install(host({ visible: () => shown }));
    const states: string[] = [];
    const h = resumableStream(route, { params: { id: 's1' }, target: TARGET, realm: R1, onEvent: () => {}, onState: (s) => { states.push(s.state); }, onResync: () => {} });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(states).not.toContain('paused');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(states).toContain('paused');
    h.close();
  });
});

describe('the stream budget through the host locks', () => {
  beforeEach(() => { boot({ realm: R1 }); });

  it('takes its slot from the host locks (ifAvailable), never navigator.locks', async () => {
    const asked: Array<{ name: string; ifAvailable: boolean }> = [];
    const locks: HostLocks = {
      request: ((name: string, o: LockOptions, fn: (lock: Lock | null) => unknown) => { asked.push({ name, ifAvailable: !!o.ifAvailable }); return Promise.resolve(fn({ name, mode: 'exclusive' } as Lock)); }) as HostLocks['request'],
    };
    install(host({ locks }));
    const real = vi.spyOn(navigator.locks, 'request');
    const budget = createStreamBudget({ retryMs: 30, cutWaitMs: 80, reserve: 0 });
    let opened = 0;
    const w = budget.watch({ computer: 'p1-c1', key: 'k1', kind: 'session', level: 'stream', open: () => { opened++; return { close: () => {} }; }, onMode: () => {} });
    for (let i = 0; i < 40 && opened === 0; i++) await new Promise((r) => setTimeout(r, 5));
    expect(opened).toBe(1);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((a) => a.name.startsWith('hoody-agent-stream:p1-c1:') && a.ifAvailable)).toBe(true);
    expect(real).not.toHaveBeenCalled();
    w.release();
    budget.reset();
  });

  it('a host whose locks cannot request counts the tab for itself and still opens', async () => {
    install(host({ locks: {} as unknown as HostLocks }));
    const budget = createStreamBudget({ retryMs: 30, cutWaitMs: 80, reserve: 0 });
    let opened = 0;
    budget.watch({ computer: 'p1-c1', key: 'k1', kind: 'session', level: 'stream', open: () => { opened++; return { close: () => {} }; }, onMode: () => {} });
    for (let i = 0; i < 40 && opened === 0; i++) await new Promise((r) => setTimeout(r, 5));
    expect(opened).toBe(1);
    budget.reset();
  });

  it('a host with no locks counts the tab for itself and still opens', async () => {
    install(host({ locks: null }));
    const budget = createStreamBudget({ retryMs: 30, cutWaitMs: 80, reserve: 0 });
    let opened = 0;
    budget.watch({ computer: 'p1-c1', key: 'k1', kind: 'session', level: 'stream', open: () => { opened++; return { close: () => {} }; }, onMode: () => {} });
    for (let i = 0; i < 40 && opened === 0; i++) await new Promise((r) => setTimeout(r, 5));
    expect(opened).toBe(1);
    budget.reset();
  });
});

describe('the provider flows environment through the host', () => {
  it('a stopped wait ends on the next host notice even while the page is still hidden', async () => {
    let cb: (() => void) | null = null;
    install(host({ visible: () => false, onVisibilityChange: (c) => { cb = c; return () => {}; } }));
    const env = browserEnv(() => true);
    const stop = { stopped: false } as { stopped: boolean; wake?: () => void };
    let done = false;
    void env.visible(stop).then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    stop.stopped = true;
    cb!();
    await Promise.resolve();
    expect(done).toBe(true);
  });

  it('hidden() reads the host; visible() waits for the host notice, ends on it, and lets go', async () => {
    let shown = false;
    let cb: (() => void) | null = null;
    let offs = 0;
    install(host({ visible: () => shown, onVisibilityChange: (c) => { cb = c; return () => { offs++; }; } }));
    const add = vi.spyOn(document, 'addEventListener');
    const env = browserEnv(() => true);
    expect(env.hidden()).toBe(true);
    const stop = { stopped: false } as { stopped: boolean; wake?: () => void };
    let done = false;
    void env.visible(stop).then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(add.mock.calls.filter(([n]) => n === 'visibilitychange')).toHaveLength(0);
    shown = true;
    cb!();
    await Promise.resolve();
    expect(done).toBe(true);
    expect(offs).toBe(1);
    expect(env.hidden()).toBe(false);
  });

  it('hidden() answers false when the host cannot read visibility (no document), as before', () => {
    install(host({ visible: () => { throw new ReferenceError('document is not defined'); } }));
    expect(browserEnv(() => true).hidden()).toBe(false);
  });

  it('a host that wakes the wait inside its registration still has the registration let go of', async () => {
    let offs = 0, regs = 0;
    const stopRef = { stopped: false } as { stopped: boolean; wake?: () => void };
    install(host({ visible: () => false, onVisibilityChange: () => { regs++; stopRef.wake!(); return () => { offs++; }; } }));
    const env = browserEnv(() => true);
    let done = false;
    void env.visible(stopRef).then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(true);
    expect([regs, offs]).toEqual([1, 1]);
    expect(stopRef.wake).toBeUndefined();
  });

  it('a host that reports the page visible inside its registration ends the wait and lets go once', async () => {
    let offs = 0, shown = false;
    install(host({ visible: () => shown, onVisibilityChange: (c) => { shown = true; c(); return () => { offs++; }; } }));
    const env = browserEnv(() => true);
    let done = false;
    void env.visible({ stopped: false }).then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(true);
    expect(offs).toBe(1);
  });

  it('a wake ends the wait and lets go of the host registration', async () => {
    let offs = 0;
    install(host({ visible: () => false, onVisibilityChange: () => () => { offs++; } }));
    const env = browserEnv(() => true);
    const stop = { stopped: false } as { stopped: boolean; wake?: () => void };
    let done = false;
    void env.visible(stop).then(() => { done = true; });
    expect(typeof stop.wake).toBe('function');
    stop.wake!();
    await Promise.resolve();
    expect(done).toBe(true);
    expect(offs).toBe(1);
  });
});
