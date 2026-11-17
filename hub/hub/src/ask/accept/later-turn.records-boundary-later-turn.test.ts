// Acceptance, group LATER TURN: a chat's later turn must reach its journal record. Once a
// later turn is accepted, the record names that turn and its key, (t2, k2new, working), so a reload follows the running turn. Two levels:
//   L1 the Records boundary: the save sequence a later turn makes (its key first, under the stored turn; then its accepted turn), and
//      the R5B-2 refusal that must stay (another tab's turn named beside the record's own key never moves the pair).
//   L2 the real engine: a follow-up after a finished first turn, the turn answer held, then released. The stored (t, k2, ph) is read
//      from the raw bytes after each step, and every journal put the engine makes is logged.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import type { AskEngine } from '../engine';
import { ACCOUNT, HANDLE, JOURNAL, REALM, world, type World } from './env';

let w: World | null = null;
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { w?.dispose(); w = null; resetApproversForTests(); });

const flush = (n = 900) => w!.flush(n);
const recs = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL)!)?.a?.[ACCOUNT] ?? {}; } catch { return {}; } };
const recAt = (sid: string): any => recs()[`${HANDLE}|${REALM}|${sid}`];
const unit = (r: any) => ({ t: r?.t ?? null, k2: r?.k2 ?? null, ph: r?.ph ?? null });
const ONE = [{ k: 'text', text: 'One is done.' }];
const TWO_HELD = [{ k: 'text', text: 'Working on two.' }, { k: 'hold' }];

/** A dock whose first turn has finished: the record holds (t1, k2a, completed). */
async function firstTurnDone(o: { noTurnId?: boolean } = {}): Promise<{ a: AskEngine; sid: string; first: { t: string; k2: string; ph: string } }> {
  w = world({ script: [ONE, TWO_HELD] as any, ...o });
  const a = await w.dock();
  a.send('One');
  await flush(1500);
  const sid = a.record!.s!;
  const first = unit(recAt(sid));
  expect(first.t, 'the first turn is on the record').toBeTruthy();
  return { a, sid, first };
}
/** The first call of an agent method answered only when released (the call itself is made at once). */
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
/** Every row the engine hands to the journal's put, as (t, k2, ph), with the record as stored right after the put settled. */
function logPuts(sid: string): Array<{ saved: any; admit?: string; stored: any }> {
  const log: Array<{ saved: any; admit?: string; stored: any }> = [];
  const real = w!.j.put.bind(w!.j);
  (w!.j as any).put = async (h: string, row: any, opts?: { admit?: string }) => { const r = await real(h, row, opts); log.push({ saved: unit(row), admit: opts?.admit, stored: unit(recAt(sid)) }); return r; };
  return log;
}

