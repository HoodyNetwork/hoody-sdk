// Vitest: one suspension for the whole Plans & billing page. The Bare metal view reads
// its own account state, listings, balance and reservations beside Billing's identity: any of them saying the
// account is suspended (identity or account banned, or any read refused 403 ACCOUNT_BANNED) suspends the view as a
// whole (no Add funds, no Rent or Reserve, the banned list pane on both tabs, one band carrying the refusal), and the
// page's checkout drawer, opened from it, knows it too.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { commerce } from '@core';
import kitRoot from '@kit/strings.en.json';
import kit from '@kit/states/strings.en.json';
import { resetUnknownCheckouts } from '../data';
import page from '../page';
import billingStrings from '../strings.en.json';
import { BALANCE, NOT_HELD, holdSuspension, knownBalance } from './data';
import { resHeads } from './fixtures';
import { money } from './logic';
import strings from './strings.en.json';

type Client = Awaited<ReturnType<typeof renderPage>>['queryClient'];
const BANNED = () => Object.assign(new Error('refused'), { status: 403, code: 'ACCOUNT_BANNED' });
const queries = (qc: Client, part: string) => qc.getQueryCache().getAll().filter((q) => JSON.stringify(q.queryKey).includes(part));
const details = () => screen.queryAllByRole('button', { name: kit['err.details'] });
const bands = () => screen.queryAllByText(billingStrings['band.suspendedTitle']);
/** Every TanStack read has settled (only the reservations walk, outside TanStack, may still be on its way). */
const idle = (qc: Client) => qc.getQueryCache().getAll().every((q) => q.state.fetchStatus === 'idle');
/** The banned band's Check status (the banned list pane has its own, which opens Account). */
const checkStatus = () => within(document.querySelector<HTMLElement>('[data-band="banned"]')!).getByRole('button', { name: billingStrings['band.checkStatus'] });
const RENT_CHECK = '/billing?checkout=rent&item=l02&days=90&check=true';

/** The page's checkout drawer stops at its banned phase with nothing that could send. */
async function expectDrawerSuspended() {
  const drawer = await screen.findByRole('dialog');
  expect(await within(drawer).findByText(billingStrings['mkt.suspended'])).toBeInTheDocument();
  for (const name of [billingStrings['mkt.confirmCta'], billingStrings['action.tryAgain'], billingStrings['mkt.recoverNew'], billingStrings['mkt.rentAgain'], billingStrings['co.resend']])
    expect(within(drawer).queryByRole('button', { name })).toBeNull();
}

/** The view is suspended: the banned list pane, one band, no Rent/Reserve, no Add funds and no resend (a held top-up's included). */
async function expectSuspended() {
  expect(await screen.findByText(strings['banned.title'])).toBeInTheDocument();
  await waitFor(() => expect(bands()).toHaveLength(1));
  expect(screen.queryByRole('button', { name: strings['buy.rent'] })).toBeNull();
  expect(screen.queryByRole('button', { name: strings['buy.reserve'] })).toBeNull();
  expect(screen.queryByRole('button', { name: billingStrings.addFunds })).toBeNull();
  expect(screen.queryByRole('button', { name: billingStrings['co.resend'] })).toBeNull();
  expect(screen.queryByRole('table', { name: strings['tab.listings'] })).toBeNull();
  expect(screen.queryByRole('table', { name: strings['res.title'] })).toBeNull();
}

