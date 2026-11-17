// The bots fixtures answer the provider reads the model picker makes (providers, models, ready models, version), so in fixture
// mode readiness is known instead of failed; the held-start state keeps them beside its lifecycle rules, and the empty-models
// state reads an empty catalogue.
import { bootFixtureCore, providers, type FixtureRule } from '@core';
import { describe, expect, it } from 'vitest';
import fixtures from './fixtures';

const target = { project: { id: 'p-1' }, container: { id: 'c-atlas', server_name: 'atlas-srv' } };
const NAMES = { model: 'Model', provider: 'Provider' };
const rulesOf = (state: string): FixtureRule[] => [...((fixtures.states as Record<string, { rules?: readonly FixtureRule[] }>)[state]?.rules ?? [])];

describe('the provider reads in fixture mode', () => {
  for (const state of ['many', 'startUnknown']) {
    it(`${state}: the catalogue reads, and readiness follows the models (an ensemble through its members)`, async () => {
      bootFixtureCore({ rules: rulesOf(state) });
      const r = await providers.providersApi(target).catalogue();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const rows = providers.list(r.body, 'bot', null, NAMES);
      const ready = (spec: string) => rows.find((m) => m.spec === spec)?.ready;
      expect(ready('hoody-ai/hoody-free')).toBe('ready');
      expect(ready('openai/gpt-5')).toBe('needs_key');
      expect(ready('google/gemini-3-pro')).toBe('unknown');
      expect(ready('fusion/best-of-three')).toBe('ready');
    });
  }

  it('the held-start state keeps its lifecycle rule beside the provider rules', () => {
    expect(rulesOf('startUnknown').length).toBeGreaterThan(rulesOf('many').length);
  });

  it('the version read answers', async () => {
    bootFixtureCore({ rules: rulesOf('many') });
    const v = await providers.providersApi(target).version();
    expect(v.ok).toBe(true);
  });

  it('the real chat catalogue reads (7,078 models), only Hoody Free ready', async () => {
    bootFixtureCore({ rules: rulesOf('models7k') });
    const r = await providers.providersApi(target).catalogue();
    expect(r.ok ? 'ok' : JSON.stringify(r.err)).toBe('ok');
    if (!r.ok) return;
    const rows = providers.list(r.body, 'bot', null, NAMES);
    expect(rows).toHaveLength(7078);
    expect(rows.filter((m) => m.ready === 'ready').map((m) => m.spec)).toEqual(['hoody-ai/hoody-free']);
    expect(rows.filter((m) => m.ready === 'needs_key')).toHaveLength(7077);
  });

  it('noModels: the catalogue reads and lists no model', async () => {
    bootFixtureCore({ rules: rulesOf('noModels') });
    const r = await providers.providersApi(target).catalogue();
    expect(r.ok).toBe(true);
    if (r.ok) expect(providers.list(r.body, 'bot', null, NAMES)).toEqual([]);
  });
});
