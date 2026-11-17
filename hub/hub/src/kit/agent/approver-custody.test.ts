// Vitest: custody of the approver-lease capabilities, around the REAL lease issuer and a stand-in for core's ticket
// steps (approver.fakecore.ts). Removal needs a proof that names the capability; a 410, a read, an epoch never remove; a
// fenced answer only blanks; the capability is in no object after the hooks.
import { beforeEach, describe, expect, it } from 'vitest';
import type { Route } from '@core';
import { Cap, EXT_MAX, SKEW, TTL, anchorOf, classify, closes, createCustody, sureNow, type Attempt, type Class, type Clock, type Custody, type Op } from './approver-custody';
import { fail, fakeCore, notSent, ok, pending, timeout, type Reply } from './approver.fakecore';

const route = {} as Route;
const C = 'cont1';
const K = `${C}|s1`;

function rig() {
  const clock = { m: 1000, w: 5_000_000 };
  const clk: Clock = { mono: () => clock.m, wall: () => clock.w };
  const st = { gap: 0, acct: 'acct1', acctEpoch: 0, mgr: 1 };
  const core = fakeCore();
  const answers: Array<{ a: Attempt; raw: unknown }> = [];
  const settles: Array<{ a: Attempt; cls: Class; removed: Cap | null }> = [];
  const cus: Custody = createCustody({
    clock: clk, gapGen: () => st.gap, account: () => st.acct, acctEpoch: () => st.acctEpoch, mgr: () => st.mgr,
    onAnswer: (a, raw) => answers.push({ a, raw }), onSettled: (a, _r, cls, removed) => settles.push({ a, cls, removed }), claim: core.claim,
  });
  const tix = (op: Op, o: { cap?: Cap | null; proof?: Cap | null; key?: string | null; guard?: (c: never) => boolean } = {}) => {
    const a = cus.attempt(op, { container: C, key: o.key === undefined ? K : o.key, cap: o.cap ?? null, proof: o.proof ?? null, ...(o.guard ? { guard: o.guard as never } : {}) });
    return { a, t: cus.ticket(a, { route, container: C, sid: 's1', idem: null }) };
  };
  /** A capability in custody via a real acquire answer. */
  const grant = (value: string, key = K): Cap => {
    const { t } = tix('acquire', { key });
    core.send(t, ok({ lease: value, generation: 1 }));
    return cus.caps(key).at(-1)!;
  };
  return { clock, st, core, cus, tix, grant, answers, settles, advance: (ms: number) => { clock.m += ms; clock.w += ms; } };
}
let r: ReturnType<typeof rig>;
beforeEach(() => { r = rig(); });

describe('a capability string', () => {
  it('is in no serialisation of the Cap, and not in its text', () => {
    const c = new Cap('SECRET-VALUE', K, 'acct1', 1);
    expect(JSON.stringify(c)).not.toContain('SECRET');
    expect(String(c)).not.toContain('SECRET');
    expect(JSON.stringify({ x: [c] })).not.toContain('SECRET');
  });
  it('leaves custody only as the header of a spend', () => {
    const c = r.grant('CAP-1');
    const { t } = r.tix('patch', { cap: c });
    expect(r.core.send(t, ok())?.header).toBe('CAP-1');
  });
});

describe('sure life', () => {
  const capAt = (gap = 0) => { const c = new Cap('x', K, 'a', 1); c.at = { m: r.clock.m, w: r.clock.w, gap, seq: 1 }; return c; };
  const clk = (): Clock => ({ mono: () => r.clock.m, wall: () => r.clock.w });
  it('holds inside TTL - SKEW on both clocks that agree', () => {
    const c = capAt();
    expect(sureNow(c, clk(), 0)).toBe(true);
    r.advance(TTL - SKEW - 1);
    expect(sureNow(c, clk(), 0)).toBe(true);
    r.advance(1);
    expect(sureNow(c, clk(), 0)).toBe(false);
  });
  it('is off with no anchor, or an anchor of an earlier gap', () => {
    const c = new Cap('x', K, 'a', 1);
    expect(sureNow(c, clk(), 0)).toBe(false);
    expect(sureNow(capAt(0), clk(), 1)).toBe(false);
  });
  it('is off when either clock alone is past the end (a sleep with mono paused; wall paused)', () => {
    const c = capAt();
    r.clock.w += TTL; // mono paused
    expect(sureNow(c, clk(), 0)).toBe(false);
    const d = capAt();
    r.clock.m += TTL; // wall paused
    expect(sureNow(d, clk(), 0)).toBe(false);
  });
  it('is off when the clocks disagree by more than SKEW (a wall step back or forward)', () => {
    const c = capAt();
    r.clock.w -= SKEW + 1;
    expect(sureNow(c, clk(), 0)).toBe(false);
    const d = capAt();
    r.clock.w += 2 * SKEW + 2;
    expect(sureNow(d, clk(), 0)).toBe(false);
    const e = capAt();
    r.clock.w += SKEW; r.clock.m += 1;
    expect(sureNow(e, clk(), 0)).toBe(true);
  });
});

