// Vitest: the held top-up band on a live page, through the REAL core (no mocked machine, reader, lock or clock): the band
// shows core's own record from the first render, whatever drawer is open, and only fresh proof (a record that is gone)
// or the person's own warned Dismiss takes it away. Only the provider navigation (leaveTo) is observed.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, createContext, useContext, useLayoutEffect } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStrings } from '@kit';
import { bump, setIdentity } from '@core/ctx';
import { queryClient } from '@core/query';
import { boot, calls, deferred, onFetch, OTHER, settle, UID } from '@core/test/env';
import { useTopUpHeld, useTopUpLive } from './data';
import { useFunds } from './parts/Funds';
import { HeldTopUpSlot } from './parts/HeldTopUp';
import strings from './strings.en.json';
import { isOff } from '@app/testing';

const leave = vi.hoisted(() => vi.fn());
vi.mock('./data', async (orig) => {
  const a: Record<string, unknown> = await orig();
  return { ...a, useTopUp: a.useTopUpLive, useTopUpHeld: a.useTopUpHeldLive, leaveTo: (u: string) => leave(u) };
});

const KEY = 'hub.v3.topup_pending';
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};
const availability = { status: 200, body: { data: { card: { enabled: true, min_usd: 5, max_usd: 5000 }, crypto: { enabled: false } } } };
const never = () => new Promise<never>(() => undefined);
// eslint-disable-next-line no-restricted-globals -- the test reads the record core keeps the hold in
const stored = (): Array<Record<string, unknown>> => JSON.parse(localStorage.getItem(KEY) || '[]') as Array<Record<string, unknown>>;
// eslint-disable-next-line no-restricted-globals -- the test plays another tab writing core's record
const writeStored = (list: unknown[]): void => localStorage.setItem(KEY, JSON.stringify(list));
const storageEvent = (): void => {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
  });
};
const band = () => document.querySelector('[data-band="topup-unknown"]') as HTMLElement | null;
const check = () => within(band() as HTMLElement).getByRole('button', { name: strings['buy.checkAgain'] });
const dismiss = () => within(band() as HTMLElement).getByRole('button', { name: strings['hold.dismiss'] });
const posts = () => calls.filter((c) => c.method === 'POST');
const gets = () => calls.filter((c) => c.method === 'GET');
const noteShown = () => screen.queryByText(strings['top.resolvedTitle']) !== null;

function Band() {
  const t = useStrings(strings);
  return <HeldTopUpSlot t={t} banned={false} />;
}

/** The drawer's send whose answer is lost: core now holds the top-up. Returns its key. */
async function lostSend(): Promise<string> {
  let api!: ReturnType<typeof useTopUpLive>;
  function Probe() {
    api = useTopUpLive();
    return null;
  }
  const first = render(<Probe />, { wrapper: wrap });
  await act(flush);
  await act(async () => {
    expect((await api.submit('card', '1234.5')).ok).toBe(false);
    await flush();
  });
  first.unmount();
  return (posts()[0]?.body as { idempotency_key: string }).idempotency_key;
}

// Both homes of the form sit under the app's router (it reads its own route, and its Why ends with a page FAQ link),
// so the harness gives it one.
const Slot = createContext<ReactNode>(null);
const SlotView = () => useContext(Slot);
// Loaded once before the tests: a mount then draws the form at once and never mounts it a second time.
const router = createRouter({ routeTree: createRootRoute({ component: SlotView }), history: createMemoryHistory({ initialEntries: ['/billing'] }) });
beforeAll(() => router.load());
function Routed({ children }: { children: ReactNode }) {
  return (
    <Slot.Provider value={children}>
      <RouterProvider router={router} />
    </Slot.Provider>
  );
}

/** The real Add funds form (useFunds), mounted beside the band. */
function FundsBody({ banned }: { banned: boolean }) {
  const t = useStrings(strings);
  const funds = useFunds(t, () => undefined, t('action.cancel'), null, banned);
  return (
    <>
      {funds.body}
      {funds.footer}
    </>
  );
}
function Funds({ banned = false }: { banned?: boolean }) {
  return (
    <div data-testid="funds">
      <Routed>
        <FundsBody banned={banned} />
      </Routed>
    </div>
  );
}
const inFunds = () => within(screen.getByTestId('funds'));

