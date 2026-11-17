// One upgrade eligibility for Billing and the Market. The client only offers; the
// server's up-only rule decides. Per field against the server's OWN plan version; never its own version.
import { describe, expect, it } from 'vitest';
import { upgradeCandidates, upgradeGate } from './commerce-pure';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const later = '2026-11-20T00:00:00.000Z';
const earlier = '2026-10-20T00:00:00.000Z';
const terms = (res: Record<string, unknown>, o: Record<string, unknown> = {}) => ({ family_id: 'fam-plus', resources: res, max_proxy_aliases: 50, max_bot_urls: 25, ai_tier: 'plus', ...o });
const sub = (o: Record<string, unknown> = {}) => ({
  id: '6a1f00000000000000c0ffee', state: 'active', plan_id: 'plus-v1', paid_through: later, active_operation_id: null,
  plan: terms({ cpu_cores: 3, ram_gb: 6, disk_io_read_mib: 800, disk_io_write_mib: 400 }),
  ...o,
});
const plan = (id: string, res: Record<string, unknown>, o: Record<string, unknown> = {}) => ({
  id, family_id: `fam-${id}`, price_cents_per_month: 2500, hold_days: 7, sort_order: 20, ai_tier: 'pro', max_proxy_aliases: 50, max_bot_urls: 250,
  resources: res, ...o,
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('upgradeGate', () => {
  it('ok only for an active server with no running change and a paid period still running', () => {
    expect(upgradeGate(sub(), NOW)).toBe('ok');
    expect(upgradeGate(sub({ active_operation_id: 'op1' }), NOW)).toBe('busy');
    expect(upgradeGate(sub({ paid_through: earlier }), NOW)).toBe('ended');
    expect(upgradeGate(sub({ paid_through: null }), NOW)).toBe('ended');
    expect(upgradeGate(sub({ paid_through: 'x' }), NOW)).toBe('ended');
    for (const state of ['held', 'provisioning', 'host_wiped', 'terminated']) expect(upgradeGate(sub({ state }), NOW)).toBe('state');
    expect(upgradeGate(null, NOW)).toBe('state');
  });
  it('a running change on a server that is not active is its state, not busy', () => {
    expect(upgradeGate(sub({ state: 'held', active_operation_id: 'op1' }), NOW)).toBe('state');
  });
  it('the paid period ends exactly now: ended', () => {
    expect(upgradeGate(sub({ paid_through: new Date(NOW).toISOString() }), NOW)).toBe('ended');
  });
});

describe('upgradeCandidates', () => {
  const up = plan('pro', { cpu_cores: 6, ram_gb: 16, disk_io_read_mib: 800, disk_io_write_mib: 800 });
  it('every field kept or raised, one at least raised', () => {
    expect(ids(upgradeCandidates(sub(), [up]))).toEqual(['pro']);
  });
  it('never its own version, even when the catalogue copy differs', () => {
    expect(upgradeCandidates(sub(), [{ ...up, id: 'plus-v1' }])).toEqual([]);
  });
  it('disk read and write are two fields: 800/400 is not offered 400/800', () => {
    expect(upgradeCandidates(sub(), [plan('swap', { cpu_cores: 6, ram_gb: 16, disk_io_read_mib: 400, disk_io_write_mib: 800 })])).toEqual([]);
  });
  it('a field of the own version the target leaves out or lowers refuses it', () => {
    expect(upgradeCandidates(sub(), [plan('noram', { cpu_cores: 6, disk_io_read_mib: 800, disk_io_write_mib: 800 })])).toEqual([]);
    expect(upgradeCandidates(sub(), [{ ...up, id: 'fewer', max_proxy_aliases: 10 }])).toEqual([]);
    expect(upgradeCandidates(sub(), [{ ...up, id: 'nobots', max_bot_urls: undefined }])).toEqual([]);
    expect(upgradeCandidates(sub(), [{ ...up, id: 'lesser', ai_tier: 'free' }])).toEqual([]);
  });
  it('a target that lowers or leaves out the storage-share limit is refused, as the API refuses it', () => {
    const own = sub({ plan: terms({ cpu_cores: 3, ram_gb: 6, disk_io_read_mib: 800, disk_io_write_mib: 400 }, { max_storage_shares: 5 }) });
    expect(upgradeCandidates(own, [{ ...up, id: 'fewshares', max_storage_shares: 1 }])).toEqual([]);
    expect(upgradeCandidates(own, [{ ...up, id: 'noshares' }])).toEqual([]);
    expect(ids(upgradeCandidates(own, [{ ...up, id: 'moreshares', max_storage_shares: 25 }]))).toEqual(['moreshares']);
  });
  it('the storage-share limit alone raised is an upgrade', () => {
    const own = sub({ plan: terms({ cpu_cores: 3, ram_gb: 6, disk_io_read_mib: 800, disk_io_write_mib: 400 }, { max_storage_shares: 5 }) });
    expect(ids(upgradeCandidates(own, [plan('shares', { cpu_cores: 3, ram_gb: 6, disk_io_read_mib: 800, disk_io_write_mib: 400 }, { ai_tier: 'plus', max_bot_urls: 25, max_storage_shares: 25 })]))).toEqual(['shares']);
  });
  it('nothing raised is no upgrade', () => {
    expect(upgradeCandidates(sub(), [plan('same', { cpu_cores: 3, ram_gb: 6, disk_io_read_mib: 800, disk_io_write_mib: 400 }, { ai_tier: 'plus', max_bot_urls: 25 })])).toEqual([]);
  });
  it('the AI tier alone raised is an upgrade (free < plus < pro)', () => {
    expect(ids(upgradeCandidates(sub(), [plan('tier', { cpu_cores: 3, ram_gb: 6, disk_io_read_mib: 800, disk_io_write_mib: 400 }, { max_bot_urls: 25 })]))).toEqual(['tier']);
  });
  it('a field the own version does not state is not compared', () => {
    expect(ids(upgradeCandidates(sub({ plan: terms({ cpu_cores: 3, ram_gb: 'n/a' }) }), [plan('p', { cpu_cores: 4 })]))).toEqual(['p']);
  });
  it('refused plans and plans the page cannot sell are left out; the rest in catalogue order, then price', () => {
    const a = plan('a', { cpu_cores: 8, ram_gb: 32, disk_io_read_mib: 800, disk_io_write_mib: 800 }, { sort_order: 30 });
    const b = plan('b', { cpu_cores: 8, ram_gb: 32, disk_io_read_mib: 800, disk_io_write_mib: 800 }, { sort_order: 10, price_cents_per_month: 9000 });
    const c = plan('c', { cpu_cores: 8, ram_gb: 32, disk_io_read_mib: 800, disk_io_write_mib: 800 }, { sort_order: 10, price_cents_per_month: 4000 });
    const broken = { ...up, id: 'broken', hold_days: undefined };
    expect(ids(upgradeCandidates(sub(), [a, b, c, broken, up], ['pro']))).toEqual(['c', 'b', 'a']);
  });
  it('a server without its own plan terms, or without a plan id, is offered nothing', () => {
    expect(upgradeCandidates(sub({ plan: null }), [up])).toEqual([]);
    expect(upgradeCandidates(sub({ plan_id: undefined }), [up])).toEqual([]);
    expect(upgradeCandidates(null, [up])).toEqual([]);
    expect(upgradeCandidates(sub(), null)).toEqual([]);
  });
});
