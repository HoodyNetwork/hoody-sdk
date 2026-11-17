// commerce.ts: Market, reservations, purchase machine, wallet, subscriptions, attempts.
// It runs on the real core (env.ts): the money rules themselves are
// commerce-pure.test.ts's; these pin the behaviour of the module that drives them.
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, setOtpPrompt } from './api';
import {
  availability, balances, bounds, budgets, checkStatus, claimBonus, clearBuyResume, commerceRoutes, consumeIntent, createAttempt,
  createPurchase, createTopUp, freeServerName, getSubscription, githubBonus, loadListing, loadSubscriptions, marketBanned,
  marketLatch, marketPendingDrop, marketPendingFor, marketPendingKept, paymentsSettled, pendingUpgrade, pendingUpgrades, planChip, plans, pollReservations, readBuyResume, readTopupReturn,
  rentPendingFor, resetCommerce, RES, SUBS, setAutoRenew, shownOwner, topup, transfer, useAttempt, usePurchase, useTopUp, verifyReturn,
  walkReservations, writeBuyResume, writePayResume,
} from './commerce';
import { market as M } from './commerce-pure';
import { bump, capture, setIdentity } from './ctx';
import { defineRoute } from './routes';
import { accepted } from './test/commerce-env';
import { boot, calls, deferred, hostOf, onFetch, OTHER, R1, sessionToken, settle, signIn, UID, type Call } from './test/env';

const BAN = { status: 403, body: { success: false, statusCode: 403, error: 'ACCOUNT_BANNED' } };
const offerRaw = (id = 'off1') => ({ id, name: 'Offer', pricing_rules: { '30': 1000 }, hold_rules: { '30': 3 }, setup_fee_rules: {}, setup_fee_cents: 200 });
const stockRaw = (id = 'st1') => ({ id, name: 'Stock', pricing: { price_tiers: { '30': { price: '10.00', total_first_payment: '12.00', hold_days: 0 } } } });
const offerRow = (id = 'off1') => M.normalizeOfferRow(offerRaw(id), 0);
const stockRow = (id = 'st1') => M.normalizeStockRow(stockRaw(id), 0);
const resRow = (i: number, state = 'pending') => ({ id: 'r' + i, state, days: 30, created_at: '2026-01-01T00:00:00Z' });
const env = (data: unknown, extra: Record<string, unknown> = {}) => ({ status: 200, body: { data, ...extra } });
const path = (u: string) => u.replace(/^https:\/\/[^/]+/, '').replace(/^\/api\/v1/, '');
const posts = () => calls.filter((c) => c.method !== 'GET');
/** Break one storage key only (the session itself must keep working). */
const breakKey = (op: 'getItem' | 'setItem', key: string, how: 'throw' | 'drop') => {
  const orig = Storage.prototype[op] as (...a: string[]) => unknown;
  return vi.spyOn(localStorage, op as 'getItem').mockImplementation(function (this: Storage, k: string, v?: string) {
    if (k === key) { if (how === 'throw') throw new Error('storage'); return undefined as never; }
    return orig.call(this, k, v as string) as never;
  } as never);
};
// FIFO per lock name, as Web Locks (the money send lock is held while the pending-store lock is taken).
const fakeLocks = () => {
  const tails = new Map<string, Promise<unknown>>();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: (n: string, a: unknown, b?: unknown) => {
      const fn = (typeof a === 'function' ? a : b) as () => unknown;
      const r = (tails.get(n) || Promise.resolve()).then(fn);
      tails.set(n, r.then(() => undefined, () => undefined));
      return r;
    } },
  });
};

beforeEach(() => { boot({ realm: R1 }); resetCommerce(); });
afterEach(() => { setOtpPrompt(null); vi.restoreAllMocks(); vi.useRealTimers(); resetCommerce(); Reflect.deleteProperty(navigator, 'locks'); });

describe('routes and hosts', () => {
  it('base families go to the base host, the subscription family to the realm host', async () => {
    onFetch(() => env([]));
    const ctx = capture();
    await api(commerceRoutes.offersRoute, { ctx });
    await api(commerceRoutes.subsListRoute, { ctx, query: { limit: 1, offset: 0, locale: 'en' } });
    await api(commerceRoutes.balancesRoute, { ctx });
    expect(hostOf(calls[0]!.url)).toBe(hostOf(calls[2]!.url));
    expect(hostOf(calls[1]!.url)).not.toBe(hostOf(calls[0]!.url));
    expect(hostOf(calls[1]!.url)).toContain(R1);
  });
  it('All mode sends the subscription family to the base host', async () => {
    boot({ realm: 'all' });
    onFetch(() => env([]));
    await loadSubscriptions(capture());
        expect(hostOf(calls[0]!.url)).not.toContain(R1);
  });
  it('query keys go out in the old order and an undeclared route is refused unsent', async () => {
    onFetch(() => env([]));
    await loadSubscriptions(capture());
    expect(path(calls[0]!.url)).toMatch(/\/subserver-subscriptions\?limit=200&offset=0&locale=en$/);
    const rogue = defineRoute({ method: 'GET', path: '/rentals/:id', scope: 'base' });
    calls.length = 0;
    await expect(api(rogue, { ctx: capture(), params: { id: '..' } })).rejects.toBeTruthy();
    expect(calls).toHaveLength(0);
  });
  it('the by-id subscription read refuses the id "quote" unsent', async () => {
    onFetch(() => env({}));
    await expect(getSubscription(capture(), 'quote')).rejects.toMatchObject({ notSent: true });
    expect(calls).toHaveLength(0);
  });
});

describe('owners', () => {
  it('no displayed identity means no owner and a change is refused unsent', async () => {
    boot({ realm: R1, identity: false });
    expect(shownOwner(capture())).toBeNull();
    const p = createPurchase(offerRow(), '30');
    expect(p.confirm(true)).toEqual({ ok: false, reason: 'accountChanged' });
    await expect(transfer(null, capture(), '5', 0, 'k')).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED', notSent: true });
    expect(calls).toHaveLength(0);
  });
  it('the owner stops holding when the displayed identity changes', () => {
    const own = shownOwner(capture())!;
    expect(own.live()).toBe(true);
    setIdentity({ id: OTHER, banned: false });
    expect(own.live()).toBe(false);
  });
});

describe('Market listing', () => {
  it('normalizes both rails; one failing leaves the other', async () => {
    onFetch((c) => (path(c.url) === '/offers' ? env([offerRaw()]) : { status: 500, body: { error: 'X' } }));
    const l = await loadListing(capture());
    expect(l.offers).toHaveLength(1);
    expect(l.stock).toEqual([]);
    expect(l.errStock).toBeTruthy();
    expect(l.errOffers).toBeNull();
  });
  it('a malformed envelope is BAD_LIST', async () => {
    onFetch(() => env({ not: 'a list' }));
    const l = await loadListing(capture());
    expect(l.errStock).toMatchObject({ code: 'BAD_LIST' });
  });
  it('a ban latches and checkStatus clears it only on an authoritative is_banned false', async () => {
    onFetch(() => BAN);
    const l = await loadListing(capture());
    expect(l.banned).toBe(true);
    expect(marketBanned()).toBe(true);
    onFetch(() => env({ id: UID, is_banned: true }));
    expect(await checkStatus(capture())).toBe('still');
    onFetch(() => env({ id: OTHER, is_banned: false }));
    expect(await checkStatus(capture())).toBe('unknown');
    expect(marketBanned()).toBe(true);
    onFetch(() => ({ status: 500, body: {} }));
    expect(await checkStatus(capture())).toBe('failed');
    onFetch(() => env({ id: UID, is_banned: false }));
    expect(await checkStatus(capture())).toBe('cleared');
    expect(marketLatch.banned).toBe(false);
    expect(await checkStatus(capture())).toBe('clear');
  });
  it('freeServerName finds the free-tier server', async () => {
    onFetch(() => env([{ status: 'active', server: { name: 'paid' } }, { is_free_tier: true, server: { name: 'free-1' } }]));
    expect(await freeServerName(capture())).toBe('free-1');
  });
});

describe('reservations', () => {
  it('walks up to maxAuto pages, then Load more continues the same owner', async () => {
    RES.page = 2; RES.maxAuto = 2;
    onFetch((c) => {
      const off = Number(/offset=(\d+)/.exec(c.url)![1]);
      return env([resRow(off), resRow(off + 1)], { total: 10 });
    });
    const w = await walkReservations(capture());
    expect(w.rows).toHaveLength(4);
    expect(w.more).toBe(true);
    expect(calls.map((c) => /offset=(\d+)/.exec(c.url)![1])).toEqual(['0', '2']);
    await walkReservations(capture(), w);
    expect(w.rows).toHaveLength(8);
  });
  it('a page answered after the owner changed is dropped and the walk stops', async () => {
    RES.page = 2;
    const d = deferred<void>();
    onFetch(async () => { await d.p; return env([resRow(0), resRow(1)], { total: 10 }); });
    const p = walkReservations(capture());
    await settle(3);
    setIdentity({ id: OTHER, banned: false });
    d.res();
    await expect(p).rejects.toMatchObject({ superseded: true });
    expect(calls).toHaveLength(1);
  });
  it('a short page ends the older tail; a later Load more reads the head', async () => {
    RES.page = 3;
    onFetch(() => env([resRow(0), resRow(1)], { total: 5 }));
    const w = await walkReservations(capture());
    expect(w.exhausted).toBe(true);
    calls.length = 0;
    onFetch(() => env([resRow(9), resRow(0), resRow(1)], { total: 5 }));
    await walkReservations(capture(), w);
    expect(w.rows.map((r) => r.id)).toEqual(['r9', 'r0', 'r1']);
    expect(path(calls[0]!.url)).toMatch(/offset=0/);
  });
  it('a malformed page is BAD_LIST', async () => {
    onFetch(() => env('nope'));
    await expect(walkReservations(capture())).rejects.toMatchObject({ code: 'BAD_LIST' });
  });
  it('polls nothing when none is pending, and a cycle reads page 0 plus capped by-id reads', async () => {
    RES.page = 10; RES.perIdCap = 2; RES.concurrency = 1;
    onFetch(() => env([resRow(0, 'fulfilled')], { total: 1 }));
    const w = await walkReservations(capture());
    calls.length = 0;
    await pollReservations(capture(), w);
    expect(calls).toHaveLength(0);
    const w2 = { ...w, tracked: {} as typeof w.tracked };
    for (let i = 1; i <= 4; i++) w2.tracked['r' + i] = { lastPolledAt: 0, seq: i };
    onFetch((c) => (/\/reservations\/(r\d+)/.test(c.url) ? env({ ...resRow(Number(/r(\d+)$/.exec(c.url)![1]), 'fulfilled') }) : env([], { total: 1 })));
    await pollReservations(capture(), w2);
    expect(calls.filter((c) => /\/reservations\/r\d/.test(c.url))).toHaveLength(2);
  });
  it('a fulfilled row is never shown as pending again', async () => {
    RES.page = 5;
    onFetch(() => env([resRow(1, 'fulfilled')], { total: 1 }));
    await walkReservations(capture());
    onFetch(() => env([resRow(1, 'pending')], { total: 1 }));
    const w = await walkReservations(capture());
    expect(w.rows[0]!.state).toBe('fulfilled');
  });
  it('a ban during a poll rejects and latches', async () => {
    RES.page = 5;
    onFetch(() => env([resRow(1)], { total: 1 }));
    const w = await walkReservations(capture());
    onFetch(() => BAN);
    await expect(pollReservations(capture(), w)).rejects.toBeTruthy();
    expect(marketBanned()).toBe(true);
  });
});

