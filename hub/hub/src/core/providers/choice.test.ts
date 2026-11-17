// judge (model picker): the one judgement at every final action. Nothing unread is sent, consent is per
// model and scope, a settled catalogue failure leaves only the caller's fallback specs (with consent), and a
// readiness change between choosing and submitting is judged at submit.
import { describe, expect, it } from 'vitest';
import { catalogue } from './catalogue';
import { judge, rulesFor, type Choice, type Purpose } from './choice';
import type { Evidence, Part, Scope, Snapshot } from './read';
import type { ClaudeSet } from '../agent/types';
import type { Outcome } from './types';

const st = (state: string, via: string | null = null, output_cap = true) => ({ state, via, methods: ['api_key'], alternatives: {}, output_cap, shares_with: [] });
const cat = catalogue({
  providers: {
    providers: [
      { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: st('ready', 'included') },
      { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: st('ready', 'signin', false) },
      { id: 'deepseek', prefix: 'deepseek/', display_name: 'DeepSeek', status: st('ready', 'stored_key') },
      { id: 'anthropic', prefix: 'anthropic/', display_name: 'Anthropic', status: st('needs_key') },
    ],
  },
  models: {
    models: [
      { spec: 'hoody-ai/hoody-free' },
      { spec: 'openai/gpt-5' },
      { spec: 'deepseek/chat' },
      { spec: 'deepseek/reasoner' },
      { spec: 'anthropic/claude' },
      { spec: 'fusion/pair', source: 'fusion', members: ['hoody-ai/hoody-free', 'deepseek/chat'] },
    ],
  },
  ready: { models: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'openai/gpt-5' }, { spec: 'deepseek/chat' }, { spec: 'fusion/pair' }] },
});

const NOW: Scope = { account: 'acc', realm: 'r1', computer: 'p|c-atlas|srv', gen: 3, boot: 'b1' };
const OTHER: Scope = { ...NOW, computer: 'p|c-boreal|srv' };
const ERR: Outcome = { kind: 'failed', code: 'unavailable', status: 503, retryAfter: null, details: {} };
const OK: Part<Snapshot> = { state: 'ok', value: { cat, ready: 'ok', sig: 's' } };
const claudeOk = (state: ClaudeSet['state']): Part<ClaudeSet> => ({ state: 'ok', value: { state, models: [{ id: 'opus', label: 'Opus' }], efforts: [] } });
const ev = (catalogue: Part<Snapshot> = OK, claude: Part<ClaudeSet> | null = null, scope: Scope = NOW): Evidence => ({ seq: 2, scope, at: 0, catalogue, claude });
const pick = (spec: string, consent = false, scope: Scope = NOW, readiness: 'ready' | 'unknown' = 'unknown'): Choice => ({ kind: 'model', spec, readiness, consent, scope, seq: 2 });
const BOT = rulesFor('bot', { inherit: true, fallback: ['deepseek/chat'] });

describe('judge: nothing unread is sent', () => {
  it('no computer, no evidence, or evidence of another scope is unread', () => {
    expect(judge(pick('deepseek/chat'), 'deepseek/chat', ev(), null, BOT)).toEqual({ ok: false, why: 'unread' });
    expect(judge(pick('deepseek/chat'), 'deepseek/chat', null, NOW, BOT)).toEqual({ ok: false, why: 'unread' });
    expect(judge(pick('deepseek/chat'), 'deepseek/chat', ev(OK, null, OTHER), NOW, BOT)).toEqual({ ok: false, why: 'unread' });
  });

  it('a loading catalogue is unread', () => {
    expect(judge(null, 'deepseek/chat', ev({ state: 'loading' }), NOW, BOT)).toEqual({ ok: false, why: 'unread' });
  });

  it('a held choice made under another scope voids its consent: scope', () => {
    expect(judge(pick('deepseek/reasoner', true, OTHER), 'deepseek/reasoner', ev(), NOW, BOT)).toEqual({ ok: false, why: 'scope' });
  });
});

describe('judge: inherit', () => {
  it('passes with no readiness claim when the caller accepts it, ineligible otherwise', () => {
    expect(judge({ kind: 'inherit' }, '', ev(), NOW, BOT)).toEqual({ ok: true, readiness: 'inherited' });
    expect(judge({ kind: 'inherit' }, '', ev(), NOW, rulesFor('default'))).toEqual({ ok: false, why: 'ineligible' });
  });
});

