// Every recovery path the billing page offers only reads, run through
// the REAL handlers on the REAL core. The page is mounted in the app's router (as renderPage does) on core/test/env's
// booted tab, with the live hooks (useCheckoutLive, useUnknownCheckoutsLive, useTopUpLive, ...). The entry points: the
// unknown band's Check again (it opens the drawer with check=true), the drawer opened with check=true (auto-run), the
// drawer's own Check again, the held view (HeldGone, drawn when the plan, subscription or listing is gone: runHeldCheck,
// auto-run and its button), the held top-up band's Check again (HeldTopUpSlot) and the Add funds drawer's (useFunds).
//
// ONE recording spy per test: every request is first appended to the test-owned `calls` as {method, route, key, body},
// THEN answered: a fixture reply for GET and HEAD, a thrown error for any other method. The throw never decides a case
// (core swallows it as a lost answer): every case asserts writesIn(calls) in the test body once the handler settled and
// its result rendered. Each hold is made by the real machines under the same spy (its POST thrown, so its answer is
// lost), and `calls` is emptied before the recovery phase. The resend (the one path that sends) is a separate test
// per kind: the ConfirmDialog opened, cancelled, reopened, confirmed, and only then exactly one write, answered once.
// eslint-disable-next-line no-restricted-imports -- a test harness mounting the billing page in the app's router, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness mounting the billing page in the app's router, not page code
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, commerce } from '@core';
import { pendingLockHeld } from '@core/commerce-pure';
import { capture } from '@core/ctx';
import { queryClient } from '@core/query';
import { accepted, envelope, offerRaw, path, reserve201, rows, stockRaw } from '@core/test/commerce-env';
import { boot, onFetch, settle, UID, type Call, type Reply } from '@core/test/env';
import { isOff } from '@app/testing';
// eslint-disable-next-line hub/page-boundaries -- mounts the billing page in the app's router (as renderPage does), on the real core
import { buildRouter } from '../../app/router';
import { resetUnknownCheckouts } from './data';
import page from './page';
import strings from './strings.en.json';

const leave = vi.hoisted(() => vi.fn());
vi.mock('./data', async (orig) => {
  const a: Record<string, unknown> = await orig();
  return {
    ...a,
    useCheckout: a.useCheckoutLive,
    useListing: a.useListingLive,
    useUnknownCheckouts: a.useUnknownCheckoutsLive,
    useTopUp: a.useTopUpLive,
    useTopUpHeld: a.useTopUpHeldLive,
    usePaymentReturn: a.usePaymentReturnLive,
    leaveTo: (u: string) => leave(u),
  };
});

const T = 90_000;
const WAIT = { timeout: 30_000 };

// ── the recording spy ──────────────────────────────────────────────────────────────────────────────
interface Sent { method: string; route: string; key: string | undefined; body: unknown }
/** Every request of the test, in order, recorded BEFORE it is answered. */
const calls: Sent[] = [];
/** The writes in a record: anything but GET and HEAD. */
const writesIn = (cs: readonly Sent[]): Sent[] => cs.filter((c) => c.method !== 'GET' && c.method !== 'HEAD');
const getsIn = (cs: readonly Sent[]): string[] => cs.filter((c) => c.method === 'GET').map((c) => c.route);
/** Set only by a resend test, right before its Confirm: the one write it lets through, answered with this outcome. */
let answerOneWrite: ((c: Call) => Reply) | null = null;

const FAM = 'f00df00df00df00df00df00d';
const FAM2 = 'f2f2f2f2f2f2f2f2f2f2f2f2';
const PLUS = { id: 'v1', family_id: FAM, price_cents_per_month: 900, hold_days: 7, text: { title: 'Plus' } };
const PRO = { id: 'v2', family_id: FAM2, price_cents_per_month: 1900, hold_days: 7, text: { title: 'Pro' } };
const SUBID = '6500000000000000000000a1';
const subRow = (o: Record<string, unknown> = {}) => ({
  id: SUBID, state: 'active', plan_id: 'v1', plan: { family_id: FAM, title: 'Plus' }, server_name: 'srv-one',
  paid_through: '2026-12-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', auto_renew: false, ...o,
});

/** What the GETs answer (each test shapes it after its hold is made). */
interface World {
  plans: unknown[];
  subs: unknown[];
  byId: Record<string, unknown>;
  offers: unknown[];
  stock: unknown[];
  reservations: unknown[];
  rentals: unknown[];
  avail: unknown;
  balances: unknown;
  /** route → the reply that replaces its fixture (a failing read). */
  fail: Record<string, Reply>;
}
let W: World;
const world = (): World => ({
  plans: [PLUS, PRO], subs: [subRow()], byId: { [SUBID]: subRow() }, offers: [offerRaw()], stock: [stockRaw()], reservations: [], rentals: [],
  avail: { card: { enabled: true, min_usd: 5, max_usd: 5000 }, crypto: { enabled: true, min_usd: 5, max_usd: 5000 } },
  balances: { general_balance: '100.00', referral_credit: '0.00', referral_credit_owed: '0.00' }, fail: {},
});
const ok = (data: unknown, total?: number): Reply => ({ status: 200, body: envelope(data, total) });
const fail500: Reply = { status: 500, body: { error: 'X' } };
const netFail: Reply = { status: 0, network: true };

function fixture(route: string): Reply {
  const f = W.fail[route];
  if (f) return f;
  if (route === '/users/auth/me') return ok({ id: UID });
  if (route === '/subserver-plans' || route === '/meta/subserver-plans') return ok({ requested_locale: 'en', plans: W.plans });
  if (route === '/subserver-subscriptions') return ok(W.subs, W.subs.length);
  if (route === '/subserver-subscriptions/quote' || route.endsWith('/quote')) return ok({ charge_cents: 900, price_cents_per_month: 900, paid_through: '2026-12-01T00:00:00Z' });
  const by = /^\/subserver-subscriptions\/([^/]+)$/.exec(route);
  if (by) return W.byId[by[1] as string] ? ok(W.byId[by[1] as string]) : { status: 404, body: { error: 'NOT_FOUND' } };
  if (route === '/wallet/balances') return ok(W.balances);
  if (route === '/wallet/payment-availability') return ok(W.avail);
  if (route === '/offers') return ok(W.offers, W.offers.length);
  if (route === '/servers/available') return ok(W.stock, W.stock.length);
  if (route === '/reservations') return ok(W.reservations, W.reservations.length);
  if (route === '/rentals') return ok(W.rentals);
  return { status: 404, body: { error: 'unmocked' } };
}