describe('closing evidence (an allow-list) and the reading of an answer', () => {
  const att = () => r.cus.attempt('acquire', { container: C, key: K });
  const cases: Array<[Op, Reply, boolean]> = [
    ['patch', ok(), true], ['patch', fail(400, 'bad_request'), true], ['patch', fail(404, 'not_found'), true],
    ['patch', fail(409, 'approver_lease_invalid'), true], ['patch', fail(410, 'approver_lease_expired'), true],
    ['patch', fail(409, 'approver_lease_held'), false], ['patch', fail(409, 'gate_decision_pending'), false], ['patch', fail(500, 'x'), false],
    ['patch', timeout(), false], ['patch', pending(), false], ['patch', notSent(), true], ['patch', fail(410, 'other'), false],
    ['decide', ok({ status: 'ok' }), true], ['decide', ok(), false], ['decide', ok({}), false], ['decide', ok({ status: 'pending' }), false], ['decide', ok({ pending: true }), false], ['decide', pending(), false], ['decide', notSent(), true], ['decide', fail(409, 'gate_decision_pending'), false],
    ['decide', fail(404, 'not_found'), false], ['decide', fail(400, 'bad_request'), false], ['decide', timeout(), false], ['decide', fail(500, 'x'), false],
    ['decide', fail(409, 'approver_lease_invalid'), true], ['decide', fail(410, 'approver_lease_expired'), true], ['decide', fail(409, 'approver_lease_required'), true],
    ['acquire', timeout(), true], ['release', fail(500, 'x'), true],
  ];
  it.each(cases)('%s %j closes: %s', (op, reply, closed) => { expect(closes(op, reply)).toBe(closed); });
  const kinds: Array<[Op, Reply, Class]> = [
    ['acquire', fail(409, 'approver_lease_held'), 'held'], ['acquire', fail(409, 'approver_lease_invalid'), 'invalid'], ['patch', fail(409, 'approver_lease_invalid'), 'invalid'],
    ['patch', fail(410, 'approver_lease_expired'), 'expired'], ['patch', fail(404, 'not_found'), 'gone'], ['acquire', fail(404, 'not_found'), 'gone'],
    ['decide', fail(404, 'not_found'), 'unknown'], ['decide', fail(409, 'gate_decision_pending'), 'unknown'], ['decide', pending(), 'unknown'],
    ['decide', fail(409, 'approver_lease_required'), 'required'], ['decide', fail(409, 'approver_lease_invalid'), 'invalid'], ['decide', fail(410, 'approver_lease_expired'), 'expired'],
    ['patch', fail(400, 'bad_request'), 'unknown'], ['patch', timeout(), 'unknown'], ['patch', notSent(), 'unknown'], ['acquire', fail(500, 'x'), 'unknown'],
    ['patch', fail(409, 'approver_lease_held'), 'unknown'], ['release', ok(), 'ok'], ['patch', ok(), 'ok'], ['release', fail(404, 'not_found'), 'unknown'],
    ['acquire', fail(410, 'approver_lease_expired'), 'expired'],
  ];
  it.each(kinds)('%s %j reads as %s', (op, reply, cls) => { expect(classify(op, reply, att())).toBe(cls); });
  it('an acquire that took a grant is granted; one that took none is ok', () => {
    const a = att();
    expect(classify('acquire', ok(), a)).toBe('ok');
    a.granted.push(new Cap('x', K, 'a', 1));
    expect(classify('acquire', ok(), a)).toBe('granted');
  });
  it('a grant that entered another record is not this acquire\'s grant', () => {
    const a = att();
    a.granted.push(new Cap('x', 'cont1|s2', 'a', 1));
    expect(classify('acquire', ok(), a)).toBe('ok');
  });
});

