// start.test.ts: Text brought by an entry point (Home's quick ask) always starts a NEW
// conversation and is sent as its first message; the conversation open before stays in Recent, untouched, and is
// never appended to. The person's Approve automatically choice carries over through the normal guard. The dock
// (kit/ask) hands a start over once, and a start nobody took is told "not sent".
/* eslint-disable @typescript-eslint/no-explicit-any */
import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setAskForFixtures, useAskDock, type AskStartOutcome } from '@kit/ask';
import * as C from './conv';
import { AskEngine, resetSignHoldsForTests, type Slot, type StartOutcome, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts, type FakeOptions } from './fake';
import { MAX_TEXT, type AskStore } from './logic';
import { draftFresh, draftSet, markDraftFresh, oweFreshForDraft, startTellFor } from './drafts';
import { slotKey } from './registry';

// Sign-in holds live for the page (module-wide): every test starts with none.
beforeEach(() => { resetSignHoldsForTests(); });

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };

function memStore(): StoreIO {
  let st: AskStore = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a, s) => { if (s) st = JSON.parse(JSON.stringify(s)); } };
}
async function setup(o: Partial<FakeOptions> = {}, opts: { store?: StoreIO; agent?: FakeAgent; hold?: (agent: FakeAgent) => void; reload?: boolean } = {}) {
  const clock = manualClock();
  // A reload's engine draws past the first one's keys: two manual clocks draw the same keys (crypto never does).
  if (opts.reload) for (let i = 0; i < 10_000; i++) clock.random(1);
  const store = opts.store ?? memStore();
  const agent = opts.agent ?? new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], ...o }, clock);
  opts.hold?.(agent);
  const eng = new AskEngine(slot, agent, store, clock);
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  eng.open();
  await flush();
  return { agent, eng, store, flush };
}
const calls = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);
/** A page's start, as the panel hands it to the engine: returns what the page was told, in order. */
function start(eng: AskEngine, text: string): StartOutcome[] {
  const told: StartOutcome[] = [];
  eng.queueStart(text, (o) => told.push(o));
  return told;
}
/** Holds one agent method's answers until released (a slow create, a slow status read). */
function holdMethod(agent: FakeAgent, m: 'create' | 'authStatus' | 'yolo' | 'probe'): { release: () => void } {
  const real = (agent as any)[m].bind(agent);
  const waiting: Array<() => void> = [];
  let open = false;
  (agent as any)[m] = (...a: unknown[]) => (open ? real(...a) : new Promise((res) => waiting.push(() => res(real(...a)))));
  return { release: () => { open = true; for (const w of waiting.splice(0)) w(); } };
}
const users = (eng: AskEngine) => C.blocks(eng.getSnapshot().conv, 0).filter((b) => b.k === 'user').map((b: any) => b.msg.text);

