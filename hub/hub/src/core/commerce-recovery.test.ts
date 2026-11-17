// Core half: every recovery read of a held money request issues GETs
// only and keeps the hold on anything short of proof. checkPlanHold (buy, upgrade), checkPayHold (pay),
// checkReserveHold (reserve) and the top-up machine's checkAgain run on the real core behind ONE recording spy per
// test: each request is first appended to the test-owned `calls`, then a GET or HEAD gets its fixture reply and any
// other method gets a thrown error. The throw never decides a case: every case asserts writesIn(calls) in the test
// body, after the check settled. The deliberate resend (top-up resend(true)) is the one path that sends, once, with
// the kept key, method, route and body; resend without `true` sends nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bounds, checkPayHold, checkPlanHold, checkReserveHold, commerceRoutes, createAttempt, createPurchase, createTopUp, marketPendingFor,
  resetCommerce, type HoldCheck,
} from './commerce';
import { envelope, fast, noLocks, path, restoreStorage, rows, shop, uidOf, UA, UB, type Call, type Reply, type Shop } from './test/commerce-env';
import { installWebLocks } from './test/web-locks';

// ── the recording spy ──────────────────────────────────────────────────────────────────────────────
interface Sent { method: string; route: string; key: string | undefined; body: unknown }
/** Every request of the test, in order, recorded BEFORE it is answered. */
const calls: Sent[] = [];
/** The writes in a record: anything but GET and HEAD. */
const writesIn = (cs: readonly Sent[]): Sent[] => cs.filter((c) => c.method !== 'GET' && c.method !== 'HEAD');
const getsIn = (cs: readonly Sent[]): string[] => cs.filter((c) => c.method === 'GET').map((c) => c.route);
/** The GET fixtures of the test (route without host, /api/v1 or query). Unlisted reads answer 404. */
let reads: (route: string, c: Call) => Reply | undefined = () => undefined;
/** Set only by a resend test: the one write it lets through, answered with this outcome. */
let answerOneWrite: ((c: Call) => Reply) | null = null;

function spy(c: Call): Reply {
  const route = path(c).split('?')[0] as string;
  const body = c.body as Record<string, unknown> | null;
  calls.push({ method: c.method, route, key: body && typeof body.idempotency_key === 'string' ? body.idempotency_key : undefined, body });
  if (c.method === 'GET' || c.method === 'HEAD') {
    if (route === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
    return reads(route, c) ?? { status: 404, body: { error: 'unmocked' } };
  }
  if (answerOneWrite) {
    const a = answerOneWrite;
    answerOneWrite = null;
    return a(c);
  }
  throw new Error(`recovery: ${c.method} ${route} sent`);
}

function tab(o: Parameters<typeof shop>[0] = {}): Shop {
  const s = shop({ ...o, fetch: spy });
  fast();
  Object.assign(bounds, { read: 1000, post: 1000, op: 1000, list: 1000, slack: 10 });
  return s;
}

beforeEach(() => {
  resetCommerce();
  calls.length = 0;
  reads = () => undefined;
  answerOneWrite = null;
});
afterEach(() => {
  restoreStorage();
  noLocks();
  resetCommerce();
});

const FAM = 'f00df00df00df00df00df00d';
const PLAN = { id: 'v1', family_id: FAM, price_cents_per_month: 900, hold_days: 7, text: { title: 'Plus' } };
const SUB = 'x1';
const UPLAN = { id: 'v2', family_id: 'f2f2f2f2f2f2f2f2f2f2f2f2' };
const jsonLocal = (k: string) => JSON.parse(localStorage.getItem(k) || '[]') as Array<Record<string, unknown>>;
const quote = (): Reply => ({ status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900, paid_through: '2026-11-01T00:00:00Z' }) });
const fail500: Reply = { status: 500, body: { error: 'X' } };
const netFail: Reply = { status: 0, network: true };

/** A buy, pay or upgrade whose POST was sent and never answered (the spy threw): core keeps its key. Returns the lost
 *  request as it went out; `calls` is emptied for the recovery phase. */