/** Check again only reads; the confirmed "Send the same request again" is the one resend. */
async function resendFrom(scope: ReturnType<typeof within>): Promise<void> {
  const btn = await scope.findByRole('button', { name: strings['co.resend'] });
  await waitFor(() => expect(isOff(btn)).toBe(false));
  await userEvent.click(btn);
  const ask = await screen.findByRole('alertdialog', { name: strings['co.resendTitle'] });
  await userEvent.click(within(ask).getByRole('button', { name: strings['co.resendConfirm'] }));
}

/** A top-up drawer's machine, mounted beside the band. */
function Drawer({ out }: { out: { api?: ReturnType<typeof useTopUpLive> } }) {
  out.api = useTopUpLive();
  return null;
}

/** The band has restored the record: its actions are offered (nothing is being sent). */
const restored = async (): Promise<void> => {
  await waitFor(() => expect(isOff(check())).toBe(false));
};

beforeEach(() => {
  leave.mockReset();
  boot();
  queryClient.clear();
  onFetch((c) => (c.method === 'GET' ? availability : { status: 0, network: true }));
});

describe('the band shows core\'s record, at once', () => {
  it('shows nothing when nothing is held, and a hold another tab writes at once, without any read', async () => {
    render(<Band />, { wrapper: wrap });
    await act(flush);
    expect(band()).toBeNull();
    onFetch(never);
    writeStored([{ user_id: UID, key: 'k'.repeat(24), method: 'card', amount: '20.00', at: Date.now() }]);
    storageEvent();
    expect(band()).not.toBeNull();
    expect(within(band() as HTMLElement).getByText('A $20.00 top-up may have gone through.')).toBeInTheDocument();
  });

  it('shows the hold on the very first render, with its amount, while no availability read has answered; both actions wait', async () => {
    await lostSend();
    onFetch(never);
    render(<Band />, { wrapper: wrap });
    expect(band()).not.toBeNull();
    expect(within(band() as HTMLElement).getByText('A $1,234.50 top-up may have gone through.')).toBeInTheDocument();
    expect(band()?.getAttribute('data-outcome')).toBe('pending');
    expect(isOff(check())).toBe(true);
    expect(isOff(dismiss())).toBe(true);
    expect(stored()).toHaveLength(1);
  });

  it('sees a hold another tab writes between the first render and the subscription (nothing is announced to it)', async () => {
    onFetch(never);
    // A sibling's layout effect runs before the band's passive subscription: the write and its storage event come first.
    function Writer() {
      useLayoutEffect(() => {
        writeStored([{ user_id: UID, key: 'w'.repeat(24), method: 'card', amount: '25.00', at: Date.now() }]);
        window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
      }, []);
      return null;
    }
    render(
      <>
        <Writer />
        <Band />
      </>,
      { wrapper: wrap },
    );
    await act(flush);
    expect(band()).not.toBeNull();
    expect(within(band() as HTMLElement).getByText('A $25.00 top-up may have gone through.')).toBeInTheDocument();
  });

  it('drops a hold another tab resolves between the first render and the subscription', async () => {
    await lostSend();
    const rec = stored();
    // First render shows the hold (it exists then); the sibling's layout effect resolves it before the subscription.
    function Writer() {
      useLayoutEffect(() => {
        writeStored([]);
        window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
      }, []);
      return null;
    }
    expect(rec).toHaveLength(1);
    render(
      <>
        <Writer />
        <Band />
      </>,
      { wrapper: wrap },
    );
    await act(flush);
    expect(band()).toBeNull();
  });

  it('reads the account another switch made between the first render and the subscription (no hold either way)', async () => {
    onFetch(never);
    function Owner() {
      return <span data-testid="owner">{useTopUpHeld().owner}</span>;
    }
    function Switch() {
      useLayoutEffect(() => {
        setIdentity({ id: OTHER, banned: false });
        bump('account');
      }, []);
      return null;
    }
    render(
      <>
        <Switch />
        <Owner />
      </>,
      { wrapper: wrap },
    );
    await act(flush);
    expect(screen.getByTestId('owner').textContent).toBe(OTHER);
  });

  it('a hold replaced by another tab between the first render and the subscription shows the new one, not the old amount', async () => {
    await lostSend();
    function Writer() {
      useLayoutEffect(() => {
        writeStored([{ user_id: UID, key: 'r'.repeat(24), method: 'card', amount: '40.00', at: Date.now() }]);
        window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
      }, []);
      return null;
    }
    onFetch(never);
    render(
      <>
        <Writer />
        <Band />
      </>,
      { wrapper: wrap },
    );
    await act(flush);
    expect(within(band() as HTMLElement).getByText('A $40.00 top-up may have gone through.')).toBeInTheDocument();
  });

  it('a stamp another tab puts on the hold between the first render and the subscription disables the actions', async () => {
    await lostSend();
    const rec = stored()[0] as Record<string, unknown>;
    function Writer() {
      useLayoutEffect(() => {
        writeStored([{ ...rec, sending: 'othertabattempt0001', sending_at: Date.now() }]);
        window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
      }, []);
      return null;
    }
    render(
      <>
        <Writer />
        <Band />
      </>,
      { wrapper: wrap },
    );
    await act(flush);
    await waitFor(() => expect(isOff(check())).toBe(true));
    expect(within(band() as HTMLElement).getByText(strings['band.sendingBody'])).toBeInTheDocument();
  });

  // A first send storage refuses is never sent: only this tab remembers a hold storage cannot read.
  it('says so when only this tab remembers it (the record cannot be read from storage)', async () => {
    await lostSend();
    await act(flush);
    const orig = Storage.prototype.getItem;
    // eslint-disable-next-line no-restricted-globals -- the test makes the browser's own storage refuse the read
    const quota = vi.spyOn(localStorage, 'getItem').mockImplementation(function (this: Storage, k: string) {
      if (k === KEY) throw new Error('storage');
      return orig.call(this, k);
    });
    try {
      render(<Band />, { wrapper: wrap });
      expect(band()).not.toBeNull();
      expect(within(band() as HTMLElement).getByText(strings['top.notSaved'])).toBeInTheDocument();
    } finally {
      quota.mockRestore();
    }
  });

  it('never goes away while a drawer mounts, loads, and unmounts over it', async () => {
    await lostSend();
    const out: { api?: ReturnType<typeof useTopUpLive> } = {};
    const view = render(
      <>
        <Band />
        <Drawer out={out} />
      </>,
      { wrapper: wrap },
    );
    expect(band()).not.toBeNull();
    await act(flush);
    expect(band()).not.toBeNull();
    expect(out.api?.pending?.amount).toBe('1234.50');
    view.rerender(<Band />);
    await act(flush);
    expect(band()).not.toBeNull();
    await restored();
  });

  it('is owner-bound: another account shown has no band and no note, its own hold shows, and the owner\'s comes back', async () => {
    await lostSend();
    render(<Band />, { wrapper: wrap });
    expect(band()).not.toBeNull();
    act(() => {
      setIdentity({ id: OTHER, banned: false });
      bump('account');
    });
    expect(band()).toBeNull();
    expect(noteShown()).toBe(false);
    act(() => {
      writeStored([...stored(), { user_id: OTHER, key: 'o'.repeat(24), method: 'crypto', amount: '77.00', at: Date.now() }]);
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    });
    expect(within(band() as HTMLElement).getByText('A $77.00 top-up may have gone through.')).toBeInTheDocument();
    expect(band()?.textContent).not.toContain('1,234.50');
    act(() => {
      setIdentity({ id: UID, banned: false });
      bump('account');
    });
    expect(within(band() as HTMLElement).getByText('A $1,234.50 top-up may have gone through.')).toBeInTheDocument();
    expect(noteShown()).toBe(false);
  });

  it('a different hold (another tab resolved the first and made a new one) shows the new amount and gets its own machine at once', async () => {
    await lostSend();
    render(<Band />, { wrapper: wrap });
    await restored();
    const other = 'n'.repeat(24);
    writeStored([{ user_id: UID, key: other, method: 'card', amount: '35.00', at: Date.now() }]);
    storageEvent();
    expect(within(band() as HTMLElement).getByText('A $35.00 top-up may have gone through.')).toBeInTheDocument();
    expect(noteShown()).toBe(false);
    // Well inside the 10 s a stalled machine takes to be replaced: the new hold's machine, not a wait.
    await waitFor(() => expect(isOff(check())).toBe(false), { timeout: 3000 });
  });

  it('a machine that restored a NEWER record than the band shows never enables the actions for the shown one', async () => {
    await lostSend();
    const held = deferred<unknown>();
    onFetch((c) => (c.method === 'GET' ? held.p.then(() => availability) : { status: 0, network: true }));
    render(<Band />, { wrapper: wrap });
    expect(within(band() as HTMLElement).getByText('A $1,234.50 top-up may have gone through.')).toBeInTheDocument();
    // The other tab replaces the hold; its storage event is late (not delivered yet). The machine reads the new record.
    writeStored([{ user_id: UID, key: 'n'.repeat(24), method: 'card', amount: '35.00', at: Date.now() }]);
    await act(async () => {
      held.res(undefined);
      await flush();
    });
    expect(within(band() as HTMLElement).getByText('A $1,234.50 top-up may have gone through.')).toBeInTheDocument();
    expect(isOff(check())).toBe(true);
    expect(isOff(dismiss())).toBe(true);
    storageEvent();
    expect(within(band() as HTMLElement).getByText('A $35.00 top-up may have gone through.')).toBeInTheDocument();
    await waitFor(() => expect(isOff(check())).toBe(false), { timeout: 3000 });
  });

  it('a hold another tab resolved is said once (never a silent vanish), and the band is gone', async () => {
    await lostSend();
    render(<Band />, { wrapper: wrap });
    expect(band()).not.toBeNull();
    writeStored([]);
    storageEvent();
    expect(await screen.findByText(strings['top.resolvedTitle'])).toBeInTheDocument();
    expect(band()).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: strings.dismiss }));
    expect(noteShown()).toBe(false);
  });
});

