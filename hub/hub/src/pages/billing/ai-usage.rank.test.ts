// Vitest: the AI usage table's multiplier and its "Get more AI" offer. A multiplier is shown only from 2 up (below
// that it proves no larger allowance), and a plan is offered for more AI when it raises the AI tier or the multiplier,
// cheapest first. The catalogue here is built in the test: nothing is assumed about the live one.
import { describe, expect, it } from 'vitest';
import { aiUsage } from './logic';
import type { RawPlan, RawSub, RawUsage } from './types';

const SRV = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const RES = { cpu_cores: 2, memory_mb: 4096, disk_limit_gb: 40 };

function plan(id: string, family: string, tier: string, mult: number, price: number, res: Record<string, number> = RES): RawPlan {
  return {
    id,
    family_id: family,
    ai_tier: tier,
    price_cents_per_month: price,
    hold_days: 7,
    sort_order: 0,
    resources: { ...res, ai_multiplier: mult },
  } as unknown as RawPlan;
}

function sub(p: RawPlan): RawSub {
  return {
    id: 'b1b2c3d4e5f6a1b2c3d4e5f6',
    server_id: SRV,
    state: 'active',
    plan_id: (p as unknown as { id: string }).id,
    paid_through: new Date(Date.now() + 10 * 864e5).toISOString(),
    plan: p,
  } as unknown as RawSub;
}

const usage: RawUsage = { servers: [{ server: { id: SRV, name: 'one' }, status: 'ok', lanes: [] }] } as unknown as RawUsage;
const BIGGER = { cpu_cores: 4, memory_mb: 8192, disk_limit_gb: 80 };

describe('AI usage multiplier', () => {
  it('a ×1 plan shows no multiplier', () => {
    const p = plan('plus-1', 'plus', 'plus', 1, 500);
    expect(aiUsage(usage, [sub(p)], [p]).servers[0]?.mult).toBeNull();
  });
  it('a ×4 plan shows ×4', () => {
    const p = plan('plus-4', 'plus', 'plus', 4, 500);
    expect(aiUsage(usage, [sub(p)], [p]).servers[0]?.mult).toBe(4);
  });
});

describe('Get more AI', () => {
  const plus = plan('plus-1', 'plus', 'plus', 1, 500);
  const pro = plan('pro-1', 'pro', 'pro', 1, 1500, BIGGER);

  it('a free server with ×1 plans is offered the cheapest higher tier', () => {
    const u = aiUsage(usage, [], [pro, plus], { [SRV]: 'free' });
    expect(u.servers[0]?.suggest).toBe('plus');
  });
  it('a Plus server with ×1 plans is offered Pro, not bare metal', () => {
    const u = aiUsage(usage, [sub(plus)], [plus, pro]);
    expect(u.servers[0]?.suggest).toBe('pro');
    expect(u.servers[0]?.bareNext).toBe(false);
  });
  it('with no server the page still offers a plan', () => {
    const u = aiUsage({ servers: [] } as unknown as RawUsage, [], [pro, plus]);
    expect(u.more).toBe('plus');
  });
  it('unequal multipliers still pick the cheapest larger multiple', () => {
    const p2 = plan('plus-2', 'plus', 'plus', 2, 500);
    const p4 = plan('pro-4', 'pro', 'pro', 4, 1500, BIGGER);
    expect(aiUsage(usage, [], [p4, p2], { [SRV]: 'free' }).servers[0]?.suggest).toBe('plus');
    expect(aiUsage(usage, [sub(p2)], [p2, p4]).servers[0]?.suggest).toBe('pro');
    expect(aiUsage({ servers: [] } as unknown as RawUsage, [], [p4, p2]).more).toBe('plus');
  });
  it('a catalogue entry with no price is never offered', () => {
    const zero = plan('plus-0', 'plus-zero', 'plus', 1, 0);
    expect(aiUsage(usage, [], [zero, pro, plus], { [SRV]: 'free' }).servers[0]?.suggest).toBe('plus');
  });
  it('the top tier at the top multiple is offered nothing and goes on to bare metal', () => {
    const u = aiUsage(usage, [sub(pro)], [plus, pro]);
    expect(u.servers[0]?.suggest).toBeNull();
    expect(u.servers[0]?.bareNext).toBe(true);
  });
});
