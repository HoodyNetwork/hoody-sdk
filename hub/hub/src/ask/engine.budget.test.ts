// Ask's engine over the real budgeted stream: a stream the budget has no slot for says so at once, and the
// engine must still be able to open one when capacity comes back. The refusal reaches the engine after its
// io.stream() call has returned, so the engine never keeps a finished handle as its live stream.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { streamBudget } from '@core';
import { AGENT, boot, calls, onFetch, R1, TARGET, type Call, type Reply } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AskEngine, resetSignHoldsForTests, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock } from './fake';
import { liveIO } from './data';
import type { AskStore } from './logic';

const ACCOUNT = '64f0ada00000000000000001';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: R1, name: 'atlas' };
const computer = `${TARGET.project.id}/${TARGET.container.id}`;
const streamGets = (): Call[] => calls.filter((c) => c.url.startsWith(AGENT) && c.method === 'GET' && /\/sessions\/[^/]+\/stream$/.test(new URL(c.url).pathname));
const realTick = (ms = 4) => new Promise((r) => setTimeout(r, ms));

function store(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}

describe('Ask over the stream budget', () => {
  beforeEach(() => {
    resetSignHoldsForTests();
    boot({ realm: R1 });
    onFetch((c: Call): Reply => (c.method === 'GET' && /\/stream$/.test(new URL(c.url).pathname)
      ? { status: 200, headers: { 'content-type': 'text/event-stream' }, text: '', delayMs: 60000 }
      : { status: 404, body: { code: 'not_found' } }));
  });
  afterEach(() => streamBudget().reset());

  it('an idle panel reopened with no slot, then capacity comes back: the engine opens its stream (it kept no finished handle)', async () => {
    const clock = manualClock();
    const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [R1] }, clock);
    // Only the stream is the real budgeted one; everything else is the scripted agent.
    (agent as any).stream = (id: string, cursor: any, realm: string, h: any, rank?: any) => liveIO(TARGET).stream(id, cursor, realm, h, rank);
    const st = store();
    const run = async (ms: number) => {
      for (let left = ms; left > 0; left -= 10) {
        for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); }
        clock.run(Math.min(10, left));
        await realTick(1);
      }
      for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); }
    };
    // A conversation that has finished its turn, then the panel is closed.
    const first = new AskEngine(slot, agent, st, clock);
    first.open();
    await run(50);
    first.send('hello');
    await run(3000);
    first.stop();
    await run(50);
    const before = streamGets().length;
    // Reopened while every slot is held by better streams: the stream is refused at once.
    const held = Array.from({ length: 7 }, (_, i) => streamBudget().watch({ computer, key: `o${i}`, kind: 'session', level: 'stream', rank: 'open', open: () => ({ close: () => {} }) }));
    const second = new AskEngine(slot, agent, st, clock);
    second.open();
    await run(3000);
    expect(streamGets().length).toBe(before);
    held.forEach((x) => x.release());
    await run(12000);
    expect(streamGets().length).toBeGreaterThan(before);
    second.stop();
  });

  it('a stream the budget has no slot for is told as such (error("budget")), never as a lost connection', async () => {
    const held = Array.from({ length: 7 }, (_, i) => streamBudget().watch({ computer, key: `o${i}`, kind: 'session', level: 'stream', rank: 'open', open: () => ({ close: () => {} }) }));
    const why: unknown[] = [];
    const before = streamGets().length;
    const s = liveIO(TARGET).stream('sess-1', null, R1, { open: () => {}, frame: () => {}, error: (w?: unknown) => { why.push(w ?? 'lost'); } }, 'visible');
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await realTick(4);
    expect(why).toEqual(['budget']);
    expect(streamGets().length).toBe(before);
    s?.close();
    held.forEach((x) => x.release());
  });
});

// A better holder letting go lowers the open stream's budget rank
// in place. Read from the budget itself: with every other slot held at 'open', a 'visible' stream finds nothing to cut while
// this stream is 'open', and cuts it once it is 'bot'. One connection through the drop; a later raise reopens exactly once.
describe('Ask: a rank drop moves the stream in the budget, with no reconnect', () => {
  beforeEach(() => {
    resetSignHoldsForTests();
    boot({ realm: R1 });
    onFetch((c: Call): Reply => (c.method === 'GET' && /\/stream$/.test(new URL(c.url).pathname)
      ? { status: 200, headers: { 'content-type': 'text/event-stream' }, text: '', delayMs: 60000 }
      : { status: 404, body: { code: 'not_found' } }));
  });
  afterEach(() => streamBudget().reset());

  it('open, then bot: the same connection, now the one a visible stream cuts; open again reopens once', async () => {
    const clock = manualClock();
    const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [R1] }, clock);
    (agent as any).stream = (id: string, cursor: any, realm: string, h: any, rank?: any) => liveIO(TARGET).stream(id, cursor, realm, h, rank);
    const run = async (ms: number) => {
      for (let left = ms; left > 0; left -= 10) {
        for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); }
        clock.run(Math.min(10, left));
        await realTick(1);
      }
      for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); }
    };
    const eng = new AskEngine(slot, agent, store(), clock);
    eng.open();
    await run(50);
    eng.send('hello');
    await run(3000);
    eng.setWatch('stream', 'open');
    await run(200);
    const held = Array.from({ length: 6 }, (_, i) => streamBudget().watch({ computer, key: `h${i}`, kind: 'session', level: 'stream', rank: 'open', open: () => ({ close: () => {} }) }));
    await run(50);
    const opened = streamGets().length;
    expect(opened).toBeGreaterThan(0);
    // While 'open': a visible stream finds nothing below it to cut.
    const v1 = streamBudget().watch({ computer, key: 'v1', kind: 'session', level: 'stream', rank: 'visible', open: () => ({ close: () => {} }) });
    await run(50);
    expect(v1.mode().mode).not.toBe('stream');
    v1.release();
    // The better holder lets go: 'bot', moved in place (no new connection).
    eng.setWatch('stream', 'bot');
    await run(50);
    expect(streamGets().length).toBe(opened);
    // Raised again: exactly one reopen.
    eng.setWatch('stream', 'open');
    await run(200);
    expect(streamGets().length).toBe(opened + 1);
    eng.setWatch('stream', 'bot');
    await run(50);
    expect(streamGets().length).toBe(opened + 1);
    // Now 'bot': the visible stream cuts it.
    const v2 = streamBudget().watch({ computer, key: 'v2', kind: 'session', level: 'stream', rank: 'visible', open: () => ({ close: () => {} }) });
    await run(4000);
    expect(v2.mode().mode).toBe('stream');
    v2.release();
    held.forEach((x) => x.release());
    eng.stop();
  });
});
