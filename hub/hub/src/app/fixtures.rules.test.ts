import { describe, expect, it } from 'vitest';
import type { FixtureRule } from '@core';
import { stateAnswer, stateRules, type FixtureState } from './fixtures';

const rule = { match: 'x' } as unknown as FixtureRule;

describe('fixture states carrying core rules', () => {
  it('reads a core-format state as its rules', () => {
    expect(stateRules([rule])).toEqual([rule]);
  });

  it('reads the rules key of a table state', () => {
    const state: FixtureState = { list: { data: [] }, rules: [rule] };
    expect(stateRules(state)).toEqual([rule]);
    expect(stateRules({ list: { data: [] } })).toEqual([]);
  });

  it('never answers a fixtureSource key from the rules key', () => {
    const state: FixtureState = { list: { data: [1] }, rules: [rule] };
    expect(stateAnswer(state, 'rules')).toBeUndefined();
    expect(stateAnswer(state, 'list')).toEqual({ data: [1] });
    expect(stateAnswer(state, 'gone')).toBeUndefined();
  });
});