describe('L1 the Records boundary: a later turn\'s saves', () => {
  it('L1a its key saved under the stored turn, then its accepted turn with that key: the record names the later turn (t2, k2new, working)', async () => {
    const { a, sid, first } = await firstTurnDone();
    const base = { ...(a.record as any) };
    const kNew = 'hx-' + 'd'.repeat(32);
    expect(await w!.j.put(HANDLE, { ...base, t: first.t, k2: kNew, ph: first.ph })).toBe('ok');      // the later turn's key, the stored t
    const afterKey = unit(recAt(sid));
    expect(afterKey, 'step 1: a later turn\'s own key moves k2 and keeps the stored t').toEqual({ t: first.t, k2: kNew, ph: first.ph });
    expect(await w!.j.put(HANDLE, { ...base, t: 'turn-later', k2: kNew, ph: 'working' }, { admit: kNew })).toBe('ok');  // its accepted turn, admitted under kNew
    expect(unit(recAt(sid)), 'step 2: the record names the later turn and its key').toEqual({ t: 'turn-later', k2: kNew, ph: 'working' });
  });
  it('L1b R5B-2 kept: another turn named beside the record\'s own, unchanged key never moves the pair', async () => {
    const { a, sid, first } = await firstTurnDone();
    const base = { ...(a.record as any) };
    expect(await w!.j.put(HANDLE, { ...base, t: 'other-tab-turn', k2: first.k2, ph: 'working' })).toBe('ok');
    expect(unit(recAt(sid)), 'one key never names a second turn').toEqual(first);
  });
  it('L1c R5B-2 kept for a marked key: tab A\'s turn (sent under kA) never pairs with tab B\'s later key kB, even with B refused as busy', async () => {
    // The mark proves only that the stored key moved under the stored t, not that the turn now
    // named was admitted under that key. Each put is the save the engine makes at that step.
    const { a, sid, first } = await firstTurnDone();
    const base = { ...(a.record as any) };
    const kA = K('a'), kB = K('b');
    expect(await w!.j.put(HANDLE, { ...base, t: first.t, k2: kA, ph: first.ph, w: true })).toBe('ok');   // A dispatch: kA stored with w
    expect(await w!.j.put(HANDLE, { ...base, t: first.t, k2: kB, ph: first.ph, w: true })).toBe('ok');   // B dispatch: kB stored with w
    expect(await w!.j.put(HANDLE, { ...base, t: first.t, k2: kB, ph: first.ph })).toBe('ok');            // B refused (turn_in_flight): w dropped
    expect(unit(recAt(sid)), 'B\'s key is the stored one, under the first turn').toEqual({ t: first.t, k2: kB, ph: first.ph });
    // A's saveKept (engine.ts ptr rule) adopts the stored kB; A's late receipt (accepted) then saves A's turn beside it.
    expect(await w!.j.put(HANDLE, { ...base, t: 'turn-of-A', k2: kB, ph: 'working' })).toBe('ok');
    const after = unit(recAt(sid));
    expect(after, `A's turn was admitted under kA, never kB: the record must not pair them (stored ${JSON.stringify(after)})`).not.toEqual({ t: 'turn-of-A', k2: kB, ph: 'working' });
    expect(after, 'R5B-2 folds A\'s keyless save').toEqual({ t: first.t, k2: kB, ph: first.ph });
    expect(recAt(sid).kp, 'and the mark stays for kB\'s own turn').toBe(true);
    // The same receipt saved with the key it WAS admitted under (accepted passes the row's own key): kA is not the stored k2, so it folds.
    expect(await w!.j.put(HANDLE, { ...base, t: 'turn-of-A', k2: kB, ph: 'working' }, { admit: kA })).toBe('ok');
    expect(unit(recAt(sid)), 'admit=kA against the stored kB folds').toEqual({ t: first.t, k2: kB, ph: first.ph });
    expect(recAt(sid).kp, 'the mark stays').toBe(true);
  });
  it('L1d a marked key pairs only with a turn admitted under it: B\'s own receipt pairs, a keyless learn folds, a reloaded page\'s recovery pairs', async () => {
    const { a, sid, first } = await firstTurnDone();
    const base = { ...(a.record as any) };
    const kB = K('b');
    expect(await w!.j.put(HANDLE, { ...base, t: first.t, k2: kB, ph: first.ph, w: true })).toBe('ok');   // B dispatch: kB marked
    // A turn learned with no admitted key (a stream frame, /state, another tab's save): folds, the mark kept.
    expect(await w!.j.put(HANDLE, { ...base, t: 'turn-learned', k2: kB, ph: 'working' })).toBe('ok');
    expect(unit(recAt(sid)), 'a keyless learn folds').toEqual({ t: first.t, k2: kB, ph: first.ph });
    expect(recAt(sid).kp, 'and keeps the mark').toBe(true);
    // B's own receipt, admitted under kB: pairs and clears the mark.
    expect(await w!.j.put(HANDLE, { ...base, t: 'turn-of-B', k2: kB, ph: 'working' }, { admit: kB })).toBe('ok');
    expect(unit(recAt(sid)), 'B\'s own admitted receipt pairs').toEqual({ t: 'turn-of-B', k2: kB, ph: 'working' });
    expect(recAt(sid).kp, 'cleared by the pairing').toBeUndefined();
  });
  it('L1e a reloaded page (tab B\'s journal) recovers the marked key\'s turn by its key: admit = the looked-up key pairs, another key folds', async () => {
    const { a, sid, first } = await firstTurnDone();
    const base = { ...(a.record as any) };
    const kR = K('c');
    expect(await w!.j.put(HANDLE, { ...base, t: first.t, k2: kR, ph: first.ph, w: true })).toBe('ok');   // sent, answer lost, page reloaded
    const read = w!.jB.find(HANDLE, REALM, sid) as any;
    expect(read.kp, 'the reloaded page reads the mark').toBe(true);
    expect(await w!.jB.put(HANDLE, { ...read, t: 'turn-recovered', ph: 'working' }, { admit: K('e') })).toBe('ok');
    expect(unit(recAt(sid)), 'a recovery answer for another key folds').toEqual({ t: first.t, k2: kR, ph: first.ph });
    expect(await w!.jB.put(HANDLE, { ...read, t: 'turn-recovered', ph: 'working' }, { admit: read.k2 })).toBe('ok');
    expect(unit(recAt(sid)), 'the turn looked up by the stored key pairs').toEqual({ t: 'turn-recovered', k2: kR, ph: 'working' });
    expect(recAt(sid).kp).toBeUndefined();
  });
});

