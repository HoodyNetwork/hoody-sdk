// Acceptance, group HELD: the GitHub run's sends go through the held door, which admits only
// against the STORED hold of core (compare-and-set versions, this tab's live stamp), once per stored version.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as A from '@ask/io';
import { attemptFor, attemptStored, heldAttempts, holdAttempt, type Target } from '@core';
import { setIdentity } from '@core/ctx';
import { UID, OTHER, boot, R1, R2 } from '@core/test/env';
import { BY, heldHandle, lockFor } from './held';

const COMP = 'c1';
const target = { project: { id: 'p1' }, container: { id: COMP, server_name: 'sv1' } } as unknown as Target;
const rows = () => heldAttempts().filter((h) => h.by === BY);

async function fresh(meta: Record<string, unknown>, realm = R1) {
  A.resetPageForTests();
  boot();
  setIdentity({ id: UID, banned: false });
  const r = await holdAttempt(lockFor(target)!, { by: BY, meta: { computer: COMP, realm, ...meta }, realm } as any);
  if (!r.ok) throw new Error('hold refused ' + r.code);
  return r.hold;
}
const sendingSave = async (h: any, v: number, meta: Record<string, unknown>) => {
  const ok = await h.update({ computer: COMP, realm: R1, ...meta }, v, { sending: true });
  expect(ok).toBe(true);
  return v + 1;
};
const base = { acct: UID, container: COMP, r: R1 };
const adm = (op: any, id: string, v: number) => A.held.admit(op, id, v, new A.SendToken());
const io = () => {
  const calls: string[] = [];
  const stub: any = A.bindDestForTests({
    create: (..._a: unknown[]) => { calls.push('create'); return Promise.resolve({ session_id: 's1' }); },
    turn: (..._a: unknown[]) => { calls.push('turn'); return Promise.resolve({ turn_id: 't1' }); },
    stop: (..._a: unknown[]) => { calls.push('stop'); return Promise.resolve({}); },
    confirm: (..._a: unknown[]) => { calls.push('confirm'); return Promise.resolve({}); },
    answer: (..._a: unknown[]) => { calls.push('answer'); return Promise.resolve({}); },
  } as any, COMP);
  return { g: A.guardIO(stub, { acct: UID, container: COMP }) as any, calls };
};
afterEach(() => { A.resetPageForTests(); });

describe('a create, a turn and a stop each go once per stored version', () => {
  it('a create with the hold\'s own hub- key is admitted and sent through the guard with exactly one ticket', async () => {
    const h = await fresh({ step: 'create' });
    expect(h.key).toMatch(/^hub-/);
    const v = await sendingSave(h, 0, { step: 'create' });
    const a: any = adm({ ...base, route: 'create', key: h.key }, h.id, v);
    expect('kind' in a, JSON.stringify(a)).toBe(false);
    const { g, calls } = io();
    const out = await A.held.post(a, (t: any) => g.create({} as any, h.key, R1, [t]));
    expect(out).toMatchObject({ kind: 'sent' });
    expect(calls).toEqual(['create']);
    expect(await g.create({} as any, h.key, R1).then(() => 'resolved', (e: any) => e.code)).toBe('TICKET_REQUIRED');
    expect(calls).toEqual(['create']);
  });
  it('after the send a second admission at the same stored version is refused (consumed); a new save of the stamp is admitted once', async () => {
    const h = await fresh({ step: 'turn', k2: 'hx-' + 'a'.repeat(32), sid: 's1' });
    const meta = { step: 'turn', k2: 'hx-' + 'a'.repeat(32), sid: 's1' };
    const v = await sendingSave(h, 0, meta);
    const op = { ...base, route: 'turn', key: meta.k2, sid: 's1' };
    const a: any = adm(op, h.id, v);
    const { g } = io();
    await A.held.post(a, (t: any) => g.turn('s1', 'hi', meta.k2, R1, undefined, undefined, [t]));
    expect(adm(op, h.id, v)).toEqual({ kind: 'notSent', why: 'consumed' });
    const v2 = await sendingSave(h, v, meta);
    expect('kind' in (adm(op, h.id, v2) as any)).toBe(false);
    expect(adm(op, h.id, v2)).toEqual({ kind: 'notSent', why: 'consumed' });
  });
});

