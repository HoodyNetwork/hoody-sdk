// Vitest: the live Checkout hook (useCheckoutLive) against fake commerce machines, mounted through the real page and
// drawer. The rules under test are the C9 ones of the market purchase flow: a not-found read-back is "not confirmed",
// a refusal clears the machine and carries the re-quote, and a reservation retry waits for the machine's own countdown.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { errorInfo } from '@core';
import { errorText } from '@kit';
import page from './page';
import { freeBadgeStateForTests, resetFreeBadgeForTests } from './parts/FreeBadge.data';
import strings from './strings.en.json';

const fx = vi.hoisted(() => ({
  opts: null as any,
  created: [] as any[],
  rentMarks: [] as any[],
  // The reservation store cannot be read (marketPendingKept answers null).
  pendUnreadable: false,
  checkRent: vi.fn(),
  checkReserve: vi.fn(),
  // The newest machine's state as its last onChange said (push): what its snapshot() answers, as core's does.
  lastSnap: null as any,
  pm: null as any,
  att: null as any,
  quoteFails: false,
  /** When set, each attempt quote waits on this (a test answers it, in any order). */
  quoteNext: null as null | (() => Promise<any>),
  attPending: false,
  tuPending: null as any,
  tuSelect: true,
  // Top-up machine: its phase, and the submit tests hold open.
  tuPhase: 'ready' as string,
  tuSubmit: null as null | (() => Promise<unknown>),
  /** Resends the top-up machine actually started (past its own busy check). */
  tuResends: 0,
  onListing: null as null | (() => void),
  tu: null as any,
  tuCheck: { ok: false, reason: 'pending', key: 'k', method: 'card', amount: '35' } as any,
  ret: null as any,
  balRefetch: vi.fn(),
  verified: { state: 'received' } as any,
  marketPend: [] as any[],
  onRetry: null as null | ((opts: any) => boolean),
  pendingAll: [] as any[],
  upgrades: [] as any[],
  attArgs: null as any,
  attConfirm: { ok: false, reason: 'refused', definitive: true } as any,
  planCheck: vi.fn(),
  // The newest render's checkout api: a test keeps an earlier render's callback to call it later.
  api: null as any,
  /** core reserveUnknownFor: this tab's remembered unresolved reserve of mkt_sin_m for 30 days, or null. */
  reserveUnknown: null as { since: number; days?: string; key?: string } | null,
  /** A second remembered reserve of mkt_sin_m, of another term than reserveUnknown's (core holds one per term). */
  reserveOther: null as { since: number; days: string } | null,
  forgetUnknown: null as any,
  forgetAnswer: 'dropped' as 'dropped' | 'kept' | 'failed',
  forgetKept: null as any,
  abandonAnswer: 'dropped' as string,
  /** The context the keyed abandon was called with, and a promise it waits on before answering (null: answers at once). */
  abandonCtx: null as unknown,
  abandonGate: null as Promise<void> | null,
  /** When set, the drawer's target names this plan instead of the one its link resolved to. */
  planOverride: null as string | null,
  /** The plan title the kept buy (heldPlanTitle) was requested for: another plan of the family than the one opened. */
  keptTitle: null as string | null,
}));
/** The kept buy, pay or upgrade core holds (heldPlanEntry): the one the resend dialog is opened for. */
const KEPT = { key: 'k'.repeat(20), maxCents: 1200, sig: 'kept-sig' };

const snap = (over: Record<string, unknown> = {}) => ({
  state: 'idle',
  mode: null,
  rail: 'reserve',
  canClose: true,
  notice: null,
  owner: 'u1',
  idemKey: null,
  ceiling: 1000,
  receipt: null,
  replayed: false,
  advisory: false,
  advisoryKind: null,
  lateHint: false,
  entry: null,
  failure: null,
  reconfirm: false,
  banned: false,
  retryIn: 0,
  autoReplayUsed: false,
  ...over,
});

const row = (kind: 'stock' | 'offer') => ({
  kind,
  seq: 1,
  id: 'mkt_sin_m',
  name: 'Singapore M',
  country: 'SG',
  region: null,
  city: 'Singapore',
  datacenter: null,
  model: null,
  featured: false,
  stockLeft: 3,
  deliveryHours: 1,
  days: ['30'],
  maps:
    kind === 'offer'
      ? { pricing: { '30': 1000 }, hold: { '30': 3 }, feeCents: 0 }
      : { tiers: { '30': { price: '10.00', total_first_payment: '10.00', hold_days: 3 } } },
});

const tuMachine = {
  load: async () => undefined,
  // As core: select and submit refuse while a submit of this machine is out.
  select: () => fx.tuPhase !== 'submitting' && fx.tuSelect,
  submit: async () => {
    if (fx.tuPhase === 'submitting') return { ok: false, reason: 'busy' };
    if (!fx.tuSubmit) return { ok: false, reason: 'busy' };
    fx.tuPhase = 'submitting';
    try { return await fx.tuSubmit(); } finally { fx.tuPhase = 'ready'; }
  },
  // As core: Check again only reads, and answers busy while a send of this machine is out.
  checkAgain: async () => (fx.tuPhase === 'submitting' ? { ok: false, reason: 'busy' } : fx.tuCheck),
  // As core: a resend refuses while a send of this machine is out.
  resend: async () => {
    if (fx.tuPhase === 'submitting') return { ok: false, reason: 'busy' };
    if (!fx.tuSubmit) return { ok: false, reason: 'busy' };
    fx.tuPhase = 'submitting';
    fx.tuResends += 1;
    try { return await fx.tuSubmit(); } finally { fx.tuPhase = 'ready'; }
  },
  snapshot: () => ({ pending: fx.tuPending, phase: fx.tuPhase }),
};

vi.mock('@core', async (orig) => {
  const a: Record<string, any> = await orig();
  return {
    ...a,
    commerceRules: { ...a.commerceRules, readPendingAll: () => fx.pendingAll },
    commerce: {
      ...a.commerce,
      shownOwner: () => ({ owner: 'u1', live: () => true }),
      loadListing: async () => {
        // A test's hook run as the listing read answers (another answer queued in the same task, before React renders).
        const f = fx.onListing;
        fx.onListing = null;
        if (f) await Promise.resolve().then(f);
        return { stock: [row('stock')], offers: [row('offer')], errStock: null, errOffers: null };
      },
      marketPendingFor: () => fx.marketPend,
      // As core: by the owner asked for (the dialog's), null when the store cannot be read.
      marketPendingKept: (owner: unknown, id: string | null | undefined) =>
        fx.pendUnreadable || typeof owner !== 'string' || !owner || !id
          ? null
          : fx.marketPend.some((p: any) => p.offer_id === id && p.user_id === owner),
      pendingUpgrades: () => fx.upgrades,
      rentPendingFor: () => fx.rentMarks,
      checkRentPending: (...args: unknown[]) => fx.checkRent(...args),
      checkReserveHold: (...args: unknown[]) => fx.checkReserve(...args),
      // As core: the offer's hold, any term (this term's first), with its own term.
      // This term's hold, else another term's (core reserveUnknownFor).
      reserveUnknownFor: (_ctx: unknown, id: unknown, days: unknown) => {
        if (id !== 'mkt_sin_m') return null;
        const all = [fx.reserveUnknown && { days: '30', ...fx.reserveUnknown }, fx.reserveOther].filter((h): h is { since: number; days: string } => !!h);
        return all.find((h) => h.days === days) ?? all[0] ?? null;
      },
      reserveUnknownAbandon: (...args: unknown[]) => fx.forgetUnknown(...args),
      reserveUnknownForget: (...args: unknown[]) => fx.forgetKept(...args),
      // As core: a proved abandon leaves no kept key of that offer.
      marketPendingAbandon: async (ctx: unknown) => {
        fx.abandonCtx = ctx;
        if (fx.abandonGate) await fx.abandonGate;
        if (fx.abandonAnswer === 'dropped') fx.marketPend = [];
        return fx.abandonAnswer;
      },
      heldPlanEntry: () => (fx.attPending ? KEPT : null),
      // As core: the kept buy's own title, with its key (the request the attempt adopted).
      heldPlanTitle: () => (fx.attPending && fx.keptTitle ? { key: KEPT.key, title: fx.keptTitle } : null),
      checkPlanHold: (...args: unknown[]) => fx.planCheck(...args),
      checkPayHold: (...args: unknown[]) => fx.planCheck(...args),
      readTopupReturn: () => fx.ret,
      verifyReturn: async () => fx.verified,
      useTopUp: () => ({ state: { pending: null, phase: 'ready', methods: [{ key: 'card', min: 5, max: 1000 }] }, machine: tuMachine }),
      createAttempt: (...args: unknown[]) => {
        fx.attArgs = args;
        // As core: the ceiling the attempt will send moves as soon as a quote resolves.
        const m: any = { ceil: 1200 };
        const priced = (q: any) => { if (q && typeof q.charge_cents === 'number') m.ceil = q.charge_cents; return q; };
        fx.att = Object.assign(m, {
          quote: vi.fn(async () => {
            if (fx.quoteFails) throw { kind: 'server' };
            if (fx.quoteNext) return priced(await fx.quoteNext());
            return priced({ charge_cents: 1200, price_cents_per_month: 1200 });
          }),
          confirm: vi.fn(async () => fx.attConfirm),
          snapshot: vi.fn(() => ({ phase: 'review', error: { kind: 'typed', code: 'CHARGE_EXCEEDS_MAX' }, ceiling: m.ceil, pending: fx.attPending, key: m.key ?? (fx.attPending ? KEPT.key : null) })),
          resume: vi.fn(),
          dispose: vi.fn(),
        });
        return fx.att;
      },
      createPurchase: (_row: unknown, _days: string, opts: any) => {
        fx.opts = opts;
        const pm: any = {
          // Called once, as the machine is made: its call order marks the moment createPurchase ran.
          made: vi.fn(),
          confirm: vi.fn(() => ({ ok: true })),
          retry: vi.fn(() => (fx.onRetry ? fx.onRetry(opts) : true)),
          retryRent: vi.fn(() => true),
          dismiss: vi.fn(() => true),
          refresh: vi.fn(async () => undefined),
          checkAgain: vi.fn(),
          resume: vi.fn(),
          dispose: vi.fn(),
          snapshot: vi.fn(() => fx.lastSnap ?? snap()),
        };
        pm.made();
        fx.lastSnap = null;
        fx.created.push(pm);
        fx.pm = pm;
        return pm;
      },
    },
  };
});

vi.mock('./data', async (orig) => {
  const a: Record<string, any> = await orig();
  return {
    ...a,
    useCheckout: (...args: any[]) => {
      // A family link that now resolves to another plan version: the same drawer, another target plan.
      if (fx.planOverride && args[1]) args[1] = { ...args[1], item: fx.planOverride };
      const api = a.useCheckoutLive(...args);
      fx.api = api;
      return api;
    },
    useListing: a.useListingLive,
    useUnknownCheckouts: a.useUnknownCheckoutsLive,
    useTopUp: (...args: any[]) => { const t = a.useTopUpLive(...args); fx.tu = t; return t; },
    usePaymentReturn: a.usePaymentReturnLive,
    useBalance: () => ({ ...a.useBalance(), refetch: fx.balRefetch }),
  };
});

const push = (over: Record<string, unknown>) => act(async () => { fx.lastSnap = snap(over); fx.opts.onChange(fx.lastSnap); });

beforeEach(() => {
  fx.created.length = 0;
  fx.rentMarks = [];
  fx.pendUnreadable = false;
  fx.checkRent.mockReset();
  fx.checkReserve.mockReset();
  fx.reserveUnknown = null;
  fx.reserveOther = null;
  // core reserveUnknownAbandon and reserveUnknownForget forget only the named term's hold; a hold with no days is the
  // 30-day one.
  const forgetTerm = (days: unknown): boolean => {
    let had = false;
    if (fx.reserveUnknown && (fx.reserveUnknown.days ?? '30') === days) { fx.reserveUnknown = null; had = true; }
    if (fx.reserveOther && fx.reserveOther.days === days) { fx.reserveOther = null; had = true; }
    return had;
  };
  fx.forgetUnknown = vi.fn(async (_ctx: unknown, _id: unknown, days: unknown) => { if (fx.forgetAnswer === 'dropped') forgetTerm(days); return fx.forgetAnswer; });
  fx.forgetAnswer = 'dropped';
  // As core: after a keyed abandon only the hold of that key goes (its own admission's), never another key's.
  fx.forgetKept = vi.fn((_ctx: unknown, _id: unknown, days: unknown, key: unknown) => {
    if (fx.reserveUnknown && (fx.reserveUnknown.days ?? '30') === days && fx.reserveUnknown.key === key) { fx.reserveUnknown = null; return true; }
    return false;
  });
  fx.abandonCtx = null;
  fx.abandonGate = null;
  fx.planOverride = null;
  fx.keptTitle = null;
  fx.abandonAnswer = 'dropped';
  fx.lastSnap = null;
  fx.checkReserve.mockImplementation(async () => ({ check: 'unknown', evidence: null }));
  fx.quoteFails = false;
  fx.quoteNext = null;
  fx.attPending = false;
  fx.tuPending = null;
  fx.tuSelect = true;
  fx.tuPhase = 'ready';
  fx.tuSubmit = null;
  fx.tuResends = 0;
  fx.onListing = null;
  fx.tu = null;
  fx.tuCheck = { ok: false, reason: 'pending', key: 'k', method: 'card', amount: '35' };
  fx.ret = null;
  fx.balRefetch.mockReset();
  fx.verified = { state: 'received' };
  fx.marketPend = [];
  fx.onRetry = null;
  fx.pendingAll = [];
  fx.upgrades = [];
  fx.attConfirm = { ok: false, reason: 'refused', definitive: true };
  fx.attPending = false;
  fx.planCheck.mockReset();
  // As core: no kept request for the shown owner is 'none' (nothing to read); one kept is unknown.
  fx.planCheck.mockImplementation(async () => (fx.attPending ? { check: 'unknown', evidence: null } : { check: 'none' }));
});

/** The one path that sends a kept request again: the drawer's or held view's confirmed resend. */
async function resendIn(dialog: HTMLElement) {
  await userEvent.click(await within(dialog).findByRole('button', { name: strings['co.resend'] }));
  const ask = await screen.findByRole('alertdialog', { name: strings['co.resendTitle'] });
  await userEvent.click(within(ask).getByRole('button', { name: strings['co.resendConfirm'] }));
}

let qc: { getQueryCache(): { findAll(): { queryKey: unknown; state: { dataUpdateCount: number } }[] } };
const reads = (word: string) =>
  qc
    .getQueryCache()
    .findAll()
    .filter((q) => JSON.stringify(q.queryKey).includes(word))
    .reduce((n, q) => n + q.state.dataUpdateCount, 0);

async function openMarket(kind: 'rent' | 'reserve') {
  ({ queryClient: qc } = await renderPage(page, { path: `/billing?checkout=${kind}&item=mkt_sin_m&days=30` }));
  const dialog = await screen.findByRole('dialog');
  const confirm = await within(dialog).findByRole('button', { name: strings['mkt.confirmCta'] });
  return { dialog, confirm };
}

async function send(dialog: HTMLElement, confirm: HTMLElement) {
  // Confirm is drawn, disabled, before the review: the box comes with the review. While the box is unticked Confirm is
  // the reasoned one (no action); ticking it draws the real Confirm in its place, so the button is read again by name.
  const box = await within(dialog).findByRole('checkbox');
  await userEvent.click(box);
  await userEvent.click(confirm.isConnected ? confirm : within(dialog).getByRole('button', { name: strings['mkt.confirmCta'] }));
}

describe('rent: an answer that is not known', () => {
  it('a not-found read-back after reconciling is "not confirmed", never a failure with Try again', async () => {
    const { dialog, confirm } = await openMarket('rent');
    await send(dialog, confirm);
    await push({ state: 'posting', rail: 'rent' });
    await push({ state: 'reconciling', rail: 'rent' });
    await push({ state: 'not-found', rail: 'rent' });
    expect(await within(dialog).findByText(strings['mkt.notFoundTitle'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['mkt.failedGeneric'])).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['buy.retry'] })).toBeNull();
  });

  it('an unresolved rent marker reopens the drawer on the unknown state, and Check again reads the rentals', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false }];
    fx.checkRent.mockResolvedValueOnce('unknown');
    await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    const check = await within(dialog).findByRole('button', { name: /^check again$/i });
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
    await userEvent.click(check);
    await waitFor(() => expect(fx.checkRent).toHaveBeenCalledTimes(1));
    expect(fx.created[0].confirm).not.toHaveBeenCalled();
  });
});

describe('a refused purchase does not wedge Confirm', () => {
  it('reserve: the failed machine is dismissed and the next one carries the server re-quote', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    const first = fx.pm;
    await push({ state: 'failed', failure: { code: 'CHARGE_EXCEEDS_MAX', requote: true, requoteCents: 1250 } });
    await waitFor(() => expect(first.dismiss).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fx.created.length).toBeGreaterThan(1));
    expect(fx.opts.requote).toEqual({ days: '30', totalCents: 1250 });
  });
});

describe('a reservation Retry follows the machine own countdown', () => {
  const K = 'r'.repeat(20);
  // The machine is unknown on the kept request's own key and ceiling (what the real machine snapshot reads after a lost
  // answer), so the drawer can send it again (canResend) and draws the control.
  async function unknownReserve(retryIn: number) {
    fx.marketPend = [{ user_id: 'u1', offer_id: 'mkt_sin_m', days: '30', ceiling: 1000, key: K, at: 1, name: 'Singapore M' }];
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    const unknown = { state: 'indeterminate', retryIn, idemKey: K, ceiling: 1000 };
    fx.pm.snapshot.mockReturnValue(snap(unknown));
    await push(unknown);
    return dialog;
  }

  it('the resend is the outcome banner\'s recovery action, its charge sentence right under the banner', async () => {
    const dialog = await unknownReserve(0);
    const slot = dialog.querySelector('[data-outcome-actions]') as HTMLElement;
    expect(slot).not.toBeNull();
    const banner = slot.closest('[role="alert"]') as HTMLElement;
    expect(banner).toHaveAttribute('data-outcome', 'pending');
    expect(within(slot).getByRole('button', { name: strings['co.resend'] })).toBeEnabled();
    const hint = dialog.querySelector('[data-resend]') as HTMLElement;
    expect(hint).not.toBeNull();
    expect(banner.nextElementSibling).toBe(hint);
    expect(hint.textContent).toContain('$10.00');
    // The banner's own Resend, pressed and confirmed, retries the kept key once.
    fx.pm.retry.mockReturnValueOnce(true);
    await userEvent.click(within(slot).getByRole('button', { name: strings['co.resend'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['co.resendTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['co.resendConfirm'] }));
    expect(fx.pm.retry).toHaveBeenCalledTimes(1);
  });

  // The countdown ticks every second, so it never sits inside the banner's role="alert"
  // (a screen reader would read the whole banner again each second): the button waits disabled under its own name, and
  // the seconds are a line under the banner.
  it('carries Retry-After (not a fixed 20 s): Resend waits disabled; the countdown is outside the alert', async () => {
    const dialog = await unknownReserve(60);
    const slot = dialog.querySelector('[data-outcome-actions]') as HTMLElement;
    expect(within(slot).getByRole('button', { name: strings['co.resend'] })).toBeDisabled();
    const line = await within(dialog).findByText(/try again in 60 s/i);
    expect(line.closest('[role="alert"]')).toBeNull();
    for (const alert of dialog.querySelectorAll('[role="alert"]')) expect(alert.textContent).not.toMatch(/try again in/i);
  });

  it('a confirmed resend the machine refuses leaves the drawer unlocked and unchanged', async () => {
    const dialog = await unknownReserve(0);
    fx.pm.retry.mockReturnValueOnce(false);
    await resendIn(dialog);
    expect(fx.pm.retry).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('button', { name: strings['co.resend'] })).toBeEnabled();
  });

  it('a confirmed resend refused for want of a granted lock (a Locks API that rejects) says why, stays unknown; the next one that goes clears it', async () => {
    const dialog = await unknownReserve(0);
    expect(within(dialog).queryByText(strings.noLocks)).toBeNull();
    await resendIn(dialog);
    // Core's admission refused: still indeterminate on the same key, with the noLocks notice, nothing sent.
    await push({ state: 'indeterminate', retryIn: 0, idemKey: K, ceiling: 1000, notice: 'noLocks' });
    expect(await within(dialog).findByText(strings.noLocks)).toBeInTheDocument();
    expect(within(dialog).getByText(strings['mkt.indeterminateReserve'])).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['co.resend'] })).toBeEnabled();
    // The next resend is admitted and goes out; its answer is lost again: the reason goes.
    await resendIn(dialog);
    await push({ state: 'posting', mode: 'replay', idemKey: K, ceiling: 1000 });
    await push({ state: 'indeterminate', retryIn: 0, idemKey: K, ceiling: 1000 });
    await waitFor(() => expect(within(dialog).queryByText(strings.noLocks)).toBeNull());
    expect(within(dialog).getByText(strings['mkt.indeterminateReserve'])).toBeInTheDocument();
    expect(fx.pm.retry).toHaveBeenCalledTimes(2);
  });
});

// "Send the same request again" is drawn only when this drawer can send the kept request. Another
// tab's refused Confirm leaves this reservation's machine idle (no key of its own): no resend is drawn here (the band's
// Check again, after Close, opens a machine that adopts the kept request).
describe('no resend control this drawer cannot send', () => {
  it('a reserve whose machine is idle: Check again, and no resend', async () => {
    fx.marketPend = [{ user_id: 'u1', offer_id: 'mkt_sin_m', days: '30', ceiling: 1000, key: 'r'.repeat(20), at: 1, name: 'Singapore M' }];
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'idle', notice: 'unresolvedReserve' });
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['co.resend'] })).toBeNull();
  });
});

