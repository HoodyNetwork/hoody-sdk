// A reopened chat adopts only the turn the stored key k2 admitted. The turn list names no key, so its newest turn
// may be another tab's, a follow-up's or another client's: it is never taken for k2's. A hit on GET /sessions/{id}/turns/by-key/{k2}
// is adopted; a miss proves nothing (the row stays); a failed read says so. Over the real journal on the production-faithful storage.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import * as C from '../conv';
import type { AskEngine } from '../engine';
import { ACCOUNT, HANDLE, JOURNAL, KEY, REALM, REQ, storedEntries, users, world, type World } from './env';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const rows = (e: AskEngine) => users(e.getSnapshot(), C) as C.UserMsg[];
const reads = (m: string) => w!.agent.log.filter((x) => x[0] === m);
const text = (t: string) => [{ k: 'text' as const, text: t }];
const patch = (agent: any, m: string, mode: 'after' | 'before' | 'fail', then?: () => void) => {
  const real = agent[m].bind(agent);
  let done = false;
  agent[m] = (...a: unknown[]) => {
    if (done) return real(...a);
    done = true;
    if (mode === 'before') { agent.log.push([m, a]); return Promise.reject({ status: 502, pending: true }); }
    if (mode === 'fail') return Promise.reject({ status: 500 });
    return real(...a).then(() => Promise.reject({ status: 502, pending: true }));
  };
  void then;
};
const flush = (n = 900) => w!.flush(n);
/** The chat opened again by another tab (a reload): pinned to the session, over tab B's journal and the same storage bytes. */
async function reopenB(sid: string): Promise<AskEngine> { const e = w!.pinned(sid, 'B'); e.open(); await flush(2000); return e; }

/** A chat with a finished first turn and a second message whose answer was lost AFTER the agent took it (mode after) or BEFORE (before). */
async function lostSecond(mode: 'after' | 'before') {
  w = world({ script: [text('First.'), text('Second.'), text('Third.')] });
  const a = await w.dock();
  a.send('One');
  await flush(2000);
  patch(w.agent, 'turn', mode);
  a.send('Two');
  await flush(300);
  const k2 = a.record!.k2;
  const first = a.record!.t;
  expect(rows(a).at(-1), 'the lost second message is unknown').toMatchObject({ state: 'unknown', key: k2 });
  return { a, k2, first, sid: a.record!.s as string };
}

