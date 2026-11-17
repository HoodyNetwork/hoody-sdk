// Vitest: the Helpers form (Settings > Helpers): what it holds, when it differs from the Bot, and the PATCH it makes. The PATCH names only
// what changed; the default is named only when the person moves it (the agent moves a Claude Code default itself when Claude Code is taken away).
import { answers, bootFixtureCore, reply } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROUTES, guardrailsFlow, registerTargets, workersOf, type Workers } from './data';
import { SETTINGS_SECTIONS, workersAfter, workersAllowed, workersBackend, workersDirty, workersFormOf, workersPatch, workersProblem, workersRefusalKey } from './logic';

const llmOnly: Workers = { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' };
const both: Workers = { known: true, backend: 'acp', allowed: ['llm', 'acp'], agent: 'claude', model: 'claude-sonnet-5-5' };
const form = (w: Workers, over: Partial<ReturnType<typeof workersFormOf>> = {}) => ({ ...workersFormOf(w), ...over });

describe('the section', () => {
  it('sits between Behaviour and Guardrails', () => {
    expect(SETTINGS_SECTIONS.indexOf('workers')).toBe(SETTINGS_SECTIONS.indexOf('behaviour') + 1);
    expect(SETTINGS_SECTIONS.indexOf('workers')).toBe(SETTINGS_SECTIONS.indexOf('guardrails') - 1);
  });
});

describe('the form', () => {
  it('starts as the Bot holds it and is not a change', () => {
    for (const w of [llmOnly, both]) {
      expect(workersDirty(workersFormOf(w), w)).toBe(false);
      expect(workersPatch(workersFormOf(w), w)).toEqual({});
    }
  });
  it('the only backend left allowed is the default, whatever the radio held', () => {
    expect(workersBackend({ llm: true, acp: false, backend: 'acp' })).toBe('llm');
    expect(workersBackend({ llm: false, acp: true, backend: 'llm' })).toBe('acp');
    expect(workersBackend({ llm: true, acp: true, backend: 'acp' })).toBe('acp');
  });
  it('at least one backend stays allowed', () => {
    expect(workersProblem(form(both, { llm: false, acp: false }))).toBe('none');
    expect(workersProblem(form(both))).toBeUndefined();
    expect(workersPatch(form(both, { llm: false, acp: false }), both)).toEqual({});
    expect(workersAllowed({ llm: true, acp: true })).toEqual(['llm', 'acp']);
  });
  it('an agent that reports no policy is never a change and sends nothing', () => {
    const old: Workers = { known: false, backend: 'llm', allowed: ['llm'], agent: '', model: '' };
    expect(workersDirty(form(old, { acp: true }), old)).toBe(false);
    expect(workersPatch(form(old, { acp: true }), old)).toEqual({});
  });
  it('the Claude model counts only while Claude Code is allowed (it is kept, unused, otherwise)', () => {
    expect(workersDirty(form(both, { model: 'claude-opus-5-5' }), both)).toBe(true);
    expect(workersDirty(form(both, { acp: false, backend: 'llm', model: 'whatever' }), both)).toBe(true);
    expect(workersDirty(form(llmOnly, { model: 'claude-opus-5-5' }), llmOnly)).toBe(false);
  });
});

describe('the PATCH', () => {
  it('allowing Claude Code names the list and the agent, and not the default', () => {
    expect(workersPatch(form(llmOnly, { acp: true }), llmOnly)).toEqual({ allowed_worker_backends: ['llm', 'acp'], worker_delegated_agent: 'claude' });
  });
  it('choosing Claude Code as the default names it (the agent is already there)', () => {
    const w: Workers = { ...both, backend: 'llm' };
    expect(workersPatch(form(w, { backend: 'acp' }), w)).toEqual({ worker_backend: 'acp' });
  });
  it('taking Claude Code away names the list only: the agent moves its own default and keeps its agent and model', () => {
    const p = workersPatch(form(both, { acp: false }), both);
    expect(p).toEqual({ allowed_worker_backends: ['llm'] });
    expect('worker_backend' in p).toBe(false);
  });
  it('taking Hoody models away while it is the default moves the default to Claude Code by name', () => {
    const w: Workers = { ...both, backend: 'llm' };
    expect(workersPatch(form(w, { llm: false }), w)).toEqual({ allowed_worker_backends: ['acp'], worker_backend: 'acp' });
  });
  it('a model change names the model only; a model cleared is the empty string (Claude Code\'s own choice)', () => {
    expect(workersPatch(form(both, { model: ' claude-opus-5-5 ' }), both)).toEqual({ worker_delegated_model: 'claude-opus-5-5' });
    expect(workersPatch(form(both, { model: '' }), both)).toEqual({ worker_delegated_model: '' });
  });
  it('a model typed while Claude Code is off is not sent', () => {
    expect(workersPatch(form(llmOnly, { model: 'claude-opus-5-5' }), llmOnly)).toEqual({});
  });
  it('the agent is named only when Claude Code is newly allowed or made the default and the Bot holds none', () => {
    const noAgent: Workers = { ...both, agent: '', backend: 'llm' };
    expect(workersPatch(form(noAgent, { backend: 'acp' }), noAgent)).toEqual({ worker_backend: 'acp', worker_delegated_agent: 'claude' });
  });
});

describe('the agent\'s missing agent', () => {
  it('a model-only edit with Claude Code allowed and no agent stored repairs the agent too; an unchanged form sends nothing', () => {
    const noAgent: Workers = { ...both, agent: '' };
    expect(workersPatch(form(noAgent, { model: 'claude-opus-5-5' }), noAgent)).toEqual({ worker_delegated_model: 'claude-opus-5-5', worker_delegated_agent: 'claude' });
    expect(workersPatch(form(noAgent), noAgent)).toEqual({});
  });
});

describe('the policy after a save', () => {
  it('is what the form stands for: the default that stands for it, the agent when Claude Code is allowed, the model while it is', () => {
    expect(workersAfter(form(both, { acp: false }), both)).toEqual({ known: true, backend: 'llm', allowed: ['llm'], agent: 'claude', model: 'claude-sonnet-5-5' });
    expect(workersAfter(form(llmOnly, { acp: true, model: ' claude-opus-5-5 ' }), llmOnly)).toEqual({ known: true, backend: 'llm', allowed: ['llm', 'acp'], agent: 'claude', model: 'claude-opus-5-5' });
    expect(workersAfter(form(both, { llm: false }), both)).toMatchObject({ backend: 'acp', allowed: ['acp'] });
  });
  it('a second edit is worked out against it, not against the policy from before the first save', () => {
    const after = workersAfter(form({ ...both, backend: 'llm' }, { llm: false }), { ...both, backend: 'llm' });
    // Hoody models ticked again and Claude Code chosen as the default: the list differs from the one the first save left.
    expect(workersPatch(form(after, { llm: true, backend: 'acp' }), after)).toEqual({ allowed_worker_backends: ['llm', 'acp'] });
  });
});

describe('the view', () => {
  it('a policy whose default is not an allowed backend, or has no list, is not known', () => {
    const raw = (o: Record<string, unknown>) => ({ worker_backend: 'llm', allowed_worker_backends: ['llm'], worker_delegated_agent: '', worker_delegated_model: '', ...o });
    expect(workersOf(raw({})).known).toBe(true);
    expect(workersOf(raw({ worker_backend: 'acp' })).known).toBe(false);
    expect(workersOf(raw({ allowed_worker_backends: [] })).known).toBe(false);
    expect(workersOf(raw({ allowed_worker_backends: ['llm', 'x'] })).known).toBe(false);
    expect(workersOf({}).known).toBe(false);
  });
});

describe('a refused save', () => {
  it('is told from the agent\'s code and field, never its text', () => {
    expect(workersRefusalKey('model_unavailable', { field: 'worker_delegated_model', reason: 'not_claude' })).toBe('workers.refused.model');
    expect(workersRefusalKey('model_unavailable', { field: 'model' })).toBeUndefined();
    expect(workersRefusalKey('model_unavailable', undefined)).toBeUndefined();
    expect(workersRefusalKey('bad_request', { field: 'allowed_worker_backends' })).toBe('workers.refused.allowed_worker_backends');
    expect(workersRefusalKey('bad_request', { field: 'worker_backend' })).toBe('workers.refused.worker_backend');
    expect(workersRefusalKey('bad_request', { field: 'name' })).toBeUndefined();
    expect(workersRefusalKey(undefined, undefined)).toBeUndefined();
  });
});

describe('on the wire', () => {
  const seen: Array<{ query: Readonly<Record<string, string>>; body: unknown }> = [];
  beforeEach(() => {
    seen.length = 0;
    registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]);
    bootFixtureCore({ rules: [reply(ROUTES.patch, (req) => { seen.push({ query: req.query, body: req.body }); return answers.ok({ revision: 8 }); }), reply(ROUTES.guardrails, answers.ok({}))] });
  });
  it('the four worker fields reach the agent in the body, fenced by the Bot\'s uid and revision', async () => {
    const patch = workersPatch(form(llmOnly, { acp: true, backend: 'acp', model: 'claude-opus-5-5' }), llmOnly);
    await guardrailsFlow({ botKey: 'c-atlas~global~chief', uid: 'u-1', revision: 7, patch, rules: [] });
    expect(seen[0]?.body).toEqual({ allowed_worker_backends: ['llm', 'acp'], worker_backend: 'acp', worker_delegated_agent: 'claude', worker_delegated_model: 'claude-opus-5-5' });
    expect(seen[0]?.query.expect_uid).toBe('u-1');
    expect(seen[0]?.query.expect_revision).toBe('7');
  });
});