describe('L2 the real engine: a follow-up after a finished first turn', () => {
  it('L2a once the later turn is accepted the record names it, (t2, k2new, working); every step is logged', async () => {
    const { a, sid, first } = await firstTurnDone();
    const puts = logPuts(sid);
    const held = holdFirst('turn');
    a.send('Two');
    await flush(300);
    expect(held.calls(), 'the later turn was sent').toBe(1);
    const dispatched = unit(recAt(sid));
    const kNew = a.record!.k2;
    const putsBeforeAccept = puts.length;
    held.release();
    await flush(600);
    const accepted = unit(recAt(sid));
    const running = (w!.agent as any).ss?.get(sid)?.running ?? null;
    // The facts a fix needs ride every message, so a red names each step's stored unit.
    const facts = JSON.stringify({ first, dispatched, kNew, accepted, agentRunning: running, putsBeforeAccept, puts });
    expect(kNew, 'the later turn has its own key').not.toBe(first.k2);
    expect(accepted.t, `after accept the record names a turn other than the first; ${facts}`).not.toBe(first.t);
    expect(accepted, 'the record names the later turn, its key, working').toMatchObject({ k2: kNew, ph: 'working' });
    if (running) expect(accepted.t, 'and that turn is the one the agent runs').toBe(running);
  });
});

/** Plants the stored record at `sid` (what an earlier life or another tab wrote), from the raw bytes. */
function seedAt(sid: string, row: any): void {
  const doc = JSON.parse(w!.fs.peek(JOURNAL)!);
  doc.a[ACCOUNT][`${HANDLE}|${REALM}|${sid}`] = row;
  w!.fs.seed(JOURNAL, JSON.stringify(doc));
}
const K = (c: string) => 'hx-' + c.repeat(32);

