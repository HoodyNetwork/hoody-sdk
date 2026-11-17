// The Bare metal band's price and ranges come only from one
// whole market read, both rails answered clean in the same read cycle. A rail read again alone (its own refetch) never
// joins the other rail's older answer: the band says only what bare metal is until the other rail has answered again
// (the band reads it again itself), and a cycle whose other rail fails shows no facts. Through the real core queries and
// the page's own selectors, rails refreshed independently (no mocked answeredAt). Answers are told
// apart by identity, never by the clock (the same millisecond, a clock stepping back), and a mount's cached answers are
// never a pair before both rails answered since that mount (a mount read paused offline). A companion read
// cancelled back to its cached answer is not an answer; a failed read then an identical retry is one.
// eslint-disable-next-line no-restricted-imports -- a test harness for the hooks, not page code
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@core/query';
import { boot, calls, onFetch, settle, type Call, type Reply } from '@core/test/env';
import { envelope, offerRaw, stockRaw } from '@core/test/commerce-env';
import { BareBand, useBareFacts } from './parts/PlansExtras';
import { nextPair, type RailAnswer, railsToRead } from './servers/data';
import type * as Kit from '@kit';
import type { T } from './parts/Bits';

// Every render of the band's card (its rows), settled or not: a mixed read must never render, not even for one frame
// before the band reads the other rail again.
const seen = vi.hoisted(() => [] as string[]);
vi.mock('@kit', async (importOriginal) => {
  const kit = await importOriginal<typeof Kit>();
  return {
    ...kit,
    PlanCard: (p: Parameters<typeof kit.PlanCard>[0]) => {
      seen.push((p.rows ?? []).map((i) => `${String(i.label)}=${String(i.value)}`).join('|'));
      return createElement(kit.PlanCard, p);
    },
  };
});
/** Whether any render showed these cores (a mixed read's range). */
const rendered = (coresText: string): boolean => seen.some((x) => x.includes(`plans.bareCores=${coresText}`));

const t = ((k: string, v?: Record<string, unknown>) => (v ? `${k} ${JSON.stringify(v)}` : k)) as unknown as T;

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await settle();
};

const isStock = (c: Call) => c.url.includes('/servers/available');
const isOffers = (c: Call) => /\/offers(\?|$)/.test(c.url);
const stockRow = (price: string, cores: number) =>
  stockRaw({ pricing: { prices: { '30': price }, setup_fee: '0.00', setup_fee_cents: 0, price_tiers: { '30': { price, hold_days: 1, total_first_payment: price } } }, specs: { cpu: { model: 'Xeon', cores }, ram: { capacity_gb: 32 }, disks: { total_gb: 500 }, network: {}, additional: { ipv4_count: 1 } } });
const offerRow = (cents: number, cores: number) => offerRaw({ cpu_cores: cores, pricing_rules: { '30': cents }, hold_rules: { '30': 2 } });

interface Rail {
  reply: () => Reply | Promise<Reply>;
}
const stock: Rail = { reply: () => ({ status: 200, body: envelope([]) }) };
const offers: Rail = { reply: () => ({ status: 200, body: envelope([]) }) };

/** The band over its own market read, as the Plans view mounts it: one useBareFacts for the screen. */
function Band() {
  const facts = useBareFacts();
  return <BareBand t={t} open={() => undefined} facts={facts} />;
}

/** Mount the band; `fresh` starts from an empty cache (else the cache of the last mount stays). */
async function mount(fresh = true): Promise<() => void> {
  if (fresh) {
    boot();
    queryClient.clear();
  }
  onFetch((c) => (isStock(c) ? stock.reply() : isOffers(c) ? offers.reply() : { status: 200, body: envelope([]) }));
  const r = render(
    <QueryClientProvider client={queryClient}>
      <Band />
    </QueryClientProvider>,
  );
  await act(flush);
  return () => r.unmount();
}

/** The "from" fact's text, or null when the band shows no facts. */
const from = (): string | null => screen.queryByText(/^plans\.bareFrom /)?.textContent ?? null;
/** The cores range shown, or null when the band shows no cores fact. */
const cores = (): string | null => {
  const label = screen.queryByText('plans.bareCores');
  return label ? (label.parentElement?.textContent ?? '').replace('plans.bareCores', '') : null;
};

