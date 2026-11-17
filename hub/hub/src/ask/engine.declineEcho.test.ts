// engine.ts against the scripted agent (fake.ts): a follow-up sent while an approval waits (it stays queued behind it; here the
// approval is then declined from elsewhere, so the turn goes on and takes the message) is shown once,
// in its own place, never a second time when the agent's transcript or the command's commit reports it.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as C from './conv';
import { AskEngine, resetSignHoldsForTests, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts, type FakeOptions } from './fake';
import type { AskStore } from './logic';
import { world, type World } from './accept/env';

beforeEach(() => { resetSignHoldsForTests(); });

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function setup(o: Partial<FakeOptions> = {}) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], ...o }, clock);
  const eng = new AskEngine(slot, agent, memStore(), clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  return { agent, eng, flush, snap: () => eng.getSnapshot() };
}
const shown = (s: any, text: string) => C.blocks(s.conv, 0).filter((b: any) => b.k === 'user' && b.msg.text === text);

describe('a follow-up sent while an approval waits', () => {
  it.each([10, 200])('is sent once and shown once (pace %i ms)', async (pace) => {
    const t = await setup({ pace, script: [scripts.approval, [{ k: 'text', text: 'ok' }]] });
    t.eng.setAuto(false);
    t.eng.send('Add a chart');
    await t.flush(pace * 50);
    expect(t.snap().gate).toBeTruthy();
    t.eng.send('Use a CDN instead');
    for (let i = 0; i < 40; i++) {
      if (i === 2) t.agent.declineGates();
      await t.flush(pace);
      expect(shown(t.snap(), 'Use a CDN instead').length, `step ${i}`).toBeLessThanOrEqual(1);
    }
    await t.flush(5000);
    expect(t.agent.log.filter((x) => x[0] === 'command')).toHaveLength(1);
    expect(shown(t.snap(), 'Use a CDN instead')).toHaveLength(1);
    // Reopened from the agent's record, the message is still there once.
    t.eng.end?.();
  });
});

describe('a follow-up sent while an approval waits, in a chat opened cold (the AI page\'s fixture chat)', () => {
  let w: World | null = null;
  afterEach(() => { w?.dispose(); w = null; });
  it.each([10, 260])('is shown once (pace %i ms)', async (pace) => {
    w = world({ pace, seed: scripts.seed });
    const eng = w.pinned('s-today');
    eng.open();
    await w.flush(3000);
    expect(eng.getSnapshot().gate).toBeTruthy();
    eng.send('Then add a disk chart too.');
    for (let i = 0; i < 40; i++) {
      if (i === 2) w.agent.declineGates();
      await w.flush(pace);
      expect(shown(eng.getSnapshot(), 'Then add a disk chart too.').length, `step ${i}`).toBeLessThanOrEqual(1);
    }
    await w.flush(5000);
    expect(w.agent.log.filter((x) => x[0] === 'command' || x[0] === 'turn')).toHaveLength(1);
    expect(shown(eng.getSnapshot(), 'Then add a disk chart too.')).toHaveLength(1);
  });
});