describe('only the stored hold, of this sender, computer, realm, account and request, is admitted', () => {
  it('a turn whose save never landed (the stored hold is still the create) is refused, and so is a version that was never stored', async () => {
    const h = await fresh({ step: 'create' });
    const k2 = 'hx-' + 'f'.repeat(32);
    expect(adm({ ...base, route: 'turn', key: k2, sid: 's1' }, h.id, 0)).toEqual({ kind: 'notSent', why: 'notKept' });
    expect(adm({ ...base, route: 'create', key: h.key }, h.id, 5)).toEqual({ kind: 'notSent', why: 'notKept' });
  });
  it('another computer or realm or key: refused, unsent', async () => {
    const h = await fresh({ step: 'create' });
    const v = await sendingSave(h, 0, { step: 'create' });
    expect(adm({ ...base, container: 'c2', route: 'create', key: h.key }, h.id, v)).toEqual({ kind: 'notSent', why: 'notKept' });
    expect(adm({ ...base, r: R2, route: 'create', key: h.key }, h.id, v)).toEqual({ kind: 'notSent', why: 'notKept' });
    expect(adm({ ...base, route: 'create', key: 'hub-' + 'z'.repeat(26) }, h.id, v)).toEqual({ kind: 'notSent', why: 'notKept' });
    expect(adm({ ...base, route: 'create', key: h.key }, 'nope', v)).toMatchObject({ kind: 'notSent' });
  });
  it('the tab switches to account B: admit with A\'s hold id and P.acct = B is refused', async () => {
    const h = await fresh({ step: 'create' });
    const v = await sendingSave(h, 0, { step: 'create' });
    setIdentity({ id: OTHER, banned: false });
    const r = adm({ ...base, acct: OTHER, route: 'create', key: h.key }, h.id, v) as any;
    expect(r.kind).toBe('notSent');
    expect(['account', 'notKept']).toContain(r.why);
    const own = adm({ ...base, route: 'create', key: h.key }, h.id, v) as any;
    expect(own).toEqual({ kind: 'notSent', why: 'account' });
  });
  it('a turn admission used for a stop call, or for another session, is TICKET_REFUSED', async () => {
    const meta = { step: 'turn', k2: 'hx-' + 'b'.repeat(32), sid: 's1' };
    const h = await fresh(meta);
    const v = await sendingSave(h, 0, meta);
    const a: any = adm({ ...base, route: 'turn', key: meta.k2, sid: 's1' }, h.id, v);
    const { g, calls } = io();
    let stop = '', other = '';
    await A.held.post(a, async (t: any) => {
      stop = await g.stop('s1', meta.k2, R1, [t]).then(() => 'resolved', (e: any) => e.code);
      other = await g.turn('s2', 'hi', meta.k2, R1, undefined, undefined, [t]).then(() => 'resolved', (e: any) => e.code);
    });
    expect([stop, other]).toEqual(['TICKET_REFUSED', 'TICKET_REFUSED']);
    expect(calls).toEqual([]);
  });
  it('a decision is admitted only against the stored d of exactly this rid, gate, generation and kind', async () => {
    const rid = 'hx-' + 'c'.repeat(24);
    const d = { rid, gate: 'G1', gen: 2, kind: 'confirm' };
    const h = await fresh({ step: 'running', sid: 's1' });
    const v0 = await sendingSave(h, 0, { step: 'running', sid: 's1' });
    const op = { ...base, route: 'confirm', key: rid, sid: 's1', gate: 'G1', gen: 2 };
    expect(adm(op, h.id, v0), 'no stored d').toEqual({ kind: 'notSent', why: 'notKept' });
    const v1 = await sendingSave(h, v0, { step: 'running', sid: 's1', d });
    expect('kind' in (adm(op, h.id, v1) as any), 'the matching one').toBe(false);
    for (const [name, bad] of [['rid', { ...op, key: 'hx-' + 'd'.repeat(24) }], ['gate', { ...op, gate: 'G9' }], ['gen', { ...op, gen: 3 }], ['kind', { ...op, route: 'answer' }]] as const) {
      const v = await sendingSave(h, (attemptStored(h.id, BY) as any).v.metaVersion, { step: 'running', sid: 's1', d });
      expect(adm(bad, h.id, v), name).toEqual({ kind: 'notSent', why: 'notKept' });
    }
  });
});

describe('what the store says now decides', () => {
  it('another tab dismisses the hold; this tab, still beating, admits nothing', async () => {
    const h = await fresh({ step: 'create' });
    const v = await sendingSave(h, 0, { step: 'create' });
    heldHandle(h.id, v)!.lease()();                                      // the sending stamp ended: Dismiss may free it
    expect(await attemptFor(h.id, BY)!.free('dismissed', { metaVersion: v } as any)).toBeTruthy();
    expect(rows().filter((x) => x.id === h.id)).toHaveLength(0);
    expect(adm({ ...base, route: 'create', key: h.key }, h.id, v)).toMatchObject({ kind: 'notSent' });
  });
  it('a stamp that has ended (every lease released) admits nothing at that version', async () => {
    const h = await fresh({ step: 'create' });
    const v = await sendingSave(h, 0, { step: 'create' });
    heldHandle(h.id, v)!.lease()();
    expect(rows().find((x) => x.id === h.id)?.inFlight).toBe(false);
    expect(adm({ ...base, route: 'create', key: h.key }, h.id, v)).toEqual({ kind: 'notSent', why: 'notKept' });
  });
  it('storage that cannot be read: attemptStored says unreadable and the door refuses', async () => {
    const h = await fresh({ step: 'create' });
    const v = await sendingSave(h, 0, { step: 'create' });
    // eslint-disable-next-line no-restricted-properties -- the test plays a browser that cannot read its storage (as pages/ai/handoff.page.test.tsx)
    const spy = vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    try {
      expect((attemptStored(h.id, BY) as any).s).toBe('unreadable');
      expect(adm({ ...base, route: 'create', key: h.key }, h.id, v)).toEqual({ kind: 'notSent', why: 'unreadable' });
    } finally { spy.mockRestore(); }
  });
});

describe('the sending stamp ends only when every lease is released, each once', () => {
  it('a release called twice decrements once; the stamp ends when the last lease goes', async () => {
    const h = await fresh({ step: 'turn', sid: 's1', k2: 'hx-' + 'e'.repeat(32) });
    const v = await sendingSave(h, 0, { step: 'turn', sid: 's1', k2: 'hx-' + 'e'.repeat(32) });
    const run = heldHandle(h.id, v)!;
    const l1 = run.lease(), l2 = run.lease();
    const stamped = () => rows().find((x) => x.id === h.id)?.inFlight;
    expect(stamped()).not.toBe(false);
    l1(); l1();                                                          // the same release twice decrements once
    expect(stamped(), 'one lease is still out').not.toBe(false);
    l2();
    expect(stamped(), 'the last lease went: the stamp ends').toBe(false);
    l2();
    expect(stamped()).toBe(false);
  });
});
