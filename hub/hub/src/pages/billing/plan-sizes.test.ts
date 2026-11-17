// Vitest: a plan's memory and disk go through the kit's formatStorage, the same words the Market tiers use for the
// same catalogue (1024 GB and up read in TB).
import { describe, expect, it } from 'vitest';
import { planRows } from './logic';
import type { RawPlan } from './types';

const plan = (ram: number, disk: number) => ({ resources: { cpu_cores: 2, ram_gb: ram, disk_limit_gb: disk } }) as unknown as RawPlan;
const value = (p: RawPlan, id: string) => planRows(p).find((r) => r.id === id)?.value;

describe('plan sizes', () => {
  it('below 1024 GB in GB', () => {
    expect(value(plan(4, 60), 'ram')).toBe('4 GB');
    expect(value(plan(4, 60), 'disk')).toBe('60 GB');
  });
  it('from 1024 GB in TB', () => {
    expect(value(plan(1024, 2048), 'ram')).toBe('1 TB');
    expect(value(plan(4, 1536), 'disk')).toBe('1.5 TB');
  });
  it("memory and disk carry the catalogue's number in GB, whatever the text reads (the next-plan hint decides on it)", () => {
    const rows = planRows(plan(1024, 60));
    expect(rows.find((r) => r.id === 'ram')).toMatchObject({ value: '1 TB', gb: 1024 });
    expect(rows.find((r) => r.id === 'disk')).toMatchObject({ value: '60 GB', gb: 60 });
    expect(rows.filter((r) => r.id !== 'ram' && r.id !== 'disk' && r.gb !== undefined)).toEqual([]);
  });
  it('no other row carries a number in GB: disk speed (one rate or two), network and the count rows', () => {
    const full = (io: { r: number; w: number }) =>
      ({
        max_proxy_aliases: 6,
        max_bot_urls: 3,
        resources: { cpu_cores: 2, ram_gb: 4, disk_limit_gb: 60, max_computers: 3, disk_io_read_mib: io.r, disk_io_write_mib: io.w, network_limit_mbps: 500, snapshots_per_computer: 3, ai_multiplier: 4 },
      }) as unknown as RawPlan;
    for (const io of [
      { r: 400, w: 400 },
      { r: 400, w: 200 },
    ]) {
      const rows = planRows(full(io));
      // Every row a plan can have is in the list, so "no other row" is said of all of them, not of the CPU row alone.
      expect(rows.map((r) => r.id)).toEqual(['cores', 'ram', 'disk', 'computers', 'io', 'net', 'snapshots', 'aliases', 'boturls', 'ai']);
      const others = rows.filter((r) => r.id !== 'ram' && r.id !== 'disk');
      expect(others).toHaveLength(8);
      for (const r of others) expect(r, r.id).not.toHaveProperty('gb');
    }
    // The values the other rows do show (a row with a size-like value still carries no GB number).
    const rows = planRows(full({ r: 400, w: 400 }));
    expect(rows.find((r) => r.id === 'io')?.value).toBe('400 MiB/s');
    expect(rows.find((r) => r.id === 'net')?.value).toBe('500 Mbps');
    expect(rows.find((r) => r.id === 'cores')?.value).toBe('2');
    expect(rows.find((r) => r.id === 'ai')?.value).toBe('×4');
  });
});
