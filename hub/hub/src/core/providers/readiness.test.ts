// The readiness rules of the model picker in their order: gone, needs_key, ready, unknown.
// A model or ensemble is ready only by membership in a trusted ready list; a failed or untrusted list proves nothing.
import { describe, expect, it } from 'vitest';
import { catalogue, catalogueReadiness, classify, ensembleProblems, list, readyTrusted } from './catalogue';
import { claudeMemberProblems, readinessOf } from './readiness';
import type { Evidence } from './read';

const NAMES = { model: 'Model', provider: 'Provider' };
const st = (state: string, via: string | null = null) => ({ state, via, methods: ['api_key'], alternatives: {}, output_cap: true, shares_with: [] });
const PROVIDERS = {
  providers: [
    { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: st('ready', 'included') },
    { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: st('ready', 'stored_key') },
    { id: 'anthropic', prefix: 'anthropic/', display_name: 'Anthropic', status: st('needs_key') },
    { id: 'mistral', prefix: 'mistral/', display_name: 'Mistral', status: st('unknown') },
  ],
};
const MODELS = {
  models: [
    { spec: 'hoody-ai/hoody-free', display_name: 'Hoody Free' },
    { spec: 'openai/gpt-5', display_name: 'GPT-5' },
    { spec: 'openai/gpt-5-mini', display_name: 'GPT-5 mini' },
    { spec: 'anthropic/claude', display_name: 'Claude' },
    { spec: 'mistral/large', display_name: 'Large' },
    { spec: 'fusion/pair', display_name: 'Pair', source: 'fusion', members: ['hoody-ai/hoody-free', 'openai/gpt-5'] },
    { spec: 'fusion/mixed', display_name: 'Mixed', source: 'fusion', members: ['openai/gpt-5', 'anthropic/claude'] },
    { spec: 'fusion/lost', display_name: 'Lost', source: 'fusion', members: ['openai/gpt-5', 'nowhere/x'] },
  ],
};
const READY = { models: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'openai/gpt-5' }, { spec: 'fusion/mixed' }] };

const trusted = () => catalogue({ providers: PROVIDERS, models: MODELS, ready: READY });
// The ready read failed (an agent that reports status): no trusted list.
const failedReady = () => catalogue({ providers: PROVIDERS, models: MODELS });

describe('readiness order', () => {
  it('with a trusted list, a listed model is ready and an unlisted one of a ready provider is unknown', () => {
    const cat = trusted();
    expect(catalogueReadiness(cat, 'openai/gpt-5')).toBe('ready');
    expect(catalogueReadiness(cat, 'openai/gpt-5-mini')).toBe('unknown');
    expect(catalogueReadiness(cat, 'mistral/large')).toBe('unknown');
  });

  it('a failed ready read: the ready provider reads unknown, the needs_key provider still needs setup', () => {
    const cat = failedReady();
    expect(catalogueReadiness(cat, 'openai/gpt-5')).toBe('unknown');
    expect(catalogueReadiness(cat, 'hoody-ai/hoody-free')).toBe('unknown');
    expect(catalogueReadiness(cat, 'anthropic/claude')).toBe('needs_key');
    // The rows the pickers draw follow the same rule.
    const rows = list(cat, 'bot', null, NAMES);
    expect(rows.find((m) => m.spec === 'openai/gpt-5')?.ready).toBe('unknown');
    expect(rows.find((m) => m.spec === 'anthropic/claude')?.ready).toBe('needs_key');
    expect(rows.some((m) => m.ready === 'ready')).toBe(false);
  });

  it('a missing model under a known provider is unknown (kept), never gone', () => {
    expect(catalogueReadiness(trusted(), 'openai/not-in-the-catalogue')).toBe('unknown');
    expect(catalogueReadiness(trusted(), 'anthropic/not-in-the-catalogue')).toBe('needs_key');
  });

  it('a prefix that names no provider and a named ensemble the models read lacks are gone', () => {
    expect(catalogueReadiness(trusted(), 'nowhere/model')).toBe('gone');
    expect(catalogueReadiness(trusted(), 'fusion/missing')).toBe('gone');
  });

  it('an ensemble is ready only by its own membership in the trusted list, not by its members', () => {
    const cat = trusted();
    // Both members are ready, but the ensemble is not on the list.
    expect(catalogueReadiness(cat, 'fusion/pair')).toBe('unknown');
    expect(list(cat, 'bot', null, NAMES).find((m) => m.spec === 'fusion/pair')?.ready).toBe('unknown');
  });

  it('a member that needs setup or is gone makes the ensemble need setup, before membership and after a failed read', () => {
    expect(catalogueReadiness(trusted(), 'fusion/mixed')).toBe('needs_key');
    expect(catalogueReadiness(failedReady(), 'fusion/mixed')).toBe('needs_key');
    expect(catalogueReadiness(trusted(), 'fusion/lost')).toBe('needs_key');
    expect(ensembleProblems(trusted(), 'fusion/mixed')).toEqual(['anthropic/claude']);
    expect(ensembleProblems(trusted(), 'fusion/lost')).toEqual(['nowhere/x']);
  });

  it('an agent without provider status: nothing is ready, whatever its credential probes say', () => {
    const cat = catalogue({
      providers: { providers: PROVIDERS.providers.map(({ status: _s, ...p }) => p) },
      models: MODELS,
      ready: READY,
      auth: { openai: { auth: { ready: true, api_key_stored: true } } },
    } as never);
    expect(catalogueReadiness(cat, 'hoody-ai/hoody-free')).toBe('unknown');
    expect(catalogueReadiness(cat, 'openai/gpt-5')).toBe('unknown');
    expect(list(cat, 'bot', null, NAMES).some((m) => m.ready === 'ready')).toBe(false);
  });

  it('a ready list is trusted only from an agent that reports provider status, however the catalogue was built', () => {
    expect(readyTrusted(trusted())).toBe(true);
    expect(readyTrusted(failedReady())).toBe(false);
    const handBuilt = { ...trusted(), am1: false };
    expect(readyTrusted(handBuilt)).toBe(false);
    expect(catalogueReadiness(handBuilt, 'openai/gpt-5')).toBe('unknown');
  });

  it('a listed row whose provider the providers read lacks is drawn unknown, never gone or needs setup', () => {
    const cat = catalogue({ providers: PROVIDERS, models: { models: [...MODELS.models, { spec: 'orphan/m', display_name: 'Orphan' }] }, ready: READY });
    expect(catalogueReadiness(cat, 'orphan/m')).toBe('gone');
    expect(list(cat, 'bot', null, NAMES).find((m) => m.spec === 'orphan/m')?.ready).toBe('unknown');
  });

  it('classify keeps its name and follows the same order', () => {
    expect(classify('openai/gpt-5', failedReady())).toBe('unknown');
    expect(classify('anthropic/claude', failedReady())).toBe('needs_key');
    expect(classify('openai/gpt-5', null)).toBe('unknown');
  });
});