describe('purchase machine', () => {
  it('rent: consent, wire, 2xx', async () => {
    const o = vi.fn();
    const p = createPurchase(stockRow(), '30', { onChange: o });
    expect(p.confirm(false)).toEqual({ ok: false, reason: 'consent' });
    onFetch(() => env({ rental: { id: 'rent1', server_id: 'st1' }, transaction: { id: 't1', currency: 'USD' } }));
    expect(p.confirm(true)).toEqual({ ok: true });
    expect(p.confirm(true)).toEqual({ ok: false, reason: 'busy' });
    await settle();
    const c = posts()[0]!;
    expect(path(c.url)).toBe('/servers/st1/rent');
    expect(c.body).toEqual({ rental_days: 30, max_charge_cents: 1200 });
    expect(p.snapshot().state).toBe('confirmed');
    expect(o).toHaveBeenCalled();
  });
  it('reserve: the key is stored before the POST and dropped on 2xx', async () => {
    let during: unknown = null;
    onFetch((c) => { if (c.method === 'POST') during = localStorage.getItem('hub_market_pending'); return env({ reservation: { id: 'res1', state: 'pending' }, replayed: false }); });
    const p = createPurchase(offerRow(), '30');
    p.confirm(true);
    await settle();
    expect(JSON.parse(during as string)[0].key).toBe(posts()[0]!.body.idempotency_key);
    expect(posts()[0]!.body).toMatchObject({ days: 30, max_charge_cents: 1200 });
    expect(localStorage.getItem('hub_market_pending')).toBeNull();
  });
  // A 2xx counts only in the route's shape: reserve 201 always carries a boolean `replayed` and
  // may leave the reservation out; rent 201 always carries the rental. Anything else proves nothing.
  it('reserve: a 201 with only { replayed } (a reservation the caller may not read) is confirmed and drops the key', async () => {
    onFetch(() => env({ replayed: true }));
    const p = createPurchase(offerRow(), '30');
    p.confirm(true);
    await settle();
    expect(p.snapshot().state).toBe('confirmed');
    expect(p.snapshot().replayed).toBe(true);
    expect(localStorage.getItem('hub_market_pending')).toBeNull();
  });
  it.each([
    ['an empty body', {}],
    ['replayed not a boolean', { replayed: 'true', reservation: { id: 'res1' } }],
    ['a reservation without its id', { replayed: false, reservation: { state: 'pending' } }],
    ['a null reservation', { replayed: false, reservation: null }],
    // Only a replay may leave the reservation out; a present one names its
    // state, and never another offer or term than the one sent.
    ['no reservation on a fresh request', { replayed: false }],
    ['a reservation without its state', { replayed: false, reservation: { id: 'res1' } }],
    ['a reservation of another offer', { replayed: false, reservation: { id: 'res1', state: 'pending', offer_id: 'off2' } }],
    ['a reservation of another term', { replayed: false, reservation: { id: 'res1', state: 'pending', days: 7 } }],
  ])('reserve: a 2xx with %s is unknown: never confirmed, the key and its hold stay', async (_n, data) => {
    onFetch((c) => (c.method === 'POST' ? env(data) : env([])));
    const p = createPurchase(offerRow(), '30');
    p.confirm(true);
    await settle();
    expect(posts().filter((c) => path(c.url) === '/offers/off1/reserve')).toHaveLength(1);
    expect(p.snapshot().state).not.toBe('confirmed');
    expect(p.snapshot().receipt).toBeNull();
    expect(JSON.parse(localStorage.getItem('hub_market_pending') as string)).toHaveLength(1);
  });
  it('reserve: a 201 with the full reservation of this offer and term is confirmed', async () => {
    onFetch(() => env({ replayed: false, reservation: { id: 'res1', state: 'pending', offer_id: 'off1', days: 30 } }));
    const p = createPurchase(offerRow(), '30');
    p.confirm(true);
    await settle();
    expect(p.snapshot().state).toBe('confirmed');
    expect(localStorage.getItem('hub_market_pending')).toBeNull();
  });
  it.each([
    ['an empty body', {}],
    ['a rental that is not an object', { rental: 'r1' }],
    // The rental names itself, and never another server than the one rented.
    ['a rental without its id', { rental: {} }],
    ['a rental of another server', { rental: { id: 'r1', server_id: 'st2' } }],
    // The API always names the rented server, so a rental naming none proves nothing.
    ['a rental naming no server', { rental: { id: 'r1' } }],
  ])('rent: a 2xx with %s is unknown at once (no read settles it): the hold stays and holds the next Confirm', async (_n, data) => {
    onFetch((c) => (c.method === 'POST' ? env(data) : env([])));
    const p = createPurchase(stockRow(), '30');
    p.confirm(true);
    await settle();
    expect(posts()).toHaveLength(1);
    expect(p.snapshot().state).toBe('indeterminate');
    expect(p.snapshot().receipt).toBeNull();
    expect(rentPendingFor(capture()).map((r) => r.server_id)).toEqual(['st1']);
    expect(createPurchase(stockRow(), '30').confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
  });
  it('rent: a 201 with the rental of this server is confirmed and ends its hold', async () => {
    onFetch(() => env({ rental: { id: 'r1', server_id: 'st1', status: 'active' }, transaction: { id: 't1' } }));
    const p = createPurchase(stockRow(), '30');
    p.confirm(true);
    await settle();
    expect(p.snapshot().state).toBe('confirmed');
    expect(rentPendingFor(capture())).toEqual([]);
  });
  it('a definitive refusal fills the failure and drops the key; INSUFFICIENT_BALANCE carries the amounts', async () => {
    onFetch(() => ({ status: 402, body: { error: 'INSUFFICIENT_BALANCE', data: { required_cents: 1200, available_cents: 5 } } }));
    const p = createPurchase(offerRow(), '30');
    p.confirm(true);
    await settle();
    const s = p.snapshot();
    expect(s.state).toBe('failed');
    expect(s.failure).toMatchObject({ code: 'INSUFFICIENT_BALANCE', requiredCents: 1200, availableCents: 5 });
    expect(localStorage.getItem('hub_market_pending')).toBeNull();
  });
  it('a server re-quote is carried in the failure', async () => {
    onFetch(() => ({ status: 409, body: { error: 'CHARGE_EXCEEDS_MAX', data: { total_cents: 1500, rental_cents: 1300, setup_fee_cents: 200 } } }));
    const p = createPurchase(offerRow(), '30');
    p.confirm(true);
    await settle();
    expect(p.snapshot().failure).toMatchObject({ requote: true, requoteCents: 1500 });
  });
  it('a stored unresolved entry refuses a fresh Confirm of that offer; an unreadable store refuses too', async () => {
    onFetch(() => env({}));
    localStorage.setItem('hub_market_pending', JSON.stringify([{ user_id: UID, offer_id: 'off1', days: '30', ceiling: 1200, key: 'k'.repeat(20), at: 1 }]));
    const p = createPurchase(offerRow(), '30');
    expect(p.confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    expect(marketPendingFor(capture())).toHaveLength(1);
    marketPendingDrop('k'.repeat(20));
    await settle(); // the drop runs under the pending-store lock (navigator.locks: granted asynchronously)
    expect(marketPendingFor(capture())).toHaveLength(0);
    const spy = breakKey('getItem', 'hub_market_pending', 'throw');
    expect(createPurchase(offerRow(), '30').confirm(true)).toEqual({ ok: false, reason: 'storage' });
    spy.mockRestore();
    expect(calls).toHaveLength(0);
  });
  it('marketPendingKept proves "none kept" only from a store it read: kept, none, unreadable, corrupt; by the dialog owner', () => {
    const entry = { user_id: UID, offer_id: 'off1', days: '30', ceiling: 1200, key: 'k'.repeat(20), at: 1 };
    expect(marketPendingKept(UID, 'off1')).toBe(false);
    localStorage.setItem('hub_market_pending', JSON.stringify([entry]));
    expect(marketPendingKept(UID, 'off1')).toBe(true);
    expect(marketPendingKept(UID, 'off2')).toBe(false);
    localStorage.setItem('hub_market_pending', JSON.stringify([{ ...entry, user_id: 'someone-else' }]));
    expect(marketPendingKept(UID, 'off1')).toBe(false);
    localStorage.setItem('hub_market_pending', '{not json');
    expect(marketPendingKept(UID, 'off1')).toBeNull();
    localStorage.setItem('hub_market_pending', ''); // a stored empty string is not a missing key
    expect(marketPendingKept(UID, 'off1')).toBeNull();
    expect(marketPendingFor(capture())).toEqual([]); // where marketPendingFor reads the same store as empty
    localStorage.setItem('hub_market_pending', JSON.stringify({ off1: entry }));
    expect(marketPendingKept(UID, 'off1')).toBeNull();
    localStorage.removeItem('hub_market_pending');
    const spy = breakKey('getItem', 'hub_market_pending', 'throw');
    expect(marketPendingKept(UID, 'off1')).toBeNull();
    spy.mockRestore();
    expect(marketPendingKept(UID, null)).toBeNull();
    expect(marketPendingKept(null, 'off1')).toBeNull();
    // By the owner it is asked for (the dialog's), whoever is shown: another user's entry is that user's.
    localStorage.setItem('hub_market_pending', JSON.stringify([{ ...entry, user_id: 'someone-else' }]));
    expect(marketPendingKept('someone-else', 'off1')).toBe(true);
  });
  it('marketPendingKept: a damaged row that could be this owner\'s intent for this offer proves nothing', () => {
    const entry = { user_id: UID, offer_id: 'off1', days: '30', ceiling: 1200, key: 'k'.repeat(20), at: 1 };
    const put = (rows: unknown[]) => localStorage.setItem('hub_market_pending', JSON.stringify(rows));
    // Same offer, same owner, a field validMk refuses (a short key, a ceiling that is not a count): unknown.
    put([{ ...entry, key: 'short' }]);
    expect(marketPendingKept(UID, 'off1')).toBeNull();
    put([{ ...entry, ceiling: 'lots' }]);
    expect(marketPendingKept(UID, 'off1')).toBeNull();
    // A row naming no offer or owner at all (null, a bare string, a damaged offer id): could be this one.
    put([null]);
    expect(marketPendingKept(UID, 'off1')).toBeNull();
    put(['off1']);
    expect(marketPendingKept(UID, 'off1')).toBeNull();
    put([{ ...entry, offer_id: 42 }]);
    expect(marketPendingKept(UID, 'off1')).toBeNull();
    // A damaged row that plainly names another offer or another owner says nothing about this one.
    put([{ ...entry, offer_id: 'off2', key: 'short' }]);
    expect(marketPendingKept(UID, 'off1')).toBe(false);
    put([{ ...entry, user_id: 'someone-else', key: 'short' }]);
    expect(marketPendingKept(UID, 'off1')).toBe(false);
    // A valid kept entry is kept, whatever damage sits beside it.
    put([{ ...entry, key: 'short' }, entry]);
    expect(marketPendingKept(UID, 'off1')).toBe(true);
    put([null, entry]);
    expect(marketPendingKept(UID, 'off1')).toBe(true);
  });
  it('storage that cannot keep the entry refuses the purchase unsent', async () => {
    const spy = breakKey('setItem', 'hub_market_pending', 'throw');
    const p = createPurchase(offerRow(), '30');
    p.confirm(true);
    await settle();
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'storageFailed' });
    spy.mockRestore();
    expect(calls).toHaveLength(0);
  });
  it('C9: reserve outcome unknown: one advisory read, then it stays unknown and nothing is sent again', async () => {
    let n = 0;
    onFetch((c) => {
      if (c.method === 'POST') { n++; return n === 1 ? { status: 500, body: {} } : env({ id: 'res1', replayed: true }); }
      return env([]);
    });
    const p = createPurchase(offerRow(), '30');
    p.confirm(true);
    await settle(60);
    expect(posts()).toHaveLength(1);
    expect(p.snapshot().state).toBe('indeterminate');
    expect(p.snapshot().receipt ?? null).toBeNull();
    expect(localStorage.getItem('hub_market_pending')).not.toBeNull();
    // Only the confirmed resend sends, with the same key.
    expect(p.retry()).toBe(true);
    await settle(60);
    const ps = posts();
    expect(ps).toHaveLength(2);
    expect(ps[1]!.body.idempotency_key).toBe(ps[0]!.body.idempotency_key);
  });
  it('C9: a failed advisory read sends nothing again either', async () => {
    onFetch((c) => (c.method === 'POST' ? { status: 500, body: {} } : { status: 503, body: {} }));
    const p = createPurchase(offerRow(), '30');
    p.confirm(true);
    await settle(60);
    expect(posts()).toHaveLength(1);
    expect(p.snapshot().state).toBe('indeterminate');
    expect(localStorage.getItem('hub_market_pending')).not.toBeNull();
  });
  it('a banned account is never written to again', async () => {
    onFetch((c) => (c.method === 'POST' ? { status: 500, body: {} } : BAN));
    const p = createPurchase(offerRow(), '30');
    p.confirm(true);
    await settle(60);
    expect(posts()).toHaveLength(1);
    expect(p.snapshot().banned).toBe(true);
    expect(localStorage.getItem('hub_market_pending')).not.toBeNull();
  });
  it('recover starts at outcome unknown with the stored request and Retry replays it byte for byte', async () => {
    const entry = { user_id: UID, offer_id: 'off1', days: '30', ceiling: 1200, key: 'r'.repeat(20), at: 5 };
    localStorage.setItem('hub_market_pending', JSON.stringify([entry]));
    onFetch(() => env({ id: 'res1', replayed: true }));
    const p = createPurchase(offerRow(), '30', { recover: marketPendingFor(capture())[0] });
    expect(p.snapshot().state).toBe('indeterminate');
    expect(p.retry()).toBe(true);
    await settle();
    expect(posts()[0]!.body).toEqual({ days: 30, max_charge_cents: 1200, idempotency_key: entry.key });
    expect(localStorage.getItem('hub_market_pending')).toBeNull();
  });
  it('rent outcome unknown reads /rentals: a matching rental is evidence only (stays unknown, no receipt)', async () => {
    vi.useFakeTimers();
    onFetch((c) => (c.method === 'POST' ? { status: 500, body: {} } : env([{ status: 'active', server_id: 'st1' }])));
    const p = createPurchase(stockRow(), '30');
    p.confirm(true);
    await vi.advanceTimersByTimeAsync(500);
    // A listed rental may be an earlier one; only the POST's own answer confirms.
    expect(p.snapshot().state).toBe('indeterminate');
    expect(p.snapshot().advisory).toBe(true);
    expect(p.snapshot().receipt).toBeNull();
  });
  it('rent reads that find nothing end not-found; Retry returns to a fresh confirm', async () => {
    vi.useFakeTimers();
    onFetch((c) => (c.method === 'POST' ? { status: 500, body: {} } : env([])));
    const p = createPurchase(stockRow(), '30');
    p.confirm(true);
    await vi.advanceTimersByTimeAsync(20000);
    expect(p.snapshot().state).toBe('not-found');
    expect(p.retryRent()).toBe(true);
    expect(p.snapshot().state).toBe('idle');
  });
  it('an owner that left before the answer: the answer is never shown, no ledger read goes out', async () => {
    const d = deferred<void>();
    onFetch(async (c) => { if (c.method === 'POST') await d.p; return env({ id: 'x' }); });
    const p = createPurchase(stockRow(), '30');
    p.confirm(true);
    await settle(3);
    setIdentity({ id: OTHER, banned: false });
    d.res();
    await settle(10);
    expect(p.snapshot().receipt).toBeNull();
    expect(p.snapshot().state).not.toBe('confirmed');
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(0);
  });
  it('a posting budget expiry aborts the dispatch: an unsent request never leaves', async () => {
    vi.useFakeTimers();
    budgets.postingMs = 50;
    onFetch(async () => ({ status: 200, body: { data: {} }, delayMs: 5000 }));
    const p = createPurchase(stockRow(), '30');
    p.confirm(true);
    await vi.advanceTimersByTimeAsync(60);
    expect(['reconciling', 'indeterminate', 'not-found']).toContain(p.snapshot().state);
  });
  it('dispose stops onChange and timers', async () => {
    const o = vi.fn();
    onFetch(() => env({ id: 'x' }));
    const p = createPurchase(stockRow(), '30', { onChange: o });
    p.confirm(true);
    p.dispose();
    o.mockClear();
    await settle();
    expect(o).not.toHaveBeenCalled();
  });
  it('a row without an id is unquotable', () => {
    const r = { ...stockRow(), id: null };
    expect(createPurchase(r, '30').confirm(true)).toEqual({ ok: false, reason: 'unquotable' });
  });
});

