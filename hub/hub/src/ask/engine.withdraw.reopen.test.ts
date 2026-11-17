// A take-back whose answer was lost, then the chat opened again (a reload, the dock reopened). The engine's memory of the press is gone;
// what the reopened row offers must come from what the agent reports, never from a guess: a message the agent withdrew shows as Taken
// back (no Remove, no Send again), and one it still holds is queued, where a second press only asks the agent again, which decides
// under its queue lock and never delivers or duplicates anything because of it.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import * as C from './conv';
import { AskEngine, resetSignHoldsForTests, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, type FakeOptions } from './fake';
import type { AskStore } from './logic';
import { actionsOf } from './rowActions';

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
  const store = memStore();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 200, realms: [REALM], holdQueued: true, queuedGapMs: 50, ...o }, clock);
  const eng = new AskEngine(slot, agent, store, clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  return { agent, eng, flush, store, clock };
}
const users = (e: AskEngine) => C.blocks(e.getSnapshot().conv, 0).filter((b) => b.k === 'user').map((b: any) => b.msg as C.UserMsg);
const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);

async function lostThenReopen(o: Partial<FakeOptions>) {
  const t = await setup(o);
  t.eng.send('Build me a small dashboard');
  await t.flush(250);
  t.eng.send('Also add a README');
  await t.flush(10);
  const row = users(t.eng)[1]!;
  expect(await t.eng.withdraw(row.id, 'remove')).toEqual({ k: 'unknown' });
  t.eng.end();
  const eng = new AskEngine(slot, t.agent, t.store, t.clock);
  eng.open();
  await t.flush(20);
  return { ...t, eng, text: row.text };
}

describe('an unknown take-back, then the chat opened again', () => {
  it('withdrawn at the agent (answer lost): the reopened row says Taken back and offers no Remove, no Edit of the queue, no Send again', async () => {
    const t = await lostThenReopen({ withdraw: 'lost' });
    const row = users(t.eng)[1]!;
    expect(row).toMatchObject({ via: 'command', state: 'notSent', reason: 'ask.withdrawn' });
    expect(actionsOf(row, null)).toEqual([]);
    await t.flush(8000);
    expect(calls(t.agent, 'command'), 'the message was sent once and never again').toHaveLength(1);
    expect(calls(t.agent, 'withdraw')).toHaveLength(1);
  });
  it('still queued at the agent (not withdrawn): the reopened row reads queued; a second Remove only asks the agent again, which decides', async () => {
    const t = await lostThenReopen({ withdraw: 'unconfirmed' });
    const row = users(t.eng)[1]!;
    expect(row).toMatchObject({ via: 'command', state: 'queued' });
    expect(actionsOf(row, null)).toEqual(['withdraw']);
    (t.agent as any).o.withdraw = undefined;
    expect(await t.eng.withdraw(row.id, 'remove')).toEqual({ k: 'withdrawn' });
    await t.flush(8000);
    expect(calls(t.agent, 'command'), 'sent once, never delivered after the take-back').toHaveLength(1);
    expect(users(t.eng).some((u) => u.id === row.id)).toBe(false);
  });
});
