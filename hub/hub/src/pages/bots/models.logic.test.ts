// The Bot's models, read as data: which model the Bot answers with when it
// follows the AI page (own → the AI page's Bots pin → the bot agent's shipped Hoody Free; never the AI helper's model),
// whether a saved change still waits for a restart, the three model jobs, and the helper lists' options, which come from
// the Bot computer's own catalogue with its readiness (never the unscoped models read).
import { providers } from '@core';
import { describe, expect, it } from 'vitest';
import type { BotView } from './data';
import { botModelLabel, helperOptions, modelRolesOf, resolveBotModel, restartState } from './models.logic';

type Evidence = providers.Evidence;

const PROVIDERS = [
  { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: { state: 'ready', via: 'included', methods: ['included'], alternatives: {}, output_cap: true, shares_with: [] } },
  { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: { state: 'ready', via: 'stored_key', methods: ['api_key'], alternatives: {}, output_cap: true, shares_with: [] } },
  { id: 'anthropic', prefix: 'anthropic/', display_name: 'Anthropic', status: { state: 'needs_key', via: null, methods: ['api_key'], alternatives: {}, output_cap: true, shares_with: [] } },
];
const MODELS = [
  { spec: 'hoody-ai/hoody-free', display_name: 'Hoody Free' },
  { spec: 'openai/gpt-5', display_name: 'GPT-5', reasoning: true },
  { spec: 'openai/gpt-5-mini', display_name: 'GPT-5 mini' },
  { spec: 'anthropic/claude-opus-4-1-20250805', display_name: 'Claude Opus 4.1' },
  { spec: 'fusion/pair', display_name: 'Pair', source: 'fusion', members: ['hoody-ai/hoody-free', 'openai/gpt-5'] },
];
const READY = ['hoody-ai/hoody-free', 'openai/gpt-5', 'openai/gpt-5-mini', 'fusion/pair'];
const scope = { account: 'a', realm: 'global', computer: 'p|c1|s', gen: 1, boot: 'b' };

function ev(o: { ready?: 'ok' | 'legacy'; failed?: boolean; loading?: boolean } = {}): Evidence {
  if (o.failed) return { seq: 1, scope, at: 0, catalogue: { state: 'failed', err: { kind: 'failed', code: 'x', status: 500, retryAfter: null, details: {} } }, claude: null };
  if (o.loading) return { seq: 1, scope, at: 0, catalogue: { state: 'loading' }, claude: null };
  const ready = o.ready ?? 'ok';
  const cat = providers.catalogue({
    providers: { providers: PROVIDERS },
    models: { models: MODELS },
    ready: ready === 'ok' ? { models: READY.map((spec) => ({ spec })) } : undefined,
  });
  return { seq: 1, scope, at: 0, catalogue: { state: 'ok', value: { cat, ready, sig: 'x' } }, claude: null };
}

const NAMES = { free: 'Hoody Free', any: 'A model' };
const WORDS = { aiPage: (name: string) => `${name} (AI page)`, unresolved: 'Bots default (AI page)' };

describe('the model a Bot that follows the AI page answers with', () => {
  it('its own model wins', () => {
    expect(resolveBotModel('openai/gpt-5', { botModel: 'openai/gpt-5-mini' })).toEqual({ spec: 'openai/gpt-5', source: 'own' });
    expect(resolveBotModel('openai/gpt-5', null)).toEqual({ spec: 'openai/gpt-5', source: 'own' });
  });
  it('else the AI page Bots pin', () => {
    expect(resolveBotModel('', { botModel: 'openai/gpt-5-mini' })).toEqual({ spec: 'openai/gpt-5-mini', source: 'ai_page' });
  });
  it('else the bot agent ships Hoody Free: never the AI helper model', () => {
    expect(resolveBotModel('', { botModel: '' })).toEqual({ spec: providers.FREE, source: 'ai_page' });
  });
  it('with no agents read (unread, failed) it cannot tell', () => {
    expect(resolveBotModel('', null)).toBeNull();
    expect(resolveBotModel('', undefined)).toBeNull();
  });
});

describe('the label is never blank', () => {
  it('own: the model name', () => {
    expect(botModelLabel('openai/gpt-5', null, WORDS)).toBe('gpt-5');
  });
  it('inherited and resolved: its name, from the AI page', () => {
    expect(botModelLabel('', { botModel: '' }, WORDS)).toBe('Hoody Free (AI page)');
    expect(botModelLabel('', { botModel: 'openai/gpt-5-mini' }, WORDS)).toBe('gpt-5-mini (AI page)');
  });
  it('inherited and unresolved: the Bots default words', () => {
    expect(botModelLabel('', null, WORDS)).toBe('Bots default (AI page)');
  });
});

describe('does a saved Bot model wait for a restart', () => {
  const own = { spec: 'openai/gpt-5', source: 'own' as const };
  it('no session: starts with its next conversation', () => {
    expect(restartState({ sessionId: null, sessionModel: null }, own)).toBe('next');
    expect(restartState({ sessionModel: null }, own)).toBe('next');
  });
  it('a session on the resolved model: running', () => {
    expect(restartState({ sessionId: 's1', sessionModel: 'openai/gpt-5' }, own)).toBe('running');
    expect(restartState({ sessionId: 's1', sessionModel: ' OpenAI/GPT-5 ' }, own)).toBe('running');
  });
  it('a session on another model: waits for a restart', () => {
    expect(restartState({ sessionId: 's1', sessionModel: providers.FREE }, own)).toBe('waits');
  });
  it('a session that has not said its model, or a model that cannot be resolved: cannot tell', () => {
    expect(restartState({ sessionId: 's1', sessionModel: null }, own)).toBe('cant_tell');
    expect(restartState({ sessionId: 's1', sessionModel: 'openai/gpt-5' }, null)).toBe('cant_tell');
  });
});

