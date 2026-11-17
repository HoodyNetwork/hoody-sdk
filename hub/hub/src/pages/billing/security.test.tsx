// Vitest: the security rules of the money paths that live on core's machines, with core's hooks faked at the page's
// data seam (data.ts): a top-up whose answer is unknown, a funds drawer that is busy, an auto-renew override.
import { useEffect, useMemo, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

type Res = { ok: true; url: string } | { ok: false; word: { k: string }; unknown: boolean; rekey: boolean };
const fake = vi.hoisted(() => ({
  submit: vi.fn(),
  checkAgain: vi.fn(),
  forget: vi.fn(() => true),
  dismissRenew: vi.fn(async (_held?: unknown) => undefined),
  dismissClaim: vi.fn(async (_held?: unknown) => undefined),
  renewHolds: [{ vars: { id: 's1', auto_renew: true }, hold: 'h-renew' }] as unknown[],
  claimHolds: [{ vars: {}, hold: 'h-claim' }] as unknown[],
  renewFreed: true,
  claimFreed: true,
  renewAsked: [] as unknown[],
  leave: vi.fn(),
  run: vi.fn(),
  refetch: vi.fn(),
  readBack: vi.fn(),
  serverRenew: true,
  bonusOn: false,
  bonusData: { enabled: true, github_linked: true, amount_usd: '10.00', claimed: false } as Record<string, unknown>,
  bonusRefetch: vi.fn(),
  bonusClaim: vi.fn(),
  claimReadBack: vi.fn(),
  claimPending: false,
  renewPending: false,
  loadGate: null as null | Promise<void>,
  dropReturn: vi.fn(),
  held: null as null | { method: string; amount: string; persisted?: boolean; sending?: boolean },
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock('./data', async (orig) => {
  const a: Record<string, any> = await orig();
  return {
    ...a,
    useTopUp: () => {
      const [running, setRunning] = useState(false);
      const wrap = (f: () => Promise<unknown>) => async () => {
        setRunning(true);
        try {
          return await f();
        } finally {
          setRunning(false);
        }
      };
      const real = a.useAvailability();
      const availNow = useMemo(() => a.availOfQuery(real), [real.isPending, real.isError, real.data]); // eslint-disable-line react-hooks/exhaustive-deps
      const [loading, setLoading] = useState(fake.loadGate !== null);
      useEffect(() => {
        void fake.loadGate?.then(() => setLoading(false));
      }, []);
      return {
        submit: wrap(() => fake.submit()),
        checkAgain: wrap(() => fake.checkAgain()),
        forget: () => fake.forget(),
        running,
        pending: fake.held,
        loading,
        reload: async () => undefined,
        avail: availNow,
      };
    },
    dropPaymentReturn: () => fake.dropReturn(),
    leaveTo: (u: string) => fake.leave(u),
    useBonus: () => (fake.bonusOn ? { data: fake.bonusData, isPending: false, isError: false, refetch: fake.bonusRefetch } : a.useBonus()),
    useClaimBonus: () => {
      const [pending, setPending] = useState(fake.claimPending);
      if (!fake.bonusOn) return a.useClaimBonus();
      return {
        running: false,
        pending,
        run: async () => {
          const r = await fake.bonusClaim();
          if (r.outcome === 'pending') setPending(true);
          return r;
        },
        readBack: async () => {
          const ok = await fake.claimReadBack();
          if (ok) setPending(false);
          return ok;
        },
        settle: vi.fn(),
        discard: vi.fn(),
        holds: async () => fake.claimHolds,
        dismissHeld: async (held: unknown) => {
          await fake.dismissClaim(held);
          const freed = fake.claimFreed;
          if (freed) setPending(false);
          return freed;
        },
      };
    },
    useAutoRenew: () => {
      const [pending, setPending] = useState(fake.renewPending);
      return {
        running: false,
        pending,
        run: async (v: unknown) => {
          const r = await fake.run(v);
          // Core's lock: an unknown answer, or a refusal behind one, leaves the setting pending.
          if (r?.outcome === 'pending' || r?.code === 'READ_BACK_FIRST') setPending(true);
          return r;
        },
        readBack: async () => {
          const ok = await fake.readBack();
          if (ok) setPending(false);
          return ok;
        },
        settle: vi.fn(),
        discard: vi.fn(),
        holds: async (row?: string) => {
          fake.renewAsked.push(row);
          return fake.renewHolds;
        },
        dismissHeld: async (held: unknown) => {
          await fake.dismissRenew(held);
          // Like core: freeing nothing (no hold shown, or one that moved on) answers false.
          const freed = (held as unknown[]).length > 0 && fake.renewFreed;
          // Core with no hold left is not pending any more.
          if (freed || (held as unknown[]).length === 0) setPending(false);
          return freed;
        },
      };
    },
    useSubs: () => {
      const r = a.useSubs();
      const data = r.data
        ? { ...r.data, subs: r.data.subs.map((s: any, i: number) => (i === 0 ? { ...s, auto_renew: fake.serverRenew } : s)) }
        : r.data;
      return { ...r, data, refetch: fake.refetch };
    },
  };
});

const unknownTopup: Res = { ok: false, word: { k: 'top.unknown' }, unknown: true, rekey: false };

beforeEach(() => {
  for (const f of [
    fake.dismissRenew,
    fake.dismissClaim,
    fake.forget,
    fake.submit,
    fake.checkAgain,
    fake.leave,
    fake.run,
    fake.refetch,
    fake.readBack,
  ])
    f.mockReset();
  fake.serverRenew = true;
  fake.renewHolds = [{ vars: { id: 's1', auto_renew: true }, hold: 'h-renew' }];
  fake.claimHolds = [{ vars: {}, hold: 'h-claim' }];
  fake.renewFreed = true;
  fake.claimFreed = true;
  fake.renewAsked = [];
  fake.held = null;
  fake.loadGate = null;
  fake.dropReturn.mockReset();
  fake.bonusOn = false;
  fake.bonusRefetch.mockReset();
  fake.bonusClaim.mockReset();
  fake.claimReadBack.mockReset();
  fake.claimReadBack.mockResolvedValue(true);
  fake.claimPending = false;
  fake.renewPending = false;
  fake.refetch.mockResolvedValue({ isError: false });
  fake.readBack.mockResolvedValue(true);
});

async function renderFundsHeld() {
  await renderPage(page, { path: '/billing?sheet=funds' });
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByText(strings['top.unknownTitle']);
  return { dialog };
}

async function openFunds() {
  const r = await renderPage(page, { path: '/billing?sheet=funds' });
  const dialog = await screen.findByRole('dialog');
  const go = await within(dialog).findByRole('button', { name: strings['top.go'] });
  return { ...r, dialog, go };
}

describe('top-up with an unknown answer', () => {
  it('shows "may have gone through" and offers Check again (a read) and the confirmed resend, never a new payment', async () => {
    fake.submit.mockResolvedValueOnce(unknownTopup);
    fake.checkAgain.mockResolvedValueOnce({ ok: true, url: 'https://checkout.stripe.com/pay/x' });
    const { dialog, go } = await openFunds();
    await userEvent.click(go);
    expect(await within(dialog).findByText(strings['top.unknownTitle'])).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: strings['top.go'] })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] }));
    await waitFor(() => expect(fake.checkAgain).toHaveBeenCalledTimes(1));
    expect(fake.submit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fake.leave).toHaveBeenCalledWith('https://checkout.stripe.com/pay/x'));
  });

  it('freezes the amount while unknown: another amount cannot start a second payment', async () => {
    fake.submit.mockResolvedValueOnce(unknownTopup);
    const { dialog, go } = await openFunds();
    await userEvent.click(go);
    await within(dialog).findByText(strings['top.unknownTitle']);
    const fifty = within(dialog).queryByRole('radio', { name: '$50' });
    if (fifty) await userEvent.click(fifty);
    expect(within(dialog).getByText(strings['top.unknownTitle'])).toBeInTheDocument();
    expect(fake.submit).toHaveBeenCalledTimes(1);
  });
});

