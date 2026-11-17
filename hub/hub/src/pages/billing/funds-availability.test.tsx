// Vitest: what Add funds says for each answer of GET /wallet/payment-availability, on a live page (real core, the real
// read; only the provider navigation is observed). C9: an answer that is not known is never shown as "none":
//   - a failed read (server error, refusal, lost connection) shows the read error with a retry;
//   - a 200 that does not carry the two providers (a gateway page, an empty object) is not an answer: same error;
//   - both providers answered "not enabled" is an answer: the page says funds are switched off and offers Check again,
//     which reads again and shows the methods once the server turns one on;
//   - each enabled provider is offered, and each one's Continue reaches its own route and its own provider host.
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
const mount = async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <Form />
    </QueryClientProvider>,
  );
  await act(flush);
};
const both = { data: { card: { enabled: true, min_usd: 5, max_usd: 1000 }, crypto: { enabled: true, min_usd: 10, max_usd: 900 } } };
const off = { data: { card: { enabled: false, min_usd: 5, max_usd: 1000 }, crypto: { enabled: false, min_usd: 5, max_usd: 1000 }, ai_credit_fee_bps: 0 } };
// After a recovery the form's Continue must really send: the machine that posts knows the methods the form lists.
const continueToProvider = async (url: string, route: string): Promise<void> => {
  const go = await screen.findByRole('button', { name: strings['top.go'] });
  await waitFor(() => expect(go).toBeEnabled());
  await userEvent.click(go);
  await waitFor(() => expect(leave).toHaveBeenCalledWith(url));
  const post = calls.find((c) => c.method === 'POST');
  expect(post?.url).toContain(route);
};
const reads = () => calls.filter((c) => c.method === 'GET' && c.url.includes('/wallet/payment-availability')).length;

beforeEach(() => {
  leave.mockReset();
  boot();
  queryClient.clear();
});

