// commerce.ts, the money side: routes and hosts, plans, wallet (transfer, top-up, return), GitHub bonus, subscriptions,
// the buy / Pay now / upgrade attempts with their key stores, the pending-store lock, deadline fences, resume markers.
// It runs on the real core (test/env.ts + test/commerce-env.ts); the owner of a request is the bearer user of the call.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, onPending, setOtpPrompt, type PendingNotice } from './api';
import {
  availability, balances, bounds, catalogue, claimBonus, clearBuyResume, commerceRoutes, consumeIntent, createAttempt as realCreateAttempt, createTopUp,
  dropTopupReturn, getSubscription, githubBonus, loadSubscriptions, marketLatch, pendingUpgrade, planChip, plans, readBuyResume,
  readIntent, readTopupReturn, resetCommerce, setAutoRenew, shownOwner, SUBS, topup, transfer, verifyReturn, writeBuyResume,
  writePayResume,
} from './commerce';
import { subs as S } from './commerce-pure';
import { capture } from './ctx';
import { loadListing } from './commerce';
import { defineRoute } from './routes';
import {
  DIRS, R1, R2X, UA, UB, accepted, breakKey, calls, envelope, gate, heldLocks, hostOf, never, noLocks, path, posts, restoreStorage, shop, sleep, typedErr,
  uidOf, type Call, type Reply, type Shop,
} from './test/commerce-env';
import { DOMAIN, sessionToken } from './test/env';

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const createAttempt = (...a: Parameters<typeof realCreateAttempt>) => {
  const x = realCreateAttempt(...a);
  return x as unknown as Omit<typeof x, 'confirm'> & { confirm: (...c: any[]) => Promise<Loose> }; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const lo = async (p: Promise<unknown>): Promise<Loose> => (await p.catch((x: unknown) => x)) as Loose;

let notices: PendingNotice[] = [];
let offPending: () => void = () => undefined;
beforeEach(() => { resetCommerce(); notices = []; offPending = onPending((n) => notices.push(n)); });
afterEach(() => { restoreStorage(); offPending(); noLocks(); setOtpPrompt(null); resetCommerce(); });

const FAM = 'f00df00df00df00df00df00d';
const PLAN = { id: 'v1', family_id: FAM, price_cents_per_month: 900, hold_days: 7, text: { title: 'Starter' } };
const PLANS = [PLAN, { id: 'v2', family_id: 'f00df00df00df00df00df00e', price_cents_per_month: 1900, hold_days: 7, text: { title: 'Pro' } }];
// The route's own answers (subserver-subscription.routes.ts accepted(): operation, subscription, replayed): a buy
// admits a 'purchase' of the plan sent, a pay a 'resume' (no target plan).
const DONE = { operation: { id: 'op1', subscription_id: 'x1', kind: 'purchase', target_plan_id: 'v1', result: null }, subscription: { id: 'x1', state: 'provisioning' }, replayed: false };
const PAID = { ...DONE, operation: { ...DONE.operation, kind: 'resume', target_plan_id: null }, subscription: { id: 'x1', state: 'active' } };
const envOk = (d: unknown): Reply => ({ status: 201, body: envelope(d) });
const jsonLocal = (k: string) => JSON.parse(localStorage.getItem(k) || '[]') as Array<Record<string, unknown>>;

// ── routes ───────────────────────────────────────────────────────────────
describe('routes: the subscription family on the realm host; market, wallet, plans and bonus on base', () => {
  // [method, concrete path, expected scope, how the old table named it]. The old regex table is now one declared
  // route per row (commerce.ts), so a row is "known" when a declared route has this method, path shape and scope.
  const table: Array<[string, string, string]> = [
    ['GET', '/offers', 'base'], ['GET', '/servers/available', 'base'], ['POST', '/offers/:id/reserve', 'base'], ['POST', '/servers/:id/rent', 'base'],
    ['GET', '/reservations', 'base'], ['GET', '/reservations/:id', 'base'], ['GET', '/rentals', 'base'], ['GET', '/wallet/balances', 'base'],
    ['GET', '/wallet/payment-availability', 'base'], ['GET', '/wallet/github-bonus', 'base'],
    ['GET', '/wallet/payments/card/intents/:id', 'base'], ['GET', '/wallet/payments/crypto/intents/:id', 'base'], ['POST', '/wallet/transfers', 'base'],
    ['POST', '/wallet/github-bonus/claim', 'base'], ['POST', '/wallet/payments/card/checkout', 'base'], ['POST', '/wallet/payments/crypto/invoice', 'base'],
    ['GET', '/meta/subserver-plans', 'base'], ['GET', '/subserver-plans', 'base'], ['GET', '/subserver-subscriptions/quote', 'realm'],
    ['POST', '/subserver-subscriptions', 'realm'], ['GET', '/subserver-subscriptions/:id/quote', 'realm'], ['POST', '/subserver-subscriptions/:id/pay', 'realm'],
    ['POST', '/subserver-subscriptions/:id/upgrade', 'realm'], ['PUT', '/subserver-subscriptions/:id/auto-renew', 'realm'],
    ['GET', '/subserver-subscriptions', 'realm'], ['GET', '/subserver-subscriptions/:id', 'realm'], ['GET', '/users/auth/me', 'base'],
  ];
  const declared = Object.values(commerceRoutes) as unknown as Array<{ method: string; path: string; scope: string }>;
  for (const [m, p, scope] of table) {
    it(`${m} ${p} is declared on ${scope}`, () => {
      const r = declared.find((x) => x.method === m && x.path === p);
      expect(r).toBeTruthy();
      expect(r!.scope).toBe(scope);
    });
  }
  for (const [m, p] of [['DELETE', '/offers'], ['GET', '/computers'], ['PUT', '/hoody/realm'], ['PUT', '/subserver-subscriptions/:id/upgrade'], ['POST', '/subserver-subscriptions/:id/downgrade']]) {
    it(`${m} ${p} is outside the table: no declared route`, () => {
      expect(declared.find((x) => x.method === m && x.path === p)).toBeUndefined();
    });
  }
  it('a malformed id (../x), an undeclared query key or body key is refused unsent by the one sender', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope([]) }) });
    const ctx = s.ctx();
    const refused = (p: Promise<unknown>) => p.then(() => 'sent', (e: { code?: string; notSent?: boolean }) => e);
    expect(await refused(api(commerceRoutes.upgradeQuoteRoute, { ctx, params: { id: 'x1' }, query: { action: 'upgrade', plan_id: 'v2', x: '1' } as never }))).toMatchObject({ notSent: true });
    expect(await refused(api(commerceRoutes.upgradeRoute, { ctx, params: { id: 'x1' }, body: { plan_id: 'v', idempotency_key: 'k', max_charge_cents: 1, x: 1 } as never }))).toMatchObject({ notSent: true });
    expect(calls).toEqual([]);
  });
  it('an undeclared route is refused before reaching the wire (the old ROUTE_UNKNOWN)', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope([]) }) });
    const rogue = defineRoute({ method: 'GET', path: '/computers', scope: 'base' });
    await expect(api(rogue, { ctx: s.ctx() }).then(() => 'sent', (e: { notSent?: boolean }) => e)).resolves.toBeDefined();
    // a route object that was never declared by defineRoute
    const forged = { method: 'DELETE', path: '/offers', scope: 'base' } as never;
    expect(await api(forged, { ctx: s.ctx() }).then(() => 'sent', (e: { code?: string }) => e.code)).toBe('ROUTE_NOT_DECLARED');
  });
  it('an id is one path segment: a malformed id (../x, a/b) is refused unsent', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope({ id: 'sub_1', state: 'active' }) }) });
    for (const id of ['../x', 'a/b', '%2e%2e']) {
      expect(await getSubscription(s.ctx(), id).then(() => 'sent', (e: unknown) => e)).toMatchObject({ code: 'ROUTE_PARAMS' });
    }
    expect(calls).toEqual([]);
    await getSubscription(s.ctx(), 'sub 1');
    expect(path(calls[0]!)).toBe('/subserver-subscriptions/sub%201');
  });
  it('with a realm selected the subscription list goes to the realm host and the wallet stays on base', async () => {
    const s = shop({ selected: R1, fetch: () => ({ status: 200, body: envelope([], 0) }) });
    await loadSubscriptions(s.ctx());
    await balances(s.ctx());
    expect(calls.map((c) => [path(c).split('?')[0], hostOf(c) === 'base' ? 'base' : 'realm'])).toEqual([['/subserver-subscriptions', 'realm'], ['/wallet/balances', 'base']]);
    expect(hostOf(calls[0]!)).toBe(`${R1}.${DOMAIN}`);
  });
});

