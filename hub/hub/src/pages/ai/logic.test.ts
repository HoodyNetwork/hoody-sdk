// Vitest: the pure rules of the AI models page (catalogue, readiness, defaults, checker, Claude Code,
// accounts, impact, spending, words).
// Expected sentences come from strings.en.json through t()/tk(), never hardcoded.
import { describe, expect, it } from 'vitest';
import {
  FREE,
  DECIDE,
  HOODY,
  accountsOf,
  actionsFor,
  botList,
  botRows,
  cap,
  catalogue,
  checkerBanner,
  checkerChoices,
  orderChoices,
  presentOnly,
  orderModels,
  checkerOf,
  claudeCard,
  claudeOf,
  classify,
  connectsKey,
  creditAmount,
  creditText,
  defaultVia,
  defaults,
  disconnectWhat,
  guarded,
  headline,
  helperBackend,
  idText,
  impactOf,
  labelOf,
  list,
  membershipOf,
  modelLabel,
  money,
  names,
  parseVersion,
  probeSet,
  problemOf,
  providerState,
  realmOf,
  since,
  spendTable,
  suggest,
  t,
  tagOf,
  tk,
  usable,
  usableOf,
  usedBy,
  type Account,
} from './logic';
import strings from './strings.en.json';
import { errorText } from './words';
import { failedUi } from './parts/outcome';
import type { Catalogue, Defaults, Model, Outcome, ProviderStatus, Settled } from './types';

const R1 = 'a'.repeat(24);
const R2 = 'b'.repeat(24);
const S = strings as Record<string, string>;

const PROVIDERS = [
  { id: 'hoody-ai', display_name: 'Hoody AI', prefix: 'hoody-ai' },
  { id: 'openai', display_name: 'OpenAI', prefix: 'openai' },
  { id: 'anthropic', display_name: 'Anthropic', prefix: 'anthropic' },
  { id: 'mimo', display_name: 'Xiaomi MiMo', prefix: 'mimo' },
  { id: 'my-endpoint', display_name: 'My endpoint', prefix: 'my-endpoint', custom: true },
];
const MODELS = [
  { spec: FREE, display_name: 'Hoody Free', source: 'provider' },
  { spec: 'openai/gpt-5.5', display_name: 'GPT-5.5', source: 'provider' },
  { spec: 'openai/gpt-5.5-mini', display_name: 'GPT-5.5 mini', source: 'provider' },
  { spec: 'anthropic/claude-opus-5-5', display_name: 'Claude Opus 5.5', source: 'provider' },
  { spec: 'mimo/mimo-v3', display_name: 'MiMo V3', source: 'provider' },
  { spec: 'my-endpoint/m1', display_name: 'M1', source: 'provider' },
  { spec: 'fusion/council', display_name: 'Council', source: 'fusion', members: [FREE, 'openai/gpt-5.5'] },
];
const env = (items: unknown[]) => ({ items });
const st = (state: string, via?: string, outputCap?: boolean): ProviderStatus => ({ state, ...(via ? { via } : {}), ...(outputCap === false ? { output_cap: false } : {}) });

function am1(status: Record<string, ProviderStatus>, ready?: string[]): Catalogue {
  return catalogue({
    providers: env(PROVIDERS.map((p) => ({ ...p, status: status[p.id] ?? (p.id === 'my-endpoint' ? st('needs_key') : st('needs_key')) }))),
    models: env(MODELS),
    ready: ready ? env(ready.map((spec) => ({ spec }))) : undefined,
  });
}
function old(auth: Record<string, Record<string, unknown>> = {}): Catalogue {
  return catalogue({ providers: env(PROVIDERS), models: env(MODELS), auth: Object.fromEntries(Object.entries(auth).map(([k, v]) => [k, { auth: v }])) });
}
const specs = (ms: Model[]) => ms.map((m) => m.spec);
const cat = (c: Catalogue, purpose: string, def: string | null = null) => list(c, purpose, def);

describe('readiness is never invented', () => {
  it('without provider status nothing is ready (no trusted ready list) and Hoody AI is included; unprobed providers are unknown, never needs_key', () => {
    const c = old();
    const by = Object.fromEntries(cat(c, 'default').map((m) => [m.spec, m]));
    expect(by[FREE]).toMatchObject({ ready: 'unknown', pay: 'included', completion: true });
    expect(cat(c, 'default').some((m) => m.ready === 'ready')).toBe(false);
    expect(by['openai/gpt-5.5']?.ready).toBe('unknown');
    expect(cat(c, 'default').some((m) => m.ready === 'needs_key')).toBe(false);
  });
  it('a stored key probe makes a provider ready with pay own_key; a false probe stays unknown', () => {
    const c = old({ anthropic: { ready: true, api_key_stored: true, default: 'api_key' }, mimo: { ready: false } });
    expect(providerState(c, c.byId.anthropic)).toEqual({ state: 'ready', pay: 'own_key', completion: true });
    expect(providerState(c, c.byId.mimo).state).toBe('unknown');
  });
  it('an OpenAI ChatGPT sign-in is the plan and refuses an output cap', () => {
    const c = old({ openai: { ready: true, oauth_stored: true, default: 'oauth' } });
    expect(providerState(c, c.byId.openai)).toEqual({ state: 'ready', pay: 'plan', completion: false });
  });
  it('a provider with no auth needed counts as included', () => {
    const c = old({ mimo: { ready: true, no_auth_ready: true } });
    expect(providerState(c, c.byId.mimo)).toMatchObject({ state: 'ready', pay: 'included' });
  });
  it('an unknown provider is unknown in every field', () => {
    expect(providerState(old(), undefined)).toEqual({ state: 'unknown', pay: 'unknown', completion: false });
  });
  it('with provider status the agent decides state, pay (via) and completion (output_cap)', () => {
    const c = am1({ 'hoody-ai': st('ready', 'included'), openai: st('ready', 'signin', false), anthropic: st('ready', 'external_key'), mimo: st('unknown') });
    expect(c.am1).toBe(true);
    expect(providerState(c, c.byId.openai)).toEqual({ state: 'ready', pay: 'plan', completion: false });
    expect(providerState(c, c.byId.anthropic)).toEqual({ state: 'ready', pay: 'own_key', completion: true });
    expect(providerState(c, c.byId.mimo).state).toBe('unknown');
    expect(providerState(c, c.byId['my-endpoint']).state).toBe('needs_key');
  });
  it('a ready provider model missing from ?ready=true is unknown', () => {
    const c = am1({ 'hoody-ai': st('ready', 'included'), openai: st('ready', 'signin', false) }, [FREE, 'openai/gpt-5.5']);
    const by = Object.fromEntries(cat(c, 'default').map((m) => [m.spec, m.ready]));
    expect(by['openai/gpt-5.5']).toBe('ready');
    expect(by['openai/gpt-5.5-mini']).toBe('unknown');
  });
});

