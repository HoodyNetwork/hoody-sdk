// A create reply that proves another binding is settled AS REFUSED by the journal in ONE update. The record at
// the create address is removed (with this chat's no-turn record at the session address, if a stray handoff put one there); the session
// address is never written for it, even while the store refuses the settlement for as long as it likes.
//   A  accepts answers true | false | 'refuse' (anything else is unknown)
//   P  a refusal's Kept proves the removal only of a refused create, and a handoff's Kept never of a refused one
//   R  Records.refuseCreate: what it removes, what it keeps, what it answers
//   D  the door and the engine: no durable write ever names the refused session; an owed refusal is retried
//   E  records.drop of a session address removes only this chat's record
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import * as C from '../conv';
import { classifyReply, fromCreateKept, mintKept } from '../journal/proof';
import { recordsForTests } from '../journal/testing';
import { ACCOUNT, HANDLE, JOURNAL, OTHER, REALM, REQ, posts, showAccount, storedKeys, users, world, type World } from './env';

let w: World | null = null;
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { w?.dispose(); w = null; resetApproversForTests(); });

const agent = (): any => w!.agent as any;
const doc = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL) ?? 'null')?.a?.[ACCOUNT] ?? {}; } catch { return {}; } };
const seedDoc = (d: Record<string, any>) => { const raw = w!.fs.peek(JOURNAL); const all = raw ? JSON.parse(raw) : { v: 1, a: {} }; all.a[ACCOUNT] = d; w!.fs.seed(JOURNAL, JSON.stringify(all)); };
const key = (n: number, c = 'a') => 'hx-' + c + n.toString(16).padStart(31, '0');
const K1 = key(1);
const TPL = { p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM, s: null, t: null, rc: 'custom', n: null, i: null, q: 0, ph: 'sending', l: 'en' };
const chat = (k: number, over: Record<string, unknown> = {}): any => ({ ...TPL, k1: key(k), k2: key(k, 'b'), at: 1000 + k, ...over });
function plant(rec: any, sid: string | null = rec.s): void {
  const d = doc();
  d[sid === null ? `${HANDLE}|${REALM}|create:${rec.k1}` : `${HANDLE}|${REALM}|${sid}`] = { h: HANDLE, ...rec };
  seedDoc(d);
}
const at = (sid: string | null, k1 = K1) => doc()[sid === null ? `${HANDLE}|${REALM}|create:${k1}` : `${HANDLE}|${REALM}|${sid}`];
const refuse = (sid = 'sess-9') => recordsForTests(w!.j).refuseCreate(HANDLE, REALM, K1, sid);

describe('A accepts answers true, false or the literal refuse', () => {
  const ctx = { acct: ACCOUNT, h: HANDLE, k: K1, route: 'create' as const };
  const body = { session_id: 'sess-9' };
  const run = (accepts: any) => classifyReply({ ...ctx, ...(accepts ? { accepts } : {}) }, { ok: true, b: body });
  it('true is made, with the session', () => { expect(run(() => true)).toMatchObject({ t: 'settled', why: 'made', sid: 'sess-9' }); });
  it('no callback is made', () => { expect(run(undefined)).toMatchObject({ t: 'settled', why: 'made' }); });
  it('false is unknown', () => { expect(run(() => false)).toMatchObject({ t: 'unknown', why: 'notThis' }); });
  it('a throw is unknown, never a refusal', () => { expect(run(() => { throw new Error('x'); })).toMatchObject({ t: 'unknown', why: 'notThis' }); });
  it('refuse is settled as refused and keeps the session it names', () => { expect(run(() => 'refuse')).toMatchObject({ t: 'settled', why: 'refused', sid: 'sess-9' }); });
  it('any other truthy value is unknown (only the literal refuse refuses, only true makes)', () => {
    for (const v of ['yes', 1, {}, 'refused', 'REFUSE']) expect(run(() => v), String(v)).toMatchObject({ t: 'unknown', why: 'notThis' });
  });
});

describe('P a refusal\'s Kept and a handoff\'s Kept prove only their own create', () => {
  const ctx = { acct: ACCOUNT, h: HANDLE, k: K1, route: 'create' as const };
  const body = { session_id: 'sess-9' };
  const made = classifyReply({ ...ctx, accepts: () => true }, { ok: true, b: body });
  const refused = classifyReply({ ...ctx, accepts: () => 'refuse' }, { ok: true, b: body });
  const moved = mintKept({ acct: ACCOUNT, h: HANDLE, r: REALM, k1: K1, sid: 'sess-9' });
  const removed = mintKept({ acct: ACCOUNT, h: HANDLE, r: REALM, k1: K1, sid: 'sess-9', refused: true });
  it('each pairing proves its own create', () => {
    expect(fromCreateKept(made, moved)).not.toBeNull();
    expect(fromCreateKept(refused, removed)).not.toBeNull();
  });
  it('a refusal Kept never removes a made create\'s entry, and a handoff Kept never a refused one', () => {
    expect(fromCreateKept(made, removed)).toBeNull();
    expect(fromCreateKept(refused, moved)).toBeNull();
  });
  it('the refused mark is a field of the frozen Kept itself', () => {
    expect((removed as any).refused).toBe(true);
    expect((moved as any).refused).toBeUndefined();
    expect(Object.isFrozen(removed)).toBe(true);
  });
});