async function keptAttempt(kind: 'buy' | 'pay' | 'upgrade'): Promise<Sent> {
  reads = (route) => (route.endsWith('/quote') ? quote() : undefined);
  const a = createAttempt(kind, kind === 'buy' ? { plan: PLAN, title: 'Plus' } : kind === 'pay' ? { sub: { id: SUB }, title: 'Plus' } : { sub: { id: SUB }, plan: UPLAN, title: 'Pro' });
  await a.quote();
  const r = await a.confirm(true);
  expect(r).toMatchObject({ ok: false, reason: 'unknown' });
  a.dispose();
  await vi.waitFor(() => expect(storedFor(kind)).toEqual([expect.objectContaining({ phase: 'held' })]));
  const lost = writesIn(calls);
  expect(lost).toHaveLength(1);
  calls.length = 0;
  reads = () => undefined;
  return lost[0]!;
}
const storedFor = (kind: 'buy' | 'pay' | 'upgrade') => (kind === 'upgrade' ? jsonLocal('hub_money_upgrade') : jsonLocal('hub_money_pending').filter((e) => e.kind === kind));

const target = (kind: 'buy' | 'pay' | 'upgrade') =>
  ({ kind, subId: kind === 'buy' ? null : SUB, planId: kind === 'pay' ? null : kind === 'buy' ? PLAN.id : UPLAN.id, familyId: kind === 'buy' ? FAM : UPLAN.family_id });
const check = (s: Shop, kind: 'buy' | 'pay' | 'upgrade'): Promise<HoldCheck> => (kind === 'pay' ? checkPayHold(s.ctx(), target(kind)) : checkPlanHold(s.ctx(), target(kind)));

// ── buy ───────────────────────────────────────────────────────────────────────────────────────────
describe('checkPlanHold, buy: GET /subserver-subscriptions only, evidence at most, the key kept', () => {
  const newServer = () => ({ id: 'n1', state: 'active', plan_id: 'v1', plan: { family_id: FAM, title: 'Plus' }, created_at: new Date(Date.now() + 1000).toISOString() });
  const cases: Array<[string, () => Reply, HoldCheck]> = [
    ['a server of the plan created since the claim: evidence only', () => ({ status: 200, body: envelope([newServer()], 1) }), { check: 'unknown', evidence: { kind: 'created', at: expect.any(String) as unknown as string, title: 'Plus' } }],
    ['no such server: unknown, no evidence', () => ({ status: 200, body: envelope([], 0) }), { check: 'unknown', evidence: null }],
    ['the read failing (500): unknown', () => fail500, { check: 'unknown', evidence: null }],
    ['the read failing (network): unknown', () => netFail, { check: 'unknown', evidence: null }],
  ];
  for (const [name, reply, want] of cases) {
    it(name, async () => {
      const s = tab();
      const lost = await keptAttempt('buy');
      reads = (route) => (route === '/subserver-subscriptions' ? reply() : undefined);
      const r = await check(s, 'buy');
      expect(r).toEqual(want);
      expect(writesIn(calls)).toEqual([]);
      expect(getsIn(calls)).toEqual(['/subserver-subscriptions']);
      expect(storedFor('buy').map((e) => e.key)).toEqual([lost.key]);
    });
  }
  it('another account shown: nothing to check (none), no request at all', async () => {
    const s = tab();
    await keptAttempt('buy');
    s.show(UB);
    expect(await check(s, 'buy')).toEqual({ check: 'none' });
    expect(calls).toEqual([]);
    expect(storedFor('buy')).toHaveLength(1);
  });
});

// ── pay ───────────────────────────────────────────────────────────────────────────────────────────
describe('checkPayHold: GET /subserver-subscriptions/:id only, the paid period is evidence only, the key kept', () => {
  const cases: Array<[string, () => Reply, HoldCheck]> = [
    ['the paid period now ends later: evidence only', () => ({ status: 200, body: envelope({ id: SUB, state: 'active', paid_through: '2026-12-01T00:00:00Z' }) }), { check: 'unknown', evidence: { kind: 'paidThrough', until: '2026-12-01T00:00:00.000Z' } }],
    ['the subscription is gone (404): unknown', () => ({ status: 404, body: { error: 'NOT_FOUND' } }), { check: 'unknown', evidence: null }],
    ['the read failing (500): unknown', () => fail500, { check: 'unknown', evidence: null }],
    ['the read failing (network): unknown', () => netFail, { check: 'unknown', evidence: null }],
  ];
  for (const [name, reply, want] of cases) {
    it(name, async () => {
      const s = tab();
      const lost = await keptAttempt('pay');
      reads = (route) => (route === `/subserver-subscriptions/${SUB}` ? reply() : undefined);
      expect(await check(s, 'pay')).toEqual(want);
      expect(writesIn(calls)).toEqual([]);
      expect(getsIn(calls)).toEqual([`/subserver-subscriptions/${SUB}`]);
      expect(storedFor('pay').map((e) => e.key)).toEqual([lost.key]);
    });
  }
});