describe('helper lists: the Bot computer catalogue, with its readiness', () => {
  it('only ready models, never an ensemble, never a model that needs a key', () => {
    const specs = helperOptions(ev(), '', NAMES).map((m) => m.spec);
    expect(specs).toEqual(expect.arrayContaining(['hoody-ai/hoody-free', 'openai/gpt-5', 'openai/gpt-5-mini']));
    expect(specs).not.toContain('anthropic/claude-opus-4-1-20250805');
    expect(specs).not.toContain('fusion/pair');
    expect(helperOptions(ev(), '', NAMES).every((m) => m.ready === 'ready')).toBe(true);
  });
  it('rows keep the catalogue label and whether the model takes a thinking level', () => {
    const gpt = helperOptions(ev(), '', NAMES).find((m) => m.spec === 'openai/gpt-5');
    expect(gpt).toMatchObject({ label: 'GPT-5', reasoning: true, ready: 'ready' });
    expect(helperOptions(ev(), '', NAMES).find((m) => m.spec === 'openai/gpt-5-mini')?.reasoning).toBe(false);
  });
  it('a held model that is not ready stays, marked with its readiness', () => {
    const rows = helperOptions(ev(), 'anthropic/claude-opus-4-1-20250805', NAMES);
    expect(rows.find((m) => m.spec === 'anthropic/claude-opus-4-1-20250805')?.ready).toBe('needs_key');
  });
  it('held rows are marked held-only, so each field offers one only as its own value; listed rows are not', () => {
    const rows = helperOptions(ev(), ['anthropic/claude-opus-4-1-20250805', 'openai/gpt-5'], NAMES);
    expect(rows.find((m) => m.spec === 'anthropic/claude-opus-4-1-20250805')?.heldOnly).toBe(true);
    expect(rows.find((m) => m.spec === 'openai/gpt-5')?.heldOnly).toBeUndefined();
    const unread = helperOptions(null, 'openai/gpt-5', NAMES);
    expect(unread.find((m) => m.spec === 'openai/gpt-5')?.heldOnly).toBe(true);
    expect(unread.find((m) => m.spec === providers.FREE)?.heldOnly).toBeUndefined();
  });
  it('unread, failed or untrusted readiness: the held model and Hoody Free only', () => {
    for (const e of [null, ev({ failed: true }), ev({ loading: true }), ev({ ready: 'legacy' })]) {
      expect(helperOptions(e, 'openai/gpt-5', NAMES).map((m) => m.spec)).toEqual([providers.FREE, 'openai/gpt-5']);
      expect(helperOptions(e, '', NAMES).map((m) => m.spec)).toEqual([providers.FREE]);
    }
  });
});

describe('the three model jobs', () => {
  const bot = (o: Partial<BotView> = {}): Pick<BotView, 'model' | 'sessionId' | 'sessionModel' | 'workers'> =>
    ({ model: '', sessionId: 's1', sessionModel: providers.FREE, workers: { known: true, backend: 'llm', allowed: ['llm', 'acp'], agent: '', model: '', options: { model: '', thinking: '', effort: '' } }, ...o }) as never;
  it('the Bot: held, resolved, from where, when a change applies, readiness', () => {
    const [b] = modelRolesOf(bot(), { botModel: '' }, ev());
    expect(b).toMatchObject({ job: 'bot', held: '', spec: providers.FREE, source: 'ai_page', applies: 'after_reset', ready: 'ready' });
    expect(modelRolesOf(bot({ sessionId: null }), null, ev())[0]).toMatchObject({ spec: null, applies: 'next_session', ready: 'unknown' });
  });
  it('Hoody-model helpers: their own model, else their agent decides; new helpers only', () => {
    const own = bot({ workers: { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '', options: { model: 'anthropic/claude-opus-4-1-20250805', thinking: '', effort: '' } } });
    expect(modelRolesOf(own, null, ev())[1]).toMatchObject({ job: 'hoody', held: 'anthropic/claude-opus-4-1-20250805', source: 'own', applies: 'new_helpers', ready: 'needs_key' });
    expect(modelRolesOf(bot(), null, ev())[1]).toMatchObject({ job: 'hoody', held: '', spec: null, source: 'agent', applies: 'new_helpers' });
  });
  it('Claude Code helpers: its model, else Claude Code decides; only while allowed', () => {
    const cc = bot({ workers: { known: true, backend: 'acp', allowed: ['llm', 'acp'], agent: '', model: 'opus', options: { model: '', thinking: '', effort: 'high' } } });
    expect(modelRolesOf(cc, null, ev())[2]).toMatchObject({ job: 'claude', held: 'opus', source: 'own', applies: 'new_helpers' });
    expect(modelRolesOf(bot(), null, ev())[2]).toMatchObject({ job: 'claude', held: '', spec: null, source: 'claude_code' });
    const noCc = bot({ workers: { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '', options: { model: '', thinking: '', effort: '' } } });
    expect(modelRolesOf(noCc, null, ev()).map((r) => r.job)).toEqual(['bot', 'hoody']);
  });
});
