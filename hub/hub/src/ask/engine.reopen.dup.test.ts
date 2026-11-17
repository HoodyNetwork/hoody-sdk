// A chat opened again from a record that still says its turn runs (a hand-off to the chat's own page, a navigation, a reload), after
// that turn ended on the agent or while it ends. The transcript read at the open may already hold the turn, and the open also shows
// the record's turn live, rebuilt from the replay: the same reply twice (one "hello!", two identical replies; a reload showed one).
// The turn's receipt, by the agent's turn id, decides: a turn the agent closed is the transcript's and is never rebuilt from the
// replay, and a turn shown live at an open is read back from the transcript when it ends. Nothing here compares text.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import * as C from './conv';
import { AskEngine, resetSignHoldsForTests, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, type FakeOptions } from './fake';
import type { AskStore } from './logic';

beforeEach(() => { resetSignHoldsForTests(); });

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
const REPLY = 'Hello! How can I help you today?';

function memStore(): StoreIO & { raw: () => string } {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); }, raw: () => JSON.stringify(st) };
}
async function setup(o: Partial<FakeOptions> = {}, store = memStore()) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], ...o }, clock);
  const eng = new AskEngine(slot, agent, store, clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  return { clock, agent, eng, store, flush, snap: () => eng.getSnapshot() };
}
const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);
const replies = (s: any): string[] => C.blocks(s.conv, 0).filter((b) => b.k === 'reply').map((b: any) => b.text);
const users = (s: any) => C.blocks(s.conv, 0).filter((b) => b.k === 'user').map((b: any) => b.msg);
const outcomes = (s: any) => C.blocks(s.conv, 0).filter((b) => b.k === 'outcome').map((b: any) => b.state);

/** A chat whose first turn was admitted (the record holds the turn id and says working), then left (the page went) before it ended. */
async function leftRunning(o: Partial<FakeOptions> = {}) {
  const store = memStore();
  const t = await setup({ pace: 400, script: [[{ k: 'text', text: REPLY }]], ...o }, store);
  t.eng.send('hello!');
  await t.flush(30);
  expect(t.eng.record?.ph).toBe('working');
  expect(t.eng.record?.t).toBeTruthy();
  const turnId = t.eng.record!.t!;
  const sid = t.eng.record!.s!;
  t.eng.end();
  return { t, store, turnId, sid };
}
/** A second engine on the same store (the chat opened again), and the most copies of `text` any published view showed. */
function again(t: { agent: FakeAgent; clock: ReturnType<typeof manualClock> }, store: StoreIO, text = REPLY) {
  const eng = new AskEngine(slot, t.agent, store, t.clock);
  const seen = { most: 0 };
  eng.subscribe(() => { seen.most = Math.max(seen.most, replies(eng.getSnapshot()).filter((x) => x.includes(text)).length); });
  return { eng, seen };
}