/** Read one rail again alone, as its own refetch would (another view or an invalidation of that read only). */
async function refreshOnly(rail: 'stock' | 'offers'): Promise<void> {
  await act(async () => {
    await queryClient.refetchQueries({ type: 'all', predicate: (q) => q.queryKey.includes('market') && q.queryKey.includes(rail) });
    await flush();
  });
}

const deferred = () => {
  let open!: (r: Reply) => void;
  const p = new Promise<Reply>((res) => {
    open = res;
  });
  return { p, open };
};

let unmount: () => void = () => undefined;
afterEach(() => {
  unmount();
  seen.length = 0;
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
  queryClient.clear();
});

describe('the Bare metal band reads one whole market read', () => {
  it('first whole read: both rails clean, the price and ranges show', async () => {
    stock.reply = () => ({ status: 200, body: envelope([stockRow('40.00', 8)]) });
    offers.reply = () => ({ status: 200, body: envelope([offerRow(9000, 64)]) });
    unmount = await mount();
    expect(from()).toContain('"$40"');
    expect(cores()).toBe('8–64');
    // The recorder sees what the band renders.
    expect(rendered('8–64')).toBe(true);
  });

  it('stock read again alone: never mixed with the older offers answer; the band reads offers again, then shows the new pair', async () => {
    stock.reply = () => ({ status: 200, body: envelope([stockRow('40.00', 8)]) });
    offers.reply = () => ({ status: 200, body: envelope([offerRow(9000, 64)]) });
    unmount = await mount();
    expect(from()).toContain('"$40"');
    const offersBefore = calls.filter(isOffers).length;
    const held = deferred();
    stock.reply = () => ({ status: 200, body: envelope([stockRow('20.00', 4)]) });
    offers.reply = () => held.p;
    await refreshOnly('stock');
    // New stock beside the old offers answer is not one read: no price, no ranges, not even for one render.
    expect(from()).toBeNull();
    expect(cores()).toBeNull();
    expect(rendered('4–64')).toBe(false);
    // The band read offers again to finish the cycle.
    expect(calls.filter(isOffers).length).toBe(offersBefore + 1);
    await act(async () => {
      held.open({ status: 200, body: envelope([offerRow(5000, 32)]) });
      await flush();
    });
    expect(from()).toContain('"$20"');
    expect(cores()).toBe('4–32');
    expect(rendered('4–64')).toBe(false);
  });

  it('offers read again alone: the same, the band reads stock again before it shows anything', async () => {
    stock.reply = () => ({ status: 200, body: envelope([stockRow('40.00', 8)]) });
    offers.reply = () => ({ status: 200, body: envelope([offerRow(9000, 64)]) });
    unmount = await mount();
    const stockBefore = calls.filter(isStock).length;
    const held = deferred();
    offers.reply = () => ({ status: 200, body: envelope([offerRow(3000, 16)]) });
    stock.reply = () => held.p;
    await refreshOnly('offers');
    expect(from()).toBeNull();
    expect(rendered('8–16')).toBe(false);
    expect(calls.filter(isStock).length).toBe(stockBefore + 1);
    await act(async () => {
      held.open({ status: 200, body: envelope([stockRow('60.00', 2)]) });
      await flush();
    });
    expect(from()).toContain('"$30"');
    expect(cores()).toBe('2–16');
    expect(rendered('8–16')).toBe(false);
  });

  it('a cycle whose other rail fails: no facts, never the older answer', async () => {
    stock.reply = () => ({ status: 200, body: envelope([stockRow('40.00', 8)]) });
    offers.reply = () => ({ status: 200, body: envelope([offerRow(9000, 64)]) });
    unmount = await mount();
    stock.reply = () => ({ status: 200, body: envelope([stockRow('20.00', 4)]) });
    offers.reply = () => ({ status: 500, body: { statusCode: 500, message: 'down' } });
    await refreshOnly('stock');
    await act(flush);
    expect(from()).toBeNull();
    expect(cores()).toBeNull();
    expect(rendered('4–64')).toBe(false);
  });
});

