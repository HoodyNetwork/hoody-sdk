// Without Web Locks two tabs could each claim a different key for one purchase,
// and the server deduplicates per key, so both would charge. A browser without Web Locks claims no NEW money key:
// buy, pay, upgrade, rent, reserve (and top-up, commerce-nolocks-topup.test.ts) are refused with reason/notice
// 'noLocks'; nothing is written and nothing is sent. A key already stored is still usable (adopted, resent).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAttempt, createPurchase, rentPendingFor, marketPendingFor, reserveUnknownFor, resetCommerce } from './commerce';
import { claimPending, market as M, withPendingLock } from './commerce-pure';
import { capture } from './ctx';
import { installWebLocks } from './test/web-locks';
import { UA, breakKey, calls, envelope, noLocks, offerRaw, path, posts, reserve201, restoreStorage, rewriteKey, RENT_201, rows, shop, shopFor, uidOf, type Call, type Reply } from './test/commerce-env';
import { bounds } from './commerce';

const FAM = 'f00df00df00df00df00df00d';
const PLAN = { id: 'v1', family_id: FAM, price_cents_per_month: 900, hold_days: 7, text: { title: 'Plus' } };
const DONE = { operation: { id: 'op1', subscription_id: 'sub1', kind: 'purchase', target_plan_id: 'v1', result: null }, subscription: { id: 'sub1', state: 'provisioning' }, replayed: false };
const jsonLocal = (k: string) => JSON.parse(localStorage.getItem(k) || '[]') as Array<Record<string, unknown>>;
const why = (r: unknown) => (r as { reason?: string }).reason;
const buyRow = (o: Record<string, unknown>) => ({ kind: 'buy', user_id: UA, key: 'kept-key-0000000001', max_charge_cents: 900, at: 1, family_id: FAM, plan_id: 'v1', title: 'Plus', ...o });
const entry = (key: string) => ({ kind: 'buy' as const, user_id: UA, key, max_charge_cents: 900, at: 1, family_id: FAM, plan_id: 'v1' });

function money(post: (c: Call) => Reply | Promise<Reply>, o: Parameters<typeof shop>[0] = {}) {
  const s = shop({ ...o, fetch: (c) => {
    const p = path(c);
    if (p.includes('/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) };
    if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
    if (c.method === 'POST') return post(c);
    return { status: 404, body: {} };
  } });
  Object.assign(bounds, { read: 1000, post: 1000, op: 1000, list: 300, slack: 10 });
  return s;
}

afterEach(() => { restoreStorage(); noLocks(); vi.useRealTimers(); resetCommerce(); });

describe('core claim (commerce-pure claimPending) without Web Locks', () => {
  beforeEach(() => { resetCommerce(); localStorage.clear(); });
  it('a new key is refused (noLocks) and nothing is written', async () => {
    noLocks();
    await expect(claimPending(entry('new-key-00000000001'))).rejects.toEqual({ preflight: 'noLocks' });
    expect(localStorage.getItem('hub_money_pending')).toBeNull();
  });
  it('a key already stored for the target is still handed back (adopted, usable)', async () => {
    localStorage.setItem('hub_money_pending', JSON.stringify([entry('kept-key-0000000001')]));
    noLocks();
    expect((await claimPending(entry('new-key-00000000001'))).key).toBe('kept-key-0000000001');
  });
  it('a locks.request that throws is no lock either: a new key is refused', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: () => { throw new Error('SecurityError'); } } });
    await expect(claimPending(entry('new-key-00000000001'))).rejects.toEqual({ preflight: 'noLocks' });
    expect(localStorage.getItem('hub_money_pending')).toBeNull();
  });
  it('with Web Locks a new key is claimed as before, and withPendingLock still runs other work without them', async () => {
    expect((await claimPending(entry('new-key-00000000001'))).key).toBe('new-key-00000000001');
    noLocks();
    expect(await withPendingLock(() => 7)).toBe(7);
  });
});

