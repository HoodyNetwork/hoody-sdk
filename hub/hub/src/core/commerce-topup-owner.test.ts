// Vitest: a top-up drawer whose owner is no longer live (another account signed in, the context died) refuses
// forget() and every send before anything happens: no storage write, no request. A refused first send answers
// failed with the module's ACCOUNT_CHANGED refusal (not sent); a refused resend leaves the held request as it was
// (its earlier send is still unresolved) and its refusal itself is marked not sent. Live owners: unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTopUp, resetCommerce } from './commerce';
import { restoreStorage } from './test/commerce-env';
import { withPendingLock } from './commerce-pure';
import { boot, calls, deferred, onFetch, OTHER, R1, signIn, UID } from './test/env';

const KEY = 'hub.v3.topup_pending';
const stored = () => localStorage.getItem(KEY);
const posts = () => calls.filter((c) => c.method !== 'GET');
const avail = () => ({ status: 200, body: { data: { card: { enabled: true }, crypto: { enabled: true } } } });
const keyOf = 'k'.repeat(24);
const mine = () => ({ user_id: UID, key: keyOf, method: 'card', amount: '10.00', at: Date.now() - 60_000 });
const ok = () => onFetch((c) => (c.method === 'GET' ? avail() : { status: 201, body: { data: { checkout_url: 'https://checkout.stripe.com/x' } } }));
/** Every write to the top-up record from here on. */
const watchWrites = () => {
  const writes: string[] = [];
  const set = Storage.prototype.setItem, del = Storage.prototype.removeItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) { if (k === KEY) writes.push(`set ${v}`); return set.call(this, k, v); });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, k: string) { if (k === KEY) writes.push('remove'); return del.call(this, k); });
  return writes;
};
const settleLocks = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0)); };

beforeEach(() => { localStorage.removeItem(KEY); boot({ realm: R1 }); resetCommerce(); });
afterEach(() => { restoreStorage(); vi.restoreAllMocks(); resetCommerce(); localStorage.removeItem(KEY); });

describe('forget() after the owner stopped being live', () => {
  it('refuses and writes nothing; the held record stays', async () => {
    localStorage.setItem(KEY, JSON.stringify([mine()]));
    const was = stored();
    ok();
    const t = createTopUp();
    await t.load();
    expect(t.snapshot().pending).toMatchObject({ key: keyOf });
    signIn(OTHER);
    const writes = watchWrites();
    expect(t.forget(true)).toBe(false);
    await settleLocks();
    expect(writes).toEqual([]);
    expect(stored()).toBe(was);
    expect(posts()).toEqual([]);
  });

  it('positive control: a live owner forgets (the record is dropped, the drawer ready)', async () => {
    localStorage.setItem(KEY, JSON.stringify([mine()]));
    ok();
    const t = createTopUp();
    await t.load();
    expect(t.forget(true)).toBe(true);
    await settleLocks();
    expect(JSON.parse(stored() || '[]')).toEqual([]);
    expect(t.snapshot()).toMatchObject({ phase: 'ready', pending: null });
    expect(posts()).toEqual([]);
  });
});

