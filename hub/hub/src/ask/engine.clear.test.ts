// A turn that clears the conversation (the agent's /clear: event.clear) is followed by a read of the history, so
// what was shown before the clear does not stay on the page. The scripted agent (fake.ts) empties its transcript as the agent does.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import * as C from './conv';
import { AskEngine, resetSignHoldsForTests, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts, type Beat, type FakeOptions } from './fake';
import * as L from './logic';
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
const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);
const replies = (s: any) => C.blocks(s.conv, 0).filter((b) => b.k === 'reply').map((b: any) => b.text);
const users = (s: any) => C.blocks(s.conv, 0).filter((b) => b.k === 'user').map((b: any) => b.msg?.text);
const CLEAR: Beat[] = [{ k: 'clear' }];

describe('event.clear', () => {
  it('the turn state notes it (and only it)', () => {
    const s = L.initial({ turnId: 't1' });
    expect(s.cleared).toBe(false);
    const frame = (seq: number, type: string): L.Action => ({ type: 'frame', name: type.slice(6), data: { seq, incarnation: 'i1', turn_id: 't1', event: { type, data: {} } } });
    let st = L.reduce(s, frame(1, 'event.todo_list_updated'));
    expect(st.cleared).toBe(false);
    st = L.reduce(st, frame(2, 'event.clear'));
    expect(st.cleared).toBe(true);
  });

  it('a /clear turn that ends: the history is read again and the conversation shown is the cleared one', async () => {
    const t = await setup({ script: [scripts.dashboard, CLEAR] });
    t.eng.send('Build me a small dashboard');
    await t.flush(3000);
    expect(replies(t.snap()).join('')).not.toBe('');
    const before = calls(t.agent, 'transcript').length;
    t.eng.send('/clear');
    await t.flush(3000);
    expect(calls(t.agent, 'transcript').length).toBeGreaterThan(before);
    expect(replies(t.snap())).toEqual([]);
    expect(users(t.snap())).not.toContain('Build me a small dashboard');
  });

  it('a turn without event.clear is not read again on its own', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'Done.' }]] });
    t.eng.send('Build me a small dashboard');
    await t.flush(3000);
    const before = calls(t.agent, 'transcript').length;
    t.eng.send('And again');
    await t.flush(3000);
    expect(calls(t.agent, 'transcript').length).toBe(before);
    expect(users(t.snap())).toContain('Build me a small dashboard');
  });
});