describe('list per purpose', () => {
  const c = am1({ 'hoody-ai': st('ready', 'included'), openai: st('ready', 'signin', false), anthropic: st('ready', 'stored_key') }, [FREE, 'openai/gpt-5.5', 'openai/gpt-5.5-mini', 'anthropic/claude-opus-5-5', 'fusion/council']);
  it('bot lists ensembles last; worker and default never list them', () => {
    const bot = cat(c, 'bot');
    expect(bot[bot.length - 1]?.spec).toBe('fusion/council');
    expect(bot.find((m) => m.source === 'fusion')).toMatchObject({ provider: 'fusion', completion: false });
    for (const p of ['worker', 'default']) expect(cat(c, p).some((m) => m.source === 'fusion')).toBe(false);
  });
  it('explain keeps only ready rows that accept an output cap', () => {
    const ex = cat(c, 'explain');
    expect(specs(ex)).toEqual([FREE, 'anthropic/claude-opus-5-5']);
    expect(ex.every((m) => m.ready === 'ready' && m.completion && m.source === 'provider')).toBe(true);
  });
  it('orders the default first, Hoody Free, ready by account, then unknown, then not connected', () => {
    const c2 = am1({ 'hoody-ai': st('ready', 'included'), anthropic: st('ready', 'stored_key'), mimo: st('unknown') }, [FREE, 'anthropic/claude-opus-5-5']);
    expect(specs(cat(c2, 'default', 'anthropic/claude-opus-5-5')).slice(0, 3)).toEqual(['anthropic/claude-opus-5-5', FREE, 'mimo/mimo-v3']);
    const all = cat(c2, 'default');
    expect(specs(all)).toEqual([FREE, 'anthropic/claude-opus-5-5', 'mimo/mimo-v3', 'my-endpoint/m1', 'openai/gpt-5.5', 'openai/gpt-5.5-mini']);
    expect(all.map((m) => m.ready)).toEqual(['ready', 'ready', 'unknown', 'needs_key', 'needs_key', 'needs_key']);
  });
  it('an unknown purpose lists nothing', () => {
    expect(cat(c, 'everything')).toEqual([]);
  });
  it('an ensemble is ready by its own membership in the ready list; a member not connected makes it needs_key', () => {
    expect(cat(c, 'bot').find((m) => m.spec === 'fusion/council')?.ready).toBe('ready');
    const listedNot = am1({ 'hoody-ai': st('ready', 'included'), openai: st('ready', 'signin', false) }, [FREE, 'openai/gpt-5.5']);
    expect(cat(listedNot, 'bot').find((m) => m.spec === 'fusion/council')?.ready).toBe('unknown');
    const c2 = am1({ 'hoody-ai': st('ready', 'included') }, [FREE, 'fusion/council']);
    expect(cat(c2, 'bot').find((m) => m.spec === 'fusion/council')?.ready).toBe('needs_key');
  });
  it('the agent prefix carries a trailing slash and lookups still match', () => {
    const c2 = catalogue({
      providers: env(PROVIDERS.map((p) => ({ ...p, prefix: `${p.prefix}/`, status: p.id === 'hoody-ai' ? st('ready', 'included') : st('ready', 'stored_key') }))),
      models: env(MODELS),
      ready: env(MODELS.map((m) => ({ spec: m.spec }))),
    });
    expect(classify('anthropic/claude-opus-5-5', c2)).toBe('ready');
    expect(classify('my-endpoint/m1', c2)).toBe('ready');
    expect(cat(c2, 'worker').find((m) => m.spec === 'openai/gpt-5.5')).toMatchObject({ providerLabel: 'OpenAI', providerId: 'openai', ready: 'ready' });
    expect(catalogue({ providers: env([{ id: 'x', display_name: 'X', prefix: '/' }]), models: env([]) }).byPrefix.x?.id).toBe('x');
  });
  it('rows carry no key material even when the probe body had a prefix', () => {
    const c2 = old({ anthropic: { ready: true, api_key_stored: true, api_key_prefix: 'sk-ant-xx' } });
    expect(JSON.stringify(cat(c2, 'bot'))).not.toContain('sk-ant');
  });
  it('the first of two rows with one spec wins', () => {
    const c2 = catalogue({ providers: env(PROVIDERS), models: env([{ spec: 'openai/a', display_name: 'First' }, { spec: 'openai/a', display_name: 'Second' }]) });
    expect(c2.models).toHaveLength(1);
    expect(labelOf('openai/a', c2)).toBe('First');
  });
});

describe('classify: authoritative absence only', () => {
  const c = am1({ 'hoody-ai': st('ready', 'included'), anthropic: st('ready', 'stored_key') }, [FREE, 'anthropic/claude-opus-5-5', 'fusion/council']);
  const rows: Array<[string, string, string]> = [
    ['catalogued under a ready provider', 'anthropic/claude-opus-5-5', 'ready'],
    ['a valid uncatalogued pin under a ready provider is unknown, never gone', 'anthropic/claude-next', 'unknown'],
    ['the same under a provider that needs a key', 'openai/gpt-9', 'needs_key'],
    ['a deleted custom endpoint (prefix gone) is gone', 'old-endpoint/m1', 'gone'],
    ['a missing ensemble is gone', 'fusion/missing', 'gone'],
    ['a present ensemble with a member that needs a key needs a key, even when listed', 'fusion/council', 'needs_key'],
    ['a non-string spec is unknown', 42 as unknown as string, 'unknown'],
  ];
  for (const [name, spec, want] of rows) it(name, () => expect(classify(spec, c)).toBe(want));
  it('failed reads (no catalogue) are unknown, never gone', () => {
    expect(classify('old-endpoint/m1', null)).toBe('unknown');
  });
  it('provider status unknown is unknown even when catalogued', () => {
    expect(classify('mimo/mimo-v3', am1({ 'hoody-ai': st('ready', 'included'), mimo: st('unknown') }))).toBe('unknown');
  });
  it('usableOf maps each class', () => {
    expect(usableOf('ready')).toEqual({ ok: true, reason: 'ready' });
    expect(usableOf('needs_key')).toEqual({ ok: false, reason: 'needs_key' });
    expect(usableOf('gone')).toEqual({ ok: false, reason: 'model_gone' });
    expect(usableOf('unknown')).toEqual({ ok: null, reason: 'unknown' });
    expect(usableOf('whatever')).toEqual({ ok: null, reason: 'unknown' });
  });
});

describe('defaults', () => {
  it('an unpinned configured default has model "" and effective Hoody Free', () => {
    const d = defaults([{ name: 'helper', is_configured_default: true }, { name: 'bot' }]);
    expect(d.helper).toEqual({ agent: 'helper', model: '', effective: FREE });
    expect(d.bots).toEqual({ model: '', effective: FREE });
  });
  it('a pinned default and a Bot pin are reported as the row values', () => {
    const d = defaults([{ name: 'general', model: 'anthropic/claude-opus-5-5', is_configured_default: true }, { name: 'bot', model: 'mimo/mimo-v3' }]);
    expect(d.helper.effective).toBe('anthropic/claude-opus-5-5');
    expect(d.bots).toEqual({ model: 'mimo/mimo-v3', effective: 'mimo/mimo-v3' });
  });
  it('an explicit pin equal to the shipped default reads like the built-in one', () => {
    const a = defaults([{ name: 'general', model: FREE, is_configured_default: true }]);
    const b = defaults([{ name: 'general', is_configured_default: true }]);
    expect(a.helper.effective).toBe(b.helper.effective);
    expect(Object.keys(a.helper).sort()).toEqual(['agent', 'effective', 'model']);
  });
  it('no configured default row means agent "" and Hoody Free; a paid general pin is never consulted', () => {
    expect(defaults([{ name: 'general', model: 'anthropic/claude-opus-5-5' }]).helper).toEqual({ agent: '', model: '', effective: FREE });
  });
  it('others lists rows with their own model that differs from the helper default', () => {
    const d = defaults([
      { name: 'general', is_configured_default: true },
      { name: 'bot', model: 'x/y' },
      { name: 'writer', model: 'openai/gpt-5.5' },
      { name: 'same', model: FREE },
      { name: 'inherit' },
    ]);
    expect(d.others).toEqual([{ agent: 'writer', model: 'openai/gpt-5.5' }]);
  });
  it('bad rows are skipped', () => {
    expect(defaults([null, 'x', { model: 'a/b' }, 3]).others).toEqual([]);
  });
});

describe('suggest', () => {
  const m = (spec: string, ready: Model['ready']) => ({ spec, ready }) as Model;
  it('suggests Hoody Free when listed and ready', () => expect(suggest([m(FREE, 'ready')])).toBe(FREE));
  it('suggests nothing otherwise, and never another spec', () => {
    expect(suggest([m(FREE, 'unknown'), m('anthropic/claude-opus-5-5', 'ready')])).toBe(null);
    expect(suggest([m('anthropic/claude-opus-5-5', 'ready'), m('openai/gpt-5.5', 'ready')])).toBe(null);
    expect(suggest([])).toBe(null);
  });
});

