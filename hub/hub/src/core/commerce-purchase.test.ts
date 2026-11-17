// commerce.ts, the Market: listing, reservations (walk, poll, latch), the rent / reserve purchase machine, ownership
// recovery, Check status, the deadline fences and the reserve pending store.
// It runs on the real core (test/env.ts + test/commerce-env.ts); the owner of a request is the bearer user of
// the call (the owner binding itself is shared.js's and api.ts's, pinned in api.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onPending, setOtpPrompt, type PendingNotice } from './api';
import {
  budgets, bounds, checkRentPending, checkStatus, createPurchase as createPurchaseRaw, dismissRentPending, rentPendingFor, subscribeRentPending, loadListing, marketBanned, marketLatch, marketPendingAbandon, marketPendingDrop, marketPendingFor, marketPendingKept, reserveUnknownAbandon, reserveUnknownFor, reserveUnknownForget,
  clearMarketResume, marketResume, setMarketResume, pollReservations, resetCommerce, resPendingCount, walkReservations,
} from './commerce';
import { market as M, pendingLockHeld } from './commerce-pure';
import { bump, capture } from './ctx';
import {
  DIRS, UA, UB, breakKey, calls, restoreStorage, rewriteKey, envelope, gate, heldLocks, noLocks, offerRaw, path, posts, reserve201, RENT_201, rows, shop, shopFor,
  snapshotStores, stockRaw, typedErr, uidOf, hostOf, tracked, drainMachines, type Call, type Reply, type Shop,
} from './test/commerce-env';
import { env as testEnv, sessionToken } from './test/env';

// Deterministic time: every wait advances fake timers (timers and Date move together), so no test sleeps for real.
const sleep = (ms: number): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);

/** Awaits a promise that is waiting on timers: advances the fake clock in small steps until it settles. */
const driven = async <T>(p: Promise<T>): Promise<T> => {
  let done = false;
  const r = p.finally(() => { done = true; });
  r.catch(() => undefined);
  for (let i = 0; i < 10_000 && !done; i++) await vi.advanceTimersByTimeAsync(10);
  return r;
};

const BAN: Reply = typedErr(403, 'ACCOUNT_BANNED');
let notices: PendingNotice[] = [];
let offPending: () => void = () => undefined;
beforeEach(() => { vi.useFakeTimers(); resetCommerce(); notices = []; offPending = onPending((n) => notices.push(n)); });
afterEach(() => { restoreStorage(); offPending(); vi.restoreAllMocks(); vi.useRealTimers(); noLocks(); testEnv.framed = false; resetCommerce(); });
// Declared after the reset above so it runs first (after hooks run in reverse): every machine a test made is disposed
// and drained on that test's own clock and store (commerce-env drainMachines).
afterEach(async () => { await drainMachines(); });
/** Every purchase machine is tracked, so none outlives its test. */
const createPurchase = (...a: Parameters<typeof createPurchaseRaw>): ReturnType<typeof createPurchaseRaw> => tracked(createPurchaseRaw(...a));

// ── Market listing ──────────────────────────────────────────────────────
describe('parity: Market listing (both inventories, normalized with the money rules)', () => {
  it('stock and offers are read on base and normalized (integer cents, valid tiers only)', async () => {
    const s = shop({ fetch: (c) => ({ status: 200, body: envelope(path(c) === '/offers' ? [offerRaw()] : [stockRaw()]) }) });
    const r = await loadListing(s.ctx());
    expect(r.stock.map((x) => x.id)).toEqual(['s1']);
    expect(r.offers.map((x) => x.id)).toEqual(['o1']);
    expect(M.quoteFor(r.stock[0], '1')!.totalCents).toBe(3700);
    expect(calls.every((c) => hostOf(c) === 'base')).toBe(true);
  });
  it('one rail failing keeps the other and says which failed', async () => {
    const s = shop({ fetch: (c) => (path(c) === '/offers' ? { status: 500, body: { error: 'BOOM' } } : { status: 200, body: envelope([stockRaw()]) }) });
    const r = await loadListing(s.ctx());
    expect(r.stock.length).toBe(1);
    expect(r.offers).toEqual([]);
    expect((r.errOffers as { status: number }).status).toBe(500);
    expect(r.errStock).toBe(null);
  });
  it('a 403 ACCOUNT_BANNED latches the ban', async () => {
    const s = shop({ fetch: () => BAN });
    expect((await loadListing(s.ctx())).banned).toBe(true);
    expect(marketBanned()).toBe(true);
  });
  it('a listing answered after the context died renders nothing (stale)', async () => {
    const s: Shop = shop({ fetch: () => { s.bump(); return { status: 200, body: envelope([]) }; } });
    const e = await loadListing(s.ctx()).catch((x: unknown) => x);
    expect(e).toMatchObject({ stale: true });
  });
});

// ── reservations: the walk and the poll ────────────────
const page = (all: unknown[], c: Call) => {
  const off = parseInt(/offset=(\d+)/.exec(path(c))![1]!, 10);
  return { status: 200, body: envelope(all.slice(off, off + 200), all.length) } as Reply;
};
const mk = (n: number, tag = 'rv') => Array.from({ length: n }, (_, i) => ({ id: tag + i, offer_id: 'o1', days: 7, state: 'pending', created_at: new Date().toISOString() }));

describe('parity: My reservations (newest first, <=5 pages automatically, then Load more)', () => {
  it('walks five pages, stops with more=true, and Load more continues under the same owner', async () => {
    const all = mk(1050);
    const s = shop({ fetch: (c) => page(all, c) });
    const w = await walkReservations(s.ctx());
    expect(w.rows.length).toBe(1000);
    expect(w.more).toBe(true);
    const own = w.own;
    const w2 = await walkReservations(s.ctx(), w);
    expect(w2.rows.length).toBe(1050);
    expect(w2.more).toBe(false);
    expect(w2.own).toBe(own);
    expect(calls.every((c) => uidOf(c) === UA)).toBe(true);
  });
  for (const [dir, me, other] of DIRS) {
    it(`${dir}: a switch while a page is out drops it and sends no further page as anyone`, async () => {
      const all = mk(450);
      let first = true;
      const s: Shop = shop({ me, fetch: (c) => { if (first) { first = false; s.switchTo(other); } return page(all, c); } });
      const e = await walkReservations(s.ctx()).catch((x: { superseded?: boolean; stale?: boolean }) => x);
      expect((e as { superseded?: boolean }).superseded || (e as { stale?: boolean }).stale).toBe(true);
      expect(calls.map(uidOf)).toEqual([me]);
    });
    it(`${dir}: Load more after a switch and a switch back before it settles sends nothing as the other user`, async () => {
      const all = mk(1050);
      const s: Shop = shop({ me, fetch: (c) => { if (uidOf(c) !== me) s.switchTo(me, '3'); return page(all, c); } });
      const ctx = s.ctx();
      const w = await walkReservations(ctx);
      s.switchTo(other, '2');
      const from = calls.length;
      await walkReservations(ctx, w).catch(() => null);
      expect(calls.slice(from).filter((c) => uidOf(c) === other)).toEqual([]);
    });
  }
  it('a switch while the LAST page is out drops it: the walk is refused, its rows are not shown', async () => {
    const s: Shop = shop({ fetch: (c) => { s.switchTo(UB); return page(mk(3), c); } });
    const e = await walkReservations(s.ctx()).catch((x: unknown) => x) as { rows?: unknown; superseded?: boolean; stale?: boolean };
    expect(Array.isArray(e && e.rows)).toBe(false);
    expect(e.superseded || e.stale).toBe(true);
  });
  it('the Hub displaying another user while the last page is out drops it too (stored session unchanged)', async () => {
    const s: Shop = shop({ fetch: (c) => { s.show(UB); return page(mk(3), c); } });
    const e = await walkReservations(s.ctx()).catch((x: unknown) => x) as { rows?: unknown; superseded?: boolean };
    expect(Array.isArray(e && e.rows)).toBe(false);
    expect(e.superseded).toBe(true);
  });
  it('control: the same user signing in again keeps walking', async () => {
    const all = mk(450);
    let first = true;
    const s: Shop = shop({ fetch: (c) => { if (first) { first = false; s.switchTo(UA); } return page(all, c); } });
    const w = await walkReservations(s.ctx());
    expect(w.rows.length).toBe(450);
  });
});

