// The loader contract (chat-engine -> chat-ui): every ConvSnapshot an Ask source gives carries `activity` when the engine knows more
// than the facts say, computed by loadPhase from one engine snapshot. Two parts: the mapping (pure), and the timing the engine
// guarantees on a real conversation against the scripted agent (sending in the very snapshot that first shows the row; a chat
// reopened after its turn ended catches up and never shows that turn working).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import * as C from './conv';
import { AskEngine, resetSignHoldsForTests, type Slot, type Snapshot, type StoreIO } from './engine';
import { FakeAgent, manualClock, type FakeOptions } from './fake';
import type { AskStore } from './logic';
import { convSnapshot, type Host } from './source';

beforeEach(() => { resetSignHoldsForTests(); });

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
const HOST: Host = { computer: 'atlas', realm: 'Personal' };
const REPLY = 'Hello! How can I help you today?';

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
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
  return { clock, agent, eng, store, flush };
}
const view = (s: Snapshot) => convSnapshot(s, HOST, 0);
const replies = (s: Snapshot): string[] => C.blocks(s.conv, 0).filter((b) => b.k === 'reply').map((b: any) => b.text);
const userRows = (s: Snapshot) => C.blocks(s.conv, 0).filter((b) => b.k === 'user');
/** Every published view, from now on. */
function record(eng: AskEngine) {
  const out: { s: Snapshot; v: ReturnType<typeof view> }[] = [];
  eng.subscribe(() => { const s = eng.getSnapshot(); out.push({ s, v: view(s) }); });
  return out;
}

describe('convSnapshot carries the engine\'s activity (loadPhase)', () => {
  it('a first message: `sending` in the very view that first shows its row, and no view until the agent answers is blank', async () => {
    const t = await setup({ pace: 200, script: [[{ k: 'text', text: REPLY }]] });
    const seen = record(t.eng);
    t.eng.send('hello!');
    const first = seen.findIndex((x) => userRows(x.s).length > 0);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(seen[first]!.v.activity).toEqual({ phase: 'sending' });
    await t.flush(1000);
    // Between Send and the reply: every view says what is waited on (activity) or that a turn runs (facts).
    const before = seen.slice(first, seen.findIndex((x) => replies(x.s).some((r) => r.length > 0)));
    expect(before.length).toBeGreaterThan(0);
    for (const x of before) expect(!!x.v.activity || x.v.facts.turn).toBe(true);
    // Once the turn ends nothing is waited on.
    expect(view(t.eng.getSnapshot()).activity).toBeUndefined();
  });
  it('a chat reopened after its turn ended: catching up, never that turn working, and its reply once', async () => {
    const store = memStore();
    const t = await setup({ pace: 400, script: [[{ k: 'text', text: REPLY }]] }, store);
    t.eng.send('hello!');
    await t.flush(30);
    expect(t.eng.record?.ph).toBe('working');
    t.eng.end();
    await t.flush(2000);                                  // the turn ends while nobody watches
    const eng = new AskEngine(slot, t.agent, store, t.clock);
    const seen = record(eng);
    eng.open();
    await t.flush(500);
    expect(seen.some((x) => x.v.activity?.phase === 'catching_up')).toBe(true);
    for (const x of seen) {
      expect(x.v.facts.turn).toBe(false);
      expect(x.v.activity?.phase === 'working').toBe(false);
      expect(replies(x.s).filter((r) => r === REPLY).length).toBeLessThanOrEqual(1);
    }
    const end = view(eng.getSnapshot());
    expect(end.activity).toBeUndefined();
    expect(replies(eng.getSnapshot())).toEqual([REPLY]);
  });
  it('while the transcript of a turn that ended unseen is being read back, the view says catching up (and nothing runs)', async () => {
    const store = memStore();
    const t = await setup({ pace: 400, script: [[{ k: 'text', text: REPLY }]] }, store);
    t.eng.send('hello!');
    await t.flush(30);
    t.eng.end();
    await t.flush(2000);
    const agent: any = t.agent;
    const real = agent.transcript.bind(agent);
    let n = 0;
    // The open's read answers; the read back after the turn's receipt never does.
    agent.transcript = (...a: unknown[]) => (++n === 1 ? real(...a) : new Promise(() => {}));
    const eng = new AskEngine(slot, t.agent, store, t.clock);
    eng.open();
    await t.flush(500);
    expect(n).toBe(2);
    const v = view(eng.getSnapshot());
    expect(v.activity).toEqual({ phase: 'catching_up' });
    expect(v.facts.turn).toBe(false);
  });
  it('a chat reopened while its turn still runs: catching up until its receipt answers, then the turn is followed', async () => {
    const store = memStore();
    const t = await setup({ pace: 400, script: [[{ k: 'text', text: 'First part. ' }, { k: 'text', text: 'Second part.' }]] }, store);
    t.eng.send('hello!');
    await t.flush(30);
    t.eng.end();
    const eng = new AskEngine(slot, t.agent, store, t.clock);
    const seen = record(eng);
    eng.open();
    await t.flush(0);
    expect(seen.some((x) => x.v.activity?.phase === 'catching_up')).toBe(true);
    await t.flush(2000);
    expect(seen.some((x) => x.v.facts.turn)).toBe(true);
    expect(view(eng.getSnapshot()).activity).toBeUndefined();
    expect(replies(eng.getSnapshot())).toEqual(['First part. Second part.']);
  });
});