describe('realm hosts per family: what each flow sends where', () => {
  function shopAt(selected: string) {
    return shop({ selected, fetch: (c) => {
      const p = path(c);
      if (p.includes('/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) };
      if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
      if (p.startsWith('/subserver-plans') || p.startsWith('/meta/subserver-plans')) return { status: 200, body: envelope({ requested_locale: 'en', plans: [PLAN] }) };
      if (p === '/subserver-subscriptions/x1') return { status: 200, body: envelope({ id: 'x1', state: 'active' }) };
      if (c.method !== 'GET') return { status: 201, body: envelope(accepted(c)) };
      return { status: 200, body: envelope([], 0) };
    } });
  }
  const hosts = () => calls.map((r) => `${r.method} ${path(r).split('?')[0]} ${hostOf(r) === 'base' ? 'base' : 'realm'}`);
  it('buy a plan with a realm selected: catalogue and identity on base, quote and purchase on the realm host', async () => {
    const s = shopAt(R1);
    await catalogue(s.ctx());
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    expect((await a.confirm(true)).ok).toBe(true);
    expect(hosts()).toEqual(['GET /meta/subserver-plans base', 'GET /subserver-subscriptions/quote realm', 'GET /users/auth/me base', 'POST /subserver-subscriptions realm']);
    expect(calls.filter((r) => hostOf(r) !== 'base').every((r) => hostOf(r) === `${R1}.${DOMAIN}`)).toBe(true);
  });
  it('Pay now, auto-renew and the by-id read on the realm host; plans, wallet and bonus on base', async () => {
    const s = shopAt(R1);
    const ctx = s.ctx();
    const a = createAttempt('pay', { sub: { id: 'x1' } });
    await a.quote();
    await a.confirm(true);
    await setAutoRenew(shownOwner(ctx), ctx, { id: 'x1' }, false);
    expect(await getSubscription(ctx, 'x1')).toMatchObject({ id: 'x1' });
    await plans(ctx);
    await balances(ctx).catch(() => null);
    await githubBonus(ctx);
    expect(hosts()).toEqual(['GET /subserver-subscriptions/x1/quote realm', 'GET /users/auth/me base', 'POST /subserver-subscriptions/x1/pay realm',
      'PUT /subserver-subscriptions/x1/auto-renew realm', 'GET /subserver-subscriptions/x1 realm', 'GET /subserver-plans base', 'GET /wallet/balances base', 'GET /wallet/github-bonus base']);
  });
  it('in All mode the whole subscription family goes to base', async () => {
    const s = shopAt('all');
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    await a.confirm(true);
    await loadSubscriptions(s.ctx());
    expect(calls.every((r) => hostOf(r) === 'base')).toBe(true);
    expect(calls.filter((r) => path(r).startsWith('/subserver-subscriptions')).length).toBe(3);
  });
  it('a realm switch after the quote: Confirm sends nothing (the attempt\'s context is gone)', async () => {
    const s = shopAt(R1);
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    s.bump();
    expect((await a.confirm(true)).ok).toBe(false);
    expect(posts()).toEqual([]);
    void R2X;
  });
  it('a realm switch while the purchase POST is out: outcome unknown, the key kept, never a refusal', async () => {
    const s: Shop = shop({ selected: R1, fetch: (c) => {
      const p = path(c);
      if (p.includes('/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) };
      if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
      s.bump();
      return { status: 201, body: envelope(DONE) };
    } });
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    const r = await a.confirm(true);
    expect(r).toMatchObject({ ok: false, reason: 'unknown' });
    expect(posts().length).toBe(1);
    expect(hostOf(posts()[0]!)).toBe(`${R1}.${DOMAIN}`);
    expect(a.snapshot()).toMatchObject({ pending: true });
  });
  it('a subscription that left the captured realm: the realm host answers 404 and Pay now / auto-renew are refused there', async () => {
    const s = shop({ selected: R1, fetch: () => typedErr(404, 'NOT_FOUND') });
    const ctx = s.ctx();
    expect(await getSubscription(ctx, 'x1')).toBe(null);
    const e = await lo(setAutoRenew(shownOwner(ctx), ctx, { id: 'x1' }, true));
    expect(e.status).toBe(404);
    expect(calls.map((c) => hostOf(c))).toEqual([`${R1}.${DOMAIN}`, `${R1}.${DOMAIN}`]);
  });
});

describe('parity: plan catalogues (the real {data: {requested_locale, plans}} envelope)', () => {
  it('the buy catalogue (/meta/subserver-plans) returns the plans', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope({ requested_locale: 'en', plans: PLANS }) }) });
    expect((await catalogue(s.ctx())).map((p) => (p as { id: string }).id)).toEqual(['v1', 'v2']);
  });
  it('the signed-in catalogue (/subserver-plans) indexes the plans by version id', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope({ requested_locale: 'en', plans: PLANS }) }) });
    expect(Object.keys(await plans(s.ctx())).sort()).toEqual(['v1', 'v2']);
  });
  for (const [what, body] of [['an array-shaped data', envelope(PLANS)], ['plans not an array', envelope({ plans: 'x' })], ['no data', {}]] as const) {
    it(`a malformed envelope (${what}) reads as no plans`, async () => {
      const s = shop({ fetch: () => ({ status: 200, body }) });
      expect(await catalogue(s.ctx())).toEqual([]);
      expect(await plans(s.ctx())).toEqual({});
    });
  }
});

// ── wallet ──────────────────────────────────────────────────────────────
describe('parity: Wallet: balance, AI credit, availability', () => {
  it('balances map general and live AI credit; a non-live AI status hides the remaining credit', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope({ general_balance: '12.50', ai_usage_status: 'degraded', ai_remaining: '3.00' }) }) });
    expect(await balances(s.ctx())).toEqual({ general: '12.50', aiRemaining: null, aiLive: false });
  });
  it('availability lists only enabled methods with their bounds and the fee (null when unknown)', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope({ card: { enabled: true, min_usd: 10 }, crypto: { enabled: false } }) }) });
    const av = await availability(s.ctx());
    expect(av.methods.map((m) => [m.key, m.min, m.max])).toEqual([['card', 10, 10000]]);
    expect(av.feeBps).toBe(null);
  });
  it.each([
    ['an empty object', {}],
    ['data without either provider', { ai_credit_fee_bps: 0 }],
    ['one provider missing', { card: { enabled: false } }],
    ['a flag that is not a boolean', { card: { enabled: 'yes' }, crypto: { enabled: false } }],
  ])('availability: %s is not an answer (a failed read, never "no method")', async (_n, data) => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope(data) }) });
    await expect(availability(s.ctx())).rejects.toMatchObject({ code: 'BAD_LIST' });
  });
});

describe('parity: Transfer to AI credit', () => {
  it('sends the normalized amount, the dialog key and the fee it showed, as the displayed owner', async () => {
    const s = shop({ fetch: () => ({ status: 201, body: envelope({ general_balance: '2.00', limit_sync_pending: true }) }) });
    const ctx = s.ctx();
    const r = await transfer(shownOwner(ctx), ctx, '10', 250, 'k1');
    expect(calls[0]!.body).toEqual({ amount: '10.00', idempotency_key: 'k1', expected_fee_bps: 250 });
    expect(uidOf(calls[0]!)).toBe(UA);
    expect(r).toEqual({ ok: true, generalBalance: '2.00', syncPending: true });
  });
  it('an unknown fee is not bound (no expected_fee_bps)', async () => {
    const s = shop({ fetch: () => ({ status: 201, body: envelope({}) }) });
    const ctx = s.ctx();
    await transfer(shownOwner(ctx), ctx, '1.5', null, 'k1');
    expect(calls[0]!.body).toEqual({ amount: '1.50', idempotency_key: 'k1' });
  });
  it('a reused key means an earlier transfer went through: a new key for the next', async () => {
    const s = shop({ fetch: () => typedErr(409, 'TRANSFER_IDEMPOTENCY_KEY_REUSED') });
    const ctx = s.ctx();
    const e = await transfer(shownOwner(ctx), ctx, '10', 0, 'k1').catch((x: { code: string; newKey: string }) => x) as { code: string; newKey: string };
    expect(e.code).toBe('reused');
    expect(e.newKey).not.toBe('k1');
  });
  it('a changed fee stops the transfer for re-confirmation', async () => {
    const s = shop({ fetch: () => typedErr(409, 'TRANSFER_FEE_CHANGED') });
    const ctx = s.ctx();
    expect((await lo(transfer(shownOwner(ctx), ctx, '10', 0, 'k1'))).code).toBe('fee_changed');
  });
  it('a bad amount is refused before sending', async () => {
    const s = shop();
    const ctx = s.ctx();
    expect((await lo(transfer(shownOwner(ctx), ctx, '0', 0, 'k1'))).notSent).toBe(true);
    expect(calls.length).toBe(0);
  });
  for (const [dir, me, other] of DIRS) {
    it(`${dir}: another user signs in after the dialog opened: nothing sent`, async () => {
      const s = shop({ me, fetch: () => ({ status: 201, body: envelope({}) }) });
      const ctx = s.ctx();
      const own = shownOwner(ctx);
      s.switchTo(other);
      expect((await lo(transfer(own, ctx, '10', 0, 'k1'))).notSent).toBe(true);
      expect(calls.length).toBe(0);
    });
  }
  it('no identity displayed: no owner, nothing sent', async () => {
    const s = shop({ identity: null });
    const ctx = s.ctx();
    expect(shownOwner(ctx)).toBe(null);
    expect((await lo(transfer(null, ctx, '10', 0, 'k1'))).notSent).toBe(true);
  });
  for (const [dir, me, other] of DIRS) {
    it(`transfer ${dir}: shown identity changes during the token refresh: nothing sent`, async () => {
      const e0 = Math.floor(Date.now() / 1000);
      const s: Shop = shop({ me, local: {
        access_token: sessionToken(me, { sid: 'sid-z', exp: e0 + 3600 }), refresh_token: sessionToken(me, { sid: 'sid-z', exp: e0 + 86400 }),
        access_token_expires_at: new Date(Date.now() - 1000).toISOString(),
      }, fetch: (c) => {
        if (path(c) === '/users/auth/refresh') {
          s.show(other);
          return { status: 200, delayMs: 15, body: { data: { token: sessionToken(me, { sid: 'sid-z', exp: e0 + 3600 }), refreshToken: sessionToken(me, { sid: 'sid-z', exp: e0 + 86400 }), expires_at: new Date(Date.now() + 3_600_000).toISOString() } } };
        }
        return { status: 201, body: envelope({}) };
      } });
      const ctx = s.ctx();
      const e = await transfer(shownOwner(ctx), ctx, '10', 0, 'k1').catch((x: { ok?: boolean }) => x);
      expect(e && e.ok).not.toBe(true);
      expect(calls.some((c) => path(c) === '/users/auth/refresh')).toBe(true);
      expect(posts()).toEqual([]);
    });
  }
});

describe('parity: Top up (card checkout / crypto invoice): the checkout URL is followed only on the provider\'s own https host', () => {
  const card = { key: 'card' as const, path: '/wallet/payments/card/checkout', urlField: 'checkout_url', min: 5, max: 100 };
  const crypto = { key: 'crypto' as const, path: '/wallet/payments/crypto/invoice', urlField: 'invoice_url', min: 5, max: 100 };
  const go = (m: typeof card | typeof crypto, field: string, url: unknown) => {
    const s = shop({ fetch: () => ({ status: 201, body: envelope({ [field]: url }) }) });
    const ctx = s.ctx();
    return topup(shownOwner(ctx), ctx, m, '25', 'k').then((r) => r.url, (x: { code: string }) => x.code);
  };
  it('follows only a https stripe.com checkout URL', async () => {
    const s = shop({ fetch: () => ({ status: 201, body: envelope({ checkout_url: 'https://checkout.stripe.com/c/1' }) }) });
    const ctx = s.ctx();
    expect(await topup(shownOwner(ctx), ctx, card, '25', 'k')).toEqual({ url: 'https://checkout.stripe.com/c/1' });
    expect(calls[0]!.body).toEqual({ amount: '25.00', idempotency_key: 'k' });
    expect(path(calls[0]!)).toBe('/wallet/payments/card/checkout');
  });
  it('a checkout URL on any other host is refused (stopped for safety)', async () => {
    expect(await go(card, 'checkout_url', 'https://evil.example/stripe.com/')).toBe('BAD_CHECKOUT_URL');
  });
  for (const [what, url] of [
    ['a plain http stripe.com URL', 'http://checkout.stripe.com/c/1'], ['a host ending in stripe.com.evil.example', 'https://checkout.stripe.com.evil.example/c/1'],
    ['userinfo ahead of the host', 'https://checkout.stripe.com@evil.example/c/1'], ['a lookalike host (notstripe.com)', 'https://notstripe.com/c/1'],
    ['a javascript: URL', 'javascript:alert(1)'], ['an empty URL', ''], ['no URL at all', undefined], ['a non-string URL', 5],
    ['the crypto provider\'s host', 'https://nowpayments.io/payment/1'],
  ] as const) {
    it(`card: ${what} is BAD_CHECKOUT_URL`, async () => { expect(await go(card, 'checkout_url', url)).toBe('BAD_CHECKOUT_URL'); });
  }
  it('crypto follows only a https nowpayments.io invoice URL', async () => {
    expect(await go(crypto, 'invoice_url', 'https://nowpayments.io/payment/?iid=1')).toBe('https://nowpayments.io/payment/?iid=1');
    expect(await go(crypto, 'invoice_url', 'https://checkout.stripe.com/c/1')).toBe('BAD_CHECKOUT_URL');
    expect(await go(crypto, 'invoice_url', 'http://nowpayments.io/payment/1')).toBe('BAD_CHECKOUT_URL');
    expect(await go(crypto, 'invoice_url', 'https://nowpayments.io.evil.example/x')).toBe('BAD_CHECKOUT_URL');
  });
  it('an amount outside the method bounds is refused before sending', async () => {
    const s = shop();
    const ctx = s.ctx();
    expect((await lo(topup(shownOwner(ctx), ctx, card, '500', 'k'))).code).toBe('OUT_OF_RANGE');
    expect(calls.length).toBe(0);
  });
});