const row = (id: string, state = 'pending') => ({ id, offer_id: 'o1', days: 7, state, created_at: '2026-10-01T00:00:00Z' });
/** A shop over a mutable reservations table: pages, by-id reads, and an optional per-call hook. */
function resShop(all: ReturnType<typeof row>[], hook?: (c: Call, s: Shop) => Reply | Promise<Reply> | undefined, me = UA) {
  const s: Shop = shop({
    me,
    fetch: (c) => {
      const h = hook && hook(c, s);
      if (h) return h;
      const p = path(c);
      const m = /^\/reservations\?limit=200&offset=(\d+)$/.exec(p);
      if (m) { const off = +m[1]!; return { status: 200, body: envelope(all.slice(off, off + 200), all.length) }; }
      const one = /^\/reservations\/([^/?#]+)$/.exec(p);
      if (one) { const r = all.find((x) => x.id === decodeURIComponent(one[1]!)); return r ? { status: 200, body: envelope(r) } : typedErr(404, 'NOT_FOUND'); }
      return { status: 404, body: { error: 'unmocked' } };
    },
  });
  return s;
}
const reads = () => calls.map(path);
const fulfilled200 = () => Array.from({ length: 200 }, (_, i) => row('f' + i, 'fulfilled'));

describe('Market reservations: the pending poll', () => {
  it('no pending row: a poll cycle sends nothing (no idle poll)', async () => {
    const s = resShop([row('a', 'fulfilled'), row('b', 'refunded')]);
    const w = await walkReservations(s.ctx());
    const n = calls.length;
    expect(resPendingCount(w)).toBe(0);
    await pollReservations(s.ctx(), w);
    expect(calls.length).toBe(n);
  });
  it('a cycle is one page-0 read plus by-id reads only for pendings not on that page, at most 5', async () => {
    const all = [...fulfilled200(), ...Array.from({ length: 7 }, (_, i) => row('p' + i))];
    const s = resShop(all);
    const w = await walkReservations(s.ctx());
    expect(w.rows.length).toBe(207);
    expect(resPendingCount(w)).toBe(7);
    const from = calls.length;
    await pollReservations(s.ctx(), w);
    const cycle = reads().slice(from);
    expect(cycle[0]).toBe('/reservations?limit=200&offset=0');
    expect(cycle.length).toBe(6);
    expect(cycle.slice(1).every((p) => /^\/reservations\/p\d$/.test(p))).toBe(true);
    // The next cycle reads the two the first one skipped first (least recently polled).
    const from2 = calls.length;
    await pollReservations(s.ctx(), w);
    expect(reads().slice(from2 + 1, from2 + 3).sort()).toEqual(['/reservations/p5', '/reservations/p6']);
  });
  it('by-id reads run at most two at a time', async () => {
    const all = [...fulfilled200(), ...Array.from({ length: 5 }, (_, i) => row('p' + i))];
    let live = 0, peak = 0;
    const s = resShop(all, (c) => {
      if (!/^\/reservations\/p/.test(path(c))) return undefined;
      live++; peak = Math.max(peak, live);
      return new Promise<Reply>((r) => setTimeout(() => { live--; r({ status: 200, body: envelope(all.find((x) => path(c).endsWith('/' + x.id))) }); }, 10));
    });
    const w = await walkReservations(s.ctx());
    await driven(pollReservations(s.ctx(), w));
    expect(peak).toBe(2);
  });
  it('a pending row that became fulfilled leaves the poll; one more cycle sends nothing', async () => {
    const all = [row('a')];
    const s = resShop(all);
    const w = await walkReservations(s.ctx());
    all[0] = row('a', 'fulfilled');
    await pollReservations(s.ctx(), w);
    expect(w.rows[0]!.state).toBe('fulfilled');
    expect(resPendingCount(w)).toBe(0);
    const n = calls.length;
    await pollReservations(s.ctx(), w);
    expect(calls.length).toBe(n);
  });
  it('state only advances: a lagging pending answer never brings back a refunded row, even in a new walk', async () => {
    const all = [row('a')];
    const s = resShop(all);
    const w = await walkReservations(s.ctx());
    all[0] = row('a', 'refunded');
    await pollReservations(s.ctx(), w);
    all[0] = row('a', 'pending'); // a lagging replica
    const w2 = await walkReservations(s.ctx());
    expect(w2.rows[0]!.state).toBe('refunded');
    expect(resPendingCount(w2)).toBe(0);
  });
  it('a row new on page 0 during a cycle goes on top, in page order', async () => {
    const all = [row('a')];
    const s = resShop(all);
    const w = await walkReservations(s.ctx());
    all.unshift(row('n2'), row('n1'));
    await pollReservations(s.ctx(), w);
    expect(w.rows.map((r) => r.id)).toEqual(['n2', 'n1', 'a']);
    expect(w.total).toBe(3);
  });
  it('a failed by-id read is best effort: the cycle settles and the row stays pending', async () => {
    const all = [...fulfilled200(), row('p0')];
    const s = resShop(all, (c) => (/\/reservations\/p0$/.test(path(c)) ? typedErr(500, 'BOOM') : undefined));
    const w = await walkReservations(s.ctx());
    await pollReservations(s.ctx(), w);
    expect(resPendingCount(w)).toBe(1);
  });
  it('a ban during a cycle stops it (rejects) and latches the Market ban', async () => {
    const all = [...fulfilled200(), row('p0'), row('p1'), row('p2')];
    const s = resShop(all, (c) => (/\/reservations\/p/.test(path(c)) ? BAN : undefined));
    const w = await walkReservations(s.ctx());
    const e = await pollReservations(s.ctx(), w).then(() => null, (x: { code?: string }) => x);
    expect(e && e.code).toBe('ACCOUNT_BANNED');
    expect(marketLatch.banned).toBe(true);
  });
  for (const [dir, me, other] of DIRS) {
    it(`${dir}: every poll read goes as the list's owner; after a switch the cycle stops and nothing goes as the other user`, async () => {
      const all = [...fulfilled200(), row('p0'), row('p1'), row('p2')];
      let switched = false;
      const s: Shop = resShop(all, (c, sh) => {
        if (!switched && /\/reservations\/p0$/.test(path(c))) { switched = true; sh.switchTo(other); }
        return undefined;
      }, me);
      const w = await walkReservations(s.ctx());
      expect(calls.every((c) => uidOf(c) === me)).toBe(true);
      const from = calls.length;
      const e = await pollReservations(s.ctx(), w).then(() => null, (x: { superseded?: boolean; stale?: boolean }) => x);
      expect(e && (e.superseded || e.stale)).toBe(true);
      expect(calls.slice(from).filter((c) => uidOf(c) === other)).toEqual([]);
      expect(uidOf(calls[calls.length - 1]!)).toBe(me);
    });
    it(`${dir}: the Hub displaying another user drops the cycle's page-0 answer (stored session unchanged)`, async () => {
      const all = [row('p0')];
      const s: Shop = resShop(all, (c, sh) => { if (path(c).includes('offset=0') && calls.length > 1) sh.show(other); return undefined; }, me);
      const w = await walkReservations(s.ctx());
      all[0] = row('p0', 'fulfilled');
      const e = await pollReservations(s.ctx(), w).then(() => null, (x: { superseded?: boolean }) => x);
      expect(e && e.superseded).toBe(true);
      expect(w.rows[0]!.state).toBe('pending');
    });
  }
  it('control: the same user throughout polls to the end', async () => {
    const all = [row('p0')];
    const s = resShop(all);
    const w = await walkReservations(s.ctx());
    all[0] = row('p0', 'fulfilled');
    await pollReservations(s.ctx(), w);
    expect(w.rows[0]!.state).toBe('fulfilled');
  });
});

describe('Market reservations: walk and Load more', () => {
  it('a short page ends the walk even when the total claims more (no loop on a lying total)', async () => {
    const all = Array.from({ length: 50 }, (_, i) => row('r' + i));
    const s = resShop([], (c) => (path(c).startsWith('/reservations?') ? { status: 200, body: envelope(all, 900) } : undefined));
    const w = await walkReservations(s.ctx());
    expect(calls.length).toBe(1);
    expect(w.exhausted).toBe(true);
    expect(w.more).toBe(true); // "Showing 50 of 900" stays visible
  });
  it('Load more after the older tail ended reads page 0 and puts head rows on top', async () => {
    const all = Array.from({ length: 50 }, (_, i) => row('r' + i, 'fulfilled'));
    let total = 50;
    const s = resShop([], (c) => (path(c).startsWith('/reservations?') ? { status: 200, body: envelope(all.slice(0, 200), total) } : undefined));
    const w = await walkReservations(s.ctx());
    expect(w.more).toBe(false);
    all.unshift(row('h1', 'fulfilled')); total = 51;
    w.total = 51; w.more = true; // a later read reports one more row than loaded
    const from = calls.length;
    await walkReservations(s.ctx(), w);
    expect(reads().slice(from)).toEqual(['/reservations?limit=200&offset=0']);
    expect(w.rows[0]!.id).toBe('h1');
    expect(w.more).toBe(false);
    expect(w.restart).toBe(false);
  });
  it('a head read that finds nothing new while rows are missing asks for a fresh walk', async () => {
    const all = Array.from({ length: 10 }, (_, i) => row('r' + i, 'fulfilled'));
    const s = resShop([], (c) => (path(c).startsWith('/reservations?') ? { status: 200, body: envelope(all, 20) } : undefined));
    const w = await walkReservations(s.ctx());
    await walkReservations(s.ctx(), w);
    expect(w.restart).toBe(true);
  });
  it('a page answered with a 2xx but no list is a failed read', async () => {
    const s = resShop([], (c) => (path(c).startsWith('/reservations?') ? { status: 200, body: envelope({ nope: 1 }) } : undefined));
    const e = await walkReservations(s.ctx()).then(() => null, (x: { code?: string }) => x);
    expect(e!.code).toBe('BAD_LIST');
  });
  it('a stalled page rejects at the read bound (nothing wedges at loading)', async () => {
    const s = resShop([], (c) => (path(c).startsWith('/reservations?') ? new Promise<Reply>(() => undefined) : undefined));
    Object.assign(bounds, { read: 30, slack: 10 });
    const e = await driven(walkReservations(s.ctx())).then(() => null, (x: { code?: string }) => x);
    expect(e && (e.code === 'OP_DEADLINE' || e.code === 'TIMEOUT')).toBe(true);
  });
});

describe('Market purchase: the re-quote a refusal carries', () => {
  for (const code of ['CHARGE_EXCEEDS_MAX', 'CHARGE_CONFIRMATION_REQUIRED', 'SETUP_FEE_CONFIRMATION_REQUIRED']) {
    it(`${code} carries the server's total, rental and fee for this duration`, async () => {
      shopFor((c) => (c.method === 'POST' ? typedErr(400, code, { total_cents: 4100, rental_cents: 1500, setup_fee_cents: 2600 }) : undefined));
      const r = M.normalizeStockRow(stockRaw(), 0);
      const p = createPurchase(r, r.days[0]!);
      p.confirm(true);
      await sleep(40);
      expect(p.snapshot().state).toBe('failed');
      expect(p.snapshot().failure).toMatchObject({ code, requote: true, requoteCents: 4100, requoteRentalCents: 1500, requoteFeeCents: 2600 });
    });
  }
  it('a re-quote without a total still asks for a fresh confirmation (no number shown)', async () => {
    shopFor((c) => (c.method === 'POST' ? typedErr(400, 'CHARGE_CONFIRMATION_REQUIRED', {}) : undefined));
    const r = M.normalizeStockRow(stockRaw(), 0);
    const p = createPurchase(r, r.days[0]!);
    p.confirm(true);
    await sleep(40);
    const f = p.snapshot().failure!;
    expect(f.requote).toBe(true);
    expect(f.requoteCents).toBeUndefined();
  });
  it('a typed refusal carries what the dialog needs: INSUFFICIENT_BALANCE, CHARGE_EXCEEDS_MAX', async () => {
    for (const [code, details, want] of [
      ['INSUFFICIENT_BALANCE', { required_cents: 3700, available_cents: 100 }, { requiredCents: 3700, availableCents: 100 }],
      ['CHARGE_EXCEEDS_MAX', { total_cents: 4000 }, { requoteCents: 4000 }],
    ] as const) {
      shopFor((c) => (c.method === 'POST' ? typedErr(400, code, details) : undefined));
      const p = createPurchase(rows().stock, '1');
      p.confirm(true);
      await sleep(40);
      expect(p.snapshot().state).toBe('failed');
      expect(p.snapshot().failure).toMatchObject({ code, ...want });
    }
  });
  it('INVALID_DURATION carries the days the server offers', async () => {
    shopFor((c) => (c.method === 'POST' ? typedErr(400, 'INVALID_DURATION', { available_days: [1, 7] }) : undefined));
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await sleep(40);
    expect(p.snapshot().failure!.code).toBe('INVALID_DURATION');
  });
});

// ── the purchase (rent / reserve) ───────────────────────────────────────
describe('parity: Rent this server / Reserve this offer: Confirm sends one wire-exact POST', () => {
  it('rent: POST /servers/:id/rent {rental_days, max_charge_cents} as the displayed owner, recovers, then confirmed', async () => {
    shopFor((c) => (path(c) === '/servers/s1/rent' ? { status: 201, body: RENT_201 } : undefined));
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    const post = posts()[0]!;
    expect(path(post)).toBe('/servers/s1/rent');
    expect(post.body).toEqual({ rental_days: 1, max_charge_cents: 3700 });
    expect(uidOf(post)).toBe(UA);
    expect(p.snapshot().state).toBe('confirmed');
    expect(notices).toEqual([]); // recovers: no pending notice while the context lives
  });
  it('reserve: POST /offers/:id/reserve {days, max_charge_cents, idempotency_key} then confirmed', async () => {
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(30);
    const b = posts()[0]!.body;
    expect(b.days).toBe(7);
    expect(b.max_charge_cents).toBe(9500);
    expect(typeof b.idempotency_key).toBe('string');
    expect(p.snapshot().state).toBe('confirmed');
  });
  it('without the consent tick nothing is sent', async () => {
    shopFor(() => ({ status: 201, body: RENT_201 }));
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(false)).toEqual({ ok: false, reason: 'consent' });
    await sleep(10);
    expect(posts()).toEqual([]);
  });
  it('a second Confirm while posting sends nothing more', async () => {
    shopFor((c) => (path(c) === '/servers/s1/rent' ? { status: 201, body: RENT_201, delayMs: 20 } : undefined));
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    expect(p.confirm(true).ok).toBe(false);
    await sleep(60);
    expect(posts().length).toBe(1);
  });
});

describe('parity: purchase ownership: the owner is the identity displayed when the dialog opens', () => {
  for (const [dir, me, other] of DIRS) for (const rail of ['rent', 'reserve'] as const) {
    const row = () => (rail === 'rent' ? rows().stock : rows().offer);
    const days = rail === 'rent' ? '1' : '7';
    const ok = (c: Call): Reply | undefined => (c.method === 'POST' ? { status: 201, body: rail === 'rent' ? RENT_201 : reserve201() } : undefined);

    it(`${rail} ${dir}: no identity displayed when the dialog opens: refused at open and at Confirm, even once one is displayed`, async () => {
      const s = shopFor(ok, { me, identity: null });
      const p = createPurchase(row(), days);
      expect(p.snapshot().notice).toBe('accountChanged');
      s.show(me);
      expect(p.confirm(true)).toEqual({ ok: false, reason: 'accountChanged' });
      await sleep(20);
      expect(posts()).toEqual([]);
    });
    it(`${rail} ${dir}: failed boot, ${other === UA ? 'A' : 'B'} signs in elsewhere, the retry then displays the first user: nothing sent`, async () => {
      const s = shopFor(ok, { me, identity: null });
      s.switchTo(other);
      const p = createPurchase(row(), days);
      s.show(me);
      p.confirm(true);
      await sleep(20);
      expect(posts()).toEqual([]);
      const again = createPurchase(row(), days); // reopened: shown me, stored other
      expect(again.confirm(true)).toEqual({ ok: false, reason: 'accountChanged' });
      await sleep(20);
      expect(posts()).toEqual([]);
    });
    it(`${rail} ${dir}: control, reopened once the identity is displayed, it buys as that user`, async () => {
      const s = shopFor(ok, { me, identity: null });
      createPurchase(row(), days);
      s.show(me);
      const p = createPurchase(row(), days);
      p.confirm(true);
      await sleep(30);
      expect(posts().map(uidOf)).toEqual([me]);
    });
    it(`${rail} ${dir}: another user signed in before the dialog opens: nothing sent`, async () => {
      const s = shopFor(ok, { me });
      s.switchTo(other);
      const p = createPurchase(row(), days);
      expect(p.confirm(true).ok).toBe(false);
      await sleep(20);
      expect(posts()).toEqual([]);
    });
    it(`${rail} ${dir}: another user signs in while the dialog is open: nothing sent`, async () => {
      const s = shopFor(ok, { me });
      const p = createPurchase(row(), days);
      s.switchTo(other);
      expect(p.confirm(true).ok).toBe(false);
      await sleep(20);
      expect(posts()).toEqual([]);
    });
    it(`${rail} ${dir}: the Hub displays another user once the dialog is open (stored unchanged): nothing sent`, async () => {
      const s = shopFor(ok, { me });
      const p = createPurchase(row(), days);
      s.show(other);
      expect(p.confirm(true).ok).toBe(false);
      await sleep(20);
      expect(posts()).toEqual([]);
    });
    it(`${rail} ${dir}: control, the same user signs in again while the dialog is open: buys as them`, async () => {
      const s = shopFor(ok, { me });
      const p = createPurchase(row(), days);
      s.switchTo(me);
      p.confirm(true);
      await sleep(30);
      expect(posts().map(uidOf)).toEqual([me]);
    });
  }
  it('the same user signing in again under a NEW session id is a changed session: nothing sent (the session, not the user, is the owner)', async () => {
    const s = shopFor((c) => (c.method === 'POST' ? { status: 201, body: RENT_201 } : undefined));
    const p = createPurchase(rows().stock, '1');
    s.switchTo(UA, '5');
    expect(p.confirm(true).ok).toBe(false);
    await sleep(20);
    expect(posts()).toEqual([]);
  });
  for (const [dir, me, other] of DIRS) {
    it(`reserve ${dir}: a switch while the POST is out: no recovery read, replay or retry as anyone`, async () => {
      let first = true;
      const s: Shop = shopFor((c) => {
        if (c.method === 'POST') { if (first) { first = false; s.switchTo(other); return { status: 503, body: { error: 'X' } }; } return { status: 201, body: reserve201(true) }; }
        return undefined;
      }, { me });
      const p = createPurchase(rows().offer, '7');
      p.confirm(true);
      await sleep(80);
      p.retry();
      await p.refresh();
      await sleep(20);
      expect(calls.filter((c) => uidOf(c) === other)).toEqual([]);
      expect(posts().map(uidOf)).toEqual([me]);
      expect(calls.filter((c) => path(c).startsWith('/reservations')).length).toBe(0);
      expect(p.snapshot().state).toBe('indeterminate');
    });
    it(`reserve ${dir}: the Hub displays another user while the POST is out: no recovery read or replay`, async () => {
      let first = true;
      const s: Shop = shopFor((c) => {
        if (c.method === 'POST') { if (first) { first = false; s.show(other); return { status: 503, body: { error: 'X' } }; } return { status: 201, body: reserve201(true) }; }
        return undefined;
      }, { me });
      const p = createPurchase(rows().offer, '7');
      p.confirm(true);
      await sleep(80);
      expect(p.retry()).toBe(false);
      expect(posts().length).toBe(1);
      expect(calls.filter((c) => path(c).startsWith('/reservations')).length).toBe(0);
    });
    it(`rent ${dir}: the Hub displays another user while the POST is out: no reconciliation read`, async () => {
      const s: Shop = shopFor((c) => {
        if (c.method === 'POST') { s.show(other); return { status: 503, body: { error: 'X' } }; }
        return undefined;
      }, { me });
      const p = createPurchase(rows().stock, '1');
      p.confirm(true);
      await sleep(80);
      expect(calls.filter((c) => path(c) === '/rentals').length).toBe(0);
      expect(p.snapshot().state).toBe('indeterminate');
    });
  }
  it('control: the same user throughout: the outcome stays unknown, and the confirmed resend sends the same key', async () => {
    let first = true;
    shopFor((c) => {
      if (c.method === 'POST') { if (first) { first = false; return { status: 503, body: { error: 'X' } }; } return { status: 201, body: reserve201(true) }; }
      return undefined;
    });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(80);
    expect(posts()).toHaveLength(1);
    expect(p.snapshot().state).toBe('indeterminate');
    expect(p.retry()).toBe(true);
    await sleep(40);
    const ps = posts();
    expect(ps.length).toBe(2);
    expect(ps[1]!.body.idempotency_key).toBe(ps[0]!.body.idempotency_key);
    expect(p.snapshot().state).toBe('confirmed');
    expect(p.snapshot().replayed).toBe(true);
  });
});

describe('through the token refresh: the displayed identity changes while apiCall waits (alive holds)', () => {
  // The access token is expired, so apiCall refreshes before sending. The Hub starts displaying the other user while
  // the refresh is out; the stored session stays the first user's, so only the owner's live predicate can stop it.
  const expiring = (me: string) => ({
    access_token: sessionToken(me, { sid: 'sid-x' + me.slice(-4), exp: Math.floor(Date.now() / 1000) + 3600 }),
    refresh_token: sessionToken(me, { sid: 'sid-x' + me.slice(-4), exp: Math.floor(Date.now() / 1000) + 86400 }),
    access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
  });
  const refreshed = (me: string): Reply => ({
    status: 200, delayMs: 15,
    body: { data: { token: sessionToken(me, { sid: 'sid-x' + me.slice(-4), exp: Math.floor(Date.now() / 1000) + 3600 }), refreshToken: sessionToken(me, { sid: 'sid-x' + me.slice(-4), exp: Math.floor(Date.now() / 1000) + 86400 }), expires_at: new Date(Date.now() + 3_600_000).toISOString() } },
  });
  for (const [dir, me, other] of DIRS) {
    for (const rail of ['rent', 'reserve'] as const) {
      it(`${rail} ${dir}: shown identity changes during the refresh before the POST: nothing sent`, async () => {
        const s: Shop = shopFor((c) => {
          if (path(c) === '/users/auth/refresh') { s.show(other); return refreshed(me); }
          return c.method === 'POST' ? { status: 201, body: rail === 'rent' ? RENT_201 : reserve201() } : undefined;
        }, { me, local: expiring(me) });
        const p = createPurchase(rail === 'rent' ? rows().stock : rows().offer, rail === 'rent' ? '1' : '7');
        expect(p.confirm(true).ok).toBe(true);
        await sleep(80);
        expect(calls.some((c) => path(c) === '/users/auth/refresh')).toBe(true);
        expect(posts()).toEqual([]);
        expect(p.snapshot().state).not.toBe('confirmed');
      });
      it(`${rail} ${dir}: control, the same identity throughout the refresh: sent once`, async () => {
        shopFor((c) => {
          if (path(c) === '/users/auth/refresh') return refreshed(me);
          return c.method === 'POST' ? { status: 201, body: rail === 'rent' ? RENT_201 : reserve201() } : undefined;
        }, { me, local: expiring(me) });
        const p = createPurchase(rail === 'rent' ? rows().stock : rows().offer, rail === 'rent' ? '1' : '7');
        p.confirm(true);
        await sleep(80);
        expect(calls.some((c) => path(c) === '/users/auth/refresh')).toBe(true);
        expect(posts().map(uidOf)).toEqual([me]);
        expect(p.snapshot().state).toBe('confirmed');
      });
    }
  }
});

// ── recovery ───────────────────────────────────────────────────────────
describe('parity: purchase recovery (rent reconciliation, reserve replay, Retry, Check again, Refresh)', () => {
  it('reserve: the Hub displays another user while the advisory read is out: no replay is even attempted', async () => {
    const s: Shop = shopFor((c) => {
      if (c.method === 'POST') return { status: 503, body: { error: 'X' } };
      if (path(c).startsWith('/reservations')) { s.show(UB); return { status: 200, body: envelope([]) }; }
      return undefined;
    });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(80);
    expect(posts().length).toBe(1);
    expect(p.snapshot()).toMatchObject({ state: 'indeterminate', autoReplayUsed: false });
  });
  it('rent commit-then-500: the /rentals ledger shows the rental: evidence only (unknown, advisory, the hold kept), never failed', async () => {
    shopFor((c) => {
      if (c.method === 'POST') return { status: 500, body: { error: 'X' } };
      if (path(c) === '/rentals') return { status: 200, body: envelope([{ id: 'r', status: 'active', server_id: 's1' }]) };
      return undefined;
    });
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await sleep(80);
    // A rent has no key, so the active rental may be another attempt's.
    expect(p.snapshot()).toMatchObject({ state: 'indeterminate', advisory: true, receipt: null });
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: false }]);
  });
  it('rent uncommitted 500: three clean reads then not-found; Retry asks for a fresh confirm, sends nothing', async () => {
    shopFor((c) => (c.method === 'POST' ? { status: 500, body: { error: 'X' } } : undefined));
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await sleep(100);
    expect(p.snapshot().state).toBe('not-found');
    expect(calls.filter((c) => path(c) === '/rentals').length).toBe(3);
    expect(p.retryRent()).toBe(true);
    expect(p.snapshot()).toMatchObject({ state: 'idle', reconfirm: true });
    expect(posts().length).toBe(1);
  });
  it('rent: an active rental of ANOTHER server is not this purchase (three clean reads then not-found)', async () => {
    shopFor((c) => {
      if (c.method === 'POST') return { status: 500, body: { error: 'X' } };
      if (path(c) === '/rentals') return { status: 200, body: envelope([{ id: 'r', status: 'active', server_id: 's2' }, { id: 'r2', status: 'ended', server_id: 's1' }]) };
      return undefined;
    });
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await sleep(100);
    expect(p.snapshot().state).toBe('not-found');
  });
  it('rent: a 2xx /rentals without the array is a failed read: indeterminate, never not-found', async () => {
    shopFor((c) => {
      if (c.method === 'POST') return { status: 500, body: { error: 'X' } };
      if (path(c) === '/rentals') return { status: 200, body: {} };
      return undefined;
    });
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await sleep(100);
    expect(p.snapshot().state).toBe('indeterminate');
  });
  it('rent Check again re-reads the ledger: a visible rental is evidence only (unknown, advisory, the hold kept)', async () => {
    let visible = false;
    shopFor((c) => {
      if (c.method === 'POST') return { status: 500, body: { error: 'X' } };
      if (path(c) === '/rentals') return { status: 200, body: envelope(visible ? [{ id: 'r', status: 'active', server_id: 's1' }] : []) };
      return undefined;
    });
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await vi.waitFor(() => expect(p.snapshot().state).toBe('not-found'), { timeout: 5000 });
    visible = true;
    expect(p.checkAgain()).toBe(true);
    // Polls instead of a fixed wait: a loaded whole-hub run can take longer than 40 ms for the re-read.
    await vi.waitFor(() => expect(p.snapshot()).toMatchObject({ state: 'indeterminate', advisory: true }), { timeout: 5000 });
    expect(p.snapshot().receipt).toBe(null);
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: false }]);
    expect(posts()).toHaveLength(1);
  });
  it('rent 500 PRICING_INVALID: failed directly, zero reconciliation reads', async () => {
    shopFor((c) => (c.method === 'POST' ? typedErr(500, 'PRICING_INVALID') : undefined));
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await vi.waitFor(() => expect(p.snapshot().state).toBe('failed'), { timeout: 5000 });
    expect(calls.filter((c) => path(c) === '/rentals').length).toBe(0);
  });
  it('rent 409 SERVER_UNAVAILABLE: ownership check (an owned rental is evidence only: unknown, advisory)', async () => {
    shopFor((c) => {
      if (c.method === 'POST') return typedErr(409, 'SERVER_UNAVAILABLE');
      if (path(c) === '/rentals') return { status: 200, body: envelope([{ id: 'r', status: 'active', server_id: 's1' }]) };
      return undefined;
    });
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await sleep(60);
    expect(p.snapshot()).toMatchObject({ state: 'indeterminate', advisory: true, entry: 'unavailable' });
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: false }]);
  });
  it('reserve: a replay non-2xx is indeterminate (only a replay 2xx proves the outcome)', async () => {
    shopFor((c) => (c.method === 'POST' ? { status: 500, body: { error: 'X' } } : undefined));
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(100);
    expect(posts().length).toBe(1);
    expect(p.snapshot().state).toBe('indeterminate');
    expect(p.retry()).toBe(true);
    await sleep(40);
    expect(posts().length).toBe(2);
    expect(p.snapshot().state).toBe('indeterminate');
  });
  it('reserve: a banned ambiguity read leaves at once and nothing is sent again (no write into a banned account)', async () => {
    shopFor((c) => {
      if (c.method === 'POST') return { status: 503, body: { error: 'X' } };
      if (path(c).startsWith('/reservations')) return BAN;
      return undefined;
    });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(80);
    expect(posts().length).toBe(1);
    expect(p.snapshot()).toMatchObject({ state: 'indeterminate', banned: true });
    expect(p.retry()).toBe(false);
  });
  it('reserve: manual Retry from indeterminate replays the SAME key and a replay 2xx confirms', async () => {
    let n = 0;
    shopFor((c) => {
      if (c.method !== 'POST') return undefined;
      n++;
      return n <= 1 ? { status: 500, body: { error: 'X' } } : { status: 201, body: reserve201(true) };
    });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(100);
    expect(p.snapshot().state).toBe('indeterminate');
    expect(posts()).toHaveLength(1);
    expect(p.retry()).toBe(true);
    await sleep(40);
    expect(new Set(posts().map((c) => c.body.idempotency_key)).size).toBe(1);
    expect(p.snapshot().state).toBe('confirmed');
  });
  it('reserve: Refresh reservations never moves the purchase state (advisory only)', async () => {
    shopFor((c) => (c.method === 'POST' ? { status: 500, body: { error: 'X' } } : undefined));
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(100);
    await p.refresh();
    expect(p.snapshot().state).toBe('indeterminate');
  });
  it('reserve: a reservations read that never answers is bounded: Refresh answers as a read failure, the state stays', async () => {
    // The answer-lost POST's own reconcile read answers (empty); only the later Refresh read never does.
    let hang = false;
    shopFor((c) => (c.method === 'POST' ? { status: 500, body: { error: 'X' } } : path(c).startsWith('/reservations') ? (hang ? new Promise<Reply>(() => undefined) : { status: 200, body: envelope([]) }) : undefined));
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(100);
    expect(p.snapshot().state).toBe('indeterminate');
    hang = true;
    let answered: boolean | null = null;
    void p.refresh().then((r) => { answered = r; });
    await sleep(bounds.read + bounds.slack + 50);
    expect(answered).toBe(true);
    expect(p.snapshot().state).toBe('indeterminate');
    expect(posts()).toHaveLength(1);
  });
  it('reserve: dismissal keeps the unresolved key: an identical re-confirm is refused, sends nothing; after the drop it is a NEW intent', async () => {
    shopFor((c) => (c.method === 'POST' ? { status: 500, body: { error: 'X' } } : undefined));
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(100);
    const k1 = posts()[0]!.body.idempotency_key as string, n = posts().length;
    expect(p.dismiss()).toBe(true);
    const q = createPurchase(rows().offer, '7');
    expect(q.confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    expect(q.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve' });
    await sleep(10);
    expect(posts().length).toBe(n);
    marketPendingDrop(k1);
    await sleep(10); // the drop runs under the pending-store lock (navigator.locks: granted asynchronously)
    const r = createPurchase(rows().offer, '7');
    expect(r.confirm(true)).toEqual({ ok: true });
    await sleep(10);
    expect(posts()[posts().length - 1]!.body.idempotency_key).not.toBe(k1);
  });
  it('reserve: a confirmed reservation spends its key: the next identical reserve is a NEW intent', async () => {
    shopFor((c) => (c.method === 'POST' ? { status: 201, body: reserve201() } : undefined));
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(30);
    expect(p.snapshot().state).toBe('confirmed');
    const q = createPurchase(rows().offer, '7');
    q.confirm(true);
    await sleep(30);
    const k = posts().map((c) => c.body.idempotency_key);
    expect(k.length).toBe(2);
    expect(k[1]).not.toBe(k[0]);
  });
  it('reserve: after a definitive refusal an identical re-confirm is a new intent (a new key; the first charged nothing)', async () => {
    shopFor((c) => (c.method === 'POST' ? { status: 400, body: { error: 'NOPE' } } : undefined));
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(30);
    expect(p.snapshot().state).toBe('failed');
    const q = createPurchase(rows().offer, '7');
    expect(q.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    const k = posts().map((c) => c.body.idempotency_key);
    expect(k).toHaveLength(2);
    expect(k[0]).not.toBe(k[1]);
  });
  it('a realm switch while the POST is out: outcome unknown (indeterminate, the pending notice), never failed', async () => {
    const s: Shop = shopFor((c) => { if (c.method === 'POST') { s.bump(); return { status: 201, body: RENT_201 }; } return undefined; });
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await sleep(80);
    expect(p.snapshot().state).toBe('indeterminate');
    expect(notices.length).toBe(1);
  });
  it('a POST refused before sending (a framed page) is failed (nothing happened): no reconciliation read', async () => {
    shopFor(() => undefined);
    testEnv.framed = true;
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await sleep(60);
    expect(p.snapshot().state).toBe('failed');
    expect(calls.length).toBe(0);
  });
  it('a framed page\'s lock (FRAMED_ACTION_REFUSED) is not sent: a reserve fails, no reconciliation read, its key dropped', async () => {
    shopFor(() => undefined);
    testEnv.framed = true;
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(60);
    expect(p.snapshot().state).toBe('failed');
    expect(calls.length).toBe(0);
  });
  it('a dead context before Confirm sends nothing and fails as not sent', async () => {
    const s = shopFor(() => ({ status: 201, body: RENT_201 }));
    const p = createPurchase(rows().stock, '1');
    s.bump();
    expect(p.confirm(true)).toEqual({ ok: false, reason: 'accountChanged' });
    await sleep(20);
    expect(posts()).toEqual([]);
  });
});

// ── Check status ──────────────────────────────────────────────────────
describe('parity: Market Check status (legacy hub-market checkStatus): only an authoritative is_banned === false lifts the ban', () => {
  // An indeterminate reserve whose Refresh hit ACCOUNT_BANNED: the latch blocks Retry.
  async function bannedReserve(me: (c: Call) => Reply) {
    let n = 0, ban = false;
    const s = shopFor((c) => {
      if (c.method === 'POST') { n++; return n <= 1 ? { status: 500, body: { error: 'X' } } : { status: 201, body: reserve201(true) }; }
      if (path(c).startsWith('/reservations') && ban) return BAN;
      if (path(c) === '/users/auth/me') return me(c);
      return undefined;
    });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(100);
    expect(p.snapshot()).toMatchObject({ state: 'indeterminate', banned: false });
    ban = true;
    await p.refresh();
    ban = false;
    expect(p.snapshot()).toMatchObject({ state: 'indeterminate', banned: true });
    expect(p.retry()).toBe(false);
    return { s, p };
  }
  it('is_banned === false clears the latch; Retry then replays the SAME key and the replay 2xx confirms', async () => {
    const { s, p } = await bannedReserve((c) => ({ status: 200, body: envelope({ id: uidOf(c), is_banned: false }) }));
    const key = p.snapshot().idemKey;
    expect(await checkStatus(s.ctx())).toBe('cleared');
    expect(p.snapshot().banned).toBe(false);
    expect(p.retry()).toBe(true);
    await sleep(40);
    expect(new Set(posts().map((c) => c.body.idempotency_key))).toEqual(new Set([key]));
    expect(p.snapshot().state).toBe('confirmed');
  });
  const KEEP: [string, (c: Call) => Reply, string][] = [
    ['is_banned true', (c) => ({ status: 200, body: envelope({ id: uidOf(c), is_banned: true }) }), 'still'],
    ['is_banned missing', (c) => ({ status: 200, body: envelope({ id: uidOf(c) }) }), 'unknown'],
    ['is_banned "false" (a string)', (c) => ({ status: 200, body: envelope({ id: uidOf(c), is_banned: 'false' }) }), 'unknown'],
    ['a malformed body', () => ({ status: 200, body: { statusCode: 200 } }), 'unknown'],
    ['another user\'s answer', () => ({ status: 200, body: envelope({ id: UB, is_banned: false }) }), 'unknown'],
    ['a failed read', () => ({ status: 500, body: { error: 'X' } }), 'failed'],
  ];
  for (const [what, me, want] of KEEP) {
    it(`${what} keeps the latch (${want}); Retry stays refused`, async () => {
      const { s, p } = await bannedReserve(me);
      expect(await checkStatus(s.ctx())).toBe(want);
      expect(p.snapshot().banned).toBe(true);
      expect(p.retry()).toBe(false);
    });
  }
  it('nothing latched: no request, "clear"', async () => {
    const s = shopFor(() => undefined);
    expect(await checkStatus(s.ctx())).toBe('clear');
    expect(calls).toEqual([]);
  });
  it('the Hub displaying someone else while the status read is out: the latch stays', async () => {
    const s: Shop = shopFor((c) => (path(c) === '/users/auth/me' ? (s.show(UB), { status: 200, body: envelope({ id: UA, is_banned: false }) }) : undefined));
    marketLatch.banned = true;
    expect(await checkStatus(s.ctx())).not.toBe('cleared');
    expect(marketLatch.banned).toBe(true);
  });
  it('on the real /users/auth/me answer without is_banned the ban latch is kept', async () => {
    const s = shopFor(() => undefined);
    marketLatch.banned = true;
    expect(await checkStatus(s.ctx())).toBe('unknown');
    expect(marketLatch.banned).toBe(true);
  });
  it('the latch is the account\'s: a sign-out / another account clears it, a realm switch keeps it', async () => {
    const { onBump } = await import('./ctx');
    void onBump;
    const { bump } = await import('./ctx');
    shopFor(() => undefined);
    marketLatch.banned = true;
    bump('realm');
    expect(marketLatch.banned).toBe(true);
    bump('account');
    expect(marketLatch.banned).toBe(false);
    marketLatch.banned = true;
    bump('signout');
    expect(marketLatch.banned).toBe(false);
  });
  it('the reservations terminal latch ends with the account, not with a realm switch', async () => {
    const { bump } = await import('./ctx');
    const all = [row('a')];
    const s = resShop(all);
    const w = await walkReservations(s.ctx());
    all[0] = row('a', 'refunded');
    await pollReservations(s.ctx(), w);
    all[0] = row('a', 'pending');
    bump('realm');
    expect((await walkReservations(s.ctx())).rows[0]!.state).toBe('refunded');
    bump('account');
    expect((await walkReservations(s.ctx())).rows[0]!.state).toBe('pending');
  });
});

// ── Rent: post-response owner checks ──────────────────────────────────
describe('rent never confirms for an owner who stopped holding (post-response owner checks)', () => {
  for (const [dir, me, other] of DIRS) {
    it(`${dir}: the Hub displays another user when the rent 2xx arrives: not confirmed, no reads`, async () => {
      const s: Shop = shopFor((c) => (c.method === 'POST' ? (s.show(other), { status: 201, body: RENT_201 }) : undefined), { me });
      const p = createPurchase(rows().stock, '1');
      p.confirm(true);
      await sleep(60);
      expect(p.snapshot().state).toBe('indeterminate');
      expect(p.snapshot().receipt).toBe(null);
      expect(calls.filter((c) => path(c) === '/rentals')).toEqual([]);
    });
    it(`${dir}: the Hub displays another user while the recovery read is out: its match never confirms`, async () => {
      const s: Shop = shopFor((c) => {
        if (c.method === 'POST') return { status: 500, body: { error: 'X' } };
        if (path(c) === '/rentals') { s.show(other); return { status: 200, body: envelope([{ id: 'r', status: 'active', server_id: 's1' }]) }; }
        return undefined;
      }, { me });
      const p = createPurchase(rows().stock, '1');
      p.confirm(true);
      await sleep(80);
      expect(p.snapshot().state).toBe('indeterminate');
      expect(p.snapshot().receipt).toBe(null);
      expect(calls.filter((c) => path(c) === '/rentals').length).toBe(1);
    });
    it(`${dir}: control, the same identity throughout: the 2xx confirms and the recovery match is read (evidence)`, async () => {
      shopFor((c) => (c.method === 'POST' ? { status: 201, body: RENT_201 } : undefined), { me });
      const p = createPurchase(rows().stock, '1');
      p.confirm(true);
      await sleep(60);
      expect(p.snapshot().state).toBe('confirmed');
      shopFor((c) => {
        if (c.method === 'POST') return { status: 500, body: { error: 'X' } };
        if (path(c) === '/rentals') return { status: 200, body: envelope([{ id: 'r', status: 'active', server_id: 's1' }]) };
        return undefined;
      }, { me });
      const p2 = createPurchase(rows().stock, '1');
      p2.confirm(true);
      await sleep(80);
      expect(p2.snapshot()).toMatchObject({ state: 'indeterminate', advisory: true });
    });
  }
});

// ── Posting budget fence ──────────────────────────────────────────────
describe('a Market dispatch whose posting budget expired is never sent (per-dispatch fence)', () => {
  // The old suite held the request on the 2FA module (hub.otpGate). On the real core the same wait is the 2FA prompt:
  // the first POST is answered OTP_REQUIRED, the prompt (a test gate) answers later, and only then would the retry
  // carrying the code go out. api.ts checks the dispatch signal right before that second send.
  const asks: string[] = [];
  function otpShop(ok: (c: Call) => Reply | undefined) {
    const g = gate();
    setOtpPrompt({ ask: () => g.p.then(() => { asks.push('code'); return '123456'; }), cancel: () => undefined });
    shopFor((c) => {
      if (c.method === 'POST') {
        if (!(c.body && c.body.otp_code)) return typedErr(403, 'OTP_REQUIRED');
        return ok(c);
      }
      return undefined;
    });
    return g;
  }
  afterEach(() => { setOtpPrompt(null); asks.length = 0; });
  const withCode = () => calls.filter((c) => c.method === 'POST' && c.body && c.body.otp_code);
  it('rent waiting on the 2FA prompt past its budget: nothing was applied, and answering the prompt later sends nothing', async () => {
    const g = otpShop(() => ({ status: 201, body: RENT_201 }));
    Object.assign(budgets, { postingMs: 40 });
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await sleep(120);
    expect(['not-found', 'indeterminate']).toContain(p.snapshot().state);
    g.open();
    await sleep(40);
    expect(withCode()).toEqual([]);
  });
  it('reserve: the first POST never leaves after its own budget expired, and nothing is sent again by itself', async () => {
    const g = otpShop(() => ({ status: 201, body: reserve201() }));
    Object.assign(budgets, { postingMs: 30 });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(200);
    expect(['indeterminate', 'reconciling']).toContain(p.snapshot().state);
    g.open();
    await sleep(40);
    expect(withCode()).toEqual([]);
  });
  it('a manual Retry (same key) gets a fresh fence: sent once the prompt is answered', async () => {
    const g = otpShop(() => ({ status: 201, body: reserve201(true) }));
    Object.assign(budgets, { postingMs: 30 });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(200);
    g.open();
    await sleep(30);
    expect(p.snapshot().state).toBe('indeterminate');
    expect(p.retry()).toBe(true);
    await sleep(80);
    expect(withCode().length).toBe(1);
    expect(withCode()[0]!.body.idempotency_key).toBe(p.snapshot().idemKey);
    expect(p.snapshot().state).toBe('confirmed');
  });
  it('control: the prompt is answered within the budget: the rent is sent once with the code and confirms', async () => {
    const g = otpShop(() => ({ status: 201, body: RENT_201 }));
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await sleep(20);
    g.open();
    await sleep(60);
    expect(withCode().length).toBe(1);
    expect(p.snapshot().state).toBe('confirmed');
  });
});

// ── the Add funds continuation of the Market ─────────────────────────────
describe('parity: the Market continuation after Add funds', () => {
  it('Add funds from a purchase leaves the listing to come back to; a valid one reads back, clear removes it', () => {
    shopFor(() => undefined);
    setMarketResume(rows().offer, '7');
    expect(marketResume()).toMatchObject({ kind: 'offer', id: 'o1', days: '7' });
    clearMarketResume();
    expect(marketResume()).toBe(null);
  });
  it('the continuation reopens a NEW dialog, which takes the identity displayed then (no carried owner)', async () => {
    const s = shopFor((c) => (c.method === 'POST' ? { status: 201, body: reserve201() } : undefined));
    setMarketResume(rows().offer, '7');
    s.show(null);
    const p = createPurchase(rows().offer, marketResume()!.days);
    expect(p.confirm(true)).toEqual({ ok: false, reason: 'accountChanged' });
    await sleep(10);
    expect(posts()).toEqual([]);
  });
});

// ── the reserve pending store ───────────────────────────
describe('the unresolved reserve intent is kept in hub_market_pending, per owner, until its outcome is known', () => {
  const lost = (c: Call): Reply | undefined => (c.method === 'POST' ? { status: 500, body: { error: 'X' } } : undefined);
  const stored = () => JSON.parse(localStorage.getItem('hub_market_pending') || '[]') as Array<Record<string, unknown>>;
  async function unknown(o: { local?: Record<string, string> } = {}) {
    const s = shopFor(lost, o);
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(100);
    expect(p.snapshot().state).toBe('indeterminate');
    return { s, p, key: posts()[0]!.body.idempotency_key as string };
  }
  it('an outcome-unknown reserve stores its key and intent under the user it was sent as (never a token)', async () => {
    const { key } = await unknown();
    const e = stored();
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ user_id: UA, offer_id: 'o1', days: '7', key });
    expect(JSON.stringify(e)).not.toContain(localStorage.getItem('access_token')!);
  });
  it('after a reload: the same user sees it; recover starts at Outcome unknown and Retry replays the SAME key (one charge)', async () => {
    const { key } = await unknown();
    const snap = snapshotStores();
    let n = 0;
    const t = shopFor((c) => (c.method === 'POST' ? (n++, { status: 200, body: reserve201(true) }) : undefined), { local: snap.local });
    const [rec, ...more] = marketPendingFor(t.ctx());
    expect(more).toHaveLength(0);
    expect(rec!.key).toBe(key);
    const p = createPurchase(rows().offer, rec!.days, { recover: rec });
    expect(p.snapshot()).toMatchObject({ state: 'indeterminate', idemKey: key });
    expect(posts()).toHaveLength(0);
    expect(p.retry()).toBe(true);
    await sleep(40);
    expect(p.snapshot().state).toBe('confirmed');
    expect(posts().map((c) => c.body.idempotency_key)).toEqual([key]);
    expect(n).toBe(1);
    expect(localStorage.getItem('hub_market_pending')).toBeNull();
  });
  it('after a reload a fresh Confirm of the same offer is refused and sends nothing, whatever its total; the entry stays', async () => {
    const { key } = await unknown();
    const t = shopFor((c) => (c.method === 'POST' ? { status: 200, body: reserve201(true) } : undefined), { local: snapshotStores().local });
    for (const requote of [undefined, { days: '7', totalCents: 123456 }]) {
      const p = createPurchase(rows().offer, '7', { requote });
      expect(p.confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
      expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve', idemKey: null });
    }
    await sleep(20);
    expect(posts()).toHaveLength(0);
    expect(stored().map((e) => e.key)).toEqual([key]);
    void t;
  });
  it('committed, answers lost, reload, Check, Retry gets 429: still unknown, entry kept; a later resend replays the SAME key: one charge', async () => {
    // An idempotent shop: one reservation per key; the first request commits and both its answers are lost.
    const charges = new Map<string, number>();
    let mode: 'lose' | '429' | 'ok' = 'lose';
    const on = (c: Call): Reply | undefined => {
      if (c.method !== 'POST') return undefined;
      const k = c.body.idempotency_key as string;
      if (mode === '429') return typedErr(429, 'TOO_MANY_REQUESTS');
      const had = charges.has(k);
      if (!had) charges.set(k, 1);
      if (mode === 'lose') return { status: 500, body: { error: 'X' } };
      return { status: had ? 200 : 201, body: reserve201(had) };
    };
    shopFor(on);
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(100);
    expect(p.snapshot().state).toBe('indeterminate');
    const key = posts()[0]!.body.idempotency_key as string;
    mode = '429';
    const t = shopFor(on, { local: snapshotStores().local });
    const [rec] = marketPendingFor(t.ctx());
    const q = createPurchase(rows().offer, rec!.days, { recover: rec });
    expect(q.retry()).toBe(true);
    await sleep(40);
    expect(q.snapshot().state).toBe('indeterminate');
    expect(q.dismiss()).toBe(true);
    expect(stored().map((e) => e.key)).toEqual([key]);
    mode = 'ok';
    const u = shopFor(on, { local: snapshotStores().local });
    const [rec2] = marketPendingFor(u.ctx());
    const r = createPurchase(rows().offer, rec2!.days, { recover: rec2 });
    expect(r.retry()).toBe(true);
    await sleep(40);
    expect(r.snapshot()).toMatchObject({ state: 'confirmed', replayed: true });
    expect([...charges.values()].reduce((a, b) => a + b, 0)).toBe(1);
    expect(localStorage.getItem('hub_market_pending')).toBeNull();
  });
  it('two machines rebuilt from one kept reservation; a 429 on one holds the other\'s resend too', async () => {
    let mode: 'lose' | '429' = 'lose';
    const on = (c: Call): Reply | undefined => {
      if (c.method !== 'POST') return undefined;
      if (mode === '429') return { ...typedErr(429, 'TOO_MANY_REQUESTS'), headers: { 'retry-after': '30' } };
      return { status: 500, body: { error: 'X' } };
    };
    shopFor(on);
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(100);
    expect(p.snapshot().state).toBe('indeterminate');
    const t = shopFor(on, { local: snapshotStores().local });
    const [rec] = marketPendingFor(t.ctx());
    // Both are built before any 429: the second cannot have copied a deadline at construction.
    const q = createPurchase(rows().offer, rec!.days, { recover: rec });
    const r = createPurchase(rows().offer, rec!.days, { recover: rec });
    mode = '429';
    expect(q.retry()).toBe(true);
    await sleep(40);
    expect(q.snapshot()).toMatchObject({ state: 'indeterminate' });
    expect(q.snapshot().retryIn).toBeGreaterThan(0);
    const sent = posts().length;
    expect(r.snapshot().retryIn).toBeGreaterThan(0);
    expect(r.retry()).toBe(false);
    await sleep(20);
    expect(posts()).toHaveLength(sent);
  });
  it('a 429 in tab A holds a confirmed resend in tab B until its deadline (kept on the stored reservation)', async () => {
    let mode: 'lose' | '429' | 'ok' = 'lose';
    const on = (c: Call): Reply | undefined => {
      if (c.method !== 'POST') return undefined;
      if (mode === '429') return { ...typedErr(429, 'TOO_MANY_REQUESTS'), headers: { 'retry-after': '30' } };
      if (mode === 'ok') return { status: 200, body: reserve201(true) };
      return { status: 500, body: { error: 'X' } };
    };
    shopFor(on);
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(100);
    expect(p.snapshot().state).toBe('indeterminate');
    // Tab A: the kept reservation's resend gets a 429 (Retry-After 30 s).
    const a = shopFor(on, { local: snapshotStores().local });
    const [recA] = marketPendingFor(a.ctx());
    const q = createPurchase(rows().offer, recA!.days, { recover: recA });
    mode = '429';
    expect(q.retry()).toBe(true);
    await sleep(40);
    expect(q.snapshot().retryIn).toBeGreaterThan(0);
    const until = stored()[0]!.retry_until as number;
    expect(until).toBeGreaterThan(Date.now());
    // Tab B: its own module memory (no in-tab deadline), the same storage.
    resetCommerce();
    const b = shopFor(on, { local: snapshotStores().local });
    const [recB] = marketPendingFor(b.ctx());
    const r = createPurchase(rows().offer, recB!.days, { recover: recB });
    const sent = posts().length;
    expect(r.snapshot().retryIn).toBeGreaterThan(0);
    expect(r.retry()).toBe(false);
    await sleep(20_000);
    expect(r.retry()).toBe(false);
    expect(posts()).toHaveLength(sent);
    // Once the deadline passed, the same confirmed resend goes, under the same key.
    await sleep(Math.max(0, until - Date.now()) + 1000);
    mode = 'ok';
    expect(r.snapshot().retryIn).toBe(0);
    expect(r.retry()).toBe(true);
    await sleep(40);
    expect(posts()).toHaveLength(sent + 1);
    expect(posts().at(-1)!.body.idempotency_key).toBe(recA!.key);
  });
  it('a 429 another tab records while this tab\'s Retry waits on the pending lock holds the resend (nothing sent)', async () => {
    const { key } = await unknown();
    const t = shopFor((c) => (c.method === 'POST' ? { status: 200, body: reserve201(true) } : undefined), { local: snapshotStores().local });
    const [rec] = marketPendingFor(t.ctx());
    const r = createPurchase(rows().offer, rec!.days, { recover: rec });
    const sent = posts().length;
    const locks = heldLocks();
    locks.hold();
    // The early check reads no deadline: the Retry is admitted to the lock, nothing sent yet.
    expect(r.retry()).toBe(true);
    expect(r.snapshot().retrying).toBe(true);
    // Tab A's 429 deadline lands on the stored entry before this tab's admission is granted.
    const until = Date.now() + 30_000;
    localStorage.setItem('hub_market_pending', JSON.stringify(stored().map((e) => (e.key === key ? { ...e, retry_until: until } : e))));
    locks.release();
    await vi.waitFor(() => expect(r.snapshot().retrying).toBe(false), { timeout: 5000 });
    await sleep(20);
    expect(posts()).toHaveLength(sent);
    expect(r.snapshot()).toMatchObject({ state: 'indeterminate', idemKey: key });
    expect(r.snapshot().retryIn).toBeGreaterThan(0);
    expect(r.retry()).toBe(false);
  });
  for (const [what, change] of [
    ['settled and dropped', (list: Array<Record<string, unknown>>) => list.filter((e) => e.key !== list[0]!.key)],
    ['replaced by a new key', (list: Array<Record<string, unknown>>) => list.map((e) => ({ ...e, key: 'othertab-key-000000000001' }))],
    ['changed (another ceiling)', (list: Array<Record<string, unknown>>) => list.map((e) => ({ ...e, ceiling: (e.ceiling as number) + 100 }))],
  ] as const) {
    it(`the kept request ${what} by another tab while this Retry waits on the lock: nothing is sent`, async () => {
      const { key } = await unknown();
      const t = shopFor((c) => (c.method === 'POST' ? { status: 200, body: reserve201(true) } : undefined), { local: snapshotStores().local });
      const [rec] = marketPendingFor(t.ctx());
      const r = createPurchase(rows().offer, rec!.days, { recover: rec });
      const sent = posts().length;
      const locks = heldLocks();
      locks.hold();
      expect(r.retry()).toBe(true);
      localStorage.setItem('hub_market_pending', JSON.stringify(change(stored())));
      locks.release();
      await vi.waitFor(() => expect(r.snapshot().retrying).toBe(false), { timeout: 5000 });
      await sleep(20);
      expect(posts()).toHaveLength(sent);
      expect(r.snapshot()).toMatchObject({ state: 'indeterminate', idemKey: key });
    });
  }
  it('a kept store that cannot be read at the Retry\'s admission sends nothing (fail closed)', async () => {
    await unknown();
    const t = shopFor((c) => (c.method === 'POST' ? { status: 200, body: reserve201(true) } : undefined), { local: snapshotStores().local });
    const [rec] = marketPendingFor(t.ctx());
    const r = createPurchase(rows().offer, rec!.days, { recover: rec });
    const sent = posts().length;
    const locks = heldLocks();
    locks.hold();
    expect(r.retry()).toBe(true);
    breakKey('getItem', 'hub_market_pending', 'throw');
    locks.release();
    await vi.waitFor(() => expect(r.snapshot().retrying).toBe(false), { timeout: 5000 });
    await sleep(20);
    expect(posts()).toHaveLength(sent);
    expect(r.snapshot().state).toBe('indeterminate');
  });
  it('the recovery replays the stored request byte for byte (term, ceiling, key), never the current quote', async () => {
    const { key } = await unknown();
    const sent = posts()[0]!.body;
    const t = shopFor((c) => (c.method === 'POST' ? { status: 200, body: reserve201(true) } : undefined), { local: snapshotStores().local });
    const [rec] = marketPendingFor(t.ctx());
    const q = createPurchase(rows().offer, rec!.days, { recover: { ...rec! } });
    q.retry();
    await sleep(40);
    expect(posts()[0]!.body).toEqual(sent);
    expect(posts()[0]!.body.idempotency_key).toBe(key);
  });
  it('another account sees none of it and its own purchase is a new intent; A\'s entry stays for A', async () => {
    const { key } = await unknown();
    const entry = stored()[0] as never;
    const snap = snapshotStores().local;
    delete snap.access_token; delete snap.refresh_token;
    const t = shopFor((c) => (c.method === 'POST' ? { status: 201, body: reserve201() } : undefined), { local: snap, me: UB });
    expect(marketPendingFor(t.ctx())).toEqual([]);
    const p = createPurchase(rows().offer, '7', { recover: entry });
    expect(p.snapshot().state).toBe('idle');
    p.confirm(true);
    await sleep(40);
    expect(posts()[posts().length - 1]!.body.idempotency_key).not.toBe(key);
    expect(stored().map((e) => e.user_id)).toEqual([UA]);
  });
  it('the entry goes on a 2xx, on a definitive failure and on an explicit drop; a dismissal keeps it', async () => {
    shopFor((c) => (c.method === 'POST' ? { status: 201, body: reserve201() } : undefined));
    const p1 = createPurchase(rows().offer, '7');
    p1.confirm(true);
    await sleep(40);
    expect(localStorage.getItem('hub_market_pending')).toBeNull();
    shopFor((c) => (c.method === 'POST' ? typedErr(409, 'OFFER_UNAVAILABLE') : undefined));
    const p2 = createPurchase(rows().offer, '7');
    p2.confirm(true);
    await sleep(60);
    expect(p2.snapshot().state).toBe('failed');
    expect(localStorage.getItem('hub_market_pending')).toBeNull();
    const a = await unknown();
    expect(a.p.dismiss()).toBe(true);
    expect(stored().map((e) => e.key)).toEqual([a.key]);
    const u = await unknown();
    marketPendingDrop(u.key);
    await sleep(10); // under the pending-store lock (navigator.locks: granted asynchronously)
    expect(localStorage.getItem('hub_market_pending')).toBeNull();
  });
  it('the registry keeps hub_market_pending (local, purge:false): a sign-out keeps the key of an unknown charge', async () => {
    const { key } = await unknown();
    const { shared } = await import('./session');
    const sh = shared() as unknown as { clearAuthTokens: () => void };
    sh.clearAuthTokens();
    expect(stored().map((e) => e.key)).toEqual([key]);
  });
  it('a storage write that throws refuses the reservation before anything is sent', async () => {
    shopFor(lost);
    breakKey('setItem', 'hub_market_pending', 'throw');
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'storageFailed', idemKey: null });
    expect(posts()).toHaveLength(0);
    // Rent keeps no key and is not affected.
    const r = createPurchase(rows().stock, '1');
    expect(r.confirm(true)).toEqual({ ok: true });
  });
  // A write that landed (setItem did not throw) whose
  // read-back cannot prove the key may still leave it in the store for another tab to recover and send. Nothing left
  // from this tab, but the outcome is unknown (this item's unresolved reserve), never "not sent".
  it('a write that is silently dropped (read-back finds nothing) sends nothing; outcome unknown (unresolvedReserve)', async () => {
    shopFor(lost);
    breakKey('setItem', 'hub_market_pending', 'drop');
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve', idemKey: null });
    expect(posts()).toHaveLength(0);
  });
  // That reserve's key may be gone (another tab sent and dropped it), so this tab
  // remembers it per owner, offer and term: a fresh machine of that term refuses its Confirm (unresolved, nothing sent)
  // until the person's Start a new purchase forgets it. Another term is not held by it.
  it('an unresolved reserve whose write landed is remembered for its term; a fresh Confirm of it sends nothing', async () => {
    shopFor(lost);
    breakKey('setItem', 'hub_market_pending', 'drop');
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve' });
    p.dispose();
    restoreStorage();
    expect(stored()).toEqual([]);
    expect(reserveUnknownFor(capture(), 'o1', '7')).toEqual({ since: expect.any(Number) as unknown as number, days: '7' });
    // The hold is the offer's, any term (the earlier term kept for its evidence).
    expect(reserveUnknownFor(capture(), 'o1', '30')).toEqual({ since: expect.any(Number) as unknown as number, days: '7' });
    expect(reserveUnknownFor(capture(), 'o2', '7')).toBeNull();
    const other = createPurchase(M.normalizeOfferRow(offerRaw({ pricing_rules: { '7': 7000, '30': 25000 }, hold_rules: { '7': 2, '30': 2 } }), 0), '30');
    expect(other.confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    other.dispose();
    const q = createPurchase(rows().offer, '7');
    expect(q.confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    expect(q.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve', idemKey: null });
    await sleep(30);
    expect(posts()).toHaveLength(0);
    q.dispose();
    expect(await reserveUnknownAbandon(capture(), 'o1', '7')).toBe('dropped');
    expect(reserveUnknownFor(capture(), 'o1', '7')).toBeNull();
    const r = createPurchase(rows().offer, '7');
    expect(r.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
  });
  // A dialog disposed while its admission waits (the drawer closed) still leaves the hold.
  it('disposed while the admission waits, the landed write is still remembered', async () => {
    shopFor(lost);
    breakKey('setItem', 'hub_market_pending', 'drop');
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    p.dispose();
    await sleep(30);
    expect(posts()).toHaveLength(0);
    expect(reserveUnknownFor(capture(), 'o1', '7')).toEqual({ since: expect.any(Number) as unknown as number, days: '7' });
  });
  // An admission that passed the early check before the hold existed is refused under the lock.
  it('an admission already past the early check is refused under the lock once the hold exists', async () => {
    shopFor(lost);
    // Only the first admission's write is dropped: the second, waiting behind it, would write and send its own key.
    breakKey('setItem', 'hub_market_pending', 'drop', [1]);
    const a = createPurchase(rows().offer, '7');
    const b = createPurchase(rows().offer, '7');
    expect(a.confirm(true)).toEqual({ ok: true });
    expect(b.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    restoreStorage();
    expect(a.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve' });
    expect(b.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve' });
    expect(posts()).toHaveLength(0);
    expect(stored()).toEqual([]);
  });
  // Start a new purchase on the remembered hold forgets it only when no key of the offer is kept.
  it('the hold is not forgotten while a key of the offer is kept, nor when the store cannot say', async () => {
    shopFor(lost);
    breakKey('setItem', 'hub_market_pending', 'drop');
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    p.dispose();
    restoreStorage();
    const key = 'kept-other-term-key-000001';
    localStorage.setItem('hub_market_pending', JSON.stringify([{ user_id: UA, offer_id: 'o1', days: '30', ceiling: 9900, key, at: Date.now(), name: 'srv-1' }]));
    expect(stored().map((e) => e.key)).toEqual([key]);
    expect(await reserveUnknownAbandon(capture(), 'o1', '7')).toBe('kept');
    expect(reserveUnknownFor(capture(), 'o1', '7')).not.toBeNull();
    breakKey('getItem', 'hub_market_pending', 'throw');
    expect(await reserveUnknownAbandon(capture(), 'o1', '7')).toBe('failed');
    restoreStorage();
    expect(reserveUnknownFor(capture(), 'o1', '7')).not.toBeNull();
    expect(stored().map((e) => e.key)).toEqual([key]);
  });
  // MONEY: Start a new purchase on a remembered reserve forgets only the term its dialog showed. A hold of another term
  // was never shown there and may still go through, so it keeps holding the offer (no fresh Confirm beside it).
  it('the abandon forgets only the named term; a hold of another term stays and still refuses a Confirm', async () => {
    shopFor(lost);
    breakKey('setItem', 'hub_market_pending', 'drop');
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    p.dispose();
    restoreStorage();
    expect(stored()).toEqual([]);
    expect(await reserveUnknownAbandon(capture(), 'o1', '30')).toBe('dropped');
    expect(reserveUnknownFor(capture(), 'o1', '7')).toEqual({ since: expect.any(Number) as unknown as number, days: '7' });
    expect(reserveUnknownFor(capture(), 'o1', '30')).toEqual({ since: expect.any(Number) as unknown as number, days: '7' });
    const q = createPurchase(rows().offer, '7');
    expect(q.confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    q.dispose();
    expect(await reserveUnknownAbandon(capture(), 'o1', '7')).toBe('dropped');
    expect(reserveUnknownFor(capture(), 'o1', '7')).toBeNull();
    await sleep(30);
    expect(posts()).toHaveLength(0);
  });
  // The keyed Start a new purchase forgets a remembered hold only when it is that key's own.
  // Hold A (this tab's admission, its key gone from the store) and a kept key B of the same term: abandoning B leaves A,
  // which still refuses a fresh Confirm (its outcome is unknown).
  it('forgetting after a keyed abandon takes only the hold of that key; another key\'s hold of the term stays', async () => {
    shopFor(lost);
    breakKey('setItem', 'hub_market_pending', 'drop');
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    p.dispose();
    restoreStorage();
    const keyB = 'kept-same-term-key-b-00001';
    localStorage.setItem('hub_market_pending', JSON.stringify([{ user_id: UA, offer_id: 'o1', days: '7', ceiling: 9900, key: keyB, at: Date.now(), name: 'srv-1' }]));
    expect(await marketPendingAbandon(capture(), keyB)).toBe('dropped');
    expect(reserveUnknownForget(capture(), 'o1', '7', keyB)).toBe(false);
    expect(reserveUnknownFor(capture(), 'o1', '7')).toEqual({ since: expect.any(Number) as unknown as number, days: '7' });
    const q = createPurchase(rows().offer, '7');
    expect(q.confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    q.dispose();
    await sleep(30);
    expect(posts()).toHaveLength(0);
  });
  it('the hold of the abandoned key itself goes with it', async () => {
    shopFor(lost);
    // The admission's write lands with other bytes (its read-back cannot prove it): the hold carries that key, and the
    // store keeps the entry, so the drawer shows it as the kept request.
    let written: string | null = null;
    rewriteKey('hub_market_pending', (v) => {
      const list = JSON.parse(v) as Array<Record<string, unknown>>;
      const last = list[list.length - 1]!;
      written = last.key as string;
      last.ceiling = (last.ceiling as number) + 1;
      return JSON.stringify(list);
    });
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    p.dispose();
    restoreStorage();
    expect(written).not.toBeNull();
    expect(reserveUnknownFor(capture(), 'o1', '7')).not.toBeNull();
    expect(await marketPendingAbandon(capture(), written)).toBe('dropped');
    expect(reserveUnknownForget(capture(), 'o1', '7', written)).toBe(true);
    expect(reserveUnknownFor(capture(), 'o1', '7')).toBeNull();
  });
  // A forget whose context is no longer the shown account's does nothing (fail closed: the
  // hold stays), so a late completion never forgets the next account's hold.
  it('a forget under a context that is no longer live forgets nothing, even for the hold of that key', async () => {
    shopFor(lost);
    let written: string | null = null;
    rewriteKey('hub_market_pending', (v) => {
      const list = JSON.parse(v) as Array<Record<string, unknown>>;
      const last = list[list.length - 1]!;
      written = last.key as string;
      last.ceiling = (last.ceiling as number) + 1;
      return JSON.stringify(list);
    });
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    p.dispose();
    restoreStorage();
    const stale = capture();
    bump('switch');
    expect(reserveUnknownForget(stale, 'o1', '7', written)).toBe(false);
    expect(reserveUnknownFor(capture(), 'o1', '7')).not.toBeNull();
    // Under a live context the same call forgets it (the refusal above was the context's).
    expect(reserveUnknownForget(capture(), 'o1', '7', written)).toBe(true);
  });
  it('a refusal whose own write never landed is not remembered', async () => {
    shopFor(lost);
    breakKey('setItem', 'hub_market_pending', 'throw');
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'storageFailed' });
    expect(reserveUnknownFor(capture(), 'o1', '7')).toBeNull();
  });
  it('a read-back holding other bytes under the key (another intent) sends nothing; outcome unknown, the entry kept', async () => {
    shopFor(lost);
    rewriteKey('hub_market_pending', (v) => JSON.stringify((JSON.parse(v) as Array<{ ceiling: number }>).map((e) => ({ ...e, ceiling: e.ceiling + 1 }))));
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve', idemKey: null });
    expect(posts()).toHaveLength(0);
    expect(stored()).toHaveLength(1);
  });
  // A store that cannot be READ is not an empty store. Reads of hub_market_pending in a reserve Confirm, in
  // order: 1 the early unresolved lookup, 2 the locked unresolved lookup, 3 the insert read, 4 the read-back; 5 the cleanup after the answer.
  const other = { user_id: UA, offer_id: 'o2', days: '30', ceiling: 9900, key: 'other-offer-key-0000000001', at: 1, name: 'srv-2' };
  it('an unreadable store at the unresolved lookup refuses the reservation unsent; the earlier entry stays', async () => {
    const { key } = await unknown();
    shopFor(lost, { local: snapshotStores().local });
    breakKey('getItem', 'hub_market_pending', 'throw', [1]);
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: false, reason: 'storage' });
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'storageFailed', idemKey: null });
    await sleep(30);
    expect(posts()).toHaveLength(0);
    restoreStorage();
    expect(stored().map((e) => e.key)).toEqual([key]);
  });
  it('an unreadable store at the insert read refuses unsent and never overwrites another offer\'s entry', async () => {
    shopFor(lost, { local: { hub_market_pending: JSON.stringify([other]) } });
    breakKey('getItem', 'hub_market_pending', 'throw', [3]);
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'storageFailed' });
    expect(posts()).toHaveLength(0);
    restoreStorage();
    expect(stored()).toEqual([other]);
  });
  it('an unreadable read-back after a landed write sends nothing; outcome unknown, the key kept', async () => {
    shopFor(lost);
    breakKey('getItem', 'hub_market_pending', 'throw', [4]);
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(30);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve', idemKey: null });
    expect(posts()).toHaveLength(0);
    restoreStorage();
    expect(stored()).toHaveLength(1);
  });
  it('cleanup on an unreadable store changes nothing (2xx, definitive refusal, explicit drop)', async () => {
    shopFor((c) => (c.method === 'POST' ? { status: 201, body: reserve201() } : undefined), { local: { hub_market_pending: JSON.stringify([other]) } });
    // Reads 1-4: the early check, the locked check, the persist and its read-back; 5-6: the flight's registration and
    // its read-back (marketFlightAdd); 7: the send point (marketSendGate); 8-9: the cleanups (the flight's and the 2xx's
    // drop), whichever runs first.
    breakKey('getItem', 'hub_market_pending', 'throw', [8, 9]);
    const p1 = createPurchase(rows().offer, '7');
    p1.confirm(true);
    await sleep(40);
    expect(p1.snapshot().state).toBe('confirmed');
    restoreStorage();
    // The other offer's entry survives; this one's key stays too (a later resend replays it: idempotent, one charge).
    expect(stored().map((e) => e.offer_id).sort()).toEqual(['o1', 'o2']);
    shopFor((c) => (c.method === 'POST' ? typedErr(409, 'OFFER_UNAVAILABLE') : undefined), { local: { hub_market_pending: JSON.stringify([other]) } });
    breakKey('getItem', 'hub_market_pending', 'throw', [8, 9]);
    const p2 = createPurchase(rows().offer, '7');
    p2.confirm(true);
    await sleep(60);
    expect(p2.snapshot().state).toBe('failed');
    restoreStorage();
    expect(stored().map((e) => e.offer_id).sort()).toEqual(['o1', 'o2']);
    const u = await unknown();
    breakKey('getItem', 'hub_market_pending', 'throw', [1]);
    marketPendingDrop(u.key);
    restoreStorage();
    expect(stored().map((e) => e.key)).toEqual([u.key]);
  });
  it('garbage in the store is ignored, never trusted', () => {
    const s = shopFor(lost);
    localStorage.setItem('hub_market_pending', JSON.stringify([{ user_id: UA, offer_id: '<x>', days: '7', ceiling: 1, key: 'k', at: 1 }, 5, null]));
    expect(marketPendingFor(s.ctx())).toEqual([]);
    localStorage.setItem('hub_market_pending', '{not json');
    expect(marketPendingFor(s.ctx())).toEqual([]);
  });
  // Start a new purchase
  // tombstones a kept reservation only when no send of it may be on the wire, and every send point of a reserve
  // (the transport's last check before fetch, a 2FA retry included) refuses a tombstone or a missing entry.
  describe('marketPendingAbandon and the send point: a tombstoned or gone key never leaves', () => {
    const otpGate = () => {
      const g = gate();
      setOtpPrompt({ ask: () => g.p.then(() => '123456'), cancel: () => undefined });
      return g;
    };
    const otpLost = (c: Call): Reply | undefined => {
      if (c.method !== 'POST') return undefined;
      if (!(c.body && c.body.otp_code)) return typedErr(403, 'OTP_REQUIRED');
      return { status: 500, body: { error: 'X' } };
    };
    const sentWith = (key: string) => posts().filter((c) => c.body.idempotency_key === key);
    afterEach(() => { setOtpPrompt(null); });
    it('a first send held on the 2FA prompt (its first leg went out): the abandon answers inflight, keeps the key, and the code then sends it', async () => {
      const g = otpGate();
      const s = shopFor(otpLost);
      const p = createPurchase(rows().offer, '7');
      p.confirm(true);
      await sleep(20);
      const [first] = posts();
      const key = first!.body.idempotency_key as string;
      expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('inflight');
      expect(stored().map((e) => [e.key, e.abandoned_at])).toEqual([[key, undefined]]);
      g.open();
      await sleep(50);
      expect(sentWith(key).filter((c) => c.body.otp_code)).toHaveLength(1);
    });
    it('a 2FA leg after the key went (another tab confirmed it, the entry dropped): the leg is refused at its send point', async () => {
      const g = otpGate();
      shopFor(otpLost);
      const p = createPurchase(rows().offer, '7');
      p.confirm(true);
      await sleep(20);
      const key = posts()[0]!.body.idempotency_key as string;
      await driven(marketPendingDrop(key));
      g.open();
      await sleep(50);
      expect(sentWith(key).filter((c) => c.body.otp_code)).toEqual([]);
    });
    it('a fetch already started when the abandon runs (its answer not in): inflight, the key kept, sent once', async () => {
      let hang = false;
      const s = shopFor((c) => (c.method === 'POST' ? (hang ? new Promise<Reply>(() => {}) : { status: 500, body: { error: 'X' } }) : undefined));
      const p = createPurchase(rows().offer, '7');
      p.confirm(true);
      await sleep(100);
      const key = posts()[0]!.body.idempotency_key as string;
      hang = true;
      expect(p.retry()).toBe(true);
      await sleep(20);
      expect(sentWith(key)).toHaveLength(2);
      expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('inflight');
      expect(stored().map((e) => e.key)).toEqual([key]);
      expect(stored()[0]!.abandoned_at).toBeUndefined();
    });
    it('a resend admitted before the abandon, its continuation running after it: the abandon tombstones, and the send point refuses (nothing sent)', async () => {
      const { s, p, key } = await unknown();
      const sent = sentWith(key).length;
      const locks = heldLocks();
      locks.hold();
      const ab = marketPendingAbandon(s.ctx(), key);
      // Admitted on the open entry (the abandon waits on the lock); its flight queues behind the abandon.
      expect(p.retry()).toBe(true);
      locks.release();
      expect(await driven(ab)).toBe('dropped');
      await sleep(100);
      expect(sentWith(key)).toHaveLength(sent);
      expect(stored()[0]!.abandoned_at).toBeGreaterThan(0);
    });
    it('a resend admitted, then an abandon before its flight registers: the abandon tombstones (dropped) and the registration refuses, nothing sent', async () => {
      const { s, p, key } = await unknown();
      await sleep(100);
      const sent = sentWith(key).length;
      const locks = heldLocks();
      const orig = Storage.prototype.getItem;
      let ab: Promise<unknown> | null = null;
      // The resend's admission read (under the lock) queues another tab's abandon right behind it, so the abandon
      // runs after the admission and before the flight's registration asks for the lock.
      const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(function (this: Storage, k: string) {
        if (!ab && k === 'hub_market_pending' && pendingLockHeld()) { locks.hold(); ab = marketPendingAbandon(s.ctx(), key); }
        return orig.call(localStorage, k);
      });
      try {
        expect(p.retry()).toBe(true);
        await sleep(20);
        expect(ab).not.toBeNull();
        locks.release();
        expect(await driven(ab!)).toBe('dropped');
        await sleep(100);
      } finally { spy.mockRestore(); }
      expect(sentWith(key)).toHaveLength(sent);
      expect(stored()[0]!.abandoned_at).toBeGreaterThan(0);
    });
    it('an HTTP answer of any status takes the dispatch flight off (it is off the wire), whatever the outcome', async () => {
      for (const status of [500, 503, 404]) {
        const s = shopFor((c) => (c.method === 'POST' ? { status, body: { error: 'X' } } : undefined));
        const p = createPurchase(rows().offer, '7');
        p.confirm(true);
        await sleep(100);
        const key = posts().at(-1)!.body.idempotency_key as string;
        const kept = stored().filter((e) => e.key === key);
        // Kept or dropped by its outcome; if kept, without a flight.
        for (const e of kept) expect(e.flights).toBeUndefined();
        if (kept.length) expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('dropped');
        p.dispose();
        localStorage.removeItem('hub_market_pending');
      }
    });
    it('without a granted Web Lock (none, or a request that rejects) nothing writes the store: no resend, the abandon fails, a drop keeps the entry', async () => {
      for (const how of ['none', 'rejected'] as const) {
        const { s, p, key } = await unknown();
        await sleep(100);
        const sent = sentWith(key).length;
        const before = localStorage.getItem('hub_market_pending');
        if (how === 'none') noLocks();
        else Object.defineProperty(navigator, 'locks', { configurable: true, writable: true, value: { request: () => Promise.reject(new Error('denied')) } });
        const orig = Storage.prototype.setItem;
        let writes = 0;
        const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
          if (k === 'hub_market_pending') writes++;
          return orig.call(localStorage, k, v);
        });
        try {
          expect(p.retry()).toBe(true);
          await sleep(100);
          expect(sentWith(key)).toHaveLength(sent);
          // The admission says why it sent nothing: still unknown on the same key, not retrying.
          expect([how, p.snapshot().state, p.snapshot().notice, p.snapshot().retrying, p.snapshot().idemKey]).toEqual([how, 'indeterminate', 'noLocks', false, key]);
          expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('failed');
          await driven(marketPendingDrop(key));
          await sleep(50);
        } finally { spy.mockRestore(); }
        expect(writes).toBe(0);
        expect(localStorage.getItem('hub_market_pending')).toBe(before);
        p.dispose();
        heldLocks();
        localStorage.removeItem('hub_market_pending');
      }
    });
    it('a resend refused noLocks is sent once a later admission holds a granted lock, and that admission clears the notice', async () => {
      const { p, key } = await unknown();
      await sleep(100);
      const sent = sentWith(key).length;
      Object.defineProperty(navigator, 'locks', { configurable: true, writable: true, value: { request: () => Promise.reject(new Error('denied')) } });
      expect(p.retry()).toBe(true);
      await sleep(100);
      expect(p.snapshot().notice).toBe('noLocks');
      expect(sentWith(key)).toHaveLength(sent);
      heldLocks();
      expect(p.retry()).toBe(true);
      await sleep(100);
      expect(sentWith(key)).toHaveLength(sent + 1);
      expect(p.snapshot().notice).toBeNull();
      p.dispose();
      localStorage.removeItem('hub_market_pending');
    });
    it('a noLocks notice stays when no later admission runs under a granted lock: a lock wait that times out clears nothing, and its late grant runs nothing', async () => {
      const { p, key } = await unknown();
      await sleep(100);
      const sent = sentWith(key).length;
      Object.defineProperty(navigator, 'locks', { configurable: true, writable: true, value: { request: () => Promise.reject(new Error('denied')) } });
      expect(p.retry()).toBe(true);
      await sleep(100);
      expect(p.snapshot().notice).toBe('noLocks');
      // The lock is now held elsewhere past bounds.read: the admission gives up before its callback runs.
      Object.assign(bounds, { read: 60 });
      const locks = heldLocks();
      locks.hold();
      expect(p.retry()).toBe(true);
      await sleep(200);
      expect([p.snapshot().retrying, p.snapshot().notice, p.snapshot().state]).toEqual([false, 'noLocks', 'indeterminate']);
      locks.release();
      await sleep(50);
      expect(p.snapshot().notice).toBe('noLocks');
      expect(sentWith(key)).toHaveLength(sent);
      p.dispose();
      localStorage.removeItem('hub_market_pending');
    });
    it('locks lost while a first send is on the wire: a 2xx confirms and a definite refusal fails, and neither writes the store, so the entry stays kept', async () => {
      for (const how of ['none', 'rejected'] as const) {
        for (const outcome of ['2xx', 'refused'] as const) {
          let answer: ((r: Reply) => void) | null = null;
          shopFor((c) => (c.method !== 'POST' ? undefined : new Promise<Reply>((res) => { answer = res; })));
          const p = createPurchase(rows().offer, '7');
          p.confirm(true);
          await sleep(100);
          expect(answer).not.toBeNull();
          const key = posts().at(-1)!.body.idempotency_key as string;
          expect(stored().filter((e) => e.key === key)).toHaveLength(1);
          const before = localStorage.getItem('hub_market_pending');
          if (how === 'none') noLocks();
          else Object.defineProperty(navigator, 'locks', { configurable: true, writable: true, value: { request: () => Promise.reject(new Error('denied')) } });
          const orig = Storage.prototype.setItem;
          let writes = 0;
          const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
            if (k === 'hub_market_pending') writes++;
            return orig.call(localStorage, k, v);
          });
          try {
            answer!(outcome === '2xx' ? { status: 201, body: reserve201() } : typedErr(409, 'OFFER_UNAVAILABLE'));
            await sleep(100);
          } finally { spy.mockRestore(); }
          expect([how, outcome, p.snapshot().state, writes]).toEqual([how, outcome, outcome === '2xx' ? 'confirmed' : 'failed', 0]);
          // The drop needed a granted lock: the kept entry stays, so a later resend replays the same key (one charge).
          expect(localStorage.getItem('hub_market_pending')).toBe(before);
          p.dispose();
          heldLocks();
          localStorage.removeItem('hub_market_pending');
        }
      }
    });
    it('locks lost after the flight registered (granted, then none or rejecting): its answer writes nothing: the store keeps the entry and its flight as they were, the machine stays unknown, and a 429 keeps its countdown in the machine', async () => {
      for (const how of ['none', 'rejected'] as const) {
        for (const status of [429, 500] as const) {
          let answer: ((r: Reply) => void) | null = null;
          let hang = false;
          // The first send's answer is lost (500: kept, indeterminate); the resend then waits on the wire.
          shopFor((c) => (c.method !== 'POST' ? undefined : hang ? new Promise<Reply>((res) => { answer = res; }) : { status: 500, body: { error: 'X' } }));
          const p = createPurchase(rows().offer, '7');
          p.confirm(true);
          await sleep(100);
          expect(p.snapshot().state).toBe('indeterminate');
          hang = true;
          expect(p.retry()).toBe(true);
          await sleep(100);
          expect(answer).not.toBeNull();
          const key = posts().at(-1)!.body.idempotency_key as string;
          // Registered under the granted lock: the kept entry holds this dispatch's flight.
          expect(stored().find((e) => e.key === key)?.flights).toHaveLength(1);
          const before = localStorage.getItem('hub_market_pending');
          if (how === 'none') noLocks();
          else Object.defineProperty(navigator, 'locks', { configurable: true, writable: true, value: { request: () => Promise.reject(new Error('denied')) } });
          const orig = Storage.prototype.setItem;
          let writes = 0;
          const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
            if (k === 'hub_market_pending') writes++;
            return orig.call(localStorage, k, v);
          });
          try {
            answer!(status === 429 ? { ...typedErr(429, 'TOO_MANY_REQUESTS'), headers: { 'retry-after': '30' } } : { status: 500, body: { error: 'X' } });
            await sleep(100);
          } finally { spy.mockRestore(); }
          expect([how, status, writes]).toEqual([how, status, 0]);
          expect(localStorage.getItem('hub_market_pending')).toBe(before);
          expect(p.snapshot().state).toBe('indeterminate');
          if (status === 429) expect(p.snapshot().retryIn).toBeGreaterThan(0);
          p.dispose();
          heldLocks();
          localStorage.removeItem('hub_market_pending');
        }
      }
    });
    it('a send point never writes the store: a gate that read before another tab abandoned K cannot put K back, for K\'s own resend or another offer\'s send', async () => {
      for (const via of ['same key', 'other offer'] as const) {
        const { p, key } = await unknown();
        await sleep(100);
        const orig = Storage.prototype.getItem;
        let armed = true;
        // The send point's first read of the store sees it as it was; another tab's
        // abandon of K lands in the same instant (localStorage reaches other tabs asynchronously).
        const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(function (this: Storage, k: string) {
          const raw = orig.call(localStorage, k);
          if (!armed || k !== 'hub_market_pending' || pendingLockHeld() || !/apiCallCancelled/.test(new Error().stack || '')) return raw;
          armed = false;
          const t = (JSON.parse(raw || '[]') as Array<Record<string, unknown>>).map((e) => {
            if (e.key !== key) return e;
            const c: Record<string, unknown> = { ...e, abandoned_at: Date.now() };
            delete c.flights;
            return c;
          });
          Storage.prototype.setItem.call(localStorage, k, JSON.stringify(t));
          return raw;
        });
        try {
          if (via === 'same key') expect(p.retry()).toBe(true);
          else expect(createPurchase(M.normalizeOfferRow(offerRaw({ id: 'o2' }), 0), '7').confirm(true)).toEqual({ ok: true });
          await sleep(100);
        } finally { spy.mockRestore(); }
        expect(armed).toBe(false);
        expect(stored().filter((e) => e.key === key).map((e) => typeof e.abandoned_at)).toEqual(['number']);
        // K stays abandoned: a later resend of it is refused and sends nothing.
        const sent = sentWith(key).length;
        p.retry();
        await sleep(100);
        expect(sentWith(key)).toHaveLength(sent);
        localStorage.removeItem('hub_market_pending');
      }
    });
    it('api() gives up before a fetch that waited on a slow token refresh: the flight stays until stale, so the abandon answers inflight', async () => {
      const keep = { ...budgets };
      try {
        const me = UA;
        const tok = (exp: number) => sessionToken(me, { sid: 'sid-x' + me.slice(-4), exp: Math.floor(Date.now() / 1000) + exp });
        const s = shopFor((c) => {
          if (path(c) === '/users/auth/refresh') {
            return { status: 200, delayMs: 8_000, body: { data: { token: tok(3600), refreshToken: tok(86400), expires_at: new Date(Date.now() + 3_600_000).toISOString() } } };
          }
          return c.method === 'POST' ? new Promise<Reply>(() => { /* on the wire */ }) : undefined;
        }, { local: { access_token: tok(3600), refresh_token: tok(86400), access_token_expires_at: new Date(Date.now() - 1000).toISOString() } });
        Object.assign(budgets, { postingMs: 30_000 });
        const p = createPurchase(rows().offer, '7');
        p.confirm(true);
        await sleep(9_000);
        const [first] = posts();
        const key = first!.body.idempotency_key as string;
        // api() rejects at 35 s (its 30 s plus slack); the fetch, armed after the 8 s refresh, is out until 38 s.
        await sleep(27_000);
        expect(p.snapshot().state).not.toBe('posting');
        expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('inflight');
        expect(stored().map((e) => [e.key, e.abandoned_at])).toEqual([[key, undefined]]);
        // Stale once twice the posting budget plus slack has passed: then the abandon goes through.
        await sleep(2 * budgets.postingMs + 10_000);
        expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('dropped');
        expect(sentWith(key)).toHaveLength(1);
      } finally { Object.assign(budgets, keep); }
    });
    it('an abandon that takes the lock between the flight registration and the send answers inflight, and that send still goes', async () => {
      const keep = { ...budgets };
      try {
        const me = UA;
        const tok = (exp: number) => sessionToken(me, { sid: 'sid-x' + me.slice(-4), exp: Math.floor(Date.now() / 1000) + exp });
        const s = shopFor((c) => {
          if (path(c) === '/users/auth/refresh') {
            return { status: 200, delayMs: 2_000, body: { data: { token: tok(3600), refreshToken: tok(86400), expires_at: new Date(Date.now() + 3_600_000).toISOString() } } };
          }
          return c.method === 'POST' ? { status: 201, body: reserve201() } : undefined;
        }, { local: { access_token: tok(3600), refresh_token: tok(86400), access_token_expires_at: new Date(Date.now() - 1000).toISOString() } });
        Object.assign(budgets, { postingMs: 30_000 });
        const p = createPurchase(rows().offer, '7');
        p.confirm(true);
        await sleep(1_000);
        // The flight is registered; the send waits on the token refresh.
        const [e] = stored();
        const key = e!.key as string;
        expect((e!.flights as unknown[]).length).toBe(1);
        expect(posts()).toEqual([]);
        expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('inflight');
        await sleep(2_000);
        expect(sentWith(key)).toHaveLength(1);
        expect(p.snapshot().state).toBe('confirmed');
      } finally { Object.assign(budgets, keep); }
    });
    it('after an abandon, a fresh Confirm whose admission times out reads as nothing kept: the tombstone is not a kept request', async () => {
      const { s, key } = await unknown();
      await sleep(100);
      expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('dropped');
      const locks = heldLocks();
      locks.hold();
      const q = createPurchase(rows().offer, '7');
      expect(q.confirm(true)).toEqual({ ok: true });
      await sleep(bounds.read + 100);
      expect(q.snapshot()).toMatchObject({ state: 'idle', notice: null, idemKey: null });
      expect(marketPendingKept(UA, 'o1')).toBe(false);
      locks.release();
      await sleep(100);
      expect(sentWith(key)).toHaveLength(1);
    });
    it('a resend admitted, then the entry dropped by another settlement before it sends: refused at its send point; the abandon answers absent', async () => {
      const { s, p, key } = await unknown();
      const sent = sentWith(key).length;
      const locks = heldLocks();
      locks.hold();
      expect(p.retry()).toBe(true);
      const dropped = marketPendingDrop(key);
      locks.release();
      await driven(dropped);
      await sleep(100);
      expect(sentWith(key)).toHaveLength(sent);
      expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('absent');
    });
    it('a stale machine after the abandon: its Retry is refused and nothing is sent; the tombstone holds no fresh Confirm and is not offered', async () => {
      const { s, p, key } = await unknown();
      await sleep(100);
      expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('dropped');
      expect(stored()[0]!.abandoned_at).toBeGreaterThan(0);
      expect(marketPendingFor(s.ctx())).toEqual([]);
      const sent = sentWith(key).length;
      p.retry();
      await sleep(100);
      expect(sentWith(key)).toHaveLength(sent);
      const q = createPurchase(rows().offer, '7');
      q.confirm(true);
      await sleep(100);
      const fresh = posts().at(-1)!;
      expect(fresh.body.idempotency_key).not.toBe(key);
      expect(sentWith(key)).toHaveLength(sent);
    });
    it('a forward clock jump makes a live flight look over: the abandon tombstones it, and that send\'s next leg (the 2FA retry) sends nothing', async () => {
      const g = otpGate();
      const s = shopFor(otpLost);
      const p = createPurchase(rows().offer, '7');
      p.confirm(true);
      await sleep(20);
      const key = posts()[0]!.body.idempotency_key as string;
      expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('inflight');
      // The wall clock jumps; no timer fires (the send's own fence has not run).
      vi.setSystemTime(Date.now() + 2 * budgets.postingMs + 11_000);
      expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('dropped');
      g.open();
      await sleep(50);
      expect(sentWith(key).filter((c) => c.body.otp_code)).toEqual([]);
      expect(p.snapshot().state).not.toBe('confirmed');
    });
    it('a tab that died mid-send leaves its flight: inflight until the flight is over, then dropped, nothing sent', async () => {
      const { s, p, key } = await unknown();
      p.dispose();
      await sleep(100);
      // Another tab's flight, written at its send point, never cleared (that tab is gone).
      const other = stored().map((e) => ({ ...e, flights: [{ id: 'dead-tab-flight-0001', at: Date.now() }] }));
      localStorage.setItem('hub_market_pending', JSON.stringify(other));
      const sent = posts().length;
      expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('inflight');
      await sleep(2 * budgets.postingMs + 11_000);
      expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('dropped');
      expect(posts()).toHaveLength(sent);
    });
    it('a tombstone write that is lost, altered or cannot be read back proves nothing: failed, and the key is not shown as gone', async () => {
      for (const how of ['ignored', 'altered', 'unreadable'] as const) {
        const { s, key } = await unknown();
        await sleep(100);
        if (how === 'ignored') breakKey('setItem', 'hub_market_pending', 'drop');
        if (how === 'altered') rewriteKey('hub_market_pending', (v) => JSON.stringify((JSON.parse(v) as Array<Record<string, unknown>>).map((e) => { const c = { ...e }; delete c.abandoned_at; return c; })));
        if (how === 'unreadable') breakKey('getItem', 'hub_market_pending', 'throw', [2]);
        expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('failed');
        restoreStorage();
        // A lost or altered tombstone leaves the request open; an unreadable read-back may leave it a tombstone
        // (fail closed: no tab sends it), but the abandon still claims nothing.
        if (how === 'unreadable') expect(stored().filter((e) => e.key === key)).toHaveLength(1);
        else expect(marketPendingFor(s.ctx()).map((e) => e.key)).toEqual([key]);
        localStorage.removeItem('hub_market_pending');
      }
    });
    it('a send point whose flight is not kept (the store drops the write) sends nothing', async () => {
      const { key } = await unknown();
      await sleep(100);
      const [rec] = marketPendingFor(shopFor(lost, { local: snapshotStores().local }).ctx());
      const q = createPurchase(rows().offer, rec!.days, { recover: rec });
      const sent = sentWith(key).length;
      breakKey('setItem', 'hub_market_pending', 'drop');
      expect(q.retry()).toBe(true);
      await sleep(100);
      restoreStorage();
      expect(sentWith(key)).toHaveLength(sent);
    });
    it('a flight written but not read back (the store cannot be read then) sends nothing', async () => {
      const { p, key } = await unknown();
      await sleep(100);
      const sent = sentWith(key).length;
      const orig = Storage.prototype.getItem;
      let n = 0;
      // Under the lock: the resend's admission read (1), the flight's read (2), its read-back (3) throws.
      const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(function (this: Storage, k: string) {
        if (k === 'hub_market_pending' && pendingLockHeld() && ++n === 3) throw new Error('storage');
        return orig.call(localStorage, k);
      });
      try {
        expect(p.retry()).toBe(true);
        await sleep(100);
      } finally { spy.mockRestore(); }
      expect(n).toBeGreaterThanOrEqual(3);
      expect(sentWith(key)).toHaveLength(sent);
    });
    it('a store that cannot be read proves nothing: unreadable, and the key stays kept', async () => {
      const { s, key } = await unknown();
      breakKey('getItem', 'hub_market_pending', 'throw');
      expect(await driven(marketPendingAbandon(s.ctx(), key))).toBe('unreadable');
      restoreStorage();
      expect(stored().map((e) => e.key)).toEqual([key]);
    });
    it('no entry of this user with this key: absent (nothing to send again)', async () => {
      const s = shopFor(lost);
      expect(await driven(marketPendingAbandon(s.ctx(), 'no-such-key-000000000001'))).toBe('absent');
    });
  });
});