describe('the Free badge hears the purchase', () => {
  it('a purchase that is out or unresolved keeps it off, and its end is a cutoff for the older answers', async () => {
    resetFreeBadgeForTests();
    const { dialog, confirm } = await openMarket('reserve');
    expect(freeBadgeStateForTests().busy).toBe(0);
    await send(dialog, confirm);
    await push({ state: 'posting' });
    await waitFor(() => expect(freeBadgeStateForTests().busy).toBe(1));
    await push({ state: 'unknown' });
    expect(freeBadgeStateForTests().busy).toBe(1);
    await push({ state: 'confirmed', receipt: { created_at: '2026-10-23T08:00:00Z' } });
    await waitFor(() => expect(freeBadgeStateForTests().busy).toBe(0));
    expect(freeBadgeStateForTests().cutoff).toBeGreaterThan(0);
  });
});

describe('after a completed purchase', () => {
  it('reads the balance and the subscriptions again instead of waiting out the stale window', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    const before = { balance: reads('balance'), subs: reads('subs') };
    await push({ state: 'posting' });
    await push({ state: 'confirmed', receipt: { created_at: '2026-10-23T08:00:00Z' } });
    await waitFor(() => expect(reads('balance')).toBeGreaterThan(before.balance));
    await waitFor(() => expect(reads('subs')).toBeGreaterThan(before.subs));
  });
});

describe.each([
  ['buy', '?checkout=buy&plan=fam-plus', 'buy.confirm'],
  ['pay', '?checkout=pay&sub=a1b2c3d4e5f60718293a4b02', 'subs.payConfirm'],
  ['upgrade', '?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro', 'up.confirm'],
])('%s after CHARGE_EXCEEDS_MAX', (_kind, search, confirmKey) => {
  it('reads the quote again, so the next Confirm never re-sends the stale ceiling', async () => {
    await renderPage(page, { path: `/billing${search}` });
    const dialog = await screen.findByRole('dialog');
    const name = (strings as Record<string, string>)[confirmKey];
    await within(dialog).findByRole('button', { name });
    await waitFor(() => expect(fx.att.quote).toHaveBeenCalled());
    const before = fx.att.quote.mock.calls.length;
    await userEvent.click(within(dialog).getByRole('checkbox'));
    // Read Confirm after the tick: Buy a plan's closed-gate Confirm is a different (action-less) element.
    await userEvent.click(within(dialog).getByRole('button', { name }));
    await waitFor(() => expect(fx.att.confirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fx.att.quote.mock.calls.length).toBeGreaterThan(before));
  });
});

describe.each([
  ['buy', '?checkout=buy&plan=fam-plus'],
  ['pay', '?checkout=pay&sub=a1b2c3d4e5f60718293a4b02'],
  ['upgrade', '?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro'],
])('%s: a quote answer belongs to the attempt that asked', (_kind, search) => {
  const answers: Array<(v: unknown) => void> = [];
  const priced = (cents: number) => ({ charge_cents: cents, price_cents_per_month: cents });
  beforeEach(() => {
    answers.length = 0;
    fx.quoteNext = () => new Promise((r) => answers.push(r));
  });

  it('a late answer for the replaced attempt shows nothing: the drawer keeps the current attempt price', async () => {
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await waitFor(() => expect(answers.length).toBe(1));
    await act(async () => { fx.api.again(); });
    await waitFor(() => expect(answers.length).toBe(2));
    await act(async () => { answers[1]!(priced(2000)); });
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(2000));
    await act(async () => { answers[0]!(priced(1000)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(fx.api.state.quote?.chargeCents).toBe(2000);
  });

  it('a price quoted for the replaced attempt never stands for the new one: no review, no Confirm, until its own quote', async () => {
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await waitFor(() => expect(answers.length).toBe(1));
    await act(async () => { answers[0]!(priced(1000)); });
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(1000));
    await act(async () => { fx.api.again(); });
    await waitFor(() => expect(answers.length).toBe(2));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(fx.api.state.phase).not.toBe('review');
    expect(fx.api.state.quote).toBeNull();
    await act(async () => { answers[1]!(priced(2000)); });
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(2000));
    expect(fx.api.state.phase).toBe('review');
  });

  it('a send of the replaced attempt that comes back not sent never leaves its price and consent standing for the new one', async () => {
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await waitFor(() => expect(answers.length).toBe(1));
    await act(async () => { answers[0]!(priced(1000)); });
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(1000));
    const first = fx.att;
    let settle: (v: unknown) => void = () => {};
    first.confirm.mockImplementation(() => new Promise((r) => { settle = r; }));
    await act(async () => { fx.api.setConsent(true); });
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(first.confirm).toHaveBeenCalledTimes(1));
    expect(fx.api.state.phase).toBe('posting');
    // The attempt is replaced while the send is out, and the new one quotes a higher price.
    await act(async () => { fx.api.again(); });
    await waitFor(() => expect(fx.att).not.toBe(first));
    const second = fx.att;
    await waitFor(() => expect(answers.length).toBe(2));
    await act(async () => { answers[1]!(priced(2000)); });
    // The first send comes back with nothing sent.
    await act(async () => { settle({ ok: false, reason: 'check', notSent: true, definitive: false }); });
    await waitFor(() => expect(fx.api.state.phase).toBe('review'));
    expect(fx.api.state.quote?.chargeCents).toBe(2000);
    expect(fx.api.state.consent).toBe(false);
    // No Confirm goes out on the earlier consent.
    await act(async () => { fx.api.confirm(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(second.confirm).not.toHaveBeenCalled();
  });

  it('a send of the replaced attempt that comes back refused never leaves its price for the new one; the new attempt is quoted again', async () => {
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await waitFor(() => expect(answers.length).toBe(1));
    await act(async () => { answers[0]!(priced(1000)); });
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(1000));
    const first = fx.att;
    let settle: (v: unknown) => void = () => {};
    first.confirm.mockImplementation(() => new Promise((r) => { settle = r; }));
    await act(async () => { fx.api.setConsent(true); });
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(first.confirm).toHaveBeenCalledTimes(1));
    expect(fx.api.state.phase).toBe('posting');
    // The attempt is replaced while the send is out, and the new one quotes a higher price.
    await act(async () => { fx.api.again(); });
    await waitFor(() => expect(fx.att).not.toBe(first));
    const second = fx.att;
    await waitFor(() => expect(answers.length).toBe(2));
    await act(async () => { answers[1]!(priced(2000)); });
    // The first send comes back definitely refused (the ceiling was too low).
    await act(async () => { settle({ ok: false, reason: 'refused', kind: 'exceeds', definitive: true }); });
    // The refusal re-quotes the CURRENT attempt, never the replaced one.
    await waitFor(() => expect(answers.length).toBe(3));
    expect(first.quote).toHaveBeenCalledTimes(1);
    await act(async () => { answers[2]!(priced(2100)); });
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(2100));
    expect(fx.api.state.phase).toBe('review');
    expect(fx.api.state.consent).toBe(false);
    // No Confirm goes out on the earlier consent.
    await act(async () => { fx.api.confirm(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(second.confirm).not.toHaveBeenCalled();
  });
  it('a send of the replaced attempt that comes back not sent while the new attempt quote failed asks for a quote again, never stays on quoting', async () => {
    const fails: Array<(e: unknown) => void> = [];
    let n = 0;
    fx.quoteNext = () => new Promise((res, rej) => { n += 1; if (n === 2) fails.push(rej); else answers.push(res); });
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await waitFor(() => expect(answers.length).toBe(1));
    await act(async () => { answers[0]!(priced(1000)); });
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(1000));
    const first = fx.att;
    let settle: (v: unknown) => void = () => {};
    first.confirm.mockImplementation(() => new Promise((r) => { settle = r; }));
    await act(async () => { fx.api.setConsent(true); });
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(first.confirm).toHaveBeenCalledTimes(1));
    // The attempt is replaced while the send is out, and the new attempt's quote fails while it is still out.
    await act(async () => { fx.api.again(); });
    await waitFor(() => expect(fx.att).not.toBe(first));
    const second = fx.att;
    await waitFor(() => expect(fails.length).toBe(1));
    await act(async () => { fails[0]!({ kind: 'server' }); });
    await act(async () => { settle({ ok: false, reason: 'check', notSent: true, definitive: false }); });
    // With no current price to show, the current attempt is quoted again (a read, nothing sent).
    await waitFor(() => expect(answers.length).toBe(2));
    expect(first.quote).toHaveBeenCalledTimes(1);
    await act(async () => { answers[1]!(priced(2000)); });
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(2000));
    expect(fx.api.state.phase).toBe('review');
    expect(fx.api.state.consent).toBe(false);
    expect(second.confirm).not.toHaveBeenCalled();
  });
});

describe.each([
  ['buy', '?checkout=buy&plan=fam-plus'],
  ['pay', '?checkout=pay&sub=a1b2c3d4e5f60718293a4b02'],
  ['upgrade', '?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro'],
])('%s: Confirm sends only what the review shows', (_kind, search) => {
  it('a ceiling moved by a quote the review does not show yet: nothing sent', async () => {
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(1200));
    await act(async () => { fx.api.setConsent(true); });
    // Core moved the attempt's ceiling (a quote resolved) before the review re-rendered it.
    fx.att.ceil = 2000;
    await act(async () => { fx.api.confirm(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(fx.att.confirm).not.toHaveBeenCalled();
    expect(fx.api.state.phase).not.toBe('posting');
  });

  it('a ceiling moved past the shown price, then the quote fails: nothing sent, the price error with its Retry', async () => {
    await renderPage(page, { path: `/billing${search}` });
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(1200));
    await act(async () => { fx.api.setConsent(true); });
    fx.att.ceil = 2000;
    fx.quoteFails = true;
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(fx.api.state.phase).toBe('quote_error'));
    expect(await within(dialog).findByText(strings['buy.quoteErr'])).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^try again$/i })).toBeInTheDocument();
    expect(fx.att.confirm).not.toHaveBeenCalled();
  });

  it('a re-quote that lands while a second Confirm is out, then not sent: the new price with fresh consent, never a dead Confirm', async () => {
    const answers: Array<(v: unknown) => void> = [];
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(1200));
    const att = fx.att;
    // The first Confirm is refused; its re-quote stays out.
    fx.quoteNext = () => new Promise((r) => answers.push(r));
    fx.attConfirm = { ok: false, reason: 'refused', kind: 'exceeds', definitive: true };
    await act(async () => { fx.api.setConsent(true); });
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(answers.length).toBe(1));
    await waitFor(() => expect(fx.api.state.phase).toBe('review'));
    // A second Confirm on the shown price; the re-quote lands at a higher price while it is out.
    let settle: (v: unknown) => void = () => {};
    att.confirm.mockImplementation(() => new Promise((r) => { settle = r; }));
    await act(async () => { fx.api.setConsent(true); });
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(fx.api.state.phase).toBe('posting'));
    await act(async () => { answers[0]!({ charge_cents: 2000, price_cents_per_month: 2000 }); });
    await act(async () => { settle({ ok: false, reason: 'check', notSent: true, definitive: false }); });
    await waitFor(() => expect(fx.api.state.phase).toBe('review'));
    await act(async () => { fx.api.setConsent(true); });
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(2000));
    expect(fx.api.state.phase).toBe('review');
    expect(fx.api.state.consent).toBe(false);
    expect(att.confirm).toHaveBeenCalledTimes(2);
  });

  it('a replaced send that comes back not sent while the new attempt holds a kept request: its unknown outcome, never a review that resends it', async () => {
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(1200));
    const first = fx.att;
    let settle: (v: unknown) => void = () => {};
    first.confirm.mockImplementation(() => new Promise((r) => { settle = r; }));
    await act(async () => { fx.api.setConsent(true); });
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(first.confirm).toHaveBeenCalledTimes(1));
    // The first send's claim stored its request; the attempt that replaces it adopts that kept entry.
    fx.attPending = true;
    await act(async () => { fx.api.again(); });
    await waitFor(() => expect(fx.att).not.toBe(first));
    const second = fx.att;
    await waitFor(() => expect(second.quote).toHaveBeenCalled());
    await act(async () => { settle({ ok: false, reason: 'check', notSent: true, definitive: false }); });
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    await act(async () => { fx.api.setConsent(true); fx.api.confirm(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(second.confirm).not.toHaveBeenCalled();
  });
});

describe.each([
  ['buy', '?checkout=buy&plan=fam-plus'],
  ['pay', '?checkout=pay&sub=a1b2c3d4e5f60718293a4b02'],
  ['upgrade', '?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro'],
])('%s: a replaced attempt after its send', (_kind, search) => {
  it('a definite refusal drops the kept request the new attempt adopted: a fresh review, never "may have gone through"', async () => {
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(1200));
    const first = fx.att;
    // The first send claims the key the second attempt then adopts.
    first.key = KEPT.key;
    let settle: (v: unknown) => void = () => {};
    first.confirm.mockImplementation(() => new Promise((r) => { settle = r; }));
    await act(async () => { fx.api.setConsent(true); });
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(first.confirm).toHaveBeenCalledTimes(1));
    // The first send's claim stored its request; the attempt that replaces it adopts a copy of that entry.
    fx.attPending = true;
    await act(async () => { fx.api.again(); });
    await waitFor(() => expect(fx.att).not.toBe(first));
    const second = fx.att;
    const copy = second.snapshot();
    second.snapshot.mockImplementation(() => copy);
    await waitFor(() => expect(second.quote).toHaveBeenCalled());
    // The first send is refused for good: core drops the stored entry; the second attempt keeps its copy.
    fx.attPending = false;
    await act(async () => { settle({ ok: false, reason: 'refused', kind: 'exceeds', definitive: true }); });
    await waitFor(() => expect(fx.att).not.toBe(second));
    await waitFor(() => expect(fx.api.state.phase).toBe('review'));
    expect(fx.api.state.consent).toBe(false);
    expect(second.confirm).not.toHaveBeenCalled();
  });

  it('a definite refusal while the new attempt holds another request (another tab\'s, since dropped): its unknown outcome, no fresh review', async () => {
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(1200));
    const first = fx.att;
    first.key = 'a'.repeat(20);
    let settle: (v: unknown) => void = () => {};
    first.confirm.mockImplementation(() => new Promise((r) => { settle = r; }));
    await act(async () => { fx.api.setConsent(true); });
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(first.confirm).toHaveBeenCalledTimes(1));
    // The new attempt adopts a request of another key, kept by another tab.
    fx.attPending = true;
    await act(async () => { fx.api.again(); });
    await waitFor(() => expect(fx.att).not.toBe(first));
    const second = fx.att;
    const copy = second.snapshot();
    second.snapshot.mockImplementation(() => copy);
    await waitFor(() => expect(second.quote).toHaveBeenCalled());
    // That tab settled its request and the store dropped it; the first send is refused for good.
    fx.attPending = false;
    await act(async () => { settle({ ok: false, reason: 'refused', kind: 'exceeds', definitive: true }); });
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(fx.att).toBe(second);
    expect(fx.api.state.phase).toBe('unknown');
    expect(second.confirm).not.toHaveBeenCalled();
  });

  it('a Confirm between the replacement and the next render sends nothing on the earlier consent', async () => {
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(1200));
    await act(async () => { fx.api.setConsent(true); });
    const first = fx.att;
    // The new attempt's quote is asked in the same effect that sends the review back to quoting: a Confirm made there
    // runs before the next render.
    fx.quoteNext = () => { fx.api.confirm(); return Promise.resolve({ charge_cents: 1200, price_cents_per_month: 1200 }); };
    await act(async () => { fx.api.again(); });
    await waitFor(() => expect(fx.att).not.toBe(first));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(fx.att.confirm).not.toHaveBeenCalled();
    expect(first.confirm).not.toHaveBeenCalled();
  });
});

describe.each([
  ['buy', '?checkout=buy&plan=fam-plus'],
  ['pay', '?checkout=pay&sub=a1b2c3d4e5f60718293a4b02'],
  ['upgrade', '?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro'],
])('%s: the words follow the key this send really used', (_kind, search) => {
  it('a refusal, a same-price re-quote, a send replaced while out and refused: a fresh review, never "may have gone through"', async () => {
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(1200));
    const first = fx.att;
    // An earlier refusal cleared the key and the re-quote kept the same price: core mints the key inside confirm().
    first.key = undefined;
    let settle: (v: unknown) => void = () => {};
    first.confirm.mockImplementation(() => { first.key = KEPT.key; return new Promise((r) => { settle = r; }); });
    await act(async () => { fx.api.setConsent(true); });
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(first.confirm).toHaveBeenCalledTimes(1));
    fx.attPending = true;
    await act(async () => { fx.api.again(); });
    await waitFor(() => expect(fx.att).not.toBe(first));
    const second = fx.att;
    const copy = second.snapshot();
    second.snapshot.mockImplementation(() => copy);
    await waitFor(() => expect(second.quote).toHaveBeenCalled());
    fx.attPending = false;
    await act(async () => { settle({ ok: false, reason: 'refused', kind: 'exceeds', definitive: true }); });
    await waitFor(() => expect(fx.att).not.toBe(second));
    await waitFor(() => expect(fx.api.state.phase).toBe('review'));
    expect(second.confirm).not.toHaveBeenCalled();
  });

  it('a kept request adopted from the store: Confirm still shows its unknown outcome and sends nothing', async () => {
    fx.attPending = true;
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    await act(async () => { fx.api.setConsent(true); fx.api.confirm(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(fx.att.confirm).not.toHaveBeenCalled();
  });
});

describe('upgrade replaced by an upgrade to another plan while its send is out', () => {
  it('Check again reads the kept upgrade the unknown outcome belongs to, by its own plan', async () => {
    await renderPage(page, { path: '/billing?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro' });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.api.state.quote?.chargeCents).toBe(1200));
    const first = fx.att;
    let settle: (v: unknown) => void = () => {};
    first.confirm.mockImplementation(() => new Promise((res) => { settle = res; }));
    await act(async () => { fx.api.setConsent(true); });
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(first.confirm).toHaveBeenCalledTimes(1));
    // The drawer moves to another plan while the first upgrade is out: a new attempt, which does not hold the first.
    const asked = fx.attArgs[1].plan.id;
    await act(async () => { fx.planOverride = `${asked}-v2`; fx.api.again(); });
    await waitFor(() => expect(fx.att).not.toBe(first));
    await act(async () => { settle({ ok: false, reason: 'unknown' }); });
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    fx.planCheck.mockImplementation(async () => ({ check: 'unknown', evidence: null }));
    await act(async () => { fx.api.checkAgain(); });
    await waitFor(() => expect(fx.planCheck).toHaveBeenCalledTimes(1));
    expect(fx.planCheck.mock.calls[0]![1]).toMatchObject({ kind: 'upgrade', subId: 'a1b2c3d4e5f60718293a4b01', planId: asked });
  });
});