describe('tickets: check, spend, single use', () => {
  it('a Cap is sent only for its own record: a call for another session of the same container is refused unsent', () => {
    const other = r.grant('CAP-S2', 'cont1|s2');
    for (const op of ['patch', 'decide', 'release', 'acquire'] as const) {
      const { t } = r.tix(op, op === 'acquire' ? { proof: other } : { cap: other });   // the ticket is bound to s1; the Cap belongs to s2
      expect(r.core.send(t, ok()), `${op}`).toBeNull();
    }
    expect(r.cus.held(other)).toBe(true);
  });
  it('refuses a patch for a Cap not in custody, a release for a Cap not retired, a decision for a Cap that is not the sure cur', () => {
    const c = r.grant('CAP-1');
    const gone = new Cap('GONE', K, 'acct1', 99);
    expect(r.core.send(r.tix('patch', { cap: gone }).t, ok())).toBeNull();
    expect(r.core.send(r.tix('release', { cap: c }).t, ok())).toBeNull(); // still cur
    c.role = 'probe';
    expect(r.core.send(r.tix('decide', { cap: c }).t, ok())).toBeNull(); // a probe does not decide
    c.role = 'cur';
    c.lapsed = true;
    expect(r.core.send(r.tix('decide', { cap: c }).t, ok())).toBeNull(); // lapsed
    c.lapsed = false;
    r.advance(TTL); // no longer sure
    expect(r.core.send(r.tix('decide', { cap: c }).t, ok())).toBeNull();
  });
  it('lets a patch go for a cur or a probe, a release for a retired Cap, a decision for the sure cur', () => {
    const c = r.grant('CAP-1');
    expect(r.core.send(r.tix('patch', { cap: c }).t, ok())?.header).toBe('CAP-1');
    c.role = 'probe';
    expect(r.core.send(r.tix('patch', { cap: c }).t, ok())?.header).toBe('CAP-1');
    c.role = 'retire';
    expect(r.core.send(r.tix('release', { cap: c }).t, fail(500, 'x'))?.header).toBe('CAP-1');
    c.role = 'cur';
    expect(r.core.send(r.tix('decide', { cap: c }).t, ok())?.header).toBe('CAP-1');
  });
  it('an acquire sends no header, or its proof; the proof must still be in custody', () => {
    expect(r.core.send(r.tix('acquire').t, ok())?.header).toBeNull();
    const p = r.grant('CAP-P');
    expect(r.core.send(r.tix('acquire', { proof: p }).t, ok())?.header).toBe('CAP-P');
    const lost = new Cap('LOST', K, 'acct1', 5);
    expect(r.core.send(r.tix('acquire', { proof: lost }).t, ok())).toBeNull();
  });
  it('a mint sends no header; its guard decides whether it may go', () => {
    let open = true;
    const { t } = r.tix('mint', { key: null, guard: () => open });
    open = false;
    expect(r.core.send(t, ok())).toBeNull();
    open = true;
    expect(r.core.send(r.tix('mint', { key: null, guard: () => open }).t, ok({}))?.header).toBeNull();
  });
  it('a ticket is single use (the stand-in marks it spent; the issuer also refuses a second check)', () => {
    const c = r.grant('CAP-1');
    const { t } = r.tix('patch', { cap: c });
    expect(r.core.spend(t)).not.toBeNull();
    expect(r.core.spend(t)).toBeNull();
  });
  it('the issuer itself refuses a ticket once it was spent, whatever the caller does', () => {
    const c = r.grant('CAP-1');
    const { t } = r.tix('patch', { cap: c });
    expect(r.core.check(t)).toBe(true);
    r.core.spend(t);
    expect(r.core.check(t)).toBe(false);
  });
  it('a retired Cap is never renewed or probed again', () => {
    const c = r.grant('CAP-1');
    c.role = 'retire';
    expect(r.core.check(r.tix('patch', { cap: c }).t)).toBe(false);
  });
  it('a ticket the issuer never saw is refused', () => {
    const foreign = Object.freeze({ bind: { route, container: C, sid: 's1', idem: null } }) as never;
    expect(r.core.spend(foreign)).toBeNull();
  });
  it('is fenced by account, account counter and manager epoch', () => {
    const c = r.grant('CAP-1');
    const a1 = r.tix('patch', { cap: c });
    r.st.acct = 'acct2';
    expect(r.core.send(a1.t, ok())).toBeNull();
    r.st.acct = 'acct1';
    const a2 = r.tix('patch', { cap: c });
    r.st.acctEpoch += 1;
    expect(r.core.send(a2.t, ok())).toBeNull();
    const a3 = r.tix('patch', { cap: c });
    r.st.mgr += 1;
    expect(r.core.send(a3.t, ok())).toBeNull();
  });
});

