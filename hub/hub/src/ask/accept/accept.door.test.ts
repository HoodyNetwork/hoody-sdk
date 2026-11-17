// Acceptance, group DOOR: a keyed request leaves only through admit -> post with the ticket of ONE
// admission; the admission is a frozen copy; the guard checks every call against it.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { OTHER, REALM, HANDLE, ACCOUNT, KEY, RID, never, posts, settleReal, showAccount, slot, storedKeys, world, type World } from './env';
import { SendToken, guardIO, type Op } from '../journal';
import { bindDestForTests, seedEntryForTests } from '../journal/testing';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const base = () => ({ acct: ACCOUNT, container: slot.computer, h: HANDLE, r: REALM });
const createOp = (key: string): Op => ({ ...base(), route: 'create', key });
const turnOp = (key: string, sid = 'sess-1', c = KEY('1')): Op => ({ ...base(), route: 'turn', key, sid, c, files: false });
const confirmOp = (key: string, gate = 'G1', gen = 1, sid = 'sess-1'): Op => ({ ...base(), route: 'confirm', key, sid, c: KEY('1'), gate, gen });
const guarded = (x: World, container = slot.computer) => guardIO(x.agent as any, { acct: ACCOUNT, container }) as any;
const refusal = async (p: Promise<unknown>) => p.then(() => 'resolved', (e: any) => String(e?.code ?? e?.message ?? e));

describe('a key is admitted once, by the instance that minted it', () => {
  it('another tab handed the same key string cannot admit it (notMinted), and its cancelled send never removes the first tab\'s entry', async () => {
    w = world();
    const k = w.j.mint('turn')!;
    const a = w.j.admit(turnOp(k), new SendToken());
    expect('kind' in a).toBe(false);
    expect(w.jB.admit(turnOp(k), new SendToken())).toEqual({ kind: 'notSent', why: 'notMinted' });
    const tok = new SendToken(); tok.cancel();
    expect(w.jB.admit(turnOp(k), tok)).toMatchObject({ kind: 'notSent' });
    expect(storedKeys(w.fs)).toContain(k);
  });
  it('after an entry is removed the same key is notMinted; a key read from storage after a reload is never admitted', async () => {
    w = world();
    const k = w.j.mint('turn')!;
    const tok = new SendToken();
    const a = w.j.admit(turnOp(k), tok);
    tok.cancel();                                    // never left: the entry goes
    expect('kind' in a).toBe(false);
    expect(storedKeys(w.fs)).not.toContain(k);
    expect(w.j.admit(turnOp(k), new SendToken())).toEqual({ kind: 'notSent', why: 'notMinted' });
    const stored = KEY('7');
    seedEntryForTests(w.j, { k: stored, kind: 'turn', h: HANDLE, r: REALM, s: 'sess-1', c: KEY('1'), ct: slot.computer, at: 1 });
    expect(w.j.admit(turnOp(stored), new SendToken())).toEqual({ kind: 'notSent', why: 'notMinted' });
  });
  it('when a send ended unknown, another tab adopts the entry but never POSTs that key', async () => {
    w = world();
    const k = w.j.mint('turn')!;
    const a = w.j.admit(turnOp(k), new SendToken()) as any;
    const io = guarded(w);
    const p = w.j.post(a, (t) => io.turn('sess-1', 'hi', k, REALM, undefined, undefined, [t]));
    await settleReal(5);
    await p.catch(() => undefined);
    expect(w.jB.pending(HANDLE).map((e) => e.k)).toContain(k);
    const before = posts(w.agent, 'turn').length;
    expect(w.jB.admit(turnOp(k), new SendToken())).toEqual({ kind: 'notSent', why: 'notMinted' });
    expect(posts(w.agent, 'turn')).toHaveLength(before);
  });
});

describe('an admission is for one computer, one realm and one account', () => {
  it('an admission for computer A through a guard bound to B is TICKET_REFUSED and the io is never called', async () => {
    w = world();
    const k = w.j.mint('create')!;
    const a = w.j.admit(createOp(k), new SendToken()) as any;
    const B = 'c0a7150000000000000000b2';
    let reached = 0;
    const stub = bindDestForTests({ create: () => { reached++; return Promise.resolve({}); } } as any, B);
    const gB = guardIO(stub, { acct: ACCOUNT, container: B }) as any;
    let r = '';
    const out = await w.j.post(a, async (t) => { r = await refusal(gB.create({}, k, REALM, [t])); });
    expect(out).toEqual({ kind: 'notSent', why: 'noCall' });
    expect(r).toBe('TICKET_REFUSED');
    expect(reached).toBe(0);
    expect(posts(w.agent, 'create')).toHaveLength(0);
  });
  it('a confirm or answer whose realm is not the admitted realm is refused, unsent', async () => {
    w = world();
    const k = w.j.mint('confirm')!;
    const a = w.j.admit(confirmOp(k), new SendToken()) as any;
    const io = guarded(w);
    let r = '';
    await w.j.post(a, async (t) => { r = await refusal(io.confirm('sess-1', { gate_id: 'G1', generation: 1, approved: true, request_id: k }, 'f2f2f2f2f2f2f2f2f2f2f2f2', [t])); });
    expect(r).toBe('TICKET_REFUSED');
    expect(posts(w.agent, 'confirm')).toHaveLength(0);
  });
  it('the account changes between admit and post: NotSent account; the removal is owed and made when that account is shown again', async () => {
    w = world();
    const k = w.j.mint('turn')!;
    const a = w.j.admit(turnOp(k), new SendToken()) as any;
    expect(storedKeys(w.fs)).toContain(k);
    showAccount(OTHER);
    const out = await w.j.post(a, () => { throw new Error('must not run'); });
    expect(out).toEqual({ kind: 'notSent', why: 'account' });
    showAccount(ACCOUNT);
    await w.j.sweep();
    expect(storedKeys(w.fs)).not.toContain(k);
    expect(w.j.owed()).toBe(0);
  });
});