describe.each([
  ['buy', '?checkout=buy&plan=fam-plus', 'buy.confirm'],
  ['pay', '?checkout=pay&sub=a1b2c3d4e5f60718293a4b02', 'subs.payConfirm'],
  ['upgrade', '?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro', 'up.confirm'],
])('%s: a Confirm kept across a replaced attempt', (_kind, search, confirmKey) => {
  it('sends nothing through the earlier attempt and leaves no posting; the newest Confirm sends once', async () => {
    await renderPage(page, { path: `/billing${search}` });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: (strings as Record<string, string>)[confirmKey] });
    await waitFor(() => expect(fx.att.quote).toHaveBeenCalled());
    const first = fx.att;
    // The api of the first attempt's render: its confirm holds that attempt.
    const kept = fx.api.confirm;
    await act(async () => { fx.api.again(); });
    await waitFor(() => expect(fx.att).not.toBe(first));
    const second = fx.att;
    await waitFor(() => expect(second.quote).toHaveBeenCalled());
    await act(async () => { fx.api.setConsent(true); });
    await act(async () => { kept(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(first.confirm).not.toHaveBeenCalled();
    expect(second.confirm).not.toHaveBeenCalled();
    expect(fx.api.state.phase).not.toBe('posting');
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(second.confirm).toHaveBeenCalledTimes(1));
    expect(first.confirm).not.toHaveBeenCalled();
  });

  it('a Confirm kept from the review, consent given, called after the drawer is gone: nothing sent', async () => {
    const r = await renderPage(page, { path: `/billing${search}` });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: (strings as Record<string, string>)[confirmKey] });
    await waitFor(() => expect(fx.att.quote).toHaveBeenCalled());
    const att = fx.att;
    await act(async () => { fx.api.setConsent(true); });
    const kept = fx.api.confirm;
    // The drawer unmounts (its machine's effect cleans up and disposes it).
    r.unmount();
    await act(async () => { kept(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(att.confirm).not.toHaveBeenCalled();
  });
});

describe('upgrade held behind another plan\'s unresolved upgrade', () => {
  it('says nothing was sent and why; no "may have gone through", no Check again', async () => {
    fx.attConfirm = { ok: false, reason: 'heldUpgrade', notSent: true };
    await renderPage(page, { path: '/billing?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro' });
    const dialog = await screen.findByRole('dialog');
    const name = strings['up.confirm'];
    await within(dialog).findByRole('button', { name });
    await waitFor(() => expect(fx.att.quote).toHaveBeenCalled());
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await userEvent.click(within(dialog).getByRole('button', { name }));
    await within(dialog).findByText(strings['up.heldOther']);
    expect(fx.api.state.phase).toBe('review');
    expect(within(dialog).queryByRole('button', { name: /^check again$/i })).toBeNull();
  });
});

describe('what Check again found is read aloud', () => {
  it('an unknown outcome: the not-confirmed line is in the banner status region', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false }];
    fx.checkRent.mockResolvedValue('absent');
    await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await within(dialog).findByText(strings['co.stillUnknown']);
    const region = within(dialog).getAllByRole('status').find((el) => el.textContent?.includes(strings['co.stillUnknown']));
    expect(region).toBeTruthy();
  });

  it('a held purchase whose plan left the list: the finding is in a status region', async () => {
    fx.pendingAll = [{ kind: 'buy', user_id: 'u1', key: 'k'.repeat(20), plan_id: 'zz-rotated', family_id: 'fam-zz', title: 'Old plan', at: 1 }];
    fx.attPending = true;
    fx.planCheck.mockImplementation(async () => ({ check: 'unknown', evidence: { kind: 'planReached' } }));
    await renderPage(page, { path: '/billing?checkout=buy&plan=zz-rotated' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['buy.checkAgain'] }));
    await within(dialog).findByText((_, el) => !!el && el.children.length === 0 && (el.textContent ?? '').includes(strings['co.checkPlanReached']));
    const region = within(dialog).getAllByRole('status').find((el) => el.textContent?.includes(strings['co.checkPlanReached']));
    expect(region).toBeTruthy();
  });
});

describe('a price that cannot be read', () => {
  it('the price error carries the rejection facts core allows (no message), for its Details', async () => {
    fx.quoteFails = true;
    await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(strings['buy.quoteErr']);
    const info = fx.api.state.quoteError;
    expect(info).toBeTruthy();
    expect(info.message).toBeNull();
    expect(Object.keys(info).sort()).toEqual(['at', 'code', 'message', 'outcome', 'page', 'perm', 'retryAfterMs', 'route', 'status', 'traceId']);
  });
});

describe('Rent again anyway', () => {
  const held = () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false }];
    fx.checkRent.mockResolvedValue('absent');
  };
  async function notConfirmed() {
    await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    // A rent read is evidence only: the drawer stays "may have gone through" (Rent again anyway still offered).
    await within(dialog).findByText(strings['co.stillUnknown']);
    return dialog;
  }

  it('offers it only after a read that did not confirm, and sends only after the explicit confirm', async () => {
    held();
    await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const first = await screen.findByRole('dialog');
    await within(first).findByRole('button', { name: /^check again$/i });
    expect(within(first).queryByRole('button', { name: strings['mkt.rentAgain'] })).toBeNull();
    await userEvent.click(within(first).getByRole('button', { name: /^check again$/i }));
    await userEvent.click(await within(first).findByRole('button', { name: strings['mkt.rentAgain'] }));
    expect(fx.pm.confirm).not.toHaveBeenCalled();
    const ask = await screen.findByText(strings['mkt.rentAgainBody']);
    expect(ask).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['mkt.rentAgainConfirm'] }));
    await waitFor(() => expect(fx.pm.confirm).toHaveBeenCalledWith(true, { rentAgainAnyway: true }));
  });

  it('a Rent again kept from the not-confirmed view, called after the drawer is gone: nothing sent', async () => {
    held();
    const r = await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await within(dialog).findByText(strings['co.stillUnknown']);
    const pm = fx.pm;
    const kept = fx.api.rentAgain;
    // The drawer unmounts: its machine's effect cleans up and disposes it, so the kept callback's machine is no longer live.
    r.unmount();
    await act(async () => { kept(); });
    await act(async () => { await new Promise((res) => setTimeout(res, 100)); });
    expect(pm.retryRent).not.toHaveBeenCalled();
    expect(pm.confirm).not.toHaveBeenCalled();
  });

  it('cancelling the question sends nothing', async () => {
    held();
    const dialog = await notConfirmed();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['mkt.rentAgain'] }));
    await screen.findByText(strings['mkt.rentAgainBody']);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['action.cancel'] }));
    expect(fx.pm.confirm).not.toHaveBeenCalled();
  });
});

describe('a reservation that looks like this one', () => {
  it('says so in one line, with the summary and no ids, when the advisory read names a match', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    await push({ state: 'indeterminate', advisory: true, retryIn: 0 });
    const line = await within(dialog).findByText(/looks like this one/i);
    expect(line.textContent).toContain('Singapore M for 30 days');
    expect(line.textContent).not.toMatch(/mkt_sin_m/);
  });

  it('shows no such line without a match', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    await push({ state: 'indeterminate', retryIn: 0 });
    await within(dialog).findByText(strings['mkt.indeterminateReserve']);
    expect(within(dialog).queryByText(/looks like this one/i)).toBeNull();
  });
});

describe('a refused rent or reserve', () => {
  it('shows the server re-quote in the summary, not the listing old total', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    expect(within(dialog).getAllByText(/10\.00/).length).toBeGreaterThan(0);
    await send(dialog, confirm);
    await push({ state: 'posting' });
    await push({ state: 'failed', failure: { code: 'CHARGE_EXCEEDS_MAX', requote: true, requoteCents: 1250 } });
    await waitFor(() => expect(within(dialog).getAllByText(/12\.50/).length).toBeGreaterThan(0));
    expect(within(dialog).queryAllByText(/\$10\.00/)).toHaveLength(0);
  });

  it('an admission refused after the confirm (nothing sent) unlocks the drawer instead of sticking in posting', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'idle', notice: 'storageFailed' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['mkt.confirmCta'] })).toBeEnabled());
    expect(dialog.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

describe('a kept attempt whose quote cannot be read', () => {
  it('still reopens on the unknown state with Check again (recovery needs no fresh quote)', async () => {
    fx.quoteFails = true;
    fx.attPending = true;
    await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['buy.quoteErr'] })).toBeNull();
  });
});

describe('a market item that is no longer listed', () => {
  it('says an earlier purchase of it is unconfirmed, instead of a plain "gone"', async () => {
    fx.rentMarks = [{ server_id: 'gone_id', name: 'Old', days: '30', at: 1, dismissed: false }];
    await renderPage(page, { path: '/billing?checkout=rent&item=gone_id&days=30' });
    expect(await screen.findByText(strings['mkt.goneHeldTitle'])).toBeInTheDocument();
  });
});

describe('a rent whose dialog was disposed while the POST was still out', () => {
  it('shows "still being sent" in the band, then "may have gone through" once the answer is unknown, and never a plain Confirm', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: true }];
    await renderPage(page);
    expect(await screen.findByText(strings['band.sendingBody'])).toBeInTheDocument();
    expect(screen.queryByText(strings['band.unknownBody'])).toBeNull();
  });

  it('follows core: the band moves from "being sent" to "may have gone through" when the POST answers', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: true }];
    await renderPage(page);
    await screen.findByText(strings['band.sendingBody']);
    fx.rentMarks = [{ ...fx.rentMarks[0], sending: false }];
    await act(async () => {
      window.dispatchEvent(new Event('storage'));
    });
    expect(await screen.findByText(strings['band.unknownBody'])).toBeInTheDocument();
    expect(screen.queryByText(strings['band.sendingBody'])).toBeNull();
  });

  it('reopening the same rent offers Check again, not Confirm, while the hold stands', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: true }];
    await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: /^check again$/i });
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
  });
});

describe('a rent marker after the POST answered unknown', () => {
  it('says "may have gone through", not "still being sent"', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: false }];
    await renderPage(page);
    expect(await screen.findByText(strings['band.unknownBody'])).toBeInTheDocument();
    expect(screen.queryByText(strings['band.sendingBody'])).toBeNull();
  });
});

describe('Continue on a top-up the machine refuses while one is held', () => {
  it('stays unknown (may have gone through), never "nothing was sent"', async () => {
    fx.tuPending = { key: 'k', method: 'card', amount: '35' };
    fx.tuSelect = false;
    await renderPage(page, { path: '/billing?sheet=funds' });
    const dialog = await screen.findByRole('dialog');
    // The restore has not reached the snapshot the form reads yet, so Continue is offered; the machine refuses it.
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['top.go'] }));
    expect(await within(dialog).findByText(strings['top.unknownTitle'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.accountChanged)).toBeNull();
    expect(within(dialog).queryByText(strings['top.failed'])).toBeNull();
  });
});

describe('Check again on a held top-up that core answers with a non-answer', () => {
  it('never says "You switched accounts. Nothing was sent."', async () => {
    fx.tuPending = { key: 'k', method: 'card', amount: '35' };
    fx.tuSelect = false;
    fx.tuCheck = { ok: false, reason: 'account' };
    await renderPage(page, { path: '/billing?sheet=funds' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['top.go'] }));
    await within(dialog).findByText(strings['top.unknownTitle']);
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['buy.checkAgain'] }));
    await waitFor(() => expect(within(dialog).getByText(strings['top.unknownTitle'])).toBeInTheDocument());
    expect(within(dialog).queryByText(strings.accountChanged)).toBeNull();
  });
});

describe('Continue while a send of the same top-up is already in flight', () => {
  it('reads busy as unknown, never "nothing was sent" or "switched accounts"', async () => {
    fx.tuSelect = true;
    await renderPage(page, { path: '/billing?sheet=funds' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['top.go'] }));
    expect(await within(dialog).findByText(strings['top.unknownTitle'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.accountChanged)).toBeNull();
  });
});

describe('Rent again anyway behind a machine that is still unknown', () => {
  it('keeps "may have gone through" and Check again, never a not-sent message', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: false }];
    fx.checkRent.mockResolvedValue('absent');
    await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['mkt.rentAgain'] }));
    fx.pm.confirm.mockReturnValueOnce({ ok: false, reason: 'busy' });
    await userEvent.click(await screen.findByRole('button', { name: strings['mkt.rentAgainConfirm'] }));
    await waitFor(() => expect(fx.pm.confirm).toHaveBeenCalledWith(true, { rentAgainAnyway: true }));
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
  });
});