describe('wallet', () => {
  it('balances and availability', async () => {
    onFetch((c) => (c.url.includes('balances')
      ? env({ general_balance: '5.00', ai_usage_status: 'live', ai_remaining: '1.00' })
      : env({ card: { enabled: true, min_usd: 10 }, crypto: { enabled: true }, ai_credit_fee_bps: 250 })));
    expect(await balances(capture())).toEqual({ general: '5.00', aiRemaining: '1.00', aiLive: true });
    const a = await availability(capture());
    expect(a.feeBps).toBe(250);
    expect(a.methods.map((m) => [m.key, m.min, m.max])).toEqual([['card', 10, 10000], ['crypto', 5, 10000]]);
  });
  it('transfer: bad amount, fee binding, reused key, fee changed', async () => {
    await expect(transfer(shownOwner(capture()), capture(), 'x', 0, 'k')).rejects.toMatchObject({ code: 'BAD_AMOUNT' });
    onFetch(() => env({ general_balance: '1.00' }));
    const r = await transfer(shownOwner(capture()), capture(), '5', 250, 'k'.repeat(20));
    expect(r.ok).toBe(true);
    expect(posts()[0]!.body).toMatchObject({ amount: '5.00', expected_fee_bps: 250 });
    onFetch(() => ({ status: 409, body: { error: 'TRANSFER_IDEMPOTENCY_KEY_REUSED' } }));
    await expect(transfer(shownOwner(capture()), capture(), '5', 0, 'k')).rejects.toMatchObject({ code: 'reused' });
    onFetch(() => ({ status: 409, body: { error: 'TRANSFER_FEE_CHANGED' } }));
    await expect(transfer(shownOwner(capture()), capture(), '5', 0, 'k')).rejects.toMatchObject({ code: 'fee_changed' });
  });
  const card = { key: 'card' as const, path: '/wallet/payments/card/checkout', urlField: 'checkout_url', min: 5, max: 100 };
  it('top-up follows only the method own https host', async () => {
    onFetch(() => env({ checkout_url: 'https://checkout.stripe.com/c/x' }));
    expect(await topup(shownOwner(capture()), capture(), card, '10', 'k')).toEqual({ url: 'https://checkout.stripe.com/c/x' });
    onFetch(() => env({ checkout_url: 'https://evil.example/x' }));
    await expect(topup(shownOwner(capture()), capture(), card, '10', 'k')).rejects.toMatchObject({ code: 'BAD_CHECKOUT_URL' });
    await expect(topup(shownOwner(capture()), capture(), card, '1000', 'k')).rejects.toMatchObject({ code: 'OUT_OF_RANGE' });
    await expect(topup(shownOwner(capture()), capture(), { ...card, path: '/wallet/other' }, '10', 'k')).rejects.toMatchObject({ code: 'ROUTE_UNKNOWN' });
  });
  it('verifyReturn: unverified on a bad id, received, polling to processing', async () => {
    expect(await verifyReturn(capture(), 'zz', 'card', null)).toEqual({ state: 'unverified' });
    const id = 'a'.repeat(24);
    onFetch(() => env({ status: 'completed', credited_at: 'x' }));
    expect(await verifyReturn(capture(), id, 'card', null)).toEqual({ state: 'received' });
    expect(path(calls[0]!.url)).toBe('/wallet/payments/card/intents/' + id);
    vi.useFakeTimers();
    onFetch(() => env({ status: 'pending' }));
    const p = verifyReturn(capture(), id, 'crypto', 'cancelled');
    await vi.advanceTimersByTimeAsync(30000);
    // The return URL is only a trigger: a still-pending intent is never reported as cancelled.
    expect(await p).toEqual({ state: 'processing' });
    expect(calls.filter((c) => c.url.includes('/crypto/intents/'))).toHaveLength(10);
  });
  it('verifyReturn: cancelled only from the authoritative intent, never from the return URL alone', async () => {
    const id = 'd'.repeat(24);
    onFetch(() => env({ status: 'cancelled' }));
    expect(await verifyReturn(capture(), id, 'card', 'success')).toEqual({ state: 'cancelled' });
    vi.useFakeTimers();
    onFetch(() => env({ status: 'processing' }));
    const p = verifyReturn(capture(), id, 'card', 'cancelled');
    await vi.advanceTimersByTimeAsync(30000);
    expect(await p).toEqual({ state: 'processing' });
  });
  it('verifyReturn: under review, 404 unverified', async () => {
    const id = 'b'.repeat(24);
    onFetch(() => env({ status: 'under_review' }));
    expect(await verifyReturn(capture(), id, 'card', null)).toEqual({ state: 'review', credited: false });
    onFetch(() => ({ status: 404, body: { error: 'NOT_FOUND' } }));
    expect(await verifyReturn(capture(), id, 'card', null)).toEqual({ state: 'unverified' });
  });
  it('the stashed return is kept while valid and dropped when garbage or old', () => {
    const id = 'c'.repeat(24);
    sessionStorage.setItem('hub_topup_return', JSON.stringify({ payment: id, provider: 'crypto', at: Date.now() }));
    expect(readTopupReturn()).toMatchObject({ payment: id, provider: 'crypto' });
    sessionStorage.setItem('hub_topup_return', JSON.stringify({ payment: id, at: 1 }));
    expect(readTopupReturn()).toBeNull();
    expect(sessionStorage.getItem('hub_topup_return')).toBeNull();
  });
  it('github bonus: a read failure renders nothing; a claim transport failure is retry', async () => {
    onFetch(() => ({ status: 500, body: {} }));
    expect(await githubBonus(capture())).toEqual({ enabled: false });
    const r = await claimBonus(shownOwner(capture()), capture());
    expect(r.result).toBe('retry');
    onFetch(() => env({ result: 'granted' }));
    expect(await claimBonus(shownOwner(capture()), capture())).toMatchObject({ result: 'granted' });
    expect(posts().pop()!.body).toEqual({});
  });
});

describe('top-up flow', () => {
  const avail = env({ card: { enabled: true }, crypto: { enabled: true } });
  it('new key on method switch and on another amount; same key for the same amount', async () => {
    // A definite refusal (a pending top-up refuses every submit but Check again).
    onFetch((c) => (c.method === 'GET' ? avail : { status: 400, body: { error: 'AMOUNT_INVALID' } }));
    const t = createTopUp();
    await t.load();
    expect(t.snapshot().phase).toBe('ready');
    const k1 = t.snapshot().key;
    await t.submit('10');
    await t.submit('10');
    expect(posts().map((c) => c.body.idempotency_key)).toEqual([k1, k1]);
    await t.submit('20');
    expect(posts()[2]!.body.idempotency_key).not.toBe(k1);
    const k3 = t.snapshot().key;
    t.select('crypto');
    expect(t.snapshot().key).not.toBe(k3);
  });
  it('PAYMENT_IDEMPOTENCY_KEY_REUSED takes a new key; success carries the url', async () => {
    onFetch((c) => (c.method === 'GET' ? avail : { status: 409, body: { error: 'PAYMENT_IDEMPOTENCY_KEY_REUSED' } }));
    const t = createTopUp();
    await t.load();
    const k = t.snapshot().key;
    const r = await t.submit('10');
    expect(r.ok).toBe(false);
    expect(t.snapshot().key).not.toBe(k);
    onFetch(() => env({ checkout_url: 'https://checkout.stripe.com/x' }));
    expect(await t.submit('10')).toEqual({ ok: true, url: 'https://checkout.stripe.com/x' });
  });
  it('no displayed identity: phase account, nothing is read', async () => {
    boot({ realm: R1, identity: false });
    const t = createTopUp();
    await t.load();
    expect(t.snapshot().phase).toBe('account');
    expect(calls).toHaveLength(0);
  });
});

