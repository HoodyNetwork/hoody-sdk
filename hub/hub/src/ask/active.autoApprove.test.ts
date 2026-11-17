// The active source's switch of auto-approve ("Allow everything") for a page: it goes through the engine's own setAuto (which
// records the person's choice, so the send guard keeps it) under the conversation's one shared approval attempt; it sends
// nothing when the table refuses an On, when the chat has no session, or while another change is unsettled; Off is never held
// back by the table; and the attempt ends with this write's own end.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import { engineActive, type ActiveDeps } from './active';
import { approvalAttemptOf, forgetApprovalAttempts, takeApprovalAttempt } from '@kit/agent/useApproval';
import { TARGET } from '../core/test/env';

vi.mock('@kit/agent/approver-live', () => ({ approvers: () => ({ state: () => ({ phase: 'none' }), subscribe: () => () => undefined }), resetApproversForTests: () => undefined }));

const REF = { computer: 'atlas.tlas', realm: 'f1f1f1f1f1f1f1f1f1f1f1f1', sid: 'S' };
const SLOT = { account: 'acc', project: 'P1', computer: 'C1', realm: REF.realm, name: 'atlas' };
const AT = { project: { id: 'P1' }, container: { id: 'C1' } };
const host = () => ({ computer: 'atlas', realm: 'Personal' });
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  phase: 'ready', blocked: null, band: null, starting: false, conv: { ...C.emptyConv('S'), sid: 'S' }, status: null, gates: [], gate: null,
  decision: { pending: false, unknown: false }, dormant: false, checking: false, auto: { cap: true, on: false, busy: false, err: '', note: '' },
  needLogin: false, followUps: true, recent: null, version: 1, sendable: true, dup: null, att: { items: [], refused: [], dropped: '', reading: false },
  ...over,
});
function fake(o: { strict?: boolean; session?: boolean; takes?: boolean } = {}) {
  const told: Array<(x: 'answered' | 'unknown') => void> = [];
  const setAuto = vi.fn((_want: boolean, outcome?: (x: 'answered' | 'unknown') => void) => { if (o.takes === false) return false; if (outcome) told.push(outcome); return true; });
  const checkMode = vi.fn();
  const eng = {
    slot: SLOT,
    record: o.session === false ? null : { s: 'S', r: REF.realm },
    getSnapshot: () => snap(),
    subscribe: () => () => undefined,
    activation: () => ({ journal: true, ref: { computer: 'c', realm: REF.realm, sid: 'S', target: TARGET }, strict: o.strict === true }),
    setAuto, checkMode,
  } as unknown as AskEngine;
  return { eng, setAuto, checkMode, told };
}
const deps = (): ActiveDeps => ({
  approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
  leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
  pending: () => [], onPending: () => () => undefined,
  set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as any), decode: () => new Uint8Array(), waitMs: 1000,
});
const open = (f: ReturnType<typeof fake>) => engineActive({ current: () => f.eng, release: () => undefined }, REF, host, deps());
const attempt = () => approvalAttemptOf(AT as any, REF.realm, 'S');

beforeEach(() => { forgetApprovalAttempts(); });

describe('active source: Allow everything goes through the engine', () => {
  it('On is the engine\'s own setAuto, once, under the shared attempt; its answer ends the attempt', () => {
    const f = fake();
    const src = open(f);
    expect(src.setAutoApprove!(true)).toBe(true);
    expect(f.setAuto).toHaveBeenCalledTimes(1);
    expect(f.setAuto.mock.calls[0]![0]).toBe(true);
    expect(attempt()?.kind).toBe('running');
    // A second press while it is out sends nothing.
    expect(src.setAutoApprove!(true)).toBe(false);
    expect(f.setAuto).toHaveBeenCalledTimes(1);
    f.told[0]!('answered');
    expect(attempt()).toBeNull();
    src.release();
  });
  it('a lost answer leaves the attempt "may have gone through"; nothing is sent again', () => {
    const f = fake();
    const src = open(f);
    src.setAutoApprove!(true);
    f.told[0]!('unknown');
    expect(attempt()?.kind).toBe('pending');
    expect(src.setAutoApprove!(true)).toBe(false);
    expect(src.setAutoApprove!(false)).toBe(false);
    expect(f.setAuto).toHaveBeenCalledTimes(1);
    src.release();
  });
  it('held back while another surface\'s change of this chat is unsettled', () => {
    const f = fake();
    const src = open(f);
    const other = takeApprovalAttempt(AT as any, REF.realm, 'S', { field: 'mode', value: 'always' });
    expect(other).not.toBeNull();
    expect(src.setAutoApprove!(true)).toBe(false);
    expect(f.setAuto).not.toHaveBeenCalled();
    src.release();
  });
  it('an engine that sends nothing leaves no attempt behind', () => {
    const f = fake({ takes: false });
    const src = open(f);
    expect(src.setAutoApprove!(true)).toBe(false);
    expect(attempt()).toBeNull();
    src.release();
  });
  it('a caller\'s target names the attempt (its own approvals read sees it); another computer\'s target sends nothing', () => {
    const f = fake();
    const src = open(f);
    const mine = { project: { id: 'P1' }, container: { id: 'C1', server_name: 'srv' } };
    expect(src.setAutoApprove!(true, { project: { id: 'P1' }, container: { id: 'OTHER' } })).toBe(false);
    expect(f.setAuto).not.toHaveBeenCalled();
    expect(src.setAutoApprove!(true, mine)).toBe(true);
    expect(approvalAttemptOf(mine as any, REF.realm, 'S')?.kind).toBe('running');
    expect(attempt()).toBeNull();
    src.release();
  });
  it('no session yet: nothing is sent', () => {
    const f = fake({ session: false });
    const src = open(f);
    expect(src.setAutoApprove!(true)).toBe(false);
    expect(f.setAuto).not.toHaveBeenCalled();
    src.release();
  });
  it('Strict: On is refused here, unsent; Off still goes', () => {
    const f = fake({ strict: true });
    const src = open(f);
    expect(src.can('setYolo').ok).toBe(false);
    expect(src.setAutoApprove!(true)).toBe(false);
    expect(f.setAuto).not.toHaveBeenCalled();
    expect(src.setAutoApprove!(false)).toBe(true);
    expect(f.setAuto).toHaveBeenCalledWith(false, expect.any(Function));
    src.release();
  });
  it('a released source sends nothing; approvalChanged is one read of the mode', () => {
    const f = fake();
    const src = open(f);
    src.approvalChanged!();
    expect(f.checkMode).toHaveBeenCalledTimes(1);
    src.release();
    expect(src.setAutoApprove!(true)).toBe(false);
    src.approvalChanged!();
    expect(f.checkMode).toHaveBeenCalledTimes(1);
    expect(f.setAuto).not.toHaveBeenCalled();
  });
});
