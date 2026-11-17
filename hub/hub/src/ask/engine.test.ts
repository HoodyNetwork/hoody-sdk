// engine.ts against the scripted agent (fake.ts) on a manual clock: the whole conversation flow, the C9 outcomes
// (create, turn, follow-up and decision answers lost and read back with the same key), gates, Stop, the stream
// lost and found again, the blocking states, and the reference-only store.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from 'vitest';
import * as C from './conv';
import { AskEngine, answeredLine, resetSignHoldsForTests, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts, type FakeOptions } from './fake';
import * as L from './logic';
import type { AskStore } from './logic';

// Sign-in holds live for the page (module-wide): every test starts with none.
beforeEach(() => { resetSignHoldsForTests(); });

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };

function memStore(): StoreIO & { raw: () => string } {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); }, raw: () => JSON.stringify(st) };
}
async function setup(o: Partial<FakeOptions> = {}, store = memStore(), at: Slot = slot, before?: (agent: FakeAgent) => void) {
  const clock = manualClock();
  const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], ...o }, clock);
  before?.(agent);
  const eng = new AskEngine(at, agent, store, clock);
  const flush = async (ms = 0) => {
    // Time moves in 10 ms steps with the promise queue drained at each, so a chain of timers and answers runs
    // exactly as far as `ms` reaches.
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  return { clock, agent, eng, store, flush, snap: () => eng.getSnapshot() };
}
const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);
const replies = (s: any) => C.blocks(s.conv, 0).filter((b) => b.k === 'reply').map((b: any) => b.text);
const users = (s: any) => C.blocks(s.conv, 0).filter((b) => b.k === 'user').map((b: any) => b.msg);

describe('a conversation', () => {
  it('first message: create, Approve automatically armed when switched On, turn, streamed reply, completed; the store holds no text', async () => {
    const t = await setup();
    t.eng.setAuto(true);
    expect(t.snap().phase).toBe('ready');
    expect(t.eng.send('Build me a small dashboard')).toBe(true);
    await t.flush(2000);
    const s = t.snap();
    expect(calls(t.agent, 'create')).toHaveLength(1);
    expect(calls(t.agent, 'yolo')[0]![1][1]).toBe(true);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    expect(replies(s)[0]).toContain('/home/ada/dash/index.html');
    expect(s.status).toBeNull();
    expect(users(s)[0]).toMatchObject({ text: 'Build me a small dashboard', state: 'sent' });
    expect(t.eng.record?.ph).toBe('completed');
    expect(t.store.raw()).not.toContain('dashboard');
    expect(t.store.raw()).toContain(t.eng.record!.s!);
  });
  it('a follow-up after the reply is a new turn on the same session with its own key', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'Added a README.' }]] });
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    t.eng.send('Also add a README');
    await t.flush(2000);
    const turns = calls(t.agent, 'turn');
    expect(turns).toHaveLength(2);
    expect(turns[0]![1][0]).toBe(turns[1]![1][0]);
    expect(turns[0]![1][2]).not.toBe(turns[1]![1][2]);
    expect(calls(t.agent, 'create')).toHaveLength(1);
    expect(replies(t.snap())).toEqual([expect.stringContaining('dash'), 'Added a README.']);
  });
  it('a follow-up while the turn runs is a command read at the next step, and it splits the turn', async () => {
    const t = await setup({ pace: 200 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    expect(t.snap().status).toBe('working');
    expect(C.routeFor(t.snap().conv)).toBe('command');
    t.eng.send('Also add a README');
    await t.flush(5000);
    expect(calls(t.agent, 'command')).toHaveLength(1);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    const bs = C.blocks(t.snap().conv, 0);
    const ui = bs.findIndex((b) => b.k === 'user' && (b as any).msg.text === 'Also add a README');
    expect(ui).toBeGreaterThan(0);
    expect((bs[ui] as any).msg.state).toBe('sent');
    // the agent's words after the follow-up land after it (here as a note in the step trail, before its tools)
    expect(JSON.stringify(bs.slice(ui))).toContain('Noted');
    expect(JSON.stringify(bs.slice(0, ui))).not.toContain('Noted');
  });
});

describe('C9: an unknown outcome keeps its key and text', () => {
  it('a lost create answer: "may have gone through"; Check status repeats the create with the same key and goes on', async () => {
    const t = await setup({ createLost: true });
    t.eng.send('Build me a small dashboard');
    await t.flush(100);
    const u = users(t.snap())[0];
    expect(u.state).toBe('unknown');
    expect(t.eng.send('another')).toBe(false);   // nothing new while one is unsettled
    t.eng.check(u.id);
    await t.flush(2000);
    const cr = calls(t.agent, 'create');
    expect(cr).toHaveLength(2);
    expect(cr[0]![1][1]).toBe(cr[1]![1][1]);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    expect(t.eng.record?.ph).toBe('completed');
  });
  it('a lost turn answer: Check status sends the same key; the agent answers its stored receipt and nothing runs twice', async () => {
    const t = await setup({ turnLost: true });
    t.eng.send('Build me a small dashboard');
    await t.flush(30);
    const u = users(t.snap())[0];
    expect(u.state).toBe('unknown');
    t.eng.check(u.id);
    await t.flush(2000);
    const tr = calls(t.agent, 'turn');
    expect(tr).toHaveLength(2);
    expect(tr[0]![1][2]).toBe(tr[1]![1][2]);
    expect(replies(t.snap())).toHaveLength(1);
    expect(users(t.snap())[0].state).toBe('sent');
  });
  it('a lost follow-up answer: Check status repeats the command with the same key', async () => {
    const t = await setup({ pace: 200, commandLost: true });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    const u = users(t.snap()).find((x: any) => x.text === 'Also add a README');
    expect(u.state).toBe('unknown');
    t.eng.check(u.id);
    await t.flush(5000);
    const cm = calls(t.agent, 'command');
    expect(cm).toHaveLength(2);
    expect(cm[0]![1][2]).toBe(cm[1]![1][2]);
    expect(users(t.snap()).find((x: any) => x.text === 'Also add a README').state).toBe('sent');
  });
});

describe('approval and question cards', () => {
  it('Allow once answers the gate the person saw, folds to a decided line, and the turn goes on', async () => {
    const t = await setup({ script: [scripts.approval] });
    t.eng.setAuto(false);
    t.eng.send('Add a chart');
    await t.flush(500);
    const s = t.snap();
    expect(s.status).toBe('waiting');
    expect(s.gate).toMatchObject({ kind: 'confirm', tool: 'bash' });
    t.eng.decide('once');
    await t.flush(1000);
    const body = calls(t.agent, 'confirm')[0]![1][1] as any;
    expect(body).toMatchObject({ gate_id: s.gate!.id, generation: 1, approved: true, remember: false });
    expect(body.request_id).toBeTruthy();
    const bs = C.blocks(t.snap().conv, 0);
    expect(bs.find((b) => b.k === 'decided')).toMatchObject({ d: { kind: 'once', text: 'npm install chart.js' } });
    expect(replies(t.snap()).pop()).toContain('chart.js');
    expect(t.snap().gate).toBeNull();
  });
  it('a fresh Ask shows Approve automatically On (the default), also after New conversation; the first send arms On on the session', async () => {
    const t = await setup({ script: [scripts.approval] });
    expect(t.eng.autoBefore()).toBe(true);
    expect(t.snap().auto.on ?? t.eng.autoBefore()).toBe(true);
    t.eng.send('Add a chart');
    await t.flush(500);
    expect(calls(t.agent, 'yolo').map((c) => c[1][1])).toEqual([true]);
    expect(t.snap().auto.on).toBe(true);
    expect(t.snap().gate).toBeNull();   // armed On before the first turn: nothing waits for the person
    t.eng.newConversation();
    expect(t.snap().auto.on ?? t.eng.autoBefore()).toBe(true);
  });
  it('a refused default On (a locked policy) leaves Approve automatically Off with the reason, the message still goes, and no later send re-arms it', async () => {
    const say = (x: string) => [{ k: 'text', text: x }];
    const t = await setup({ script: [say('a1'), say('a2')] as any });
    failOnce(t.agent, 'yolo', { status: 409, code: 'approval_policy_locked' });
    t.eng.send('A one');
    await t.flush(2000);
    expect(t.snap().auto.err).toBe('ask.autoLocked');
    expect(t.eng.autoShown()).not.toBe(true);   // never shown On: the session did not take it
    expect(t.snap().auto.errE).toMatchObject({ status: 409, code: 'approval_policy_locked' });   // the rejection stays for the note's Details
    expect(calls(t.agent, 'turn').length).toBe(1);   // arming that fails never stops the send: the agent asks first
    const from = t.agent.log.length;
    t.eng.send('A two');
    await t.flush(2000);
    expect(t.agent.log.slice(from).filter((x) => x[0] === 'yolo' && x[1][1] === true)).toEqual([]);   // never another On
    expect(t.eng.autoShown()).toBe(false);   // the Off guard's read of the session
  });
  it('a refused switch Off keeps its rejection for Details; a later clean switch drops it', async () => {
    const t = await setup();
    t.eng.setAuto(true);
    t.eng.send('One');
    await t.flush(2000);
    failOnce(t.agent, 'yolo', { status: 422, code: 'bad_request' });
    t.eng.setAuto(false);
    await t.flush(500);
    expect(t.snap().auto.err).toBe('ask.autoFailOff');
    expect(t.snap().auto.errE).toMatchObject({ code: 'bad_request' });
    t.eng.setAuto(false);
    await t.flush(500);
    expect(t.snap().auto.err).toBe('');
    expect(t.snap().auto.errE).toBeUndefined();
  });
  it('a new attempt drops the earlier rejection even when it fails without one (the answer names another mode)', async () => {
    const t = await setup();
    t.eng.setAuto(true);
    t.eng.send('One');
    await t.flush(2000);
    failOnce(t.agent, 'yolo', { status: 422, code: 'bad_request' });
    t.eng.setAuto(false);
    await t.flush(500);
    expect(t.snap().auto.errE).toMatchObject({ code: 'bad_request' });
    (t.agent as any).yolo = (...a: unknown[]) => { t.agent.log.push(['yolo', a]); return Promise.resolve({ yolo: true }); };
    t.eng.setAuto(false);
    await t.flush(500);
    expect(t.snap().auto.err).toBe('ask.autoFailOff');   // the session still says On: no refusal to show
    expect(t.snap().auto.errE).toBeUndefined();
  });
  it('a conversation reopened from Recent is never armed On by the default: its send confirms Off first', async () => {
    const say = (x: string) => [{ k: 'text', text: x }];
    const store = memStore();
    const t = await setup({ script: [say('a1'), say('a2')] as any }, store);
    t.eng.setAuto(false);
    t.eng.send('A one');
    await t.flush(2000);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);   // a reload picks the stored conversation up
    t2.open();
    await t.flush(1000);
    expect(t2.autoBefore()).toBe(false);
    expect(t2.autoShown()).toBe(false);
  });
  it('an On chosen in one conversation never carries into another opened from Recent: a send there confirms Off first', async () => {
    const say = (x: string) => [{ k: 'text', text: x }];
    const t = await setup({ script: [say('b1'), say('a1'), say('b2')] as any });
    t.eng.setAuto(false);
    t.eng.send('B one');
    await t.flush(2000);
    const b = t.eng.record!.k1, sidB = t.eng.record!.s!;
    t.eng.newConversation();
    t.eng.setAuto(true);
    t.eng.send('A one');
    await t.flush(2000);
    expect(t.snap().auto.on).toBe(true);
    t.eng.openConversation(b);
    await t.flush(1000);
    expect(t.eng.autoShown()).toBe(false);
    (t.agent as any).ss.get(sidB).yolo = true;   // another client switches B On; its event never reaches this page
    const from = t.agent.log.length;
    t.eng.send('B two');
    await t.flush(2000);
    const log = t.agent.log.slice(from).map((x) => x[0]);
    expect(log.indexOf('yolo'), log.join(' ')).toBeGreaterThan(-1);
    expect(log.indexOf('yolo')).toBeLessThan(log.indexOf('turn'));
    expect((t.agent as any).ss.get(sidB).yolo).toBe(false);
  });
  it('an On chosen in one conversation is dropped on opening another even when that one\'s mode cannot be read: a send there confirms Off first', async () => {
    const say = (x: string) => [{ k: 'text', text: x }];
    const t = await setup({ script: [say('b1'), say('a1'), say('b2')] as any });
    t.eng.send('B one');
    await t.flush(2000);
    const b = t.eng.record!.k1, sidB = t.eng.record!.s!;
    t.eng.newConversation();
    t.eng.setAuto(true);
    t.eng.send('A one');
    await t.flush(2000);
    failOnce(t.agent, 'approval', { status: 503 });   // the opening read of B fails
    t.eng.openConversation(b);
    await t.flush(1000);
    expect(t.eng.autoShown()).toBeNull();
    (t.agent as any).ss.get(sidB).yolo = true;
    const from = t.agent.log.length;
    t.eng.send('B two');
    await t.flush(2000);
    const log = t.agent.log.slice(from).map((x) => x[0]);
    expect(log.indexOf('yolo'), log.join(' ')).toBeGreaterThan(-1);
    expect(log.indexOf('yolo')).toBeLessThan(log.indexOf('turn'));
    expect((t.agent as any).ss.get(sidB).yolo).toBe(false);
  });
  it('Check status on a pending turn row after an explicit Off never takes the session\'s On as the person\'s: the retype puts Off first [recovery by reopen]', async () => {
    const store = memStore();
    const t = await setup({ script: [[{ k: 'text', text: 'First.' }], [{ k: 'text', text: 'Second.' }]] }, store);
    t.eng.send('One');
    await t.flush(2000);
    const sid = t.eng.record!.s!;
    failOnce(t.agent, 'turn', { status: 502, pending: true });   // lost before the agent recorded it
    t.eng.send('Two');
    await t.flush(30);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(500);
    t2.setAuto(false);
    await t.flush(300);
    expect(t2.autoShown()).toBe(false);
    (t.agent as any).ss.get(sid).yolo = true;   // another client switches On; no event here
    const row = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown');
    expect(row).toMatchObject({ text: '', via: 'turn' });
    t2.check(row.id);
    await t.flush(2000);
    const from = t.agent.log.length;
    expect(t2.send('Two')).toBe(true);
    await t.flush(2000);
    const log = t.agent.log.slice(from).map((x) => x[0]);
    expect(log.indexOf('yolo'), log.join(' ')).toBeGreaterThan(-1);
    expect(log.indexOf('yolo')).toBeLessThan(log.indexOf('turn'));
    expect((t.agent as any).ss.get(sid).yolo).toBe(false);
  });
  it('Check status after a lost create (the turn read of adoptTurn) after an explicit Off never takes the session\'s On as the person\'s [recovery by adoptTurn]', async () => {
    const store = memStore();
    const t = await setup({ createLost: true }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(100);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(50);
    t2.setAuto(false);
    expect((t.agent as any).ss.size).toBe(1);
    for (const x of (t.agent as any).ss.values()) x.yolo = true;   // another client switched the session On; no event here
    const row = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown');
    expect(row).toMatchObject({ via: 'create', text: '' });
    t2.check(row.id);
    await t.flush(3000);
    const sid = t2.record!.s!;
    expect(t2.autoShown()).toBe(true);   // adoptTurn's read shows the session's On, and never takes it as the person's
    const from = t.agent.log.length;
    expect(t2.send('Build me a small dashboard')).toBe(true);
    await t.flush(500);
    const log = t.agent.log.slice(from).map((x) => x[0]);
    expect(log.indexOf('yolo'), log.join(' ')).toBeGreaterThan(-1);
    expect(log.indexOf('yolo')).toBeLessThan(log.indexOf('turn'));
    expect((t.agent as any).ss.get(sid).yolo).toBe(false);
  });
  it('after the person\'s On, an Off the session reports ends it: a later On by another client is guarded again', async () => {
    const say = (x: string) => [{ k: 'text', text: x }];
    const t = await setup({ script: [say('a1'), say('a2')] as any });
    t.eng.setAuto(true);
    t.eng.send('A one');
    await t.flush(2000);
    const sid = t.eng.record!.s!;
    (t.agent as any).ss.get(sid).yolo = false;
    (t.eng as any).autoFrame({ event: { data: { enabled: false } } });   // the session's own Off event
    expect(t.eng.autoShown()).toBe(false);
    (t.agent as any).ss.get(sid).yolo = true;   // then On again, its event never reaching this page
    const from = t.agent.log.length;
    t.eng.send('A two');
    await t.flush(2000);
    const log = t.agent.log.slice(from).map((x) => x[0]);
    expect(log.indexOf('yolo'), log.join(' ')).toBeGreaterThan(-1);
    expect(log.indexOf('yolo')).toBeLessThan(log.indexOf('turn'));
  });
  it('a refused On leaves no On behind: after another client\'s hidden On, the next send still puts Off first', async () => {
    const say = (x: string) => [{ k: 'text', text: x }];
    const t = await setup({ script: [say('a1'), say('a2')] as any });
    t.eng.send('A one');
    await t.flush(2000);
    const sid = t.eng.record!.s!;
    t.eng.setAuto(false);
    await t.flush(300);
    failOnce(t.agent, 'yolo', { status: 409, code: 'approval_policy_locked' });
    t.eng.setAuto(true);
    await t.flush(300);
    expect(t.snap().auto.err).toBe('ask.autoLocked');
    expect(t.eng.autoShown()).toBe(false);
    (t.agent as any).ss.get(sid).yolo = true;   // another client switches On; no event here
    const from = t.agent.log.length;
    t.eng.send('A two');
    await t.flush(2000);
    const log = t.agent.log.slice(from).map((x) => x[0]);
    expect(log.indexOf('yolo'), log.join(' ')).toBeGreaterThan(-1);
    expect(log.indexOf('yolo')).toBeLessThan(log.indexOf('turn'));
  });
  it('New conversation after an Off: the new one starts On again (the default) and its first send arms On', async () => {
    const say = (x: string) => [{ k: 'text', text: x }];
    const t = await setup({ script: [say('a1'), say('b1')] as any });
    t.eng.setAuto(false);
    t.eng.send('A one');
    await t.flush(2000);
    expect(t.eng.autoShown()).toBe(false);
    t.eng.newConversation();
    expect(t.eng.autoShown()).toBe(true);
    const from = t.agent.log.length;
    t.eng.send('B one');
    await t.flush(2000);
    expect(t.agent.log.slice(from).filter((x) => x[0] === 'yolo').map((x) => x[1][1])).toEqual([true]);
  });
  it('a reopened conversation whose session is On shows On, and the send puts Off first, visibly: a read is never the person\'s On', async () => {
    const say = (x: string) => [{ k: 'text', text: x }];
    const store = memStore();
    const t = await setup({ script: [say('a1'), say('a2')] as any }, store);
    t.eng.setAuto(true);
    t.eng.send('A one');
    await t.flush(2000);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);   // a reload
    t2.open();
    await t.flush(1000);
    expect(t2.autoShown()).toBe(true);
    const from = t.agent.log.length;
    t2.send('A two');
    await t.flush(2000);
    const log = t.agent.log.slice(from).map((x) => x[0]);
    expect(log.indexOf('yolo'), log.join(' ')).toBeGreaterThan(-1);
    expect(log.indexOf('yolo')).toBeLessThan(log.indexOf('turn'));
    expect(t2.autoShown()).toBe(false);
    expect(t2.getSnapshot().auto.note).toBe('ask.autoOffDone');
  });
  it('an older mode read answering after a newer one is dropped: it never shows On over a confirmed Off, and the next send still guards', async () => {
    const say = (x: string) => [{ k: 'text', text: x }];
    const store = memStore();
    const t = await setup({ script: [say('a1'), say('a2'), say('a3')] as any }, store);
    t.eng.setAuto(true);
    t.eng.send('A one');
    await t.flush(2000);
    const sid = t.eng.record!.s!;
    // The reload's opening read is answered now (On) but delivered late.
    const real = (t.agent as any).approval.bind(t.agent);
    let release: () => void = () => {};
    let held = false;
    (t.agent as any).approval = (...a: unknown[]) => {
      if (held) return real(...a);
      held = true;
      const p = real(...a);
      return new Promise((res, rej) => { release = () => { p.then(res, rej); }; });
    };
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(500);
    (t.agent as any).ss.get(sid).yolo = false;   // another client switches Off, no event here
    t2.send('A two');
    await t.flush(2000);
    expect(t2.autoShown()).toBe(false);
    release();
    await t.flush(100);
    expect(t2.autoShown()).toBe(false);
    (t.agent as any).ss.get(sid).yolo = true;   // and On again, no event here
    const from = t.agent.log.length;
    t2.send('A three');
    await t.flush(2000);
    const log = t.agent.log.slice(from).map((x) => x[0]);
    expect(log.indexOf('yolo'), log.join(' ')).toBeGreaterThan(-1);
    expect(log.indexOf('yolo')).toBeLessThan(log.indexOf('turn'));
  });
  it('Approve automatically off: the first send puts Off to the session instead of arming it', async () => {
    const t = await setup({ script: [scripts.approval] });
    t.eng.setAuto(false);
    t.eng.send('Add a chart');
    await t.flush(500);
    expect(calls(t.agent, 'yolo').map((c) => c[1][1])).toEqual([false]);
    expect(t.snap().gate).not.toBeNull();
  });
  it('Deny sends the reason; the card folds to "Denied"', async () => {
    const t = await setup({ script: [scripts.approval] });
    t.eng.setAuto(false);
    t.eng.send('Add a chart');
    await t.flush(500);
    t.eng.decide('deny', 'Not now');
    await t.flush(1000);
    expect(calls(t.agent, 'confirm')[0]![1][1]).toMatchObject({ approved: false, reason: 'Not now' });
    expect(C.blocks(t.snap().conv, 0).find((b) => b.k === 'decided')).toMatchObject({ d: { kind: 'deny', text: 'Not now' } });
  });
  it('a lost decision answer: "may have gone through", no second decision; Check status reads it back', async () => {
    const t = await setup({ script: [scripts.approval], decisionLost: true, pace: 50 });
    t.eng.setAuto(false);
    t.eng.send('Add a chart');
    await t.flush(1000);
    t.eng.decide('once');
    await t.flush(5);
    expect(t.snap().decision.unknown).toBe(true);
    t.eng.decide('deny');
    expect(calls(t.agent, 'confirm')).toHaveLength(1);
    t.eng.checkDecision();
    await t.flush(3000);
    expect(t.snap().decision.unknown).toBe(false);
    expect(calls(t.agent, 'confirm')).toHaveLength(1);
  });
  it('a question takes one answer', async () => {
    const t = await setup({ script: [scripts.question] });
    t.eng.send('Build it');
    await t.flush(500);
    expect(t.snap().gate).toMatchObject({ kind: 'question', options: ['8080', '3000'] });
    t.eng.answer('8080');
    await t.flush(1000);
    expect(calls(t.agent, 'answer')[0]![1][1]).toMatchObject({ answer: '8080' });
    // The folded line names the question and the option sent.
    expect(C.blocks(t.snap().conv, 0).find((b) => b.k === 'decided')).toMatchObject({ d: { kind: 'answered', text: 'Which port should the dashboard use?', answer: '8080' } });
  });
  it('an answer the person typed is sent as typed, and its decided line keeps only that it was their own answer, never its words', async () => {
    const t = await setup({ script: [scripts.question] });
    t.eng.send('Build it');
    await t.flush(500);
    t.eng.answer('port 9443 token hunter2');
    await t.flush(1000);
    expect(calls(t.agent, 'answer')[0]![1][1]).toMatchObject({ answer: 'port 9443 token hunter2' });
    const d = C.blocks(t.snap().conv, 0).find((b) => b.k === 'decided') as { d: C.Decided } | undefined;
    expect(d?.d).toMatchObject({ kind: 'answered', text: 'Which port should the dashboard use?', typed: true });
    expect(d?.d.answer).toBeUndefined();
    expect(JSON.stringify(t.snap().conv)).not.toContain('hunter2');
  });
  it('a message sent while a card is open never declines it: the card stays, the message is queued, and the agent reads it once the card is answered', async () => {
    const t = await setup({ script: [scripts.approval, [{ k: 'text', text: 'ok' }]] });
    t.eng.setAuto(false);
    t.eng.send('Add a chart');
    await t.flush(500);
    t.eng.send('Use a CDN instead');
    await t.flush(3000);
    expect(calls(t.agent, 'command')).toHaveLength(1);
    expect(t.snap().gate, 'the approval still waits').not.toBeNull();
    const row = () => Object.values(t.snap().conv.users).find((u) => u.text === 'Use a CDN instead');
    expect(row()?.state).toBe('queued');
    expect(C.blocks(t.snap().conv, 0).some((b) => b.k === 'decided')).toBe(false);
    t.eng.decide('once');
    await t.flush(3000);
    expect(row()?.state).toBe('sent');
    expect(C.blocks(t.snap().conv, 0).find((b) => b.k === 'decided')).toMatchObject({ d: { kind: 'once' } });
    expect(calls(t.agent, 'command')).toHaveLength(1);
  });
});

