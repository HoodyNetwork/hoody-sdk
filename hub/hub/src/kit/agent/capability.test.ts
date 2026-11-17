// Vitest: the capability table. `can()` decides every chip, menu item and button from backend, state, policy,
// leases and busy; every send and decision is unavailable on a read-only source and while any activation prerequisite
// is missing.
import { describe, expect, it } from 'vitest';
import { ACTIONS, SENDING, can, missingPrerequisites, type Action, type CapFacts, type Reason } from './capability';

const ready: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const f = (o: Partial<CapFacts> = {}): CapFacts => ({ ...ready, ...o, prereq: { ...ready.prereq, ...(o.prereq ?? {}) } });
const why = (a: Action, o: Partial<CapFacts> = {}): Reason | 'ok' => { const c = can(a, f(o)); return c.ok ? 'ok' : c.reason; };

describe('a read-only source', () => {
  it.each(ACTIONS)('%s is read_only on a source that was never activated', (a) => {
    expect(why(a, { mode: 'read', state: 'running', turn: true, gate: 'confirm', unsettledSends: 1 })).toBe('read_only');
  });
  it('every send and decision is among the actions it refuses', () => {
    for (const a of ['send', 'followUp', 'interruptSend', 'autoApproveTurn', 'stopTurn', 'stopChat', 'decide', 'answer', 'check', 'compact'] as const) {
      expect(ACTIONS).toContain(a);
      expect(can(a, f({ mode: 'read' })).ok).toBe(false);
    }
  });
});

describe('the activation prerequisites', () => {
  it.each(['journal', 'recovery', 'attachment'] as const)('without the %s every send and decision is unavailable and names what is missing', (p) => {
    const facts = f({ state: 'running', turn: true, gate: 'confirm', prereq: { [p]: false } as Partial<CapFacts['prereq']> as CapFacts['prereq'] });
    for (const a of SENDING) {
      const c = can(a, facts);
      expect(c.ok, a).toBe(false);
      expect(c.ok ? '' : c.reason, a).toBe('prerequisites');
      expect(c.ok ? [] : c.missing, a).toEqual([p]);
    }
  });
  it('a Strict chat also needs the approver lease; held elsewhere says so', () => {
    expect(why('send', { approval: 'always', prereq: { approver: 'missing' } as CapFacts['prereq'] })).toBe('prerequisites');
    expect(why('decide', { approval: 'always', gate: 'confirm', prereq: { approver: 'elsewhere' } as CapFacts['prereq'] })).toBe('approver_elsewhere');
    expect(why('send', { approval: 'always', prereq: { approver: 'held' } as CapFacts['prereq'] })).toBe('ok');
  });
  it('Strict needs a HELD lease: "notNeeded" is not one, for send, compact, decide and answer alike', () => {
    const strict = { approval: 'always' as const, prereq: { approver: 'notNeeded' } as CapFacts['prereq'] };
    expect(missingPrerequisites(f(strict))).toEqual(['approver']);
    for (const a of ['send', 'compact'] as const) expect(why(a, strict), a).toBe('prerequisites');
    expect(why('decide', { ...strict, state: 'running', turn: true, gate: 'confirm' })).toBe('prerequisites');
    expect(why('answer', { ...strict, state: 'running', turn: true, gate: 'question' })).toBe('prerequisites');
  });
  it('a default chat never needs the approver lease', () => {
    expect(why('send', { approval: 'default', prereq: { approver: 'missing' } as CapFacts['prereq'] })).toBe('ok');
  });
  it('check is a read: it needs the journal and recovery, not the leases, and something to check', () => {
    expect(why('check', { unsettledSends: 1, prereq: { attachment: false } as CapFacts['prereq'] })).toBe('ok');
    expect(why('check', { unsettledSends: 1, prereq: { recovery: false } as CapFacts['prereq'] })).toBe('prerequisites');
    expect(why('check', { unsettledSends: 0 })).toBe('nothing_to_check');
  });
  it('missingPrerequisites lists them in order', () => {
    expect(missingPrerequisites(f({ approval: 'always', prereq: { journal: false, recovery: false, attachment: false, approver: 'missing' } }))).toEqual(['journal', 'recovery', 'attachment', 'approver']);
    expect(missingPrerequisites(f())).toEqual([]);
  });
});

