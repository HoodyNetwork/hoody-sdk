// Acceptance, group HANDOFF: ONE gate for the first message. A first message leaves a
// page only when the journal's chat record is positively AT the session and the message is still owed to that key, read under the chat's
// Web Lock; everything else shows a row (unknown + Check, or Not sent) and sends nothing. The tests below are the state x event table of
// the gate: every one counts the turns the agent admitted, reads the durable record (id, t, k2, dk) from the raw
// bytes, and checks the row (state, reason, text kept).
//   T1-T2   R2 (create not handed off): the records refuse, then heal         T14-T15  checkCreate outcomes; proof vs attach
//   T3      B retypes kB while A waits (supersede)                            T16      settle.ts: absent entry, no realm
//   T4      dormant session: attach before the turn                           T17      the chat lock fails closed
//   T5      session gone (R3) after refused records                           T18-T18d I1/X1/X2: evidence before removal
//   T6-T6b  textless B: firstElsewhere / otherTab, never Not sent             T19      missing/unreadable records never dispatch
//   T7      gap: entry present, record absent (R1)                            T20-T21  the real lost-reply path; Approve automatically
//   T8      move kept, removal refused                                        T22      one lock for the record document
//   T9-T9b  two engines race on R4; intent fixed before the first await       T23-T23c fresh key after a refused/fenced first turn
//   T10-T11 dismissal of a first message; claimFirst refused                  T25-T29  also: textless R4, orphan R5, R3 redo, entry-gone Check, lock bound
//   T12     attach refused, then Send again                                   P1       a pinned write is a promise of "kept"
//   T13     fenced first turn, fence write refused
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import * as C from '../conv';
import type { AskEngine } from '../engine';
import { classifyReply } from '../journal/proof';
import { chatLockName, holdChatLock, recsLockName } from '../journal/locks';
import { dismissal } from '../journal';
import { internalsOf } from '../journal/index';
import { recordsForTests } from '../journal/testing';
import { JOURNAL_RECS } from '../journal/records';
import { ACCOUNT, HANDLE, JOURNAL, REALM, REQ, slot, storedEntries, storedKeys, users, world, type World } from './env';

let w: World | null = null;
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { w?.dispose(); w = null; resetApproversForTests(); });

const count = (names: string[]) => w!.agent.log.filter((x) => names.includes(x[0])).length;
const flush = (n = 900) => w!.flush(n);
const lastUser = (e: AskEngine) => users(e.getSnapshot(), C).at(-1);
const allUsers = (e: AskEngine) => users(e.getSnapshot(), C);
const recs = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL)!)?.a?.[ACCOUNT] ?? {}; } catch { return {}; } };
const recordIds = (): string[] => Object.keys(recs());
const recAt = (sid: string): any => recs()[`${HANDLE}|${REALM}|${sid}`];
const turnEntries = () => storedEntries(w!.fs).filter((e) => e.kind === 'turn');
const sidOf = (k1: string) => (w!.agent as any).createdByKey.get(k1) as string;
async function checkRow(e: AskEngine, uid: string): Promise<void> { e.check(uid); await flush(600); }
/** THE CUT: a handed-off first message is never sent by the page. The row is Not sent (handedOff) with its text, for the composer;
 *  the person presses Send (here: Send again on the row, which is what the composer's Send of that text does: a fresh key, a supersede). */
function expectHandedOff(e: AskEngine): C.UserMsg {
  const u = lastUser(e)!;
  expect(u, 'handed off: back to the composer, never sent by the page').toMatchObject({ state: 'notSent', reason: 'ask.handedOff', text: 'Build me a dashboard' });
  expect(e.restorable()).toContain(u.id);
  return u;
}
async function personSends(e: AskEngine, ms = 1500): Promise<void> { const u = expectHandedOff(e); e.resend(u.id); await flush(ms); }

/** A tab whose create answer was lost: A holds the text of the first message, the record names create:<k1>, the create entry is stored. */
async function setup(o: { allocated?: boolean } = {}) {
  w = world({ createLost: true });
  const a = await w.dock();
  a.send('Build me a dashboard');
  await flush(300);
  const k1 = a.record!.k1;
  const sid = sidOf(k1);
  if (o.allocated) { w.agent.allocate(k1, false); w.agent.setDormant(sid, true); }
  return { a, k1, sid };
}
/** Reload: a second tab's dock, whose first-message row has no text. */
async function reload(): Promise<AskEngine> { return w!.dockB(); }
/** Another holder of a named Web Lock until the returned function is called. */
async function holdName(name: string): Promise<() => void> {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let granted!: () => void;
  const got = new Promise<void>((r) => { granted = r; });
  void (globalThis.navigator as any).locks.request(name, () => { granted(); return gate; });
  await got;
  return release;
}
/** The first call of an AgentIO method is answered only when released (the call itself is made at once). */
function holdFirst(method: string) {
  const real = (w!.agent as any)[method].bind(w!.agent);
  let release: () => void = () => {};
  let n = 0;
  (w!.agent as any)[method] = (...a: unknown[]) => {
    const p = real(...a);
    if (n++ > 0) return p;
    return new Promise((res, rej) => { release = () => { p.then(res, rej); }; });
  };
  return { release: () => release(), calls: () => n };
}
/** The next call of an AgentIO method is refused. */
function refuseOnce(method: string, e: unknown = { status: 503, code: 'service_unavailable' }) {
  const real = (w!.agent as any)[method].bind(w!.agent);
  let left = 1;
  (w!.agent as any)[method] = (...a: unknown[]) => { if (left-- > 0) { (w!.agent as any).log.push([method, a]); return Promise.reject(e); } return real(...a); };
}
/** Plants a record row (what an earlier life or another tab stored), from the raw bytes. */
function seedRecord(id: string, row: any | null): void {
  const doc = JSON.parse(w!.fs.peek(JOURNAL)!);
  if (row === null) delete doc.a[ACCOUNT][id]; else doc.a[ACCOUNT][id] = row;
  w!.fs.seed(JOURNAL, JSON.stringify(doc));
}
/** The entry of `k` removed from the raw bytes (the person dismissed it in another tab). */
function removeEntryRaw(k: string): void {
  const req = JSON.parse(w!.fs.peek(REQ)!);
  const m = req.a[ACCOUNT];
  for (const name of Object.keys(m)) if (m[name] && m[name].k === k) delete m[name];
  w!.fs.seed(REQ, JSON.stringify(req));
}
const stubCreateRead = (body: unknown | (() => Promise<unknown>)) => { (w!.agent as any).createKeyGet = (key: string, realm: string) => { (w!.agent as any).log.push(['createKeyGet', [key, realm]]); return typeof body === 'function' ? (body as () => Promise<unknown>)() : Promise.resolve(body); }; };

// =============================================================================================================================
describe('T1/T2 R2 (create not handed off): the records refuse', () => {
  it('T1: the reply settles while the records refuse: 0 turns, create:<k1> stays, createSaving; writes back + heal hands it back, the person sends once', async () => {
    w = world();
    const a = await w.dock();
    const hold = holdFirst('create');
    a.send('Build me a dashboard');
    await flush(300);
    const k1 = a.record!.k1;
    w.fs.blockWrites(JOURNAL);
    hold.release();
    await flush(900);
    expect(count(['turn']), 'no first message while the record names create:<k1>').toBe(0);
    expect(recordIds()).toEqual([`${HANDLE}|${REALM}|create:${k1}`]);
    expect(lastUser(a)).toMatchObject({ state: 'unknown', reason: 'ask.createSaving', text: 'Build me a dashboard' });
    w.fs.clearFaults();
    a.heal();
    await flush(900);
    expect(count(['turn']), 'heal hands the message back, it sends nothing').toBe(0);
    expect(recordIds()).toEqual([`${HANDLE}|${REALM}|${sidOf(k1)}`]);
    await personSends(a);
    expect(count(['turn'])).toBe(1);
  });
  for (const order of ['entry removed before the reply', 'entry removed after the reply'] as const) {
    it(`T2: ${order}, the records refuse: 0 turns; writes back + heal hands it back, the person sends once, the record is at the session`, async () => {
      w = world();
      const a = await w.dock();
      const hold = holdFirst('create');
      a.send('Build me a dashboard');
      await flush(300);
      const k1 = a.record!.k1;
      w.fs.blockWrites(JOURNAL);
      if (order === 'entry removed before the reply') w.jB.dismiss(HANDLE, k1, dismissal());
      hold.release();
      await flush(900);
      if (order === 'entry removed after the reply') { w.jB.dismiss(HANDLE, k1, dismissal()); await flush(100); }
      expect(count(['turn'])).toBe(0);
      expect(lastUser(a)).toMatchObject({ state: 'unknown', reason: 'ask.createSaving' });
      w.fs.clearFaults();
      a.heal(); a.wake();
      await flush(900);
      expect(count(['turn'])).toBe(0);
      expect(recordIds()).toEqual([`${HANDLE}|${REALM}|${sidOf(k1)}`]);
      await personSends(a);
      expect(count(['turn'])).toBe(1);
    });
  }
});

describe('T3 a retype in another tab takes the first message over', () => {
  it('B retypes kB at R4; A hears it: 1 turn; A is Not sent (takenElsewhere), its text kept', async () => {
    const { a, k1, sid } = await setup();
    w!.listen(a);
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);                       // B: the record moves to the session; B holds no text: firstElsewhere
    expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.firstElsewhere' });
    expect(b.record?.s).toBe(sid);
    expect(count(['turn'])).toBe(0);
    b.send('B wants this instead');
    await flush(1500);
    expect(count(['turn']), 'exactly one turn: B\'s').toBe(1);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
    a.heal(); a.wake();
    await flush(900);
    expect(lastUser(a)).toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere', text: 'Build me a dashboard' });
    expect(count(['turn'])).toBe(1);
    expect(recAt(sid)).toMatchObject({ k1 });
    expect(recAt(sid).dk, 'A\'s key is fenced').toHaveLength(1);
  });
});