describe('Stop, a lost connection, failures', () => {
  it('Stop cancels the named turn; it ends "Stopped. Earlier steps may have run."', async () => {
    const t = await setup({ pace: 300 });
    t.eng.send('Build me a small dashboard');
    await t.flush(350);
    t.eng.stop();
    expect(t.snap().status).toBe('stopping');
    await t.flush(5000);
    expect(calls(t.agent, 'cancel')[0]![1][1]).toBe(t.eng.record!.t);
    const o = C.blocks(t.snap().conv, 0).find((b) => b.k === 'outcome') as any;
    expect(o).toMatchObject({ state: 'cancelled', effects: true });
  });
  it('the stream drops mid-turn: "Connection lost"; Check status reads and reopens', async () => {
    const t = await setup({ pace: 400, streamDrops: true });
    t.eng.send('Build me a small dashboard');
    await t.flush(900);   // the stream opens after one beat and drops after the next
    expect(t.snap().status).toBe('lost');
    t.eng.checkNow();
    await t.flush(10);
    expect(calls(t.agent, 'state').length).toBeGreaterThan(0);
    expect(calls(t.agent, 'replay').length).toBeGreaterThan(0);
    expect(calls(t.agent, 'stream').length).toBeGreaterThanOrEqual(2);
  });
  it('a rate-limited turn ends with its outcome and the time to try again', async () => {
    const t = await setup({ script: [[{ k: 'fail', code: 'rate_limit', retryAt: '2026-10-23T14:05:00Z' }]] });
    t.eng.send('hi');
    await t.flush(1000);
    const o = C.blocks(t.snap().conv, 0).find((b) => b.k === 'outcome') as any;
    expect(o).toMatchObject({ state: 'failed', code: 'rate_limit', retryAt: '2026-10-23T14:05:00Z' });
    expect(t.snap().conv.users[o.retry]?.text).toBe('hi');
  });
  it('a busy session: "Not sent" and the busy band', async () => {
    const t = await setup({ busy: true });
    t.eng.send('hi');
    await t.flush(500);
    expect(users(t.snap())[0]).toMatchObject({ state: 'notSent', reason: 'ask.busy' });
    expect(t.snap().band).toEqual({ k: 'busy' });
  });
});