describe('buy and upgrade attempts without Web Locks', () => {
  beforeEach(() => { resetCommerce(); });
  it('buy: Confirm is refused noLocks before any request; the store stays empty', async () => {
    const s = money(() => ({ status: 201, body: envelope(DONE) }));
    const a = createAttempt('buy', { plan: PLAN, title: 'Plus' });
    await a.quote();
    noLocks();
    calls.length = 0;
    const r = await a.confirm(true);
    expect(r).toMatchObject({ ok: false, reason: 'noLocks', notSent: true });
    expect(a.snapshot().notice).toBe('noLocks');
    expect(calls).toEqual([]);
    expect(jsonLocal('hub_money_pending')).toEqual([]);
    void s;
  });
  it('upgrade: refused noLocks, nothing stored under hub_money_upgrade, no request', async () => {
    money(() => ({ status: 201, body: envelope(DONE) }));
    const a = createAttempt('upgrade', { sub: { id: 'x1' }, plan: { id: 'pro-v1' }, title: 'Pro' });
    await a.quote();
    noLocks();
    calls.length = 0;
    expect(why(await a.confirm(true))).toBe('noLocks');
    expect(calls).toEqual([]);
    expect(jsonLocal('hub_money_upgrade')).toEqual([]);
  });
  it('pay: refused noLocks, no request', async () => {
    money(() => ({ status: 201, body: envelope(DONE) }));
    const a = createAttempt('pay', { sub: { id: 'x1' } });
    await a.quote();
    noLocks();
    calls.length = 0;
    expect(why(await a.confirm(true))).toBe('noLocks');
    expect(calls).toEqual([]);
    expect(jsonLocal('hub_money_pending')).toEqual([]);
  });
  it('a kept buy key is still usable: resent under that same key, no new key minted', async () => {
    money(() => ({ status: 201, body: envelope(DONE) }), { local: { hub_money_pending: JSON.stringify([buyRow({})]) } });
    noLocks();
    const a = createAttempt('buy', { plan: PLAN, title: 'Plus' });
    await a.quote();
    let r = await a.confirm(true);
    if (why(r) === 'adopted') r = await a.confirm(true); // a page that had not picked it up adopts it first
    expect(r.ok).toBe(true);
    const sent = posts();
    expect(sent).toHaveLength(1);
    expect((sent[0]!.body as Record<string, unknown>).idempotency_key).toBe('kept-key-0000000001');
  });
  for (const kind of ['buy', 'upgrade'] as const) {
    it(`${kind}: a kept key another tab drops between Confirm's check and the claim is not replaced by a new key: gone, no request`, async () => {
      const store = kind === 'buy' ? 'hub_money_pending' : 'hub_money_upgrade';
      const kept = kind === 'buy' ? buyRow({}) : { kind: 'upgrade', user_id: UA, key: 'kept-up-000000000001', max_charge_cents: 450, at: 1, sub_id: 'x1', plan_id: 'pro-v1', title: 'Pro' };
      let dropAtAuth = false;
      const s = shop({ local: { [store]: JSON.stringify([kept]) }, fetch: (c) => {
        const p = path(c);
        if (p.includes('/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) };
        if (p === '/users/auth/me') {
          if (dropAtAuth) localStorage.setItem(store, '[]'); // the other tab settles and drops the kept key now
          return { status: 200, body: envelope({ id: uidOf(c) }) };
        }
        if (c.method === 'POST') return { status: 201, body: envelope(DONE) };
        return { status: 404, body: {} };
      } });
      Object.assign(bounds, { read: 1000, post: 1000, op: 1000, list: 300, slack: 10 });
      noLocks();
      const a = kind === 'buy' ? createAttempt('buy', { plan: PLAN, title: 'Plus' }) : createAttempt('upgrade', { sub: { id: 'x1' }, plan: { id: 'pro-v1' }, title: 'Pro' });
      await a.quote();
      dropAtAuth = true;
      let r = await a.confirm(true);
      if (why(r) === 'adopted') { localStorage.setItem(store, JSON.stringify([kept])); r = await a.confirm(true); }
      // The claim now refuses a vanished kept entry as 'gone' before the no-locks branch (it was answered
      // elsewhere); either way nothing is sent and no new key is written.
      expect(why(r)).toBe('gone');
      expect(posts()).toEqual([]);
      expect(jsonLocal(store)).toEqual([]);
      void s;
    });
  }
  it('with Web Locks the same buy goes out (the refusal is only the no-locks branch)', async () => {
    money(() => ({ status: 201, body: envelope(DONE) }));
    const a = createAttempt('buy', { plan: PLAN, title: 'Plus' });
    await a.quote();
    expect((await a.confirm(true)).ok).toBe(true);
    expect(posts()).toHaveLength(1);
  });
});

describe('rent and reserve admissions without Web Locks', () => {
  const sleep = (ms: number): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);
  beforeEach(() => { vi.useFakeTimers(); resetCommerce(); });
  it('rent: back to idle with notice noLocks; no POST and no rent marker', async () => {
    shopFor((c) => (path(c) === '/servers/s1/rent' ? { status: 201, body: RENT_201 } : undefined));
    noLocks();
    const p = createPurchase(rows().stock, '1');
    p.confirm(true);
    await sleep(30);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'noLocks' });
    expect(posts()).toEqual([]);
    expect(localStorage.getItem('hub.v3.rent_pending')).toBeNull();
    expect(rentPendingFor(capture())).toEqual([]);
  });
  it('rent again anyway is a new attempt too: refused', async () => {
    shopFor((c) => (path(c) === '/servers/s1/rent' ? { status: 201, body: RENT_201 } : undefined));
    noLocks();
    const p = createPurchase(rows().stock, '1');
    p.confirm(true, { rentAgainAnyway: true });
    await sleep(30);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'noLocks' });
    expect(posts()).toEqual([]);
  });
  it('reserve: back to idle with notice noLocks; no POST and no stored key', async () => {
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
    noLocks();
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(30);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'noLocks' });
    expect(posts()).toEqual([]);
    expect(localStorage.getItem('hub_market_pending')).toBeNull();
    expect(marketPendingFor(capture())).toEqual([]);
  });
  it('with Web Locks rent and reserve go out as before', async () => {
    shopFor((c) => (path(c) === '/servers/s1/rent' ? { status: 201, body: RENT_201 } : path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
    createPurchase(rows().stock, '1').confirm(true);
    createPurchase(rows().offer, '7').confirm(true);
    await sleep(40);
    expect(posts().map(path).sort()).toEqual(['/offers/o1/reserve', '/servers/s1/rent']);
  });
  // A lock that rejects after its granted
  // callback saved the reserve's key leaves that key behind, never sent; another tab may recover and send it. Core
  // says so (this item's unresolved reserve: outcome unknown, Check again), never a plain busy with no notice, which
  // the drawer reads as "not sent" once that other tab has dropped the key.
  it('reserve: a lock that rejects after its callback saved the key answers unresolvedReserve, not plain busy; no POST', async () => {
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, cb: () => unknown) => { cb(); return Promise.reject(new Error('after')); } } });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(30);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve' });
    expect(posts()).toEqual([]);
    expect(marketPendingFor(capture())).toHaveLength(1);
  });
  // That late reject is remembered as this tab's hold of the
  // offer in the admission's answer, even when its dialog was disposed meanwhile (the drawer closed).
  it('reserve: a late reject after a saved key, its dialog disposed meanwhile, still leaves the hold; no POST', async () => {
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, cb: () => unknown) => { cb(); return Promise.reject(new Error('after')); } } });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    p.dispose();
    await sleep(30);
    expect(posts()).toEqual([]);
    expect(reserveUnknownFor(capture(), 'o1', '7')).toEqual({ since: expect.any(Number) as unknown as number, days: '7' });
  });
  // A late reject after a proved write, then another tab
  // sends and drops that key before this tab's answer: an admission already waiting for the lock must still be refused.
  it('reserve: a late reject, the key dropped by another tab before the answer, and a waiting admission: refused, no POST', async () => {
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
    const q: Array<{ cb: () => unknown; ok: (v: unknown) => void; no: (e: unknown) => void }> = [];
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, cb: () => unknown) => new Promise((ok, no) => { q.push({ cb, ok, no }); }) } });
    const a = createPurchase(rows().offer, '7');
    const b = createPurchase(rows().offer, '7');
    a.confirm(true);
    b.confirm(true);
    await sleep(5);
    expect(q).toHaveLength(2);
    // a: granted, its key written and read back, then the lock rejects late.
    q[0]!.cb();
    q[0]!.no(new Error('after'));
    expect(marketPendingFor(capture())).toHaveLength(1);
    // Another tab recovers that key, sends it and drops it, before a's answer (still a microtask away).
    localStorage.setItem('hub_market_pending', '[]');
    // b: granted next, waiting since before a's key existed.
    q[1]!.ok(q[1]!.cb());
    await sleep(30);
    expect(posts()).toEqual([]);
    expect(b.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve' });
    expect(a.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve' });
    expect(reserveUnknownFor(capture(), 'o1', '7')).toEqual({ since: expect.any(Number) as unknown as number, days: '7' });
  });
  // The hold goes once its own key is proved: a confirmed resend of the kept key (2xx) releases it.
  it('reserve: the late reject\'s hold is released by the confirmed resend of its own key', async () => {
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201(true) } : undefined));
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, cb: () => unknown) => { cb(); return Promise.reject(new Error('after')); } } });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(30);
    expect(reserveUnknownFor(capture(), 'o1', '7')).not.toBeNull();
    const [rec] = marketPendingFor(capture());
    installWebLocks();
    const h = createPurchase(rows().offer, rec!.days, { recover: rec });
    expect(h.retry()).toBe(true);
    await sleep(40);
    expect(h.snapshot().state).toBe('confirmed');
    expect(posts().map((c) => c.body.idempotency_key)).toEqual([rec!.key]);
    expect(reserveUnknownFor(capture(), 'o1', '7')).toBeNull();
  });
  // An admission that sends its own proved key releases its hold: the kept key and its machine hold the offer from there.
  it('reserve: an admission that sends its own key leaves no hold; a definitive refusal leaves none either', async () => {
    installWebLocks();
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(40);
    expect(p.snapshot().state).toBe('confirmed');
    expect(reserveUnknownFor(capture(), 'o1', '7')).toBeNull();
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 400, body: { statusCode: 400, error: 'CHARGE_EXCEEDS_MAX', code: 'CHARGE_EXCEEDS_MAX', message: 'x', data: {} } } : undefined));
    const q = createPurchase(rows().offer, '7');
    q.confirm(true);
    await sleep(40);
    expect(q.snapshot().state).toBe('failed');
    expect(reserveUnknownFor(capture(), 'o1', '7')).toBeNull();
  });
  it('reserve: a send of another offer releases only its own key\'s hold', async () => {
    installWebLocks();
    shopFor((c) => (path(c) === '/offers/o2/reserve' ? { status: 201, body: reserve201(false, 'o2') } : undefined));
    breakKey('setItem', 'hub_market_pending', 'drop', [1]);
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(40);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve' });
    restoreStorage();
    installWebLocks();
    const other = createPurchase(M.normalizeOfferRow(offerRaw({ id: 'o2' }), 0), '7');
    other.confirm(true);
    await sleep(40);
    expect(other.snapshot().state).toBe('confirmed');
    expect(reserveUnknownFor(capture(), 'o1', '7')).not.toBeNull();
  });
  it('reserve: a proved key whose dialog was disposed before the answer is dropped, and its hold with it', async () => {
    installWebLocks();
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    p.dispose();
    await sleep(40);
    expect(posts()).toEqual([]);
    expect(marketPendingFor(capture())).toEqual([]);
    expect(reserveUnknownFor(capture(), 'o1', '7')).toBeNull();
  });
  // The disposed admission's cleanup releases its hold only with a proved
  // removal of its unsent key. Another tab may recover the key before that cleanup's lock: it sends and drops it, or is
  // still sending it (a live flight). Either way the hold stays, and a fresh Confirm is refused, unsent.
  const disposedThen = async (otherTab: () => void): Promise<void> => {
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
    const q: Array<{ cb: () => unknown; ok: (v: unknown) => void }> = [];
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, cb: () => unknown) => new Promise((ok) => { q.push({ cb, ok }); }) } });
    const a = createPurchase(rows().offer, '7');
    a.confirm(true);
    await sleep(5);
    expect(q).toHaveLength(1);
    // a: granted, its key written and read back (proved); the dialog closes before the answer.
    q[0]!.ok(q[0]!.cb());
    a.dispose();
    await sleep(5);
    expect(q).toHaveLength(2);
    otherTab();
    // The cleanup's lock is granted only now.
    q[1]!.ok(q[1]!.cb());
    await sleep(30);
    expect(posts()).toEqual([]);
    expect(reserveUnknownFor(capture(), 'o1', '7')).toEqual({ since: expect.any(Number) as unknown as number, days: '7' });
  };
  it('reserve: a disposed proved key that another tab sent and dropped first keeps the hold; a new Confirm is refused', async () => {
    await disposedThen(() => { localStorage.setItem('hub_market_pending', '[]'); });
    installWebLocks();
    const b = createPurchase(rows().offer, '7');
    b.confirm(true);
    await sleep(40);
    expect(b.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve' });
    expect(posts()).toEqual([]);
  });
  it('reserve: a disposed proved key that another tab is sending (a live flight) stays kept, and so does the hold', async () => {
    await disposedThen(() => {
      const list = jsonLocal('hub_market_pending');
      expect(list).toHaveLength(1);
      list[0]!.flights = [{ id: 'other-tab-flight-1', at: Date.now() }];
      localStorage.setItem('hub_market_pending', JSON.stringify(list));
    });
    expect(marketPendingFor(capture())).toHaveLength(1);
  });
  // A flight ends on any HTTP answer, a 5xx (outcome unknown) included, and a lost answer's goes stale: no
  // flight is not proof that the key was never sent. A key any tab ever sent keeps its stamp (sent_at), so the cleanup
  // keeps both the key and the hold.
  it('reserve: a disposed proved key that another tab sent earlier (its flight already over) stays kept, and so does the hold', async () => {
    await disposedThen(() => {
      const list = jsonLocal('hub_market_pending');
      expect(list).toHaveLength(1);
      list[0]!.sent_at = Date.now();
      localStorage.setItem('hub_market_pending', JSON.stringify(list));
    });
    expect(marketPendingFor(capture())).toHaveLength(1);
  });
  it('reserve: a send of a kept key stamps sent_at on it, kept after its flight ends on a 5xx answer', async () => {
    let answer: Reply = { status: 201, body: reserve201() };
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? answer : undefined));
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, cb: () => unknown) => { cb(); return Promise.reject(new Error('after')); } } });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(30);
    const [rec] = marketPendingFor(capture());
    expect(rec!.sent_at).toBeUndefined();
    answer = { status: 503, body: { statusCode: 503, error: 'x', code: 'UNAVAILABLE', message: 'x', data: {} } };
    installWebLocks();
    const h = createPurchase(rows().offer, rec!.days, { recover: rec });
    expect(h.retry()).toBe(true);
    await sleep(60);
    expect(posts().map((c) => c.body.idempotency_key)).toContain(rec!.key);
    const e = jsonLocal('hub_market_pending').find((x) => x.key === rec!.key);
    expect(e?.flights).toBeUndefined();
    expect(typeof e?.sent_at).toBe('number');
  });
  // A stale flight with no sent_at (left by a send of older code) is a send too.
  it('reserve: a disposed proved key with only a stale flight (no sent_at) stays kept, and so does the hold', async () => {
    await disposedThen(() => {
      const list = jsonLocal('hub_market_pending');
      expect(list).toHaveLength(1);
      list[0]!.flights = [{ id: 'old-tab-flight-01', at: Date.now() - 24 * 3600 * 1000 }];
      localStorage.setItem('hub_market_pending', JSON.stringify(list));
    });
    expect(marketPendingFor(capture())).toHaveLength(1);
  });
  // A fresh send whose own flight could not be registered sends nothing and ends
  // failed; another tab may have sent that key meanwhile (it stamped sent_at, its flight ended on a 5xx). The failure
  // removes the key only as unsent (marketPendingDropUnsent), so the sent key stays and holds the offer.
  it('reserve: a fresh send refused for its own unregistered flight keeps a key another tab sent meanwhile', async () => {
    installWebLocks();
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
    let n = 0;
    // setItem 1 is the admission's write; 2 is this dispatch's flight, which loses to the other tab's send (sent_at, no flight).
    rewriteKey('hub_market_pending', (v) => {
      if (++n !== 2) return v;
      const list = JSON.parse(v) as Array<Record<string, unknown>>;
      for (const e of list) { delete e.flights; e.sent_at = Date.now(); }
      return JSON.stringify(list);
    });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(60);
    expect(posts()).toEqual([]);
    expect(p.snapshot().state).toBe('failed');
    restoreStorage();
    const kept = marketPendingFor(capture());
    expect(kept).toHaveLength(1);
    expect(typeof kept[0]!.sent_at).toBe('number');
    installWebLocks();
    const b = createPurchase(rows().offer, '7');
    b.confirm(true);
    await sleep(40);
    expect(b.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve' });
    expect(posts()).toEqual([]);
  });
  // A definitive refusal proves only that this request did not run: a 429 (the limiter, per request) or a 5xx
  // PRICING_INVALID can refuse this tab's send of a key while another tab's send of the same key passes. The refusal
  // removes the key only when every recorded send of it is this dispatch's own (marketPendingDropOwn).
  it('reserve: a fresh send refused 429 keeps the key when another tab also sent it', async () => {
    installWebLocks();
    shopFor((c) => {
      if (path(c) !== '/offers/o1/reserve') return undefined;
      // Another tab registered its own send of this key while this one was on the wire.
      const list = jsonLocal('hub_market_pending');
      for (const e of list) {
        e.flights = [...((e.flights as unknown[]) || []), { id: 'other-tab-flight-2', at: Date.now() }];
        e.sends = [...((e.sends as unknown[]) || []), 'other-tab-flight-2'];
      }
      localStorage.setItem('hub_market_pending', JSON.stringify(list));
      return { status: 429, body: { statusCode: 429, error: 'x', code: 'RATE_LIMITED', message: 'x', data: {} } };
    });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(60);
    expect(p.snapshot().state).toBe('failed');
    expect(marketPendingFor(capture())).toHaveLength(1);
    const b = createPurchase(rows().offer, '7');
    b.confirm(true);
    await sleep(40);
    expect(b.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve' });
    expect(posts()).toHaveLength(1);
  });
  it('reserve: a fresh send refused 429 keeps the key another tab sent and got a 5xx for (its flight already over)', async () => {
    installWebLocks();
    shopFor((c) => {
      if (path(c) !== '/offers/o1/reserve') return undefined;
      const list = jsonLocal('hub_market_pending');
      for (const e of list) e.sends = [...((e.sends as unknown[]) || []), 'other-tab-flight-4'];
      localStorage.setItem('hub_market_pending', JSON.stringify(list));
      return { status: 429, body: { statusCode: 429, error: 'x', code: 'RATE_LIMITED', message: 'x', data: {} } };
    });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(60);
    expect(p.snapshot().state).toBe('failed');
    expect(marketPendingFor(capture())).toHaveLength(1);
  });
  // An entry sent before the send list existed (sent_at, no sends) is unknown, never "all own".
  it('reserve: a resend refused 429 keeps a key whose earlier send has no send list (older code)', async () => {
    let answer: Reply = { status: 201, body: reserve201() };
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? answer : undefined));
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, cb: () => unknown) => { cb(); return Promise.reject(new Error('after')); } } });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(30);
    const list = jsonLocal('hub_market_pending');
    expect(list).toHaveLength(1);
    list[0]!.sent_at = Date.now() - 60000;
    localStorage.setItem('hub_market_pending', JSON.stringify(list));
    const [rec] = marketPendingFor(capture());
    answer = { status: 429, body: { statusCode: 429, error: 'x', code: 'RATE_LIMITED', message: 'x', data: {} } };
    installWebLocks();
    const h = createPurchase(rows().offer, rec!.days, { recover: rec });
    expect(h.retry()).toBe(true);
    await sleep(60);
    expect(posts().map((c) => c.body.idempotency_key)).toContain(rec!.key);
    const e = jsonLocal('hub_market_pending').find((x) => x.key === rec!.key);
    expect(e).toBeDefined();
    expect(e!.sends).toContain('prior-unrecorded-sends');
  });
  it('reserve: a fresh send refused 429 keeps the key when an older tab is sending it (a flight, no recorded send)', async () => {
    installWebLocks();
    shopFor((c) => {
      if (path(c) !== '/offers/o1/reserve') return undefined;
      const list = jsonLocal('hub_market_pending');
      for (const e of list) e.flights = [...((e.flights as unknown[]) || []), { id: 'old-tab-flight-03', at: Date.now() }];
      localStorage.setItem('hub_market_pending', JSON.stringify(list));
      return { status: 429, body: { statusCode: 429, error: 'x', code: 'RATE_LIMITED', message: 'x', data: {} } };
    });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(60);
    expect(p.snapshot().state).toBe('failed');
    expect(marketPendingFor(capture())).toHaveLength(1);
  });
  it('reserve: a fresh send refused 429 that only this dispatch sent drops its key', async () => {
    installWebLocks();
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 429, body: { statusCode: 429, error: 'x', code: 'RATE_LIMITED', message: 'x', data: {} } } : undefined));
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(60);
    expect(p.snapshot().state).toBe('failed');
    expect(posts()).toHaveLength(1);
    expect(marketPendingFor(capture())).toEqual([]);
  });
  // A full send list is unknown (older sends fell off its end), so even a list of only this dispatch's id keeps the key
  // (the full list is written here, ids are unique in use).
  it('reserve: a fresh send refused 429 keeps its key when the send list is full (16 = unknown)', async () => {
    installWebLocks();
    shopFor((c) => {
      if (path(c) !== '/offers/o1/reserve') return undefined;
      const list = jsonLocal('hub_market_pending');
      for (const e of list) {
        const own = (e.sends as string[]).at(-1)!;
        e.sends = Array.from({ length: 16 }, () => own);
      }
      localStorage.setItem('hub_market_pending', JSON.stringify(list));
      return { status: 429, body: { statusCode: 429, error: 'x', code: 'RATE_LIMITED', message: 'x', data: {} } };
    });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(60);
    expect(p.snapshot().state).toBe('failed');
    expect(posts()).toHaveLength(1);
    expect(marketPendingFor(capture())).toHaveLength(1);
  });
  it('reserve: a disposed proved key whose removal does not land (the store kept it) keeps both the key and the hold', async () => {
    installWebLocks();
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
    // Another offer's kept key, so the cleanup's write is a setItem (an empty list is a removeItem).
    localStorage.setItem('hub_market_pending', JSON.stringify([{ user_id: UA, offer_id: 'o2', days: '7', ceiling: 100, key: 'other-offer-key-000001', at: 1 }]));
    // setItem 1 is the admission's write, 2 the cleanup's: that one silently stores nothing.
    breakKey('setItem', 'hub_market_pending', 'drop', [2]);
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    p.dispose();
    await sleep(40);
    expect(posts()).toEqual([]);
    expect(marketPendingFor(capture()).map((e) => e.offer_id).sort()).toEqual(['o1', 'o2']);
    expect(reserveUnknownFor(capture(), 'o1', '7')).toEqual({ since: expect.any(Number) as unknown as number, days: '7' });
  });
  // A write that landed but whose read-back cannot prove it (reads of hub_market_pending: 1 the early
  // check, 2 the locked check, 3 the insert read, 4 the read-back) may still leave the key: not a plain busy either.
  it('reserve: a lock that rejects after a write whose read-back failed answers unresolvedReserve too; no POST', async () => {
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
    breakKey('getItem', 'hub_market_pending', 'throw', [4]);
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, cb: () => unknown) => { cb(); return Promise.reject(new Error('after')); } } });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(30);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: 'unresolvedReserve' });
    expect(posts()).toEqual([]);
    restoreStorage();
    expect(marketPendingFor(capture())).toHaveLength(1);
  });
  it('reserve: a lock wait that gives up before its callback runs saves nothing and stays plain busy (no notice)', async () => {
    shopFor((c) => (path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: () => new Promise(() => undefined) } });
    const p = createPurchase(rows().offer, '7');
    p.confirm(true);
    await sleep(bounds.read + 50);
    expect(p.snapshot()).toMatchObject({ state: 'idle', notice: null });
    expect(posts()).toEqual([]);
    expect(marketPendingFor(capture())).toEqual([]);
  });
});

