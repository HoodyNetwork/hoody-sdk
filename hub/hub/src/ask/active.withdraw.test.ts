// Edit and Remove on a queued follow-up through the activated source, over a SCRIPTED engine: only a queued message (with its command id)
// is asked about, the engine is asked once per press with what the press was for, its outcome passes through unchanged, and any other
// row is refused with the engine never asked. The engine's own answers to the agent are engine.withdraw.test.ts's.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import { engineActive, type ActiveDeps } from './active';

vi.mock('@kit/agent/approver-live', () => ({ approvers: () => ({ state: () => ({ phase: 'none' }), subscribe: () => () => undefined }), resetApproversForTests: () => undefined }));

const REF = { computer: 'atlas.tlas', realm: 'f1f1f1f1f1f1f1f1f1f1f1f1', sid: 'S' };
const host = () => ({ computer: 'atlas', realm: 'Personal' });
const user = (id: string, state: C.SendState, over: Partial<C.UserMsg> = {}): C.UserMsg => ({
  id, text: 't' + id, at: 1, key: 'k' + id, via: 'turn', state, turnId: null, commandId: null, reason: '', ...over,
});
const req = (key: string, kind: 'turn' | 'message' | 'create' | 'stop' = 'turn') => ({ key, kind });

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    phase: 'ready', blocked: null, band: null, starting: false, conv: { ...C.emptyConv('S'), sid: 'S' }, status: null, gates: [], gate: null,
    decision: { pending: false, unknown: false }, dormant: false, checking: false, auto: { cap: false, on: null, busy: false, err: '', note: '' },
    needLogin: false, followUps: true, recent: null, version: 1, sendable: true, dup: null, att: { items: [], refused: [], dropped: '', reading: false },
    ...over,
  };
}
const withUsers = (...us: C.UserMsg[]) => ({ ...C.emptyConv('S'), sid: 'S', users: Object.fromEntries(us.map((u) => [u.id, u])), loose: us.map((u) => u.id) });
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
    send: m('send', () => false), withdraw: m('withdraw', async () => ({ k: 'withdrawn' })), resend: m('resend'), retryMsg: m('retryMsg', () => false), takeBack: m('takeBack', () => null),
    stop: m('stop'), decide: m('decide'), answer: m('answer'), check: m('check'), checkDecision: m('checkDecision'), checkNow: m('checkNow'),
    dismissDecision: m('dismissDecision'), canDismiss: m('canDismiss', () => false), attach: m('attach'), unattach: m('unattach'),
    attemptOf: () => undefined, decisionProof: () => undefined, unknownDecisions: () => [],
  } as unknown as AskEngine;
  return { eng, put, calls, get snap() { return s; } };
}

const deps = (over: Partial<ActiveDeps> = {}): ActiveDeps => ({
  approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
  leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
  pending: () => [], onPending: () => () => undefined,
  set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as any), decode: () => new Uint8Array(), waitMs: 1000, ...over,
});
const open = (f: ReturnType<typeof fake>) => engineActive({ current: () => f.eng, release: () => undefined }, REF, host, deps());

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('withdraw', () => {
  const q = (over: Partial<C.UserMsg> = {}) => user('u1', 'queued', { via: 'command', commandId: 'cmd_1', ...over });
  it('a queued follow-up: the engine is asked once, with the row and what the press was for; its answer passes through', async () => {
    const f = fake({ conv: withUsers(q()) }, { withdraw: async () => ({ k: 'withdrawn', text: 'tu1' }) });
    expect(await open(f).withdraw!(req('ku1', 'message'), 'edit')).toEqual({ k: 'withdrawn', text: 'tu1' });
    expect(f.calls.withdraw).toEqual([['u1', 'edit']]);
  });
  it.each<[string, Partial<C.UserMsg>]>([
    ['sent', { state: 'sent' }], ['unknown', { state: 'unknown' }], ['not sent', { state: 'notSent' }],
    ['no command id', { commandId: null }], ['a press already out', { wd: 'sending' }], ['an unknown press', { wd: 'unknown' }],
    ['already taken', { wd: 'taken' }], ['an agent that cannot', { wd: 'off' }],
  ])('%s: refused, the engine never asked', async (_n, over) => {
    const f = fake({ conv: withUsers(q(over)) });
    expect(await open(f).withdraw!(req('ku1', 'message'), 'remove')).toEqual({ k: 'refused', code: 'not_withdrawable' });
    expect(f.calls.withdraw).toBeUndefined();
  });
  it('a request that names no row: refused, nothing asked', async () => {
    const f = fake({ conv: withUsers(q()) });
    expect(await open(f).withdraw!(req('nope', 'message'), 'remove')).toEqual({ k: 'refused', code: 'nothing_to_withdraw' });
    expect(f.calls.withdraw).toBeUndefined();
  });
});