const sub = (id: string, extra: Record<string, unknown> = {}) => ({ id, state: 'active', ...extra });
describe('subscriptions and plans', () => {
  it('pages, dedupes and reports a partial list at the cap', async () => {
    SUBS.page = 2;
    onFetch((c) => {
      const off = Number(/offset=(\d+)/.exec(c.url)![1]);
      return env([sub('s' + off), sub('s' + (off + 1))], { total: 10 });
    });
    const r = await loadSubscriptions(capture(), 2);
    expect(r.subs).toHaveLength(4);
    expect(r.partial).toEqual({ shown: 4, total: 10 });
    expect(calls).toHaveLength(2);
  });
  it('malformed rows are skipped, a non-list is BAD_LIST', async () => {
    onFetch(() => env([sub('a'), { id: 3 }, sub('a')], { total: 3 }));
    expect((await loadSubscriptions(capture())).subs).toHaveLength(1);
    onFetch(() => env('x'));
    await expect(loadSubscriptions(capture())).rejects.toMatchObject({ code: 'BAD_LIST' });
  });
  it('the whole list is bounded: the deadline aborts a page not yet out', async () => {
    vi.useFakeTimers();
    bounds.list = 100;
    onFetch(async () => ({ status: 200, body: { data: [sub('a')], total: 99 }, delayMs: 60 }));
    SUBS.page = 1;
    const p = loadSubscriptions(capture());
    const out = p.then(() => 'ok', (e: { code?: string }) => e.code);
    await vi.advanceTimersByTimeAsync(300);
    expect(await out).toBe('OP_DEADLINE');
  });
  it('an owner change during the list drops it as superseded', async () => {
    const d = deferred<void>();
    onFetch(async () => { await d.p; return env([sub('a')]); });
    const p = loadSubscriptions(capture());
    await settle(3);
    setIdentity({ id: OTHER, banned: false });
    d.res();
    await expect(p).rejects.toMatchObject({ superseded: true });
  });
  it('getSubscription: valid, malformed and 404', async () => {
    onFetch(() => env(sub('s1')));
    expect(await getSubscription(capture(), 's1')).toMatchObject({ id: 's1' });
    expect(path(calls[0]!.url)).toBe('/subserver-subscriptions/s1');
    onFetch(() => env({ nope: 1 }));
    expect(await getSubscription(capture(), 's1')).toBeNull();
    onFetch(() => ({ status: 404, body: { error: 'NOT_FOUND' } }));
    expect(await getSubscription(capture(), 's1')).toBeNull();
  });
  it('plans and the chip', async () => {
    onFetch(() => env({ plans: [{ id: 'p1', family_id: FAM, title: 'Pro' }] }));
    const idx = await plans(capture());
    expect(path(calls[0]!.url)).toMatch(/^\/subserver-plans\?locale=en$/);
    expect(planChip({ server: { id: 'sv', paid_subserver: true } }, [sub('s', { server_id: 'sv', plan_id: 'p1' })], idx).kind).toBe('paid');
    expect(planChip({ server: { is_free: false } }, [], idx).kind).toBe('bare_metal');
    expect(planChip({ server: {} }, [], idx).kind).toBe('free');
    expect(planChip({}, [], idx).kind).toBeNull();
  });
  it('a malformed plans envelope reads as no plans', async () => {
    onFetch(() => env({ plans: 'x' }));
    expect(await plans(capture())).toEqual(expect.anything());
  });
  it('auto-renew goes as the owner and is refused unsent without one', async () => {
    onFetch(() => env({}));
    await setAutoRenew(shownOwner(capture()), capture(), { id: 's1' }, true);
    expect(posts()[0]).toMatchObject({ method: 'PUT', body: { auto_renew: true } });
    await expect(setAutoRenew(null, capture(), { id: 's1' }, true)).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED', notSent: true });
  });
});