describe('every source of a suspension suspends the Bare metal view', () => {
  const { maxAuto } = commerce.RES;
  afterEach(() => {
    commerce.RES.maxAuto = maxAuto;
  });

  it("Billing's identity says banned while the view's own account read still says not", async () => {
    const { queryClient } = await renderPage(page, { path: '/billing?view=servers&sel=l01' });
    expect(await screen.findByRole('button', { name: strings['buy.rent'] })).toBeInTheDocument();
    await act(async () => {
      const qs = queryClient
        .getQueryCache()
        .getAll()
        .filter((q) => JSON.stringify(q.queryKey).includes('identity'));
      expect(qs.length).toBeGreaterThan(0);
      for (const q of qs) q.setState({ data: { banned: true }, status: 'success', fetchStatus: 'idle' });
    });
    await expectSuspended();
    expect(details()).toHaveLength(0);
  });

  it('the balance read is refused as suspended', async () => {
    const { queryClient } = await renderPage(page, { path: '/billing?view=servers&sel=l01' });
    expect(await screen.findByRole('button', { name: strings['buy.rent'] })).toBeInTheDocument();
    await act(async () => {
      const qs = queryClient
        .getQueryCache()
        .getAll()
        .filter((q) => JSON.stringify(q.queryKey).includes('servers.balance'));
      expect(qs.length).toBeGreaterThan(0);
      for (const q of qs) q.setState({ status: 'error', error: BANNED(), fetchStatus: 'idle' });
    });
    await expectSuspended();
  });

  it('the first reservations read is refused as suspended (the listings tab too)', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l01', state: 'servers-res-banned' });
    await expectSuspended();
  });

  it('a later reservations page (Load more) is refused as suspended', async () => {
    commerce.RES.maxAuto = 1;
    await renderPage(page, { path: '/billing?view=servers&tab=reservations', state: 'servers-res-more-banned' });
    await within(await screen.findByRole('table', { name: strings['res.title'] })).findAllByRole('row');
    act(() => screen.getByRole('button', { name: 'Load more' }).click());
    await expectSuspended();
  });
});

describe('a suspension stands until a full recheck clears it', () => {
  // The reservations walk (outside TanStack) forgets its refusal when it reads again: Check status and a return visit
  // to the view start a new walk. The suspension it found stays, for the account, realm and generation, until every
  // read has answered again with no banned state and no 403 ACCOUNT_BANNED.
  it('Check status after a reservations refusal: while the walk reads again, no Rent, no Add funds, no list, and the drawer stops', async () => {
    resHeads.n = 0;
    const { queryClient, router } = await renderPage(page, { path: '/billing?view=servers&sel=l01', state: 'servers-res-banned-then-hang' });
    await expectSuspended();
    act(() => checkStatus().click());
    await waitFor(() => expect(resHeads.n).toBe(2));
    await waitFor(() => expect(idle(queryClient)).toBe(true));
    await expectSuspended();
    await act(async () => {
      await router.navigate({ href: RENT_CHECK });
    });
    await expectDrawerSuspended();
  });

  it('a return visit after a reservations refusal: still suspended while the walk reads again, and the drawer stops', async () => {
    resHeads.n = 0;
    const { queryClient, router } = await renderPage(page, { path: '/billing?view=servers&sel=l01', state: 'servers-res-banned-then-hang' });
    await expectSuspended();
    await act(async () => {
      await router.navigate({ href: '/billing?view=plans' });
    });
    await act(async () => {
      await router.navigate({ href: '/billing?view=servers&sel=l01' });
    });
    await waitFor(() => expect(resHeads.n).toBe(2));
    await waitFor(() => expect(idle(queryClient)).toBe(true));
    await expectSuspended();
    await act(async () => {
      await router.navigate({ href: RENT_CHECK });
    });
    await expectDrawerSuspended();
  });

  it('a full recheck that answers clean lifts it: Rent is back and no band', async () => {
    resHeads.n = 0;
    await renderPage(page, { path: '/billing?view=servers&sel=l01', state: 'servers-res-banned-once' });
    await expectSuspended();
    act(() => checkStatus().click());
    expect(await screen.findByRole('button', { name: strings['buy.rent'] }, { timeout: 10000 })).toBeInTheDocument();
    expect(bands()).toHaveLength(0);
    expect(screen.queryByText(strings['banned.title'])).toBeNull();
  });
});

