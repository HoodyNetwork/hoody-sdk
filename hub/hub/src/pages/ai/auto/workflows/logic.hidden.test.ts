// The list row's `hidden` is read only on an agent that reports workflow_hidden, each placed
// step's order mark ("4a, 4b" for a row of several), and the kind a step's badge names.
import { describe, expect, it } from 'vitest';
import { graphOf, parseWorkflows, stepKind, stepMarks, WF_HIDDEN_CAP, type Step } from './logic';

const rows = [{ name: 'a', hidden: true }, { name: 'b', hidden: false }, { name: 'c' }, { name: 'd', hidden: 'true' }];

describe('parseWorkflows: hidden', () => {
  it('the capability is the agent\'s workflow_hidden', () => {
    expect(WF_HIDDEN_CAP).toBe('workflow_hidden');
  });

  it('without the capability no row says whether it is hidden, even one the agent marks', () => {
    for (const w of parseWorkflows({ items: rows })) expect(w).not.toHaveProperty('hidden');
    for (const w of parseWorkflows({ items: rows }, { hiddenCap: false })) expect(w).not.toHaveProperty('hidden');
  });

  it('with it, only a literal true reads hidden; every other row reads shown', () => {
    expect(parseWorkflows({ items: rows }, { hiddenCap: true }).map((w) => w.hidden)).toEqual([true, false, false, false]);
  });
});

const step = (o: Partial<Step>): Step => ({ id: 's', type: '', detail: '', explanation: '', readOnly: false, unreachable: false, parallel: false, next: [], ...o });

describe('stepKind', () => {
  it('reads the kind from the type, and the name from the agent\'s base label', () => {
    expect(stepKind(step({ type: 'bash', detail: 'bash' }))).toEqual({ kind: 'bash', name: '' });
    expect(stepKind(step({ type: 'agent', detail: 'agent: reviewer' }))).toEqual({ kind: 'agent', name: 'reviewer' });
    expect(stepKind(step({ type: 'tool', detail: 'tool: github' }))).toEqual({ kind: 'tool', name: 'github' });
    expect(stepKind(step({ type: 'workflow', detail: 'workflow: release' }))).toEqual({ kind: 'workflow', name: 'release' });
    expect(stepKind(step({ type: 'foreach', detail: 'foreach: files' }))).toEqual({ kind: 'foreach', name: 'files' });
  });

  it('a fork (an agent copy) is said by its label; a type the Hub does not know is kept as said', () => {
    expect(stepKind(step({ type: 'agent', detail: 'fork: general' }))).toEqual({ kind: 'fork', name: 'general' });
    expect(stepKind(step({ type: 'webhook', detail: '' }))).toEqual({ kind: null, name: 'webhook' });
    expect(stepKind(step({ type: '', detail: '' }))).toEqual({ kind: null, name: '' });
  });
});

describe('stepMarks', () => {
  it('numbers the rows in run order; the steps of a row of several get letters', () => {
    const w = parseWorkflows({
      items: [{
        name: 'x',
        entry_point: 'a',
        steps: [{ id: 'a', next: [{ to: 'b' }] }, { id: 'b', parallel: true, next: [{ to: 'c' }, { to: 'd' }, { to: 'e' }] }, { id: 'c', next: [{ to: 'f' }] }, { id: 'd', next: [{ to: 'f' }] }, { id: 'e', next: [{ to: 'f' }] }, { id: 'f' }],
      }],
    })[0]!;
    expect([...stepMarks(graphOf(w))]).toEqual([['a', '1'], ['b', '2'], ['c', '3a'], ['d', '3b'], ['e', '3c'], ['f', '4']]);
  });

  it('a step that is not placed (not reached, or reached by a route not shown) has no mark', () => {
    const w = parseWorkflows({ items: [{ name: 'x', entry_point: 'a', steps: [{ id: 'a' }, { id: 'lost', unreachable: true }, { id: 'stray' }] }] })[0]!;
    expect([...stepMarks(graphOf(w))]).toEqual([['a', '1']]);
  });

  it('a mark never runs past four characters: a row too wide for a letter leaves its steps unmarked', () => {
    const many = Array.from({ length: 30 }, (_, i) => `s${i}`);
    const w = parseWorkflows({ items: [{ name: 'x', entry_point: 'a', steps: [{ id: 'a', parallel: true, next: many.map((to) => ({ to })) }, ...many.map((id) => ({ id }))] }] })[0]!;
    const m = stepMarks(graphOf(w));
    expect(m.get('s0')).toBe('2a');
    expect(m.get('s25')).toBe('2z');
    expect(m.has('s26')).toBe(false);
    for (const v of m.values()) expect(v.length).toBeLessThanOrEqual(4);
  });
});
