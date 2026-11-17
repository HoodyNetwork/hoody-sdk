// Vitest: a top-up leaves only once storage keeps its hold. A hold only this tab's
// memory keeps is gone after a reload or an account switch, and a new key could then be minted beside a top-up whose
// answer was lost: a double top-up. So a first send whose hold write or read-back fails sends nothing
// (storageFailed, not sent); a replay (its key already stored) whose stamp storage refuses sends nothing either and
// stays pending, never "not sent".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTopUp, paymentsSettled, resetCommerce, topUpHeldFor } from './commerce';
import { capture } from './ctx';
import { breakKey, restoreStorage, rewriteKey } from './test/commerce-env';
import { boot, calls, onFetch, R1, UID } from './test/env';
import { removeTestLocks } from './test/locks';

const KEY = 'hub.v3.topup_pending';
const stored = () => JSON.parse(localStorage.getItem(KEY) || '[]') as Array<Record<string, unknown>>;
const posts = () => calls.filter((c) => c.method !== 'GET');
const avail = () => ({ status: 200, body: { data: { card: { enabled: true }, crypto: { enabled: true } } } });
const keyOf = 'k'.repeat(24);
const theirs = (i: number) => ({ user_id: `other-account-${i}`, key: `othertab-topup-key-${String(i).padStart(4, '0')}`, method: 'card', amount: '10.00', at: Date.now() - 60_000 + i });
const mine = () => ({ user_id: UID, key: keyOf, method: 'card', amount: '10.00', at: Date.now() - 60_000 });

beforeEach(() => { localStorage.removeItem(KEY); boot({ realm: R1 }); resetCommerce(); });
afterEach(() => { restoreStorage(); vi.restoreAllMocks(); resetCommerce(); localStorage.removeItem(KEY); Reflect.deleteProperty(navigator, 'locks'); });

/** The write lands but not as this attempt's stamp, and another account's row (another tab, no cross-tab lock)
 *  appears in storage with it. */
const missAndAnotherTab = (other: Record<string, unknown>) => { let n = 0; rewriteKey(KEY, (v) => {
  if (++n > 1) return v; // the hold's write only; the undo's own write lands as written
  const list = (JSON.parse(v) as Array<{ user_id: string }>).map((x) => (x.user_id === UID ? { ...x, sending: 'another-attempt-0000000' } : x));
  return JSON.stringify(list.some((x) => x.user_id === other.user_id) ? list : [...list, other]);
}); };

describe('a first top-up send whose hold storage cannot keep is never sent', () => {
  it.each([
    ['the write throws (quota)', () => breakKey('setItem', KEY, 'throw')],
    ['the write is silently lost', () => breakKey('setItem', KEY, 'drop')],
  ])('%s: zero POSTs, storageFailed (not sent), nothing held, the drawer ready again', async (_how, breakIt) => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 201, body: { data: { checkout_url: 'https://checkout.stripe.com/x' } } }));
    const t = createTopUp();
    await t.load();
    breakIt();
    const r = await t.submit('10');
    expect(r).toEqual({ ok: false, reason: 'storageFailed', error: { notSent: true } });
    expect(posts()).toEqual([]);
    expect(t.snapshot()).toMatchObject({ phase: 'ready', pending: null });
    expect(topUpHeldFor(capture())).toBeNull();
    restoreStorage();
    // This attempt's state is gone (memory hold, send in flight): nothing of it is left in this tab or in storage.
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(paymentsSettled()).toBe('settled');
  });

  it('a read-back that does not find this attempt\'s stamp: zero POSTs, and the stored rows are put back as they were', async () => {
    const before = [theirs(0), theirs(1)];
    localStorage.setItem(KEY, JSON.stringify(before));
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 201, body: { data: { checkout_url: 'https://checkout.stripe.com/x' } } }));
    const t = createTopUp();
    await t.load();
    // The write lands, but not as this attempt's stamp: this account's row is stored with another attempt's. The refusal
    // puts the list back as it was before, so no row of the unsent top-up is left to read as "may have gone through".
    rewriteKey(KEY, (v) => JSON.stringify((JSON.parse(v) as Array<{ user_id: string }>).map((x) => (x.user_id === UID ? { ...x, sending: 'another-attempt-0000000' } : x))));
    const r = await t.submit('10');
    expect(r).toMatchObject({ ok: false, reason: 'storageFailed' });
    expect(posts()).toEqual([]);
    restoreStorage();
    expect(stored()).toEqual(before);
    expect(topUpHeldFor(capture())).toBeNull();
  });

  it('once storage takes the hold again, the next send goes out (the refusal holds nothing back)', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 201, body: { data: { checkout_url: 'https://checkout.stripe.com/x' } } }));
    const t = createTopUp();
    await t.load();
    breakKey('setItem', KEY, 'throw');
    expect(await t.submit('10')).toMatchObject({ reason: 'storageFailed' });
    restoreStorage();
    expect(await t.submit('10')).toEqual({ ok: true, url: 'https://checkout.stripe.com/x' });
    expect(posts()).toHaveLength(1);
  });
});

