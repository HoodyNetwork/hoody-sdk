// start.askfirst.test.ts: New workflow's start leaves Approve automatically Off for that start only: the save card
// is what the person chose that start for. Everything else keeps the standing default: the next ordinary start is On, and a
// person's own switch wins over the exception from the moment they use it.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import { AskEngine, resetSignHoldsForTests, type Slot, type StartOutcome, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts } from './fake';
import type { AskStore } from './logic';

beforeEach(() => { resetSignHoldsForTests(); });

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
const OK = [{ k: 'text', text: 'ok' }];

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function setup(script: unknown[] = [scripts.dashboard, OK, OK, OK]) {
  const clock = manualClock();
  const store = memStore();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], script } as any, clock);
  const eng = new AskEngine(slot, agent, store, clock);
  const flush = async (ms = 2000) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush(0);
  return { agent, eng, store, clock, flush };
}
function start(eng: AskEngine, text: string, askFirst?: true): StartOutcome[] {
  const told: StartOutcome[] = [];
  eng.queueStart(text, (o) => told.push(o), undefined, askFirst);
  return told;
}
/** One session's switch writes and turns, in the order they left. */
const seq = (agent: FakeAgent, sid: string) => agent.log.filter((x) => (x[0] === 'yolo' || x[0] === 'turn') && x[1][0] === sid).map((x) => (x[0] === 'turn' ? 'turn' : `yolo:${String(x[1][1])}`));
const failOnce = (agent: any, m: string, err: unknown) => {
  const real = agent[m].bind(agent);
  let done = false;
  agent[m] = (...a: unknown[]) => { if (done) return real(...a); done = true; agent.log.push([m, a]); return Promise.reject(err); };
};