function spy(c: Call): Reply {
  const route = path(c).split('?')[0] as string;
  const body = c.body as Record<string, unknown> | null;
  calls.push({ method: c.method, route, key: body && typeof body.idempotency_key === 'string' ? body.idempotency_key : undefined, body });
  if (c.method === 'GET' || c.method === 'HEAD') return fixture(route);
  if (answerOneWrite) {
    const a = answerOneWrite;
    answerOneWrite = null;
    return a(c);
  }
  throw new Error(`recovery: ${c.method} ${route} sent`);
}

// ── core's stores (what "the hold is kept" means) ──────────────────────────────────────────────────
type Kind = 'buy' | 'pay' | 'upgrade' | 'rent' | 'reserve';
const STORE: Record<Kind | 'topup', string> = {
  buy: 'hub_money_pending', pay: 'hub_money_pending', upgrade: 'hub_money_upgrade', reserve: 'hub_market_pending', rent: 'hub.v3.rent_pending',
  topup: 'hub.v3.topup_pending',
};
const stored = (k: Kind | 'topup'): Array<Record<string, unknown>> => {
  // eslint-disable-next-line no-restricted-globals -- the test reads the record core keeps the hold in
  const list = JSON.parse(localStorage.getItem(STORE[k]) || '[]') as Array<Record<string, unknown>>;
  return k === 'buy' || k === 'pay' ? list.filter((e) => e.kind === k) : list;
};
/** The hold's identity in its store: the kept key (a rent has none: its server). */
const heldIds = (k: Kind | 'topup'): unknown[] => stored(k).map((e) => (k === 'rent' ? e.server_id : e.key));

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await settle();
};

/** The hold the real machine leaves when its POST's answer is lost (the spy threw). Returns that lost request;
 *  `calls` is emptied for the recovery phase. */
async function keep(kind: Kind): Promise<Sent> {
  if (kind === 'buy' || kind === 'pay' || kind === 'upgrade') {
    const a = commerce.createAttempt(
      kind,
      kind === 'buy' ? { plan: PLUS, title: 'Plus' } : kind === 'pay' ? { sub: { id: SUBID }, title: 'Plus' } : { sub: { id: SUBID }, plan: { id: PRO.id, family_id: FAM2 }, title: 'Pro' },
    );
    await a.quote();
    expect(await a.confirm(true)).toMatchObject({ ok: false, reason: 'unknown' });
    a.dispose();
    await waitFor(() => expect(stored(kind)).toEqual([expect.objectContaining({ phase: 'held' })]), WAIT);
  } else {
    const p = commerce.createPurchase(kind === 'rent' ? rows().stock : rows().offer, kind === 'rent' ? '1' : '7');
    expect(p.confirm(true)).toEqual({ ok: true });
    await waitFor(() => expect(['indeterminate', 'not-found']).toContain(p.snapshot().state), WAIT);
    p.dispose();
    await waitFor(() => expect(stored(kind)).toHaveLength(1), WAIT);
  }
  const lost = writesIn(calls);
  expect(lost.length).toBeGreaterThanOrEqual(1);
  calls.length = 0;
  return lost[lost.length - 1] as Sent;
}

async function keepTopUp(method: 'card' | 'crypto'): Promise<Sent> {
  const t = commerce.createTopUp();
  await t.load();
  expect(t.select(method)).toBe(true);
  expect(await t.submit('20')).toMatchObject({ ok: false, reason: 'pending' });
  t.dispose();
  await waitFor(() => expect(stored('topup')).toHaveLength(1), WAIT);
  const lost = writesIn(calls);
  expect(lost).toHaveLength(1);
  calls.length = 0;
  return lost[0] as Sent;
}

/** The billing page in the app's router, on the booted core. */
async function open(at: string): Promise<void> {
  const history = createMemoryHistory({ initialEntries: [at] });
  const router = buildRouter([page], { queryClient, shell: false, history });
  await act(async () => {
    render(createElement(QueryClientProvider, { client: queryClient }, createElement(RouterProvider, { router })));
    await router.load();
  });
  await act(flush);
}

beforeEach(() => {
  commerce.resetCommerce();
  boot();
  queryClient.clear();
  resetUnknownCheckouts();
  calls.length = 0;
  answerOneWrite = null;
  leave.mockReset();
  W = world();
  onFetch(spy);
  // The rent's own read-back retries at once (the old suites' `fast`, without shortening any send's budget).
  Object.assign(commerce.budgets, { readRetryMs: 5 });
});
afterEach(() => {
  commerce.resetCommerce();
});

// ── per kind ──────────────────────────────────────────────────────────────────────────────────────
const AT: Record<Kind, string> = {
  buy: 'checkout=buy&plan=v1',
  pay: `checkout=pay&sub=${SUBID}`,
  upgrade: `checkout=upgrade&sub=${SUBID}&plan=v2`,
  reserve: 'checkout=reserve&item=o1&days=7',
  rent: 'checkout=rent&item=s1&days=1',
};
/** The GET each kind's Check again reads (the drawer's reserve check is the machine's Refresh). */
const READ: Record<Kind, string> = {
  buy: '/subserver-subscriptions',
  pay: `/subserver-subscriptions/${SUBID}`,
  upgrade: `/subserver-subscriptions/${SUBID}`,
  reserve: '/reservations',
  rent: '/rentals',
};
/** The drawer's "may have gone through" words for the kind. */
const UNKNOWN_WORDS: Record<Kind, string> = {
  buy: strings['co.unknownBody'],
  pay: strings['co.unknownBody'],
  upgrade: strings['co.unknownBody'],
  reserve: strings['mkt.indeterminateReserve'],
  rent: strings['mkt.indeterminateRent'],
};
/** The world in which the plan, subscription or listing is gone (the held view draws). */
function gone(kind: Kind): void {
  if (kind === 'buy') W.plans = [PRO];
  if (kind === 'pay' || kind === 'upgrade') {
    W.subs = [];
    W.byId = {};
  }
  if (kind === 'reserve') W.offers = [];
  if (kind === 'rent') W.stock = [];
}
/** What a read can find while the key is kept: evidence only, for every kind (no read is proof).
 *  The upgrade's target plan with no operation running, and an active rental of the rented server. */
