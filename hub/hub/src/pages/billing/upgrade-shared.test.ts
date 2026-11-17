// Billing's upgrade eligibility is core's (one copy for Billing and the Market); Billing's behaviour is unchanged.
import { describe, expect, it } from 'vitest';
import { commerceRules } from '@core';
import { upgradeCandidates, upgradeState } from './logic';
import type { RawSub } from './types';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const sub = (o: Partial<RawSub>) => ({ id: 'x', state: 'active', plan_id: 'p', paid_through: '2026-11-20T00:00:00Z', ...o }) as RawSub;

describe('Billing delegates eligibility to core', () => {
  it('upgradeCandidates is core\'s', () => {
    expect(upgradeCandidates).toBe(commerceRules.upgradeCandidates);
  });
  it('upgradeState maps core\'s gate: ok, busy, anything else null', () => {
    expect(upgradeState(sub({}), NOW)).toBe('ok');
    expect(upgradeState(sub({ active_operation_id: 'op' }), NOW)).toBe('busy');
    expect(upgradeState(sub({ paid_through: '2026-10-01T00:00:00Z' }), NOW)).toBeNull();
    expect(upgradeState(sub({ state: 'held' }), NOW)).toBeNull();
    expect(upgradeState(null, NOW)).toBeNull();
  });
  it('a paid_through that is not a string is parsed as before (Date.parse of its text)', () => {
    const odd = (v: unknown) => sub({ paid_through: v as string });
    expect(upgradeState(odd(2099), NOW)).toBe('ok');
    expect(upgradeState(odd(['2099-01-01T00:00:00Z']), NOW)).toBe('ok');
    expect(upgradeState(odd(2020), NOW)).toBeNull();
    expect(upgradeState(odd({}), NOW)).toBeNull();
    expect(upgradeState(odd(undefined), NOW)).toBeNull();
    expect(commerceRules.upgradeGate(odd(2099), NOW)).toBe('ok');
  });
});