describe('usable', () => {
  const d = defaults([{ name: 'general', is_configured_default: true, model: 'openai/gpt-5.5' }]);
  const c = am1({ 'hoody-ai': st('ready', 'included') }, [FREE]);
  it('no defaults is unknown', () => expect(usable(null, c, null)).toEqual({ ok: null, reason: 'unknown', spec: null }));
  it('the effective model decides when Claude Code is not selected', () => {
    expect(usable(d, c, null)).toEqual({ ok: false, reason: 'needs_key', spec: 'openai/gpt-5.5' });
    expect(usable(defaults([]), c, null)).toMatchObject({ ok: true, reason: 'ready', spec: FREE });
  });
  it('a Claude Code selection decides on its own', () => {
    const cc = (selected: boolean | null, inUse: boolean) => ({ selected, inUse }) as never;
    expect(usable(d, c, cc(null, false))).toEqual({ ok: null, reason: 'unknown', spec: null });
    expect(usable(d, c, cc(true, true))).toEqual({ ok: true, reason: 'ready', spec: null });
    expect(usable(d, c, cc(true, false))).toEqual({ ok: false, reason: 'claude_code_not_ready', spec: null });
    expect(usable(d, c, cc(false, false)).spec).toBe('openai/gpt-5.5');
  });
});

// Hoody AI is named by the Hub; every other provider is named as the agent names it (core providers).
describe('names in the catalogue', () => {
  const catalog = () =>
    catalogue({
      providers: env([...PROVIDERS, { id: 'up', display_name: 'Upstream', prefix: 'up' }]),
      models: env([
        ...MODELS,
        { spec: 'up/auto', display_name: 'Upstream Auto' },
        { spec: 'up/meta/llama-5', display_name: 'Llama 5' },
        { spec: 'up/x', display_name: 'Upstream' },
        { spec: 'fusion/up', display_name: 'Upstream mix', source: 'fusion', members: ['up/auto'] },
      ]),
    });
  const userText = (ms: Model[]) => JSON.stringify(ms.map(({ spec: _s, provider: _p, providerId: _i, ...rest }) => rest));

  it('another provider reads by its own names: the provider, its models and an ensemble that names it', () => {
    const ms = cat(catalog(), 'bot');
    const by = Object.fromEntries(ms.map((m) => [m.spec, m]));
    expect(by['up/auto']).toMatchObject({ providerLabel: 'Upstream', label: 'Upstream Auto', provider: 'up' });
    expect(by['up/meta/llama-5']?.label).toBe('Llama 5');
    expect(by['up/x']?.label).toBe('Upstream');
    expect(by['fusion/up']?.label).toBe('Upstream mix');
    expect(labelOf('up/auto', catalog())).toBe('Upstream Auto');
  });
  it('a model under Hoody AI that is not in Hoody\'s own form reads as a generic model, whatever name the agent sends', () => {
    const c = catalogue({
      providers: env(PROVIDERS),
      models: env([
        ...MODELS,
        { spec: 'hoody-ai/up-auto', display_name: 'Upstream Auto' },
        { spec: 'hoody-ai/llama', display_name: 'Upstream: Llama 5' },
        { spec: 'hoody-ai/upstream' },
        { spec: 'hoody-ai/up-stream', display_name: 'Up-Stream' },
        { spec: 'hoody-ai/x1', display_name: 'UpUpstreamstream' },
      ]),
    });
    const ms = cat(c, 'bot').filter((m) => m.providerId === HOODY);
    const by = Object.fromEntries(ms.map((m) => [m.spec, m]));
    for (const s of ['hoody-ai/up-auto', 'hoody-ai/llama', 'hoody-ai/upstream', 'hoody-ai/up-stream', 'hoody-ai/x1']) {
      expect(by[s], s).toMatchObject({ label: t('name.model'), provider: 'hoody-ai', providerLabel: 'Hoody AI' });
      expect(labelOf(s, c), s).toBeNull();
    }
    expect(by[FREE]?.label).toBe('Hoody Free');
    expect(userText(ms)).not.toMatch(/up[\W_]*stream/i);
  });
  it('the Hoody AI provider reads as "Hoody AI", whatever name the agent sends for it', () => {
    for (const display_name of ['Hoody AI (Upstream)', 'Hoody AI via Upstream', 'Upstream', '']) {
      const c = catalogue({ providers: env([{ id: HOODY, display_name }]), models: env([{ spec: FREE, display_name: 'Hoody Free' }]) });
      expect(cat(c, 'worker')[0]?.providerLabel, display_name).toBe('Hoody AI');
    }
  });
  it('a model whose provider row is absent reads its provider id, never "undefined"', () => {
    const c = catalogue({ providers: env([]), models: env([{ spec: 'up/meta/llama-5', display_name: 'Llama 5' }]) });
    expect(cat(c, 'worker')[0]).toMatchObject({ label: 'Llama 5', providerLabel: 'up', provider: 'up' });
  });
  it('idText shows a raw id whole, a Hoody AI model id only in Hoody\'s own form, and falls back to the generic word', () => {
    expect(idText('up/auto')).toBe('up/auto');
    expect(idText('up')).toBe('up');
    expect(idText(FREE)).toBe(FREE);
    expect(idText('hoody-ai/upstream/auto')).toBe('hoody-ai');
    expect(idText(undefined)).toBe(t('name.provider'));
  });
});

describe('capabilities and probe set', () => {
  it('parseVersion keeps supported capabilities; only an absent one selects the older path', () => {
    const caps = parseVersion({
      capabilities: [
        { name: 'provider_oauth_device', supported: true, available: true },
        { name: 'acp_default', supported: true, available: false },
        { name: 'jev_realm_settings', supported: false },
        { name: 'Bad Name', available: true },
        null,
      ],
    });
    expect(caps).toEqual({ provider_oauth_device: true, acp_default: false });
    expect(cap(caps, 'provider_oauth_device')).toBe(true);
    expect(cap(caps, 'acp_default')).toBe(false);
    expect(cap(caps, 'jev_realm_settings')).toBe(false);
    expect(cap(null, 'x')).toBe(false);
    expect(parseVersion('nope')).toEqual({});
  });
  it('the probe set lists wanted providers first, the named tiles, custom endpoints; never Hoody AI; at most 11', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `c${String(i).padStart(2, '0')}`, display_name: 'x', custom: true }));
    const c = catalogue({ providers: env([...PROVIDERS, { id: 'openrouter', display_name: 'x' }, { id: 'google', display_name: 'x' }, ...many]), models: env(MODELS) });
    const ids = probeSet(c, ['my-endpoint/m1', FREE]);
    expect(ids).toHaveLength(11);
    // SUGGESTED order: openai, anthropic, google, openrouter, mimo.
    expect(ids.slice(0, 6)).toEqual(['my-endpoint', 'openai', 'anthropic', 'google', 'openrouter', 'mimo']);
    expect(ids).not.toContain('hoody-ai');
  });
});

describe('realmOf', () => {
  it('a computer in no realm reads global; in one realm reads it; several give the selection when listed, else null', () => {
    expect(realmOf([], 'all')).toBe('global');
    expect(realmOf([R1], 'all')).toBe(R1);
    expect(realmOf([R1, R2], R2)).toBe(R2);
    expect(realmOf([R1, R2], 'all')).toBe(null);
    expect(realmOf([R1, R2], 'c'.repeat(24))).toBe(null);
  });
  it('unknown membership gives the selected realm, or null in All mode', () => {
    expect(realmOf(null, R1)).toBe(R1);
    expect(realmOf(null, 'all')).toBe(null);
    expect(realmOf(null, null)).toBe(null);
  });
  it('ignores malformed realm ids', () => {
    expect(realmOf(['nope'], null)).toBe('global');
  });
});