function evidence(kind: Kind): void {
  if (kind === 'buy') W.subs = [subRow(), subRow({ id: '6500000000000000000000b2', created_at: new Date(Date.now() + 60_000).toISOString() })];
  if (kind === 'upgrade') W.byId = { [SUBID]: subRow({ plan_id: 'v2', plan: { family_id: FAM2, title: 'Pro' }, active_operation_id: null }) };
  if (kind === 'reserve') W.reservations = [{ id: 'rv1', offer_id: 'o1', days: 7, state: 'pending', created_at: new Date(Date.now() + 60_000).toISOString() }];
  if (kind === 'rent') W.rentals = [{ id: 'r1', status: 'active', server_id: 's1' }];
}
const EVIDENCE: Partial<Record<Kind, RegExp>> = {
  buy: /A Plus server was created at .*It may be this purchase\./,
  pay: /The paid period now ends .*It may be this payment\./,
  upgrade: new RegExp(strings['co.checkPlanReached'].replace(/\./g, '\\.')),
  rent: new RegExp(strings['co.checkRented'].replace(/\./g, '\\.')),
};

const dialog = (): Promise<HTMLElement> => screen.findByRole('dialog', {}, WAIT);
const phase = (): string | null => document.querySelector('[data-phase]')?.getAttribute('data-phase') ?? null;
const unknownBand = (): HTMLElement | null => document.querySelector('[data-band="unknown"]');
const checkIn = (el: HTMLElement): HTMLElement => within(el).getByRole('button', { name: /^check again$/i });

/** A drawer check settled on unknown: the hold, its key, the drawer's words and the page's band all stay. */
async function stillUnknown(kind: Kind, ids: unknown[]): Promise<void> {
  const d = await dialog();
  await waitFor(() => {
    expect(phase()).toBe('unknown');
    // The banner's result line: with a matching reservation it also names that match, after this sentence.
    expect(d.querySelector('[data-outcome-result]')?.textContent).toContain(strings['co.stillUnknown']);
  }, WAIT);
  await act(flush);
  expect(within(d).getByText(UNKNOWN_WORDS[kind])).toBeInTheDocument();
  expect(heldIds(kind)).toEqual(ids);
  expect(unknownBand()?.textContent).toContain(strings['band.unknownBody']);
}
/** A held-view check settled on unknown: "may have gone through", the hold kept. */
async function heldStillUnknown(kind: Kind, ids: unknown[]): Promise<HTMLElement> {
  const d = await dialog();
  await within(d).findByText(strings['mkt.goneStillBody'], {}, WAIT);
  await act(flush);
  expect(heldIds(kind)).toEqual(ids);
  return d;
}

const KINDS: readonly Kind[] = ['buy', 'pay', 'upgrade', 'reserve', 'rent'];

describe.each(KINDS)('%s: every Check again only reads', (kind) => {
  const idOf = (lost: Sent): unknown => (kind === 'rent' ? 's1' : lost.key);

  it('key kept, the band\'s Check again (opens the drawer with check=true): reads only, the hold stays', async () => {
    const lost = await keep(kind);
    evidence(kind);
    await open('/billing');
    const band = await waitFor(() => {
      const b = unknownBand();
      expect(b).not.toBeNull();
      return b as HTMLElement;
    }, WAIT);
    await userEvent.click(checkIn(band));
    await stillUnknown(kind, [idOf(lost)]);
    expect(writesIn(calls)).toEqual([]);
    expect(getsIn(calls)).toContain(READ[kind]);
    if (EVIDENCE[kind]) expect((await dialog()).textContent).toMatch(EVIDENCE[kind] as RegExp);
  }, T);

  it('key kept, the drawer opened with check=true (auto-run): reads only, the hold stays', async () => {
    const lost = await keep(kind);
    evidence(kind);
    await open(`/billing?${AT[kind]}&check=true`);
    await stillUnknown(kind, [idOf(lost)]);
    expect(writesIn(calls)).toEqual([]);
    expect(getsIn(calls)).toContain(READ[kind]);
    if (kind === 'reserve') expect((await dialog()).textContent).toMatch(/looks like this one/);
  }, T);

  it('key kept, the drawer\'s own Check again: reads only, the hold stays', async () => {
    const lost = await keep(kind);
    evidence(kind);
    await open(`/billing?${AT[kind]}`);
    const d = await dialog();
    await waitFor(() => expect(phase()).toBe('unknown'), WAIT);
    await act(flush);
    const mark = calls.length;
    await userEvent.click(checkIn(d));
    await stillUnknown(kind, [idOf(lost)]);
    expect(writesIn(calls)).toEqual([]);
    expect(getsIn(calls.slice(mark))).toContain(READ[kind]);
    if (EVIDENCE[kind]) expect(d.textContent).toMatch(EVIDENCE[kind] as RegExp);
  }, T);

  it('key kept, the read failing (500): the drawer\'s Check again (auto-run and button) reads only, the hold stays', async () => {
    const lost = await keep(kind);
    W.fail[READ[kind]] = fail500;
    await open(`/billing?${AT[kind]}&check=true`);
    await stillUnknown(kind, [idOf(lost)]);
    expect(writesIn(calls)).toEqual([]);
    const d = await dialog();
    const mark = calls.length;
    await userEvent.click(checkIn(d));
    await waitFor(() => expect(getsIn(calls.slice(mark))).toContain(READ[kind]), WAIT);
    await stillUnknown(kind, [idOf(lost)]);
    expect(writesIn(calls)).toEqual([]);
  }, T);

  it('the plan, subscription or listing gone: the held view auto-runs (check=true) a read only, the hold stays', async () => {
    const lost = await keep(kind);
    gone(kind);
    if (kind === 'buy' || kind === 'reserve' || kind === 'rent') evidence(kind);
    await open(`/billing?${AT[kind]}&check=true`);
    const d = await heldStillUnknown(kind, [idOf(lost)]);
    expect(writesIn(calls)).toEqual([]);
    expect(getsIn(calls)).toContain(READ[kind]);
    if (kind === 'buy') expect(d.textContent).toMatch(EVIDENCE.buy as RegExp);
    if (kind === 'reserve') expect(d.textContent).toMatch(/A reservation of this offer was made at .*It may be this one\./);
    if (kind === 'rent') expect(d.textContent).toMatch(EVIDENCE.rent as RegExp);
  }, T);

  it('the plan, subscription or listing gone: the held view\'s Check again button reads only, the hold stays', async () => {
    const lost = await keep(kind);
    gone(kind);
    await open(`/billing?${AT[kind]}`);
    const d = await dialog();
    await within(d).findByText(kind === 'rent' || kind === 'reserve' ? strings['mkt.goneHeldBody'] : strings['held.unknownBody'], {}, WAIT);
    await act(flush);
    const mark = calls.length;
    await userEvent.click(checkIn(d));
    await heldStillUnknown(kind, [idOf(lost)]);
    expect(writesIn(calls)).toEqual([]);
    expect(getsIn(calls.slice(mark))).toContain(READ[kind]);
  }, T);

  it('gone, and the read failing (network): the held view reads only, the hold stays', async () => {
    const lost = await keep(kind);
    gone(kind);
    W.fail[READ[kind]] = netFail;
    await open(`/billing?${AT[kind]}&check=true`);
    await heldStillUnknown(kind, [idOf(lost)]);
    expect(writesIn(calls)).toEqual([]);
    expect(getsIn(calls)).toContain(READ[kind]);
    const d = await dialog();
    const mark = calls.length;
    await userEvent.click(checkIn(d));
    await waitFor(() => expect(getsIn(calls.slice(mark))).toContain(READ[kind]), WAIT);
    await heldStillUnknown(kind, [idOf(lost)]);
    expect(writesIn(calls)).toEqual([]);
  }, T);
});