describe('a held purchase whose listing left the market', () => {
  it('offers Check again, not just a message', async () => {
    fx.rentMarks = [{ server_id: 'gone_id', name: 'Old', days: '30', at: 1, dismissed: false }];
    fx.checkRent.mockResolvedValue('unknown');
    await renderPage(page, { path: '/billing?checkout=rent&item=gone_id&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['buy.checkAgain'] }));
    await waitFor(() => expect(fx.checkRent).toHaveBeenCalledTimes(1));
  });
});

describe('a verified payment return', () => {
  const back = { payment: 'a'.repeat(24), provider: 'card', status: 'success' };
  it('reads the balance again, not after the stale window', async () => {
    fx.ret = back;
    await renderPage(page);
    await screen.findByText((_c, el) => el?.getAttribute('data-band') === 'return-received');
    await waitFor(() => expect(fx.balRefetch).toHaveBeenCalledTimes(1));
  });

  it('reads the balance again when a review already credited the wallet, and not when it did not', async () => {
    fx.ret = back;
    fx.verified = { state: 'review', credited: true };
    await renderPage(page);
    await screen.findByText((_c, el) => el?.getAttribute('data-band') === 'return-review');
    await waitFor(() => expect(fx.balRefetch).toHaveBeenCalledTimes(1));
  });

  it('leaves the balance alone for a review that credited nothing', async () => {
    fx.ret = back;
    fx.verified = { state: 'review', credited: false };
    await renderPage(page);
    await screen.findByText((_c, el) => el?.getAttribute('data-band') === 'return-review');
    await new Promise((r) => setTimeout(r, 200));
    expect(fx.balRefetch).not.toHaveBeenCalled();
  });

  it('leaves the balance alone when the return is not a credit', async () => {
    fx.ret = back;
    fx.verified = { state: 'processing' };
    await renderPage(page);
    await screen.findByText((_c, el) => el?.getAttribute('data-band') === 'return-processing');
    await new Promise((r) => setTimeout(r, 200));
    expect(fx.balRefetch).not.toHaveBeenCalled();
  });
});

describe('a held purchase whose listing left the market: what Check again found', () => {
  const goneRent = () => {
    fx.rentMarks = [{ server_id: 'gone_id', name: 'Old', days: '30', at: 1, dismissed: false }];
  };
  const openGone = async (kind: 'rent' | 'reserve') => {
    await renderPage(page, { path: `/billing?checkout=${kind}&item=gone_id&days=30` });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['buy.checkAgain'] }));
    return dialog;
  };

  it('an active rental is evidence only: "may have gone through" with what the read saw, the hold kept', async () => {
    goneRent();
    fx.checkRent.mockResolvedValue('active');
    const dialog = await openGone('rent');
    expect(await within(dialog).findByText(strings['co.checkRented'])).toBeInTheDocument();
    expect(within(dialog).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['mkt.rentedTitle'])).toBeNull();
    expect(within(dialog).queryByText(strings['mkt.listingGone'])).toBeNull();
  });

  it('a rental that is absent is no proof either: still not confirmed, never "nothing was sent"', async () => {
    goneRent();
    fx.checkRent.mockResolvedValue('absent');
    const dialog = await openGone('rent');
    expect(await within(dialog).findByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['mkt.goneNoneTitle'])).toBeNull();
    expect(within(dialog).queryByText(/nothing was sent/i)).toBeNull();
  });

  it('a read that cannot say keeps the hold and says it is still not confirmed', async () => {
    goneRent();
    fx.checkRent.mockResolvedValue('unknown');
    const dialog = await openGone('rent');
    expect(await within(dialog).findByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] })).toBeInTheDocument();
  });

  it('a reservation is recovered from the held record alone: the confirmed resend sends its kept request without the catalogue', async () => {
    fx.marketPend = [{ user_id: 'u1', offer_id: 'gone_id', days: '30', ceiling: 1000, key: 'k'.repeat(20), at: 1, name: 'Old offer' }];
    fx.onRetry = (opts) => {
      queueMicrotask(() => opts.onChange(snap({ state: 'confirmed', receipt: { total_paid_cents: 900 } })));
      return true;
    };
    const dialog = await openGone('reserve');
    await resendIn(dialog);
    expect(await within(dialog).findByText(strings['mkt.reservedTitle'])).toBeInTheDocument();
    expect(fx.created[0].retry).toHaveBeenCalled();
    expect(fx.opts.recover.offer_id).toBe('gone_id');
  });

  it('a reservation without Web Locks: Check again only, and why; no resend and no charge words', async () => {
    fx.marketPend = [{ user_id: 'u1', offer_id: 'gone_id', days: '30', ceiling: 1000, key: 'k'.repeat(20), at: 1, name: 'Old offer' }];
    const was = Object.getOwnPropertyDescriptor(navigator, 'locks');
    try {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
      const dialog = await openGone('reserve');
      expect(await within(dialog).findByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
      // The reason, as the live view gives it: this browser cannot send it again or start a new one.
      expect(within(dialog).getByText(strings['mkt.reserveNoLocks'])).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] })).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: strings['co.resend'] })).toBeNull();
      expect(within(dialog).queryByText(/charges up to|charges your wallet/)).toBeNull();
      // Check again only reads, and the reason stays.
      await userEvent.click(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] }));
      await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] })).toBeEnabled());
      expect(within(dialog).getByText(strings['mkt.reserveNoLocks'])).toBeInTheDocument();
      expect(fx.created.flatMap((c: { retry: { mock: { calls: unknown[] } } }) => c.retry.mock.calls)).toEqual([]);
    } finally {
      if (was) Object.defineProperty(navigator, 'locks', was);
    }
  });

  it('a reservation resend confirmed without locks says why; with locks back Check again keeps it, a later resend refused for another reason replaces it', async () => {
    fx.marketPend = [{ user_id: 'u1', offer_id: 'gone_id', days: '30', ceiling: 1000, key: 'k'.repeat(20), at: 1, name: 'Old offer' }];
    fx.onRetry = () => false;
    const was = Object.getOwnPropertyDescriptor(navigator, 'locks');
    try {
      const dialog = await openGone('reserve');
      await userEvent.click(await within(dialog).findByRole('button', { name: strings['co.resend'] }));
      const ask = await screen.findByRole('alertdialog', { name: strings['co.resendTitle'] });
      // The locks go between drawing the resend and its confirm: nothing is sent, and the view says why.
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
      await userEvent.click(within(ask).getByRole('button', { name: strings['co.resendConfirm'] }));
      expect(await within(dialog).findByText(strings.noLocks)).toBeInTheDocument();
      const retried = () => fx.created.filter((c: { retry: { mock: { calls: unknown[] } } }) => c.retry.mock.calls.length > 0).length;
      expect(retried()).toBe(0);
      if (was) Object.defineProperty(navigator, 'locks', was);
      // Check again only reads: the explanation stays with the attempt.
      await userEvent.click(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] }));
      await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] })).toBeEnabled());
      expect(within(dialog).getByText(strings.noLocks)).toBeInTheDocument();
      // A resend's own answer replaces the explanation (here the machine refuses it for another reason).
      await resendIn(dialog);
      await waitFor(() => expect(retried()).toBe(1));
      await waitFor(() => expect(within(dialog).queryByText(strings.noLocks)).toBeNull());
      expect(within(dialog).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
    } finally {
      if (was) Object.defineProperty(navigator, 'locks', was);
    }
  });

  it('a reservation resend that really goes out (posting, then unknown) clears the no-locks words', async () => {
    fx.marketPend = [{ user_id: 'u1', offer_id: 'gone_id', days: '30', ceiling: 1000, key: 'k'.repeat(20), at: 1, name: 'Old offer' }];
    fx.onRetry = () => false;
    const was = Object.getOwnPropertyDescriptor(navigator, 'locks');
    try {
      const dialog = await openGone('reserve');
      await userEvent.click(await within(dialog).findByRole('button', { name: strings['co.resend'] }));
      const ask = await screen.findByRole('alertdialog', { name: strings['co.resendTitle'] });
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
      await userEvent.click(within(ask).getByRole('button', { name: strings['co.resendConfirm'] }));
      expect(await within(dialog).findByText(strings.noLocks)).toBeInTheDocument();
      if (was) Object.defineProperty(navigator, 'locks', was);
      // Check again (a read) draws the view again with locks back: the reason stays, and the resend is offered.
      await userEvent.click(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] }));
      await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] })).toBeEnabled());
      expect(within(dialog).getByText(strings.noLocks)).toBeInTheDocument();
      // With locks back the resend leaves: the machine posts it, and its answer is lost (unknown).
      let sent = 0;
      fx.onRetry = (opts) => {
        sent++;
        queueMicrotask(() => {
          opts.onChange(snap({ state: 'posting', mode: 'replay', idemKey: 'k'.repeat(20) }));
          opts.onChange(snap({ state: 'indeterminate', mode: 'replay', idemKey: 'k'.repeat(20) }));
        });
        return true;
      };
      await resendIn(dialog);
      await waitFor(() => expect(sent).toBe(1));
      await waitFor(() => expect(within(dialog).queryByText(strings.noLocks)).toBeNull());
      expect(within(dialog).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
      expect(within(dialog).queryByText(strings['mkt.goneNoneTitle'])).toBeNull();
      // It went out: never "wasn't sent again".
      expect(within(dialog).queryByText(strings['held.resendNotSent'], { exact: false })).toBeNull();
    } finally {
      if (was) Object.defineProperty(navigator, 'locks', was);
    }
  });

  it('a reservation resend whose Locks API rejects: nothing sent, still unknown, and says why', async () => {
    fx.marketPend = [{ user_id: 'u1', offer_id: 'gone_id', days: '30', ceiling: 1000, key: 'k'.repeat(20), at: 1, name: 'Old offer' }];
    // Core's admission refuses for want of a granted lock: the machine stays indeterminate with the noLocks notice.
    fx.onRetry = (opts) => {
      queueMicrotask(() => opts.onChange(snap({ state: 'indeterminate', idemKey: 'k'.repeat(20), notice: 'noLocks', retrying: false })));
      return true;
    };
    const dialog = await openGone('reserve');
    expect(within(dialog).queryByText(strings.noLocks)).toBeNull();
    await resendIn(dialog);
    expect(await within(dialog).findByText(strings.noLocks)).toBeInTheDocument();
    expect(within(dialog).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['mkt.goneNoneTitle'])).toBeNull();
    // A Locks API that is present is not taken away on one rejection: the resend stays offered.
    expect(within(dialog).getByRole('button', { name: strings['co.resend'] })).toBeInTheDocument();
  });

  it('a replay the machine refuses stays unknown, never "nothing found"', async () => {
    fx.marketPend = [{ user_id: 'u1', offer_id: 'gone_id', days: '30', ceiling: 1000, key: 'k'.repeat(20), at: 1, name: 'Old offer' }];
    fx.onRetry = () => false;
    const dialog = await openGone('reserve');
    expect(await within(dialog).findByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['mkt.goneNoneTitle'])).toBeNull();
  });

  // A resend refused before anything left says so; one that went out does not.
  const keptRes = () => [{ user_id: 'u1', offer_id: 'gone_id', days: '30', ceiling: 1000, key: 'k'.repeat(20), at: 1, name: 'Old offer' }];
  it('a reservation resend the machine refuses (Retry-After, suspended, owner gone) says it was not sent, still unknown', async () => {
    fx.marketPend = keptRes();
    fx.onRetry = () => false;
    const dialog = await openGone('reserve');
    expect(within(dialog).queryByText(strings['held.resendNotSent'], { exact: false })).toBeNull();
    await resendIn(dialog);
    expect(await within(dialog).findByText(strings['held.resendNotSent'], { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['mkt.goneNoneTitle'])).toBeNull();
    // Recovery stays: the resend is still offered.
    expect(within(dialog).getByRole('button', { name: strings['co.resend'] })).toBeInTheDocument();
  });
  it('a reservation resend with no answer past the 30 s bound stays plain unknown: never "not sent"', async () => {
    fx.marketPend = keptRes();
    // Accepted for admission, and nothing more is ever heard: the held resend gives up at its own bound.
    fx.onRetry = () => true;
    const dialog = await openGone('reserve');
    // The 30 s bound is the held resend's own timer: caught and fired here, never waited for.
    const timers = vi.spyOn(window, 'setTimeout');
    await resendIn(dialog);
    // The bound is the timer the resend starts in the same synchronous step, right before it makes the machine: the
    // setTimeout call immediately before that machine's createPurchase, and it must be a 30 s one. Any timer that ever
    // lands between the two fails here, loudly, instead of being fired in the bound's place.
    const resent = () => fx.created.find((c: { retry: { mock: { calls: unknown[] } } }) => c.retry.mock.calls.length === 1);
    await waitFor(() => expect(resent()).toBeDefined());
    const madeAt = resent().made.mock.invocationCallOrder[0] as number;
    const before = timers.mock.calls.map((c, i) => ({ c, at: timers.mock.invocationCallOrder[i]! })).filter((t) => t.at < madeAt);
    const last = before[before.length - 1];
    expect(last?.c[1]).toBe(30000);
    const bound = last!.c[0] as () => void;
    timers.mockRestore();
    const notSent = () => within(dialog).queryByText(strings['held.resendNotSent'], { exact: false });
    expect(notSent()).toBeNull();
    await act(async () => { bound(); });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] })).toBeEnabled());
    expect(within(dialog).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
    expect(notSent()).toBeNull();
    expect(within(dialog).queryByText(strings['mkt.goneNoneTitle'])).toBeNull();
    expect(fx.created.some((c: { retry: { mock: { calls: unknown[] } } }) => c.retry.mock.calls.length === 1)).toBe(true);
  });
  it('a reservation resend whose admission core refused (kept request changed under the lock) says it was not sent', async () => {
    fx.marketPend = keptRes();
    fx.onRetry = (opts) => {
      queueMicrotask(() => opts.onChange(snap({ state: 'indeterminate', idemKey: 'k'.repeat(20), notice: null, retrying: false })));
      return true;
    };
    const dialog = await openGone('reserve');
    await resendIn(dialog);
    expect(await within(dialog).findByText(strings['held.resendNotSent'], { exact: false })).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.noLocks)).toBeNull();
  });
  it('a reservation whose kept request changed after the dialog opened: nothing sent, and it says so', async () => {
    fx.marketPend = keptRes();
    const dialog = await openGone('reserve');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['co.resend'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['co.resendTitle'] });
    // Another tab replaced the kept request (a new ceiling) before the confirm.
    fx.marketPend = [{ ...keptRes()[0], ceiling: 1500 }];
    await userEvent.click(within(ask).getByRole('button', { name: strings['co.resendConfirm'] }));
    expect(await within(dialog).findByText(strings['held.resendNotSent'], { exact: false })).toBeInTheDocument();
    expect(fx.created.flatMap((c: { retry: { mock: { calls: unknown[] } } }) => c.retry.mock.calls)).toEqual([]);
  });
});

describe('Rent again anyway while the first rent POST is still out', () => {
  it('is not offered until that POST has settled', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: true }];
    fx.checkRent.mockResolvedValue('unknown');
    await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkRent).toHaveBeenCalled());
    await within(dialog).findByRole('button', { name: /^check again$/i });
    expect(within(dialog).queryByRole('button', { name: strings['mkt.rentAgain'] })).toBeNull();
  });
});

describe('the receipt of a reservation or rental', () => {
  it('shows what was debited, not the ceiling the person authorised', async () => {
    const { dialog, confirm } = await openMarket('rent');
    await send(dialog, confirm);
    await push({ state: 'posting', rail: 'rent' });
    await push({ state: 'confirmed', rail: 'rent', ceiling: 1000, receipt: { rental: { total_paid_cents: 900 } } });
    expect(await within(dialog).findByText(/\$9\.00/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/\$10\.00/)).toBeNull();
  });

  it('says so when the answer carries no amount, instead of printing the ceiling or a dash', async () => {
    const { dialog, confirm } = await openMarket('rent');
    await send(dialog, confirm);
    await push({ state: 'posting', rail: 'rent' });
    await push({ state: 'confirmed', rail: 'rent', ceiling: 1000, receipt: { rental: {} } });
    expect(await within(dialog).findByText(/Check your latest balances under Wallet & usage/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/\$10\.00/)).toBeNull();
  });
});

describe('Start a new purchase on a held rent', () => {
  it('is not offered while core still holds the rent, since it would only restore the hold', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: false }];
    fx.checkRent.mockResolvedValue('absent');
    await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await within(dialog).findByText(strings['co.stillUnknown']);
    expect(within(dialog).queryByRole('button', { name: strings['mkt.recoverNew'] })).toBeNull();
  });
});

describe('a held buy whose plan left the list', () => {
  const held = () => {
    fx.pendingAll = [{ kind: 'buy', user_id: 'u1', key: 'k'.repeat(20), plan_id: 'zz-rotated', family_id: 'fam-zz', title: 'Old plan', at: 1 }];
    fx.attPending = true;
  };
  const open = async (extra = '') => {
    await renderPage(page, { path: `/billing?checkout=buy&plan=zz-rotated${extra}` });
    return screen.findByRole('dialog');
  };

  it('offers Check again from the held record, never "plan is not on sale" alone', async () => {
    held();
    const dialog = await open();
    expect(await within(dialog).findByRole('button', { name: strings['buy.checkAgain'] })).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['co.planGone'])).toBeNull();
  });

  it('the confirmed resend sends the kept request: a confirmed answer reads as confirmed and reads the balance and subscriptions again', async () => {
    held();
    fx.attConfirm = { ok: true, result: { operation: {}, subscription: {}, replayed: true, failed: false } };
    const dialog = await open();
    await resendIn(dialog);
    expect(await within(dialog).findByText(strings['held.doneTitle'])).toBeInTheDocument();
    expect(within(dialog).getByText(strings['held.doneBody'])).toBeInTheDocument();
    expect(fx.att.confirm).toHaveBeenCalledTimes(1);
    expect(fx.balRefetch).toHaveBeenCalled();
  });

  it('a charge whose setup failed shows the setup failure and its reference, never "confirmed"', async () => {
    held();
    fx.attConfirm = { ok: true, result: { operation: { id: 'op_7Xk29Qa81f03' }, subscription: {}, replayed: true, failed: true } };
    const dialog = await open();
    await resendIn(dialog);
    expect(await within(dialog).findByText(strings['buy.failedTitle'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['held.doneTitle'])).toBeNull();
    expect(within(dialog).getByText(strings['co.setupFailedNoAmount'])).toBeInTheDocument();
    expect(dialog.querySelector('[translate="no"]')?.textContent).toBeTruthy(); // the support reference chip
  });

  it('a replay the server had never seen is a charge made now, never "nothing new was charged"', async () => {
    held();
    fx.attConfirm = { ok: true, result: { operation: {}, subscription: {}, replayed: false, failed: false } };
    const dialog = await open();
    await resendIn(dialog);
    expect(await within(dialog).findByText(strings['held.doneNowBody'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['held.doneBody'])).toBeNull();
  });

  it('a definite refusal says it was refused; an unclear answer stays not confirmed', async () => {
    held();
    const dialog = await open();
    await resendIn(dialog);
    expect(await within(dialog).findByText(strings['held.goneTitle'])).toBeInTheDocument();
  });

  it('an intent mismatch is never "nothing was charged": it stays unknown', async () => {
    held();
    fx.attConfirm = { ok: false, reason: 'refused', definitive: true, kind: 'intent' };
    const dialog = await open();
    await resendIn(dialog);
    expect(await within(dialog).findByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['held.goneTitle'])).toBeNull();
  });

  it('an answer that stays unknown keeps Check again and says so', async () => {
    held();
    fx.attConfirm = { ok: false, reason: 'unknown', key: 'k' };
    const dialog = await open();
    await resendIn(dialog);
    expect(await within(dialog).findByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
  });

  it('with no kept request core holds, nothing is ever sent', async () => {
    fx.pendingAll = [{ kind: 'buy', user_id: 'u1', key: 'k'.repeat(20), plan_id: 'zz-rotated', family_id: 'fam-zz', title: 'Old plan', at: 1 }];
    fx.attPending = false;
    const dialog = await open();
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['buy.checkAgain'] }));
    await within(dialog).findByText(strings['mkt.goneStillBody']);
    expect(fx.att.confirm).not.toHaveBeenCalled();
  });

  it('?check=true runs the check by itself, once: a read, never a send', async () => {
    held();
    fx.attConfirm = { ok: false, reason: 'unknown', key: 'k' };
    const dialog = await open('&check=true');
    await waitFor(() => expect(fx.planCheck).toHaveBeenCalledTimes(1));
    await within(dialog).findByText(strings['mkt.goneStillBody']);
    expect(fx.att?.confirm ?? vi.fn()).not.toHaveBeenCalled();
  });
  it('Check again from the held record reads only, never sends', async () => {
    held();
    const dialog = await open();
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['buy.checkAgain'] }));
    await waitFor(() => expect(fx.planCheck).toHaveBeenCalledTimes(1));
    await within(dialog).findByText(strings['mkt.goneStillBody']);
    expect(fx.att?.confirm ?? vi.fn()).not.toHaveBeenCalled();
  });
});

describe('a retained upgrade whose subscription is not in the list', () => {
  it('still shows its Check again band', async () => {
    fx.upgrades = [{ key: 'k'.repeat(20), plan_id: 'p2', sub_id: 'sub_gone_1234', title: 'Pro', user_id: 'u1', at: 1 }];
    await renderPage(page);
    expect(await screen.findByText(strings['band.unknownBody'])).toBeInTheDocument();
  });
});

describe('a plain Confirm that core holds behind an earlier unresolved purchase', () => {
  it('reads as unknown with Check again, never "nothing was charged"', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    fx.pm.confirm.mockReturnValueOnce({ ok: false, reason: 'unresolved' });
    await send(dialog, confirm);
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
  });
});

describe('Rent again anyway reads core at the moment of the press', () => {
  it('sends nothing when another tab started sending after the last render', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: false }];
    fx.checkRent.mockResolvedValue('absent');
    await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['mkt.rentAgain'] }));
    // The marker changes with no event and no re-render in between.
    fx.rentMarks = [{ ...fx.rentMarks[0], sending: true }];
    await userEvent.click(await screen.findByRole('button', { name: strings['mkt.rentAgainConfirm'] }));
    expect(fx.pm.confirm).not.toHaveBeenCalledWith(true, { rentAgainAnyway: true });
  });
});

describe('a rent hold that storage refused to keep', () => {
  it('says only this tab remembers it, and says nothing when it was saved', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: false, persisted: false }];
    await renderPage(page);
    expect(await screen.findByText(strings['band.notSaved'])).toBeInTheDocument();
  });

  it('shows no such line for a saved hold', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: false, persisted: true }];
    await renderPage(page);
    await screen.findByText(strings['band.unknownBody']);
    expect(screen.queryByText(strings['band.notSaved'])).toBeNull();
  });
});