void hostOf; void uidOf;

describe('an unresolved rent holds a re-rent of the same server, across dialogs', () => {
  const hangingRentPersist = () => {
    const answers: Array<(r: { status: number; body: unknown }) => void> = [];
    shopFor((c) => {
      if (c.method === 'POST') return new Promise((res) => { answers.push(res); });
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    return answers;
  };
  const unknownRent = async (rentals: () => unknown[] = () => []) => {
    shopFor((c) => {
      if (c.method === 'POST') return { status: 500, body: { error: 'X' } };
      if (path(c) === '/rentals') return { status: 200, body: envelope(rentals()) };
      return undefined;
    });
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await vi.waitFor(() => expect(p.snapshot().state).toBe('not-found'), { timeout: 5000 });
    p.dispose();
  };
  it('a dialog closed during the rent POST still holds the next Confirm (the hold is written before dispatch)', async () => {
    let answer!: (r: { status: number; body: unknown }) => void;
    shopFor((c) => {
      if (c.method === 'POST') return new Promise((res) => { answer = res; });
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: true }]);
    p.dispose();
    answer({ status: 500, body: { error: 'X' } });
    await vi.advanceTimersByTimeAsync(50);
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: false }]);
    const q = createPurchase(rows().stock, '1');
    expect(q.confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    expect(posts()).toHaveLength(1);
  });
  it('a late answer of rent A never clears or rewrites the hold of rent B (rent again anyway)', async () => {
    const answers: Array<(r: { status: number; body: unknown }) => void> = [];
    shopFor((c) => {
      if (c.method === 'POST') return new Promise((res) => { answers.push(res); });
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    const a = createPurchase(rows().stock, '1');
    expect(a.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    // While A is still being sent, rent again anyway is refused (busy), nothing sent.
    expect(createPurchase(rows().stock, '1').confirm(true, { rentAgainAnyway: true })).toEqual({ ok: false, reason: 'busy' });
    expect(posts()).toHaveLength(1);
    // A's "sending" outlives the posting budget (as a tab that died mid-POST): rent again anyway may go.
    vi.setSystemTime(Date.now() + budgets.postingMs + 10001);
    const b = createPurchase(rows().stock, '1');
    expect(b.confirm(true, { rentAgainAnyway: true })).toEqual({ ok: true });
    await vi.waitFor(() => expect(posts()).toHaveLength(2), { timeout: 5000 });
    b.dispose();
    // A answers definitively (created): only A is proven; B's outcome is still unknown.
    answers[0]!({ status: 201, body: RENT_201 });
    await vi.advanceTimersByTimeAsync(50);
    expect(a.snapshot().state).toBe('confirmed');
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: true }]);
    expect(createPurchase(rows().stock, '1').confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    // B's own unknown answer keeps it (no longer sending).
    answers[1]!({ status: 500, body: { error: 'X' } });
    await vi.advanceTimersByTimeAsync(50);
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: false }]);
    expect(posts()).toHaveLength(2);
  });
  it('a late unknown answer of rent A never turns rent B\'s in-flight hold into A\'s (sending, sent time)', async () => {
    const answers: Array<(r: { status: number; body: unknown }) => void> = [];
    shopFor((c) => {
      if (c.method === 'POST') return new Promise((res) => { answers.push(res); });
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    const a = createPurchase(rows().stock, '1');
    a.confirm(true);
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    await vi.advanceTimersByTimeAsync(5);
    vi.setSystemTime(Date.now() + budgets.postingMs + 10001);
    const b = createPurchase(rows().stock, '1');
    b.confirm(true, { rentAgainAnyway: true });
    await vi.waitFor(() => expect(posts()).toHaveLength(2), { timeout: 5000 });
    const bAt = rentPendingFor(capture())[0]!.at;
    answers[0]!({ status: 500, body: { error: 'X' } });
    await vi.advanceTimersByTimeAsync(50);
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: true, at: bAt }]);
  });
  it('a disposed dialog\'s answer never clears the hold (its unknown answer still moves it to may-have-gone-through)', async () => {
    let answer!: (r: { status: number; body: unknown }) => void;
    shopFor((c) => {
      if (c.method === 'POST') return new Promise((res) => { answer = res; });
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    p.dispose();
    answer({ status: 201, body: RENT_201 });
    await vi.advanceTimersByTimeAsync(50);
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1' }]);
    expect(createPurchase(rows().stock, '1').confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    expect(posts()).toHaveLength(1);
  });
  it('a disposed dialog\'s definite refusal (failed) ends its own hold: nothing was rented, so the next Confirm is sent', async () => {
    let answer!: (r: { status: number; body: unknown }) => void;
    shopFor((c) => {
      if (c.method === 'POST') return posts().length === 1 ? new Promise((res) => { answer = res; }) : new Promise(() => {});
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    p.dispose();
    answer({ status: 400, body: { error: 'NOPE' } });
    await vi.advanceTimersByTimeAsync(50);
    expect(rentPendingFor(capture())).toEqual([]);
    expect(createPurchase(rows().stock, '1').confirm(true)).toEqual({ ok: true });
  });
  it('the marker outlives the dialog: a new dialog\'s Confirm is held, nothing sent; dismiss hides it but never unlocks', async () => {
    await unknownRent();
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', days: '1', dismissed: false }]);
    const q = createPurchase(rows().stock, '1');
    expect(q.confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    expect(q.snapshot().notice).toBe('unresolvedRent');
    dismissRentPending(capture(), 's1');
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', dismissed: true }]);
    expect(createPurchase(rows().stock, '1').confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    expect(posts()).toHaveLength(1);
  });
  it('rent B (rent again anyway) failing definitively never clears A\'s unresolved hold', async () => {
    let n = 0;
    shopFor((c) => {
      if (c.method === 'POST') return ++n === 1 ? { status: 500, body: { error: 'X' } } : { status: 400, body: { error: 'NOPE' } };
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    const a = createPurchase(rows().stock, '1');
    a.confirm(true);
    await vi.waitFor(() => expect(a.snapshot().state).toBe('not-found'), { timeout: 5000 });
    a.dispose();
    const b = createPurchase(rows().stock, '1');
    expect(b.confirm(true, { rentAgainAnyway: true })).toEqual({ ok: true });
    await vi.waitFor(() => expect(b.snapshot().state).toBe('failed'), { timeout: 5000 });
    expect(posts()).toHaveLength(2);
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: false }]);
    const q = createPurchase(rows().stock, '1');
    expect(q.confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    expect(posts()).toHaveLength(2);
  });
  it('a hold stored before the POST whose settling write storage refuses stays held and persisted: the stored row still blocks', async () => {
    // A hold storage refuses at admission is never sent (the storageFailed tests below), so a sent rent
    // always has its stored row; a refused later write leaves that row (still sending) as the hold every tab reads
    const answers = hangingRentPersist();
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    const set = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string) => { if (k === 'hub.v3.rent_pending') throw new Error('QuotaExceededError'); });
    try {
      answers[0]!({ status: 500, body: { error: 'X' } });
      await vi.advanceTimersByTimeAsync(50);
      expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', persisted: true }]);
      expect(JSON.parse(localStorage.getItem('hub.v3.rent_pending')!)).toMatchObject([{ server_id: 's1', sending: true }]);
      expect(createPurchase(rows().stock, '1').confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
      expect(posts()).toHaveLength(1);
    } finally { set.mockRestore(); }
  });
  it('a stored rent hold reads persisted; once another tab resolved it (gone from storage) this tab drops it too', async () => {
    await unknownRent();
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', persisted: true }]);
    localStorage.removeItem('hub.v3.rent_pending');
    expect(rentPendingFor(capture())).toEqual([]);
    expect(createPurchase(rows().stock, '1').confirm(true)).toEqual({ ok: true });
  });
  it('"rent again anyway" sends a second rent on purpose', async () => {
    await unknownRent();
    const q = createPurchase(rows().stock, '1');
    expect(q.confirm(true, { rentAgainAnyway: true })).toEqual({ ok: true });
    await vi.waitFor(() => expect(posts()).toHaveLength(2), { timeout: 5000 });
  });
  it('a /rentals read listing the rental active is evidence only: the hold stays, the next Confirm is still held', async () => {
    let visible = false;
    await unknownRent(() => (visible ? [{ id: 'r', status: 'active', server_id: 's1' }] : []));
    visible = true;
    expect(await checkRentPending(capture(), 's1')).toBe('active');
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: false }]);
    expect(createPurchase(rows().stock, '1').confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    expect(posts()).toHaveLength(1);
  });
  it('absence is never proof, however long after: the hold stays (a delayed rent may still complete)', async () => {
    await unknownRent();
    expect(await checkRentPending(capture(), 's1')).toBe('absent');
    vi.setSystemTime(Date.now() + 30 * 24 * 3600 * 1000);
    expect(await checkRentPending(capture(), 's1')).toBe('absent');
    expect(rentPendingFor(capture())).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('hub.v3.rent_pending')!)).toHaveLength(1);
    expect(createPurchase(rows().stock, '1').confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    expect(posts()).toHaveLength(1);
  });
  it('two held attempts (rent again anyway) and one active rental: neither marker is dropped by the read', async () => {
    // counts the stored markers: start from none, whatever an earlier test left (shuffled order)
    localStorage.removeItem('hub.v3.rent_pending');
    let active = false;
    await unknownRent(() => (active ? [{ id: 'r', status: 'active', server_id: 's1' }] : []));
    const b = createPurchase(rows().stock, '1');
    expect(b.confirm(true, { rentAgainAnyway: true })).toEqual({ ok: true });
    await vi.waitFor(() => expect(b.snapshot().state).toBe('not-found'), { timeout: 5000 });
    b.dispose();
    expect(JSON.parse(localStorage.getItem('hub.v3.rent_pending')!)).toHaveLength(2);
    active = true;
    expect(await checkRentPending(capture(), 's1')).toBe('active');
    await vi.advanceTimersByTimeAsync(50);
    expect(JSON.parse(localStorage.getItem('hub.v3.rent_pending')!)).toHaveLength(2);
    expect(rentPendingFor(capture())).toHaveLength(1);
  });
  it('a delayed completion: after an absent read the attempt\'s own late answer (created, shown) is what ends the hold', async () => {
    let answer!: (r: { status: number; body: unknown }) => void;
    shopFor((c) => {
      if (c.method === 'POST') return new Promise((res) => { answer = res; });
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    expect(await checkRentPending(capture(), 's1')).toBe('absent');
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: true }]);
    answer({ status: 201, body: RENT_201 });
    await vi.waitFor(() => expect(p.snapshot().state).toBe('confirmed'), { timeout: 5000 });
    expect(rentPendingFor(capture())).toEqual([]);
  });
  it('a realm switch keeps the marker (rentals are account-wide); an account change keeps it stored for its user', async () => {
    await unknownRent();
    bump('switch');
    expect(rentPendingFor(capture())).toHaveLength(1);
    bump('account');
    expect(rentPendingFor(capture())).toHaveLength(1);
  });
});