describe('parity: top-up return verification (the owner-scoped intent decides)', () => {
  const id = '0123456789abcdef01234567';
  for (const [intent, want] of [
    [{ status: 'completed' }, { state: 'received' }], [{ status: 'pending', credited_at: '2026' }, { state: 'received' }],
    [{ status: 'under_review', credited_at: '2026' }, { state: 'review', credited: true }], [{ status: 'failed' }, { state: 'failed' }],
    [{ status: 'expired' }, { state: 'cancelled' }],
  ] as const) {
    it(`intent ${JSON.stringify(intent)} then ${want.state}`, async () => {
      const s = shop({ fetch: () => ({ status: 200, body: envelope(intent) }) });
      expect(await verifyReturn(s.ctx(), id, 'card', 'success')).toEqual(want);
    });
  }
  it('404 (unknown or foreign intent) then unverified, never a promised credit', async () => {
    const s = shop({ fetch: () => ({ status: 404, body: { error: 'NOT_FOUND' } }) });
    expect(await verifyReturn(s.ctx(), id, 'crypto', 'success')).toEqual({ state: 'unverified' });
    expect(path(calls[0]!)).toBe('/wallet/payments/crypto/intents/' + id);
  });
  it('a malformed payment id is never requested', async () => {
    const s = shop();
    expect(await verifyReturn(s.ctx(), '../x', 'card', 'success')).toEqual({ state: 'unverified' });
    expect(calls.length).toBe(0);
  });
});

describe('parity: payment return (the boot stash)', () => {
  const id = '0123456789abcdef01234567';
  it('a valid stash is read and KEPT (a reload mid-verification resumes); dropTopupReturn removes it', () => {
    const v = JSON.stringify({ payment: id, status: 'success', provider: 'crypto', at: Date.now() });
    shop({ session: { hub_topup_return: v } });
    expect(readTopupReturn()).toEqual({ payment: id, provider: 'crypto', status: 'success' });
    expect(sessionStorage.getItem('hub_topup_return')).toBe(v);
    dropTopupReturn();
    expect(sessionStorage.getItem('hub_topup_return')).toBe(null);
  });
  for (const [what, v] of [['garbage', '{x'], ['a bad payment id', JSON.stringify({ payment: '../x', at: Date.now() })],
    ['a stash older than 24 h', JSON.stringify({ payment: id, at: Date.now() - 25 * 3600e3 })]] as const) {
    it(`${what} is dropped`, () => {
      shop({ session: { hub_topup_return: v } });
      expect(readTopupReturn()).toBe(null);
      expect(sessionStorage.getItem('hub_topup_return')).toBe(null);
    });
  }
  it('an unknown provider verifies against the card intents (card)', () => {
    shop({ session: { hub_topup_return: JSON.stringify({ payment: id, provider: 'x', at: Date.now() }) } });
    expect(readTopupReturn()!.provider).toBe('card');
  });
});

describe('parity: GitHub connection bonus', () => {
  it('a cold read failure renders nothing ({enabled:false})', async () => {
    const s = shop({ fetch: () => ({ status: 500, body: {} }) });
    expect(await githubBonus(s.ctx())).toEqual({ enabled: false });
  });
  it('a claim whose answer is lost is "retry" with a refetch, never "nothing added"', async () => {
    const s = shop({ fetch: () => ({ status: 0, network: true }) });
    const ctx = s.ctx();
    expect(await claimBonus(shownOwner(ctx), ctx)).toEqual({ result: 'retry', refetch: true });
  });
  it('granted then refetch balances and status', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope({ result: 'granted' }) }) });
    const ctx = s.ctx();
    expect((await claimBonus(shownOwner(ctx), ctx)).refetch).toBe(true);
  });
  it('another user signed in: the claim is not sent', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope({ result: 'granted' }) }) });
    const ctx = s.ctx();
    const own = shownOwner(ctx);
    s.switchTo(UB);
    expect((await claimBonus(own, ctx).catch((x: { notSent: boolean }) => x) as { notSent: boolean }).notSent).toBe(true);
    expect(calls.length).toBe(0);
  });
});

// ── top-up dialog flow (commerce.ts topUp) ───────────────
describe('the top-up dialog flow keeps one key per purchase', () => {
  const avail: Reply = { status: 200, body: envelope({ card: { enabled: true }, crypto: { enabled: true } }) };
  it('a method switch is a new purchase; another amount after an attempt is another; the same amount resends the key', async () => {
    // A definite refusal (a pending top-up refuses every submit but Check again).
    shop({ fetch: (c) => (c.method === 'GET' ? avail : typedErr(400, 'AMOUNT_INVALID')) });
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
    shop({ fetch: (c) => (c.method === 'GET' ? avail : typedErr(409, 'PAYMENT_IDEMPOTENCY_KEY_REUSED')) });
    const t = createTopUp();
    await t.load();
    const k = t.snapshot().key;
    expect((await t.submit('10')).ok).toBe(false);
    expect(t.snapshot().key).not.toBe(k);
    const { onFetch } = await import('./test/env');
    onFetch(() => ({ status: 201, body: envelope({ checkout_url: 'https://checkout.stripe.com/x' }) }));
    expect(await t.submit('10')).toEqual({ ok: true, url: 'https://checkout.stripe.com/x' });
  });
  it('no displayed identity: phase account, nothing is read', async () => {
    shop({ identity: null });
    const t = createTopUp();
    await t.load();
    expect(t.snapshot().phase).toBe('account');
    expect(calls).toHaveLength(0);
  });
});

// ── subscriptions and plans ─────────────────────────────────────────────
describe('parity: Paid subservers list and plan chip', () => {
  const sub = (id: string, state: string, over: Record<string, unknown> = {}) => ({ id, state, plan_id: 'v1', server_id: 'srv-' + id, auto_renew: true, ...over });
  it('reads every page, deduplicates by id and sorts held/past-due first', async () => {
    const all = [sub('a', 'active'), sub('b', 'held', { delete_at: null }), sub('c', 'past_due')];
    const s = shop({ fetch: (c) => {
      const off = parseInt(/offset=(\d+)/.exec(path(c))![1]!, 10);
      return { status: 200, body: envelope(off === 0 ? all.slice(0, 2) : [all[1], all[2]], 3) };
    } });
    const r = await loadSubscriptions(s.ctx());
    expect(r.subs.map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(r.partial).toBe(null);
  });
  it('a switch while the last page is out drops it: the list is refused, never shown under the new user', async () => {
    const s: Shop = shop({ fetch: () => { s.switchTo(UB); return { status: 200, body: envelope([sub('a', 'active')], 1) }; } });
    const e = await loadSubscriptions(s.ctx()).catch((x: { subs?: unknown; superseded?: boolean; stale?: boolean }) => x) as { subs?: unknown; superseded?: boolean; stale?: boolean };
    expect(e.subs).toBe(undefined);
    expect(e.superseded || e.stale).toBe(true);
  });
  it('the displayed identity changing while a page is out drops the list too', async () => {
    const s: Shop = shop({ fetch: () => { s.show(UB); return { status: 200, body: envelope([sub('a', 'active')], 1) }; } });
    const e = await loadSubscriptions(s.ctx()).catch((x: { subs?: unknown }) => x) as { subs?: unknown };
    expect(e.subs).toBe(undefined);
  });
  it('before an identity is displayed (boot) the list is read as the stored session\'s user', async () => {
    const s = shop({ identity: null, fetch: () => ({ status: 200, body: envelope([sub('a', 'active')], 1) }) });
    const r = await loadSubscriptions(s.ctx());
    expect(r.subs.length).toBe(1);
    expect(uidOf(calls[0]!)).toBe(UA);
  });
  it('the safety stop says the list is cut short', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope([sub('a', 'active')], 5) }) });
    const r = await loadSubscriptions(s.ctx(), 1);
    expect(r.partial).toEqual({ shown: 1, total: 5 });
  });
  it('a truncated page is a failed load, not "no subscriptions"', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: {} }) });
    expect((await lo(loadSubscriptions(s.ctx()))).code).toBe('BAD_LIST');
  });
  it('the plan chip: free, bare-metal, and a paid subserver with its plan title', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope({ requested_locale: 'en', plans: [{ id: 'v1', family_id: 'f1', text: { title: 'Starter' }, price_cents_per_month: 900, hold_days: 7 }] }) }) });
    const idx = await plans(s.ctx());
    expect(planChip({ server: { is_free: true } }, [], idx)).toEqual({ kind: 'free', title: null });
    expect(planChip({ server: { is_free: false } }, [], idx)).toEqual({ kind: 'bare_metal', title: null });
    const paid = planChip({ server: { id: 'srv-a', paid_subserver: true } }, [sub('z', 'active', { plan_id: 'v2' }), sub('a', 'active')], idx);
    expect(paid.kind).toBe('paid');
    expect(paid.title).toBe('Starter');
  });
  it('the plan chip on the real envelope names the plan', async () => {
    const s = shop({ fetch: (c) => (path(c).startsWith('/subserver-plans') ? { status: 200, body: envelope({ requested_locale: 'en', plans: [PLAN] }) } : undefined) });
    const idx = await plans(s.ctx());
    expect(planChip({ server: { id: 'srv-a', paid_subserver: true } }, [{ id: 'a', state: 'active', plan_id: 'v1', server_id: 'srv-a' }], idx)).toEqual({ kind: 'paid', title: 'Starter' });
  });
});

describe('parity: Auto-renew on / off', () => {
  it('PUT :id/auto-renew {auto_renew} as the displayed owner', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope({}) }) });
    const ctx = s.ctx();
    await setAutoRenew(shownOwner(ctx), ctx, { id: 'x1' }, false);
    expect([calls[0]!.method, path(calls[0]!), calls[0]!.body]).toEqual(['PUT', '/subserver-subscriptions/x1/auto-renew', { auto_renew: false }]);
  });
  it('another user signed in: nothing sent', async () => {
    const s = shop();
    const ctx = s.ctx();
    const own = shownOwner(ctx);
    s.switchTo(UB);
    expect((await setAutoRenew(own, ctx, { id: 'x1' }, true).catch((x: { notSent: boolean }) => x) as { notSent: boolean }).notSent).toBe(true);
    expect(calls.length).toBe(0);
  });
});

