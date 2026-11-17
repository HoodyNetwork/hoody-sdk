// The provider directory of the model picker: sections per verb, their order, counts, Other ways.
import { describe, expect, it } from 'vitest';
import { catalogue } from './catalogue';
import { directory, type DirProvider } from './directory';
import type { Evidence, Snapshot } from './read';

const st = (state: string, via: string | null = null, o: { output_cap?: boolean; methods?: string[] } = {}) => ({
  state,
  via,
  methods: o.methods ?? ['api_key'],
  alternatives: {},
  output_cap: o.output_cap ?? true,
  shares_with: [],
});
const PROVIDERS = [
  { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: st('ready', 'included', { methods: ['included'] }) },
  { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: st('ready', 'signin', { output_cap: false, methods: ['api_key', 'signin'] }) },
  { id: 'anthropic', prefix: 'anthropic/', display_name: 'Anthropic', status: st('needs_key') },
  { id: 'google', prefix: 'google/', display_name: 'Google', status: st('needs_key') },
  { id: 'mistral', prefix: 'mistral/', display_name: 'Mistral', status: st('unknown') },
  { id: 'zeta', prefix: 'zeta/', display_name: 'zeta', status: st('needs_key') },
  { id: 'alpha', prefix: 'alpha/', display_name: 'Alpha', status: st('needs_key') },
  { id: 'ep10', prefix: 'ep10/', display_name: 'Endpoint 10', custom: true, status: st('needs_key') },
  { id: 'ep2', prefix: 'ep2/', display_name: 'Endpoint 2', custom: true, status: st('needs_key') },
  { id: 'ep-ok', prefix: 'ep-ok/', display_name: 'Endpoint ok', custom: true, status: st('ready', 'stored_key') },
  { id: 'empty', prefix: 'empty/', display_name: 'Empty', status: st('needs_key') },
];
const MODELS = [
  'hoody-ai/hoody-free',
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'anthropic/claude',
  'google/gemini',
  'mistral/large',
  'zeta/z1',
  'alpha/a1',
  'ep10/chat',
  'ep2/chat',
  'ep-ok/chat',
].map((spec) => ({ spec, display_name: spec.split('/')[1] }));
const ENSEMBLE = { spec: 'fusion/pair', display_name: 'Pair', source: 'fusion', members: ['hoody-ai/hoody-free', 'openai/gpt-5'] };
const READY = ['hoody-ai/hoody-free', 'openai/gpt-5', 'ep-ok/chat', 'fusion/pair'];

const scope = { account: 'a', realm: 'global', computer: 'p|c|s', gen: 1, boot: 'b' };
function ev(o: { ready?: 'ok' | 'failed' | 'legacy'; providers?: unknown[]; models?: unknown[]; auth?: Record<string, unknown>; failed?: boolean } = {}): Evidence {
  if (o.failed) return { seq: 1, scope, at: 0, catalogue: { state: 'failed', err: 'failed' } as never, claude: null };
  const ready = o.ready ?? 'ok';
  const cat = catalogue({
    providers: { providers: o.providers ?? PROVIDERS },
    models: { models: [...MODELS, ENSEMBLE, ...(o.models ?? [])] },
    ready: ready === 'ok' ? { models: READY.map((spec) => ({ spec })) } : undefined,
    auth: o.auth as never,
  });
  const value: Snapshot = { cat, ready, sig: 'x' };
  return { seq: 1, scope, at: 0, catalogue: { state: 'ok', value }, claude: null };
}
const ids = (rows: DirProvider[]) => rows.map((r) => r.id);

