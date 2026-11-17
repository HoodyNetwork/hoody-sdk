// A fork whose create reply carries well-formed evidence of ANOTHER binding (checkStarted MISMATCH: another
// computer, realm or owner) made a session that is not this computer's. Nothing may route a turn to it, as for a chat's create
// (engine.ts create: refused ask.bindingFailed, the record dropped at both addresses). A later Check reads the key by key, and that
// receipt carries no binding, so the decision is made when the reply is read: the fork is refused, and the same journal update that
// drops its record leaves a "bound elsewhere" marker at its create address. Every Check refuses on the marker before any read (a row
// another tab still shows, a Check in flight, a reloaded page), the marker shows no row and uses no capacity, and a marker write that
// fails keeps the record and still refuses the press. The durable record and the agent's log are read from the raw bytes.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import type * as F from '../fork';
import { AskEngine, forkBoundElsewhere } from '../engine';
import { convSnapshot } from '../source';
import { engineActive, type ActiveDeps } from '../active';
import { scripts } from '../fake';
import * as C from '../conv';
import * as J from '../journal';
import { SendToken, type Op } from '../journal';
import { ACCOUNT, HANDLE, JOURNAL, REALM, slot, users, world, type World } from './env';
import { installTryLocks } from './try-locks';

let w: World | null = null;
let restoreLocks: () => void = () => {};
beforeEach(() => { resetApproversForTests(); restoreLocks = installTryLocks(); });
afterEach(() => { w?.dispose(); w = null; restoreLocks(); resetApproversForTests(); });

const flush = (n = 900) => w!.flush(n);
const agent = (): any => w!.agent as any;
const creates = (): any[][] => w!.agent.log.filter((x) => x[0] === 'create').map((x) => x[1] as any[]);
const forkCreates = () => creates().filter((a) => 'fork' in a[0]);
const turnsTo = (sid: string) => w!.agent.log.filter((x) => x[0] === 'turn' && (x[1] as any[])[0] === sid);
const doc = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL)!)?.a?.[ACCOUNT] ?? {}; } catch { return {}; } };
const forkRecs = () => Object.values(doc()).filter((r: any) => r.fk && !r.xb);
const marks = () => Object.values(doc()).filter((r: any) => r.xb === true);
const atSid = (sid: string) => Object.values(doc()).filter((r: any) => r.s === sid);