describe('a poll of a pending reservation refused as suspended suspends the view', () => {
  const { intervalMs } = commerce.RES;
  afterEach(() => {
    commerce.RES.intervalMs = intervalMs;
  });

  it('the walk read clean, then the poll is refused: one band with its details, no Rent, no Add funds, and the drawer stops', async () => {
    commerce.RES.intervalMs = 50;
    const { queryClient, router } = await renderPage(page, { path: '/billing?view=servers&sel=l01', state: 'servers-res-poll-banned' });
    await expectSuspended();
    expect(details().length).toBeGreaterThan(0);
    await waitFor(() => expect(idle(queryClient)).toBe(true));
    await act(async () => {
      await router.navigate({ href: RENT_CHECK });
    });
    await expectDrawerSuspended();
  });
});

describe('the held suspension (holdSuspension)', () => {
  const f = (o: Partial<{ banned: boolean; rejection: unknown; answeredAt: number }>) => ({ banned: false, rejection: null, answeredAt: 0, ...o });
  it('stays until every read answered clean after it was found; another context starts over', () => {
    const r = BANNED();
    const h = holdSuspension(NOT_HELD, 'a', f({ banned: true, rejection: r }), 100);
    expect(h).toEqual({ ctx: 'a', banned: true, rejection: r, at: 100 });
    expect(holdSuspension(h, 'a', f({}), 200)).toBe(h);
    expect(holdSuspension(h, 'a', f({ answeredAt: 100 }), 200)).toBe(h);
    expect(holdSuspension(h, 'a', f({ answeredAt: 150 }), 200)).toEqual({ ...NOT_HELD, ctx: 'a' });
    expect(holdSuspension(h, 'b', f({}), 200)).toEqual({ ...NOT_HELD, ctx: 'b' });
    expect(holdSuspension(h, 'a', f({ banned: true, rejection: r }), 300)).toBe(h);
  });
});

describe('the banned list pane covers both tabs', () => {
  it('a suspended account on the reservations tab sees the banned pane, no table and no inspector', async () => {
    await renderPage(page, { path: '/billing?view=servers&tab=reservations&rsel=r01', state: 'servers-banned' });
    await expectSuspended();
    expect(screen.queryByText(strings['res.notFound'])).toBeNull();
  });
});

describe('one banned band, with the refusal behind it', () => {
  it('identity banned and a rail refused as suspended: one band, and it offers that refusal in its details', async () => {
    const { queryClient } = await renderPage(page, { path: '/billing?view=servers' });
    expect(await screen.findByRole('table', { name: strings['tab.listings'] })).toBeInTheDocument();
    await act(async () => {
      for (const q of queries(queryClient, 'identity')) q.setState({ data: { banned: true }, status: 'success', fetchStatus: 'idle' });
      for (const q of queries(queryClient, 'stock')) q.setState({ status: 'error', error: BANNED(), fetchStatus: 'idle' });
    });
    await expectSuspended();
    await waitFor(() => expect(details()).toHaveLength(1));
    act(() => details()[0]!.click());
    expect(within(await screen.findByRole('dialog')).getByText('ACCOUNT_BANNED')).toBeInTheDocument();
  });
});