describe('Check again and the confirmed resend', () => {
  it('Check again sends nothing: the hold and the band stay', async () => {
    await lostSend();
    render(<Band />, { wrapper: wrap });
    await restored();
    await userEvent.click(check());
    await act(flush);
    expect(posts()).toHaveLength(1);
    expect(band()?.getAttribute('data-outcome')).toBe('pending');
    expect(stored()).toHaveLength(1);
  });

  it('the confirmed resend sends the same key and, still unanswered, keeps the hold and the band', async () => {
    const key = await lostSend();
    render(<Band />, { wrapper: wrap });
    await restored();
    await resendFrom(within(band() as HTMLElement));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect((posts()[1]?.body as { idempotency_key: string }).idempotency_key).toBe(key);
    await act(flush);
    expect(band()?.getAttribute('data-outcome')).toBe('pending');
    expect(stored()).toHaveLength(1);
    expect(leave).not.toHaveBeenCalled();
  });

  it('a confirmed resend answered: goes to the provider page with the same key, and says nothing more about a vanished hold', async () => {
    const key = await lostSend();
    onFetch((c) =>
      c.method === 'GET' ? availability : { status: 201, body: { data: { intent: {}, checkout_url: 'https://checkout.stripe.com/c/pay/cs_band' } } },
    );
    render(<Band />, { wrapper: wrap });
    await restored();
    await resendFrom(within(band() as HTMLElement));
    await waitFor(() => expect(leave).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_band'));
    expect(posts()).toHaveLength(2);
    expect((posts()[1]?.body as { idempotency_key: string }).idempotency_key).toBe(key);
    await act(flush);
    expect(stored()).toHaveLength(0);
    expect(noteShown()).toBe(false);
  });
});

describe('Dismiss', () => {
  it('sends nothing, keeps the hold until the confirm, then frees it with no note', async () => {
    await lostSend();
    const sent = posts().length;
    render(<Band />, { wrapper: wrap });
    await restored();
    await userEvent.click(dismiss());
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['action.cancel'] }));
    expect(stored()).toHaveLength(1);
    expect(band()).not.toBeNull();
    await userEvent.click(dismiss());
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['top.forgetConfirm'] }));
    await waitFor(() => expect(band()).toBeNull());
    await act(flush);
    expect(stored()).toHaveLength(0);
    expect(posts()).toHaveLength(sent);
    expect(noteShown()).toBe(false);
  });

  it('refused by core (another tab started sending while the confirm was open): the hold and band stay, and it says why', async () => {
    await lostSend();
    render(<Band />, { wrapper: wrap });
    await restored();
    await userEvent.click(dismiss());
    const rec = stored()[0] as Record<string, unknown>;
    writeStored([{ ...rec, sending: 'othertabattempt0001', sending_at: Date.now() }]);
    storageEvent();
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['top.forgetConfirm'] }));
    expect(await screen.findByText(strings['band.forgetRefused'])).toBeInTheDocument();
    expect(stored()).toHaveLength(1);
    expect(band()).not.toBeNull();
    expect(noteShown()).toBe(false);
  });

  it('then reopening Add funds finds nothing held, even while its availability read is slow: no old amount comes back', async () => {
    await lostSend();
    render(<Band />, { wrapper: wrap });
    await restored();
    await userEvent.click(dismiss());
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['top.forgetConfirm'] }));
    await waitFor(() => expect(band()).toBeNull());
    onFetch((c) => (c.method === 'GET' ? { ...availability, delayMs: 300 } : { status: 0, network: true }));
    const out: { api?: ReturnType<typeof useTopUpLive> } = {};
    render(<Drawer out={out} />, { wrapper: wrap });
    expect(band()).toBeNull();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
      await flush();
    });
    expect(out.api?.pending).toBeNull();
    expect(band()).toBeNull();
    expect(noteShown()).toBe(false);
  });

  it('with the pending lock busy (a real lock, held): the band stays until the delete really ran, then goes with no note', async () => {
    await lostSend();
    render(<Band />, { wrapper: wrap });
    await restored();
    // Someone else holds the pending lock: the Forget's delete waits for it.
    const open = deferred();
    const held = navigator.locks;
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_n: string, fn: () => unknown) => open.p.then(fn) } });
    try {
      await userEvent.click(dismiss());
      await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['top.forgetConfirm'] }));
      await act(flush);
      expect(stored()).toHaveLength(1);
      expect(band()).not.toBeNull();
      expect(noteShown()).toBe(false);
      open.res();
      await waitFor(() => expect(band()).toBeNull());
      expect(stored()).toHaveLength(0);
      expect(noteShown()).toBe(false);
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: held });
    }
  });

  it('the real Add funds form: Forget, confirmed, is the same Dismiss: the band goes, with no note', async () => {
    await lostSend();
    render(
      <>
        <Band />
        <Funds />
      </>,
      { wrapper: wrap },
    );
    await act(flush);
    const forget = await inFunds().findByRole('button', { name: strings['top.forget'] });
    await waitFor(() => expect(isOff(forget)).toBe(false));
    await userEvent.click(forget);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['top.forgetConfirm'] }));
    await waitFor(() => expect(band()).toBeNull());
    await act(flush);
    expect(stored()).toHaveLength(0);
    expect(noteShown()).toBe(false);
  });

  it('the real Add funds form: an answered confirmed resend leaves for the provider, with no "no longer waiting" note', async () => {
    await lostSend();
    onFetch((c) =>
      c.method === 'GET' ? availability : { status: 201, body: { data: { intent: {}, checkout_url: 'https://checkout.stripe.com/c/pay/cs_funds' } } },
    );
    render(
      <>
        <Band />
        <Funds />
      </>,
      { wrapper: wrap },
    );
    await act(flush);
    await resendFrom(inFunds());
    await waitFor(() => expect(leave).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_funds'));
    await waitFor(() => expect(stored()).toHaveLength(0));
    await act(flush);
    expect(band()).toBeNull();
    expect(noteShown()).toBe(false);
  });

  it('the real Add funds form: a Check again that finds the hold already resolved says so in the drawer, with no band note', async () => {
    await lostSend();
    render(
      <>
        <Band />
        <Funds />
      </>,
      { wrapper: wrap },
    );
    await act(flush);
    const again = await inFunds().findByRole('button', { name: strings['buy.checkAgain'] });
    await waitFor(() => expect(isOff(again)).toBe(false));
    // Another tab resolved it; this tab has not heard yet.
    writeStored([]);
    await userEvent.click(again);
    await act(flush);
    storageEvent();
    await act(flush);
    expect(band()).toBeNull();
    expect(noteShown()).toBe(true); // the drawer's own resolved banner
    expect(screen.getAllByText(strings['top.resolvedTitle'])).toHaveLength(1);
  });

  it('the real Add funds form: a fresh send answered at once gives its own end, with no stray note from the band', async () => {
    onFetch((c) =>
      c.method === 'GET'
        ? availability
        : new Promise((res) => {
            setTimeout(() => res({ status: 201, body: { data: { intent: {}, checkout_url: 'https://checkout.stripe.com/c/pay/cs_fresh' } } }), 400);
          }),
    );
    render(
      <>
        <Band />
        <Funds />
      </>,
      { wrapper: wrap },
    );
    await act(flush);
    const go = await inFunds().findByRole('button', { name: strings['top.go'] });
    await waitFor(() => expect(isOff(go)).toBe(false));
    await userEvent.click(go);
    // While the POST is out the hold shows in the band; its answer then ends it here.
    await waitFor(() => expect(band()).not.toBeNull());
    await waitFor(() => expect(leave).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_fresh'));
    await waitFor(() => expect(band()).toBeNull());
    await act(flush);
    expect(noteShown()).toBe(false);
  });

  it('the real Add funds form: a fresh send refused for good gives its own end too, with no stray band note', async () => {
    onFetch((c) =>
      c.method === 'GET'
        ? availability
        : new Promise((res) => {
            setTimeout(() => res({ status: 400, body: { error: { code: 'bad_request', message: 'no' } } }), 400);
          }),
    );
    render(
      <>
        <Band />
        <Funds />
      </>,
      { wrapper: wrap },
    );
    await act(flush);
    const go = await inFunds().findByRole('button', { name: strings['top.go'] });
    await waitFor(() => expect(isOff(go)).toBe(false));
    await userEvent.click(go);
    await waitFor(() => expect(band()).not.toBeNull());
    await waitFor(() => expect(band()).toBeNull());
    await act(flush);
    // The drawer says nothing was charged; the band does not also say it is no longer waiting.
    expect(await inFunds().findByText(strings['top.failed'])).toBeInTheDocument();
    expect(noteShown()).toBe(false);
    expect(stored()).toHaveLength(0);
  });

  it('the real Add funds form: a fresh send whose answer is lost keeps the band, and a later outside resolution is still said', async () => {
    onFetch((c) => (c.method === 'GET' ? availability : { status: 0, network: true }));
    render(
      <>
        <Band />
        <Funds />
      </>,
      { wrapper: wrap },
    );
    await act(flush);
    const go = await inFunds().findByRole('button', { name: strings['top.go'] });
    await waitFor(() => expect(isOff(go)).toBe(false));
    await userEvent.click(go);
    await waitFor(() => expect(band()).not.toBeNull());
    await act(flush);
    expect(stored()).toHaveLength(1);
    // Another tab learns the answer and clears the hold: this tab's unknown send did not end it.
    writeStored([]);
    storageEvent();
    await waitFor(() => expect(band()).toBeNull());
    expect(noteShown()).toBe(true);
  });

  it('a Forget confirmed inside the Add funds drawer is the same Dismiss: the band goes, with no note', async () => {
    await lostSend();
    const out: { api?: ReturnType<typeof useTopUpLive> } = {};
    render(
      <>
        <Band />
        <Drawer out={out} />
      </>,
      { wrapper: wrap },
    );
    await waitFor(() => expect(out.api?.pending).not.toBeNull());
    expect(band()).not.toBeNull();
    const { noteTopUpEnded } = await import('./data');
    const key = stored()[0]?.key as string;
    act(() => {
      expect(out.api?.forget?.()).toBe(true);
      noteTopUpEnded(key);
    });
    await waitFor(() => expect(band()).toBeNull());
    await act(flush);
    expect(noteShown()).toBe(false);
    expect(stored()).toHaveLength(0);
  });
});