// The route's own answer to the money request made (a buy's subscription is s1).
const OK = (c: Call) => accepted(c, { buySub: 's1', state: 'active' });
const FAM = 'abcdef012345678901234567';
const buyTarget = { plan: { id: 'p1', family_id: FAM }, title: 'Pro' };
const router = (over: Record<string, (c: Call) => unknown> = {}) => (c: Call) => {
  const p = path(c.url).split('?')[0]!;
  const k = c.method + ' ' + p;
  if (over[k]) return over[k]!(c) as never;
  if (k === 'GET /users/auth/me') return env({ id: UID });
  if (c.method === 'GET' && /quote$/.test(p)) return env({ charge_cents: 900, price_cents_per_month: 900 });
  return env(OK(c));
};
describe('attempts', () => {
  beforeEach(() => fakeLocks());
  it('buy: quote, identity check precedes the POST, key stored first, definitive drops it', async () => {
    onFetch(router());
    const a = createAttempt('buy', buyTarget);
    expect(await a.quote()).toMatchObject({ charge_cents: 900 });
    const r = await a.confirm(true);
    expect(r).toMatchObject({ ok: true });
    const order = calls.map((c) => c.method + ' ' + path(c.url).split('?')[0]);
    expect(order.indexOf('GET /users/auth/me')).toBeLessThan(order.indexOf('POST /subserver-subscriptions'));
    const body = posts()[0]!.body;
    expect(body).toMatchObject({ plan_id: 'p1', max_charge_cents: 900 });
    expect(a.snapshot().phase).toBe('done');
    await settle();
    expect(localStorage.getItem('hub_money_pending')).toBeNull();
  });
  it('consent and unquoted are refused unsent', async () => {
    onFetch(router());
    const a = createAttempt('buy', buyTarget);
    expect(await a.confirm(false)).toEqual({ ok: false, reason: 'consent' });
    expect(await a.confirm(true)).toEqual({ ok: false, reason: 'unquoted' });
    expect(calls).toHaveLength(0);
  });
  it('an unknown outcome keeps the key and the next Confirm resends exactly it', async () => {
    let n = 0;
    onFetch(router({ 'POST /subserver-subscriptions': (c) => (++n === 1 ? { status: 500, body: {} } : env(OK(c))) }));
    const a = createAttempt('buy', buyTarget);
    await a.quote();
    const r1 = await a.confirm(true);
    expect(r1).toMatchObject({ ok: false, reason: 'unknown' });
    expect(a.snapshot().phase).toBe('unknown');
    expect(localStorage.getItem('hub_money_pending')).not.toBeNull();
    const r2 = await a.confirm(true);
    expect(r2).toMatchObject({ ok: true });
    const ps = posts();
    expect(ps[1]!.body).toEqual(ps[0]!.body);
  });
  it('a buy refused IDEMPOTENCY_INTENT_MISMATCH stays held as unknown, kind intent, never definitive', async () => {
    onFetch(router({ 'POST /subserver-subscriptions': () => ({ status: 409, body: { error: 'IDEMPOTENCY_INTENT_MISMATCH' } }) }));
    const a = createAttempt('buy', buyTarget);
    await a.quote();
    const r = await a.confirm(true) as { reason: string; kind?: string; definitive?: boolean };
    expect(r).toMatchObject({ ok: false, reason: 'unknown', kind: 'intent' });
    expect(r.definitive).toBeUndefined();
    expect(a.snapshot()).toMatchObject({ phase: 'unknown', pending: true, error: { kind: 'intent' } });
    await settle();
    expect(localStorage.getItem('hub_money_pending')).not.toBeNull();
  });
  it('a definitive refusal drops the key; a non-definitive 4xx keeps it', async () => {
    onFetch(router({ 'POST /subserver-subscriptions': () => ({ status: 402, body: { error: 'INSUFFICIENT_BALANCE' } }) }));
    const a = createAttempt('buy', buyTarget);
    await a.quote();
    expect(await a.confirm(true)).toMatchObject({ ok: false, reason: 'refused', definitive: true });
    await settle();
    expect(localStorage.getItem('hub_money_pending')).toBeNull();
    onFetch(router({ 'POST /subserver-subscriptions': () => ({ status: 404, body: { error: 'X' } }) }));
    const b = createAttempt('buy', buyTarget);
    await b.quote();
    const r = await b.confirm(true);
    expect(r).toMatchObject({ ok: false });
    expect(localStorage.getItem('hub_money_pending')).not.toBeNull();
  });
  it('another account at the identity check sends nothing', async () => {
    onFetch(router({ 'GET /users/auth/me': () => env({ id: OTHER }) }));
    const a = createAttempt('buy', buyTarget);
    await a.quote();
    expect(await a.confirm(true)).toMatchObject({ ok: false, reason: 'account', notSent: true });
    expect(posts()).toHaveLength(0);
    expect(a.snapshot().notice).toBe('accountChanged');
  });
  it('a failing identity check is auth/check and nothing is sent', async () => {
    onFetch(router({ 'GET /users/auth/me': () => ({ status: 500, body: {} }) }));
    const a = createAttempt('pay', { sub: { id: 's1' } });
    await a.quote();
    expect(await a.confirm(true)).toMatchObject({ ok: false, reason: 'check', notSent: true });
    expect(posts()).toHaveLength(0);
  });
  it('a store that cannot keep the entry sends nothing', async () => {
    onFetch(router());
    const a = createAttempt('buy', buyTarget);
    await a.quote();
    const spy = breakKey('setItem', 'hub_money_pending', 'drop');
    expect(await a.confirm(true)).toMatchObject({ ok: false, reason: 'store' });
    spy.mockRestore();
    expect(posts()).toHaveLength(0);
  });
  it('a retained attempt is shown and resent unchanged, even after a new dialog', async () => {
    onFetch(router({ 'POST /subserver-subscriptions': () => ({ status: 500, body: {} }) }));
    const a = createAttempt('buy', buyTarget);
    await a.quote();
    await a.confirm(true);
    const sent = posts()[0]!.body;
    onFetch(router({ 'GET /subserver-subscriptions/quote': () => env({ charge_cents: 1234, price_cents_per_month: 1234 }) }));
    const b = createAttempt('buy', buyTarget);
    expect(b.snapshot().pending).toBe(true);
    await b.quote();
    await b.confirm(true);
    expect(posts()[1]!.body).toEqual(sent);
  });
  it('pay: wire and quote action', async () => {
    onFetch(router());
    const a = createAttempt('pay', { sub: { id: 's1' } });
    await a.quote();
    expect(path(calls[0]!.url)).toBe('/subserver-subscriptions/s1/quote?action=pay');
    await a.confirm(true);
    expect(path(posts()[0]!.url)).toBe('/subserver-subscriptions/s1/pay');
    expect(Object.keys(posts()[0]!.body).sort()).toEqual(['idempotency_key', 'max_charge_cents']);
  });
  // A listed refusal that answers after the attempt's context died is pending from api()
  // (the send may repeat an earlier one); it settles nothing: unknown, the key kept, never "definitive".
  it.each([
    ['upgrade', { sub: { id: 's1' }, plan: { id: 'p2' } }, 'POST /subserver-subscriptions/s1/upgrade', 'PLAN_CHANGE_NOT_UPGRADE'],
    ['buy', buyTarget, 'POST /subserver-subscriptions', 'CHARGE_EXCEEDS_MAX'],
  ] as const)('%s: a definite 409 answering after a realm switch is not definitive (key kept)', async (kind, target, route, code) => {
    onFetch(router());
    const a = createAttempt(kind, target as never);
    await a.quote();
    onFetch(router({ [route]: () => { bump('switch'); return { status: 409, body: { error: code } }; } }));
    const r = await a.confirm(true);
    expect(r).not.toMatchObject({ definitive: true });
    expect(a.snapshot().key).not.toBeNull();
  });
  // A kept key whose live resend answers a recorded charge refusal is settled by it (the server
  // replays the operation if one ran under the key, so the refusal proves none did); a late one stays unknown.
  it.each([
    ['upgrade', { sub: { id: 's1' }, plan: { id: 'p2' } }, 'POST /subserver-subscriptions/s1/upgrade'],
    ['buy', buyTarget, 'POST /subserver-subscriptions'],
  ] as const)('%s: a kept key answered CHARGE_EXCEEDS_MAX live on resend is released; answered late it is kept', async (kind, target, route) => {
    onFetch(router({ [route]: () => ({ status: 500, body: {} }) }));
    const a = createAttempt(kind, target as never);
    await a.quote();
    expect(await a.confirm(true)).toMatchObject({ reason: 'unknown' });
    onFetch(router({ [route]: () => { bump('switch'); return { status: 409, body: { error: 'CHARGE_EXCEEDS_MAX' } }; } }));
    expect(await a.confirm(true)).not.toMatchObject({ definitive: true });
    expect(a.snapshot().key).not.toBeNull();
    const b = createAttempt(kind, target as never);
    await b.quote();
    expect(b.snapshot().key).not.toBeNull();
    onFetch(router({ [route]: () => ({ status: 409, body: { error: 'CHARGE_EXCEEDS_MAX' } }) }));
    expect(await b.confirm(true)).toMatchObject({ definitive: true });
    expect(b.snapshot().key).toBeNull();
  });
  it('upgrade: own key store, wire, definitive list', async () => {
    onFetch(router());
    const a = createAttempt('upgrade', { sub: { id: 's1' }, plan: { id: 'p2' }, title: 'Big' });
    await a.quote();
    expect(path(calls[0]!.url)).toBe('/subserver-subscriptions/s1/quote?action=upgrade&plan_id=p2');
    let stored: unknown = null;
    onFetch((c) => { if (c.method === 'POST') stored = localStorage.getItem('hub_money_upgrade'); return router()(c); });
    await a.confirm(true);
    expect(JSON.parse(stored as string)[0]).toMatchObject({ sub_id: 's1', plan_id: 'p2', user_id: UID });
    expect(posts()[0]!.body).toMatchObject({ plan_id: 'p2', max_charge_cents: 900 });
    await settle();
    expect(localStorage.getItem('hub_money_upgrade')).toBeNull();
    onFetch(router({ 'POST /subserver-subscriptions/s1/upgrade': () => ({ status: 409, body: { error: 'PLAN_CHANGE_NOT_UPGRADE' } }) }));
    const b = createAttempt('upgrade', { sub: { id: 's1' }, plan: { id: 'p2' } });
    await b.quote();
    expect(await b.confirm(true)).toMatchObject({ definitive: true });
    onFetch(router({ 'POST /subserver-subscriptions/s1/upgrade': () => ({ status: 500, body: {} }) }));
    const c = createAttempt('upgrade', { sub: { id: 's1' }, plan: { id: 'p2' } });
    await c.quote();
    expect(await c.confirm(true)).toMatchObject({ reason: 'unknown' });
    expect(pendingUpgrade(UID, 's1')).toMatchObject({ plan_id: 'p2' });
    expect(pendingUpgrade(OTHER, 's1')).toBeNull();
    // Every retained upgrade of the shown user, newest first; another user's never.
    expect(pendingUpgrades(UID).map((e) => e.sub_id)).toEqual(['s1']);
    expect(pendingUpgrades(OTHER)).toEqual([]);
    expect(pendingUpgrades(null)).toEqual([]);
  });
  it('a 409 on the resend of a kept request never settles it (unknown, the key and the hold retained)', async () => {
    // An ambiguous first POST: the upgrade may have run (and changed the plan, so the same request now reads "not an upgrade").
    onFetch(router({ 'POST /subserver-subscriptions/s1/upgrade': () => ({ status: 500, body: {} }) }));
    const a = createAttempt('upgrade', { sub: { id: 's1' }, plan: { id: 'p2' } });
    await a.quote();
    const first = await a.confirm(true);
    expect(first).toMatchObject({ reason: 'unknown' });
    const key = a.snapshot().key;
    onFetch(router({ 'POST /subserver-subscriptions/s1/upgrade': () => ({ status: 409, body: { error: 'PLAN_CHANGE_NOT_UPGRADE' } }) }));
    const again = await a.confirm(true);
    expect(again).toMatchObject({ ok: false, reason: 'unknown', key });
    expect(again).not.toMatchObject({ definitive: true });
    expect(posts().at(-1)!.body).toMatchObject({ idempotency_key: key });
    expect(a.snapshot()).toMatchObject({ phase: 'unknown', key, pending: true });
    await settle();
    expect(pendingUpgrade(UID, 's1')).toMatchObject({ key, plan_id: 'p2' });
    // A later attempt for the same target still adopts it: nothing was released.
    const b = createAttempt('upgrade', { sub: { id: 's1' }, plan: { id: 'p2' } });
    expect(b.snapshot()).toMatchObject({ pending: true, key });
    // Same for a kept buy: a 409 on its resend stays unknown.
    onFetch(router({ 'POST /subserver-subscriptions': () => ({ status: 500, body: {} }) }));
    const c = createAttempt('buy', buyTarget);
    await c.quote();
    expect(await c.confirm(true)).toMatchObject({ reason: 'unknown' });
    onFetch(router({ 'POST /subserver-subscriptions': () => ({ status: 409, body: { error: 'PLAN_NOT_AVAILABLE' } }) }));
    expect(await c.confirm(true)).toMatchObject({ reason: 'unknown' });
    await settle();
    expect(localStorage.getItem('hub_money_pending')).not.toBeNull();
  });
  it('a completed attempt\'s retained entry is gone when confirm answers (no "may have gone through" flash)', async () => {
    onFetch(router());
    const a = createAttempt('upgrade', { sub: { id: 's1' }, plan: { id: 'p2' }, title: 'Big' });
    await a.quote();
    expect(await a.confirm(true)).toMatchObject({ ok: true });
    expect(pendingUpgrades(UID)).toEqual([]);
    expect(localStorage.getItem('hub_money_upgrade')).toBeNull();
  });
  it('a malformed 2xx envelope is outcome unknown with the key kept', async () => {
    onFetch(router({ 'POST /subserver-subscriptions': () => env({ nope: 1 }) }));
    const a = createAttempt('buy', buyTarget);
    await a.quote();
    expect(await a.confirm(true)).toMatchObject({ reason: 'unknown' });
    expect(localStorage.getItem('hub_money_pending')).not.toBeNull();
  });
  it('the operation bound before the POST was handed over: nothing is sent, Confirm works again', async () => {
    vi.useFakeTimers();
    bounds.op = 200;
    onFetch(router({ 'GET /users/auth/me': () => ({ status: 200, body: { data: { id: UID } }, delayMs: 1000 }) }));
    const a = createAttempt('buy', buyTarget);
    const q = a.quote();
    await vi.advanceTimersByTimeAsync(2000);
    await q.catch(() => undefined);
    const p = a.confirm(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(await p).toMatchObject({ ok: false, reason: 'timeout', notSent: true });
    expect(posts()).toHaveLength(0);
    expect(a.snapshot().phase).toBe('review');
  });
  it('a bad quote is BAD_QUOTE; a resumed attempt clears the top-up marker once quoted', async () => {
    onFetch(router({ 'GET /subserver-subscriptions/quote': () => env({ charge_cents: -1 }) }));
    await expect(createAttempt('buy', buyTarget).quote()).rejects.toMatchObject({ code: 'BAD_QUOTE' });
    onFetch(router());
    expect(writeBuyResume(shownOwner(capture()), FAM, 'Pro')).toBe(true);
    await createAttempt('buy', buyTarget, { resumed: true }).quote();
    expect(readBuyResume()).toBeNull();
  });
});

describe('resume markers and intent', () => {
  it('written for the shown owner only, read back for that user, deleted for another', () => {
    const own = shownOwner(capture());
    expect(writeBuyResume(own, FAM, 'Pro')).toBe(true);
    expect(readBuyResume()).toMatchObject({ user: UID });
    setIdentity({ id: OTHER, banned: false });
    expect(readBuyResume()).toBeNull();
    expect(sessionStorage.getItem('hub_buy_resume')).toBeNull();
    expect(writeBuyResume(own, FAM)).toBe(false);
    expect(writePayResume(own, { id: 's1' })).toBe(false);
    clearBuyResume();
  });
  it('consumeIntent reads nothing when none is stashed', () => {
    expect(consumeIntent()).toBeNull();
  });
});

describe('teardown', () => {
  it('the ban latch ends with the account, not with a realm switch', async () => {
    marketLatch.banned = true;
    signIn(OTHER);
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    await settle(5);
    expect(typeof marketBanned()).toBe('boolean');
  });
});

describe('hooks', () => {
  it('useTopUp exposes the machine and re-renders on change', async () => {
    onFetch(() => env({ card: { enabled: true }, crypto: { enabled: false } }));
    const { result, unmount } = renderHook(() => useTopUp());
    expect(result.current.state.phase).toBe('loading');
    await act(async () => { await result.current.machine.load(); });
    expect(result.current.state.phase).toBe('ready');
    unmount();
  });
  it('usePurchase confirms and reflects the snapshot', async () => {
    onFetch(() => env({ rental: { id: 'x', server_id: 'st1' } }));
    const row = stockRow();
    const { result } = renderHook(() => usePurchase(row, '30'));
    await act(async () => { result.current.machine.confirm(true); await settle(); });
    expect(result.current.state.state).toBe('confirmed');
  });
  it('useAttempt runs a buy', async () => {
    fakeLocks();
    onFetch(router());
    const { result } = renderHook(() => useAttempt('buy', buyTarget));
    await act(async () => { await result.current.machine.quote(); await result.current.machine.confirm(true); });
    expect(result.current.state.phase).toBe('done');
  });
});

describe('cross-tab reserve admission and top-up pending', () => {
  it('reserve: a second tab that read a stale empty store is refused inside the lock; one POST only', async () => {
    fakeLocks();
    onFetch((c) => (c.method === 'POST' ? { status: 500, body: {} } : env({})));
    const a = createPurchase(offerRow(), '30');
    a.confirm(true);
    await settle();
    const sentByA = posts().length;
    expect(sentByA).toBeGreaterThan(0);
    const orig = Storage.prototype.getItem;
    let stale = true;
    vi.spyOn(localStorage, 'getItem').mockImplementation(function (this: Storage, k: string) {
      if (k === 'hub_market_pending' && stale) { stale = false; return null; }
      return orig.call(this, k);
    });
    const b = createPurchase(offerRow(), '30');
    b.confirm(true);
    await settle();
    expect(posts()).toHaveLength(sentByA);
    expect(b.snapshot().state).toBe('idle');
    expect(b.snapshot().notice).toBe('unresolvedReserve');
    expect(JSON.parse(localStorage.getItem('hub_market_pending') as string)).toHaveLength(1);
  });
  it('top-up: a lost answer is pending, keeps key, provider and amount, and the confirmed resend sends the same request (Check again only reads)', async () => {
    const avail = env({ card: { enabled: true }, crypto: { enabled: true } });
    onFetch((c) => (c.method === 'GET' ? avail : { status: 500, body: {} }));
    const t = createTopUp();
    await t.load();
    const k = t.snapshot().key;
    const r = await t.submit('10');
    expect(r).toMatchObject({ ok: false, reason: 'pending', key: k, method: 'card', amount: '10.00' });
    expect(t.snapshot().phase).toBe('pending');
    expect(t.snapshot().pending).toEqual({ key: k, method: 'card', amount: '10.00', persisted: true });
    onFetch(() => env({ checkout_url: 'https://checkout.stripe.com/x' }));
    expect(await t.resend(true)).toEqual({ ok: true, url: 'https://checkout.stripe.com/x' });
    expect(posts().pop()!.body).toMatchObject({ idempotency_key: k, amount: '10.00' });
    expect(t.snapshot().pending).toBeNull();
  });
});

describe('the top-up hold says when only this tab remembers it', () => {
  // A first send whose hold storage refuses is never sent (a memory-only hold is gone
  // after a reload or an account switch, and a new key could then be minted beside it).
  it('storage refusing the hold\'s write: the first send is refused storageFailed, nothing is sent or held', async () => {
    const avail = env({ card: { enabled: true }, crypto: { enabled: true } });
    onFetch((c) => (c.method === 'GET' ? avail : { status: 500, body: {} }));
    const set = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string) => { if (k === 'hub.v3.topup_pending') throw new Error('QuotaExceededError'); });
    try {
      const t = createTopUp();
      await t.load();
      const r = await t.submit('10');
      expect(r).toMatchObject({ ok: false, reason: 'storageFailed', error: { notSent: true } });
      expect(posts()).toEqual([]);
      expect(t.snapshot()).toMatchObject({ phase: 'ready', pending: null });
      const u = createTopUp();
      await u.load();
      expect(u.snapshot().pending).toBeNull();
    } finally { set.mockRestore(); }
  });
  it('storage that cannot be read after the hold was stored: pending.persisted is false, and the hold still holds in this tab', async () => {
    const avail = env({ card: { enabled: true }, crypto: { enabled: true } });
    onFetch((c) => (c.method === 'GET' ? avail : { status: 500, body: {} }));
    const t = createTopUp();
    await t.load();
    expect(await t.submit('10')).toMatchObject({ ok: false, reason: 'pending' });
    await settle();
    const get = breakKey('getItem', 'hub.v3.topup_pending', 'throw');
    try {
      const u = createTopUp();
      await u.load();
      expect(u.snapshot()).toMatchObject({ phase: 'pending', pending: { persisted: false } });
    } finally { get.mockRestore(); }
  });
  it('a stored hold another tab resolved (gone from storage) is not restored from this tab\'s memory', async () => {
    const avail = env({ card: { enabled: true }, crypto: { enabled: true } });
    onFetch((c) => (c.method === 'GET' ? avail : { status: 500, body: {} }));
    const t = createTopUp();
    await t.load();
    await t.submit('10');
    expect(t.snapshot().pending).toMatchObject({ persisted: true });
    localStorage.removeItem('hub.v3.topup_pending');
    const u = createTopUp();
    await u.load();
    expect(u.snapshot().phase).not.toBe('pending');
    expect(u.snapshot().pending).toBeNull();
  });
});

