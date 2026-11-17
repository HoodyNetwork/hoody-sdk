// Vitest: the fixture Checkout hook (useCheckoutFx) takes a Confirm and a resend at once, not at the next render: a second
// one in the same input batch (a terminal read holding two Enters) finds the drawer posting and sends nothing.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, waitFor } from '@app/testing';
import page from './page';

const fx = vi.hoisted(() => ({ api: null as any }));

vi.mock('./data', async (orig) => {
  const a: Record<string, any> = await orig();
  return {
    ...a,
    useCheckout: (...args: any[]) => {
      const api = a.useCheckout(...args);
      fx.api = api;
      return api;
    },
  };
});

// First: the resend case below leaves this plan's request held (unknown) in the fixture store.
describe('fixture checkout: two Confirms in one batch', () => {
  it('send once', async () => {
    const { queryClient } = await renderPage(page, { path: '/billing?checkout=buy&plan=fam-plus' });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.api.state.phase).toBe('review'));
    await act(async () => { fx.api.setConsent(true); });
    let sends = 0;
    const off = queryClient.getMutationCache().subscribe((e) => { if (e.type === 'added') sends += 1; });
    act(() => { fx.api.confirm(); fx.api.confirm(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    off();
    expect(sends).toBe(1);
  });
});

describe('fixture checkout: two resends in one batch', () => {
  it('send once', async () => {
    const { queryClient } = await renderPage(page, { state: 'send-unknown', path: '/billing?checkout=buy&plan=fam-plus' });
    await screen.findByRole('dialog');
    await waitFor(() => expect(fx.api.state.phase).toBe('review'));
    await act(async () => { fx.api.setConsent(true); });
    await act(async () => { fx.api.confirm(); });
    await waitFor(() => expect(fx.api.state.phase).toBe('unknown'));
    await waitFor(() => expect(fx.api.state.retryIn).toBe(0), { timeout: 30_000 });
    // Every run of a mutation is a new one in the cache: count those added from here on.
    let sends = 0;
    const off = queryClient.getMutationCache().subscribe((e) => { if (e.type === 'added') sends += 1; });
    const shown = fx.api.resendShown();
    expect(shown).not.toBeNull();
    act(() => { fx.api.resend(shown); fx.api.resend(shown); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    off();
    expect(sends).toBe(1);
  }, 40_000);
});