describe('Check again when core has nothing to read', () => {
  it('reserve: an idle machine puts the drawer back on the unknown view, unlocked', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    fx.pm.confirm.mockReturnValueOnce({ ok: false, reason: 'unresolved' });
    await send(dialog, confirm);
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /^check again$/i })).toBeEnabled());
    expect(dialog.querySelector('[aria-busy="true"]')).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('rent: a second Check again after the marker expired goes back to the unknown view', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: false }];
    fx.checkRent.mockResolvedValue('absent');
    await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await within(dialog).findByText(strings['co.stillUnknown']);
    fx.rentMarks = [];
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /^check again$/i })).toBeEnabled());
    expect(dialog.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

describe('an admission refused because an earlier reserve is unresolved', () => {
  it('reads as unknown with Check again, never "nothing was charged"', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'idle', notice: 'unresolvedReserve' });
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
  });
  // The idle machine
  // reads nothing (refresh answers false), so the drawer reads the reservations itself, for this drawer's term since
  // its Confirm even when no key is kept any more (another tab sent it and dropped it). Evidence only, nothing sent.
  it('Check again from the idle machine really reads the reservations (term, since its Confirm) and shows a match as evidence', async () => {
    const at = '2026-11-10T03:00:00Z';
    fx.checkReserve.mockResolvedValueOnce({ check: 'unknown', evidence: { kind: 'reserved', at } });
    const { dialog, confirm } = await openMarket('reserve');
    const before = Date.now();
    await send(dialog, confirm);
    await push({ state: 'idle', notice: 'unresolvedReserve' });
    fx.pm.refresh.mockResolvedValue(false);
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkReserve).toHaveBeenCalledTimes(1));
    const [, item, gone] = fx.checkReserve.mock.calls[0] as [unknown, string, { days: string; since: number }];
    expect(item).toBe('mkt_sin_m');
    expect(gone.days).toBe('30');
    expect(gone.since).toBeGreaterThanOrEqual(before);
    expect(gone.since).toBeLessThanOrEqual(Date.now());
    expect(await within(dialog).findByText(/A reservation of this offer was made at .+\. It may be this one\./)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    expect(fx.created.reduce((n: number, m: any) => n + m.confirm.mock.calls.length, 0)).toBe(1);
  });
  // A hold that refused this drawer's own Confirm is read too: this term since the earlier
  // of the two, or the hold's own term since it began.
  it('Check again after a Confirm an earlier hold of this term refused reads since the earlier of the two', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    fx.reserveUnknown = { since: 1_600_000_000_000 };
    await push({ state: 'idle', notice: 'unresolvedReserve' });
    fx.pm.refresh.mockResolvedValue(false);
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkReserve).toHaveBeenCalledTimes(1));
    const gone = fx.checkReserve.mock.calls[0]![2] as { days: string; since: number };
    expect(gone.days).toBe('30');
    expect(gone.since).toBe(1_600_000_000_000);
  });
  it('Check again after a Confirm a hold of another term refused reads that term since the hold began', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    fx.reserveUnknown = { since: 1_600_000_000_000, days: '7' };
    await push({ state: 'idle', notice: 'unresolvedReserve' });
    fx.pm.refresh.mockResolvedValue(false);
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkReserve).toHaveBeenCalledTimes(1));
    const gone = fx.checkReserve.mock.calls[0]![2] as { days: string; since: number };
    expect(gone.days).toBe('7');
    expect(gone.since).toBe(1_600_000_000_000);
  });
  it('Check again from the idle machine with nothing found stays "may have gone through", no resend', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'idle', notice: 'unresolvedReserve' });
    fx.pm.refresh.mockResolvedValue(false);
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkReserve).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeEnabled();
    expect(within(dialog).getByText(strings['mkt.indeterminateReserve'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['co.resend'] })).toBeNull();
  });
  it('an idle machine is not asked to refresh: the drawer reads once, itself', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'idle', notice: 'unresolvedReserve' });
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkReserve).toHaveBeenCalledTimes(1));
    expect(fx.pm.refresh).not.toHaveBeenCalled();
  });
  // The choice is the current machine's own state, read when Check again runs, not the last rendered
  // snapshot (which may be an earlier machine's, or lag its own). Idle now though last shown at outcome unknown: the drawer reads.
  it('the choice follows the machine\'s state now: shown at outcome unknown but idle now, the drawer reads, no refresh', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting', idemKey: 'q'.repeat(20), ceiling: 1000 });
    await push({ state: 'indeterminate', retryIn: 0, idemKey: 'q'.repeat(20), ceiling: 1000 });
    fx.pm.snapshot.mockReturnValue(snap({ state: 'idle', notice: 'unresolvedReserve' }));
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkReserve).toHaveBeenCalledTimes(1));
    expect(fx.pm.refresh).not.toHaveBeenCalled();
  });
  it('the choice follows the machine\'s state now: shown idle but at outcome unknown now, the machine reads, no drawer read', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'idle', notice: 'unresolvedReserve' });
    fx.pm.snapshot.mockReturnValue(snap({ state: 'indeterminate', idemKey: 'q'.repeat(20), ceiling: 1000 }));
    fx.pm.refresh.mockResolvedValue(true);
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.pm.refresh).toHaveBeenCalledTimes(1));
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(fx.checkReserve).not.toHaveBeenCalled();
  });
  // An answer is never dropped (a dropped one would leave the drawer checking), but only its own check takes
  // it. A check left behind by a machine change is not settled by its late answer once a newer check runs.
  it('a late answer of an earlier check never settles a newer one', async () => {
    let answerA: (h: unknown) => void = () => undefined;
    fx.checkReserve.mockReturnValueOnce(new Promise((r) => { answerA = r; }));
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'idle', notice: 'unresolvedReserve' });
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkReserve).toHaveBeenCalledTimes(1));
    // The machine moves on while the read runs: the drawer leaves that check for the machine's outcome unknown.
    await push({ state: 'posting', idemKey: 'q'.repeat(20), ceiling: 1000 });
    await push({ state: 'indeterminate', retryIn: 0, idemKey: 'q'.repeat(20), ceiling: 1000 });
    fx.pm.refresh.mockReturnValue(new Promise(() => undefined));
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.pm.refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull());
    await act(async () => { answerA({ check: 'unknown', evidence: { kind: 'reserved', at: '2026-11-10T03:00:00Z' } }); });
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(dialog).queryByText(/A reservation of this offer was made at/)).toBeNull();
  });
  // A machine replaced while its check runs (a reread of the row makes a new one) never leaves the
  // drawer checking: the drawer's own read still settles it, and so does a refresh that read (true) on the replaced
  // machine, whose snapshot never arrives (it is disposed).
  it('replaced while the drawer reads for the idle machine: the answer still settles the check', async () => {
    let answer: (h: unknown) => void = () => undefined;
    fx.checkReserve.mockReturnValueOnce(new Promise((r) => { answer = r; }));
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'idle', notice: 'unresolvedReserve' });
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkReserve).toHaveBeenCalledTimes(1));
    const n = fx.created.length;
    await act(async () => { fx.api.reload(); });
    await waitFor(() => expect(fx.created.length).toBeGreaterThan(n));
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    await act(async () => { answer({ check: 'unknown', evidence: { kind: 'reserved', at: '2026-11-10T03:00:00Z' } }); });
    await waitFor(() => expect(dialog.querySelector('[aria-busy="true"]')).toBeNull());
    expect(await within(dialog).findByText(/A reservation of this offer was made at/)).toBeInTheDocument();
  });
  it('replaced while its machine refreshes (and the refresh read, true): the check is settled, never left checking', async () => {
    let done: (r: boolean) => void = () => undefined;
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting', idemKey: 'q'.repeat(20), ceiling: 1000 });
    await push({ state: 'indeterminate', retryIn: 0, idemKey: 'q'.repeat(20), ceiling: 1000 });
    const old = fx.pm;
    old.refresh.mockReturnValue(new Promise<boolean>((r) => { done = r; }));
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(old.refresh).toHaveBeenCalledTimes(1));
    const n = fx.created.length;
    await act(async () => { fx.api.reload(); });
    await waitFor(() => expect(fx.created.length).toBeGreaterThan(n));
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    await act(async () => { done(true); });
    await waitFor(() => expect(dialog.querySelector('[aria-busy="true"]')).toBeNull());
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeEnabled();
    expect(fx.checkReserve).not.toHaveBeenCalled();
  });
  // A machine at outcome unknown reads itself; a refresh that read and then went stale answers false,
  // which must not start a second read by the drawer.
  it('a machine at outcome unknown whose refresh read and went stale (false) gets no second read from the drawer', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting', idemKey: 'q'.repeat(20), ceiling: 1000 });
    await push({ state: 'indeterminate', retryIn: 0, idemKey: 'q'.repeat(20), ceiling: 1000 });
    fx.pm.refresh.mockResolvedValue(false);
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.pm.refresh).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeEnabled();
    expect(fx.checkReserve).not.toHaveBeenCalled();
  });
});

// A reserve this tab remembers as unresolved, whose kept key may be gone.
describe('a reserve this tab remembers as unresolved, whose key may be gone', () => {
  it('a reopened drawer of that term starts on outcome unknown: no Confirm, Check again reads since its Confirm as its own account', async () => {
    fx.reserveUnknown = { since: 1_700_000_000_000 };
    await renderPage(page, { path: '/billing?checkout=reserve&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    const check = await within(dialog).findByRole('button', { name: /^check again$/i });
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    await userEvent.click(check);
    await waitFor(() => expect(fx.checkReserve).toHaveBeenCalledTimes(1));
    expect(fx.checkReserve.mock.calls[0]![2]).toEqual({ days: '30', since: 1_700_000_000_000, owner: 'u1' });
    expect(fx.created.reduce((n: number, m: any) => n + m.confirm.mock.calls.length, 0)).toBe(0);
  });
  // On the key-gone path (no resend) Start a new purchase is the outcome banner's action, and
  // it waits (disabled) while a Check again runs.
  it('Start a new purchase sits in the outcome banner and is disabled while Check again runs', async () => {
    fx.reserveUnknown = { since: 1_700_000_000_000 };
    let release: (v: unknown) => void = () => {};
    fx.checkReserve.mockImplementation(() => new Promise((r) => { release = r; }));
    await renderPage(page, { path: '/billing?checkout=reserve&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    const slot = await waitFor(() => dialog.querySelector('[data-outcome-actions]') as HTMLElement);
    expect(slot.closest('[role="alert"]')).toHaveAttribute('data-outcome', 'pending');
    const startNew = within(slot).getByRole('button', { name: strings['mkt.recoverNew'] });
    expect(startNew).toBeEnabled();
    expect(within(slot).queryByRole('button', { name: strings['co.resend'] })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkReserve).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['mkt.recoverNew'] })).toBeDisabled());
    await act(async () => { release({ check: 'unknown', evidence: null }); });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['mkt.recoverNew'] })).toBeEnabled());
  });
  // A hold of another term of the offer holds this drawer too, and Check again reads the held term.
  it('a hold of another term of the offer: this term opens on outcome unknown too, and Check again reads the held term', async () => {
    fx.reserveUnknown = { since: 1_700_000_000_000, days: '7' };
    await renderPage(page, { path: '/billing?checkout=reserve&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkReserve).toHaveBeenCalledTimes(1));
    expect(fx.checkReserve.mock.calls[0]![2]).toEqual({ days: '7', since: 1_700_000_000_000, owner: 'u1' });
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
  });
  it('Start a new purchase, confirmed, forgets it and opens a fresh review; nothing is sent by it', async () => {
    fx.reserveUnknown = { since: 1_700_000_000_000 };
    await renderPage(page, { path: '/billing?checkout=reserve&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['mkt.recoverNew'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['mkt.reserveNewTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['mkt.reserveNewConfirm'] }));
    await waitFor(() => expect(fx.forgetUnknown).toHaveBeenCalledTimes(1));
    expect(fx.forgetUnknown.mock.calls[0]![1]).toBe('mkt_sin_m');
    expect(fx.forgetUnknown.mock.calls[0]![2]).toBe('30');
    expect(await within(dialog).findByRole('checkbox')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^check again$/i })).toBeNull();
    expect(fx.created.reduce((n: number, m: any) => n + m.confirm.mock.calls.length, 0)).toBe(0);
  });
  it('core finds a key kept (or cannot say): the hold stays, no fresh review, nothing sent', async () => {
    fx.reserveUnknown = { since: 1_700_000_000_000 };
    fx.forgetAnswer = 'kept';
    await renderPage(page, { path: '/billing?checkout=reserve&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['mkt.recoverNew'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['mkt.reserveNewTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['mkt.reserveNewConfirm'] }));
    await waitFor(() => expect(fx.forgetUnknown).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByText(strings['mkt.reserveNewStoreErr'])).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    expect(fx.created.reduce((n: number, m: any) => n + m.confirm.mock.calls.length, 0)).toBe(0);
  });
  // A kept key of the term and the remembered hold together: abandoning the key forgets the hold too,
  // so the confirmed Start a new purchase gives the fresh review it promised.
  it('a kept key and the hold together: Start a new purchase abandons the key and forgets the hold, then a fresh review', async () => {
    // The hold is that key's own (the admission that wrote it).
    fx.reserveUnknown = { since: 1_700_000_000_000, key: 'q'.repeat(20) };
    fx.marketPend = [{ user_id: 'u1', offer_id: 'mkt_sin_m', days: '30', ceiling: 1000, key: 'q'.repeat(20), at: 1, name: 'Singapore M' }];
    await renderPage(page, { path: '/billing?checkout=reserve&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: /^check again$/i });
    await push({ state: 'indeterminate', retryIn: 0, idemKey: 'q'.repeat(20), ceiling: 1000 });
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['mkt.recoverNew'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['mkt.reserveNewTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['mkt.reserveNewConfirm'] }));
    await waitFor(() => expect(fx.forgetKept).toHaveBeenCalledTimes(1));
    expect(fx.forgetKept.mock.calls[0]![1]).toBe('mkt_sin_m');
    expect(fx.forgetKept.mock.calls[0]![2]).toBe('30');
    expect(fx.forgetKept.mock.calls[0]![3]).toBe('q'.repeat(20));
    expect(await within(dialog).findByRole('checkbox')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^check again$/i })).toBeNull();
  });
  // The forget after a keyed abandon names the abandoned key and runs under the context the
  // abandon was confirmed in (never a fresh capture). A same-term hold of ANOTHER key (another admission, outcome
  // unknown) stays: the drawer stays on outcome unknown and nothing can be confirmed beside it.
  it('a kept key B and a same-term hold of key A: abandoning B keeps A; the drawer stays unknown, nothing sent', async () => {
    fx.reserveUnknown = { since: 1_700_000_000_000, key: 'a'.repeat(20) };
    fx.marketPend = [{ user_id: 'u1', offer_id: 'mkt_sin_m', days: '30', ceiling: 1000, key: 'q'.repeat(20), at: 1, name: 'Singapore M' }];
    let open!: () => void;
    fx.abandonGate = new Promise<void>((r) => (open = r));
    await renderPage(page, { path: '/billing?checkout=reserve&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: /^check again$/i });
    await push({ state: 'indeterminate', retryIn: 0, idemKey: 'q'.repeat(20), ceiling: 1000 });
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['mkt.recoverNew'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['mkt.reserveNewTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['mkt.reserveNewConfirm'] }));
    await waitFor(() => expect(fx.abandonCtx).not.toBeNull());
    await act(async () => open());
    await waitFor(() => expect(fx.forgetKept).toHaveBeenCalledTimes(1));
    expect(fx.forgetKept.mock.calls[0]![0]).toBe(fx.abandonCtx);
    expect(fx.forgetKept.mock.calls[0]![3]).toBe('q'.repeat(20));
    expect(fx.reserveUnknown).toEqual({ since: 1_700_000_000_000, key: 'a'.repeat(20) });
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    expect(fx.created.reduce((n: number, m: any) => n + m.confirm.mock.calls.length, 0)).toBe(0);
  });
  // MONEY: Start a new purchase abandons only the request its dialog showed. A remembered hold of another term was never
  // shown there and may still go through: it stays, and the drawer reopens on it (outcome unknown, Check again), so
  // nothing new can be confirmed beside it until the person settles that one on its own.
  it('a kept key and a hold of another term: Start a new purchase abandons only the shown key; the other hold stays and the drawer reopens on it', async () => {
    fx.reserveUnknown = { since: 1_700_000_000_000, days: '7' };
    fx.marketPend = [{ user_id: 'u1', offer_id: 'mkt_sin_m', days: '30', ceiling: 1000, key: 'q'.repeat(20), at: 1, name: 'Singapore M' }];
    await renderPage(page, { path: '/billing?checkout=reserve&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: /^check again$/i });
    await push({ state: 'indeterminate', retryIn: 0, idemKey: 'q'.repeat(20), ceiling: 1000 });
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['mkt.recoverNew'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['mkt.reserveNewTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['mkt.reserveNewConfirm'] }));
    // The shown term's own hold is forgotten with its key; the other term's is never asked to go.
    await waitFor(() => expect(fx.forgetKept).toHaveBeenCalledTimes(1));
    expect(fx.forgetKept.mock.calls[0]![2]).toBe('30');
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(fx.forgetUnknown).not.toHaveBeenCalled();
    expect(fx.reserveUnknown).toEqual({ since: 1_700_000_000_000, days: '7' });
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
    expect(fx.created.reduce((n: number, m: any) => n + m.confirm.mock.calls.length, 0)).toBe(0);
  });
  // MONEY: with no kept key, Start a new purchase forgets only the remembered reserve the drawer showed when the dialog
  // opened: its own term, never the drawer's term or every term of the offer.
  it('no kept key, the drawer shows a hold of another term: Start a new purchase forgets that term only, then a fresh review', async () => {
    fx.reserveUnknown = { since: 1_700_000_000_000, days: '7' };
    await renderPage(page, { path: '/billing?checkout=reserve&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    // The 30-day drawer stands on the 7-day hold, so the outcome and the confirm both name that
    // term before the person can choose to stop tracking it (never just "the earlier reservation").
    const term = (k: string) => strings[k as keyof typeof strings].replace('{{days}}', '7');
    expect(await within(dialog).findByText(term('mkt.indeterminateReserveTerm'))).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['mkt.indeterminateReserve'])).toBeNull();
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['mkt.recoverNew'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['mkt.reserveNewTitle'] });
    expect(within(ask).getByText(term('mkt.reserveNewBodyTerm'))).toBeInTheDocument();
    expect(within(ask).queryByText(strings['mkt.reserveNewBody'])).toBeNull();
    await userEvent.click(within(ask).getByRole('button', { name: strings['mkt.reserveNewConfirm'] }));
    await waitFor(() => expect(fx.forgetUnknown).toHaveBeenCalledTimes(1));
    expect(fx.forgetUnknown.mock.calls[0]![1]).toBe('mkt_sin_m');
    expect(fx.forgetUnknown.mock.calls[0]![2]).toBe('7');
    expect(await within(dialog).findByRole('checkbox')).toBeInTheDocument();
    expect(fx.created.reduce((n: number, m: any) => n + m.confirm.mock.calls.length, 0)).toBe(0);
  });
  it('no kept key, two remembered reserves of different terms: only the shown one goes; the drawer reopens on the other', async () => {
    fx.reserveUnknown = { since: 1_700_000_000_000 };
    fx.reserveOther = { since: 1_600_000_000_000, days: '7' };
    await renderPage(page, { path: '/billing?checkout=reserve&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['mkt.recoverNew'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['mkt.reserveNewTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['mkt.reserveNewConfirm'] }));
    await waitFor(() => expect(fx.forgetUnknown).toHaveBeenCalledTimes(1));
    expect(fx.forgetUnknown.mock.calls[0]![2]).toBe('30');
    expect(fx.reserveOther).toEqual({ since: 1_600_000_000_000, days: '7' });
    const check = await within(dialog).findByRole('button', { name: /^check again$/i });
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
    await userEvent.click(check);
    await waitFor(() => expect(fx.checkReserve).toHaveBeenCalledTimes(1));
    expect(fx.checkReserve.mock.calls[0]![2]).toEqual({ days: '7', since: 1_600_000_000_000, owner: 'u1' });
    expect(fx.created.reduce((n: number, m: any) => n + m.confirm.mock.calls.length, 0)).toBe(0);
  });
  it('no kept key: a confirm whose shown reserve changed after the dialog opened forgets nothing', async () => {
    fx.reserveUnknown = { since: 1_700_000_000_000, days: '7' };
    await renderPage(page, { path: '/billing?checkout=reserve&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['mkt.recoverNew'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['mkt.reserveNewTitle'] });
    // The drawer now shows a reserve of its own term (30 days), not the 7-day one the dialog was opened for.
    fx.reserveOther = { since: 1_800_000_000_000, days: '30' };
    await userEvent.click(within(ask).getByRole('button', { name: strings['mkt.reserveNewConfirm'] }));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(fx.forgetUnknown).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
  });
  // A hold of a term the listing no longer prices still opens on outcome unknown, never
  // on the price error (nothing can be confirmed from it either way).
  it('a hold of a term the listing no longer prices opens on outcome unknown, not the price error', async () => {
    fx.reserveUnknown = { since: 1_700_000_000_000, days: '7' };
    await renderPage(page, { path: '/billing?checkout=reserve&item=mkt_sin_m&days=7' });
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['action.tryAgain'] })).toBeNull();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
  });
  it('core finds a key of another term kept: the notice names that term, the hold stays, nothing sent', async () => {
    fx.reserveUnknown = { since: 1_700_000_000_000 };
    fx.forgetAnswer = 'kept';
    fx.marketPend = [{ user_id: 'u1', offer_id: 'mkt_sin_m', days: '7', ceiling: 1000, key: 'w'.repeat(20), at: 1, name: 'Singapore M' }];
    await renderPage(page, { path: '/billing?checkout=reserve&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['mkt.recoverNew'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['mkt.reserveNewTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['mkt.reserveNewConfirm'] }));
    await waitFor(() => expect(fx.forgetUnknown).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByText(strings['mkt.reserveNewKept'].replace('{{days}}', '7'))).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['mkt.reserveNewStoreErr'])).toBeNull();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    expect(fx.created.reduce((n: number, m: any) => n + m.confirm.mock.calls.length, 0)).toBe(0);
  });
  it('the drawer whose own Confirm was refused unresolved offers Start a new purchase once core remembers it', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    fx.reserveUnknown = { since: Date.now() };
    await push({ state: 'idle', notice: 'unresolvedReserve' });
    expect(await within(dialog).findByRole('button', { name: strings['mkt.recoverNew'] })).toBeInTheDocument();
  });
  it('not remembered: the same drawer offers no Start a new purchase (nothing to abandon)', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'idle', notice: 'unresolvedReserve' });
    await within(dialog).findByRole('button', { name: /^check again$/i });
    expect(within(dialog).queryByRole('button', { name: strings['mkt.recoverNew'] })).toBeNull();
  });
  // The idle read names the account that confirmed (the machine's own owner), never only the shown one.
  it('Check again from the idle machine passes the confirming account', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'idle', notice: 'unresolvedReserve', owner: 'u-confirmed' });
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkReserve).toHaveBeenCalledTimes(1));
    expect((fx.checkReserve.mock.calls[0]![2] as { owner: string }).owner).toBe('u-confirmed');
  });
});