describe('a pending turn key is read by its key', () => {
  it('HIT: the agent took the second message under k2 (the answer was lost): its turn is adopted and the row is not called "cannot tell"', async () => {
    const { k2, sid, first } = await lostSecond('after');
    const b = await reopenB(sid);
    await flush(2000);
    expect(reads('turnByKey').filter((x) => (x[1] as unknown[]).includes(k2)).length, 'k2 was read by key').toBeGreaterThan(0);
    const turn = (w!.agent as any).session(sid).keys.get(k2).turn_id as string;
    expect(turn, 'the agent holds the second message as its own turn').not.toBe(first);
    expect(rows(b).map((u) => [u.text, u.state, u.reason]), 'the conversation reads back whole: both messages sent, no row left unknown').toEqual([['One', 'sent', ''], ['Two', 'sent', '']]);
    expect(storedEntries(w!.fs).filter((e) => e.kind === 'turn' && e.k === k2), 'the entry of the key is settled by the journal').toEqual([]);
  });

  it('MISS: k2 never reached the agent while another client started a newer turn: that turn is NOT adopted for k2; the row stays unknown', async () => {
    const { k2, first, sid } = await lostSecond('before');
    await (w!.agent as any).turn(sid, 'Other client', KEY('e'));
    await flush(2000);
    const b = await reopenB(sid);
    await flush(2000);
    const row = rows(b).find((u) => u.key === k2);
    expect(row, 'the key\'s row stays').toMatchObject({ state: 'unknown' });
    expect(row?.reason ?? '', 'a miss is not "cannot tell": the key is simply not known to have reached the agent').toBe('');
    expect(b.record!.t, 'the newest listed turn (another client\'s) is not recorded as k2\'s').toBe(first);
    expect(reads('turnByKey').length, 'k2 was read by key').toBeGreaterThan(0);
  });

  it('FAILED READ: the by-key read fails: nothing is adopted, the row says the check did not work', async () => {
    const { k2, first, sid } = await lostSecond('before');
    patch(w!.agent, 'turnByKey', 'fail');
    const b = await reopenB(sid);
    await flush(2000);
    const row = rows(b).find((u) => u.key === k2);
    expect(row).toMatchObject({ state: 'unknown', reason: 'ask.checkFailed' });
    expect(b.record!.t).toBe(first);
  });

  // The record is live with no turn and holds no entry (another tab settled or dismissed the entry): the adoption path reads by the key.
  async function entryGone() {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(600);
    const sid = a.record!.s as string;
    const k2 = a.record!.k2;
    a.end();
    await flush(300);
    const req = JSON.parse(w.fs.peek(REQ)!);
    for (const name of Object.keys(req.a[ACCOUNT])) if (req.a[ACCOUNT][name]?.k === k2) delete req.a[ACCOUNT][name];
    w.fs.seed(REQ, JSON.stringify(req));
    return { sid, k2 };
  }
  it('ADOPTION PATH, HIT: a live record with no turn and no entry adopts the turn its key admitted', async () => {
    const { sid, k2 } = await entryGone();
    const turn = (w!.agent as any).session(sid).keys.get(k2).turn_id as string;
    const b = await reopenB(sid);
    expect(b.record!.t, 'the turn k2 admitted').toBe(turn);
    expect(reads('turnByKey').length, 'read by key').toBeGreaterThan(0);
  });
  it('ADOPTION PATH, FAILED READ: nothing is adopted and the row says the check did not work', async () => {
    const { sid } = await entryGone();
    patch(w!.agent, 'turnByKey', 'fail');
    const b = await reopenB(sid);
    expect(b.record!.t ?? null).toBeNull();
    expect(rows(b).some((u) => u.reason === 'ask.checkFailed')).toBe(true);
  });

  // The removed `rec.w` branch of adoptTurn: a hit with the key's entry still stored now takes the plain adoption. The
  // journal's record is the authority: a stored (turn, key) pair is never moved by that adoption.
  it('A hit while the entry is stored adopts in memory only: the journal\'s stored turn for the key is never replaced', async () => {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(600);
    const sid = a.record!.s as string;
    const k2 = a.record!.k2;
    expect(a.record!.w, 'the entry is stored: w').toBe(true);
    const id = `${HANDLE}|${REALM}|${sid}`;
    const doc = JSON.parse(w.fs.peek(JOURNAL)!);
    const row = doc.a[ACCOUNT][id];
    expect(row, 'the record').toBeTruthy();
    doc.a[ACCOUNT][id] = { ...row, t: 'turn-stored', ph: 'working' };   // another tab's pair for this key
    w.fs.seed(JOURNAL, JSON.stringify(doc));
    const sends = w.agent.log.filter((x) => x[0] === 'turn').length;
    (a as any).adoptTurn((a as any).gen);
    await flush(900);
    const after = JSON.parse(w.fs.peek(JOURNAL)!).a[ACCOUNT][id];
    expect(after.t, 'the journal keeps the stored turn').toBe('turn-stored');
    expect(after.k2, 'and its key').toBe(k2);
    expect(w.agent.log.filter((x) => x[0] === 'turn').length, 'nothing is sent').toBe(sends);
    expect(reads('turnByKey').length).toBeGreaterThan(0);
  });

  // ---- three regressions ----
  const checkRow = async (e: AskEngine, uid: string) => { e.check(uid); await flush(1500); };
  const dropEntry = (k: string) => {
    const req = JSON.parse(w!.fs.peek(REQ)!);
    for (const name of Object.keys(req.a[ACCOUNT])) if (req.a[ACCOUNT][name]?.k === k) delete req.a[ACCOUNT][name];
    w!.fs.seed(REQ, JSON.stringify(req));
  };
  const seedPair = (sid: string, k2: string, t: string, ph = 'completed') => {
    const id = `${HANDLE}|${REALM}|${sid}`;
    const doc = JSON.parse(w!.fs.peek(JOURNAL)!);
    doc.a[ACCOUNT][id] = { ...doc.a[ACCOUNT][id], k2, t, ph };
    w!.fs.seed(JOURNAL, JSON.stringify(doc));
  };
  const turnCalls = () => w!.agent.log.filter((x) => x[0] === 'turn').length;

  it('a keyed hit that returns after the record moved to another key is discarded; the row goes back to unknown, nothing is adopted', async () => {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(600);
    const row = rows(a).find((u) => u.state === 'unknown')!;
    expect(row).toBeTruthy();
    const real = (w.agent as any).turnByKey.bind(w.agent);
    let release: () => void = () => {};
    (w.agent as any).turnByKey = (...x: unknown[]) => new Promise((res, rej) => { release = () => real(...x).then(res, rej); });
    (a as any).adoptTurn((a as any).gen, row.id);                 // the lookup for K starts
    await flush(100);
    expect(rows(a).find((u) => u.id === row.id)!.state, 'busy while it reads').toBe('sending');
    const turnsBefore = a.getSnapshot().conv.turns.length;
    const K2 = KEY('f');
    (a as any).rec.k2 = K2;                                       // a later send moved the record to K'
    release();
    await flush(600);
    expect(a.record!.t ?? null, 'the turn of K is not recorded for K\'').toBeNull();
    expect(a.record!.k2).toBe(K2);
    expect(rows(a).find((u) => u.id === row.id)!.state, 'the row is unknown again, never left sending').toBe('unknown');
    expect(a.getSnapshot().conv.turns.length, 'no turn was appended').toBe(turnsBefore);
  });

  it('a row of another key goes back to unknown on a hit; it is never left sending, and Send works', async () => {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(600);
    const sid = a.record!.s as string;
    const K = a.record!.k2;
    a.end();
    await flush(300);
    patch(w.agent, 'turnByKey', 'fail');
    const b = w.pinned(sid, 'B');
    b.open();
    await flush(2000);
    const row = rows(b).find((u) => u.key === K && !u.text)!;
    expect(row, 'B holds the text-less row for K').toBeTruthy();
    // Another tab replaced K by K' and finished it; K's entry is gone.
    const K2 = KEY('d');
    await (w.agent as any).turn(sid, 'later', K2, REALM);
    await flush(1500);
    dropEntry(K);
    seedPair(sid, K2, (w.agent as any).session(sid).keys.get(K2).turn_id);
    await checkRow(b, row.id);
    const after = rows(b).find((u) => u.id === row.id);
    expect(after?.state, 'the old row is not stranded sending').not.toBe('sending');
    expect(after, 'and it is still there to Stop tracking').toMatchObject({ state: 'unknown' });
    expect(C.canSendMore(b.getSnapshot().conv), 'Send works').toBe(true);
    expect(turnCalls(), 'nothing was sent but the later turn').toBe(2);
  });

  it('a hit for the pending key while its entry is still stored next to a settled record settles the entry through the journal', async () => {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(600);
    const sid = a.record!.s as string;
    const K = a.record!.k2;
    const turn = (w.agent as any).session(sid).keys.get(K).turn_id as string;
    seedPair(sid, K, turn, 'working');                            // the record holds the turn; the entry removal did not happen (another page saw it)
    expect(storedEntries(w.fs).filter((e) => e.kind === 'turn' && e.k === K), 'the entry is still stored').toHaveLength(1);
    const sends = turnCalls();
    const row = rows(a).find((u) => u.key === K)!;
    expect(row.state, 'this page still sees its first message unresolved').toBe('unknown');
    await checkRow(a, row.id);
    expect(storedEntries(w.fs).filter((e) => e.kind === 'turn' && e.k === K), 'the proven request is settled: its entry is gone').toHaveLength(0);
    expect(turnCalls(), 'no send').toBe(sends);
    expect(rows(a).filter((u) => u.state === 'unknown'), 'no row left unresolved').toEqual([]);
  });

  it('the record moves to another key while the journal settles the entry: nothing is adopted, the row is unknown again', async () => {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(600);
    const sid = a.record!.s as string;
    const K = a.record!.k2;
    const turn = (w.agent as any).session(sid).keys.get(K).turn_id as string;
    seedPair(sid, K, turn, 'working');
    const row = rows(a).find((u) => u.key === K)!;
    const real = (w.agent as any).turnByKey.bind(w.agent);
    let n = 0, release: () => void = () => {};
    (w.agent as any).turnByKey = (...x: unknown[]) => (++n < 2 ? real(...x) : new Promise((res, rej) => { release = () => real(...x).then(res, rej); }));
    a.check(row.id);
    await flush(600);                                               // the peek answered; the journal's settling read is held
    expect(n, 'the settling read is out').toBe(2);
    const turnsBefore = a.getSnapshot().conv.turns.length;
    (a as any).rec.k2 = KEY('f');
    release();
    await flush(900);
    expect(a.getSnapshot().conv.turns.length, 'no turn appended for the moved key').toBe(turnsBefore);
    expect(rows(a).find((u) => u.id === row.id)!.state).toBe('unknown');
  });

  // ---- the result is checked where it is APPLIED, and a settlement that did not happen keeps everything ----
  /** keyedTurn validates its own read, then `change` runs as the NEXT microtask, before the consumer: the interval once left open. */
  const changeAfterValidation = (e: any, change: () => void) => {
    const orig = e.keyedTurn.bind(e);
    let once = true;
    e.keyedTurn = (r: unknown) => orig(r).then((x: unknown) => { if (once) { once = false; change(); } return x; });
  };
  async function lostWithRow() {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(600);
    const row = rows(a).find((u) => u.state === 'unknown')!;
    expect(row).toBeTruthy();
    return { a, row, K: a.record!.k2, sid: a.record!.s as string };
  }
  it('a key change queued after keyedTurn validated and before the consumer runs adopts nothing (no entry: the plain path)', async () => {
    const { sid } = await entryGone();
    const b = w!.pinned(sid, 'B');
    b.open();
    await flush(2000);
    const turnsBefore = b.getSnapshot().conv.turns.length;
    const tBefore = b.record!.t ?? null;
    expect(b.record!.w, 'no entry: the plain path').toBeFalsy();
    changeAfterValidation(b, () => { (b as any).rec.k2 = KEY('f'); });
    (b as any).adoptTurn((b as any).gen);
    await flush(900);
    expect(b.getSnapshot().conv.turns.length, 'no turn appended for the moved key').toBe(turnsBefore);
    expect(b.record!.t ?? null).toBe(tBefore);
  });
  it('the same with the entry stored (the w path): nothing adopted, entry and pending key kept, row unknown', async () => {
    const { a, row, K } = await lostWithRow();
    const turnsBefore = a.getSnapshot().conv.turns.length;
    changeAfterValidation(a, () => { (a as any).rec.k2 = KEY('f'); });
    (a as any).adoptTurn((a as any).gen, row.id);
    await flush(900);
    expect(a.getSnapshot().conv.turns.length).toBe(turnsBefore);
    expect(rows(a).find((u) => u.id === row.id)!.state).toBe('unknown');
    expect(storedEntries(w!.fs).filter((e) => e.kind === 'turn' && e.k === K), 'the entry stays').toHaveLength(1);
  });
  it('the record object replaced (same key) after validation: nothing adopted', async () => {
    const { a, row } = await lostWithRow();
    const turnsBefore = a.getSnapshot().conv.turns.length;
    changeAfterValidation(a, () => { (a as any).rec = { ...(a as any).rec }; });
    (a as any).adoptTurn((a as any).gen, row.id);
    await flush(900);
    expect(a.getSnapshot().conv.turns.length).toBe(turnsBefore);
    expect(rows(a).find((u) => u.id === row.id)!.state).toBe('unknown');
  });
  it('reopen: a key change queued after validation discards the hit; the obsolete record is not installed again', async () => {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await flush(600);
    const sid = a.record!.s as string;
    const K = a.record!.k2;
    a.end();
    await flush(300);
    const K2 = KEY('f');
    const b = w.pinned(sid, 'B');
    changeAfterValidation(b, () => { (b as any).rec.k2 = K2; });
    b.open();
    await flush(2500);
    expect(rows(b).filter((u) => u.key === K && u.state === 'sent'), 'the discarded hit of K settled no row sent').toEqual([]);
    expect(reads('turnByKey').some((x) => JSON.stringify(x[1]).includes(K2)), 'the conversation was read again from the record it holds now (K\')').toBe(true);
  });
  it('the peek hits but the journal\'s settling read fails: the entry, the pending key and the row stay; nothing is adopted', async () => {
    const { a, row, K, sid } = await lostWithRow();
    const turn = (w!.agent as any).session(sid).keys.get(K).turn_id as string;
    seedPair(sid, K, turn, 'working');
    const real = (w!.agent as any).turnByKey.bind(w!.agent);
    let n = 0;
    (w!.agent as any).turnByKey = (...x: unknown[]) => (++n < 2 ? real(...x) : Promise.reject({ status: 500 }));
    const turnsBefore = a.getSnapshot().conv.turns.length;
    await checkRow(a, row.id);
    expect(n, 'peek then the failed settling read').toBeGreaterThanOrEqual(2);
    expect(storedEntries(w!.fs).filter((e) => e.kind === 'turn' && e.k === K), 'the entry stays').toHaveLength(1);
    expect(rows(a).find((u) => u.id === row.id), 'the row stays, unresolved').toMatchObject({ state: 'unknown' });
    expect(a.record!.w, 'the pending key stays').toBe(true);
    expect(a.getSnapshot().conv.turns.length, 'nothing adopted').toBe(turnsBefore);
  });

  // The journal's check answering anything but a proven, settled-or-owed outcome keeps everything (stubbed: the real journal rarely gives these).
  for (const [name, answer] of [
    ['settled but not settled/owed (none)', () => Promise.resolve({ v: { t: 'settled' }, settled: 'none' })],
    ['rejected', () => Promise.reject(new Error('boom'))],
  ] as const) {
    it(`the journal check ${name}: the entry, the pending key and the row stay; nothing is adopted`, async () => {
      const { a, row, K } = await lostWithRow();
      const turnsBefore = a.getSnapshot().conv.turns.length;
      (a as any).jr.j.check = answer;
      (a as any).adoptTurn((a as any).gen, row.id);
      await flush(900);
      expect(storedEntries(w!.fs).filter((e) => e.kind === 'turn' && e.k === K), 'the entry stays').toHaveLength(1);
      expect(rows(a).find((u) => u.id === row.id), 'the row stays, unresolved').toMatchObject({ state: 'unknown', reason: 'ask.checkFailed' });
      expect(a.record!.w, 'the pending key stays').toBe(true);
      expect(a.getSnapshot().conv.turns.length, 'nothing adopted').toBe(turnsBefore);
    });
  }
});