describe('what cannot be asked of a conversation that cannot be read', () => {
  it.each(['unreachable', 'forbidden', 'missing'] as const)('%s refuses everything with that reason', (reach) => {
    for (const a of ACTIONS) expect(why(a, { reach }), a).toBe(reach);
  });
  it('loading and gone refuse everything', () => {
    for (const a of ACTIONS) { expect(why(a, { state: 'loading' }), a).toBe('loading'); expect(why(a, { state: 'gone' }), a).toBe('gone'); }
  });
});

describe('sending', () => {
  it('send on an idle chat; a running turn takes a follow-up instead', () => {
    expect(why('send')).toBe('ok');
    expect(why('send', { state: 'running', turn: true })).toBe('turn_running');
    expect(why('followUp', { state: 'running', turn: true })).toBe('ok');
    expect(why('followUp')).toBe('no_turn');
    expect(why('interruptSend', { state: 'running', turn: true })).toBe('ok');
  });
  it('a paused daemon refuses nothing here: messages are taken and wait', () => {
    expect(why('send', { daemonPaused: true })).toBe('ok');
    expect(why('followUp', { daemonPaused: true, state: 'running', turn: true })).toBe('ok');
    expect(why('interruptSend', { daemonPaused: true, state: 'running', turn: true })).toBe('ok');
    expect(why('autoApproveTurn', { daemonPaused: true })).toBe('ok');
    for (const a of ACTIONS) expect(why(a, { daemonPaused: true }), a).toBe(why(a));
  });
  it('a closed chat refuses sends until reopened', () => {
    expect(why('send', { state: 'closed' })).toBe('closed');
    expect(why('reopen', { state: 'closed' })).toBe('ok');
    expect(why('reopen')).toBe('open');
  });
  it('auto-approve this reply: not in Strict or locked, never unknown', () => {
    expect(why('autoApproveTurn')).toBe('ok');
    expect(why('autoApproveTurn', { approval: 'always', prereq: { approver: 'held' } as CapFacts['prereq'] })).toBe('strict_refuses_automatic');
    expect(why('autoApproveTurn', { approval: 'locked' })).toBe('locked_by_policy');
    expect(why('autoApproveTurn', { approval: 'unknown' })).toBe('approval_unknown');
  });
  it('images wait for a turn to end', () => {
    expect(why('attachImages')).toBe('ok');
    expect(why('attachImages', { state: 'running', turn: true })).toBe('images_wait');
  });
  it('Stop needs a running turn; Stop everything needs an open chat', () => {
    expect(why('stopTurn')).toBe('no_turn');
    expect(why('stopTurn', { state: 'running', turn: true })).toBe('ok');
    expect(why('stopChat')).toBe('ok');
    expect(why('stopChat', { state: 'closed' })).toBe('closed');
  });
  it('Stop one shell job needs an open chat, a running turn or not, and is a send: read-only, the prerequisites and a Bot chat refuse it', () => {
    expect(why('stopJob')).toBe('ok');
    expect(why('stopJob', { state: 'running', turn: true })).toBe('ok');
    expect(why('stopJob', { state: 'closed' })).toBe('closed');
    expect(SENDING.has('stopJob')).toBe(true);
    expect(why('stopJob', { mode: 'read' })).toBe('read_only');
    expect(why('stopJob', { prereq: { journal: false } as CapFacts['prereq'] })).toBe('prerequisites');
    expect(why('stopJob', { approval: 'always', prereq: { approver: 'elsewhere' } as CapFacts['prereq'] })).toBe('approver_elsewhere');
    expect(why('stopJob', { backend: 'bot' })).toBe('bot');
  });
  it('Compact now is refused while a gate waits ("Answer the waiting approval first")', () => {
    expect(why('compact')).toBe('ok');
    expect(why('compact', { state: 'running', turn: true, gate: 'confirm' })).toBe('gate_parked');
  });
});