describe('a rent Check again whose answer comes after a newer check began', () => {
  it('the late answer never settles the newer check', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: false }];
    let answerA: (r: string) => void = () => undefined;
    fx.checkRent.mockReturnValueOnce(new Promise((r) => { answerA = r; }));
    fx.checkRent.mockReturnValueOnce(new Promise(() => undefined));
    await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkRent).toHaveBeenCalledTimes(1));
    // The machine answers outcome unknown meanwhile: the drawer leaves that check for its unknown view.
    await push({ state: 'posting', rail: 'rent' });
    await push({ state: 'indeterminate', rail: 'rent', retryIn: 0 });
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkRent).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull());
    await act(async () => { answerA('active'); });
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(dialog).queryByText(strings['co.checkRented'])).toBeNull();
  });
});

// Without Web Locks, a kept key another tab drops before or during Check again is
// refused noLocks by core. The drawer stays on "may have gone through" with Check again, and says why this browser
// cannot send it.
describe('the confirmed resend refused noLocks: Check again only reads', () => {
  it('the unknown drawer keeps its outcome and Check again, and shows the noLocks sentence', async () => {
    fx.quoteFails = true;
    fx.attPending = true;
    fx.attConfirm = { ok: false, reason: 'noLocks', notSent: true };
    await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(strings.noLocks)).toBeNull();
    await resendIn(dialog);
    expect(await within(dialog).findByText(strings.noLocks)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).getByText(strings['co.stillUnknown'])).toBeInTheDocument();
    expect(fx.att.confirm).toHaveBeenCalledTimes(1);
  });
  it('a held buy resend core refuses before anything leaves says it was not sent; a plain unknown answer does not', async () => {
    fx.pendingAll = [{ kind: 'buy', user_id: 'u1', key: 'k'.repeat(20), plan_id: 'zz-rotated', family_id: 'fam-zz', title: 'Old plan', at: 1 }];
    fx.attPending = true;
    fx.attConfirm = { ok: false, reason: 'refused', notSent: true };
    await renderPage(page, { path: '/billing?checkout=buy&plan=zz-rotated' });
    const dialog = await screen.findByRole('dialog');
    await resendIn(dialog);
    expect(await within(dialog).findByText(strings['held.resendNotSent'], { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['held.goneTitle'])).toBeNull();
    // The next resend goes out and its answer is lost: the words go.
    fx.attConfirm = { ok: false, reason: 'refused', definitive: false };
    await resendIn(dialog);
    await waitFor(() => expect(within(dialog).queryByText(strings['held.resendNotSent'], { exact: false })).toBeNull());
    expect(within(dialog).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
  });
  it('a held buy resend whose kept request vanished after the dialog opened: nothing sent, and it says so', async () => {
    fx.pendingAll = [{ kind: 'buy', user_id: 'u1', key: 'k'.repeat(20), plan_id: 'zz-rotated', family_id: 'fam-zz', title: 'Old plan', at: 1 }];
    fx.attPending = true;
    await renderPage(page, { path: '/billing?checkout=buy&plan=zz-rotated' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['co.resend'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['co.resendTitle'] });
    fx.attPending = false;
    await userEvent.click(within(ask).getByRole('button', { name: strings['co.resendConfirm'] }));
    expect(await within(dialog).findByText(strings['held.resendNotSent'], { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
  });
  it('a held buy whose plan left the list keeps "not confirmed" and shows the noLocks sentence', async () => {
    fx.pendingAll = [{ kind: 'buy', user_id: 'u1', key: 'k'.repeat(20), plan_id: 'zz-rotated', family_id: 'fam-zz', title: 'Old plan', at: 1 }];
    fx.attPending = true;
    fx.attConfirm = { ok: false, reason: 'noLocks', notSent: true };
    await renderPage(page, { path: '/billing?checkout=buy&plan=zz-rotated' });
    const dialog = await screen.findByRole('dialog');
    await resendIn(dialog);
    expect(await within(dialog).findByText(strings.noLocks)).toBeInTheDocument();
    expect(within(dialog).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['held.goneTitle'])).toBeNull();
  });
});

// The browser explanation stays when the kept key disappears. Before Check again: with no
// kept request and no Web Locks, nothing is sent and the drawer still says why. After a noLocks answer whose refresh
// drops the held entry: the next Check again keeps the explanation (it belongs to the attempt, not the held list).
describe('noLocks when the kept key disappears', () => {
  const held = { kind: 'buy', user_id: 'u1', key: 'k'.repeat(20), plan_id: 'zz-rotated', family_id: 'fam-zz', title: 'Old plan', at: 1 };
  // The body paragraph (EmptyState's <p>), found from its first sentence.
  const bodyP = (dialog: HTMLElement) => within(dialog).getByText(strings['mkt.goneStillBody']).closest('p');
  it('a key dropped before Check again, without Web Locks: nothing sent, still not confirmed, and says why', async () => {
    const was = Object.getOwnPropertyDescriptor(navigator, 'locks');
    try {
      fx.pendingAll = [held];
      fx.attPending = false;
      await renderPage(page, { path: '/billing?checkout=buy&plan=zz-rotated' });
      const dialog = await screen.findByRole('dialog');
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
      await userEvent.click(await within(dialog).findByRole('button', { name: strings['buy.checkAgain'] }));
      expect(await within(dialog).findByText(strings.noLocks)).toBeInTheDocument();
      expect(within(dialog).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
      expect(fx.att.confirm).not.toHaveBeenCalled();
      // One paragraph, no <p> inside it.
      expect(bodyP(dialog)).not.toBeNull();
      expect(bodyP(dialog)?.querySelector('p')).toBeNull();
    } finally {
      if (was) Object.defineProperty(navigator, 'locks', was);
    }
  });
  it('a noLocks answer whose refresh drops the held entry: the next Check again keeps the explanation', async () => {
    fx.pendingAll = [held];
    fx.attPending = true;
    const answer = { ok: false, reason: 'noLocks', notSent: true };
    // The other tab's drop lands while this check runs: the refreshed held list no longer has it.
    Object.defineProperty(fx, 'attConfirm', { configurable: true, get: () => { fx.pendingAll = []; return answer; }, set: () => undefined });
    try {
      await renderPage(page, { path: '/billing?checkout=buy&plan=zz-rotated' });
      const dialog = await screen.findByRole('dialog');
      await resendIn(dialog);
      expect(await within(dialog).findByText(strings.noLocks)).toBeInTheDocument();
      expect(fx.att.confirm).toHaveBeenCalledTimes(1);
      const confirms = fx.att.confirm;
      await userEvent.click(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] }));
      await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] })).toBeEnabled());
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(within(dialog).getByText(strings.noLocks)).toBeInTheDocument();
      expect(within(dialog).getByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
      expect(confirms).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(fx, 'attConfirm', { configurable: true, writable: true, enumerable: true, value: { ok: false, reason: 'refused', definitive: true } });
    }
  });
  it('the held entry gone after a plain unknown answer, without Web Locks: the next Check again says why, nothing sent', async () => {
    fx.pendingAll = [held];
    fx.attPending = true;
    const answer = { ok: false, reason: 'refused', definitive: false };
    Object.defineProperty(fx, 'attConfirm', { configurable: true, get: () => { fx.pendingAll = []; return answer; }, set: () => undefined });
    const was = Object.getOwnPropertyDescriptor(navigator, 'locks');
    try {
      await renderPage(page, { path: '/billing?checkout=buy&plan=zz-rotated' });
      const dialog = await screen.findByRole('dialog');
      await resendIn(dialog);
      expect(await within(dialog).findByText(strings['mkt.goneStillBody'])).toBeInTheDocument();
      expect(within(dialog).queryByText(strings.noLocks)).toBeNull();
      const confirms = fx.att.confirm;
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
      await userEvent.click(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] }));
      expect(await within(dialog).findByText(strings.noLocks)).toBeInTheDocument();
      expect(confirms).toHaveBeenCalledTimes(1);
    } finally {
      if (was) Object.defineProperty(navigator, 'locks', was);
      Object.defineProperty(fx, 'attConfirm', { configurable: true, writable: true, enumerable: true, value: { ok: false, reason: 'refused', definitive: true } });
    }
  });
});

describe('a failed purchase offers Details for support', () => {
  const facts = () => errorInfo({ code: 'TIMEOUT', status: 504, traceId: 'trace-abc123', route: 'POST /rentals' });
  // Facts a source already decided pending (C9: the answer may have been applied).
  const pendingFacts = () => errorInfo({ outcome: 'pending', code: 'TIMEOUT', status: 504 });

  it('the failed outcome is the kit outcome banner: its Details fold shows the rejection facts, the copied text is the shown lines, and the footer offers Try again', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    const info = facts();
    await push({ state: 'failed', failure: { code: 'SOME_REFUSAL', status: 422, info } });
    const failed = await waitFor(() => {
      const el = dialog.querySelector('[data-outcome="failed"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(failed).toHaveAttribute('role', 'alert');
    expect(within(failed).getByText(strings['co.failedTitle'])).toBeInTheDocument();
    const details = within(failed).getByRole('button', { name: /details/i });
    await userEvent.click(details);
    const codeLine = info.code ? within(failed).getByText(info.code) : null;
    expect(codeLine).not.toBeNull();
    expect(errorText(info)).toContain(`Code: ${info.code}`);
    expect(within(dialog).getByRole('button', { name: strings['action.tryAgain'] })).toBeEnabled();
  });

  it('a failed state whose facts say the purchase may have gone through is shown pending, with Details, and offers no Try again (no fresh review beside it)', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    const info = pendingFacts();
    await push({ state: 'failed', failure: { code: 'SOME_REFUSAL', status: 504, info } });
    const pending = await waitFor(() => {
      const el = dialog.querySelector('[role="alert"][data-outcome="pending"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(dialog.querySelector('[data-outcome="failed"]')).toBeNull();
    expect(within(pending).getByRole('button', { name: /details/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['action.tryAgain'] })).toBeNull();
    // The footer's worded Close (the header's X is named Close too).
    expect(within(dialog).getAllByRole('button', { name: strings['action.close'] }).filter((b) => b.textContent === strings['action.close'])).toHaveLength(1);
    const before = fx.created.length;
    await act(async () => {});
    expect(fx.created.length).toBe(before);
  });

  it('a failed purchase whose answer carried no facts shows no Details button', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    await push({ state: 'failed', failure: { code: 'SOME_REFUSAL', status: 422 } });
    const failed = await waitFor(() => {
      const el = dialog.querySelector('[data-outcome="failed"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(within(failed).queryByRole('button', { name: /details/i })).toBeNull();
  });
});

// A rent or reserve whose outcome is unresolved keeps it when a read meets 403 ACCOUNT_BANNED. Core's
// machine reports the ban beside an indeterminate or not-found state (refresh_read_403_banned, read_403_banned): the
// drawer still says it may already have gone through, offers the read-only Check again with the suspended line, and
// nothing that could send. Before, any banned snapshot replaced the outcome with the banned body.
describe('a suspension that meets an unresolved rent or reserve', () => {
  const K = 'r'.repeat(20);
  const held = { state: 'indeterminate', idemKey: K, ceiling: 1000 };
  async function unknownReserve() {
    fx.marketPend = [{ user_id: 'u1', offer_id: 'mkt_sin_m', days: '30', ceiling: 1000, key: K, at: 1, name: 'Singapore M' }];
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    fx.pm.snapshot.mockReturnValue(snap(held));
    await push(held);
    expect(await within(dialog).findByText(strings['mkt.indeterminateReserve'])).toBeInTheDocument();
    // Before the suspension this drawer can send the kept request again.
    expect(within(dialog).getByRole('button', { name: strings['co.resend'] })).toBeInTheDocument();
    return dialog;
  }
  const nothingSends = (dialog: HTMLElement) => {
    for (const name of [strings['mkt.confirmCta'], strings['action.tryAgain'], strings['mkt.recoverNew'], strings['mkt.rentAgain'], strings['co.resend']])
      expect(within(dialog).queryByRole('button', { name })).toBeNull();
    expect(fx.pm.retry).not.toHaveBeenCalled();
    expect(fx.pm.retryRent).not.toHaveBeenCalled();
    // The one Confirm that sent the purchase, and nothing after it.
    expect(fx.created.reduce((n: number, pm: any) => n + pm.confirm.mock.calls.length, 0)).toBe(1);
  };
  const keepsOutcome = (dialog: HTMLElement, body: string) => {
    expect(within(dialog).getByText(body)).toBeInTheDocument();
    expect(within(dialog).getByText(strings['mkt.suspended'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['band.suspendedBody'])).toBeNull();
    expect(within(dialog).getByRole('button', { name: /^check again$/i })).toBeEnabled();
  };

  it('reserve: Check again whose read is refused as suspended keeps "may already have gone through", sends nothing', async () => {
    const dialog = await unknownReserve();
    fx.pm.refresh.mockImplementationOnce(async () => {
      fx.pm.snapshot.mockReturnValue(snap({ ...held, banned: true }));
      fx.opts.onChange(snap({ ...held, banned: true }));
      return true;
    });
    await userEvent.click(within(dialog).getByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.pm.refresh).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByText(strings['mkt.suspended'])).toBeInTheDocument();
    keepsOutcome(dialog, strings['mkt.indeterminateReserve']);
    nothingSends(dialog);
  });

  it('reserve: a refresh of the reservations refused as suspended while the drawer shows the unknown keeps it', async () => {
    const dialog = await unknownReserve();
    await push({ ...held, banned: true });
    expect(await within(dialog).findByText(strings['mkt.suspended'])).toBeInTheDocument();
    keepsOutcome(dialog, strings['mkt.indeterminateReserve']);
    nothingSends(dialog);
  });

  it('rent: a not-found read-back met by the suspension keeps the not-found body, with no Start over or Rent again', async () => {
    const { dialog, confirm } = await openMarket('rent');
    await send(dialog, confirm);
    await push({ state: 'posting', rail: 'rent' });
    await push({ state: 'reconciling', rail: 'rent', banned: true });
    await push({ state: 'not-found', rail: 'rent', banned: true });
    expect(await within(dialog).findByText(strings['mkt.notFoundTitle'])).toBeInTheDocument();
    keepsOutcome(dialog, strings['mkt.notFoundMsg']);
    nothingSends(dialog);
  });

  it('a confirmed snapshot arriving after the suspension (injected: a reservation read never proves it) shows the done body with the suspended line', async () => {
    const dialog = await unknownReserve();
    await push({ ...held, banned: true });
    expect(await within(dialog).findByText(strings['mkt.suspended'])).toBeInTheDocument();
    fx.pm.refresh.mockImplementationOnce(async () => {
      fx.opts.onChange(snap({ state: 'confirmed', banned: true, receipt: { created_at: '2026-10-23T08:00:00Z' } }));
      return true;
    });
    await userEvent.click(within(dialog).getByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(dialog.querySelector('[data-outcome="done"]')).not.toBeNull());
    expect(within(dialog).getByText(strings['mkt.suspended'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['band.suspendedBody'])).toBeNull();
  });

  it('a send answered done while the ban latched mid-POST keeps the done body with the suspended line', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    await push({ state: 'confirmed', banned: true, receipt: { created_at: '2026-10-23T08:00:00Z' } });
    await waitFor(() => expect(dialog.querySelector('[data-outcome="done"]')).not.toBeNull());
    expect(within(dialog).getByText(strings['mkt.suspended'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['band.suspendedBody'])).toBeNull();
  });

  // Core leaves posting for failed or idle with nothing sent. That answer settles
  // first, so the drawer never stays locked on its sending step.
  it.each([
    ['refused 403 ACCOUNT_BANNED', { state: 'failed', banned: true, failure: { code: 'ACCOUNT_BANNED' } }],
    ['a definite failure after the ban latched mid-POST', { state: 'failed', banned: true, failure: { code: 'PRICING_INVALID' } }],
    ['admission refused (no locks) after the confirm', { state: 'idle', banned: true, notice: 'noLocks' }],
  ])('a send %s ends at the banned body, the drawer closable again', async (_what, answer) => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    // Locked while posting: the drawer's Close (the footer shows none while sending) is soft-disabled, still found by
    // its name; toBeEnabled cannot see this lock.
    const locked = within(dialog).getAllByRole('button', { name: strings['action.close'] });
    expect(locked).toHaveLength(1);
    for (const c of locked) expect(c).toHaveAttribute('aria-disabled', 'true');
    await push(answer);
    expect(await within(dialog).findByText(strings['band.suspendedBody'])).toBeInTheDocument();
    // Unlocked: every Close works again (posting kept them off). Exactly the drawer's two (an exact
    // count): the header's one Close (x wide, back arrow on a phone) and the footer's Close. A busy drawer's Close is
    // soft-disabled (aria-disabled), so toBeEnabled alone would not see the lock.
    const closes = within(dialog).getAllByRole('button', { name: strings['action.close'] });
    expect(closes).toHaveLength(2);
    for (const c of closes) {
      expect(c).toBeEnabled();
      expect(c).not.toHaveAttribute('aria-disabled', 'true');
    }
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['action.tryAgain'] })).toBeNull();
    expect(fx.created.reduce((n: number, pm: any) => n + pm.confirm.mock.calls.length, 0)).toBe(1);
  });

  it('admission finds an earlier unresolved reservation while suspended: "may have gone through", Check again, no resend', async () => {
    fx.marketPend = [{ user_id: 'u1', offer_id: 'mkt_sin_m', days: '30', ceiling: 1000, key: K, at: 1, name: 'Singapore M' }];
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    await push({ state: 'idle', banned: true, notice: 'unresolvedReserve' });
    expect(await within(dialog).findByText(strings['mkt.suspended'])).toBeInTheDocument();
    keepsOutcome(dialog, strings['mkt.indeterminateReserve']);
    nothingSends(dialog);
  });

  it('before anything was sent, a suspended machine still stops at the banned body', async () => {
    const { dialog } = await openMarket('reserve');
    await push({ state: 'idle', banned: true });
    expect(await within(dialog).findByText(strings['band.suspendedBody'])).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
  });

  it('once suspended, a later answer without the ban never brings a send control back in this drawer', async () => {
    const dialog = await unknownReserve();
    await push({ ...held, banned: true });
    expect(await within(dialog).findByText(strings['mkt.suspended'])).toBeInTheDocument();
    fx.pm.snapshot.mockReturnValue(snap(held));
    await push(held);
    keepsOutcome(dialog, strings['mkt.indeterminateReserve']);
    nothingSends(dialog);
  });
});

// Core's
// admission, under the pending lock, can still refuse a Confirm the early check let through. An earlier unresolved
// rent found there (another tab's, or an earlier dialog's) may have gone through, and an admission that gave up with
// no notice ('busy') must not leave the drawer locked in posting. A reserve reads "not sent" only while no key of this
// offer is kept.
describe('an admission refused under the lock after the confirm', () => {
  const KEY = 'q'.repeat(20);
  const kept = { user_id: 'u1', offer_id: 'mkt_sin_m', days: '30', ceiling: 1000, key: KEY, at: 1, name: 'Singapore M' };
  const hold = { server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: false };
  function confirms(): number {
    return fx.created.reduce((n: number, pm: any) => n + pm.confirm.mock.calls.length, 0);
  }
  function unlocked(dialog: HTMLElement): void {
    expect(dialog.querySelector('[aria-busy="true"]')).toBeNull();
    const closes = within(dialog).getAllByRole('button', { name: strings['action.close'] });
    expect(closes.length).toBeGreaterThan(0);
    for (const c of closes) {
      expect(c).toBeEnabled();
      expect(c).not.toHaveAttribute('aria-disabled', 'true');
    }
  }
  async function unknownRent(dialog: HTMLElement): Promise<void> {
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).getByText(strings['mkt.indeterminateRent'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
    // The warned Rent again anyway is not offered from here before a Check again (as on the early check).
    expect(within(dialog).queryByRole('button', { name: strings['mkt.rentAgain'] })).toBeNull();
    unlocked(dialog);
    expect(confirms()).toBe(1);
  }

  it('rent: an earlier unresolved rent found under the lock reads "may have gone through" with Check again, never "nothing was charged"', async () => {
    const { dialog, confirm } = await openMarket('rent');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    fx.rentMarks = [hold];
    await push({ state: 'idle', notice: 'unresolvedRent' });
    await unknownRent(dialog);
  });

  it('rent: Check again from there reads the rentals and sends nothing', async () => {
    const { dialog, confirm } = await openMarket('rent');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    fx.rentMarks = [hold];
    fx.checkRent.mockResolvedValueOnce('unknown');
    await push({ state: 'idle', notice: 'unresolvedRent' });
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkRent).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    expect(confirms()).toBe(1);
    // After a Check again that still cannot tell, the existing warned Rent again anyway is the
    // one way to a second rent. It sends nothing until its own confirm, whose text says plainly that the first rent may
    // still go through and this can charge twice.
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['mkt.rentAgain'] }));
    expect(await screen.findByText(strings['mkt.rentAgainBody'])).toBeInTheDocument();
    expect(strings['mkt.rentAgainBody']).toMatch(/may still go through/);
    expect(strings['mkt.rentAgainBody']).toMatch(/charged twice/);
    expect(confirms()).toBe(1);
    expect(screen.getByRole('button', { name: strings['mkt.rentAgainConfirm'] })).toBeInTheDocument();
  });

  it('rent: the same refusal while suspended keeps the unknown outcome with the suspended line', async () => {
    const { dialog, confirm } = await openMarket('rent');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    fx.rentMarks = [hold];
    await push({ state: 'idle', banned: true, notice: 'unresolvedRent' });
    expect(await within(dialog).findByText(strings['mkt.suspended'])).toBeInTheDocument();
    expect(within(dialog).getByText(strings['mkt.indeterminateRent'])).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['mkt.rentAgain'] })).toBeNull();
    expect(within(dialog).queryByText(strings['band.suspendedBody'])).toBeNull();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    unlocked(dialog);
    expect(confirms()).toBe(1);
  });

  it('rent: an admission that gave up with no notice leaves posting for "may have gone through", no resend', async () => {
    const { dialog, confirm } = await openMarket('rent');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    await push({ state: 'idle', notice: null });
    await unknownRent(dialog);
  });

  // With no kept key the gave-up admission proves nothing either;
  // it is unknown with Check again, never "not sent".
  it('reserve: an admission that gave up with no notice and no kept key reads "may have gone through", never "not sent"', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    await push({ state: 'idle', notice: null });
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).getByText(strings['mkt.indeterminateReserve'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
    unlocked(dialog);
    expect(confirms()).toBe(1);
  });

  it('reserve: an admission that gave up with no notice while a key of this offer is kept reads "may have gone through", never "not sent"', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    // The key is kept as it would be before its POST (core never answers idle after one; the mutant maps this to not_sent).
    await push({ state: 'posting', idemKey: KEY, ceiling: 1000 });
    // Saved under the lock before the lock's promise failed (or an earlier one, sent or not): the next Confirm is held.
    fx.marketPend = [kept];
    await push({ state: 'idle', notice: null });
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).getByText(strings['mkt.indeterminateReserve'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
    unlocked(dialog);
    expect(confirms()).toBe(1);
  });

  it('reserve: an admission that gave up with no notice while the reservation store cannot be read reads "may have gone through", never "not sent"', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    // An unreadable store proves nothing (marketPendingFor would read it as empty).
    fx.pendUnreadable = true;
    await push({ state: 'idle', notice: null });
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
    unlocked(dialog);
    expect(confirms()).toBe(1);
  });

  it('reserve: the kept key is looked up for the dialog owner the admission checked, not only the shown one', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting', owner: 'u-dialog' });
    fx.marketPend = [{ ...kept, user_id: 'u-dialog' }];
    await push({ state: 'idle', notice: null, owner: 'u-dialog' });
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    unlocked(dialog);
  });

  it('an idle machine with no notice while a Check again is running moves nothing: only a send is settled', async () => {
    fx.rentMarks = [hold];
    fx.checkRent.mockReturnValue(new Promise(() => undefined));
    await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull());
    await push({ state: 'idle', notice: null });
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    // Still checking: without the posting guard the branch would settle it as unknown and end the check.
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    expect(confirms()).toBe(0);
  });

  // Storage that cannot keep a reserve's key or a
  // rent's hold says so, with confirm's own storage words; nothing was sent, so Confirm again and no Check again.
  it.each(['reserve', 'rent'] as const)('%s: an admission refused because storage could not keep it names storage as the cause, Confirm again, no Check again', async (kind) => {
    const { dialog, confirm } = await openMarket(kind);
    await send(dialog, confirm);
    await push({ state: 'posting' });
    await push({ state: 'idle', notice: 'storageFailed' });
    expect(await within(dialog).findByText(strings['buy.storeErr'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['mkt.confirmCta'] })).toBeEnabled());
    expect(within(dialog).queryByRole('button', { name: /^check again$/i })).toBeNull();
    unlocked(dialog);
    expect(confirms()).toBe(1);
  });

  it('an idle machine with no notice outside a send moves nothing (review stays as it was)', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await push({ state: 'idle', notice: null });
    expect(within(dialog).getByRole('button', { name: strings['mkt.confirmCta'] })).toBe(confirm);
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    expect(confirms()).toBe(0);
  });
});