describe('L3 the k2-not-yet-paired mark (kp): set, kept, cleared, and never where it does not belong', () => {
  it('L3a a later key kept under the stored turn sets the mark; a save that keeps that pair keeps it; the pairing save clears it', async () => {
    const { a, sid, first } = await firstTurnDone();
    const base = { ...(a.record as any) };
    expect(recAt(sid).kp, 'no mark on a paired record').toBeUndefined();
    await w!.j.put(HANDLE, { ...base, t: first.t, k2: K('d'), ph: first.ph });
    expect(recAt(sid).kp, 'set: k2 moved, t kept').toBe(true);
    await w!.j.put(HANDLE, { ...base, t: first.t, k2: K('d'), ph: 'working' });
    expect(recAt(sid).kp, 'kept: the same pair saved again').toBe(true);
    await w!.j.put(HANDLE, { ...base, t: 'turn-later', k2: K('d'), ph: 'working' }, { admit: K('d') });
    expect(unit(recAt(sid))).toEqual({ t: 'turn-later', k2: K('d'), ph: 'working' });
    expect(recAt(sid).kp, 'cleared by the pairing save').toBeUndefined();
    await w!.j.put(HANDLE, { ...base, t: 'turn-third', k2: K('d'), ph: 'working' }, { admit: K('d') });
    expect(unit(recAt(sid)).t, 'once paired, R5B-2 holds again: one key never names a third turn').toBe('turn-later');
  });
  it('L3b a key the record fenced never pairs, even while marked and admitted under it', async () => {
    const { a, sid, first } = await firstTurnDone();
    const base = { ...(a.record as any) };
    seedAt(sid, { ...recAt(sid), k2: K('d'), kp: true, dk: [...(recAt(sid).dk ?? []), K('d')] });
    await w!.j.put(HANDLE, { ...base, t: 'turn-later', k2: K('d'), ph: 'working' }, { admit: K('d') });
    expect(unit(recAt(sid)), 'folded: the pair stays').toEqual({ t: first.t, k2: K('d'), ph: first.ph });
    expect(recAt(sid).kp, 'and the mark stays').toBe(true);
  });
  it('L3c a turnless save neither sets nor clears the mark', async () => {
    const { a, sid, first } = await firstTurnDone();
    const base = { ...(a.record as any) };
    await w!.j.put(HANDLE, { ...base, t: null, k2: K('e'), ph: first.ph });
    expect(recAt(sid).kp, 'not set by a turnless save').toBeUndefined();
    expect(unit(recAt(sid)), 'the stored unit wins whole').toEqual(first);
    seedAt(sid, { ...recAt(sid), kp: true });
    await w!.j.put(HANDLE, { ...base, t: null, k2: K('e'), ph: 'working' });
    expect(recAt(sid).kp, 'not cleared by a turnless save').toBe(true);
  });
  it('L3d with no mark the rule is today\'s: a save that moves both t and k2 passes and leaves no mark; another turn beside the stored key folds', async () => {
    const { a, sid, first } = await firstTurnDone();
    const base = { ...(a.record as any) };
    await w!.j.put(HANDLE, { ...base, t: 'turn-both', k2: K('f'), ph: 'working' });
    expect(unit(recAt(sid))).toEqual({ t: 'turn-both', k2: K('f'), ph: 'working' });
    expect(recAt(sid).kp, 'a new pair has no mark').toBeUndefined();
    await w!.j.put(HANDLE, { ...base, t: 'turn-other', k2: K('f'), ph: 'working' });
    expect(unit(recAt(sid)).t, 'folded as before').toBe('turn-both');
    void first;
  });
  it('L3e documents: one without the mark parses unchanged; a stored mark reads back on the record; a mark that is not true is dropped, the row kept', async () => {
    const { sid } = await firstTurnDone();
    const raw = recAt(sid);
    const before = w!.j.find(HANDLE, REALM, sid);
    expect(before, 'an old record reads').not.toBeNull();
    expect((before as any).kp).toBeUndefined();
    seedAt(sid, { ...raw, kp: true });
    expect((w!.j.find(HANDLE, REALM, sid) as any).kp, 'attached like the other record fields').toBe(true);
    seedAt(sid, { ...raw, kp: 'yes' });
    const odd = w!.j.find(HANDLE, REALM, sid);
    expect(odd, 'the row is kept').not.toBeNull();
    expect((odd as any).kp, 'a mark that is not true is not a mark').toBeUndefined();
    const { kp: _kp, ...rest } = odd as any;
    const { kp: _kp0, ...restBefore } = before as any;
    expect(rest).toEqual(restBefore);
  });
  it('L3f a mark in a saved row is ignored: only the stored record carries it', async () => {
    const { a, sid, first } = await firstTurnDone();
    const base = { ...(a.record as any) };
    await w!.j.put(HANDLE, { ...base, t: 'turn-other', k2: first.k2, ph: 'working', kp: true });
    expect(unit(recAt(sid)), 'R5B-2 still folds').toEqual(first);
    expect(recAt(sid).kp).toBeUndefined();
  });
  it('L3g a stale row read while the mark was stored never brings it back: not after the pairing save, not where nothing is stored', async () => {
    const { a, sid, first } = await firstTurnDone();
    const base = { ...(a.record as any) };
    await w!.j.put(HANDLE, { ...base, t: first.t, k2: K('b'), ph: first.ph });
    expect(recAt(sid).kp, 'set: k2 moved, t kept').toBe(true);
    const stale = w!.j.find(HANDLE, REALM, sid) as any;
    expect(stale.kp, 'the engine\'s read carries the stored mark').toBe(true);
    await w!.j.put(HANDLE, { ...base, t: 'turn-later', k2: K('b'), ph: 'working' }, { admit: K('b') });
    expect(recAt(sid).kp, 'cleared by the pairing save').toBeUndefined();
    await w!.j.put(HANDLE, stale);
    expect(unit(recAt(sid)), 'the stale save folds to the stored pair').toEqual({ t: 'turn-later', k2: K('b'), ph: 'working' });
    expect(recAt(sid).kp, 'the stale read does not restore the mark').toBeUndefined();
    await w!.j.put(HANDLE, { ...base, t: 'turn-third', k2: K('b'), ph: 'working' }, { admit: K('b') });
    expect(unit(recAt(sid)).t, 'so a third turn on that key still folds').toBe('turn-later');
    const doc = JSON.parse(w!.fs.peek(JOURNAL)!);
    delete doc.a[ACCOUNT][`${HANDLE}|${REALM}|${sid}`];
    w!.fs.seed(JOURNAL, JSON.stringify(doc));
    expect(recAt(sid), 'nothing stored').toBeUndefined();
    await w!.j.put(HANDLE, { ...stale, t: 'turn-new' });
    expect(recAt(sid)?.t, 'the save is written').toBe('turn-new');
    expect(recAt(sid).kp, 'and never sets the mark from the saved row').toBeUndefined();
  });
});