describe('decisions', () => {
  const g = (o: Partial<CapFacts> = {}) => f({ state: 'running', turn: true, gate: 'confirm', ...o });
  it('decide answers a confirm; answer answers a question; neither answers the other', () => {
    expect(can('decide', g()).ok).toBe(true);
    expect(why('answer', g())).toBe('no_gate');
    expect(can('answer', g({ gate: 'question' })).ok).toBe(true);
    expect(why('decide', g({ gate: 'question' }))).toBe('no_gate');
    expect(why('decide', f())).toBe('no_gate');
  });
  it.each([['policy', 'gate_policy'], ['helper', 'gate_helper'], ['addressing', 'gate_addressing'], ['held', 'gate_held']] as const)('a gate blocked by %s is %s', (b, r) => {
    expect(why('decide', g({ gateBlocked: b }))).toBe(r);
  });
  it('a decision on its way cannot be decided again', () => {
    expect(why('decide', g({ decisionPending: true }))).toBe('decision_pending');
  });
});

describe('live and fixed settings', () => {
  it.each(['setModel', 'setAgent', 'setEffort', 'setVerbosity'] as const)('%s is idle only', (a) => {
    expect(why(a)).toBe('ok');
    expect(why(a, { state: 'running', turn: true })).toBe('turn_in_flight');
    expect(why(a, { state: 'running', turn: true, gate: 'confirm' })).toBe('gate_parked');
  });
  it('approvals change only when nothing is busy; locked never', () => {
    expect(why('setApproval')).toBe('ok');
    for (const o of [{ turn: true }, { gate: 'question' as const }, { queued: true }, { children: true }, { shells: true }]) expect(why('setApproval', o)).toBe('session_busy');
    expect(why('setApproval', { approval: 'locked' })).toBe('locked_by_policy');
  });
  it('rules and auto-approve: Strict refuses both; locked refuses auto-approve', () => {
    expect(why('setRules')).toBe('ok');
    expect(why('setRules', { approval: 'always' })).toBe('strict_refuses_rules');
    expect(why('setYolo')).toBe('ok');
    expect(why('setYolo', { approval: 'always' })).toBe('strict_refuses_automatic');
    expect(why('setYolo', { approval: 'locked' })).toBe('locked_by_policy');
    expect(why('setYolo', { approval: 'unknown' })).toBe('approval_unknown');
  });
  it('folder access is fixed once the first turn starts', () => {
    expect(why('setFolderAccess', { firstTurnStarted: false })).toBe('ok');
    expect(why('setFolderAccess')).toBe('fixed_after_start');
  });
  it('a Bot delegate offers none of the session settings', () => {
    for (const a of ['setModel', 'setAgent', 'setEffort', 'setVerbosity', 'setApproval', 'setRules', 'setYolo', 'setFolderAccess', 'compact', 'trim', 'followUp', 'interruptSend', 'autoApproveTurn', 'attachImages', 'stopChat'] as const) {
      expect(why(a, { backend: 'bot' }), a).toBe('bot');
    }
    expect(why('send', { backend: 'bot' })).toBe('ok');
  });
});