describe('upgrade: no read settles it', () => {
  it('the target plan reached, no operation (another client may have made it): still unknown, the evidence shown, the key kept, nothing sent', async () => {
    const lost = await keep('upgrade');
    evidence('upgrade');
    await open(`/billing?${AT.upgrade}&check=true`);
    await stillUnknown('upgrade', [lost.key]);
    expect((await dialog()).textContent).toMatch(EVIDENCE.upgrade as RegExp);
    expect(writesIn(calls)).toEqual([]);
    expect(getsIn(calls)).toContain(READ.upgrade);
  }, T);

  it('the target plan, the operation field missing: unknown without evidence, the key kept', async () => {
    const lost = await keep('upgrade');
    W.byId = { [SUBID]: subRow({ plan_id: 'v2', plan: { family_id: FAM2, title: 'Pro' } }) };
    await open(`/billing?${AT.upgrade}&check=true`);
    await stillUnknown('upgrade', [lost.key]);
    expect((await dialog()).textContent).not.toMatch(EVIDENCE.upgrade as RegExp);
    expect(writesIn(calls)).toEqual([]);
  }, T);

  it('an operation running: unknown with "running", the key kept, nothing sent', async () => {
    const lost = await keep('upgrade');
    W.byId = { [SUBID]: subRow({ plan_id: 'v2', active_operation_id: 'op9' }) };
    await open(`/billing?${AT.upgrade}&check=true`);
    await stillUnknown('upgrade', [lost.key]);
    expect((await dialog()).textContent).toContain(strings['co.checkRunning']);
    expect(writesIn(calls)).toEqual([]);
  }, T);
});

// ── the held top-up ──────────────────────────────────────────────────────────────────────────────
const topBand = (): HTMLElement | null => document.querySelector('[data-band="topup-unknown"]');
describe.each([
  ['the record kept, providers listed', (): void => undefined],
  ['the providers gone (both disabled)', (): void => { W.avail = { card: { enabled: false }, crypto: { enabled: false } }; }],
  ['the reads failing (availability and balance 500)', (): void => { W.fail['/wallet/payment-availability'] = fail500; W.fail['/wallet/balances'] = fail500; }],
] as const)('top-up, %s: Check again only reads', (_name, shape) => {
  it('the held top-up band\'s Check again (HeldTopUpSlot): no write, the record and its words stay', async () => {
    const lost = await keepTopUp('card');
    shape();
    // The balance is shown on the Wallet & usage view (the held top-up band shows on every view).
    await open('/billing?view=wallet');
    const band = await waitFor(() => {
      const b = topBand();
      expect(b).not.toBeNull();
      return b as HTMLElement;
    }, WAIT);
    await waitFor(() => expect(isOff(checkIn(band))).toBe(false), WAIT);
    const mark = calls.length;
    const refreshes = !W.fail['/wallet/balances'];
    if (refreshes) W.balances = { general_balance: '123.45', referral_credit: '0.00', referral_credit_owed: '0.00' };
    await userEvent.click(checkIn(band));
    await waitFor(() => {
      expect(getsIn(calls.slice(mark))).toContain('/wallet/balances');
      expect(topBand()?.textContent).toContain(strings['top.unknown']);
    }, WAIT);
    await act(flush);
    expect(writesIn(calls)).toEqual([]);
    expect(heldIds('topup')).toEqual([lost.key]);
    expect(topBand()?.textContent).toContain('A $20.00 top-up may have gone through.');
    expect(leave).not.toHaveBeenCalled();
    // The balance GET is kept only because the shown balance really refreshes.
    if (refreshes) await waitFor(() => expect(document.body.textContent).toContain('$123.45'), WAIT);
  }, T);

  it('the Add funds drawer\'s Check again (useFunds): no write, the record stays', async () => {
    const lost = await keepTopUp('card');
    shape();
    await open('/billing?sheet=funds');
    const d = await dialog();
    const btn = await waitFor(() => {
      const b = checkIn(d);
      expect(isOff(b)).toBe(false);
      return b;
    }, WAIT);
    const mark = calls.length;
    await userEvent.click(btn);
    await waitFor(() => {
      expect(getsIn(calls.slice(mark))).toContain('/wallet/balances');
      expect(isOff(checkIn(d))).toBe(false);
    }, WAIT);
    await act(flush);
    expect(writesIn(calls)).toEqual([]);
    expect(heldIds('topup')).toEqual([lost.key]);
    expect(d.textContent).toContain(strings['top.unknownTitle']);
    expect(leave).not.toHaveBeenCalled();
  }, T);
});

// ── the deliberate resend: one write, only after its ConfirmDialog's confirm ─────────────────────
const fmt = (c: number): string => `$${(c / 100).toFixed(2)}`;
/** Opens the resend's dialog in `scope`: nothing sent; Cancel: nothing sent; reopens and confirms with `answer` as the
 *  one write's outcome. */
