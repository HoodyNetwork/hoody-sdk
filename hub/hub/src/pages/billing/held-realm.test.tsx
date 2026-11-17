// Vitest: the auto-renew holds the page lists and frees (useAutoRenew().holds / dismissHeld), through the real core
// (no mocked hook): a hold sent in another realm is never listed, so Dismiss from the shown realm never frees it.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hook, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { heldChanges } from '@core';
import { bump, setRealm } from '@core/ctx';
import { queryClient } from '@core/query';
import { boot, onFetch, R1, R2, settle } from '@core/test/env';
import { useAutoRenew, useClaimBonus } from './data';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};

describe('held changes under a billing lock are listed for the realm shown only', () => {
  async function twoRealms() {
    boot({ realm: R1 });
    queryClient.clear();
    // Every PUT and POST answers 502: the outcome is unknown, so core holds the change. Reads fail, so nothing proves it.
    onFetch((c) => (c.method === 'GET' ? { status: 500, body: {} } : { status: 502, body: {} }));
    let renew!: ReturnType<typeof useAutoRenew>;
    let claim!: ReturnType<typeof useClaimBonus>;
    function Probe() {
      renew = useAutoRenew();
      claim = useClaimBonus();
      return null;
    }
    render(<Probe />, { wrapper: wrap });
    await act(async () => {
      expect((await renew.run({ id: 'in-a', auto_renew: true })).outcome).toBe('pending');
      await flush();
    });
    await act(async () => {
      setRealm(R2);
      bump('switch');
      await flush();
    });
    await act(async () => {
      expect((await renew.run({ id: 'in-b', auto_renew: false })).outcome).toBe('pending');
      await flush();
    });
    await act(async () => {
      setRealm(R1);
      bump('switch');
      await flush();
    });
    return { renew: () => renew, claim: () => claim };
  }

  it("lists only the shown realm's holds, and Dismiss frees those and leaves the other realm's held", async () => {
    const h = await twoRealms();
    expect(heldChanges('billing-auto-renew')).toHaveLength(2);
    let shown!: Awaited<ReturnType<ReturnType<typeof h.renew>['holds']>>;
    await act(async () => {
      shown = await h.renew().holds();
    });
    expect(shown.map((x) => x.vars.id)).toEqual(['in-a']);
    let freed = false;
    await act(async () => {
      freed = await h.renew().dismissHeld(shown);
      await flush();
    });
    expect(freed).toBe(true);
    // Realm B's hold is untouched: still held, and listed when B is the realm shown.
    expect(heldChanges('billing-auto-renew').map((x) => (x.identity as { id: string }).id)).toEqual(['in-b']);
    await act(async () => {
      setRealm(R2);
      bump('switch');
      await flush();
    });
    let other!: typeof shown;
    await act(async () => {
      other = await h.renew().holds();
    });
    expect(other.map((x) => x.vars.id)).toEqual(['in-b']);
  });

  it('an account-wide claim hold is listed in every realm', async () => {
    const h = await twoRealms();
    await act(async () => {
      expect((await h.claim().run()).outcome).toBe('pending');
      await flush();
    });
    await act(async () => {
      setRealm(R2);
      bump('switch');
      await flush();
    });
    let shown!: Awaited<ReturnType<ReturnType<typeof h.claim>['holds']>>;
    await act(async () => {
      shown = await h.claim().holds();
    });
    expect(shown).toHaveLength(1);
  });
});