describe('a send after the owner stopped being live', () => {
  it('a first send is refused unsent: no fetch, no storage write, ACCOUNT_CHANGED (not sent), never pending', async () => {
    ok();
    const t = createTopUp();
    await t.load();
    const before = calls.length;
    signIn(OTHER);
    const writes = watchWrites();
    const r = await t.submit('10');
    await settleLocks();
    expect(r).toMatchObject({ ok: false, reason: 'failed', error: { code: 'ACCOUNT_CHANGED', kind: 'not_sent', notSent: true } });
    expect(calls.length).toBe(before);
    expect(writes).toEqual([]);
    expect(stored()).toBeNull();
  });

  it('a confirmed resend is refused unsent: no fetch, no stamp written; the held request stays as it was', async () => {
    localStorage.setItem(KEY, JSON.stringify([mine()]));
    const was = stored();
    ok();
    const t = createTopUp();
    await t.load();
    const before = calls.length;
    signIn(OTHER);
    const writes = watchWrites();
    const r = await t.resend(true);
    await settleLocks();
    expect(r).toMatchObject({ ok: false, reason: 'pending', key: keyOf, error: { code: 'ACCOUNT_CHANGED', kind: 'not_sent', notSent: true } });
    expect(calls.length).toBe(before);
    expect(writes).toEqual([]);
    expect(stored()).toBe(was);
    expect(t.snapshot()).toMatchObject({ phase: 'pending', pending: { key: keyOf } });
  });

  it('positive controls: a live owner sends and resends', async () => {
    ok();
    const t = createTopUp();
    await t.load();
    expect(await t.submit('10')).toEqual({ ok: true, url: 'https://checkout.stripe.com/x' });
    expect(posts()).toHaveLength(1);
    resetCommerce();
    localStorage.setItem(KEY, JSON.stringify([mine()]));
    const u = createTopUp();
    await u.load();
    expect(await u.resend(true)).toEqual({ ok: true, url: 'https://checkout.stripe.com/x' });
    expect(posts()).toHaveLength(2);
    expect(posts()[1]?.body).toMatchObject({ idempotency_key: keyOf });
  });
});

/** Holds the pending-store Web Lock until the returned release() is called. */
const holdLock = () => {
  const d = deferred();
  // The same lock manager and name as every admission (host-env's locks): the callback's promise holds it.
  void withPendingLock(() => d.p);
  return () => d.res();
};

describe('the owner changes while the pending lock is awaited (the in-lock check)', () => {
  it('a first send: refused unsent under the lock, no write, no fetch, the drawer ready again', async () => {
    ok();
    const t = createTopUp();
    await t.load();
    const before = calls.length;
    const release = holdLock();
    const writes = watchWrites();
    const r = t.submit('10');
    await settleLocks();
    expect(t.snapshot().phase).toBe('submitting');
    signIn(OTHER);
    release();
    expect(await r).toMatchObject({ ok: false, reason: 'failed', error: { code: 'ACCOUNT_CHANGED', kind: 'not_sent', notSent: true } });
    await settleLocks();
    expect(calls.length).toBe(before);
    expect(writes).toEqual([]);
    expect(stored()).toBeNull();
    expect(t.snapshot()).toMatchObject({ phase: 'ready', pending: null });
  });

  it('a confirmed resend: refused unsent under the lock, no stamp, no fetch, still pending with its key', async () => {
    localStorage.setItem(KEY, JSON.stringify([mine()]));
    const was = stored();
    ok();
    const t = createTopUp();
    await t.load();
    const before = calls.length;
    const release = holdLock();
    const writes = watchWrites();
    const r = t.resend(true);
    await settleLocks();
    expect(t.snapshot().phase).toBe('submitting');
    signIn(OTHER);
    release();
    expect(await r).toMatchObject({ ok: false, reason: 'pending', key: keyOf, error: { code: 'ACCOUNT_CHANGED', kind: 'not_sent', notSent: true } });
    await settleLocks();
    expect(calls.length).toBe(before);
    expect(writes).toEqual([]);
    expect(stored()).toBe(was);
    expect(t.snapshot()).toMatchObject({ phase: 'pending', pending: { key: keyOf } });
  });
});

// shownOwner() is null when no identity is displayed: the drawer opens in 'account', load() returns before any
// read, so no method is ever selected and nothing is pending: submit answers 'nomethod', resend and forget refuse.
describe('no owner at open', () => {
  it('nothing is read, sent or written', async () => {
    boot({ realm: R1, identity: false });
    resetCommerce();
    localStorage.setItem(KEY, JSON.stringify([mine()]));
    const was = stored();
    ok();
    const writes = watchWrites();
    const t = createTopUp();
    await t.load();
    expect(t.snapshot()).toMatchObject({ phase: 'account', methods: [], pending: null });
    expect(await t.submit('10')).toEqual({ ok: false, reason: 'nomethod' });
    expect(await t.resend(true)).toEqual({ ok: false, reason: 'nomethod' });
    expect(t.forget(true)).toBe(false);
    await settleLocks();
    expect(calls).toEqual([]);
    expect(writes).toEqual([]);
    expect(stored()).toBe(was);
  });
});