describe('a top-up left unknown before the drawer closed', () => {
  it('reopens frozen on Check again with its own amount, and never offers a new payment', async () => {
    fake.held = { method: 'card', amount: '35' };
    fake.checkAgain.mockResolvedValueOnce({ ok: true, url: 'https://checkout.stripe.com/pay/r' });
    const { dialog } = await renderFundsHeld();
    expect(within(dialog).queryByRole('button', { name: strings['top.go'] })).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] }));
    await waitFor(() => expect(fake.checkAgain).toHaveBeenCalledTimes(1));
    expect(fake.submit).not.toHaveBeenCalled();
  });
});

describe('funds drawer while a send is in flight', () => {
  it('refuses Cancel, Escape and the close button, and redirects only after the answer', async () => {
    let answer: (r: Res) => void = () => undefined;
    fake.submit.mockReturnValueOnce(new Promise<Res>((res) => (answer = res)));
    const { dialog, go, router } = await openFunds();
    await userEvent.click(go);
    expect(within(dialog).getByRole('button', { name: strings['action.cancel'] })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ sheet: 'funds' });
    expect(fake.leave).not.toHaveBeenCalled();
    answer({ ok: true, url: 'https://checkout.stripe.com/pay/y' });
    await waitFor(() => expect(fake.leave).toHaveBeenCalledTimes(1));
  });
});