describe('New workflow: Approve automatically stays Off for this start only', () => {
  it('this start: no On is ever sent, the session is confirmed Off before its first turn, and the switch shows Off', async () => {
    const t = await setup();
    start(t.eng, 'Make a workflow', true);
    await t.flush();
    const sid = t.eng.record!.s!;
    expect(seq(t.agent, sid)[0]).toBe('yolo:false');
    expect(seq(t.agent, sid)).toContain('turn');
    expect(seq(t.agent, sid)).not.toContain('yolo:true');
    expect(t.eng.getSnapshot().auto.on).toBe(false);
  });
  it('this start over an open conversation: still Off, on a new session', async () => {
    const t = await setup();
    t.eng.send('Build me a small dashboard');
    await t.flush();
    const old = t.eng.record!.s!;
    expect(seq(t.agent, old)[0]).toBe('yolo:true');
    start(t.eng, 'Make a workflow', true);
    await t.flush();
    const sid = t.eng.record!.s!;
    expect(sid).not.toBe(old);
    expect(seq(t.agent, sid)[0]).toBe('yolo:false');
    expect(seq(t.agent, sid)).not.toContain('yolo:true');
  });
  it('the next ordinary start on the same engine is On again', async () => {
    const t = await setup();
    start(t.eng, 'Make a workflow', true);
    await t.flush();
    const first = t.eng.record!.s!;
    start(t.eng, 'Back up my files daily');
    await t.flush();
    const next = t.eng.record!.s!;
    expect(next).not.toBe(first);
    expect(seq(t.agent, next)[0]).toBe('yolo:true');
    expect(seq(t.agent, next).indexOf('turn')).toBeGreaterThan(0);
  });
  it('a start right after this one ended without a chat is On: the refused create', async () => {
    const t = await setup();
    failOnce(t.agent, 'create', { status: 422, code: 'bad_request' });
    const told = start(t.eng, 'Make a workflow', true);
    await t.flush();
    expect(told).toEqual(['notSent']);
    start(t.eng, 'Back up my files daily');
    await t.flush();
    expect(seq(t.agent, t.eng.record!.s!)[0]).toBe('yolo:true');
  });
  it('a start right after this one never left is On: send refused it', async () => {
    const t = await setup();
    const realSend = t.eng.send.bind(t.eng);
    (t.eng as any).send = () => false;
    const told = start(t.eng, 'Make a workflow', true);
    await t.flush();
    expect(told).toEqual(['notSent']);
    // The chip of the next conversation is not left at Off by a start that never left, whichever way the next one is sent.
    (t.eng as any).send = realSend;
    t.eng.send('Back up my files daily');
    await t.flush();
    expect(seq(t.agent, t.eng.record!.s!)[0]).toBe('yolo:true');
  });
  it('the person had switched Off before this start: the next start is still Off', async () => {
    const t = await setup();
    t.eng.setAuto(false);
    start(t.eng, 'Make a workflow', true);
    await t.flush();
    start(t.eng, 'Back up my files daily');
    await t.flush();
    const seen = seq(t.agent, t.eng.record!.s!);
    expect(seen[0]).toBe('yolo:false');
    expect(seen).not.toContain('yolo:true');
  });
  it('the person turns the switch On in this chat: it is written On, and the next start carries it', async () => {
    const t = await setup();
    start(t.eng, 'Make a workflow', true);
    await t.flush();
    const sid = t.eng.record!.s!;
    expect(t.eng.setAuto(true)).toBe(true);
    await t.flush();
    expect(seq(t.agent, sid)).toContain('yolo:true');
    expect(t.eng.getSnapshot().auto.on).toBe(true);
    start(t.eng, 'Back up my files daily');
    await t.flush();
    expect(seq(t.agent, t.eng.record!.s!)[0]).toBe('yolo:true');
  });
  it('the person turns it On and Off again in this chat: their Off carries, the exception does not bring On back', async () => {
    const t = await setup();
    start(t.eng, 'Make a workflow', true);
    await t.flush();
    t.eng.setAuto(true);
    await t.flush();
    t.eng.setAuto(false);
    await t.flush();
    start(t.eng, 'Back up my files daily');
    await t.flush();
    const seen = seq(t.agent, t.eng.record!.s!);
    expect(seen[0]).toBe('yolo:false');
    expect(seen).not.toContain('yolo:true');
  });
  it('New conversation after this start is On', async () => {
    const t = await setup();
    start(t.eng, 'Make a workflow', true);
    await t.flush();
    t.eng.newConversation();
    await t.flush(0);
    t.eng.send('Back up my files daily');
    await t.flush();
    expect(seq(t.agent, t.eng.record!.s!)[0]).toBe('yolo:true');
  });
  it('the person\'s Off set aside by this start does not outlive it: after New conversation the next start is On', async () => {
    const t = await setup();
    t.eng.setAuto(false);
    start(t.eng, 'Make a workflow', true);
    await t.flush();
    t.eng.newConversation();
    await t.flush(0);
    start(t.eng, 'Back up my files daily');
    await t.flush();
    expect(seq(t.agent, t.eng.record!.s!)[0]).toBe('yolo:true');
  });
  it('a follow-up in this chat stays Off and writes no On', async () => {
    const t = await setup();
    start(t.eng, 'Make a workflow', true);
    await t.flush();
    const sid = t.eng.record!.s!;
    t.eng.send('Make it run nightly');
    await t.flush();
    expect(seq(t.agent, sid).filter((x) => x === 'turn')).toHaveLength(2);
    expect(seq(t.agent, sid)).not.toContain('yolo:true');
  });
  it('this chat reopened (a reload, or the chat page\'s own engine) shows Off, and can be turned On', async () => {
    const t = await setup();
    start(t.eng, 'Make a workflow', true);
    await t.flush();
    const sid = t.eng.record!.s!;
    const again = new AskEngine(slot, t.agent, t.store, t.clock);
    again.open();
    await t.flush();
    expect(again.record?.s).toBe(sid);
    expect(again.getSnapshot().auto.on).toBe(false);
    expect(seq(t.agent, sid)).not.toContain('yolo:true');
    expect(again.setAuto(true)).toBe(true);
    await t.flush();
    expect(again.getSnapshot().auto.on).toBe(true);
    expect(seq(t.agent, sid)).toContain('yolo:true');
  });
  it('the Off answer lost or refused: the first message does not go, as with the person\'s own Off', async () => {
    const t = await setup();
    failOnce(t.agent, 'yolo', { status: 422, code: 'bad_request' });
    start(t.eng, 'Make a workflow', true);
    await t.flush();
    expect(seq(t.agent, t.eng.record!.s!)).not.toContain('turn');
  });
  it('without the flag a start is exactly today\'s: On before its first turn', async () => {
    const t = await setup();
    start(t.eng, 'Back up my files daily');
    await t.flush();
    expect(seq(t.agent, t.eng.record!.s!)[0]).toBe('yolo:true');
  });
});