// The computer's record as realmOf's input (New chat and the AI sub-pages under All realms): proof or not told, never a
// list with entries left out (a record with no or a malformed realm_ids read as "no realm" ran in Global).
describe('membershipOf', () => {
  const C = 'c0a7150000000000000000a1';
  it("the computer's own list of realm ids, empty included (the only proof of no realm)", () => {
    expect(membershipOf({ id: C, realm_ids: [] }, C)).toEqual([]);
    expect(membershipOf({ id: C, realm_ids: [R1] }, C)).toEqual([R1]);
    expect(membershipOf({ id: C, name: 'atlas', realm_ids: [R1, R2] }, C)).toEqual([R1, R2]);
  });
  it('another computer, or no record: not told', () => {
    expect(membershipOf({ id: 'other', realm_ids: [] }, C)).toBe(null);
    expect(membershipOf({ realm_ids: [] }, C)).toBe(null);
    for (const r of [undefined, null, 'x', 7, [], [{ id: C, realm_ids: [] }]]) expect(membershipOf(r, C)).toBe(null);
  });
  it('realm_ids missing, null or not a list: not told, never no realm', () => {
    expect(membershipOf({ id: C }, C)).toBe(null);
    expect(membershipOf({ id: C, realm_ids: null }, C)).toBe(null);
    expect(membershipOf({ id: C, realm_ids: R1 }, C)).toBe(null);
    expect(membershipOf({ id: C, realm_ids: { 0: R1 } }, C)).toBe(null);
  });
  it('any entry that is not a realm id makes the whole list not told (none is dropped)', () => {
    for (const bad of [['nope'], ['nope', R1], [R1, 7], [R1.toUpperCase()], [null], ['global'], ['all']]) {
      expect(membershipOf({ id: C, realm_ids: bad }, C)).toBe(null);
    }
  });
  it('with realmOf: not told is never Global', () => {
    expect(realmOf(membershipOf({ id: C, realm_ids: null }, C), null)).toBe(null);
    expect(realmOf(membershipOf({ id: C, realm_ids: ['nope'] }, C), null)).toBe(null);
    expect(realmOf(membershipOf({ id: C, realm_ids: [] }, C), null)).toBe('global');
  });
});

// ── checker ───────────────────────────────────────────────────────────────────────────────

describe('checker', () => {
  const eff = (e: unknown): Settled<unknown> => ({ ok: true, body: { effective: e } });
  const rows: Array<[string, Settled<unknown> | null, { realm: string | null; realmSettings: boolean }, Record<string, unknown>]> = [
    ['per-realm disabled', eff({ enabled: false, model: DECIDE, usable: false }), { realm: R1, realmSettings: true }, { usable: 'no', reason: 'disabled', state: 'disabled', enabled: false }],
    ['per-realm usable', eff({ enabled: true, model: DECIDE, usable: true, key_ready: true }), { realm: R1, realmSettings: true }, { usable: 'yes', reason: 'ok', state: 'configured', model: DECIDE }],
    ['per-realm no key', eff({ enabled: true, model: 'openai/gpt-5.5-mini', usable: false, key_ready: false }), { realm: 'global', realmSettings: true }, { usable: 'no', reason: 'no_model_key', state: 'unconfigured' }],
    ['per-realm otherwise unusable', eff({ enabled: true, model: 'x/y', usable: false, key_ready: true }), { realm: R1, realmSettings: true }, { usable: 'no', reason: 'model_unavailable', state: 'unconfigured' }],
    ['per-realm effective missing', { ok: true, body: { enabled: true } }, { realm: R1, realmSettings: true }, { usable: 'unknown', reason: 'read_failed', state: 'unknown' }],
    // An agent from before per-realm settings answers flat fields with no `effective`: they prove nothing, a read like a failed one.
    ['old agent global disabled reads failed', { ok: true, body: { enabled: false, effective_model: 'openai/x', key_set: false } }, { realm: 'global', realmSettings: false }, { usable: 'unknown', reason: 'read_failed', state: 'unknown', enabled: null, model: null }],
    ['old agent global hoody-decide reads failed', { ok: true, body: { enabled: true, effective_model: DECIDE, key_set: false } }, { realm: 'global', realmSettings: false }, { usable: 'unknown', reason: 'read_failed', state: 'unknown', enabled: null, model: null }],
    ['old agent global key set reads failed', { ok: true, body: { enabled: true, effective_model: 'openai/x', key_set: true } }, { realm: 'global', realmSettings: false }, { usable: 'unknown', reason: 'read_failed', state: 'unknown', enabled: null, model: null }],
    ['old agent named realm', null, { realm: R2, realmSettings: false }, { usable: 'unknown', reason: 'old_agent', state: 'unknown', enabled: null, model: null }],
    ['read failed', { ok: false, err: { kind: 'pending', code: '', status: 0, retryAfter: null, details: {} } }, { realm: R1, realmSettings: true }, { usable: 'unknown', reason: 'read_failed', state: 'unknown', enabled: null, model: null }],
  ];
  for (const [name, read, o, want] of rows) it(`checkerOf: ${name}`, () => expect(checkerOf(read, o)).toMatchObject(want));
  it('checkerOf has exactly the frozen shape', () => {
    expect(Object.keys(checkerOf(null, { realm: R1, realmSettings: true })).sort()).toEqual(['enabled', 'label', 'model', 'reason', 'state', 'usable']);
  });

  const bot = (realm: string, extra: Record<string, unknown> = {}) => ({ id: 'b', realm, guardrails: 'no', guardrail_check: 'strict', ...extra });
  it('guarded counts Bots with guardrails whose check is not off, by realm', () => {
    expect(
      guarded([
        bot('global'),
        bot('global', { guardrail_check: 'lenient' }),
        bot(R1, { guardrail_check: '' }),
        bot(R1, { guardrail_check: undefined }),
        bot(R2, { guardrail_check: 'off' }),
        bot(R2, { guardrails: '   ' }),
        bot(R2, { guardrails: undefined }),
        bot(R2, { owned_elsewhere: true }),
        bot('all'),
        bot('A'.repeat(24)),
        null,
        'x',
      ]),
    ).toEqual({ global: 2, [R1]: 2 });
  });
  it('checkerBanner: only an unusable checker; fix only where a write reaches; an older agent says so for a named realm only', () => {
    const no = { usable: 'no', reason: 'no_model_key' } as never;
    expect(checkerBanner(no, 'global', false)).toEqual({ kind: 'banner', fix: true, off: false });
    expect(checkerBanner(no, R1, true)).toEqual({ kind: 'banner', fix: true, off: false });
    expect(checkerBanner(no, R1, false)).toEqual({ kind: 'banner', fix: false, off: false });
    expect(checkerBanner({ usable: 'no', reason: 'disabled' } as never, R1, true)).toEqual({ kind: 'banner', fix: true, off: true });
    expect(checkerBanner({ usable: 'unknown', reason: 'old_agent' } as never, R1, false)).toEqual({ kind: 'old', fix: false, off: false });
    expect(checkerBanner({ usable: 'unknown', reason: 'old_agent' } as never, 'global', false)).toBeNull();
    expect(checkerBanner({ usable: 'unknown', reason: 'read_failed' } as never, R1, true)).toBeNull();
    expect(checkerBanner({ usable: 'yes', reason: 'ok' } as never, R1, true)).toBeNull();
  });
  it('model lists sort by provider then name with the current one first; checker choices sort by name with Hoody\'s first', () => {
    const m = (spec: string, label: string, providerLabel: string) => ({ spec, label, providerLabel }) as never;
    const list = [m('c/z', 'Zed', 'Cohere'), m('a/b', 'Beta', 'Anthropic'), m('a/a', 'Alpha', 'Anthropic'), m('o/x', 'Xi', 'OpenAI')];
    expect(orderModels(list, 'o/x').map((x: { spec: string }) => x.spec)).toEqual(['o/x', 'a/a', 'a/b', 'c/z']);
    expect(orderModels(list, '').map((x: { spec: string }) => x.spec)).toEqual(['a/a', 'a/b', 'c/z', 'o/x']);
    const c = orderChoices([{ spec: 'p/b', label: 'Beta' }, { spec: DECIDE, label: 'Zeta' }, { spec: 'p/a', label: 'alpha' }]);
    expect(c.map((x) => x.spec)).toEqual([DECIDE, 'p/a', 'p/b']);
  });
  it('presentOnly keeps a selection only while the account is still listed (a sign-out in another tab drops it)', () => {
    const a = { id: 'openai' };
    expect(presentOnly(a, [{ id: 'openai' }, { id: 'x' }])).toBe(a);
    expect(presentOnly(a, [{ id: 'x' }])).toBeNull();
    expect(presentOnly(a, null)).toBe(a); // not read yet: unknown is not "gone"
    expect(presentOnly(null, [{ id: 'x' }])).toBeNull();
  });
  it('checkerChoices lists Hoody checker plus models whose key is set; another model under Hoody AI is named only in Hoody\'s own form', () => {
    const c = checkerChoices({
      models: [
        { spec: DECIDE, key_set: false },
        { spec: 'a/b', display_name: 'B', key_set: true },
        { spec: 'c/d', display_name: 'D', key_set: false },
        { spec: 'up/x', display_name: 'Upstream X', key_set: true },
        { spec: 'hoody-ai/y', display_name: 'Upstream Y', key_set: true },
        null,
      ],
    });
    expect(c).toEqual([
      { spec: DECIDE, label: t('name.checker') },
      { spec: 'a/b', label: 'B' },
      { spec: 'up/x', label: 'Upstream X' },
      { spec: 'hoody-ai/y', label: t('name.customChecker') },
    ]);
    expect(checkerChoices(null)).toEqual([]);
  });
});

