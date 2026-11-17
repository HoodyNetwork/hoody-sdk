// Send again, Retry and Edit through the activated source, over a SCRIPTED engine (so each path the FakeAgent cannot reach is
// reachable). The rules under test (C9): an action is taken only on a DEFINITE outcome (Not sent / the prompt of the newest failed
// turn) and a row of any other state is refused with the engine never asked; a resend's wait is bound to the ROW and to the one key
// the call itself put it under; `done` only on proof the agent took it; everything else is `unknown`; `Draft.anyway` reaches the engine
// as the person's explicit choice and as nothing else.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as A from './attach';
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
/** A conversation whose newest (and only) turn FAILED with `code`, started by `u1`. */
function failedConv(code: string, retryAt: string | null = null, extra: C.UserMsg[] = []) {
  const base = withUsers(user('u1', 'sent'), ...extra);
  const c = C.addTurn({ ...base, loose: base.loose.filter((x) => x === 'u1' ? false : true) }, { turnId: 't1', now: 1 });
  const t = C.current(c) as C.TurnBlock;
  const turns = c.turns.map((x) => (x === t ? { ...x, users: ['u1'], s: { ...x.s, terminal: { state: 'failed', code, retryAt, effects: false } } } : x));
  return { ...c, turns } as C.Conv;
}

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
    send: m('send', () => false), resend: m('resend'), retryMsg: m('retryMsg', () => false), takeBack: m('takeBack', () => null),
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
const SETTLED: C.SendState[] = ['sending', 'queued', 'sent', 'unknown', 'refused', 'superseded'];

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('resend', () => {
  /** The engine's resend: the row goes to `sending` under a NEW key (a tried key is never asked again). */
  const rekeys = (f: ReturnType<typeof fake>, key = 'kNEW') => () => { f.put({ conv: withUsers(user('u1', 'sending', { key })) }); };

  it('a Not sent row goes out once under the key the engine gave it, and is done when the agent takes it', async () => {
    const f: ReturnType<typeof fake> = fake({ conv: withUsers(user('u1', 'notSent')) }, { resend: () => rekeys(f)() });
    const p = open(f).resend!(req('ku1'));
    f.put({ conv: withUsers(user('u1', 'sent', { key: 'kNEW' })) });
    expect(await p).toEqual({ k: 'done' });
    expect(f.calls.resend).toEqual([['u1']]);
    expect(f.calls.send ?? [], 'the draft path is not used').toEqual([]);
  });

  it('refused when the agent refuses it again; unknown while it is still sending past the wait', async () => {
    const f: ReturnType<typeof fake> = fake({ conv: withUsers(user('u1', 'notSent')) }, { resend: () => rekeys(f)() });
    const p = open(f).resend!(req('ku1'));
    f.put({ conv: withUsers(user('u1', 'notSent', { key: 'kNEW' })) });
    expect(await p).toEqual({ k: 'refused', code: 'not_sent' });
    const g: ReturnType<typeof fake> = fake({ conv: withUsers(user('u1', 'notSent')) }, { resend: () => rekeys(g)() });
    const q = open(g).resend!(req('ku1'));
    await vi.advanceTimersByTimeAsync(1001);
    expect(await q).toEqual({ k: 'unknown' });
  });

  it.each(SETTLED)('a %s row is not resent: refused, and the engine is never asked', async (state) => {
    const f = fake({ conv: withUsers(user('u1', state)) });
    expect(await open(f).resend!(req('ku1'))).toEqual({ k: 'refused', code: 'not_resendable' });
    expect(f.calls.resend ?? []).toEqual([]);
  });

  it('only the request it names: another key, another kind, a row id, or an absent row is refused and nothing is asked', async () => {
    const f = fake({ conv: withUsers(user('u1', 'notSent')) });
    const src = open(f);
    for (const p of [req('kOTHER'), req('ku1', 'message'), req('u1'), req('ku1', 'stop'), req('ku1', 'create')]) {
      expect(await src.resend!(p), JSON.stringify(p)).toEqual({ k: 'refused', code: 'nothing_to_resend' });
    }
    expect(f.calls.resend ?? []).toEqual([]);
  });

  it('a row the engine would not take now (it stays Not sent) is refused: nothing went', async () => {
    const f = fake({ conv: withUsers(user('u1', 'notSent')) });
    expect(await open(f).resend!(req('ku1'))).toEqual({ k: 'refused', code: 'not_sent' });
    expect(f.calls.resend).toEqual([['u1']]);
  });

  it('a first message whose session is not made yet: a SECOND create attempt (another create key, same row key) is not this wait\'s request', async () => {
    const asCreate = (state: C.SendState) => withUsers(user('u1', state, { via: 'create', key: 'kT' }));
    const f: ReturnType<typeof fake> = fake({ conv: asCreate('notSent'), createKey: 'c0' }, { resend: () => f.put({ conv: asCreate('sending'), createKey: 'c1' }) });
    const p = open(f).resend!(req('c0', 'create'));
    f.put({ conv: asCreate('sending'), createKey: 'c2' });
    f.put({ conv: asCreate('sent'), createKey: 'c2' });
    expect(await p, 'the second attempt\'s acceptance is not the first attempt\'s').toEqual({ k: 'unknown' });
  });

  it('a create that becomes a session (the create key leaves the snapshot) is the same request: done when taken', async () => {
    const asCreate = (state: C.SendState) => withUsers(user('u1', state, { via: 'create', key: 'kT' }));
    const f: ReturnType<typeof fake> = fake({ conv: asCreate('notSent'), createKey: 'c0' }, { resend: () => f.put({ conv: asCreate('sending'), createKey: 'c1' }) });
    const p = open(f).resend!(req('c0', 'create'));
    f.put({ conv: asCreate('sending'), createKey: 'c1' });
    f.put({ conv: asCreate('sent') });
    expect(await p).toEqual({ k: 'done' });
  });

  it('a resend started by a subscriber the moment the first is refused again, before the first wait has seen it, is refused (busy): no wait follows another attempt', async () => {
    const f: ReturnType<typeof fake> = fake({ conv: withUsers(user('u1', 'notSent')) }, { resend: () => rekeys(f)() });
    const src = open(f);
    let second: Promise<unknown> | null = null;
    // Subscribed before the first wait: it runs first on the publication that refuses the first attempt.
    f.eng.subscribe(() => {
      const u = f.snap.conv.users.u1;
      if (!second && u && u.state === 'notSent' && u.key === 'kNEW') second = src.resend!(req('kNEW'));
    });
    const first = src.resend!(req('ku1'));
    f.put({ conv: withUsers(user('u1', 'notSent', { key: 'kNEW' })) });
    expect(await second).toEqual({ k: 'refused', code: 'busy' });
    expect(await first).toEqual({ k: 'refused', code: 'not_sent' });
    expect(f.calls.resend, 'the engine was asked once').toEqual([['u1']]);
    // Once the first has ended the row can be sent again (a new attempt: the engine is asked a second time).
    void src.resend!(req('kNEW'));
    expect(f.calls.resend).toHaveLength(2);
  });

  it('the row republished under any OTHER key while it waits is another request: unknown, never that request\'s outcome', async () => {
    const f: ReturnType<typeof fake> = fake({ conv: withUsers(user('u1', 'notSent')) }, { resend: () => rekeys(f)() });
    const p = open(f).resend!(req('ku1'));
    f.put({ conv: withUsers(user('u1', 'sent', { key: 'kSOMEONE' })) });
    expect(await p).toEqual({ k: 'unknown' });
  });

  it('the row gone, or an ended engine, is unknown', async () => {
    const f: ReturnType<typeof fake> = fake({ conv: withUsers(user('u1', 'notSent')) }, { resend: () => rekeys(f)() });
    const p = open(f).resend!(req('ku1'));
    f.put({ conv: C.emptyConv('S') });
    expect(await p).toEqual({ k: 'unknown' });
    const g: ReturnType<typeof fake> = fake({ conv: withUsers(user('u1', 'notSent')) }, { resend: () => rekeys(g)() });
    const q = open(g).resend!(req('ku1'));
    g.put({ phase: 'ended' });
    expect(await q).toEqual({ k: 'unknown' });
  });

  it('a first message is named by its create key until the session exists (kind create), by its turn key after', async () => {
    const f = fake({ conv: withUsers(user('u1', 'notSent', { via: 'create' })), createKey: 'kC' as never });
    const src = open(f);
    expect(await src.resend!(req('ku1', 'turn'))).toEqual({ k: 'refused', code: 'nothing_to_resend' });
    expect(await src.resend!(req('kC', 'create'))).toEqual({ k: 'refused', code: 'not_sent' });
    expect(f.calls.resend).toEqual([['u1']]);
  });
});

