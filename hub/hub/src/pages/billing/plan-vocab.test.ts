// Billing's plan rows are core's planFacts, in its order, with one vocabulary ("computers");
// the plans lede claims nothing about AI.
import { describe, expect, it } from 'vitest';
import { commerceRules } from '@core';
import { comparison, planRows } from './logic';
import strings from './strings.en.json';
import type { RawPlan } from './types';

const plan = {
  id: 'p1', family_id: 'f1', price_cents_per_month: 1000, hold_days: 7, ai_tier: 'plus',
  resources: { cpu_cores: 3, ram_gb: 6, disk_limit_gb: 75, disk_io_read_mib: 800, disk_io_write_mib: 400, network_limit_mbps: 50, max_computers: 12, snapshots_per_computer: 25, ai_multiplier: 4 },
  max_proxy_aliases: 50, max_bot_urls: 25,
} as unknown as RawPlan;
const T = strings as Record<string, string>;

describe('Billing plan rows = core planFacts', () => {
  it('the same rows, in the same order', () => {
    expect(planRows(plan).map((r) => r.id)).toEqual(commerceRules.planFacts(plan).map((f) => f.id));
  });
  it('the words: computers, custom computer URLs, snapshots per computer; never containers or aliases', () => {
    const labels = planRows(plan).map((r) => T[r.label] ?? '');
    expect(labels).toContain('Computers');
    expect(labels).toContain('Custom computer URLs');
    expect(labels).toContain('Snapshots per computer');
    for (const l of labels) expect(l).not.toMatch(/container|alias/i);
  });
  it('disk speed: one number when read and write agree, both when they differ', () => {
    const io = (r: number, w: number) => planRows({ ...plan, resources: { disk_io_read_mib: r, disk_io_write_mib: w } } as unknown as RawPlan).find((x) => x.id === 'io')?.value;
    expect(io(400, 400)).toBe('400 MiB/s');
    expect(io(800, 400)).toEqual({ k: 'buy.resDiskIoSplit', v: { r: 800, w: 400 } });
    expect(T['buy.resDiskIoSplit']).toBe('{{r}} MiB/s read, {{w}} MiB/s write');
  });
  it('an AI multiple of 1 is no row and no claim (no AI claim from equal public multiples): the compare table keeps the tier word alone', () => {
    const one = { ...plan, resources: { ...(plan.resources as object), ai_multiplier: 1 } } as unknown as RawPlan;
    expect(planRows(one).some((r) => r.id === 'ai')).toBe(false);
    expect(planRows(plan).find((r) => r.id === 'ai')?.value).toBe('×4');
    expect(comparison([one]).groups[0]?.rows[0]).toMatchObject({ id: 'ai', cells: [{ kind: 'ai', tier: 'plus', mult: null }] });
  });
  it('the plans lede makes no AI claim, and the AI usage lede claims no bigger allowance for bigger plans', () => {
    expect(T.plansLede).not.toMatch(/\bAI\b/);
    expect(T.plansLede).toMatch(/a server of your own/);
    expect(T['aiu.lede']).not.toMatch(/bigger|more/i);
    expect(T['aiu.lede']).toMatch(/own free AI allowance/);
  });
});
