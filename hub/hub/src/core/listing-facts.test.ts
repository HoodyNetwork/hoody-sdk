// Vitest: the one list of what a bare-metal listing says, shared by the Market and Billing's checkout.
// Every fact is present in a fixed order; one the row left out reads "Not listed"; sizes from 1024 GB read in TB.
import { describe, expect, it } from 'vitest';
import type { MarketRow } from './commerce-pure';
import { NOT_LISTED, disksLine, factText, instantPromise, isInstant, listingFactWords as W, listingFacts, ramLine, type FactsInput } from './listing-facts';

const empty: FactsInput = {
  kind: 'offer', model: null, cores: null, threads: null, cpuScore: null, cpuScoreType: null, ramGb: null, ramType: null, ramMhz: null,
  disks: [], diskGb: null, diskSummary: null, bandwidthMbps: null, trafficTb: null, trafficUnlimited: false, ipv4Count: null,
  isVm: null, category: null, datacenter: null, city: null, region: null, country: null, deliveryHours: null, setupMinutes: null, stockLeft: null,
};
const full: FactsInput = {
  ...empty, kind: 'stock', model: 'AMD EPYC 9454P', cores: 48, threads: 96, cpuScore: 71000, cpuScoreType: 'geekbench_multi', ramGb: 384, ramType: 'DDR5 ECC',
  ramMhz: 4800, disks: [{ count: 2, gb: 1920, type: 'nvme', iface: 'PCIe', model: 'Samsung PM9A3' }, { count: 4, gb: 16384, type: 'HDD', iface: null, model: null }],
  diskGb: 69376, bandwidthMbps: 10000, trafficUnlimited: true, ipv4Count: 2, isVm: false, category: 'storage', datacenter: 'HEL1', city: 'Helsinki',
  country: 'FI', deliveryHours: 0, setupMinutes: 20, stockLeft: 0,
};
const val = (row: FactsInput, key: string) => listingFacts(row).find((f) => f.key === key)?.value;