describe('R Records.refuseCreate', () => {
  it('removes the create record', async () => {
    w = world();
    plant(chat(1));
    expect(await refuse()).toBeTruthy();
    expect(at(null)).toBeUndefined();
  });
  it('removes this chat\'s record at the session address when it holds no turn (a stray handoff)', async () => {
    w = world();
    plant(chat(1));
    plant(chat(1, { s: 'sess-9', t: null }));
    expect(await refuse()).toBeTruthy();
    expect(at(null)).toBeUndefined();
    expect(at('sess-9')).toBeUndefined();
  });
  it('keeps another chat\'s record at the session address and a same-chat record that holds a known turn', async () => {
    w = world();
    plant(chat(1));
    plant(chat(7, { s: 'sess-9', t: 'turn-7' }));
    expect(await refuse()).toBeTruthy();
    expect(at(null)).toBeUndefined();
    expect(at('sess-9', key(7)), 'another chat').toBeTruthy();
    plant(chat(1, { s: 'sess-9', t: 'turn-1' }));
    expect(await refuse()).toBeTruthy();
    expect(at('sess-9'), 'a turn already ran there').toBeTruthy();
  });
  it('keeps another chat\'s record at the session address even when it holds no turn (the k1 is the chat\'s identity)', async () => {
    w = world();
    plant(chat(1));
    plant(chat(7, { s: 'sess-9', t: null }));
    expect(await refuse()).toBeTruthy();
    expect(at(null)).toBeUndefined();
    expect(at('sess-9', key(7)), 'another chat, no turn yet').toBeTruthy();
  });
  it('an account that changes between the read and the write keeps nothing and writes nothing', async () => {
    w = world();
    plant(chat(1));
    const fs = w.fs as any;
    const get = fs.getItem.bind(fs);
    let armed = true;
    fs.getItem = (k: string) => { const v = get(k); if (armed && k === JOURNAL) { armed = false; showAccount(OTHER); } return v; };
    const out = await refuse();
    showAccount(ACCOUNT);
    expect(out, 'nothing is kept for an account that is no longer shown').toBeNull();
    expect(at(null), 'the record is still there, owed').toBeTruthy();
  });
  it('is idempotent: nothing to remove is kept', async () => {
    w = world();
    plant(chat(2));
    expect(await refuse()).toBeTruthy();
    expect(await refuse()).toBeTruthy();
    expect(at(null, key(2)), 'an unrelated chat is untouched').toBeTruthy();
  });
  it('a store the last removal emptied still answers kept', async () => {
    w = world();
    plant(chat(1));
    expect(await refuse()).toBeTruthy();
    expect(w.fs.peek(JOURNAL) === null || Object.keys(doc()).length === 0).toBe(true);
    expect(await refuse(), 'the retry of an owed settlement after the record went').toBeTruthy();
  });
  it('a document that cannot be read keeps nothing and is not written over', async () => {
    w = world();
    w.fs.seed(JOURNAL, '[1,2');
    expect(await refuse()).toBeNull();
    expect(w.fs.peek(JOURNAL)).toBe('[1,2');
  });
  it('a refused write keeps nothing', async () => {
    w = world();
    plant(chat(1));
    w.fs.blockWrites(JOURNAL);
    expect(await refuse()).toBeNull();
    w.fs.clearFaults();
    expect(at(null), 'the record is still there, owed').toBeTruthy();
  });
  it('a malformed row at the create address reads as absent (parse drops it), so nothing is claimed about it', async () => {
    w = world();
    const d = doc();
    d[`${HANDLE}|${REALM}|create:${K1}`] = { h: HANDLE, junk: true };
    seedDoc(d);
    expect(await refuse()).toBeTruthy();
  });
});

const withStarted = (s: Record<string, unknown>) => (r: any) => ({ ...r, started: { ...r.started, ...s } });
const OTHER_OWNER = withStarted({ owner_fingerprint: 'fp-other' });
/** The next create's reply is rewritten by `fix`; `onReply` runs when the agent has made the session, before the engine sees the reply. */
function rewriteCreate(fix: (r: any) => any, onReply?: (sid: string) => void): { sid: () => string } {
  const real = agent().create.bind(agent());
  let sid = '';
  agent().create = async (...a: unknown[]) => { const r = await real(...a); sid = r.session_id; onReply?.(sid); return fix(r); };
  return { sid: () => sid };
}
/** Every write to the journal document, as the raw bytes it left. */
function watchWrites(): string[] {
  const seen: string[] = [];
  const fs = w!.fs as any;
  const set = fs.setItem.bind(fs);
  fs.setItem = (k: string, v: string) => { if (k === JOURNAL) seen.push(v); return set(k, v); };
  return seen;
}

