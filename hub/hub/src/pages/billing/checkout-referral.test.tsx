// Vitest: the live Checkout drawer counts Referral credit as the server spends it.
// A server purchase spends Referral credit first, then the general wallet, so the
// review's "can I pay" is general + Referral credit: someone whose credit covers the charge can confirm, and a short
// wallet is short by what the sum lacks. The review shows the two lines separately. The balance comes from the page
// fixtures (checkout-referral-*, checkout-baremetal-setup); the commerce machines are the same fakes as
// checkout-live-hook. Rent and reserve charge the listing's total, setup included (commerceRules.quoteFor), and
// Referral credit pays setup too, so affordability uses that total.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const fx = vi.hoisted(() => ({
  opts: null as any,
  created: [] as any[],
  rentMarks: [] as any[],
  checkRent: vi.fn(),
  pm: null as any,
  att: null as any,
  quoteFails: false,
  attPending: false,
  tuPending: null as any,
  tuSelect: true,
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
  offer: null as any,
}));

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
  select: () => fx.tuSelect,
  submit: async () => ({ ok: false, reason: 'busy' }),
  checkAgain: async () => fx.tuCheck,
  snapshot: () => ({ pending: fx.tuPending }),
};

vi.mock('@core', async (orig) => {
  const a: Record<string, any> = await orig();
  return {
    ...a,
    commerceRules: { ...a.commerceRules, readPendingAll: () => fx.pendingAll },
    commerce: {
      ...a.commerce,
      shownOwner: () => ({ owner: 'u1', live: () => true }),
      loadListing: async () => ({ stock: [row('stock')], offers: [fx.offer ?? row('offer')], errStock: null, errOffers: null }),
      marketPendingFor: () => fx.marketPend,
      pendingUpgrades: () => fx.upgrades,
      rentPendingFor: () => fx.rentMarks,
      checkRentPending: (...args: unknown[]) => fx.checkRent(...args),
      readTopupReturn: () => fx.ret,
      verifyReturn: async () => fx.verified,
      useTopUp: () => ({ state: { pending: null, phase: 'ready', methods: [{ key: 'card', min: 5, max: 1000 }] }, machine: tuMachine }),
      createAttempt: (...args: unknown[]) => {
        fx.attArgs = args;
        fx.att = {
          quote: vi.fn(async () => {
            if (fx.quoteFails) throw { kind: 'server' };
            return { charge_cents: 1200, price_cents_per_month: 1200 };
          }),
          confirm: vi.fn(async () => fx.attConfirm),
          snapshot: vi.fn(() => ({ phase: 'review', error: { kind: 'typed', code: 'CHARGE_EXCEEDS_MAX' }, ceiling: 1200, pending: fx.attPending })),
          resume: vi.fn(),
          dispose: vi.fn(),
        };
        return fx.att;
      },
      createPurchase: (_row: unknown, _days: string, opts: any) => {
        fx.opts = opts;
        const pm: any = {
          confirm: vi.fn(() => ({ ok: true })),
          retry: vi.fn(() => (fx.onRetry ? fx.onRetry(opts) : true)),
          retryRent: vi.fn(() => true),
          dismiss: vi.fn(() => true),
          refresh: vi.fn(async () => undefined),
          checkAgain: vi.fn(),
          resume: vi.fn(),
          dispose: vi.fn(),
          snapshot: vi.fn(() => snap()),
        };
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
    useCheckout: a.useCheckoutLive,
    useListing: a.useListingLive,
    useUnknownCheckouts: a.useUnknownCheckoutsLive,
    useTopUp: a.useTopUpLive,
    usePaymentReturn: a.usePaymentReturnLive,
    useBalance: () => ({ ...a.useBalance(), refetch: fx.balRefetch }),
  };
});

beforeEach(() => {
  fx.created.length = 0;
  fx.rentMarks = [];
  fx.quoteFails = false;
  fx.attPending = false;
  fx.pendingAll = [];
  fx.upgrades = [];
  fx.marketPend = [];
  fx.attConfirm = { ok: false, reason: 'refused', definitive: true };
  fx.offer = null;
});

/** The money row whose label matches, as [label, amount]. Buy a plan says its money in two Ledgers (the order, then the
 * wallet); every other kind keeps the one summary list. */
function line(dialog: HTMLElement, label: RegExp): [string, string] | null {
  const lists = dialog.querySelectorAll(`dl[aria-label="${strings['co.summary']}"], dl[aria-label="${strings.wallet}"]`);
  for (const dl of Array.from(lists)) {
    for (const div of Array.from(dl.children)) {
      const dt = div.querySelector('dt')?.textContent ?? '';
      if (label.test(dt)) return [dt, div.querySelector('dd')?.textContent ?? ''];
    }
  }
  return null;
}

// A body sentence, exactly once outside the footer: Buy a plan's footer may say the first failing gate as its reason line.
async function inBody(dialog: HTMLElement, text: RegExp | string): Promise<HTMLElement> {
  const all = await within(dialog).findAllByText(text);
  const body = all.filter((e) => !e.closest('footer'));
  expect(body).toHaveLength(1);
  return body[0]!;
}

async function openBuy(state: string) {
  await renderPage(page, { state, path: '/billing?checkout=buy&plan=fam-plus' });
  const dialog = await screen.findByRole('dialog');
  const confirm = await within(dialog).findByRole('button', { name: strings['buy.confirm'] });
  await waitFor(() => expect(fx.att.quote).toHaveBeenCalled());
  return { dialog, confirm };
}
/** Buy a plan's Confirm, read now: the reasoned (action-less) one while its gate is closed, the real one once it opens. */
const confirmOf = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: strings['buy.confirm'] });