// ── Claude Code ───────────────────────────────────────────────────────────────────────────

describe('Claude Code reducer', () => {
  const ok = (row: Record<string, unknown> | null): Settled<unknown> => ({ ok: true, body: { status: 'ok', report: { agents: [row ? { name: 'claude', ...row } : { name: 'codex' }] } } });
  const fail = (status: number, code = ''): Settled<unknown> => ({ ok: false, err: { kind: 'failed', code, status, retryAfter: null, details: {} } });
  const base = { installed: true, logged_in: 'logged_in', enabled: true, startable: true };
  const rows: Array<[string, Settled<unknown>, string]> = [
    ['read failed', { ok: false, err: { kind: 'pending', code: '', status: 0, retryAfter: null, details: {} } }, 'unknown'],
    ['404 unknown_agent', fail(404, 'unknown_agent'), 'unavailable'],
    ['no claude row', ok(null), 'unavailable'],
    ['missing_launcher flag', ok({ ...base, installed: false, missing_launcher: true }), 'agent_update'],
    ['install_state missing_launcher', ok({ ...base, install_state: 'missing_launcher' }), 'agent_update'],
    ['probe_failure', ok({ ...base, install_state: 'probe_failure' }), 'check_failed'],
    ['not installed', ok({ ...base, installed: false }), 'not_installed'],
    ['missing_binary', ok({ ...base, install_state: 'missing_binary' }), 'not_installed'],
    ['unsupported_version', ok({ ...base, install_state: 'unsupported_version' }), 'outdated'],
    ['logged_out', ok({ ...base, logged_in: 'logged_out' }), 'signed_out'],
    ['logged_in error', ok({ ...base, logged_in: 'error' }), 'sign_in_unknown'],
    ['logged_in unknown', ok({ ...base, logged_in: 'unknown' }), 'sign_in_unknown'],
    ['logged_in', ok(base), 'signed_in'],
  ];
  for (const [name, acp, want] of rows) it(`state: ${name}`, () => expect(claudeOf(acp, null).state).toBe(want));
  it('the top-level agents list (not the report envelope) reads unavailable', () => {
    expect(claudeOf({ ok: true, body: { status: 'ok', agents: [{ name: 'claude', ...base }] } }, null).state).toBe('unavailable');
  });
  it('"in use" is true only for signed_in, enabled, selected and startable (16 rows)', () => {
    let n = 0;
    for (const signed of [true, false])
      for (const enabled of [true, false])
        for (const sel of [true, false])
          for (const startable of [true, false]) {
            const c = claudeOf(ok({ ...base, logged_in: signed ? 'logged_in' : 'logged_out', enabled, startable }), { ok: true, body: { delegated_agent: sel ? 'claude' : '' } });
            expect(c.inUse).toBe(signed && enabled && sel && startable);
            n++;
          }
    expect(n).toBe(16);
  });
  it('selected is false without acp default and null when its read failed', () => {
    expect(claudeOf(ok(base), null).selected).toBe(false);
    expect(claudeOf(ok(base), fail(500)).selected).toBe(null);
  });
  it('helperBackend: claude_code only when selected and in use; unknown when a read could not tell', () => {
    const sel: Settled<unknown> = { ok: true, body: { delegated_agent: 'claude' } };
    expect(helperBackend(claudeOf(ok(base), sel))).toBe('claude_code');
    expect(helperBackend(claudeOf(ok({ ...base, startable: false }), sel))).toBe('hoody');
    expect(helperBackend(claudeOf({ ok: false, err: { kind: 'pending', code: '', status: 0, retryAfter: null, details: {} } }, sel))).toBe('unknown');
    expect(helperBackend(claudeOf(ok(base), fail(500)))).toBe('unknown');
    expect(helperBackend(claudeOf(ok(base), { ok: true, body: { delegated_agent: '' } }))).toBe('hoody');
  });
  it('setup_user and the hints pass through; login_verified is kept apart', () => {
    const c = claudeOf(ok({ ...base, setup_user: 'user', install_hint: 'i', login_hint: 'l', login_verified: true }), null);
    expect(c).toMatchObject({ setupUser: 'user', installHint: 'i', loginHint: 'l', loginVerified: true });
  });

  describe('claudeCard', () => {
    const cc = (state: string, over: Record<string, unknown> = {}) => ({ state, enabled: true, selected: false, startable: true, inUse: false, loginVerified: false, ...over }) as never;
    it('each state offers its action and a state key defined in the strings', () => {
      const acts: Record<string, string | null> = { unknown: 'check', check_failed: 'check', not_installed: 'install', outdated: 'update', signed_out: 'login', sign_in_unknown: 'login', signed_in: null, unavailable: null, agent_update: null };
      for (const [state, act] of Object.entries(acts)) {
        const card = claudeCard(cc(state), { acpDefault: true });
        expect(card.act).toBe(act);
        expect(S[card.state]).toBeTruthy();
      }
    });
    it('a verified sign-in uses the verified line', () => {
      expect(claudeCard(cc('signed_in', { loginVerified: true }), { acpDefault: true }).state).toBe('cc.signed_in_verified');
    });
    it('selection lines', () => {
      const card = (over: Record<string, unknown>, acpDefault = true) => claudeCard(cc('signed_in', over), { acpDefault });
      expect(card({ selected: true, inUse: true })).toMatchObject({ sel: 'claude.inUse', selAct: 'undo' });
      expect(claudeCard(cc('signed_out', { selected: true }), { acpDefault: true })).toMatchObject({ sel: 'claude.notReady', selAct: 'undo' });
      expect(card({ selected: true, enabled: false })).toMatchObject({ sel: 'claude.off', selAct: 'turnOn' });
      expect(card({ selected: true, startable: false })).toMatchObject({ sel: 'claude.cantStart', selAct: 'check' });
      expect(card({ selected: false })).toMatchObject({ sel: null, selAct: 'use' });
      expect(card({ selected: false }, false)).toMatchObject({ sel: 'claude.needUpdate', selAct: null });
      expect(card({ selected: null })).toMatchObject({ sel: null, selAct: null });
      for (const k of ['claude.inUse', 'claude.notReady', 'claude.off', 'claude.cantStart', 'claude.needUpdate']) expect(S[k]).toBeTruthy();
    });
  });
});

