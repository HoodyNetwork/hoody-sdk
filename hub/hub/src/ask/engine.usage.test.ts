// Details > Usage keeps the counts this page saw stream for a turn
// when the conversation is rebuilt from the transcript (a history read owed after a lost stream, or the same chat opened again),
// whose turns carry no counts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { AskEngine, UsageLedger, resetSignHoldsForTests, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, type Beat } from './fake';
import { convSnapshot, type Host } from './source';
import * as C from './conv';
import type { AskStore } from './logic';
import type { StreamHandlers } from './data';

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'global';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
const HOST: Host = { computer: 'atlas', realm: 'Personal' };
const GATE: Beat[][] = [[{ k: 'text', text: 'Looking. ' }, { k: 'confirm', tool: 'edit_file', params: { path: '/home/ada/x' } }, { k: 'text', text: 'Edited the file for you.' }]];

function store(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function setup(o: { ringMax?: number; usage?: UsageLedger; holdQueued?: boolean } = {}) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], script: GATE, ...(o.ringMax !== undefined ? { ringMax: o.ringMax } : {}), ...(o.holdQueued ? { holdQueued: true } : {}) }, clock);
  /** While set, the open stream delivers nothing (its frames reach only the agent's ring, read back by a replay). */
  const mute = { on: false };
  const opened: { h: StreamHandlers; closed: boolean }[] = [];
  const real = agent.stream.bind(agent);
  (agent as any).stream = (id: string, cursor: any, realm: string, h: StreamHandlers) => {
    const o = { h, closed: false };
    opened.push(o);
    const s = real(id, cursor, realm, { ...h, frame: (name: string, raw: string) => { if (!mute.on) h.frame(name, raw); } });
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
  const eng = new AskEngine(slot, agent, store(), clock, o.usage ? { usage: o.usage } : {});
  eng.open();
  await run(50);
  eng.setAuto(false);
  await run(50);
  eng.send('Look at the logs');
  await run(3000);
  const live = () => opened.filter((o) => !o.closed);
  const usage = () => convSnapshot(eng.getSnapshot(), HOST, 0).usage;
  /** The agent reports one foreground response of the running turn. */
  const done = (n: number) => {
    const conv = eng.getSnapshot().conv;
    (agent as any).emit(conv.sid, C.current(conv)!.s.turnId, 'event.stream_done', { cost_usd: 0.01, input_tokens: 10 * n, output_tokens: n, cache_read_tokens: 100 * n, cache_creation_tokens: 0 });
  };
  return { agent, clock, eng, run, live, usage, done, mute };
}
const counts = (n: number) => ({ input: 10 * n, output: n, cacheRead: 100 * n, cacheWrite: 0 });
const asked = (u: ReturnType<Awaited<ReturnType<typeof setup>>['usage']>) => (u ?? []).map((e) => [e.asked, e.responses]);

describe('Usage keeps the counts it saw across a history rebuild', () => {
  beforeEach(() => resetSignHoldsForTests());

  it('a stream lost mid-turn: the owed history replaces the turn, its two responses stay under its question', async () => {
    const t = await setup();
    expect(t.eng.getSnapshot().gates, 'the turn is parked, running').toHaveLength(1);
    t.done(1); t.done(2);
    await t.run(100);
    expect(asked(t.usage())).toEqual([['Look at the logs', [counts(1), counts(2)]]]);
    (t.agent as any).replay = () => Promise.reject({ status: 503 });
    t.live()[0]!.h.error();                   // the connection drops
    await t.run(100);
    t.eng.setWatch('state');
    t.eng.decide('once');
    await t.run(300);
    t.eng.checkNow();                         // the receipt says ended, the replay fails: the history is read and applied
    await t.run(20_000);
    const conv = t.eng.getSnapshot().conv;
    expect(C.current(conv)?.history, 'the turn shown is the transcript\'s now').toBe(true);
    expect(C.current(conv)?.s.responses, 'a transcript turn carries no counts').toEqual([]);
    expect(asked(t.usage())).toEqual([['Look at the logs', [counts(1), counts(2)]]]);
  });

  it('the same chat opened again (a computer that came back): the counts stay; nothing is counted twice', async () => {
    const t = await setup();
    t.done(1);
    t.eng.decide('once');
    await t.run(3000);
    expect(C.running(C.current(t.eng.getSnapshot().conv))).toBe(false);
    expect(asked(t.usage())).toEqual([['Look at the logs', [counts(1)]]]);
    t.eng.open();
    await t.run(5000);
    expect(C.current(t.eng.getSnapshot().conv)?.history, 'reopened from the transcript').toBe(true);
    expect(asked(t.usage())).toEqual([['Look at the logs', [counts(1)]]]);
  });
  it('a count that streamed just before the chat is opened again (not painted yet) is kept, though nothing replays it', async () => {
    const t = await setup({ ringMax: 0 });   // the agent keeps no frames: the reopened turn's replay and stream bring nothing back
    t.done(1);
    t.eng.open();                             // in the same step as the frame: its paint never ran
    await t.run(5000);
    expect(asked(t.usage())).toEqual([['Look at the logs', [counts(1)]]]);
  });
});