describe('market drop under the lock, top-up pending', () => {
  it('marketPendingDrop runs inside the cross-tab pending lock (never between another tab\'s check and write)', async () => {
    let grant!: () => void;
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: (_n: string, fn: () => unknown) => new Promise((res) => { grant = () => res(fn()); }) },
    });
    const k = 'k'.repeat(20);
    localStorage.setItem('hub_market_pending', JSON.stringify([{ user_id: UID, offer_id: 'off1', days: '30', ceiling: 1200, key: k, at: 1 }]));
    const done = marketPendingDrop(k);
    // The lock is held elsewhere: nothing is read or written yet.
    expect(JSON.parse(localStorage.getItem('hub_market_pending') as string)).toHaveLength(1);
    grant();
    await done;
    expect(localStorage.getItem('hub_market_pending')).toBeNull();
  });
  const pendingTopUp = async () => {
    const avail = env({ card: { enabled: true }, crypto: { enabled: true } });
    onFetch((c) => (c.method === 'GET' ? avail : { status: 500, body: {} }));
    const t = createTopUp();
    await t.load();
    const k = t.snapshot().key;
    await t.submit('10');
    expect(t.snapshot().phase).toBe('pending');
    return { t, k };
  };
  it('while a top-up is pending, select() and submit() are refused (no key rotation, nothing sent)', async () => {
    const { t, k } = await pendingTopUp();
    const sent = posts().length;
    expect(t.select('crypto')).toBe(false);
    expect(t.snapshot()).toMatchObject({ method: 'card', key: k, phase: 'pending' });
    expect(await t.submit('20')).toMatchObject({ ok: false, reason: 'busy' });
    expect(posts()).toHaveLength(sent);
    expect(t.snapshot().pending).toEqual({ key: k, method: 'card', amount: '10.00', persisted: true });
  });
  it('a confirmed resend that is refused keeps the pending top-up and its key', async () => {
    const { t, k } = await pendingTopUp();
    onFetch(() => ({ status: 429, body: { error: 'RATE_LIMITED' } }));
    const r = await t.resend(true);
    expect(r.ok).toBe(false);
    expect(t.snapshot().phase).toBe('pending');
    expect(t.snapshot().pending).toEqual({ key: k, method: 'card', amount: '10.00', persisted: true });
    onFetch(() => env({ checkout_url: 'https://checkout.stripe.com/x' }));
    expect(await t.resend(true)).toEqual({ ok: true, url: 'https://checkout.stripe.com/x' });
    expect(posts().pop()!.body).toMatchObject({ idempotency_key: k });
  });
  it('a top-up held by refused replays (OUT_OF_RANGE) stays pending; only a confirmed forget() frees the account', async () => {
    const { t, k } = await pendingTopUp();
    onFetch(() => ({ status: 400, body: { error: 'PAYMENT_AMOUNT_OUT_OF_RANGE' } }));
    // The bounds check runs before the key lookup: the refusal proves nothing about the first request.
    expect(await t.checkAgain()).toMatchObject({ ok: false, reason: 'pending', key: k });
    expect(t.snapshot().phase).toBe('pending');
    // Without the person's confirmation nothing is dropped; nothing is sent either way.
    const sent = posts().length;
    expect(t.forget(false as unknown as true)).toBe(false);
    expect(t.snapshot().pending?.key).toBe(k);
    expect(t.forget(true)).toBe(true);
    expect(posts()).toHaveLength(sent);
    const snap = t.snapshot();
    expect(snap.pending).toBeNull();
    expect(snap.phase).toBe('ready');
    expect(snap.key).not.toBe(k);
    // Forgotten for the account: a new drawer starts fresh, and a new top-up goes out under a new key.
    const u = createTopUp();
    onFetch((c) => (c.method === 'GET' ? env({ card: { enabled: true }, crypto: { enabled: false } }) : env({ checkout_url: 'https://checkout.stripe.com/n' })));
    await u.load();
    expect(u.snapshot().phase).toBe('ready');
    expect(await u.submit('10')).toMatchObject({ ok: true });
    expect(posts().pop()!.body).not.toMatchObject({ idempotency_key: k });
  });
  it('forgetting a held top-up after the options read failed goes back to "could not read", never to "no method" (C9)', async () => {
    const { k } = await pendingTopUp();
    onFetch((c) => (c.method === 'GET' ? env({}) : env({ checkout_url: 'https://checkout.stripe.com/x' })));
    const u = createTopUp();
    await u.load();
    expect(u.snapshot()).toMatchObject({ phase: 'pending', error: expect.objectContaining({ code: 'BAD_LIST' }) });
    expect(u.snapshot().pending?.key).toBe(k);
    expect(u.forget(true)).toBe(true);
    expect(u.snapshot()).toMatchObject({ phase: 'availError', pending: null, error: expect.objectContaining({ code: 'BAD_LIST' }) });
    // The options read again and answered: the drawer is ready (the failure is not remembered past an answer).
    onFetch(() => env({ card: { enabled: true }, crypto: { enabled: false } }));
    await u.load();
    expect(u.snapshot().phase).toBe('ready');
  });
  it('forget() is refused while a send is in flight and when nothing is held', async () => {
    onFetch((c) => (c.method === 'GET' ? env({ card: { enabled: true }, crypto: { enabled: false } }) : env({ checkout_url: 'https://checkout.stripe.com/x' })));
    const t = createTopUp();
    await t.load();
    expect(t.forget(true)).toBe(false);
    let release!: () => void;
    onFetch((c) => (c.method === 'GET' ? env({ card: { enabled: true }, crypto: { enabled: false } }) : new Promise((res) => { release = () => res({ status: 500, body: {} }); })));
    const p = t.submit('10');
    await new Promise((r) => setTimeout(r, 5));
    expect(t.snapshot().phase).toBe('submitting');
    expect(t.forget(true)).toBe(false);
    release();
    await p;
    expect(t.snapshot().phase).toBe('pending');
  });
});

describe('billing Forget 1222: in-flight stamp, attempt fence, pending lock', () => {
  const avail = () => env({ card: { enabled: true }, crypto: { enabled: true } });
  const stored = () => JSON.parse(localStorage.getItem('hub.v3.topup_pending') || '[]') as Array<Record<string, unknown>>;
  it('a drawer restoring a top-up whose POST is still out cannot forget it; once answered it can', async () => {
    let answer!: (r: { status: number; body: unknown }) => void;
    onFetch((c) => (c.method === 'GET' ? avail() : new Promise((res) => { answer = res; })));
    const a = createTopUp();
    await a.load();
    const first = a.submit('10');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    const k = (posts()[0]!.body as { idempotency_key: string }).idempotency_key;
    const b = createTopUp();
    await b.load();
    expect(b.snapshot()).toMatchObject({ phase: 'pending', pending: { key: k, sending: true } });
    expect(b.forget(true)).toBe(false);
    expect(b.snapshot()).toMatchObject({ phase: 'pending', pending: { key: k } });
    expect(await b.submit('10')).toMatchObject({ ok: false, reason: 'busy' });
    expect(posts()).toHaveLength(1);
    answer({ status: 500, body: {} });
    await first;
    await settle();
    expect(a.snapshot().phase).toBe('pending');
    expect(stored()[0]!.sending).toBeUndefined();
    expect(b.forget(true)).toBe(true);
    await settle();
    expect(stored()).toEqual([]);
  });
  it('another tab\'s fresh in-flight stamp refuses forget; a stale one (a dead tab) does not', async () => {
    const key = 'k'.repeat(24);
    const rec = (at: number) => [{ user_id: UID, key, method: 'card', amount: '10.00', at: Date.now(), sending: 'a'.repeat(24), sending_at: at }];
    localStorage.setItem('hub.v3.topup_pending', JSON.stringify(rec(Date.now())));
    onFetch(() => avail());
    const b = createTopUp();
    await b.load();
    expect(b.snapshot()).toMatchObject({ phase: 'pending', pending: { key, sending: true } });
    expect(b.forget(true)).toBe(false);
    localStorage.setItem('hub.v3.topup_pending', JSON.stringify(rec(Date.now() - 10 * 60000)));
    expect(b.forget(true)).toBe(true);
    await settle();
    expect(stored()).toEqual([]);
    expect(posts()).toHaveLength(0);
  });
  it('forget is refused when the shared record now holds another key (it shows that one)', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const a = createTopUp();
    await a.load();
    await a.submit('10');
    const other = 'o'.repeat(24);
    localStorage.setItem('hub.v3.topup_pending', JSON.stringify([{ user_id: UID, key: other, method: 'crypto', amount: '20.00', at: Date.now() }]));
    expect(a.forget(true)).toBe(false);
    expect(a.snapshot()).toMatchObject({ phase: 'pending', pending: { key: other, method: 'crypto', amount: '20.00' } });
    await settle();
    expect(stored()).toHaveLength(1);
  });
  it('load() while a resend is out changes nothing; the resend\'s answer decides the drawer', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const t = createTopUp();
    await t.load();
    await t.submit('10');
    expect(t.snapshot().phase).toBe('pending');
    let answer!: (r: { status: number; body: unknown }) => void;
    onFetch((c) => (c.method === 'GET' ? avail() : new Promise((res) => { answer = res; })));
    const p = t.resend(true);
    await vi.waitFor(() => expect(posts()).toHaveLength(2));
    await t.load();
    expect(t.snapshot().phase).toBe('submitting');
    expect(t.forget(true)).toBe(false);
    answer({ status: 200, body: { data: { checkout_url: 'https://checkout.stripe.com/c/x' } } });
    expect(await p).toMatchObject({ ok: true });
    expect(t.snapshot()).toMatchObject({ phase: 'redirect', pending: null });
    await settle();
    expect(stored()).toEqual([]);
  });
  it('the admission of a top-up and every record write take the pending lock, admission before the POST', async () => {
    const names: string[] = [];
    let tail: Promise<unknown> = Promise.resolve();
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: (n: string, fn: () => unknown) => { names.push(n + '@' + posts().length); const r = tail.then(fn); tail = r.then(() => undefined, () => undefined); return r; } },
    });
    onFetch((c) => (c.method === 'GET' ? avail() : env({ checkout_url: 'https://checkout.stripe.com/c/x' })));
    const t = createTopUp();
    await t.load();
    expect(await t.submit('10')).toMatchObject({ ok: true });
    await settle();
    expect(names[0]).toBe('hub_money_pending@0');
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(stored()).toEqual([]);
  });
  it('two drawers pressing at once send one top-up; the other holds it', async () => {
    fakeLocks();
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const a = createTopUp(), b = createTopUp();
    await a.load(); await b.load();
    const [ra, rb] = await Promise.all([a.submit('10'), b.submit('10')]);
    expect(posts()).toHaveLength(1);
    expect([ra.ok === false && ra.reason, rb.ok === false && rb.reason].sort()).toEqual(['busy', 'pending']);
    expect(b.snapshot().phase).toBe('pending');
    expect(b.snapshot().pending?.key).toBe(a.snapshot().pending?.key);
  });
});

