// Vitest: the list asks the platform for the countries of the rows it draws, and only those, on the real core (booted tab,
// fake fetch): a flag and a code appear for a known country, a scroll asks for the rows it brings into view, and rows
// whose address is never looked up (private, or a source without addresses) cost no call.
import { boot, calls, onFetch, settle } from '@core/test/env';
import { cleanup, fireEvent, render, screen, waitFor } from '@app/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Snapshot } from './controller';
import { DEFAULT_VIEW, type DataItem } from './logic';
import { LogList } from './parts/LogList';
import type { Source } from './rules';
import strings from './strings.en.json';

const table = strings as Record<string, string>;
const t = ((k: string, o?: Record<string, unknown>) => (table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

// Each test uses its own block of addresses: ipGeo keeps what it learned across tests of this file.
const ipOf = (n: number, block = 184) => `93.${block}.${Math.floor(n / 250) + 1}.${(n % 250) + 1}`;
const visit = (n: number, ip: string): DataItem => ({
  kind: 'kit', k: `k${n}`, t: 1_700_000_000_000 - n * 1000, id: n,
  row: { id: n, serviceName: 'files', method: 'GET', url: '/files/a.txt', status: 200, durationMs: 12, clientIp: ip },
});
const snap = (items: DataItem[], source: Source): Snapshot => ({ v: { ...DEFAULT_VIEW, source }, items, loading: false, newCount: 0, moreOlder: false, moreNewer: false, liveOn: false, olderBusy: false, jump: 0 } as unknown as Snapshot);
const props = { t, selected: undefined, onSelect: () => {}, onOlder: () => {}, onNewer: () => {}, onJump: () => {}, onReading: () => {}, active: undefined, onActive: () => {} };

const lookups = () => calls.filter((c) => c.url.includes('/ip/lookup'));
const asked = () => lookups().flatMap((c) => (new URL(c.url, 'https://api.test').searchParams.get('ip') ?? '').split(',').filter(Boolean));
// A country for every address but those ending in 7 (the platform holds none for them).
const platform = () => onFetch((c) => {
  const ips = (new URL(c.url, 'https://api.test').searchParams.get('ip') ?? '').split(',').filter(Boolean);
  return { status: 200, body: { statusCode: 200, message: 'ok', data: Object.fromEntries(ips.map((ip) => [ip, ip.endsWith('7') ? null : { ip, country: 'FR' }])) } };
});

describe('LogList visitor countries', () => {
  beforeEach(() => { boot(); platform(); });
  afterEach(cleanup);

  it('asks for the countries of the drawn rows only, in batches of at most 25, and shows a flag and a code for a known one', async () => {
    const items = Array.from({ length: 300 }, (_, i) => visit(i, ipOf(i)));
    const { container } = render(<LogList {...props} snap={snap(items, 'visits')} />);
    await waitFor(() => expect(container.querySelector('[role="img"][aria-label="From France"]')).toBeTruthy(), { timeout: 5000 });
    await settle();
    const drawn = new Set(Array.from(container.querySelectorAll('button[data-key]')).map((b) => ipOf(Number((b as HTMLElement).dataset.key!.slice(1)))));
    expect(drawn.size).toBeGreaterThan(10);
    expect(drawn.size).toBeLessThan(100);
    expect(asked().length).toBeGreaterThan(0);
    for (const ip of asked()) expect(drawn.has(ip)).toBe(true);
    for (const c of lookups()) expect((new URL(c.url, 'https://api.test').searchParams.get('ip') ?? '').split(',').length).toBeLessThanOrEqual(25);
    expect(screen.getAllByText('FR').length).toBeGreaterThan(5);
    // The first row's cell: flag slot, address, code.
    const first = container.querySelector('button[data-key="k0"]') as HTMLElement;
    expect(first.children[4]?.textContent).toBe(`🇫🇷${ipOf(0)}FR`);
  });

  it('an address the platform holds no country for stays bare, with the hover note', async () => {
    const { container } = render(<LogList {...props} snap={snap([visit(1, '93.184.216.7'), visit(2, '93.184.216.8')], 'visits')} />);
    await waitFor(() => expect(container.querySelector('button[data-key="k2"] [role="img"]')).toBeTruthy(), { timeout: 5000 });
    const bare = container.querySelector('button[data-key="k1"]') as HTMLElement;
    expect(bare.children[4]?.textContent).toBe('93.184.216.7');
    expect(bare.querySelector('[title="Country unknown"]')).toBeTruthy();
    expect(bare.querySelector('[role="img"]')).toBeNull();
  });

  it('a scroll asks for the rows it brings into view, and not for rows that were never drawn', async () => {
    const items = Array.from({ length: 600 }, (_, i) => visit(i, ipOf(i, 185)));
    const { container } = render(<LogList {...props} snap={snap(items, 'visits')} />);
    await waitFor(() => expect(asked().length).toBeGreaterThan(0), { timeout: 5000 });
    await settle();
    expect(asked()).not.toContain(ipOf(500, 185));
    const box = container.querySelector('[role="region"]') as HTMLElement;
    fireEvent.scroll(box, { target: { scrollTop: 500 * 32 } });
    await waitFor(() => expect(asked()).toContain(ipOf(500, 185)), { timeout: 5000 });
    expect(asked()).not.toContain(ipOf(300, 185));
  });

  it('private and reserved addresses, and a source with no addresses, cost no call', async () => {
    render(<LogList {...props} snap={snap([visit(1, '10.0.0.4'), visit(2, '203.0.113.7'), visit(3, '192.168.1.9')], 'visits')} />);
    await settle();
    expect(lookups()).toHaveLength(0);
    cleanup();
    render(<LogList {...props} snap={snap([visit(4, '93.184.216.50')], 'helper')} />);
    await settle();
    expect(lookups()).toHaveLength(0);
  });
});
