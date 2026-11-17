// Vitest: the live market drawer's price error. The drawer reads the listing,
// then the checkout hook reads its row. "Couldn't check the price." may show only when the hook's read for this target
// has ended without a price: never while it is out, never from an earlier answer, and a failed read ends it too.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { bump } from '@core/ctx';
import { purchaseRow } from './logic';
import page from './page';
import strings from './strings.en.json';

type Answer = { stock: any[]; offers: any[]; errStock: unknown; errOffers: unknown };

const fx = vi.hoisted(() => ({
  calls: 0,
  // Per call number: a promise the read waits on before it answers.
  hold: {} as Record<number, Promise<void>>,
  // What every read after the drawer's first one answers (the hook's, however many it makes), until healed.
  later: null as null | 'none' | 'fail' | 'unpriced' | 'pricier',
  // Core's held purchases: reservations (marketPendingFor) and rents (rentPendingFor) of this account.
  pend: [] as any[],
  rent: [] as any[],
  // Every purchase machine made: the kept request it recovers, or null for a fresh one.
  created: [] as unknown[],
  rentChecks: 0,
  // Every resend: the key of the kept request the machine recovered (null: a fresh machine).
  retried: [] as (string | null)[],
  healed: false,
  // Per call number: this read alone fails (as a failed read answers).
  failAt: {} as Record<number, true>,
  // The purchase's send: 'held' answers as core does behind an earlier unresolved purchase (outcome unknown).
  send: 'ok' as 'ok' | 'held',
  // The newest purchase machine's onChange: a test answers its send through it, as core does.
  onChange: null as null | ((s: any) => void),
  // Every purchase confirm any machine was asked for (a send), and the newest render's checkout api.
  confirms: 0,
  api: null as any,
}));

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

/** The same server and term, now at 15.00 (1500 cents) instead of 10.00. */
const pricier = (kind: 'stock' | 'offer') => {
  const r = row(kind) as any;
  return kind === 'offer'
    ? { ...r, maps: { ...r.maps, pricing: { '30': 1500 } } }
    : { ...r, maps: { tiers: { '30': { price: '15.00', total_first_payment: '15.00', hold_days: 3 } } } };
};

/** The same server, still listed, but its 30-day term no longer has a total that parses. */
const unpriced = (kind: 'stock' | 'offer') => {
  const r = row(kind) as any;
  return kind === 'offer'
    ? { ...r, maps: { ...r.maps, pricing: { '30': 'n/a' } } }
    : { ...r, maps: { tiers: { '30': { price: '10.00', total_first_payment: 'n/a', hold_days: 3 } } } };
};

const snap = () => ({
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
});

vi.mock('@core', async (orig) => {
  const a: Record<string, any> = await orig();
  return {
    ...a,
    // Web locks present (a current browser): the resend of a kept reservation is offered.
    commerceRules: { ...a.commerceRules, readPendingAll: () => [], buy: { ...a.commerceRules.buy, hasWebLocks: () => true } },
    commerce: {
      ...a.commerce,
      shownOwner: () => ({ owner: 'u1', live: () => true }),
      loadListing: async (): Promise<Answer> => {
        const n = ++fx.calls;
        if (fx.hold[n]) await fx.hold[n];
        const bad = fx.failAt[n] ? 'fail' : n > 1 && !fx.healed ? fx.later : null;
        if (bad === 'fail') return { stock: [], offers: [], errStock: { kind: 'server' }, errOffers: { kind: 'server' } };
        if (bad === 'none') return { stock: [], offers: [], errStock: null, errOffers: null };
        if (bad === 'pricier') return { stock: [pricier('stock')], offers: [pricier('offer')], errStock: null, errOffers: null };
        if (bad === 'unpriced') return { stock: [unpriced('stock')], offers: [unpriced('offer')], errStock: null, errOffers: null };
        return { stock: [row('stock')], offers: [row('offer')], errStock: null, errOffers: null };
      },
      marketPendingFor: () => fx.pend,
      marketPendingKept: () => false,
      pendingUpgrades: () => [],
      rentPendingFor: () => fx.rent,
      checkRentPending: async () => {
        fx.rentChecks++;
        return 'absent';
      },
      heldPlanEntry: () => null,
      readTopupReturn: () => null,
      createPurchase: (_row: unknown, _days: unknown, o?: { recover?: { key: string } | null }) => {
        fx.created.push(o?.recover ?? null);
        fx.onChange = (o as any)?.onChange ?? null;
        const held = !!o?.recover;
        return {
        confirm: vi.fn(() => {
          fx.confirms++;
          return fx.send === 'held' ? { ok: false, reason: 'unresolved' } : { ok: true };
        }),
        retry: vi.fn(() => {
          fx.retried.push(held ? o!.recover!.key : null);
          return true;
        }),
        retryRent: vi.fn(() => true),
        dismiss: vi.fn(() => true),
        refresh: vi.fn(async () => undefined),
        checkAgain: vi.fn(),
        resume: vi.fn(),
        dispose: vi.fn(),
        snapshot: vi.fn(() => ({ ...snap(), state: held ? 'indeterminate' : 'idle', idemKey: held ? o!.recover!.key : null })),
        };
      },
    },
  };
});