describe('spend: the send anchor and the extending attempts', () => {
  it('stamps the send with both clocks, the gap and a growing stamp', () => {
    const c = r.grant('CAP-1');
    const a = r.tix('patch', { cap: c });
    r.core.spend(a.t);
    expect(a.a.sent).toMatchObject({ m: r.clock.m, w: r.clock.w, gap: 0 });
    const b = r.tix('patch', { cap: c });
    r.core.spend(b.t);
    expect(b.a.sentSeq!).toBeGreaterThan(a.a.sentSeq!);
  });
  it('records patches and decisions in c.ext in send order; release and acquire are not extending', () => {
    const c = r.grant('CAP-1');
    r.core.spend(r.tix('patch', { cap: c }).t);
    r.core.spend(r.tix('decide', { cap: c }).t);
    c.role = 'retire';
    r.core.spend(r.tix('release', { cap: c }).t);
    expect(c.ext.map((x) => x.op)).toEqual(['patch', 'decide']);
  });
  it('the 17th extending attempt is still sent, is not recorded, and makes the Cap stale', () => {
    const c = r.grant('CAP-1');
    for (let i = 0; i < EXT_MAX; i++) expect(r.core.spend(r.tix('decide', { cap: c }).t)).not.toBeNull();
    expect(c.stale).toBe(false);
    expect(c.ext).toHaveLength(EXT_MAX);
    expect(r.core.spend(r.tix('decide', { cap: c }).t)?.header).toBe('CAP-1');
    expect(c.ext).toHaveLength(EXT_MAX);
    expect(c.stale).toBe(true);
  });
});