describe('a balance that is not current is not known', () => {
  const q = (o: Partial<{ data: unknown; error: unknown; isFetching: boolean }>) => ({ data: { cents: 1 }, error: null, isFetching: false, ...o });
  it('only a current answer is known: not a failed refetch, not a read on its way', () => {
    expect(knownBalance(q({}), false)).toEqual({ cents: 1 });
    expect(knownBalance(q({ error: new Error('x') }), false)).toBeUndefined();
    expect(knownBalance(q({ isFetching: true }), false)).toBeUndefined();
    expect(knownBalance(q({}), true)).toBeUndefined();
  });

  it('an idle answer past its freshness bound: no amount and no verdict while it is read again, then the new answer', async () => {
    const { freshMs } = BALANCE;
    BALANCE.freshMs = 400;
    try {
      const { queryClient } = await renderPage(page, { path: '/billing?view=servers&sel=l01' });
      expect(await screen.findByText(money(25000))).toBeInTheDocument();
      expect(await screen.findByText(strings['buy.enough'])).toBeInTheDocument();
      const qs = queries(queryClient, 'servers.balance');
      expect(qs.length).toBeGreaterThan(0);
      // The read again never answers here (and never says it is on its way): only the bound hides the old answer.
      const reads = qs.map((x) => vi.spyOn(x, 'fetch').mockImplementation(() => new Promise(() => {})));
      await waitFor(() => expect(reads.some((r) => r.mock.calls.length > 0)).toBe(true), { timeout: 5000 });
      expect(qs.every((x) => x.state.fetchStatus === 'idle')).toBe(true);
      await waitFor(() => expect(screen.queryByText(money(25000))).toBeNull());
      expect(screen.queryByText(strings['buy.enough'])).toBeNull();
      for (const r of reads) r.mockRestore();
      await act(async () => {
        await Promise.all(qs.map((x) => x.fetch()));
      });
      expect(await screen.findByText(money(25000))).toBeInTheDocument();
      expect(screen.getByText(strings['buy.enough'])).toBeInTheDocument();
    } finally {
      BALANCE.freshMs = freshMs;
    }
  });

  it('a refetch on its way: no old amount and no enough verdict, then the new answer', async () => {
    const { queryClient } = await renderPage(page, { path: '/billing?view=servers&sel=l01' });
    expect(await screen.findByText(money(25000))).toBeInTheDocument();
    expect(await screen.findByText(strings['buy.enough'])).toBeInTheDocument();
    const qs = queries(queryClient, 'servers.balance');
    expect(qs.length).toBeGreaterThan(0);
    await act(async () => {
      for (const x of qs) x.setState({ fetchStatus: 'fetching' });
    });
    await waitFor(() => expect(screen.queryByText(money(25000))).toBeNull());
    expect(screen.queryByText(strings['buy.enough'])).toBeNull();
    expect(screen.queryByText(strings['balance.failed'])).toBeNull();
    await act(async () => {
      for (const x of qs) x.setState({ fetchStatus: 'idle', dataUpdatedAt: Date.now() });
    });
    expect(await screen.findByText(money(25000))).toBeInTheDocument();
  });

  it('an answer cached from an earlier visit is read again on return, and shown as known only once answered', async () => {
    const { queryClient, router } = await renderPage(page, { path: '/billing?view=servers&sel=l01' });
    expect(await screen.findByText(money(25000))).toBeInTheDocument();
    const qs = queries(queryClient, 'servers.balance');
    await act(async () => {
      for (const x of qs) x.setState({ dataUpdatedAt: 1 });
      await router.navigate({ href: '/billing?view=plans' });
    });
    await act(async () => {
      await router.navigate({ href: '/billing?view=servers&sel=l01' });
    });
    await waitFor(() => expect(qs.every((x) => x.state.dataUpdatedAt > 1)).toBe(true));
    expect(await screen.findByText(money(25000))).toBeInTheDocument();
    expect(screen.getByText(strings['buy.enough'])).toBeInTheDocument();
  });
});

describe('the checkout drawer opened from a suspended Bare metal view', () => {
  // Check again on an unknown rent or reserve navigates to the checkout without view=servers (the Plans view is drawn
  // under it): the suspension the Bare metal view found stays the page's, and the drawer stops at its banned phase with
  // nothing that could send (no Confirm, Try again, Start over or Rent again).
  it.each([
    ['rent', '/billing?checkout=rent&item=l02&days=90&check=true'],
    ['reserve', '/billing?checkout=reserve&item=o01&days=30&check=true'],
  ])('%s', async (_kind, to) => {
    const { router } = await renderPage(page, { path: '/billing?view=servers', state: 'servers-banned' });
    expect(await screen.findByText(strings['banned.title'])).toBeInTheDocument();
    await act(async () => {
      await router.navigate({ href: to });
    });
    await expectDrawerSuspended();
  });
});

