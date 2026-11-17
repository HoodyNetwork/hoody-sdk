// Vitest: the Add funds form (useFunds) on a live page: the real core and the real availability read, only the
// provider navigation (leaveTo) is observed. The person picks nothing and presses Continue: the amount goes to the
// card checkout route and the page leaves for the provider's own URL.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, createContext, useContext } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStrings } from '@kit';
import { queryClient } from '@core/query';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { useFunds } from './parts/Funds';
import strings from './strings.en.json';

const leave = vi.hoisted(() => vi.fn());
vi.mock('./data', async (orig) => {
  const a: Record<string, unknown> = await orig();
  return { ...a, useTopUp: a.useTopUpLive, leaveTo: (u: string) => leave(u) };
});

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

function FormBody() {
  const t = useStrings(strings);
  const funds = useFunds(t, () => undefined, t('action.cancel'), null, false);
  return (
    <div>
      {funds.body}
      {funds.footer}
    </div>
  );
}
const Form = () => (
  <Routed>
    <FormBody />
  </Routed>
);

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};

describe('Add funds on a live page', () => {
  beforeEach(() => leave.mockReset());

  it('Continue sends the preselected amount and leaves for the provider', async () => {
    boot();
    queryClient.clear();
    onFetch((c) =>
      c.method === 'GET'
        ? {
            status: 200,
            body: { data: { card: { enabled: true, min_usd: 5, max_usd: 1000 }, crypto: { enabled: true, min_usd: 5, max_usd: 1000 } } },
          }
        : { status: 201, body: { data: { intent: {}, checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_9' } } },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <Form />
      </QueryClientProvider>,
    );
    await act(flush);
    const go = await screen.findByRole('button', { name: strings['top.go'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(leave).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_9'));
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.url).toContain('/wallet/payments/card/checkout');
    expect(post?.body).toMatchObject({ amount: '20.00' });
  });

  it('a refusal for good shows the failed banner with Details: the status, never the response body or an unlisted code', async () => {
    boot();
    queryClient.clear();
    onFetch((c) =>
      c.method === 'GET'
        ? { status: 200, body: { data: { card: { enabled: true, min_usd: 5, max_usd: 1000 }, crypto: { enabled: false } } } }
        : { status: 400, body: { error: { code: 'bad_request', message: 'secret-body-text-9f3' } } },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <Form />
      </QueryClientProvider>,
    );
    await act(flush);
    const go = await screen.findByRole('button', { name: strings['top.go'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await screen.findByText(strings['top.failed']);
    await userEvent.click(await screen.findByRole('button', { name: /details/i }));
    expect(await screen.findByText('400')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('bad_request');
    expect(document.body.textContent).not.toContain('secret-body-text-9f3');
  });

  it('a provider minimum above the first preset still preselects an amount that fits', async () => {
    boot();
    queryClient.clear();
    onFetch((c) =>
      c.method === 'GET'
        ? { status: 200, body: { data: { card: { enabled: true, min_usd: 25, max_usd: 1000 }, crypto: { enabled: false } } } }
        : { status: 201, body: { data: { intent: {}, checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_8' } } },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <Form />
      </QueryClientProvider>,
    );
    await act(flush);
    const go = await screen.findByRole('button', { name: strings['top.go'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(leave).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_8'));
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ amount: '50.00' });
  });

  it('in a frame, Continue sends nothing and offers this page in a new tab', async () => {
    boot({ framed: true });
    queryClient.clear();
    onFetch((c) =>
      c.method === 'GET'
        ? { status: 200, body: { data: { card: { enabled: true, min_usd: 5, max_usd: 1000 }, crypto: { enabled: false } } } }
        : { status: 201, body: { data: { intent: {}, checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_7' } } },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <Form />
      </QueryClientProvider>,
    );
    await act(flush);
    const go = await screen.findByRole('button', { name: strings['top.go'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    const open = await screen.findByRole('link', { name: strings['top.framedOpen'] });
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(open.getAttribute('href')).toBe(window.location.href);
    expect(screen.getByText(strings['top.framed'])).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(leave).not.toHaveBeenCalled();
  });

  it('switching to a provider with a higher minimum offers only amounts it takes and moves to one that fits', async () => {
    boot();
    queryClient.clear();
    onFetch((c) =>
      c.method === 'GET'
        ? {
            status: 200,
            body: { data: { card: { enabled: true, min_usd: 5, max_usd: 1000 }, crypto: { enabled: true, min_usd: 25, max_usd: 1000 } } },
          }
        : { status: 201, body: { data: { invoice_url: 'https://nowpayments.io/payment/?iid=1' } } },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <Form />
      </QueryClientProvider>,
    );
    await act(flush);
    expect(await screen.findByText('$10')).toBeInTheDocument();
    await userEvent.click(await screen.findByText(strings['top.crypto']));
    await waitFor(() => expect(screen.queryByText('$10')).toBeNull());
    expect(screen.queryByText('$20')).toBeNull();
    expect(screen.getByText('$50')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: strings['top.go'] }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ amount: '50.00' });
  });
});