describe('a quick ask starts a new conversation', () => {
  it('the exact repro: an earlier conversation is open, the quick ask goes to a NEW session and the old one is untouched', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'Here is what runs.' }]] });
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    const oldSid = t.eng.record!.s!;
    const oldTurns = calls(t.agent, 'turn').length;
    const oldMsgs = JSON.stringify((t.agent as any).ss.get(oldSid).turns);
    const told = start(t.eng, 'What is running on atlas?');
    await t.flush(2000);
    expect(told).toEqual(['sent']);
    expect(calls(t.agent, 'create')).toHaveLength(2);
    const newSid = t.eng.record!.s!;
    expect(newSid).not.toBe(oldSid);
    // Nothing went to the old session: no turn, no command, its transcript as it was.
    const turns = calls(t.agent, 'turn');
    expect(turns).toHaveLength(oldTurns + 1);
    expect(turns[turns.length - 1]![1][0]).toBe(newSid);
    expect(calls(t.agent, 'command').filter((c) => c[1][0] === oldSid)).toHaveLength(0);
    expect(JSON.stringify((t.agent as any).ss.get(oldSid).turns)).toBe(oldMsgs);
    // The panel shows the new conversation with only the new message; the old one is still in Recent.
    expect(users(t.eng)).toEqual(['What is running on atlas?']);
    t.eng.loadRecent();
    await t.flush(100);
    expect(t.eng.getSnapshot().recent?.length).toBe(2);
  });
  it('while the earlier conversation is still running, it keeps running and gets nothing', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'Fine.' }]], pace: 400 });
    t.eng.send('Build me a small dashboard');
    await t.flush(200);
    const oldSid = t.eng.record!.s!;
    expect(C.running(C.current(t.eng.getSnapshot().conv))).toBe(true);
    const told = start(t.eng, 'Also check the disk');
    await t.flush(4000);
    expect(told).toEqual(['sent']);
    expect(t.eng.record!.s).not.toBe(oldSid);
    expect(calls(t.agent, 'command')).toHaveLength(0);
    expect(calls(t.agent, 'turn').filter((c) => c[1][0] === oldSid)).toHaveLength(1);
  });
  it('with nothing open it is the first conversation (no empty one left behind)', async () => {
    const t = await setup();
    expect(start(t.eng, 'Hello')).toEqual([]);
    await t.flush(2000);
    expect(calls(t.agent, 'create')).toHaveLength(1);
    t.eng.loadRecent();
    await t.flush(100);
    expect(t.eng.getSnapshot().recent?.length).toBe(1);
  });
  it('not ready to send: nothing is sent and the open conversation stays', async () => {
    const t = await setup({ script: [scripts.dashboard] });
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    const sid = t.eng.record!.s;
    expect(start(t.eng, '   ')).toEqual(['notSent']);
    expect(start(t.eng, 'x'.repeat(5000))).toEqual(['notSent']);
    expect(t.eng.record!.s).toBe(sid);
    expect(calls(t.agent, 'create')).toHaveLength(1);
  });
});

