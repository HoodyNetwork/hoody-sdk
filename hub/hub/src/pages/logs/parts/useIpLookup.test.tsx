// Vitest: the hook that gives the list the countries of the addresses it shows (parts/useIpLookup.ts), on a real ipGeo
// with a fake lookup. It asks for the addresses it is given, once, and re-renders when the answer lands.
import { createIpGeo, type GeoState, type IpGeo } from '@core';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useIpLookup } from './useIpLookup';

const GIVEN = { '8.8.8.8': 'US', '1.1.1.1': 'AU', '9.9.9.9': null, '4.4.4.4': 'DE' } as Record<string, string | null>;

function world() {
  const calls: string[][] = [];
  const geo: IpGeo = createIpGeo({
    fetch: async (ips) => {
      calls.push([...ips]);
      return { data: Object.fromEntries(ips.map((ip) => [ip, GIVEN[ip] ? { ip, country: GIVEN[ip] } : null])) };
    },
    account: () => 'u1',
    store: () => null,
  });
  return { geo, calls };
}

const states = (ips: readonly string[], geo: IpGeo) => renderHook(({ list }: { list: readonly string[] }) => {
  const of = useIpLookup(list, geo);
  return list.map((ip) => of(ip));
}, { initialProps: { list: ips } });

const sOf = (r: GeoState[]) => r.map((x) => x.s);

describe('useIpLookup', () => {
  it('reads pending first, asks once for the addresses it was given, and re-renders with the answer', async () => {
    const { geo, calls } = world();
    const h = states(['8.8.8.8', '1.1.1.1', '9.9.9.9'], geo);
    expect(sOf(h.result.current)).toEqual(['pending', 'pending', 'pending']);
    await waitFor(() => expect(sOf(h.result.current)).toEqual(['known', 'known', 'unknown']));
    expect(h.result.current[0]).toEqual({ s: 'known', ip: '8.8.8.8', country: 'US' });
    expect(calls).toEqual([['8.8.8.8', '1.1.1.1', '9.9.9.9']]);
  });

  it('asks for nothing it must not look up: private, reserved, IPv6 and text read as skip and no call is made', async () => {
    const { geo, calls } = world();
    const h = states(['10.0.0.1', '203.0.113.7', '2001:db8::1', 'not an address'], geo);
    expect(sOf(h.result.current)).toEqual(['skip', 'skip', 'skip', 'skip']);
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toEqual([]);
  });

  it('a list that grows (a scroll) asks only for the new address; an empty list asks for nothing', async () => {
    const { geo, calls } = world();
    const h = states([], geo);
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toEqual([]);
    h.rerender({ list: ['8.8.8.8'] });
    await waitFor(() => expect(sOf(h.result.current)).toEqual(['known']));
    h.rerender({ list: ['8.8.8.8', '4.4.4.4'] });
    await waitFor(() => expect(sOf(h.result.current)).toEqual(['known', 'known']));
    expect(calls).toEqual([['8.8.8.8'], ['4.4.4.4']]);
  });
});
