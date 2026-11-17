// Check status for a message / turn / create / stop request, over a SCRIPTED engine. The rule (C9):
// a Check names ONE request by its key AND its kind. A row answers it only when its request key and kind are the named ones
// (never by row id, never "whichever row is unknown"); the wait keeps that identity and looks it up again on every snapshot, so a
// row that is replaced, republished under another key or gone answers `unknown`, never the replacement's outcome; the journal
// fallback reads only the entry that names the same request (`entryIdentity` + `sameCheck`).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import { engineActive, type ActiveDeps } from './active';

vi.mock('@kit/agent/approver-live', () => ({ approvers: () => ({ state: () => ({ phase: 'none' }), subscribe: () => () => undefined }), resetApproversForTests: () => undefined }));

const REF = { computer: 'atlas.tlas', realm: 'f1f1f1f1f1f1f1f1f1f1f1f1', sid: 'S' };
const host = () => ({ computer: 'atlas', realm: 'Personal' });
const user = (id: string, state: C.SendState, over: Partial<C.UserMsg> = {}): C.UserMsg => ({ id, text: 't' + id, at: 1, key: 'k' + id, via: 'turn', state, turnId: null, commandId: null, reason: '', ...over });
const withUsers = (...us: C.UserMsg[]) => ({ ...C.emptyConv('S'), sid: 'S', users: Object.fromEntries(us.map((u) => [u.id, u])), loose: us.map((u) => u.id) });
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  phase: 'ready', blocked: null, band: null, starting: false, conv: { ...C.emptyConv('S'), sid: 'S' }, status: null, gates: [], gate: null,
  decision: { pending: false, unknown: false }, dormant: false, checking: false, auto: { cap: false, on: null, busy: false, err: '', note: '' },
  needLogin: false, followUps: true, recent: null, version: 1, sendable: true, dup: null, att: { items: [], refused: [], dropped: '', reading: false },
  ...over,
});

function fake(init: Partial<Snapshot> = {}, ahead: Partial<Record<string, (...a: any[]) => unknown>> = {}) {
  let s = snap(init);
  const subs = new Set<() => void>();
  const put = (p: Partial<Snapshot>) => { s = { ...s, ...p }; for (const f of [...subs]) f(); };
  const calls: Record<string, unknown[][]> = {};
  const m = (name: string, dflt: (...a: any[]) => unknown = () => undefined) => (...a: unknown[]) => { (calls[name] ??= []).push(a); return (ahead[name] ?? dflt)(...a); };
  const eng = {
    getSnapshot: () => s,
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    activation: () => ({ journal: true, ref: { computer: 'c', realm: REF.realm, sid: 'S', target: {} }, strict: false }),
    send: m('send', () => false), decide: m('decide'), answer: m('answer'), stop: m('stop'), check: m('check'), checkDecision: m('checkDecision'),
    dismissDecision: m('dismissDecision'), canDismiss: m('canDismiss', () => false), attach: m('attach'), unattach: m('unattach'), checkNow: m('checkNow'),
    attemptOf: () => undefined, decisionProof: () => undefined, unknownDecisions: () => [], checkOutcome: m('checkOutcome'),
  } as unknown as AskEngine;
  return { eng, put, calls };
}
const deps = (over: Partial<ActiveDeps> = {}): ActiveDeps => ({
  approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
  leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
  pending: () => [], onPending: () => () => undefined,
  set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as any), decode: () => new Uint8Array(), waitMs: 1000, ...over,
});
const open = (f: ReturnType<typeof fake>, over: Partial<ActiveDeps> = {}) => engineActive({ current: () => f.eng, release: () => undefined }, REF, host, deps(over));
const entry = (over: Record<string, unknown> = {}) => ({ k: 'kA', kind: 'message', h: REF.computer, r: REF.realm, s: 'S', c: 'c', ct: 'ct', at: 1, ...over });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

/** One unknown follow-up row A (via command = kind message), the case two earlier bugs were found on. */
const rowA = () => user('u1', 'unknown', { key: 'kA', via: 'command' });