describe('waits for the engine and for what is in flight', () => {
  it('a start before the stored conversation is picked up waits, then goes to a NEW session (never the restored one)', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    const oldSid = t.eng.record!.s!;
    t.eng.end();
    // A reload: a new engine on the same store and agent, its status read held, so it is still checking.
    let held: { release: () => void } = { release: () => {} };
    const t2 = await setup({}, { store: t.store, agent: t.agent, reload: true, hold: (a) => { held = holdMethod(a, 'authStatus'); } });
    const told = start(t2.eng, 'Back up my files daily');
    await t2.flush(500);
    expect(told).toEqual([]);
    held.release();
    await t2.flush(2000);
    expect(told).toEqual(['sent']);
    expect(t2.eng.record!.s).not.toBe(oldSid);
    expect(calls(t.agent, 'turn').filter((c) => c[1][0] === oldSid)).toHaveLength(1);
  });
  it('a prefill before the stored conversation is picked up: the next send still goes to a NEW session', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    const oldSid = t.eng.record!.s!;
    t.eng.end();
    let held: { release: () => void } = { release: () => {} };
    const t2 = await setup({}, { store: t.store, agent: t.agent, reload: true, hold: (a) => { held = holdMethod(a, 'authStatus'); } });
    t2.eng.wantFresh();
    held.release();
    await t2.flush(2000);
    expect(t2.eng.send('Schedule a backup every morning')).toBe(true);
    await t2.flush(2000);
    expect(calls(t.agent, 'create')).toHaveLength(2);
    expect(calls(t.agent, 'turn').filter((c) => c[1][0] === oldSid)).toHaveLength(1);
    expect(t2.eng.record!.s).not.toBe(oldSid);
  });
  it('an earlier message whose create is still out is not dropped: both go, each exactly once', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    const slow = holdMethod(t.agent, 'create');
    expect(t.eng.send('Build me a small dashboard')).toBe(true);
    await t.flush(200);
    const told = start(t.eng, 'Back up my files daily');
    await t.flush(500);
    expect(told).toEqual([]);
    slow.release();
    await t.flush(4000);
    expect(told).toEqual(['sent']);
    const creates = calls(t.agent, 'create');
    expect(creates).toHaveLength(2);
    const turns = calls(t.agent, 'turn').map((c) => c[1][1]);
    expect(turns.filter((x) => x === 'Build me a small dashboard')).toHaveLength(1);
    expect(turns.filter((x) => x === 'Back up my files daily')).toHaveLength(1);
  });
  it('an earlier message waiting on its Approve automatically switch is not dropped either', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    t.eng.setAuto(true);
    const slow = holdMethod(t.agent, 'yolo');
    t.eng.send('Build me a small dashboard');
    await t.flush(200);
    const told = start(t.eng, 'Back up my files daily');
    await t.flush(500);
    expect(told).toEqual([]);
    slow.release();
    await t.flush(4000);
    expect(told).toEqual(['sent']);
    const turns = calls(t.agent, 'turn').map((c) => c[1][1]);
    expect(turns.filter((x) => x === 'Build me a small dashboard')).toHaveLength(1);
    expect(turns.filter((x) => x === 'Back up my files daily')).toHaveLength(1);
  });
  it('a lost create answer: the page hears "may have gone through", then "sent" once Check status proves it', async () => {
    const t = await setup({ createLost: true, script: [[{ k: 'text', text: 'ok' }]] });
    const told = start(t.eng, 'Hello');
    await t.flush(2000);
    expect(told).toEqual(['unknown']);
    const u = Object.values(t.eng.getSnapshot().conv.users)[0] as any;
    t.eng.check(u.id);
    await t.flush(3000);
    expect(told).toEqual(['unknown', 'sent']);
    expect(calls(t.agent, 'turn')).toHaveLength(1);
  });
  it('a second start while the first is not sent yet is refused, never queued behind it', async () => {
    const t = await setup({}, { hold: (a) => { holdMethod(a, 'authStatus'); } });
    const a = start(t.eng, 'one');
    const b = start(t.eng, 'two');
    expect(a).toEqual([]);
    expect(b).toEqual(['notSent']);
  });
  it('the engine ends (realm switch) before sending: the page hears "not sent"', async () => {
    const t = await setup({}, { hold: (a) => { holdMethod(a, 'authStatus'); } });
    const told = start(t.eng, 'one');
    t.eng.end();
    expect(told).toEqual(['notSent']);
  });
});