describe('a replay whose stamp storage refuses stays pending and is never "not sent"', () => {
  it.each([
    ['the write throws (quota)', 'throw'],
    ['the write is silently lost', 'drop'],
  ] as const)('%s: the confirmed resend sends nothing, answers pending, and the stored record stays the hold', async (_how, how) => {
    localStorage.setItem(KEY, JSON.stringify([mine()]));
    const was = stored();
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 201, body: { data: { checkout_url: 'https://checkout.stripe.com/x' } } }));
    const t = createTopUp();
    await t.load();
    expect(t.snapshot().pending).toMatchObject({ key: keyOf });
    breakKey('setItem', KEY, how);
    const r = await t.resend(true);
    expect(r).toMatchObject({ ok: false, reason: 'pending', key: keyOf, method: 'card', amount: '10.00', error: { pending: true } });
    expect((r as { error?: { notSent?: boolean } }).error?.notSent).toBeUndefined();
    expect(posts()).toEqual([]);
    expect(t.snapshot()).toMatchObject({ phase: 'pending', pending: { key: keyOf, persisted: true } });
    restoreStorage();
    expect(stored()).toEqual(was);
    expect(topUpHeldFor(capture())).toMatchObject({ key: keyOf, persisted: true, sending: false });
  });
});

// A replay may run on the in-tab fallback (no Web Locks), so another tab can write between this
// attempt's write and its undo. The undo puts back only this account's row, into the list as stored now.
describe('the undo of a refused hold puts back only this account\'s row', () => {
  it('a replay without Web Locks whose write lands but whose read-back misses: zero POSTs, its record as it was, another tab\'s new row kept', async () => {
    const earlier = { ...mine(), sending: 'earlier-attempt-00000000', sending_at: Date.now() - 600_000 };
    const t0 = theirs(0);
    localStorage.setItem(KEY, JSON.stringify([t0, earlier]));
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 201, body: { data: { checkout_url: 'https://checkout.stripe.com/x' } } }));
    removeTestLocks();
    const t = createTopUp();
    await t.load();
    expect(t.snapshot().pending).toMatchObject({ key: keyOf });
    const late = theirs(7);
    missAndAnotherTab(late);
    const r = await t.resend(true);
    expect(r).toMatchObject({ ok: false, reason: 'pending', key: keyOf, error: { pending: true } });
    expect(posts()).toEqual([]);
    restoreStorage();
    const now = stored();
    expect(now.find((x) => x.user_id === UID)).toEqual(earlier);
    expect(now.filter((x) => x.user_id !== UID)).toEqual([t0, late]);
  });

  it('a first send whose read-back misses: zero POSTs, no row of it left, another tab\'s new row kept', async () => {
    const t0 = theirs(0);
    localStorage.setItem(KEY, JSON.stringify([t0]));
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 201, body: { data: { checkout_url: 'https://checkout.stripe.com/x' } } }));
    const t = createTopUp();
    await t.load();
    const late = theirs(7);
    missAndAnotherTab(late);
    expect(await t.submit('10')).toMatchObject({ ok: false, reason: 'storageFailed' });
    expect(posts()).toEqual([]);
    restoreStorage();
    expect(stored()).toEqual([t0, late]);
  });
});