describe('capture at the success boundary', () => {
  const create = (v: string) => ({ session_id: 's9', approver_lease: { lease: v, generation: 2 }, started: { approver_lease: { token: v } } });
  const scan = (v: unknown, needle: string): boolean => JSON.stringify(v).includes(needle);
  it('takes the grant of an acquire into custody and blanks the reply', () => {
    const { t } = r.tix('acquire');
    const body = { lease: 'CAP-NEW', generation: 4, info: { epoch: 'e1' } };
    r.core.send(t, ok(body));
    expect(scan(body, 'CAP-NEW')).toBe(false);
    expect(r.cus.caps(K)).toHaveLength(1);
    expect(r.cus.caps(K)[0]!.generation).toBe(4);
    expect(r.answers).toHaveLength(1);
  });
  it('takes both copies of a create answer once, keyed by the session id the answer names; a sid-less mint has no key until then', () => {
    const { a, t } = r.tix('mint', { key: null });
    const body = create('CAP-C');
    r.core.send(t, ok(body));
    expect(scan(body, 'CAP-C')).toBe(false);
    expect(r.cus.caps(`${C}|s9`)).toHaveLength(1);
    expect(a.granted).toHaveLength(1);
  });
  it('takes nothing from an answer that names no session for a sid-less mint, and still blanks it', () => {
    const { t } = r.tix('mint', { key: null });
    const body = { approver_lease: { lease: 'CAP-X' } };
    r.core.send(t, ok(body));
    expect(scan(body, 'CAP-X')).toBe(false);
    expect(r.cus.keys()).toEqual([]);
  });
  it('a fenced attempt only blanks: nothing in custody, nothing for the machine, no matter how many copies', () => {
    const { t } = r.tix('mint', { key: null });
    const s = r.core.spend(t)!;
    r.st.acct = 'acct2';
    const body = create('CAP-F');
    r.core.deliver(s, ok(body));
    expect(scan(body, 'CAP-F')).toBe(false);
    expect(r.cus.keys()).toEqual([]);
    expect(r.answers).toHaveLength(0);
    expect(r.settles).toHaveLength(0);
  });
  it('a grant whose request crossed a gap is taken unsure (no anchor)', () => {
    const { t } = r.tix('acquire');
    const s = r.core.spend(t)!;
    r.st.gap += 1;
    r.core.deliver(s, ok({ lease: 'CAP-U' }));
    expect(r.cus.caps(K)[0]!.at).toBeNull();
  });
  it('a grant of a request sent after the last gap is anchored at that send', () => {
    const { a, t } = r.tix('acquire');
    r.core.send(t, ok({ lease: 'CAP-S' }));
    expect(r.cus.caps(K)[0]!.at).toEqual(a.sent);
  });
  it('a value already in custody for the record is not taken twice', () => {
    r.grant('CAP-D');
    r.core.send(r.tix('acquire').t, ok({ lease: 'CAP-D' }));
    expect(r.cus.caps(K)).toHaveLength(1);
  });
  it('no answer object holds a capability after the hooks (deep scan over many shapes)', () => {
    const shapes: unknown[] = [{ lease: 'Z1' }, create('Z1'), { lease: 'Z1', approver_lease: { lease: 'Z1' }, started: { approver_lease: { token: 'Z1' } } }];
    for (const s of shapes) { r.core.send(r.tix('acquire').t, ok(s)); expect(scan(s, 'Z1')).toBe(false); }
  });
});

describe('settled: the proofs, and the only way a Cap leaves', () => {
  const carry = (op: Op, c: Cap) => r.tix(op, { cap: c });
  it('409 approver_lease_invalid on a request that carried it removes it, on a patch, a decision and an acquire proof', () => {
    for (const op of ['patch', 'decide'] as const) {
      const c = r.grant(`CAP-${op}`);
      r.core.send(carry(op, c).t, fail(409, 'approver_lease_invalid'));
      expect(r.cus.held(c)).toBe(false);
      expect(r.settles.at(-1)!.removed).toBe(c);
    }
    const p = r.grant('CAP-P');
    r.core.send(r.tix('acquire', { proof: p }).t, fail(409, 'approver_lease_invalid'));
    expect(r.cus.held(p)).toBe(false);
  });
  it('a 2xx release removes the Cap', () => {
    const c = r.grant('CAP-1');
    c.role = 'retire';
    r.core.send(carry('release', c).t, ok());
    expect(r.cus.held(c)).toBe(false);
  });
  it.each([
    ['patch', fail(410, 'approver_lease_expired')], ['patch', fail(404, 'not_found')], ['patch', timeout()], ['patch', notSent()], ['patch', ok()], ['patch', fail(409, 'approver_lease_held')],
    ['decide', fail(410, 'approver_lease_expired')], ['decide', fail(409, 'approver_lease_required')], ['decide', fail(404, 'not_found')], ['decide', ok()],
    ['release', fail(500, 'x')], ['release', fail(404, 'not_found')], ['release', fail(410, 'approver_lease_expired')], ['release', fail(409, 'approver_lease_held')], ['release', timeout()],
  ] as Array<[Op, Reply]>)('%s %j removes nothing', (op, reply) => {
    const c = r.grant('CAP-1');
    c.role = op === 'release' ? 'retire' : 'cur';
    r.core.send(carry(op, c).t, reply);
    expect(r.cus.held(c)).toBe(true);
  });
  it('a read of another Cap, a generation or an epoch in an answer removes nothing (an answer is not a proof)', () => {
    const c = r.grant('CAP-1');
    r.core.send(r.tix('acquire').t, ok({ lease: 'CAP-2', generation: 99, info: { epoch: 'other' } }));
    expect(r.cus.held(c)).toBe(true);
  });
  it('a proof names the carried capability only: a 409 on a request carrying B never removes A', () => {
    const a = r.grant('CAP-A');
    const b = r.grant('CAP-B');
    r.core.send(carry('patch', b).t, fail(409, 'approver_lease_invalid'));
    expect(r.cus.held(a)).toBe(true);
    expect(r.cus.held(b)).toBe(false);
  });
  it('a fenced attempt touches nothing when it settles', () => {
    const c = r.grant('CAP-1');
    const { t } = carry('patch', c);
    const s = r.core.spend(t)!;
    r.st.acctEpoch += 1;
    r.core.deliver(s, fail(409, 'approver_lease_invalid'));
    expect(r.cus.held(c)).toBe(true);
    expect(r.settles).toHaveLength(r.settles.length);
    expect(c.stale).toBe(false);
  });
  it('runs once per ticket', () => {
    const c = r.grant('CAP-1');
    const { t } = carry('patch', c);
    const s = r.core.spend(t)!;
    const n = r.settles.length;
    r.core.deliver(s, ok());
    r.core.deliver(s, ok());
    expect(r.settles.length).toBe(n + 1);
  });
});