describe('a failed or unreadable availability read is an error with a retry, never "none"', () => {
  it.each([
    ['a server error', { status: 500, body: { statusCode: 500, error: 'INTERNAL_ERROR' } }],
    ['a refusal', { status: 403, body: { statusCode: 403, error: 'INSUFFICIENT_PERMISSIONS' } }],
    ['a lost connection', { status: 0, network: true }],
    ['an empty object', { status: 200, body: {} }],
    ['an answer without data', { status: 200, body: { statusCode: 200, message: 'ok' } }],
    ['data that is not an object', { status: 200, body: { data: 'maintenance' } }],
    ['data without either provider', { status: 200, body: { data: { ai_credit_fee_bps: 0 } } }],
    ['one provider missing', { status: 200, body: { data: { card: { enabled: false } } } }],
    ['providers without the enabled flag', { status: 200, body: { data: { card: { min_usd: 5 }, crypto: { max_usd: 1000 } } } }],
    ['a flag that is not a boolean', { status: 200, body: { data: { card: { enabled: 'false' }, crypto: { enabled: 0 } } } }],
  ])('%s', async (_n, answer) => {
    onFetch((c) => (c.method === 'GET' ? answer : { status: 0, network: true }));
    await mount();
    expect(await screen.findByText(strings['top.availErr'])).toBeInTheDocument();
    expect(screen.queryByText(strings['top.none'])).toBeNull();
    expect(screen.getByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
  });

  it('Retry reads again and then shows the methods', async () => {
    let up = false;
    onFetch((c) =>
      c.method === 'GET'
        ? up
          ? { status: 200, body: both }
          : { status: 500, body: { statusCode: 500, error: 'INTERNAL_ERROR' } }
        : { status: 201, body: { data: { intent: {}, checkout_url: 'https://checkout.stripe.com/c/pay/cs_1' } } },
    );
    await mount();
    await screen.findByText(strings['top.availErr']);
    const before = reads();
    up = true;
    await userEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    await act(flush);
    expect(reads()).toBeGreaterThan(before);
    expect(screen.queryByText(strings['top.availErr'])).toBeNull();
    await continueToProvider('https://checkout.stripe.com/c/pay/cs_1', '/wallet/payments/card/checkout');
  });
});

describe('both providers answered "not enabled"', () => {
  it('says funds are switched off, not that the read failed, and Check again reads once more', async () => {
    let on = false;
    onFetch((c) =>
      c.method === 'GET'
        ? { status: 200, body: on ? both : off }
        : { status: 201, body: { data: { intent: {}, checkout_url: 'https://checkout.stripe.com/c/pay/cs_2' } } },
    );
    await mount();
    expect(await screen.findByText(strings['top.none'])).toBeInTheDocument();
    expect(screen.queryByText(strings['top.availErr'])).toBeNull();
    expect(screen.queryByRole('radio', { name: strings['top.card'] })).toBeNull();
    const before = reads();
    on = true;
    await userEvent.click(screen.getByRole('button', { name: strings['top.noneRetry'] }));
    await act(flush);
    expect(reads()).toBeGreaterThan(before);
    expect(await screen.findByText(strings['top.lede'])).toBeInTheDocument();
    expect(screen.queryByText(strings['top.none'])).toBeNull();
    await continueToProvider('https://checkout.stripe.com/c/pay/cs_2', '/wallet/payments/card/checkout');
  });
});

// One availability read: the machine that sends reads it and the form lists exactly its methods and bounds, so the form can never
// offer a provider, an amount or a Continue the machine would refuse.
describe('one read decides what the form offers', () => {
  const cardOnly = (min: number) => ({ data: { card: { enabled: true, min_usd: min, max_usd: 1000 }, crypto: { enabled: false, min_usd: 10, max_usd: 900 } } });
  const get = (c: { method: string; url: string }) => c.method === 'GET' && c.url.includes('/wallet/payment-availability');
  const post = { status: 201, body: { data: { intent: {}, checkout_url: 'https://checkout.stripe.com/c/pay/cs_4' } } };

  it('reads availability once per open and once more per retry', async () => {
    onFetch((c) => (get(c) ? { status: 200, body: off } : c.method === 'GET' ? { status: 200, body: { data: {} } } : post));
    await mount();
    await screen.findByText(strings['top.none']);
    expect(reads()).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: strings['top.noneRetry'] }));
    await act(flush);
    expect(reads()).toBe(2);
  });

  it('a minimum above the first preset: the amount sent is one the provider takes, nothing is refused', async () => {
    onFetch((c) => (get(c) ? { status: 200, body: cardOnly(25) } : c.method === 'GET' ? { status: 200, body: { data: {} } } : post));
    await mount();
    await continueToProvider('https://checkout.stripe.com/c/pay/cs_4', '/wallet/payments/card/checkout');
    const sent = calls.find((c) => c.method === 'POST');
    expect(parseFloat(String(sent?.body?.amount))).toBeGreaterThanOrEqual(25);
  });

  it('one provider enabled: only that provider is offered', async () => {
    onFetch((c) => (get(c) ? { status: 200, body: cardOnly(5) } : c.method === 'GET' ? { status: 200, body: { data: {} } } : post));
    await mount();
    expect(await screen.findByRole('radio', { name: strings['top.card'] })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: strings['top.crypto'] })).toBeNull();
  });

  it('a failed read after switched-off: error, then a retry that finds the provider and sends', async () => {
    let phase: 'off' | 'fail' | 'on' = 'off';
    onFetch((c) => {
      if (!get(c)) return c.method === 'GET' ? { status: 200, body: { data: {} } } : post;
      if (phase === 'off') return { status: 200, body: off };
      if (phase === 'fail') return { status: 500, body: { statusCode: 500, error: 'INTERNAL_ERROR' } };
      return { status: 200, body: cardOnly(5) };
    });
    await mount();
    await screen.findByText(strings['top.none']);
    phase = 'fail';
    await userEvent.click(screen.getByRole('button', { name: strings['top.noneRetry'] }));
    await act(flush);
    expect(await screen.findByText(strings['top.availErr'])).toBeInTheDocument();
    const stuck = screen.queryByRole('button', { name: strings['top.go'] });
    if (stuck) expect(stuck).toBeDisabled();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    phase = 'on';
    await userEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    await act(flush);
    await continueToProvider('https://checkout.stripe.com/c/pay/cs_4', '/wallet/payments/card/checkout');
  });
});