// ── upgrade ───────────────────────────────────────────────────────────────────────────────────────
describe('checkPlanHold, upgrade: GET /subserver-subscriptions/:id only; no read settles it, the key always kept', () => {
  const sub = (o: Record<string, unknown>): Reply => ({ status: 200, body: envelope({ id: SUB, state: 'active', ...o }) });
  // The read shows current state, never which request caused it: another client may have made the same upgrade while
  // this one never arrived or is still in flight. Reaching the target plan is evidence only.
  const kept: Array<[string, () => Reply, HoldCheck]> = [
    ['on the target plan, operation explicitly null: evidence only (planReached), the key kept', () => sub({ plan_id: UPLAN.id, active_operation_id: null }), { check: 'unknown', evidence: { kind: 'planReached' } }],
    ['on the target plan, the operation field missing: unknown, no evidence', () => sub({ plan_id: UPLAN.id }), { check: 'unknown', evidence: null }],
    ['on the target plan, the operation field malformed (a number): unknown, no evidence', () => sub({ plan_id: UPLAN.id, active_operation_id: 7 }), { check: 'unknown', evidence: null }],
    ['on the target plan, the operation an empty string: unknown, no evidence', () => sub({ plan_id: UPLAN.id, active_operation_id: '' }), { check: 'unknown', evidence: null }],
    ['an operation running: running, the key kept', () => sub({ plan_id: UPLAN.id, active_operation_id: 'op9' }), { check: 'running' }],
    ['still on another plan, no operation: unknown, the key kept', () => sub({ plan_id: 'v1', active_operation_id: null }), { check: 'unknown', evidence: null }],
    ['the subscription is gone (404): unknown, the key kept', () => ({ status: 404, body: { error: 'NOT_FOUND' } }), { check: 'unknown', evidence: null }],
    ['the read failing (500): unknown, the key kept', () => fail500, { check: 'unknown', evidence: null }],
    ['the read failing (network): unknown, the key kept', () => netFail, { check: 'unknown', evidence: null }],
  ];
  for (const [name, reply, want] of kept) {
    it(name, async () => {
      const s = tab();
      const lost = await keptAttempt('upgrade');
      reads = (route) => (route === `/subserver-subscriptions/${SUB}` ? reply() : undefined);
      expect(await check(s, 'upgrade')).toEqual(want);
      expect(writesIn(calls)).toEqual([]);
      expect(getsIn(calls)).toEqual([`/subserver-subscriptions/${SUB}`]);
      expect(storedFor('upgrade').map((e) => e.key)).toEqual([lost.key]);
    });
  }
  it('another client made the same upgrade (target plan reached, no operation) while this request was lost: still held, checking twice changes nothing', async () => {
    const s = tab();
    const lost = await keptAttempt('upgrade');
    reads = (route) => (route === `/subserver-subscriptions/${SUB}` ? sub({ plan_id: UPLAN.id, active_operation_id: null }) : undefined);
    expect(await check(s, 'upgrade')).toEqual({ check: 'unknown', evidence: { kind: 'planReached' } });
    expect(await check(s, 'upgrade')).toEqual({ check: 'unknown', evidence: { kind: 'planReached' } });
    expect(writesIn(calls)).toEqual([]);
    expect(storedFor('upgrade')).toEqual([expect.objectContaining({ key: lost.key, phase: 'held' })]);
  });
  it('the target plan read while a send of the key is still in flight (another tab holds its send lock): evidence only, the entry is left for that send to settle', async () => {
    const W = installWebLocks();
    const row = { kind: 'upgrade', user_id: UA, key: 'u-kept-0000000000000001', max_charge_cents: 450, at: 1, sub_id: SUB, plan_id: UPLAN.id, title: 'Pro', phase: 'sending' };
    const s = tab({ local: { hub_money_upgrade: JSON.stringify([row]) } });
    let release!: () => void;
    W.asClient('tab2', () => {
      void (navigator as unknown as { locks: { request: (n: string, cb: () => unknown) => Promise<unknown> } }).locks.request(
        'hub_money_send:' + row.key, () => new Promise<void>((r) => { release = r; }));
    });
    await vi.waitFor(() => expect(W.held().map((h) => h.name)).toContain('hub_money_send:' + row.key));
    reads = (route) => (route === `/subserver-subscriptions/${SUB}` ? sub({ plan_id: UPLAN.id, active_operation_id: null }) : undefined);
    expect(await check(s, 'upgrade')).toEqual({ check: 'unknown', evidence: { kind: 'planReached' } });
    expect(writesIn(calls)).toEqual([]);
    expect(storedFor('upgrade')).toEqual([expect.objectContaining({ key: row.key, phase: 'sending' })]);
    release();
  });
});

