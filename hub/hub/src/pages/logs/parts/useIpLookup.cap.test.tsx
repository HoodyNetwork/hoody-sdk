// Vitest: the hook on a list longer than the cache holds, and on a full cache. A real ipGeo with a fake lookup.
// Both tests pass only when one want() is capped at the cache capacity and a full cache drops its longest-held answer.
import { createIpGeo, type IpGeo } from '@core';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useIpLookup } from './useIpLookup';

describe('useIpLookup on a long list and a full cache', () => {
  // A runaway guard: a lookup that would be asked for again and again is cut after RUNAWAY calls (the
  // rejected call holds the next one back), and a render loop throws, so a defect shows as a red test and never hangs.
  const RUNAWAY = 60;
  const ipAt = (block: number, n: number) => `93.${block}.${Math.floor(n / 250) + 1}.${(n % 250) + 1}`;
  function crowd(answerOf: (ip: string, n: number) => string | null) {
    const calls: string[][] = [];
    const geo: IpGeo = createIpGeo({
      fetch: async (ips) => {
        calls.push([...ips]);
        if (calls.length > RUNAWAY) throw new Error('RUNAWAY');
        return { data: Object.fromEntries(ips.map((ip, n) => { const c = answerOf(ip, n); return [ip, c ? { ip, country: c } : null]; })) };
      },
      account: () => 'u1',
      store: () => null,
    });
    const renders = { n: 0 };
    const view = (list: readonly string[]) => renderHook(({ l }: { l: readonly string[] }) => {
      if (++renders.n > 300) throw new Error('RENDER-LOOP');
      const of = useIpLookup(l, geo);
      return l.map((ip) => of(ip));
    }, { initialProps: { l: list } });
    return { geo, calls, renders, view };
  }
  const quiet = () => new Promise((r) => setTimeout(r, 150));

  it('a list longer than the cache settles: the first 256 are looked up, the rest stay pending, and nothing is asked again', async () => {
    const { calls, renders, view } = crowd((_, n) => (n % 7 === 6 ? null : 'FR'));
    const list = Array.from({ length: 400 }, (_, i) => ipAt(1, i));
    const h = view(list);
    await waitFor(() => expect(h.result.current.filter((x) => x.s === 'pending').length).toBe(400 - 256), { timeout: 5000 });
    await quiet();
    const asked = calls.length;
    await quiet();
    expect(calls.length).toBe(asked);
    expect(calls.length).toBeLessThanOrEqual(Math.ceil(256 / 25));
    expect(calls.flat()).toEqual(list.slice(0, 256));
    expect(renders.n).toBeLessThan(100);
    expect(h.result.current.slice(256).every((x) => x.s === 'pending')).toBe(true);
  });

  it('scrolling to new addresses with no country, onto a full cache, settles on them and does not ask again', async () => {
    const { calls, renders, view } = crowd((ip) => (ip.startsWith('93.2.') ? null : 'FR'));
    const first = Array.from({ length: 256 }, (_, i) => ipAt(1, i));
    const h = view(first);
    await waitFor(() => expect(h.result.current.every((x) => x.s === 'known')).toBe(true), { timeout: 5000 });
    const next = Array.from({ length: 30 }, (_, i) => ipAt(2, i));
    h.rerender({ l: next });
    await waitFor(() => expect(h.result.current.every((x) => x.s === 'unknown')).toBe(true), { timeout: 5000 });
    await quiet();
    const asked = calls.length;
    await quiet();
    expect(calls.length).toBe(asked);
    expect(asked).toBeLessThanOrEqual(Math.ceil(256 / 25) + 2);
    expect(renders.n).toBeLessThan(100);
  });
});