describe('a rent\'s hold check and its mark run together under the cross-tab pending lock', () => {
  const otherTabRent = (sending: boolean) => {
    localStorage.setItem('hub.v3.rent_pending', JSON.stringify([{ user_id: UA, server_id: 's1', name: null, days: '1', at: Date.now(), dismissed: false, sending, attempt: 'othertab-attempt-0001' }]));
  };
  it('another tab marks a rent of the same server while this Confirm waits for the lock: nothing is sent, the hold shows', async () => {
    shopFor((c) => {
      if (c.method === 'POST') return new Promise(() => {});
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    const locks = heldLocks();
    locks.hold();
    const p = createPurchase(rows().stock, '1');
    // The early check reads no hold (the other tab has not marked yet): the Confirm is admitted to the lock.
    expect(p.confirm(true)).toEqual({ ok: true });
    otherTabRent(true);
    locks.release();
    await vi.waitFor(() => expect(p.snapshot().state).toBe('idle'), { timeout: 5000 });
    expect(p.snapshot().notice).toBe('unresolvedRent');
    expect(posts()).toHaveLength(0);
    // Only the other tab's hold: this dialog marked nothing.
    expect(JSON.parse(localStorage.getItem('hub.v3.rent_pending')!).map((e: { attempt: string }) => e.attempt)).toEqual(['othertab-attempt-0001']);
  });
  it('rent again anyway waiting for the lock while another tab starts sending the same server: refused (busy), nothing sent', async () => {
    shopFor((c) => {
      if (c.method === 'POST') return new Promise(() => {});
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    const locks = heldLocks();
    locks.hold();
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true, { rentAgainAnyway: true })).toEqual({ ok: true });
    otherTabRent(true);
    locks.release();
    await vi.waitFor(() => expect(p.snapshot().state).toBe('idle'), { timeout: 5000 });
    expect(posts()).toHaveLength(0);
  });
  it('with no other hold the admitted rent marks before it is sent, under the lock', async () => {
    shopFor((c) => {
      if (c.method === 'POST') return new Promise(() => {});
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    const locks = heldLocks();
    locks.hold();
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    expect(posts()).toHaveLength(0);
    locks.release();
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: true }]);
  });
});

describe('every rent-list write is under the pending lock; admission waits are bounded and abandoned admissions go idle', () => {
  const stored = () => JSON.parse(localStorage.getItem('hub.v3.rent_pending') || '[]') as Array<{ server_id: string; attempt: string; dismissed: boolean; sending: boolean }>;
  const mark = (server: string, attempt: string, extra: Record<string, unknown> = {}) => ({ user_id: UA, server_id: server, name: null, days: '1', at: Date.now(), dismissed: false, sending: false, attempt, ...extra });
  const quiet = () => shopFor((c) => {
    if (c.method === 'POST') return new Promise(() => {});
    if (path(c) === '/rentals') return { status: 200, body: envelope([{ status: 'active', server_id: 's1' }]) };
    return undefined;
  });
  it('a dismiss waits for the lock and then rewrites the list fresh: another tab\'s marker written meanwhile survives', async () => {
    quiet();
    localStorage.setItem('hub.v3.rent_pending', JSON.stringify([mark('s1', 'thistab-attempt-00001')]));
    const locks = heldLocks();
    locks.hold();
    dismissRentPending(capture(), 's1');
    // This tab sees the dismiss at once; storage is untouched while another holder has the lock.
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', dismissed: true }]);
    expect(stored().map((e) => e.dismissed)).toEqual([false]);
    // Another tab marks a rent of s2 (sending) while the lock is held.
    localStorage.setItem('hub.v3.rent_pending', JSON.stringify([...stored(), mark('s2', 'othertab-attempt-0002', { sending: true })]));
    locks.release();
    await vi.waitFor(() => expect(stored().find((e) => e.server_id === 's1')?.dismissed).toBe(true), { timeout: 5000 });
    expect(stored().find((e) => e.server_id === 's2')).toMatchObject({ sending: true, attempt: 'othertab-attempt-0002' });
  });
  it('a /rentals read under a held lock writes nothing: this tab\'s hold and the other tab\'s marker both stay', async () => {
    quiet();
    const locks = heldLocks();
    localStorage.setItem('hub.v3.rent_pending', JSON.stringify([mark('s1', 'thistab-attempt-00003')]));
    locks.hold();
    expect(await checkRentPending(capture(), 's1')).toBe('active');
    expect(rentPendingFor(capture()).map((r) => r.server_id)).toEqual(['s1']);
    localStorage.setItem('hub.v3.rent_pending', JSON.stringify([...stored(), mark('s2', 'othertab-attempt-0004', { sending: true })]));
    locks.release();
    await vi.advanceTimersByTimeAsync(50);
    expect(stored().map((e) => e.attempt)).toEqual(['thistab-attempt-00003', 'othertab-attempt-0004']);
    localStorage.removeItem('hub.v3.rent_pending');
  });
  it('a dialog disposed while its rent waits for the lock goes back to idle; a resume shows it closable, nothing sent or marked', async () => {
    quiet();
    const locks = heldLocks();
    locks.hold();
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    expect(p.snapshot().state).toBe('posting');
    p.dispose();
    locks.release();
    await vi.waitFor(() => expect(p.snapshot().state).toBe('idle'), { timeout: 5000 });
    p.resume();
    expect(p.snapshot()).toMatchObject({ state: 'idle', canClose: true });
    await vi.waitFor(() => expect(stored()).toEqual([]), { timeout: 5000 });
    expect(posts()).toHaveLength(0);
  });
  it('an admission whose lock is not granted within bounds.read fails closed (busy, idle, nothing sent); a late grant runs nothing', async () => {
    quiet();
    Object.assign(bounds, { read: 200 });
    const locks = heldLocks();
    locks.hold();
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    await sleep(250);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: null });
    locks.release();
    await sleep(50);
    expect(posts()).toHaveLength(0);
    expect(stored()).toEqual([]);
    expect(p.snapshot().state).toBe('idle');
  });
});

