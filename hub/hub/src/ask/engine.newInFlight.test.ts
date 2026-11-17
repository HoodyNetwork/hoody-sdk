// A first message is a 'sending' row with no turn until its create
// settles, and a later one until its turn is admitted. The person's New conversation then must not reset the open
// conversation: its text would be lost and, once the request has left, its outcome too. New waits (the header says why).
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
const say = (x: string) => [{ k: 'text', text: x }];

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
  return { agent, eng, flush };
}
/** Holds one agent method's answers (the request is made when let go) until released. */
function hold(agent: FakeAgent, m: 'create' | 'turn'): { release: () => void } {
  const host = agent as unknown as Record<string, (...a: unknown[]) => unknown>;
  const real = host[m]!.bind(agent);
  const waiting: Array<() => void> = [];
  let open = false;
  host[m] = (...a: unknown[]) => (open ? real(...a) : new Promise((res, rej) => waiting.push(() => { Promise.resolve(real(...a)).then(res, rej); })));
  return { release: () => { open = true; for (const w of waiting.splice(0)) w(); } };
}
const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m).length;
const rows = (eng: AskEngine) => C.blocks(eng.getSnapshot().conv, 0).filter((b) => b.k === 'user').map((b: any) => b.msg);

describe('New while a message is on its way', () => {
  it('a first message whose create is on its way: New does nothing; the row stays and is sent, its turn goes', async () => {
    const t = await setup({ script: [say('ok')] as any });
    const h = hold(t.agent, 'create');
    expect(t.eng.send('hi')).toBe(true);
    await t.flush(50);
    expect(rows(t.eng)).toEqual([expect.objectContaining({ text: 'hi', state: 'sending' })]);
    t.eng.newConversation();
    h.release();
    await t.flush(2000);
    expect(rows(t.eng)).toEqual([expect.objectContaining({ text: 'hi', state: 'sent' })]);
    expect(t.eng.record?.s).toBeTruthy();
    expect(calls(t.agent, 'turn')).toBe(1);
  });

  it('a first message whose create answer is lost: after New, the row still shows, unknown, with its Check', async () => {
    const t = await setup({ createLost: true });
    const h = hold(t.agent, 'create');
    expect(t.eng.send('hi')).toBe(true);
    await t.flush(50);
    t.eng.newConversation();
    h.release();
    await t.flush(2000);
    const row = rows(t.eng)[0];
    expect(row).toMatchObject({ via: 'create', state: 'unknown' });
    expect(t.eng.record, 'the record that holds its key stays').not.toBeNull();
    // Check again reads it back: the session the lost create made.
    t.eng.check(row.id);
    await t.flush(3000);
    expect(t.eng.record?.s).toBeTruthy();
    expect(rows(t.eng)[0].state).not.toBe('unknown');
  });

  it('a later message after a turn ended, its turn on its way: New goes at once (the session keeps its turn), and newWaits() is false', async () => {
    const t = await setup({ script: [say('one'), say('two')] as any });
    t.eng.send('first');
    await t.flush(2000);
    const sid = t.eng.record!.s!;
    expect(C.running(C.current(t.eng.getSnapshot().conv))).toBe(false);
    const h = hold(t.agent, 'turn');
    expect(t.eng.send('second')).toBe(true);
    await t.flush(50);
    expect(t.eng.inFlight()).toBe(true);
    expect(t.eng.newWaits()).toBe(false);
    t.eng.newConversation();
    expect(t.eng.record?.s ?? null).not.toBe(sid);
    expect(rows(t.eng)).toEqual([]);
    h.release();
    await t.flush(2000);
    expect(calls(t.agent, 'turn')).toBe(2);
  });

  it('inFlight(): true while the first message\'s create is on its way, false once it is sent', async () => {
    const t = await setup({ script: [say('ok')] as any });
    expect(t.eng.inFlight()).toBe(false);
    const h = hold(t.agent, 'create');
    t.eng.send('hi');
    await t.flush(50);
    expect(t.eng.inFlight()).toBe(true);
    h.release();
    await t.flush(2000);
    expect(t.eng.inFlight()).toBe(false);
  });

  it('with nothing on its way New still starts a new conversation at once', async () => {
    const t = await setup({ script: [say('ok')] as any });
    t.eng.send('first');
    await t.flush(2000);
    t.eng.newConversation();
    expect(t.eng.record).toBeNull();
    expect(rows(t.eng)).toEqual([]);
  });
});