describe('Usage keeps every count it saw, once', () => {
  beforeEach(() => resetSignHoldsForTests());

  it('a running turn opened again after the agent dropped its first response from the replay keeps it, and adds the next', async () => {
    const t = await setup({ ringMax: 1 });   // the agent keeps only its newest frame
    t.done(1); t.done(2);
    await t.run(100);
    t.eng.open();                             // the replay brings back only the second response
    await t.run(3000);
    expect(C.running(C.current(t.eng.getSnapshot().conv)), 'the turn is still running').toBe(true);
    t.done(3);
    await t.run(100);
    expect(asked(t.usage())).toEqual([['Look at the logs', [counts(1), counts(2), counts(3)]]]);
  });

  it('a replay that brings a response and then the command starting the next turn keeps the response', async () => {
    const t = await setup({ holdQueued: true });   // a follow-up waits for the turn's end, then starts the next turn
    const first = C.current(t.eng.getSnapshot().conv)!.s.turnId;
    t.mute.on = true;                         // the page stops hearing the stream: what follows reaches it only by a replay
    (t.agent as any).receipt = () => Promise.reject({ status: 503 });   // and no receipt says the turn ended
    t.done(1);
    t.eng.send('And the disk?');              // queued behind the gate (it never declines it)
    t.agent.declineGates();                   // the gate is declined elsewhere; the turn ends; the follow-up starts the next turn
    await t.run(1000);
    t.eng.checkNow();                         // the replay: the response, the end, then the next turn's command
    await t.run(1000);
    t.mute.on = false;
    const conv = t.eng.getSnapshot().conv;
    expect(conv.turns.map((x) => x.s.turnId), 'the next turn\'s command dropped the unfinished turn it filled').not.toContain(first);
    expect(asked(t.usage())?.[0]).toEqual(['Look at the logs', [counts(1)]]);
  });

  it('the page\'s ledger outlives the engine: another engine opening the same chat lists what the first saw', async () => {
    const usage = new UsageLedger();
    const t = await setup({ usage });
    t.done(1);
    t.eng.decide('once');
    await t.run(3000);
    const sid = t.eng.getSnapshot().conv.sid as string;
    t.eng.end();
    const again = new AskEngine(slot, t.agent, { read: () => null, write: () => true } as any, t.clock, { sid, usage });
    again.open();
    await t.run(5000);
    expect(C.current(again.getSnapshot().conv)?.history, 'read from the transcript').toBe(true);
    expect(asked(convSnapshot(again.getSnapshot(), HOST, 0).usage)).toEqual([['Look at the logs', [counts(1)]]]);
    // The same session id under another computer of the account is another conversation: nothing of the first is listed for it.
    again.end();
    const other = new AskEngine({ ...slot, computer: 'c0a7150000000000000000b2' }, t.agent, { read: () => null, write: () => true } as any, t.clock, { sid, usage });
    other.open();
    await t.run(5000);
    expect(convSnapshot(other.getSnapshot(), HOST, 0).usage).toEqual([]);
  });

  it('the ledger keeps the newest USAGE_SESSIONS sessions of the page, each under its account and computer', () => {
    const l = new UsageLedger();
    const e = (n: number): C.UsageEntry => ({ key: 't:A', turn: 1, asked: 'q', responses: [counts(n)] });
    for (let i = 0; i < 32; i++) l.fold('acct c1 s' + i, [e(i)]);
    expect(l.fold('acct c1 s0', []), 'the oldest of 32 is kept').toEqual([e(0)]);
    l.fold('acct c1 s32', [e(32)]);           // s1 is now the oldest
    expect(l.fold('acct c1 s1', [])).toEqual([]);
    expect(l.fold('acct c2 s0', []), 'another computer\'s session of the same id is another').toEqual([]);
  });
  it('a session with no counts takes no place in the ledger: opening many chats never pushes one with counts out', () => {
    const l = new UsageLedger();
    const e = (n: number): C.UsageEntry => ({ key: 't:A', turn: 1, asked: 'q', responses: [counts(n)] });
    l.fold('acct c1 seen', [e(1)]);
    for (let i = 0; i < 31; i++) l.fold('acct c1 s' + i, [e(i)]);
    for (let i = 0; i < 100; i++) l.fold('acct c1 empty' + i, []);
    expect(l.fold('acct c1 seen', []), 'the 32nd session with counts, after 100 chats with none').toEqual([e(1)]);
  });
  it('every engine the registry makes is given the page\'s one ledger', () => {
    const text = readFileSync(join(import.meta.dirname, 'registry.ts'), 'utf8');
    const made = [...text.matchAll(/new AskEngine\(([^;]*)\);/g)].map((m) => m[1]!);
    expect(made.length, 'the dock\'s engine and a pinned one').toBe(2);
    for (const args of made) expect(args).toMatch(/[{,]\s*usage\s*[,}]/);
    expect(text).toMatch(/^const usage = new UsageLedger\(\);$/m);
  });
});
