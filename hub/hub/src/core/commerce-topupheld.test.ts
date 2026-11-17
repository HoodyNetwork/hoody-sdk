// Vitest: the synchronous reader of the held top-up (topUpHeldFor) and its announcements (subscribeTopUpPending).
// The reader is core's own record read now: owner-bound, no availability read, no machine, no new state. The
// announcement follows every write that really ran (a Forget's delete under the pending lock included).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTopUp, resetCommerce, subscribeTopUpPending as subscribe, topUpHeldFor } from './commerce';
import { bump, capture, setIdentity } from './ctx';
import { boot, calls, deferred, onFetch, OTHER, R1, settle, UID } from './test/env';

const KEY = 'hub.v3.topup_pending';
const avail = () => ({ status: 200, body: { data: { card: { enabled: true }, crypto: { enabled: true } } } });
const stored = () => JSON.parse(localStorage.getItem(KEY) || '[]') as Array<Record<string, unknown>>;
const held = () => topUpHeldFor(capture());
const offs: Array<() => void> = [];
const subscribeTopUpPending = (fn: () => void): (() => void) => { const off = subscribe(fn); offs.push(off); return off; };
const keyOf = 'k'.repeat(24);
const rec = (over: Record<string, unknown> = {}) => ({ user_id: UID, key: keyOf, method: 'card', amount: '10.00', at: Date.now(), ...over });

/** Storage that cannot read the top-up record (other keys still work): this tab's memory alone holds it. */
function breakTopUpRead() {
  const orig = Storage.prototype.getItem;
  return vi.spyOn(localStorage, 'getItem').mockImplementation(function (this: Storage, k: string) {
    if (k === KEY) throw new Error('storage');
    return orig.call(this, k);
  });
}
/** A drawer's send whose answer is lost: core now holds the top-up. */
async function lostSend(): Promise<string> {
  onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
  const t = createTopUp();
  await t.load();
  await t.submit('10');
  t.dispose();
  return t.snapshot().pending!.key;
}

beforeEach(() => { boot({ realm: R1 }); resetCommerce(); });
afterEach(() => { for (const off of offs.splice(0)) off(); vi.restoreAllMocks(); vi.useRealTimers(); resetCommerce(); Reflect.deleteProperty(navigator, 'locks'); });

describe('topUpHeldFor: core\'s record, read now', () => {
  // A hold written before the method was named "card": any stored word that is not the crypto one is read
  // as the card method with the same key, amount and stamp; the confirmed resend posts that key to the card route.
  it('a hold stored under an earlier method word is kept as the card method and resumes the same key on the card route', async () => {
    const old = 'earlier-word';
    localStorage.setItem(KEY, JSON.stringify([rec({ method: old })]));
    expect(held()).toEqual({ key: keyOf, method: 'card', amount: '10.00', persisted: true, sending: false });
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 201, body: { data: { checkout_url: 'https://checkout.stripe.com/x' } } }));
    const t = createTopUp();
    await t.load();
    expect(t.snapshot().pending).toMatchObject({ key: keyOf, method: 'card', amount: '10.00', persisted: true });
    expect(await t.resend(true)).toEqual({ ok: true, url: 'https://checkout.stripe.com/x' });
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toMatch(/\/wallet\/payments\/card\/checkout$/);
    expect(posts[0]!.body).toMatchObject({ idempotency_key: keyOf, amount: '10.00' });
    t.dispose();
  });
  it('a stored crypto hold stays crypto; a record whose method is not a short word is no record', () => {
    localStorage.setItem(KEY, JSON.stringify([rec({ method: 'crypto' })]));
    expect(held()).toMatchObject({ key: keyOf, method: 'crypto' });
    for (const method of [7, '', null, 'x'.repeat(33)]) {
      localStorage.setItem(KEY, JSON.stringify([rec({ method })]));
      expect(held()).toBeNull();
    }
  });

  it('is null with no displayed identity, with no ctx and when nothing is held; it starts no request', () => {
    expect(held()).toBeNull();
    expect(topUpHeldFor(null)).toBeNull();
    expect(topUpHeldFor(undefined)).toBeNull();
    boot({ realm: R1, identity: false });
    localStorage.setItem(KEY, JSON.stringify([rec()]));
    expect(held()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('shows the stored hold with its key, method, amount and persisted true, without any availability read', async () => {
    const k = await lostSend();
    const before = calls.length;
    expect(held()).toEqual({ key: k, method: 'card', amount: '10.00', persisted: true, sending: false });
    expect(calls).toHaveLength(before);
  });

  // A first send storage refuses is never sent: a hold is memory-only once storage cannot be read.
  it('shows a hold storage cannot read now as persisted false (this tab only)', async () => {
    const k = await lostSend();
    await settle();
    const unreadable = breakTopUpRead();
    try {
      expect(held()).toEqual({ key: k, method: 'card', amount: '10.00', persisted: false, sending: false });
    } finally { unreadable.mockRestore(); }
  });

  it('is owner-bound: one account\'s hold is never visible to another, and is again for its owner', async () => {
    const k = await lostSend();
    setIdentity({ id: OTHER, banned: false });
    bump('account');
    expect(held()).toBeNull();
    localStorage.setItem(KEY, JSON.stringify([...stored(), rec({ user_id: OTHER, key: 'o'.repeat(24), amount: '77.00' })]));
    expect(held()).toMatchObject({ key: 'o'.repeat(24), amount: '77.00' });
    setIdentity({ id: UID, banned: false });
    bump('account');
    expect(held()).toMatchObject({ key: k, amount: '10.00' });
  });

  it('a hold another tab resolved (gone from readable storage) is gone for this reader too', async () => {
    await lostSend();
    expect(held()).not.toBeNull();
    localStorage.removeItem(KEY);
    expect(held()).toBeNull();
  });
});

describe('topUpHeldFor: sending is core\'s own rule (this tab\'s POST, or another tab\'s stamp and its sending_at)', () => {
  it('is true while this tab\'s POST is out and false once it is answered', async () => {
    const answer = deferred<{ status: number; body: unknown }>();
    onFetch((c) => (c.method === 'GET' ? avail() : answer.p));
    const t = createTopUp();
    await t.load();
    const sent = t.submit('10');
    await vi.waitFor(() => expect(held()).toMatchObject({ sending: true }));
    answer.res({ status: 500, body: {} });
    await sent;
    await settle();
    expect(held()).toMatchObject({ sending: false, persisted: true });
  });

  it('another tab\'s fresh stamp is sending; it ends 120 s after its sending_at, and a renewed stamp starts a new window', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.now();
    localStorage.setItem(KEY, JSON.stringify([rec({ sending: 'a'.repeat(24), sending_at: t0 })]));
    expect(held()).toMatchObject({ sending: true });
    vi.setSystemTime(t0 + 119_000);
    expect(held()).toMatchObject({ sending: true });
    vi.setSystemTime(t0 + 120_000);
    expect(held()).toMatchObject({ sending: false });
    // The other tab's heartbeat renews it: core's reader follows sending_at, not when it was first seen.
    localStorage.setItem(KEY, JSON.stringify([rec({ sending: 'a'.repeat(24), sending_at: t0 + 100_000 })]));
    expect(held()).toMatchObject({ sending: true });
    vi.setSystemTime(t0 + 219_000);
    expect(held()).toMatchObject({ sending: true });
    vi.setSystemTime(t0 + 220_000);
    expect(held()).toMatchObject({ sending: false });
  });

  it('this tab\'s heartbeat renews the stamp under the lock and is announced', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const answer = deferred<{ status: number; body: unknown }>();
    onFetch((c) => (c.method === 'GET' ? avail() : answer.p));
    const t = createTopUp();
    await t.load();
    const sent = t.submit('10');
    await vi.waitFor(() => expect(held()).toMatchObject({ sending: true }));
    const at0 = stored()[0]!.sending_at as number;
    const seen = vi.fn();
    subscribeTopUpPending(seen);
    await vi.advanceTimersByTimeAsync(30_000);
    await settle();
    expect(stored()[0]!.sending_at as number).toBeGreaterThan(at0);
    expect(seen).toHaveBeenCalled();
    answer.res({ status: 500, body: {} });
    await sent;
  });

  it('a stamp older than the window at the first read is not sending', () => {
    localStorage.setItem(KEY, JSON.stringify([rec({ sending: 'a'.repeat(24), sending_at: Date.now() - 10 * 60_000 })]));
    expect(held()).toMatchObject({ sending: false });
  });
});