describe('live stamps, heartbeat, replay admission timeout', () => {
  const avail = () => env({ card: { enabled: true }, crypto: { enabled: true } });
  const stored = () => JSON.parse(localStorage.getItem('hub.v3.topup_pending') || '[]') as Array<Record<string, unknown>>;
  const foreign = (at: number) => [{ user_id: UID, key: 'k'.repeat(24), method: 'card', amount: '10.00', at: Date.now(), sending: 'f'.repeat(24), sending_at: at }];
  it('Check again while another tab\'s POST of the key is out sends nothing and never takes over its stamp', async () => {
    localStorage.setItem('hub.v3.topup_pending', JSON.stringify(foreign(Date.now())));
    onFetch((c) => (c.method === 'GET' ? avail() : env({ checkout_url: 'https://checkout.stripe.com/c/x' })));
    const b = createTopUp();
    await b.load();
    expect(b.snapshot()).toMatchObject({ phase: 'pending', pending: { sending: true } });
    expect(await b.checkAgain()).toMatchObject({ ok: false, reason: 'busy' });
    await settle();
    expect(posts()).toHaveLength(0);
    expect(stored()[0]).toMatchObject({ sending: 'f'.repeat(24) });
    expect(b.forget(true)).toBe(false);
  });
  it('the resend admission itself refuses when a live stamp appears after the resend\'s own check', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const b = createTopUp();
    await b.load();
    await b.submit('10');
    const k = b.snapshot().pending!.key;
    await settle();
    fakeLocks();
    // Another tab starts a replay of the key between Check again's read and the lock (the record stamped).
    const p = b.resend(true);
    localStorage.setItem('hub.v3.topup_pending', JSON.stringify([{ ...foreign(Date.now())[0], key: k }]));
    expect(await p).toMatchObject({ ok: false, reason: 'busy' });
    expect(posts()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ key: k, sending: 'f'.repeat(24) });
  });
  it('an attempt held out past the stale window (a 2FA prompt left open) keeps its stamp fresh (a heartbeat), so another drawer cannot forget it', async () => {
    // A request itself ends within topupMs + 5 s; what can outlast the stale window is the prompt.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setOtpPrompt({ ask: () => new Promise<string | null>(() => {}), cancel: () => {} });
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 403, body: { error: 'OTP_REQUIRED' } }));
    const a = createTopUp();
    await a.load();
    void a.submit('10');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    const first = stored()[0]!.sending_at as number;
    await vi.advanceTimersByTimeAsync(130000);
    await settle();
    expect(stored()[0]!.sending_at as number).toBeGreaterThan(first + 100000);
  });
  it('a Check again whose admission times out on the lock answers pending, never not sent', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const t = createTopUp();
    await t.load();
    await t.submit('10');
    await settle();
    const { bounds } = await import('./commerce');
    Object.assign(bounds, { read: 30 });
    let open!: () => void;
    const gateP = new Promise<void>((res) => { open = res; });
    let tail: Promise<unknown> = Promise.resolve();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_n: string, fn: () => unknown) => { const r = tail.then(fn); tail = r.then(() => undefined, () => undefined); return r; } } });
    void (navigator as unknown as { locks: { request: (n: string, fn: () => unknown) => Promise<unknown> } }).locks.request('hub_money_pending', () => gateP);
    const r = await t.checkAgain();
    open();
    expect(r).toMatchObject({ ok: false, reason: 'pending' });
    expect(t.snapshot().phase).toBe('pending');
    expect(posts()).toHaveLength(1);
  });
});

describe('a pending top-up survives its drawer (module-level, per owner)', () => {
  const avail = () => env({ card: { enabled: true }, crypto: { enabled: true } });
  it('a new machine after the drawer closed restores the pending top-up: same key, submit refused, the confirmed resend sends it', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const a = createTopUp();
    await a.load();
    await a.submit('10');
    const k = a.snapshot().pending?.key;
    expect(k).toBeTruthy();
    a.dispose();
    const b = createTopUp();
    await b.load();
    expect(b.snapshot()).toMatchObject({ phase: 'pending', method: 'card', pending: { key: k, method: 'card', amount: '10.00' } });
    const sent = posts().length;
    expect(await b.submit('10')).toMatchObject({ ok: false, reason: 'busy' });
    expect(posts()).toHaveLength(sent);
    onFetch((c) => (c.method === 'GET' ? avail() : env({ checkout_url: 'https://checkout.stripe.com/c/x' })));
    expect(await b.resend(true)).toMatchObject({ ok: true });
    expect(posts()[posts().length - 1]!.body).toMatchObject({ idempotency_key: k });
    // Answered: nothing is restored any more.
    const c = createTopUp();
    await c.load();
    expect(c.snapshot().phase).toBe('ready');
  });
  it('a drawer closed during a slow POST: the reopened drawer holds (Check again only), never a second key', async () => {
    let answer!: (r: { status: number; body: unknown }) => void;
    onFetch((c) => (c.method === 'GET' ? avail() : new Promise((res) => { answer = res; })));
    const a = createTopUp();
    await a.load();
    const first = a.submit('10');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    const k = posts()[0]!.body as { idempotency_key: string };
    a.dispose();
    const b = createTopUp();
    await b.load();
    expect(b.snapshot()).toMatchObject({ phase: 'pending', pending: { key: k.idempotency_key, method: 'card', amount: '10.00' } });
    expect(await b.submit('10')).toMatchObject({ ok: false, reason: 'busy' });
    expect(posts()).toHaveLength(1);
    answer({ status: 200, body: { data: { checkout_url: 'https://checkout.stripe.com/c/x' } } });
    await first;
    const c = createTopUp();
    await c.load();
    expect(c.snapshot().phase).toBe('ready');
  });
  it('a pending top-up whose provider is missing from availability stays held (never a fresh key)', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const a = createTopUp();
    await a.load();
    await a.submit('10');
    a.dispose();
    onFetch((c) => (c.method === 'GET' ? env({ card: { enabled: false }, crypto: { enabled: true } }) : { status: 500, body: {} }));
    const b = createTopUp();
    await b.load();
    expect(b.snapshot().phase).toBe('pending');
    expect(await b.submit('10')).toMatchObject({ ok: false, reason: 'busy' });
    expect(b.select('crypto')).toBe(false);
  });
  it('the confirmed resend of a held top-up runs without availability (it failed, or lacks the provider)', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const a = createTopUp();
    await a.load();
    await a.submit('10');
    const k = a.snapshot().pending?.key;
    a.dispose();
    onFetch((c) => (c.method === 'GET' ? { status: 503, body: {} } : env({ checkout_url: 'https://checkout.stripe.com/c/x' })));
    const b = createTopUp();
    await b.load();
    expect(b.snapshot().phase).toBe('pending');
    expect(await b.resend(true)).toMatchObject({ ok: true });
    expect(posts()[posts().length - 1]!.body).toMatchObject({ idempotency_key: k, amount: '10.00' });
  });
  it('a 2xx whose checkout URL is not the provider\'s stays unknown (pending), never failed', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : env({ checkout_url: 'https://evil.example/pay' })));
    const a = createTopUp();
    await a.load();
    expect(await a.submit('10')).toMatchObject({ ok: false, reason: 'pending' });
    expect(a.snapshot().phase).toBe('pending');
  });
  it('a realm switch keeps the restored top-up (the wallet is account-wide); an account change keeps it stored for its owner', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const a = createTopUp();
    await a.load();
    await a.submit('10');
    a.dispose();
    bump('switch');
    const b = createTopUp();
    await b.load();
    expect(b.snapshot().phase).toBe('pending');
    b.dispose();
    bump('account');
    const c = createTopUp();
    await c.load();
    expect(c.snapshot().phase).toBe('pending');
  });
});

describe('the confirmed resend sends only the shared record, with its own bounds', () => {
  const avail = (max = 10000) => env({ card: { enabled: true, min_usd: 5, max_usd: max }, crypto: { enabled: true } });
  it('a top-up another drawer already resolved is never replayed by a second drawer (no POST, no hold again)', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const a = createTopUp();
    await a.load();
    await a.submit('10');
    const b = createTopUp();
    await b.load();
    expect(b.snapshot().phase).toBe('pending');
    onFetch((c) => (c.method === 'GET' ? avail() : env({ checkout_url: 'https://checkout.stripe.com/c/x' })));
    expect(await a.resend(true)).toMatchObject({ ok: true });
    const sent = posts().length;
    expect(await b.checkAgain()).toMatchObject({ ok: false, reason: 'resolved' });
    expect(posts()).toHaveLength(sent);
    expect(b.snapshot()).toMatchObject({ phase: 'ready', pending: null });
    expect(b.snapshot().key).not.toBe(a.snapshot().key);
    const c = createTopUp();
    await c.load();
    expect(c.snapshot().phase).toBe('ready');
  });
  it('a held top-up replays after the provider lowered its maximum (its bounds were met when it went out)', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const a = createTopUp();
    await a.load();
    await a.submit('50');
    const k = a.snapshot().pending?.key;
    a.dispose();
    onFetch((c) => (c.method === 'GET' ? avail(20) : env({ checkout_url: 'https://checkout.stripe.com/c/x' })));
    const b = createTopUp();
    await b.load();
    expect(b.snapshot().phase).toBe('pending');
    expect(await b.resend(true)).toMatchObject({ ok: true });
    expect(posts()[posts().length - 1]!.body).toMatchObject({ idempotency_key: k, amount: '50.00' });
  });
});