describe('judge: readiness', () => {
  it('ready passes even when the choice said unknown; unknown needs consent, given per model and scope', () => {
    expect(judge(pick('deepseek/chat'), 'deepseek/chat', ev(), NOW, BOT)).toEqual({ ok: true, readiness: 'ready' });
    expect(judge(pick('deepseek/reasoner'), 'deepseek/reasoner', ev(), NOW, BOT)).toEqual({ ok: false, why: 'needs_consent' });
    expect(judge(pick('deepseek/reasoner', true), 'deepseek/reasoner', ev(), NOW, BOT)).toEqual({ ok: true, readiness: 'unknown' });
    // Consent for another model is not consent for this one.
    expect(judge(pick('deepseek/chat', true), 'deepseek/reasoner', ev(), NOW, BOT)).toEqual({ ok: false, why: 'needs_consent' });
  });

  it('needs setup and gone never pass, consent or not', () => {
    expect(judge(pick('anthropic/claude', true), 'anthropic/claude', ev(), NOW, BOT)).toEqual({ ok: false, why: 'needs_setup' });
    expect(judge(pick('nowhere/x', true), 'nowhere/x', ev(), NOW, BOT)).toEqual({ ok: false, why: 'gone' });
  });
});

describe('judge: a settled catalogue failure', () => {
  const failed = ev({ state: 'failed', err: ERR });
  it('a fallback spec (the caller rows, Hoody Free) passes with consent and asks for it without', () => {
    for (const spec of ['deepseek/chat', 'hoody-ai/hoody-free']) {
      expect(judge(pick(spec), spec, failed, NOW, BOT)).toEqual({ ok: false, why: 'needs_consent' });
      expect(judge(pick(spec, true), spec, failed, NOW, BOT)).toEqual({ ok: true, readiness: 'unknown' });
    }
  });
  it('any other spec is ineligible, consent or not', () => {
    expect(judge(pick('deepseek/reasoner', true), 'deepseek/reasoner', failed, NOW, BOT)).toEqual({ ok: false, why: 'ineligible' });
  });
});

// A fallback spec after a settled failure still meets the purpose's name exclusions (Claude Code rows for
// every purpose but agent; ensembles for default and explain). The caller's fallback set is never the only guard.
describe('judge: a fallback spec after a failure keeps the purpose name exclusions', () => {
  const catFailed: Part<Snapshot> = { state: 'failed', err: ERR };
  const claudeFailed: Part<ClaudeSet> = { state: 'failed', err: ERR };
  // A failed catalogue for every spec; a failed Claude part too, so a Claude Code spec is judged by its failed branch.
  const failed = ev(catFailed, claudeFailed);
  const consentTo = (purpose: Purpose, spec: string) => judge(pick(spec, true), spec, failed, NOW, rulesFor(purpose, { fallback: [spec, 'deepseek/chat'] }));
  const excluded: [Purpose, string][] = [
    ['bot', 'claude-code/opus'],
    ['default', 'claude-code/opus'],
    ['default', 'fusion/pair'],
    ['explain', 'claude-code/opus'],
    ['explain', 'fusion/pair'],
  ];
  it.each(excluded)('%s: a consented fallback %s is ineligible, never sent', (purpose, spec) => {
    expect(consentTo(purpose, spec)).toEqual({ ok: false, why: 'ineligible' });
  });
  it.each(['bot', 'default', 'explain', 'agent'] as const)('%s: an ordinary fallback still passes with consent and asks for it without', (purpose) => {
    const rules = rulesFor(purpose, { fallback: ['deepseek/chat'] });
    for (const spec of ['deepseek/chat', 'hoody-ai/hoody-free']) {
      expect(judge(pick(spec, true), spec, failed, NOW, rules)).toEqual({ ok: true, readiness: 'unknown' });
      expect(judge(pick(spec), spec, failed, NOW, rules)).toEqual({ ok: false, why: 'needs_consent' });
    }
  });
  it('bot: an ensemble fallback is the bot purpose\'s own row and still passes', () => {
    expect(consentTo('bot', 'fusion/pair')).toEqual({ ok: true, readiness: 'unknown' });
  });
  it('agent: a Claude Code fallback with a failed Claude part still passes with consent', () => {
    expect(consentTo('agent', 'claude-code/opus')).toEqual({ ok: true, readiness: 'unknown' });
  });
});