describe('before anything is sent', () => {
  it('an agent without the needed capabilities: "can\'t take requests from the Hub yet"', async () => {
    const t = await setup({ caps: ['approval_policy'] });
    expect(t.snap()).toMatchObject({ phase: 'blocked', blocked: { key: 'ask.unsupported', act: 'agent' } });
  });
  it('signed in to another account', async () => {
    const t = await setup({ auth: 'other' });
    expect(t.snap().blocked?.key).toBe('ask.otherAccount');
  });
  it('access refused', async () => {
    const t = await setup({ health: 'forbidden' });
    expect(t.snap().blocked).toMatchObject({ key: 'ask.accessRefused', agent: false });
  });
  it('cannot reach: the band, the draft keeps; Send waits', async () => {
    const t = await setup({ health: 'lost' });
    expect(t.snap().band).toEqual({ k: 'unreachable' });
    expect(t.eng.send('hi')).toBe(false);
  });
  it('a signed-out agent: the send needs the sign-in; without a key core refuses and it says to sign in from the Agent', async () => {
    const t = await setup({ auth: 'login' });
    expect(t.snap().needLogin).toBe(true);
    t.eng.send('hi');
    await t.flush(100);
    expect(users(t.snap())[0]).toMatchObject({ state: 'notSent', reason: 'ask.signInInAgent' });
    expect(calls(t.agent, 'create')).toHaveLength(0);
  });
  it('a signed-out agent that takes no sign-in from the Hub (404): the message is not sent and says so', async () => {
    const t = await setup({ auth: 'login' });
    (t.agent as any).signIn = () => { t.agent.log.push(['signIn', []]); return Promise.resolve({ kind: 'refused', reason: 'disabled' }); };
    t.eng.send('hi');
    await t.flush(100);
    expect(users(t.snap())[0]).toMatchObject({ state: 'notSent', reason: 'ask.signNotOffered' });
    expect(calls(t.agent, 'create')).toHaveLength(0);
  });
  // Ask signs in through core's signInAgent, with the shared box's refusals.
  it.each([
    [{ kind: 'refused', reason: 'cancelled' }, 'ask.signCancelled'],
    [{ kind: 'refused', reason: 'busy' }, 'ask.signBusy'],
    [{ kind: 'refused', reason: 'notThisBox' }, 'ask.signFail'],
    [{ kind: 'refused', reason: 'computerLogin' }, 'ask.signFail'],
    [{ kind: 'refused', reason: 'refused' }, 'ask.signFail'],
    [{ kind: 'notAllowed', reason: 'shared' }, 'ask.signShared'],
    [{ kind: 'notAllowed', reason: 'admin' }, 'ask.signAdmin'],
    [{ kind: 'notAllowed', reason: 'otherAccount' }, 'ask.otherAccount'],
  ])('core refuses the sign-in (%j): not sent, with its words, no status read, nothing created', async (r, key) => {
    const t = await setup({ auth: 'login' });
    (t.agent as any).signIn = () => Promise.resolve(r);
    const reads = calls(t.agent, 'authStatus').length;
    t.eng.send('hi');
    await t.flush(100);
    expect(users(t.snap())[0]).toMatchObject({ state: 'notSent', reason: key });
    expect(calls(t.agent, 'authStatus')).toHaveLength(reads);
    expect(calls(t.agent, 'create')).toHaveLength(0);
  });
  it.each(['unknown', 'signedIn'])('core says %s and the agent still reads signed out: "may have been signed in", never "could not" (C9)', async (kind) => {
    const t = await setup({ auth: 'login' });
    (t.agent as any).signIn = () => Promise.resolve({ kind });
    t.eng.send('hi');
    await t.flush(100);
    expect(users(t.snap())[0]).toMatchObject({ state: 'notSent', reason: 'ask.signUnknown' });
    expect(calls(t.agent, 'create')).toHaveLength(0);
  });
  it.each(['unknown', 'signedIn', 'stale'])('after core says %s, Send again and a new message never sign in again: they only read the status (C9)', async (kind) => {
    const t = await setup({ auth: 'login' });
    let n = 0;
    (t.agent as any).signIn = () => { n++; return Promise.resolve({ kind }); };
    t.eng.send('hi');
    await t.flush(100);
    const u = users(t.snap())[0]!;
    expect(u).toMatchObject({ state: 'notSent', reason: 'ask.signUnknown' });
    const reads = calls(t.agent, 'authStatus').length;
    t.eng.resend(u.id);
    await t.flush(100);
    t.eng.send('again');
    await t.flush(100);
    expect(n).toBe(1);
    expect(calls(t.agent, 'authStatus')).toHaveLength(reads + 2);
    expect(users(t.snap()).every((x) => x.state === 'notSent' && x.reason === 'ask.signUnknown')).toBe(true);
    expect(calls(t.agent, 'create')).toHaveLength(0);
  });
  it('a held sign-in that finished: the next send reads ready and the message goes, still with one sign-in', async () => {
    const t = await setup({ auth: 'login', script: [[{ k: 'text', text: 'ok' }]] });
    let n = 0;
    (t.agent as any).signIn = () => { n++; return Promise.resolve({ kind: 'unknown' }); };
    t.eng.send('hi');
    await t.flush(100);
    (t.agent as any).o.auth = 'ready';
    t.eng.resend(users(t.snap())[0]!.id);
    await t.flush(60_000);
    expect(n).toBe(1);
    expect(calls(t.agent, 'create')).toHaveLength(1);
    // The ready read let the hold go: an agent signed out again later (a new engine for the same computer) may sign in again.
    const t2 = await setup({ auth: 'login' });
    let n2 = 0;
    (t2.agent as any).signIn = () => { n2++; return Promise.resolve({ kind: 'refused', reason: 'key' }); };
    t2.eng.send('later');
    await t2.flush(100);
    expect(n2).toBe(1);
  });
  it('core drops the sign-in as stale (the Hub showed another computer): no status read, no session; "may have been signed in"', async () => {
    const t = await setup({ auth: 'login' });
    (t.agent as any).signIn = () => Promise.resolve({ kind: 'stale' });
    const reads = calls(t.agent, 'authStatus').length;
    t.eng.send('hi');
    await t.flush(100);
    expect(users(t.snap())[0]).toMatchObject({ state: 'notSent', reason: 'ask.signUnknown' });
    expect(calls(t.agent, 'authStatus')).toHaveLength(reads);
    expect(calls(t.agent, 'create')).toHaveLength(0);
  });
  it('the hold is per computer: another computer\'s agent still signs in', async () => {
    const a = await setup({ auth: 'login' });
    (a.agent as any).signIn = () => Promise.resolve({ kind: 'unknown' });
    a.eng.send('hi');
    await a.flush(100);
    const b = await setup({ auth: 'login' }, memStore(), { ...slot, computer: 'c0a7150000000000000000b2' });
    let n = 0;
    (b.agent as any).signIn = () => { n++; return Promise.resolve({ kind: 'refused', reason: 'key' }); };
    b.eng.send('hi');
    await b.flush(100);
    expect(n).toBe(1);
  });
  // A sign-in still out when its flow goes away: the result is recorded for the account and computer all the same.
  const deferred = () => { let settle!: (r: unknown) => void; const p = new Promise((res) => { settle = res; }); return { p, settle }; };
  it.each(['unknown', 'signedIn', 'stale'])('New conversation while the sign-in is out, then %s: the next message never signs in again', async (kind) => {
    const t = await setup({ auth: 'login' });
    const d = deferred();
    let n = 0;
    (t.agent as any).signIn = () => { n++; return d.p; };
    t.eng.send('hi');
    await t.flush(10);
    expect(n).toBe(1);
    t.eng.newConversation();
    await t.flush(10);
    d.settle({ kind });
    await t.flush(100);
    t.eng.send('again');
    await t.flush(100);
    expect(n).toBe(1);
    expect(calls(t.agent, 'create')).toHaveLength(0);
  });
  it.each(['unknown', 'stale'])('a realm change ends the engine while the sign-in is out, then %s: a replacement engine never signs in again', async (kind) => {
    const t = await setup({ auth: 'login' });
    const d = deferred();
    let n = 0;
    (t.agent as any).signIn = () => { n++; return d.p; };
    t.eng.send('hi');
    await t.flush(10);
    t.agent.aliveFlag = false;
    t.eng.checkAlive(); // registry.ts asks on every core generation bump (the realm change)
    expect(t.snap().phase).toBe('ended');
    d.settle({ kind });
    await t.flush(100);
    const t2 = await setup({ auth: 'login' });
    (t2.agent as any).signIn = () => { n++; return Promise.resolve({ kind: 'refused', reason: 'key' }); };
    t2.eng.send('again');
    await t2.flush(100);
    expect(n).toBe(1);
    expect(users(t2.snap())[0]).toMatchObject({ state: 'notSent', reason: 'ask.signUnknown' });
  });
  it('a replacement engine while the sign-in is out (the first one ended), then unknown: one sign-in in all', async () => {
    const t = await setup({ auth: 'login' });
    const d = deferred();
    let n = 0;
    (t.agent as any).signIn = () => { n++; return d.p; };
    t.eng.send('hi');
    await t.flush(10);
    t.eng.end();
    d.settle({ kind: 'unknown' });
    await t.flush(100);
    const t2 = await setup({ auth: 'login' });
    (t2.agent as any).signIn = () => { n++; return Promise.resolve({ kind: 'refused', reason: 'key' }); };
    t2.eng.send('again');
    await t2.flush(100);
    expect(n).toBe(1);
  });
  it('a sign-in that throws at once (a bug) is read like a lost answer: the status decides', async () => {
    const t = await setup({ auth: 'login' });
    (t.agent as any).signIn = () => { throw new Error('boom'); };
    t.eng.send('hi');
    await t.flush(100);
    expect(users(t.snap())[0]).toMatchObject({ state: 'notSent', reason: 'ask.signUnknown' });
  });
  it('core signs it in and the status reads ready: the message is sent', async () => {
    const t = await setup({ auth: 'login', script: [[{ k: 'text', text: 'ok' }]] });
    (t.agent as any).signIn = () => { (t.agent as any).o.auth = 'ready'; return Promise.resolve({ kind: 'signedIn' }); };
    t.eng.send('hi');
    await t.flush(60_000);
    expect(calls(t.agent, 'create')).toHaveLength(1);
  });
  it('signed in, then the realm check is refused: not sent as "did not open", never "could not sign in"', async () => {
    const t = await setup({ auth: 'login' });
    (t.agent as any).signIn = () => { (t.agent as any).o.auth = 'ready'; return Promise.resolve({ kind: 'signedIn' }); };
    (t.agent as any).probe = () => Promise.reject({ status: 403, code: 'forbidden' });
    t.eng.send('hi');
    await t.flush(60_000);
    expect(users(t.snap())[0]).toMatchObject({ state: 'notSent', reason: 'ask.notOpened' });
    expect(calls(t.agent, 'create')).toHaveLength(0);
  });
  it('a stopped computer: the band; Start; it starts and the conversation is ready', async () => {
    const t = await setup({ computerStatus: 'stopped', health: 'lost' });
    expect(t.snap().band).toEqual({ k: 'stopped' });
    expect(t.eng.send('hi')).toBe(false);
    (t.agent as any).o.health = 'ok';
    t.eng.startComputer();
    await t.flush(100);
    expect(t.snap().band).toEqual({ k: 'starting' });
    await t.flush(12000);
    expect(t.snap().band).toBeNull();
    expect(t.snap().phase).toBe('ready');
  });
});

// A held sign-in (one that may have gone through) ends on any ready read of that agent
// taken after the hold, the read when an engine opens included; signed out, unreadable, unsure, another account,
// another computer or a read already out before the hold keep it.
describe('the sign-in hold ends on a ready read', () => {
  const B2 = 'c0a7150000000000000000b2';
  const readyBody = { auth_active: true, account_id: ACCOUNT, owner_fingerprint: 'fp-ada', restriction: 'none', realm_isolation_by_realm: {} };
  // A sign-in of unknown outcome on `at`: the hold is set; one sign-in sent.
  async function held(at: Slot = slot) {
    const t = await setup({ auth: 'login' }, memStore(), at);
    let n = 0;
    (t.agent as any).signIn = () => { n++; return Promise.resolve({ kind: 'unknown' }); };
    t.eng.send('hi');
    await t.flush(100);
    expect(n).toBe(1);
    expect(users(t.snap())[0]).toMatchObject({ state: 'notSent', reason: 'ask.signUnknown' });
    return t;
  }
  // A later signed-out engine on `at` sends: how many sign-ins it sends, and the message's state.
  async function laterSend(at: Slot = slot) {
    const t = await setup({ auth: 'login' }, memStore(), at);
    let n = 0;
    (t.agent as any).signIn = () => { n++; return Promise.resolve({ kind: 'refused', reason: 'key' }); };
    t.eng.send('later');
    await t.flush(100);
    return { n, msg: users(t.snap())[0] };
  }
  // The realm check's probe never answers: only the open's own status read can lift the hold.
  const probeHangs = (a: FakeAgent) => { (a as any).probe = () => new Promise(() => {}); };
  it('a new engine opens on a ready agent, the agent signs out later: the next send offers a real sign-in', async () => {
    await held();
    const open = await setup({ auth: 'ready' }, memStore(), slot, probeHangs);
    expect(open.snap().needLogin).toBe(false);
    expect(open.snap().blocked).toBeNull();
    const later = await laterSend();
    expect(later.n).toBe(1);
    expect(later.msg).toMatchObject({ state: 'notSent', reason: 'ask.signInInAgent' });
  });
  it('the whole open on a ready agent lifts it (status read and realm check)', async () => {
    await held();
    await setup({ auth: 'ready' });
    expect((await laterSend()).n).toBe(1);
  });
  it('the realm check\'s ready read lifts it when the open\'s read was out before the hold', async () => {
    // The open's status read answers ready only after another engine's sign-in is held (too early to count); the
    // realm check's status read after it is new and ready.
    let answer: (() => void) | null = null;
    let reads = 0;
    const open = await setup({ auth: 'ready' }, memStore(), slot, (a) => {
      (a as any).authStatus = () => { reads++; return reads === 1 ? new Promise((res) => { answer = () => res(readyBody); }) : Promise.resolve(readyBody); };
    });
    expect(answer).not.toBeNull();
    await held();
    answer!();
    await open.flush(100);
    expect(reads).toBe(2);
    expect(open.snap().blocked).toBeNull();
    expect((await laterSend()).n).toBe(1);
  });
  // The open's status read answers before any hold; the realm check runs while another engine's sign-in is held.
  it('the realm check\'s status read counts from when it starts: a probe answered after the hold, then a ready read, lifts it', async () => {
    let probed: (() => void) | null = null;
    const open = await setup({ auth: 'ready' }, memStore(), slot, (a) => {
      const real = a.probe.bind(a);
      (a as any).probe = (r: string) => new Promise((res) => { probed = () => res(real(r)); });
    });
    expect(probed).not.toBeNull();
    await held();
    probed!();
    await open.flush(100);
    expect(open.snap().blocked).toBeNull();
    expect((await laterSend()).n).toBe(1);
  });
  it('a failed realm probe with a ready status read still lifts it (the agent is signed in), and the check still fails', async () => {
    let probed: (() => void) | null = null;
    const open = await setup({ auth: 'ready' }, memStore(), slot, (a) => {
      (a as any).probe = () => new Promise((_res, rej) => { probed = () => rej({ status: 500 }); });
    });
    expect(probed).not.toBeNull();
    await held();
    probed!();
    await open.flush(100);
    expect(open.snap().blocked ?? open.snap().band).toBeTruthy();
    expect(calls(open.agent, 'create')).toHaveLength(0);
    expect((await laterSend()).n).toBe(1);
  });
  it('a realm-check status read already out before the hold never lifts it', async () => {
    let answer: (() => void) | null = null;
    let reads = 0;
    const open = await setup({ auth: 'ready' }, memStore(), slot, (a) => {
      (a as any).authStatus = () => { reads++; return reads === 1 ? Promise.resolve(readyBody) : new Promise((res) => { answer = () => res(readyBody); }); };
    });
    expect(answer).not.toBeNull();
    await held();
    answer!();
    await open.flush(100);
    expect(open.snap().blocked).toBeNull();
    expect((await laterSend()).n).toBe(0);
  });
  it('a signed-out open keeps it: the next send only reads the status (C9)', async () => {
    await held();
    await setup({ auth: 'login' });
    const later = await laterSend();
    expect(later.n).toBe(0);
    expect(later.msg).toMatchObject({ state: 'notSent', reason: 'ask.signUnknown' });
  });
  it('an unreadable open keeps it: a failed status read', async () => {
    await held();
    const open = await setup({ auth: 'ready' }, memStore(), slot, (a) => { (a as any).authStatus = () => Promise.reject({ status: 500 }); });
    expect(open.snap().band ?? open.snap().blocked).toBeTruthy();
    expect(open.snap().needLogin).toBe(false);
    expect((await laterSend()).n).toBe(0);
  });
  it('an unsure open keeps it: a signed-in status without the identity', async () => {
    await held();
    const open = await setup({ auth: 'ready' }, memStore(), slot, (a) => { (a as any).authStatus = () => Promise.resolve({ auth_active: true, account_id: ACCOUNT }); });
    expect(open.snap().blocked?.key).toBe('ask.identityUnknown');
    expect((await laterSend()).n).toBe(0);
  });
  it('another account\'s agent keeps it', async () => {
    await held();
    const open = await setup({ auth: 'other' });
    expect(open.snap().blocked?.key).toBe('ask.otherAccount');
    expect((await laterSend()).n).toBe(0);
  });
  it('a ready agent on another computer keeps this computer\'s hold', async () => {
    await held();
    await held({ ...slot, computer: B2 });
    const open = await setup({ auth: 'ready' }, memStore(), { ...slot, computer: B2 });
    expect(open.snap().blocked).toBeNull();
    expect((await laterSend()).n).toBe(0);
    // That computer's own hold went: its signed-out send signs in.
    expect((await laterSend({ ...slot, computer: B2 })).n).toBe(1);
  });
  it('a status read that starts after the hold counts even if the open began before it (health answered late)', async () => {
    let healthy: (() => void) | null = null;
    const open = await setup({ auth: 'ready' }, memStore(), slot, (a) => {
      probeHangs(a);
      const real = a.health.bind(a);
      (a as any).health = () => new Promise((res) => { healthy = () => res(real()); });
    });
    expect(healthy).not.toBeNull();
    await held();
    healthy!();
    await open.flush(100);
    expect(open.snap().blocked).toBeNull();
    expect(open.snap().needLogin).toBe(false);
    expect((await laterSend()).n).toBe(1);
  });
  it('after a send, the ready read lifts it even when the realm check then fails (the agent is signed in)', async () => {
    const t = await held();
    // The read after the send answers ready; the realm check's probe and status read both fail.
    let reads = 0;
    (t.agent as any).authStatus = () => { reads++; return reads === 1 ? Promise.resolve(readyBody) : Promise.reject({ status: 500 }); };
    (t.agent as any).probe = () => Promise.reject({ status: 500 });
    t.eng.resend(users(t.snap())[0]!.id);
    await t.flush(60_000);
    expect(calls(t.agent, 'create')).toHaveLength(0);
    expect((await laterSend()).n).toBe(1);
  });
  it('a ready read already out before the hold never lifts it (an answer from before the sign-in)', async () => {
    // An engine opens on a ready agent, but its status read answers only after another engine's sign-in is held
    // (its realm check never answers, so no later read counts).
    let answer: (() => void) | null = null;
    const early = await setup({ auth: 'ready' }, memStore(), slot, (a) => {
      probeHangs(a);
      (a as any).authStatus = () => new Promise((res) => { answer = () => res(readyBody); });
    });
    expect(answer).not.toBeNull();
    await held();
    answer!();
    await early.flush(100);
    expect(early.snap().blocked).toBeNull();
    expect(early.snap().needLogin).toBe(false);
    expect((await laterSend()).n).toBe(0);
  });
  it('a ready read after a send lifts it as before: one sign-in, then a later signed-out engine signs in', async () => {
    const t = await held();
    (t.agent as any).o.auth = 'ready';
    t.eng.resend(users(t.snap())[0]!.id);
    await t.flush(60_000);
    expect(calls(t.agent, 'create')).toHaveLength(1);
    expect((await laterSend()).n).toBe(1);
  });
});