vi.mock('./data', async (orig) => {
  const a: Record<string, any> = await orig();
  return {
    ...a,
    // Records every render's api, so a test can call a kept (earlier render's) or the newest callback directly.
    useCheckout: (...args: any[]) => {
      const api = a.useCheckoutLive(...args);
      fx.api = api;
      return api;
    },
    useListing: a.useListingLive,
    useUnknownCheckouts: a.useUnknownCheckoutsLive,
    usePaymentReturn: a.usePaymentReturnLive,
  };
});

const PATH = '/billing?checkout=rent&item=mkt_sin_m&days=30';
const WORDS = strings['buy.quoteErr'];

/** Every time the drawer shows the price error, from the first paint on. */
const watchWords = () => {
  let seen = 0;
  let on = false;
  const look = () => {
    const now = (document.body.textContent ?? '').includes(WORDS);
    if (now && !on) seen++;
    on = now;
  };
  const mo = new MutationObserver(look);
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  return { seen: () => (look(), seen), stop: () => mo.disconnect() };
};

const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

beforeEach(() => {
  fx.calls = 0;
  fx.hold = {};
  fx.later = null;
  fx.pend = [];
  fx.rent = [];
  fx.created = [];
  fx.rentChecks = 0;
  fx.retried = [];
  fx.healed = false;
  fx.failAt = {};
  fx.send = 'ok';
  fx.onChange = null;
  fx.confirms = 0;
  fx.api = null;
});