describe('directory: sections per verb', () => {
  it('choose: Needs attention (current, then endpoints, then unknown, by name), Suggested in its order, All by name; ready providers left out', () => {
    const d = directory(ev(), { purpose: 'bot', verb: 'choose', current: 'anthropic/claude' });
    expect(d.available).toBe(true);
    expect(d.attention.map((r) => [r.id, r.reason])).toEqual([
      ['anthropic', 'current'],
      ['ep2', 'endpoint'],
      ['ep10', 'endpoint'],
      ['mistral', 'unknown'],
    ]);
    expect(d.connected).toEqual([]);
    expect(ids(d.suggested)).toEqual(['google']);
    expect(ids(d.all)).toEqual(['alpha', 'zeta']);
    expect(d.other).toEqual(['endpoint']);
  });

  it('connect: ready providers are Connected (by name) and leave Suggested; the rest as in choose', () => {
    const d = directory(ev(), { purpose: 'bot', verb: 'connect' });
    expect(ids(d.connected)).toEqual(['ep-ok', 'hoody-ai', 'openai']);
    expect(ids(d.attention)).toEqual(['ep2', 'ep10', 'mistral']);
    expect(ids(d.suggested)).toEqual(['anthropic', 'google']);
    expect(ids(d.all)).toEqual(['alpha', 'zeta']);
  });

  it('the default spec is an attention reason after the current one; a ready current provider is not one', () => {
    const d = directory(ev(), { purpose: 'bot', verb: 'choose', current: 'openai/gpt-5', defaultSpec: 'google/gemini' });
    expect(d.attention[0]).toMatchObject({ id: 'google', reason: 'default' });
    expect(ids(d.suggested)).toEqual(['anthropic']);
  });

  it('every provider shows in exactly one section; one with no eligible model shows nowhere', () => {
    for (const verb of ['choose', 'connect'] as const) {
      const d = directory(ev(), { purpose: 'bot', verb, current: 'anthropic/claude' });
      const seen = [...d.attention, ...d.connected, ...d.suggested, ...d.all].map((r) => r.id);
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).not.toContain('empty');
    }
  });

  it('Other ways is always present: endpoint unless hidden, Claude Code only when offered, also with no catalogue', () => {
    expect(directory(ev(), { purpose: 'bot', verb: 'choose', offer: { claude: true } }).other).toEqual(['endpoint', 'claude']);
    expect(directory(ev(), { purpose: 'bot', verb: 'choose', offer: { endpoint: false, claude: true } }).other).toEqual(['claude']);
    const failed = directory(ev({ failed: true }), { purpose: 'bot', verb: 'choose' });
    expect(failed).toMatchObject({ available: false, attention: [], suggested: [], all: [], other: ['endpoint'] });
  });
});

describe('directory: facts per provider', () => {
  it('counts ready, can\'t tell and needs setup apart; payment from via, methods as listed', () => {
    const d = directory(ev(), { purpose: 'bot', verb: 'connect' });
    const openai = d.connected.find((r) => r.id === 'openai')!;
    expect(openai).toMatchObject({ models: 2, ready: 1, unknown: 1, needsKey: 0, pay: 'plan', methods: ['api_key', 'signin'], label: 'OpenAI' });
    expect(d.suggested.find((r) => r.id === 'anthropic')).toMatchObject({ models: 1, ready: 0, needsKey: 1, pay: null });
    expect(d.totals).toEqual({ setupProviders: 6, setupModels: 6, unknownModels: 2 });
  });

  it('a failed ready read gives no ready count (null), never zero', () => {
    const d = directory(ev({ ready: 'failed' }), { purpose: 'bot', verb: 'connect' });
    expect(d.connected.find((r) => r.id === 'openai')!.ready).toBeNull();
  });

  it('purpose explain drops a provider that takes no output cap', () => {
    const d = directory(ev(), { purpose: 'explain', verb: 'connect' });
    expect(ids(d.connected)).toEqual(['ep-ok', 'hoody-ai']);
  });

  it('All providers sorts by name with numbers in order and case ignored', () => {
    const extra = ['Model 10', 'model 9', 'Model 1'].map((n, i) => ({ id: `x${i}`, prefix: `x${i}/`, display_name: n, status: st('needs_key') }));
    const e = ev({ providers: [...PROVIDERS, ...extra], models: extra.map((p) => ({ spec: `${p.id}/m`, display_name: 'm' })) });
    const d = directory(e, { purpose: 'bot', verb: 'choose' });
    expect(d.all.map((r) => r.label)).toEqual(['Alpha', 'Model 1', 'model 9', 'Model 10', 'zeta']);
  });
});

describe('directory: an agent without provider status', () => {
  const OLD = PROVIDERS.map(({ status: _s, ...p }) => p);
  const auth = { openai: { auth: { ready: true, api_key_stored: true } }, anthropic: { auth: { ready: false } } };
  it('Hoody AI ready, a probe that said ready is stored, everyone else not checked; never in Needs attention', () => {
    const d = directory(ev({ ready: 'legacy', providers: OLD, auth }), { purpose: 'bot', verb: 'choose', current: 'anthropic/claude' });
    expect(d.attention).toEqual([]);
    const all = [...d.suggested, ...d.all];
    expect(all.find((r) => r.id === 'openai')).toMatchObject({ state: 'stored', pay: 'own_key', methods: null });
    expect(all.find((r) => r.id === 'anthropic')).toMatchObject({ state: 'not_checked' });
    expect(ids(all)).not.toContain('hoody-ai');
  });
  it('choose keeps a stored provider offered (not proven ready); connect lists it as Connected', () => {
    const choose = directory(ev({ ready: 'legacy', providers: OLD, auth }), { purpose: 'bot', verb: 'choose' });
    expect(ids(choose.suggested)).toContain('openai');
    const connect = directory(ev({ ready: 'legacy', providers: OLD, auth }), { purpose: 'bot', verb: 'connect' });
    expect(ids(connect.connected)).toEqual(['hoody-ai', 'openai']);
  });
});