describe('Checkout: Referral credit counts toward the charge', () => {
  it('referral_credit_covers_charge: general 5.00 + Referral credit 10.00 on a 12.00 charge confirms, no Add funds', async () => {
    const { dialog } = await openBuy('checkout-referral-covers');
    await waitFor(() => expect(line(dialog, /referral credit/i)).not.toBeNull());
    expect(line(dialog, /referral credit/i)![1]).toContain('$10.00');
    expect(line(dialog, new RegExp(strings['buy.wallet'], 'i'))![1]).toContain('$5.00');
    expect(within(dialog).queryByRole('button', { name: strings.addFunds })).toBeNull();
    expect(within(dialog).queryByText(/short for this purchase/i)).toBeNull();
    await userEvent.click(within(dialog).getByRole('checkbox'));
    await waitFor(() => expect(confirmOf(dialog)).toBeEnabled());
    expect(confirmOf(dialog)).not.toHaveAttribute('aria-disabled');
  });

  it('partial_shortfall_uses_sum: general 5.00 + Referral credit 4.00 on 12.00 is short by $3.00, with Add funds', async () => {
    const { dialog } = await openBuy('checkout-referral-partial');
    await waitFor(() => expect(line(dialog, /referral credit/i)).not.toBeNull());
    expect(line(dialog, /referral credit/i)![1]).toContain('$4.00');
    expect(line(dialog, new RegExp(strings['buy.wallet'], 'i'))![1]).toContain('$5.00');
    expect(await inBody(dialog, /\$3\.00 short for this purchase/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings.addFunds })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect(confirmOf(dialog)).toHaveAttribute('aria-disabled', 'true');
  });

  it('partial_shortfall_uses_sum: Add funds starts at the shortfall, raised to the provider minimum ($3.00 short, card minimum $5)', async () => {
    const { dialog } = await openBuy('checkout-referral-partial');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings.addFunds }));
    const amount = await within(dialog).findByRole('textbox', { name: strings['top.otherLabel'] });
    await waitFor(() => expect(amount).toHaveValue('5.00'));
    // The person's own amount wins over the prefill.
    await userEvent.clear(amount);
    await userEvent.type(amount, '42');
    expect(amount).toHaveValue('42');
  });

  it('unreadable_general_stays_unknown: Referral credit alone never lets an unreadable wallet confirm', async () => {
    const { dialog } = await openBuy('checkout-referral-nogeneral');
    expect(await inBody(dialog, strings['mkt.balanceUnavailable'])).toBeInTheDocument();
    expect(line(dialog, /referral credit/i)).toBeNull();
    await userEvent.click(within(dialog).getByRole('checkbox'));
    expect(confirmOf(dialog)).toHaveAttribute('aria-disabled', 'true');
  });

  it('wallet_card_line_only_above_zero (review): no Referral credit line when the account has none', async () => {
    const { dialog } = await openBuy('many');
    await waitFor(() => expect(line(dialog, new RegExp(strings['buy.wallet'], 'i'))).not.toBeNull());
    expect(line(dialog, /referral credit/i)).toBeNull();
  });

  it('malformed_referral_counts_zero (review): a malformed Referral credit adds no line and counts 0 (short by $7.00)', async () => {
    const { dialog } = await openBuy('checkout-referral-malformed');
    await waitFor(() => expect(line(dialog, new RegExp(strings['buy.wallet'], 'i'))).not.toBeNull());
    expect(line(dialog, /referral credit/i)).toBeNull();
    expect(await inBody(dialog, /\$7\.00 short for this purchase/i)).toBeInTheDocument();
  });

  it('baremetal_setup_in_affordability: rental 90.00 + setup 20.00 against 60.00 + 40.00 is short by $10.00', async () => {
    fx.offer = { ...row('offer'), maps: { pricing: { '30': 9000 }, hold: { '30': 3 }, feeCents: 2000 } };
    await renderPage(page, { state: 'checkout-baremetal-setup', path: '/billing?checkout=reserve&item=mkt_sin_m&days=30' });
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(line(dialog, /referral credit/i)).not.toBeNull());
    expect(line(dialog, /referral credit/i)![1]).toContain('$40.00');
    expect(await inBody(dialog, /\$10\.00 short for this purchase/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: strings.addFunds }));
    const amount = await within(dialog).findByRole('textbox', { name: strings['top.otherLabel'] });
    await waitFor(() => expect(amount).toHaveValue('10.00'));
  });

  it('split_change_rerenders_lines: general 10/credit 5 -> general 5/credit 10 (same total) updates both lines', async () => {
    const r = await renderPage(page, { state: 'checkout-referral-split', path: '/billing?checkout=buy&plan=fam-plus' });
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(fx.att.quote).toHaveBeenCalled());
    await waitFor(() => expect(line(dialog, /referral credit/i)).not.toBeNull());
    expect(line(dialog, new RegExp(strings['buy.wallet'], 'i'))![1]).toContain('$10.00');
    expect(line(dialog, /referral credit/i)![1]).toContain('$5.00');
    const isBalance = (k: readonly unknown[]) => JSON.stringify(k).includes('"balance"');
    expect(r.queryClient.getQueryCache().findAll({ predicate: (q) => isBalance(q.queryKey) }).length).toBeGreaterThan(0);
    await act(async () => {
      r.queryClient.setQueriesData({ predicate: (q) => isBalance(q.queryKey) }, { general: '5.00', referral: '10.00', owed: '0.00' });
    });
    await waitFor(() => expect(line(dialog, new RegExp(strings['buy.wallet'], 'i'))![1]).toContain('$5.00'));
    expect(line(dialog, /referral credit/i)![1]).toContain('$10.00');
  });
});