describe('answers told apart by identity, never by the clock', () => {
  it('every answer in the same millisecond: stock read again alone is still not a pair with the old offers', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    stock.reply = () => ({ status: 200, body: envelope([stockRow('40.00', 8)]) });
    offers.reply = () => ({ status: 200, body: envelope([offerRow(9000, 64)]) });
    unmount = await mount();
    expect(from()).toContain('"$40"');
    const held = deferred();
    stock.reply = () => ({ status: 200, body: envelope([stockRow('20.00', 4)]) });
    offers.reply = () => held.p;
    await refreshOnly('stock');
    expect(from()).toBeNull();
    await act(async () => {
      held.open({ status: 200, body: envelope([offerRow(5000, 32)]) });
      await flush();
    });
    expect(from()).toContain('"$20"');
    expect(cores()).toBe('4–32');
    expect(rendered('4–64')).toBe(false);
  });

  it('the clock steps back: a later answer with an earlier stamp still counts as a new answer', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    stock.reply = () => ({ status: 200, body: envelope([stockRow('40.00', 8)]) });
    offers.reply = () => ({ status: 200, body: envelope([offerRow(9000, 64)]) });
    unmount = await mount();
    now.mockReturnValue(1_799_999_000_000);
    const held = deferred();
    stock.reply = () => ({ status: 200, body: envelope([stockRow('20.00', 4)]) });
    offers.reply = () => held.p;
    await refreshOnly('stock');
    expect(from()).toBeNull();
    await act(async () => {
      held.open({ status: 200, body: envelope([offerRow(5000, 32)]) });
      await flush();
    });
    expect(from()).toContain('"$20"');
    expect(cores()).toBe('4–32');
    expect(rendered('4–64')).toBe(false);
  });

  it('the rail read again repeats its pair answer exactly, same data and millisecond: one read, no loop, no facts (fails closed)', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    stock.reply = () => ({ status: 200, body: envelope([stockRow('40.00', 8)]) });
    offers.reply = () => ({ status: 200, body: envelope([offerRow(9000, 64)]) });
    unmount = await mount();
    const offersBefore = calls.filter(isOffers).length;
    stock.reply = () => ({ status: 200, body: envelope([stockRow('20.00', 4)]) });
    await refreshOnly('stock');
    await act(flush);
    // Indistinguishable from a read cancelled back to its cache: never certified, and asked once only.
    expect(calls.filter(isOffers).length).toBe(offersBefore + 1);
    expect(from()).toBeNull();
    expect(rendered('4–64')).toBe(false);
  });

  it('the companion read is cancelled back to its cached answer: not an answer, no facts; a later answer of its own shows', async () => {
    stock.reply = () => ({ status: 200, body: envelope([stockRow('40.00', 8)]) });
    offers.reply = () => ({ status: 200, body: envelope([offerRow(9000, 64)]) });
    unmount = await mount();
    stock.reply = () => ({ status: 200, body: envelope([stockRow('20.00', 4)]) });
    offers.reply = () => deferred().p;
    await refreshOnly('stock');
    await act(async () => {
      await queryClient.cancelQueries({ predicate: (q) => q.queryKey.includes('market') && q.queryKey.includes('offers') });
      await flush();
    });
    expect(from()).toBeNull();
    expect(rendered('4–64')).toBe(false);
    offers.reply = () => ({ status: 200, body: envelope([offerRow(5000, 32)]) });
    await refreshOnly('offers');
    expect(from()).toContain('"$20"');
    expect(cores()).toBe('4–32');
    expect(rendered('4–64')).toBe(false);
  });

  it('the companion read fails, then offers is retried on its own with the same content and millisecond: one read, the pair shows', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    stock.reply = () => ({ status: 200, body: envelope([stockRow('40.00', 8)]) });
    offers.reply = () => ({ status: 200, body: envelope([offerRow(9000, 64)]) });
    unmount = await mount();
    stock.reply = () => ({ status: 200, body: envelope([stockRow('20.00', 4)]) });
    offers.reply = () => ({ status: 500, body: { statusCode: 500, message: 'down' } });
    await refreshOnly('stock');
    await act(flush);
    expect(from()).toBeNull();
    offers.reply = () => ({ status: 200, body: envelope([offerRow(9000, 64)]) });
    await refreshOnly('offers');
    // The failure between proves this clean offers answer came after the new stock: one read.
    expect(from()).toContain('"$20"');
    expect(cores()).toBe('4–64');
  });
});

