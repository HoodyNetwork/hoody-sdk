// One plan-facts projection for Billing and the Market. Raw values kept; a field the
// catalogue row leaves out or sends malformed is left out, never 0; disk read and write stay two numbers.
import { describe, expect, it } from 'vitest';
import { PLAN_FACT_IDS, planFacts } from './commerce-pure';

const row = {
  price_cents_per_month: 1000,
  hold_days: 7,
  resources: { cpu_cores: 3, ram_gb: 6, disk_limit_gb: 75, disk_io_read_mib: 800, disk_io_write_mib: 400, network_limit_mbps: 50, max_computers: 12, snapshots_per_computer: 25, ai_multiplier: 4 },
  max_proxy_aliases: 50,
  max_bot_urls: 25,
};

describe('planFacts', () => {
  it('every fact in the fixed order, with its raw value', () => {
    expect(planFacts(row)).toEqual([
      { id: 'cores', value: 3 },
      { id: 'ram', value: 6 },
      { id: 'disk', value: 75 },
      { id: 'computers', value: 12 },
      { id: 'io', value: 800, write: 400 },
      { id: 'net', value: 50 },
      { id: 'snapshots', value: 25 },
      { id: 'aliases', value: 50 },
      { id: 'boturls', value: 25 },
      { id: 'ai', value: 4 },
    ]);
    expect(PLAN_FACT_IDS).toEqual(['cores', 'ram', 'disk', 'computers', 'io', 'net', 'snapshots', 'aliases', 'boturls', 'ai']);
  });
  it('equal read and write speeds are one number', () => {
    expect(planFacts({ resources: { disk_io_read_mib: 400, disk_io_write_mib: 400 } })).toEqual([{ id: 'io', value: 400 }]);
  });
  it('one disk speed unknown: no disk-speed fact rather than half of one', () => {
    expect(planFacts({ resources: { disk_io_read_mib: 400 } })).toEqual([]);
    expect(planFacts({ resources: { disk_io_read_mib: 400, disk_io_write_mib: '400' } })).toEqual([]);
  });
  it('missing or malformed fields are left out, never 0; a sent 0 is a value', () => {
    expect(planFacts({ resources: { cpu_cores: 'x', ram_gb: -1, disk_limit_gb: 1.5, max_computers: 0 }, max_bot_urls: null })).toEqual([{ id: 'computers', value: 0 }]);
    expect(planFacts(null)).toEqual([]);
    expect(planFacts({ resources: [] })).toEqual([]);
  });
  it('the AI multiple is a fact only at 2 or more (an equal public multiple proves no allowance)', () => {
    expect(planFacts({ resources: { ai_multiplier: 1 } })).toEqual([]);
    expect(planFacts({ resources: { ai_multiplier: 2 } })).toEqual([{ id: 'ai', value: 2 }]);
  });
  it('the retention days are not a plan fact (each surface says them in its own sentence)', () => {
    expect(planFacts({ hold_days: 7 })).toEqual([]);
  });
});