describe('retry', () => {
  /** The engine's retry: a NEW row, under a new key, with the failed prompt's text. */
  const makes = (f: ReturnType<typeof fake>, state: C.SendState = 'sending') => () => {
    const users = { ...f.snap.conv.users, u2: user('u2', state, { text: 'tu1', key: 'kR' }) };
    f.put({ conv: { ...f.snap.conv, users, loose: [...f.snap.conv.loose, 'u2'] } });
    return true;
  };

  it('retries the prompt of the newest failed turn as a new message: done when the agent takes the NEW row', async () => {
    const f: ReturnType<typeof fake> = fake({ conv: failedConv('turn_failed') }, { retryMsg: () => makes(f)() });
    const p = open(f).retry!(req('ku1'));
    const users = { ...f.snap.conv.users, u2: user('u2', 'sent', { text: 'tu1', key: 'kR' }) };
    f.put({ conv: { ...f.snap.conv, users } });
    expect(await p).toEqual({ k: 'done' });
    expect(f.calls.retryMsg).toEqual([['u1']]);
    expect(f.calls.send ?? []).toEqual([]);
  });

  it('refused (nothing asked) when the row is not the newest failed turn\'s prompt, or the failure cannot be helped, or the rate limit has not passed', async () => {
    const ok = fake({ conv: withUsers(user('u1', 'sent')) });
    expect(await open(ok).retry!(req('ku1'))).toEqual({ k: 'refused', code: 'not_retryable' });
    for (const code of ['context_overflow', 'no_credentials', 'approval_policy_unsatisfiable']) {
      const f = fake({ conv: failedConv(code) });
      expect(await open(f).retry!(req('ku1')), code).toEqual({ k: 'refused', code: 'not_retryable' });
      expect(f.calls.retryMsg ?? [], code).toEqual([]);
    }
    const later = new Date(Date.now() + 60_000).toISOString();
    const w = fake({ conv: failedConv('rate_limit', later) });
    expect(await open(w).retry!(req('ku1'))).toEqual({ k: 'refused', code: 'not_retryable' });
    expect(w.calls.retryMsg ?? []).toEqual([]);
  });

  it('a retry the engine does not take (a held duplicate, or not now) is refused', async () => {
    const f = fake({ conv: failedConv('turn_failed') });
    expect(await open(f).retry!(req('ku1'))).toEqual({ k: 'refused', code: 'not_sent' });
    const g = fake({ conv: failedConv('turn_failed'), dup: { text: 't', earlier: false } });
    expect(await open(g).retry!(req('ku1'))).toEqual({ k: 'refused', code: 'duplicate_held' });
  });

  it('no row named, or a retry that made no single new row, is refused or unknown', async () => {
    const none = fake({ conv: failedConv('turn_failed') });
    expect(await open(none).retry!(req('kNOPE'))).toEqual({ k: 'refused', code: 'nothing_to_retry' });
    const f = fake({ conv: failedConv('turn_failed') }, { retryMsg: () => true });
    expect(await open(f).retry!(req('ku1'))).toEqual({ k: 'unknown' });
  });
});