describe('subscribeTopUpPending', () => {
  it('announces a hold, a send starting and ending, and a drop; an unsubscribed listener hears nothing more', async () => {
    const seen: Array<ReturnType<typeof held>> = [];
    const off = subscribeTopUpPending(() => seen.push(held()));
    const k = await lostSend();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((h) => h?.sending === true)).toBe(true);
    expect(seen[seen.length - 1]).toMatchObject({ key: k, sending: false });
    const t = createTopUp();
    await t.load();
    seen.length = 0;
    expect(t.forget(true)).toBe(true);
    await settle();
    expect(seen[seen.length - 1]).toBeNull();
    off();
    seen.length = 0;
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    expect(seen).toHaveLength(0);
  });

  it('announces after a Forget\'s delete really runs under the pending lock, never before', async () => {
    await lostSend();
    const t = createTopUp();
    await t.load();
    // The pending lock is taken by someone else: the drop waits for it.
    const open = deferred();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_n: string, fn: () => unknown) => open.p.then(fn) } });
    const seen: Array<ReturnType<typeof held>> = [];
    subscribeTopUpPending(() => seen.push(held()));
    expect(t.forget(true)).toBe(true);
    await settle();
    expect(held()).not.toBeNull();
    expect(stored()).toHaveLength(1);
    expect(seen).toHaveLength(0);
    open.res();
    await settle();
    expect(stored()).toEqual([]);
    expect(held()).toBeNull();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBeNull();
  });

  it('announces another tab\'s write (a storage event for the record, or all keys) but not an unrelated key', () => {
    const fn = vi.fn();
    subscribeTopUpPending(fn);
    window.dispatchEvent(new StorageEvent('storage', { key: 'something.else' }));
    expect(fn).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    expect(fn).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('announces an account change, which empties this tab\'s memory; a listener that throws does not stop the others', async () => {
    await lostSend();
    await settle();
    const quota = breakTopUpRead();
    try {
      expect(held()).not.toBeNull();
      const second = vi.fn();
      subscribeTopUpPending(() => { throw new Error('a listener\'s own'); });
      subscribeTopUpPending(second);
      setIdentity({ id: OTHER, banned: false });
      bump('account');
      expect(second).toHaveBeenCalled();
      expect(held()).toBeNull();
    } finally { quota.mockRestore(); }
  });
});
