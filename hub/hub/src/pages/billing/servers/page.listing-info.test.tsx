// Vitest: everything a bare-metal listing says is shown before paying. Every field GET /servers/available
// and GET /offers return for a row is mapped below to the words the inspector shows, or to the reason it is not shown;
// a field the row leaves out reads "Not listed". Disk kind per disk group and the RAM type show on the row (the card
// at phone width), in the inspector and its order summary. Sizes of 1024 GB and up read in TB.
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- a test harness for the inspector alone, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { act, render, renderPage, screen, waitFor, within } from '@app/testing';
import { listingOf } from './data';
import page from '../page';
import { Detail, specFacts } from './parts/Detail';
import strings from './strings.en.json';
import { listingRules } from '@core';

/** The inspector alone, inside a router: its closing explanation ends with a link to the page FAQ. */
async function mount(el: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

// The words are core's listing facts (the very list Billing's checkout shows).
const W = listingRules.listingFactWords;
const NOT_LISTED = W['fact.notListed'];

/** A stock row with every field the API serializer writes. */
const RAW_STOCK = {
  id: '64b0c0ffee0000000000c001',
  name: 'Helsinki XL',
  country: 'FI',
  region: 'Uusimaa',
  city: 'Helsinki',
  datacenter: 'Example DC 1',
  model: 'AMD EPYC 9454P',
  is_vm: false,
  category: 'storage',
  featured: true,
  popularity_rank: 3,
  setup_time_minutes: 20,
  delivery_hours: 0,
  pricing: {
    prices: { '30': '149.00' },
    price_tiers: { '30': { price: '149.00', hold_days: 5, total_first_payment: '178.00' } },
    setup_fee: '29.00',
    setup_fee_cents: 2900,
  },
  specs: {
    cpu: { model: 'AMD EPYC 9454P', cores: 48, threads: 96, score: 71000, score_type: 'geekbench_multi' },
    ram: { capacity_gb: 384, type: 'DDR5 ECC', speed_mhz: 4800 },
    disks: {
      config: [
        { count: 2, capacity_gb: 1920, type: 'nvme', interface: 'PCIe', model: 'Samsung PM9A3' },
        { count: 4, capacity_gb: 16384, type: 'HDD', interface: 'SATA', model: 'Seagate Exos X16' },
      ],
      total_gb: 69376,
      summary: '2 x 1.92 TB NVMe + 4 x 16 TB HDD',
    },
    network: { bandwidth_mbps: 10000, bandwidth_formatted: '10 Gbit/s', traffic_tb: null, traffic_unlimited: true },
    additional: { ipv4_count: 2, ipv6_enabled: true },
  },
};

/**
 * Where each field shows: the exact words, or why it is not shown on its own. A field added to RAW_STOCK without a
 * row here fails the coverage test below.
 */
const STOCK_FIELDS: Record<string, { shows: string } | { reason: string }> = {
  id: { reason: 'opaque id: addresses the listing in links and the checkout, never shown' },
  name: { reason: 'the inspector title' },
  country: { shows: 'Example DC 1, Helsinki, Uusimaa, Finland' },
  region: { shows: 'Example DC 1, Helsinki, Uusimaa, Finland' },
  city: { shows: 'Example DC 1, Helsinki, Uusimaa, Finland' },
  datacenter: { shows: 'Example DC 1, Helsinki, Uusimaa, Finland' },
  model: { shows: 'AMD EPYC 9454P' },
  is_vm: { shows: W['value.whole'] },
  category: { shows: W['value.category.storage'] },
  featured: { reason: 'the Featured chip on the row' },
  popularity_rank: { reason: 'an order, not a fact: the API sends the rows in it and the Featured order keeps it' },
  setup_time_minutes: { reason: 'the delivery line under the specs ("set up in 20 minutes")' },
  delivery_hours: { reason: 'the delivery line and the place line under the title' },
  'pricing.prices.30': { reason: 'the same price as price_tiers.30.price, which the order summary shows' },
  'pricing.price_tiers.30.price': { reason: 'the order summary\'s rental line' },
  'pricing.price_tiers.30.hold_days': { reason: 'the hold line under the perks' },
  'pricing.price_tiers.30.total_first_payment': { reason: 'the term picker and the order summary\'s total' },
  'pricing.setup_fee': { reason: 'the order summary\'s setup line (the total minus the rental)' },
  'pricing.setup_fee_cents': { reason: 'the order summary\'s setup line (the total minus the rental)' },
  'specs.cpu.model': { reason: 'the top-level model wins (core\'s rule); this is its fallback' },
  'specs.cpu.cores': { shows: '48 cores · 96 threads' },
  'specs.cpu.threads': { shows: '48 cores · 96 threads' },
  'specs.cpu.score': { shows: '71,000' },
  'specs.cpu.score_type': { shows: W['fact.score.geekbench_multi'] },
  'specs.ram.capacity_gb': { shows: '384 GB' },
  'specs.ram.type': { shows: 'DDR5 ECC' },
  'specs.ram.speed_mhz': { shows: '4,800 MHz' },
  'specs.disks.config.0.count': { shows: '2 × 1.88 TB NVMe (PCIe, Samsung PM9A3)' },
  'specs.disks.config.0.capacity_gb': { shows: '2 × 1.88 TB NVMe (PCIe, Samsung PM9A3)' },
  'specs.disks.config.0.type': { shows: '2 × 1.88 TB NVMe (PCIe, Samsung PM9A3)' },
  'specs.disks.config.0.interface': { shows: '2 × 1.88 TB NVMe (PCIe, Samsung PM9A3)' },
  'specs.disks.config.0.model': { shows: '2 × 1.88 TB NVMe (PCIe, Samsung PM9A3)' },
  'specs.disks.config.1.count': { shows: '4 × 16 TB HDD (SATA, Seagate Exos X16)' },
  'specs.disks.config.1.capacity_gb': { shows: '4 × 16 TB HDD (SATA, Seagate Exos X16)' },
  'specs.disks.config.1.type': { shows: '4 × 16 TB HDD (SATA, Seagate Exos X16)' },
  'specs.disks.config.1.interface': { shows: '4 × 16 TB HDD (SATA, Seagate Exos X16)' },
  'specs.disks.config.1.model': { shows: '4 × 16 TB HDD (SATA, Seagate Exos X16)' },
  'specs.disks.total_gb': { shows: '67.75 TB' },
  'specs.disks.summary': { reason: 'the API\'s own wording of the disk groups, shown instead only when the row lists no groups' },
  'specs.network.bandwidth_mbps': { shows: '10 Gbit/s' },
  'specs.network.bandwidth_formatted': { reason: 'the same bandwidth, worded by the page' },
  'specs.network.traffic_tb': { reason: 'null here: unlimited traffic shows instead' },
  'specs.network.traffic_unlimited': { shows: W['value.unlimited'] },
  'specs.additional.ipv4_count': { shows: '2' },
  'specs.additional.ipv6_enabled': { reason: 'IPv6 is not part of Hoody: a listing never says whether it has it' },
};

/** Every leaf path of a value ("a.b.0.c"); arrays by index. */
function leaves(v: unknown, at = ''): string[] {
  if (v && typeof v === 'object') return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => leaves(x, at ? `${at}.${k}` : k));
  return [at];
}