describe('L4 the real engines: the admitted key travels from the answer that holds it', () => {
  it('L4a two tabs: A\'s later turn admitted under kA, B refused as busy under kB, A adopts kB, then A\'s receipt: the record never names A\'s turn under kB', async () => {
    // /state names no running turn (the window after the slot is taken), and B opened before A sent: B sends a TURN, not a follow-up.
    const { a, sid, first } = await firstTurnDone({ noTurnId: true });
    const b = w!.pinned(sid, 'B');
    b.open(); await flush(900);
    const held = holdFirst('turn');
    a.send('Two');
    await flush(300);
    const kA = a.record!.k2;
    expect(held.calls(), 'A\'s later turn was sent (and admitted: its answer is held)').toBe(1);
    b.send('Three');
    await flush(600);
    const kB = recAt(sid)?.k2;
    const bs = b.getSnapshot() as any;
    const dbg = JSON.stringify({ bPhase: bs.phase, bRec: b.record && unit(b.record), bSid: b.record?.s, sid, bUsers: Object.values(bs.conv?.users ?? {}).map((u: any) => [u.state, u.reason]), band: bs.band, calls: w!.agent.log.slice(-8).map((x: any) => x[0]) });
    expect(kB, `B's key is the stored one; ${dbg}`).not.toBe(kA);
    const bRow = (Object.values(bs.conv?.users ?? {}) as any[]).find((u) => u.text === 'Three');
    expect(bRow, `B's turn was refused as busy (A's turn holds the session); ${dbg}`).toMatchObject({ state: 'notSent', reason: 'ask.busy' });
    expect(recAt(sid)?.kp, 'and it is marked').toBe(true);
    (a as any).save();                                   // any save of A's unchanged state: the pointer rule adopts kB
    await flush(100);
    expect(a.record!.k2, 'A adopted the stored key').toBe(kB);
    held.release();
    await flush(600);
    const after = unit(recAt(sid));
    expect(after, `A's turn was admitted under kA; the record must not name it under kB (stored ${JSON.stringify(after)})`).toEqual({ t: first.t, k2: kB, ph: after.ph });
    expect(recAt(sid)?.kp, 'kB keeps its mark for its own turn').toBe(true);
  });
  it('L4b a reloaded page recovers the later turn by its stored key: admitted under that key, the record names it', async () => {
    const { a, sid, first } = await firstTurnDone();
    holdFirst('turn');                                   // the answer never comes back to tab A
    a.send('Two');
    await flush(300);
    const kR = a.record!.k2;
    expect(unit(recAt(sid)).k2, 'the key is stored, the first turn kept').toBe(kR);
    const b = w!.pinned(sid, 'B');
    b.open(); await flush(900);
    const after = unit(recAt(sid));
    const bs = b.getSnapshot() as any;
    const dbg = JSON.stringify({ bPhase: bs.phase, bRec: b.record && unit(b.record), bUsers: Object.values(bs.conv?.users ?? {}).map((u: any) => [u.state, u.reason]), calls: w!.agent.log.map((x: any) => x[0]) });
    expect(after.k2, `the key stays; ${dbg}`).toBe(kR);
    expect(after.t, `the turn looked up by kR is recorded (stored ${JSON.stringify(after)}, first ${first.t})`).not.toBe(first.t);
    expect(after.t).toBe(b.record?.t);
    const admitted = (w!.agent as any).session(sid).keys.get(kR)?.turn_id as string | undefined;
    expect(admitted, 'the agent admitted a turn under kR').toBeTruthy();
    expect(after.t, 'and the record names exactly that turn').toBe(admitted);
  });
  it('L4c recovery adoption (engine adoptTurn, entry gone): the turn read by the marked key is adopted in memory, its save carries no admit, so the record folds and keeps the mark', async () => {
    const { a, sid, first } = await firstTurnDone();
    holdFirst('turn');                                   // the agent takes the later turn; its answer never comes back
    a.send('Two');
    await flush(300);
    const kR = a.record!.k2;
    expect(recAt(sid)?.kp, 'the later key is kept under the stored turn: marked').toBe(true);
    const admitted = (w!.agent as any).session(sid).keys.get(kR)?.turn_id as string;
    expect(admitted, 'the agent admitted a turn under kR').toBeTruthy();
    const puts = logPuts(sid);
    const byKey = () => w!.agent.log.filter((x: any) => x[0] === 'turnByKey' && (x[1] as unknown[]).includes(kR)).length;
    const reads = byKey();
    delete (a.record as any).w; delete (a.record as any).wf;   // no entry: the plain adoption path
    (a as any).adoptTurn((a as any).gen);
    await flush(900);
    expect(byKey(), 'kR was read by key').toBeGreaterThan(reads);
    expect(a.record!.t, 'the engine adopts the turn kR admitted').toBe(admitted);
    const save = puts.find((p) => p.saved.t === admitted);
    expect(save, `the adoption saved it; puts ${JSON.stringify(puts)}`).toBeTruthy();
    expect(save!.admit, 'with no admitted key').toBeUndefined();
    expect(unit(recAt(sid)), 'so the record folds: the stored pair stays').toEqual({ t: first.t, k2: kR, ph: unit(recAt(sid)).ph });
    expect(recAt(sid)?.kp, 'and the mark stays').toBe(true);
  });
});