describe('reopening and Recent', () => {
  it('a finished conversation comes back from the transcript after a reload', async () => {
    const store = memStore();
    const t = await setup({}, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(500);
    const s = t2.getSnapshot();
    expect(s.phase).toBe('ready');
    expect(users(s)[0].text).toBe('Build me a small dashboard');
    expect(replies(s)[0]).toContain('dash');
  });
  it('New conversation keeps the old one in Recent; picking it opens it again', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'Second.' }]] });
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    const first = t.eng.record!.k1;
    t.eng.newConversation();
    expect(t.snap().conv.turns).toHaveLength(0);
    t.eng.send('Something else');
    await t.flush(2000);
    t.eng.loadRecent();
    await t.flush(10);
    const rec = t.snap().recent!;
    expect(rec).toHaveLength(2);
    expect(rec.map((r) => r.title)).toContain('Build me a small dashboard');
    t.eng.openConversation(first);
    await t.flush(500);
    expect(users(t.snap())[0].text).toBe('Build me a small dashboard');
  });
  it('the engine ends when its context is gone', async () => {
    const t = await setup({ pace: 300 });
    t.eng.send('Build me a small dashboard');
    await t.flush(350);
    t.agent.aliveFlag = false;
    await t.flush(2000);
    expect(t.snap().phase).toBe('ended');
  });
});