describe('trim: remove the replies that follow a finished one', () => {
  it('is a plain write: needs an activated source, not the activation prerequisites', () => {
    expect(ACTIONS).toContain('trim');
    expect(SENDING.has('trim')).toBe(false);
    expect(why('trim', { mode: 'read', completedTurns: 3 })).toBe('read_only');
    expect(why('trim', { completedTurns: 3, prereq: { journal: false, recovery: false, attachment: false, approver: 'missing' } })).toBe('ok');
  });
  it('a closed chat is refused first, then a running turn, then a waiting approval', () => {
    expect(why('trim', { state: 'closed', turn: true, gate: 'confirm', completedTurns: 3 })).toBe('closed');
    expect(why('trim', { state: 'running', turn: true, gate: 'confirm', completedTurns: 3 })).toBe('turn_in_flight');
    expect(why('trim', { gate: 'question', completedTurns: 3 })).toBe('gate_parked');
  });
  it('a chat with fewer than two finished turns has nothing to remove; an unreported count keeps the old answer', () => {
    expect(why('trim', { completedTurns: 0 })).toBe('no_later_turn');
    expect(why('trim', { completedTurns: 1 })).toBe('no_later_turn');
    expect(why('trim', { completedTurns: 2 })).toBe('ok');
    expect(why('trim', { completedTurns: 12 })).toBe('ok');
    expect(why('trim')).toBe('ok');
  });
  it('a gone, loading or unreachable chat answers with that, like every action', () => {
    expect(why('trim', { state: 'gone', completedTurns: 3 })).toBe('gone');
    expect(why('trim', { state: 'loading', completedTurns: 3 })).toBe('loading');
    expect(why('trim', { reach: 'unreachable', completedTurns: 3 })).toBe('unreachable');
  });
  it('a Bot reference is refused as a Bot', () => {
    expect(why('trim', { backend: 'bot', completedTurns: 3 })).toBe('bot');
  });
});

describe('a chat asleep on the computer (the agent let it go idle)', () => {
  // The agent answers every live-only change of a sleeping chat 404; a message wakes it, so sends stay open.
  it.each(['setModel', 'setAgent', 'setEffort', 'setVerbosity', 'setYolo', 'trim'] as const)('%s says to send a message first', (a) => {
    expect(why(a, { asleep: true })).toBe('asleep');
    expect(why(a, { asleep: false })).toBe('ok');
  });
  it('a message, a follow-up command and the other writes still go: sending wakes it', () => {
    for (const a of ['send', 'compact', 'resend', 'retry', 'stopChat', 'setApproval', 'setRules', 'fork', 'rename', 'close', 'delete', 'withdraw', 'takeBack'] as const) {
      expect(why(a, { asleep: true }), a).toBe('ok');
    }
  });
  it('a Strict chat asleep: a merely missing approver lease does not hold the send (the message wakes it); one held elsewhere does', () => {
    expect(why('send', { asleep: true, approval: 'always', prereq: { approver: 'missing' } as CapFacts['prereq'] })).toBe('ok');
    expect(why('send', { asleep: true, approval: 'always', prereq: { approver: 'elsewhere' } as CapFacts['prereq'] })).toBe('approver_elsewhere');
    expect(why('send', { asleep: false, approval: 'always', prereq: { approver: 'missing' } as CapFacts['prereq'] })).toBe('prerequisites');
    expect(why('send', { asleep: true, approval: 'always', prereq: { approver: 'missing', journal: false } as CapFacts['prereq'] })).toBe('prerequisites');
  });
  it('a truer reason wins: closed, read-only, Strict, policy, nothing to trim', () => {
    expect(why('setModel', { asleep: true, state: 'closed' })).toBe('closed');
    expect(why('setModel', { asleep: true, mode: 'read' })).toBe('read_only');
    expect(why('setYolo', { asleep: true, approval: 'always' })).toBe('strict_refuses_automatic');
    expect(why('setYolo', { asleep: true, approval: 'locked' })).toBe('locked_by_policy');
    expect(why('trim', { asleep: true, completedTurns: 1 })).toBe('no_later_turn');
    expect(why('trim', { asleep: true, completedTurns: 3 })).toBe('asleep');
  });
});

describe('the table is total', () => {
  it('every action answers ok or a reason on a plain ready chat', () => {
    for (const a of ACTIONS) { const c = can(a, f()); expect(typeof c.ok).toBe('boolean'); }
  });
});
