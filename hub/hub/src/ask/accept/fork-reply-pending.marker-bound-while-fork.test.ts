// A fork's create reply may still prove another binding (and leave a "bound elsewhere" marker) for as long
// as the press that made it waits for that reply. claimFork bounds the markers (MARKS_MAX) by counting every fork that may still become
// one, but a Check of another tab can read the key while the press waits: that read hands the record to its session and settles the
// create's entry, so neither the unresolved record nor the entry counted it any more and a new fork was admitted past the bound. The
// claim now stores a reply-pending mark (`rp`) that every write but a marker keeps and only a holder of the fork's target lock clears:
// the press once its own reply is settled, or a Check that holds that lock (which proves the press ended). Read from the raw bytes.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import type * as F from '../fork';
import { MARKS_MAX } from '../journal/records';
import * as J from '../journal';
import { ACCOUNT, HANDLE, JOURNAL, REALM, world, type World } from './env';
import { installTryLocks } from './try-locks';

let w: World | null = null;
let restoreLocks: () => void = () => {};
beforeEach(() => { resetApproversForTests(); restoreLocks = installTryLocks(); });
afterEach(() => { w?.dispose(); w = null; restoreLocks(); resetApproversForTests(); });

const flush = (n = 900) => w!.flush(n);
const agent = (): any => w!.agent as any;
const forkCreates = () => w!.agent.log.filter((x) => x[0] === 'create').map((x) => x[1] as any[]).filter((a) => 'fork' in a[0]);
const doc = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL)!)?.a?.[ACCOUNT] ?? {}; } catch { return {}; } };
const marks = () => Object.values(doc()).filter((r: any) => r.xb === true);
const byK1 = (k1: string) => Object.values(doc()).filter((r: any) => r.k1 === k1);
const ELSEWHERE = { computer_id: 'c0ffee0000000000000000ff' };

async function parentChat(turns = 3) {
  w = world();
  const a = await w.dock();
  a.send('first');
  await flush(1500);
  const sid = a.record!.s!;
  const p = w.pinned(sid);
  p.open();
  await flush(900);
  for (let i = 1; i < turns; i++) { p.send(`turn ${i + 1}`); await flush(1500); }
  const bounds = (await p.turnPins())!;
  return { p, bounds, parent: sid };
}
const spec = (bounds: readonly number[], turn: number): F.ForkSpec => ({ turn, pin: bounds[turn] as number });
/** The agent makes the fork as asked; with `over` the reply to the FIRST fork asked says the session runs bound elsewhere; `gated` holds
 *  that reply back. Later forks are answered as usual. */
function replyHeld(over: Record<string, unknown>, gated: boolean): { sid: () => string | null; made: Promise<void>; release: () => void; restore: () => void } {
  let made: string | null = null;
  let onMade: () => void = () => {};
  const madeP = new Promise<void>((r) => { onMade = r; });
  let release: () => void = () => {};
  const gate = gated ? new Promise<void>((r) => { release = r; }) : Promise.resolve();
  const orig = agent().create;
  const real = orig.bind(agent());
  agent().create = async (...a: unknown[]) => {
    const r = await real(...a);
    if (r && 'fork' in (a[0] as object) && made === null) {
      made = r.session_id;
      onMade();
      await gate;
      return { ...r, started: { ...r.started, ...over } };
    }
    return r;
  };
  return { sid: () => made, made: madeP, release: () => release(), restore: () => { agent().create = orig; } };
}
/** `n` markers stored: one real one (a refused fork of turn 1) and copies of it under other keys and sessions. */
async function marksStored(p: Awaited<ReturnType<typeof parentChat>>['p'], bounds: readonly number[], n: number): Promise<void> {
  const made = replyHeld(ELSEWHERE, false);
  expect((await p.fork(spec(bounds, 1))).k).toBe('refused');
  made.restore();
  const k1 = forkCreates()[0]![1] as string;
  const raw = JSON.parse(w!.fs.peek(JOURNAL)!);
  const d = raw.a[ACCOUNT];
  const id = Object.keys(d).find((x) => d[x].xb)!;
  for (let i = 0; i < n - 1; i++) {
    const k = 'hx-' + i.toString(16).padStart(32, 'e');
    d[id.replace(k1, k)] = { ...d[id], k1: k, k2: 'hx-' + i.toString(16).padStart(32, 'd'), xs: 'ses-other-' + i };
  }
  w!.fs.seed(JOURNAL, JSON.stringify(raw));
  expect(marks()).toHaveLength(n);
}
/** Edits the stored record(s) of create key k1 in the raw bytes. */
function editK1(k1: string, fn: (r: any) => any): void {
  const raw = JSON.parse(w!.fs.peek(JOURNAL)!);
  const d = raw.a[ACCOUNT];
  for (const id of Object.keys(d)) if (d[id].k1 === k1) d[id] = fn(d[id]);
  w!.fs.seed(JOURNAL, JSON.stringify(raw));
}

