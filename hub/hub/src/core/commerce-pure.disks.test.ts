// Vitest: the disk groups, IPv6, machine kind and category a market row carries, read from each rail's
// own fields; a field left out or of the wrong shape is null (never 0, never guessed).
import { describe, expect, it } from 'vitest';
import { normalizeOfferRow, normalizeStockRow } from './commerce-pure';

describe('stock rows', () => {
  it('carry each disk group, IPv6, the machine kind and the category as the row says them', () => {
    const r = normalizeStockRow({
      id: 's1', is_vm: false, category: 'storage',
      specs: {
        disks: { config: [{ count: 2, capacity_gb: 1920, type: ' nvme ', interface: 'PCIe', model: 'Samsung PM9A3' }, { count: 4, capacity_gb: 16384, type: 'HDD' }] },
        additional: { ipv6_enabled: true },
      },
    }, 0);
    expect(r.disks).toEqual([
      { count: 2, gb: 1920, type: 'nvme', iface: 'PCIe', model: 'Samsung PM9A3' },
      { count: 4, gb: 16384, type: 'HDD', iface: null, model: null },
    ]);
    expect([r.ipv6, r.isVm, r.category]).toEqual([true, false, 'storage']);
  });

  it('leave out what is missing or misshapen: no groups, nulls, an unknown category dropped', () => {
    const r = normalizeStockRow({ id: 's2', is_vm: 'no', category: 'quantum', specs: { disks: { config: [null, 'x', { count: -1, capacity_gb: 'big', type: '', model: 7 }] }, additional: { ipv6_enabled: 1 } } }, 0);
    expect(r.disks).toEqual([{ count: null, gb: null, type: null, iface: null, model: null }]);
    expect([r.ipv6, r.isVm, r.category]).toEqual([null, null, null]);
    expect(normalizeStockRow({ id: 's3' }, 0).disks).toEqual([]);
  });

  it('a count is a positive whole number and a size a sane capacity; anything else is not listed (null)', () => {
    const g = (d: Record<string, unknown>) => normalizeStockRow({ id: 's', specs: { disks: { config: [d] } } }, 0).disks[0];
    for (const count of [0, -2, 1.5, 0.5, Infinity, NaN, '2', 2 ** 60, null]) expect(g({ count, capacity_gb: 480 })?.count, String(count)).toBeNull();
    for (const gb of [0, -1, Infinity, NaN, '480', 2 ** 60, 10 ** 9]) expect(g({ count: 1, capacity_gb: gb })?.gb, String(gb)).toBeNull();
    expect(g({ count: 24, capacity_gb: 1.92 })).toMatchObject({ count: 24, gb: 1.92 });
    expect(normalizeOfferRow({ id: 'o', disks: [{ count: 1.5, capacity_gb: 2 ** 60 }] }, 0).disks[0]).toMatchObject({ count: null, gb: null });
  });
});

describe('offer rows', () => {
  it('carry their disk groups; IPv6, machine kind and category are not said (null)', () => {
    const r = normalizeOfferRow({ id: 'o1', disks: [{ count: 2, capacity_gb: 3840, type: 'ssd' }], is_vm: true, category: 'gpu' }, 0);
    expect(r.disks).toEqual([{ count: 2, gb: 3840, type: 'ssd', iface: null, model: null }]);
    expect([r.ipv6, r.isVm, r.category]).toEqual([null, null, null]);
    expect(normalizeOfferRow({ id: 'o2', disks: 'x' }, 0).disks).toEqual([]);
  });
});