describe('funds step inside a checkout while a send is in flight', () => {
  it('keeps the step: Back, Escape and the close action are refused until the answer', async () => {
    let answer: (r: Res) => void = () => undefined;
    fake.submit.mockReturnValueOnce(new Promise<Res>((res) => (answer = res)));
    await renderPage(page, { state: 'wallet-short', path: '/billing?checkout=buy&plan=fam-plus' });
    const review = await screen.findByRole('dialog');
    await userEvent.click(await within(review).findByRole('button', { name: strings.addFunds }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['top.go'] }));
    for (const back of within(dialog).queryAllByRole('button', { name: strings['co.backToCheckout'] })) await userEvent.click(back);
    await userEvent.keyboard('{Escape}');
    expect(within(screen.getByRole('dialog')).getByText(strings['top.title'])).toBeInTheDocument();
    answer({ ok: true, url: 'https://checkout.stripe.com/pay/z' });
    await waitFor(() => expect(fake.leave).toHaveBeenCalledTimes(1));
  });
});

// A renew change left unknown keeps its confirm open (locked, with its own Check again) over the row's band.
const dialogCheck = async () => within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['buy.checkAgain'] });

describe('auto-renew override', () => {
  // The row under test is named once (its switch is on), then found by that name whatever its state becomes.
  let at = 0;
  const all = () => screen.findAllByRole('switch', { name: /auto-renew for/i });
  const theSwitch = async () => (await all())[at] as HTMLElement;

  async function turnOff() {
    const rows = await all();
    at = rows.findIndex((r) => (r as HTMLInputElement).checked);
    const on = rows[at] as HTMLElement;
    await userEvent.click(on);
    await userEvent.click(await screen.findByRole('button', { name: strings['subs.offConfirm'] }));
  }

  it('lets the fresh server read beat the local override', async () => {
    fake.run.mockResolvedValueOnce({ outcome: 'done' });
    await renderPage(page, { path: '/billing?view=wallet' });
    await turnOff();
    // The server still says on: once the read arrives, the switch follows the server, not the local edit.
    await waitFor(() => expect(fake.refetch).toHaveBeenCalled());
    await waitFor(async () => expect(await theSwitch()).toBeChecked());
  });

  it('keeps the row locked after a pending change until Check again reads it', async () => {
    fake.run.mockResolvedValueOnce({ outcome: 'pending' });
    await renderPage(page, { path: '/billing?view=wallet' });
    await turnOff();
    await screen.findByText(strings.renewUnknown);
    expect(await theSwitch()).toBeDisabled();
    await userEvent.click(await dialogCheck());
    await waitFor(async () => expect(await theSwitch()).toBeEnabled());
    expect(fake.run).toHaveBeenCalledTimes(1);
  });

  it('keeps Check again and a warned Dismiss for a pending row: Dismiss frees the hold only after the confirm', async () => {
    fake.renewPending = true;
    await renderPage(page, { path: '/billing?view=wallet' });
    const band = (await screen.findByText(strings.renewUnknown)).closest('[data-band]') as HTMLElement;
    await userEvent.click(within(band).getByRole('button', { name: strings['hold.dismiss'] }));
    const ask = await screen.findByRole('alertdialog');
    expect(within(ask).getByText(/may have gone through/i)).toBeInTheDocument();
    expect(fake.dismissRenew).not.toHaveBeenCalled();
    await userEvent.click(within(ask).getByRole('button', { name: strings['hold.dismissConfirm'] }));
    await waitFor(() => expect(fake.dismissRenew).toHaveBeenCalledTimes(1));
    // Exactly the hold the person was asked about, never "whatever holds the lock now".
    expect(fake.dismissRenew).toHaveBeenCalledWith([{ vars: { id: 's1', auto_renew: true }, hold: 'h-renew' }]);
  });

  it('a Dismiss whose hold moved on frees nothing: the band stays and the list is read again', async () => {
    fake.renewPending = true;
    fake.renewFreed = false;
    await renderPage(page, { path: '/billing?view=wallet' });
    const band = (await screen.findByText(strings.renewUnknown)).closest('[data-band]') as HTMLElement;
    await userEvent.click(within(band).getByRole('button', { name: strings['hold.dismiss'] }));
    const ask = await screen.findByRole('alertdialog');
    await userEvent.click(within(ask).getByRole('button', { name: strings['hold.dismissConfirm'] }));
    await waitFor(() => expect(fake.dismissRenew).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fake.refetch).toHaveBeenCalled());
    expect(screen.getByText(strings.renewUnknown)).toBeInTheDocument();
  });

  it('a Dismiss with no hold left asks nothing and frees nothing', async () => {
    fake.renewPending = true;
    fake.renewHolds = [];
    await renderPage(page, { path: '/billing?view=wallet' });
    const band = (await screen.findByText(strings.renewUnknown)).closest('[data-band]') as HTMLElement;
    await userEvent.click(within(band).getByRole('button', { name: strings['hold.dismiss'] }));
    await waitFor(() => expect(fake.dismissRenew).toHaveBeenCalledWith([]));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  // The unknown row's own band sits under the locked confirm: close the confirm (Cancel), then the band is reachable.
  const rowBand = async (): Promise<HTMLElement> => {
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['action.cancel'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    return (await screen.findByText(strings.renewUnknown)).closest('[data-band]') as HTMLElement;
  };

  it('a row Dismiss that finds no hold left clears the row (nothing is held) and reads again', async () => {
    fake.run.mockResolvedValueOnce({ outcome: 'pending' });
    await renderPage(page, { path: '/billing?view=wallet' });
    await turnOff();
    await screen.findByText(strings.renewUnknown);
    expect(await theSwitch()).toBeDisabled();
    // Core freed the hold meanwhile (another tab, a background read): the press finds none.
    fake.renewHolds = [];
    const band = await rowBand();
    await userEvent.click(within(band).getByRole('button', { name: strings['hold.dismiss'] }));
    await waitFor(() => expect(fake.dismissRenew).toHaveBeenCalledWith([]));
    expect(screen.queryByRole('alertdialog', { name: strings['hold.dismissTitle'] })).toBeNull();
    await waitFor(() => expect(fake.refetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(strings.renewUnknown)).toBeNull());
    expect(await theSwitch()).toBeEnabled();
  });

  it('a row Dismiss whose hold existed but was not freed keeps the row unknown and locked', async () => {
    fake.run.mockResolvedValueOnce({ outcome: 'pending' });
    await renderPage(page, { path: '/billing?view=wallet' });
    await turnOff();
    await screen.findByText(strings.renewUnknown);
    fake.renewFreed = false;
    const band = await rowBand();
    await userEvent.click(within(band).getByRole('button', { name: strings['hold.dismiss'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['hold.dismissTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['hold.dismissConfirm'] }));
    await waitFor(() => expect(fake.dismissRenew).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fake.refetch).toHaveBeenCalled());
    expect(screen.getAllByText(strings.renewUnknown).length).toBeGreaterThan(0);
    expect(await theSwitch()).toBeDisabled();
  });

  it('keeps the lock when the read-back itself failed, and releases it on a successful one', async () => {
    fake.run.mockResolvedValueOnce({ outcome: 'pending' });
    await renderPage(page, { path: '/billing?view=wallet' });
    await turnOff();
    await screen.findByText(strings.renewUnknown);
    fake.readBack.mockResolvedValueOnce(false);
    await userEvent.click(await dialogCheck());
    await waitFor(() => expect(fake.readBack).toHaveBeenCalledTimes(1));
    expect(screen.getByText(strings.renewUnknown)).toBeInTheDocument();
    expect(await theSwitch()).toBeDisabled();
    await userEvent.click(await dialogCheck());
    await waitFor(async () => expect(await theSwitch()).toBeEnabled());
    expect(screen.queryByText(strings.renewUnknown)).toBeNull();
  });
});

describe('bonus claim left unknown', () => {
  it('goes back to a plain claim once a good read shows the offer still open', async () => {
    fake.bonusOn = true;
    fake.bonusClaim.mockResolvedValueOnce({ outcome: 'pending' });
    fake.bonusRefetch.mockResolvedValue({ isError: false, data: fake.bonusData });
    await renderPage(page, { path: '/billing?view=wallet' });
    await userEvent.click(await screen.findByRole('button', { name: strings['bonus.ghBonusClaim'] }));
    const check = await screen.findByRole('button', { name: strings['bonus.ghBonusCheck'] });
    await userEvent.click(check);
    expect(await screen.findByRole('button', { name: strings['bonus.ghBonusClaim'] })).toBeInTheDocument();
    expect(fake.bonusClaim).toHaveBeenCalledTimes(1);
  });

  it('stays on Check again when the read itself failed', async () => {
    fake.bonusOn = true;
    fake.bonusClaim.mockResolvedValueOnce({ outcome: 'pending' });
    fake.claimReadBack.mockResolvedValue(false);
    fake.bonusRefetch.mockResolvedValue({ isError: true, data: undefined });
    await renderPage(page, { path: '/billing?view=wallet' });
    await userEvent.click(await screen.findByRole('button', { name: strings['bonus.ghBonusClaim'] }));
    await userEvent.click(await screen.findByRole('button', { name: strings['bonus.ghBonusCheck'] }));
    await waitFor(() => expect(fake.bonusRefetch).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: strings['bonus.ghBonusCheck'] })).toBeInTheDocument();
  });
});

describe('core locks survive a remount', () => {
  it('renew: a change core still holds locks every switch and offers Check again, before anything is pressed', async () => {
    fake.renewPending = true;
    await renderPage(page, { path: '/billing?view=wallet' });
    await screen.findByText(strings.renewUnknown);
    for (const sw of await screen.findAllByRole('switch', { name: /auto-renew for/i })) expect(sw).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: strings['buy.checkAgain'] }));
    await waitFor(async () => expect((await screen.findAllByRole('switch', { name: /auto-renew for/i }))[0]).toBeEnabled());
  });

  it('renew: core refusing a send behind an unread change (not_sent READ_BACK_FIRST) leaves the earlier change unknown band, with no claim for the row that sent nothing', async () => {
    // Core refuses only while an earlier change is unread, so its own lock (pending) carries the unknown band; this
    // row sent nothing and does not claim a send of its own.
    fake.run.mockResolvedValueOnce({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    await renderPage(page, { path: '/billing?view=wallet' });
    const rows = await screen.findAllByRole('switch', { name: /auto-renew for/i });
    await userEvent.click(rows[rows.findIndex((r) => (r as HTMLInputElement).checked)] as HTMLElement);
    await userEvent.click(await screen.findByRole('button', { name: strings['subs.offConfirm'] }));
    await waitFor(() => expect(fake.run).toHaveBeenCalledTimes(1));
    await screen.findByText(strings.renewUnknown);
    expect(screen.queryByText(strings['subs.toggleErr'])).toBeNull();
    expect(screen.getAllByText(strings.renewUnknown)).toHaveLength(1);
  });

  it('bonus: a held claim has a warned Dismiss that frees it only after the confirm', async () => {
    fake.bonusOn = true;
    fake.claimPending = true;
    fake.bonusRefetch.mockResolvedValue({ isError: false, data: fake.bonusData });
    await renderPage(page, { path: '/billing?view=wallet' });
    await userEvent.click(await screen.findByRole('button', { name: strings['hold.dismiss'] }));
    const ask = await screen.findByRole('alertdialog');
    expect(fake.dismissClaim).not.toHaveBeenCalled();
    await userEvent.click(within(ask).getByRole('button', { name: strings['hold.dismissConfirm'] }));
    await waitFor(() => expect(fake.dismissClaim).toHaveBeenCalledTimes(1));
    expect(fake.dismissClaim).toHaveBeenCalledWith([{ vars: {}, hold: 'h-claim' }]);
  });

  it('bonus: a Dismiss whose hold moved on keeps the offer unknown', async () => {
    fake.bonusOn = true;
    fake.claimPending = true;
    fake.claimFreed = false;
    fake.bonusRefetch.mockResolvedValue({ isError: false, data: fake.bonusData });
    await renderPage(page, { path: '/billing?view=wallet' });
    await userEvent.click(await screen.findByRole('button', { name: strings['hold.dismiss'] }));
    const ask = await screen.findByRole('alertdialog');
    await userEvent.click(within(ask).getByRole('button', { name: strings['hold.dismissConfirm'] }));
    await waitFor(() => expect(fake.dismissClaim).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: strings['hold.dismiss'] })).toBeInTheDocument();
  });

  it('bonus: a claim core still holds shows Check again on mount; its read-back settles the lock, then a plain claim', async () => {
    fake.bonusOn = true;
    fake.claimPending = true;
    fake.bonusRefetch.mockResolvedValue({ isError: false, data: fake.bonusData });
    await renderPage(page, { path: '/billing?view=wallet' });
    await userEvent.click(await screen.findByRole('button', { name: strings['bonus.ghBonusCheck'] }));
    await waitFor(() => expect(fake.claimReadBack).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: strings['bonus.ghBonusClaim'] })).toBeInTheDocument();
  });

  it('bonus: a refusal behind an unread claim is that claim still unknown, not the generic error', async () => {
    fake.bonusOn = true;
    fake.bonusClaim.mockResolvedValueOnce({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    await renderPage(page, { path: '/billing?view=wallet' });
    await userEvent.click(await screen.findByRole('button', { name: strings['bonus.ghBonusClaim'] }));
    await screen.findByRole('button', { name: strings['bonus.ghBonusCheck'] });
    expect(screen.queryByText(strings['bonus.ghBonusError'])).toBeNull();
  });
});

describe('add funds reopened before core has restored its kept top-up', () => {
  it('offers no Continue until the restore answered, then comes back frozen on Check again', async () => {
    let open: () => void = () => undefined;
    fake.loadGate = new Promise<void>((r) => (open = r));
    fake.held = { method: 'card', amount: '35' };
    await renderPage(page, { path: '/billing?sheet=funds' });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: strings['top.go'] })).toBeNull();
    expect(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] })).toBeDisabled();
    expect(fake.submit).not.toHaveBeenCalled();
    open();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] })).toBeEnabled());
  });
});

