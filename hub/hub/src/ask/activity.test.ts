// Vitest (activity): how many of this computer's conversations run now, from the agent's own
// state only. Any read that does not answer makes the round unknown (no badge), never 0 or an older count; a deleted
// session is not running; waiting (a card for the person, the lead's or a helper's) counts as running and as waiting.
import { describe, expect, it } from 'vitest';
import { activityOf, cleanIdle, orderRecent, phasesOf, readActivity, recentState, shownPhase, ACTIVITY_MAX } from './activity';
import type { AgentIO } from './data';
import type { AskRecord } from './logic';

const rec = (k1: string, s: string | null, o: Partial<AskRecord> = {}): AskRecord =>
  ({ p: 'p', c: 'c', r: 'f1f1f1f1f1f1f1f1f1f1f1f1', s, t: null, k1, k2: k1 + '-2', rc: 'custom', n: null, at: 1, i: null, q: 0, ph: 'completed', l: '', ...o }) as AskRecord;

function io(answers: Record<string, unknown>): AgentIO & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    state: (sid: string) => {
      asked.push(sid);
      const a = answers[sid];
      return a instanceof Error || (a && typeof a === 'object' && 'status' in a) ? Promise.reject(a) : Promise.resolve(a);
    },
  } as unknown as AgentIO & { asked: string[] };
}

describe('activityOf', () => {
  it('reads running, waiting and idle from the agent state', () => {
    expect(activityOf({ state: 'running' })).toBe('running');
    expect(activityOf({ state: 'parked' })).toBe('waiting');
    expect(activityOf({ state: 'running', pending_helper_gates: [{ type: 'confirm' }] })).toBe('waiting');
    expect(activityOf({ state: 'idle' })).toBe('idle');
    expect(activityOf({ state: 'closed' })).toBe('idle');
  });
  it('a body that does not say is not known', () => {
    expect(activityOf(null)).toBeNull();
    expect(activityOf({})).toBeNull();
    expect(activityOf({ state: 'thinking' })).toBeNull();
  });
});

describe('readActivity', () => {
  it('counts running and waiting conversations, waiting ones counted in both', async () => {
    const a = await readActivity(io({ s1: { state: 'running' }, s2: { state: 'parked' }, s3: { state: 'idle' } }), [rec('a', 's1'), rec('b', 's2'), rec('c', 's3')]);
    expect(a).toEqual({ running: 2, waiting: 1, by: { a: 'running', b: 'waiting', c: 'idle' } });
  });
  it('one read that fails makes the whole round unknown (no badge, never 0 or a partial count)', async () => {
    const a = await readActivity(io({ s1: { state: 'running' }, s2: { status: 503 } }), [rec('a', 's1'), rec('b', 's2')]);
    expect(a).toBeNull();
    const lost = await readActivity(io({ s1: { state: 'running' }, s2: new Error('network') }), [rec('a', 's1'), rec('b', 's2')]);
    expect(lost).toBeNull();
  });
  it('a deleted session (404) is not running', async () => {
    const a = await readActivity(io({ s1: { status: 404 } }), [rec('a', 's1')]);
    expect(a).toEqual({ running: 0, waiting: 0, by: { a: 'gone' } });
  });
  it('records without a session, and gone ones, are not read', async () => {
    const x = io({ s1: { state: 'running' } });
    const a = await readActivity(x, [rec('a', 's1'), rec('b', null), rec('c', 's9', { ph: 'gone' } as Partial<AskRecord>)]);
    expect(x.asked).toEqual(['s1']);
    expect(a?.running).toBe(1);
  });
  it('reads at most ACTIVITY_MAX, the most recent first', async () => {
    const recs = Array.from({ length: ACTIVITY_MAX + 5 }, (_, i) => rec(`k${i}`, `s${i}`));
    const answers = Object.fromEntries(recs.map((r) => [r.s as string, { state: 'idle' }]));
    const x = io(answers);
    await readActivity(x, recs);
    expect(x.asked).toHaveLength(ACTIVITY_MAX);
    expect(x.asked[0]).toBe('s0');
  });
  it('nothing to read: known, zero', async () => {
    expect(await readActivity(io({}), [])).toEqual({ running: 0, waiting: 0, by: {} });
  });
});

describe('Recent with the agent\'s word (recentState, orderRecent)', () => {
  it('running or waiting: as the agent says, whatever is stored', () => {
    expect(recentState('completed', 'running')).toBe('Running');
    expect(recentState('completed', 'waiting')).toBe('Waiting');
  });
  it('idle (or closed) for a row stored as running or waiting: no longer claims either', () => {
    expect(recentState('waiting', 'idle')).toBe('Ended');
    expect(recentState('working', 'idle')).toBe('Ended');
    expect(recentState('completed', 'idle')).toBe('Done');
    expect(recentState('failed', 'idle')).toBe('Failed');
  });
  it('gone (404) for a row stored as running or waiting: gone', () => {
    expect(recentState('waiting', 'gone')).toBe('Gone');
    expect(recentState('working', 'gone')).toBe('Gone');
  });
  it('an unknown send stays unknown, whatever the agent says of the session (C9)', () => {
    expect(recentState('unknown', 'idle')).toBe('Unknown');
    expect(recentState('unknown', 'gone')).toBe('Unknown');
    expect(recentState('unknown', 'running')).toBe('Unknown');
    expect(recentState('unknown', 'waiting')).toBe('Unknown');
  });
  it('not known (no round yet): the stored phase', () => {
    expect(recentState('waiting', undefined)).toBe('Waiting');
  });
  it('orders waiting, then running, then the rest as stored; a stale stored "waiting" that is idle is not first', () => {
    const rows = [{ k1: 'done' }, { k1: 'stale' }, { k1: 'run' }, { k1: 'wait' }];
    const act = { running: 2, waiting: 1, by: { done: 'idle', stale: 'idle', run: 'running', wait: 'waiting' } } as const;
    expect(orderRecent(rows, act).map((r) => r.k1)).toEqual(['wait', 'run', 'done', 'stale']);
    expect(orderRecent(rows, null).map((r) => r.k1)).toEqual(['done', 'stale', 'run', 'wait']);
  });
});