// Security cases: no change goes out twice under two keys, and a read that failed is
// never taken as an answer.
function failOnce(agent: any, m: string, err: unknown) {
  const real = agent[m].bind(agent);
  let done = false;
  agent[m] = (...a: unknown[]) => { if (done) return real(...a); done = true; agent.log.push([m, a]); return Promise.reject(err); };
}
describe('never twice, never assumed', () => {
  it('a definite refusal on Check status keeps "may have gone through"; Check status again uses the same key', async () => {
    const t = await setup({ turnLost: true });
    t.eng.send('Build me a small dashboard');
    await t.flush(30);
    const u = users(t.snap())[0];
    failOnce(t.agent, 'turn', { status: 403, code: 'forbidden' });
    t.eng.check(u.id);
    await t.flush(50);
    expect(users(t.snap())[0].state).toBe('unknown');
    t.eng.check(u.id);
    await t.flush(2000);
    const keys = calls(t.agent, 'turn').map((c) => c[1][2]);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect(users(t.snap())[0].state).toBe('sent');
    expect(replies(t.snap())).toHaveLength(1);
  });
  it('Send again after a definite refusal reuses the same key', async () => {
    const t = await setup({ busy: true });
    t.eng.send('hi');
    await t.flush(500);
    const u = users(t.snap())[0];
    expect(u.state).toBe('notSent');
    (t.agent as any).o.busy = false;
    t.eng.resend(u.id);
    await t.flush(2000);
    const keys = calls(t.agent, 'turn').map((c) => c[1][2]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(users(t.snap())[0].state).toBe('sent');
  });
  it('an unknown follow-up survives a reload as its own row; new text never goes under its key; Dismiss drops it', async () => {
    const store = memStore();
    const t = await setup({ pace: 200, commandLost: true }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    expect(users(t.snap()).find((x: any) => x.text === 'Also add a README').state).toBe('unknown');
    expect(store.raw()).not.toContain('README');
    const k = calls(t.agent, 'command')[0]![1][2];
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(100);
    const lost = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown');
    expect(lost).toMatchObject({ text: '', via: 'command', commandId: null });
    // The text-less row does not hold Send; the next message is new, under its own key.
    expect(C.canSendMore(t2.getSnapshot().conv)).toBe(true);
    expect(t2.send('Something else')).toBe(false);   // the waiting row has no text to compare: asked first
    expect(t2.getSnapshot().dup).toEqual({ text: 'Something else', earlier: true });
    expect(t2.send('Something else', true)).toBe(true);
    // The reopened turn's stream opens once its receipt has said whether the transcript already holds the turn (one read later than a
    // stream opened at once), so its frames come one pace later.
    await t.flush(200);
    const cm = calls(t.agent, 'command');
    expect(cm).toHaveLength(2);
    expect(cm[1]![1][2]).not.toBe(k);
    expect(users(t2.getSnapshot()).find((x: any) => x.id === lost.id)).toMatchObject({ state: 'unknown' });
    t2.dismiss(lost.id);
    expect(t2.record?.k3).toBeUndefined();
  });
  it('a lost follow-up row without a command id offers Dismiss, never Check status (nothing to read back)', async () => {
    const store = memStore();
    const t = await setup({ pace: 200, commandLost: true }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(100);
    const lost = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown');
    const n = t.agent.log.length;
    t2.check(lost.id);
    await t.flush(50);
    expect(t.agent.log.slice(n).filter((x) => x[0] === 'command' || x[0] === 'commandGet')).toHaveLength(0);
    expect(users(t2.getSnapshot()).find((x: any) => x.id === lost.id).state).toBe('unknown');
  });
  it('a page without a journal reads nothing by key and adopts nothing: the stored phase stays, the row stays plain unknown, a retype goes under the same key', async () => {
    const store = memStore();
    const t = await setup({ turnLost: true }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(30);
    const ph0 = JSON.parse(store.raw()).a[ACCOUNT][0].ph;
    expect(t.eng.record?.t).toBeNull();
    expect(C.isLivePhase(ph0)).toBe(true);
    // The session's own state is not read either (recon): a failed read is no evidence of anything.
    failOnce(t.agent, 'state', { status: 503 });
    const n = t.agent.log.length;
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(50);
    expect(t2.record?.ph).toBe(ph0);
    expect(JSON.parse(store.raw()).a[ACCOUNT][0].ph).toBe(ph0);
    expect(t.agent.log.slice(n).filter((x) => x[0] === 'turns' || x[0] === 'turnByKey'), 'neither the turn list nor the key is read without a journal').toEqual([]);
    const row = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown');
    expect(row).toMatchObject({ text: '', via: 'turn', reason: '' });
    expect(C.canSendMore(t2.getSnapshot().conv)).toBe(true);   // a retype would go under the same key
    t2.check(row.id);
    await t.flush(3000);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
  });
  it('a turn of unknown outcome holds Send', async () => {
    const t = await setup({ turnLost: true });
    t.eng.send('Build me a small dashboard');
    await t.flush(30);
    expect(C.canSendMore(t.snap().conv)).toBe(false);
    expect(t.eng.send('another')).toBe(false);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
  });
  it('a click names the gate it was drawn for; another gate is not decided', async () => {
    const t = await setup({ script: [scripts.approval] });
    t.eng.setAuto(false);
    t.eng.send('Add a chart');
    await t.flush(500);
    const g = t.snap().gate!;
    t.eng.decide('once', undefined, { id: 'other-gate', generation: g.generation });
    t.eng.decide('once', undefined, { id: g.id, generation: g.generation + 1 });
    expect(calls(t.agent, 'confirm')).toHaveLength(0);
    t.eng.decide('once', undefined, { id: g.id, generation: g.generation });
    expect(calls(t.agent, 'confirm')).toHaveLength(1);
  });
  it('Approve automatically switched off is put to the session before the first turn', async () => {
    const t = await setup({ script: [scripts.approval] });
    t.eng.setAuto(false);
    t.eng.send('Add a chart');
    await t.flush(500);
    const iy = t.agent.log.findIndex((x) => x[0] === 'yolo'), it_ = t.agent.log.findIndex((x) => x[0] === 'turn');
    expect(iy).toBeGreaterThan(-1);
    expect(t.agent.log[iy]![1][1]).toBe(false);
    expect(iy).toBeLessThan(it_);
  });
  it('Approve automatically off that cannot be confirmed sends nothing', async () => {
    const t = await setup({ script: [scripts.approval] });
    t.eng.setAuto(false);
    (t.agent as any).yolo = (...a: unknown[]) => { t.agent.log.push(['yolo', a]); return Promise.reject({ status: 403, code: 'forbidden' }); };
    (t.agent as any).approval = (...a: unknown[]) => { t.agent.log.push(['approval', a]); return Promise.resolve({ yolo: true }); };
    t.eng.send('Add a chart');
    await t.flush(500);
    expect(calls(t.agent, 'turn')).toHaveLength(0);
    expect(users(t.snap())[0]).toMatchObject({ state: 'notSent', reason: 'ask.autoOffFailed' });
  });
});

describe('placeholders and refused stops', () => {
  it('a reload after a lost create: Check status finds no turn, the row stays, and the retyped text goes under its key', async () => {
    const store = memStore();
    const t = await setup({ createLost: true }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(100);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(50);
    const row = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown');
    expect(row).toMatchObject({ via: 'create', text: '' });
    t2.check(row.id);
    await t.flush(3000);
    expect(users(t2.getSnapshot()).find((x: any) => x.id === row.id)).toMatchObject({ state: 'unknown', reason: 'ask.notStarted' });
    expect(calls(t.agent, 'create').map((c) => c[1][1])).toEqual([calls(t.agent, 'create')[0]![1][1], calls(t.agent, 'create')[0]![1][1]]);
    expect(t2.send('Build me a small dashboard')).toBe(true);
    await t.flush(100);
    expect(calls(t.agent, 'turn').map((c) => c[1][2])).toEqual([t2.record!.k2]);
  });
  it('a refused Stop goes back to working and Stop can be pressed again', async () => {
    const t = await setup({ pace: 300 });
    t.eng.send('Build me a small dashboard');
    await t.flush(350);
    failOnce(t.agent, 'cancel', { status: 403, code: 'forbidden' });
    t.eng.stop();
    expect(t.snap().status).toBe('stopping');
    await t.flush(20);
    expect(t.snap().status).toBe('working');
    t.eng.stop();
    expect(t.snap().status).toBe('stopping');
    expect(calls(t.agent, 'cancel')).toHaveLength(2);
  });
});

// Off holds every turn until confirmed, a lost later turn survives a reload under its
// own key, and a text-less lost row takes the retyped text instead of holding Send.
function lostAfter(agent: any, m: string) {
  const real = agent[m].bind(agent);
  let done = false;
  agent[m] = (...a: unknown[]) => { const p = real(...a); if (done) return p; done = true; return p.then(() => Promise.reject({ status: 502, pending: true })); };
}
describe('Off, later turns, retyping', () => {
  it('after an unconfirmed Off, the next message re-checks Off and is not sent either; once Off holds, it goes', async () => {
    const t = await setup({ script: [scripts.approval] });
    t.eng.setAuto(false);
    const realYolo = (t.agent as any).yolo.bind(t.agent);
    let refuse = true;
    (t.agent as any).yolo = (...a: unknown[]) => (refuse ? (t.agent.log.push(['yolo', a]), Promise.reject({ status: 409, code: 'approval_policy_locked' })) : realYolo(...a));
    const realApproval = (t.agent as any).approval.bind(t.agent);
    (t.agent as any).approval = (...a: unknown[]) => (refuse ? (t.agent.log.push(['approval', a]), Promise.resolve({ yolo: true })) : realApproval(...a));
    t.eng.send('Add a chart');
    await t.flush(300);
    expect(users(t.snap())[0]).toMatchObject({ state: 'notSent', reason: 'ask.autoOffFailed' });
    expect(t.eng.send('Add a chart, please')).toBe(true);
    await t.flush(300);
    expect(calls(t.agent, 'turn')).toHaveLength(0);
    expect(calls(t.agent, 'yolo')).toHaveLength(2);
    expect(users(t.snap())[1]).toMatchObject({ state: 'notSent', reason: 'ask.autoOffFailed' });
    refuse = false;
    t.eng.send('Add a chart now');
    await t.flush(500);
    const log = t.agent.log.map((x) => x[0]);
    expect(log.lastIndexOf('yolo')).toBeLessThan(log.indexOf('turn'));
    expect(calls(t.agent, 'turn')).toHaveLength(1);
  });
  // (The turn list names no key, so a newer turn in it is never taken for the key's: another tab, a follow-up or another client may
  // have started it. The history shows it; the key's row stays and goes on Dismiss. A journaled page asks the agent BY the key instead:
  // accept/keyed.adopt.test.ts.)
  it('a lost second turn and a reload: the newest turn is not taken for the key, the key stays for Dismiss, and no retype can run it twice', async () => {
    const store = memStore();
    const t = await setup({ script: [[{ k: 'text', text: 'First.' }], [{ k: 'text', text: 'Second.' }]] }, store);
    t.eng.send('One');
    await t.flush(2000);
    lostAfter(t.agent, 'turn');
    t.eng.send('Two');
    await t.flush(30);
    expect(users(t.snap())[1].state).toBe('unknown');
    const k2 = calls(t.agent, 'turn')[1]![1][2];
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(2000);
    expect(replies(t2.getSnapshot())).toEqual(['First.', 'Second.']);
    expect(users(t2.getSnapshot()).map((u: any) => u.text)).toEqual(['One', 'Two', '']);
    const row = users(t2.getSnapshot())[2];
    expect(row).toMatchObject({ key: k2, via: 'turn', state: 'unknown', reason: '' });
    t2.check(row.id);
    await t.flush(2000);
    expect(calls(t.agent, 'turn').filter((c) => c[1][2] === k2)).toHaveLength(1);
    // Check status reads the conversation again (nothing can tie the key to a turn): the key's row is the same key, a fresh row.
    const again = users(t2.getSnapshot()).filter((u: any) => u.key === k2);
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ state: 'unknown', reason: '' });
    t2.dismiss(again[0].id);
    await t.flush(10);
    expect(users(t2.getSnapshot()).map((u: any) => u.text)).toEqual(['One', 'Two']);
    expect(t2.record?.w).toBeUndefined();
    expect(calls(t.agent, 'turn').filter((c) => c[1][2] === k2)).toHaveLength(1);
  });
  it('a lost second turn not yet in the list after a reload: the row stays and the retyped text goes under its key', async () => {
    const store = memStore();
    const t = await setup({ script: [[{ k: 'text', text: 'First.' }], [{ k: 'text', text: 'Second.' }]] }, store);
    t.eng.send('One');
    await t.flush(2000);
    failOnce(t.agent, 'turn', { status: 502, pending: true });   // lost before the agent recorded it
    t.eng.send('Two');
    await t.flush(30);
    const k2 = calls(t.agent, 'turn')[1]![1][2];
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(500);
    const row = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown');
    expect(row).toMatchObject({ text: '', via: 'turn' });
    expect(C.canSendMore(t2.getSnapshot().conv)).toBe(true);
    expect(t2.send('Two')).toBe(true);
    await t.flush(2000);
    const tr = calls(t.agent, 'turn');
    expect(tr).toHaveLength(3);
    expect(tr[2]![1][2]).toBe(k2);
    expect(replies(t2.getSnapshot()).pop()).toBe('Second.');
    expect(t2.record?.w).toBeUndefined();
  });
  it('a restored lost follow-up does not hold Send: the composer gate lets the retype through', async () => {
    const store = memStore();
    const t = await setup({ pace: 200, commandLost: true }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(100);
    expect(C.canSendMore(t2.getSnapshot().conv)).toBe(true);
  });
});

describe('keys kept per route, committed follow-ups settle', () => {
  it('Send again that moves a refused turn to a follow-up uses a fresh key, so the store keeps it for a reload', async () => {
    const store = memStore();
    const t = await setup({ script: [[{ k: 'text', text: 'First.' }], [{ k: 'text', text: 'x' }]], commandLost: true }, store);
    t.eng.send('One');
    await t.flush(2000);
    (t.agent as any).o.busy = true;
    t.eng.send('Two');
    await t.flush(100);
    const two = users(t.snap()).find((x: any) => x.text === 'Two');
    expect(two.state).toBe('notSent');
    (t.agent as any).o.busy = false;
    (t.eng as any).conv = C.addTurn((t.eng as any).conv, { turnId: 'turn-other', now: 0 });   // a turn now shows as running
    t.eng.resend(two.id);
    await t.flush(20);
    const turnKey = calls(t.agent, 'turn')[1]![1][2];
    const cmdKey = calls(t.agent, 'command')[0]![1][2];
    expect(cmdKey).not.toBe(turnKey);
    expect(JSON.parse(store.raw()).a[ACCOUNT][0].k3).toEqual([cmdKey]);
  });
  it('a lost follow-up after its turn ended and a reload: no running turn, Send works, the row stays until dismissed', async () => {
    const store = memStore();
    const t = await setup({ pace: 200, commandLost: true }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    await t.flush(6000);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(500);
    expect(C.running(C.current(t2.getSnapshot().conv))).toBe(false);
    expect(t2.getSnapshot().status).not.toBe('working');
    expect(C.canSendMore(t2.getSnapshot().conv)).toBe(true);
    expect(users(t2.getSnapshot()).filter((x: any) => !x.text && x.state === 'unknown')).toHaveLength(1);
  });
  it('a committed follow-up receipt that names no turn settles as sent, never stuck in sending', async () => {
    const store = memStore();
    const t = await setup({ pace: 200, commandLost: true }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(6000);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(500);
    (t.agent as any).command = (...a: unknown[]) => { t.agent.log.push(['command', a]); return Promise.resolve({ command_id: 'cmd_x', state: 'committed', how: 'next_step' }); };
    t2.send('Also add a README', true);   // past the "already waiting" note
    await t.flush(100);
    const u = users(t2.getSnapshot()).find((x: any) => x.text === 'Also add a README' && x.id.startsWith('u'));
    expect(u.state).toBe('sent');
  });
});

// Off guards every path that can start a turn, Check status and
// Send again included; a queued follow-up keeps its key until the agent settles it.
function offRefused(agent: any) {
  const realYolo = agent.yolo.bind(agent), realApproval = agent.approval.bind(agent);
  const st = { refuse: true };
  agent.yolo = (...a: unknown[]) => (st.refuse ? (agent.log.push(['yolo', a]), Promise.reject({ status: 409, code: 'approval_policy_locked' })) : realYolo(...a));
  agent.approval = (...a: unknown[]) => (st.refuse ? (agent.log.push(['approval', a]), Promise.resolve({ yolo: true })) : realApproval(...a));
  return st;
}
describe('Off on every path, queued follow-ups keep their key', () => {
  it('Check status after Off was switched on but not confirmed sends nothing; the row stays "may have gone through"', async () => {
    const t = await setup({ turnLost: true });
    t.eng.send('Build me a small dashboard');
    await t.flush(30);
    const u = users(t.snap())[0];
    expect(u.state).toBe('unknown');
    const st = offRefused(t.agent);
    t.eng.setAuto(false);
    await t.flush(50);
    t.eng.check(u.id);
    await t.flush(200);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    expect(users(t.snap())[0]).toMatchObject({ state: 'unknown', reason: 'ask.autoOffUnchecked' });
    st.refuse = false;
    t.eng.check(u.id);
    await t.flush(2000);
    const log = t.agent.log.map((x) => x[0]);
    const keys = calls(t.agent, 'turn').map((c) => c[1][2]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(log.lastIndexOf('yolo')).toBeLessThan(log.lastIndexOf('turn'));
  });
  it('Send again on a refused follow-up after the turn ended waits for a confirmed Off', async () => {
    const t = await setup({ pace: 200 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    failOnce(t.agent, 'command', { status: 403, code: 'forbidden' });
    t.eng.send('Also add a README');
    await t.flush(50);
    const f = users(t.snap()).find((x: any) => x.text === 'Also add a README');
    expect(f.state).toBe('notSent');
    await t.flush(6000);
    expect(C.running(C.current(t.snap().conv))).toBe(false);
    const st = offRefused(t.agent);
    t.eng.setAuto(false);
    await t.flush(50);
    t.eng.resend(f.id);
    await t.flush(200);
    expect(calls(t.agent, 'command')).toHaveLength(1);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    expect(users(t.snap()).find((x: any) => x.id === f.id)).toMatchObject({ state: 'notSent', reason: 'ask.autoOffFailed' });
    st.refuse = false;
    t.eng.resend(f.id);
    await t.flush(200);
    const log = t.agent.log.map((x) => x[0]);
    expect(calls(t.agent, 'command')).toHaveLength(2);
    expect(log.lastIndexOf('yolo')).toBeLessThan(log.lastIndexOf('command'));
  });
  it('a queued follow-up keeps its key and command id until it is delivered; a reload before then reads it back by id', async () => {
    const store = memStore();
    const t = await setup({ pace: 200 }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    expect(users(t.snap()).find((x: any) => x.text === 'Also add a README').state).toBe('queued');
    const k = calls(t.agent, 'command')[0]![1][2];
    const stored = JSON.parse(store.raw()).a[ACCOUNT][0];
    expect(stored.k3).toEqual([k]);
    expect(Object.keys(stored.c3)).toEqual([k]);
    t.eng.end();
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(20);
    expect(users(t2.getSnapshot()).find((x: any) => !x.text && x.via === 'command')).toMatchObject({ state: 'queued', commandId: stored.c3[k as string] });
    expect(calls(t.agent, 'commandGet')).toHaveLength(1);
    await t.flush(5000);
    expect(calls(t.agent, 'command')).toHaveLength(1);
    expect(users(t2.getSnapshot()).find((x: any) => !x.text && x.via === 'command').state).toBe('sent');
    expect(t2.record?.k3).toBeUndefined();
    expect(t2.record?.c3).toBeUndefined();
  });
  it('a queued follow-up drops its key once the agent delivers it', async () => {
    const t = await setup({ pace: 200 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    expect(t.eng.record?.k3).toBeTruthy();
    await t.flush(5000);
    expect(users(t.snap()).find((x: any) => x.text === 'Also add a README').state).toBe('sent');
    expect(t.eng.record?.k3).toBeUndefined();
  });
});

// A duplicate turn receipt reads the turn once, so a turn that ended while its
// answer was lost settles; every queued follow-up keeps its own key.
describe('duplicate receipts settle, every queued follow-up keeps its key', () => {
  it('Check status after a lost turn answer, the turn already ended on the agent: the duplicate receipt is read back and the turn settles', async () => {
    const t = await setup();
    lostAfter(t.agent, 'turn');
    t.eng.send('Say live-ready');
    await t.flush(3000);
    const u = users(t.snap())[0];
    expect(u.state).toBe('unknown');
    t.eng.check(u.id);
    await t.flush(500);
    expect(calls(t.agent, 'turn')).toHaveLength(2);
    expect(C.running(C.current(t.snap().conv))).toBe(false);
    expect(t.snap().status).not.toBe('working');
    expect(users(t.snap())[0].state).toBe('sent');
  });
  it('two follow-ups queued, then a reload: each comes back as its own row, read back by its own id, settled once delivered', async () => {
    const store = memStore();
    const t = await setup({ pace: 200 }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    t.eng.send('And a LICENSE');
    await t.flush(10);
    const ks = calls(t.agent, 'command').map((c) => c[1][2]);
    expect(ks).toHaveLength(2);
    expect(JSON.parse(store.raw()).a[ACCOUNT][0].k3).toEqual(ks);
    t.eng.end();
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(20);
    expect(users(t2.getSnapshot()).filter((x: any) => !x.text && x.via === 'command')).toHaveLength(2);
    await t.flush(5000);
    expect(calls(t.agent, 'command')).toHaveLength(2);
    expect(users(t2.getSnapshot()).filter((x: any) => !x.text && x.via === 'command').map((x: any) => x.state)).toEqual(['sent', 'sent']);
    expect(t2.record?.k3).toBeUndefined();
  });
  it('the store reads the earlier one-key form, drops bad and repeated keys, and keeps at most K3_MAX', async () => {
    const t = await setup();
    t.eng.send('hi');
    await t.flush(2000);
    const base = JSON.parse(JSON.stringify(t.eng.record));
    const k = (i: number) => 'hx-' + i.toString(16).padStart(32, '0');
    expect(L.validRec({ ...base, k3: k(1) })?.k3).toEqual([k(1)]);
    expect(L.validRec({ ...base, k3: [k(1), 'bad', k(1), base.k1, k(2)] })?.k3).toEqual([k(1), k(2)]);
    expect(L.validRec({ ...base, k3: Array.from({ length: 12 }, (_, i) => k(i + 1)) })?.k3).toHaveLength(L.K3_MAX);
    expect(L.validRec({ ...base, k3: [] })?.k3).toBeUndefined();
  });
});

// A follow-up that commits while the stream is down settles from the replay;
// a stale key never claims a new message reached the agent; a duplicate receipt shows the turn's reply.
describe('replayed commits, stale keys, replies after a duplicate receipt', () => {
  it('a queued follow-up that commits while the dock is suspended settles from the replay and drops its key', async () => {
    const t = await setup({ pace: 200 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    expect(users(t.snap()).find((x: any) => x.text === 'Also add a README').state).toBe('queued');
    t.eng.suspend();
    await t.flush(500);
    t.eng.resume();
    await t.flush(5000);
    expect(users(t.snap()).find((x: any) => x.text === 'Also add a README').state).toBe('sent');
    expect(t.eng.record?.k3).toBeUndefined();
  });
  it('a follow-up the agent read while the page was gone: the reopen reads it by id and settles it; new text goes under a fresh key', async () => {
    const store = memStore();
    const t = await setup({ pace: 200 }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    t.eng.end();
    await t.flush(8000);
    const old = JSON.parse(store.raw()).a[ACCOUNT][0].k3[0];
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    // The text-less row settles as sent by its command id; the turn it went into had closed before the reopen, so the chat is then
    // read back from the transcript, which holds the follow-up's text: the settled row goes with that read (as after any re-read).
    const states: string[] = [];
    t2.subscribe(() => { const u = users(t2.getSnapshot()).find((x: any) => !x.text && x.via === 'command'); if (u && states.at(-1) !== u.state) states.push(u.state); });
    t2.open();
    await t.flush(500);
    expect(states.at(-1)).toBe('sent');
    expect(users(t2.getSnapshot()).filter((x: any) => !x.text && x.via === 'command' && x.state !== 'sent')).toEqual([]);
    expect(calls(t.agent, 'commandGet').length).toBeGreaterThan(0);
    // The turn that ended while the page was gone shows once (never the transcript's copy plus one rebuilt from the replay).
    expect(replies(t2.getSnapshot()).filter((x: string) => x.startsWith('I made a page'))).toHaveLength(1);
    expect(t2.record?.k3).toBeUndefined();
    expect(t2.send('Something new')).toBe(true);
    await t.flush(3000);
    const sent = [...calls(t.agent, 'turn'), ...calls(t.agent, 'command')].filter((c) => c[1][1] === 'Something new');
    expect(sent).toHaveLength(1);
    expect(sent[0]![1][2]).not.toBe(old);
    expect(users(t2.getSnapshot()).find((x: any) => x.text === 'Something new').state).toBe('sent');
  });
  it('a duplicate receipt for a turn that already completed shows its reply without a reload', async () => {
    const t = await setup();
    lostAfter(t.agent, 'turn');
    (t.agent as any).stream = () => ({ close() {} });   // no frame reaches the page before the receipt
    t.eng.send('Build me a small dashboard');
    await t.flush(3000);
    const u = users(t.snap())[0];
    t.eng.check(u.id);
    await t.flush(1000);
    expect(C.running(C.current(t.snap().conv))).toBe(false);
    expect(replies(t.snap()).join(' ')).toContain('/home/ada/dash/index.html');
  });
});

// Off is confirmed per session; a commit frame that outruns the queued receipt
// still settles the follow-up; Send again on a first message routes like a new one.
describe('Off per session, early commit frames, first-message resend', () => {
  it('Off confirmed in conversation B does not count for A: reopening A puts Off to A before its next turn', async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'A.' }], [{ k: 'text', text: 'B.' }], [{ k: 'text', text: 'A again.' }]] });
    t.eng.send('First in A');
    await t.flush(2000);
    const a = t.eng.record!.k1;
    t.eng.newConversation();
    t.eng.setAuto(false);
    t.eng.send('In B');
    await t.flush(2000);
    expect(calls(t.agent, 'turn')).toHaveLength(2);
    let hang = true;   // A's reopen read never answers; a later read tells the truth (A is On)
    (t.agent as any).approval = (...x: unknown[]) => { t.agent.log.push(['approval', x]); if (!hang) return Promise.resolve({ yolo: true }); hang = false; return new Promise(() => {}); };
    (t.agent as any).yolo = (...x: unknown[]) => { t.agent.log.push(['yolo', x]); return Promise.reject({ status: 409, code: 'approval_policy_locked' }); };
    t.eng.openConversation(a);
    await t.flush(500);
    const y0 = calls(t.agent, 'yolo').length;
    t.eng.send('Again in A');
    await t.flush(500);
    expect(calls(t.agent, 'turn')).toHaveLength(2);
    expect(calls(t.agent, 'yolo').length).toBeGreaterThan(y0);
    expect(users(t.snap()).find((x: any) => x.text === 'Again in A')).toMatchObject({ state: 'notSent', reason: 'ask.autoOffFailed' });
  });
  it('a commit frame that arrives before the queued receipt still settles the follow-up and drops its key', async () => {
    const t = await setup({ pace: 200 });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    const real = (t.agent as any).command.bind(t.agent);
    let release: () => void = () => {};
    (t.agent as any).command = (...x: unknown[]) => { const p = real(...x); return new Promise((res) => { release = () => res(p); }); };
    t.eng.send('Also add a README');
    await t.flush(600);
    release();
    await t.flush(50);
    expect(users(t.snap()).find((x: any) => x.text === 'Also add a README').state).toBe('sent');
    expect(t.eng.record?.k3).toBeUndefined();
  });
  it('Send again on a first message refused after its session exists goes as a follow-up while a turn runs', async () => {
    const t = await setup({ busy: true });
    t.eng.send('hi');
    await t.flush(500);
    const u = users(t.snap())[0];
    expect(u).toMatchObject({ state: 'notSent', via: 'create' });
    expect(t.eng.record?.s).toBeTruthy();
    (t.agent as any).o.busy = false;
    (t.eng as any).conv = C.addTurn((t.eng as any).conv, { turnId: 'turn-other', now: 0 });
    t.eng.resend(u.id);
    await t.flush(50);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    expect(calls(t.agent, 'command')).toHaveLength(1);
  });
});

// C9: after a reload, unsettled follow-ups never take newly typed text by order. Each keeps its
// key and its row; a row with a command id is checked by that id; new text always goes under a fresh key.
describe('unsettled follow-ups never bind to new typing', () => {
  it('two unsettled follow-ups, a reload, texts typed in swapped order: no key is reused, each row is checked by its own id', async () => {
    const store = memStore();
    const t = await setup({ pace: 400 }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('alpha');
    await t.flush(10);
    expect(users(t.snap()).find((x: any) => x.text === 'alpha').state).toBe('queued');
    failOnce(t.agent, 'command', { status: 502, pending: true });   // beta: lost before the agent saw it
    t.eng.send('beta');
    await t.flush(10);
    const [kA, kB] = calls(t.agent, 'command').map((c) => c[1][2]);
    t.eng.end();
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(20);
    const lost = users(t2.getSnapshot()).filter((x: any) => !x.text && x.via === 'command');
    expect(lost).toHaveLength(2);
    expect(t2.send('beta')).toBe(false);   // the waiting rows have no text to compare: asked once
    expect(t2.send('beta', true)).toBe(true);
    await t.flush(10);
    expect(t2.send('alpha')).toBe(true);
    await t.flush(10);
    const after = calls(t.agent, 'command').slice(2).map((c) => c[1][2]);
    expect(after).toHaveLength(2);
    expect(after).not.toContain(kA);
    expect(after).not.toContain(kB);
    expect(users(t2.getSnapshot()).filter((x: any) => !x.text && x.via === 'command')).toHaveLength(2);
    // The queued one carries its command id: the reopen reads it by that id (Check status does the same), and its
    // commit settles it, key and all.
    const rowA = users(t2.getSnapshot()).find((x: any) => !x.text && x.commandId);
    expect(rowA).toBeTruthy();
    expect(calls(t.agent, 'commandGet')).toHaveLength(1);
    expect(users(t2.getSnapshot()).find((x: any) => x.id === rowA.id).state).toBe('queued');
    await t.flush(3000);   // the agent reads it: its commit event settles the row
    expect(users(t2.getSnapshot()).find((x: any) => x.id === rowA.id).state).toBe('sent');
    // The lost one has nothing to read back: the person dismisses it, and its key goes.
    const rowB = users(t2.getSnapshot()).find((x: any) => !x.text && !x.commandId && x.state === 'unknown');
    t2.dismiss(rowB.id);
    expect(users(t2.getSnapshot()).find((x: any) => x.id === rowB.id)).toBeUndefined();
    expect(t2.record?.k3).toBeUndefined();
  });
});

// C9: a 422 on a key proves only that the key's own text reached the agent, never the newly typed
// text. Nothing is read to decide it; the row stays "may have gone through" (never Not sent, never sent).
describe('a reused key', () => {
  const reuse = (agent: any) => {
    const real = agent.turn.bind(agent);
    let done = false;
    agent.turn = (...a: unknown[]) => { if (done) return real(...a); done = true; agent.log.push(['turn', a]); return Promise.reject({ status: 422, code: 'idempotency_key_reused' }); };
  };
  it('may have gone through, never Not sent, and nothing is read to decide it', async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'First.' }], [{ k: 'text', text: 'x' }]] });
    t.eng.send('One');
    await t.flush(2000);
    reuse(t.agent);
    const n = calls(t.agent, 'transcript').length;
    t.eng.send('Two');
    await t.flush(200);
    expect(users(t.snap()).find((x: any) => x.text === 'Two')).toMatchObject({ state: 'unknown', reason: 'ask.cannotTell' });
    expect(calls(t.agent, 'transcript')).toHaveLength(n);
  });
  it("as seen live: two unsettled follow-ups, a reload, texts typed in swapped order: no key is reused and no row says Not sent", async () => {
    const store = memStore();
    const t = await setup({ pace: 400 }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('alpha');
    await t.flush(10);
    t.eng.send('beta');
    await t.flush(10);
    t.eng.end();
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(20);
    t2.send('beta');
    await t.flush(10);
    t2.send('alpha');
    await t.flush(3000);
    const keys = calls(t.agent, 'command').map((c) => c[1][2]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(users(t2.getSnapshot()).filter((x: any) => x.state === 'notSent' || x.reason === 'ask.alreadyThere')).toHaveLength(0);
  });
});

// Check status never re-sends a follow-up key the agent may have forgotten (it keeps
// a settled command's key 24 h); rows older than 12 h are left to the conversation and to Dismiss.
describe('old follow-up keys are never re-sent', () => {
  it('Check status on a lost follow-up older than 12 h sends nothing; the row says so and can be dismissed', async () => {
    const t = await setup({ pace: 200, commandLost: true });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    const row = users(t.snap()).find((x: any) => x.text === 'Also add a README');
    expect(row.state).toBe('unknown');
    t.clock.run(13 * 3600 * 1000);
    await t.flush(10);
    const n = calls(t.agent, 'command').length;
    t.eng.check(row.id);
    await t.flush(50);
    expect(calls(t.agent, 'command')).toHaveLength(n);
    expect(users(t.snap()).find((x: any) => x.id === row.id)).toMatchObject({ state: 'unknown', reason: 'ask.tooOld' });
    t.eng.dismiss(row.id);
    expect(users(t.snap()).find((x: any) => x.id === row.id)).toBeUndefined();
    expect(t.eng.record?.k3).toBeUndefined();
  });
  it('within 12 h Check status still asks again under the same key', async () => {
    const t = await setup({ pace: 200, commandLost: true });
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    t.eng.send('Also add a README');
    await t.flush(10);
    const row = users(t.snap()).find((x: any) => x.text === 'Also add a README');
    t.eng.check(row.id);
    await t.flush(50);
    const cm = calls(t.agent, 'command');
    expect(cm).toHaveLength(2);
    expect(cm[0]![1][2]).toBe(cm[1]![1][2]);
  });
});

// A 422 is never read as Not sent; sent only when the history
// holds an occurrence this page cannot account for; Off is confirmed by a read taken after the toggle; queued
// follow-ups can be checked and dismissed; unknown receipt states stay unknown.
describe('422 by provable match, Off read after the toggle, queued rows, unknown states', () => {
  const reuse = (agent: any, admit: boolean) => {
    const real = agent.turn.bind(agent);
    let done = false;
    agent.turn = (...a: unknown[]) => {
      if (done) return real(...a);
      done = true;
      if (admit) { const p = real(...a); return p.then(() => Promise.reject({ status: 422, code: 'idempotency_key_reused' })); }
      agent.log.push(['turn', a]);
      return Promise.reject({ status: 422, code: 'idempotency_key_reused' });
    };
  };
  const two = () => setup({ script: [[{ k: 'text', text: 'First.' }], [{ k: 'text', text: 'x' }]] });
  it('an earlier identical message is not proof: "yes" again after a 422 stays may-have-gone-through, with Dismiss, never sent or Not sent', async () => {
    const t = await two();
    t.eng.send('yes');
    await t.flush(2000);
    reuse(t.agent, false);
    t.eng.send('yes');
    await t.flush(200);
    const row = users(t.snap()).filter((x: any) => x.text === 'yes')[1];
    expect(row).toMatchObject({ state: 'unknown', reason: 'ask.cannotTell' });
    t.eng.dismiss(row.id);
    expect(users(t.snap()).filter((x: any) => x.text === 'yes')).toHaveLength(1);
  });
  it('absence from the history is not proof of Not sent: the row stays may-have-gone-through, never Send again', async () => {
    const t = await two();
    t.eng.send('One');
    await t.flush(2000);
    reuse(t.agent, false);
    t.eng.send('Two');
    await t.flush(200);
    expect(users(t.snap()).find((x: any) => x.text === 'Two')).toMatchObject({ state: 'unknown', reason: 'ask.cannotTell' });
  });
  it('an occurrence of the text this page cannot account for does not prove sent either', async () => {
    const t = await two();
    t.eng.send('One');
    await t.flush(2000);
    reuse(t.agent, true);
    t.eng.send('Two');
    await t.flush(200);
    // The page's own row (the history may show the agent's copy once the session's turn is read back).
    expect(users(t.snap()).find((x: any) => x.text === 'Two' && x.key)).toMatchObject({ state: 'unknown', reason: 'ask.cannotTell' });
  });
  it('the turn key stays stored for a reload; the row stays may-have-gone-through', async () => {
    const t = await two();
    t.eng.send('One');
    await t.flush(2000);
    reuse(t.agent, false);
    t.eng.send('Two');
    await t.flush(200);
    expect(users(t.snap()).find((x: any) => x.text === 'Two')).toMatchObject({ state: 'unknown', reason: 'ask.cannotTell' });
    expect(t.eng.record?.w).toBe(true);
  });
  it('a confirmed Off is read again before the next turn: another client switched it On, so Off is put first', async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'A.' }], [{ k: 'text', text: 'B.' }]] });
    t.eng.setAuto(false);
    t.eng.send('One');
    await t.flush(2000);
    const sid = t.eng.record!.s!;
    (t.agent as any).ss.get(sid).yolo = true;   // another client
    const n = t.agent.log.length;
    t.eng.send('Two');
    await t.flush(2000);
    const log = t.agent.log.slice(n).map((x) => x[0]);
    expect(log.indexOf('approval')).toBeGreaterThan(-1);
    expect(log.indexOf('yolo')).toBeGreaterThan(log.indexOf('approval'));
    expect(log.indexOf('turn')).toBeGreaterThan(log.indexOf('yolo'));
    expect((t.agent as any).ss.get(sid).yolo).toBe(false);
  });
  it('a read started before a refused Off never makes it look confirmed', async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'A.' }], [{ k: 'text', text: 'B.' }]] });
    t.eng.send('One');
    await t.flush(2000);
    const k1 = t.eng.record!.k1;
    let answer: (v: unknown) => void = () => {};
    let first = true;   // the first read hangs and later answers stale Off; every later read tells the truth (On)
    (t.agent as any).approval = (...x: unknown[]) => { t.agent.log.push(['approval', x]); if (!first) return Promise.resolve({ yolo: true }); first = false; return new Promise((res) => { answer = res; }); };
    (t.agent as any).yolo = (...x: unknown[]) => { t.agent.log.push(['yolo', x]); return Promise.reject({ status: 409, code: 'approval_policy_locked' }); };
    t.eng.openConversation(k1);
    await t.flush(500);
    t.eng.setAuto(false);
    await t.flush(50);
    answer({ yolo: false });   // the stale read lands after the refused Off
    await t.flush(50);
    t.eng.send('Two');
    await t.flush(500);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
  });
  it('a queued follow-up can be checked by its command id and dismissed', async () => {
    const t = await setup({ pace: 400 });
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('Also add a README');
    await t.flush(10);
    const row = users(t.snap()).find((x: any) => x.text === 'Also add a README');
    expect(row.state).toBe('queued');
    t.eng.check(row.id);
    await t.flush(5);
    expect(calls(t.agent, 'commandGet')).toHaveLength(1);
    t.eng.dismiss(row.id);
    expect(users(t.snap()).find((x: any) => x.id === row.id)).toBeUndefined();
    expect(t.eng.record?.k3).toBeUndefined();
  });
  it('a follow-up receipt with a state the page does not know stays may-have-gone-through and keeps its key', async () => {
    const t = await setup({ pace: 400 });
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    (t.agent as any).command = (...x: unknown[]) => { t.agent.log.push(['command', x]); return Promise.resolve({ command_id: 'cmd_w', state: 'weird' }); };
    t.eng.send('Also add a README');
    await t.flush(20);
    expect(users(t.snap()).find((x: any) => x.text === 'Also add a README').state).toBe('unknown');
    expect(t.eng.record?.k3).toHaveLength(1);
  });
});

