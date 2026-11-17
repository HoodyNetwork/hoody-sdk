// ipgeo.adapter.test.ts: the shipped ipGeo instance on the real core (booted tab, fake fetch): it reads its account where
// the store does (capture().account) and only while that context is alive, sends GET /ip/lookup with the canonical
// addresses, and keeps the answer in the one registered session key under that account.
import { describe, expect, it } from 'vitest';
import { setIdentity, startLoggingOut } from './ctx';
import { ipGeo } from './ipgeo';
import { calls, boot, onFetch, settle, OTHER, UID } from './test/env';

const answer = (m: Record<string, string | null>) => ({ status: 200, body: { statusCode: 200, message: 'ok', data: Object.fromEntries(Object.entries(m).map(([ip, c]) => [ip, c === null ? null : { ip, country: c }])) } });
const lookups = () => calls.filter((c) => c.url.includes('/ip/lookup'));

describe('the shipped ipGeo instance', () => {
  it('asks GET /ip/lookup with the canonical addresses, reads the answer, and keeps it in the registered key under the account', async () => {
    boot();
    onFetch(() => answer({ '8.8.8.8': 'US' }));
    expect(ipGeo.version()).toBeGreaterThanOrEqual(0);
    ipGeo.want(['::ffff:8.8.8.8', '10.0.0.1', 'nope']);
    await settle();
    expect(lookups().length).toBe(1);
    expect(lookups()[0]!.method).toBe('GET');
    expect(new URL(lookups()[0]!.url, 'https://api.test').pathname).toBe('/api/v1/ip/lookup');
    expect(new URL(lookups()[0]!.url, 'https://api.test').searchParams.get('ip')).toBe('8.8.8.8');
    expect(ipGeo.peek('8.8.8.8')).toEqual({ s: 'known', ip: '8.8.8.8', country: 'US' });
    const stored = JSON.parse(sessionStorage.getItem('hub_ip_geo_v1') as string) as { v: number; a: Record<string, Record<string, unknown>> };
    expect(Object.keys(stored.a)).toEqual([UID]);
    expect(Object.keys(stored.a[UID] as object)).toEqual(['8.8.8.8']);
    expect(localStorage.getItem('hub_ip_geo_v1')).toBeNull();
  });
  it('a context whose shown account no longer matches the stored session, or that is closing, reads as signed out and sends nothing', async () => {
    boot();
    onFetch(() => answer({ '1.1.1.1': 'AU' }));
    ipGeo.want(['1.1.1.1']);
    await settle();
    expect(ipGeo.peek('1.1.1.1')).toEqual({ s: 'known', ip: '1.1.1.1', country: 'AU' });
    const before = lookups().length;
    setIdentity({ id: OTHER, banned: false }); // the page still shows another account than the stored session holds
    expect(ipGeo.peek('1.1.1.1')).toEqual({ s: 'skip' });
    ipGeo.want(['4.4.4.4']);
    await settle();
    expect(lookups().length).toBe(before);
    setIdentity({ id: UID, banned: false });
    startLoggingOut();
    expect(ipGeo.peek('1.1.1.1')).toEqual({ s: 'skip' });
    ipGeo.want(['4.4.4.4']);
    await settle();
    expect(lookups().length).toBe(before);
  });
});