describe('take back', () => {
  const FILE = [{ id: 'f1', kind: 'text', name: 'n.txt', text: 'a\nb\nc', lines: 3, bytes: 5 }] as never;

  it('a Not sent message with files comes back: its text crosses, with the number of files that stay in the draft', () => {
    const f = fake({ conv: withUsers(user('u1', 'notSent', { files: FILE, imgs: [{ id: 'i1', kind: 'image', name: 'a.png', media: 'image/png', data: 'x', bytes: 1, url: 'blob:x' }] as never })) }, { takeBack: () => 'tu1' });
    expect(open(f).takeBack!(req('ku1'))).toEqual({ k: 'text', text: 'tu1', files: 2 });
    expect(f.calls.takeBack).toEqual([['u1']]);
    expect(f.calls.send ?? [], 'nothing is sent').toEqual([]);
  });

  it.each(SETTLED)('a %s row is not taken back: refused and the engine is never asked', (state) => {
    const f = fake({ conv: withUsers(user('u1', state, { files: FILE })) }, { takeBack: () => 'tu1' });
    expect(open(f).takeBack!(req('ku1'))).toEqual({ k: 'refused', code: 'not_editable' });
    expect(f.calls.takeBack ?? []).toEqual([]);
  });

  it('a plain refusal (no files, not handed off) is fixed by Send again, not Edit', () => {
    const f = fake({ conv: withUsers(user('u1', 'notSent')) }, { takeBack: () => 'tu1' });
    expect(open(f).takeBack!(req('ku1'))).toEqual({ k: 'refused', code: 'not_editable' });
    const h = fake({ conv: withUsers(user('u1', 'notSent', { reason: 'ask.handedOff' })) }, { takeBack: () => 'tu1' });
    expect(open(h).takeBack!(req('ku1'))).toEqual({ k: 'text', text: 'tu1', files: 0 });
  });

  it('an engine that will not give it back (the row may have gone through) is refused; an absent row too', () => {
    const f = fake({ conv: withUsers(user('u1', 'notSent', { files: FILE })) }, { takeBack: () => null });
    expect(open(f).takeBack!(req('ku1'))).toEqual({ k: 'refused', code: 'not_sent' });
    expect(open(f).takeBack!(req('kNOPE'))).toEqual({ k: 'refused', code: 'nothing_to_take_back' });
  });
});