describe('the deadline anchor is computed in settled, before the attempt closes', () => {
  const patch = (c: Cap) => { const x = r.tix('patch', { cap: c }); return { ...x, s: r.core.spend(x.t)! }; };
  it('a lone renew anchors at its own send', () => {
    const c = r.grant('CAP-1');
    const p = patch(c);
    r.advance(10);
    r.core.deliver(p.s, ok());
    expect(p.a.anchor).toEqual(p.a.sent);
  });
  it('a decision sent earlier and still open when the renew was sent holds the anchor back to the decision\'s send', () => {
    const c = r.grant('CAP-1');
    r.advance(300);
    const d = r.tix('decide', { cap: c }); const ds = r.core.spend(d.t)!;
    r.advance(10);
    const p = patch(c);
    r.advance(5);
    r.core.deliver(p.s, ok());
    expect(p.a.anchor).toEqual(d.a.sent);
    void ds;
  });
  it('a decision answered before the renew was sent does not hold it back', () => {
    const c = r.grant('CAP-1');
    const d = r.tix('decide', { cap: c }); const ds = r.core.spend(d.t)!;
    r.core.deliver(ds, ok({ status: 'ok' }));
    r.advance(10);
    const p = patch(c);
    r.core.deliver(p.s, ok());
    expect(p.a.anchor).toEqual(p.a.sent);
  });
  it('order: D sent, P sent, D answers 2xx, then P answers 2xx: the anchor is D\'s send, and D is pruned only after', () => {
    const c = r.grant('CAP-1');
    const d = r.tix('decide', { cap: c }); const ds = r.core.spend(d.t)!;
    r.advance(7);
    const p = patch(c);
    r.advance(3);
    r.core.deliver(ds, ok({ status: 'ok' }));
    expect(c.ext).toContain(d.a); // P is open and was sent before D's doneSeq: D still counts
    r.advance(5);
    r.core.deliver(p.s, ok());
    expect(p.a.anchor).toEqual(d.a.sent);
    expect(c.ext).not.toContain(d.a);
  });
  it('a request sent after the renew can only lengthen the lease and is not considered', () => {
    const c = r.grant('CAP-1');
    const p = patch(c);
    r.advance(4);
    const d = r.tix('decide', { cap: c }); r.core.spend(d.t);
    r.core.deliver(p.s, ok());
    expect(p.a.anchor).toEqual(p.a.sent);
  });
  it('is null when the send crossed a gap, and a gap then fixes nothing later', () => {
    const c = r.grant('CAP-1');
    const p = patch(c);
    r.st.gap += 1;
    r.core.deliver(p.s, ok());
    expect(p.a.anchor).toBeNull();
  });
  it('anchorOf is pure: it changes nothing', () => {
    const c = r.grant('CAP-1');
    const p = patch(c);
    const before = JSON.stringify({ e: c.ext.map((x) => x.sentSeq), d: c.ext.map((x) => x.doneSeq) });
    anchorOf(c, p.a, 0); anchorOf(c, p.a, 0);
    expect(JSON.stringify({ e: c.ext.map((x) => x.sentSeq), d: c.ext.map((x) => x.doneSeq) })).toBe(before);
  });
});