// ── accounts ──────────────────────────────────────────────────────────────────────────────

describe('accountsOf, actions and impact', () => {
  const c = am1({ 'hoody-ai': st('ready', 'included'), openai: st('ready', 'signin'), anthropic: st('ready', 'stored_key'), mimo: st('needs_key') });
  const models = cat(c, 'worker');
  const providers = { items: PROVIDERS.map((p) => ({ ...p, status: { 'hoody-ai': st('ready', 'included'), openai: st('ready', 'signin'), anthropic: st('ready', 'stored_key'), mimo: st('needs_key'), 'my-endpoint': st('needs_key') }[p.id] })) };

  it('lists Hoody AI first, then ready accounts by name, and a custom endpoint even without a key', () => {
    const rows = accountsOf(models, providers) ?? [];
    expect(rows.map((a) => a.id)).toEqual(['hoody-ai', 'anthropic', 'my-endpoint', 'openai']);
    expect(rows.find((a) => a.id === 'openai')).toMatchObject({ ready: true, via: 'signin' });
    expect(rows.find((a) => a.id === 'my-endpoint')).toMatchObject({ ready: false, custom: true });
  });
  it('on an older agent a provider counts when its provider line is ready (Hoody AI, a probe that said ready), though no model reads ready', () => {
    const o = old({ anthropic: { ready: true, api_key_stored: true } });
    const rows = accountsOf(cat(o, 'worker'), null) ?? [];
    expect(rows.map((a) => a.id)).toEqual(['hoody-ai', 'anthropic']);
    expect(rows[1]?.pay).toBe('own_key');
  });
  it('is null when neither read answered', () => expect(accountsOf(null, null)).toBeNull());
  it('names an account as the agent names it; the Hoody AI account reads "Hoody AI" whatever name the agent sends', () => {
    const rows = accountsOf(null, { items: [{ id: 'up', display_name: 'Upstream', status: st('ready', 'stored_key') }, { id: HOODY, display_name: 'Hoody AI on Upstream', status: st('ready', 'included') }] }) ?? [];
    expect(rows.find((a) => a.id === 'up')?.label).toBe('Upstream');
    expect(rows.find((a) => a.id === HOODY)?.label).toBe('Hoody AI');
  });

  const acc = (over: Partial<Account>): Account => ({ id: 'x', prefix: 'x', label: 'X', ready: true, pay: 'unknown', custom: false, via: null, status: null, ...over });
  it('connectsKey names how the account connects', () => {
    expect(connectsKey(acc({ via: 'included' }))).toBe('page.accIncluded');
    expect(connectsKey(acc({ via: 'stored_key' }))).toBe('page.accKey');
    expect(connectsKey(acc({ via: 'external_key' }))).toBe('page.accExternal');
    expect(connectsKey(acc({ via: 'signin' }))).toBe('page.accPlan');
    expect(connectsKey(acc({ pay: 'own_key' }))).toBe('page.accKey');
    expect(connectsKey(acc({}))).toBe('page.accReady');
  });
  it('actionsFor offers only what each account can do', () => {
    expect(actionsFor(acc({ id: 'hoody-ai' }))).toEqual([]);
    expect(actionsFor(acc({ via: 'included' }))).toEqual([]);
    expect(actionsFor(acc({ custom: true }))).toEqual(['edit', 'replace', 'test', 'disconnect']);
    expect(actionsFor(acc({ via: 'signin' }))).toEqual(['disconnect']);
    expect(actionsFor(acc({ via: 'external_key' }))).toEqual(['test']);
    expect(actionsFor(acc({ via: 'stored_key' }))).toEqual(['replace', 'test', 'disconnect']);
  });
  it('disconnectWhat tells endpoint, sign-in and key apart', () => {
    expect(disconnectWhat(acc({ custom: true }))).toBe('endpoint');
    expect(disconnectWhat(acc({ via: 'signin' }))).toBe('signin');
    expect(disconnectWhat(acc({ pay: 'plan' }))).toBe('signin');
    expect(disconnectWhat(acc({ via: 'stored_key' }))).toBe('key');
  });
  it('usedBy counts Bots on the account, skipping rows another process serves, using the default for unpinned Bots', () => {
    const d = defaults([{ name: 'bot', model: 'openai/gpt-5.5' }]);
    const bots = [{ model: 'openai/gpt-5.5-mini' }, {}, { model: 'anthropic/x' }, { model: 'openai/z', owned_elsewhere: true }, null];
    expect(usedBy(acc({ prefix: 'openai' }), d, bots)).toBe(2);
    expect(usedBy(acc({ prefix: 'anthropic' }), d, bots)).toBe(1);
    expect(usedBy(acc({ prefix: 'openai' }), null, null)).toBe(0);
  });
  it('botList and botRows read either envelope; botRows is null when a row cannot be read', () => {
    expect(botList({ items: [{ id: 'a' }, 3] })).toEqual([{ id: 'a' }]);
    expect(botList({ bots: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
    expect(botList('x')).toBeNull();
    expect(botRows({ items: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
    expect(botRows({ items: [{ id: 'a', owned_elsewhere: true }] })).toBeNull();
  });
  it('names caps the list with an "and more" line', () => {
    expect(names(['a', 'b'])).toBe('a, b');
    expect(names(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBe(t('page.andMore', { names: 'a, b, c, d, e', n: 2 }));
  });

  describe('impactOf', () => {
    const d = defaults([{ name: 'general', is_configured_default: true }, { name: 'writer', model: 'openai/gpt-5.5' }]);
    const bots = [{ name: 'Follower' }, { id: 'b2', model: 'x/y' }, { name: 'Routed', routing: { light: { model: 'a/b' } } }];
    it('splits Bots into followers, own model and per-task models', () => {
      expect(impactOf('both', d, bots)).toEqual({ known: true, follow: ['Follower', 'Routed'], own: ['b2'], task: ['Routed'], agents: ['writer'] });
    });
    it('names agents only when the helper changes', () => {
      expect(impactOf('bots', d, bots).agents).toEqual([]);
      expect(impactOf('helper', d, bots).agents).toEqual(['writer']);
    });
    it('an unreadable Bot list is unknown, never empty', () => {
      expect(impactOf('bots', d, null)).toMatchObject({ known: false, follow: null, own: [], task: [] });
    });
  });
});

// ── "Now using" ───────────────────────────────────────────────────────────────────────────

describe('problems and the headline', () => {
  const c = am1({ 'hoody-ai': st('ready', 'included'), openai: st('needs_key'), anthropic: st('ready', 'stored_key') });
  const models = cat(c, 'worker');
  const withHelper = (spec: string, bots = spec): Defaults => ({ helper: { agent: 'general', model: spec, effective: spec }, bots: { model: bots, effective: bots }, others: [] });

  it('problemOf names the provider and model of a default that needs a key', () => {
    const d = withHelper('openai/gpt-5.5');
    expect(problemOf(usableOf('needs_key'), d, models)).toEqual({ kind: 'needs_key', providerId: 'openai', provider: 'OpenAI', model: 'GPT-5.5' });
  });
  it('a default the catalogue does not list reads generic words', () => {
    const p = problemOf(usableOf('needs_key'), withHelper('zz/unknown'), models);
    expect(p).toMatchObject({ providerId: null, provider: t('name.provider'), model: t('name.model') });
  });
  it('model_gone and claude problems, and none when fine', () => {
    const d = withHelper(FREE);
    expect(problemOf(usableOf('gone'), d, models)).toEqual({ kind: 'model_gone' });
    expect(problemOf({ ok: false, reason: 'claude_code_not_ready' }, d, models)).toEqual({ kind: 'claude' });
    expect(problemOf(usableOf('ready'), d, models)).toBeNull();
    expect(problemOf(usableOf('needs_key'), null, models)).toBeNull();
  });
  it('modelLabel never shows a raw spec', () => {
    expect(modelLabel(models, 'openai/gpt-5.5')).toBe('GPT-5.5');
    expect(modelLabel(models, FREE)).toBe('Hoody Free');
    expect(modelLabel([], FREE)).toBe('Hoody Free');
    expect(modelLabel([], 'zz/unknown')).toBe(t('name.model'));
  });
  it('headline: one model for everything, a split, and Claude Code', () => {
    expect(headline(withHelper(FREE), models, 'box')).toBe(t('page.headFree', { computer: 'box', model: 'Hoody Free' }));
    expect(headline(withHelper('anthropic/claude-opus-5-5'), models, 'box')).toBe(t('page.headModel', { computer: 'box', model: 'Claude Opus 5.5' }));
    expect(headline(withHelper(FREE, 'openai/gpt-5.5'), models, 'box')).toBe(t('page.headSplit', { computer: 'box', model: 'Hoody Free', bots: 'GPT-5.5' }));
    expect(headline({ ...withHelper(FREE), helperBackend: 'claude_code' }, models, 'box')).toBe(t('page.headClaude', { computer: 'box', model: 'Hoody Free' }));
  });
  it('defaultVia says how the default connects', () => {
    expect(defaultVia(withHelper(FREE), models)).toBe(t('page.accIncluded'));
    expect(defaultVia(withHelper('anthropic/claude-opus-5-5'), models)).toBe(t('page.accKey'));
    expect(defaultVia({ ...withHelper(FREE), helperBackend: 'claude_code' }, models)).toBe(t('page.claudePlan'));
    expect(defaultVia(withHelper('zz/unknown'), models)).toBe('');
    expect(defaultVia(withHelper(FREE), [])).toBe(t('page.accIncluded'));
  });
  it('tagOf: Not connected wins and unknown has none', () => {
    expect(tagOf({ ready: 'ready', pay: 'included' })).toBe(t('tag.included'));
    expect(tagOf({ ready: 'ready', pay: 'own_key' })).toBe(t('tag.own_key'));
    expect(tagOf({ ready: 'ready', pay: 'plan' })).toBe(t('tag.plan'));
    expect(tagOf({ ready: 'ready', pay: 'ai_credit' })).toBe(t('tag.ai_credit'));
    expect(tagOf({ ready: 'needs_key', pay: 'included' })).toBe(t('tag.needs_key'));
    expect(tagOf({ ready: 'unknown', pay: 'unknown' })).toBe('');
  });
});

// ── spending ──────────────────────────────────────────────────────────────────────────────

describe('spending', () => {
  const DAY = 86400;
  const ROLLUP = [
    { Model: 'openai/gpt-5.5', Provider: 'openai', Calls: 40, SuccessRate: 0.875, TotalCostUSD: 0.4249 },
    { Model: 'acme/foo-1', Provider: 'acme', Calls: 3, SuccessRate: 1, TotalCostUSD: 0.004 },
    { Model: 'hoody-ai/hoody-free', Provider: 'hoody-ai', Calls: 12, SuccessRate: 1, TotalCostUSD: 0 },
    { Model: 'openrouter/meta/llama-5', Provider: 'openrouter', Calls: 2, SuccessRate: 0.5, TotalCostUSD: 0.02 },
  ];
  const full = catalogue({
    providers: env([...PROVIDERS, { id: 'openrouter', display_name: 'OpenRouter', prefix: 'openrouter' }]),
    models: env([...MODELS, { spec: 'openrouter/meta/llama-5', display_name: 'Llama 5' }]),
  });
  const models = cat(full, 'bot');

  it('since: 7 and 30 days back in unix seconds; all time has none', () => {
    const now = 1_760_000_000_123;
    expect(since('d7', now)).toBe(1_760_000_000 - 7 * DAY);
    expect(since('d30', now)).toBe(1_760_000_000 - 30 * DAY);
    expect(since('all', now)).toBeNull();
  });
  it('money: zero, negative, NaN, Infinity and non-numbers read as no cost; sub-cent says so', () => {
    for (const v of [0, -1, NaN, Infinity, '0.5', null, undefined]) expect(money(v)).toBe(t('spend.none'));
    expect(money(0.004)).toBe(t('spend.lt'));
    expect(money(0.4249)).toBe('$0.42');
    expect(money(12)).toBe('$12.00');
    expect(money(0)).not.toMatch(/\$0\.00|free/i);
  });
  it('spendTable reads Go field names, uses catalogue labels and puts uncatalogued rows last', () => {
    const tbl = spendTable({ status: 'ok', rollup: ROLLUP }, models);
    expect(tbl.rows.map((r) => [r.label, r.calls, r.rate, r.cost, r.other])).toEqual([
      ['GPT-5.5', 40, '88%', '$0.42', false],
      ['Hoody Free', 12, '100%', t('spend.none'), false],
      ['Llama 5', 2, '50%', '$0.02', false],
      ['foo-1', 3, '100%', t('spend.lt'), true],
    ]);
    expect(tbl.rows[0]?.provider).toBe('OpenAI');
    expect(tbl.rows[3]?.provider).toBe(t('name.provider'));
    expect(tbl.total).toBeCloseTo(0.4489, 6);
  });
  it('spendTable reads snake_case rows', () => {
    const tbl = spendTable({ rollup: [{ model: 'gpt-5.5', provider: 'openai', calls: 2, success_rate: 0.5, total_cost_usd: 1.5 }] }, models);
    expect(tbl.rows[0]).toMatchObject({ label: 'GPT-5.5', provider: 'OpenAI', calls: 2, rate: '50%', cost: '$1.50', other: false });
  });
  it('spendTable names an uncatalogued line by its model and its provider; a Hoody AI line shows a model only in Hoody\'s own form', () => {
    const tbl = spendTable({ rollup: [...ROLLUP, { Model: 'mimo/x/new', Provider: 'mimo', Calls: 1, SuccessRate: 1, TotalCostUSD: 0.1 }, { Model: 'hoody-ai/UPSTREAM-auto', Provider: 'hoody-ai', Calls: 1 }, { Model: 'hoody-ai/hoody-fast', Provider: 'hoody-ai', Calls: 1 }] }, models);
    const row = (spec: string) => tbl.rows.find((r) => r.id.endsWith(`:${spec}`));
    expect(row('mimo/x/new')).toMatchObject({ label: 'x/new', provider: 'Xiaomi MiMo' });
    // The row id is an internal key (it keeps the spec); only the visible fields are user text.
    const { id: _id, ...visible } = row('hoody-ai/UPSTREAM-auto') ?? { id: '' };
    expect(visible).toMatchObject({ label: t('name.provider'), provider: 'Hoody AI' });
    expect(JSON.stringify(visible)).not.toMatch(/up\s*stream/i);
    expect(row('hoody-ai/hoody-fast')).toMatchObject({ label: 'hoody-fast', provider: 'Hoody AI' });
    expect(tbl.rows).toHaveLength(7);
  });
  it('spendTable names a catalogued line by its provider\'s name', () => {
    const tbl = spendTable({ rollup: ROLLUP }, models);
    expect(tbl.rows.find((r) => r.id.endsWith(':openrouter/meta/llama-5'))?.provider).toBe('OpenRouter');
  });
  it('spendTable of nothing is empty', () => {
    expect(spendTable(null, models)).toEqual({ rows: [], total: 0 });
  });
  it('credit shows an amount only while the AI balance is live and readable', () => {
    expect(creditAmount({ aiLive: true, aiRemaining: '8.5' })).toBe(8.5);
    expect(creditText({ aiLive: true, aiRemaining: '8.5' })).toBe(t('spend.creditLeft', { amount: '$8.50' }));
    expect(creditText({ aiLive: true, aiRemaining: 2 })).toBe(t('spend.creditLeft', { amount: '$2.00' }));
    for (const b of [null, {}, { aiLive: false, aiRemaining: '8.5' }, { aiLive: true, aiRemaining: null }, { aiLive: true, aiRemaining: '' }, { aiLive: true, aiRemaining: ' ' }, { aiLive: true, aiRemaining: 'x' }, { aiLive: true, aiRemaining: -3 }]) {
      expect(creditAmount(b)).toBeNull();
      expect(creditText(b)).toBe(t('spend.creditUnknown'));
    }
  });
});

// ── words ─────────────────────────────────────────────────────────────────────────────────

describe('errorText', () => {
  const e = (kind: Outcome['kind'], status: number, code: string, extra: Partial<Outcome> = {}): Outcome => ({ kind, status, code, retryAfter: null, details: {}, ...extra });

  it('an unknown outcome on a write is "not confirmed", never "not saved"; on a read it is a load error', () => {
    expect(errorText(e('pending', 0, ''), { write: true }).key).toBe('err.notConfirmed');
    expect(errorText(e('pending', 502, 'upstream_error'), { write: true }).key).toBe('err.notConfirmed');
    expect(errorText(e('pending', 0, '')).key).toBe('err.load');
    expect(errorText(e('pending', 503, 'store_failed'), { write: true }).key).toBe('err.store');
    expect(Object.values(strings).join('\n')).not.toMatch(/not saved/i);
  });
  it('READ_BACK_FIRST (an earlier send still unread) is "may have gone through", never "nothing was sent"', () => {
    expect(errorText(e('not_sent', 0, 'READ_BACK_FIRST'), { write: true }).key).toBe('err.notConfirmed');
    expect(failedUi(e('not_sent', 0, 'READ_BACK_FIRST')).kind).toBe('pending');
    expect(failedUi(e('not_sent', 0, 'ROUTE_NOT_ALLOWED')).kind).toBe('not_sent');
  });
  it('a local refusal says nothing was sent', () => {
    expect(errorText(e('not_sent', 0, 'ROUTE_NOT_ALLOWED')).key).toBe('err.notSent');
  });
  const rows: Array<[string, Outcome, Parameters<typeof errorText>[1], string]> = [
    ['bad_request', e('failed', 400, 'bad_request'), {}, 'err.reload'],
    ['invalid_realm', e('failed', 400, 'invalid_realm'), {}, 'err.realm'],
    ['admin_unauthorized', e('failed', 403, 'admin_unauthorized'), {}, 'err.admin'],
    ['forbidden', e('failed', 403, 'forbidden'), {}, 'err.forbidden'],
    ['a bare 403', e('failed', 403, ''), {}, 'err.forbidden'],
    ['not_found on a provider', e('failed', 404, 'not_found'), {}, 'err.providerGone'],
    ['not_found on a realm read', e('failed', 404, 'not_found'), { realmRead: true }, 'err.realm'],
    ['job_not_found', e('failed', 404, 'job_not_found'), {}, 'err.jobGone'],
    ['provider_exists', e('failed', 409, 'provider_exists'), {}, 'err.nameTaken'],
    ['model_prefix_taken', e('failed', 409, 'model_prefix_taken'), {}, 'err.nameTaken'],
    ['provider_builtin', e('failed', 409, 'provider_builtin'), {}, 'err.builtin'],
    ['oauth_in_progress', e('failed', 409, 'oauth_in_progress'), {}, 'err.oauthBusy'],
    ['definition_changed', e('failed', 409, 'definition_changed'), {}, 'err.defChanged'],
    ['api_key_refused', e('failed', 422, 'api_key_refused'), { provider: 'OpenAI' }, 'err.keyRefused'],
    ['auth_method_unsupported', e('failed', 422, 'auth_method_unsupported'), {}, 'err.noKey'],
    ['credential_not_stored', e('failed', 409, 'credential_not_stored'), {}, 'err.connectFirst'],
    ['413', e('failed', 413, ''), {}, 'err.tooLong'],
    ['429 without a wait', e('failed', 429, ''), {}, 'err.rateSoon'],
    ['an unknown 4xx on a write', e('failed', 418, 'teapot'), { write: true }, 'err.reload'],
    ['an unknown 4xx on a read', e('failed', 418, 'teapot'), {}, 'err.load'],
    ['unknown_agent', e('failed', 404, 'unknown_agent'), {}, 'cc.unavailable'],
  ];
  for (const [name, err, o, key] of rows) it(`maps ${name} to ${key}`, () => expect(errorText(err, o).key).toBe(key));

  it('429 with Retry-After names the seconds (rounded up) and returns them', () => {
    const r = errorText(e('failed', 429, '', { retryAfter: 4.2 }));
    expect(r).toMatchObject({ key: 'err.rate', text: tk('err.rate', { n: 5 }), retryAfter: 4.2 });
  });
  it('429 with Retry-After of one second or less says "1 second", never "1 seconds"', () => {
    expect(errorText(e('failed', 429, '', { retryAfter: 0.4 })).text).toBe('Too many requests. Try again in 1 second.');
    expect(errorText(e('failed', 429, '', { retryAfter: 2 })).text).toBe('Too many requests. Try again in 2 seconds.');
  });
  it('provider_invalid points at the field', () => {
    expect(errorText(e('failed', 400, 'provider_invalid', { details: { field: 'base_url' } }))).toMatchObject({ key: 'err.field', field: 'base_url' });
  });
  it('model_unavailable defers to the model refusal sentences', () => {
    const key = (reason: string, provider?: string) => errorText(e('failed', 422, 'model_unavailable', { details: { reason } }), { provider }).key;
    expect(key('fusion')).toBe('use.fusion');
    expect(key('unknown_model')).toBe('use.gone');
    expect(key('speech_model')).toBe('use.speech');
    expect(key('new_reason')).toBe('use.unsupported');
    expect(key('no_credentials', 'Anthropic')).toBe('use.needsKey');
    expect(key('no_credentials')).toBe('use.needsKeyAny');
    expect(errorText(e('failed', 400, 'unsupported_setting')).key).toBe('use.unsupported');
  });
  it('api_key_refused names the provider the page passes', () => {
    expect(errorText(e('failed', 422, 'api_key_refused'), { provider: 'OpenAI' }).text).toBe(tk('err.keyRefused', { provider: 'OpenAI' }));
  });
  it('names any provider the page passes (the catalogue already made the name public); with none, the generic word', () => {
    expect(errorText(e('failed', 422, 'api_key_refused'), { provider: 'OpenRouter' }).text).toBe(tk('err.keyRefused', { provider: 'OpenRouter' }));
    expect(errorText(e('failed', 422, 'api_key_refused'), {}).text).toBe(tk('err.keyRefused', { provider: t('name.provider') }));
  });
  it('a sentence with no computer placeholder reads the same whatever the computer is called', () => {
    const o = (computer: string) => errorText(e('failed', 409, 'credential_not_stored'), { computer });
    expect(o('Atlas').text).toBe(tk('err.connectFirst', { provider: t('name.provider') }));
    expect(S['err.connectFirst']).not.toContain('{{computer}}');
  });
  it('the agent message is never read', () => {
    const r = errorText({ ...e('failed', 500, 'whatever'), details: { reason: 'sk-live-123 at 10.0.0.5' } }, { write: true });
    expect(r.text).not.toMatch(/sk-live|10\.0\.0\.5/);
  });
  it('every key used by the table exists in the strings', () => {
    for (const [, err, o] of rows) expect(S[errorText(err, o).key]).toBeTruthy();
  });
});