// A suspension that meets a Rent again
// anyway already sent, and one that meets a refusal the hook clears with dismiss() (a re-quote).
describe('a suspension meeting a Rent again in flight, or a refusal the hook dismisses', () => {
  const hold = { server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: false };
  const confirms = (): number => fx.created.reduce((n: number, pm: any) => n + pm.confirm.mock.calls.length, 0);

  it('a Rent again anyway in flight when the ban latches stays sending, then keeps its unknown outcome with the suspended line', async () => {
    const { dialog, confirm } = await openMarket('rent');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    fx.rentMarks = [hold];
    fx.checkRent.mockResolvedValueOnce('unknown');
    await push({ state: 'idle', notice: 'unresolvedRent' });
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['mkt.rentAgain'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['mkt.rentAgainConfirm'] }));
    expect(fx.pm.confirm).toHaveBeenLastCalledWith(true, { rentAgainAnyway: true });
    expect(confirms()).toBe(2);
    // The second rent is out: the ban arriving now never replaces its sending step (keep), nothing more is sent.
    await push({ state: 'posting', banned: true });
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(dialog).queryByText(strings['band.suspendedBody'])).toBeNull();
    // Its answer is unknown: the drawer says so, with the suspended line, and offers no further rent.
    await push({ state: 'indeterminate', banned: true });
    expect(await within(dialog).findByText(strings['mkt.suspended'])).toBeInTheDocument();
    expect(within(dialog).getByText(strings['mkt.indeterminateRent'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['band.suspendedBody'])).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['mkt.rentAgain'] })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
    expect(confirms()).toBe(2);
  });

  it('a refusal with a re-quote while suspended is dismissed once and ends at the banned body, nothing sent again', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    const first = fx.pm;
    await push({ state: 'failed', banned: true, failure: { code: 'CHARGE_EXCEEDS_MAX', requote: true, requoteCents: 1250 } });
    expect(await within(dialog).findByText(strings['band.suspendedBody'])).toBeInTheDocument();
    expect(first.dismiss).toHaveBeenCalledTimes(1);
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['action.tryAgain'] })).toBeNull();
    for (const c of within(dialog).getAllByRole('button', { name: strings['action.close'] })) {
      expect(c).toBeEnabled();
      expect(c).not.toHaveAttribute('aria-disabled', 'true');
    }
    expect(confirms()).toBe(1);
  });
});

// Two Confirms in one input batch (a terminal reads two Enters before React renders; a double click can do the same): the
// second must not reach the machine. Core answers a second confirm 'busy', and a busy settled as "not sent" would put the
// drawer back on its review while the first request is still out, so its later unknown or successful answer was dropped.
describe('two Confirms before a render send once', () => {
  const twice = async () => act(async () => { const c = fx.api.confirm; c(); c(); });

  it.each([
    ['unknown', { ok: false, reason: 'unknown' }, 'unknown'],
    ['success', { ok: true, result: { operation: { id: 'op1', charge_cents: 1200 }, subscription: {}, replayed: false, failed: false } }, 'done'],
  ])('buy: the first answer (%s) settles the drawer', async (_name, answerOfFirst, phase) => {
    await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: strings['buy.confirm'] });
    await waitFor(() => expect(fx.att.quote).toHaveBeenCalled());
    let release!: (v: unknown) => void;
    const first = new Promise((r) => { release = r; });
    fx.att.confirm.mockImplementationOnce(() => first).mockImplementation(async () => ({ ok: false, reason: 'busy' }));
    await act(async () => { fx.api.setConsent(true); });
    await waitFor(() => expect(fx.api.state.consent).toBe(true));
    await twice();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(fx.att.confirm).toHaveBeenCalledTimes(1);
    expect(fx.api.state.phase).toBe('posting');
    await act(async () => { release(answerOfFirst); });
    await waitFor(() => expect(fx.api.state.phase).toBe(phase));
  });

  it('rent: the machine is asked once and the drawer follows its unknown answer', async () => {
    const { dialog } = await openMarket('rent');
    await within(dialog).findByRole('checkbox');
    await act(async () => { fx.api.setConsent(true); });
    await waitFor(() => expect(fx.api.state.consent).toBe(true));
    fx.pm.confirm.mockImplementationOnce(() => ({ ok: true })).mockImplementation(() => ({ ok: false, reason: 'busy' }));
    await twice();
    expect(fx.pm.confirm).toHaveBeenCalledTimes(1);
    expect(fx.api.state.phase).toBe('posting');
    await push({ state: 'posting', rail: 'rent' });
    await push({ state: 'indeterminate', rail: 'rent' });
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
  });
});