describe('a queued dismiss is a patch on the marker stored when the lock is granted', () => {
  const stored = () => JSON.parse(localStorage.getItem('hub.v3.rent_pending') || '[]') as Array<{ server_id: string; attempt: string; dismissed: boolean; sending: boolean }>;
  const mark = (extra: Record<string, unknown> = {}) => ({ user_id: UA, server_id: 's1', name: null, days: '1', at: Date.now(), dismissed: false, sending: false, attempt: 'thistab-attempt-00009', ...extra });
  it('another tab drops the marker while the dismiss waits: it stays dropped (never resurrected)', async () => {
    shopFor(() => undefined);
    localStorage.setItem('hub.v3.rent_pending', JSON.stringify([mark()]));
    const locks = heldLocks();
    locks.hold();
    dismissRentPending(capture(), 's1');
    localStorage.setItem('hub.v3.rent_pending', JSON.stringify([]));
    locks.release();
    await vi.waitFor(() => expect(rentPendingFor(capture())).toEqual([]), { timeout: 5000 });
    expect(stored()).toEqual([]);
  });
  it('another tab rewrites the same marker (sending again) while the dismiss waits: only dismissed is set on the newer one', async () => {
    shopFor(() => undefined);
    localStorage.setItem('hub.v3.rent_pending', JSON.stringify([mark()]));
    const locks = heldLocks();
    locks.hold();
    dismissRentPending(capture(), 's1');
    localStorage.setItem('hub.v3.rent_pending', JSON.stringify([mark({ sending: true, days: '7' })]));
    locks.release();
    await vi.waitFor(() => expect(stored()[0]?.dismissed).toBe(true), { timeout: 5000 });
    expect(stored()[0]).toMatchObject({ sending: true, days: '7' });
  });
});