describe('Draft.anyway', () => {
  it('reaches the engine only as the person\'s explicit choice', async () => {
    const f = fake({}, { send: () => false });
    const src = open(f);
    await src.send({ text: 'hi' });
    await src.send({ text: 'hi', anyway: true });
    await src.send({ text: 'hi', anyway: false });
    expect(f.calls.send!.map((c) => c[1])).toEqual([false, true, false]);
  });
  it('a held duplicate is refused without it', async () => {
    const f = fake({ dup: { text: 'hi', earlier: false } }, { send: () => false });
    expect(await open(f).send({ text: 'hi' })).toEqual({ k: 'refused', code: 'duplicate_held' });
  });
});

describe('take back is all or nothing', () => {
  const TXT = (id: string, size = 10) => ({ id, kind: 'text', name: id + '.txt', text: 'x'.repeat(size), lines: 1, bytes: size }) as never;
  const IMG = (id: string) => ({ id, kind: 'image', name: id + '.png', media: 'image/png', data: 'x', bytes: 5, url: 'blob:' + id }) as never;
  const items = (...a: unknown[]) => ({ att: { items: a as never[], refused: [], dropped: '', reading: false } });
  const refusedWith = (f: ReturnType<typeof fake>) => {
    expect(open(f).takeBack!(req('ku1'))).toEqual({ k: 'refused', code: 'draft_full' });
    expect(f.calls.takeBack ?? [], 'the engine is never asked: the row and the draft stay as they are').toEqual([]);
  };
  it('three text files already in the draft: a row with a text file is refused, nothing changes', () => {
    refusedWith(fake({ conv: withUsers(user('u1', 'notSent', { files: [TXT('r1')] })), ...items(TXT('a1'), TXT('a2'), TXT('a3')) }, { takeBack: () => 'tu1' }));
  });
  it('four images already in the draft: a row with an image is refused', () => {
    refusedWith(fake({ conv: withUsers(user('u1', 'notSent', { imgs: [IMG('r1')] })), ...items(IMG('a1'), IMG('a2'), IMG('a3'), IMG('a4')) }, { takeBack: () => 'tu1' }));
  });
  it('a draft whose text files leave no room for the row\'s file (message size) is refused', () => {
    refusedWith(fake({ conv: withUsers(user('u1', 'notSent', { files: [TXT('r1', 5000)] })), ...items(TXT('a1', A.MSG_BYTES - 200)) }, { takeBack: () => 'tu1' }));
  });
  it('a row only some of whose files fit is refused whole, not partly taken', () => {
    refusedWith(fake({ conv: withUsers(user('u1', 'notSent', { files: [TXT('r1'), TXT('r2')] })), ...items(TXT('a1'), TXT('a2')) }, { takeBack: () => 'tu1' }));
  });
  it('when everything fits the row comes back with its files', () => {
    const f = fake({ conv: withUsers(user('u1', 'notSent', { files: [TXT('r1')] })), ...items(TXT('a1')) }, { takeBack: () => 'tu1' });
    expect(open(f).takeBack!(req('ku1'))).toEqual({ k: 'text', text: 'tu1', files: 1 });
  });
});

describe('the draft files', () => {
  const ITEM = (id: string, kind: 'image' | 'text' = 'text') => (kind === 'text'
    ? { id, kind, name: id + '.txt', text: 'a\nb', lines: 2, bytes: 3 }
    : { id, kind, name: id + '.png', url: 'blob:' + id, bytes: 9 }) as never;

  it('lists what the engine\'s draft holds, the same array while nothing changed, a new one when it does', () => {
    const f = fake({ att: { items: [ITEM('a1')], refused: [], dropped: '', reading: false } });
    const src = open(f);
    const one = src.draftFiles!();
    expect(one.map((x) => x.id)).toEqual(['a1']);
    expect(one[0]).toMatchObject({ kind: 'text', name: 'a1.txt', lines: 2, bytes: 3, url: null });
    expect(src.draftFiles!(), 'a stable identity for the view\'s store read').toBe(one);
    f.put({ att: { items: [ITEM('a1'), ITEM('i1', 'image')], refused: [], dropped: '', reading: false } });
    const two = src.draftFiles!();
    expect(two).not.toBe(one);
    expect(two.map((x) => x.id)).toEqual(['a1', 'i1']);
    expect(two[1]).toMatchObject({ kind: 'image', url: 'blob:i1' });
  });

  it('dropDraftFile asks the engine to unattach that one file, and nothing else', () => {
    const f = fake({ att: { items: [ITEM('a1'), ITEM('a2')], refused: [], dropped: '', reading: false } });
    open(f).dropDraftFile!('a2');
    expect(f.calls.unattach).toEqual([['a2']]);
    expect(f.calls.send ?? []).toEqual([]);
  });
});