describe('the marker bound while a fork press still waits for its reply', () => {
  it('a Check of another tab hands the fork to its session during the press: it still counts, so markers never pass MARKS_MAX', async () => {
    const { p, bounds, parent } = await parentChat(3);
    await marksStored(p, bounds, MARKS_MAX - 1);
    // The press of turn 2: the agent makes the session, the reply that names its binding (another computer) is still on its way.
    const made = replyHeld(ELSEWHERE, true);
    const press = p.fork(spec(bounds, 2));
    await made.made;
    await flush(50);
    const k1 = forkCreates()[1]![1] as string;
    const sid = made.sid()!;
    // Tab B Checks the row: its read hands the record to its session and settles the create's entry, never opening it.
    const pB = w!.pinned(parent, 'B');
    pB.open();
    await flush(900);
    const early = await pB.checkFork(k1);
    expect(early.k, 'the Check does not open what the reply may refuse').not.toBe('opened');
    const handed = byK1(k1);
    expect(handed.map((r: any) => r.s), 'the read handed the record to its session').toEqual([sid]);
    // A new fork now: MARKS_MAX - 1 markers + this fork, whose reply may still mark it, are at the bound. Red on live code: admitted.
    const next = await pB.fork(spec(bounds, 0));
    expect(next.k, 'a new fork past the bound is refused').toBe('refused');
    expect((next as { key: string }).key).toBe('ask.forkMarksFull');
    expect(forkCreates(), 'and nothing more is asked').toHaveLength(2);
    expect(byK1(k1).map((r: any) => r.rp), 'what counts it: the handed record keeps the claim\'s reply-pending mark').toEqual([true]);
    // The reply proves another binding: the marker is written, and the bound holds exactly.
    made.release();
    await flush(900);
    expect((await press).k).toBe('refused');
    await flush(900);
    expect(marks(), 'exactly MARKS_MAX markers, never more').toHaveLength(MARKS_MAX);
    expect(marks().some((r: any) => 'rp' in r), 'a marker carries no reply-pending mark').toBe(false);
    made.restore();
    pB.end();
  });

  it('the press clears its mark once its reply is settled: an opened fork and a lost one hold no mark, and the bound frees', async () => {
    const { p, bounds } = await parentChat(3);
    const opened = await p.fork(spec(bounds, 1));
    await flush(900);
    expect(opened.k).toBe('opened');
    const kO = forkCreates()[0]![1] as string;
    expect(byK1(kO).map((r: any) => r.rp), 'the opened fork holds no mark').toEqual([undefined]);
    agent().o.createLost = true;
    const lost = (await p.fork(spec(bounds, 2))) as any;
    agent().o.createLost = false;
    await flush(900);
    expect(lost.k).toBe('unknown');
    const kL = lost.k1 as string;
    expect(byK1(kL).map((r: any) => [r.s, r.rp]), 'the lost fork stays unresolved (it counts as such) with no mark').toEqual([[null, undefined]]);
  });

  it('a mark counts while its fork\'s target lock is held; once it is free a Check clears it and the bound frees', async () => {
    const { p, bounds, parent } = await parentChat(3);
    await marksStored(p, bounds, MARKS_MAX - 1);
    const opened = await p.fork(spec(bounds, 2));
    await flush(900);
    expect(opened.k).toBe('opened');
    const kO = forkCreates()[1]![1] as string;
    // The mark as a press still waiting for its reply leaves it (its target lock T held), on a record already at its session.
    editK1(kO, (r) => ({ ...r, rp: true }));
    const T = await J.holdIfFree(J.forkLockName(ACCOUNT, HANDLE, REALM, byK1(kO)[0].fk));
    expect(T, 'the test holds the fork\'s target lock as its press would').toBeTruthy();
    const pB = w!.pinned(parent, 'B');
    pB.open();
    await flush(900);
    const refused = await pB.fork(spec(bounds, 0));
    expect(refused.k, 'the mark counts: the fork past the bound is refused').toBe('refused');
    expect((refused as { key: string }).key).toBe('ask.forkMarksFull');
    expect((await pB.checkFork(kO)).k, 'a Check while T is held does not open it').not.toBe('opened');
    expect(byK1(kO).map((r: any) => r.rp), 'nor clears the mark').toEqual([true]);
    T!.release();
    // The press ended (T free): a Check takes T, its reply can make no marker any more, the mark goes.
    const ck = await pB.checkFork(kO);
    expect(ck.k, 'the Check opens the fork').toBe('opened');
    expect(byK1(kO).map((r: any) => r.rp), 'the Check cleared the mark').toEqual([undefined]);
    const next = await pB.fork(spec(bounds, 0));
    await flush(900);
    expect(next.k, 'the bound frees: the fork goes on').not.toBe('refused');
    pB.end();
  });

  it('a mark a closed page left on a fork at its session (no row to Check) is drained by the next press at the bound', async () => {
    const { p, bounds, parent } = await parentChat(3);
    await marksStored(p, bounds, MARKS_MAX - 1);
    const opened = await p.fork(spec(bounds, 2));
    await flush(900);
    expect(opened.k).toBe('opened');
    const kO = forkCreates()[1]![1] as string;
    editK1(kO, (r) => ({ ...r, rp: true }));
    const pB = w!.pinned(parent, 'B');
    pB.open();
    await flush(900);
    expect(pB.forkRows()?.some((r) => r.k1 === kO), 'no pending row is left for a Check').toBe(false);
    // Nobody holds the fork's T: the press tries it, clears the stale mark and claims again.
    const next = await pB.fork(spec(bounds, 0));
    await flush(900);
    expect(next.k, 'the fork opens').toBe('opened');
    expect(byK1(kO).map((r: any) => r.rp), 'the stale mark was drained').toEqual([undefined]);
    pB.end();
  });

  it('a stale mark of the very target a press forks again is drained under the T that press holds', async () => {
    const { p, bounds, parent } = await parentChat(3);
    await marksStored(p, bounds, MARKS_MAX - 1);
    const opened = await p.fork(spec(bounds, 2));
    await flush(900);
    expect(opened.k).toBe('opened');
    const kO = forkCreates()[1]![1] as string;
    editK1(kO, (r) => ({ ...r, rp: true }));
    const pB = w!.pinned(parent, 'B');
    pB.open();
    await flush(900);
    // The same parent and turn again: the press holds this target's T, which the stale fork's press held too.
    const again = await pB.fork(spec(bounds, 2));
    await flush(900);
    expect(again.k, 'the fork opens').toBe('opened');
    expect(forkCreates(), 'a new create was asked').toHaveLength(3);
    expect(byK1(kO).map((r: any) => r.rp), 'the stale mark was drained').toEqual([undefined]);
    pB.end();
  });

  it('a fork chat removed from the document (a drop) is never brought back by a stale save, so it cannot return without its mark', async () => {
    const { p, bounds } = await parentChat(3);
    const opened = (await p.fork(spec(bounds, 1))) as any;
    await flush(900);
    expect(opened.k).toBe('opened');
    const kO = forkCreates()[0]![1] as string;
    editK1(kO, (r) => ({ ...r, rp: true }));
    const [rec] = byK1(kO) as any[];
    expect(rec.fk, 'the record names its fork').toBeTruthy();
    expect(await w!.j.drop(HANDLE, REALM, rec.s, kO, ACCOUNT), 'the chat is dropped').toBe(true);
    expect(byK1(kO)).toHaveLength(0);
    // A stale save of that chat holding a known turn (a save may create a chat record that holds one).
    const { h: _h, rp: _rp, ...row } = rec;
    expect(await w!.j.put(HANDLE, { ...row, t: 'turn-stale', ph: 'working', at: row.at + 1 }), 'the save is refused').toBe('lost');
    expect(byK1(kO), 'the fork is not recreated').toHaveLength(0);
  });

  it('a fork whose reply may still come is never evicted to make room for a chat (an evicted one would count nowhere)', async () => {
    const { p, bounds } = await parentChat(3);
    const opened = await p.fork(spec(bounds, 1));
    await flush(900);
    expect(opened.k).toBe('opened');
    const kO = forkCreates()[0]![1] as string;
    // The oldest record of the document, at its session, its press still waiting (rp); past JOURNAL_RECS chats beside it.
    const raw = JSON.parse(w!.fs.peek(JOURNAL)!);
    const d = raw.a[ACCOUNT];
    const id = Object.keys(d).find((x) => d[x].k1 === kO)!;
    d[id] = { ...d[id], rp: true, at: 1 };
    const other = Object.keys(d).find((x) => x !== id && !d[x].xb && d[x].s && !d[x].fk)!;
    for (let i = 0; i < J.JOURNAL_RECS + 2; i++) {
      const s2 = 'ses-filler-' + i, k = 'hx-' + i.toString(16).padStart(32, 'a');
      d[`${HANDLE}|${REALM}|${s2}`] = { ...d[other], s: s2, k1: k, k2: 'hx-' + i.toString(16).padStart(32, 'b'), at: 1000 + i };
    }
    w!.fs.seed(JOURNAL, JSON.stringify(raw));
    const [rec] = Object.values(doc()).filter((r: any) => r.s === 'ses-filler-0') as any[];
    const { h: _h, ...row } = rec;
    expect(await w!.j.put(HANDLE, { ...row, at: row.at + 5000 }), 'a save evicts down to JOURNAL_RECS').toBe('ok');
    expect(Object.values(doc()).filter((r: any) => !r.xb).length, 'the document was trimmed').toBeLessThanOrEqual(J.JOURNAL_RECS + 1);
    expect(byK1(kO).map((r: any) => r.rp), 'the fork with the mark is kept, oldest as it is').toEqual([true]);
  });

  it('a save never sets or clears the mark (it is the stored record\'s): a stale save keeps it, a saved row cannot add one', async () => {
    const { p, bounds } = await parentChat(3);
    const opened = await p.fork(spec(bounds, 1));
    await flush(900);
    expect(opened.k).toBe('opened');
    const kO = forkCreates()[0]![1] as string;
    editK1(kO, (r) => ({ ...r, rp: true }));
    const [rec] = byK1(kO) as any[];
    const { h: _h, rp: _rp, ...row } = rec;
    expect(await w!.j.put(HANDLE, { ...row, at: row.at + 1 }), 'the save lands').toBe('ok');
    expect(byK1(kO).map((r: any) => r.rp), 'the save keeps the stored mark').toEqual([true]);
    editK1(kO, (r) => { const { rp: _x, ...rest } = r; return rest; });
    expect(await w!.j.put(HANDLE, { ...row, at: row.at + 2, rp: true } as any)).toBe('ok');
    expect(byK1(kO).map((r: any) => r.rp), 'a saved row adds none').toEqual([undefined]);
    expect(byK1(kO)[0].r).toBe(REALM);
  });
});