describe('the rent hold is stored per user and every change of it is announced', () => {
  const hangingRent = () => {
    const answers: Array<(r: { status: number; body: unknown }) => void> = [];
    shopFor((c) => {
      if (c.method === 'POST') return new Promise((res) => { answers.push(res); });
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    return answers;
  };
  it('a disposed dialog\'s answer (created) keeps the hold but ends "still being sent", and subscribers hear it', async () => {
    const answers = hangingRent();
    const heard: number[] = [];
    const off = subscribeRentPending(() => heard.push(rentPendingFor(capture()).length));
    try {
      const p = createPurchase(rows().stock, '1');
      p.confirm(true);
      await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
      expect(rentPendingFor(capture())).toMatchObject([{ sending: true }]);
      p.dispose();
      const before = heard.length;
      answers[0]!({ status: 201, body: RENT_201 });
      await vi.advanceTimersByTimeAsync(50);
      expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: false }]);
      expect(heard.length).toBeGreaterThan(before);
    } finally { off(); }
  });
  it('the hold survives a reload / another tab / an account switch and back (hub.v3.rent_pending), only for its user', async () => {
    const answers = hangingRent();
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    answers[0]!({ status: 500, body: { error: 'X' } });
    await vi.advanceTimersByTimeAsync(50);
    p.dispose();
    const stored = JSON.parse(localStorage.getItem('hub.v3.rent_pending') || '[]') as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
    expect(Object.keys(stored[0]!).sort()).toEqual(['at', 'attempt', 'days', 'dismissed', 'name', 'sending', 'server_id', 'user_id']);
    bump('account');
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: false }]);
    expect(createPurchase(rows().stock, '1').confirm(true)).toEqual({ ok: false, reason: 'unresolved' });
    localStorage.setItem('hub.v3.rent_pending', JSON.stringify(stored.map((e) => ({ ...e, user_id: 'someone-else' }))));
    bump('account');
    expect(rentPendingFor(capture())).toEqual([]);
  });
  it('a stored "sending" from a tab that died stops reading as sending once the posting budget is past', async () => {
    hangingRent();
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    p.dispose();
    bump('account');
    expect(rentPendingFor(capture())).toMatchObject([{ sending: true }]);
    vi.setSystemTime(Date.now() + budgets.postingMs + 15000);
    expect(rentPendingFor(capture())).toMatchObject([{ server_id: 's1', sending: false }]);
  });
});

