// loadPhase: one value for "what is the open chat waiting on", from one snapshot. Every row of the table the UI draws from.
import { describe, expect, it } from 'vitest';
import * as C from './conv';
import { loadPhase, type LoadView } from './loadPhase';
import * as L from './logic';

const user = (id: string, p: Partial<C.UserMsg> = {}): C.UserMsg => ({ id, text: 'hello', at: 1, key: 'k-' + id, via: 'turn', state: 'sent', turnId: null, commandId: null, reason: '', ...p });
const view = (p: Partial<LoadView> = {}): LoadView => ({ phase: 'ready', band: null, status: null, conv: C.emptyConv('sess-1'), ...p });
/** A conversation with one turn: `turnId` null for a turn the agent has not named yet. */
function withTurn(turnId: string | null, u: C.UserMsg, more: C.UserMsg[] = []): C.Conv {
  let c = C.addUser(C.emptyConv('sess-1'), u);
  c = C.addTurn(c, { turnId, user: u.id, now: 1 });
  for (const m of more) c = C.addUser(c, m);
  return c;
}
const statusOf = (c: C.Conv, conn = { lost: false, reconnecting: false }) => C.statusOf(c, conn);

describe('loadPhase', () => {
  it('opening: the chat is read for the first time, unless a band already says why it cannot be', () => {
    expect(loadPhase(view({ phase: 'checking' }))).toBe('opening');
    expect(loadPhase(view({ phase: 'checking', band: { k: 'starting' } }))).toBe('idle');
    expect(loadPhase(view({ phase: 'checking', band: { k: 'unreachable' } }))).toBe('idle');
  });
  it('idle: nothing runs; a blocked or ended engine and a band speak for themselves', () => {
    expect(loadPhase(view())).toBe('idle');
    expect(loadPhase(view({ phase: 'blocked' }))).toBe('idle');
    expect(loadPhase(view({ phase: 'ended' }))).toBe('idle');
    expect(loadPhase(view({ band: { k: 'stopped' }, status: 'working' }))).toBe('idle');
  });
  it('sending: a first message on its way (no session yet) is sending from the snapshot that first shows its row', () => {
    const c = C.addUser(C.emptyConv(), user('u1', { via: 'create', state: 'sending' }));
    expect(loadPhase(view({ conv: c, status: statusOf(c) }))).toBe('sending');
  });
  it('sending: a turn on an idle chat whose receipt has not come (the turn block exists, the agent has not named it)', () => {
    const c = withTurn(null, user('u1', { state: 'sending' }));
    expect(statusOf(c)).toBe('working');
    expect(loadPhase(view({ conv: c, status: statusOf(c) }))).toBe('sending');
  });
  it('working: the agent named the turn', () => {
    const c = withTurn('turn-1', user('u1'));
    expect(loadPhase(view({ conv: c, status: statusOf(c) }))).toBe('working');
  });
  it('a follow-up on its way while a turn runs does not turn the row to sending: the turn works on', () => {
    const c = withTurn('turn-1', user('u1'), [user('u2', { via: 'command', state: 'sending' })]);
    expect(loadPhase(view({ conv: c, status: statusOf(c) }))).toBe('working');
  });
  it('a turn whose answer was lost is not working: nothing proves it runs, and its row says Check status', () => {
    const c = withTurn(null, user('u1', { state: 'unknown' }));
    expect(statusOf(c)).toBe('working');
    expect(loadPhase(view({ conv: c, status: statusOf(c) }))).toBe('idle');
  });
  it('waiting and stopping are the turn\'s own words', () => {
    const c = withTurn('turn-1', user('u1'));
    const stopping = C.onTurn(c, { type: 'stop' });
    expect(loadPhase(view({ conv: stopping, status: statusOf(stopping) }))).toBe('stopping');
    expect(loadPhase(view({ conv: c, status: 'waiting' }))).toBe('waiting');
  });
  it('reconnecting, then lost: the connection of a running turn', () => {
    const c = withTurn('turn-1', user('u1'));
    expect(loadPhase(view({ conv: c, status: statusOf(c, { lost: false, reconnecting: true }) }))).toBe('reconnecting');
    expect(loadPhase(view({ conv: c, status: statusOf(c, { lost: true, reconnecting: true }) }))).toBe('lost');
  });
  it('catching up wins over reconnecting and working (nothing is proven running), and never over lost', () => {
    const c = withTurn('turn-1', user('u1'));
    expect(loadPhase(view({ conv: c, status: 'reconnecting', catchingUp: true }))).toBe('catching_up');
    expect(loadPhase(view({ conv: c, status: 'working', catchingUp: true }))).toBe('catching_up');
    expect(loadPhase(view({ conv: c, status: 'lost', catchingUp: true }))).toBe('lost');
  });
  it('catching up with nothing running: a turn that ended unseen is being read back', () => {
    const done = C.onTurn(withTurn('turn-1', user('u1')), { type: 'receipt', body: { turn_id: 'turn-1', state: 'completed' } }, 2);
    expect(L.phase(C.current(done)!.s)).toBe('completed');
    expect(loadPhase(view({ conv: done, status: statusOf(done), catchingUp: true }))).toBe('catching_up');
    expect(loadPhase(view({ conv: done, status: statusOf(done) }))).toBe('idle');
  });
});