describe('failures and things in flight', () => {
  it('a prefill while the agent does not answer stays owed through Try again: the send still goes to a NEW session', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    const oldSid = t.eng.record!.s!;
    t.eng.end();
    (t.agent as any).o.health = 'lost';
    const t2 = await setup({}, { store: t.store, agent: t.agent, reload: true });
    t2.eng.wantFresh();
    await t2.flush(30_000);
    expect(t2.eng.getSnapshot().band?.k).toBe('unreachable');
    expect(t2.eng.send('Schedule a backup')).toBe(false);
    (t.agent as any).o.health = 'ok';
    t2.eng.open();   // Try again
    await t2.flush(3000);
    expect(t2.eng.send('Schedule a backup every morning')).toBe(true);
    await t2.flush(3000);
    expect(calls(t.agent, 'create')).toHaveLength(2);
    expect(calls(t.agent, 'turn').filter((c) => c[1][0] === oldSid)).toHaveLength(1);
    expect(t2.eng.record!.s).not.toBe(oldSid);
  });
  it('a start waits for a decision still on its way; a definite refusal of it is still recorded on the old conversation', async () => {
    const t = await setup({ script: [scripts.approval, [{ k: 'text', text: 'ok' }]] });
    t.eng.setAuto(false);
    t.eng.send('Add a chart');
    await t.flush(500);
    expect(t.eng.getSnapshot().status).toBe('waiting');
    const oldK1 = t.eng.record!.k1;
    const waiting: Array<() => void> = [];
    (t.agent as any).confirm = () => new Promise((_res, rej) => waiting.push(() => rej({ status: 429, code: 'rate_limited' })));
    t.eng.decide('once');
    await t.flush(100);
    const told = start(t.eng, 'Back up my files daily');
    await t.flush(500);
    expect(told).toEqual([]);
    for (const w of waiting.splice(0)) w();
    await t.flush(3000);
    expect(told).toEqual(['sent']);
    const old = C.convsFor(t.store.read(ACCOUNT), ACCOUNT, { p: slot.project, c: slot.computer, r: slot.realm }).find((r) => r.k1 === oldK1)!;
    expect(Object.keys(old.da ?? {})).toEqual([]);
  });
  it.each([['starting', 200_000], ['provisioning', 800_000]] as const)('a start while the computer stays %s: "not sent" once polling gives up, never pending forever', async (st, ms) => {
    const t = await setup({ computerStatus: st });
    const told = start(t.eng, 'Hello');
    await t.flush(10_000);
    expect(told).toEqual([]);
    await t.flush(ms);
    expect(told).toEqual(['notSent']);
    expect(calls(t.agent, 'create')).toHaveLength(0);
  });
  it('a stopped computer: "not sent" at once (the text stays on the page)', async () => {
    const t = await setup({ computerStatus: 'stopped', health: 'lost' });
    const told = start(t.eng, 'Hello');
    await t.flush(30_000);
    expect(told).toEqual(['notSent']);
  });
  it('a lost create whose check meets a reused key stays "may have gone through", never "not sent" (C9)', async () => {
    const t = await setup({ createLost: true, script: [[{ k: 'text', text: 'ok' }]] });
    const told = start(t.eng, 'Hello');
    await t.flush(2000);
    expect(told).toEqual(['unknown']);
    (t.agent as any).create = () => (t.agent as any).no(422, 'idempotency_key_reused');
    const u = Object.values(t.eng.getSnapshot().conv.users)[0] as any;
    t.eng.check(u.id);
    await t.flush(3000);
    expect(told).toEqual(['unknown']);
  });
});

describe('New during loading, sign-in failures', () => {
  async function newWhileLoading() {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    const oldSid = t.eng.record!.s!;
    t.eng.end();
    let held: { release: () => void } = { release: () => {} };
    const t2 = await setup({}, { store: t.store, agent: t.agent, reload: true, hold: (a) => { held = holdMethod(a, 'authStatus'); } });
    t2.eng.newConversation();   // New conversation pressed while the panel still checks
    held.release();
    await t2.flush(3000);
    return { t, t2, oldSid };
  }
  it('New while loading, then a quick ask: it goes to a NEW session', async () => {
    const { t, t2, oldSid } = await newWhileLoading();
    expect(t2.eng.getSnapshot().phase).toBe('ready');
    expect(t2.eng.record).toBeNull();
    const told = start(t2.eng, 'Back up my files daily');
    await t2.flush(3000);
    expect(told).toEqual(['sent']);
    expect(t2.eng.record!.s).not.toBe(oldSid);
    expect(calls(t.agent, 'turn').filter((c) => c[1][0] === oldSid)).toHaveLength(1);
  });
  it('New while loading, then a prefill: the send goes to a NEW session', async () => {
    const { t, t2, oldSid } = await newWhileLoading();
    t2.eng.wantFresh();
    await t2.flush(100);
    expect(t2.eng.send('Schedule a backup every morning')).toBe(true);
    await t2.flush(3000);
    expect(calls(t.agent, 'create')).toHaveLength(2);
    expect(t2.eng.record!.s).not.toBe(oldSid);
  });
  async function signInThen(probe: 'refused' | 'slow') {
    const t = await setup({ auth: 'login', script: [[{ k: 'text', text: 'ok' }]] });
    (t.agent as any).signIn = () => { (t.agent as any).o.auth = 'ready'; return Promise.resolve({ kind: 'signedIn' }); };
    (t.agent as any).probe = () => (probe === 'refused' ? Promise.reject({ status: 403, code: 'forbidden' }) : new Promise(() => {}));
    const told = start(t.eng, 'Hello');
    await t.flush(60_000);
    return { t, told };
  }
  it('signed in, then the realm check is refused: "not sent", nothing created', async () => {
    const { t, told } = await signInThen('refused');
    expect(told).toEqual(['notSent']);
    expect(calls(t.agent, 'create')).toHaveLength(0);
  });
  it('signed in, then the realm check never answers: "not sent" when its budget runs out', async () => {
    const { t, told } = await signInThen('slow');
    expect(told).toEqual(['notSent']);
    expect(calls(t.agent, 'create')).toHaveLength(0);
  });
});