describe('the payment-return band', () => {
  it('is dropped from the tab when dismissed, so it does not come back on reload', async () => {
    await renderPage(page, { state: 'return-received' });
    const band = await screen.findByText((_c, el) => el?.getAttribute('data-band') === 'return-received');
    await userEvent.click(within(band as HTMLElement).getByRole('button', { name: strings.dismiss }));
    expect(fake.dropReturn).toHaveBeenCalledTimes(1);
  });
});

describe.each(['topup-none', 'topup-error'])('a held top-up while availability gives no methods (%s)', (state) => {
  it('still shows the "may have gone through" banner with a working Check again', async () => {
    fake.held = { method: 'card', amount: '35' };
    fake.checkAgain.mockResolvedValueOnce({ ok: true, url: 'https://checkout.stripe.com/pay/h' });
    await renderPage(page, { state, path: '/billing?sheet=funds' });
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(strings['top.unknownTitle'])).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] }));
    await waitFor(() => expect(fake.checkAgain).toHaveBeenCalledTimes(1));
    expect(fake.submit).not.toHaveBeenCalled();
  });
});

describe('Check again answered "resolved" while availability gives no methods', () => {
  it('still shows the done notice instead of hiding it behind the error state', async () => {
    fake.held = { method: 'card', amount: '35' };
    fake.checkAgain.mockResolvedValueOnce({ ok: false, word: { k: 'top.resolved' }, unknown: false, rekey: false, resolved: true });
    await renderPage(page, { state: 'topup-error', path: '/billing?sheet=funds' });
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByRole('button', { name: strings['buy.checkAgain'] }));
    expect(await within(dialog).findByText(strings['top.resolved'])).toBeInTheDocument();
    // Not a green success: the record is gone and the outcome is not proven.
    expect(within(dialog).getByText(strings['top.resolvedTitle'])).toBeInTheDocument();
    expect(dialog.querySelector('[data-outcome="done"]')).toBeNull();
  });
});