describe('T4 a dormant session is attached before any turn', () => {
  it('attach 503, a second engine opens the chat and the person retypes: attach first, 0 turns to the dormant session, then 1 turn', async () => {
    const { a, sid } = await setup({ allocated: true });
    await checkRow(a, lastUser(a)!.id);
    expectHandedOff(a);
    refuseOnce('attach');
    a.resend(lastUser(a)!.id);
    await flush(1500);
    expect(lastUser(a)).toMatchObject({ state: 'notSent', reason: 'ask.attachFailed' });
    expect(count(['turn'])).toBe(0);
    const b = w!.pinned(sid, 'B');                              // engine 2: the same chat, opened from the record
    b.open(); await flush(900);
    b.send('Build me a dashboard');
    await flush(1500);
    const log = w!.agent.log.map((x) => x[0]);
    const firstTurn = log.indexOf('turn');
    const attaches = log.map((n, i) => (n === 'attach' ? i : -1)).filter((i) => i >= 0);
    expect(attaches.length, 'the second attach was made').toBeGreaterThanOrEqual(2);
    expect(attaches.some((i) => i > attaches[0]! && i < firstTurn), 'a successful attach before the turn').toBe(true);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
  });
});

describe('T5/T27 the session is gone (R3): the Check settles it, the records may refuse first', () => {
  it('T5: started with no session, records refuse, Check; restore, heal + wake: R3, notSent createUnopenable with the text kept, 0 turns', async () => {
    const { a, k1 } = await setup();
    stubCreateRead({ state: 'started' });
    w!.fs.blockWrites(JOURNAL);
    await checkRow(a, lastUser(a)!.id);
    expect(lastUser(a)).toMatchObject({ state: 'unknown', reason: 'ask.createSaving' });
    w!.fs.clearFaults();
    a.heal(); a.wake();
    await flush(900);
    expect(lastUser(a)).toMatchObject({ state: 'notSent', reason: 'ask.createUnopenable', text: 'Build me a dashboard' });
    expect(count(['turn'])).toBe(0);
    expect(recs()[`${HANDLE}|${REALM}|create:${k1}`]).toMatchObject({ ph: 'gone' });
  });
  it('T27: the records refuse during the first Check, the page reloads, the records are back: the next Check marks the chat unavailable (R3)', async () => {
    const { a, k1 } = await setup();
    stubCreateRead({ state: 'started' });
    w!.fs.blockWrites(JOURNAL);
    await checkRow(a, lastUser(a)!.id);
    expect(recs()[`${HANDLE}|${REALM}|create:${k1}`]).toMatchObject({ ph: 'unknown' });
    w!.fs.clearFaults();
    const b = await reload();
    expect(lastUser(b)).toMatchObject({ state: 'unknown', text: '' });
    await checkRow(b, lastUser(b)!.id);
    expect(lastUser(b)).toMatchObject({ state: 'refused', reason: 'ask.createUnopenable' });
    expect(recs()[`${HANDLE}|${REALM}|create:${k1}`]).toMatchObject({ ph: 'gone' });
    expect(count(['turn'])).toBe(0);
  });
});

describe('T6/T6b a textless tab never calls the first message Not sent', () => {
  it('T6: B is firstElsewhere while the record is owed, otherTab while the turn is in flight, then adopts the turn; never notSent', async () => {
    const { a, sid } = await setup();
    w!.listen(a);
    const b = await reload();
    const seen: string[] = [];
    b.subscribe(() => { const u = lastUser(b); if (u) seen.push(`${u.state}/${u.reason}`); });
    await checkRow(b, lastUser(b)!.id);
    expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.firstElsewhere' });
    await checkRow(a, lastUser(a)!.id);                         // A: handed back; the person sends
    await personSends(a);
    b.heal(); b.wake();
    await flush(900);
    expect(count(['turn'])).toBe(1);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
    b.heal(); b.wake();
    await flush(900);
    expect(seen.filter((s) => s.startsWith('notSent')), 'B was never Not sent').toEqual([]);
    expect(C.current(b.getSnapshot().conv)?.s.turnId, 'B follows the turn').toBeTruthy();
    expect(count(['turn'])).toBe(1);
  });
  it('T6b: overlapping Checks and a late reply to B: 1 turn, B\'s reason pinned', async () => {
    const { a, sid } = await setup();
    const b = await reload();
    const reads: Array<() => void> = [];
    const real = (w!.agent as any).createKeyGet.bind(w!.agent);
    (w!.agent as any).createKeyGet = (key: string, realm: string) => { const p = real(key, realm); return new Promise((res, rej) => { reads.push(() => p.then(res, rej)); }); };
    const seen: string[] = [];
    b.subscribe(() => { const u = lastUser(b); if (u) seen.push(`${u.state}/${u.reason}`); });
    a.check(lastUser(a)!.id);
    b.check(lastUser(b)!.id);
    await flush(100);
    expect(reads.length).toBe(2);
    reads[0]!(); await flush(300);
    reads[1]!(); await flush(900);
    expect(count(['turn']), 'no Check sends').toBe(0);
    await personSends(a);
    b.heal(); b.wake(); await flush(900);
    expect(count(['turn'])).toBe(1);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
    expect(seen.filter((s) => s.startsWith('notSent'))).toEqual([]);
    expect(lastUser(b)?.reason === 'ask.firstElsewhere' || lastUser(b)?.reason === 'ask.otherTab' || C.current(b.getSnapshot().conv) !== undefined).toBe(true);
  });
});

describe('T7 R1: the record is gone', () => {
  it('entry present + pending first-turn entry, record absent: nothing is sent; unknown chatMissing (never notSent, never removed); Check reads the turn by key', async () => {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(600);
    const sid = a.record!.s!;
    expect(turnEntries()).toHaveLength(1);
    expect(count(['turn'])).toBe(1);
    seedRecord(`${HANDLE}|${REALM}|${sid}`, null);
    expect(recordIds()).toEqual([]);
    a.heal(); a.wake();
    await flush(900);
    expect(count(['turn']), 'nothing sent').toBe(1);
    expect(lastUser(a)).toMatchObject({ state: 'unknown', reason: 'ask.chatMissing', text: 'Build me a dashboard' });
    const before = count(['turnByKey']);
    await checkRow(a, lastUser(a)!.id);
    expect(count(['turnByKey']), 'the turn entry is read by its key').toBe(before + 1);
    expect(count(['turn'])).toBe(1);
  });
});

describe('T8 the move is kept, the entry removal refused', () => {
  it('the record is the authority: the person\'s Send goes once; heal sends nothing more', async () => {
    const { a, k1, sid } = await setup();
    const I = internalsOf(w!.j);
    const real = I.entries.removeNow.bind(I.entries);
    let refused = 0;
    (I.entries as any).removeNow = (p: any) => (refused++ === 0 ? false : real(p));
    await checkRow(a, lastUser(a)!.id);
    await flush(600);
    expect(refused).toBeGreaterThan(0);
    expect(count(['turn'])).toBe(0);
    await personSends(a);
    expect(count(['turn'])).toBe(1);
    expect(recAt(sid)).toMatchObject({ k1 });
    a.heal(); a.wake();
    await flush(900);
    expect(count(['turn'])).toBe(1);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
  });
});

describe('T8b entry present, record at the session (another tab moved it)', () => {
  it('heal hands the text back although the entry is still there; the person\'s Send goes once', async () => {
    const { a, sid } = await setup();
    const b = await reload();
    (internalsOf(w!.jB).entries as any).removeNow = () => false;     // B moves the record but its entry removal is refused
    await checkRow(b, lastUser(b)!.id);
    expect(recAt(sid), 'the record is at the session').toMatchObject({ t: null });
    expect(storedEntries(w!.fs).some((e) => e.kind === 'create'), 'the create entry is still stored').toBe(true);
    expect(count(['turn'])).toBe(0);
    a.heal();
    await flush(900);
    expect(count(['turn']), 'heal hands it back').toBe(0);
    await personSends(a);
    expect(count(['turn'])).toBe(1);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
  });
});

