// The REAL adapter output, drawn. The prompt of a failed turn was taken by the agent (state sent), so the adapter gives its block
// NO note; its Retry must still be drawn (it once lived inside the note), and pressing it names the row's request.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from '@kit/agent/capability';
import { SessionView } from '@kit/agent/SessionView';
import type { ActiveSource, ConvSnapshot } from '@kit/agent/source';
import type * as C from './conv';
import { canStopTracking } from './rowActions';
import { blocksOf, checkableRows } from './source';
import strings from './strings.en.json';

const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const prompt: C.UserMsg = { id: 'u1', text: 'fix the build', at: 1000, key: 'k1', via: 'turn', state: 'sent', turnId: null, commandId: null, reason: '' };
const failed: Extract<C.Block, { k: 'outcome' }> = { k: 'outcome', key: 'o0', state: 'failed', code: 'turn_failed', retryAt: null, effects: false, retry: 'u1' };

function open(blocks: ReturnType<typeof blocksOf>) {
  const snap: ConvSnapshot = { facts, title: 't', gates: [], blocks };
  const retry = vi.fn(async () => ({ k: 'done' as const }));
  const src = {
    kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's' }, snapshot: () => snap, subscribe: () => () => undefined, watch: () => undefined,
    can: (a: Action) => can(a, facts), send: vi.fn(), stop: vi.fn(), decide: vi.fn(), answer: vi.fn(), check: vi.fn(), dismissDecision: vi.fn(), canDismiss: () => false, retry,
  } as unknown as ActiveSource;
  return { src, retry };
}

describe('Retry under the prompt of a failed turn', () => {
  it('the adapter gives the prompt block no note and the retry action; the view draws Retry and it names that request', () => {
    const bs = blocksOf([{ k: 'user', key: 'ub', msg: prompt }, failed], { now: 0 });
    const u = bs.find((b) => b.k === 'user');
    expect(u && u.k === 'user' ? [u.note, u.actions] : null, 'the real block: no note, a retry action').toEqual([undefined, ['retry']]);
    const { src, retry } = open(bs);
    render(<SessionView source={src} size="l" />);
    const b = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(b);
    expect(retry).toHaveBeenCalledWith({ key: 'k1', kind: 'turn' });
  });
  it('with no note there is no leading separator before the first action', () => {
    const { src } = open(blocksOf([{ k: 'user', key: 'ub', msg: prompt }, failed], { now: 0 }));
    const { container } = render(<SessionView source={src} size="l" />);
    // The dot is a text separator (a span); an outcome line's icon is aria-hidden too and is not one.
    const dots = [...container.querySelectorAll('p span[aria-hidden="true"]')].filter((x) => x.textContent === '·');
    expect(dots, 'no dot before a first action when nothing stands before it').toEqual([]);
  });
});

describe('a queued follow-up, drawn from the real adapter', () => {
  const q = (over: Partial<C.UserMsg> = {}): C.UserMsg => ({ ...prompt, id: 'u2', key: 'k2', text: 'also a README', via: 'command', state: 'queued', commandId: 'cmd_2', ...over });
  const S = strings as Record<string, string>;
  const noteOf = (m: C.UserMsg) => {
    const u = blocksOf([{ k: 'user', key: 'ub', msg: m }], { now: 0 }).find((b) => b.k === 'user');
    return u && u.k === 'user' ? { note: u.note?.text, actions: u.actions } : null;
  };
  it('offers Edit and Remove under its waiting line', () => {
    expect(noteOf(q())).toEqual({ note: S['ask.queued'], actions: ['editQueued', 'withdraw'] });
  });
  it.each<[C.UserMsg['wd'], string]>([
    ['sending', 'ask.withdrawing'], ['taken', 'ask.withdrawTaken'], ['off', 'ask.withdrawOff'], ['closed', 'ask.withdrawClosed'],
  ])('wd %s: its own words, no Edit or Remove', (wd, key) => {
    expect(noteOf(q({ wd }))).toEqual({ note: S[key], actions: undefined });
  });
  it('wd unknown: its words and Check again only (C9: a read, never another take-back); it counts as something Check can read', () => {
    expect(noteOf(q({ wd: 'unknown' }))).toEqual({ note: S['ask.withdrawUnknown'], actions: ['check'] });
    expect(S['ask.withdrawUnknown'], 'the words do not repeat the button').not.toMatch(/check/i);
    const f = (m: C.UserMsg) => checkableRows({ [m.id]: m });
    expect(f(q({ wd: 'unknown' })), 'an unknown take-back is unsettled').toBe(1);
    expect(f(q()), 'a plain queued row is not').toBe(0);
  });
  it('Stop tracking is offered only when Remove cannot take the row back (and never while a take-back is out)', () => {
    expect(canStopTracking(q(), false), 'Remove is on offer').toBe(false);
    expect(canStopTracking(q({ wd: 'sending' }), false), 'a take-back is out').toBe(false);
    expect(canStopTracking(q({ reason: 'ask.withdrawFailed' }), false), 'Remove is on offer again').toBe(false);
    for (const wd of ['unknown', 'taken', 'off', 'closed'] as const) expect(canStopTracking(q({ wd }), false), `wd ${wd}`).toBe(true);
    expect(canStopTracking(q({ commandId: null }), true), 'no command id: nothing to take back').toBe(true);
  });
  it('a refusal that changed nothing says so and offers both again; a message taken back says so, with Edit only', () => {
    expect(noteOf(q({ reason: 'ask.withdrawFailed' }))).toEqual({ note: S['ask.withdrawFailed'], actions: ['editQueued', 'withdraw'] });
    expect(noteOf(q({ state: 'notSent', reason: 'ask.withdrawn' }))).toEqual({ note: S['ask.withdrawn'], actions: ['takeBack'] });
  });
});