async function resendThrough(scope: HTMLElement, restates: string, answer: (c: Call) => Reply): Promise<void> {
  const press = () => userEvent.click(within(scope).getByRole('button', { name: strings['co.resend'] }));
  await waitFor(() => expect(isOff(within(scope).getByRole('button', { name: strings['co.resend'] }))).toBe(false), WAIT);
  await press();
  const ask = await screen.findByRole('alertdialog', { name: strings['co.resendTitle'] }, WAIT);
  expect(ask.textContent).toContain(restates);
  await act(flush);
  expect(writesIn(calls)).toEqual([]);
  await userEvent.click(within(ask).getByRole('button', { name: strings['action.cancel'] }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), WAIT);
  await act(flush);
  expect(writesIn(calls)).toEqual([]);
  await press();
  const again = await screen.findByRole('alertdialog', { name: strings['co.resendTitle'] }, WAIT);
  answerOneWrite = answer;
  await userEvent.click(within(again).getByRole('button', { name: strings['co.resendConfirm'] }));
}

const RESEND_ROUTE: Record<Exclude<Kind, 'rent'>, string> = {
  buy: '/subserver-subscriptions',
  pay: `/subserver-subscriptions/${SUBID}/pay`,
  upgrade: `/subserver-subscriptions/${SUBID}/upgrade`,
  reserve: '/offers/o1/reserve',
};
// The route's own answer to the request resent (accepted(): the operation of that action and plan).
const RESEND_ANSWER: Record<Exclude<Kind, 'rent'>, (c: Call) => Reply> = {
  buy: (c) => ({ status: 201, body: envelope(accepted(c, { buySub: '6500000000000000000000c3' })) }),
  pay: (c) => ({ status: 201, body: envelope(accepted(c, { state: 'active' })) }),
  upgrade: (c) => ({ status: 202, body: envelope(accepted(c, { state: 'active', replayed: true })) }),
  reserve: () => ({ status: 201, body: reserve201(true) }),
};

describe.each(['buy', 'pay', 'upgrade', 'reserve'] as const)('%s resend: one write, only after the confirm', (kind) => {
  const expectOneResend = async (lost: Sent) => {
    await waitFor(() => expect(stored(kind)).toEqual([]), WAIT);
    await act(flush);
    expect(lost.route).toBe(RESEND_ROUTE[kind]);
    expect(writesIn(calls)).toEqual([{ method: 'POST', route: RESEND_ROUTE[kind], key: lost.key, body: lost.body }]);
  };
  const ceiling = (lost: Sent) => fmt((lost.body as { max_charge_cents: number }).max_charge_cents);

  it('from the drawer (key kept): the kept method, route, key and body, once', async () => {
    const lost = await keep(kind);
    await open(`/billing?${AT[kind]}`);
    const d = await dialog();
    await waitFor(() => expect(phase()).toBe('unknown'), WAIT);
    await resendThrough(d, ceiling(lost), RESEND_ANSWER[kind]);
    await expectOneResend(lost);
  }, T);

  it('from the held view (plan, subscription or listing gone): the kept request, once', async () => {
    const lost = await keep(kind);
    gone(kind);
    await open(`/billing?${AT[kind]}`);
    const d = await dialog();
    await within(d).findByText(kind === 'reserve' ? strings['mkt.goneHeldBody'] : strings['held.unknownBody'], {}, WAIT);
    // A reservation's amount is its kept MarketPending.ceiling, the same number as the body's max.
    await resendThrough(d, ceiling(lost), RESEND_ANSWER[kind]);
    await expectOneResend(lost);
  }, T);
});

