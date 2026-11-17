// commerce.ts, a paid plan's location: the regions read, the chosen location on the purchase quote and on the purchase
// itself, and what each location refusal does to the idempotency key. The rule under test: a location is part of the
// request. It is sent only when chosen, a kept request is resent with exactly the location it was first sent with, and
// one key never goes out with two different locations.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from './api';
import { commerceRoutes, createAttempt as realCreateAttempt, resetCommerce } from './commerce';
import { buy as B, heldRequestSig, paidPlace, paidRegions, regionCode } from './commerce-pure';
import { lackOf } from './routePerms';
import { R1, UA, calls, envelope, hostOf, noLocks, path, posts, restoreStorage, shop, sleep, typedErr, uidOf, type Call, type Reply } from './test/commerce-env';
import { DOMAIN } from './test/env';

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const createAttempt = (...a: Parameters<typeof realCreateAttempt>) => {
  const x = realCreateAttempt(...a);
  return x as unknown as Omit<typeof x, 'confirm'> & { confirm: (...c: any[]) => Promise<Loose> }; // eslint-disable-line @typescript-eslint/no-explicit-any
};

beforeEach(() => { resetCommerce(); });
afterEach(() => { restoreStorage(); noLocks(); resetCommerce(); });

const FAM = 'f00df00df00df00df00df00d';
const PLAN = { id: 'v1', family_id: FAM, price_cents_per_month: 900, hold_days: 7, text: { title: 'Starter' } };
const FRA = { region: 'de-fra', country: 'DE', city: 'Frankfurt' };
const DONE = { operation: { id: 'op1', subscription_id: 'x1', kind: 'purchase', target_plan_id: 'v1', result: null }, subscription: { id: 'x1', state: 'provisioning', region: FRA }, replayed: false };
const envOk = (d: unknown): Reply => ({ status: 201, body: envelope(d) });
const jsonLocal = (k: string) => JSON.parse(localStorage.getItem(k) || '[]') as Array<Record<string, unknown>>;
const quotes = (): string[] => calls.filter((c) => path(c).startsWith('/subserver-subscriptions/quote')).map((c) => path(c));

