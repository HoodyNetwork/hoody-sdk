// Vitest: the 'fork' row of the capability table. Fork is a change of nothing in the parent, so it stays allowed on an idle or
// running chat; a CLOSED chat cannot be forked (the agent forks only a live session: reopen it first, the same sentence as every closed
// action), and a chat that reports no completed turn has nothing to fork (a fork of it would be an empty draft). The fact is OPTIONAL:
// a source that does not report it keeps the old answer, so no existing source changes.
import { describe, expect, it } from 'vitest';
import { can, type Action, type CapFacts } from './capability';

const ready: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const f = (o: Partial<CapFacts> = {}): CapFacts => ({ ...ready, ...o });
const why = (a: Action, o: Partial<CapFacts> = {}) => { const c = can(a, f(o)); return c.ok ? 'ok' : c.reason; };

describe('fork', () => {
  it('an idle or running chat with turns can be forked', () => {
    expect(why('fork', { completedTurns: 3 })).toBe('ok');
    expect(why('fork', { state: 'running', turn: true, completedTurns: 1 })).toBe('ok');
  });
  it('a closed chat says closed (reopen it first)', () => {
    expect(why('fork', { state: 'closed', completedTurns: 3 })).toBe('closed');
    expect(why('fork', { state: 'closed' })).toBe('closed');
  });
  it('a chat with no completed turn has nothing to fork', () => {
    expect(why('fork', { completedTurns: 0 })).toBe('no_completed_turn');
  });
  it('closed wins over no completed turn (the person can fix it by reopening)', () => {
    expect(why('fork', { state: 'closed', completedTurns: 0 })).toBe('closed');
  });
  it('a source that does not report completed turns keeps the old answer (allowed)', () => {
    expect(why('fork')).toBe('ok');
    expect(why('fork', { completedTurns: undefined })).toBe('ok');
  });
  it('the earlier rows still win: unreadable, loading, gone and read-only say so', () => {
    expect(why('fork', { reach: 'unreachable', completedTurns: 0 })).toBe('unreachable');
    expect(why('fork', { state: 'loading', completedTurns: 0 })).toBe('loading');
    expect(why('fork', { state: 'gone', completedTurns: 0 })).toBe('gone');
    expect(why('fork', { mode: 'read', completedTurns: 3 })).toBe('read_only');
  });
  it('a Bot chat can still be forked (the server decides what it continues on), but not when closed or empty', () => {
    expect(why('fork', { backend: 'bot', completedTurns: 2 })).toBe('ok');
    expect(why('fork', { backend: 'bot', state: 'closed', completedTurns: 2 })).toBe('closed');
    expect(why('fork', { backend: 'bot', completedTurns: 0 })).toBe('no_completed_turn');
  });
  it('no other action changed: rename and delete stay allowed on a closed chat', () => {
    expect(why('rename', { state: 'closed', completedTurns: 0 })).toBe('ok');
    expect(why('delete', { state: 'closed', completedTurns: 0 })).toBe('ok');
  });
});