const factValue = (facts: ReturnType<typeof specFacts>, key: keyof typeof W): unknown => facts.find((f) => f.label === W[key])?.value;

describe('every listing field', () => {
  it('each field of a stock row has a place it shows, or a reason it does not', () => {
    expect(leaves(RAW_STOCK).sort()).toEqual(Object.keys(STOCK_FIELDS).sort());
  });

  it('the inspector shows what each mapped field says', async () => {
    const l = listingOf('stock', RAW_STOCK, 0);
    await mount(() => <Detail listing={l} term={l.terms[0] ?? null} onDays={() => {}} />);
    for (const [field, where] of Object.entries(STOCK_FIELDS)) {
      if ('shows' in where) expect(screen.getAllByText(where.shows, { exact: true }).length, field).toBeGreaterThan(0);
    }
    // The order summary under the specs: the rental, the setup fee and the total, before anything is paid.
    expect(screen.getByText('$149')).toBeInTheDocument();
    expect(screen.getByText('$29')).toBeInTheDocument();
  });

  it('an offer row, which carries no RAM type, speed, machine kind or category, reads "Not listed" for each', () => {
    const l = listingOf('offer', { id: 'o9', name: 'O', cpu_model: 'AMD EPYC 7443P', cpu_cores: 24, ram_gb: 256, disks: [{ count: 2, capacity_gb: 3840, type: 'ssd' }], pricing_rules: { '30': 14900 }, setup_fee_cents: 0 }, 0);
    const facts = specFacts(l);
    for (const k of ['fact.ramType', 'fact.ramSpeed', 'fact.machine', 'fact.category', 'fact.bandwidth', 'fact.ipv4'] as const) expect(factValue(facts, k), k).toBe(NOT_LISTED);
    expect(factValue(facts, 'fact.disks')).toBe('2 × 3.75 TB SSD');
    expect(factValue(facts, 'fact.diskTotal')).toBe('7.5 TB');
    // The rail counts an offer's stock only when it is finite: null (unlimited) shows no count.
    expect(factValue(facts, 'fact.stockLeft')).toBeUndefined();
  });

  it('a disk group that names no kind or size says so; a lone group takes the kind its summary names', () => {
    const none = listingOf('stock', { id: 's', name: 'S', specs: { disks: { config: [{ count: 2 }], total_gb: null } } }, 0);
    expect(factValue(specFacts(none), 'fact.disks')).toBe(`2 × ${W['value.disk.sizeUnknown']} ${W['value.disk.typeUnknown']}`);
    expect(factValue(specFacts(none), 'fact.diskTotal')).toBe(NOT_LISTED);
    const fromSummary = listingOf('stock', { id: 's', name: 'S', specs: { disks: { config: [{ count: 1, capacity_gb: 480 }], total_gb: 480, summary: '1 x 480 GB SAS' } } }, 0);
    expect(factValue(specFacts(fromSummary), 'fact.disks')).toBe('480 GB SAS');
    const noGroups = listingOf('stock', { id: 's', name: 'S', specs: { disks: { total_gb: 2048, summary: '2 x 1 TB NVMe' } } }, 0);
    expect(factValue(specFacts(noGroups), 'fact.disks')).toBe('2 x 1 TB NVMe');
  });

  it('a virtual machine says so in words; IPv6, yes or no, is never a fact', () => {
    const l = listingOf('stock', { ...RAW_STOCK, is_vm: true, specs: { ...RAW_STOCK.specs, additional: { ipv4_count: 1, ipv6_enabled: false } } }, 0);
    expect(factValue(specFacts(l), 'fact.machine')).toBe(W['value.vm']);
    expect(specFacts(l).some((f) => /ipv6/i.test(f.label))).toBe(false);
  });
});