describe('a suspension found behind an open checkout keeps its unknown outcome', () => {
  // A rent or reserve opened from Bare metal keeps view=servers, so the view stays mounted behind the drawer and its
  // own reads go on. The purchase was sent and its answer never came; then one of those reads is refused 403
  // ACCOUNT_BANNED and suspends the page. The drawer still says the purchase may have gone through and offers the
  // read-only Check again, with the suspended line, and nothing that could send. Before, the banned body replaced it.
  const sendUnknown = async (path: string, state: string) => {
    resetUnknownCheckouts();
    const { queryClient } = await renderPage(page, { path, state });
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(await within(drawer).findByRole('checkbox'));
    await userEvent.click(within(drawer).getByRole('button', { name: billingStrings['mkt.confirmCta'] }));
    await waitFor(() => expect(drawer.querySelector('[data-outcome="pending"]')).not.toBeNull());
    return { queryClient, drawer };
  };
  /** A Bare metal read behind the drawer is refused as suspended. */
  const refuseBehind = async (queryClient: Client) => {
    await act(async () => {
      for (const q of queries(queryClient, 'stock')) q.setState({ status: 'error', error: BANNED(), fetchStatus: 'idle' });
    });
    await waitFor(() => expect(bands()).toHaveLength(1));
  };
  const nothingSends = (drawer: HTMLElement) => {
    for (const name of [billingStrings['mkt.confirmCta'], billingStrings['action.tryAgain'], billingStrings['mkt.recoverNew'], billingStrings['mkt.rentAgain'], billingStrings['co.resend']])
      expect(within(drawer).queryByRole('button', { name })).toBeNull();
  };
  const keeps = async (drawer: HTMLElement, body: string) => {
    expect(await within(drawer).findByText(billingStrings['mkt.suspended'])).toBeInTheDocument();
    expect(within(drawer).getByText(body)).toBeInTheDocument();
    expect(within(drawer).queryByText(billingStrings['band.suspendedBody'])).toBeNull();
    expect(within(drawer).getByRole('button', { name: kitRoot['outcome.pending.check'] })).toBeEnabled();
    nothingSends(drawer);
  };

  // Rent only here: every fixture reservation costs more than the fixture wallet holds. The drawer's rule is the same
  // for both kinds; the live hook's tests cover the reserve (checkout-live-hook.test.tsx).
  it('rent: unknown', async () => {
    const { queryClient, drawer } = await sendUnknown('/billing?view=servers&checkout=rent&item=l06&days=30', 'send-unknown');
    await refuseBehind(queryClient);
    await keeps(drawer, billingStrings['mkt.indeterminateRent']);
  });

  // The page lifts its suspension once every read answers clean again,
  // but the drawer that met it stays suspended for its life: no send control comes back in it.
  it('rent: the page suspension lifts after a clean recheck, the open drawer stays suspended', async () => {
    const { queryClient, drawer } = await sendUnknown('/billing?view=servers&checkout=rent&item=l06&days=30', 'send-unknown');
    await refuseBehind(queryClient);
    await keeps(drawer, billingStrings['mkt.indeterminateRent']);
    // The band's Check status reads everything again, and every read now answers clean.
    act(() => checkStatus().click());
    await waitFor(() => expect(bands()).toHaveLength(0), { timeout: 10000 });
    await keeps(drawer, billingStrings['mkt.indeterminateRent']);
  });

  it('rent: not found after Check again', async () => {
    const { queryClient, drawer } = await sendUnknown('/billing?view=servers&checkout=rent&item=l06&days=30', 'send-unknown-notfound');
    await userEvent.click(within(drawer).getByRole('button', { name: kitRoot['outcome.pending.check'] }));
    expect(await within(drawer).findByText(billingStrings['mkt.notFoundTitle'])).toBeInTheDocument();
    await refuseBehind(queryClient);
    await keeps(drawer, billingStrings['mkt.notFoundTitle']);
  });
});