describe('a dismiss queued behind a full write keeps that write', () => {
  const stored = () => JSON.parse(localStorage.getItem('hub.v3.rent_pending') || '[]') as Array<{ server_id: string; attempt: string; dismissed: boolean; sending: boolean }>;
  it('the answer (sending ends) and a dismiss both wait on the lock: the stored marker gets both', async () => {
    const answers: Array<(r: { status: number; body: unknown }) => void> = [];
    shopFor((c) => {
      if (c.method === 'POST') return new Promise((res) => { answers.push(res); });
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    await vi.waitFor(() => expect(stored()[0]).toMatchObject({ sending: true }), { timeout: 5000 });
    p.dispose(); // a closed dialog's answer keeps the hold: the full write is queued
    const locks = heldLocks();
    locks.hold();
    answers[0]!({ status: 201, body: RENT_201 });
    await vi.waitFor(() => expect(rentPendingFor(capture())).toMatchObject([{ sending: false }]), { timeout: 5000 });
    dismissRentPending(capture(), 's1');
    expect(stored()[0]).toMatchObject({ sending: true, dismissed: false });
    locks.release();
    await vi.waitFor(() => expect(stored()[0]?.dismissed).toBe(true), { timeout: 5000 });
    expect(stored()[0]).toMatchObject({ sending: false, dismissed: true });
  });
});

// A granted lock whose promise rejects after the
// admission's callback ran (commerce-pure withPendingLock: "an error of the callback itself (it ran) passes through")
// answers 'busy' with the rent's mark (sending) already written. Nothing was sent, so that mark must go: otherwise it
// says "renting" for an attempt no machine owns, and no answer ever releases it.
describe('a rent admission whose lock fails after its callback ran', () => {
  const stored = () => JSON.parse(localStorage.getItem('hub.v3.rent_pending') || '[]') as Array<{ server_id: string; attempt: string; sending: boolean }>;
  function locksFailingAfterNextCallback() {
    let armed = true;
    const request = (_n: string, a: unknown, b?: unknown) => {
      const fn = (typeof a === 'function' ? a : b) as () => unknown;
      const v = fn();
      if (armed) { armed = false; return Promise.reject(new Error('lock aborted after its callback ran')); }
      return Promise.resolve(v);
    };
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
  }

  it('answers idle with no notice, sends nothing, and leaves no sending mark of its own', async () => {
    shopFor((c) => {
      if (c.method === 'POST') return new Promise(() => {});
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
    locksFailingAfterNextCallback();
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(p.snapshot().state).toBe('idle'), { timeout: 5000 });
    expect(p.snapshot().notice).toBeNull();
    expect(posts()).toHaveLength(0);
    await vi.waitFor(() => expect(stored().filter((e) => e.server_id === 's1')).toEqual([]), { timeout: 5000 });
    expect(rentPendingFor(capture()).filter((m) => m.server_id === 's1')).toEqual([]);
  });
});

// A rent's hold that storage did not keep must stop the rent before it leaves. Kept only in
// this tab's memory it is lost to a reload and unseen by another tab, whose plain Confirm would then rent the same
// server again with no warning if this answer is lost. A reserve already refuses this case (persistNewKey: storageFailed).
describe('a rent whose hold storage cannot keep is refused before it is sent', () => {
  const stored = () => JSON.parse(localStorage.getItem('hub.v3.rent_pending') || '[]') as Array<{ server_id: string }>;
  const quiet = () => shopFor((c) => (c.method === 'POST' ? new Promise(() => {}) : path(c) === '/rentals' ? { status: 200, body: envelope([]) } : undefined));

  it('setItem throws: idle with storageFailed, no POST, no hold left in this tab or in storage', async () => {
    quiet();
    heldLocks();
    breakKey('setItem', 'hub.v3.rent_pending', 'throw');
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(p.snapshot().state).toBe('idle'), { timeout: 5000 });
    expect(p.snapshot().notice).toBe('storageFailed');
    expect(posts()).toHaveLength(0);
    expect(rentPendingFor(capture()).filter((m) => m.server_id === 's1')).toEqual([]);
    expect(stored()).toEqual([]);
  });

  it('a write that reports success but is not there when read back is refused the same way', async () => {
    quiet();
    heldLocks();
    // Storage that accepts the write and keeps nothing (as a full or evicting store can).
    rewriteKey('hub.v3.rent_pending', () => '[]');
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(p.snapshot().state).toBe('idle'), { timeout: 5000 });
    expect(p.snapshot().notice).toBe('storageFailed');
    expect(posts()).toHaveLength(0);
    expect(rentPendingFor(capture()).filter((m) => m.server_id === 's1')).toEqual([]);
  });

  it('a hold written but unreadable on read-back is refused and removed from storage, so no tab reads a rent that never left', async () => {
    quiet();
    heldLocks();
    // The write lands; the read right after it throws once (a store failing between the two calls).
    const KEY = 'hub.v3.rent_pending';
    const origGet = Storage.prototype.getItem, origSet = Storage.prototype.setItem;
    let armed = false;
    const set = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) { origSet.call(this, k, v); if (k === KEY) armed = true; });
    const get = vi.spyOn(localStorage, 'getItem').mockImplementation(function (this: Storage, k: string) { if (k === KEY && armed) { armed = false; throw new Error('storage'); } return origGet.call(this, k); });
    try {
      const p = createPurchase(rows().stock, '1');
      expect(p.confirm(true)).toEqual({ ok: true });
      await vi.waitFor(() => expect(p.snapshot().state).toBe('idle'), { timeout: 5000 });
      expect(p.snapshot().notice).toBe('storageFailed');
      expect(posts()).toHaveLength(0);
    } finally { set.mockRestore(); get.mockRestore(); }
    expect(stored().filter((e) => e.server_id === 's1')).toEqual([]);
    expect(rentPendingFor(capture()).filter((m) => m.server_id === 's1')).toEqual([]);
  });

  it('a stored hold still lets the rent go, marked before it is sent', async () => {
    quiet();
    heldLocks();
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    expect(stored().map((e) => e.server_id)).toEqual(['s1']);
  });
});