describe('ghosts make the Cap stale', () => {
  const send = (op: 'patch' | 'decide', c: Cap, reply: Reply) => { const x = r.tix(op, { cap: c }); r.core.send(x.t, reply); return x.a; };
  it.each([
    ['patch', timeout()], ['patch', fail(500, 'x')], ['patch', fail(409, 'approver_lease_held')], ['patch', pending()],
    ['decide', timeout()], ['decide', ok({ status: 'pending' })], ['decide', ok()], ['decide', fail(409, 'gate_decision_pending')], ['decide', pending()], ['decide', fail(404, 'not_found')], ['decide', fail(400, 'bad_request')], ['decide', fail(500, 'x')],
  ] as Array<['patch' | 'decide', Reply]>)('%s %j is a ghost', (op, reply) => {
    const c = r.grant('CAP-1');
    const a = send(op, c, reply);
    expect(a.ghost).toBe(true);
    expect(a.doneSeq).toBeNull();
    expect(c.stale).toBe(true);
    expect(c.ext).toContain(a); // a ghost stays until its Cap leaves
  });
  it.each([
    ['patch', ok()], ['patch', fail(400, 'bad_request')], ['patch', notSent()], ['patch', fail(404, 'not_found')], ['patch', fail(410, 'approver_lease_expired')],
    ['decide', ok({ status: 'ok' })], ['decide', notSent()], ['decide', fail(409, 'approver_lease_invalid')], ['decide', fail(410, 'approver_lease_expired')], ['decide', fail(409, 'approver_lease_required')],
  ] as Array<['patch' | 'decide', Reply]>)('%s %j closes and leaves the Cap unstale', (op, reply) => {
    const c = r.grant(`CAP-${op}`);
    const a = send(op, c, reply);
    expect(a.ghost).toBe(false);
    expect(a.doneSeq).not.toBeNull();
    expect(c.stale).toBe(false);
  });
  it('a ghost stays in c.ext when later attempts close and prune', () => {
    const c = r.grant('CAP-1');
    const g = send('decide', c, timeout());
    send('patch', c, ok());
    send('patch', c, ok());
    expect(c.ext).toContain(g);
  });
  it('a ghost keeps the anchor of a later renew capped at the ghost\'s send', () => {
    const c = r.grant('CAP-1');
    r.advance(290);
    const g = send('decide', c, fail(409, 'gate_decision_pending'));
    r.advance(7);
    const x = r.tix('patch', { cap: c }); const s = r.core.spend(x.t)!;
    r.advance(3);
    r.core.deliver(s, ok());
    expect(x.a.anchor).toEqual(g.sent);
  });
});

describe('abandon (an account change) removes with no proof', () => {
  it('removes every Cap of that account, in every record, and returns the records', () => {
    const c1 = r.grant('CAP-1');
    const c2 = r.grant('CAP-2', `${C}|s2`);
    const keys = r.cus.abandon('acct1');
    expect([...keys].sort()).toEqual([K, `${C}|s2`].sort());
    expect(r.cus.held(c1) || r.cus.held(c2)).toBe(false);
    expect(r.cus.keys()).toEqual([]);
  });
  it('leaves another account\'s Caps', () => {
    r.grant('CAP-1');
    expect(r.cus.abandon('acct9')).toEqual([]);
    expect(r.cus.caps(K)).toHaveLength(1);
  });
});

describe('anchorOf as a function', () => {
  it('uses the attempt\'s own send when nothing else is open', () => {
    const c = new Cap('x', K, 'a', 1);
    const a = r.cus.attempt('patch', { container: C, key: K, cap: c });
    Object.assign(a, { sentSeq: 5, sent: { m: 1, w: 1, gap: 0, seq: 5 } });
    c.ext.push(a);
    expect(anchorOf(c, a, 0)).toEqual(a.sent);
    expect(anchorOf(c, a, 1)).toBeNull();
  });
});