// ── buy intents and money attempts ──────────────────────────────────────
function buyShop(onPost: (c: Call, n: number) => Reply | Promise<Reply>, o: Parameters<typeof shop>[0] = {}) {
  let n = 0;
  return shop({ ...o, fetch: (c) => {
    const p = path(c);
    if (p.startsWith('/subserver-subscriptions/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) };
    if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
    if (c.method === 'POST') return onPost(c, ++n);
    return { status: 404, body: {} };
  } });
}

describe('parity: Get a paid subserver (buy intent, plan, quote, Confirm)', () => {
  it('the intent: this tab first, then the cross-tab copy; a malformed one is dropped', () => {
    shop({ session: { hub_buy_intent: JSON.stringify({ kind: 'subserver', plan: FAM, at: Date.now() }) } });
    expect(readIntent()).toBe(FAM);
    expect(consumeIntent()).toBe(FAM);
    expect(readIntent()).toBe(null);
    sessionStorage.setItem('hub_buy_intent', '{bad');
    expect(readIntent()).toBe(null);
    expect(sessionStorage.getItem('hub_buy_intent')).toBe(null);
  });
  it('the top-up continuation shows only for its own account; another account\'s is deleted', () => {
    const marker = JSON.stringify({ kind: 'subserver', user: UA, plan: FAM, title: 'Starter', at: Date.now() });
    const s = shop({ session: { hub_buy_resume: marker } });
    expect(readBuyResume()).toMatchObject({ plan: FAM, user: UA });
    s.show(null);
    expect(readBuyResume()).toBe(null);
    expect(sessionStorage.getItem('hub_buy_resume')).toBe(marker); // hidden, kept until an identity shows
    s.show(UB);
    expect(readBuyResume()).toBe(null);
    expect(sessionStorage.getItem('hub_buy_resume')).toBe(null);
  });
  it('Confirm: identity re-read first, the key stored before sending, POST pendingBody as the owner, then done; key dropped', async () => {
    let during: string | null = null;
    buyShop((c) => { during = localStorage.getItem('hub_money_pending'); void c; return envOk(DONE); });
    const a = createAttempt('buy', { plan: PLAN, title: 'Starter' });
    await a.quote();
    const r = await a.confirm(true);
    expect(r.ok).toBe(true);
    expect(calls.map((c) => c.method + ' ' + path(c).split('?')[0])).toEqual(['GET /subserver-subscriptions/quote', 'GET /users/auth/me', 'POST /subserver-subscriptions']);
    const body = posts()[0]!.body;
    expect(body).toMatchObject({ plan_id: 'v1', max_charge_cents: 900 });
    expect(typeof body.idempotency_key).toBe('string');
    expect(JSON.parse(during as unknown as string)[0].key).toBe(body.idempotency_key);
    await sleep(10);
    expect(localStorage.getItem('hub_money_pending')).toBeNull();
    expect(uidOf(posts()[0]!)).toBe(UA);
    expect(notices).toEqual([]); // recovers: no pending notice while the context lives
  });
  it('/users/auth/me names another user: nothing sent (account changed)', async () => {
    shop({ fetch: (c) => {
      const p = path(c);
      if (p.startsWith('/subserver-subscriptions/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) };
      if (p === '/users/auth/me') return { status: 200, body: envelope({ id: UB }) };
      return envOk(DONE);
    } });
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('account');
    expect(posts()).toEqual([]);
  });
  it('an unknown outcome keeps the key; the next Confirm resends exactly it', async () => {
    buyShop((_c, n) => (n === 1 ? { status: 0, network: true } : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('unknown');
    expect(jsonLocal('hub_money_pending').length).toBe(1);
    expect((await a.confirm(true)).ok).toBe(true);
    const keys = posts().map((c) => c.body.idempotency_key);
    expect(keys[0]).toBe(keys[1]);
  });
  it('an unknown outcome then a new quote: the retained attempt still goes out with its first key and ceiling', async () => {
    let charge = 900;
    let n = 0;
    shop({ fetch: (c) => {
      const p = path(c);
      if (p.startsWith('/subserver-subscriptions/quote')) return { status: 200, body: envelope({ charge_cents: charge, price_cents_per_month: charge }) };
      if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
      return ++n === 1 ? { status: 500, body: { error: 'X' } } : envOk(DONE);
    } });
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    await a.confirm(true);
    const first = a.snapshot();
    charge = 1200;
    await a.quote();
    expect(a.snapshot()).toMatchObject({ key: first.key, ceiling: 900, pending: true });
    await a.confirm(true);
    const b = posts().map((c) => c.body);
    expect(b[1].idempotency_key).toBe(b[0].idempotency_key);
    expect(b[1].max_charge_cents).toBe(900);
  });
  it('a reopened panel shows the retained attempt and resends it unchanged', async () => {
    buyShop((_c, n) => (n === 1 ? { status: 500, body: { error: 'X' } } : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    await a.confirm(true);
    const b = createAttempt('buy', { plan: PLAN });
    expect(b.snapshot().pending).toBe(true);
    expect((await b.confirm(true)).ok).toBe(true);
    const keys = posts().map((c) => c.body.idempotency_key);
    expect(keys[0]).toBe(keys[1]);
  });
  it('a definitive refusal (after the idempotency lookup) drops the key; the next Confirm gets a new one', async () => {
    buyShop((_c, n) => (n === 1 ? typedErr(400, 'INSUFFICIENT_BALANCE', { required_cents: 900, available_cents: 0 }) : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    const r = await a.confirm(true);
    expect(r).toMatchObject({ reason: 'refused', definitive: true, kind: 'funds' });
    await sleep(10);
    expect(localStorage.getItem('hub_money_pending')).toBeNull();
    await a.quote();
    await a.confirm(true);
    const keys = posts().map((c) => c.body.idempotency_key);
    expect(keys[0]).not.toBe(keys[1]);
  });
  it('a money POST refused before sending (a framed page) is a refusal, never "outcome unknown"', async () => {
    const { env } = await import('./test/env');
    buyShop(() => envOk(DONE));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    env.framed = true;
    try {
      expect(await a.confirm(true)).toMatchObject({ ok: false, notSent: true });
      expect(posts()).toEqual([]);
    } finally { env.framed = false; }
  });
  it('another tab\'s unresolved attempt for the same plan is shown, nothing is sent behind it', async () => {
    const other = [{ kind: 'buy', user_id: UA, family_id: FAM, plan_id: 'v0', key: 'other-key', max_charge_cents: 800, at: 1 }];
    buyShop(() => envOk(DONE));
    const a = createAttempt('buy', { plan: PLAN });
    localStorage.setItem('hub_money_pending', JSON.stringify(other)); // written by the other tab after this panel opened
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('adopted');
    expect(posts()).toEqual([]);
    expect(a.snapshot()).toMatchObject({ key: 'other-key', ceiling: 800, pending: true });
  });
  it('no identity displayed: the attempt has no owner and sends nothing', async () => {
    buyShop(() => envOk(DONE), { identity: null });
    const a = createAttempt('buy', { plan: PLAN });
    expect(a.snapshot().phase).toBe('account');
    expect(((await a.quote().catch((x: { notSent: boolean }) => x)) as { notSent: boolean }).notSent).toBe(true);
    expect((await a.confirm(true)).reason).toBe('accountChanged');
    expect(calls).toEqual([]);
  });
  for (const [dir, me, other] of DIRS) {
    it(`${dir}: another user signs in after the panel opened: nothing sent`, async () => {
      const s = buyShop(() => envOk(DONE), { me });
      const a = createAttempt('buy', { plan: PLAN });
      await a.quote();
      s.switchTo(other);
      const from = calls.length;
      expect((await a.confirm(true)).reason).toBe('accountChanged');
      expect(calls.slice(from)).toEqual([]); // stopped before the identity re-read: nothing sent at all
      expect(a.snapshot().notice).toBe('accountChanged');
    });
  }
  it('the token refresh before the identity check reaches no verdict (REFRESH_UNAVAILABLE): a check that could not run, never "account changed"; nothing sent', async () => {
    const soon = new Date(Date.now() + 10_000).toISOString();
    const e = Math.floor(Date.now() / 1000);
    const s = shop({
      local: { access_token: sessionToken(UA, { sid: 'sid-aaaa', exp: e + 3600 }), refresh_token: sessionToken(UA, { sid: 'sid-aaaa', exp: e + 86400 }) },
      fetch: (c) => {
        const p = path(c);
        // The refresh limiter's 429: the token was not spent, and shared.js does not send it again at once.
        if (p === '/users/auth/refresh') return { status: 429, body: { statusCode: 429, error: 'RATE_LIMITED', message: 'slow down' } };
        if (p.startsWith('/subserver-subscriptions/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) };
        if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
        return envOk(DONE);
      },
    });
    void s;
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    localStorage.setItem('access_token_expires_at', soon); // due for its refresh when Confirm checks the identity
    const r = await a.confirm(true);
    expect(r.reason).toBe('check');
    expect(a.snapshot().notice).toBe('check');
    expect(posts()).toEqual([]);
    expect(localStorage.getItem('refresh_token')).not.toBeNull();
  });
  it('Pay now: GET :id/quote?action=pay, then POST :id/pay {idempotency_key, max_charge_cents}', async () => {
    shop({ fetch: (c) => {
      const p = path(c);
      if (p.endsWith('/quote?action=pay')) return { status: 200, body: envelope({ charge_cents: 900 }) };
      if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
      return envOk(PAID);
    } });
    const a = createAttempt('pay', { sub: { id: 'x1' } });
    await a.quote();
    expect((await a.confirm(true)).ok).toBe(true);
    expect(path(posts()[0]!)).toBe('/subserver-subscriptions/x1/pay');
    expect(Object.keys(posts()[0]!.body).sort()).toEqual(['idempotency_key', 'max_charge_cents']);
  });
});

// ── the key stores: every rule of createAttempt ───────────────────────────
describe('createAttempt key store: same key until definitive, read back after write, adopted / preflight refusals, replays', () => {
  it('the entry is written and READ BACK before anything leaves: storage that drops the write refuses with "store", nothing sent', async () => {
    buyShop(() => envOk(DONE));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    breakKey('setItem', 'hub_money_pending', 'drop');
    expect(await a.confirm(true)).toMatchObject({ ok: false, reason: 'store', notSent: true });
    expect(posts()).toEqual([]);
    expect(a.snapshot().phase).toBe('review');
  });
  it('a store that throws on write refuses unsent too, and Confirm works again once storage returns', async () => {
    buyShop(() => envOk(DONE));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    breakKey('setItem', 'hub_money_pending', 'throw');
    expect((await a.confirm(true)).reason).toBe('store');
    restoreStorage();
    expect((await a.confirm(true)).ok).toBe(true);
    expect(posts().length).toBe(1);
  });
  it('a read-back holding other bytes (another key under the same target) is adopted, never overwritten, nothing sent', async () => {
    buyShop(() => envOk(DONE));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    localStorage.setItem('hub_money_pending', JSON.stringify([{ kind: 'buy', user_id: UA, family_id: FAM, plan_id: 'v1', key: 'tab2-key', max_charge_cents: 900, at: 2 }]));
    expect(await a.confirm(true)).toMatchObject({ ok: false, reason: 'adopted', notSent: true });
    expect(posts()).toEqual([]);
    expect(jsonLocal('hub_money_pending').map((e) => e.key)).toEqual(['tab2-key']);
    expect(a.snapshot()).toMatchObject({ key: 'tab2-key', pending: true });
  });
  it('the same key is resent until a definitive answer: three unknowns, then a 2xx, all one key', async () => {
    buyShop((_c, n) => (n < 4 ? { status: 500, body: { error: 'X' } } : envOk(DONE)));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    for (let i = 0; i < 3; i++) expect((await a.confirm(true)).reason).toBe('unknown');
    expect((await a.confirm(true)).ok).toBe(true);
    expect(new Set(posts().map((c) => c.body.idempotency_key)).size).toBe(1);
    expect(posts().length).toBe(4);
  });
  it('a non-definitive 4xx (404 / 401 / 403 / 429 / unknown code) proves nothing: the key is kept', async () => {
    for (const [status, code] of [[404, 'NOT_FOUND'], [401, 'X'], [403, 'X'], [429, 'TOO_MANY_REQUESTS'], [400, 'SOMETHING_NEW']] as const) {
      buyShop(() => typedErr(status, code));
      const a = createAttempt('buy', { plan: PLAN });
      await a.quote();
      const r = await a.confirm(true);
      expect(r.ok).toBe(false);
      expect((r as { definitive?: boolean }).definitive).toBeUndefined();
      expect(localStorage.getItem('hub_money_pending')).not.toBeNull();
    }
  });
  it('a replayed answer is the old charge: it is reported as replayed, never as a new one', async () => {
    buyShop(() => envOk({ ...DONE, replayed: true }));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    const r = await a.confirm(true);
    expect(r).toMatchObject({ ok: true, result: { replayed: true, failed: false } });
  });
  it('a charge rolled back (operation failed) is an answer: reported failed, the entry dropped', async () => {
    buyShop(() => envOk({ ...DONE, operation: { ...DONE.operation, result: 'failed' } }));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    const r = await a.confirm(true);
    expect(r).toMatchObject({ ok: true, result: { failed: true } });
    expect(a.snapshot().phase).toBe('failed');
    await sleep(10);
    expect(localStorage.getItem('hub_money_pending')).toBeNull();
  });
  // The envelope must agree with itself and with the request, and carry a result of this contract.
  it.each([
    ['an operation of another subscription', { ...DONE, operation: { ...DONE.operation, subscription_id: 'y9' } }],
    ['a result outside the contract', { ...DONE, operation: { ...DONE.operation, result: 'pending' } }],
    ['no result at all', { ...DONE, operation: { id: 'op1', subscription_id: 'x1' } }],
    // The operation is this action's, of the plan sent; replayed is a boolean.
    ['an operation of another kind', { ...DONE, operation: { ...DONE.operation, kind: 'upgrade' } }],
    ['an operation for another plan', { ...DONE, operation: { ...DONE.operation, target_plan_id: 'v9' } }],
    ['replayed not a boolean', { ...DONE, replayed: 'true' }],
    ['no replayed at all', { operation: DONE.operation, subscription: DONE.subscription }],
  ])('buy: a 2xx with %s is outcome unknown: the key is kept', async (_n, body) => {
    buyShop(() => envOk(body));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('unknown');
    expect(a.snapshot().phase).toBe('unknown');
    expect(localStorage.getItem('hub_money_pending')).not.toBeNull();
  });
  it('pay: a 2xx about another subscription than the one paid is outcome unknown: the key is kept', async () => {
    const other = { operation: { id: 'op1', subscription_id: 'y9', result: null }, subscription: { id: 'y9', state: 'active' } };
    shop({ fetch: (c) => {
      const p = path(c);
      if (p.endsWith('/quote?action=pay')) return { status: 200, body: envelope({ charge_cents: 900 }) };
      if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
      return envOk(other);
    } });
    const a = createAttempt('pay', { sub: { id: 'x1' } });
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('unknown');
    expect(localStorage.getItem('hub_money_pending')).not.toBeNull();
  });
  it('pay: a 2xx about an operation that is not a resume (a wipe) is outcome unknown: the key is kept', async () => {
    const wipe = { ...PAID, operation: { ...PAID.operation, kind: 'wipe', result: 'succeeded' }, subscription: { id: 'x1', state: 'terminated' } };
    shop({ fetch: (c) => {
      const p = path(c);
      if (p.endsWith('/quote?action=pay')) return { status: 200, body: envelope({ charge_cents: 900 }) };
      if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
      return envOk(wipe);
    } });
    const a = createAttempt('pay', { sub: { id: 'x1' } });
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('unknown');
    expect(localStorage.getItem('hub_money_pending')).not.toBeNull();
  });
  it('a 2xx whose envelope is malformed is outcome unknown: the key is kept', async () => {
    buyShop(() => envOk({ operation: { id: 'x' } }));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('unknown');
    expect(localStorage.getItem('hub_money_pending')).not.toBeNull();
  });
  it('the entries of buy and pay for the same user live side by side; a definitive answer removes only its own', async () => {
    shop({ fetch: (c) => {
      const p = path(c);
      if (p.includes('/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) };
      if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
      return path(c) === '/subserver-subscriptions' ? { status: 500, body: {} } : envOk(accepted(c));
    } });
    const buy = createAttempt('buy', { plan: PLAN });
    await buy.quote();
    await buy.confirm(true);
    const pay = createAttempt('pay', { sub: { id: 'x1' } });
    await pay.quote();
    expect((await pay.confirm(true)).ok).toBe(true);
    await sleep(10);
    expect(jsonLocal('hub_money_pending').map((e) => e.kind)).toEqual(['buy']);
  });
  it('another account\'s entry is neither shown to nor blocks this account\'s attempt', async () => {
    localStorage.setItem('hub_money_pending', '[]');
    buyShop(() => envOk(DONE), { me: UB });
    localStorage.setItem('hub_money_pending', JSON.stringify([{ kind: 'buy', user_id: UA, family_id: FAM, plan_id: 'v1', key: 'a-key', max_charge_cents: 900, at: 1 }]));
    const a = createAttempt('buy', { plan: PLAN });
    expect(a.snapshot()).toMatchObject({ pending: false, key: null });
    await a.quote();
    expect((await a.confirm(true)).ok).toBe(true);
    expect(posts()[0]!.body.idempotency_key).not.toBe('a-key');
    await sleep(10);
    expect(jsonLocal('hub_money_pending').map((e) => e.user_id)).toEqual([UA]);
  });
  it('the registry keeps the key stores through a sign-out (hub_money_pending / hub_money_upgrade / hub_market_pending are purge:false)', async () => {
    const { shared } = await import('./session');
    const reg = (shared() as unknown as { AUTH_STORAGE_REGISTRY?: Array<{ area: string; key?: string; purge: boolean }> }).AUTH_STORAGE_REGISTRY;
    if (reg) for (const k of ['hub_money_pending', 'hub_money_upgrade', 'hub_market_pending']) expect(reg.filter((r) => r.key === k)).toEqual([{ area: 'local', key: k, purge: false }]);
    buyShop(() => ({ status: 500, body: {} }));
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    await a.confirm(true);
    (shared() as unknown as { clearAuthTokens: () => void }).clearAuthTokens();
    expect(jsonLocal('hub_money_pending').length).toBe(1);
  });
  it('a quote without a numeric charge is BAD_QUOTE, and a changed charge is a new intent (new key) when nothing is retained', async () => {
    let charge: unknown = -1;
    shop({ fetch: (c) => (path(c).startsWith('/subserver-subscriptions/quote') ? { status: 200, body: envelope({ charge_cents: charge, price_cents_per_month: 900 }) } : undefined) });
    const a = createAttempt('buy', { plan: PLAN });
    await expect(a.quote()).rejects.toMatchObject({ code: 'BAD_QUOTE' });
    charge = 900;
    await a.quote();
    const k1 = a.snapshot().key;
    charge = 1000;
    await a.quote();
    expect(a.snapshot()).toMatchObject({ ceiling: 1000 });
    expect(a.snapshot().key).not.toBe(k1);
  });
  it('dispose silences onChange but a request in flight still settles the key store', async () => {
    let n = 0;
    buyShop(() => (++n, envOk(DONE)));
    const seen: unknown[] = [];
    const a = createAttempt('buy', { plan: PLAN }, { onChange: (x) => seen.push(x) });
    await a.quote();
    const p = a.confirm(true);
    a.dispose();
    seen.length = 0;
    await p;
    await sleep(10);
    expect(seen).toEqual([]);
    expect(localStorage.getItem('hub_money_pending')).toBeNull();
    expect(n).toBe(1);
  });
});

// ── bounds and deadline fences ───────────────────────────────────────────────────
describe('bounded buy / pay: the op deadline covers the identity check, claim, token waits and POST', () => {
  const KINDS = [['buy', { plan: PLAN, title: 'Starter' }], ['pay', { sub: { id: 'x1' } }]] as const;
  function money(on: { me?: (c: Call) => Reply | Promise<Reply>; post?: (c: Call, n: number) => Reply | Promise<Reply>; quote?: () => Reply | Promise<Reply> }, o: Parameters<typeof shop>[0] = {}) {
    let n = 0;
    const s = shop({ ...o, fetch: (c) => {
      const p = path(c);
      if (p.includes('/quote')) return on.quote ? on.quote() : { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) };
      if (p === '/users/auth/me') return on.me ? on.me(c) : { status: 200, body: envelope({ id: uidOf(c) }) };
      if (c.method === 'POST') return on.post ? on.post(c, ++n) : { status: 201, body: envelope(accepted(c)) };
      return { status: 404, body: {} };
    } });
    Object.assign(bounds, { read: 1000, post: 1000, op: 60, list: 60, slack: 10 });
    return s;
  }
  it('the bounds: read 15 s, POST 30 s, operation 40 s; the list 30 s', () => {
    expect({ ...bounds }).toEqual({ read: 15000, post: 30000, op: 40000, list: 30000, slack: 5000 });
  });
  for (const [kind, target] of KINDS) {
    it(`${kind}: a stalled /users/auth/me: nothing sent, "timeout", and Confirm is usable again after expiry`, async () => {
      let stall = true;
      money({ me: (c) => (stall ? never() : { status: 200, body: envelope({ id: uidOf(c) }) }) });
      const a = createAttempt(kind, target);
      await a.quote();
      const r = await a.confirm(true);
      expect(r).toEqual({ ok: false, reason: 'timeout', notSent: true });
      expect(a.snapshot()).toMatchObject({ phase: 'review', notice: 'timeout' });
      expect(posts()).toEqual([]);
      stall = false;
      expect((await a.confirm(true)).ok).toBe(true);
      expect(posts().length).toBe(1);
    });
    it(`${kind}: a late continuation (identity answered after the deadline) sends nothing and stores nothing`, async () => {
      money({ me: (c) => ({ status: 200, body: envelope({ id: uidOf(c) }), delayMs: 100 }) });
      const a = createAttempt(kind, target);
      await a.quote();
      expect((await a.confirm(true)).reason).toBe('timeout');
      await sleep(150);
      expect(posts()).toEqual([]);
      expect(localStorage.getItem('hub_money_pending')).toBeNull();
      expect(a.snapshot().phase).toBe('review');
    });
    it(`${kind}: a stall after the POST went out: outcome unknown, the same key kept and resent`, async () => {
      money({ post: (c, n) => (n === 1 ? never() : { status: 201, body: envelope(accepted(c)) }) });
      const a = createAttempt(kind, target);
      await a.quote();
      const r = await a.confirm(true);
      expect(r.reason).toBe('unknown');
      expect(a.snapshot()).toMatchObject({ phase: 'unknown', pending: true });
      expect(jsonLocal('hub_money_pending')[0]!.key).toBe((r as { key: string }).key);
      expect((await a.confirm(true)).ok).toBe(true);
      expect(posts().map((c) => c.body.idempotency_key)).toEqual([(r as { key: string }).key, (r as { key: string }).key]);
    });
    it(`${kind}: a POST answered after the deadline is dropped (the attempt stays unknown, its key kept)`, async () => {
      money({ post: (c) => ({ status: 201, body: envelope(accepted(c)), delayMs: 100 }) });
      const a = createAttempt(kind, target);
      await a.quote();
      expect((await a.confirm(true)).reason).toBe('unknown');
      await sleep(150);
      expect(a.snapshot()).toMatchObject({ phase: 'unknown', pending: true, result: null });
      expect(localStorage.getItem('hub_money_pending')).not.toBeNull();
    });
  }
  it('a token refresh that outlives the deadline: once it returns nothing is sent (no identity read, no POST)', async () => {
    const e0 = Math.floor(Date.now() / 1000);
    const tok = () => ({ token: sessionToken(UA, { sid: 'sid-w', exp: e0 + 3600 }), refreshToken: sessionToken(UA, { sid: 'sid-w', exp: e0 + 86400 }), expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    const refreshed: Reply = { status: 200, body: { data: tok() }, delayMs: 100 };
    money({ post: (c) => (path(c) === '/users/auth/refresh' ? refreshed : { status: 201, body: envelope(DONE) }) }, {
      local: { access_token: sessionToken(UA, { sid: 'sid-w', exp: e0 + 3600 }), refresh_token: sessionToken(UA, { sid: 'sid-w', exp: e0 + 86400 }) },
    });
    const a = createAttempt('buy', { plan: PLAN });
    await a.quote();
    localStorage.setItem('access_token_expires_at', new Date(Date.now() - 1000).toISOString());
    expect((await a.confirm(true)).reason).toBe('timeout');
    await sleep(150);
    expect(calls.some((c) => path(c) === '/users/auth/refresh')).toBe(true);
    expect(calls.filter((c) => path(c) === '/users/auth/me')).toEqual([]);
    expect(posts()).toEqual([]);
  });
  it('a stalled quote rejects at its bound; its late answer sets no charge', async () => {
    let stall = true;
    money({ quote: () => (stall ? { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }), delayMs: 100 } : { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) }) });
    Object.assign(bounds, { read: 1000, slack: -970 }); // the whole-read bound (30 ms) fires before the request's own timeout
    const a = createAttempt('buy', { plan: PLAN });
    const e = await a.quote().catch((x: unknown) => x);
    expect(e).toMatchObject({ code: 'OP_DEADLINE' });
    await sleep(120);
    expect(a.snapshot().ceiling).toBeUndefined();
    expect((await a.confirm(true)).reason).toBe('unquoted');
    stall = false;
    await a.quote();
    expect(a.snapshot().ceiling).toBe(900);
  });
});

describe('bounded subscription list', () => {
  it('a stalled page rejects the whole list at its bound, and no further page is sent after it', async () => {
    let n = 0;
    const s = shop({ fetch: (c) => {
      if (!path(c).startsWith('/subserver-subscriptions?')) return { status: 404, body: {} };
      n++;
      return { status: 200, body: envelope([{ id: 'a' + n, state: 'active' }], 5), delayMs: n === 1 ? 0 : 100 };
    } });
    Object.assign(SUBS, { page: 1 });
    Object.assign(bounds, { list: 50 });
    const e = await loadSubscriptions(s.ctx()).catch((x: unknown) => x);
    expect(e).toMatchObject({ code: 'OP_DEADLINE' });
    await sleep(150);
    expect(n).toBe(2);
  });
  it('each page carries the 15 s request bound', async () => {
    // The request bound is api()'s timeoutMs; a page that never answers fails at it, not at the list bound.
    const s = shop({ fetch: () => never() });
    Object.assign(bounds, { read: 40, list: 5000 });
    const e = await lo(loadSubscriptions(s.ctx()));
    expect(e && (e.code === 'TIMEOUT' || e.code === 'OP_DEADLINE')).toBe(true);
  });
});

describe('the pending-store lock and the cleanup', () => {
  const KINDS = [['buy', { plan: PLAN, title: 'Starter' }], ['pay', { sub: { id: 'x1' } }]] as const;
  function money(post: (c: Call, n: number) => Reply | Promise<Reply>, o: Parameters<typeof shop>[0] = {}) {
    let n = 0;
    const s = shop({ ...o, fetch: (c) => {
      const p = path(c);
      if (p.includes('/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) };
      if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
      if (c.method === 'POST') return post(c, ++n);
      return { status: 404, body: {} };
    } });
    Object.assign(bounds, { read: 1000, post: 1000, op: 60, list: 60, slack: 10 });
    return s;
  }
  for (const [kind, target] of KINDS) {
    for (const [what, reply] of [['success', (c: Call) => envOk(accepted(c))], ['definitive refusal (INSUFFICIENT_BALANCE)', () => typedErr(400, 'INSUFFICIENT_BALANCE')]] as const) {
      it(`${kind}: a ${what} settles at once while the pending-store lock is held; the cleanup runs after`, async () => {
        const L = heldLocks();
        money((c) => { L.hold(); return reply(c); });
        const a = createAttempt(kind, target);
        await a.quote();
        const r = await a.confirm(true);
        if (what === 'success') expect(r.ok).toBe(true); else expect(r).toMatchObject({ reason: 'refused', definitive: true });
        expect(a.snapshot().phase).toBe(what === 'success' ? 'done' : 'review');
        expect(localStorage.getItem('hub_money_pending')).not.toBeNull(); // the cleanup waits behind the held lock
        await sleep(100);
        expect(a.snapshot().phase).toBe(what === 'success' ? 'done' : 'review');
        L.release();
        await sleep(10);
        expect(localStorage.getItem('hub_money_pending')).toBeNull();
      });
    }
    it(`${kind}: a late cleanup never touches the next attempt (new key, queued behind it)`, async () => {
      const L = heldLocks();
      money((c, n) => { if (n === 1) { L.hold(); return typedErr(400, 'INSUFFICIENT_BALANCE'); } return envOk(accepted(c)); });
      Object.assign(bounds, { op: 1000 });
      const a = createAttempt(kind, target);
      await a.quote();
      expect((await a.confirm(true) as { definitive?: boolean }).definitive).toBe(true);
      await a.quote();
      const second = a.confirm(true);
      await sleep(20);
      L.release();
      expect((await second).ok).toBe(true);
      const keys = posts().map((c) => c.body.idempotency_key);
      expect(keys.length).toBe(2);
      expect(keys[0]).not.toBe(keys[1]);
      await sleep(10);
      expect(localStorage.getItem('hub_money_pending')).toBeNull();
    });
    it(`${kind}: a claim lock held past the deadline writes nothing once released`, async () => {
      const L = heldLocks();
      money((c) => envOk(accepted(c)));
      const a = createAttempt(kind, target);
      await a.quote();
      L.hold();
      expect(await a.confirm(true)).toEqual({ ok: false, reason: 'timeout', notSent: true });
      L.release();
      await sleep(20);
      expect(localStorage.getItem('hub_money_pending')).toBeNull();
      expect(posts()).toEqual([]);
      expect(a.snapshot()).toMatchObject({ phase: 'review', pending: false });
    });
    it(`${kind}: the owner stopping to hold while the claim waits writes nothing`, async () => {
      const L = heldLocks();
      const s = money((c) => envOk(accepted(c)));
      Object.assign(bounds, { op: 1000 });
      const a = createAttempt(kind, target);
      await a.quote();
      L.hold();
      const r = a.confirm(true);
      await sleep(20);
      s.show(UB);
      L.release();
      expect(((await r) as { notSent?: boolean }).notSent).toBe(true);
      expect(localStorage.getItem('hub_money_pending')).toBeNull();
      expect(posts()).toEqual([]);
    });
    it(`${kind}: handed to api() but held before the wire past the deadline: unknown, key kept; the held send never leaves`, async () => {
      // The old suite held the request on the 2FA module; here the first POST is answered OTP_REQUIRED and the
      // prompt (a gate) answers after the deadline. The dispatch signal is aborted by then: the retry with the code
      // is never sent, the key stays, and the next Confirm resends exactly it.
      const g = gate();
      setOtpPrompt({ ask: () => g.p.then(() => '123456'), cancel: () => undefined });
      money((c) => (c.body && c.body.otp_code ? envOk(accepted(c)) : typedErr(403, 'OTP_REQUIRED')));
      const a = createAttempt(kind, target);
      await a.quote();
      const r = await a.confirm(true);
      expect(r.reason).toBe('unknown');
      expect(a.snapshot().phase).toBe('unknown');
      g.open();
      await sleep(30);
      expect(calls.filter((c) => c.body && c.body.otp_code)).toEqual([]);
      expect(a.snapshot()).toMatchObject({ pending: true, key: (r as { key: string }).key });
      setOtpPrompt(null);
    });
  }
});

// ── resume markers ──────────────────────────────────────────────────────
describe('parity: the buy / Pay now top-up continuation (legacy writeResume / writePayResume / clearResume, openTopUp)', () => {
  const tabFor = (o: Parameters<typeof shop>[0] = {}) => shop({ ...o, fetch: (c) => {
    const p = path(c);
    if (p.startsWith('/meta/subserver-plans')) return { status: 200, body: envelope({ requested_locale: 'en', plans: [PLAN] }) };
    if (p.includes('/quote')) return { status: 200, body: envelope({ charge_cents: 900, price_cents_per_month: 900 }) };
    if (p === '/users/auth/me') return { status: 200, body: envelope({ id: uidOf(c) }) };
    if (c.method === 'POST') return { status: 201, body: envelope(accepted(c)) };
    return { status: 404, body: {} };
  } });
  it('buy: Add funds writes the marker, reload reads it back, the plan opens again, Confirm completes; landing clears it', async () => {
    const s1 = tabFor();
    expect(writeBuyResume(shownOwner(s1.ctx()), FAM, 'Starter')).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('hub_buy_resume')!)).toMatchObject({ kind: 'subserver', user: UA, plan: FAM, title: 'Starter' });
    const snap = { local: Object.fromEntries(Object.entries(localStorage)), session: { hub_buy_resume: sessionStorage.getItem('hub_buy_resume')! } };
    const s2 = tabFor({ local: snap.local, session: snap.session }); // the reload after the wallet return
    const m = readBuyResume() as { plan: string; title: string; user: string };
    expect(m).toMatchObject({ user: UA, plan: FAM, title: 'Starter' });
    const p = (await catalogue(s2.ctx())).find((x) => (x as { family_id: string }).family_id === m.plan) as typeof PLAN;
    const a = createAttempt('buy', { plan: p, title: m.title }, { resumed: true });
    await a.quote();
    expect(sessionStorage.getItem('hub_buy_resume')).toBeNull();
    expect((await a.confirm(true)).ok).toBe(true);
    expect(a.snapshot().phase).toBe('done');
    expect(posts().map((c) => path(c))).toEqual(['/subserver-subscriptions']);
  });
  it('pay: Add funds writes the Pay marker, reload reads it back, Pay now opens again, Confirm completes; landing clears it', async () => {
    const s1 = tabFor();
    const sub = { id: 'x1', paid_through: '2026-11-20T00:00:00.000Z', state: 'past_due' };
    expect(writePayResume(shownOwner(s1.ctx()), sub, { title: 'Starter', name: 'paid-aaaaaaaaaaaaaaaaaaaaaaaa', holdDays: 7 })).toBe(true);
    const snap = { local: Object.fromEntries(Object.entries(localStorage)), session: { hub_buy_resume: sessionStorage.getItem('hub_buy_resume')! } };
    tabFor({ local: snap.local, session: snap.session });
    const m = readBuyResume() as { pay: string };
    expect(m).toMatchObject({ user: UA, pay: 'x1', title: 'Starter', name: 'paid-aaaaaaaaaaaaaaaaaaaaaaaa', paid_through: sub.paid_through, holdDays: 7 });
    const a = createAttempt('pay', { sub: { id: m.pay } }, { resumed: true });
    await a.quote();
    expect(sessionStorage.getItem('hub_buy_resume')).toBeNull();
    expect((await a.confirm(true)).ok).toBe(true);
    expect(posts().map((c) => path(c))).toEqual(['/subserver-subscriptions/x1/pay']);
  });
  it('the writers are owner-bound: no marker once the Hub displays someone else, or with no owner', () => {
    const s = tabFor();
    const own = shownOwner(s.ctx());
    s.show(UB);
    expect(writeBuyResume(own, FAM, 'Starter')).toBe(false);
    expect(writePayResume(own, { id: 'x1' }, {})).toBe(false);
    expect(writeBuyResume(null, FAM, 'Starter')).toBe(false);
    expect(sessionStorage.getItem('hub_buy_resume')).toBeNull();
  });
  it('the marker is another user\'s after a sign-in elsewhere: the reload as them never sees it (and deletes it)', () => {
    const s1 = tabFor();
    writeBuyResume(shownOwner(s1.ctx()), FAM, 'Starter');
    const marker = sessionStorage.getItem('hub_buy_resume')!;
    tabFor({ me: UB, session: { hub_buy_resume: marker } });
    expect(readBuyResume()).toBe(null);
    expect(sessionStorage.getItem('hub_buy_resume')).toBeNull();
  });
  it('an attempt not opened from the continuation leaves the marker; clearBuyResume removes it', async () => {
    const s = tabFor();
    writeBuyResume(shownOwner(s.ctx()), FAM, 'Starter');
    await createAttempt('buy', { plan: PLAN }).quote();
    expect(sessionStorage.getItem('hub_buy_resume')).not.toBeNull();
    clearBuyResume();
    expect(sessionStorage.getItem('hub_buy_resume')).toBeNull();
  });
});

// ── upgrade in place ───────────────────────────
describe('upgrade: the wire', () => {
  const SUB = { id: 'x1' };
  const UPLAN = { id: 'v2', family_id: 'f2f2f2f2f2f2f2f2f2f2f2f2' };
  const UDONE = (replayed = false) => ({ operation: { id: 'op1', subscription_id: 'x1', kind: 'upgrade', target_plan_id: 'v2', result: null, charge_cents: 450, created_at: '2026-10-22T10:00:00Z' }, subscription: { id: 'x1', state: 'active' }, replayed });
  function umoney(on: { post?: (c: Call, n: number) => Reply | Promise<Reply>; me?: (c: Call) => Reply } = {}, o: Parameters<typeof shop>[0] = {}) {
    let n = 0;
    const s = shop({ ...o, fetch: (c) => {
      const p = path(c);
      if (p.includes('/quote')) return { status: 200, body: envelope({ charge_cents: 450, price_cents_per_month: 1900, paid_through: '2026-11-01T00:00:00Z' }) };
      if (p === '/users/auth/me') return on.me ? on.me(c) : { status: 200, body: envelope({ id: uidOf(c) }) };
      if (c.method === 'POST') return on.post ? on.post(c, ++n) : { status: 202, body: envelope(UDONE()) };
      return { status: 404, body: {} };
    } });
    Object.assign(bounds, { read: 1000, post: 1000, op: 300, list: 300, slack: 10 });
    return s;
  }
  const stored = () => jsonLocal('hub_money_upgrade');

  it('GET :id/quote?action=upgrade&plan_id=, the identity check, then one POST :id/upgrade {plan_id, idempotency_key, max_charge_cents}', async () => {
    umoney({}, { selected: R1 });
    const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
    expect((await a.quote()).charge_cents).toBe(450);
    const r = await a.confirm(true);
    expect(r.ok).toBe(true);
    expect(calls.map((x) => `${x.method} ${path(x)} ${hostOf(x) === 'base' ? 'base' : 'realm'}`)).toEqual([
      'GET /subserver-subscriptions/x1/quote?action=upgrade&plan_id=v2 realm', 'GET /users/auth/me base', 'POST /subserver-subscriptions/x1/upgrade realm']);
    const body = posts()[0]!.body;
    expect(Object.keys(body).sort()).toEqual(['idempotency_key', 'max_charge_cents', 'plan_id']);
    expect(body).toMatchObject({ plan_id: 'v2', max_charge_cents: 450 });
    expect((r as { result: unknown }).result).toMatchObject({ replayed: false, failed: false });
    expect(a.snapshot()).toMatchObject({ phase: 'done', key: null });
  });
  // An upgrade's answer is an 'upgrade' to the plan sent.
  it.each([
    ['an operation of another kind', { ...UDONE(), operation: { ...UDONE().operation, kind: 'purchase' } }],
    ['an upgrade to another plan', { ...UDONE(), operation: { ...UDONE().operation, target_plan_id: 'v9' } }],
  ])('a 2xx with %s is outcome unknown: the upgrade stays held', async (_n, body) => {
    umoney({ post: () => ({ status: 202, body: envelope(body) }) });
    const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
    await a.quote();
    expect((await a.confirm(true)).reason).toBe('unknown');
    expect(a.snapshot().phase).toBe('unknown');
    expect(stored()).toHaveLength(1);
  });
  it('ids are path-encoded and the route table takes only these two shapes', () => {
    const declared = Object.values(commerceRoutes) as unknown as Array<{ method: string; path: string; query?: string[]; body?: string[] }>;
    expect(declared.find((r) => r.method === 'GET' && r.path === '/subserver-subscriptions/:id/quote' && (r.query || []).join() === 'action,plan_id')).toBeTruthy();
    expect(declared.find((r) => r.method === 'POST' && r.path === '/subserver-subscriptions/:id/upgrade')).toBeTruthy();
    expect(declared.find((r) => r.method === 'PUT' && r.path === '/subserver-subscriptions/:id/upgrade')).toBeUndefined();
    expect(declared.find((r) => r.method === 'POST' && r.path === '/subserver-subscriptions/:id/downgrade')).toBeUndefined();
  });
  it('a replay (the request already went through) is reported as one, never as a new charge', async () => {
    umoney({ post: () => ({ status: 202, body: envelope(UDONE(true)) }) });
    const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
    await a.quote();
    expect(((await a.confirm(true)) as { result: { replayed: boolean } }).result.replayed).toBe(true);
  });
  it('without the consent nothing is sent; a second Confirm while posting sends nothing more', async () => {
    let release!: (r: Reply) => void;
    umoney({ post: () => new Promise<Reply>((r) => { release = r; }) });
    const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
    await a.quote();
    expect((await a.confirm(false)).reason).toBe('consent');
    const p1 = a.confirm(true);
    await sleep(20);
    expect((await a.confirm(true)).reason).toBe('busy');
    release({ status: 202, body: envelope(UDONE()) });
    await p1;
    expect(posts().length).toBe(1);
  });

  describe('as the dialog\'s user only', () => {
    it('the Hub displays another user before Confirm: nothing is sent (accountChanged)', async () => {
      const s = umoney();
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      s.show(UB);
      expect((await a.confirm(true)).ok).toBe(false);
      expect(posts()).toEqual([]);
    });
    it('the session became another account: nothing is sent, the identity check refuses it', async () => {
      const s = umoney();
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      s.switchTo(UB);
      expect((await a.confirm(true)).ok).toBe(false);
      expect(posts()).toEqual([]);
    });
    it('/users/auth/me names someone else: nothing is sent (account)', async () => {
      umoney({ me: () => ({ status: 200, body: envelope({ id: UB }) }) });
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      expect(await a.confirm(true)).toEqual({ ok: false, reason: 'account', notSent: true });
      expect(posts()).toEqual([]);
    });
    it('no identity displayed at open: no quote, no POST', async () => {
      umoney({}, { identity: null });
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      expect(a.snapshot().phase).toBe('account');
      expect(await a.quote().catch((e: { code: string }) => e.code)).toBe('ACCOUNT_CHANGED');
      expect((await a.confirm(true)).ok).toBe(false);
      expect(calls).toEqual([]);
    });
  });

  describe('outcome unknown keeps the key; only refusals that prove nothing was charged settle it', () => {
    it('a 500 after the POST went out: unknown, the same key resent, the server answer settles it', async () => {
      umoney({ post: (_c, n) => (n === 1 ? typedErr(500, null) : { status: 202, body: envelope(UDONE(true)) }) });
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      const r = await a.confirm(true) as { reason: string; key: string };
      expect(r.reason).toBe('unknown');
      expect(a.snapshot()).toMatchObject({ phase: 'unknown', pending: true, key: r.key });
      expect((await a.confirm(true)).ok).toBe(true);
      expect(posts().map((c) => c.body.idempotency_key)).toEqual([r.key, r.key]);
      expect(posts().map((c) => c.body.max_charge_cents)).toEqual([450, 450]);
    });
    it('a stalled POST: unknown after the deadline, key kept', async () => {
      umoney({ post: (_c, n) => (n === 1 ? never() : { status: 202, body: envelope(UDONE()) }) });
      Object.assign(bounds, { op: 60 });
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      const r = await a.confirm(true) as { reason: string; key: string };
      expect(r.reason).toBe('unknown');
      expect((await a.confirm(true)).ok).toBe(true);
      expect(posts().map((c) => c.body.idempotency_key)).toEqual([r.key, r.key]);
    });
    const DEF = ['PLAN_NOT_AVAILABLE', 'PLAN_CHANGE_NOT_UPGRADE', 'SUBSERVER_DORMANT', 'SUBSCRIPTION_PERIOD_ENDED', 'HOST_UNAVAILABLE', 'NO_PAID_CAPACITY',
      'CHARGE_CONFIRMATION_REQUIRED', 'CHARGE_EXCEEDS_MAX', 'INSUFFICIENT_BALANCE'];
    it('409 IDEMPOTENCY_INTENT_MISMATCH is its own kind, held as unknown (the earlier operation may have charged)', async () => {
      umoney({ post: () => typedErr(409, 'IDEMPOTENCY_INTENT_MISMATCH') });
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      const r = await a.confirm(true) as { reason: string; kind?: string; key?: string; definitive?: boolean };
      expect(r).toMatchObject({ ok: false, reason: 'unknown', kind: 'intent' });
      expect(r.definitive).toBeUndefined();
      expect(a.snapshot()).toMatchObject({ phase: 'unknown', pending: true, key: r.key, error: { kind: 'intent', code: 'IDEMPOTENCY_INTENT_MISMATCH' } });
    });
    for (const code of DEF) {
      it(`409 ${code} is definitive: settled, the key dropped, the code kept for the words`, async () => {
        umoney({ post: () => typedErr(code === 'INSUFFICIENT_BALANCE' ? 402 : 409, code) });
        const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
        await a.quote();
        expect(await a.confirm(true)).toMatchObject({ ok: false, reason: 'refused', definitive: true });
        expect(a.snapshot()).toMatchObject({ phase: 'review', pending: false, key: null });
        expect(a.snapshot().error!.code).toBe(code);
      });
    }
    for (const [status, code] of [[503, 'HOST_UNAVAILABLE'], [500, 'PLAN_NOT_AVAILABLE'], [409, 'SOMETHING_NEW'], [400, 'VALIDATION_ERROR'], [401, 'PLAN_CHANGE_NOT_UPGRADE'], [403, 'SUBSERVER_DORMANT'], [429, 'PLAN_NOT_AVAILABLE'], [404, 'PLAN_NOT_AVAILABLE']] as const) {
      it(`${status} ${code} proves nothing: unknown, the key kept`, async () => {
        umoney({ post: () => typedErr(status, code) });
        const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
        await a.quote();
        const r = await a.confirm(true);
        expect((r as { definitive?: boolean }).definitive).toBeUndefined();
        expect(a.snapshot().key).not.toBeNull();
      });
    }
  });

  describe('the key is stored before the POST and survives the dialog', () => {
    const PLAN3 = { id: 'v3', family_id: 'f3f3f3f3f3f3f3f3f3f3f3f3' };
    it('a lost answer: the entry is stored before the POST, under its own key (never hub_money_pending)', async () => {
      let during: string | null = null;
      umoney({ post: () => { during = localStorage.getItem('hub_money_upgrade'); return typedErr(500, null); } });
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN, title: 'Pro' });
      await a.quote();
      const r = await a.confirm(true) as { reason: string; key: string };
      expect(r.reason).toBe('unknown');
      expect(JSON.parse(during as unknown as string)[0].key).toBe(r.key);
      expect(stored()).toEqual([expect.objectContaining({ kind: 'upgrade', user_id: UA, sub_id: 'x1', plan_id: 'v2', key: r.key, max_charge_cents: 450, title: 'Pro' })]);
      expect(localStorage.getItem('hub_money_pending')).toBeNull();
    });
    it('a new dialog (remount, reload) for the same subscription and plan resends the stored attempt unchanged', async () => {
      umoney({ post: (_c, n) => (n === 1 ? typedErr(500, null) : { status: 202, body: envelope(UDONE(true)) }) });
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      const r = await a.confirm(true) as { key: string };
      const b = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      expect(b.snapshot()).toMatchObject({ pending: true, key: r.key, ceiling: 450 });
      expect((await b.confirm(true)).ok).toBe(true);
      expect(posts().map((c) => [c.body.idempotency_key, c.body.plan_id, c.body.max_charge_cents])).toEqual([[r.key, 'v2', 450], [r.key, 'v2', 450]]);
      await sleep(30);
      expect(stored()).toEqual([]);
    });
    it('a new dialog for the same subscription but ANOTHER plan adopts nothing; its Confirm never sends the stored plan', async () => {
      umoney({ post: (_c, n) => (n === 1 ? typedErr(500, null) : { status: 202, body: envelope(UDONE(true)) }) });
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      const r = await a.confirm(true) as { key: string };
      const b = createAttempt('upgrade', { sub: SUB, plan: PLAN3 });
      expect(b.snapshot().pending).toBe(false);
      await b.quote();
      expect((await b.confirm(true)).reason).toBe('heldUpgrade');
      expect(posts().map((c) => [c.body.idempotency_key, c.body.plan_id])).toEqual([[r.key, 'v2']]);
      expect(stored()).toHaveLength(1);
    });
    it('another tab stored an attempt for this subscription and plan after the dialog opened: adopted, nothing sent', async () => {
      umoney();
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      localStorage.setItem('hub_money_upgrade', JSON.stringify([{ kind: 'upgrade', user_id: UA, sub_id: 'x1', plan_id: 'v2', key: 'k-other', max_charge_cents: 900, at: 1 }]));
      expect((await a.confirm(true)).reason).toBe('adopted');
      expect(posts()).toEqual([]);
      expect(a.snapshot()).toMatchObject({ pending: true, key: 'k-other', ceiling: 900 });
    });
    it('another tab stored an upgrade of this subscription to ANOTHER plan: nothing sent and nothing adopted, so no resend can buy that plan', async () => {
      umoney();
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      localStorage.setItem('hub_money_upgrade', JSON.stringify([{ kind: 'upgrade', user_id: UA, sub_id: 'x1', plan_id: 'v3', key: 'k-other', max_charge_cents: 900, at: 1 }]));
      expect((await a.confirm(true)).reason).toBe('heldUpgrade');
      expect(posts()).toEqual([]);
      expect(a.snapshot().pending).toBe(false);
      expect(a.snapshot().key).not.toBe('k-other');
      // A second Confirm still sends nothing and never the other plan's request.
      await a.confirm(true);
      expect(posts().filter((c) => c.body.plan_id === 'v3' || c.body.idempotency_key === 'k-other')).toEqual([]);
    });
    it('a retained upgrade is adopted by a new dialog only for the same subscription AND plan', async () => {
      umoney();
      localStorage.setItem('hub_money_upgrade', JSON.stringify([{ kind: 'upgrade', user_id: UA, sub_id: 'x1', plan_id: 'v3', key: 'k-other', max_charge_cents: 900, at: 1 }]));
      expect(createAttempt('upgrade', { sub: SUB, plan: UPLAN }).snapshot()).toMatchObject({ pending: false });
      expect(createAttempt('upgrade', { sub: SUB, plan: { id: 'v3', family_id: UPLAN.family_id } }).snapshot()).toMatchObject({ pending: true, key: 'k-other', ceiling: 900 });
    });
    it('charged but rolled back (operation failed) is an answer: the entry is dropped', async () => {
      const failed = { ...UDONE(), operation: { ...UDONE().operation, result: 'failed' } };
      umoney({ post: () => ({ status: 202, body: envelope(failed) }) });
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      expect(((await a.confirm(true)) as { result: { failed: boolean } }).result.failed).toBe(true);
      await sleep(30);
      expect(stored()).toEqual([]);
    });
    it('a definitive refusal drops the entry; the next attempt gets a new key', async () => {
      umoney({ post: (_c, n) => (n === 1 ? typedErr(409, 'CHARGE_EXCEEDS_MAX') : { status: 202, body: envelope(UDONE()) }) });
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      await a.confirm(true);
      const k1 = posts()[0]!.body.idempotency_key;
      await sleep(30);
      expect(stored()).toEqual([]);
      const b = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      expect(b.snapshot().pending).toBe(false);
      await b.quote();
      await b.confirm(true);
      expect(posts()[1]!.body.idempotency_key).not.toBe(k1);
    });
    it('another account never sees it: its dialog starts fresh and the stored entry stays', async () => {
      const s = umoney({ post: () => typedErr(500, null) });
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      const r = await a.confirm(true) as { key: string };
      s.switchTo(UB, '2');
      const { setIdentity } = await import('./ctx');
      setIdentity({ id: UB, banned: false });
      // the page identity is the first user's session, so a new dialog needs a fresh page for the other account
      const snap = Object.fromEntries(Object.entries(localStorage));
      delete snap.access_token; delete snap.refresh_token;
      umoney({ post: () => typedErr(500, null) }, { me: UB, local: snap });
      const b = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      expect(b.snapshot()).toMatchObject({ pending: false, key: null });
      expect(stored().map((e) => [e.user_id, e.key])).toEqual([[UA, r.key]]);
      expect(pendingUpgrade(UB, 'x1')).toBeNull();
      // Its own attempt is neither adopted from nor blocked by the first account's entry: both entries are kept.
      await b.quote();
      const rb = await b.confirm(true) as { reason: string; key: string };
      expect(rb.reason).toBe('unknown');
      expect(rb.key).not.toBe(r.key);
      expect(stored().map((e) => [e.user_id, e.key])).toEqual([[UA, r.key], [UB, rb.key]]);
      expect(pendingUpgrade(UA, 'x1')).toMatchObject({ key: r.key });
    });
    it('the classic Hub rewriting hub_money_pending (buys and payments only) leaves the upgrade entry alone', async () => {
      umoney({ post: () => typedErr(500, null) });
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      const r = await a.confirm(true) as { key: string };
      localStorage.setItem('hub_money_pending', '[]');
      expect(createAttempt('upgrade', { sub: SUB, plan: UPLAN }).snapshot()).toMatchObject({ pending: true, key: r.key });
      expect(pendingUpgrade(UA, 'x1')).toMatchObject({ key: r.key, plan_id: 'v2' });
    });
    it('storage that cannot keep the entry: nothing is sent (store)', async () => {
      umoney();
      const a = createAttempt('upgrade', { sub: SUB, plan: UPLAN });
      await a.quote();
      breakKey('setItem', 'hub_money_upgrade', 'throw');
      expect((await a.confirm(true)).reason).toBe('store');
      expect(posts()).toEqual([]);
    });
  });
});

// ── misc contract of commerce.ts not covered by an old test ─────────────────────────────────
describe('plan catalogue rules the money module relies on', () => {
  it('the safe plan index and the card views come from commerce-pure (not copied)', () => {
    expect(S.planIndex([{ id: 'p', family_id: 'f', text: { title: 'T' } }] as never)).toBeTruthy();
    expect(marketLatch.banned).toBe(false);
  });
  it('loadListing is part of commerce too (smoke): both rails read on base', async () => {
    const s = shop({ fetch: () => ({ status: 200, body: envelope([]) }) });
    const l = await loadListing(s.ctx());
    expect(l.stock).toEqual([]);
    expect(capture().account).toBe(UA);
  });
});