// Every stored rent hold is
// unsettled, so none is ever cut and no count refuses a rent; a store too full to keep a new hold refuses it at its
// admission (storageFailed, found by reading the write back).
describe('the rent pending store is never cut', () => {
  const KEY = 'hub.v3.rent_pending';
  const stored = () => JSON.parse(localStorage.getItem(KEY) || '[]') as Array<{ user_id: string; server_id: string; attempt: string; sending: boolean }>;
  const hold = (user: string, server: string, i: number, name: string | null = null) =>
    ({ user_id: user, server_id: server, name, days: '1', at: Date.now() - 60_000 + i, dismissed: i % 2 === 0, sending: false, attempt: `capseed-attempt-${String(i).padStart(4, '0')}` });
  const seed = (user: string, n: number) => Array.from({ length: n }, (_, i) => hold(user, `h${i}`, i));
  const answers: Array<(r: { status: number; body: unknown }) => void> = [];
  const hanging = () => {
    answers.length = 0;
    shopFor((c) => {
      if (c.method === 'POST') return new Promise((res) => { answers.push(res); });
      if (path(c) === '/rentals') return { status: 200, body: envelope([]) };
      return undefined;
    });
  };
  beforeEach(() => { localStorage.removeItem(KEY); });

  it('32 holds of this account: a 33rd rent is sent, stored, and every older hold is kept', async () => {
    hanging();
    heldLocks();
    const before = seed(UA, 32);
    localStorage.setItem(KEY, JSON.stringify(before));
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    const all = stored();
    expect(all).toHaveLength(33);
    expect(all.filter((x) => x.server_id !== 's1')).toEqual(before);
    expect(all.filter((x) => x.server_id === 's1')).toMatchObject([{ user_id: UA, sending: true }]);
  });

  it('another account\'s 32 holds: this account\'s rent is stored beside them, none cut (rows read per account)', async () => {
    hanging();
    heldLocks();
    const theirs = seed(UB, 32);
    localStorage.setItem(KEY, JSON.stringify(theirs));
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    const all = stored();
    expect(all).toHaveLength(33);
    expect(all.filter((x) => x.user_id === UB)).toEqual(theirs);
    expect(rentPendingFor(capture()).map((m) => m.server_id)).toEqual(['s1']);
  });

  it('the 33rd hold\'s unknown answer rewrites its own row in place: still 33, older rows kept', async () => {
    hanging();
    heldLocks();
    const before = seed(UA, 32);
    localStorage.setItem(KEY, JSON.stringify(before));
    createPurchase(rows().stock, '1').confirm(true);
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    answers[0]!({ status: 500, body: { error: 'X' } });
    await vi.waitFor(() => expect(stored().find((x) => x.server_id === 's1')?.sending).toBe(false), { timeout: 5000 });
    const after = stored();
    expect(after).toHaveLength(33);
    expect(after.filter((x) => x.server_id !== 's1')).toEqual(before);
  });

  it('size: 200 holds with near-longest ASCII fields stay far under the storage quota', async () => {
    hanging();
    heldLocks();
    const longUser = 'u'.repeat(128), longName = 'n'.repeat(200);
    const before = Array.from({ length: 199 }, (_, i) => ({ ...hold(longUser, `h${i}-${'x'.repeat(58)}`.slice(0, 64), i, longName), attempt: `a${String(i).padStart(4, '0')}${'z'.repeat(123)}` }));
    localStorage.setItem(KEY, JSON.stringify(before));
    const p = createPurchase(rows().stock, '1');
    expect(p.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(posts()).toHaveLength(1), { timeout: 5000 });
    const raw = localStorage.getItem(KEY)!;
    expect(JSON.parse(raw)).toHaveLength(200);
    expect((JSON.parse(raw) as Array<{ attempt: string }>).filter((x) => !/^a\d{4}z/.test(x.attempt))).toMatchObject([{ server_id: 's1', sending: true }]);
    expect((JSON.parse(raw) as Array<{ attempt: string }>).filter((x) => /^a\d{4}z/.test(x.attempt))).toEqual(before);
    // Measured: 126,545 characters (~124 KiB) at near-longest ASCII fields; 200 typical rows are
    // 41,491. JSON escaping can grow a row up to 6x (a name of quotes or control characters), about 330 KB at worst,
    // still far under a 5 MB origin quota; past what storage takes, the read-back refuses (storageFailed).
    expect(raw.length).toBeLessThan(160 * 1024);
  });

  // The list is never cut, so a snapshot that read the store once per server held grew
  // with the square of the servers. One snapshot reads and parses it once, with the same rows.
  it('one snapshot of 200 held servers reads and parses the store once, with one row per server as before', () => {
    hanging();
    const now = Date.now();
    const list = [...seed(UA, 200), { ...hold(UA, 'h0', 0), at: now, days: '7', dismissed: false, attempt: 'capseed-attempt-newest' }];
    const raw = JSON.stringify(list);
    localStorage.setItem(KEY, raw);
    const orig = Storage.prototype.getItem;
    let reads = 0;
    const get = vi.spyOn(localStorage, 'getItem').mockImplementation(function (this: Storage, k: string) {
      if (k === KEY) reads++;
      return orig.call(this, k);
    });
    const parse = vi.spyOn(JSON, 'parse');
    try {
      const pending = rentPendingFor(capture());
      expect(reads).toBe(1);
      expect(parse.mock.calls.filter((c) => c[0] === raw)).toHaveLength(1);
      expect(pending).toHaveLength(200);
      // Newest first; h0 shows its newest attempt, and is dismissed only when every attempt's warning was.
      expect(pending.map((m) => m.server_id)).toEqual(['h0', ...Array.from({ length: 199 }, (_, i) => `h${199 - i}`)]);
      expect(pending[0]).toMatchObject({ server_id: 'h0', days: '7', at: now, dismissed: false, sending: false, persisted: true });
      expect(pending.find((m) => m.server_id === 'h2')).toMatchObject({ dismissed: true });
      expect(pending.find((m) => m.server_id === 'h1')).toMatchObject({ dismissed: false });
    } finally { parse.mockRestore(); get.mockRestore(); }
  });
});

// The suite's drain (commerce-env drainMachines) never passes silently.
describe('the drain after each test', () => {
  it('fails, naming what is left, when a machine is still posting after 60 rounds', async () => {
    let disposed = 0;
    tracked({ dispose: () => { disposed++; }, snapshot: () => ({ state: 'posting' }) });
    await expect(drainMachines()).rejects.toThrow('1 of 1 machines still posting');
    expect(disposed).toBe(1);
  });
  it('returns once every machine is out of posting and nothing moved for 3 rounds', async () => {
    let state = 'posting';
    tracked({ dispose: () => { state = 'idle'; }, snapshot: () => ({ state }) });
    await expect(drainMachines()).resolves.toBeUndefined();
  });
});

// The drain does not await writes queued on the pending-store lock. What such a
// write, run after its test, can touch of the next test's store is pinned here. A late
// reserve drop writes nothing on a key it does not find.
describe('a write queued on the lock and run after its test, against the next test\'s store', () => {
  const RENT = 'hub.v3.rent_pending', MKT = 'hub_market_pending';
  const rentRow = { user_id: UA, server_id: 's7', name: null, days: '1', at: 1, dismissed: false, sending: false, attempt: 'fence-attempt-00000001' };
  const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(0); };
  it('rent: a dismiss queued behind a held lock, then the reset: released, it writes nothing', async () => {
    shopFor(() => undefined);
    const locks = heldLocks();
    localStorage.setItem(RENT, JSON.stringify([rentRow]));
    locks.hold();
    dismissRentPending(capture(), 's7');
    resetCommerce(); // the end of its test
    // The next test's store holds the very same row (the worst case: the queued write's own id).
    localStorage.setItem(RENT, JSON.stringify([rentRow]));
    const raw = localStorage.getItem(RENT);
    locks.release();
    await flush();
    expect(localStorage.getItem(RENT)).toBe(raw);
  });
  it('rent control: without the reset the same queued dismiss lands (the write was really queued)', async () => {
    shopFor(() => undefined);
    const locks = heldLocks();
    localStorage.setItem(RENT, JSON.stringify([rentRow]));
    locks.hold();
    dismissRentPending(capture(), 's7');
    expect(JSON.parse(localStorage.getItem(RENT)!)).toMatchObject([{ dismissed: false }]);
    locks.release();
    await flush();
    expect(JSON.parse(localStorage.getItem(RENT)!)).toMatchObject([{ dismissed: true }]);
  });
  // The next test's list as another tab may hold it: valid, holding a row this build reads as invalid, or not parsing.
  const nextRow = { user_id: UA, offer_id: 'o1', days: '30', ceiling: 1000, key: 'next-test-key-0000000001', at: 2, name: 'srv' };
  const nextLists = [
    JSON.stringify([nextRow]),
    JSON.stringify([nextRow, { user_id: UA, offer_id: 'bad offer', key: 'short' }]),
    '[{"user_id":',
  ];
  for (const [n, next] of nextLists.entries()) it(`reserve ${n}: a drop of an earlier test's key, run late against the next test's list, leaves it byte for byte and writes nothing`, async () => {
    shopFor(() => undefined);
    const locks = heldLocks();
    locks.hold();
    const late = marketPendingDrop('earlier-test-key-000000001');
    resetCommerce();
    localStorage.setItem(MKT, next); // the next test's own store, under its own fresh key
    const setSpy = vi.spyOn(localStorage, 'setItem'), removeSpy = vi.spyOn(localStorage, 'removeItem');
    try {
      locks.release();
      await late;
      await flush();
      expect(localStorage.getItem(MKT)).toBe(next);
      expect(setSpy.mock.calls.filter((c) => c[0] === MKT)).toEqual([]);
      expect(removeSpy.mock.calls.filter((c) => c[0] === MKT)).toEqual([]);
    } finally { setSpy.mockRestore(); removeSpy.mockRestore(); }
  });
  it('reserve control: a drop of a key the list holds still removes that row and keeps the others', async () => {
    const keep = { ...nextRow, offer_id: 'o2', key: 'kept-key-000000000000001' };
    localStorage.setItem(MKT, JSON.stringify([{ ...nextRow, key: 'drop-key-000000000000001' }, keep]));
    await marketPendingDrop('drop-key-000000000000001');
    await flush();
    expect(JSON.parse(localStorage.getItem(MKT)!)).toEqual([keep]);
  });
  it('reserve hit: a drop of a key the list holds rewrites the valid entries left, so an invalid row goes with it', async () => {
    const keep = { ...nextRow, offer_id: 'o2', key: 'kept-key-000000000000001' };
    localStorage.setItem(MKT, JSON.stringify([{ ...nextRow, key: 'drop-key-000000000000001' }, { user_id: UA, offer_id: 'bad offer', key: 'short' }, keep]));
    await marketPendingDrop('drop-key-000000000000001');
    await flush();
    expect(localStorage.getItem(MKT)).toBe(JSON.stringify([keep]));
  });
  it('reserve: a drop of a key held only by an invalid row writes nothing (no valid entry has it)', async () => {
    const next = JSON.stringify([nextRow, { user_id: UA, offer_id: 'bad offer', key: 'only-invalid-key-0000001' }]);
    localStorage.setItem(MKT, next);
    await marketPendingDrop('only-invalid-key-0000001');
    await flush();
    expect(localStorage.getItem(MKT)).toBe(next);
  });
});