// An empty turn list after a reload is not
// "completed"; a lost Off/On answer whose read fails shows the mode as unknown; identical text retyped while a
// follow-up waits asks first ("already waiting", Send anyway), and a reload's text-less waiting rows ask once.
describe('no turn is not completed, unknown mode, already waiting', () => {
  it('Check status after a reload finds no turn for a lost first message: the row stays, retype or Dismiss, never completed', async () => {
    const store = memStore();
    const t = await setup({ createLost: true }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(100);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(50);
    const row = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown');
    t2.check(row.id);
    await t.flush(3000);
    expect(users(t2.getSnapshot()).find((x: any) => x.id === row.id)).toMatchObject({ state: 'unknown', reason: 'ask.notStarted' });
    expect(t2.record?.ph).not.toBe('completed');
    t2.dismiss(row.id);
    expect(users(t2.getSnapshot()).find((x: any) => x.id === row.id)).toBeUndefined();
  });
  it('a lost Off answer and a failed read: the mode shows unknown, not the old value', async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'A.' }]] });
    t.eng.setAuto(true);
    t.eng.send('One');
    await t.flush(2000);
    expect(t.snap().auto.on).toBe(true);
    lostAfter(t.agent, 'yolo');
    failOnce(t.agent, 'approval', { status: 503 });
    t.eng.setAuto(false);
    await t.flush(100);
    expect(t.snap().auto.on).toBeNull();
    expect(t.snap().auto.err).toBe('ask.autoUnknown');
    expect(t.eng.autoShown()).toBeNull();   // the chip never shows the request (Off) as the session's mode
  });
  it('identical text retyped while its follow-up waits: an inline note, nothing sent; Send anyway sends it under a new key', async () => {
    const t = await setup({ pace: 400 });
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('Also add a README');
    await t.flush(10);
    expect(users(t.snap()).find((x: any) => x.text === 'Also add a README').state).toBe('queued');
    expect(t.eng.send('Also add a README')).toBe(false);
    expect(t.snap().dup).toEqual({ text: 'Also add a README', earlier: false });
    expect(calls(t.agent, 'command')).toHaveLength(1);
    expect(t.eng.send('Also add a README', true)).toBe(true);
    await t.flush(10);
    const cm = calls(t.agent, 'command');
    expect(cm).toHaveLength(2);
    expect(cm[1]![1][2]).not.toBe(cm[0]![1][2]);
    expect(t.snap().dup).toBeNull();
  });
  it('different text while a follow-up waits goes at once, no note', async () => {
    const t = await setup({ pace: 400 });
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('Also add a README');
    await t.flush(10);
    expect(t.eng.send('And a license')).toBe(true);
    expect(t.snap().dup).toBeNull();
  });
  it('after a reload a waiting follow-up has no text to compare: the next message asks once, then goes; later ones go at once', async () => {
    const store = memStore();
    const t = await setup({ pace: 400 }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('alpha');
    await t.flush(10);
    t.eng.end();
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(20);
    expect(users(t2.getSnapshot()).find((x: any) => !x.text && x.via === 'command')?.state).toBe('queued');
    expect(t2.send('alpha')).toBe(false);
    expect(t2.getSnapshot().dup).toEqual({ text: 'alpha', earlier: true });
    expect(calls(t.agent, 'command')).toHaveLength(1);
    expect(t2.send('alpha', true)).toBe(true);
    await t.flush(10);
    expect(t2.send('beta')).toBe(true);
    await t.flush(10);
    expect(calls(t.agent, 'command')).toHaveLength(3);
  });
});