// ── the adopted machine's confirm: a kept entry that vanished is never sent as a fresh purchase ─────────
describe('confirm(true) of a machine that adopted a kept entry: the entry gone at the claim sends nothing', () => {
  for (const kind of ['buy', 'pay', 'upgrade'] as const) {
    it(`${kind}: the kept entry removed (another tab settled it) before the confirm: no write, never a new key`, async () => {
      tab();
      const lost = await keptAttempt(kind);
      reads = (route) => (route.endsWith('/quote') ? quote() : undefined);
      const a = createAttempt(kind, kind === 'buy' ? { plan: PLAN, title: 'Plus' } : kind === 'pay' ? { sub: { id: SUB }, title: 'Plus' } : { sub: { id: SUB }, plan: UPLAN, title: 'Pro' });
      expect(a.snapshot()).toMatchObject({ pending: true, key: lost.key });
      const store = kind === 'upgrade' ? 'hub_money_upgrade' : 'hub_money_pending';
      localStorage.setItem(store, JSON.stringify(jsonLocal(store).filter((e) => e.key !== lost.key)));
      const r = await a.confirm(true);
      expect(r.ok).toBe(false);
      expect(writesIn(calls)).toEqual([]);
      a.dispose();
    });
  }
});

// ── reserve ───────────────────────────────────────────────────────────────────────────────────────
describe('checkReserveHold: GET /reservations only, a match is evidence only, the kept request stays', () => {
  /** A reserve whose POST was lost (the spy threw): core keeps the intent (nothing is sent again by itself). */
  async function keptReserve(): Promise<Sent> {
    reads = (route) => (route === '/reservations' ? { status: 200, body: envelope([]) } : undefined);
    const p = createPurchase(rows().offer, '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await vi.waitFor(() => expect(p.snapshot().state).toBe('indeterminate'));
    p.dispose();
    const lost = writesIn(calls);
    expect(lost.length).toBeGreaterThanOrEqual(1);
    expect(new Set(lost.map((c) => c.key)).size).toBe(1);
    calls.length = 0;
    reads = () => undefined;
    return lost[0]!;
  }
  const match = () => ({ status: 200, body: envelope([{ id: 'rv1', offer_id: 'o1', days: 7, state: 'pending', created_at: new Date(Date.now() + 1000).toISOString() }]) });
  const cases: Array<[string, () => Reply, HoldCheck]> = [
    ['a reservation of that offer and term since the claim: evidence only', match, { check: 'unknown', evidence: { kind: 'reserved', at: expect.any(String) as unknown as string } }],
    ['none found: unknown', () => ({ status: 200, body: envelope([]) }), { check: 'unknown', evidence: null }],
    ['the read failing (500): unknown', () => fail500, { check: 'unknown', evidence: null }],
    ['the read failing (network): unknown', () => netFail, { check: 'unknown', evidence: null }],
  ];
  for (const [name, reply, want] of cases) {
    it(name, async () => {
      const s = tab();
      const lost = await keptReserve();
      reads = (route) => (route === '/reservations' ? reply() : undefined);
      expect(await checkReserveHold(s.ctx(), 'o1')).toEqual(want);
      expect(writesIn(calls)).toEqual([]);
      expect(getsIn(calls)).toEqual(['/reservations']);
      expect(marketPendingFor(s.ctx()).map((p) => p.key)).toEqual([lost.key]);
    });
  }
  it('a listing that has gone (the offer no longer listed) changes nothing: still only the reservations read', async () => {
    const s = tab();
    const lost = await keptReserve();
    reads = (route) => (route === '/offers' || route === '/servers/available' ? { status: 200, body: envelope([]) } : route === '/reservations' ? { status: 200, body: envelope([]) } : undefined);
    expect(await checkReserveHold(s.ctx(), 'o1')).toEqual({ check: 'unknown', evidence: null });
    expect(writesIn(calls)).toEqual([]);
    expect(getsIn(calls)).toEqual(['/reservations']);
    expect(marketPendingFor(s.ctx()).map((p) => p.key)).toEqual([lost.key]);
  });
  it('another offer: nothing held for it (none), no request', async () => {
    const s = tab();
    await keptReserve();
    expect(await checkReserveHold(s.ctx(), 'o2')).toEqual({ check: 'none' });
    expect(calls).toEqual([]);
  });
  // The drawer's own unresolved admission, whose key another tab may
  // have sent and dropped: no key kept, but the read still runs, for the drawer's term since its Confirm.
  it('no kept key, with the drawer\'s own unresolved admission (gone): still one reservations read, evidence only', async () => {
    const s = tab();
    const since = Date.now();
    reads = (route) => (route === '/reservations' ? match() : undefined);
    expect(await checkReserveHold(s.ctx(), 'o1', { days: '7', since })).toEqual({ check: 'unknown', evidence: { kind: 'reserved', at: expect.any(String) as unknown as string } });
    expect(writesIn(calls)).toEqual([]);
    expect(getsIn(calls)).toEqual(['/reservations']);
    expect(marketPendingFor(s.ctx())).toEqual([]);
  });
  it('gone: a reservation made before the drawer\'s Confirm, or of another term, is no evidence', async () => {
    const s = tab();
    const old = { id: 'rv0', offer_id: 'o1', days: 7, state: 'pending', created_at: new Date(Date.now() - 60_000).toISOString() };
    const term = { id: 'rv2', offer_id: 'o1', days: 30, state: 'pending', created_at: new Date(Date.now() + 1000).toISOString() };
    reads = (route) => (route === '/reservations' ? { status: 200, body: envelope([old, term]) } : undefined);
    expect(await checkReserveHold(s.ctx(), 'o1', { days: '7', since: Date.now() })).toEqual({ check: 'unknown', evidence: null });
    expect(getsIn(calls)).toEqual(['/reservations']);
  });
  // Read only as the account that confirmed.
  it('gone from another account than the one shown: none, no request', async () => {
    const s = tab();
    reads = (route) => (route === '/reservations' ? match() : undefined);
    expect(await checkReserveHold(s.ctx(), 'o1', { days: '7', since: Date.now(), owner: UB })).toEqual({ check: 'none' });
    expect(calls).toEqual([]);
    expect(await checkReserveHold(s.ctx(), 'o1', { days: '7', since: Date.now(), owner: UA })).toEqual({ check: 'unknown', evidence: { kind: 'reserved', at: expect.any(String) as unknown as string } });
  });
  // A kept key of the same offer for another term does not hide the drawer's own term.
  it('gone: a kept key of another term does not replace the drawer\'s term', async () => {
    const s = tab();
    await keptReserve();
    reads = (route) => (route === '/reservations' ? { status: 200, body: envelope([{ id: 'rv9', offer_id: 'o1', days: 30, state: 'pending', created_at: new Date(Date.now() + 1000).toISOString() }]) } : undefined);
    expect(await checkReserveHold(s.ctx(), 'o1', { days: '30', since: Date.now() })).toEqual({ check: 'unknown', evidence: { kind: 'reserved', at: expect.any(String) as unknown as string } });
  });
  it('no kept key and no gone admission: none, no request (as before)', async () => {
    const s = tab();
    expect(await checkReserveHold(s.ctx(), 'o1', null)).toEqual({ check: 'none' });
    expect(calls).toEqual([]);
  });
});

// ── top-up ────────────────────────────────────────────────────────────────────────────────────────
describe('the top-up machine: checkAgain only re-reads the held record; resend(true) sends it once', () => {
  const TOPUP = 'hub.v3.topup_pending';
  const avail = (): Reply => ({ status: 200, body: { data: { card: { enabled: true, min_usd: 5, max_usd: 5000 }, crypto: { enabled: true, min_usd: 5, max_usd: 5000 } } } });
  const availFail = (): Reply => fail500;

  /** A top-up whose POST was sent and never answered (the spy threw): core holds {key, method, amount}. */
  async function keptTopUp(method: 'card' | 'crypto'): Promise<Sent> {
    reads = (route) => (route === '/wallet/payment-availability' ? avail() : undefined);
    const t = createTopUp();
    await t.load();
    expect(t.select(method)).toBe(true);
    const r = await t.submit('20');
    expect(r).toMatchObject({ ok: false, reason: 'pending' });
    t.dispose();
    await vi.waitFor(() => expect(jsonLocal(TOPUP)).toHaveLength(1));
    const lost = writesIn(calls);
    expect(lost).toHaveLength(1);
    calls.length = 0;
    reads = () => undefined;
    return lost[0]!;
  }

  for (const [situation, availReply] of [['availability read', avail], ['availability read failing (500)', availFail]] as const) {
    it(`checkAgain (${situation}): sends nothing, stays pending under the kept key; the record stays`, async () => {
      tab();
      const lost = await keptTopUp('card');
      reads = (route) => (route === '/wallet/payment-availability' ? availReply() : undefined);
      const t = createTopUp();
      await t.load();
      expect(t.snapshot().pending).toMatchObject({ key: lost.key, method: 'card', amount: '20.00' });
      const r = await t.checkAgain();
      await vi.waitFor(() => expect(t.snapshot().phase).toBe('pending'));
      expect(r).toEqual({ ok: false, reason: 'pending', key: lost.key, method: 'card', amount: '20.00' });
      expect(writesIn(calls)).toEqual([]);
      expect(getsIn(calls)).toEqual(['/wallet/payment-availability']);
      expect(jsonLocal(TOPUP).map((e) => e.key)).toEqual([lost.key]);
    });
  }

  it('the route table names the full provider paths the resend uses', () => {
    expect(commerceRoutes.checkoutRoute.path).toBe('/wallet/payments/card/checkout');
    expect(commerceRoutes.invoiceRoute.path).toBe('/wallet/payments/crypto/invoice');
    expect(commerceRoutes.checkoutRoute.method).toBe('POST');
    expect(commerceRoutes.invoiceRoute.method).toBe('POST');
  });

  const routeOf = (m: 'card' | 'crypto') => (m === 'card' ? commerceRoutes.checkoutRoute.path : commerceRoutes.invoiceRoute.path);
  const outcome = (m: 'card' | 'crypto'): Reply =>
    ({ status: 201, body: { data: m === 'card' ? { intent: {}, checkout_url: 'https://checkout.stripe.com/c/pay/cs_g14' } : { invoice_url: 'https://nowpayments.io/payment/?iid=14' } } });
  for (const method of ['card', 'crypto'] as const) {
    it(`resend(true), ${method}: exactly one POST to the kept route with the kept key and body; the record goes`, async () => {
      tab();
      const lost = await keptTopUp(method);
      reads = (route) => (route === '/wallet/payment-availability' ? avail() : undefined);
      const t = createTopUp();
      await t.load();
      await t.checkAgain();
      expect(writesIn(calls)).toEqual([]);
      answerOneWrite = () => outcome(method);
      const r = await t.resend(true);
      expect(r.ok).toBe(true);
      expect(writesIn(calls)).toEqual([{ method: 'POST', route: routeOf(method), key: lost.key, body: lost.body }]);
      expect(lost.route).toBe(routeOf(method));
      expect(lost.body).toEqual({ amount: '20.00', idempotency_key: lost.key });
      await vi.waitFor(() => expect(jsonLocal(TOPUP)).toEqual([]));
    });
  }

  it('resend without `true` sends nothing (the record and the pending state stay)', async () => {
    tab();
    const lost = await keptTopUp('card');
    reads = (route) => (route === '/wallet/payment-availability' ? avail() : undefined);
    const t = createTopUp();
    await t.load();
    for (const v of [undefined, false, 'true', 1]) {
      const r = await (t.resend as unknown as (c?: unknown) => Promise<unknown>)(v);
      expect(r).toMatchObject({ ok: false });
    }
    expect(writesIn(calls)).toEqual([]);
    expect(t.snapshot()).toMatchObject({ phase: 'pending', pending: { key: lost.key } });
    expect(jsonLocal(TOPUP).map((e) => e.key)).toEqual([lost.key]);
  });
});