describe('realm round trip, Recent while loading', () => {
  it('a prefilled draft kept across a realm switch and back still goes to a NEW session (old one gets nothing)', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    t.eng.send('original');
    await t.flush(2000);
    const oldSid = t.eng.record!.s!;
    const k = slotKey(slot);
    // Schedules' prefill, as the panel applies it.
    t.eng.wantFresh();
    draftSet(k, 'Schedule ');
    markDraftFresh(k, true);
    await t.flush(500);
    t.eng.end();   // realm B: this engine ends; the draft stays (drafts survive switches)
    const t2 = await setup({}, { store: t.store, agent: t.agent, reload: true });   // back to realm A: a new engine
    oweFreshForDraft(k, t2.eng);
    await t2.flush(2000);
    expect(t2.eng.send('Schedule a backup')).toBe(true);
    await t2.flush(3000);
    expect(calls(t.agent, 'create')).toHaveLength(2);
    expect(calls(t.agent, 'turn').filter((c) => c[1][0] === oldSid).map((c) => c[1][1])).toEqual(['original']);
    expect(calls(t.agent, 'command').filter((c) => c[1][0] === oldSid)).toHaveLength(0);
    draftSet(k, '');
    expect(draftFresh(k)).toBe(false);   // emptied (sent): the intent goes with it
  });
  async function pickWhileLoading() {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    const oldSid = t.eng.record!.s!, oldK1 = t.eng.record!.k1;
    t.eng.end();
    let held: { release: () => void } = { release: () => {} };
    // The realm probe held: the realm is chosen, the stored conversation not picked up yet.
    const t2 = await setup({}, { store: t.store, agent: t.agent, reload: true, hold: (a) => { held = holdMethod(a, 'probe'); } });
    await t2.flush(500);
    expect(t2.eng.getSnapshot().phase).toBe('checking');
    t2.eng.openConversation(oldK1);   // Recent picked while the panel still checks
    held.release();
    await t2.flush(3000);
    return { t, t2, oldSid };
  }
  it('Recent picked while loading: loading picks it up, and a quick ask still goes to a NEW session', async () => {
    const { t, t2, oldSid } = await pickWhileLoading();
    expect(t2.eng.record!.s).toBe(oldSid);
    const told = start(t2.eng, 'Back up my files daily');
    await t2.flush(3000);
    expect(told).toEqual(['sent']);
    expect(t2.eng.record!.s).not.toBe(oldSid);
    expect(calls(t.agent, 'turn').filter((c) => c[1][0] === oldSid)).toHaveLength(1);
  });
  it('Recent picked while loading, then a prefill: the send goes to a NEW session', async () => {
    const { t, t2, oldSid } = await pickWhileLoading();
    t2.eng.wantFresh();
    await t2.flush(100);
    expect(t2.eng.send('Schedule a backup every morning')).toBe(true);
    await t2.flush(3000);
    expect(calls(t.agent, 'create')).toHaveLength(2);
    expect(t2.eng.record!.s).not.toBe(oldSid);
  });
});

