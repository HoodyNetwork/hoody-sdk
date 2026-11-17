// The engine's watch level: what a holder asks of the stream. `stream` keeps the
// session's stream at the holder's rank; `state` holds no stream and reads the state every 5 s; `off` reads nothing while the
// engine has nothing of its own to settle. A stream the budget refuses (no slot, or another tab holds the locks) falls to the
// same 5 s state reads instead of the error backoff, and tries for a slot again at each one.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AskEngine, resetSignHoldsForTests, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, type Beat } from './fake';
import { factsOf } from './source';
import * as C from './conv';
import type { AskStore } from './logic';
import type { StreamHandlers } from './data';

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'global';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };

function store(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}

interface Opened { rank: unknown; h: StreamHandlers; closed: boolean }
async function setup(script?: Beat[][]) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], ...(script ? { script } : {}) }, clock);
  const opened: Opened[] = [];
  const real = agent.stream.bind(agent);
  // Every stream the engine asks for, with the rank it asked at; `refuse` answers the next ones as the budget does (no slot).
  let refuse: 'budget' | 'locks' | null = null;
  (agent as any).stream = (id: string, cursor: any, realm: string, h: StreamHandlers, rank?: unknown) => {
    const o: Opened = { rank, h, closed: false };
    opened.push(o);
    if (refuse) { const why = refuse; queueMicrotask(() => { if (!o.closed) h.error(why); }); return { close: () => { o.closed = true; } }; }
    const s = real(id, cursor, realm, h);
    if (!s) return null;
    return { close: () => { o.closed = true; s.close(); } };
  };
  const run = async (ms: number) => {
    for (let left = ms; left > 0; left -= 10) {
      for (let i = 0; i < 10; i++) { await Promise.resolve(); clock.run(0); }
      clock.run(Math.min(10, left));
    }
    for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); }
  };
  const eng = new AskEngine(slot, agent, store(), clock);
  eng.open();
  await run(50);
  // A gate parks for the person (Auto-approve off), as the AI tab's chats do by default.
  if (script) { eng.setAuto(false); await run(50); }
  eng.send('hello');
  await run(3000);
  const states = () => agent.log.filter(([m]) => m === 'state').length;
  const live = () => opened.filter((o) => !o.closed);
  const count = (m: string) => agent.log.filter(([x]) => x === m).length;
  return { clock, agent, eng, opened, run, states, count, live, refuseNext: (w: 'budget' | 'locks' | null) => { refuse = w; } };
}

