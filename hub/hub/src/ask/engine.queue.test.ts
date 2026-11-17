// Send while busy, end to end, against the scripted agent: follow-ups queued while a turn runs keep their order, are sent once, survive
// a Stop of the running turn as the agent reports it (a turn cancel leaves the agent's queue as it is: the queued message starts the
// next turn), and a row the person stops tracking says only that. The reload cases are in engine.test.ts.
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

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function setup(o: Partial<FakeOptions> = {}) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 200, realms: [REALM], ...o }, clock);
  const eng = new AskEngine(slot, agent, memStore(), clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  return { agent, eng, flush };
}
const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);
const users = (e: AskEngine) => C.blocks(e.getSnapshot().conv, 0).filter((b) => b.k === 'user').map((b: any) => b.msg as C.UserMsg);

describe('follow-ups sent while a turn runs', () => {
  it('two queued follow-ups: shown in the order sent, each sent once, both delivered, no key left', async () => {
    const t = await setup({ holdQueued: true, queuedGapMs: 50 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    t.eng.send('And a LICENSE');
    await t.flush(10);
    expect(users(t.eng).map((u) => [u.text, u.state])).toEqual([['Build me a small dashboard', 'sent'], ['Also add a README', 'queued'], ['And a LICENSE', 'queued']]);
    // Delivered: each row settles sent, in the order sent.
    const settled: string[] = [];
    t.eng.subscribe(() => { for (const u of users(t.eng)) if (u.state === 'sent' && u.text && !settled.includes(u.text)) settled.push(u.text); });
    await t.flush(8000);
    expect(calls(t.agent, 'command').map((c) => c[1][1])).toEqual(['Also add a README', 'And a LICENSE']);
    expect(settled.filter((x) => x !== 'Build me a small dashboard' && !x.includes('\n'))).toEqual(['Also add a README', 'And a LICENSE']);
    // The agent delivers queued messages as ONE user message, in the order admitted; the chat read back after that turn shows it so.
    const after = users(t.eng);
    expect(after.map((u) => u.text)).toEqual(['Build me a small dashboard', 'Also add a README\nAnd a LICENSE']);
    expect(after.every((u) => u.state === 'sent')).toBe(true);
    expect(t.eng.record?.k3).toBeUndefined();
  });
  it('Stop while a follow-up is queued: the turn stops, the follow-up starts the next turn (as the agent keeps it), sent once', async () => {
    const t = await setup({ holdQueued: true, queuedGapMs: 50 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    expect(users(t.eng)[1]).toMatchObject({ text: 'Also add a README', state: 'queued' });
    const first = C.current(t.eng.getSnapshot().conv)?.s.turnId;
    t.eng.stop();
    await t.flush(8000);
    expect(calls(t.agent, 'cancel').length).toBeGreaterThan(0);
    expect(calls(t.agent, 'command')).toHaveLength(1);
    const row = users(t.eng).find((u) => u.text === 'Also add a README');
    expect(row).toMatchObject({ state: 'sent' });
    // Its own turn ran after the stopped one (the chat is then read back from the transcript: the turn ids are the agent's).
    expect(first).toBeTruthy();
    expect(t.eng.record?.t).toBeTruthy();
    expect(t.eng.record?.t).not.toBe(first);
    expect(t.eng.getSnapshot().conv.turns).toHaveLength(2);
    expect(t.eng.record?.k3).toBeUndefined();
  });
  it('Stop tracking a queued follow-up drops only this page\'s tracking: the message is not cancelled and is never sent again', async () => {
    const t = await setup({ holdQueued: true, queuedGapMs: 50 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    const row = users(t.eng)[1]!;
    expect(row.state).toBe('queued');
    t.eng.dismiss(row.id);
    expect(users(t.eng).some((u) => u.id === row.id)).toBe(false);
    expect(t.eng.record?.k3).toBeUndefined();
    await t.flush(8000);
    expect(calls(t.agent, 'command')).toHaveLength(1);
  });
});