describe('what the post checks again, under the lock, before anything leaves', () => {
  it('a second decision for a gate that already has one in the journal is NotSent decided (one decision per gate, whoever sent it)', async () => {
    w = world();
    const k1 = w.j.mint('confirm')!, k2 = w.j.mint('confirm')!;
    const a1 = w.j.admit(confirmOp(k1, 'G1', 1), new SendToken()) as any;
    const a2 = w.j.admit(confirmOp(k2, 'G1', 1), new SendToken()) as any;
    expect('kind' in a1 || 'kind' in a2).toBe(false);
    const out = await w.j.post(a2, () => { throw new Error('must not run'); });
    expect(out).toEqual({ kind: 'notSent', why: 'decided' });
    expect(storedKeys(w.fs)).toContain(k1);
  });
  it('an entry another tab changed between admit and post is not ours to send: NotSent notKept, nothing leaves, the other value stays', async () => {
    w = world();
    const k = w.j.mint('turn')!;
    const a = w.j.admit(turnOp(k), new SendToken()) as any;
    const raw = JSON.parse(w.fs.peek('hub_ai_req_v1')!);
    raw.a[ACCOUNT][HANDLE + ':' + k].at += 1;
    w.fs.seed('hub_ai_req_v1', JSON.stringify(raw));
    let ran = false;
    const out = await w.j.post(a, () => { ran = true; return Promise.resolve(1); });
    expect(out).toEqual({ kind: 'notSent', why: 'notKept' });
    expect(ran).toBe(false);
    expect(storedKeys(w.fs)).toContain(k);
  });
  it('go that makes no call ends NotSent noCall and removes its own entry', async () => {
    w = world();
    const k = w.j.mint('turn')!;
    const a = w.j.admit(turnOp(k), new SendToken()) as any;
    const out = await w.j.post(a, () => Promise.resolve('nothing'));
    expect(out).toEqual({ kind: 'notSent', why: 'noCall' });
    expect(storedKeys(w.fs)).not.toContain(k);
  });
});

describe('the admission is a frozen copy', () => {
  it('after admit, changing the caller\'s op changes nothing: the guard keeps using the admitted values, and a call matching the changed values is refused', async () => {
    w = world();
    const k = w.j.mint('turn')!;
    const op: any = turnOp(k);
    const a = w.j.admit(op, new SendToken()) as any;
    op.sid = 'sess-evil'; op.r = 'f2f2f2f2f2f2f2f2f2f2f2f2'; op.key = KEY('e'); op.c = KEY('e');
    const io = guarded(w);
    let evil = '', good = '';
    const p = w.j.post(a, async (t) => {
      evil = await refusal(io.turn('sess-evil', 'x', k, REALM, undefined, undefined, [t]));
      good = await refusal(io.turn('sess-1', 'x', k, REALM, undefined, undefined, [t]));
    });
    await w.flush(200); await p;
    expect(evil).toBe('TICKET_REFUSED');
    expect(good, 'the call matching the ADMITTED values reached the agent (it answers not_found: no such session in the fake)').toBe('not_found');
  });
  it('the admission\'s members cannot be assigned; a confirm for another gate or request id is refused, unsent', async () => {
    w = world();
    const k = w.j.mint('confirm')!;
    const a = w.j.admit(confirmOp(k, 'G1', 1), new SendToken()) as any;
    expect(Object.isFrozen(a)).toBe(true);
    expect(() => { 'use strict'; a.cancel = () => undefined; }).toThrow();
    expect(Object.keys(a)).not.toContain('op');
    const io = guarded(w);
    let g2 = '', other = '';
    await w.j.post(a, async (t) => {
      g2 = await refusal(io.confirm('sess-1', { gate_id: 'G2', generation: 1, approved: true, request_id: k }, REALM, [t]));
      other = await refusal(io.confirm('sess-1', { gate_id: 'G1', generation: 1, approved: true, request_id: RID('d') }, REALM, [t]));
    });
    expect([g2, other]).toEqual(['TICKET_REFUSED', 'TICKET_REFUSED']);
    expect(posts(w.agent, 'confirm')).toHaveLength(0);
  });
  it('guardIO throws for an io stamped to another computer, and for an io with no destination', () => {
    w = world();
    expect(() => guardIO(w!.agent as any, { acct: ACCOUNT, container: 'c0a7150000000000000000b2' })).toThrow();
    expect(() => guardIO({ create: () => undefined } as any, { acct: ACCOUNT, container: slot.computer })).toThrow();
  });
  it('a getter-backed op answering a minted key first and a consumed request id second: admission, entry and ticket all use the first value', async () => {
    w = world();
    const k = w.j.mint('turn')!, other = w.j.mint('confirm')!;
    let n = 0;
    const op: any = { ...base(), route: 'turn', sid: 'sess-1', c: KEY('1'), files: false, get key() { return n++ === 0 ? k : other; } };
    const a = w.j.admit(op, new SendToken()) as any;
    expect('kind' in a).toBe(false);
    expect(storedKeys(w.fs)).toEqual([k]);
    const io = guarded(w);
    let second = '';
    await w.j.post(a, async (t) => { second = await refusal(io.turn('sess-1', 'x', other, REALM, undefined, undefined, [t])); });
    expect(second).toBe('TICKET_REFUSED');
    expect(posts(w.agent, 'turn')).toHaveLength(0);
  });
});

void never;
