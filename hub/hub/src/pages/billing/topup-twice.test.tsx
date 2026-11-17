// Vitest: two Add funds submits in one tick (two Enters in one terminal read, a double click) through the real core:
// one POST, the first call's answer is the outcome, and the second changes nothing (ignored: Funds draws nothing for
// it, never "Nothing was sent"); only the owning call clears `running`.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { queryClient } from '@core/query';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { useTopUpLive } from './data';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};

describe('add funds: two submits in one tick', () => {
  it('send once; the second is ignored and running stays on until the first answers', async () => {
    boot();
    queryClient.clear();
    let answer!: () => void;
    const held = new Promise<void>((r) => { answer = r; });
    onFetch(async (c) => {
      if (c.method === 'GET')
        return { status: 200, body: { data: { card: { enabled: true, min_usd: 5, max_usd: 1000 }, crypto: { enabled: false } } } };
      await held;
      return { status: 201, body: { data: { intent: {}, checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_2' } } };
    });
    let api!: ReturnType<typeof useTopUpLive>;
    function Probe() {
      api = useTopUpLive();
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    let first!: Promise<Awaited<ReturnType<typeof api.submit>>>;
    let second!: Awaited<ReturnType<typeof api.submit>>;
    await act(async () => {
      first = api.submit('card', '20');
      second = await api.submit('card', '20');
      await flush();
    });
    expect(second).toEqual({ ok: false, ignored: true });
    expect(api.running).toBe(true);
    await act(async () => {
      answer();
      await flush();
    });
    expect(await first).toMatchObject({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_2' });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(api.running).toBe(false);
  });
});
