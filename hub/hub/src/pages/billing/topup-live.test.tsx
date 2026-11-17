// Vitest: Add funds on a live page, through the real core (no mocked machine): the amount is sent to the
// provider's checkout route and the page gets the provider's own https URL back.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { queryClient } from '@core/query';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { useTopUpLive } from './data';
import strings from './strings.en.json';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};

describe('add funds through the real core', () => {
  it('sends the card amount to the checkout route and answers the checkout URL', async () => {
    boot();
    queryClient.clear();
    onFetch((c) => {
      if (c.method === 'GET')
        return {
          status: 200,
          body: { data: { card: { enabled: true, min_usd: 5, max_usd: 1000 }, crypto: { enabled: true, min_usd: 5, max_usd: 1000 } } },
        };
      return { status: 201, body: { data: { intent: {}, checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_1' } } };
    });
    let api!: ReturnType<typeof useTopUpLive>;
    function Probe() {
      api = useTopUpLive();
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    expect(api.loading).toBe(false);
    let r!: Awaited<ReturnType<typeof api.submit>>;
    await act(async () => {
      r = await api.submit('card', '20');
      await flush();
    });
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.url).toContain('/wallet/payments/card/checkout');
    expect(post?.body).toMatchObject({ amount: '20.00' });
    // The answer carries the key the send used (the request's own idempotency key), so its end can be told as this tab's.
    expect(r).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_1', key: (post?.body as { idempotency_key: string }).idempotency_key });
  });

  it('a framed Hub says to open it in its own tab, never "you switched accounts"; nothing is sent', async () => {
    boot({ framed: true });
    queryClient.clear();
    onFetch((c) =>
      c.method === 'GET'
        ? { status: 200, body: { data: { card: { enabled: true, min_usd: 5, max_usd: 1000 }, crypto: { enabled: false } } } }
        : { status: 201, body: { data: { checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_1' } } },
    );
    let api!: ReturnType<typeof useTopUpLive>;
    function Probe() {
      api = useTopUpLive();
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    let r!: Awaited<ReturnType<typeof api.submit>>;
    await act(async () => {
      r = await api.submit('card', '20');
      await flush();
    });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(r).toMatchObject({ ok: false, unknown: false, word: { k: 'top.framed' } });
  });

  // Storage that cannot keep the top-up's hold sends nothing, and the drawer names
  // storage as the cause in the reserve's and rent's words (buy.storeErr), never "you switched accounts".
  it('storage refusing the hold: nothing is sent, and the words name storage as the cause', async () => {
    boot();
    queryClient.clear();
    onFetch((c) =>
      c.method === 'GET'
        ? { status: 200, body: { data: { card: { enabled: true, min_usd: 5, max_usd: 1000 }, crypto: { enabled: false } } } }
        : { status: 201, body: { data: { checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_1' } } },
    );
    let api!: ReturnType<typeof useTopUpLive>;
    function Probe() {
      api = useTopUpLive();
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    const orig = Storage.prototype.setItem;
    // eslint-disable-next-line no-restricted-globals -- the test makes the browser's own storage refuse the write
    const quota = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === 'hub.v3.topup_pending') throw new Error('quota');
      return orig.call(this, k, v);
    });
    let r!: Awaited<ReturnType<typeof api.submit>>;
    try {
      await act(async () => {
        r = await api.submit('card', '20');
        await flush();
      });
    } finally {
      quota.mockRestore();
    }
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(r).toMatchObject({ ok: false, unknown: false, word: { k: 'buy.storeErr' } });
    expect(strings['buy.storeErr']).toBeTruthy();
  });
});