describe('the engine\'s watch level', () => {
  beforeEach(() => resetSignHoldsForTests());

  it('a quiet conversation keeps its stream at the rank it was asked at (default dock)', async () => {
    const t = await setup();
    expect(t.eng.quiet()).toBe(true);
    expect(t.live()).toHaveLength(1);
    expect(t.live()[0]!.rank).toBe('dock');
  });

  it('state: the stream closes and the state is read every 5 s, nothing more', async () => {
    const t = await setup();
    t.eng.setWatch('state');
    await t.run(0);
    expect(t.live()).toHaveLength(0);
    const n0 = t.states(), s0 = t.opened.length;
    await t.run(15_100);
    expect(t.states() - n0).toBe(3);
    expect(t.opened.length).toBe(s0);
    // Still a ready chat, not blocked: its holders keep the attachment lease pinned (ask/active takes it for a ready chat).
    expect(t.eng.getSnapshot()).toMatchObject({ phase: 'ready', blocked: null });
  });

  it('off: a quiet conversation holds no stream and reads nothing', async () => {
    const t = await setup();
    t.eng.setWatch('off');
    await t.run(0);
    expect(t.live()).toHaveLength(0);
    const n0 = t.states(), s0 = t.opened.length;
    await t.run(120_000);
    expect(t.states()).toBe(n0);
    expect(t.opened.length).toBe(s0);
    expect(t.eng.getSnapshot()).toMatchObject({ phase: 'ready', blocked: null });
  });

  it('off never strands the engine\'s own work: a send in flight keeps the 5 s state reads', async () => {
    const t = await setup();
    t.eng.setWatch('off');
    await t.run(0);
    // The send's answer takes 20 s: the engine's own work, so it is not quiet and reads the state meanwhile.
    const real = t.agent.turn.bind(t.agent);
    (t.agent as any).turn = (...a: Parameters<typeof real>) => new Promise((ok, no) => { t.clock.set(() => { real(...a).then(ok, no); }, 20_000); });
    t.eng.send('and again');
    expect(t.eng.quiet()).toBe(false);
    const n0 = t.states();
    await t.run(10_100);
    expect(t.states() - n0).toBeGreaterThanOrEqual(2);
  });

  it('back to stream: the stream opens again at the asked rank', async () => {
    const t = await setup();
    t.eng.setWatch('off');
    await t.run(100);
    t.eng.setWatch('stream', 'focused');
    await t.run(200);
    expect(t.live()).toHaveLength(1);
    expect(t.live()[0]!.rank).toBe('focused');
  });

  it('a better rank reopens the stream at it; a worse one keeps the stream it holds', async () => {
    const t = await setup();
    t.eng.setWatch('stream', 'focused');
    await t.run(200);
    expect(t.live().map((o) => o.rank)).toEqual(['focused']);
    const n = t.opened.length;
    t.eng.setWatch('stream', 'visible');
    await t.run(200);
    expect(t.opened.length).toBe(n);
    expect(t.live().map((o) => o.rank)).toEqual(['focused']);
  });

  it('over budget: the state is read every 5 s and a slot is asked for again each time', async () => {
    const t = await setup();
    t.refuseNext('budget');
    t.agent.dropStreams();
    await t.run(2_000);
    const n0 = t.states(), s0 = t.opened.length;
    // 5 s reads are 12 in this minute. The error path reads once a second (each good read resets its backoff).
    await t.run(60_000);
    expect(t.states() - n0).toBeGreaterThanOrEqual(11);
    expect(t.states() - n0).toBeLessThanOrEqual(13);
    expect(t.opened.length - s0).toBeGreaterThanOrEqual(11);
    expect(t.opened.length - s0).toBeLessThanOrEqual(13);
    expect(t.eng.getSnapshot()).toMatchObject({ phase: 'ready', blocked: null });
    // A slot comes free: the next try holds the stream again, and the 5 s reads stop.
    t.refuseNext(null);
    await t.run(5_100);
    expect(t.live()).toHaveLength(1);
    const n1 = t.states();
    await t.run(20_000);
    expect(t.states()).toBe(n1);
  });

  it('a locks refusal (another tab holds the slots) reads state every 5 s as well', async () => {
    const t = await setup();
    t.refuseNext('locks');
    t.agent.dropStreams();
    await t.run(2_000);
    const n0 = t.states();
    await t.run(60_000);
    expect(t.states() - n0).toBeGreaterThanOrEqual(11);
    expect(t.states() - n0).toBeLessThanOrEqual(13);
  });

  // What a chat watched without a stream must still do.
  const GATE: Beat[][] = [[{ k: 'text', text: 'Looking. ' }, { k: 'confirm', tool: 'edit_file', params: { path: '/home/ada/x' } }, { k: 'text', text: 'Edited the file for you.' }]];
  const replyText = (t: { eng: AskEngine }) => JSON.stringify(t.eng.getSnapshot().conv.turns.at(-1));

  it('over budget with a turn waiting at a gate: the reads recover the chat (not reconnecting), its gate is decidable, and its reply is read back at its end', async () => {
    const t = await setup(GATE);
    expect(t.eng.getSnapshot().gates).toHaveLength(1);
    const dropLease = vi.spyOn(t.eng as any, 'dropLease');
    t.refuseNext('budget');
    t.agent.dropStreams();
    await t.run(12_000);
    const snap = t.eng.getSnapshot();
    expect(snap.status).not.toBe('reconnecting');
    expect(snap.status).not.toBe('lost');
    expect(factsOf(snap)).toMatchObject({ reach: 'ok', state: 'running', gate: 'confirm' });
    expect(snap.gates).toHaveLength(1);
    expect(t.live()).toHaveLength(0);
    t.eng.decide('once');
    await t.run(20_000);
    const end = t.eng.getSnapshot();
    expect(C.running(C.current(end.conv))).toBe(false);
    expect(t.live()).toHaveLength(0);
    expect(replyText(t)).toContain('Edited the file for you.');
    expect(factsOf(end)).toMatchObject({ reach: 'ok', state: 'idle' });
    // Nothing of the degradation lets a lease go (the engine's one release of its approver handle).
    expect(dropLease).not.toHaveBeenCalled();
  });

  it('a better rank mid-turn reopens from this page\'s cursor: no frame lost or doubled, one stream left', async () => {
    const t = await setup(GATE);
    t.eng.setWatch('stream', 'visible');
    await t.run(100);
    t.eng.setWatch('stream', 'focused');
    t.eng.decide('once');
    t.eng.setWatch('stream', 'open');
    await t.run(5_000);
    expect(C.running(C.current(t.eng.getSnapshot().conv))).toBe(false);
    const turn = replyText(t);
    expect(turn).toContain('Edited the file for you.');
    expect(turn.split('Looking. ').length - 1).toBe(1);
    expect(turn.split('Edited the file for you.').length - 1).toBe(1);
    expect(t.live().map((o) => o.rank)).toEqual(['open']);
  });

  it('state with a running turn: the reads keep it usable, and its whole reply shows when it ends', async () => {
    const t = await setup(GATE);
    t.eng.setWatch('state');
    await t.run(6_000);
    expect(factsOf(t.eng.getSnapshot())).toMatchObject({ reach: 'ok', state: 'running', gate: 'confirm' });
    t.eng.decide('once');
    await t.run(20_000);
    expect(C.running(C.current(t.eng.getSnapshot().conv))).toBe(false);
    expect(t.live()).toHaveLength(0);
    expect(replyText(t)).toContain('Edited the file for you.');
  });

  it('quiet off: a storage wake reads nothing, and a read already out (answering dormant) arms no more reads', async () => {
    const t = await setup();
    t.eng.setWatch('off');
    await t.run(100);
    const n0 = t.states();
    t.eng.wake();
    await t.run(60_000);
    expect(t.states()).toBe(n0);
    // A read in flight when off is chosen: it answers dormant, and nothing reads after it.
    const t2 = await setup();
    t2.agent.setDormant(t2.eng.session()!, true);
    await t2.run(0);
    t2.eng.setWatch('state');
    await t2.run(5_000);
    t2.eng.setWatch('off');
    const m0 = t2.states();
    await t2.run(180_000);
    expect(t2.states() - m0).toBeLessThanOrEqual(1);
    // A read out when off is chosen finds a turn another tab started: it is shown, and nothing more is read for it while off.
    const t3 = await setup();
    t3.eng.setWatch('state');
    await t3.run(100);
    await t3.agent.turn(t3.eng.session()!, 'from another tab', 'other-tab-key', REALM);
    t3.clock.run(5_000);
    t3.eng.setWatch('off');
    const r0 = t3.count('replay') + t3.count('receipt');
    await t3.run(60_000);
    expect(t3.count('replay') + t3.count('receipt')).toBe(r0);
  });

  it('off, then a follow-up while the turn runs: the engine reads again by itself and settles the queued follow-up by its id', async () => {
    const t = await setup(GATE);
    t.eng.setWatch('off');
    await t.run(100);
    expect(t.eng.quiet()).toBe(true);
    const n0 = t.states();
    t.eng.send('also add a test');
    await t.run(500);
    t.agent.declineGates();   // the approval is answered elsewhere: the message itself never declines it
    await t.run(15_000);
    expect(t.states()).toBeGreaterThan(n0);
    expect(t.count('commandGet')).toBeGreaterThanOrEqual(1);
    const rows = Object.values(t.eng.getSnapshot().conv.users).filter((u) => u.text === 'also add a test');
    expect(rows.map((u) => u.state)).toEqual(['sent']);
    expect(t.live()).toHaveLength(0);
    // Settled and quiet again: back to reading nothing.
    await t.run(30_000);
    expect(t.eng.quiet()).toBe(true);
    const n1 = t.states();
    await t.run(60_000);
    expect(t.states()).toBe(n1);
  });

  // One read gate, one observer rule, a history owed until it is applied.
  const heldState = (t: { agent: FakeAgent }) => heldOn(t, 'state');
  /** Holds the next call of one agent method until release(); `all` holds every call until then. */
  const heldOn = (t: { agent: FakeAgent }, m: 'state' | 'receipt' | 'transcript' | 'replay') => {
    const real = (t.agent as any)[m].bind(t.agent) as (...a: unknown[]) => Promise<unknown>;
    const held: Array<() => void> = [];
    let hold = false;
    let all = false;
    (t.agent as any)[m] = (...a: unknown[]) => {
      if (!hold && !all) return real(...a);
      hold = false;
      return new Promise((ok, no) => { held.push(() => { real(...a).then(ok, no); }); });
    };
    return { holdNext: () => { hold = true; }, holdAll: () => { all = true; }, release: () => { all = false; for (const f of held.splice(0)) f(); }, waiting: () => held.length };
  };
  const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const turnIdOf = (t: { eng: AskEngine }) => C.current(t.eng.getSnapshot().conv)?.s.turnId as string;

  it('a history read that fails stays owed: the next good read asks again, and once one is applied none is asked again', async () => {
    const t = await setup(GATE);
    t.eng.setWatch('state');
    await t.run(6_000);
    const real = t.agent.transcript.bind(t.agent);
    let fail = 1, asked = 0;
    (t.agent as any).transcript = (...a: Parameters<typeof real>) => (asked++, fail-- > 0 ? Promise.reject({ status: 503 }) : real(...a));
    t.eng.decide('once');
    // The turn ends through a 5 s state read; its history read fails, and stays owed: a later good read asks again,
    // and that one is applied (the one failure is not the end of it).
    let shownAtFail: string | null = null;
    const inner = (t.agent as any).transcript;
    (t.agent as any).transcript = (...a: unknown[]) => { if (asked === 0) shownAtFail = replyText(t); return inner(...a); };
    await t.run(12_000);
    expect(C.running(C.current(t.eng.getSnapshot().conv))).toBe(false);
    expect(asked).toBeGreaterThanOrEqual(2);
    expect(shownAtFail).not.toContain('Edited the file for you.');
    expect(replyText(t)).toContain('Edited the file for you.');
    // Owed no more once applied: the 5 s reads ask no more history.
    const h = asked;
    await t.run(20_000);
    expect(asked).toBe(h);
  });

  it('state, then off, then a follow-up while the turn waits: the engine still observes and settles it by its id', async () => {
    const t = await setup(GATE);
    t.eng.setWatch('state');
    await t.run(6_000);
    t.eng.setWatch('off');
    await t.run(100);
    const n0 = t.states();
    t.eng.send('also add a test');
    await t.run(500);
    t.agent.declineGates();   // the approval is answered elsewhere: the message itself never declines it
    await t.run(15_000);
    expect(t.states()).toBeGreaterThan(n0);
    const rows = Object.values(t.eng.getSnapshot().conv.users).filter((u) => u.text === 'also add a test');
    expect(rows.map((u) => u.state)).toEqual(['sent']);
  });

  it('a follow-up\'s receipt read slower than the 5 s reads: one read per row at a time, never one per state answer', async () => {
    const t = await setup(GATE);
    t.eng.setWatch('state');
    await t.run(6_000);
    const real = t.agent.commandGet.bind(t.agent);
    let gets = 0, open: (() => void) | null = null;
    (t.agent as any).commandGet = (...a: Parameters<typeof real>) => {
      gets++;
      return new Promise((res) => { open = () => res(real(...a)); });
    };
    t.eng.send('also add a test');
    await t.run(21_000);
    expect(t.states()).toBeGreaterThan(3);
    expect(gets, 'a state answer started another read while one was out').toBe(1);
    // Answered: the next state answer may ask again (the row is still queued), one at a time.
    open!();
    await t.run(6_000);
    expect(gets).toBeLessThanOrEqual(3);
  });

  it('a state answer that arrives at a quiet off starts nothing: no receipt or history for a turn it shows ended', async () => {
    const t = await setup(GATE);
    const h = heldState(t);
    t.eng.setWatch('state');
    await t.run(100);
    h.holdNext();
    await t.run(5_000);                       // the 5 s read goes out and is held
    await t.agent.cancel(t.eng.session()!, turnIdOf(t));
    await t.run(100);                         // another tab's Stop ended the turn on the agent
    t.eng.setWatch('off');
    const r0 = t.count('receipt') + t.count('transcript') + t.count('replay');
    h.release();
    await t.run(60_000);
    expect(t.count('receipt') + t.count('transcript') + t.count('replay')).toBe(r0);
    expect(t.live()).toHaveLength(0);
  });

  it('a turn adopted from a read at state, then off before its deferred resync: the resync reads nothing', async () => {
    const t = await setup();
    const h = heldState(t);
    t.eng.setWatch('state');
    await t.run(100);
    h.holdNext();
    await t.run(5_000);
    await t.agent.turn(t.eng.session()!, 'from another tab', 'other-tab-key', REALM);
    h.release();
    await drain();                            // the answer is applied (the turn adopted); its resync waits for the clock
    expect(C.running(C.current(t.eng.getSnapshot().conv))).toBe(true);
    t.eng.setWatch('off');
    const r0 = t.count('receipt') + t.count('replay') + t.states();
    await t.run(60_000);
    expect(t.count('receipt') + t.count('replay') + t.states()).toBe(r0);
  });

  // The obligation is set where delivery stops; continuations obey the gate; one automatic rebuild per turn.
  it('a stream lost mid-turn owes the history: the turn ends with its replay failing and the whole reply is still read back', async () => {
    const t = await setup(GATE);
    expect(t.eng.getSnapshot().gates).toHaveLength(1);
    (t.agent as any).replay = () => Promise.reject({ status: 503 });
    t.live()[0]!.h.error();                   // the connection drops (not the budget)
    await t.run(100);
    t.eng.setWatch('state');                  // then the holder lowers the watch: no stream is open to close
    t.eng.decide('once');
    await t.run(300);                         // the turn ends on the agent; nothing has read it yet
    t.eng.checkNow();                         // Check: the receipt says ended, the state reads, the replay fails
    await t.run(20_000);
    expect(C.running(C.current(t.eng.getSnapshot().conv))).toBe(false);
    expect(replyText(t)).toContain('Edited the file for you.');
  });

  it('a receipt already out when off is chosen: its ending starts no history read; the history is read when the watch rises', async () => {
    const t = await setup(GATE);
    t.eng.setWatch('state');
    await t.run(6_000);
    const r = heldOn(t, 'receipt');
    r.holdAll();
    t.eng.decide('once');
    await t.run(6_000);                       // the next good state read shows the turn ended: its receipt goes out and is held
    expect(r.waiting()).toBeGreaterThan(0);
    t.eng.setWatch('off');
    const h0 = t.count('transcript');
    r.release();
    await t.run(1_000);
    expect(C.running(C.current(t.eng.getSnapshot().conv)), 'the held receipt ended the turn at off').toBe(false);
    await t.run(30_000);
    expect(t.count('transcript')).toBe(h0);
    expect(replyText(t)).not.toContain('Edited the file for you.');
    t.eng.setWatch('state');
    await t.run(12_000);
    expect(t.count('transcript')).toBeGreaterThan(h0);
    expect(replyText(t)).toContain('Edited the file for you.');
  });

  it('a state read that fails after off is chosen arms no retry: nothing is read until the watch rises', async () => {
    const t = await setup();
    t.eng.setWatch('state');
    await t.run(100);
    const real = t.agent.state.bind(t.agent);
    let release: (() => void) | null = null;
    (t.agent as any).state = (..._a: Parameters<typeof real>) => new Promise((_ok, no) => { release = () => no({ status: 503 }); });
    await t.run(5_000);                       // the 5 s read goes out and is held
    expect(release).not.toBeNull();
    t.eng.setWatch('off');
    (t.agent as any).state = real;
    const n0 = t.states();
    release!();
    await t.run(120_000);
    expect(t.states()).toBe(n0);
    t.eng.setWatch('state');
    await t.run(6_000);
    expect(t.states()).toBeGreaterThan(n0);
  });

  it('a slow history read is not asked again by later ends of the same turn (frames while it is out): it is the one applied', async () => {
    const t = await setup(GATE);
    t.eng.setWatch('state');
    await t.run(6_000);
    const tr = heldOn(t, 'transcript');
    tr.holdAll();
    t.eng.decide('once');
    await t.run(12_000);
    expect(C.running(C.current(t.eng.getSnapshot().conv))).toBe(false);
    expect(tr.waiting()).toBe(1);
    t.eng.setWatch('stream', 'open');
    for (let i = 0; i < 3; i++) { (t.eng as any).finish(); await t.run(100); }
    await t.run(10_000);
    expect(tr.waiting(), 'an automatic rebuild of the same turn superseded the one out').toBe(1);
    tr.release();
    await t.run(1_000);
    expect(replyText(t)).toContain('Edited the file for you.');
  });

  // A resync is a delivery stop; queued resyncs obey the gate; the person's Stop keeps its own receipt.
  it('Check on an open stream whose replay fails, no slot after: the turn ends during the resync and its whole reply is still read back', async () => {
    const t = await setup(GATE);
    expect(t.live()).toHaveLength(1);
    const realReplay = t.agent.replay.bind(t.agent);
    let failReplay = 1;
    (t.agent as any).replay = (...a: Parameters<typeof realReplay>) => (failReplay-- > 0 ? Promise.reject({ status: 503 }) : realReplay(...a));
    const rc = heldOn(t, 'receipt');
    rc.holdNext();
    t.refuseNext('budget');                   // and no stream slot afterwards: a reopened stream cannot replay what was missed
    t.eng.decide('once');
    t.eng.checkNow();                         // Check at once: closes the stream before any frame of the reply; its receipt is held
    await t.run(1_000);                       // the turn ends on the agent while no frame reaches the page
    rc.release();                             // the receipt says ended, the state reads, the replay fails: the turn finishes
    await t.run(5_000);
    expect(C.running(C.current(t.eng.getSnapshot().conv))).toBe(false);
    expect(replyText(t)).toContain('Edited the file for you.');
  });

  it('a resync queued behind one that is out does not read once quiet off is chosen', async () => {
    const t = await setup(GATE);
    t.eng.setWatch('state');
    await t.run(6_000);
    const rp = heldOn(t, 'replay');
    rp.holdAll();
    t.eng.setWatch('stream', 'open');         // a running turn watched again: a resync, its replay held
    await t.run(100);
    expect(rp.waiting()).toBe(1);
    t.eng.setWatch('state');
    t.eng.setWatch('stream', 'open');         // a second resync waits behind the first (owed)
    await t.run(100);
    t.eng.setWatch('off');
    // The held replay reaches the agent only when released (it is logged then): one read, and nothing after it.
    const n0 = t.count('receipt') + t.count('replay') + t.states() + rp.waiting();
    rp.release();
    await t.run(60_000);
    expect(t.count('receipt') + t.count('replay') + t.states()).toBe(n0);
  });

  it('a Stop refused at quiet off still reads its one receipt (the person asked)', async () => {
    const t = await setup(GATE);
    t.eng.setWatch('off');
    await t.run(100);
    (t.agent as any).cancel = () => Promise.reject({ status: 429 });
    const r0 = t.count('receipt');
    t.eng.stop();
    await t.run(2_000);
    expect(t.count('receipt')).toBeGreaterThan(r0);
  });

  it('a failed turn\'s automatic rebuild whose last step comes after quiet off applies nothing; the watch rising reads it again', async () => {
    // A failed turn is rebuilt in three reads (turn list, transcript, turn list): the transcript was asked before off, the
    // last turn-list read would go out at off, so it is not sent and the transcript that came back is not applied either.
    const t = await setup([[{ k: 'text', text: 'Looking. ' }, { k: 'confirm', tool: 'edit_file', params: { path: '/home/ada/x' } }, { k: 'text', text: 'Partly done. ' }, { k: 'fail', code: 'provider_error' }]]);
    t.eng.setWatch('state');
    await t.run(6_000);
    const tr = heldOn(t, 'transcript');
    tr.holdAll();
    t.eng.decide('once');
    await t.run(12_000);                      // the turn fails unseen (state): its rebuild is out, the transcript held
    expect(C.running(C.current(t.eng.getSnapshot().conv))).toBe(false);
    expect(tr.waiting()).toBe(1);
    t.eng.setWatch('off');
    expect(t.eng.quiet()).toBe(true);
    const n0 = t.count('turns');
    tr.release();
    await t.run(30_000);
    expect(t.count('turns'), 'no turn-list read at off').toBe(n0);
    expect(replyText(t)).not.toContain('Partly done.');
    t.eng.setWatch('state');
    await t.run(12_000);
    expect(t.count('turns')).toBeGreaterThan(n0);
    expect(replyText(t)).toContain('Partly done.');
  });

  it('Check at quiet off is the person\'s: it reads the turn again (receipt, state and replay) without raising the watch', async () => {
    const t = await setup(GATE);
    t.eng.setWatch('off');
    await t.run(100);
    const n0 = t.count('replay');
    t.eng.checkNow();
    await t.run(2_000);
    expect(t.count('replay')).toBeGreaterThan(n0);
  });
});