describe('a send out elsewhere, by core\'s own rule', () => {
  const stamp = (at: number) => ({ sending: 'othertabattempt0001', sending_at: at });

  it('disables both actions, and offers them 120 s after the stamp\'s sending_at, with no clock of the page\'s own', async () => {
    await lostSend();
    const rec = stored()[0] as Record<string, unknown>;
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const t0 = Date.now();
      writeStored([{ ...rec, ...stamp(t0) }]);
      const view = render(<Band />, { wrapper: wrap });
      expect(isOff(check())).toBe(true);
      expect(isOff(dismiss())).toBe(true);
      expect(within(band() as HTMLElement).getByText(strings['band.sendingBody'])).toBeInTheDocument();
      await act(flush);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(115_000);
      });
      expect(isOff(check())).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(isOff(check())).toBe(false);
      expect(isOff(dismiss())).toBe(false);
      expect(within(band() as HTMLElement).queryByText(strings['band.sendingBody'])).toBeNull();
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a renewed stamp (the other tab\'s heartbeat) keeps them disabled past 120 s of watching, until it too ages out', async () => {
    await lostSend();
    const rec = stored()[0] as Record<string, unknown>;
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const t0 = Date.now();
      writeStored([{ ...rec, ...stamp(t0) }]);
      render(<Band />, { wrapper: wrap });
      await act(flush);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100_000);
      });
      writeStored([{ ...rec, ...stamp(Date.now()) }]);
      storageEvent();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(21_000);
      });
      // 121 s since the band first saw the stamp, but the stamp was renewed 21 s ago.
      expect(isOff(check())).toBe(true);
      expect(isOff(dismiss())).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100_000);
      });
      expect(isOff(check())).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs no tick of its own while nothing is being sent (the interval exists only for a stamp to age out)', async () => {
    await lostSend();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const view = render(<Band />, { wrapper: wrap });
      await act(flush);
      await restored();
      expect(vi.getTimerCount()).toBe(0);
      // While a stamp is out, one tick is held; once it ages out, none.
      const rec = stored()[0] as Record<string, unknown>;
      writeStored([{ ...rec, ...stamp(Date.now()) }]);
      storageEvent();
      expect(isOff(check())).toBe(true);
      expect(vi.getTimerCount()).toBe(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(125_000);
      });
      expect(isOff(check())).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a stamp already older than the window when the page opens offers both at once', async () => {
    await lostSend();
    const rec = stored()[0] as Record<string, unknown>;
    writeStored([{ ...rec, ...stamp(Date.now() - 10 * 60_000) }]);
    render(<Band />, { wrapper: wrap });
    await restored();
    expect(isOff(dismiss())).toBe(false);
  });
});