// A 409 on the resend of a kept request can be the state its first send made (the plan already
// changed, the period already paid): the hold, its key and its words stay; nothing reads it as gone.
const RESEND_409: Record<'buy' | 'pay' | 'upgrade', string> = { buy: 'PLAN_NOT_AVAILABLE', pay: 'SUBSCRIPTION_NOT_PAYABLE', upgrade: 'PLAN_CHANGE_NOT_UPGRADE' };
describe.each(['buy', 'pay', 'upgrade'] as const)('%s resend answered 409: still unknown, the hold kept', (kind) => {
  it('from the held view: one write under the kept key, then the kept record stays', async () => {
    const lost = await keep(kind);
    gone(kind);
    await open(`/billing?${AT[kind]}`);
    const d = await dialog();
    await within(d).findByText(strings['held.unknownBody'], {}, WAIT);
    await resendThrough(d, fmt((lost.body as { max_charge_cents: number }).max_charge_cents), () => ({ status: 409, body: { error: RESEND_409[kind] } }));
    await waitFor(() => expect(writesIn(calls)).toHaveLength(1), WAIT);
    await act(flush);
    expect(writesIn(calls)).toEqual([{ method: 'POST', route: RESEND_ROUTE[kind], key: lost.key, body: lost.body }]);
    expect(stored(kind).map((e) => (e as { key?: unknown }).key)).toEqual([lost.key]);
    // Still the held, unconfirmed view (its after-a-try wording), never a settled one.
    expect(within(d).getByText(strings['held.unknownTitle'])).toBeInTheDocument();
    expect(within(d).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
  }, T);
});

// The confirm re-reads the kept record; one removed or replaced while the dialog is open sends nothing,
// and never becomes a fresh purchase under a new key.
/** Rewrites (or empties) the kept record of `kind` in its store, as another tab settling or replacing it would. */
function mutateKept(kind: Exclude<Kind, 'rent'>, how: 'vanish' | 'replace'): void {
  const key = STORE[kind];
  // eslint-disable-next-line no-restricted-globals -- the test plays another tab rewriting core's store
  const all = JSON.parse(localStorage.getItem(key) || '[]') as Array<Record<string, unknown>>;
  const mine = (e: Record<string, unknown>) => (kind === 'buy' || kind === 'pay' ? e.kind === kind : true);
  const next = how === 'vanish' ? all.filter((e) => !mine(e)) : all.map((e) => (mine(e) ? { ...e, key: 'replaced-key-000000000000001' } : e));
  // eslint-disable-next-line no-restricted-globals -- the test plays another tab rewriting core's store
  localStorage.setItem(key, JSON.stringify(next));
  window.dispatchEvent(new StorageEvent('storage', { key }));
}
async function confirmAfter(scope: HTMLElement, change: () => void): Promise<void> {
  const btn = await waitFor(() => {
    const b = within(scope).getByRole('button', { name: strings['co.resend'] });
    expect(isOff(b)).toBe(false);
    return b;
  }, WAIT);
  await userEvent.click(btn);
  const ask = await screen.findByRole('alertdialog', { name: strings['co.resendTitle'] }, WAIT);
  change();
  await act(flush);
  await userEvent.click(within(ask).getByRole('button', { name: strings['co.resendConfirm'] }));
  for (let i = 0; i < 3; i++) await act(flush);
}
describe.each([
  ['buy', 'vanish'], ['buy', 'replace'], ['upgrade', 'replace'], ['reserve', 'vanish'], ['reserve', 'replace'],
] as const)('%s resend, the kept record %s while the dialog is open', (kind, how) => {
  it('from the drawer: nothing sent', async () => {
    await keep(kind);
    await open(`/billing?${AT[kind]}`);
    const d = await dialog();
    await waitFor(() => expect(phase()).toBe('unknown'), WAIT);
    await confirmAfter(d, () => mutateKept(kind, how));
    expect(writesIn(calls)).toEqual([]);
  }, T);

  it('from the held view (plan, subscription or listing gone): nothing sent', async () => {
    await keep(kind);
    gone(kind);
    await open(`/billing?${AT[kind]}`);
    const d = await dialog();
    await within(d).findByText(kind === 'reserve' ? strings['mkt.goneHeldBody'] : strings['held.unknownBody'], {}, WAIT);
    await confirmAfter(d, () => mutateKept(kind, how));
    expect(writesIn(calls)).toEqual([]);
  }, T);
});

describe('top-up resend: one write to the kept provider route, only after the confirm', () => {
  const ROUTE = { card: commerce.commerceRoutes.checkoutRoute.path, crypto: commerce.commerceRoutes.invoiceRoute.path };
  const URL_OF = { card: 'https://checkout.stripe.com/c/pay/cs_g14', crypto: 'https://nowpayments.io/payment/?iid=14' };
  const answer = (m: 'card' | 'crypto'): Reply =>
    ({ status: 201, body: { data: m === 'card' ? { intent: {}, checkout_url: URL_OF.card } : { invoice_url: URL_OF.crypto } } });

  it('the route table names the full provider paths', () => {
    expect(commerce.commerceRoutes.checkoutRoute.path).toBe('/wallet/payments/card/checkout');
    expect(commerce.commerceRoutes.invoiceRoute.path).toBe('/wallet/payments/crypto/invoice');
  });

  for (const method of ['card', 'crypto'] as const) {
    it(`from the held top-up band, ${method}: POST ${method === 'card' ? 'checkout' : 'invoice'} with the kept key and body, once`, async () => {
      const lost = await keepTopUp(method);
      await open('/billing');
      const band = await waitFor(() => {
        const b = topBand();
        expect(b).not.toBeNull();
        return b as HTMLElement;
      }, WAIT);
      await resendThrough(band, '$20.00', () => answer(method));
      await waitFor(() => expect(leave).toHaveBeenCalledWith(URL_OF[method]), WAIT);
      await act(flush);
      expect(lost).toEqual({ method: 'POST', route: ROUTE[method], key: lost.key, body: { amount: '20.00', idempotency_key: lost.key } });
      expect(writesIn(calls)).toEqual([{ method: 'POST', route: ROUTE[method], key: lost.key, body: lost.body }]);
    }, T);
  }

  it('from the Add funds drawer, card: the kept request, once', async () => {
    const lost = await keepTopUp('card');
    await open('/billing?sheet=funds');
    const d = await dialog();
    await resendThrough(d, '$20.00', () => answer('card'));
    await waitFor(() => expect(leave).toHaveBeenCalledWith(URL_OF.card), WAIT);
    await act(flush);
    expect(writesIn(calls)).toEqual([{ method: 'POST', route: ROUTE.card, key: lost.key, body: lost.body }]);
  }, T);
});

describe('rent: no resend (a rent never had a key to replay)', () => {
  it('no resend control in the drawer (key kept) nor in the held view (listing gone)', async () => {
    await keep('rent');
    await open(`/billing?${AT.rent}`);
    const d = await dialog();
    await waitFor(() => expect(phase()).toBe('unknown'), WAIT);
    await act(flush);
    expect(within(d).queryByRole('button', { name: strings['co.resend'] })).toBeNull();
    expect(writesIn(calls)).toEqual([]);
  }, T);

  it('no resend control in the held view (listing gone)', async () => {
    await keep('rent');
    gone('rent');
    await open(`/billing?${AT.rent}`);
    const d = await dialog();
    await within(d).findByText(strings['mkt.goneHeldBody'], {}, WAIT);
    await act(flush);
    expect(within(d).queryByRole('button', { name: strings['co.resend'] })).toBeNull();
    expect(writesIn(calls)).toEqual([]);
  }, T);
});

// ── the regression: a caught write cannot escape the check ───────────────────────────────────────
// A test-local fake in the shape of a recovery handler (NOT production code): it reads what the kind's Check again
// reads, then tries the kind's write and swallows its failure, and keeps the hold. To its caller it looks fine.
const R = commerce.commerceRoutes;
const FAKE: Record<Kind | 'topup', { read: unknown; readIn: Record<string, unknown>; write: unknown; writeIn: Record<string, unknown> }> = {
  buy: { read: R.subsListRoute, readIn: {}, write: R.buyRoute, writeIn: {} },
  pay: { read: R.subRoute, readIn: { params: { id: SUBID } }, write: R.payRoute, writeIn: { params: { id: SUBID } } },
  upgrade: { read: R.subRoute, readIn: { params: { id: SUBID } }, write: R.upgradeRoute, writeIn: { params: { id: SUBID } } },
  reserve: { read: R.reservationsRoute, readIn: {}, write: R.reserveRoute, writeIn: { params: { id: 'o1' } } },
  rent: { read: R.rentalsRoute, readIn: {}, write: R.rentRoute, writeIn: { params: { id: 's1' } } },
  topup: { read: R.balancesRoute, readIn: {}, write: R.checkoutRoute, writeIn: {} },
};
async function fakeCaughtCheck(kind: Kind | 'topup', lost: Sent): Promise<{ check: 'unknown' }> {
  const f = FAKE[kind];
  const ctx = capture();
  const call = api as unknown as (route: unknown, input: Record<string, unknown>) => Promise<unknown>;
  await call(f.read, { ctx, ...f.readIn });
  try {
    await call(f.write, { ctx, ...f.writeIn, body: lost.body });
  } catch {
    /* the forbidden write, swallowed: the hold stays and the caller sees unknown */
  }
  return { check: 'unknown' };
}

describe.each([...KINDS, 'topup'] as const)('regression %s: a write the handler catches is still in writesIn(calls)', (kind) => {
  it('the fake reads, sends, swallows the failure and looks fine; the shared check reports exactly that POST', async () => {
    const lost = kind === 'topup' ? await keepTopUp('card') : await keep(kind);
    await open('/billing');
    let r: { check: 'unknown' } | null = null;
    let threw: unknown = null;
    await act(async () => {
      try {
        r = await fakeCaughtCheck(kind, lost);
      } catch (e) {
        threw = e;
      }
      await flush();
    });
    expect(threw).toBeNull();
    expect(r).toEqual({ check: 'unknown' });
    expect(heldIds(kind)).toEqual([kind === 'rent' ? 's1' : lost.key]);
    const read = kind === 'topup' ? '/wallet/balances' : READ[kind];
    expect(getsIn(calls)).toContain(read);
    expect(writesIn(calls)).toEqual([{ method: 'POST', route: lost.route, key: lost.key, body: lost.body }]);
  }, T);
});

// A suspended account is offered nothing that sends. The held view (HeldGone) and the drawer's unknown
// body keep their read-only Check again, and "Send the same request again" is not drawn while the page knows the
// account is suspended (here: identity says banned once the page reads it).
describe('suspended, no "Send the same request again"', () => {
  const suspended = async (): Promise<void> => {
    W.fail['/users/auth/me'] = ok({ id: UID, is_banned: true });
    await screen.findByText(strings['band.suspendedTitle'], {}, WAIT);
    await act(flush);
  };

  it('a held reserve whose offer is gone (Check again from the band): Check again, no resend, nothing sent', async () => {
    await keep('reserve');
    gone('reserve');
    W.fail['/users/auth/me'] = ok({ id: UID, is_banned: true });
    await open(`/billing?${AT.reserve}&check=true`);
    await suspended();
    const d = await dialog();
    // check=true runs one Check again: wait for its read and its "still not confirmed" outcome, so the asserts below
    // see the suspended auto-check after it settled, not before.
    await waitFor(() => expect(within(d).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument(), WAIT);
    await waitFor(() => expect(calls.some((c) => c.method === 'GET' && c.route === READ.reserve)).toBe(true), WAIT);
    await act(flush);
    expect(checkIn(d)).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings['co.resend'] })).toBeNull();
    expect(writesIn(calls)).toEqual([]);
  }, T);

  it.each(['buy', 'pay'] as const)('a held %s in the drawer: the unknown body and Check again, no resend, nothing sent', async (kind) => {
    await keep(kind);
    W.fail['/users/auth/me'] = ok({ id: UID, is_banned: true });
    await open(`/billing?${AT[kind]}`);
    await suspended();
    const d = await dialog();
    await waitFor(() => expect(phase()).toBe('unknown'), WAIT);
    expect(checkIn(d)).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: strings['co.resend'] })).toBeNull();
    expect(writesIn(calls)).toEqual([]);
  }, T);
});