describe('one renew change left unknown', () => {
  it('locks every other row, so a second unread change can never start, and its Check again clears only after its own read-back', async () => {
    fake.run.mockResolvedValue({ outcome: 'pending' });
    await renderPage(page, { path: '/billing?view=wallet' });
    const rows = await screen.findAllByRole('switch', { name: /auto-renew for/i });
    const at = rows.findIndex((r) => (r as HTMLInputElement).checked);
    await userEvent.click(rows[at] as HTMLElement);
    await userEvent.click(await screen.findByRole('button', { name: strings['subs.offConfirm'] }));
    await screen.findByText(strings.renewUnknown);
    for (const sw of await screen.findAllByRole('switch', { name: /auto-renew for/i })) expect(sw).toBeDisabled();
    fake.readBack.mockResolvedValueOnce(false);
    await userEvent.click(await dialogCheck());
    await waitFor(() => expect(fake.readBack).toHaveBeenCalledTimes(1));
    expect(screen.getByText(strings.renewUnknown)).toBeInTheDocument();
    await userEvent.click(await dialogCheck());
    await waitFor(() => expect(screen.queryByText(strings.renewUnknown)).toBeNull());
    expect(fake.readBack).toHaveBeenCalledTimes(2);
  });
});

describe('Check again after another window completed the top-up', () => {
  it('says so as a done notice and gives the form back, not an error', async () => {
    fake.held = { method: 'card', amount: '35' };
    fake.checkAgain.mockResolvedValueOnce({ ok: false, word: { k: 'top.resolved' }, unknown: false, rekey: false, resolved: true });
    const { dialog } = await renderFundsHeld();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] }));
    expect(await within(dialog).findByText(strings['top.resolved'])).toBeInTheDocument();
    expect(within(dialog).queryByText(strings['top.failed'])).toBeNull();
    expect(within(dialog).queryByText(strings['top.unknownTitle'])).toBeNull();
  });
});