describe('a chat reopened from a record that still says its turn runs', () => {
  it('the turn ended before the reopen: one user row, one reply, one turn, and no view ever shows the reply twice', async () => {
    const { t, store, turnId, sid } = await leftRunning();
    await t.flush(2000);                       // the turn ends on the agent while nobody watches
    expect((t.agent as any).ss.get(sid).running).toBeNull();
    const { eng, seen } = again(t, store);
    eng.open();
    await t.flush(500);
    const s = eng.getSnapshot();
    expect(s.phase).toBe('ready');
    expect(users(s).map((u: any) => u.text)).toEqual(['hello!']);
    expect(replies(s)).toEqual([REPLY]);
    expect(s.conv.turns).toHaveLength(1);
    expect(s.status).toBeNull();
    expect(seen.most).toBe(1);
    // The record follows the agent's word on the turn, so the next open reads it as finished: in memory and as stored.
    expect(eng.record?.ph).toBe('completed');
    expect(eng.record?.t).toBe(turnId);
    expect(store.raw()).toContain('"ph":"completed"');
    expect(store.raw()).not.toContain('"ph":"working"');
  });
  it('the turn still runs at the reopen: it is shown running, and ends with its reply once', async () => {
    const { t, store, turnId } = await leftRunning();
    const { eng, seen } = again(t, store);
    eng.open();
    await t.flush(50);
    const cur = C.current(eng.getSnapshot().conv);
    expect(cur?.s.turnId).toBe(turnId);
    expect(C.running(cur)).toBe(true);
    await t.flush(3000);
    const s = eng.getSnapshot();
    expect(users(s).map((u: any) => u.text)).toEqual(['hello!']);
    expect(replies(s)).toEqual([REPLY]);
    expect(s.conv.turns).toHaveLength(1);
    expect(seen.most).toBe(1);
    expect(eng.record?.ph).toBe('completed');
  });
  it('the turn ends while the transcript is read: the transcript holds it, its receipt says closed, the reply shows once', async () => {
    const { t, store } = await leftRunning();
    const agent: any = t.agent;
    const real = agent.transcript.bind(agent);
    let once = false;
    agent.transcript = (...a: unknown[]) => { if (!once) { once = true; t.clock.run(2000); } return real(...a); };
    const { eng, seen } = again(t, store);
    eng.open();
    await t.flush(3000);
    const s = eng.getSnapshot();
    expect(C.running(C.current(s.conv))).toBe(false);
    expect(users(s).map((u: any) => u.text)).toEqual(['hello!']);
    expect(replies(s)).toEqual([REPLY]);
    expect(s.conv.turns).toHaveLength(1);
    expect(seen.most).toBe(1);
  });
  it('the turn ends after the transcript was read and before its receipt: the reply is read back from the transcript, once', async () => {
    const { t, store } = await leftRunning();
    const agent: any = t.agent;
    const real = agent.receipt.bind(agent);
    let once = false;
    // The transcript read at the open holds only the prompt; by the receipt read the agent has closed the turn.
    agent.receipt = (...a: unknown[]) => { if (!once) { once = true; t.clock.run(2000); } return real(...a); };
    const { eng, seen } = again(t, store);
    eng.open();
    await t.flush(3000);
    const s = eng.getSnapshot();
    expect(users(s).map((u: any) => u.text)).toEqual(['hello!']);
    expect(replies(s)).toEqual([REPLY]);
    expect(s.conv.turns).toHaveLength(1);
    expect(seen.most).toBe(1);
    expect(calls(t.agent, 'transcript').length).toBeGreaterThan(1);
  });
  it('the transcript already holds the turn while its receipt still says it runs (the agent saves a turn before it marks it ended): one reply once it ends', async () => {
    const { t, store, turnId, sid } = await leftRunning();
    await t.flush(2000);
    expect((t.agent as any).ss.get(sid).running).toBeNull();
    const agent: any = t.agent;
    const real = agent.receipt.bind(agent);
    let n = 0;
    agent.receipt = (...a: unknown[]) => { if (++n <= 1) { agent.log.push(['receipt', a]); return Promise.resolve({ turn_id: turnId, state: 'dispatched' }); } return real(...a); };
    const { eng } = again(t, store);
    eng.open();
    await t.flush(3000);
    const s = eng.getSnapshot();
    expect(C.running(C.current(s.conv))).toBe(false);
    expect(users(s).map((u: any) => u.text)).toEqual(['hello!']);
    expect(replies(s)).toEqual([REPLY]);
    expect(s.conv.turns).toHaveLength(1);
  });
  it('a turn that failed before the reopen reads as failed from the transcript, once', async () => {
    const { t, store } = await leftRunning({ script: [[{ k: 'text', text: 'Partial.' }, { k: 'fail', code: 'provider_error' }]] });
    await t.flush(2000);
    const { eng, seen } = again(t, store, 'Partial.');
    eng.open();
    await t.flush(500);
    const s = eng.getSnapshot();
    expect(s.conv.turns).toHaveLength(1);
    expect(replies(s)).toEqual(['Partial.']);
    expect(seen.most).toBe(1);
    // The record took the receipt's word (failed), so the transcript read for it was the failed turn's (the turn list beside it).
    expect(eng.record?.ph).toBe('failed');
    expect(calls(t.agent, 'turns').length).toBeGreaterThan(0);
  });
  it('the receipt cannot be read at the open: the turn is shown from the replay as before, and its end still leaves one reply', async () => {
    const { t, store, turnId } = await leftRunning();
    await t.flush(2000);
    const agent: any = t.agent;
    const real = agent.receipt.bind(agent);
    let n = 0;
    agent.receipt = (...a: unknown[]) => { if (++n <= 2) { agent.log.push(['receipt', a]); return Promise.reject({ status: 500 }); } return real(...a); };
    const { eng } = again(t, store);
    eng.open();
    await t.flush(3000);
    const s = eng.getSnapshot();
    expect(replies(s)).toEqual([REPLY]);
    expect(s.conv.turns).toHaveLength(1);
    expect(calls(t.agent, 'receipt').length).toBeGreaterThan(2);
    expect(eng.record?.t).toBe(turnId);
  });
  it('a receipt about another turn decides nothing: the running turn is still shown from its replay', async () => {
    const { t, store, turnId } = await leftRunning({ script: [[{ k: 'text', text: 'First part. ' }, { k: 'text', text: 'Second part.' }]] });
    await t.flush(500);                        // the first text is out (and only in the replay), the turn still runs
    const agent: any = t.agent;
    agent.receipt = (...a: unknown[]) => { agent.log.push(['receipt', a]); return Promise.resolve({ turn_id: 'another-turn', state: 'completed' }); };
    const { eng } = again(t, store, 'First part.');
    eng.open();
    await t.flush(100);
    const s = eng.getSnapshot();
    expect(C.current(s.conv)?.s.turnId).toBe(turnId);
    expect(C.running(C.current(s.conv))).toBe(true);
    expect(replies(s)).toEqual(['First part. ']);
    expect(store.raw()).not.toContain('another-turn');
    expect(store.raw()).toContain('"ph":"working"');
  });
  it('two turns with the same text stay two: the turn decides, never the text', async () => {
    const store = memStore();
    const t = await setup({ pace: 400, script: [[{ k: 'text', text: REPLY }], [{ k: 'text', text: REPLY }]] }, store);
    t.eng.send('hello!');
    await t.flush(2000);
    t.eng.send('hello!');
    await t.flush(30);
    expect(t.eng.record?.ph).toBe('working');
    t.eng.end();
    await t.flush(2000);
    const { eng, seen } = again(t, store);
    eng.open();
    await t.flush(500);
    const s = eng.getSnapshot();
    expect(users(s).map((u: any) => u.text)).toEqual(['hello!', 'hello!']);
    expect(replies(s)).toEqual([REPLY, REPLY]);
    expect(s.conv.turns).toHaveLength(2);
    expect(s.status).toBeNull();
    expect(seen.most).toBe(2);
  });
  it('a turn cancelled (by another client) before the reopen reads as the transcript\'s, once', async () => {
    const { t, store, turnId, sid } = await leftRunning({ script: [[{ k: 'text', text: 'Part' }, { k: 'text', text: 'ial.' }]] });
    await t.flush(400);                        // the first text is out, the turn still runs
    (t.agent as any).cancel(sid, turnId);
    await t.flush(500);
    expect((t.agent as any).ss.get(sid).running).toBeNull();
    const { eng, seen } = again(t, store, 'Part');
    eng.open();
    await t.flush(500);
    const s = eng.getSnapshot();
    expect(s.conv.turns).toHaveLength(1);
    expect(replies(s)).toHaveLength(1);
    expect(seen.most).toBe(1);
    expect(eng.record?.ph).toBe('cancelled');
    expect(store.raw()).toContain('"ph":"cancelled"');
  });
  it('a turn the agent lost at a restart (interrupted) keeps its prompt and its outcome line: it is never taken for a transcript turn', async () => {
    const { t, store, turnId } = await leftRunning();
    // The turn never closed: the transcript holds only its prompt, and its receipt says interrupted.
    const agent: any = t.agent;
    agent.receipt = (sid: string, tid: string) => { agent.log.push(['receipt', [sid, tid]]); return Promise.resolve({ turn_id: tid, state: 'interrupted' }); };
    const { eng } = again(t, store);
    eng.open();
    await t.flush(300);                        // under the fake's pace: no text of the turn is out yet
    const s = eng.getSnapshot();
    expect(s.conv.turns).toHaveLength(1);
    expect(users(s).map((u: any) => u.text)).toEqual(['hello!']);
    expect(C.current(s.conv)?.s.turnId).toBe(turnId);
    expect(outcomes(s)).toEqual(['interrupted']);
    expect(replies(s)).toEqual([]);
    expect(calls(t.agent, 'transcript')).toHaveLength(1);
  });
  it('the turn\'s end is read by its receipt before the open\'s replay answers: still one turn, one reply, read back from the transcript', async () => {
    const { t, store, sid } = await leftRunning();
    await t.flush(2000);
    expect((t.agent as any).ss.get(sid).running).toBeNull();
    const agent: any = t.agent;
    agent.replay = (...a: unknown[]) => { agent.log.push(['replay', a]); return new Promise(() => {}); };
    const { eng, seen } = again(t, store);
    eng.open();
    await t.flush(3000);
    const s = eng.getSnapshot();
    expect(replies(s)).toEqual([REPLY]);
    expect(s.conv.turns).toHaveLength(1);
    expect(seen.most).toBe(1);
    expect(eng.record?.ph).toBe('completed');
  });
  it('another turn was admitted after the record\'s turn: the transcript read back keeps no turn id it cannot prove', async () => {
    const { t, store, turnId, sid } = await leftRunning();
    await t.flush(2000);
    // Another client asks a second question on the same session; it ends too. The record still names the first turn as running.
    await (t.agent as any).turn(sid, 'and another thing', 'hx-' + 'e'.repeat(32));
    await t.flush(2000);
    expect((t.agent as any).ss.get(sid).running).toBeNull();
    const { eng } = again(t, store);
    eng.open();
    await t.flush(500);
    const s = eng.getSnapshot();
    // Two turns, two replies (the script answers both the same): never a third copy rebuilt for the record's turn.
    expect(users(s).map((u: any) => u.text)).toEqual(['hello!', 'and another thing']);
    expect(replies(s)).toEqual([REPLY, REPLY]);
    expect(s.conv.turns).toHaveLength(2);
    // The agent's newest turn is not the record's: no transcript turn is taken for it (the last one is the other client's).
    expect(s.conv.turns.map((x) => x.s.turnId ?? null)).not.toContain(turnId);
    expect(s.status).toBeNull();
  });
});