describe('market drawer: the price error comes only from an ended read for this target', () => {
  it('reads answering at once: two listing reads, no price error, then the review', async () => {
    const w = watchWords();
    await renderPage(page, { path: PATH });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByRole('checkbox', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(w.seen()).toBe(0);
    w.stop();
    // The drawer's listing and the hook's row; no read for a row without an id.
    expect(fx.calls).toBe(2);
  });

  it("the hook's row read held: no price error while it is out, the review once it answers", async () => {
    let open!: () => void;
    fx.hold[2] = new Promise<void>((r) => { open = r; });
    const w = watchWords();
    await renderPage(page, { path: PATH });
    const d = await screen.findByRole('dialog');
    await wait(400);
    expect(fx.calls).toBe(2);
    expect(within(d).queryByRole('checkbox')).toBeNull();
    expect(w.seen()).toBe(0);
    await act(async () => open());
    expect(await within(d).findByRole('checkbox', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(w.seen()).toBe(0);
    w.stop();
  });

  it("the drawer's own read held: no price error before the drawer has a target", async () => {
    // Before its target is known the hook has nothing to read; nothing may count as its answer while the drawer waits.
    let open!: () => void;
    fx.hold[1] = new Promise<void>((r) => { open = r; });
    const w = watchWords();
    await renderPage(page, { path: PATH });
    const d = await screen.findByRole('dialog');
    await wait(400);
    expect(fx.calls).toBe(1);
    await act(async () => open());
    expect(await within(d).findByRole('checkbox', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(w.seen()).toBe(0);
    w.stop();
  });

  it("the hook's row read fails: the price error shows (not a wait for good), and Try again reads the row again", async () => {
    fx.later = 'fail';
    await renderPage(page, { path: PATH });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(WORDS, {}, { timeout: 10_000 })).toBeInTheDocument();
    const before = fx.calls;
    fx.healed = true;
    await userEvent.click(within(d).getByRole('button', { name: /try again/i }));
    expect(await within(d).findByRole('checkbox', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(fx.calls).toBeGreaterThan(before);
    expect(within(d).queryByText(WORDS)).toBeNull();
  });

  it("the hook's row has no usable price for the term: the price error with Try again, not a wait for good", async () => {
    fx.later = 'unpriced';
    await renderPage(page, { path: PATH });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(WORDS, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByRole('checkbox')).toBeNull();
    fx.healed = true;
    await userEvent.click(within(d).getByRole('button', { name: /try again/i }));
    expect(await within(d).findByRole('checkbox', {}, { timeout: 10_000 })).toBeInTheDocument();
  });

  it('a real miss still shows the price error: the row is gone by the time the hook reads it', async () => {
    fx.later = 'none';
    await renderPage(page, { path: PATH });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(WORDS, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByRole('checkbox')).toBeNull();
  });
});

const RESERVE = '/billing?checkout=reserve&item=mkt_sin_m&days=30';
const kept = (days: string) => ({ user_id: 'u1', offer_id: 'mkt_sin_m', days, key: 'kept-k1', ceiling: 1000, at: Date.now(), name: 'Singapore M' });

describe('a held purchase whose row no longer prices its term: its unknown outcome, never the price error', () => {
  it('a reservation held for this term: the drawer opens on its outcome, recovered from the kept request', async () => {
    fx.later = 'unpriced';
    fx.pend = [kept('30')];
    const w = watchWords();
    await renderPage(page, { path: RESERVE });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(strings['mkt.indeterminateTitle'], {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(w.seen()).toBe(0);
    w.stop();
    expect(within(d).queryByRole('checkbox')).toBeNull();
    expect(fx.created).toContainEqual(fx.pend[0]);
    // Never a fresh purchase from this row: no Start a new purchase without a quote.
    expect(within(d).queryByRole('button', { name: strings['mkt.recoverNew'] })).toBeNull();
    // Its resend replays the kept request: the recovered machine, with the kept key.
    await userEvent.click(within(d).getByRole('button', { name: strings['co.resend'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['co.resendConfirm'] }));
    expect(fx.retried).toEqual(['kept-k1']);
  });

  it('a rent held for this server: its outcome, Check again reads only, and no second rent without a price', async () => {
    fx.later = 'unpriced';
    fx.rent = [{ server_id: 'mkt_sin_m', sending: false }];
    const w = watchWords();
    await renderPage(page, { path: PATH });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(/we couldn't confirm/i, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(w.seen()).toBe(0);
    w.stop();
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await wait(500);
    expect(fx.rentChecks).toBeGreaterThan(0);
    // The check found no rental: a fresh rent would be offered, but this row cannot price one.
    expect(within(d).queryByRole('button', { name: strings['mkt.rentAgain'] })).toBeNull();
  });

  it('a reservation held for another term only: this term is a fresh purchase, so the price error, and nothing recovered', async () => {
    fx.later = 'unpriced';
    fx.pend = [kept('7')];
    await renderPage(page, { path: RESERVE });
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(WORDS, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(fx.created.filter((c) => c !== null)).toEqual([]);
  });
});

/** Opens the drawer to its review, consent ticked: the step a stale price must never stay on. */
const toReview = async () => {
  await renderPage(page, { path: PATH });
  const d = await screen.findByRole('dialog');
  const box = await within(d).findByRole('checkbox', {}, { timeout: 10_000 });
  await userEvent.click(box);
  expect(box).toBeChecked();
  return d;
};

/** A Confirm that can be pressed (the footer keeps a disabled one outside the review). */
const liveConfirm = (d: HTMLElement) => {
  const c = within(d).queryByRole('button', { name: /^confirm/i });
  return !!c && !c.hasAttribute('disabled');
};

/** Holds the next two listing reads (the drawer's own and the hook's, which a generation move starts together). */
const holdNextTwo = () => {
  let open!: () => void;
  const p = new Promise<void>((r) => { open = r; });
  fx.hold[fx.calls + 1] = p;
  fx.hold[fx.calls + 2] = p;
  return () => act(async () => open());
};

describe('market review: it stands only on the row read for the current inputs', () => {
  it('a Confirm kept from a render whose machine a re-read replaced sends nothing and leaves no posting; the newest one sends', async () => {
    const d = await toReview();
    // The api of the first review: its confirm holds that row's machine.
    const kept = fx.api.confirm;
    const made = fx.created.length;
    await act(async () => { bump('late'); });
    const box = await within(d).findByRole('checkbox', {}, { timeout: 10_000 });
    await waitFor(() => expect(fx.created.length).toBeGreaterThan(made), { timeout: 10_000 });
    await userEvent.click(box);
    await waitFor(() => expect(liveConfirm(d)).toBe(true));
    await act(async () => { kept(); });
    await wait(200);
    expect(fx.confirms).toBe(0);
    expect(fx.api.state.phase).not.toBe('posting');
    await act(async () => { fx.api.confirm(); });
    await wait(200);
    expect(fx.confirms).toBe(1);
  });
  it('a generation move: while its reads are out no review stands on the earlier row; the answer asks consent again', async () => {
    const d = await toReview();
    const release = holdNextTwo();
    await act(async () => { bump('late'); });
    await wait(300);
    expect(fx.calls).toBeGreaterThanOrEqual(3);
    expect(within(d).queryByRole('checkbox')).toBeNull();
    expect(liveConfirm(d)).toBe(false);
    await release();
    const box = await within(d).findByRole('checkbox', {}, { timeout: 10_000 });
    expect(box).not.toBeChecked();
  });

  for (const which of [1, 2] as const) {
    it(`a generation move whose re-read number ${which} of 2 fails: no earlier review stands`, async () => {
      const d = await toReview();
      fx.failAt[fx.calls + which] = true;
      await act(async () => { bump('late'); });
      await wait(800);
      expect(fx.calls).toBeGreaterThanOrEqual(4);
      expect(within(d).queryByRole('checkbox')).toBeNull();
      expect(liveConfirm(d)).toBe(false);
    });
  }

  it('a send that comes back not sent while the re-read is out: no review on the earlier row; a lost row ends at the price error', async () => {
    const d = await toReview();
    await userEvent.click(within(d).getByRole('button', { name: /^confirm/i }));
    await wait(200);
    // Posting: the consent is locked while the send is out.
    expect(within(d).getByRole('checkbox')).toBeDisabled();
    const release = holdNextTwo();
    fx.failAt[fx.calls + 2] = true;
    await act(async () => { bump('late'); });
    await wait(300);
    // Core answers the send: nothing went (the review it would go back to stood on the earlier row).
    await act(async () => { fx.onChange?.({ ...snap(), state: 'idle', notice: 'noLocks' }); });
    await wait(300);
    expect(within(d).queryByRole('checkbox')).toBeNull();
    expect(liveConfirm(d)).toBe(false);
    await release();
    expect(await within(d).findByText(WORDS, {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByRole('checkbox')).toBeNull();
    expect(liveConfirm(d)).toBe(false);
  });

  it('a send that comes back not sent while the re-read is out: the fresh review asks consent again and still says why', async () => {
    const d = await toReview();
    await userEvent.click(within(d).getByRole('button', { name: /^confirm/i }));
    await wait(200);
    const release = holdNextTwo();
    await act(async () => { bump('late'); });
    await wait(300);
    await act(async () => { fx.onChange?.({ ...snap(), state: 'idle', notice: 'noLocks' }); });
    await wait(300);
    expect(within(d).queryByRole('checkbox')).toBeNull();
    await release();
    const box = await within(d).findByRole('checkbox', {}, { timeout: 10_000 });
    expect(box).not.toBeChecked();
    expect(within(d).getByText(strings.noLocks)).toBeInTheDocument();
  });

  it('an unknown outcome keeps its step through a generation move and its reads', async () => {
    fx.send = 'held';
    const d = await toReview();
    await userEvent.click(within(d).getByRole('button', { name: /^confirm/i }));
    const title = await within(d).findByText(/we couldn't confirm/i, {}, { timeout: 10_000 });
    const words = title.textContent ?? '';
    const release = holdNextTwo();
    await act(async () => { bump('late'); });
    await wait(300);
    expect(within(d).getByText(words)).toBeInTheDocument();
    await release();
    await wait(300);
    expect(within(d).getByText(words)).toBeInTheDocument();
    expect(within(d).queryByText(WORDS)).toBeNull();
  });
});

describe('the backstops behind the buttons: a callback kept or called directly sends nothing stale', () => {
  it('a confirm kept from a review whose re-read is out sends nothing, even once a fresh review is consented', async () => {
    const d = await toReview();
    const release = holdNextTwo();
    await act(async () => { bump('late'); });
    await wait(300);
    // The api of a render whose row read is out: its confirm is the old one.
    const kept = fx.api.confirm;
    await release();
    const box = await within(d).findByRole('checkbox', {}, { timeout: 10_000 });
    await userEvent.click(box);
    const before = fx.confirms;
    await act(async () => { kept(); });
    await wait(200);
    expect(fx.confirms - before).toBe(0);
  });

  it('a held rent on an unpriced row: still unknown with no quote, and rentAgain called directly sends nothing', async () => {
    fx.later = 'unpriced';
    fx.rent = [{ server_id: 'mkt_sin_m', sending: false }];
    await renderPage(page, { path: PATH });
    const d = await screen.findByRole('dialog');
    await within(d).findByText(/we couldn't confirm/i, {}, { timeout: 10_000 });
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await wait(500);
    expect(fx.api.state.quote).toBeNull();
    await act(async () => { fx.api.rentAgain(); });
    await wait(200);
    expect(fx.confirms).toBe(0);
  });
});

describe('Rent again only at the price the drawer shows', () => {
  /** A held rent, checked once (no rental found): the drawer offers Rent again at 10.00. */
  const toRentAgain = async () => {
    fx.rent = [{ server_id: 'mkt_sin_m', sending: false }];
    await renderPage(page, { path: PATH });
    const d = await screen.findByRole('dialog');
    await within(d).findByText(/we couldn't confirm/i, {}, { timeout: 10_000 });
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    expect(await within(d).findByRole('button', { name: strings['mkt.rentAgain'] }, { timeout: 10_000 })).toBeInTheDocument();
    expect(fx.api.state.quote?.chargeCents).toBe(1000);
    return d;
  };

  it('the Rent again confirm says the most it may charge: the price the drawer shows', async () => {
    const d = await toRentAgain();
    await userEvent.click(within(d).getByRole('button', { name: strings['mkt.rentAgain'] }));
    expect(await screen.findByText(strings['mkt.rentAgainTitle'], {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.getByText('You will be charged up to $10.00.')).toBeInTheDocument();
    expect(screen.getByText(strings['mkt.rentAgainBody'])).toBeInTheDocument();
    // Read with the body as the dialog's description.
    expect(screen.getByRole('alertdialog', { name: strings['mkt.rentAgainTitle'] })).toHaveAccessibleDescription(expect.stringContaining('You will be charged up to $10.00.'));
  });

  it('the row re-read prices the term at 15.00: no Rent again, and rentAgain sends nothing, while the read is out or after', async () => {
    const d = await toRentAgain();
    fx.later = 'pricier';
    const release = holdNextTwo();
    await act(async () => { bump('late'); });
    await wait(300);
    expect(within(d).queryByRole('button', { name: strings['mkt.rentAgain'] })).toBeNull();
    await act(async () => { fx.api.rentAgain(); });
    await wait(200);
    expect(fx.confirms).toBe(0);
    await release();
    await wait(500);
    // The drawer still shows the 10.00 it was opened at; the row now asks 15.00.
    expect(fx.api.state.quote?.chargeCents).toBe(1000);
    expect(within(d).queryByRole('button', { name: strings['mkt.rentAgain'] })).toBeNull();
    await act(async () => { fx.api.rentAgain(); });
    await wait(200);
    expect(fx.confirms).toBe(0);
  });

  it('a rentAgain kept from the render that priced 15.00, called once a re-read is back at the shown 10.00: nothing sent, not posting', async () => {
    const d = await toRentAgain();
    fx.later = 'pricier';
    await act(async () => { bump('late'); });
    await wait(500);
    expect(within(d).queryByRole('button', { name: strings['mkt.rentAgain'] })).toBeNull();
    // The api of a render on the 15.00 row: its rentAgain holds that row's machine.
    const kept = fx.api.rentAgain;
    fx.healed = true;
    await act(async () => { bump('late'); });
    expect(await within(d).findByRole('button', { name: strings['mkt.rentAgain'] }, { timeout: 10_000 })).toBeInTheDocument();
    await act(async () => { kept(); });
    await wait(200);
    expect(fx.confirms).toBe(0);
    expect(fx.api.state.phase).not.toBe('posting');
  });

  it('a rentAgain kept from the priced render, called while the re-read is out: nothing sent (read at call time)', async () => {
    await toRentAgain();
    // Same machine, same shown price: only the call-time read of the row (not the render's closure) refuses it.
    const kept = fx.api.rentAgain;
    const release = holdNextTwo();
    await act(async () => { bump('late'); });
    await wait(300);
    await act(async () => { kept(); });
    await wait(200);
    expect(fx.confirms).toBe(0);
    await release();
  });

  it('the re-read prices the term as shown: Rent again comes back and sends once', async () => {
    const d = await toRentAgain();
    const release = holdNextTwo();
    await act(async () => { bump('late'); });
    await wait(300);
    await release();
    const again = await within(d).findByRole('button', { name: strings['mkt.rentAgain'] }, { timeout: 10_000 });
    expect(again).toBeInTheDocument();
    await act(async () => { fx.api.rentAgain(); });
    await wait(200);
    expect(fx.confirms).toBe(1);
  });
});

describe('purchaseRow: a purchase is built only from the row of its own target', () => {
  const r = { ...row('stock'), id: 'mkt_sin_m' } as any;
  it("takes the target's own row with a term", () => {
    expect(purchaseRow(r, 'mkt_sin_m', 30)).toBe(r);
  });
  it('refuses a row of another server, even with a term', () => {
    expect(purchaseRow(r, 'mkt_other_l', 30)).toBeNull();
  });
  it('refuses with no row, no target item or no term', () => {
    expect(purchaseRow(null, 'mkt_sin_m', 30)).toBeNull();
    expect(purchaseRow(r, null, 30)).toBeNull();
    expect(purchaseRow(r, 'mkt_sin_m', null)).toBeNull();
  });
  it('refuses a term the row cannot price: not offered, or a total that does not parse', () => {
    expect(purchaseRow(r, 'mkt_sin_m', 7)).toBeNull();
    expect(purchaseRow(unpriced('stock'), 'mkt_sin_m', 30)).toBeNull();
    expect(purchaseRow(unpriced('offer'), 'mkt_sin_m', 30)).toBeNull();
    expect(purchaseRow({ ...row('offer'), id: 'mkt_sin_m' } as any, 'mkt_sin_m', 30)).not.toBeNull();
  });
  it('a held purchase takes its own row without a price, never another server\'s', () => {
    const u = unpriced('stock') as any;
    expect(purchaseRow(u, 'mkt_sin_m', 30, true)).toBe(u);
    expect(purchaseRow(u, 'mkt_other_l', 30, true)).toBeNull();
  });
});