// The same batch for the kinds the block above leaves out: pay and upgrade (the attempt machine) and reserve (the purchase
// machine). The latch sends once; the first answer settles the drawer.
describe.each([
  ['pay', '?checkout=pay&sub=a1b2c3d4e5f60718293a4b02', 'subs.payConfirm'],
  ['upgrade', '?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro', 'up.confirm'],
])('%s: two Confirms before a render send once', (_kind, search, confirmKey) => {
  it('the attempt is asked once and its success settles the drawer', async () => {
    await renderPage(page, { path: `/billing${search}` });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: (strings as Record<string, string>)[confirmKey] });
    await waitFor(() => expect(fx.att.quote).toHaveBeenCalled());
    await act(async () => { fx.api.setConsent(true); });
    let land!: (r: unknown) => void;
    fx.att.confirm.mockImplementationOnce(() => new Promise((r) => { land = r; })).mockImplementation(async () => ({ ok: false, reason: 'busy' }));
    act(() => { fx.api.confirm(); fx.api.confirm(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(fx.att.confirm).toHaveBeenCalledTimes(1);
    expect(fx.api.state.phase).toBe('posting');
    await act(async () => { land({ ok: true, result: { operation: {}, subscription: {}, replayed: false, failed: false } }); });
    await waitFor(() => expect(fx.api.state.phase).toBe('done'));
  });
});

describe('reserve: two Confirms before a render send once', () => {
  it('the machine is asked once and its confirmed snapshot settles the drawer', async () => {
    const { dialog } = await openMarket('reserve');
    await userEvent.click(await within(dialog).findByRole('checkbox'));
    fx.pm.confirm.mockImplementationOnce(() => ({ ok: true })).mockImplementation(() => ({ ok: false, reason: 'busy' }));
    act(() => { fx.api.confirm(); fx.api.confirm(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(fx.pm.confirm).toHaveBeenCalledTimes(1);
    expect(fx.api.state.phase).toBe('posting');
    await push({ state: 'confirmed', rail: 'reserve', receipt: { created_at: '2026-10-23T08:00:00Z' } });
    await waitFor(() => expect(fx.api.state.phase).toBe('done'));
  });
});

// The busy rule on the attempt path (buy, pay, upgrade): busy changes nothing while the machine's OWN send is out (read
// from its snapshot); with no send out it is unknown with Check again, never "not sent". A resend latches like Confirm.
describe.each([
  ['buy', '?checkout=buy&plan=fam-plus'],
  ['pay', '?checkout=pay&sub=a1b2c3d4e5f60718293a4b02'],
])('%s: the busy rule', (_kind, search) => {
  const openHeld = async () => {
    fx.quoteFails = true;
    fx.attPending = true;
    await renderPage(page, { path: `/billing${search}` });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
  };
  it('two resends in one batch: the attempt is asked once and its answer is the one settle', async () => {
    await openHeld();
    let land!: (r: unknown) => void;
    fx.att.confirm.mockImplementationOnce(() => new Promise((r) => { land = r; })).mockImplementation(async () => ({ ok: false, reason: 'busy' }));
    const shown = fx.api.resendShown();
    act(() => { fx.api.resend(shown); fx.api.resend(shown); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(fx.att.confirm).toHaveBeenCalledTimes(1);
    expect(fx.api.state.phase).toBe('checking');
    await act(async () => { land({ ok: true, result: { operation: {}, subscription: {}, replayed: true, failed: false } }); });
    // A replay of the kept request: its first send had gone through.
    await waitFor(() => expect(fx.api.state.phase).toBe('already'));
  });
  it('busy while its own send is out changes nothing', async () => {
    await openHeld();
    fx.att.snapshot.mockReturnValue({ phase: 'posting', error: null, ceiling: 1200, pending: true, key: KEPT.key });
    fx.att.confirm.mockImplementation(async () => ({ ok: false, reason: 'busy' }));
    act(() => { fx.api.resend(fx.api.resendShown()); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(fx.api.state.phase).toBe('checking');
  });
  // Guard only: on the check path a not_sent was already checkUnknown; the Confirm form below is the discriminating one.
  it('busy with no send out is still unknown with Check again, never "not sent"', async () => {
    await openHeld();
    fx.att.confirm.mockImplementation(async () => ({ ok: false, reason: 'busy', notSent: true }));
    act(() => { fx.api.resend(fx.api.resendShown()); });
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    expect(fx.api.state.stillUnknown).toBe(true);
  });
});

describe('buy: a Confirm answered busy with no send out', () => {
  it('is unknown with Check again, never back to the review as "not sent"', async () => {
    await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.att.quote).toHaveBeenCalled());
    await act(async () => { fx.api.setConsent(true); });
    fx.att.confirm.mockImplementation(async () => ({ ok: false, reason: 'busy', notSent: true }));
    act(() => { fx.api.confirm(); });
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
  });
});

// The busy rule on the purchase machine (rent, reserve): core answers busy only from a machine that is not idle. With no
// send of its own out (an earlier drawer's or another tab's send, indeterminate) it is unknown with Check again, never
// "not sent"; with its own send out busy changes nothing and that send's snapshot settles the drawer.
describe.each([['rent'], ['reserve']] as const)('%s: a Confirm answered busy', (kind) => {
  it('by a machine with no send out reads unknown with Check again, never "not sent"', async () => {
    const { dialog, confirm } = await openMarket(kind);
    fx.pm.snapshot.mockReturnValue(snap({ state: 'indeterminate', rail: kind }));
    fx.pm.confirm.mockReturnValue({ ok: false, reason: 'busy' });
    await send(dialog, confirm);
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    expect(fx.api.state.retryIn).toBe(0);
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
  });
  it('while its own send is out changes nothing; the answer of that send settles the drawer', async () => {
    const { dialog, confirm } = await openMarket(kind);
    fx.pm.snapshot.mockReturnValue(snap({ state: 'posting', rail: kind }));
    fx.pm.confirm.mockReturnValue({ ok: false, reason: 'busy' });
    await send(dialog, confirm);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(fx.api.state.phase).toBe('posting');
    await push({ state: 'confirmed', rail: kind, receipt: { created_at: '2026-10-23T08:00:00Z' } });
    await waitFor(() => expect(fx.api.state.phase).toBe('done'));
  });
});

// ---- send-once and replaced-machine edges of the purchase drawer ----

const KEY = 'q'.repeat(20);
const KEPT_RES = { user_id: 'u1', offer_id: 'mkt_sin_m', days: '30', ceiling: 1000, key: KEY, at: 1, name: 'Singapore M' };
const settleAWhile = () => act(async () => { await new Promise((r) => setTimeout(r, 100)); });

// Two "Rent again anyway" before a render (a terminal can read two Enters in one chunk): the second never reaches the
// machine, whose 'busy' would settle the first, still out, as unknown and drop its success.
describe('two Rent again anyway before a render send once', () => {
  it('the machine is asked once and its confirmed snapshot settles the drawer', async () => {
    fx.rentMarks = [{ server_id: 'mkt_sin_m', name: 'Singapore M', days: '30', at: 1, dismissed: false, sending: false }];
    fx.checkRent.mockResolvedValue('absent');
    await renderPage(page, { path: '/billing?checkout=rent&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await within(dialog).findByRole('button', { name: strings['mkt.rentAgain'] });
    fx.pm.confirm.mockImplementationOnce(() => ({ ok: true })).mockImplementation(() => ({ ok: false, reason: 'busy' }));
    act(() => { const r = fx.api.rentAgain; r(); r(); });
    await settleAWhile();
    expect(fx.pm.confirm).toHaveBeenCalledTimes(1);
    expect(fx.api.state.phase).toBe('posting');
    await push({ state: 'posting', rail: 'rent' });
    await push({ state: 'confirmed', rail: 'rent', receipt: { rental: { id: 'r1' } } });
    await waitFor(() => expect(fx.api.state.phase).toBe('done'));
  });
});

// A re-read of the row (here reload; live: a core generation move such as a realm switch) replaces the purchase
// machine while its POST is out. The disposed machine publishes nothing again, so the drawer must not stay posting.
describe('a machine replaced while its send is out', () => {
  it('reserve: the drawer leaves posting for "may have gone through", never stuck locked', async () => {
    fx.marketPend = [KEPT_RES];
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting', idemKey: KEY, ceiling: 1000 });
    expect(fx.api.state.phase).toBe('posting');
    const n = fx.created.length;
    await act(async () => { fx.api.reload(); });
    await waitFor(() => expect(fx.created.length).toBeGreaterThan(n));
    await settleAWhile();
    expect(fx.created[n - 1].dispose).toHaveBeenCalled();
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'), { timeout: 1000 });
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    expect(dialog.querySelector('[aria-busy="true"]')).toBeNull();
  });
  it('rent: the same', async () => {
    const { dialog, confirm } = await openMarket('rent');
    await send(dialog, confirm);
    await push({ state: 'posting', rail: 'rent' });
    const n = fx.created.length;
    await act(async () => { fx.api.reload(); });
    await waitFor(() => expect(fx.created.length).toBeGreaterThan(n));
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'), { timeout: 1000 });
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
  });
});

// A resend callback kept from before a re-read replaced the machine: like Confirm and Rent again, it sends nothing
// through the disposed machine and leaves the drawer as it was (a disposed retry() answers true and then publishes nothing).
describe('a resend kept across a machine replacement', () => {
  it('sends nothing through the disposed machine and never enters posting', async () => {
    fx.marketPend = [KEPT_RES];
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting', idemKey: KEY, ceiling: 1000 });
    const unknown = { state: 'indeterminate', retryIn: 0, idemKey: KEY, ceiling: 1000 };
    fx.pm.snapshot.mockReturnValue(snap(unknown));
    await push(unknown);
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    const old = fx.pm;
    const kept = fx.api.resend;
    const shown = fx.api.resendShown();
    expect(shown?.key).toBe(KEY);
    const n = fx.created.length;
    await act(async () => { fx.api.reload(); });
    await waitFor(() => expect(fx.created.length).toBeGreaterThan(n));
    await waitFor(() => expect(old.dispose).toHaveBeenCalled());
    await act(async () => { kept(shown); });
    await settleAWhile();
    expect(old.retry).not.toHaveBeenCalled();
    expect(fx.api.state.phase).toBe('unknown');
    expect(dialog.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

// Check again called outside a React event (a terminal key handler): its read fails at once, before the checking
// render commits. The answer must still end the check.
describe('a Check again whose read settles before the checking render', () => {
  it('reserve, idle machine: back on "may have gone through", never stuck checking', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'idle', notice: 'unresolvedReserve' });
    await within(dialog).findByRole('button', { name: /^check again$/i });
    fx.checkReserve.mockImplementation(() => Promise.reject(new Error('OP_DEADLINE')));
    // Not in act, not in a React event: the dispatch waits for the scheduler, the rejected read does not.
    fx.api.checkAgain();
    await settleAWhile();
    expect(fx.checkReserve).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'), { timeout: 1000 });
  });
  it('reserve, machine that does not read (refresh false): the same', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting', idemKey: KEY, ceiling: 1000 });
    await push({ state: 'indeterminate', retryIn: 0, idemKey: KEY, ceiling: 1000 });
    await within(dialog).findByRole('button', { name: /^check again$/i });
    fx.pm.snapshot.mockReturnValue(snap({ state: 'indeterminate', idemKey: KEY, ceiling: 1000 }));
    fx.pm.refresh.mockResolvedValue(false);
    fx.api.checkAgain();
    await settleAWhile();
    expect(fx.pm.refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'), { timeout: 1000 });
  });
});

// Two top-up submits before a render: the second finds the machine submitting. It must not say "nothing was sent"
// (account changed) while the first is out, and must not clear `running` for the first.
describe('two top-up submits before a render', () => {
  it('the second changes nothing; running stays on until the first answers', async () => {
    let land!: (v: unknown) => void;
    fx.tuSubmit = () => new Promise((r) => { land = r; });
    await renderPage(page, { path: '/billing?sheet=funds' });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.tu).not.toBeNull());
    let a!: Promise<any>, b!: Promise<any>;
    act(() => { a = fx.tu.submit('card', '35'); b = fx.tu.submit('card', '35'); });
    let secondEarly: any = 'open';
    void b.then((v) => { secondEarly = v; });
    await settleAWhile();
    // While the first is out: running stays on, and the second has not answered "nothing was sent".
    expect(fx.tu.running).toBe(true);
    expect(secondEarly === 'open' || !(secondEarly.ok === false && secondEarly.unknown === false)).toBe(true);
    await act(async () => { land({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_x' }); });
    const first = await a;
    const second = await b;
    expect(first.ok).toBe(true);
    expect(second.ok === false && second.word?.k === 'accountChanged').toBe(false);
    expect(second.ok === false && second.unknown === false).toBe(false);
    await waitFor(() => expect(fx.tu.running).toBe(false));
  });
});

// The admission gave up with no notice ('busy': the pending lock was not granted in time). Nothing of this machine
// is out, and by the final busy rule that is unknown with Check again, never "not sent", even with no kept key.
describe('an admission that gave up with no notice and no kept key', () => {
  it('reserve: "may have gone through" with Check again, never "not sent"', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    await push({ state: 'idle', notice: null });
    expect(await within(dialog).findByRole('button', { name: /^check again$/i })).toBeInTheDocument();
    expect(within(dialog).queryByText(strings.notSent)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: strings['mkt.confirmCta'] })).toBeNull();
    expect(dialog.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

// INSUFFICIENT_BALANCE carries a fresher balance than the wallet line shows: the balance is read again, so the lines
// and the spending gate are rebuilt from one read.
describe('an insufficient-balance refusal', () => {
  it('reserve: reads the balance again', async () => {
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting', idemKey: KEY, ceiling: 1000 });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const before = reads('balance');
    await push({ state: 'failed', failure: { code: 'INSUFFICIENT_BALANCE', requiredCents: 1000, availableCents: 500 } });
    await waitFor(() => expect(fx.api.state.phase).toBe('review'));
    await waitFor(() => expect(reads('balance')).toBeGreaterThan(before), { timeout: 1000 });
  });
});

// The POST's success and a listing re-read reach the hook before one render. The replaced machine
// already answered (confirmed): the drawer settles that answer, never "outcome unknown" for a success.
describe('a success that arrives together with a machine replacement', () => {
  it('reserve: the drawer ends done', async () => {
    fx.marketPend = [KEPT_RES];
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting', idemKey: KEY, ceiling: 1000 });
    expect(fx.api.state.phase).toBe('posting');
    const old = fx.pm;
    const onChange = fx.opts.onChange;
    const done = snap({ state: 'confirmed', rail: 'reserve', receipt: { created_at: '2026-10-23T08:00:00Z' } });
    old.snapshot.mockReturnValue(done);
    const n = fx.created.length;
    // The answer lands while the re-read answers: both are queued in one task, before React renders.
    fx.onListing = () => onChange(done);
    await act(async () => { fx.api.reload(); });
    await waitFor(() => expect(fx.created.length).toBeGreaterThan(n));
    expect(old.dispose).toHaveBeenCalled();
    await waitFor(() => expect(fx.api.state.phase).toBe('done'), { timeout: 1000 });
  });
});

// Two top-up resends before a render. The second finds this drawer's own resend out: it changes
// nothing and does not clear `running` (Cancel stays off while the first POST is out).
describe('two top-up resends before a render', () => {
  it('the second changes nothing; running stays on until the first answers', async () => {
    const held = { key: 'h'.repeat(20), method: 'card', amount: '35' };
    fx.tuPending = held;
    let land!: (v: unknown) => void;
    fx.tuSubmit = () => new Promise((r) => { land = r; });
    await renderPage(page, { path: '/billing?sheet=funds' });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.tu).not.toBeNull());
    let a!: Promise<any>, b!: Promise<any>;
    act(() => { a = fx.tu.resend(held); b = fx.tu.resend(held); });
    await settleAWhile();
    expect(fx.tuResends).toBe(1);
    expect(fx.tu.running).toBe(true);
    expect(await b).toEqual({ ok: false, ignored: true });
    await act(async () => { land({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_x' }); });
    expect((await a).ok).toBe(true);
    await waitFor(() => expect(fx.tu.running).toBe(false));
  });
});

// A top-up Check again while this drawer's own resend is out changes nothing and does not clear
// `running` (Cancel and the recovery controls stay off while the POST is out).
describe('a top-up Check again while the resend of this drawer is out', () => {
  it('changes nothing; running stays on until the resend answers', async () => {
    const held = { key: 'h'.repeat(20), method: 'card', amount: '35' };
    fx.tuPending = held;
    let land!: (v: unknown) => void;
    fx.tuSubmit = () => new Promise((r) => { land = r; });
    await renderPage(page, { path: '/billing?sheet=funds' });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.tu).not.toBeNull());
    let a!: Promise<any>, b!: Promise<any>;
    act(() => { a = fx.tu.resend(held); b = fx.tu.checkAgain(); });
    await settleAWhile();
    expect(fx.tu.running).toBe(true);
    expect(await b).toEqual({ ok: false, ignored: true });
    await act(async () => { land({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_x' }); });
    expect((await a).ok).toBe(true);
    await waitFor(() => expect(fx.tu.running).toBe(false));
  });
});

// Check again moves the ref at once, so a resend in the same batch finds the drawer checking and
// sends nothing (it would replay the kept request beside the read).
describe('Check again and a resend in one batch', () => {
  it('reserve: the resend sends nothing', async () => {
    fx.marketPend = [KEPT_RES];
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting', idemKey: KEY, ceiling: 1000 });
    const unknown = { state: 'indeterminate', retryIn: 0, idemKey: KEY, ceiling: 1000 };
    fx.pm.snapshot.mockReturnValue(snap(unknown));
    await push(unknown);
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    const shown = fx.api.resendShown();
    expect(shown?.key).toBe(KEY);
    act(() => { fx.api.checkAgain(); fx.api.resend(shown); });
    await settleAWhile();
    expect(fx.pm.retry).not.toHaveBeenCalled();
  });
});

// A reserve Retry whose admission is out keeps the machine indeterminate with
// `retrying` and publishes nothing. A replacement in that window must still end the drawer unknown (Retry offered),
// never left posting, and nothing is sent.
describe('a reserve Retry whose admission is out when the machine is replaced', () => {
  it('ends unknown with Retry offered; nothing is sent', async () => {
    fx.marketPend = [KEPT_RES];
    const { dialog, confirm } = await openMarket('reserve');
    await send(dialog, confirm);
    await push({ state: 'posting', idemKey: KEY, ceiling: 1000 });
    const unknown = { state: 'indeterminate', retryIn: 0, idemKey: KEY, ceiling: 1000 };
    fx.pm.snapshot.mockReturnValue(snap(unknown));
    await push(unknown);
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    const old = fx.pm;
    const sent = old.confirm.mock.calls.length;
    const shown = fx.api.resendShown();
    expect(shown?.key).toBe(KEY);
    // As core: the admission is accepted and held; the machine stays indeterminate with retrying true, and nothing is
    // published until it ends.
    fx.onRetry = () => { old.snapshot.mockReturnValue(snap({ ...unknown, retrying: true })); return true; };
    await act(async () => { fx.api.resend(shown); });
    expect(old.retry).toHaveBeenCalledTimes(1);
    expect(fx.api.state.phase).toBe('posting');
    const n = fx.created.length;
    await act(async () => { fx.api.reload(); });
    await waitFor(() => expect(fx.created.length).toBeGreaterThan(n));
    expect(old.dispose).toHaveBeenCalled();
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    expect(fx.api.state.retryIn).toBe(0);
    await settleAWhile();
    expect(fx.api.state.phase).toBe('unknown');
    expect(old.retry).toHaveBeenCalledTimes(1);
    expect(old.confirm.mock.calls.length).toBe(sent);
    expect(fx.created.slice(n).flatMap((c: any) => [...c.confirm.mock.calls, ...c.retry.mock.calls])).toEqual([]);
    expect(dialog.querySelector('[aria-busy="true"]')).toBeNull();
  });
});


// A buy matches a kept request on its family alone, so the plan opened (B) may not be the plan the kept request was made
// for (A). The adoption stays; the drawer names A, says it is the earlier request, and never names B or B's price.
describe('a buy that adopted a kept request of another plan of its family', () => {
  const B_TITLE = 'Small';
  const B_PRICE = '$12.00';
  const keptA = () => {
    fx.pendingAll = [{ kind: 'buy', user_id: 'u1', key: KEPT.key, plan_id: 'plan-plus-v1', family_id: 'fam-plus', title: 'Plus Legacy', at: 1 }];
    fx.keptTitle = 'Plus Legacy';
    fx.attPending = true;
  };
  const textIn = (el: HTMLElement) => el.textContent ?? '';

  it('names the kept request\'s own plan (A) and the earlier request, never the plan opened (B)', async () => {
    keptA();
    await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(strings['held.unknownTitle'])).toBeInTheDocument();
    expect(within(dialog).getAllByText('Plus Legacy').length).toBeGreaterThan(0);
    expect(textIn(dialog)).not.toContain(B_TITLE);
    expect(textIn(dialog)).not.toContain(strings['co.unknownTitle'].replace('{{subject}}', B_TITLE));
    // The resend line says what it repeats: the earlier request.
    expect(textIn(dialog)).toContain(strings['co.resendHint'].split('{{max}}')[0]!);
    // Labels only: the adopted request is what the attempt holds, and nothing was sent.
    expect(fx.att.confirm).not.toHaveBeenCalled();
  });

  it('control: the kept request is for the plan opened (no other title known): the plan opened is named', async () => {
    fx.attPending = true;
    await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(strings['co.unknownTitle'].replace('{{subject}}', B_TITLE))).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['held.unknownTitle'])).toBeNull();
  });

  it('control: no kept request: the review names the plan opened with its price', async () => {
    fx.keptTitle = 'Plus Legacy';
    await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: strings['buy.confirm'] });
    expect(textIn(dialog)).toContain(B_TITLE);
    expect(textIn(dialog)).toContain(B_PRICE);
    expect(textIn(dialog)).not.toContain('Plus Legacy');
    expect(within(dialog).queryByText(strings['held.unknownTitle'])).toBeNull();
  });
});

// The held title, once shown, stays with its attempt through the answer (core clears pending and key then), and only an
// adopted request is named so: this drawer's own Confirm whose answer was lost keeps the plan opened.
describe('the kept request\'s title through its answer, and only for an adopted request', () => {
  const doneB = strings['co.done.buy'].replace('{{plan}}', 'Small');
  const doneA = strings['co.done.buy'].replace('{{plan}}', 'Plus Legacy');

  it('a confirmed resend of the adopted request A, opened from plan B: done names A, never B', async () => {
    fx.pendingAll = [{ kind: 'buy', user_id: 'u1', key: KEPT.key, plan_id: 'plan-plus-v1', family_id: 'fam-plus', title: 'Plus Legacy', at: 1 }];
    fx.keptTitle = 'Plus Legacy';
    fx.attPending = true;
    const answer = { ok: true, result: { operation: {}, subscription: {}, replayed: false, failed: false } };
    // As core: the answer drops the kept entry, and the attempt holds no pending key any more.
    Object.defineProperty(fx, 'attConfirm', { configurable: true, get: () => { fx.attPending = false; fx.pendingAll = []; return answer; }, set: () => undefined });
    try {
      await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByText(strings['held.unknownTitle']);
      await resendIn(dialog);
      expect(await within(dialog).findByText(doneA)).toBeInTheDocument();
      expect(within(dialog).queryByText(doneB)).toBeNull();
      expect((dialog.textContent ?? '')).not.toContain('Small');
      expect(fx.att.confirm).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(fx, 'attConfirm', { configurable: true, writable: true, enumerable: true, value: { ok: false, reason: 'refused', definitive: true } });
    }
  });

  it('a kept request of the family that core adopted at Confirm (another key than this send minted) is named as the kept plan', async () => {
    fx.keptTitle = 'Plus Legacy';
    // As core: confirm mints this send's own key synchronously; the claim then finds another tab's kept entry of the
    // family and adopts it (preflight 'adopted'): nothing is sent, the attempt now holds that entry's key.
    Object.defineProperty(fx, 'attConfirm', {
      configurable: true,
      get: () => {
        fx.att.key = 'own-'.repeat(5);
        return Promise.resolve().then(() => {
          fx.att.key = undefined;
          fx.attPending = true;
          return { ok: false, reason: 'adopted', notSent: true };
        });
      },
      set: () => undefined,
    });
    try {
      await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByRole('button', { name: strings['buy.confirm'] });
      await userEvent.click(within(dialog).getByRole('checkbox'));
      await userEvent.click(within(dialog).getByRole('button', { name: strings['buy.confirm'] }));
      await waitFor(() => expect(fx.att.confirm).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(within(dialog).getAllByText('Plus Legacy').length).toBeGreaterThan(0));
      expect(within(dialog).queryByText(strings['co.unknownTitle'].replace('{{subject}}', 'Small'))).toBeNull();
    } finally {
      Object.defineProperty(fx, 'attConfirm', { configurable: true, writable: true, enumerable: true, value: { ok: false, reason: 'refused', definitive: true } });
    }
  });

  it('this drawer\'s own Confirm whose answer was lost keeps the plan opened, not "an earlier purchase"', async () => {
    fx.keptTitle = 'Plus Legacy';
    const answer = { ok: false, reason: 'unknown' };
    // As core: the own send's entry stays kept under the attempt's key (pending).
    Object.defineProperty(fx, 'attConfirm', { configurable: true, get: () => { fx.attPending = true; return answer; }, set: () => undefined });
    try {
      await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByRole('button', { name: strings['buy.confirm'] });
      await userEvent.click(within(dialog).getByRole('checkbox'));
      await userEvent.click(within(dialog).getByRole('button', { name: strings['buy.confirm'] }));
      await waitFor(() => expect(fx.att.confirm).toHaveBeenCalledTimes(1));
      expect(await within(dialog).findByText(strings['co.unknownTitle'].replace('{{subject}}', 'Small'))).toBeInTheDocument();
      expect(within(dialog).queryByText(strings['held.unknownTitle'])).toBeNull();
      expect((dialog.textContent ?? '')).not.toContain('Plus Legacy');
    } finally {
      Object.defineProperty(fx, 'attConfirm', { configurable: true, writable: true, enumerable: true, value: { ok: false, reason: 'refused', definitive: true } });
    }
  });
});

// A rent whose Check again saw an active rental while the machine's own read named one says it once.
describe('rent: an active rental found by Check again', () => {
  it('co.checkRented is drawn once, in the banner line, never again as a notice Band', async () => {
    const { dialog, confirm } = await openMarket('rent');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    await push({ state: 'indeterminate', advisory: true, retryIn: 0 });
    fx.checkRent.mockResolvedValue('active');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    await waitFor(() => expect(fx.checkRent).toHaveBeenCalled());
    await waitFor(() => expect(within(dialog).getAllByText(strings['co.checkRented'], { exact: false }).length).toBeGreaterThan(0));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(within(dialog).getAllByText(strings['co.checkRented'], { exact: false })).toHaveLength(1);
  });
  it('control: without the machine\'s match, the Check again finding is the notice Band', async () => {
    const { dialog, confirm } = await openMarket('rent');
    await send(dialog, confirm);
    await push({ state: 'posting' });
    await push({ state: 'indeterminate', retryIn: 0 });
    fx.checkRent.mockResolvedValue('active');
    await userEvent.click(await within(dialog).findByRole('button', { name: /^check again$/i }));
    expect(await within(dialog).findByText(strings['co.checkRented'])).toBeInTheDocument();
  });
});

// Retry on a failed quote shows its busy state until the new read answers.
describe('a failed quote, retried', () => {
  it('Retry shows busy while the new read is out, and the review follows its answer', async () => {
    fx.quoteFails = true;
    await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(strings['buy.quoteErr']);
    let answer: (v: unknown) => void = () => undefined;
    fx.quoteFails = false;
    fx.quoteNext = () => new Promise((r) => { answer = r; });
    const retry = within(dialog).getByRole('button', { name: /try again|retry/i });
    // Busy, as the kit draws it (a busy Button's pending state, or the compact link refused while retrying).
    const busy = (b: HTMLElement) => b.getAttribute('aria-busy') === 'true' || b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true';
    expect(busy(retry)).toBe(false);
    await userEvent.click(retry);
    await waitFor(() => expect(busy(within(dialog).getByRole('button', { name: /try again|retry/i }))).toBe(true));
    await act(async () => { answer({ charge_cents: 1200, price_cents_per_month: 1200 }); });
    await within(dialog).findByRole('button', { name: strings['buy.confirm'] });
  });
});