describe('readinessOf (evidence, spec): Claude Code rows', () => {
  const scope = { account: 'a', realm: 'r', computer: 'p|c|s', gen: 1, boot: 'b' };
  const ev = (claude: Evidence['claude']): Evidence => ({
    seq: 1,
    scope,
    at: 0,
    catalogue: { state: 'ok', value: { cat: trusted(), ready: 'ok', sig: 'x' } },
    claude,
  });
  const set = (state: 'ready' | 'setup' | 'unknown' | 'absent', models = [{ id: 'opus', label: 'Opus' }]) => ({ state: 'ok' as const, value: { state, models, efforts: [] } });

  it('maps the Claude read: ready, setup = needs setup, unknown, absent = gone', () => {
    expect(readinessOf(ev(set('ready')), 'claude-code/opus')).toBe('ready');
    expect(readinessOf(ev(set('setup')), 'claude-code/opus')).toBe('needs_key');
    expect(readinessOf(ev(set('unknown')), 'claude-code/opus')).toBe('unknown');
    expect(readinessOf(ev(set('absent')), 'claude-code')).toBe('gone');
  });

  it('a model the Claude read does not list is gone; Claude default is always listed; a failed read is unknown', () => {
    expect(readinessOf(ev(set('ready')), 'claude-code/haiku')).toBe('gone');
    expect(readinessOf(ev(set('ready')), 'claude-code')).toBe('ready');
    expect(readinessOf(ev({ state: 'failed', err: { kind: 'failed', code: '', status: 503, retryAfter: null, details: {} } }), 'claude-code/opus')).toBe('unknown');
  });

  it('catalogue specs read the catalogue part in the same order', () => {
    expect(readinessOf(ev(null), 'openai/gpt-5')).toBe('ready');
    expect(readinessOf(ev(null), 'nowhere/x')).toBe('gone');
  });
});

describe('an ensemble with a Claude Code member', () => {
  const scope = { account: 'a', realm: 'r', computer: 'p|c|s', gen: 1, boot: 'b' };
  const cat = catalogue({
    providers: PROVIDERS,
    models: { models: [...MODELS.models, { spec: 'fusion/with-claude', display_name: 'With Claude', source: 'fusion', members: ['openai/gpt-5', 'claude-code/opus'] }] },
    ready: { models: [...READY.models, { spec: 'fusion/with-claude' }] },
  });
  const err = { kind: 'failed' as const, code: '', status: 503, retryAfter: null, details: {} };
  const ev = (claude: Evidence['claude']): Evidence => ({ seq: 1, scope, at: 0, catalogue: { state: 'ok', value: { cat, ready: 'ok', sig: 'x' } }, claude });
  const set = (state: 'ready' | 'setup' | 'unknown' | 'absent', models = [{ id: 'opus', label: 'Opus' }]) => ({ state: 'ok' as const, value: { state, models, efforts: [] } });

  it('the catalogue alone never counts a Claude member as a problem: a listed ensemble is ready', () => {
    expect(ensembleProblems(cat, 'fusion/with-claude')).toEqual([]);
    expect(catalogueReadiness(cat, 'fusion/with-claude')).toBe('ready');
    expect(list(cat, 'bot', null, NAMES).find((m) => m.spec === 'fusion/with-claude')?.ready).toBe('ready');
  });

  it('with a Claude read: a ready member keeps it ready; setup, absent or an unlisted model make it need setup', () => {
    expect(readinessOf(ev(set('ready')), 'fusion/with-claude')).toBe('ready');
    expect(readinessOf(ev(set('setup')), 'fusion/with-claude')).toBe('needs_key');
    expect(readinessOf(ev(set('absent')), 'fusion/with-claude')).toBe('needs_key');
    expect(readinessOf(ev(set('ready', [{ id: 'sonnet', label: 'Sonnet' }])), 'fusion/with-claude')).toBe('needs_key');
    expect(claudeMemberProblems(ev(set('setup')), 'fusion/with-claude')).toEqual(['claude-code/opus']);
  });

  it('without a Claude read, or with a failed or loading one, nothing is proven: membership decides', () => {
    expect(readinessOf(ev(null), 'fusion/with-claude')).toBe('ready');
    expect(readinessOf(ev({ state: 'failed', err }), 'fusion/with-claude')).toBe('ready');
    expect(readinessOf(ev({ state: 'loading' }), 'fusion/with-claude')).toBe('ready');
    expect(readinessOf(ev(set('unknown')), 'fusion/with-claude')).toBe('ready');
  });
});