// A two-tab Playwright regression cannot run on fixtures: the fixture checkout does not use core's
// commerce (pages/billing/data.ts:729-731). The same cases on core, with a second tab of the fake Web Locks sharing
// this tab's storage.
describe('two tabs, one purchase', () => {
  beforeEach(() => { resetCommerce(); localStorage.clear(); });
  const nap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const famBuys = () => jsonLocal('hub_money_pending').filter((e) => e.kind === 'buy' && e.family_id === FAM && e.user_id === UA);
  it('competing fresh claims for one family produce one key; the losing tab adopts it, nothing is sent under a second key', async () => {
    const W = installWebLocks();
    let release: () => void = () => undefined;
    money(() => new Promise<Reply>((res) => { release = () => res({ status: 201, body: envelope(DONE) }); }));
    const a = createAttempt('buy', { plan: PLAN, title: 'Plus' });
    await a.quote();
    const other = W.asClient('tab2', () => claimPending(entry('tab2-key-0000000001')));
    const mine = a.confirm(true);
    const theirs = await other;
    for (let i = 0; i < 20 && posts().length === 0 && famBuys().length === 1 && famBuys()[0]!.key !== theirs.key; i++) await nap(5);
    await nap(30);
    const stored = famBuys();
    expect(stored).toHaveLength(1);
    expect(theirs.key).toBe(stored[0]!.key);
    const sent = posts().map((c) => (c.body as Record<string, unknown>).idempotency_key);
    expect(sent.length).toBeLessThanOrEqual(1);
    for (const k of sent) expect(k).toBe(stored[0]!.key);
    release();
    const r = await mine;
    if (stored[0]!.key === 'tab2-key-0000000001') { expect(why(r)).toBe('adopted'); expect(sent).toEqual([]); }
    else expect(r.ok).toBe(true);
  });
  it('a tab whose purchase has a key kept by another tab reuses that key and never mints a new one', async () => {
    installWebLocks();
    money(() => ({ status: 201, body: envelope(DONE) }), { local: { hub_money_pending: JSON.stringify([buyRow({})]) } });
    const a = createAttempt('buy', { plan: PLAN, title: 'Plus' });
    await a.quote();
    let r = await a.confirm(true);
    if (why(r) === 'adopted') r = await a.confirm(true);
    expect(r.ok).toBe(true);
    expect(posts().map((c) => (c.body as Record<string, unknown>).idempotency_key)).toEqual(['kept-key-0000000001']);
    expect(famBuys().filter((e) => e.key !== 'kept-key-0000000001')).toEqual([]);
  });
});