describe('a kept prefill never resets a newer start', () => {
  it('prefill left unsent, dock closed, Home quick ask on the same engine (panel remounts): sent, and it stays', async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'ok' }]] });
    const k = slotKey(slot);
    oweFreshForDraft(k, t.eng);              // the panel's first mount on this engine
    t.eng.wantFresh();                       // Schedules' prefill, as the panel applies it
    draftSet(k, 'Schedule ');
    markDraftFresh(k, true);
    await t.flush(500);
    // The dock closes, then Home's quick ask opens it again: the panel takes the start, then remounts.
    markDraftFresh(k, false);
    const told = start(t.eng, 'What is running?');
    oweFreshForDraft(k, t.eng);              // remount on the same engine: nothing owed again
    await t.flush(3000);
    expect(told).toEqual(['sent']);
    expect(users(t.eng)).toEqual(['What is running?']);
    expect(t.eng.record?.s).toBeTruthy();
    expect(calls(t.agent, 'turn')).toHaveLength(1);
    draftSet(k, '');
  });
  it('a quick ask refused before it made anything keeps the prefill owed: realm round trip, the draft still goes NEW', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    t.eng.send('original');
    await t.flush(2000);
    const oldSid = t.eng.record!.s!;
    const k = slotKey(slot);
    oweFreshForDraft(k, t.eng);
    t.eng.wantFresh();                       // Schedules' prefill, left unsent
    draftSet(k, 'Schedule ');
    markDraftFresh(k, true);
    await t.flush(500);
    const told: StartOutcome[] = [];
    t.eng.queueStart('x'.repeat(MAX_TEXT + 1), startTellFor(k, (o: StartOutcome) => told.push(o)));   // as the panel takes it
    await t.flush(2000);
    expect(told).toEqual(['notSent']);
    expect(draftFresh(k)).toBe(true);
    t.eng.end();                             // realm B, then back to A: a new engine
    const t2 = await setup({}, { store: t.store, agent: t.agent, reload: true });
    oweFreshForDraft(k, t2.eng);
    await t2.flush(2000);
    expect(t2.eng.send('Schedule a backup')).toBe(true);
    await t2.flush(3000);
    expect(calls(t.agent, 'turn').filter((c) => c[1][0] === oldSid).map((c) => c[1][1])).toEqual(['original']);
    expect(calls(t.agent, 'command').filter((c) => c[1][0] === oldSid)).toHaveLength(0);
    draftSet(k, '');
  });
  it('a prefill marked while a start is still watched keeps its mark when that start\'s outcome comes', async () => {
    const t = await setup({ createLost: true, script: [[{ k: 'text', text: 'ok' }]] });
    const k = slotKey(slot);
    const told: StartOutcome[] = [];
    t.eng.queueStart('Hello', startTellFor(k, (o: StartOutcome) => told.push(o)));
    t.eng.wantFresh();                       // a Schedules prefill while the start is still being watched
    draftSet(k, 'Schedule ');
    markDraftFresh(k, true);
    await t.flush(2000);
    expect(told).toEqual(['unknown']);
    expect(draftFresh(k)).toBe(true);
    t.eng.end();                             // realm switch: the draft still owes its own new conversation
    expect(draftFresh(k)).toBe(true);
    draftSet(k, '');
  });
  it('a quick ask that made its conversation takes the prefill\'s mark (sent)', async () => {
    const t = await setup({ script: [[{ k: 'text', text: 'ok' }]] });
    const k = slotKey(slot);
    draftSet(k, 'Schedule ');
    markDraftFresh(k, true);
    const told: StartOutcome[] = [];
    t.eng.queueStart('Hello', startTellFor(k, (o: StartOutcome) => told.push(o)));
    await t.flush(3000);
    expect(told).toEqual(['sent']);
    expect(draftFresh(k)).toBe(false);
    draftSet(k, '');
  });
  it('even with the prefill owed while a start is watched, the start is not reset under its outcome', async () => {
    const t = await setup({ createLost: true, script: [[{ k: 'text', text: 'ok' }]] });
    const told = start(t.eng, 'Hello');
    await t.flush(2000);
    expect(told).toEqual(['unknown']);
    t.eng.wantFresh();                       // a later prefill
    await t.flush(500);
    expect(users(t.eng)).toEqual(['Hello']);   // still shown, still watched
    const u = Object.values(t.eng.getSnapshot().conv.users)[0] as any;
    t.eng.check(u.id);
    await t.flush(3000);
    expect(told).toEqual(['unknown', 'sent']);
  });
});