describe('Recent reads the phase with the activity it goes with', () => {
  it('every stored conversation\'s Recent phase, an unsettled message reading unknown', () => {
    expect(phasesOf([rec('a', 's1', { k3: ['t2'] } as Partial<AskRecord>), rec('b', null, { ph: 'failed' } as Partial<AskRecord>)])).toEqual({ a: 'unknown', b: 'failed' });
  });
  it('another tab\'s unknown send after a completed turn stays unknown while Recent is open, running or idle', () => {
    // Recent opened when the turn had completed; since then another tab sent and lost the answer (the store says unknown).
    expect(recentState(shownPhase('completed', 'unknown'), 'running')).toBe('Unknown');
    expect(recentState(shownPhase('completed', 'unknown'), 'idle')).toBe('Unknown');
    expect(recentState(shownPhase('completed', 'unknown'), 'waiting')).toBe('Unknown');
  });
  it('a newer stored outcome is the one shown, never the opened Done', () => {
    expect(recentState(shownPhase('completed', 'failed'), 'idle')).toBe('Failed');
    expect(recentState(shownPhase('completed', 'cancelled'), 'idle')).toBe('Stopped');
  });
  it('an unknown read when Recent opened is not settled by a round that may be older', () => {
    expect(shownPhase('unknown', 'completed')).toBe('unknown');
  });
  it('no round yet: the phase read when Recent opened', () => {
    expect(shownPhase('failed', undefined)).toBe('failed');
  });
});

describe('cleanIdle (Clear list, check 6: a strict reading of a fresh GET /state)', () => {
  const idle = (o: Record<string, unknown> = {}): Record<string, unknown> => ({ session_id: 's1', state: 'idle', ...o });
  it('the clean idle and closed bodies qualify', () => {
    expect(cleanIdle(idle(), 's1')).toBe(true);
    expect(cleanIdle(idle({ state: 'closed' }), 's1')).toBe(true);
    expect(cleanIdle(idle({ pending_gate: null, pending_gate_ref: null, current_turn_id: null, queued_turn_ids: [], pending_lead_gates: [], pending_helper_gates: [], pending_lead_gate_refs: [], pending_helper_gate_refs: [] }), 's1')).toBe(true);
  });
  it('another session, or none, is not this conversation', () => {
    expect(cleanIdle(idle({ session_id: 's2' }), 's1')).toBe(false);
    expect(cleanIdle({ state: 'idle' }, 's1')).toBe(false);
    expect(cleanIdle(idle({ session_id: 1 }), 's1')).toBe(false);
  });
  it('a gate field of the wrong type is never "no helpers"', () => {
    expect(cleanIdle(idle({ pending_helper_gates: {} }), 's1')).toBe(false);
    expect(cleanIdle(idle({ pending_helper_gates: 'x' }), 's1')).toBe(false);
    expect(cleanIdle(idle({ pending_lead_gates: null }), 's1')).toBe(false);
    expect(cleanIdle(idle({ queued_turn_ids: 'x' }), 's1')).toBe(false);
    expect(cleanIdle(idle({ pending_lead_gate_refs: {} }), 's1')).toBe(false);
    expect(cleanIdle(idle({ pending_helper_gate_refs: [1] }), 's1')).toBe(false);
  });
  it('an idle body that still carries a gate, a turn or a queue is not idle', () => {
    expect(cleanIdle(idle({ pending_gate: { id: 'g' } }), 's1')).toBe(false);
    expect(cleanIdle(idle({ pending_gate: 'g' }), 's1')).toBe(false);
    expect(cleanIdle(idle({ pending_gate_ref: 'r' }), 's1')).toBe(false);
    expect(cleanIdle(idle({ pending_lead_gates: [{ id: 'g' }] }), 's1')).toBe(false);
    expect(cleanIdle(idle({ pending_helper_gates: [{ id: 'g' }] }), 's1')).toBe(false);
    expect(cleanIdle(idle({ current_turn_id: 't1' }), 's1')).toBe(false);
    expect(cleanIdle(idle({ queued_turn_ids: ['t2'] }), 's1')).toBe(false);
  });
  it('running, parked, unknown states and non-objects are not idle', () => {
    expect(cleanIdle(idle({ state: 'parked' }), 's1')).toBe(false);
    expect(cleanIdle(idle({ state: 'running' }), 's1')).toBe(false);
    expect(cleanIdle(idle({ state: 'weird' }), 's1')).toBe(false);
    for (const b of [null, undefined, 'idle', 7, [], true]) expect(cleanIdle(b, 's1')).toBe(false);
  });
  it('activityOf stays as loose as before (it feeds a count)', () => {
    expect(activityOf({ state: 'idle', pending_helper_gates: {} })).toBe('idle');
    expect(activityOf({ state: 'idle', session_id: 'other' })).toBe('idle');
  });
});