function buyShop(onPost: (c: Call, n: number) => Reply | Promise<Reply>, o: Parameters<typeof shop>[0] = {}) {
  let n = 0;
  return shop({ ...o, fetch: (c) => {
    const p = path(c);
    if (p.startsWith('/subserver-subscriptions/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900, available: true, region: /region=/.test(p) ? FRA : null }) };
    if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
    if (c.method === 'POST') return onPost(c, ++n);
    return { status: 404, body: {} };
  } });
}

describe('the chosen location on the quote and the purchase', () => {
  it('Automatic (no choice): neither the quote nor the purchase names a region; the body is the three keys it always was', async () => {
    buyShop(() => envOk(DONE));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    expect((await a.confirm(true)).ok).toBe(true);
    expect(quotes()).toEqual(['/subserver-subscriptions/quote?plan_id=v1']);
    expect(Object.keys(posts()[0]!.body).sort()).toEqual(['idempotency_key', 'max_charge_cents', 'plan_id']);
    expect(a.snapshot().region).toBeNull();
  });
  it('a chosen location is on the quote and in the purchase body, and in the stored request before it leaves', async () => {
    let during: string | null = null;
    buyShop(() => { during = localStorage.getItem('hub_money_pending'); return envOk(DONE); });
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    expect(a.snapshot().region).toBe('de-fra');
    const q = await a.quote();
    expect(q.region).toEqual(FRA);
    expect((await a.confirm(true)).ok).toBe(true);
    expect(quotes()).toEqual(['/subserver-subscriptions/quote?plan_id=v1&region=de-fra']);
    expect(posts()[0]!.body).toMatchObject({ plan_id: 'v1', max_charge_cents: 900, region: 'de-fra' });
    expect(Object.keys(posts()[0]!.body).sort()).toEqual(['idempotency_key', 'max_charge_cents', 'plan_id', 'region']);
    expect(JSON.parse(during as unknown as string)[0]).toMatchObject({ region: 'de-fra', key: posts()[0]!.body.idempotency_key });
  });
  it('a value that is not a whole code (upper case, padded, empty, another type) is Automatic: never sent', async () => {
    for (const bad of ['DE-FRA', ' de-fra', '', 7 as unknown as string, 'x'.repeat(65)]) {
      resetCommerce();
      calls.length = 0;
      buyShop(() => envOk(DONE));
      const a = createAttempt('buy', { plan: PLAN, region: bad });
      await a.quote();
      await a.confirm(true);
      expect(quotes(), String(bad)).toEqual(['/subserver-subscriptions/quote?plan_id=v1']);
      expect('region' in posts()[0]!.body, String(bad)).toBe(false);
      await sleep(10);
    }
  });
  it('a location is a buy\'s only: an upgrade and a payment never carry one', async () => {
    shop({ fetch: (c) => {
      const p = path(c);
      if (p.includes('/quote')) return { status: 200, body: envelope({ charge_cents: 500 }) };
      if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
      return envOk({ operation: { id: 'op1', subscription_id: 'x1', kind: p.endsWith('/pay') ? 'resume' : 'upgrade', target_plan_id: p.endsWith('/pay') ? null : 'v1', result: null }, subscription: { id: 'x1', state: 'active' }, replayed: false });
    } });
    const up = createAttempt('upgrade', { plan: PLAN, sub: { id: 'x1' }, region: 'de-fra' });
    await up.quote();
    await up.confirm(true);
    const pay = createAttempt('pay', { sub: { id: 'x1' }, region: 'de-fra' });
    await pay.quote();
    await pay.confirm(true);
    expect(calls.some((c) => /region/.test(c.url))).toBe(false);
    expect(posts().some((c) => 'region' in c.body)).toBe(false);
    expect(up.snapshot().region).toBeNull();
  });
  it('the quote and the purchase go to the realm host, as before; so does the regions read', async () => {
    const s = buyShop(() => envOk(DONE), { selected: R1 });
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    await a.confirm(true);
    await api(commerceRoutes.regionsRoute, { ctx: s.ctx(), query: { plan_id: 'v1' } }).catch(() => undefined);
    const realm = calls.filter((c) => path(c).startsWith('/subserver-subscriptions'));
    expect(realm.length).toBe(3);
    expect(realm.every((c) => hostOf(c) === `${R1}.${DOMAIN}`)).toBe(true);
    expect(path(realm[2]!)).toBe('/subserver-subscriptions/regions?plan_id=v1');
  });
  it('the regions read declares one query key: any other is refused unsent', async () => {
    const s = buyShop(() => envOk(DONE));
    const e = (await api(commerceRoutes.regionsRoute, { ctx: s.ctx(), query: { plan_id: 'v1', region: 'de-fra' } }).catch((x: unknown) => x)) as Loose;
    expect(e.code).toBe('ROUTE_QUERY');
    expect(calls).toEqual([]);
  });
});

describe('a location refusal and the key', () => {
  it('NO_PAID_CAPACITY_IN_REGION is a definite refusal: nothing charged, the key dropped, and the next Confirm sends a NEW key', async () => {
    buyShop((_c, n) => (n === 1 ? typedErr(409, 'NO_PAID_CAPACITY_IN_REGION', { region: 'de-fra' }) : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    const r = await a.confirm(true);
    expect(r).toMatchObject({ ok: false, reason: 'refused', definitive: true, kind: 'regionFull' });
    expect(a.snapshot()).toMatchObject({ phase: 'review', pending: false, key: null });
    expect(a.snapshot().error).toMatchObject({ kind: 'regionFull', code: 'NO_PAID_CAPACITY_IN_REGION' });
    await sleep(10);
    expect(localStorage.getItem('hub_money_pending')).toBeNull();
    await a.quote();
    expect((await a.confirm(true)).ok).toBe(true);
    const keys = posts().map((c) => c.body.idempotency_key);
    expect(keys[0]).not.toBe(keys[1]);
  });
  it('another location after the refusal is another attempt: its own quote and its own key, never the refused key', async () => {
    buyShop((_c, n) => (n === 1 ? typedErr(409, 'NO_PAID_CAPACITY_IN_REGION', { region: 'de-fra' }) : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    await a.confirm(true);
    await sleep(10);
    const b = createAttempt('buy', { plan: PLAN, region: 'fi-hel' });
    expect(b.snapshot()).toMatchObject({ pending: false, region: 'fi-hel' });
    await b.quote();
    expect((await b.confirm(true)).ok).toBe(true);
    const sent = posts().map((c) => [c.body.idempotency_key, c.body.region]);
    expect(sent[0]![1]).toBe('de-fra');
    expect(sent[1]![1]).toBe('fi-hel');
    expect(sent[0]![0]).not.toBe(sent[1]![0]);
  });
  it('PAID_REGION_UNKNOWN (400) is a definite refusal too: the key dropped, kind regionUnknown', async () => {
    buyShop(() => typedErr(400, 'PAID_REGION_UNKNOWN', { field: 'region' }));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    expect(await a.confirm(true)).toMatchObject({ reason: 'refused', definitive: true, kind: 'regionUnknown' });
    await sleep(10);
    expect(localStorage.getItem('hub_money_pending')).toBeNull();
  });
  it('a location refusal that arrives as a late (pending) answer settles nothing: the key is kept', async () => {
    buyShop(() => ({ ...typedErr(409, 'NO_PAID_CAPACITY_IN_REGION'), status: 500 }));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('unknown');
    expect(jsonLocal('hub_money_pending')[0]).toMatchObject({ region: 'de-fra' });
  });
});

describe('an unknown outcome keeps the location with the key', () => {
  it('the kept request is resent with the same key AND the same location', async () => {
    buyShop((_c, n) => (n === 1 ? { status: 0, network: true } : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('unknown');
    expect((await a.confirm(true)).ok).toBe(true);
    const b = posts().map((c) => c.body);
    expect(b[1]).toEqual(b[0]);
    expect(b[0].region).toBe('de-fra');
  });
  it('a drawer reopened with ANOTHER location adopts the kept request: its own location, never the kept key with the new one', async () => {
    buyShop((_c, n) => (n === 1 ? { status: 500, body: { error: 'X' } } : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    await a.confirm(true);
    const b = createAttempt('buy', { plan: PLAN, region: 'fi-hel' });
    expect(b.snapshot()).toMatchObject({ pending: true, region: 'de-fra' });
    expect((await b.confirm(true)).ok).toBe(true);
    const sent = posts().map((c) => c.body);
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[1]!.region).toBe('de-fra');
  });
  it('a kept Automatic request adopted by a drawer that chose a location is resent WITHOUT a region', async () => {
    buyShop((_c, n) => (n === 1 ? { status: 500, body: { error: 'X' } } : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    await a.confirm(true);
    const b = createAttempt('buy', { plan: PLAN, region: 'fi-hel' });
    expect(b.snapshot()).toMatchObject({ pending: true, region: null });
    await b.confirm(true);
    expect(posts().map((c) => 'region' in c.body)).toEqual([false, false]);
    expect(posts()[1]!.body.idempotency_key).toBe(posts()[0]!.body.idempotency_key);
  });
  it('a kept request whose stored location was rewritten under the same key is not the request confirmed: never sent', async () => {
    buyShop((_c, n) => (n === 1 ? { status: 500, body: { error: 'X' } } : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN, region: 'de-fra' });
    await a.quote();
    await a.confirm(true);
    const kept = jsonLocal('hub_money_pending');
    localStorage.setItem('hub_money_pending', JSON.stringify([{ ...kept[0], region: 'fi-hel', phase: undefined }]));
    expect((await a.confirm(true)).reason).toBe('gone');
    expect(posts().length).toBe(1);
  });
});

describe('the stored request and its signature', () => {
  const e = { kind: 'buy' as const, user_id: UA, key: 'k1', max_charge_cents: 900, at: 1, family_id: FAM, plan_id: 'v1' };
  it('a request without a location keeps the signature and the body it always had', () => {
    expect(heldRequestSig(e)).toBe(JSON.stringify(['buy', UA, 'k1', 900, null, 'v1', FAM, null, null]));
    expect(B.pendingBody(e)).toEqual({ plan_id: 'v1', idempotency_key: 'k1', max_charge_cents: 900 });
  });
  it('a location changes the signature and is in the body', () => {
    expect(heldRequestSig({ ...e, region: 'de-fra' })).not.toBe(heldRequestSig(e));
    expect(heldRequestSig({ ...e, region: 'de-fra' })).not.toBe(heldRequestSig({ ...e, region: 'fi-hel' }));
    expect(B.pendingBody({ ...e, region: 'de-fra' })).toEqual({ plan_id: 'v1', idempotency_key: 'k1', max_charge_cents: 900, region: 'de-fra' });
  });
  it('a stored entry with a region that is no whole code, or a payment with one, is no request this Hub made', () => {
    const ok = B.parsePending(JSON.stringify([{ ...e, region: 'de-fra' }, e]));
    expect(ok.length).toBe(2);
    expect(B.parsePending(JSON.stringify([{ ...e, region: 'DE' }, { ...e, region: 5 }, { ...e, region: '' }]))).toEqual([]);
    expect(B.parsePending(JSON.stringify([{ kind: 'pay', user_id: UA, key: 'k', max_charge_cents: 1, at: 1, sub_id: 'x1', region: 'de-fra' }]))).toEqual([]);
  });
  it('regionCode: 1-64 characters, trimmed and lower-case', () => {
    expect(['de-fra', 'us east', 'a', 'x'.repeat(64)].every(regionCode)).toBe(true);
    expect(['', ' a', 'a ', 'A', 'x'.repeat(65), null, 3, undefined].some(regionCode)).toBe(false);
  });
});

describe('the regions list and a place, as read', () => {
  const row = (region: string, available: unknown = true, over: Record<string, unknown> = {}) => ({ region, country: 'DE', city: 'Frankfurt', available, ...over });
  it('the plan\'s whole list, in the API\'s order, booleans only', () => {
    expect(paidRegions({ plan_id: 'v1', regions: [row('de-fra'), row('us-nyc', false, { country: 'US', city: 'New York' })] }, 'v1')).toEqual([
      { region: 'de-fra', country: 'DE', city: 'Frankfurt', available: true },
      { region: 'us-nyc', country: 'US', city: 'New York', available: false },
    ]);
    expect(paidRegions({ plan_id: 'v1', regions: [] }, 'v1')).toEqual([]);
  });
  it('an answer about another plan, a row without a code, a non-boolean `available` or a code twice is no list at all', () => {
    expect(paidRegions({ plan_id: 'v2', regions: [row('de-fra')] }, 'v1')).toBeNull();
    expect(paidRegions({ plan_id: 'v1', regions: [row('de-fra'), row('')] }, 'v1')).toBeNull();
    expect(paidRegions({ plan_id: 'v1', regions: [row('de-fra', 'yes')] }, 'v1')).toBeNull();
    expect(paidRegions({ plan_id: 'v1', regions: [row('de-fra', 1)] }, 'v1')).toBeNull();
    expect(paidRegions({ plan_id: 'v1', regions: [row('de-fra'), row('de-fra', false)] }, 'v1')).toBeNull();
    expect(paidRegions({ plan_id: 'v1' }, 'v1')).toBeNull();
    expect(paidRegions(null, 'v1')).toBeNull();
    expect(paidRegions([row('de-fra')], 'v1')).toBeNull();
  });
  it('a row carries nothing but the four fields (no count, no host field passes through)', () => {
    const out = paidRegions({ plan_id: 'v1', regions: [row('de-fra', true, { free_slots: 3, host: 'h1' })] }, 'v1');
    expect(Object.keys(out![0]!).sort()).toEqual(['available', 'city', 'country', 'region']);
  });
  it('a place: a code is required; country and city may be absent ("")', () => {
    expect(paidPlace(FRA)).toEqual(FRA);
    expect(paidPlace({ region: 'x' })).toEqual({ region: 'x', country: '', city: '' });
    expect(paidPlace({ region: 'x', country: null, city: ' Paris ' })).toEqual({ region: 'x', country: '', city: 'Paris' });
    expect(paidPlace(null)).toBeNull();
    expect(paidPlace({ country: 'DE' })).toBeNull();
    expect(paidPlace({ region: 'x', city: 4 })).toBeNull();
  });
});

describe('token sessions: the regions read needs the quote\'s leaf', () => {
  const held = (...ls: string[]) => (l: string) => ls.includes(l);
  it('lacking financial.billing.read names it; holding it sends; a realm-limited token is served like the quote', () => {
    expect(lackOf('GET', '/subserver-subscriptions/regions', '/subserver-subscriptions/regions', held(), false)).toBe('financial.billing.read');
    expect(lackOf('GET', '/subserver-subscriptions/regions', '/subserver-subscriptions/regions', held('financial.billing.read'), false)).toBeNull();
    expect(lackOf('GET', '/subserver-subscriptions/regions', '/subserver-subscriptions/regions', held('financial.billing.read'), true))
      .toBe(lackOf('GET', '/subserver-subscriptions/quote', '/subserver-subscriptions/quote', held('financial.billing.read'), true));
  });
});