describe('a Check never answers with another request\'s outcome', () => {
  it('an absent message B, a stop B and {key:A, kind:stop} are nothing to check; row A is neither read nor settled for them', async () => {
    const f = fake({ conv: withUsers(rowA()) });
    const src = open(f);
    for (const c of [{ key: 'kB', kind: 'message' }, { key: 'kB', kind: 'stop' }, { key: 'kA', kind: 'stop' }, { key: 'kA', kind: 'turn' }, { key: 'kA', kind: 'create' }, { key: 'u1', kind: 'message' }] as const) {
      expect(await src.check(c), JSON.stringify(c)).toEqual({ k: 'refused', code: 'nothing_to_check' });
    }
    expect(f.calls.check ?? [], 'row A was not asked about').toHaveLength(0);
    expect(f.calls.checkNow ?? []).toHaveLength(0);
  });

  it('with two unknown rows, Check names one: only that row is asked, and only its outcome is returned', async () => {
    const f = fake({ conv: withUsers(rowA(), user('u2', 'unknown', { key: 'kB', via: 'command' })) });
    const p = open(f).check({ key: 'kB', kind: 'message' });
    f.put({ conv: withUsers(user('u1', 'sent', { key: 'kA', via: 'command' }), user('u2', 'unknown', { key: 'kB', via: 'command' })) });
    expect(f.calls.check).toEqual([['u2']]);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p, 'A settling says nothing about B').toEqual({ k: 'unknown' });
  });
});

describe('a republished row never settles the original Check', () => {
  it('Check A while row u1 is republished under key B as sent: unknown', async () => {
    const f = fake({ conv: withUsers(rowA()) });
    const p = open(f).check({ key: 'kA', kind: 'message' });
    f.put({ conv: withUsers(user('u1', 'sent', { key: 'kB', via: 'command' })) });
    expect(await p).toEqual({ k: 'unknown' });
  });
  it('the same row id republished under another KIND (turn) is not the request either', async () => {
    const f = fake({ conv: withUsers(rowA()) });
    const p = open(f).check({ key: 'kA', kind: 'message' });
    f.put({ conv: withUsers(user('u1', 'sent', { key: 'kA', via: 'turn' })) });
    expect(await p).toEqual({ k: 'unknown' });
  });
  it('another row taking the key later is not the request either (the row is looked up by key + kind each time, but a replacement of the row id with a settled one under the old key is the same request)', async () => {
    const f = fake({ conv: withUsers(rowA()) });
    const p = open(f).check({ key: 'kA', kind: 'message' });
    f.put({ conv: withUsers(user('u9', 'sent', { key: 'kA', via: 'command' })) });
    expect(await p, 'the request key and kind are the identity, not the row id').toEqual({ k: 'done' });
  });
});