// A Web Locks API that is present but never grants (request throws, or its promise rejects
// without running the callback) is no lock either. Every fresh-money claim is refused noLocks, never a generic
// failure; a key already stored still goes; a callback's own error is never swallowed or run twice.
const brokenLocks = (how: 'throw' | 'reject') => Object.defineProperty(navigator, 'locks', {
  configurable: true,
  value: { request: how === 'throw' ? () => { throw new DOMException('denied', 'SecurityError'); } : () => Promise.reject(new DOMException('denied', 'SecurityError')) },
});
describe('a present but unusable Web Locks API', () => {
  beforeEach(() => { resetCommerce(); localStorage.clear(); });
  it('claimPending: a request that rejects without granting is refused noLocks; nothing written', async () => {
    brokenLocks('reject');
    await expect(claimPending(entry('new-key-00000000001'))).rejects.toEqual({ preflight: 'noLocks' });
    expect(localStorage.getItem('hub_money_pending')).toBeNull();
  });
  it('withPendingLock: a granted callback that throws rejects with its own error and runs once', async () => {
    let n = 0;
    await expect(withPendingLock(() => { n++; throw new Error('own'); })).rejects.toThrow('own');
    expect(n).toBe(1);
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, cb: () => unknown) => { cb(); return Promise.reject(new Error('after')); } } });
    n = 0;
    await expect(withPendingLock(() => { n++; return 1; })).rejects.toThrow('after');
    expect(n).toBe(1);
  });
  for (const how of ['throw', 'reject'] as const) {
    for (const kind of ['buy', 'upgrade', 'pay'] as const) {
      it(`${kind} (locks.request ${how}s): refused noLocks, no POST, nothing stored`, async () => {
        money(() => ({ status: 201, body: envelope(DONE) }));
        const a = kind === 'buy' ? createAttempt('buy', { plan: PLAN, title: 'Plus' }) : kind === 'upgrade' ? createAttempt('upgrade', { sub: { id: 'x1' }, plan: { id: 'pro-v1' }, title: 'Pro' }) : createAttempt('pay', { sub: { id: 'x1' } });
        await a.quote();
        brokenLocks(how);
        const r = await a.confirm(true);
        expect(r).toMatchObject({ ok: false, reason: 'noLocks', notSent: true });
        expect(a.snapshot().notice).toBe('noLocks');
        expect(posts()).toEqual([]);
        expect(jsonLocal('hub_money_pending')).toEqual([]);
        expect(jsonLocal('hub_money_upgrade')).toEqual([]);
      });
    }
    it(`a kept buy key is still resent under that key (locks.request ${how}s)`, async () => {
      money(() => ({ status: 201, body: envelope(DONE) }), { local: { hub_money_pending: JSON.stringify([buyRow({})]) } });
      brokenLocks(how);
      const a = createAttempt('buy', { plan: PLAN, title: 'Plus' });
      await a.quote();
      let r = await a.confirm(true);
      if (why(r) === 'adopted') r = await a.confirm(true);
      expect(r.ok).toBe(true);
      expect(posts()).toHaveLength(1);
      expect((posts()[0]!.body as Record<string, unknown>).idempotency_key).toBe('kept-key-0000000001');
    });
  }
});
describe('rent and reserve with an unusable Web Locks API', () => {
  const sleep = (ms: number): Promise<void> => vi.advanceTimersByTimeAsync(ms).then(() => undefined);
  beforeEach(() => { vi.useFakeTimers(); resetCommerce(); });
  for (const how of ['throw', 'reject'] as const) {
    it(`rent and reserve (locks.request ${how}s): back to idle with notice noLocks; no POST, nothing stored`, async () => {
      shopFor((c) => (path(c) === '/servers/s1/rent' ? { status: 201, body: RENT_201 } : path(c) === '/offers/o1/reserve' ? { status: 201, body: reserve201() } : undefined));
      brokenLocks(how);
      const rent = createPurchase(rows().stock, '1');
      const res = createPurchase(rows().offer, '7');
      rent.confirm(true);
      res.confirm(true);
      await sleep(30);
      expect(rent.snapshot()).toMatchObject({ state: 'idle', notice: 'noLocks' });
      expect(res.snapshot()).toMatchObject({ state: 'idle', notice: 'noLocks' });
      expect(posts()).toEqual([]);
      expect(localStorage.getItem('hub.v3.rent_pending')).toBeNull();
      expect(localStorage.getItem('hub_market_pending')).toBeNull();
    });
  }
});

// A request that runs the callback synchronously and lets its error escape (a shim like
// `request: (n, cb) => Promise.resolve(cb())`) must not fall back: the callback ran, so its own error stands, once.
describe('withPendingLock: a synchronous grant whose callback throws', () => {
  it('rejects with the callback\'s own error and runs it once', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, cb: () => unknown) => Promise.resolve(cb()) } });
    let n = 0;
    const own = new Error('own');
    await expect(withPendingLock(() => { n++; throw own; })).rejects.toBe(own);
    expect(n).toBe(1);
  });
});