describe('disk and RAM kinds on the row and in the inspector', () => {
  const rowOf = async (name: string) => {
    const table = await screen.findByRole('table', { name: strings['tab.listings'] }, { timeout: 20000 });
    await waitFor(() => expect(within(table).getByText(name)).toBeInTheDocument(), { timeout: 10000 });
    return within(table).getByText(name).closest('tr') as HTMLElement;
  };

  it('each disk group\'s kind and the RAM type show on the row, sizes from 1024 GB in TB', async () => {
    await renderPage(page, { path: '/billing?view=servers' });
    const tokyo = await rowOf('Tokyo L');
    expect(within(tokyo).getByText('2 × 1.92 TB NVMe + 2 × 8 TB HDD')).toBeInTheDocument();
    expect(within(tokyo).getByText('256 GB DDR4 ECC')).toBeInTheDocument();
    const fra = await rowOf('Frankfurt L');
    expect(within(fra).getByText('2 × 512 GB NVMe')).toBeInTheDocument();
    expect(within(fra).getByText('128 GB DDR4 ECC')).toBeInTheDocument();
  });

  it('the inspector of a mixed-disk listing lists each group with its kind, next to the order summary', async () => {
    await renderPage(page, { path: '/billing?view=servers&sel=l03' });
    expect(await screen.findByText('2 × 1.92 TB NVMe (PCIe)')).toBeInTheDocument();
    expect(screen.getByText('2 × 8 TB HDD (SATA, Toshiba MG08)')).toBeInTheDocument();
    expect(screen.getByText('DDR4 ECC')).toBeInTheDocument();
    expect(screen.getByText('2,933 MHz')).toBeInTheDocument();
    expect(screen.getByText('19.75 TB')).toBeInTheDocument();
    expect(screen.getByText(strings['buy.total'])).toBeInTheDocument();
  });
});