describe('a machine that never restores the record', () => {
  it('is replaced after 10 s, never decides: the band stays, and its actions come when a new one answers', async () => {
    await lostSend();
    onFetch(never);
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      render(<Band />, { wrapper: wrap });
      await act(flush);
      expect(band()).not.toBeNull();
      expect(isOff(check())).toBe(true);
      const first = gets().length;
      expect(first).toBeGreaterThan(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      await act(flush);
      expect(gets().length).toBeGreaterThan(first);
      expect(band()).not.toBeNull();
      expect(isOff(check())).toBe(true);
      // The provider answers the next read: the new machine restores the record.
      onFetch((c) => (c.method === 'GET' ? availability : { status: 0, network: true }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      await act(flush);
      await waitFor(() => expect(isOff(check())).toBe(false));
      expect(band()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

// The held top-up's "Send the same request again" opens a payment page, so a suspended
// account gets no resend here, as the header's Add funds is off. Check again (reads only) and Dismiss stay.
describe('while the account is suspended', () => {
  it('the held top-up band offers Check again and Dismiss, never "Send the same request again", and sends nothing', async () => {
    await lostSend();
    function Suspended() {
      const t = useStrings(strings);
      return <HeldTopUpSlot t={t} banned />;
    }
    render(<Suspended />, { wrapper: wrap });
    await restored();
    expect(dismiss()).toBeInTheDocument();
    expect(within(band() as HTMLElement).queryByRole('button', { name: strings['co.resend'] })).toBeNull();
    await userEvent.click(check());
    await act(flush);
    expect(posts()).toHaveLength(1);
    expect(band()?.getAttribute('data-outcome')).toBe('pending');
    expect(leave).not.toHaveBeenCalled();
  });

  it('the Add funds drawer (reachable by its ?sheet=funds URL) keeps Check again, offers no resend and sends nothing new', async () => {
    await lostSend();
    render(<Funds banned />, { wrapper: wrap });
    const check = await inFunds().findByRole('button', { name: strings['buy.checkAgain'] });
    await waitFor(() => expect(isOff(check)).toBe(false));
    expect(inFunds().queryByRole('button', { name: strings['co.resend'] })).toBeNull();
    expect(inFunds().getByRole('button', { name: strings['top.forget'] })).toBeInTheDocument();
    await userEvent.click(check);
    await act(flush);
    expect(posts()).toHaveLength(1);
    expect(leave).not.toHaveBeenCalled();
  });

  it('with nothing held, the drawer starts no fresh payment: Add funds stays off and a press sends nothing', async () => {
    render(<Funds banned />, { wrapper: wrap });
    await act(flush);
    const go = await inFunds().findByRole('button', { name: strings['top.go'] });
    await act(flush);
    expect(isOff(go)).toBe(true);
    await userEvent.click(go);
    await act(flush);
    expect(posts()).toHaveLength(0);
    expect(leave).not.toHaveBeenCalled();
  });

  it('the same drawer, not suspended, still offers the resend', async () => {
    await lostSend();
    render(<Funds />, { wrapper: wrap });
    expect(await inFunds().findByRole('button', { name: strings['co.resend'] })).toBeInTheDocument();
  });

  it('while another tab is still sending the held payment, the drawer offers nothing to press: resend, Stop tracking and Check again are off', async () => {
    await lostSend();
    const rec = stored()[0] as Record<string, unknown>;
    writeStored([{ ...rec, sending: 'othertabattempt0001', sending_at: Date.now() }]);
    render(<Funds />, { wrapper: wrap });
    const resend = await inFunds().findByRole('button', { name: strings['co.resend'] });
    await act(flush);
    expect(isOff(resend)).toBe(true);
    expect(isOff(inFunds().getByRole('button', { name: strings['top.forget'] }))).toBe(true);
    expect(isOff(inFunds().getByRole('button', { name: strings['buy.checkAgain'] }))).toBe(true);
    expect(inFunds().getByText(strings['top.forgetSending'])).toBeInTheDocument();
    await userEvent.click(resend);
    await act(flush);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(posts()).toHaveLength(1);
    expect(leave).not.toHaveBeenCalled();
  });

  it('the drawer draws the resend in the "not confirmed" banner as soon as it is offered, and it is that same control once the form has loaded', async () => {
    await lostSend();
    render(<Funds />, { wrapper: wrap });
    // The first time the resend is on screen at all (the record is restored while the form still loads).
    const first = await inFunds().findByRole('button', { name: strings['co.resend'] });
    expect(first.closest('[data-outcome="pending"]')).not.toBeNull();
    await waitFor(() => expect(isOff(first)).toBe(false));
    await act(flush);
    expect(first.isConnected).toBe(true);
    expect(inFunds().getAllByRole('button', { name: strings['co.resend'] })).toEqual([first]);
    expect(inFunds().getAllByRole('button', { name: strings['top.forget'] })).toHaveLength(1);
  });

  it('the same band, not suspended, still offers the resend (the control is only hidden while banned)', async () => {
    await lostSend();
    render(<Band />, { wrapper: wrap });
    await restored();
    expect(await within(band() as HTMLElement).findByRole('button', { name: strings['co.resend'] })).toBeInTheDocument();
  });
});