describe('the pending top-up survives a reload and an account switch (hub.v3.topup_pending)', () => {
  const avail = () => env({ card: { enabled: true }, crypto: { enabled: true } });
  const pendingTopUp = async (): Promise<string> => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const a = createTopUp();
    await a.load();
    await a.submit('10');
    a.dispose();
    return a.snapshot().pending!.key;
  };
  it('a fresh module state (reload, another tab, an account switch and back) restores it from storage: same key, resent only by the confirmed resend', async () => {
    const k = await pendingTopUp();
    const stored = JSON.parse(localStorage.getItem('hub.v3.topup_pending') || '[]') as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
    expect(Object.keys(stored[0]!).sort()).toEqual(['amount', 'at', 'key', 'method', 'user_id']);
    bump('account');
    const b = createTopUp();
    await b.load();
    expect(b.snapshot()).toMatchObject({ phase: 'pending', pending: { key: k, method: 'card', amount: '10.00' } });
    expect(await b.submit('10')).toMatchObject({ ok: false, reason: 'busy' });
    onFetch((c) => (c.method === 'GET' ? avail() : env({ checkout_url: 'https://checkout.stripe.com/c/x' })));
    expect(await b.resend(true)).toMatchObject({ ok: true });
    expect(posts()[posts().length - 1]!.body).toMatchObject({ idempotency_key: k });
    expect(localStorage.getItem('hub.v3.topup_pending')).toBeNull();
  });
  it('another account never sees it; the owner sees it again', async () => {
    await pendingTopUp();
    setIdentity({ id: OTHER, banned: false });
    bump('account');
    const b = createTopUp();
    await b.load();
    expect(b.snapshot().phase).not.toBe('pending');
    expect(b.snapshot().pending).toBeNull();
    setIdentity({ id: UID, banned: false });
    bump('account');
    const c = createTopUp();
    await c.load();
    expect(c.snapshot().phase).toBe('pending');
  });
  // happy-dom's Storage caches each method on first use, so a Storage.prototype spy after boot() never reaches
  // localStorage: storage breaks go on the instance (breakKey), restored by hand as the other breaks here (they outlive restoreAllMocks).
  it('a first send whose hold storage will not take is not sent: storageFailed, nothing held', async () => {
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 500, body: {} }));
    const set = breakKey('setItem', 'hub.v3.topup_pending', 'throw');
    try {
      const a = createTopUp();
      await a.load();
      expect(await a.submit('10')).toMatchObject({ ok: false, reason: 'storageFailed' });
      expect(posts()).toHaveLength(0);
      expect(a.snapshot().pending).toBeNull();
      expect(localStorage.getItem('hub.v3.topup_pending')).toBeNull();
      a.dispose();
    } finally { set.mockRestore(); }
    const b = createTopUp();
    await b.load();
    expect(b.snapshot().phase).not.toBe('pending');
  });
  it('a stored hold this tab made still holds here while storage cannot be read (module memory)', async () => {
    const k = await pendingTopUp();
    expect(JSON.parse(localStorage.getItem('hub.v3.topup_pending') || '[]')).toMatchObject([{ user_id: UID, key: k }]);
    const get = breakKey('getItem', 'hub.v3.topup_pending', 'throw');
    try {
      const b = createTopUp();
      await b.load();
      expect(b.snapshot().phase).toBe('pending');
      expect(b.snapshot().pending).toMatchObject({ key: k, persisted: false });
    } finally { get.mockRestore(); }
  });
});

describe('a top-up attempt ends once its stamp is no longer its own; bounded POST; heartbeat stops', () => {
  const avail = () => env({ card: { enabled: true }, crypto: { enabled: true } });
  const KEY = 'hub.v3.topup_pending';
  const stored = () => JSON.parse(localStorage.getItem(KEY) || '[]') as Array<Record<string, unknown>>;
  const otpFirst = () => onFetch((c) => (c.method === 'GET' ? avail()
    : c.body && (c.body as Record<string, unknown>).otp_code ? env({ checkout_url: 'https://checkout.stripe.com/c/x' }) : { status: 403, body: { error: 'OTP_REQUIRED' } }));
  afterEach(() => { setOtpPrompt(null); });
  it('another tab forgot the top-up while the 2FA prompt was open: the code sends nothing, the drawer is ready again', async () => {
    otpFirst();
    setOtpPrompt({ ask: async () => { localStorage.setItem(KEY, '[]'); return '123456'; }, cancel: () => {} });
    const b = createTopUp();
    await b.load();
    const r = await b.submit('10');
    await settle();
    expect(posts()).toHaveLength(1);
    expect(r).toMatchObject({ ok: false, reason: 'resolved' });
    expect(b.snapshot().phase).toBe('ready');
    expect(stored()).toEqual([]);
  });
  it('another tab holds another key by the time the code is typed: nothing sent, that record kept and shown', async () => {
    otpFirst();
    const other = { user_id: UID, key: 'k'.repeat(24), method: 'card', amount: '20.00', at: Date.now() };
    setOtpPrompt({ ask: async () => { localStorage.setItem(KEY, JSON.stringify([other])); return '123456'; }, cancel: () => {} });
    const b = createTopUp();
    await b.load();
    const r = await b.submit('10');
    await settle();
    expect(posts()).toHaveLength(1);
    expect(r).toMatchObject({ ok: false, reason: 'busy' });
    expect(stored()).toEqual([other]);
    expect(b.snapshot()).toMatchObject({ phase: 'pending', pending: { key: 'k'.repeat(24), amount: '20.00' } });
  });
  it('control: the stamp still this attempt\'s when the code is typed: the code is sent', async () => {
    otpFirst();
    setOtpPrompt({ ask: async () => '123456', cancel: () => {} });
    const b = createTopUp();
    await b.load();
    expect(await b.submit('10')).toMatchObject({ ok: true });
    expect(posts()).toHaveLength(2);
  });
  it('a POST that never answers ends pending after budgets.topupMs (unknown outcome); its stamp is cleared', async () => {
    Object.assign(budgets, { topupMs: 300 });
    // A request that stays open (the fake fetch honours the abort only while delaying).
    onFetch((c) => (c.method === 'GET' ? avail() : { status: 200, body: { data: {} }, delayMs: 600000 }));
    const b = createTopUp();
    await b.load();
    const r = await b.submit('10');
    expect(r).toMatchObject({ ok: false, reason: 'pending' });
    await settle();
    await vi.waitFor(() => expect(stored()[0]).toBeDefined());
    expect(stored()[0]!.sending).toBeUndefined();
    expect(b.snapshot()).toMatchObject({ phase: 'pending', pending: { amount: '10.00' } });
  });
  it('the heartbeat stops renewing the stamp once its owner is no longer shown (another account signed in)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.assign(budgets, { topupMs: 600000 });
    onFetch((c) => (c.method === 'GET' ? avail() : new Promise(() => {})));
    const a = createTopUp();
    await a.load();
    void a.submit('10');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    await vi.waitFor(() => expect(stored()[0]?.sending).toBeDefined());
    const first = stored()[0]!.sending_at as number;
    localStorage.setItem('access_token', sessionToken(OTHER, { sid: 'sid0000000000002', exp: Math.floor(Date.now() / 1000) + 3600 }));
    await vi.advanceTimersByTimeAsync(130000);
    await settle();
    expect(stored()[0]!.sending_at).toBe(first);
  });
});

describe('the whole top-up attempt is bounded; a queued beat never renews after the owner left', () => {
  const avail = () => env({ card: { enabled: true }, crypto: { enabled: true } });
  const stored = () => JSON.parse(localStorage.getItem('hub.v3.topup_pending') || '[]') as Array<Record<string, unknown>>;
  const wallet = () => calls.filter((c) => c.method !== 'GET' && /\/wallet\//.test(c.url));
  it('a token refresh that hangs before the send ends the attempt (not sent, never stuck submitting), and nothing leaves late', async () => {
    Object.assign(budgets, { topupMs: 200 });
    let release!: () => void;
    const hung = new Promise<{ status: number; body: unknown }>((res) => { release = () => res({ status: 200, body: { data: { token: sessionToken(UID, { sid: 'sid0000000000001', exp: Math.floor(Date.now() / 1000) + 3600 }), refreshToken: sessionToken(UID, { sid: 'sid0000000000001', exp: Math.floor(Date.now() / 1000) + 86400, n: 2 }), expires_at: new Date(Date.now() + 3_600_000).toISOString() } } }); });
    onFetch((c) => (/\/users\/auth\/refresh/.test(c.url) ? hung : c.method === 'GET' ? avail() : env({ checkout_url: 'https://checkout.stripe.com/c/x' })));
    const b = createTopUp();
    await b.load();
    localStorage.setItem('access_token_expires_at', new Date(Date.now() + 10000).toISOString());
    // The call is bounded at topupMs + 5 s of slack (api.ts): the request never went out, so it says not sent.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const rp = b.submit('10');
    await vi.advanceTimersByTimeAsync(6000);
    const r = await rp;
    expect(r).toMatchObject({ ok: false, reason: 'failed', error: { notSent: true } });
    expect(b.snapshot().phase).toBe('error');
    expect(wallet()).toHaveLength(0);
    await vi.waitFor(() => expect(stored()).toEqual([]));
    // A valid refresh (the session renewed, same account): the bounded top-up still never leaves late.
    const before = localStorage.getItem('refresh_token');
    release();
    await vi.advanceTimersByTimeAsync(50);
    await settle();
    expect(localStorage.getItem('refresh_token')).not.toBe(before);
    expect(wallet()).toHaveLength(0);
  });
  it('a beat queued on the lock while the owner was still shown renews nothing once another account is shown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.assign(budgets, { topupMs: 600000 });
    onFetch((c) => (c.method === 'GET' ? avail() : new Promise(() => {})));
    const a = createTopUp();
    await a.load();
    void a.submit('10');
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    await vi.waitFor(() => expect(stored()[0]?.sending).toBeDefined());
    const first = stored()[0]!.sending_at as number;
    // Another holder keeps the pending lock while the beat fires: the beat's write waits behind it.
    let open!: () => void;
    const gateP = new Promise<void>((res) => { open = res; });
    fakeLocks();
    void (navigator as unknown as { locks: { request: (n: string, fn: () => unknown) => Promise<unknown> } }).locks.request('hub_money_pending', () => gateP);
    await vi.advanceTimersByTimeAsync(31000);
    localStorage.setItem('access_token', sessionToken(OTHER, { sid: 'sid0000000000002', exp: Math.floor(Date.now() / 1000) + 3600 }));
    open();
    await vi.advanceTimersByTimeAsync(10);
    await settle();
    expect(stored()[0]!.sending_at).toBe(first);
  });
});

describe('paymentsSettled: Remove all local data runs only while no payment is open in this browser', () => {
  it('nothing stored: settled; a stored list, for any account: held; a list that is not a list: unreadable', () => {
    expect(paymentsSettled()).toBe('settled');
    localStorage.setItem('hub_money_pending', '[]');
    expect(paymentsSettled()).toBe('settled');
    localStorage.setItem('hub_money_pending', JSON.stringify([{ user_id: OTHER }]));
    expect(paymentsSettled()).toBe('held');
    localStorage.setItem('hub_money_pending', '{"a":1}');
    expect(paymentsSettled()).toBe('unreadable');
  });
  // Its stored record removed behind this tab's back (a cleared store), the memory entry still counts until a read of the
  // record reconciles it; that read drops it (the record is the truth while storage reads).
  it('a memory entry not yet reconciled counts as held; a read of the record drops it', async () => {
    const avail = env({ card: { enabled: true }, crypto: { enabled: true } });
    onFetch((c) => (c.method === 'GET' ? avail : { status: 500, body: {} }));
    const t = createTopUp();
    await t.load();
    await t.submit('10');
    expect(t.snapshot().pending).toMatchObject({ key: expect.any(String) });
    for (let i = 0; i < 5; i++) await settle();
    t.dispose();
    localStorage.removeItem('hub.v3.topup_pending');
    expect(localStorage.getItem('hub.v3.topup_pending')).toBeNull();
    expect(paymentsSettled()).toBe('held');
    const r = createTopUp();
    await r.load();
    expect(r.snapshot().pending).toBeNull();
    r.dispose();
    expect(paymentsSettled()).toBe('settled');
  });
});