describe('a row is checked by its key and kind', () => {
  it.each([
    ['command', 'message', {}, 'kA'], ['turn', 'turn', {}, 'kA'],
    // A create with no session yet is filed under the create key (the snapshot names it); once the session exists the same row is a turn.
    ['create', 'create', { createKey: 'kC' }, 'kC'], ['create', 'turn', {}, 'kA'],
  ] as const)('a %s row is a %s request: the engine is asked once, by the row', async (via, kind, extra, key) => {
    const f = fake({ conv: withUsers(user('u1', 'unknown', { key: 'kA', via })), ...extra });
    const p = open(f).check({ key, kind });
    expect(f.calls.check).toEqual([['u1']]);
    f.put({ conv: withUsers(user('u1', 'sent', { key: 'kA', via })) });
    expect(await p).toEqual({ k: 'done' });
  });
  it('a create-lost row (no session yet) is its create key only: its turn key and a turn kind are nothing to check', async () => {
    const f = fake({ conv: withUsers(user('u1', 'unknown', { key: 'kA', via: 'create' })), createKey: 'kC' });
    for (const c of [{ key: 'kA', kind: 'turn' }, { key: 'kA', kind: 'create' }, { key: 'kC', kind: 'turn' }] as const) {
      expect(await open(f).check(c), JSON.stringify(c)).toMatchObject({ k: 'refused' });
    }
    expect(f.calls.check ?? []).toEqual([]);
  });
  it.each([
    ['sent', { k: 'done' }], ['notSent', { k: 'refused', code: 'not_sent' }], ['refused', { k: 'refused', code: 'refused' }], ['superseded', { k: 'refused', code: 'superseded' }],
  ] as const)('the row settles %s', async (state, want) => {
    const f = fake({ conv: withUsers(rowA()) });
    const p = open(f).check({ key: 'kA', kind: 'message' });
    f.put({ conv: withUsers(user('u1', state, { key: 'kA', via: 'command' })) });
    expect(await p).toEqual(want);
  });
  it('a row that is still unknown when the wait ends is unknown; a vanished row is unknown; an ended engine is unknown', async () => {
    const a = fake({ conv: withUsers(rowA()) });
    const p = open(a).check({ key: 'kA', kind: 'message' });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toEqual({ k: 'unknown' });
    const b = fake({ conv: withUsers(rowA()) });
    const q = open(b).check({ key: 'kA', kind: 'message' });
    b.put({ conv: C.emptyConv('S') });
    expect(await q).toEqual({ k: 'unknown' });
    const c = fake({ conv: withUsers(rowA()) });
    const r = open(c).check({ key: 'kA', kind: 'message' });
    c.put({ phase: 'ended', conv: withUsers(user('u1', 'sent', { key: 'kA', via: 'command' })) });
    expect(await r).toEqual({ k: 'unknown' });
  });
  it('a chat with nothing unsettled has nothing to check (the door says so before this adapter); a queued row is the agent\'s (done, read back once); a sending row is not checked', async () => {
    for (const [state, want, asked] of [['sent', { k: 'refused', code: 'nothing_to_check' }, 0], ['notSent', { k: 'refused', code: 'nothing_to_check' }, 0], ['queued', { k: 'done' }, 1], ['sending', { k: 'refused', code: 'nothing_to_check' }, 0]] as const) {
      const f = fake({ conv: withUsers(user('u1', state, { key: 'kA', via: 'command' })) });
      expect(await open(f).check({ key: 'kA', kind: 'message' }), state).toEqual(want);
      expect(f.calls.check ?? [], state).toHaveLength(asked);
    }
    // A row still sending is not what Check status counts (a send in flight has no outcome to read yet): alone it leaves nothing to check;
    // while another row keeps the chat unsettled, the adapter itself still refuses to read it.
    const g = fake({ conv: withUsers(user('u1', 'sending', { key: 'kA', via: 'command' }), user('u2', 'unknown', { key: 'kB', via: 'command' })) });
    expect(await open(g).check({ key: 'kA', kind: 'message' })).toEqual({ k: 'refused', code: 'still_sending' });
    expect(g.calls.check ?? []).toHaveLength(0);
  });
  it('a row that settled after the door looked (another row keeps the chat unsettled) is answered from the row, without asking the engine', async () => {
    for (const [state, want] of [['sent', { k: 'done' }], ['notSent', { k: 'refused', code: 'not_sent' }], ['refused', { k: 'refused', code: 'refused' }], ['superseded', { k: 'refused', code: 'superseded' }]] as const) {
      const f = fake({ conv: withUsers(user('u1', state, { key: 'kA', via: 'command' }), user('u2', 'unknown', { key: 'kB', via: 'command' })) });
      expect(await open(f).check({ key: 'kA', kind: 'message' }), state).toEqual(want);
      expect(f.calls.check ?? [], state).toHaveLength(0);
    }
  });
  it('a throw from the engine is unknown (a read may have left)', async () => {
    const f = fake({ conv: withUsers(rowA()) }, { check: () => { throw new Error('boom'); } });
    expect(await open(f).check({ key: 'kA', kind: 'message' })).toEqual({ k: 'unknown' });
  });
});