describe('T9/T9b two pages race on the first message', () => {
  for (const first of ['A', 'B'] as const) {
    it(`T9: ${first} wins; exactly one turn; the loser stops with its text kept and makes no ordinary turn call`, async () => {
      const { a, sid } = await setup();
      const b = await reload();
      await checkRow(b, lastUser(b)!.id);                       // R4 for B (textless)
      await checkRow(a, lastUser(a)!.id);                       // A: handed back to its composer
      expectHandedOff(a);
      const hold = holdFirst('attach');                         // the first attach (the winner's) waits
      if (first === 'A') {
        // A is first in line: B waits at its attach, A finishes, B is released.
        b.send('B retypes');
        await flush(200);
        a.resend(lastUser(a)!.id);
        await flush(1500);
        hold.release();
        await flush(1500);
        expect(lastUser(b)).toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere', text: 'B retypes' });
      } else {
        a.resend(lastUser(a)!.id);
        await flush(200);                                       // A waits at its attach
        b.send('B retypes');
        await flush(1500);
        hold.release();
        await flush(1500);
        expect(lastUser(a)).toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere', text: 'Build me a dashboard' });
      }
      expect(count(['turn']), 'exactly one turn').toBe(1);
      expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
      expect(count(['command']), 'the loser never sends an ordinary follow-up').toBe(0);
    });
  }
  it('T9b: B retypes at R4 and is held in the approval preparation before its first route call; A sends the original and reaches R7: 1 turn, B Not sent, no ordinary dispatch', async () => {
    const { a, sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    const hold = holdFirst('approval');                         // B's readAuto waits
    b.send('B retypes');
    await flush(300);
    expect(hold.calls()).toBeGreaterThan(0);
    await checkRow(a, lastUser(a)!.id);
    await personSends(a);                                       // A's person sends the original and reaches R7 meanwhile
    expect(recAt(sid).t, 'the turn is known').toBeTruthy();
    hold.release();
    await flush(1500);
    expect(count(['turn']), 'B sent nothing').toBe(1);
    expect(count(['command'])).toBe(0);
    expect(allUsers(b).find((u: any) => u.text === 'B retypes')).toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere' });
  });
});

describe('T9c two gates queued on the chat lock', () => {
  it('B and A (both a person\'s Send) wait for the same lock; one lock holder at a time: exactly one turn', async () => {
    const { a, k1, sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    await checkRow(a, lastUser(a)!.id);
    expectHandedOff(a);
    const release = await holdName(chatLockName(ACCOUNT, HANDLE, REALM, k1));
    b.send('B retypes');
    await flush(200);
    a.resend(lastUser(a)!.id);
    await flush(200);
    expect(count(['turn'])).toBe(0);
    release();
    await flush(2500);
    expect(count(['turn']), 'exactly one turn').toBe(1);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
  });
});

describe('T10/T11 dismissing and superseding go through the record', () => {
  it('T10 ok: B dismisses the firstElsewhere row (claim kept): A is Not sent, 0 turns', async () => {
    const { a } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    b.dismiss(lastUser(b)!.id);
    await flush(900);
    expect(allUsers(b).filter((u: any) => u.state === 'unknown'), 'B\'s row went').toHaveLength(0);
    await checkRow(a, lastUser(a)!.id);
    expect(count(['turn'])).toBe(0);
    expect(lastUser(a)).toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere', text: 'Build me a dashboard' });
  });
  it('T10 refused: the claim is not kept: B\'s row stays (notRemembered), A\'s person sends once', async () => {
    const { a, sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    w!.fs.blockWrites(JOURNAL);
    b.dismiss(lastUser(b)!.id);
    await flush(900);
    expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.notRemembered' });
    w!.fs.clearFaults();
    await checkRow(a, lastUser(a)!.id);
    await personSends(a);
    expect(count(['turn'])).toBe(1);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
  });
  it('T11: a retype whose claim the store refuses sends nothing: notSent notRemembered, text kept', async () => {
    const { sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    w!.fs.blockWrites(JOURNAL);
    b.send('B retypes');
    await flush(1500);
    expect(count(['turn'])).toBe(0);
    expect(allUsers(b).find((u: any) => u.text === 'B retypes')).toMatchObject({ state: 'notSent', reason: 'ask.notRemembered' });
    expect(recAt(sid).dk ?? []).toEqual([]);
  });
});

describe('T12 attach refused, then Send again', () => {
  it('a fresh key, an attach before the turn, one turn; a heal and a Check in between send nothing', async () => {
    const { a, sid } = await setup({ allocated: true });
    await checkRow(a, lastUser(a)!.id);
    expectHandedOff(a);
    refuseOnce('attach');
    a.resend(lastUser(a)!.id);
    await flush(1500);
    const row = lastUser(a)!;
    expect(row).toMatchObject({ state: 'notSent', reason: 'ask.attachFailed', text: 'Build me a dashboard' });
    const oldKey = row.key;
    a.heal(); a.wake();
    await checkRow(a, row.id);
    await flush(600);
    expect(count(['turn']), 'heal and Check send nothing').toBe(0);
    a.resend(row.id);
    await flush(1500);
    expect(count(['turn'])).toBe(1);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
    expect(count(['attach']), 'attached again before the turn').toBeGreaterThanOrEqual(2);
    expect(allUsers(a).map((u: any) => u.key), 'a fresh key').not.toContain(oldKey);
  });
});

describe('T13 a fenced first turn is fenced in the record', () => {
  it('the create answered, the first turn never arrived, the retire proves it while the records refuse: no resurrection; after a sweep the key is in dk (R6)', async () => {
    w = world({});
    (w.agent as any).turn = () => Promise.reject({ status: 0, pending: true, kind: 'pending' });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(600);
    const sid = a.record!.s!;
    const k2 = a.record!.k2;
    const b = w.pinned(sid, 'B');
    b.open(); await flush(900);
    const row = users(b.getSnapshot(), C).find((u: any) => u.state === 'unknown');
    expect(row).toBeTruthy();
    w.fs.blockWrites(JOURNAL);
    b.check(row.id);
    await flush(900);
    expect(lastUser(b)).toMatchObject({ state: 'notSent' });
    expect(turnEntries(), 'the entry stays while the fence is not kept').toHaveLength(1);
    w.fs.clearFaults();
    b.heal();
    await flush(900);
    expect(turnEntries(), 'the sweep kept the fence and removed the entry').toHaveLength(0);
    expect(recAt(sid).dk).toContain(k2);
    expect(recAt(sid).na, 'the retire\'s proof is non-admission evidence').toContain(k2);
    const c2 = w.pinned(sid, 'B');
    c2.open(); await flush(900);
    expect(users(c2.getSnapshot(), C).filter((u: any) => u.state === 'unknown'), 'nothing to recover').toHaveLength(0);
  });
});

describe('T14 checkCreate when the create entry is gone', () => {
  type Case = { name: string; setup: () => void; turns: number; row: Record<string, unknown>; attach?: number };
  const cases: Case[] = [
    { name: 'started + session', setup: () => {}, turns: 1, row: { state: 'notSent', reason: 'ask.handedOff' } },
    { name: 'allocated + session (dormant)', setup: () => { const k = Object.keys(recs())[0]!.split('create:')[1]!; w!.agent.allocate(k, false); w!.agent.setDormant(sidOf(k), true); }, turns: 1, row: { state: 'notSent', reason: 'ask.handedOff' } },
    { name: 'started with no session', setup: () => stubCreateRead({ state: 'started' }), turns: 0, row: { state: 'notSent', reason: 'ask.createUnopenable' } },
    { name: 'retired, admitted false', setup: () => stubCreateRead({ state: 'retired', admitted: 'false' }), turns: 0, row: { state: 'notSent', reason: 'ask.createNotMade' } },
    { name: 'retired, admitted unknown', setup: () => stubCreateRead({ state: 'retired', admitted: 'unknown' }), turns: 0, row: { state: 'unknown' } },
    { name: 'allocated in flight', setup: () => stubCreateRead({ state: 'allocated', in_flight: true }), turns: 0, row: { state: 'unknown', reason: 'ask.createStarting' } },
    { name: 'miss (404)', setup: () => stubCreateRead(() => Promise.reject({ status: 404, code: 'create_not_found' })), turns: 0, row: { state: 'unknown' } },
    { name: '503', setup: () => stubCreateRead(() => Promise.reject({ status: 503, code: 'service_unavailable' })), turns: 0, row: { state: 'unknown' } },
  ];
  for (const c of cases) {
    it(`${c.name}: ${c.turns ? 'handed back, the person\'s Send goes once' : 'nothing is sent'}; never a retire`, async () => {
      const { a, k1 } = await setup();
      removeEntryRaw(k1);
      expect(storedKeys(w!.fs)).not.toContain(k1);
      c.setup();
      await checkRow(a, lastUser(a)!.id);
      await flush(900);
      expect(count(['turn']), 'a Check never sends').toBe(0);
      expect(count(['createKeyRetire']), 'a read, never a retire').toBe(0);
      expect(count(['createKeyGet']), 'one create-key read').toBe(1);
      expect(lastUser(a)).toMatchObject(c.row);
      if (c.turns) { await personSends(a); expect(count(['turn'])).toBe(1); expect(w!.agent.ledgerRows(sidOf(k1), 'turn')).toBe(1); }
    });
  }
});

describe('T15 the proof of a live session is this call\'s own reply', () => {
  it('an own started reply sends with 0 attach calls', async () => {
    w = world();
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(900);
    expect(count(['turn'])).toBe(1);
    expect(count(['attach']), 'the own reply proves the session').toBe(0);
  });
  it('the same row after a Check: handed back; the person\'s Send (no proof) makes 1 attach', async () => {
    const s = await setup();
    await checkRow(s.a, lastUser(s.a)!.id);
    expect(count(['attach']), 'the Check attaches nothing').toBe(0);
    await personSends(s.a);
    expect(count(['turn'])).toBe(1);
    expect(count(['attach']), 'no proof of this call: attached once').toBe(1);
  });
});

describe('T16 settle.ts: an absent entry and a settled create without a realm', () => {
  it('is none; with the realm it hands the record off', async () => {
    const { k1, sid } = await setup();
    removeEntryRaw(k1);
    const I = internalsOf(w!.j);
    const v = classifyReply({ acct: ACCOUNT, h: HANDLE, k: k1, route: 'create' } as any, { ok: true, b: { session_id: sid } });
    expect(v.t).toBe('settled');
    expect(await I.settler.settle(v)).toBe('none');
    expect(recordIds()).toEqual([`${HANDLE}|${REALM}|create:${k1}`]);
    expect(await I.settler.settle(v, REALM)).toBe('done');
    expect(recordIds()).toEqual([`${HANDLE}|${REALM}|${sid}`]);
  });
});

describe('T17 the chat lock fails closed (no exclusion, no first message)', () => {
  for (const mode of ['throws', 'rejects'] as const) {
    it(`request ${mode} for the chat lock: 0 turns, Not sent lockUnavailable, text kept, Send again`, async () => {
      const { a } = await setup();
      await checkRow(a, lastUser(a)!.id);
      expectHandedOff(a);
      const nav = globalThis.navigator as any;
      const real = nav.locks.request;
      nav.locks.request = (name: string, ...rest: unknown[]) => {
        if (name.startsWith('hub-ai-first:')) { if (mode === 'throws') throw new Error('locks off'); return Promise.reject(new Error('locks off')); }
        return real(name, ...rest);
      };
      a.resend(lastUser(a)!.id);
      await flush(900);
      expect(count(['turn'])).toBe(0);
      expect(lastUser(a)).toMatchObject({ state: 'notSent', reason: 'ask.lockUnavailable', text: 'Build me a dashboard' });
      nav.locks.request = real;
      a.resend(lastUser(a)!.id);
      await flush(1500);
      expect(count(['turn']), 'after the lock works again').toBe(1);
    });
  }
  it('without navigator.locks the hold is refused (never an immediate no-op hold)', async () => {
    w = world();
    const nav = globalThis.navigator as any;
    Object.defineProperty(nav, 'locks', { value: undefined, configurable: true });
    try {
      expect(await holdChatLock(ACCOUNT, HANDLE, REALM, 'k')).toEqual({ ok: false, why: 'refused' });
    } finally { delete nav.locks; }
  });
});

describe('T18 evidence before removal', () => {
  it('T18: B waits for its locked read while A\'s first turn settles with the records refusing: the entry is kept, B reads R5 and stops, 1 turn; after the records return, t is set and the entry gone', async () => {
    const { a, sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    await checkRow(a, lastUser(a)!.id);
    expectHandedOff(a);
    const hold = holdFirst('attach');                           // B's attach (its first call) waits
    b.send('B retypes');
    await flush(300);
    const turn = holdFirst('turn');                             // A's turn is admitted; its reply waits
    a.resend(lastUser(a)!.id);                                  // A's person sends; A's own claim is kept before the records refuse
    await flush(1500);
    expect(turn.calls()).toBe(1);
    w!.fs.blockWrites(JOURNAL);
    turn.release();
    await flush(1500);
    expect(count(['turn'])).toBe(1);
    expect(turnEntries(), 'the entry stays while t is not kept').toHaveLength(1);
    hold.release();
    await flush(1500);
    expect(count(['turn']), 'B stopped at R5').toBe(1);
    expect(allUsers(b).find((u: any) => u.text === 'B retypes')).toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere' });
    w!.fs.clearFaults();
    a.heal(); a.wake();
    await flush(900);
    expect(recAt(sid).t, 't is kept').toBeTruthy();
    expect(turnEntries(), 'the entry is removed').toHaveLength(0);
    expect(count(['turn'])).toBe(1);
  });
  it('T18b: a stale page re-putting its record with t null never moves t back', async () => {
    const { a, sid } = await setup();
    await checkRow(a, lastUser(a)!.id);
    await personSends(a);
    const t = recAt(sid).t;
    expect(t).toBeTruthy();
    const stale = { ...(a.record as any), t: null, ph: 'sending' };
    expect(await w!.j.put(HANDLE, stale)).toBe('ok');
    expect(recAt(sid).t).toBe(t);
  });
  it('T18c: A\'s admitted first turn settles with the entry scan unreadable and the records refusing; the entries come back, a sweep: the entry stays (R5) and B stops; after the records return: t set, then the entry gone', async () => {
    const { a, sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    await checkRow(a, lastUser(a)!.id);
    const hold = holdFirst('turn');                             // A's turn is admitted (its entry written), its reply held
    a.resend(expectHandedOff(a).id);
    await flush(1500);
    expect(hold.calls(), 'admitted and posted').toBe(1);
    expect(turnEntries(), 'the admitted turn\'s entry').toHaveLength(1);
    w!.fs.blockReads(REQ);
    w!.fs.blockWrites(JOURNAL);
    hold.release();                                             // the reply settles: the scan is unreadable -> the settlement is owed
    await flush(900);
    w!.fs.clearFaults();
    w!.fs.blockWrites(JOURNAL);                                 // the entries come back, the records still refuse
    await w!.j.sweep();
    await flush(300);
    expect(turnEntries(), 'never removed while t is not kept').toHaveLength(1);
    expect(recAt(sid).t, 't not kept').toBeNull();
    b.send('B retypes');
    await flush(1500);
    expect(count(['turn']), 'B stops at R5').toBe(1);
    w!.fs.clearFaults();
    await w!.j.sweep();
    await flush(300);
    expect(recAt(sid).t, 't is kept').toBeTruthy();
    expect(turnEntries(), 'then the entry goes').toHaveLength(0);
  });
  it('T18d: B supersedes and sends, t is kept, the entry removed, the record evicted; A\'s heal and a stale save re-put nothing', async () => {
    const { a, k1, sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    b.send('B retypes');
    await flush(1500);
    expect(count(['turn'])).toBe(1);
    expect(recAt(sid).t).toBeTruthy();
    expect(turnEntries()).toHaveLength(0);
    // fill the record store with other chats until B's is evicted
    for (let i = 0; i < JOURNAL_RECS + 4; i++) {
      expect(await w!.j.put(HANDLE, { p: slot.project, c: slot.computer, r: REALM, s: `sess-x${i}`, t: `turn-${i}`, k1: 'hx-' + i.toString(16).padStart(32, '0'), k2: 'hx-' + (i + 4096).toString(16).padStart(32, '0'), rc: 'custom', n: null, at: 2_000_000 + i, i: null, q: 0, ph: 'completed', l: 'en' } as any)).toBe('ok');
    }
    expect(recAt(sid), 'evicted').toBeUndefined();
    // A's stale whole record (no known turn) is never created again from memory (X2)
    const stale = { ...(a.record as any), s: sid, t: null, ph: 'sending' };
    expect(await w!.j.put(HANDLE, stale), 'a stale at-session record with no turn is refused').toBe('lost');
    expect(recAt(sid), 'not rebuilt by the stale put').toBeUndefined();
    a.heal(); a.wake();
    (a as any).save({ front: true });
    await flush(900);
    expect(recAt(sid), 'not rebuilt from memory').toBeUndefined();
    expect(lastUser(a)).toMatchObject({ state: 'unknown' });
    expect(['ask.chatMissing', 'ask.takenElsewhere', 'ask.otherTab']).toContain(lastUser(a)!.reason);
    expect(count(['turn'])).toBe(1);
    void k1;
  });
});

describe('T19 a missing or unreadable record never lets a message go', () => {
  it('the records unreadable: the retype shows unknown checkFailed; 0 turn calls', async () => {
    const { sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    expect(b.record?.s).toBe(sid);
    w!.fs.blockReads(JOURNAL);
    b.send('retype');
    await flush(1500);
    expect(count(['turn'])).toBe(0);
    expect(allUsers(b).find((u: any) => u.text === 'retype')).toMatchObject({ state: 'unknown', reason: 'ask.checkFailed' });
  });
  it('the record disappears: the retype shows unknown chatMissing; 0 turn calls', async () => {
    const { sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);                         // B has the session adopted
    expect(b.record?.s).toBe(sid);
    seedRecord(`${HANDLE}|${REALM}|${sid}`, null);
    b.send('first retype');
    await flush(1500);
    expect(count(['turn'])).toBe(0);
    expect(allUsers(b).find((u: any) => u.text === 'first retype')).toMatchObject({ state: 'unknown', reason: 'ask.chatMissing' });
  });
});

describe('T20/T21 the real lost-reply path; Approve automatically', () => {
  it('T20 (cell A): a record in phase unknown (a real lost reply) is R4: Check hands it back, the person sends once', async () => {
    const { a, k1, sid } = await setup();
    expect(recs()[`${HANDLE}|${REALM}|create:${k1}`]).toMatchObject({ ph: 'unknown' });
    await checkRow(a, lastUser(a)!.id);
    expect(count(['turn'])).toBe(0);
    await personSends(a);
    expect(count(['turn'])).toBe(1);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
    expect(recordIds()).toEqual([`${HANDLE}|${REALM}|${sid}`]);
  });
  it('T20 (cell D): the entry gone and the record already at the session: heal + wake hand it back, the person sends once', async () => {
    const { a, k1, sid } = await setup();
    const row = recs()[`${HANDLE}|${REALM}|create:${k1}`];
    seedRecord(`${HANDLE}|${REALM}|create:${k1}`, null);
    seedRecord(`${HANDLE}|${REALM}|${sid}`, { ...row, s: sid, ph: 'unknown' });
    removeEntryRaw(k1);
    a.heal(); a.wake();
    await flush(900);
    expect(count(['turn']), 'adopted, nothing sent').toBe(0);
    await personSends(a);
    expect(count(['turn'])).toBe(1);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
  });
  it('T21: a normal create with Approve automatically arms the adopted session', async () => {
    w = world();
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(900);
    const sid = a.record!.s!;
    const yolo = w.agent.log.filter((x) => x[0] === 'yolo');
    expect(yolo.length, 'the approval mode was put on the session').toBeGreaterThan(0);
    expect(yolo.every((x) => x[1][0] === sid)).toBe(true);
    expect(count(['turn'])).toBe(1);
  });
  it('T21b: a textless R4 retype routes to a supersede, not a new create', async () => {
    const s = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    b.send('B retypes');
    await flush(1500);
    expect(count(['create']), 'no second create').toBe(1);
    expect(w!.agent.ledgerRows(s.sid, 'turn')).toBe(1);
  });
});

describe('T22 one lock for the record document', () => {
  it('a record write waits for hub-ai-recs, reads the document inside the lock, and so keeps what another tab wrote meanwhile', async () => {
    const { sid } = await setup();
    const R = recordsForTests(w!.j);
    const other = { ...recs()[`${HANDLE}|${REALM}|create:${Object.keys(recs())[0]!.split('create:')[1]}`] };
    void other;
    // chat Y: a record at a session with t null can only come from a move; plant one with a known turn instead
    const release = await holdName(recsLockName(ACCOUNT));
    const x = { p: slot.project, c: slot.computer, r: REALM, s: 'sess-x', t: 'turn-x', k1: 'hx-' + 'a'.repeat(32), k2: 'hx-' + 'b'.repeat(32), rc: 'custom', n: null, at: 9, i: null, q: 0, ph: 'completed', l: 'en' } as any;
    let done = false;
    const putting = w!.j.put(HANDLE, x).then((r) => { done = true; return r; });
    await flush(300);
    expect(done, 'the put waits for the document lock').toBe(false);
    // another tab commits meanwhile (raw bytes): chat Y knows its turn
    const doc = JSON.parse(w!.fs.peek(JOURNAL)!);
    doc.a[ACCOUNT][`${HANDLE}|${REALM}|sess-y`] = { h: HANDLE, ...x, s: 'sess-y', t: 'turn-y', k1: 'hx-' + 'c'.repeat(32), k2: 'hx-' + 'd'.repeat(32) };
    w!.fs.seed(JOURNAL, JSON.stringify(doc));
    release();
    expect(await putting).toBe('ok');
    expect(recAt('sess-y')?.t, 'the other tab\'s turn survives the write').toBe('turn-y');
    expect(recAt('sess-x')?.t).toBe('turn-x');
    void R; void sid;
  });
  it('a lock that cannot be had means the write is lost, never done without exclusion', async () => {
    const { a } = await setup();
    const nav = globalThis.navigator as any;
    const real = nav.locks.request;
    nav.locks.request = (name: string, ...rest: unknown[]) => (name.startsWith('hub-ai-recs:') ? Promise.reject(new Error('no')) : real(name, ...rest));
    expect(await w!.j.put(HANDLE, { ...(a.record as any), at: 77 })).toBe('lost');
    nav.locks.request = real;
  });
});

describe('T23 a refused or fenced first turn takes a fresh key', () => {
  it('T23: the first turn is refused definitely (rate_limited): Send again uses a new key, keeps the text, 1 admitted turn, no notMinted', async () => {
    w = world();
    const real = (w.agent as any).turn.bind(w.agent);
    let left = 1;
    (w.agent as any).turn = (...x: unknown[]) => { if (left-- > 0) { w!.agent.log.push(['turn', x]); return Promise.reject({ status: 429, code: 'rate_limited' }); } return real(...x); };
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(900);
    const row = lastUser(a)!;
    expect(row).toMatchObject({ state: 'notSent', text: 'Build me a dashboard' });
    const oldKey = row.key;
    const sid = a.record!.s!;
    expect(recAt(sid).dk, 'fenced in the record before the entry went').toContain(oldKey);
    expect(turnEntries()).toHaveLength(0);
    a.resend(row.id);
    await flush(1500);
    expect(w.agent.ledgerRows(sid, 'turn')).toBe(1);
    const now = allUsers(a).find((u: any) => u.id === row.id)!;
    expect(now.key).not.toBe(oldKey);
    expect(now.reason).not.toBe('ask.notRemembered');
  });
  it('T23b: the first turn\'s entry write fails: notSent notRemembered; Send again uses a fresh key and sends once', async () => {
    w = world();
    const a = await w.dock();
    (w.agent as any).turn = ((real) => (...x: unknown[]) => real(...x))((w.agent as any).turn.bind(w.agent));
    // the create goes (records and the create entry work); the REQ store then refuses the turn entry
    const realCreate = (w.agent as any).create.bind(w.agent);
    (w.agent as any).create = (...x: unknown[]) => realCreate(...x).then((r: unknown) => { w!.fs.blockWrites(REQ); return r; });
    a.send('Build me a dashboard');
    await flush(1200);
    const row = lastUser(a)!;
    expect(row).toMatchObject({ state: 'notSent', text: 'Build me a dashboard' });
    expect(count(['turn'])).toBe(0);
    w.fs.clearFaults();
    const oldKey = row.key;
    a.resend(row.id);
    await flush(1500);
    expect(count(['turn'])).toBe(1);
    expect(allUsers(a).find((u: any) => u.id === row.id)!.key).not.toBe(oldKey);
  });
  it('T23c: the fence is refused after notAdmitted: the entry stays, a supersede reads R5 and stops; after the records return and a sweep, R6', async () => {
    w = world();
    const real = (w.agent as any).turn.bind(w.agent);
    (w.agent as any).turn = (...x: unknown[]) => { w!.agent.log.push(['turn', x]); w!.fs.blockWrites(JOURNAL); return Promise.reject({ status: 429, code: 'rate_limited' }); };
    void real;
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(1200);
    const sid = a.record!.s!;
    expect(turnEntries(), 'the entry stays while the fence is not kept').toHaveLength(1);
    const b = w.pinned(sid, 'B');
    b.open(); await flush(900);
    b.send('B retypes');
    await flush(1500);
    expect(allUsers(b).find((u: any) => u.text === 'B retypes')).toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere' });
    w.fs.clearFaults();
    a.heal(); a.wake();
    await flush(900);
    expect(turnEntries()).toHaveLength(0);
    expect(recAt(sid).dk?.length).toBeGreaterThan(0);
  });
});

describe('T25 a textless row at R4 never reaches the network', () => {
  it('heal x2, wake, sweep and Check: 0 attach, 0 turn, reason firstElsewhere', async () => {
    const { sid } = await setup({ allocated: true });
    const b = await reload();
    const before = { attach: count(['attach']), turn: count(['turn']) };
    await checkRow(b, lastUser(b)!.id);
    const att = count(['attach']);
    b.heal(); await flush(300); b.heal(); b.wake(); await w!.j.sweep(); await flush(600);
    await checkRow(b, lastUser(b)!.id);
    expect(count(['attach']) - att, 'no attach').toBe(0);
    expect(count(['attach']) - before.attach).toBe(0);
    expect(count(['turn'])).toBe(before.turn);
    expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.firstElsewhere' });
    expect(recAt(sid)).toBeTruthy();
  });
});

describe('T26 an orphan R5 is resolved by the key (on open)', () => {
  it('A admits k2 and its page ends before the reply is settled; B reloads: opening reads the turn BY ITS KEY once and adopts it; heal + wake read nothing more', async () => {
    w = world();
    const hold = holdFirst('turn');
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(600);
    const sid = a.record!.s!;
    expect(hold.calls()).toBe(1);
    a.end();                                                    // the page ends with the reply unanswered: nothing settles the turn
    await flush(600);
    expect(turnEntries(), 'the turn entry is the evidence').toHaveLength(1);
    expect(recAt(sid).t, 'not kept').toBeNull();
    const before = count(['turnByKey']);
    const b = w.pinned(sid, 'B');
    b.open(); await flush(1500);
    expect(count(['turnByKey']) - before, 'opening peeked the key, then the journal settled it by the same key (the turn list names no key and is not asked)').toBe(2);
    expect(recAt(sid).t, 'R7: the turn the key admitted').toBeTruthy();
    expect(turnEntries(), 'the journal settled the entry').toHaveLength(0);
    expect(users(b.getSnapshot(), C).filter((u: any) => u.state === 'unknown')).toEqual([]);
    const reads = count(['turnByKey']);
    b.heal(); b.wake();
    await flush(900);
    expect(count(['turnByKey']) - reads, 'heal and wake read nothing by key').toBe(0);
    expect(count(['turn'])).toBe(1);
  });
});

describe('T26b an orphan R5 under a replacement key', () => {
  it('B supersedes with kB and ends before its reply settles; A\'s Check reads kB once, keeps t, removes the entry, and A\'s original is Not sent (its own key fenced), never Sent', async () => {
    const { a, k1, sid } = await setup();
    void k1;
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    const hold = holdFirst('turn');
    b.send('B retypes');
    await flush(1500);
    expect(hold.calls(), 'B\'s turn admitted').toBe(1);
    const kB = allUsers(b).find((u: any) => u.text === 'B retypes')!.key;
    b.end();                                                    // B ends with its reply unanswered
    await flush(600);
    expect(turnEntries().map((e) => e.k)).toEqual([kB]);
    a.heal(); await flush(900);
    expect(lastUser(a)).toMatchObject({ state: 'unknown', reason: 'ask.otherTab', text: 'Build me a dashboard' });
    const reads = w!.agent.log.filter((x) => x[0] === 'turnByKey');
    await checkRow(a, lastUser(a)!.id);
    await flush(600);
    const now = w!.agent.log.filter((x) => x[0] === 'turnByKey').slice(reads.length);
    expect(now.length, 'one read by key').toBe(1);
    expect(JSON.stringify(now[0]![1]), 'of B\'s key').toContain(kB);
    expect(recAt(sid).t, 't kept').toBeTruthy();
    expect(turnEntries(), 'the settled entry is removed').toHaveLength(0);
    const orig = allUsers(a).find((u: any) => u.text === 'Build me a dashboard')!;
    expect(orig, 'never marked Sent by another key\'s answer').toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere' });
    expect(count(['turn'])).toBe(1);
  });
});

describe('T28 an entry-gone create row still offers Check', () => {
  it('Check is a read: 1 createKeyGet, 0 retires; started + session goes R4 and hands the text back; the person sends once', async () => {
    const { a, k1, sid } = await setup();
    removeEntryRaw(k1);
    expect(a.journaled).toBe(true);
    expect(lastUser(a)!.state).toBe('unknown');
    await checkRow(a, lastUser(a)!.id);
    await flush(600);
    expect(count(['createKeyGet'])).toBe(1);
    expect(count(['createKeyRetire'])).toBe(0);
    expect(count(['turn'])).toBe(0);
    await personSends(a);
    expect(count(['turn'])).toBe(1);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
  });
});

describe('T29 the chat lock wait is bounded at 10 s; nothing awaits the network inside the lock', () => {
  it('another holder keeps hub-ai-first for 11 s: the own create reply\'s gate gives up at 10 s (0 turns, unknown lockUnavailable, text kept); Check after release hands it back, the person sends once', async () => {
    w = world();
    const a = await w.dock();
    const create = holdFirst('create');
    a.send('Build me a dashboard');
    await flush(300);
    const k1 = a.record!.k1;
    const release = await holdName(chatLockName(ACCOUNT, HANDLE, REALM, k1));
    create.release();                                           // the own reply proves the session; the gate waits for the lock
    await flush(9000);
    expect(lastUser(a)!.reason, 'still waiting').not.toBe('ask.lockUnavailable');
    await flush(1600);
    expect(lastUser(a)).toMatchObject({ state: 'unknown', reason: 'ask.lockUnavailable', text: 'Build me a dashboard' });
    expect(count(['turn'])).toBe(0);
    release();
    await flush(300);
    await checkRow(a, lastUser(a)!.id);
    expect(count(['turn'])).toBe(0);
    await personSends(a);
    expect(count(['turn'])).toBe(1);
  });
  it('no io call starts while this page holds the chat lock; the admit happens inside it', async () => {
    const { a, k1 } = await setup();
    const nav = globalThis.navigator as any;
    const real = nav.locks.request;
    let held = false;
    nav.locks.request = (name: string, ...rest: unknown[]) => {
      const cb = rest[rest.length - 1] as (l: unknown) => unknown;
      if (!name.startsWith('hub-ai-first:')) return real(name, ...rest);
      return real(name, (l: unknown) => { held = true; return Promise.resolve(cb(l)).finally(() => { held = false; }); });
    };
    const during: string[] = [];
    for (const m of ['create', 'turn', 'attach', 'approval', 'yolo', 'state', 'turns', 'createKeyGet', 'turnByKey']) {
      const orig = (w!.agent as any)[m]?.bind(w!.agent);
      if (!orig) continue;
      (w!.agent as any)[m] = (...x: unknown[]) => { if (held) during.push(m); return orig(...x); };
    }
    // The admit (the entry written and read back) happens while the chat lock is held.
    const admits: boolean[] = [];
    const realAdmit = (w!.j as any).admit.bind(w!.j);
    (w!.j as any).admit = (...x: unknown[]) => { admits.push(held); return realAdmit(...x); };
    await checkRow(a, lastUser(a)!.id);
    await personSends(a);
    expect(count(['turn'])).toBe(1);
    expect(during, 'no io call inside the chat lock').toEqual([]);
    expect(admits, 'the first message is admitted inside the chat lock').toEqual([true]);
    nav.locks.request = real;
    void k1;
  });
});

describe('a stale whole-record save never undoes a claim or a fence', () => {
  it('B\'s dismissal claim and a stale save queue on the record lock: the fence survives, A reads R6 (Not sent, text kept), 0 turns', async () => {
    const { a, sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    const K = recAt(sid).k2;
    const stale = { ...(b.record as any) };                     // read before the lock: k2 = K, no dk
    expect(stale.dk ?? []).toEqual([]);
    const release = await holdName(recsLockName(ACCOUNT));
    b.dismiss(lastUser(b)!.id);                                 // claimFirst(null) waits for the record lock
    await flush(200);
    const put = w!.j.put(HANDLE, stale);                       // a pinned engine\'s save, queued behind it
    await flush(100);
    release();
    await put;
    await flush(900);
    expect(recAt(sid).dk, 'the dismissal fence survives the stale save').toContain(K);
    a.heal(); a.wake(); await flush(900);
    await checkRow(a, lastUser(a)!.id);
    expect(count(['turn'])).toBe(0);
    expect(lastUser(a)).toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere', text: 'Build me a dashboard' });
  });
  it('a supersede claim and a stale save: the stored k2 stays the claimed key', async () => {
    const { sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    const stale = { ...(b.record as any) };
    const release = await holdName(recsLockName(ACCOUNT));
    const claim = w!.jB.claimFirst(HANDLE, REALM, sid, stale.k1, 'hx-' + 'e'.repeat(32));
    await flush(100);
    const put = w!.j.put(HANDLE, stale);
    await flush(100);
    release();
    expect(await claim).toBe('ok');
    await put;
    expect(recAt(sid).k2, 'the claim stands').toBe('hx-' + 'e'.repeat(32));
    expect(recAt(sid).dk).toContain(stale.k2);
  });
});

describe('a later k2 says nothing about an earlier first message', () => {
  it('lost first reply, recovered elsewhere, a later turn, then a stale-tab Check: the original is never Not sent, Send again cannot run it, 2 turns', async () => {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(600);
    const sid = a.record!.s!;
    expect(lastUser(a)).toMatchObject({ state: 'unknown' });
    const b = w.pinned(sid, 'B');
    b.open(); await flush(1500);                                // B recovers the first message BY ITS KEY on opening: R7
    expect(recAt(sid).t).toBeTruthy();
    b.send('a later message');
    await flush(1500);
    expect(w.agent.ledgerRows(sid, 'turn'), 'two admitted turns').toBe(2);
    expect(recAt(sid).k2, 'the record names the later key').not.toBe(a.record!.k2);
    await checkRow(a, lastUser(a)!.id);                         // A has not heard B\'s change
    const orig = allUsers(a).find((u: any) => u.text === 'Build me a dashboard')!;
    expect(orig.state, 'never falsely Not sent').not.toBe('notSent');
    a.resend(orig.id);
    await flush(1500);
    expect(w.agent.ledgerRows(sid, 'turn'), 'still two').toBe(2);
  });
});

describe('a malformed record document is never "kept"', () => {
  it('the pinned write answers false and the bytes stay; drop answers false too', async () => {
    const { a, sid } = await setup();
    await checkRow(a, lastUser(a)!.id);
    const v = w!.j.view(HANDLE, sid);
    const row = (v.read(ACCOUNT).a[ACCOUNT] ?? [])[0]!;
    expect(row).toBeTruthy();
    const doc = JSON.parse(w!.fs.peek(JOURNAL)!);
    doc.a[ACCOUNT] = [1, 2, 3];
    w!.fs.seed(JOURNAL, JSON.stringify(doc));
    const before = w!.fs.peek(JOURNAL);
    expect(await v.write(ACCOUNT, { v: 1, a: { [ACCOUNT]: [{ ...row, at: row.at + 1 }] } } as any), 'not kept').toBe(false);
    expect(w!.fs.peek(JOURNAL)).toBe(before);
    expect(await w!.j.put(HANDLE, { ...(row as any), at: row.at + 2 })).toBe('lost');
    expect(await v.write(ACCOUNT, { v: 1, a: {} }), 'a drop on a malformed document is not kept').toBe(false);
    expect(await w!.j.drop(HANDLE, REALM, sid, row.k1)).toBe(false);
  });
});

describe('P1 a pinned engine\'s write is a promise of "kept"; a caller that removes evidence waits for it', () => {
  it('the view answers a promise, never a bare true: true when kept, false when the put is refused', async () => {
    const { a, sid } = await setup();
    await checkRow(a, lastUser(a)!.id);
    await flush(600);
    const v = w!.j.view(HANDLE, sid);
    const row = (v.read(ACCOUNT).a[ACCOUNT] ?? [])[0];
    expect(row, 'the chat is at the session').toBeTruthy();
    const ok = v.write(ACCOUNT, { v: 1, a: { [ACCOUNT]: [{ ...row!, at: row!.at + 1 }] } } as any);
    expect(ok).toBeInstanceOf(Promise);
    expect(await ok).toBe(true);
    w!.fs.blockWrites(JOURNAL);
    const bad = v.write(ACCOUNT, { v: 1, a: { [ACCOUNT]: [{ ...row!, at: row!.at + 2 }] } } as any);
    expect(bad).toBeInstanceOf(Promise);
    expect(await bad).toBe(false);
    const drop = v.write(ACCOUNT, { v: 1, a: {} });
    expect(drop).toBeInstanceOf(Promise);
    expect(await drop).toBe(false);
  });
  it('a pinned engine\'s dismissal removes the entry only after the drop is kept: the put refused leaves the entry and the row', async () => {
    w = world();
    (w.agent as any).turn = () => Promise.reject({ status: 0, pending: true, kind: 'pending' });   // the first turn never reached the agent
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(600);
    const sid = a.record!.s!;
    const key = a.record!.k2;
    expect(storedKeys(w.fs), 'the first message is on its way').toContain(key);
    a.end();
    const p = w.pinned(sid, 'B');
    p.open(); await flush(900);
    const row = users(p.getSnapshot(), C).find((u: any) => u.state === 'unknown');
    expect(row).toBeTruthy();
    expect(p.getSnapshot().conv.turns, 'a chat with no turn: the dismissal drops the chat').toHaveLength(0);
    w.fs.blockWrites(JOURNAL);
    p.dismiss(row.id);
    await flush(900);
    expect(storedKeys(w.fs), 'the drop was refused: the entry stays').toContain(key);
    expect(users(p.getSnapshot(), C).find((u: any) => u.id === row.id), 'and so does the row').toMatchObject({ reason: 'ask.notRemembered' });
    w.fs.clearFaults();
    p.dismiss(row.id);
    await flush(900);
    expect(storedKeys(w.fs), 'kept: the entry goes').not.toContain(key);
    expect(users(p.getSnapshot(), C).find((u: any) => u.id === row.id)).toBeUndefined();
  });
});

// =============================================================================================================================
// A record's identity (t, k2, dk) is ONE unit; a first-message row's identity is the ROW's.
const ORIGINAL = 'Build me a dashboard';
const originalRow = (e: AskEngine): C.UserMsg => allUsers(e).find((u: any) => u.text === ORIGINAL)!;

describe('the identity tuple (t, k2, dk) is merged as ONE unit', () => {
  it('a stale null-t save of the original, released after B\'s replacement settled, keeps B\'s t AND B\'s k2 with the original key fenced; A\'s Check: Not sent, text restorable, 1 turn', async () => {
    const { a, sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    const stale = { ...(b.record as any) };                     // the original, null t: read before B's replacement
    const K = stale.k2;
    expect(stale.t).toBeNull();
    b.send('B retypes');
    await flush(1500);
    expect(recAt(sid).t, 'B\'s turn is known').toBeTruthy();
    const kB = recAt(sid).k2;
    expect(kB).not.toBe(K);
    expect(recAt(sid).dk).toContain(K);
    expect(await w!.j.put(HANDLE, stale)).toBe('ok');
    expect(recAt(sid).t, 'the stored turn stays').toBeTruthy();
    expect(recAt(sid).k2, 'and its key goes with it, never the stale one').toBe(kB);
    expect(recAt(sid).dk).toContain(K);
    a.heal(); a.wake(); await flush(900);
    await checkRow(a, originalRow(a).id);
    expect(originalRow(a), 'the original is Not sent, text kept').toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere', text: ORIGINAL });
    expect(a.restorable()).toContain(originalRow(a).id);
    expect(w!.agent.ledgerRows(sid, 'turn'), 'only B\'s turn').toBe(1);
  });
  it('the same through a pinned view\'s delayed write (what a pinned engine\'s save calls): captured before B\'s replacement, released after', async () => {
    const { a, sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    const view = w!.j.view(HANDLE, sid);
    const captured = view.read(ACCOUNT);                        // the pinned engine\'s save, built from what it read
    expect((captured.a[ACCOUNT] ?? [])[0]!.t).toBeNull();
    const K = (captured.a[ACCOUNT] ?? [])[0]!.k2;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const delayed = gate.then(() => view.write(ACCOUNT, { v: 1, a: { [ACCOUNT]: [{ ...(captured.a[ACCOUNT] ?? [])[0]!, at: 1 }] } } as any));
    b.send('B retypes');
    await flush(1500);
    expect(recAt(sid).t).toBeTruthy();
    release();
    expect(await delayed).toBe(true);
    expect(recAt(sid).k2, 'B\'s key stays with B\'s turn').not.toBe(K);
    expect(recAt(sid).dk).toContain(K);
    a.heal(); a.wake(); await flush(900);
    await checkRow(a, originalRow(a).id);
    expect(originalRow(a)).toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere', text: ORIGINAL });
    expect(a.restorable()).toContain(originalRow(a).id);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
  });
  it('R7 checks the row\'s OWN fenced key before it adopts a turn: a record that names the original key, a turn AND its fence (written by an older page) still reads Not sent', async () => {
    const { a, sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    const K = recAt(sid).k2;
    b.send('B retypes');
    await flush(1500);
    const t = recAt(sid).t;
    seedRecord(`${HANDLE}|${REALM}|${sid}`, { ...recAt(sid), k2: K, t, dk: [K], na: [K] });   // the corrupt tuple an older put could leave
    a.heal(); a.wake(); await flush(900);
    await checkRow(a, originalRow(a).id);
    expect(originalRow(a), 'never adopted as B\'s turn').toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere', text: ORIGINAL });
    expect(a.restorable()).toContain(originalRow(a).id);
  });
});

describe('a first-message row keeps its identity when Wake teaches the page another tab\'s turn', () => {
  it('A loses the create reply; B replaces (its turn keeps running) and its reply is held; A heals+wakes and learns the turn; B\'s reply settles; A\'s Check: the original ends Not sent (taken elsewhere), restorable, never unknown/noResend', async () => {
    w = world({ createLost: true, script: [[{ k: 'text', text: 'Working.' }, { k: 'hold' }]] as any });
    const a = await w.dock();
    a.send(ORIGINAL);
    await flush(300);
    const sid = sidOf(a.record!.k1);
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    const hold = holdFirst('turn');
    b.send('B retypes');
    await flush(1500);
    expect(hold.calls(), 'B\'s turn admitted').toBe(1);
    a.heal(); await flush(900); a.wake(); await flush(900);     // Wake reads the session and learns B's running turn
    expect(a.record?.t ?? null, 'the page records no turn without its key').toBeNull();
    hold.release();
    await flush(900);
    await checkRow(a, originalRow(a).id);
    await flush(600);
    expect(originalRow(a), 'not stuck as unknown / noResend').toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere', text: ORIGINAL });
    expect(a.restorable()).toContain(originalRow(a).id);
    expect(w!.agent.ledgerRows(sid, 'turn'), 'only B\'s turn').toBe(1);
  });
  it('release first, then Wake: the page adopts the pair (B\'s turn WITH B\'s key) from the durable record; the original, a create row met while no turn was known, still ends Not sent', async () => {
    w = world({ createLost: true, script: [[{ k: 'text', text: 'Working.' }, { k: 'hold' }]] as any });
    const a = await w.dock();
    a.send(ORIGINAL);
    await flush(300);
    const sid = sidOf(a.record!.k1);
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    b.send('B retypes');
    await flush(1500);
    const kB = recAt(sid).k2;
    expect(recAt(sid).t, 'B\'s turn is kept with its key').toBeTruthy();
    a.heal(); await flush(900); a.wake(); await flush(900);
    expect(a.record?.t, 'the pair is adopted whole').toBe(recAt(sid).t);
    expect(a.record?.k2, 'with B\'s key, never this page\'s old one').toBe(kB);
    await checkRow(a, originalRow(a).id);
    expect(originalRow(a)).toMatchObject({ state: 'notSent', reason: 'ask.takenElsewhere', text: ORIGINAL });
    expect(a.restorable()).toContain(originalRow(a).id);
    expect(w!.agent.ledgerRows(sid, 'turn')).toBe(1);
  });
  it('a LATER turn of a chat whose first turn is known is not a first-message row: its lost reply is settled by Check through its own entry, nothing restorable', async () => {
    w = world({});
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(1500);
    const sid = a.record!.s!;
    expect(recAt(sid).t).toBeTruthy();
    (w.agent as any).o.turnLost = true; (w.agent as any).lost.turn = false;     // the next turn's reply is lost
    a.send('and add tests');
    await flush(1500);
    expect(w.agent.ledgerRows(sid, 'turn'), 'both admitted').toBe(2);
    const later = allUsers(a).find((u: any) => u.text === 'and add tests')!;
    expect(later.state).toBe('unknown');
    await checkRow(a, later.id);
    expect(allUsers(a).find((u: any) => u.text === 'and add tests')).toMatchObject({ state: 'sent' });
    expect(a.restorable()).toEqual([]);
    expect(w.agent.ledgerRows(sid, 'turn')).toBe(2);
  });
});

// =============================================================================================================================
// Non-admission is evidence of its own (na), never the person's dismissal (dk); (t, k2) is one pair.
describe('Stop tracking an admitted first message never makes it retryable', () => {
  it('A\'s first message is admitted and its reply lost; B learns the turn and presses Stop tracking; A\'s Check does not call it Not sent, Send again cannot run it twice: the ledger stays 1', async () => {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send(ORIGINAL);
    await flush(600);
    const sid = a.record!.s!;
    expect(lastUser(a)).toMatchObject({ state: 'unknown' });
    expect(w.agent.ledgerRows(sid, 'turn'), 'admitted').toBe(1);
    const b = w.pinned(sid, 'B');
    // B's read of the key fails on opening (a hit would settle the turn at once), so B keeps an unresolved row for it.
    const realByKey = (w.agent as any).turnByKey.bind(w.agent);
    let failed = false;
    (w.agent as any).turnByKey = (...x: unknown[]) => (failed ? realByKey(...x) : (failed = true, Promise.reject({ status: 500 })));
    b.open(); await flush(900);
    const row = users(b.getSnapshot(), C).find((u: any) => u.state === 'unknown');
    expect(row, 'B keeps an unresolved row for it').toBeTruthy();
    b.dismiss(row.id);                                          // Stop tracking: a decision, not a proof of non-admission
    await flush(900);
    await checkRow(a, originalRow(a)?.id ?? lastUser(a)!.id);
    const orig = originalRow(a);
    expect(orig?.state, 'never Not sent: it was admitted').not.toBe('notSent');
    expect(a.restorable(), 'and never offered back').toEqual([]);
    if (orig) a.resend(orig.id);
    await flush(1500);
    expect(w.agent.ledgerRows(sid, 'turn'), 'still one').toBe(1);
  });
});

describe('firstRows routing reads the pair: Wake routes a first-message row through the pair it adopts', () => {
  it('A\'s first message is admitted, its reply lost; B settles it (t with A\'s key); A wakes before any heal: the pair is adopted and the row IS that turn at once, no turn call', async () => {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send(ORIGINAL);
    await flush(600);
    const sid = a.record!.s!;
    const b = w.pinned(sid, 'B');
    b.open(); await flush(1500);                                // B reads the key on opening and settles the turn
    expect(recAt(sid).t, 'B settled the turn').toBeTruthy();
    expect(recAt(sid).k2, 'with A\'s own key').toBe(a.record!.k2);
    expect(a.record?.t ?? null).toBeNull();
    expect(lastUser(a)).toMatchObject({ state: 'unknown' });
    a.wake(); await flush(900);
    expect(a.record?.t, 'the pair is adopted').toBe(recAt(sid).t);
    expect(users(a.getSnapshot(), C).filter((u: any) => u.state === 'unknown'), 'the first-message row is the turn now, nothing left unresolved').toHaveLength(0);
    expect(a.restorable()).toEqual([]);
    expect(w.agent.ledgerRows(sid, 'turn')).toBe(1);
  });
});

describe('Wake never pairs another tab\'s turn with this page\'s key', () => {
  it('A takes the handed-off text back; B replaces (admitted, running, reply lost); A wakes; B\'s Check settles its replacement within 3 Checks and B can send again', async () => {
    w = world({ createLost: true, turnLost: true, script: [[{ k: 'text', text: 'Working.' }, { k: 'hold' }]] as any });
    const a = await w.dock();
    a.send(ORIGINAL);
    await flush(300);
    const sid = sidOf(a.record!.k1);
    await checkRow(a, lastUser(a)!.id);
    const h = expectHandedOff(a);
    expect(a.takeBack(h.id), 'the text is back in the composer').toBe(ORIGINAL);
    const b = w.pinned(sid, 'B');
    b.open(); await flush(900);
    b.send('B retypes');
    await flush(1500);
    expect(w.agent.ledgerRows(sid, 'turn'), 'B\'s turn admitted').toBe(1);
    a.heal(); await flush(900); a.wake(); await flush(900);
    for (let i = 0; i < 3; i++) {
      const row = allUsers(b).find((u: any) => u.text === 'B retypes')!;
      if (row.state !== 'unknown') break;
      await checkRow(b, row.id);
    }
    expect(allUsers(b).find((u: any) => u.text === 'B retypes'), 'B\'s replacement settled').toMatchObject({ state: 'sent' });
    expect(turnEntries(), 'its request entry is gone').toHaveLength(0);
    expect(w.agent.ledgerRows(sid, 'turn')).toBe(1);
  });
});

describe('the record\'s pair says nothing proven about a row: its own request entry settles it', () => {
  it('a record that pairs B\'s turn with another key (kB neither its k2 nor proven unsent) while kB\'s entry is stored: Check reads kB by its key, the row is Sent and the entry goes', async () => {
    w = world({ createLost: true, turnLost: true });
    const a = await w.dock();
    a.send(ORIGINAL);
    await flush(300);
    const sid = sidOf(a.record!.k1);
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    b.send('B retypes');
    await flush(1500);
    const bRow = allUsers(b).find((u: any) => u.text === 'B retypes')!;
    expect(bRow.state).toBe('unknown');
    expect(turnEntries().map((e) => e.k)).toEqual([bRow.key]);
    const turns = ((await (w.agent as any).turns(sid)) as any).turns ?? (await (w.agent as any).turns(sid)).body?.turns;
    const t = turns?.[0]?.turn_id ?? turns?.[0]?.id;
    expect(t, 'the agent ran B\'s turn').toBeTruthy();
    seedRecord(`${HANDLE}|${REALM}|${sid}`, { ...recAt(sid), t, k2: recAt(sid).dk[0] });   // the turn beside the OTHER key
    await checkRow(b, bRow.id);
    await checkRow(b, bRow.id);
    expect(allUsers(b).find((u: any) => u.text === 'B retypes')).toMatchObject({ state: 'sent' });
    expect(turnEntries(), 'its entry is gone').toHaveLength(0);
    expect(w.agent.ledgerRows(sid, 'turn')).toBe(1);
  });
});

describe('the pair rule at the Records boundary and the one predicate', () => {
  it('a save that names B\'s turn beside a key the record fenced does not move the pair; a legitimate later key passes', async () => {
    const { sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    const K = recAt(sid).k2;
    b.send('B retypes');
    await flush(1500);
    const stored = recAt(sid);
    expect(stored.t).toBeTruthy();
    expect(stored.na, 'the moved key is proven never sent').toContain(K);
    const bRec = { ...(b.record as any) };
    expect(await w!.j.put(HANDLE, { ...bRec, t: stored.t, k2: K })).toBe('ok');          // B's turn beside A's fenced key
    expect(recAt(sid).k2, 'the pair stays').toBe(stored.k2);
    expect(recAt(sid).t).toBe(stored.t);
    expect(await w!.j.put(HANDLE, { ...bRec, t: 'other-turn', k2: stored.k2 })).toBe('ok');   // one key never names a second turn
    expect(recAt(sid).t, 'unmoved').toBe(stored.t);
    const later = 'hx-' + 'd'.repeat(32);
    expect(await w!.j.put(HANDLE, { ...bRec, t: stored.t, k2: later })).toBe('ok');      // a later turn\'s own key
    expect(recAt(sid).k2, 'a legitimate later key moves').toBe(later);
  });
  it('restorable() and takeBack() read ONE predicate: a row that may have gone through is in neither', async () => {
    const { a, sid } = await setup();
    const b = await reload();
    await checkRow(b, lastUser(b)!.id);
    b.send('B retypes');
    await flush(1500);
    a.heal(); a.wake(); await flush(900);
    await checkRow(a, originalRow(a).id);
    const id = originalRow(a).id;
    expect(a.restorable()).toContain(id);
    (a as any).maybe.add(id);                                   // the row may have gone through after all
    expect(a.restorable(), 'not offered').not.toContain(id);
    expect(a.takeBack(id), 'and not taken back').toBeNull();
    (a as any).maybe.delete(id);
    expect(a.takeBack(id)).toBe(ORIGINAL);
    void sid;
  });
  it('take back is all or nothing at the engine too: a draft that cannot hold the row\'s file keeps the row and the draft (the backstop behind the source check)', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send(ORIGINAL);
    await flush(300);
    await checkRow(a, lastUser(a)!.id);
    const h = expectHandedOff(a);
    const file = (id: string) => ({ id, kind: 'text', name: id + '.txt', text: 'x', lines: 1, bytes: 1 });
    (a as any).conv = { ...(a as any).conv, users: { ...(a as any).conv.users, [h.id]: { ...(a as any).conv.users[h.id], files: [file('r1')] } } };
    (a as any).att = { items: [file('a1'), file('a2'), file('a3')], refused: [], dropped: '' };
    expect(a.takeBack(h.id), 'refused: three text files is the draft\'s limit').toBeNull();
    expect((a as any).conv.users[h.id], 'the row stays').toBeTruthy();
    expect((a as any).att.items.map((x: any) => x.id), 'the draft is untouched').toEqual(['a1', 'a2', 'a3']);
    (a as any).att = { items: [], refused: [], dropped: '' };
    expect(a.takeBack(h.id), 'with room it comes back').toBe(ORIGINAL);
    expect((a as any).att.items.map((x: any) => x.id), 'with its file').toEqual(['r1']);
  });
  it('R6 reads only na: a record with no turn whose dk alone names the row\'s key (a dismissal, or an older record) leaves the row unknown, never Not sent', async () => {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send(ORIGINAL);
    await flush(600);
    const sid = a.record!.s!;
    const K = a.record!.k2;
    expect(w.agent.ledgerRows(sid, 'turn'), 'admitted').toBe(1);
    removeEntryRaw(K);
    seedRecord(`${HANDLE}|${REALM}|${sid}`, { ...recAt(sid), t: null, k2: 'hx-' + 'e'.repeat(32), dk: [K] });
    await checkRow(a, originalRow(a).id);
    expect(originalRow(a)).toMatchObject({ state: 'unknown', reason: 'ask.otherTab' });
    expect(a.restorable()).toEqual([]);
    a.resend(originalRow(a).id);
    await flush(1500);
    expect(w.agent.ledgerRows(sid, 'turn'), 'still one').toBe(1);
  });
  it('a person\'s Stop tracking is a decision, not evidence: it adds the key to dk and never to na', async () => {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send(ORIGINAL);
    await flush(600);
    const sid = a.record!.s!;
    const b = w.pinned(sid, 'B');
    const realByKey = (w.agent as any).turnByKey.bind(w.agent);
    let failed = false;
    (w.agent as any).turnByKey = (...x: unknown[]) => (failed ? realByKey(...x) : (failed = true, Promise.reject({ status: 500 })));
    b.open(); await flush(900);                                 // the read of the key fails on opening, so the row stays
    b.dismiss(users(b.getSnapshot(), C).find((u: any) => u.state === 'unknown').id);
    await flush(900);
    expect(recAt(sid).dk ?? [], 'dismissed').toContain(recAt(sid).k2);
    expect(recAt(sid).na ?? [], 'but not proven unsent').toEqual([]);
  });
});
