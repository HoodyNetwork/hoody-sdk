// "Reconnecting…" is said only after a stream that was open broke:
// every other catch-up of a running turn (a first read that finds it, the watch raised again, the dock reopened) shows
// the normal loading state. The status stays `reconnecting` in all of them (the turn's state is unsure until the
// replay and the stream answer), so the chat still reads as loading; only the line differs.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AskEngine, resetSignHoldsForTests, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, type Beat } from './fake';
import { factsOf, reachLine } from './source';
import strings from './strings.en.json';
import type { AskStore } from './logic';

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'global';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
const RECONNECTING = strings['ask.status.reconnecting'];
// A turn that parks at a gate (Auto-approve off): it stays running while the tests move the stream around.
const GATE: Beat[][] = [[{ k: 'text', text: 'Looking. ' }, { k: 'confirm', tool: 'edit_file', params: { path: '/home/ada/x' } }, { k: 'text', text: 'Done.' }]];

function sharedStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}

async function setup(script: Beat[][] | null = GATE) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], ...(script ? { script } : {}) }, clock);
  const st = sharedStore();
  const run = async (ms: number) => {
    for (let left = ms; left > 0; left -= 10) {
      for (let i = 0; i < 10; i++) { await Promise.resolve(); clock.run(0); }
      clock.run(Math.min(10, left));
    }
    for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); }
  };
  const eng = new AskEngine(slot, agent, st, clock);
  eng.open();
  await run(50);
  if (script) { eng.setAuto(false); await run(50); }
  eng.send('hello');
  await run(3000);
  return { clock, agent, st, eng, run };
}

/** Every reach line and status the engine publishes from now on. */
function watch(eng: AskEngine) {
  const lines: (string | null)[] = [], statuses: (string | null)[] = [], states: string[] = [];
  const take = () => {
    const s = eng.getSnapshot();
    const l = reachLine(s, 'atlas');
    lines.push(l && 'text' in l ? l.text : null);
    statuses.push(s.status);
    states.push(factsOf(s).state);
  };
  const off = eng.subscribe(take);
  return { lines, statuses, states, off, saw: (x: string) => lines.includes(x) };
}

describe('"Reconnecting…" only after a stream that was open broke', () => {
  beforeEach(() => resetSignHoldsForTests());

  it('the setup parks a running turn at its gate on an open stream', async () => {
    const t = await setup();
    expect(t.eng.getSnapshot().gates).toHaveLength(1);
    expect(t.eng.getSnapshot().status).toBe('waiting');
  });

  it('setWatch: the watch raised again catches up as loading, not Reconnecting…', async () => {
    const t = await setup();
    t.eng.setWatch('state');
    await t.run(100);
    const w = watch(t.eng);
    t.eng.setWatch('stream');
    await t.run(3000);
    w.off();
    expect(w.statuses).toContain('reconnecting'); // the catch-up really ran (and the chat was unsure meanwhile)
    expect(w.states).toContain('loading');
    expect(w.saw(RECONNECTING)).toBe(false);
    expect(t.eng.getSnapshot().status).toBe('waiting');
  });

  it('resume(): a dock closed and opened again catches up as loading, not Reconnecting…', async () => {
    const t = await setup();
    t.eng.suspend();
    await t.run(100);
    const w = watch(t.eng);
    t.eng.resume();
    await t.run(3000);
    w.off();
    expect(w.statuses).toContain('reconnecting');
    expect(w.saw(RECONNECTING)).toBe(false);
    expect(t.eng.getSnapshot().status).toBe('waiting');
  });

  it('adoptCurrent: a first read that finds a running turn this page had not shown catches up as loading, not Reconnecting…', async () => {
    const t = await setup();
    // A second page on the same store and agent: its first state read names the running turn it has not drawn yet.
    const second = new AskEngine(slot, t.agent, t.st, t.clock);
    const adopt = vi.spyOn(second as any, 'adoptCurrent');
    const w = watch(second);
    second.open();
    await t.run(3000);
    w.off();
    expect(adopt).toHaveBeenCalled();
    expect(w.statuses).toContain('reconnecting');
    expect(w.saw(RECONNECTING)).toBe(false);
    expect(second.getSnapshot().gates).toHaveLength(1);
    second.stop();
  });

  it('after a stream that was open broke, the catch-up (Check) says Reconnecting…, and the line clears once it is open again', async () => {
    const t = await setup();
    t.agent.dropStreams();
    await t.run(10);
    expect(t.eng.getSnapshot().status).toBe('lost');
    const w = watch(t.eng);
    t.eng.checkNow();
    await t.run(15_000);
    w.off();
    expect(w.saw(RECONNECTING)).toBe(true);
    expect(t.eng.getSnapshot().status).toBe('waiting');
    expect(reachLine(t.eng.getSnapshot(), 'atlas')).toBeNull();
  });

  it('adoptCurrent after a break: a turn another page started while this stream was down is read back as Reconnecting…', async () => {
    const t = await setup([[{ k: 'text', text: 'Hi.' }], GATE[0]!]);
    expect(t.eng.getSnapshot().status).toBeNull(); // the first turn ended; the stream stays open
    const adopt = vi.spyOn(t.eng as any, 'adoptCurrent');
    t.agent.dropStreams();
    await t.run(10);
    // Another page sends while this one's stream is down.
    const other = new AskEngine(slot, t.agent, t.st, t.clock);
    other.open();
    await t.run(50);
    other.send('again');
    const w = watch(t.eng);
    await t.run(15_000);
    w.off();
    expect(adopt).toHaveBeenCalled();
    expect(w.saw(RECONNECTING)).toBe(true);
    other.stop();
  });

  it('a break, then the dock closed and reopened: the reopen is deliberate, so no Reconnecting…', async () => {
    const t = await setup();
    t.agent.dropStreams();
    await t.run(10);
    t.eng.suspend();
    await t.run(100);
    const w = watch(t.eng);
    t.eng.resume();
    await t.run(15_000);
    w.off();
    expect(w.saw(RECONNECTING)).toBe(false);
    expect(t.eng.getSnapshot().status).toBe('waiting');
  });
});