// Each fix that could be removed with every test still green gets a test that fails without
// it; the stream's mode wins over an older read; a restored follow-up that started a turn shows that turn; a 422
// never proves sent and its row survives a reload; an unknown settled state stays unknown; a stale tab keeps
// another tab's follow-up keys.
describe('removed fixes fail, stream mode, restored new turns, 422 rows, two tabs', () => {
  const deferApproval = (agent: any) => {
    const real = agent.approval.bind(agent);
    let answer: (v: unknown) => void = () => {};
    agent.approval = (...a: unknown[]) => {
      agent.log.push(['approval', a]);
      agent.approval = real;
      return new Promise((res) => { answer = res; });
    };
    return (v: unknown) => answer(v);
  };
  const offThenOne = async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'A.' }], [{ k: 'text', text: 'B.' }], [{ k: 'text', text: 'C.' }]] });
    t.eng.setAuto(false);
    t.eng.send('One');
    await t.flush(2000);
    expect(t.snap().auto.on).toBe(false);
    return t;
  };
  it('a read taken before an On, answering Off after it, never lets a message go while the agent may approve alone', async () => {
    const t = await offThenOne();
    const answer = deferApproval(t.agent);
    t.eng.send('Two');                       // reads the mode first; the read hangs
    await t.flush(10);
    t.eng.setAuto(true);                     // On goes through
    await t.flush(50);
    (t.agent as any).yolo = (...a: unknown[]) => { t.agent.log.push(['yolo', a]); return Promise.reject({ status: 409, code: 'approval_policy_locked' }); };
    t.eng.setAuto(false);                    // Off is refused from here on: the agent stays On
    await t.flush(50);
    answer({ yolo: false });                 // the old read lands now
    await t.flush(300);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    expect(users(t.snap()).find((x: any) => x.text === 'Two').state).not.toBe('sent');
  });
  it('another client switches On on the stream while a read is out: the older Off answer is ignored and Off is put first', async () => {
    const t = await offThenOne();
    const answer = deferApproval(t.agent);
    const n = t.agent.log.length;
    t.eng.send('Two');
    await t.flush(10);
    const sid = t.eng.record!.s!;
    (t.agent as any).ss.get(sid).yolo = true;                          // another client
    (t.eng as any).autoFrame({ event: { data: { enabled: true } } });  // and its event on the stream
    answer({ yolo: false });                                           // the read taken before it
    await t.flush(300);
    const log = t.agent.log.slice(n).map((x) => x[0]);
    expect(log.indexOf('yolo')).toBeGreaterThan(-1);
    expect(log.indexOf('turn')).toBeGreaterThan(log.indexOf('yolo'));
    expect((t.agent as any).ss.get(sid).yolo).toBe(false);
  });
  const queuedScript = { pace: 400, holdQueued: true, script: [[{ k: 'text' as const, text: 'Working.' }, { k: 'text' as const, text: ' Done.' }], [{ k: 'text' as const, text: 'README added.' }, { k: 'text' as const, text: ' And more.' }, { k: 'text' as const, text: ' End.' }]] };
  it('a follow-up that starts a new turn: its reply is read from the history even when its frames went by unseen', async () => {
    const t = await setup(queuedScript);
    const realEmit = (t.agent as any).emit.bind(t.agent);
    let blind = false;
    (t.agent as any).emit = (tid: any, type: string, data: any, gate: any) => {
      if (type === 'event.command_committed' && data.how === 'new_turn') blind = true;
      if (blind && type === 'event.stream_chunk') return;
      return realEmit(tid, type, data, gate);
    };
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('Also add a README');
    await t.flush(10);
    expect(users(t.snap()).find((x: any) => x.text === 'Also add a README').state).toBe('queued');
    await t.flush(4000);
    expect(replies(t.snap()).join('')).toContain('README added.');
  });
  it('a follow-up still queued when its turn ends: its commit into a new turn arrives on the stream, which stays open', async () => {
    const t = await setup(queuedScript);
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('Also add a README');
    await t.flush(10);
    await t.flush(1300);   // the first turn ends; a step later the follow-up starts the next one
    const sid = t.eng.record!.s!;
    const running = (t.agent as any).ss.get(sid).running;
    expect(running).toBeTruthy();
    expect(users(t.snap()).find((x: any) => x.text === 'Also add a README').state).toBe('sent');
    expect(C.current(t.snap().conv)?.s.turnId).toBe(running);
  });
  const reloadQueued = async () => {
    const store = memStore();
    const t = await setup(queuedScript, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('Also add a README');
    await t.flush(10);
    t.eng.end();
    return { t, store };
  };
  it('a restored follow-up read back with a state the page does not know stays unsettled, key kept', async () => {
    const { t, store } = await reloadQueued();
    const id = (t.agent as any).ss.get(t.eng.record!.s!).queued[0].id;
    (t.agent as any).commandGet = (...a: unknown[]) => { t.agent.log.push(['commandGet', a]); return Promise.resolve({ command_id: id, state: 'weird' }); };
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(20);
    const row = users(t2.getSnapshot()).find((x: any) => !x.text && x.via === 'command');
    expect(row).toMatchObject({ state: 'unknown', reason: 'ask.checkFailed' });
    expect(t2.record?.k3).toHaveLength(1);
  });
  it('a restored follow-up that already started a new turn: the reopen shows that turn running, without another send', async () => {
    const { t, store } = await reloadQueued();
    await t.flush(1300);   // the first turn ends while the page is away; a step later the follow-up starts the next one
    const sid = t.eng.record!.s!;
    const running = (t.agent as any).ss.get(sid).running;
    expect(running).toBeTruthy();
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(50);
    const cur = C.current(t2.getSnapshot().conv);
    expect(cur?.s.turnId).toBe(running);
    expect(C.running(cur)).toBe(true);
    await t.flush(3000);
    expect(replies(t2.getSnapshot()).join('')).toContain('README added.');
  });
  it('a settled event with a state the page does not know leaves the follow-up unknown with its key, never refused', async () => {
    const t = await setup(queuedScript);
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('Also add a README');
    await t.flush(10);
    const row = users(t.snap()).find((x: any) => x.text === 'Also add a README');
    (t.agent as any).emit(t.eng.record!.s, undefined, 'event.command_settled', { command_ids: [row.commandId], state: 'weird' });
    await t.flush(50);   // a frame repaints within 40 ms
    expect(users(t.snap()).find((x: any) => x.id === row.id).state).toBe('unknown');
    expect(t.eng.record?.k3).toHaveLength(1);
  });
  const reuse422 = (agent: any) => {
    const real = agent.turn.bind(agent);
    let done = false;
    agent.turn = (...a: unknown[]) => {
      if (done) return real(...a);
      done = true;
      agent.log.push(['turn', a]);
      return Promise.reject({ status: 422, code: 'idempotency_key_reused' });
    };
  };
  it('a 422 never proves sent, even with the same text in the conversation from elsewhere', async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'First.' }], [{ k: 'text', text: 'x' }]] });
    t.eng.send('One');
    await t.flush(2000);
    (t.agent as any).ss.get(t.eng.record!.s!).msgs.push({ role: 'user', blocks: [{ kind: 'text', text: 'Two' }] });   // another client's copy
    reuse422(t.agent);
    t.eng.send('Two');
    await t.flush(200);
    expect(users(t.snap()).find((x: any) => x.text === 'Two')).toMatchObject({ state: 'unknown', reason: 'ask.cannotTell' });
  });
  it('the undecided 422 row survives a reload; Dismiss removes it for good', async () => {
    const store = memStore();
    const t = await setup({ script: [[{ k: 'text', text: 'First.' }], [{ k: 'text', text: 'x' }]] }, store);
    t.eng.send('One');
    await t.flush(2000);
    reuse422(t.agent);
    t.eng.send('Two');
    await t.flush(200);
    expect(t.eng.record?.w).toBe(true);
    t.eng.end();
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(200);
    const row = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown' && !x.text);
    expect(row).toBeTruthy();
    t2.dismiss(row.id);
    expect(t2.record?.w).toBeUndefined();
    t2.end();
    const t3 = new AskEngine(slot, t.agent, store, t.clock);
    t3.open();
    await t.flush(200);
    expect(users(t3.getSnapshot()).some((x: any) => x.state === 'unknown')).toBe(false);
  });
  it("a stale second tab saving the same conversation keeps the first tab's queued follow-up key", async () => {
    const store = memStore();
    const t = await setup({ pace: 400 }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);   // opened before the follow-up
    t2.open();
    await t.flush(20);
    t.eng.send('Also add a README');
    await t.flush(10);
    const k = calls(t.agent, 'command')[0]![1][2];
    (t2 as any).save();
    const stored = C.convsFor(store.read(ACCOUNT), ACCOUNT, { p: slot.project, c: slot.computer, r: REALM })[0];
    expect(stored?.k3).toContain(k);
  });
});