async function parentChat(turns = 2) {
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
/** The agent makes the fork as asked, but its reply says the session runs bound elsewhere. */
function boundElsewhere(over: Record<string, unknown>, gated = false): { sid: () => string | null; made: Promise<void>; release: () => void; restore: () => void } {
  let made: string | null = null;
  let onMade: () => void = () => {};
  const madeP = new Promise<void>((r) => { onMade = r; });
  let release: () => void = () => {};
  const gate = gated ? new Promise<void>((r) => { release = r; }) : Promise.resolve();
  const orig = agent().create;
  const real = orig.bind(agent());
  agent().create = async (...a: unknown[]) => {
    const r = await real(...a);
    if (r && 'fork' in (a[0] as object)) {
      made = r.session_id;
      onMade();
      // The session exists on the computer (its key reads settled), and the reply naming its binding is still on its way.
      await gate;
      return { ...r, started: { ...r.started, ...over } };
    }
    return r;
  };
  return { sid: () => made, made: madeP, release: () => release(), restore: () => { agent().create = orig; } };
}
const ELSEWHERE = { computer_id: 'c0ffee0000000000000000ff' };
/** A page reloaded over the same storage: a new Journal, an engine pinned to the parent chat. */
const reloaded = (parent: string): AskEngine => {
  const j = new J.Journal();
  return new AskEngine(slot, w!.agent, j.view(HANDLE, parent), w!.clock, { sid: parent, journal: { j, handle: HANDLE } });
};

/** A turn to `sid` under a create key no marker names (what any other chat of that session would hold), at the journal's door, the one
 *  place every engine's send passes. Without the bar by session (the marker's `xs`) it is admitted, so each "no turn reaches it" below
 *  is checked by an attempt that would otherwise go (a page pinned to the session holds no record of it and sends nothing on its own). */
const doorTry = (sid: string): unknown =>
  w!.j.admit({ acct: ACCOUNT, container: slot.computer, h: HANDLE, r: REALM, key: w!.j.mint('turn')!, route: 'turn', sid, c: 'hx-' + 'f'.repeat(32), files: false } as Op, new SendToken());
const BARRED = { kind: 'notSent', why: 'elsewhere' };

describe('a fork whose reply proves another binding (MISMATCH)', () => {
  it.each([
    ['another computer', { computer_id: 'c0ffee0000000000000000ff' }],
    ['another realm', { realm_selector: 'ab'.repeat(12) }],
    ['another owner', { owner_fingerprint: 'fp-someone-else' }],
  ])('%s: the press is refused and no record is kept; a Check afterwards never opens it and no turn reaches it', async (_n, over) => {
    const { p, bounds } = await parentChat(2);
    const made = boundElsewhere(over);
    const out = await p.fork(spec(bounds, 1));
    expect(forkCreates(), 'the fork was asked once').toHaveLength(1);
    const sid = made.sid();
    expect(sid, 'the agent made a session').toBeTruthy();
    expect(out.k, 'a session bound elsewhere is never a fork this page can open').toBe('refused');
    expect(forkRecs(), 'no record of the fork is kept (nothing may route a turn to it)').toHaveLength(0);
    expect(marks(), 'the "bound elsewhere" marker is kept at its create address').toHaveLength(1);
    // A Check is pressed on a pending row (this chat's, or the AI page's list). The by-key receipt names the session, not its binding, so
    // a kept row would open it (unknown, kept, then Check -> opened). No row is left to Check.
    const k1 = forkCreates()[0]![1] as string;
    expect(p.forkRows()?.some((r) => r.k1 === k1), 'no pending row is left for a Check').toBe(false);
    expect(forkRecs().filter((r: any) => r.s === sid), 'no record at the session it named').toHaveLength(0);
    expect(doorTry(sid!), 'a turn to it under another key is refused at the door').toEqual(BARRED);
    expect(turnsTo(sid!), 'no turn was sent to it').toHaveLength(0);
    const ck = await p.checkFork(k1);
    expect(ck.k, 'a Check of its key afterwards is refused on the marker').toBe('refused');
    expect((ck as { key: string }).key).toBe('ask.forkElsewhere');
  });

  it('a row another tab still shows, Checked while the reply is on its way and again after it: never opened, no turn reaches it', async () => {
    const { p, bounds, parent } = await parentChat(2);
    const made = boundElsewhere(ELSEWHERE, true);
    const press = p.fork(spec(bounds, 1));
    await made.made;
    await flush(50);
    const k1 = forkCreates()[0]![1] as string;
    const sid = made.sid()!;
    const pB = w!.pinned(parent, 'B');
    pB.open();
    await flush(900);
    expect(pB.forkRows()?.some((r) => r.k1 === k1), 'tab B shows the pending row').toBe(true);
    // In flight: the press holds the target and its reply decides; a Check of tab B never opens what that reply may refuse.
    const early = await pB.checkFork(k1);
    expect(early.k, 'a Check while the press waits for its reply does not open the session').not.toBe('opened');
    made.release();
    await flush(900);
    const out = await press;
    expect(out.k).toBe('refused');
    expect((out as { key: string }).key).toBe('ask.forkElsewhere');
    // The stale row: tab B Checks again what it showed.
    const late = await pB.checkFork(k1);
    expect(late.k, 'a Check of the stale row is refused on the marker').toBe('refused');
    expect((late as { key: string }).key).toBe('ask.forkElsewhere');
    expect(pB.forkRows()?.some((r) => r.k1 === k1), 'the marker shows no row').toBe(false);
    expect(atSid(sid), 'no record at the session it named').toHaveLength(0);
    expect(forkRecs()).toHaveLength(0);
    expect(marks()).toHaveLength(1);
    expect(doorTry(sid), 'a turn to it under another key is refused at the door').toEqual(BARRED);
    expect(turnsTo(sid), 'no turn was sent to it').toHaveLength(0);
  });

  it('after a reload the Check is refused, the marker shows no row and holds no capacity: the same target forks again', async () => {
    const { p, bounds, parent } = await parentChat(2);
    const made = boundElsewhere(ELSEWHERE);
    expect((await p.fork(spec(bounds, 1))).k).toBe('refused');
    const k1 = forkCreates()[0]![1] as string;
    made.restore();
    const r = reloaded(parent);
    r.open();
    await flush(900);
    expect(r.forkRows()?.some((x) => x.k1 === k1), 'no row after a reload').toBe(false);
    const ck = await r.checkFork(k1);
    expect(ck.k, 'refused on the marker after a reload').toBe('refused');
    expect((ck as { key: string }).key).toBe('ask.forkElsewhere');
    expect(doorTry(made.sid()!), 'a turn to it under another key is refused at the door').toEqual(BARRED);
    expect(turnsTo(made.sid()!), 'no turn reaches it').toHaveLength(0);
    // The same target: the marker blocks nothing, and a new fork is made under a new key.
    const again = await r.fork(spec(bounds, 1));
    await flush(900);
    expect(forkCreates(), 'a second create was asked').toHaveLength(2);
    expect(again.k, 'the new fork opens').toBe('opened');
    expect(marks(), 'the marker stays').toHaveLength(1);
    expect(r.forkRows()?.length ?? 0, 'neither shows a pending row').toBe(0);
  });

  it('a marker write that fails keeps the record and refuses the press; the owed write lands later and the Check is refused', async () => {
    const { p, bounds } = await parentChat(2);
    const made = boundElsewhere(ELSEWHERE, true);
    const press = p.fork(spec(bounds, 1));
    await made.made;
    await flush(50);
    const k1 = forkCreates()[0]![1] as string;
    w!.fs.blockWrites(JOURNAL);
    made.release();
    await flush(900);
    const out = await press;
    expect(out.k, 'fail closed: the press is refused').toBe('refused');
    expect((out as { key: string }).key).toBe('ask.forkElsewhere');
    expect(forkRecs().filter((r: any) => r.k1 === k1), 'the record is kept').toHaveLength(1);
    expect(marks()).toHaveLength(0);
    expect(atSid(made.sid()!)).toHaveLength(0);
    w!.fs.clearFaults();
    await w!.j.sweep();
    await flush(900);
    expect(marks(), 'the owed marker write lands').toHaveLength(1);
    expect(forkRecs()).toHaveLength(0);
    const ck = await p.checkFork(k1);
    expect(ck.k).toBe('refused');
    expect(doorTry(made.sid()!), 'a turn to it under another key is refused at the door').toEqual(BARRED);
    expect(turnsTo(made.sid()!), 'no turn reaches it').toHaveLength(0);
  });
  it('owed marker: while the press still holds the target a Check of another tab never opens it, with storage back but no sweep', async () => {
    const { p, bounds, parent } = await parentChat(2);
    const made = boundElsewhere(ELSEWHERE, true);
    const press = p.fork(spec(bounds, 1));
    await made.made;
    await flush(50);
    const k1 = forkCreates()[0]![1] as string;
    const sid = made.sid()!;
    w!.fs.blockWrites(JOURNAL);
    made.release();
    await flush(50);
    expect((await press).k).toBe('refused');
    w!.fs.clearFaults();
    const pB = w!.pinned(parent, 'B');
    pB.open();
    await flush(50);
    const early = await pB.checkFork(k1);
    expect(early.k, 'the press keeps the target until its marker is written: not opened').not.toBe('opened');
    await flush(5000);
    expect(marks(), 'the press itself writes the marker once storage takes it').toHaveLength(1);
    expect(atSid(sid), 'nothing is left at the session').toHaveLength(0);
    const late = await pB.checkFork(k1);
    expect(late.k).toBe('refused');
    expect(doorTry(sid), 'a turn to it under another key is refused at the door').toEqual(BARRED);
    expect(turnsTo(sid), 'no turn reaches it').toHaveLength(0);
  });

  it('a fork already at its session with a known turn is marked too: its record stays but no engine reads it, a Check refuses, no turn is sent', async () => {
    const { p, bounds } = await parentChat(2);
    const out = await p.fork(spec(bounds, 1));
    expect(out.k).toBe('opened');
    const { sid, k1 } = out as { sid: string; k1: string };
    const f = w!.pinned(sid);
    f.open();
    await flush(900);
    f.send('a turn');
    await flush(1500);
    const before = atSid(sid);
    expect(before.length === 1 && (before[0] as any).t !== null, 'the chat holds a known turn').toBe(true);
    const sent = turnsTo(sid).length;
    // The reply that proves another binding reaches the journal late (another tab's settlement).
    expect(await w!.j.markElsewhere(HANDLE, REALM, k1, sid), 'the marker is kept').toBe(true);
    expect(marks()).toHaveLength(1);
    expect(atSid(sid), 'the record that holds a turn stays').toHaveLength(1);
    expect((await p.checkFork(k1)).k).toBe('refused');
    const g = w!.pinned(sid, 'B');
    g.open();
    await flush(900);
    g.send('another turn');
    await flush(1500);
    expect(turnsTo(sid), 'no further turn reaches the session').toHaveLength(sent);
  });

  it('marker limit: markers are never forgotten; at MARKS_MAX a new fork is refused (full) and a key with no record is never opened', async () => {
    const { p, bounds } = await parentChat(2);
    const made = boundElsewhere(ELSEWHERE);
    expect((await p.fork(spec(bounds, 1))).k).toBe('refused');
    const k1 = forkCreates()[0]![1] as string;
    const raw = JSON.parse(w!.fs.peek(JOURNAL)!);
    const d = raw.a[ACCOUNT];
    const id = Object.keys(d).find((x) => d[x].xb)!;
    for (let i = 0; i < 63; i++) {
      const k = 'hx-' + i.toString(16).padStart(32, 'e');
      d[id.replace(k1, k)] = { ...d[id], k1: k, k2: 'hx-' + i.toString(16).padStart(32, 'd') };
    }
    w!.fs.seed(JOURNAL, JSON.stringify(raw));
    expect(marks()).toHaveLength(64);
    made.restore();
    const full = await p.fork(spec(bounds, 0));
    expect(full.k, 'at the bound a new fork is refused').toBe('refused');
    expect((full as { key: string }).key, 'with its own words (nothing to Check; only removing local data frees it), not the unconfirmed-forks cap').toBe('ask.forkMarksFull');
    expect(forkCreates(), 'and nothing is asked').toHaveLength(1);
    p.send('the parent goes on');
    await flush(1500);
    expect(marks(), 'no record write forgets a marker').toHaveLength(64);
    expect(doorTry(made.sid()!), 'a turn to the marked session under another key is refused at the door').toEqual(BARRED);
    // A key with no record at all (a cleared or evicted one) is never opened from its receipt.
    const raw2 = JSON.parse(w!.fs.peek(JOURNAL)!);
    for (const x of Object.keys(raw2.a[ACCOUNT])) if (raw2.a[ACCOUNT][x].k1 === k1) delete raw2.a[ACCOUNT][x];
    w!.fs.seed(JOURNAL, JSON.stringify(raw2));
    expect((await p.checkFork(k1)).k, 'a key with no record is never opened from its receipt').toBe('refused');
    expect(turnsTo(made.sid()!), 'and no turn reaches it').toHaveLength(0);
  });

  it('a page pinned to the session a marker names (a fresh create key) keeps no chat of it and sends it no turn; a stop still goes', async () => {
    const { p, bounds } = await parentChat(2);
    const made = boundElsewhere(ELSEWHERE);
    expect((await p.fork(spec(bounds, 1))).k).toBe('refused');
    const sid = made.sid()!;
    made.restore();
    expect((marks()[0] as any).xs, 'the marker names the session its fork made').toBe(sid);
    const q = reloaded(sid);
    q.open();
    await flush(900);
    q.send('hello there');
    await flush(1500);
    expect(turnsTo(sid), 'the pinned page sends it nothing').toHaveLength(0);
    expect(atSid(sid), 'no chat of it is kept').toHaveLength(0);
    const stop = w!.j.admit({ acct: ACCOUNT, container: slot.computer, h: HANDLE, r: REALM, key: w!.j.mint('command')!, route: 'command', sid, c: 'hx-' + 'f'.repeat(32), cmd: 'stop' } as Op, new SendToken()) as any;
    expect(stop.kind, 'a stop is still admitted (it only ends work there)').not.toBe('notSent');
    expect(doorTry(sid), 'a turn under any key is refused as bound elsewhere').toEqual(BARRED);
    q.end();
  });

  it('marker bound: the unresolved forks count too (each may still become a marker), so markers never pass MARKS_MAX', async () => {
    const { p, bounds } = await parentChat(3);
    const made = boundElsewhere(ELSEWHERE);
    expect((await p.fork(spec(bounds, 1))).k).toBe('refused');
    made.restore();
    const k1 = forkCreates()[0]![1] as string;
    const raw = JSON.parse(w!.fs.peek(JOURNAL)!);
    const d = raw.a[ACCOUNT];
    const id = Object.keys(d).find((x) => d[x].xb)!;
    for (let i = 0; i < 62; i++) {
      const k = 'hx-' + i.toString(16).padStart(32, 'e');
      d[id.replace(k1, k)] = { ...d[id], k1: k, k2: 'hx-' + i.toString(16).padStart(32, 'd') };
    }
    w!.fs.seed(JOURNAL, JSON.stringify(raw));
    expect(marks()).toHaveLength(63);
    // One unresolved fork (its answer lost): it may still become the 64th marker.
    agent().o.createLost = true;
    const lost = await p.fork(spec(bounds, 1));
    agent().o.createLost = false;
    expect(lost.k).toBe('unknown');
    expect(forkRecs().filter((r: any) => r.s === null)).toHaveLength(1);
    const next = await p.fork(spec(bounds, 0));
    expect(next.k, 'a new fork past the bound (63 markers + 1 unresolved) is refused').toBe('refused');
    expect((next as { key: string }).key).toBe('ask.forkMarksFull');
  });

  /** 63 markers stored (copies of one real marker under other keys), as the bound tests start. Returns the real marker's create key. */
  async function sixtyThreeMarks(p: Awaited<ReturnType<typeof parentChat>>['p'], bounds: readonly number[], copies = 62): Promise<string> {
    const made = boundElsewhere(ELSEWHERE);
    expect((await p.fork(spec(bounds, 1))).k).toBe('refused');
    made.restore();
    const k1 = forkCreates()[0]![1] as string;
    const raw = JSON.parse(w!.fs.peek(JOURNAL)!);
    const d = raw.a[ACCOUNT];
    const id = Object.keys(d).find((x) => d[x].xb)!;
    for (let i = 0; i < copies; i++) {
      const k = 'hx-' + i.toString(16).padStart(32, 'e');
      d[id.replace(k1, k)] = { ...d[id], k1: k, k2: 'hx-' + i.toString(16).padStart(32, 'd'), xs: 'ses-other-' + i };
    }
    w!.fs.seed(JOURNAL, JSON.stringify(raw));
    expect(marks()).toHaveLength(copies + 1);
    return k1;
  }

  it('marker bound: a fork a Check already handed to its session, its reply still owed, counts too', async () => {
    const { p, bounds } = await parentChat(3);
    await sixtyThreeMarks(p, bounds);
    agent().o.createLost = true;
    const lost = (await p.fork(spec(bounds, 1))) as any;
    agent().o.createLost = false;
    expect(lost.k).toBe('unknown');
    const kL = lost.k1 as string;
    const sidL = agent().createdByKey.get(kL) as string;
    expect(sidL, 'the agent made it').toBeTruthy();
    // Another tab's read hands the record to its session while the create's entry (its reply) is still there.
    const raw = JSON.parse(w!.fs.peek(JOURNAL)!);
    const d = raw.a[ACCOUNT];
    const from = `${HANDLE}|${REALM}|create:${kL}`;
    expect(d[from], 'the lost fork is unresolved').toBeTruthy();
    d[`${HANDLE}|${REALM}|${sidL}`] = { ...d[from], s: sidL };
    delete d[from];
    w!.fs.seed(JOURNAL, JSON.stringify(raw));
    expect(forkRecs().filter((r: any) => r.s === null), 'no fork is unresolved now').toHaveLength(0);
    const next = await p.fork(spec(bounds, 0));
    expect(next.k, 'its reply may still mark it: a new fork past the bound is refused').toBe('refused');
    expect((next as { key: string }).key).toBe('ask.forkMarksFull');
  });

  it('marker bound: a key whose marker is written while its record stays at the session (it holds a turn) counts once', async () => {
    const { p, bounds } = await parentChat(3);
    await sixtyThreeMarks(p, bounds, 61);
    agent().o.createLost = true;
    const lost = (await p.fork(spec(bounds, 1))) as any;
    agent().o.createLost = false;
    expect(lost.k).toBe('unknown');
    const kL = lost.k1 as string;
    const sidL = agent().createdByKey.get(kL) as string;
    // refuseCreate's outcome for a fork already at its session with a known turn, its entry removal not yet done: the record stays at the
    // session and the key's marker is at the create address.
    const raw = JSON.parse(w!.fs.peek(JOURNAL)!);
    const d = raw.a[ACCOUNT];
    const from = `${HANDLE}|${REALM}|create:${kL}`;
    expect(d[from], 'the lost fork is unresolved').toBeTruthy();
    d[`${HANDLE}|${REALM}|${sidL}`] = { ...d[from], s: sidL };
    d[from] = { ...d[from], xb: true, xs: sidL };
    w!.fs.seed(JOURNAL, JSON.stringify(raw));
    expect(marks(), '63 markers').toHaveLength(63);
    const next = await p.fork(spec(bounds, 0));
    expect(next.k, 'one key is one place: 63 < MARKS_MAX, the fork goes on').not.toBe('refused');
  });

  it('marker bound: a claim that never left (no request entry) is freed before the bound refuses', async () => {
    const { p, bounds } = await parentChat(3);
    const k1 = await sixtyThreeMarks(p, bounds);
    // A claim of another target whose owner died before writing its entry: it can never be posted, so it holds no place.
    const raw = JSON.parse(w!.fs.peek(JOURNAL)!);
    const d = raw.a[ACCOUNT];
    const id = Object.keys(d).find((x) => d[x].xb && d[x].k1 === k1)!;
    const kD = 'hx-' + 'c'.repeat(32);
    const { xb: _xb, xs: _xs, ...plain } = d[id];
    d[id.replace(k1, kD)] = { ...plain, k1: kD, k2: 'hx-' + 'b'.repeat(32), fk: { ...plain.fk, i: 2 } };
    w!.fs.seed(JOURNAL, JSON.stringify(raw));
    expect(forkRecs().filter((r: any) => r.s === null), 'the dead claim is stored').toHaveLength(1);
    const next = await p.fork(spec(bounds, 0));
    expect(next.k, 'the dead claim is freed and the fork goes on').not.toBe('refused');
    expect(doc()[id.replace(k1, kD)], 'the dead claim is gone').toBeUndefined();
  });

  it('a Check of another key whose receipt names the session a marker names is refused, never opened', async () => {
    const { p, bounds } = await parentChat(3);
    const made = boundElsewhere(ELSEWHERE);
    expect((await p.fork(spec(bounds, 1))).k).toBe('refused');
    made.restore();
    agent().o.createLost = true;
    const lost = (await p.fork(spec(bounds, 0))) as any;
    agent().o.createLost = false;
    expect(lost.k).toBe('unknown');
    const kL = lost.k1 as string;
    const sidL = agent().createdByKey.get(kL) as string;
    // The marker names the session this key's receipt names.
    const raw = JSON.parse(w!.fs.peek(JOURNAL)!);
    const d = raw.a[ACCOUNT];
    const id = Object.keys(d).find((x) => d[x].xb)!;
    d[id] = { ...d[id], xs: sidL };
    w!.fs.seed(JOURNAL, JSON.stringify(raw));
    const ck = await p.checkFork(kL);
    expect(ck, 'bound elsewhere').toMatchObject({ k: 'refused', key: 'ask.forkElsewhere' });
    expect(turnsTo(sidL)).toHaveLength(0);
  });

  it('the engine ends while the create is in flight, and the late mismatch reply finds storage refusing: T is kept until the marker is written', async () => {
    const { p, bounds, parent } = await parentChat(2);
    const made = boundElsewhere(ELSEWHERE, true);
    const press = p.fork(spec(bounds, 1));
    await made.made;
    await flush(50);
    const k1 = forkCreates()[0]![1] as string;
    const sid = made.sid()!;
    p.end();
    await flush(300);
    await press;
    w!.fs.blockWrites(JOURNAL);
    made.release();
    await flush(300);
    expect(marks(), 'the marker write was refused').toHaveLength(0);
    w!.fs.clearFaults();
    const pB = w!.pinned(parent, 'B');
    pB.open();
    await flush(50);
    const early = await pB.checkFork(k1);
    expect(early.k, 'the late tail keeps T until the marker is written: not opened').not.toBe('opened');
    await flush(5000);
    expect(marks(), 'the late tail writes the marker').toHaveLength(1);
    expect((await pB.checkFork(k1)).k).toBe('refused');
    expect(atSid(sid)).toHaveLength(0);
    expect(turnsTo(sid)).toHaveLength(0);
  });

  it('a stale engine that still holds the known-turn record never brings back a marked key: heal and send are refused, the Check too', async () => {
    const { p, bounds } = await parentChat(2);
    const out = await p.fork(spec(bounds, 1));
    expect(out.k).toBe('opened');
    const { sid, k1 } = out as { sid: string; k1: string };
    const f = w!.pinned(sid);
    f.open();
    await flush(900);
    f.send('a turn');
    await flush(1500);
    const sent = turnsTo(sid).length;
    expect(await w!.j.markElsewhere(HANDLE, REALM, k1, sid)).toBe(true);
    // The session record goes (evicted, or cleared by another tab); the marker stays.
    const raw = JSON.parse(w!.fs.peek(JOURNAL)!);
    for (const x of Object.keys(raw.a[ACCOUNT])) if (raw.a[ACCOUNT][x].s === sid) delete raw.a[ACCOUNT][x];
    w!.fs.seed(JOURNAL, JSON.stringify(raw));
    expect(atSid(sid)).toHaveLength(0);
    f.heal();
    f.wake();
    await flush(900);
    expect(atSid(sid), 'the stale engine\'s save does not recreate the record').toHaveLength(0);
    f.send('from the stale engine');
    await flush(1500);
    expect(turnsTo(sid), 'no further turn reaches the session').toHaveLength(sent);
    const row = users(f.getSnapshot(), C).find((u: any) => u.text === 'from the stale engine');
    expect(row, 'the refused send says the chat runs elsewhere, never "check storage, then send again"').toMatchObject({ state: 'notSent', reason: 'ask.chatElsewhere' });
    expect((await p.checkFork(k1)).k).toBe('refused');
    expect(marks()).toHaveLength(1);
  });
  it('a request admitted before the marker is written never leaves once it is: the door looks again right before the call (a stop still goes)', async () => {
    const { p, bounds } = await parentChat(2);
    const out = await p.fork(spec(bounds, 1));
    expect(out.k).toBe('opened');
    const { sid, k1 } = out as { sid: string; k1: string };
    const j = w!.j;
    const base = { acct: ACCOUNT, container: slot.computer, h: HANDLE, r: REALM, sid, c: k1 };
    const tk = j.mint('turn' as any)!;
    const sk = j.mint('command' as any)!;
    const turn = j.admit({ ...base, route: 'turn', key: tk, files: false } as Op, new SendToken()) as any;
    const stop = j.admit({ ...base, route: 'command', key: sk, cmd: 'stop' } as Op, new SendToken()) as any;
    expect('kind' in turn, 'the turn is admitted before any marker').toBe(false);
    expect('kind' in stop).toBe(false);
    // Another tab's settlement marks the key while these wait to be posted.
    expect(await j.markElsewhere(HANDLE, REALM, k1, sid)).toBe(true);
    let turnCalled = false, stopCalled = false;
    const t = await j.post(turn, () => { turnCalled = true; return Promise.resolve({}); });
    expect(turnCalled, 'the admitted turn is never called').toBe(false);
    expect(t, 'refused as bound elsewhere (the engine says the chat runs elsewhere, never "not remembered")').toEqual({ kind: 'notSent', why: 'elsewhere' });
    await j.post(stop, () => { stopCalled = true; return Promise.resolve({}); });
    expect(stopCalled, 'a stop still goes').toBe(true);
  });
  it('an owner not known yet is not compared: only a proven realm or computer mismatch (or one against a known owner) refuses for good', () => {
    const want = { realm: REALM, container: slot.computer, owner: '' };
    const reply = (started: Record<string, unknown>) => ({ session_id: 'sess-x', started: { realm_selector: REALM, computer_id: slot.computer, owner_fingerprint: 'fp-other', ...started } });
    expect(forkBoundElsewhere(reply({}), want), 'another owner while ours is unknown: not proven (stays unknown, no marker)').toBe(false);
    expect(forkBoundElsewhere(reply({ realm_selector: 'ab'.repeat(12) }), want), 'another realm: proven').toBe(true);
    expect(forkBoundElsewhere(reply({ computer_id: 'c0ffee0000000000000000ff' }), want), 'another computer: proven').toBe(true);
    expect(forkBoundElsewhere(reply({}), { ...want, owner: 'fp-mine' }), 'another owner against a known one: proven').toBe(true);
    expect(forkBoundElsewhere(reply({ owner_fingerprint: 'fp-mine' }), { ...want, owner: 'fp-mine' }), 'the same binding').toBe(false);
  });
  it('an owner not known yet on the press itself: a reply naming another owner stays unknown, writes no marker and uses none of the 64', async () => {
    const { bounds, parent } = await parentChat(2);
    // This page has not read its owner (the agent's sign-in reads as signed out): the press runs with no owner to compare.
    agent().o.auth = 'login';
    const q = reloaded(parent);
    q.open();
    await flush(900);
    const made = boundElsewhere({ owner_fingerprint: 'fp-someone-else' });
    const out = await q.fork(spec(bounds, 1));
    expect(forkCreates(), 'the fork was asked').toHaveLength(1);
    expect(made.sid(), 'the agent made a session').toBeTruthy();
    expect(out.k, 'nothing proves another owner: the fork stays unknown, as before markers').toBe('unknown');
    expect(marks(), 'no permanent marker').toHaveLength(0);
    q.end();
  });

  it('a gate decision in a marked chat is refused with the chat-elsewhere words, never "not kept"; the adapter says so too, and the line lives only while its card does', async () => {
    const { p, bounds } = await parentChat(2);
    const out = await p.fork(spec(bounds, 1));
    expect(out.k).toBe('opened');
    const { sid, k1 } = out as { sid: string; k1: string };
    const f = w!.pinned(sid);
    f.open();
    await flush(900);
    f.setAuto(false);
    agent().o.script = [scripts.approval];
    f.send('Add a chart');
    await flush(900);
    expect(f.getSnapshot().gates.length, 'a gate is parked in the fork').toBeGreaterThan(0);
    expect(await w!.j.markElsewhere(HANDLE, REALM, k1, sid)).toBe(true);
    const deps: ActiveDeps = {
      approvers: { state: () => ({ phase: 'none' }), subscribe: () => () => undefined } as any,
      leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
      pending: () => [], onPending: () => () => undefined,
      set: (fn, ms) => w!.clock.set(fn, ms), clear: (id) => w!.clock.clear(id), decode: () => new Uint8Array(), waitMs: 5000,
    };
    const src = engineActive({ current: () => f, release: () => undefined }, { computer: HANDLE, realm: REALM, sid }, () => ({ computer: 'c', realm: REALM }), deps);
    src.subscribe(() => undefined);
    const confirms = () => w!.agent.log.filter((x) => x[0] === 'confirm').length;
    const before = confirms();
    const ref = src.snapshot().gates[0]!.ref;
    // The adapter takes the request's own proof (the attempt it saw sending), never the conversation-wide flag alone.
    const res = src.decide(ref, { choice: 'once' } as any);
    await flush(900);
    expect(await res, 'the adapter answers the refusal, not unknown').toEqual({ k: 'refused', code: 'chat_elsewhere' });
    expect(confirms(), 'the decision never leaves').toBe(before);
    const d = f.getSnapshot().decision;
    expect(d.elsewhere, 'refused as bound elsewhere').toBe(true);
    expect(d.notKept, 'not the "not kept" state').toBeFalsy();
    const lines = () => convSnapshot(f.getSnapshot(), { computer: 'c', realm: REALM }, 0).blocks.filter((b: any) => b.k === 'line').map((b: any) => b.key);
    expect(lines(), 'one line says the chat runs elsewhere').toContain('elsewhere');
    // A later call that never reaches the journal (a choice the card does not offer) is not answered by the earlier refusal.
    expect(await src.decide(ref, { choice: 'bogus' } as any), 'an earlier refusal never answers a later call').toEqual({ k: 'refused', code: 'not_applied' });
    // A stop still goes: the turn ends, its card leaves, and the line goes with it.
    f.stop();
    await flush(1500);
    expect(f.getSnapshot().gates, 'the card left').toHaveLength(0);
    expect(f.getSnapshot().decision.elsewhere, 'no stale flag once its card is gone').toBeUndefined();
    expect(lines()).not.toContain('elsewhere');
    src.release();
  });
});
