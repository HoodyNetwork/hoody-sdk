// Vitest: a chosen location against the money rules, with the two cases a reader found a gap in turned into the rule:
// a kept request answered "no room" on its resend is released (the API looks for a host only after its replay check
// found nothing under the key), and an attempt that adopted a kept request reads its price for the KEPT location.
// Plus the top-up continuation's location.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from './api';
import { clearBuyResume, commerceRoutes, createAttempt as realCreateAttempt, forgetBuyResumeRegion, readBuyResume, resetCommerce, writeBuyResume } from './commerce';
import { parseResume } from './commerce-pure';
import { UA, calls, envelope, noLocks, path, posts, restoreStorage, shop, sleep, typedErr, uidOf, type Call, type Reply } from './test/commerce-env';

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const createAttempt = (...a: Parameters<typeof realCreateAttempt>) => {
  const x = realCreateAttempt(...a);
  return x as unknown as Omit<typeof x, 'confirm'> & { confirm: (...c: any[]) => Promise<Loose> }; // eslint-disable-line @typescript-eslint/no-explicit-any
};
beforeEach(() => { resetCommerce(); });
afterEach(() => { restoreStorage(); noLocks(); resetCommerce(); });

const FAM = 'f00df00df00df00df00df00d';
const PLAN = { id: 'v1', family_id: FAM, price_cents_per_month: 900, hold_days: 7, text: { title: 'Starter' } };
const DONE = { operation: { id: 'op1', subscription_id: 'x1', kind: 'purchase', target_plan_id: 'v1', result: null }, subscription: { id: 'x1', state: 'provisioning' }, replayed: false };
const envOk = (d: unknown): Reply => ({ status: 201, body: envelope(d) });
const quotes = (): string[] => calls.filter((c) => path(c).startsWith('/subserver-subscriptions/quote')).map((c) => path(c));
const stored = () => JSON.parse(localStorage.getItem('hub_money_pending') || '[]') as Loose[];
function buyShop(onPost: (c: Call, n: number) => Reply | Promise<Reply>) {
  let n = 0;
  return shop({ fetch: (c) => {
    const p = path(c);
    if (p.startsWith('/subserver-subscriptions/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900, available: true, region: null }) };
    if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
    if (c.method === 'POST') return onPost(c, ++n);
    return { status: 404, body: {} };
  } });
}

describe('rd: blank and odd codes are never sent', () => {
  it('whitespace-only, tab, NBSP, newline-padded: Automatic', async () => {
    for (const bad of [' ', '   ', '\t', ' ', 'de-fra\n', '\nde-fra', 'De-fra', null, undefined, {} as unknown as string, ['de-fra'] as unknown as string]) {
      resetCommerce(); calls.length = 0;
      buyShop(() => envOk(DONE));
      const a = createAttempt('buy', { plan: PLAN, region: bad as string });
      await a.quote();
      await a.confirm(true);
      expect(quotes(), JSON.stringify(bad)).toEqual(['/subserver-subscriptions/quote?plan_id=v1']);
      expect('region' in posts()[0]!.body, JSON.stringify(bad)).toBe(false);
      await sleep(10);
    }
  });
});

describe('rd: the key after refusals', () => {
  it('definite region refusal, then Confirm with NO new quote: still a new key', async () => {
    buyShop((_c, n) => (n === 1 ? typedErr(409, 'NO_PAID_CAPACITY_IN_REGION', { region: 'de-fra' }) : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    await a.confirm(true);
    await sleep(10);
    expect((await a.confirm(true)).ok).toBe(true);
    const k = posts().map((c) => c.body.idempotency_key);
    expect(k[0]).not.toBe(k[1]);
    expect(posts()[1]!.body.region).toBe('de-fra');
  });
  it('a KEPT request resent and answered 409 NO_PAID_CAPACITY_IN_REGION: refused for good, the key released', async () => {
    buyShop((_c, n) => (n === 1 ? { status: 0, network: true } : n === 2 ? typedErr(409, 'NO_PAID_CAPACITY_IN_REGION', { region: 'de-fra' }) : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('unknown');
    expect(stored().length).toBe(1);
    const r = await a.confirm(true);
    await sleep(10);
    expect(r).toMatchObject({ ok: false, reason: 'refused', definitive: true, kind: 'regionFull' });
    expect(a.snapshot()).toMatchObject({ phase: 'review', pending: false });
    expect(stored().length).toBe(0);
    // The next Confirm is a new request: a new key.
    await a.quote();
    expect((await a.confirm(true)).ok).toBe(true);
    const k = posts().map((c) => c.body.idempotency_key);
    expect(k[0]).toBe(k[1]);
    expect(k[2]).not.toBe(k[1]);
  });
  it('a KEPT request resent and answered 409 NO_PAID_CAPACITY (Automatic): released the same way', async () => {
    buyShop((_c, n) => (n === 1 ? { status: 0, network: true } : typedErr(409, 'NO_PAID_CAPACITY')));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('unknown');
    const r = await a.confirm(true);
    await sleep(10);
    expect(r).toMatchObject({ ok: false, reason: 'refused', definitive: true });
    expect(stored().length).toBe(0);
  });
  it('the other way: a KEPT request resent and answered another 409 stays held under its key', async () => {
    buyShop((_c, n) => (n === 1 ? { status: 0, network: true } : typedErr(409, 'PAID_SUBSERVER_LIMIT_REACHED', { max: 1, used: 1 })));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('unknown');
    const r = await a.confirm(true);
    expect(r).toMatchObject({ ok: false, reason: 'unknown' });
    expect(a.snapshot()).toMatchObject({ phase: 'unknown', pending: true, region: 'de-fra' });
    expect(stored().length).toBe(1);
    await a.confirm(true);
    expect(new Set(posts().map((c) => c.body.idempotency_key)).size).toBe(1);
  });
  it('the other way: a first send (nothing kept) answered 409 NO_PAID_CAPACITY_IN_REGION is the plain refusal', async () => {
    buyShop(() => typedErr(409, 'NO_PAID_CAPACITY_IN_REGION', { region: 'de-fra' }));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    const r = await a.confirm(true);
    await sleep(10);
    expect(r).toMatchObject({ ok: false, reason: 'refused', definitive: true, kind: 'regionFull' });
    expect(stored().length).toBe(0);
  });
  it('a KEPT request resent and answered 400 PAID_REGION_UNKNOWN: refused for good', async () => {
    buyShop((_c, n) => (n === 1 ? { status: 0, network: true } : typedErr(400, 'PAID_REGION_UNKNOWN', { field: 'region' })));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('unknown');
    const r = await a.confirm(true);
    await sleep(10);
    expect(r).toMatchObject({ ok: false, reason: 'refused', definitive: true, kind: 'regionUnknown' });
    expect(stored().length).toBe(0);
  });
  it('IDEMPOTENCY_INTENT_MISMATCH with a region: held as unknown, key kept, same body on the next send', async () => {
    buyShop((_c, n) => (n === 1 ? typedErr(409, 'IDEMPOTENCY_INTENT_MISMATCH') : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    const r = await a.confirm(true);
    expect(r).toMatchObject({ ok: false, reason: 'unknown', kind: 'intent' });
    expect(stored()[0]).toMatchObject({ region: 'de-fra' });
    await a.confirm(true);
    expect(posts()[1]!.body).toEqual(posts()[0]!.body);
  });
  it('an attempt that adopted a kept request reads its price for the KEPT location, never its own', async () => {
    buyShop((_c, n) => (n === 1 ? { status: 500, body: { error: 'X' } } : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    await a.confirm(true);
    calls.length = 0;
    const b = createAttempt('buy', { plan: PLAN, region: 'fi-hel' });
    await b.quote();
    expect(quotes()).toEqual(['/subserver-subscriptions/quote?plan_id=v1&region=de-fra']);
    expect(b.snapshot().region).toBe('de-fra');
    // A kept request that named no location is quoted without one, whatever the adopting attempt asked for.
    resetCommerce(); localStorage.removeItem('hub_money_pending'); calls.length = 0;
    buyShop((_c, n) => (n === 1 ? { status: 500, body: { error: 'X' } } : envOk(DONE)));
    const c = createAttempt('buy', { plan: PLAN });
    await c.quote();
    await c.confirm(true);
    calls.length = 0;
    const d = createAttempt('buy', { plan: PLAN, region: 'fi-hel' });
    await d.quote();
    expect(quotes()).toEqual(['/subserver-subscriptions/quote?plan_id=v1']);
    expect(d.snapshot().region).toBe(null);
  });
  it('an attempt that adopted a kept request reads its price for the KEPT plan version, never the current one', async () => {
    buyShop((_c, n) => (n === 1 ? { status: 500, body: { error: 'X' } } : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    await a.confirm(true); // unknown: kept, plan v1
    calls.length = 0;
    // The family moved on to v2 (a new price); the kept request still resends v1, so its price is v1's.
    const v2 = { ...PLAN, id: 'v2', price_cents_per_month: 1500 };
    const b = createAttempt('buy', { plan: v2, region: 'de-fra' });
    await b.quote();
    expect(quotes()).toEqual(['/subserver-subscriptions/quote?plan_id=v1&region=de-fra']);
    expect(b.snapshot().pending).toBe(true);
  });
  it('a second attempt for another location while one is kept can never send its own key', async () => {
    buyShop((_c, n) => (n === 1 ? { status: 500, body: { error: 'X' } } : envOk(DONE)));
    const b = createAttempt('buy', { plan: PLAN, region: 'fi-hel' }); // made BEFORE a's request is stored
    await b.quote();
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    await a.confirm(true); // unknown, kept
    const r = await b.confirm(true);
    expect(r.ok).toBe(false);
    expect(posts().length).toBe(1);
    expect(r.notSent).toBe(true);
  });
});

describe('rd: declared keys', () => {
  it('quote and purchase refuse an undeclared key unsent', async () => {
    const s = buyShop(() => envOk(DONE));
    const q = (await api(commerceRoutes.buyQuoteRoute, { ctx: s.ctx(), query: { plan_id: 'v1', zone: 'x' } as never }).catch((x: unknown) => x)) as Loose;
    expect(q.code).toBe('ROUTE_QUERY');
    const p = (await api(commerceRoutes.buyRoute, { ctx: s.ctx(), body: { plan_id: 'v1', idempotency_key: 'k', max_charge_cents: 1, location: 'x' } as never }).catch((x: unknown) => x)) as Loose;
    expect(p.code).toBe('ROUTE_BODY');
    expect(calls).toEqual([]);
  });
  it('upgrade and pay routes do not declare region', () => {
    expect(JSON.stringify((commerceRoutes.upgradeRoute as Loose).body ?? [])).not.toMatch(/region/);
    expect(JSON.stringify((commerceRoutes.payRoute as Loose).body ?? [])).not.toMatch(/region/);
    expect(JSON.stringify((commerceRoutes.quoteRoute as Loose).query ?? [])).not.toMatch(/region/);
  });
});

describe('the top-up continuation carries the chosen location', () => {
  const own = { owner: 'u1', live: () => true } as never;
  const raw = () => JSON.parse(sessionStorage.getItem('hub_buy_resume') || 'null') as Loose | null;
  afterEach(() => { clearBuyResume(); });
  it('a whole code is written and read back; none is written for Automatic or an odd value', () => {
    expect(writeBuyResume(own, FAM, 'Starter', 'de-fra')).toBe(true);
    expect(raw()).toMatchObject({ kind: 'subserver', plan: FAM, region: 'de-fra' });
    expect(parseResume(JSON.stringify(raw()), Date.now())).toMatchObject({ plan: FAM, title: 'Starter', region: 'de-fra' });
    for (const bad of [null, undefined, '', ' ', 'De-fra', 'de-fra\n', {} as unknown as string]) {
      writeBuyResume(own, FAM, 'Starter', bad as string);
      expect('region' in raw()!, JSON.stringify(bad)).toBe(false);
    }
  });
  it('a stored value that is no code is not read as a location', () => {
    const at = Date.now();
    for (const bad of [' ', 'De-fra', 7, ['de-fra'], { a: 1 }, 'x'.repeat(200)])
      expect('region' in (parseResume(JSON.stringify({ kind: 'subserver', user: 'u1', plan: FAM, title: 't', region: bad, at }), at) as Loose), JSON.stringify(bad)).toBe(false);
  });
  it('forgetting the location keeps the rest of the marker, its time included', () => {
    writeBuyResume(own, FAM, 'Starter', 'de-fra');
    const before = raw()!;
    forgetBuyResumeRegion();
    expect(raw()).toEqual({ kind: before.kind, user: before.user, plan: before.plan, title: before.title, at: before.at });
    forgetBuyResumeRegion();
    expect(raw()!.at).toBe(before.at);
    clearBuyResume();
    forgetBuyResumeRegion();
    expect(raw()).toBe(null);
  });
});

void UA; void readBuyResume;