describe('judge: Claude Code rows', () => {
  const AGENT = rulesFor('agent', { fallback: ['claude-code/opus'] });
  it('not offered by the caller: ineligible', () => {
    expect(judge(pick('claude-code/opus', true), 'claude-code/opus', ev(), NOW, BOT)).toEqual({ ok: false, why: 'ineligible' });
    expect(judge(pick('claude-code/opus', true), 'claude-code/opus', ev(), NOW, AGENT)).toEqual({ ok: false, why: 'ineligible' });
  });
  it('ready at choosing, setup by submit: needs setup (the Claude part is judged at submit)', () => {
    expect(judge(pick('claude-code/opus', false, NOW, 'ready'), 'claude-code/opus', ev(OK, claudeOk('ready')), NOW, AGENT)).toEqual({ ok: true, readiness: 'ready' });
    expect(judge(pick('claude-code/opus', false, NOW, 'ready'), 'claude-code/opus', ev(OK, claudeOk('setup')), NOW, AGENT)).toEqual({ ok: false, why: 'needs_setup' });
  });
  it('a loading Claude part is unread; a failed one leaves only fallback specs, with consent', () => {
    expect(judge(pick('claude-code/opus'), 'claude-code/opus', ev(OK, { state: 'loading' }), NOW, AGENT)).toEqual({ ok: false, why: 'unread' });
    const failed = ev(OK, { state: 'failed', err: ERR });
    expect(judge(pick('claude-code/opus'), 'claude-code/opus', failed, NOW, AGENT)).toEqual({ ok: false, why: 'needs_consent' });
    expect(judge(pick('claude-code/opus', true), 'claude-code/opus', failed, NOW, AGENT)).toEqual({ ok: true, readiness: 'unknown' });
    expect(judge(pick('claude-code', true), 'claude-code', failed, NOW, AGENT)).toEqual({ ok: false, why: 'ineligible' });
  });
});

describe('rulesFor: purposes', () => {
  it('the eligibility a chooser filters rows with: Claude Code rows only for an agent caller that reads Claude', () => {
    expect(rulesFor('agent').eligible('claude-code/opus', ev(OK, claudeOk('ready')))).toBe(true);
    expect(rulesFor('agent').eligible('claude-code/opus', ev())).toBe(false);
    expect(rulesFor('agent').eligible('deepseek/chat', ev())).toBe(true);
    for (const p of ['bot', 'default', 'explain'] as const) expect(rulesFor(p).eligible('claude-code/opus', ev(OK, claudeOk('ready')))).toBe(false);
  });

  it('explain refuses ensembles and a provider that takes no output cap; default refuses ensembles; bot takes both', () => {
    const explain = rulesFor('explain');
    expect(judge(pick('fusion/pair'), 'fusion/pair', ev(), NOW, explain)).toEqual({ ok: false, why: 'ineligible' });
    expect(judge(pick('openai/gpt-5'), 'openai/gpt-5', ev(), NOW, explain)).toEqual({ ok: false, why: 'ineligible' });
    expect(judge(pick('deepseek/chat'), 'deepseek/chat', ev(), NOW, explain)).toEqual({ ok: true, readiness: 'ready' });
    expect(judge(pick('fusion/pair'), 'fusion/pair', ev(), NOW, rulesFor('default'))).toEqual({ ok: false, why: 'ineligible' });
    expect(judge(pick('fusion/pair'), 'fusion/pair', ev(), NOW, BOT)).toEqual({ ok: true, readiness: 'ready' });
  });
});

describe('judge: an ensemble with a Claude Code member', () => {
  const withClaude = catalogue({
    providers: { providers: [{ id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: st('ready', 'included') }] },
    models: { models: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'fusion/hc', source: 'fusion', members: ['hoody-ai/hoody-free', 'claude-code/opus'] }] },
    ready: { models: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'fusion/hc' }] },
  });
  const okHc: Part<Snapshot> = { state: 'ok', value: { cat: withClaude, ready: 'ok', sig: 'h' } };
  it('listed and its Claude member ready: passes as ready; the member needing setup: needs setup', () => {
    expect(judge(pick('fusion/hc'), 'fusion/hc', ev(okHc, claudeOk('ready')), NOW, BOT)).toEqual({ ok: true, readiness: 'ready' });
    expect(judge(pick('fusion/hc', true), 'fusion/hc', ev(okHc, claudeOk('setup')), NOW, BOT)).toEqual({ ok: false, why: 'needs_setup' });
  });
});