describe('two rows with one key and different kinds', () => {
  // The same request key under a message (via command) and under a turn (via turn): the key alone is not the identity, the kind is part of
  // it, and the answer does not depend on which row the snapshot lists first.
  const mk = (which: 'm' | 't', state: C.SendState): C.UserMsg => (which === 'm' ? user('u1', state, { key: 'kA', via: 'command' }) : user('u2', state, { key: 'kA', via: 'turn' }));
  const rowOf = (which: 'm' | 't') => (which === 'm' ? 'u1' : 'u2');
  const kindOf = (which: 'm' | 't') => (which === 'm' ? 'message' : 'turn') as 'message' | 'turn';
  it.each([
    ['message row first, the message settles', ['m', 't'], 'm'], ['message row first, the turn settles', ['m', 't'], 't'],
    ['turn row first, the message settles', ['t', 'm'], 'm'], ['turn row first, the turn settles', ['t', 'm'], 't'],
  ] as const)('%s: each Check asks only its own row, and the other row\'s outcome is not its answer', async (_l, order, settles) => {
    const f = fake({ conv: withUsers(...order.map((o) => mk(o, 'unknown'))) });
    const src = open(f);
    const other = settles === 'm' ? 't' : 'm';
    const pSettled = src.check({ key: 'kA', kind: kindOf(settles) });
    const pOther = src.check({ key: 'kA', kind: kindOf(other) });
    expect(f.calls.check, 'each Check asked the engine about its own row, once').toEqual([[rowOf(settles)], [rowOf(other)]]);
    f.put({ conv: withUsers(...order.map((o) => mk(o, o === settles ? 'sent' : 'unknown'))) });
    expect(await pSettled, 'the request that settled is done').toEqual({ k: 'done' });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await pOther, 'the other request, same key, is still unknown').toEqual({ k: 'unknown' });
  });
});

describe('the engine publishes while it is asked', () => {
  it('a replacement published synchronously by engine.check() itself is not the request: unknown, never the replacement\'s outcome', async () => {
    const f: ReturnType<typeof fake> = fake({ conv: withUsers(rowA()) }, { check: () => f.put({ conv: withUsers(user('u1', 'sent', { key: 'kB', via: 'command' })) }) });
    expect(await open(f).check({ key: 'kA', kind: 'message' })).toEqual({ k: 'unknown' });
    expect(f.calls.check, 'asked once, by the row').toEqual([['u1']]);
  });
  it('a settlement of the same request published synchronously by engine.check() is seen (the wait reads the current snapshot when it starts, so the order of ask and wait does not matter)', async () => {
    const f: ReturnType<typeof fake> = fake({ conv: withUsers(rowA()) }, { check: () => f.put({ conv: withUsers(user('u1', 'sent', { key: 'kA', via: 'command' })) }) });
    expect(await open(f).check({ key: 'kA', kind: 'message' })).toEqual({ k: 'done' });
  });
  it('a queued row whose engine.check() throws is unknown, not the done its state would give, and leaves no timer', async () => {
    const f = fake({ conv: withUsers(user('u1', 'queued', { key: 'kA', via: 'command' })) }, { check: () => { throw new Error('boom'); } });
    expect(await open(f).check({ key: 'kA', kind: 'message' })).toEqual({ k: 'unknown' });
    expect(f.calls.check, 'the read was attempted once').toEqual([['u1']]);
    expect(vi.getTimerCount(), 'the wait was cancelled').toBe(0);
  });
});

describe('the journal fallback reads only the entry that names the same request', () => {
  const cases: Array<[string, Record<string, unknown>, { key: string; kind: 'message' | 'turn' | 'create' | 'stop' }, boolean]> = [
    ['message entry, same key', entry(), { key: 'kA', kind: 'message' }, true],
    ['message entry, another key', entry({ k: 'kZ' }), { key: 'kA', kind: 'message' }, false],
    ['message entry under a turn Check', entry(), { key: 'kA', kind: 'turn' }, false],
    ['turn entry, same key', entry({ kind: 'turn' }), { key: 'kA', kind: 'turn' }, true],
    ['create entry, same key', entry({ kind: 'create' }), { key: 'kA', kind: 'create' }, true],
    ['stop entry, same key', entry({ kind: 'stop' }), { key: 'kA', kind: 'stop' }, true],
    ['stop entry, another key', entry({ kind: 'stop', k: 'kZ' }), { key: 'kA', kind: 'stop' }, false],
    ['a message entry under a stop Check', entry(), { key: 'kA', kind: 'stop' }, false],
    ['same request, another computer', entry({ h: 'other' }), { key: 'kA', kind: 'message' }, false],
    ['same request, another realm', entry({ r: 'f2f2f2f2f2f2f2f2f2f2f2f2' }), { key: 'kA', kind: 'message' }, false],
    ['same request, another session', entry({ s: 'S2' }), { key: 'kA', kind: 'message' }, false],
  ];
  it.each(cases)('no row: %s', async (_l, e, check, reads) => {
    const f = fake();
    const o = await open(f, { pending: () => [e] as any }).check(check);
    expect(f.calls.checkNow ?? [], 'the session is read again').toHaveLength(reads ? 1 : 0);
    expect(f.calls.check ?? []).toHaveLength(0);
    expect(o).toEqual(reads ? { k: 'unknown' } : { k: 'refused', code: 'nothing_to_check' });
  });
  it('a settled row whose entry is still listed is not checkable: the entry is shown by its row', async () => {
    const f = fake({ conv: withUsers(user('u1', 'sent', { key: 'kA', via: 'command' })) });
    expect(await open(f, { pending: () => [entry()] as any }).check({ key: 'kA', kind: 'message' })).toEqual({ k: 'refused', code: 'nothing_to_check' });
    expect(f.calls.check ?? []).toHaveLength(0);
    expect(f.calls.checkNow ?? []).toHaveLength(0);
  });
});

