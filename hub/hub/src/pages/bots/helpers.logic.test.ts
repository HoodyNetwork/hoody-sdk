// Vitest: the rules behind Settings > Helpers' model fields. Routing reads and sends the agent's shape (its rule:
// off drops the tiers, suggest and auto need both, never an ensemble); the agents a task may name are any (empty) or a non-empty list;
// the realm's default agent's model is what Hoody-model helpers run on, and the Bot's own agent is never offered as a helper.
import { describe, expect, it } from 'vitest';
import { helperAgentsOf, routingSetOf } from './data';
import { agentsDirty, routingBody, routingDirty, routingFormOf, routingProblem, routingRefusal } from './logic';

describe('routingSetOf', () => {
  it('reads the agent view: null and unknown modes are off, a tier without a model is none, unknown thinking is the default', () => {
    expect(routingSetOf(null)).toEqual({ mode: 'off', light: null, heavy: null });
    expect(routingSetOf({ mode: 'sometimes' })).toEqual({ mode: 'off', light: null, heavy: null });
    expect(routingSetOf({ mode: 'auto', light: { model: ' acme/swift-1 ', thinking: 'high' }, heavy: { model: '', thinking: 'max' } })).toEqual({ mode: 'auto', light: { model: 'acme/swift-1', thinking: 'high' }, heavy: null });
    expect(routingSetOf({ mode: 'suggest', light: { model: 'a/b', thinking: 'turbo' } }).light).toEqual({ model: 'a/b', thinking: '' });
  });
});

describe('routing form', () => {
  const on = routingFormOf({ mode: 'auto', light: { model: 'a/l', thinking: '' }, heavy: { model: 'a/h', thinking: 'high' } });

  it('off sends the mode alone; on sends both tiers trimmed', () => {
    expect(routingBody({ ...on, mode: 'off' })).toEqual({ mode: 'off' });
    expect(routingBody({ ...on, light: { model: ' a/l ', thinking: '' } })).toEqual({ mode: 'auto', light: { model: 'a/l', thinking: '' }, heavy: { model: 'a/h', thinking: 'high' } });
  });

  it('a tier needs a model while routing is on, and never an ensemble; off needs nothing', () => {
    expect(routingProblem({ ...on, heavy: { model: ' ', thinking: '' } })).toEqual({ tier: 'heavy', why: 'model' });
    expect(routingProblem({ ...on, light: { model: 'fusion/council', thinking: '' } })).toEqual({ tier: 'light', why: 'fusion' });
    expect(routingProblem({ mode: 'off', light: { model: '', thinking: '' }, heavy: { model: '', thinking: '' } })).toBeUndefined();
    expect(routingProblem(on)).toBeUndefined();
  });

  it('dirty compares what would be sent: tiers kept under off are no edit, a thinking change is', () => {
    const held = { mode: 'off' as const, light: null, heavy: null };
    expect(routingDirty({ ...on, mode: 'off' }, held)).toBe(false);
    expect(routingDirty(on, held)).toBe(true);
    const heldOn = { mode: 'auto' as const, light: { model: 'a/l', thinking: '' as const }, heavy: { model: 'a/h', thinking: 'high' as const } };
    expect(routingDirty(on, heldOn)).toBe(false);
    expect(routingDirty({ ...on, heavy: { model: 'a/h', thinking: 'max' } }, heldOn)).toBe(true);
    expect(routingDirty(routingFormOf(undefined), undefined)).toBe(false);
  });

  it('a refusal names its field from the code and details only', () => {
    expect(routingRefusal('model_unavailable', { field: 'routing.heavy.model' })).toEqual({ tier: 'heavy', field: 'model' });
    expect(routingRefusal('bad_request', { field: 'routing.light.thinking' })).toEqual({ tier: 'light', field: 'thinking' });
    expect(routingRefusal('bad_request', { field: 'routing.light' })).toEqual({ tier: 'light', field: 'model' });
    expect(routingRefusal('bad_request', { field: 'routing.mode' })).toEqual({ tier: null, field: 'mode' });
    expect(routingRefusal('bad_request', { field: 'worker_backend' })).toBeUndefined();
    expect(routingRefusal('internal', { field: 'routing.heavy.model' })).toBeUndefined();
    expect(routingRefusal('bad_request', undefined)).toBeUndefined();
  });
});

describe('agents a task may name', () => {
  it('any is null; the same names in another order are no edit', () => {
    expect(agentsDirty(true, [], null)).toBe(false);
    expect(agentsDirty(false, ['b', 'a'], ['a', 'b'])).toBe(false);
    expect(agentsDirty(false, ['a'], ['a', 'b'])).toBe(true);
    expect(agentsDirty(true, ['a'], ['a'])).toBe(true);
    expect(agentsDirty(false, ['a'], null)).toBe(true);
  });
});

describe('helperAgentsOf', () => {
  it('the default agent gives the helpers model; the Bot agent is never offered, its pin is the AI page Bots default; names sorted, repeats dropped', () => {
    const r = helperAgentsOf({ items: [{ name: 'writer' }, { name: 'bot', model: 'x/y' }, { name: 'general', model: 'acme/swift-1', is_configured_default: true }, { name: 'writer', model: 'z/z' }] });
    expect(r).toEqual({ helperModel: 'acme/swift-1', botModel: 'x/y', agents: [{ name: 'general', model: 'acme/swift-1' }, { name: 'writer', model: '' }] });
  });

  it('no default agent, or one without a model: empty (Hoody Free); an answer without the list is no answer', () => {
    expect(helperAgentsOf({ items: [{ name: 'general' }] }).helperModel).toBe('');
    expect(() => helperAgentsOf({ data: {} })).toThrow();
  });
});