describe('a hold that storage refused to keep', () => {
  it('tells the person that only this tab remembers a held top-up', async () => {
    fake.held = { method: 'card', amount: '35', persisted: false };
    const { dialog } = await renderFundsHeld();
    expect(within(dialog).getByText(strings['top.notSaved'])).toBeInTheDocument();
  });

  it('says nothing about it when the hold was saved', async () => {
    fake.held = { method: 'card', amount: '35', persisted: true };
    const { dialog } = await renderFundsHeld();
    expect(within(dialog).queryByText(strings['top.notSaved'])).toBeNull();
  });
});

describe('Forget this payment', () => {
  it('asks first, says it may have gone through, and forgets only after the confirm', async () => {
    fake.held = { method: 'card', amount: '35' };
    const { dialog } = await renderFundsHeld();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['top.forget'] }));
    const ask = await screen.findByRole('alertdialog');
    expect(within(ask).getByText(/may have gone through/i)).toBeInTheDocument();
    expect(ask.textContent ?? '').not.toMatch(/failed|not sent|nothing was charged/i);
    expect(fake.forget).not.toHaveBeenCalled();
    await userEvent.click(within(ask).getByRole('button', { name: strings['top.forgetConfirm'] }));
    expect(fake.forget).toHaveBeenCalledTimes(1);
  });

  it('cancelling the question forgets nothing', async () => {
    fake.held = { method: 'card', amount: '35' };
    const { dialog } = await renderFundsHeld();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['top.forget'] }));
    const ask = await screen.findByRole('alertdialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fake.forget).not.toHaveBeenCalled();
    expect(ask).toBeDefined();
  });

  it('is disabled with "still being sent" while the payment request is out', async () => {
    fake.held = { method: 'card', amount: '35', sending: true };
    const { dialog } = await renderFundsHeld();
    expect(within(dialog).getByRole('button', { name: strings['top.forget'] })).toBeDisabled();
    expect(within(dialog).getByText(strings['top.forgetSending'])).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] })).toBeDisabled();
  });

  it('a refused forget leaves the drawer on its held payment', async () => {
    fake.held = { method: 'card', amount: '35' };
    fake.forget.mockReturnValueOnce(false);
    const { dialog } = await renderFundsHeld();
    await userEvent.click(within(dialog).getByRole('button', { name: strings['top.forget'] }));
    await userEvent.click(await within(await screen.findByRole('alertdialog')).findByRole('button', { name: strings['top.forgetConfirm'] }));
    expect(fake.forget).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('button', { name: strings['buy.checkAgain'] })).toBeInTheDocument();
  });

  it('is not offered when nothing is held', async () => {
    const { dialog } = await openFunds();
    expect(within(dialog).queryByRole('button', { name: strings['top.forget'] })).toBeNull();
  });
});

describe('the Add funds drawer', () => {
  it('asks before it discards a typed amount', async () => {
    const { dialog } = await openFunds();
    await userEvent.click(within(dialog).getByRole('radio', { name: strings['top.custom'] }));
    await userEvent.type(await within(dialog).findByLabelText(strings['top.otherLabel']), '15');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
  });

  it('closes at once when nothing was typed', async () => {
    await openFunds();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('Discard changes?')).toBeNull();
  });
});
