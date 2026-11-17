// The screen's one market read for the Bare metal facts (BareFactsRead) belongs to the account and realm shown. After
// a realm switch or another account, the band and every other reader of that read show no price and no range of the
// read before, not for one render, until the new context's own read is whole. Through the real core queries: the read's
// identity names the account and the realm, so the answers of the one before are never the ones shown.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hooks, not page code
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bump, setIdentity, setRealm } from '@core/ctx';
import { queryClient } from '@core/query';
import { boot, deferred, onFetch, OTHER, R1, R2, settle, signIn, UID, type Call, type Reply } from '@core/test/env';
import { envelope, offerRaw, stockRaw } from '@core/test/commerce-env';
import { BareBand, type BareFactsCell, BareFactsRead, useBareFactsCell, useReadBareFacts } from './parts/PlansExtras';
import type * as Kit from '@kit';
import type { T } from './parts/Bits';

// Every render of the band's card and of the second reader, settled or not.
const seen = vi.hoisted(() => ({ band: [] as string[], other: [] as string[] }));
vi.mock('@kit', async (importOriginal) => {
  const kit = await importOriginal<typeof Kit>();
  return {
    ...kit,
    PlanCard: (p: Parameters<typeof kit.PlanCard>[0]) => {
      seen.band.push(`${String(p.price)}|${(p.rows ?? []).map((i) => `${String(i.label)}=${String(i.value)}`).join('|')}`);
      return createElement(kit.PlanCard, p);
    },
  };
});

const t = ((k: string, v?: Record<string, unknown>) => (v ? `${k} ${JSON.stringify(v)}` : k)) as unknown as T;
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};
const isStock = (c: Call) => c.url.includes('/servers/available');
const isOffers = (c: Call) => /\/offers(\?|$)/.test(c.url);
const stockRow = (price: string, cores: number) =>
  stockRaw({ pricing: { prices: { '30': price }, setup_fee: '0.00', setup_fee_cents: 0, price_tiers: { '30': { price, hold_days: 1, total_first_payment: price } } }, specs: { cpu: { model: 'Xeon', cores }, ram: { capacity_gb: 32 }, disks: { total_gb: 500 }, network: {}, additional: { ipv4_count: 1 } } });
const offerRow = (cents: number, cores: number) => offerRaw({ cpu_cores: cores, pricing_rules: { '30': cents }, hold_rules: { '30': 2 } });

const rails = { stock: (): Reply | Promise<Reply> => ({ status: 200, body: envelope([]) }), offers: (): Reply | Promise<Reply> => ({ status: 200, body: envelope([]) }) };

/** A second reader of the screen's read, as the Compare plans table is. */
function Other({ cell }: { cell: BareFactsCell }) {
  const f = useReadBareFacts(cell);
  seen.other.push(JSON.stringify(f));
  return <output data-testid="other">{JSON.stringify(f)}</output>;
}
function Band({ cell }: { cell: BareFactsCell }) {
  return <BareBand t={t} open={() => undefined} facts={useReadBareFacts(cell)} />;
}
/** The read and its two readers over one cell, as the Plans tab mounts them. */
function Screen() {
  const cell = useBareFactsCell();
  return (
    <>
      <BareFactsRead cell={cell} />
      <Band cell={cell} />
      <Other cell={cell} />
    </>
  );
}

let unmount: () => void = () => undefined;
async function mount(): Promise<void> {
  boot({ realm: R1 });
  queryClient.clear();
  onFetch((c) => (isStock(c) ? rails.stock() : isOffers(c) ? rails.offers() : { status: 200, body: envelope([]) }));
  const r = render(
    <QueryClientProvider client={queryClient}>
      <Screen />
    </QueryClientProvider>,
  );
  unmount = () => r.unmount();
  await act(flush);
}
afterEach(() => {
  unmount();
  seen.band.length = 0;
  seen.other.length = 0;
  queryClient.clear();
});

const from = (): string | null => screen.queryByText(/^plans\.bareFrom /)?.textContent ?? null;
const other = (): string => screen.getByTestId('other').textContent ?? '';
/** The market reads mounted now, by their identity. */
const marketReads = (): string[] =>
  queryClient
    .getQueryCache()
    .findAll({ predicate: (q) => q.getObserversCount() > 0 && q.queryKey.includes('market') })
    .map((q) => q.queryHash)
    .sort();
const anyRenderWith = (text: string): boolean => [...seen.band, ...seen.other].some((x) => x.includes(text));

// `reads`: this tab goes on reading as the new context (a realm switch). Another account ends this tab's session: its
// reads are not sent, and the page shows nothing of the account before until it is loaded again.
const switches: [string, () => void, (hash: string) => boolean, boolean][] = [
  [
    'a realm switch',
    () => {
      setRealm(R2);
      bump('switch');
    },
    (h) => h.includes(R2) && !h.includes(R1),
    true,
  ],
  [
    'another account',
    () => {
      signIn(OTHER, 'sid0000000000002');
      setIdentity({ id: OTHER, banned: false });
      bump('account');
    },
    (h) => h.includes(OTHER) && !h.includes(UID),
    false,
  ],
];

describe.each(switches)("the screen's market read after %s", (_name, doSwitch, namesNew, reads) => {
  it('shows nothing of the read before while the new one is on its way, then only the new answers', async () => {
    rails.stock = () => ({ status: 200, body: envelope([stockRow('40.00', 8)]) });
    rails.offers = () => ({ status: 200, body: envelope([offerRow(9000, 64)]) });
    await mount();
    expect(from()).toContain('"$40"');
    expect(other()).not.toBe('null');
    const before = marketReads();
    expect(before).toHaveLength(2);

    const s = deferred<Reply>();
    const o = deferred<Reply>();
    rails.stock = () => s.p;
    rails.offers = () => o.p;
    seen.band.length = 0;
    seen.other.length = 0;
    await act(async () => {
      doSwitch();
      await flush();
    });
    // The new context's reads are other reads: not one identity of the read before is still mounted.
    const after = marketReads();
    expect(after).toHaveLength(2);
    for (const h of after) {
      expect(before).not.toContain(h);
      expect(namesNew(h)).toBe(true);
    }
    // No price and no range of the read before, in the band or the second reader, in any render since the switch.
    expect(from()).toBeNull();
    expect(other()).toBe('null');
    expect(anyRenderWith('$40')).toBe(false);
    expect(anyRenderWith('8–64')).toBe(false);
    expect(seen.other.every((x) => x === 'null')).toBe(true);

    // One rail of the new context answered: still nothing (never joined with the other rail's answer of the read before).
    await act(async () => {
      s.res({ status: 200, body: envelope([stockRow('20.00', 4)]) });
      await flush();
    });
    expect(from()).toBeNull();
    expect(anyRenderWith('64')).toBe(false);
    await act(async () => {
      o.res({ status: 200, body: envelope([offerRow(5000, 32)]) });
      await flush();
    });
    if (reads) {
      expect(from()).toContain('"$20"');
      expect(other()).toContain('32');
    } else {
      expect(from()).toBeNull();
      expect(other()).toBe('null');
    }
    expect(anyRenderWith('$40')).toBe(false);
    expect(anyRenderWith('8–64')).toBe(false);
  });
});