describe('interrupt', () => {
  it('a Check named as an interrupt has nothing to read (its journal entry alone cannot say what became of it): refused as unsupported, whatever exists', async () => {
    const f = fake({ conv: withUsers(rowA()) });
    expect(await open(f, { pending: () => [entry()] as any }).check({ key: 'kA', kind: 'interrupt' })).toEqual({ k: 'refused', code: 'unsupported' });
    expect(f.calls.check ?? []).toHaveLength(0);
  });
});

describe('can() agrees with what this adapter\'s ops accept', () => {
  it('a journaled interrupt alone leaves nothing to check: Check is not offered, since check() refuses an interrupt', async () => {
    const f = fake();
    const src = open(f, { pending: () => [entry({ kind: 'interrupt' })] as any });
    expect(src.can('check')).toEqual({ ok: false, reason: 'nothing_to_check' });
    expect(src.snapshot().facts.unsettledSends).toBe(0);
    // A Check named anyway is refused by the table, as the door said; the engine is not read.
    expect(await src.check({ key: 'kA', kind: 'interrupt' })).toEqual({ k: 'refused', code: 'nothing_to_check' });
    expect(f.calls.checkNow ?? []).toHaveLength(0);
  });
  it('a journaled message beside it is still offered, and counted alone', () => {
    const src = open(fake(), { pending: () => [entry({ kind: 'interrupt' }), entry({ k: 'kB', kind: 'message' })] as any });
    expect(src.can('check')).toEqual({ ok: true });
    expect(src.snapshot().facts.unsettledSends).toBe(1);
  });
  it('a journaled stop with no row is still offered, and its Check reads the session again (unknown)', async () => {
    const f = fake();
    const src = open(f, { pending: () => [entry({ kind: 'stop' })] as any });
    expect(src.can('check')).toEqual({ ok: true });
    expect(await src.check({ key: 'kA', kind: 'stop' })).toEqual({ k: 'unknown' });
    expect(f.calls.checkNow ?? []).toHaveLength(1);
  });
  it('a stop of the whole chat is not offered, as stop(\'chat\') refuses it; a stop of the turn still follows the table (no turn here: no_turn)', async () => {
    const f = fake();
    const src = open(f);
    expect(src.can('stopChat')).toEqual({ ok: false, reason: 'unsupported' });
    expect(await src.stop('chat')).toEqual({ k: 'refused', code: 'unsupported' });
    expect(f.calls.stop ?? []).toHaveLength(0);
    expect(src.can('stopTurn')).toEqual({ ok: false, reason: 'no_turn' });
  });
});

describe('Check again on a turn whose outcome could not be told (recheckOutcome)', () => {
  it('reads the conversation again through the engine (checkOutcome) and calls nothing that sends', () => {
    const f = fake();
    const a = open(f);
    expect(typeof a.recheckOutcome).toBe('function');
    a.recheckOutcome!();
    expect(f.calls.checkOutcome).toHaveLength(1);
    for (const k of ['send', 'decide', 'answer', 'stop', 'check', 'checkDecision', 'checkNow']) expect(f.calls[k], k).toBeUndefined();
  });
});