describe('D a refused create never reaches the session address', () => {
  it('no durable write of the journal document ever names the refused session', async () => {
    w = world();
    const made = rewriteCreate(OTHER_OWNER);
    const writes = watchWrites();
    const eng = await w.dock();
    eng.send('hello');
    await w.flush(2500);
    const sid = made.sid();
    expect(sid).not.toBe('');
    expect(users(eng.getSnapshot(), C)[0]).toMatchObject({ state: 'refused', reason: 'ask.bindingFailed' });
    expect(writes.length, 'the journal was written').toBeGreaterThan(0);
    for (const v of writes) expect(v.includes('|' + sid), 'a write named the session').toBe(false);
    expect(Object.keys(doc()).filter((k) => k.includes('create:') || k.endsWith('|' + sid))).toEqual([]);
    expect(storedKeys(w.fs), 'the settled create left no entry').toHaveLength(0);
    expect(posts(w.agent, 'turn')).toHaveLength(0);
  });

  it('a settlement the store refuses leaves the record at the CREATE address (never the session) and the entry, and is retried', async () => {
    w = world();
    const made = rewriteCreate(OTHER_OWNER, () => { w!.fs.blockWrites(JOURNAL); });
    const writes = watchWrites();
    const eng = await w.dock();
    eng.send('hello');
    await w.flush(2500);
    const sid = made.sid();
    expect(sid).not.toBe('');
    expect(at(null, (eng as any).rec?.k1 ?? K1) !== undefined || Object.keys(doc()).some((k) => k.includes('create:')), 'the create record waits').toBe(true);
    expect(Object.keys(doc()).some((k) => k.endsWith('|' + sid)), 'the session address is never written').toBe(false);
    expect(storedKeys(w.fs), 'the entry stays while the settlement is owed').toHaveLength(1);
    w.fs.clearFaults();
    await w.flush(60000);
    await w.j.sweep();                          // the owed settlement is retried by the next sweep (any admission runs one)
    await w.flush(600);
    expect(w.j.owed(), 'nothing is owed once it is settled').toBe(0);
    expect(Object.keys(doc()).filter((k) => k.includes('create:') || k.endsWith('|' + sid)), 'the retries finished the refusal').toEqual([]);
    expect(storedKeys(w.fs)).toHaveLength(0);
    for (const v of writes) expect(v.includes('|' + sid), 'no write named the session').toBe(false);
  });

  it('a made create still moves the record (accepts true is unchanged)', async () => {
    w = world();
    const eng = await w.dock();
    eng.send('hello');
    await w.flush(2500);
    const sid = eng.record!.s!;
    expect(Object.keys(doc()).some((k) => k.endsWith('|' + sid))).toBe(true);
    expect(Object.keys(doc()).some((k) => k.includes('create:'))).toBe(false);
  });
});

describe('D2 an owed refusal whose entry has gone is repeated all the same', () => {
  it('the entries cannot be read when the refusal settles, and another tab removes the entry meanwhile: the retry still removes the record', async () => {
    w = world();
    plant({ ...chat(1), k1: K1 });
    const v = classifyReply({ acct: ACCOUNT, h: HANDLE, k: K1, route: 'create', accepts: () => 'refuse' }, { ok: true, b: { session_id: 'sess-9' } });
    w.fs.blockReads(REQ);
    expect(await w.j.settle(v, REALM), 'unreadable entries: the whole settlement is owed').toBe('owed');
    expect(at(null), 'nothing was removed while the entries could not be read').toBeTruthy();
    w.fs.clearFaults();
    await w.j.sweep();
    await w.flush(600);
    expect(at(null), 'the refusal was repeated although there is no entry to look at').toBeUndefined();
    expect(w.j.owed()).toBe(0);
    expect(at('sess-9'), 'the session address was never written').toBeUndefined();
  });
});

describe('E records.drop of a session address removes only this chat\'s record', () => {
  it('another chat\'s record at the address stays and the drop reports done', async () => {
    w = world();
    plant(chat(7, { s: 'sess-9', t: 'turn-7' }));
    expect(await w.j.drop(HANDLE, REALM, 'sess-9', K1)).toBe(true);
    expect(at('sess-9', key(7)), 'not this chat\'s').toBeTruthy();
    expect(await w.j.drop(HANDLE, REALM, 'sess-9', key(7))).toBe(true);
    expect(at('sess-9', key(7))).toBeUndefined();
  });
});