// A reservation whose outcome is unknown keeps
// its entry until a replay's 2xx, and a fresh Confirm of the offer is refused, so its unknown view
// offers "Start a new purchase", behind a danger confirm that says plainly a new one may charge again.
// A 500 PRICING_INVALID to a fresh rent or reserve is the one 5xx core proves pre-commit
// (charge resolution precedes the debit), so the drawer says it failed and offers Try again. api() marks every sent 5xx
// pending; core's own proof decides the facts, so the banner never says "may have gone through" with nothing to check.
describe.each(['reserve', 'rent'] as const)('%s answered 500 PRICING_INVALID', (kind) => {
  it('failed, not pending: the banner says failed, Try again is offered, nothing more is sent', async () => {
    await open(`/billing?${AT[kind]}`);
    const d = await dialog();
    await userEvent.click(await within(d).findByRole('checkbox', {}, WAIT));
    answerOneWrite = () => ({ status: 500, body: { error: 'PRICING_INVALID' } });
    await userEvent.click(await within(d).findByRole('button', { name: strings['mkt.confirmCta'] }, WAIT));
    await waitFor(() => expect(phase()).toBe('failed'), WAIT);
    await act(flush);
    expect(writesIn(calls)).toHaveLength(1);
    expect(d.querySelector('[data-outcome="pending"]')).toBeNull();
    expect(d.querySelector('[data-outcome="failed"]')).not.toBeNull();
    expect(within(d).getByRole('button', { name: strings['action.tryAgain'] })).toBeEnabled();
    expect(writesIn(calls)).toHaveLength(1);
  }, T);
});