describe('Approve automatically carries over through the normal guard', () => {
  it('switched On: the new session is armed On before its first turn', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    t.eng.setAuto(true);
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    start(t.eng, 'Back up my files daily');
    await t.flush(2000);
    const newSid = t.eng.record!.s!;
    const log = t.agent.log.filter((x) => (x[0] === 'yolo' || x[0] === 'turn') && x[1][0] === newSid).map((x) => `${x[0]}:${String(x[1][1])}`);
    expect(log[0]).toBe('yolo:true');
    expect(log.findIndex((x) => x.startsWith('turn'))).toBeGreaterThan(0);
  });
  it('On (the default): the new session is armed On before its first turn', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    start(t.eng, 'Back up my files daily');
    await t.flush(2000);
    const newSid = t.eng.record!.s!;
    const log = t.agent.log.filter((x) => (x[0] === 'yolo' || x[0] === 'turn') && x[1][0] === newSid).map((x) => `${x[0]}:${String(x[1][1])}`);
    expect(log[0]).toBe('yolo:true');
    expect(log.some((x) => x.startsWith('turn'))).toBe(true);
  });
  it('Off (the person switched it Off): the new session is put Off before its first turn, never left as another client set it', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    t.eng.setAuto(false);
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    start(t.eng, 'Back up my files daily');
    await t.flush(2000);
    const newSid = t.eng.record!.s!;
    const log = t.agent.log.filter((x) => (x[0] === 'yolo' || x[0] === 'turn') && x[1][0] === newSid).map((x) => `${x[0]}:${String(x[1][1])}`);
    expect(log[0]).toBe('yolo:false');
    expect(log.some((x) => x.startsWith('turn'))).toBe(true);
  });
  it('an On seen from another client is not the person\'s choice: after the person\'s Off the new conversation starts Off', async () => {
    const t = await setup({ script: [scripts.dashboard, [{ k: 'text', text: 'ok' }]] });
    t.eng.setAuto(false);
    t.eng.send('Build me a small dashboard');
    await t.flush(2000);
    (t.eng as any).autoFrame({ event: { data: { enabled: true } } });
    start(t.eng, 'Back up my files daily');
    await t.flush(2000);
    const newSid = t.eng.record!.s!;
    expect(calls(t.agent, 'yolo').filter((c) => c[1][0] === newSid).map((c) => c[1][1])).toEqual([false]);
  });
});

describe('the dock hands a start over once', () => {
  setAskForFixtures(true);
  it('a second press before the panel took the first starts nothing new', () => {
    const { result } = renderHook(() => useAskDock());
    const a = vi.fn(), b = vi.fn();
    act(() => result.current.open({ text: 'first', start: true, onStart: a }));
    act(() => result.current.open({ text: 'first', start: true, onStart: b }));
    let d: any;
    act(() => { d = result.current.takeDraft(); });
    expect(d.onStart).toBe(a);
    let again: any;
    act(() => { again = result.current.takeDraft(); });
    expect(again).toBeUndefined();
    act(() => result.current.close());
  });
  it('closed before the panel took it: the page hears "not sent" (it keeps its text), and a later open starts nothing', () => {
    const { result } = renderHook(() => useAskDock());
    const told: AskStartOutcome[] = [];
    act(() => result.current.open({ text: 'q', start: true, onStart: (o) => told.push(o) }));
    act(() => result.current.close());
    expect(told).toEqual(['notSent']);
    act(() => result.current.open());
    let d: any;
    act(() => { d = result.current.takeDraft(); });
    expect(d).toBeUndefined();
    act(() => result.current.close());
  });
  it('the toggle (top bar, Ctrl J) closing it does the same', () => {
    const { result } = renderHook(() => useAskDock());
    const told: AskStartOutcome[] = [];
    act(() => result.current.open({ text: 'q', start: true, onStart: (o) => told.push(o) }));
    act(() => result.current.toggle());
    expect(told).toEqual(['notSent']);
  });
});
