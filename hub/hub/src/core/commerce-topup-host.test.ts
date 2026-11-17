// Vitest: a top-up attempt's "shown again" listeners go through the installed HostEnv. When one
// of the pair fails to register, none stays attached: the one that did is removed at once, the heartbeat alone keeps
// checking the stamp, and settling the attempt removes nothing twice.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { budgets, createTopUp, resetCommerce } from './commerce';
import { installHostEnv, resetHostEnvForTests, webHostEnv, type HostEnv } from './host-env';
import { boot, calls, onFetch, R1 } from './test/env';

const KEY = 'hub.v3.topup_pending';
const stored = () => JSON.parse(localStorage.getItem(KEY) || '[]') as Array<Record<string, unknown>>;
const posts = () => calls.filter((c) => c.method !== 'GET');
const env = (data: unknown) => ({ status: 200, body: { data } });
const avail = () => env({ card: { enabled: true }, crypto: { enabled: true } });

// The host keeps working Web Locks (the test env's navigator.locks, read at the call as the web host does): a top-up's
// first send mints a new money key and is refused 'noLocks' without a granted lock (commerce.ts), so with `locks: null`
// nothing was posted. This test is about the shown-again listeners only.
function host(over: Partial<HostEnv>): HostEnv {
  return {
    local: localStorage, session: sessionStorage, vault: null, get locks() { return webHostEnv.locks; },
    onExternalChange: () => () => {}, visible: () => true, onVisibilityChange: () => () => {}, onLifecycle: () => () => {},
    channel: () => null, ...over,
  };
}

beforeEach(() => { boot({ realm: R1 }); resetCommerce(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); resetCommerce(); resetHostEnvForTests(); });

describe('top-up shown-again listeners through the host', () => {
  it('the second registration throws: the first is removed at once, the beat still renews, settling removes nothing twice', async () => {
    let regs = 0, offs = 0, lifecycle = 0;
    resetHostEnvForTests({ unresolved: true });
    installHostEnv(host({
      onVisibilityChange: () => { regs++; return () => { offs++; }; },
      onLifecycle: () => { lifecycle++; throw new Error('no pageshow here'); },
    }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.assign(budgets, { topupMs: 600000 });
    let answer!: (r: { status: number; body: unknown }) => void;
    onFetch((c) => (c.method === 'GET' ? avail() : new Promise((res) => { answer = res; })));
    const t = createTopUp();
    await t.load();
    const r = t.submit('10');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    await vi.waitFor(() => expect(stored()[0]?.sending_at).toBeDefined());
    expect([regs, lifecycle]).toEqual([1, 1]);
    expect(offs).toBe(1); // rolled back right away, not left attached until the attempt ends
    const first = stored()[0]!.sending_at as number;
    await vi.advanceTimersByTimeAsync(130000);
    await vi.waitFor(() => expect(stored()[0]!.sending_at as number).toBeGreaterThan(first)); // the beat still runs
    answer(env({ checkout_url: 'https://checkout.stripe.com/c/x' }));
    expect(await r).toMatchObject({ ok: true });
    expect(offs).toBe(1); // stopBeat found nothing left to remove
  });

  it('control: both register, both stay until the attempt settles, then each is removed once', async () => {
    let offs = 0;
    resetHostEnvForTests({ unresolved: true });
    installHostEnv(host({
      onVisibilityChange: () => () => { offs++; },
      onLifecycle: () => () => { offs++; },
    }));
    let answer!: (r: { status: number; body: unknown }) => void;
    onFetch((c) => (c.method === 'GET' ? avail() : new Promise((res) => { answer = res; })));
    const t = createTopUp();
    await t.load();
    const r = t.submit('10');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(offs).toBe(0);
    answer(env({ checkout_url: 'https://checkout.stripe.com/c/x' }));
    expect(await r).toMatchObject({ ok: true });
    expect(offs).toBe(2);
  });
});