describe('a kept reserve: Start a new purchase', () => {
  const startNew = (d: HTMLElement): Promise<void> => userEvent.click(within(d).getByRole('button', { name: strings['mkt.recoverNew'] }));
  const ask = (): Promise<HTMLElement> => screen.findByRole('alertdialog', { name: strings['mkt.reserveNewTitle'] }, WAIT);
  const suspended = async (): Promise<void> => {
    await screen.findByText(strings['band.suspendedTitle'], {}, WAIT);
    await act(flush);
  };

  it('offered on the unknown view; confirmed, the kept key is dropped and a fresh Confirm sends once, under a new key', async () => {
    const lost = await keep('reserve');
    // keep()'s send got no answer, so its flight stays until stale (70 s; core's own tests cover that): here it is over.
    // eslint-disable-next-line no-restricted-globals -- the test plays the stale time passing on core's record
    localStorage.setItem(STORE.reserve, JSON.stringify(stored('reserve').map(({ flights: _f, ...e }) => e)));
    await open(`/billing?${AT.reserve}`);
    const d = await dialog();
    await waitFor(() => expect(phase()).toBe('unknown'), WAIT);
    await startNew(d);
    const a = await ask();
    expect(a.textContent).toContain(strings['mkt.reserveNewBody']);
    await act(flush);
    expect(writesIn(calls)).toEqual([]);
    expect(heldIds('reserve')).toEqual([lost.key]);
    await userEvent.click(within(a).getByRole('button', { name: strings['mkt.reserveNewConfirm'] }));
    // A fresh review: the kept request is a tombstone in core's store (no tab sends it again) and gone from the page's
    // unknown band; nothing is sent.
    await waitFor(() => expect(phase()).toBe('review'), WAIT);
    // Focus stays in the drawer (the review's consent box), never the page title behind it.
    await waitFor(() => expect(d.contains(document.activeElement)).toBe(true), WAIT);
    await act(flush);
    expect(stored('reserve').map((e) => [e.key, typeof e.abandoned_at])).toEqual([[lost.key, 'number']]);
    expect(unknownBand()).toBeNull();
    expect(writesIn(calls)).toEqual([]);
    // The person's fresh Confirm: one POST of the offer, under a key that is not the dropped one.
    const d2 = await dialog();
    await userEvent.click(within(d2).getByRole('checkbox'));
    answerOneWrite = () => ({ status: 201, body: reserve201(false) });
    await userEvent.click(await within(d2).findByRole('button', { name: strings['mkt.confirmCta'] }));
    await waitFor(() => expect(writesIn(calls)).toHaveLength(1), WAIT);
    await act(flush);
    const [sent] = writesIn(calls);
    expect(sent).toMatchObject({ method: 'POST', route: RESEND_ROUTE.reserve });
    expect(typeof sent!.key).toBe('string');
    expect(sent!.key).not.toBe(lost.key);
    expect(writesIn(calls).filter((c) => c.key === lost.key)).toEqual([]);
  }, T);

  it('without Web Locks: the unknown view says what can be done (Check it, or a current browser), and offers neither a resend nor a new purchase', async () => {
    await keep('reserve');
    // test-setup installs fresh locks before every test; this one runs without them from here on.
    Reflect.deleteProperty(globalThis.navigator, 'locks');
    await open(`/billing?${AT.reserve}`);
    const d = await dialog();
    await waitFor(() => expect(phase()).toBe('unknown'), WAIT);
    await act(flush);
    expect(within(d).getByText(strings['mkt.reserveNoLocks'])).toBeTruthy();
    expect(d.querySelector('[data-resend]')).toBeNull();
    expect(within(d).queryByRole('button', { name: strings['mkt.recoverNew'] })).toBeNull();
    expect(checkIn(d)).toBeTruthy();
    expect(writesIn(calls)).toEqual([]);
  }, T);

  it('cancelled, the entry stays, the view stays unknown, and nothing is sent', async () => {
    const lost = await keep('reserve');
    await open(`/billing?${AT.reserve}`);
    const d = await dialog();
    await waitFor(() => expect(phase()).toBe('unknown'), WAIT);
    await startNew(d);
    const a = await ask();
    await userEvent.click(within(a).getByRole('button', { name: strings['action.cancel'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull(), WAIT);
    await act(flush);
    expect(phase()).toBe('unknown');
    expect(heldIds('reserve')).toEqual([lost.key]);
    expect(unknownBand()?.textContent).toContain(strings['band.unknownBody']);
    expect(writesIn(calls)).toEqual([]);
  }, T);

  it('a kept request that changed while the confirm was open (another tab\'s Start a new purchase and Confirm replaced it) is not dropped', async () => {
    const lost = await keep('reserve');
    await open(`/billing?${AT.reserve}`);
    const d = await dialog();
    await waitFor(() => expect(phase()).toBe('unknown'), WAIT);
    await startNew(d);
    const a = await ask();
    // Another tab's write: the same reservation now kept under another key.
    const other = [{ ...stored('reserve')[0], key: 'other-tab-key-0000000001' }];
    // eslint-disable-next-line no-restricted-globals -- the test plays another tab writing core's record
    localStorage.setItem(STORE.reserve, JSON.stringify(other));
    await userEvent.click(within(a).getByRole('button', { name: strings['mkt.reserveNewConfirm'] }));
    await act(flush);
    expect(phase()).toBe('unknown');
    expect(heldIds('reserve')).toEqual(['other-tab-key-0000000001']);
    expect(writesIn(calls)).toEqual([]);
    expect(lost.key).not.toBe('other-tab-key-0000000001');
  }, T);

  it('a send of it on the wire in another tab (its flight kept): nothing is dropped, the view stays unknown and says why', async () => {
    const lost = await keep('reserve');
    await open(`/billing?${AT.reserve}`);
    const d = await dialog();
    await waitFor(() => expect(phase()).toBe('unknown'), WAIT);
    await startNew(d);
    const a = await ask();
    // Another tab's send of the kept request registered its flight (core marketFlightAdd) and has no answer yet.
    const marked = [{ ...stored('reserve')[0], flights: [{ id: 'other-tab-flight-0001', at: Date.now() }] }];
    // eslint-disable-next-line no-restricted-globals -- the test plays another tab writing core's record
    localStorage.setItem(STORE.reserve, JSON.stringify(marked));
    await userEvent.click(within(a).getByRole('button', { name: strings['mkt.reserveNewConfirm'] }));
    expect(await screen.findByText(strings['mkt.reserveNewSending'], {}, WAIT)).toBeTruthy();
    await act(flush);
    expect(phase()).toBe('unknown');
    expect(heldIds('reserve')).toEqual([lost.key]);
    expect(writesIn(calls)).toEqual([]);
  }, T);

  it('a store that cannot be read when the abandon runs proves nothing: the view stays unknown with the store error, the key kept', async () => {
    const lost = await keep('reserve');
    await open(`/billing?${AT.reserve}`);
    const d = await dialog();
    await waitFor(() => expect(phase()).toBe('unknown'), WAIT);
    await startNew(d);
    const a = await ask();
    // Only reads made while core holds the pending lock fail: the page's own check of the shown request (unlocked)
    // still reads it, so the failure lands inside the abandon itself.
    // eslint-disable-next-line no-restricted-globals -- the test breaks core's own store reads
    const store = localStorage;
    const real = store.getItem.bind(store);
    const spy = vi.spyOn(store, 'getItem').mockImplementation((k: string) => {
      if (pendingLockHeld() && k === STORE.reserve) throw new Error('storage');
      return real(k);
    });
    try {
      await userEvent.click(within(a).getByRole('button', { name: strings['mkt.reserveNewConfirm'] }));
      expect(await screen.findByText(strings['mkt.reserveNewStoreErr'], {}, WAIT)).toBeTruthy();
    } finally {
      spy.mockRestore(); // never left on for the next test, even when this one fails
    }
    await act(flush);
    expect(phase()).toBe('unknown');
    expect(heldIds('reserve')).toEqual([lost.key]);
    expect(writesIn(calls)).toEqual([]);
  }, T);

  it('not offered while suspended', async () => {
    await keep('reserve');
    W.fail['/users/auth/me'] = ok({ id: UID, is_banned: true });
    await open(`/billing?${AT.reserve}`);
    await suspended();
    const d = await dialog();
    await waitFor(() => expect(phase()).toBe('unknown'), WAIT);
    expect(within(d).queryByRole('button', { name: strings['mkt.recoverNew'] })).toBeNull();
    expect(writesIn(calls)).toEqual([]);
  }, T);
});