// A receipt read of one turn never holds back the next turn's, and a dismissed "no turn" first message
// does not come back after a reload.
describe('receipts per turn, a dismissed first message stays dismissed', () => {
  it("a receipt read still out for the old turn does not skip the new turn's receipt", async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'A.' }], [{ k: 'text', text: 'B.' }]] });
    t.eng.send('One');
    await t.flush(2000);
    const first = C.current(t.snap().conv)!.s.turnId;
    const real = (t.agent as any).receipt.bind(t.agent);
    (t.agent as any).receipt = (sid: string, tid: string) => {
      if (tid === first) { t.agent.log.push(['receipt', [sid, tid]]); return new Promise(() => {}); }   // never answers
      return real(sid, tid);
    };
    (t.eng as any).receipt();   // the old turn's read, left hanging
    lostAfter(t.agent, 'turn');
    t.eng.send('Two');
    await t.flush(100);
    const row = users(t.snap()).find((x: any) => x.text === 'Two');
    expect(row.state).toBe('unknown');
    t.eng.check(row.id);        // the stored receipt: a duplicate, whose turn is read back at once
    await t.flush(100);
    expect(calls(t.agent, 'receipt').some((c) => c[1][1] !== first)).toBe(true);   // the new turn's own read
  });
  it('Dismiss on a first message that has no turn forgets that conversation: a reload shows nothing for it', async () => {
    const store = memStore();
    const t = await setup({ createLost: true }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(100);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(50);
    const row = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown');
    t2.check(row.id);
    await t.flush(3000);
    expect(users(t2.getSnapshot()).find((x: any) => x.id === row.id)?.reason).toBe('ask.notStarted');
    t2.dismiss(row.id);
    expect(t2.record).toBeNull();
    expect(users(t2.getSnapshot())).toHaveLength(0);
    t2.end();
    const t3 = new AskEngine(slot, t.agent, store, t.clock);
    t3.open();
    await t.flush(3000);
    expect(users(t3.getSnapshot())).toHaveLength(0);
    expect(calls(t.agent, 'turn')).toHaveLength(0);
  });
});
describe('Dismiss settles the stored phase', () => {
  it('a later turn whose answer was lost, dismissed after a reload: the stored phase is the last turn\'s, and the next reload runs nothing', async () => {
    const store = memStore();
    const t = await setup({ script: [[{ k: 'text', text: 'A.' }], [{ k: 'text', text: 'B.' }]] }, store);
    t.eng.send('One');
    await t.flush(2000);
    failOnce(t.agent, 'turn', { status: 502, pending: true });   // lost before the agent saw it
    t.eng.send('Two');
    await t.flush(200);
    expect(t.eng.record?.ph).toBe('unknown');
    t.eng.end();
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(200);
    const row = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown' && !x.text);
    t2.dismiss(row.id);
    expect(t2.record?.ph).toBe('completed');
    expect(t2.record?.w).toBeUndefined();
    t2.end();
    const n = calls(t.agent, 'receipt').length;
    const t3 = new AskEngine(slot, t.agent, store, t.clock);
    t3.open();
    await t.flush(200);
    expect(calls(t.agent, 'receipt')).toHaveLength(n);
    expect(users(t3.getSnapshot()).some((x: any) => x.state === 'unknown')).toBe(false);
    expect(calls(t.agent, 'turn')).toHaveLength(2);
    // New text after all that goes under a fresh key, never the dismissed one's.
    const old = t2.record!.k2;
    expect(t3.send('Three')).toBe(true);
    await t.flush(200);
    expect(calls(t.agent, 'turn').at(-1)![1][2]).not.toBe(old);
  });
});
describe('a queued follow-up that starts a new turn while the dock is closed', () => {
  it("the new turn's approval card shows when the dock opens again", async () => {
    const t = await setup({ pace: 400, holdQueued: true, script: [[{ k: 'text', text: 'Working.' }, { k: 'text', text: ' Done.' }], scripts.approval] });
    t.eng.setAuto(false);   // so the agent asks
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('Also add a README');
    await t.flush(10);
    t.eng.suspend();
    await t.flush(3000);   // the first turn ends, the follow-up starts the next one, which stops at its approval
    const sid = t.eng.record!.s!;
    expect((t.agent as any).ss.get(sid).gate).toBeTruthy();
    t.eng.resume();
    await t.flush(500);
    const running = (t.agent as any).ss.get(sid).running;
    expect(C.current(t.snap().conv)?.s.turnId).toBe(running);
    expect(t.snap().gate).toBeTruthy();
  });
});
describe('a restored follow-up adopts its new turn cleanly', () => {
  it("after a reload: the new turn's approval card shows, and no older turn is left looking unfinished", async () => {
    const store = memStore();
    const t = await setup({ pace: 400, holdQueued: true, script: [[{ k: 'text', text: 'Working.' }, { k: 'text', text: ' Done.' }], scripts.approval] }, store);
    t.eng.setAuto(false);
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('Also add a README');
    await t.flush(10);
    t.eng.end();
    await t.flush(3000);
    const sid = t.eng.record!.s!;
    expect((t.agent as any).ss.get(sid).gate).toBeTruthy();
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(500);
    const conv = t2.getSnapshot().conv;
    expect(C.current(conv)?.s.turnId).toBe((t.agent as any).ss.get(sid).running);
    expect(t2.getSnapshot().gate).toBeTruthy();
    expect(conv.turns.slice(0, -1).every((x: any) => !!x.s.terminal)).toBe(true);
  });
});
describe('resume after the first turn ended, stale tabs', () => {
  const qs = { pace: 400, holdQueued: true, script: [[{ k: 'text' as const, text: 'Working.' }, { k: 'text' as const, text: ' Done.' }], scripts.approval] };
  it('a queued follow-up that starts and stops at its approval while the dock is closed after the first turn ended: the card shows once on resume', async () => {
    const t = await setup(qs);
    t.eng.setAuto(false);
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('Also add a README');
    for (let i = 0; i < 300 && C.running(C.current(t.snap().conv)); i++) await t.flush(10);
    expect(C.running(C.current(t.snap().conv))).toBe(false);
    expect(users(t.snap()).some((x: any) => x.state === 'queued')).toBe(true);
    t.eng.suspend();
    await t.flush(3000);
    const sid = t.eng.record!.s!;
    expect((t.agent as any).ss.get(sid).gate).toBeTruthy();
    t.eng.resume();
    await t.flush(500);
    expect(C.current(t.snap().conv)?.s.turnId).toBe((t.agent as any).ss.get(sid).running);
    expect(t.snap().gate).toBeTruthy();
    t.eng.decide('once');
    await t.flush(3000);
    expect(calls(t.agent, 'confirm')).toHaveLength(1);
    expect(t.snap().gate).toBeFalsy();
    expect(C.blocks(t.snap().conv, 0).filter((b) => b.k === 'decided')).toHaveLength(1);
  });
  it("a stale tab's save after another tab dismissed a later turn brings back neither the row nor its key", async () => {
    const store = memStore();
    const t = await setup({ script: [[{ k: 'text', text: 'A.' }], [{ k: 'text', text: 'B.' }]] }, store);
    t.eng.send('One');
    await t.flush(2000);
    failOnce(t.agent, 'turn', { status: 502, pending: true });
    t.eng.send('Two');
    await t.flush(200);
    const old = t.eng.record!.k2;
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(200);
    const row = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown' && !x.text);
    t2.dismiss(row.id);
    t2.end();
    (t.eng as any).unknownTurn(users(t.snap()).find((x: any) => x.state === 'unknown').id);   // the stale tab saves its own record
    (t.eng as any).save();
    const rec = L.parseStore(t.store.raw()).a[ACCOUNT]!.find((x) => x.k1 === t.eng.record!.k1)!;
    expect(rec.w).toBeUndefined();
    expect(rec.ph).toBe('completed');
    t.eng.end();
    const n = calls(t.agent, 'receipt').length;
    const t3 = new AskEngine(slot, t.agent, store, t.clock);
    t3.open();
    await t.flush(200);
    expect(users(t3.getSnapshot()).some((x: any) => x.state === 'unknown')).toBe(false);
    expect(calls(t.agent, 'receipt')).toHaveLength(n);
    expect(t3.send('Three')).toBe(true);
    await t.flush(200);
    expect(calls(t.agent, 'turn').at(-1)![1][2]).not.toBe(old);
  });
  it("a stale tab's save after another tab dismissed a first message does not bring its conversation back", async () => {
    const store = memStore();
    const t = await setup({ createLost: true }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(100);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(50);
    const row = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown');
    t2.check(row.id);
    await t.flush(3000);
    t2.dismiss(row.id);
    t2.end();
    (t.eng as any).save();
    t.eng.end();
    expect(L.parseStore(t.store.raw()).a[ACCOUNT] ?? []).toHaveLength(0);
    const t3 = new AskEngine(slot, t.agent, store, t.clock);
    t3.open();
    await t.flush(3000);
    expect(users(t3.getSnapshot())).toHaveLength(0);
  });
  it("a stale tab's save after another tab dismissed a follow-up keeps that key gone", async () => {
    const store = memStore();
    const t = await setup({ pace: 200 }, store);
    t.eng.send('Build me a small dashboard');
    await t.flush(250);
    failOnce(t.agent, 'command', { status: 502, pending: true });
    t.eng.send('Also add a README');
    await t.flush(50);
    const key = t.eng.record!.k3![0]!;
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(100);
    const row = users(t2.getSnapshot()).find((x: any) => x.via === 'command' && !x.text);
    t2.dismiss(row.id);
    t2.end();
    (t.eng as any).save();
    const rec = L.parseStore(t.store.raw()).a[ACCOUNT]!.find((x) => x.k1 === t.eng.record!.k1)!;
    expect(rec.k3 ?? []).not.toContain(key);
  });
  it("an approval decided in an adopted new turn stays as its decided line after the turn's history is read again", async () => {
    const t = await setup(qs);
    t.eng.setAuto(false);
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    t.eng.send('Also add a README');
    for (let i = 0; i < 60 && !t.snap().gate; i++) await t.flush(100);
    expect(t.snap().gate).toBeTruthy();
    const n = calls(t.agent, 'transcript').length;
    t.eng.decide('once');
    await t.flush(5000);
    expect(C.running(C.current(t.snap().conv))).toBe(false);
    expect(calls(t.agent, 'transcript').length).toBeGreaterThan(n);
    expect(C.blocks(t.snap().conv, 0).filter((b) => b.k === 'decided')).toHaveLength(1);
  });
});
describe('resume finds a follow-up it cannot name', () => {
  it("a follow-up whose queue answer was lost starts and stops at its approval while the dock is closed: the card shows on resume", async () => {
    const t = await setup({ pace: 400, holdQueued: true, script: [[{ k: 'text', text: 'Working.' }, { k: 'text', text: ' Done.' }], scripts.approval] });
    t.eng.setAuto(false);
    t.eng.send('Build me a small dashboard');
    await t.flush(450);
    lostAfter(t.agent, 'command');   // the agent queues it; the answer never comes back
    t.eng.send('Also add a README');
    await t.flush(50);
    expect(users(t.snap()).find((x: any) => x.text === 'Also add a README').commandId).toBeFalsy();
    for (let i = 0; i < 300 && C.running(C.current(t.snap().conv)); i++) await t.flush(10);
    t.eng.suspend();
    await t.flush(3000);
    const sid = t.eng.record!.s!;
    expect((t.agent as any).ss.get(sid).gate).toBeTruthy();
    t.eng.resume();
    await t.flush(1000);
    expect(C.current(t.snap().conv)?.s.turnId).toBe((t.agent as any).ss.get(sid).running);
    expect(t.snap().gate).toBeTruthy();
    expect(calls(t.agent, 'command')).toHaveLength(1);
    t.eng.decide('once');
    await t.flush(3000);
    expect(calls(t.agent, 'confirm')).toHaveLength(1);
  });
  it("a stale tab's late failure never moves the stored turn back past a turn another tab started", async () => {
    const store = memStore();
    const t = await setup({ pace: 100, script: [[{ k: 'text', text: 'A.' }], scripts.approval] }, store);
    t.eng.setAuto(false);
    t.eng.send('One');
    await t.flush(2000);
    let fail: (e: unknown) => void = () => {};
    const real = (t.agent as any).turn.bind(t.agent);
    (t.agent as any).turn = (...a: unknown[]) => { t.agent.log.push(['turn', a]); (t.agent as any).turn = real; return new Promise((_r, j) => { fail = j; }); };
    t.eng.send('Two');            // held: no answer yet, the agent never saw it
    await t.flush(100);
    const t2 = new AskEngine(slot, t.agent, store, t.clock);
    t2.open();
    await t.flush(300);
    const row = users(t2.getSnapshot()).find((x: any) => x.state === 'unknown' && !x.text);
    t2.dismiss(row.id);
    expect(t2.send('Three')).toBe(true);
    for (let i = 0; i < 60 && !t2.getSnapshot().gate; i++) await t.flush(100);
    expect(t2.getSnapshot().gate).toBeTruthy();
    const newer = t2.record!.t;
    fail({ status: 502, pending: true });   // the old request fails late, in the stale tab
    await t.flush(100);
    const rec = L.parseStore(store.raw()).a[ACCOUNT]!.find((x) => x.k1 === t2.record!.k1)!;
    expect(rec.t).toBe(newer);
    expect(C.isLivePhase(rec.ph) && rec.ph !== 'unknown').toBe(true);
    t.eng.end(); t2.end();
    const t3 = new AskEngine(slot, t.agent, store, t.clock);
    t3.open();
    await t.flush(1000);
    expect(t3.getSnapshot().gate).toBeTruthy();
  });
});

describe('the journal-less engine judges a create reply by its evidence', () => {
  const rewrite = (fix: (r: any) => any) => (agent: FakeAgent) => {
    const real = (agent as any).create.bind(agent);
    (agent as any).create = async (...a: unknown[]) => fix(await real(...a));
  };
  it('a reply without started stays unknown: no refusal, no turn, the record keeps no session', async () => {
    const t = await setup({}, memStore(), slot, rewrite((r) => ({ session_id: r.session_id })));
    t.eng.send('hello');
    await t.flush(2000);
    const row = users(t.snap())[0];
    expect(row.state).toBe('unknown');
    expect(row.reason ?? '').not.toBe('ask.bindingFailed');
    expect(calls(t.agent, 'turn')).toHaveLength(0);
    expect(t.eng.record?.s ?? null).toBeNull();
    expect(t.eng.record?.ph).toBe('unknown');
  });
  it('a reply for another owner is refused and the store keeps no record that could route a turn', async () => {
    const store = memStore();
    const t = await setup({}, store, slot, rewrite((r) => ({ ...r, started: { ...r.started, owner_fingerprint: 'fp-other' } })));
    t.eng.send('hello');
    await t.flush(2000);
    expect(users(t.snap())[0]).toMatchObject({ state: 'refused', reason: 'ask.bindingFailed' });
    expect(calls(t.agent, 'turn')).toHaveLength(0);
    expect(t.eng.record ?? null).toBeNull();
    expect(JSON.parse(store.raw()).a[ACCOUNT] ?? []).toEqual([]);
  });
});

describe('a Stop answer belongs to the turn it named', () => {
  /** The agent's cancels are held: `cancels[i]` settles the i-th cancel call. */
  function holdCancels(agent: FakeAgent) {
    const out: Array<{ ok: () => void; no: (e: unknown) => void }> = [];
    (agent as any).cancel = (...a: unknown[]) => { agent.log.push(['cancel', a]); return new Promise((res, rej) => { out.push({ ok: () => res({ status: 'ok' }), no: rej }); }); };
    return out;
  }
  /** Turn A runs and its Stop is pressed (cancel #0 held); A then ends on its own; a follow-up starts turn B and its Stop is pressed (cancel #1 held). */
  async function twoTurns() {
    let cancels: ReturnType<typeof holdCancels> = [];
    const t = await setup({ pace: 200 }, memStore(), slot, (a) => { cancels = holdCancels(a); });
    t.eng.send('first');
    await t.flush(250);
    const a = t.eng.getSnapshot().conv.turns.at(-1)!.s.turnId;
    t.eng.stop();
    await t.flush(5000);
    expect(C.current(t.snap().conv)!.s.terminal, 'A ended while its cancel is still out').toBeTruthy();
    t.eng.send('second');
    await t.flush(250);
    const b = C.current(t.snap().conv)!.s.turnId;
    expect(b).not.toBe(a);
    t.eng.stop();
    expect(cancels).toHaveLength(2);
    return { t, cancels, a, b };
  }
  it('the late refusal of turn A\'s cancel does not clear turn B\'s stopping', async () => {
    const { t, cancels, b } = await twoTurns();
    const reads = calls(t.agent, 'receipt').length;
    cancels[0]!.no({ status: 429, code: 'rate_limited' });
    await t.flush(50);
    expect(calls(t.agent, 'receipt').length, 'A\'s refusal reads nothing about B').toBe(reads);
    const cur = C.current(t.snap().conv)!;
    expect(cur.s.turnId).toBe(b);
    expect(cur.s.stopping, 'B is still stopping').toBe(true);
    t.eng.stop();
    expect(calls(t.agent, 'cancel'), 'no second cancel for B').toHaveLength(2);
  });
  it('the refusal of B\'s own cancel still clears its stopping (Stop shows again)', async () => {
    const { t, cancels } = await twoTurns();
    cancels[1]!.no({ status: 403, code: 'forbidden' });
    await t.flush(50);
    expect(C.current(t.snap().conv)!.s.stopping).toBe(false);
  });
  it('turn A\'s accepted cancel stops polling A\'s receipts once B is the current turn', async () => {
    const { t, cancels, b } = await twoTurns();
    const before = calls(t.agent, 'receipt').length;
    cancels[0]!.ok();
    await t.flush(10);
    expect(calls(t.agent, 'receipt').slice(before), 'A\'s accepted cancel starts no receipt poll while B is current').toEqual([]);
    await t.flush(5000);
    const asked = calls(t.agent, 'receipt').slice(before).map((c) => c[1][1]);
    expect(asked.every((x) => x === b), 'every receipt read after B began names B').toBe(true);
  });
  it('turn A\'s receipt that comes back 404 after B began does not close the chat as gone', async () => {
    let cancels: ReturnType<typeof holdCancels> = [];
    const held: Array<(r: unknown) => void> = [];
    const t = await setup({ pace: 200 }, memStore(), slot, (a) => {
      cancels = holdCancels(a);
      const real = (a as any).receipt.bind(a);
      let first = true;
      (a as any).receipt = (...x: unknown[]) => {
        if (!first) return real(...x);
        first = false;
        a.log.push(['receipt', x]);
        return new Promise((_res, rej) => { held.push(rej); });
      };
    });
    t.eng.send('first');
    await t.flush(250);
    t.eng.stop();
    cancels[0]!.ok();
    await t.flush(20);
    expect(held, 'A\'s receipt read is out').toHaveLength(1);
    await t.flush(5000);
    t.eng.send('second');
    await t.flush(250);
    const b = C.current(t.snap().conv)!.s.turnId;
    held[0]!({ status: 404, code: 'not_found' });
    await t.flush(50);
    expect(C.current(t.snap().conv)!.s.turnId).toBe(b);
    expect(t.eng.record?.ph, 'the chat is not marked gone').not.toBe('gone');
    expect(C.blocks(t.snap().conv, 0).some((x: any) => x.k === 'note' && String(x.key ?? x.text ?? '').includes('gone'))).toBe(false);
  });
  it('a resync receipt that comes back 404 for turn A after turn B became current does not close the chat as gone', async () => {
    const held: Array<(r: unknown) => void> = [];
    const t = await setup({ pace: 200 }, memStore(), slot, (a) => {
      (a as any).receipt = (...x: unknown[]) => { a.log.push(['receipt', x]); return new Promise((_res, rej) => { held.push(rej); }); };
    });
    t.eng.send('first');
    await t.flush(250);
    t.eng.checkNow();
    await t.flush(20);
    expect(held.length, 'the receipt reads for A are out (the resync\'s among them)').toBeGreaterThanOrEqual(1);
    // B becomes current while the reads are out (a new_turn command's turn, before its own resync runs).
    const eng = t.eng as any;
    const a = C.current(eng.conv)!;
    eng.conv = { ...eng.conv, turns: [...eng.conv.turns, { ...a, s: { ...a.s, turnId: 'T-B', terminal: null } }] };
    for (const rej of held) rej({ status: 404, code: 'not_found' });
    await t.flush(50);
    expect(t.eng.record?.ph, 'the chat is not marked gone').not.toBe('gone');
    expect(C.current(t.snap().conv)!.s.turnId).toBe('T-B');
  });
  it('the refusal of the same turn\'s cancel clears stopping, and a terminal receipt then finishes the turn', async () => {
    let cancels: ReturnType<typeof holdCancels> = [];
    const t = await setup({ pace: 400 }, memStore(), slot, (a) => {
      cancels = holdCancels(a);
      let first = true;
      const real = (a as any).receipt.bind(a);
      (a as any).receipt = (...x: unknown[]) => {
        if (!first) return real(...x);
        first = false;
        a.log.push(['receipt', x]);
        return Promise.resolve({ turn_id: x[1], state: 'cancelled' });
      };
    });
    t.eng.send('first');
    await t.flush(250);
    t.eng.stop();
    expect(t.snap().status).toBe('stopping');
    cancels[0]!.no({ status: 429, code: 'rate_limited' });
    await t.flush(50);
    const cur = C.current(t.snap().conv)!;
    expect(cur.s.stopping).toBe(false);
    expect(cur.s.terminal, 'the receipt read after the refusal ended the turn').toMatchObject({ state: 'cancelled' });
  });
});

// receipt()'s scheduled retry (the rpolls later() callback) is bound to the
// turn it asked about: once the next turn is current, the old turn's retry reads nothing (a retry not bound to its turn reads the
// new turn's receipt early).
describe("receipt()'s retry belongs to its own turn [:2273]", () => {
  it("a done turn whose receipt stays non-terminal: its retry, due after the next turn began, reads nothing", async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'A.' }], [{ k: 'hold' }]] });
    const real = (t.agent as any).receipt.bind(t.agent);
    // Every receipt of the first turn says it still runs (the agent has not settled it), though its stream said it stopped.
    let firstTid = '';
    (t.agent as any).receipt = (sid: string, tid: string) => {
      if (!firstTid || tid === firstTid) { firstTid = tid; t.agent.log.push(['receipt', [sid, tid]]); return Promise.resolve({ turn_id: tid, state: 'running' }); }
      return real(sid, tid);
    };
    t.eng.send('One');
    await t.flush(400);
    expect(C.current(t.snap().conv)!.s.turnId).toBe(firstTid);
    const s1 = C.current(t.snap().conv)!.s;
    expect(s1.done || s1.discarded).toBeTruthy();
    expect(s1.terminal).toBeFalsy();
    expect((t.eng as any).rpolls, "the done turn's receipt read stayed non-terminal: a retry is due").toBeGreaterThan(0);
    t.eng.send('Two');
    await t.flush(200);
    const second = C.current(t.snap().conv)!.s.turnId;
    expect(second).toBeTruthy();
    expect(second).not.toBe(firstTid);
    const n = calls(t.agent, 'receipt').length;
    await t.flush(3200);   // past RECEIPT_POLL_MS (1500): the old turn's retry comes due while Two holds
    expect(C.current(t.snap().conv)!.s.turnId).toBe(second);
    expect(calls(t.agent, 'receipt').slice(n).map((c) => c[1][1]), "the old turn's retry read nothing, the new turn's receipt included").toEqual([]);
  });
});

describe('answeredLine: what an answered question\'s line keeps', () => {
  const gate = (o: Partial<L.Gate>): L.Gate => ({ kind: 'question', id: 'g1', generation: 1, cause: '', risk: '', leaseRequired: false, dnum: 1, ...o });
  it('a listed option is named after the question\'s first line', () => {
    expect(answeredLine(gate({ question: '\nWhich port?\nPick one.', options: ['8080', '3000'] }), '3000')).toEqual({ text: 'Which port?', said: { answer: '3000' } });
  });
  it('anything else was typed: kept only as typed, never its words', () => {
    const r = answeredLine(gate({ question: 'Which port?', options: ['8080'] }), 'sk-secret-value');
    expect(r).toEqual({ text: 'Which port?', said: { typed: true } });
    expect(JSON.stringify(r)).not.toContain('sk-secret');
  });
  it('a question with no options is always typed', () => {
    expect(answeredLine(gate({ question: 'Name it', options: [] }), 'atlas')).toEqual({ text: 'Name it', said: { typed: true } });
  });
  it('several questions: the first is named, the rest counted', () => {
    const g = gate({ questions: [{ id: 'a', category: '', question: 'Port?', options: ['8080'] }, { id: 'b', category: '', question: 'Name?', options: [] }] });
    expect(answeredLine(g, { a: '8080', b: 'mine' })).toEqual({ text: 'Port?', said: { answer: '8080', more: 1 } });
    expect(answeredLine(g, { a: 'typed', b: 'mine' })).toEqual({ text: 'Port?', said: { typed: true, more: 1 } });
  });
});
