// Vitest: on the standalone Hub a held top-up's confirmed "Send the same request again" is refused unsent (shared.js
// hands every payment to the served Hub, STANDALONE_HANDOFF). The drawer says so, with the link to this place in the
// served Hub; the hold is kept (the first request's outcome is still unknown) and nothing is sent. Through the REAL
// core: the lost first send is the served Hub's, then this page refuses payments the way shared.js does.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, createContext, useContext } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStrings } from '@kit';
import { queryClient } from '@core/query';
import { installShared, shared } from '@core/session';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { useTopUpLive } from './data';
import { useFunds } from './parts/Funds';
import strings from './strings.en.json';
import { isOff } from '@app/testing';

const fx = vi.hoisted(() => ({ standalone: false, served: 'https://hoody.example/auth/home' }));
vi.mock('@core', async (orig) => {
  const a: Record<string, unknown> = await orig();
  return { ...a, isStandalone: () => fx.standalone, servedHubUrl: (route = '') => (fx.served ? fx.served + (route ? '#' + route : '') : '') };
});
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
// eslint-disable-next-line no-restricted-globals -- the test reads the record core keeps the hold in
const stored = (): Array<Record<string, unknown>> => JSON.parse(localStorage.getItem(KEY) || '[]') as Array<Record<string, unknown>>;
const posts = () => calls.filter((c) => c.method === 'POST');

/** The served Hub's send whose answer is lost: core now holds the top-up. */
async function lostSend(): Promise<void> {
  let api!: ReturnType<typeof useTopUpLive>;
  function Probe() {
    api = useTopUpLive();
    return null;
  }
  const first = render(<Probe />, { wrapper: wrap });
  await act(flush);
  await act(async () => {
    expect((await api.submit('card', '20')).ok).toBe(false);
    await flush();
  });
  first.unmount();
}

/** This page from now on refuses payments unsent, exactly as shared.js does on a standalone page. */
function refusePaymentsAsStandalone(): void {
  const s = shared();
  const apiCall = s.apiCall.bind(s);
  installShared({
    ...s,
    apiCall: ((method: string, path: string, ...rest: unknown[]) =>
      /^\/wallet\/payments\//.test(path)
        ? Promise.reject({ status: 403, code: 'STANDALONE_HANDOFF', handoff: true, notSent: true, message: 'Something went wrong.' })
        : (apiCall as (...a: unknown[]) => unknown)(method, path, ...rest)) as typeof s.apiCall,
  });
  fx.standalone = true;
}

const Slot = createContext<ReactNode>(null);
const SlotView = () => useContext(Slot);
const router = createRouter({ routeTree: createRootRoute({ component: SlotView }), history: createMemoryHistory({ initialEntries: ['/billing?sheet=funds'] }) });
beforeAll(() => router.load());
function FundsBody() {
  const t = useStrings(strings);
  const funds = useFunds(t, () => undefined, t('action.cancel'), null, false);
  return (
    <>
      {funds.body}
      {funds.footer}
    </>
  );
}
function Funds() {
  return (
    <div data-testid="funds">
      <Slot.Provider value={<FundsBody />}>
        <RouterProvider router={router} />
      </Slot.Provider>
    </div>
  );
}
const inFunds = () => within(screen.getByTestId('funds'));

beforeEach(() => {
  leave.mockReset();
  fx.standalone = false;
  fx.served = 'https://hoody.example/auth/home';
  boot();
  queryClient.clear();
  onFetch((c) => (c.method === 'GET' ? availability : { status: 0, network: true }));
});

describe('standalone Hub: the confirmed resend of a held top-up', () => {
  it('is refused unsent and says where payments are made, with the link; the hold stays and nothing is sent', async () => {
    await lostSend();
    expect(stored()).toHaveLength(1);
    const sentBefore = posts().length;
    refusePaymentsAsStandalone();
    render(<Funds />, { wrapper: wrap });
    await act(flush);
    const btn = await inFunds().findByRole('button', { name: strings['co.resend'] });
    await waitFor(() => expect(isOff(btn)).toBe(false));
    await userEvent.click(btn);
    const ask = await screen.findByRole('alertdialog', { name: strings['co.resendTitle'] });
    await userEvent.click(within(ask).getByRole('button', { name: strings['co.resendConfirm'] }));
    await act(flush);
    const banner = screen.getByTestId('funds').querySelector('[data-outcome="pending"]') as HTMLElement;
    expect(banner).not.toBeNull();
    expect(within(banner).getByText(strings['top.handoff'], { exact: false })).toBeInTheDocument();
    expect(within(banner).getByRole('link', { name: strings['co.standaloneOpen'] }).getAttribute('href')).toMatch(
      /^https:\/\/hoody\.example\/auth\/home#\/billing\?sheet=funds/,
    );
    // Still unknown: kept, Check again still offered, nothing went out, no payment page opened.
    expect(stored()).toHaveLength(1);
    expect(inFunds().getAllByRole('button', { name: strings['buy.checkAgain'] }).length).toBeGreaterThan(0);
    expect(posts()).toHaveLength(sentBefore);
    expect(leave).not.toHaveBeenCalled();
  });
});