describe('listingFacts', () => {
  it('reads core\'s MarketRow directly', () => {
    const asRow: Pick<MarketRow, keyof FactsInput> = full;
    expect(listingFacts(asRow).length).toBeGreaterThan(0);
  });

  it('a full stock row: every fact in words, disk groups one per line, sizes in TB from 1024 GB', () => {
    expect(listingFacts(full).map((f) => [f.key, f.label, f.value])).toEqual([
      ['cpu', W['fact.cpu'], 'AMD EPYC 9454P'],
      ['cores', W['fact.cores'], '48 cores · 96 threads'],
      ['score', W['fact.score.geekbench_multi'], '71,000'],
      ['ram', W['fact.ram'], '384 GB'],
      ['ramType', W['fact.ramType'], 'DDR5 ECC'],
      ['ramSpeed', W['fact.ramSpeed'], '4,800 MHz'],
      ['disks', W['fact.disks'], ['2 × 1.88 TB NVMe (PCIe, Samsung PM9A3)', '4 × 16 TB HDD']],
      ['diskTotal', W['fact.diskTotal'], '67.75 TB'],
      ['bandwidth', W['fact.bandwidth'], '10 Gbit/s'],
      ['traffic', W['fact.traffic'], W['value.unlimited']],
      ['ipv4', W['fact.ipv4'], '2'],
      ['machine', W['fact.machine'], W['value.whole']],
      ['category', W['fact.category'], W['value.category.storage']],
      ['location', W['fact.location'], 'HEL1, Helsinki, Finland'],
      ['delivery', W['fact.delivery'], W['promise.label']],
      ['setup', W['fact.setup'], 'About 20 minutes'],
      ['stockLeft', W['fact.stockLeft'], W['value.stockLeft.none']],
    ]);
  });

  it('a row that says nothing: each fact reads "Not listed", never 0 or blank; no score or stock count is invented', () => {
    const facts = listingFacts(empty);
    expect(facts.map((f) => f.key)).not.toContain('score');
    expect(facts.map((f) => f.key)).not.toContain('stockLeft');
    for (const f of facts) if (f.key !== 'traffic') expect(f.value, f.key).toBe(NOT_LISTED);
    expect(val(empty, 'traffic')).toBe(NOT_LISTED);
    expect(factText(NOT_LISTED)).toBe(W['fact.notListed']);
  });

  it('an unknown category or score type falls back; a disk group without size or kind says so', () => {
    expect(val({ ...full, category: 'quantum' }, 'category')).toBe(NOT_LISTED);
    expect(listingFacts({ ...full, cpuScoreType: 'other' }).find((f) => f.key === 'score')?.label).toBe(W['fact.score']);
    expect(val({ ...empty, disks: [{ count: 2, gb: null, type: null, iface: null, model: null }] }, 'disks')).toBe(`2 × ${W['value.disk.sizeUnknown']} ${W['value.disk.typeUnknown']}`);
    expect(val({ ...empty, disks: [{ count: 1, gb: 480, type: null, iface: null, model: null }], diskSummary: '1 x 480 GB SAS' }, 'disks')).toBe('480 GB SAS');
    expect(val({ ...empty, diskSummary: '2 x 1 TB NVMe' }, 'disks')).toBe('2 x 1 TB NVMe');
  });

  it('a disk group whose count is not listed says so, never reads as one disk', () => {
    const unknown = { ...empty, disks: [{ count: null, gb: 480, type: 'SSD', iface: null, model: null }] };
    expect(val(unknown, 'disks')).toBe(`480 GB SSD, ${W['value.disk.countUnknown']}`);
    expect(val(unknown, 'disks')).not.toBe(val({ ...empty, disks: [{ count: 1, gb: 480, type: 'SSD', iface: null, model: null }] }, 'disks'));
    expect(disksLine(unknown)).toBe(`480 GB SSD, ${W['value.disk.countUnknown']}`);
  });

  it('a score type or category named like an object property falls back, never reads that property', () => {
    for (const k of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(listingFacts({ ...full, cpuScoreType: k }).find((f) => f.key === 'score')?.label, k).toBe(W['fact.score']);
      expect(val({ ...full, category: k }, 'category'), k).toBe(NOT_LISTED);
    }
  });

  it('a partial row (built without disks or machine kind) lists them as not listed, never crashes or says "not included"', () => {
    const partial = { ...empty } as Partial<FactsInput>;
    delete partial.disks;
    delete partial.isVm;
    const row = partial as FactsInput;
    expect(val(row, 'disks')).toBe(NOT_LISTED);
    expect(val(row, 'machine')).toBe(NOT_LISTED);
    expect(disksLine(row)).toBe('');
  });

  it('offers deliver later, worded in hours or days; the stock rail is instant', () => {
    expect(val({ ...empty, deliveryHours: 1 }, 'delivery')).toBe('About 1 hour after payment');
    expect(val({ ...empty, deliveryHours: 72 }, 'delivery')).toBe('About 3 days after payment');
    expect([isInstant(full), isInstant(empty)]).toEqual([true, false]);
  });
});

describe('one-line words and the promise', () => {
  it('disksLine joins every group; ramLine gives size and type; both are empty when the row says nothing', () => {
    expect(disksLine(full)).toBe('2 × 1.88 TB NVMe + 4 × 16 TB HDD');
    expect(disksLine({ disks: [], diskGb: 2048, diskSummary: '2 x 1 TB nvme' })).toBe('2 TB NVMe');
    expect(ramLine(full)).toBe('384 GB DDR5 ECC');
    expect([disksLine(empty), ramLine(empty)]).toEqual(['', '']);
  });

  it('the instant-delivery promise: one label with its asterisk, the footnote and the checkout line from one body', () => {
    expect(instantPromise.label).toBe('Instant delivery*');
    expect(instantPromise.footnote).toBe(`*${W['promise.body']}`);
    expect(instantPromise.review).toBe(`Instant delivery*: ${W['promise.body']}`);
    expect(W['promise.body']).toMatch(/5 seconds to 60 minutes.*voucher/);
  });
});

describe('no IPv6 fact (IPv6 is not part of Hoody)', () => {
  it('a row that says IPv6 yes, no or nothing lists no IPv6 fact, and the words have no IPv6 label', () => {
    for (const ipv6 of [true, false, null]) {
      const row = { ...full, ipv6 } as FactsInput;
      const facts = listingFacts(row);
      expect(facts.map((f) => f.key as string)).not.toContain('ipv6');
      expect(facts.some((f) => /ipv6/i.test(f.label))).toBe(false);
    }
    expect(Object.keys(W).filter((k) => /ipv6/i.test(k))).toEqual([]);
  });
});