describe('a mount never pairs cached answers', () => {
  it('cached rails updated apart, the mount read paused offline: no facts; back online, the new whole read shows', async () => {
    stock.reply = () => ({ status: 200, body: envelope([stockRow('40.00', 8)]) });
    offers.reply = () => ({ status: 200, body: envelope([offerRow(9000, 64)]) });
    unmount = await mount();
    unmount();
    unmount = () => undefined;
    // While nothing shows the band, stock alone is read again: the cache now holds new stock beside old offers.
    stock.reply = () => ({ status: 200, body: envelope([stockRow('20.00', 4)]) });
    await refreshOnly('stock');
    seen.length = 0;
    onlineManager.setOnline(false);
    unmount = await mount(false);
    expect(from()).toBeNull();
    // No fact of a market read, not even for one frame: every render held only the two rows that need no read.
    expect([...new Set(seen)]).toEqual(['plans.hardware=[object Object]|plans.regions=plans.regionsBare']);
    offers.reply = () => ({ status: 200, body: envelope([offerRow(5000, 32)]) });
    await act(async () => {
      onlineManager.setOnline(true);
      await flush();
    });
    expect(from()).toContain('"$20"');
    expect(cores()).toBe('4–32');
    expect(rendered('4–64')).toBe(false);
  });
});

const ans = (at: number, data: unknown, mounted = true, errors = 0): RailAnswer => ({ at, data, errors, mounted });

describe('nextPair and railsToRead (the read cycle, pure)', () => {
  const S1 = ['s1'];
  const O1 = ['o1'];
  const S2 = ['s2'];
  const O2 = ['o2'];
  it('no pair until both rails answered clean since mount; then the first pair', () => {
    expect(nextPair(null, null, ans(5, O1))).toBeNull();
    expect(nextPair(null, ans(5, S1), null)).toBeNull();
    expect(nextPair(null, ans(5, S1, false), ans(6, O1))).toBeNull();
    expect(nextPair(null, ans(5, S1), ans(6, O1, false))).toBeNull();
    expect(nextPair(null, ans(5, S1), ans(6, O1))).toEqual({ stock: ans(5, S1), offers: ans(6, O1) });
  });
  it('a new pair only when both rails answered again: by stamp, data or a failure between; any order of the clock', () => {
    const p = { stock: ans(5, S1), offers: ans(6, O1) };
    expect(nextPair(p, ans(5, S1), ans(6, O1))).toBe(p);
    expect(nextPair(p, ans(9, S2), ans(6, O1))).toBe(p);
    expect(nextPair(p, ans(5, S2), ans(6, O1))).toBe(p);
    expect(nextPair(p, ans(5, S2), ans(6, O2))).toEqual({ stock: ans(5, S2), offers: ans(6, O2) });
    expect(nextPair(p, ans(1, S1), ans(2, O1))).toEqual({ stock: ans(1, S1), offers: ans(2, O1) });
    expect(nextPair(p, ans(5, S2), ans(6, O1, true, 1))).toEqual({ stock: ans(5, S2), offers: ans(6, O1, true, 1) });
    expect(nextPair(p, null, ans(9, O2))).toBe(p);
  });
  it('railsToRead: the rail still on the pair; before a pair, rails not answered since mount; none otherwise', () => {
    const p = { stock: ans(5, S1), offers: ans(6, O1) };
    expect(railsToRead(p, ans(9, S2), ans(6, O1))).toEqual(['offers']);
    expect(railsToRead(p, ans(5, S1), ans(9, O2))).toEqual(['stock']);
    expect(railsToRead(p, ans(5, S1), ans(6, O1))).toEqual([]);
    expect(railsToRead(p, ans(9, S2), ans(9, O2))).toEqual([]);
    expect(railsToRead(p, ans(9, S2), ans(6, O1, true, 1))).toEqual([]);
    expect(railsToRead(p, ans(9, S2), null)).toEqual([]);
    expect(railsToRead(null, ans(5, S1, false), ans(6, O1))).toEqual(['stock']);
    expect(railsToRead(null, ans(5, S1, false), ans(6, O1, false))).toEqual(['stock', 'offers']);
    expect(railsToRead(null, ans(5, S1), ans(6, O1))).toEqual([]);
    expect(railsToRead(null, null, ans(6, O1, false))).toEqual([]);
  });
});
