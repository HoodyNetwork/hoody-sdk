// starter.test.ts: the start of a new chat through the kit's `Starter` (kit/agent/conversationsActive.ts), on a real journaled
// dock engine over the real journal (accept/env world), plus the dock's own create body and the
// attach's helper_gates. The provider's contract is the one written on `Starter`: busy until the key is resolved, notSent only on a
// verdict, opened only on a proven session, Stop tracking ends the start (the journal keeps the key), a reloaded page takes up the slot's
// unproven create again, one start shared per account + computer + realm.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Target } from '@core';
import { resetApproversForTests } from '@kit/agent/approver-live';
import type { StartAt, StartOpts, Starter } from '@kit/agent/conversationsActive';
import { resetStartersForTests, starterOf, type StartDeps } from './active';
import * as C from './conv';
import { readStore } from './data';
import { AskEngine, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock } from './fake';
import { dismissal } from './journal';
import { recsLockName } from './journal/locks';
import * as L from './logic';
import strings from './strings.en.json';
import { ACCOUNT, HANDLE, OTHER, REALM, settleReal, showAccount, slot, storedEntries, storedKeys, users, world, type World } from './accept/env';

let w: World | null = null;
let restoreLocks: () => void = () => {};
beforeEach(() => { resetApproversForTests(); resetStartersForTests(); restoreLocks = installLocks(); });
afterEach(() => { resetStartersForTests(); w?.dispose(); w = null; restoreLocks(); resetApproversForTests(); });

// ---- Web Locks, faked: exclusive, FIFO, ifAvailable (as accept/recover.follow-up.test.ts) ----

// ---- Web Locks, faked: exclusive, FIFO, ifAvailable ----
function installLocks(): () => void {
  const held = new Set<string>();
  const waiting = new Map<string, Array<() => void>>();
  const run = (name: string, cb: (lock: unknown) => unknown): Promise<unknown> => {
    held.add(name);
    return Promise.resolve().then(() => cb({ name })).finally(() => { held.delete(name); const next = waiting.get(name)?.shift(); if (next) next(); });
  };
  const locks = {
    request(name: string, a: unknown, b?: unknown): Promise<unknown> {
      const opts = (typeof a === 'function' ? {} : a) as { ifAvailable?: boolean };
      const cb = (typeof a === 'function' ? a : b) as (lock: unknown) => unknown;
      if (opts.ifAvailable) return held.has(name) ? Promise.resolve().then(() => cb(null)) : run(name, cb);
      return new Promise((resolve, reject) => {
        const go = () => run(name, cb).then(resolve, reject);
        if (!held.has(name)) go(); else (waiting.get(name) ?? waiting.set(name, []).get(name)!).push(go);
      });
    },
  };
  const nav = globalThis.navigator as any;
  const had = Object.getOwnPropertyDescriptor(nav, 'locks');
  Object.defineProperty(nav, 'locks', { configurable: true, value: locks });
  return () => { if (had) Object.defineProperty(nav, 'locks', had); else delete nav.locks; };
}

const AT: StartAt = { computer: { project: slot.project, id: slot.computer, name: slot.name }, realm: REALM };
const HOODY: StartOpts = { agent: 'chat', model: 'hoody-ai/hoody-free', strict: true };
const posts = (m: string) => w!.agent.log.filter((x) => x[0] === m);
const bodies = () => posts('create').map((x) => JSON.stringify(x[1][0]));
const lastUser = (e: AskEngine) => users(e.getSnapshot(), C).at(-1);
const settle = async (ms = 600) => { await w!.flush(ms); await settleReal(5); await w!.flush(100); };

/** The place's engine as the registry would give it: the test swaps it to stand for a dock engine replaced after it ended. */
interface Rig { deps: StartDeps; eng: AskEngine; engines: () => void; pending: () => number }
async function rig(o: Parameters<typeof world>[0] = {}): Promise<Rig> {
  w = world(o);
  const eng = await w.dock();
  let engines: () => void = () => {};
  let subs = 0;
  const r: Rig = {
    eng,
    engines: () => engines(),
    pending: () => subs,
    deps: {
      engine: (s: Slot, t: Target) => { expect(s).toEqual(slot); expect((t as any).container.id).toBe(slot.computer); return r.eng; },
      onEngines: (fn) => { engines = fn; return () => { engines = () => {}; }; },
      onPending: (fn) => { subs++; const off = w!.j.subscribe(() => fn()); return () => { subs--; off(); }; },
    },
  };
  return r;
}
const open = (r: Rig): Starter => starterOf(ACCOUNT, AT, r.deps)!;

describe('a start through the Starter', () => {
  it('a Hoody start: the journal holds the key before the create leaves, the body is the explicit one, opened only at the session', async () => {
    const r = await rig();
    const s = open(r);
    expect(s.state().door).toEqual({ ok: true });
    let atPost: string[] | null = null;
    const real = (w!.agent as any).create.bind(w!.agent);
    (w!.agent as any).create = (b: unknown, k: string, rl: string) => { atPost ??= storedKeys(w!.fs); expect(atPost).toContain(k); return real(b, k, rl); };
    expect(s.start('What runs on atlas?', HOODY)).toBe(true);
    expect(['waiting', 'starting']).toContain(s.state().phase.k);
    await settle(2000);
    const ph = s.state().phase;
    expect(ph.k).toBe('opened');
    const sid = r.eng.session()!;
    expect(ph).toEqual({ k: 'opened', ref: { computer: HANDLE, realm: REALM, sid }, from: '' });
    expect(atPost, 'the create key was in the journal when the create left').not.toBeNull();
    expect(bodies()).toEqual([JSON.stringify(L.createBody(REALM, slot.computer, { ...HOODY, helperGates: true }))]);
    expect(bodies()[0]).toBe('{"realm":"' + REALM + '","computer":"' + slot.computer + '","agent":"chat","tool_mode":"standard","dir_scope":"home","approval":{"mode":"always"},"helper_gates":true,"expected_binding":{"realm":"' + REALM + '","computer":"' + slot.computer + '"},"model":"hoody-ai/hoody-free"}');
    expect(posts('create')).toHaveLength(1);
    expect(posts('turn').map((x) => x[1][0])).toEqual([sid]);
    // The page went to the chat: the outcome is taken, the door opens again.
    expect(s.settle(ph)).toBe(true);
    expect(s.state().phase.k).toBe('none');
    expect(s.state().door.ok).toBe(true);
    s.release();
  });

  it('askFirst goes through to the engine: that start is Off; the same start without it is On', async () => {
    const r = await rig();
    const s = open(r);
    expect(s.start('Make a workflow', { ...HOODY, askFirst: true })).toBe(true);
    await settle(2000);
    expect(s.state().phase.k).toBe('opened');
    expect(r.eng.getSnapshot().auto.on).toBe(false);
  });
  it('without askFirst the Starter leaves the default alone: On', async () => {
    const r = await rig();
    const s = open(r);
    expect(s.start('Make a workflow', HOODY)).toBe(true);
    await settle(2000);
    expect(s.state().phase.k).toBe('opened');
    expect(r.eng.getSnapshot().auto.on).toBe(true);
  });
  // What the starter tells a page before Send (`auto`) is what its start then does, whichever way the engine's wish stands: a page
  // that words its approvals from it (New chat) cannot promise asking while the first send switches approving on.
  const DEFAULT: StartOpts = { agent: 'chat', model: 'hoody-ai/hoody-free', strict: false };
  const yolos = () => posts('yolo').map((x) => x[1][1]);
  it('a fresh place says on, and its Default start switches approving on before the first message goes', async () => {
    const r = await rig();
    const s = open(r);
    expect(s.state().auto).toBe(r.eng.autoBefore() ? 'on' : 'off');
    expect(s.state().auto).toBe('on');
    expect(s.start('What runs on atlas?', DEFAULT)).toBe(true);
    await settle(2000);
    expect(s.state().phase.k).toBe('opened');
    expect(yolos()).toEqual([true]);
    const log = w!.agent.log.map((x) => x[0]);
    expect(log.indexOf('yolo')).toBeLessThan(log.indexOf('turn'));
    expect(r.eng.getSnapshot().auto.on).toBe(true);
  });
  it('a place whose switch the person turned off says off, tells its holders, and its start confirms off first', async () => {
    const r = await rig();
    const s = open(r);
    let told = 0;
    const off = s.subscribe(() => { told++; });
    const before = s.state();
    r.eng.setAuto(false);
    expect(s.state().auto).toBe('off');
    expect(s.state()).not.toBe(before);
    expect(told).toBeGreaterThan(0);
    off();
    expect(s.start('What runs on atlas?', DEFAULT)).toBe(true);
    await settle(2000);
    expect(s.state().phase.k).toBe('opened');
    expect(yolos()).toEqual([false]);
    expect(r.eng.getSnapshot().auto.on).toBe(false);
  });
  it('an agent without the switch says none, and its start puts nothing', async () => {
    const r = await rig({ caps: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'] });
    const s = open(r);
    expect(s.state().auto).toBe('none');
    expect(s.start('What runs on atlas?', DEFAULT)).toBe(true);
    await settle(2000);
    expect(s.state().phase.k).toBe('opened');
    expect(yolos()).toEqual([]);
  });
  it('after a start that set the wish aside (askFirst), the place says what the next start gets back', async () => {
    const r = await rig();
    const s = open(r);
    expect(s.start('Make a workflow', { ...HOODY, askFirst: true })).toBe(true);
    await settle(2000);
    const ph = s.state().phase;
    expect(ph.k).toBe('opened');
    expect(r.eng.getSnapshot().auto.on).toBe(false);
    expect(s.settle(ph)).toBe(true);
    expect(s.state().auto).toBe('on');
    expect(s.start('And another', DEFAULT)).toBe(true);
    await settle(2000);
    expect(yolos().at(-1)).toBe(true);
    expect(r.eng.getSnapshot().auto.on).toBe(true);
  });

  it('an opened start names the kind of page that made it; the kind never leaves the page', async () => {
    const r = await rig();
    const s = open(r);
    expect(s.start('What runs on atlas?', { ...HOODY, from: 'workflow' })).toBe(true);
    await settle(2000);
    expect(s.state().phase).toEqual({ k: 'opened', ref: { computer: HANDLE, realm: REALM, sid: r.eng.session()! }, from: 'workflow' });
    expect(bodies()).toEqual([JSON.stringify(L.createBody(REALM, slot.computer, { ...HOODY, helperGates: true }))]);
  });

  it('a Claude Code start sends acp + claude, Default approvals, and no model', async () => {
    const r = await rig();
    const s = open(r);
    expect(s.start('Hi', { agent: 'chat', claude: { model: '' }, cwd: '/home/u/app', strict: false })).toBe(true);
    await settle(2000);
    expect(s.state().phase.k).toBe('opened');
    expect(bodies()[0]).toBe('{"realm":"' + REALM + '","computer":"' + slot.computer + '","agent":"chat","tool_mode":"standard","dir_scope":"home","backend":"acp","delegated_agent":"claude","cwd":"/home/u/app","approval":{"mode":"default"},"helper_gates":true,"expected_binding":{"realm":"' + REALM + '","computer":"' + slot.computer + '","cwd":"/home/u/app"}}');
  });

  it('a choice the create body refuses, or text that cannot go, sends nothing and leaves the door open', async () => {
    const r = await rig();
    const s = open(r);
    expect(s.start('Hi', { agent: 'chat', model: 'hoody-ai/x', claude: { model: '' }, strict: false })).toBe(false);
    expect(s.start('Hi', { agent: '../x', strict: false })).toBe(false);
    expect(s.start('Hi', { agent: 'chat', cwd: 'relative', strict: false })).toBe(false);
    expect(s.start('   ', HOODY)).toBe(false);
    expect(s.start('x'.repeat(L.MAX_TEXT + 1), HOODY)).toBe(false);
    await settle();
    expect(posts('create')).toHaveLength(0);
    expect(s.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
  });

  it('busy: a second start while the first is on its way is refused at the call, and no second create leaves', async () => {
    const r = await rig({ createLost: true });
    const s = open(r);
    expect(s.start('one', HOODY)).toBe(true);
    expect(s.start('two', HOODY)).toBe(false);
    expect(s.state().door).toEqual({ ok: false, why: strings['ask.startBusy'] });
    await settle(600);
    expect(posts('create')).toHaveLength(1);
    expect(s.start('three', HOODY)).toBe(false);
  });

  it('not ready: the door is shut with words, start() sends nothing', async () => {
    const r = await rig({ computerStatus: 'stopped' });
    const s = open(r);
    expect(s.state().door).toEqual({ ok: false, why: strings['ask.startNotReady'] });
    expect(s.start('Hi', HOODY)).toBe(false);
    await settle();
    expect(posts('create')).toHaveLength(0);
    expect(s.state().phase.k).toBe('none');
  });

  it('a refused create is notSent (the agent made nothing): the key is let go and the door opens', async () => {
    const r = await rig({ createRefuse: { status: 400, code: 'bad_request' } });
    const s = open(r);
    expect(s.start('Hi', HOODY)).toBe(true);
    await settle(1000);
    const ph = s.state().phase;
    expect(ph.k).toBe('notSent');
    // The row's own words (the engine's reason for that refusal), never empty.
    expect(ph.k === 'notSent' && ph.why.length > 0).toBe(true);
    expect(s.state().door.ok).toBe(true);
    expect(storedKeys(w!.fs), 'the key is let go').toEqual([]);
  });
});

describe('an unknown start keeps its key', () => {
  it('a lost create answer is unknown; Stop tracking ends the start: the door opens, the journal keeps the key, nothing is read', async () => {
    const r = await rig({ createLost: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    const ph = s.state().phase;
    expect(ph.k).toBe('unknown');
    expect(s.state().door).toEqual({ ok: false, why: strings['ask.startUnresolved'] });
    const k1 = r.eng.record!.k1;
    expect(storedEntries(w!.fs).some((e) => e.kind === 'create' && e.k === k1), 'the journal keeps the create key').toBe(true);
    const reads = posts('createKeyGet').length, retires = posts('createKeyRetire').length;
    expect(s.settle(ph)).toBe(true);
    expect(s.state().phase.k).toBe('none');
    expect(s.state().door, 'Stop tracking releases the hold Send reads').toEqual({ ok: true });
    expect(r.pending(), 'the journal watch ends with the run').toBe(0);
    // A settle of a phase that is no longer current is refused.
    expect(s.settle(ph)).toBe(false);
    // check() has nothing to read on this page any more; the journal's entry is left as it was (the dock still tracks it).
    s.check();
    await settle(600);
    expect(posts('createKeyGet')).toHaveLength(reads);
    expect(posts('createKeyRetire')).toHaveLength(retires);
    expect(storedEntries(w!.fs).some((e) => e.kind === 'create' && e.k === k1), 'the key is not retired or dropped').toBe(true);
    expect(s.state().phase.k).toBe('none');
    // A later start is the person's own choice now: it makes one new create.
    expect(s.start('again', HOODY)).toBe(true);
    await settle(2000);
    expect(posts('create')).toHaveLength(2);
    expect(s.state().phase.k).toBe('opened');
  });

  it('a create that never arrived: a bare miss proves nothing; only the retire\'s notAdmitted makes it notSent', async () => {
    const r = await rig({ createLostBefore: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    expect(s.state().phase.k).toBe('unknown');
    s.check();
    await settle(800);
    expect(posts('createKeyGet').length, 'read by key first').toBeGreaterThan(0);
    expect(posts('createKeyRetire').length, 'then a retire after the miss').toBeGreaterThan(0);
    expect(s.state().phase.k).toBe('notSent');
    expect(s.state().door.ok).toBe(true);
    expect(posts('create')).toHaveLength(1);
  });

  it('a retire that fails stays unknown with the key kept', async () => {
    const r = await rig({ createLostBefore: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    (w!.agent as any).createKeyRetire = () => Promise.reject({ kind: 'network' });
    s.check();
    await settle(800);
    expect(s.state().phase.k).toBe('unknown');
    expect(s.state().door).toEqual({ ok: false, why: strings['ask.startUnresolved'] });
  });

  it('the dock engine ends under an unknown start: the key stays; check() reads it through the journal on the next engine', async () => {
    const r = await rig({ createLost: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    expect(s.state().phase.k).toBe('unknown');
    const k1 = r.eng.record!.k1;
    r.eng.end();
    await settle();
    expect(s.state().phase.k).toBe('unknown');
    expect(s.state().door.ok).toBe(false);
    expect(r.pending(), 'the journal is watched for the key').toBe(1);
    r.eng = await w!.dock();
    r.engines();
    s.check();
    await settle(800);
    const sid = (w!.agent as any).createdByKey.get(k1) as string;
    expect(s.state().phase).toEqual({ k: 'opened', ref: { computer: HANDLE, realm: REALM, sid }, from: '' });
    expect(posts('create')).toHaveLength(1);
    expect(r.pending(), 'the watch ends with the run').toBe(0);
  });

  it('the journal lets the key go (a Dismiss elsewhere): one read by key; a session makes it opened', async () => {
    const r = await rig({ createLost: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    const k1 = r.eng.record!.k1;
    r.eng.end();
    await settle();
    r.eng = await w!.dock();
    r.engines();
    expect(w!.j.dismiss(HANDLE, k1, dismissal())).toBe(true);
    w!.j.pending();   // the registry's coalesced global scan publishes the change (subscribeUnsettled)
    await settle(800);
    const sid = (w!.agent as any).createdByKey.get(k1) as string;
    expect(s.state().phase).toEqual({ k: 'opened', ref: { computer: HANDLE, realm: REALM, sid }, from: '' });
  });

  it('the journal lets the key go and the read cannot tell: unknown stays, the key and the shut door are kept, check() reads again', async () => {
    const r = await rig({ createLost: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    const k1 = r.eng.record!.k1;
    r.eng.end();
    await settle();
    r.eng = await w!.dock();
    r.engines();
    const real = (w!.agent as any).createKeyGet;
    let failed = 0;
    (w!.agent as any).createKeyGet = () => { failed++; return Promise.reject({ kind: 'network' }); };
    expect(w!.j.dismiss(HANDLE, k1, dismissal())).toBe(true);
    w!.j.pending();   // the registry's coalesced global scan publishes the change (subscribeUnsettled)
    await settle(800);
    expect(s.state().phase.k).toBe('unknown');
    expect(s.state().door).toEqual({ ok: false, why: strings['ask.startUnresolved'] });
    expect(s.start('again', HOODY), 'never a second start while the first may still land').toBe(false);
    expect(posts('create')).toHaveLength(1);
    expect(r.pending(), 'the journal no longer holds the key, so its watch ends').toBe(0);
    // Nothing reads the key again on its own: later scans and engine changes leave it alone (no read loop).
    expect(failed, 'one read by key when the journal let it go').toBe(1);
    w!.j.pending();
    r.engines();
    r.eng.newConversation();
    await settle(400);
    expect(failed, 'no read after it').toBe(1);
    // check() reads it again; a session now proves the start.
    (w!.agent as any).createKeyGet = real;
    s.check();
    await settle(800);
    const sid = (w!.agent as any).createdByKey.get(k1) as string;
    expect(s.state().phase).toEqual({ k: 'opened', ref: { computer: HANDLE, realm: REALM, sid }, from: '' });
    expect(s.state().door.ok).toBe(true);
    expect(posts('create')).toHaveLength(1);
  });

  it('the account changes under an unresolved start: a read under the other account proves nothing; the key and the shut door are kept, and back on the account check() opens it', async () => {
    const r = await rig({ createLost: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    const k1 = r.eng.record!.k1;
    r.eng.end();
    await settle();
    r.eng = await w!.dock();
    r.engines();
    const reads = posts('createKeyGet').length;
    try {
      showAccount(OTHER);
      w!.j.pending();
      s.check();
      await settle(800);
      expect(posts('createKeyGet'), 'nothing is read in the other account\'s name').toHaveLength(reads);
      expect(r.pending(), 'the other account\'s journal box is not this key\'s: the watch is kept').toBe(1);
      expect(s.state().phase.k).toBe('unknown');
      expect(s.state().door).toEqual({ ok: false, why: strings['ask.startUnresolved'] });
      expect(s.start('again', HOODY)).toBe(false);
    } finally { showAccount(ACCOUNT); }
    w!.j.pending();
    s.check();
    await settle(800);
    const sid = (w!.agent as any).createdByKey.get(k1) as string;
    expect(s.state().phase).toEqual({ k: 'opened', ref: { computer: HANDLE, realm: REALM, sid }, from: '' });
    expect(posts('create')).toHaveLength(1);
  });

  for (const v of [{ t: 'settled' }, { t: 'closed' }, { t: 'unknown' }, { t: 'admitted' }] as const) {
    it(`a read that answers ${v.t}${v.t === 'settled' ? ' without a session' : ''} after the journal let the key go proves neither: the key and the shut door are kept until a later proof`, async () => {
      const r = await rig({ createLost: true });
      const s = open(r);
      expect(s.start('Build me a dashboard', HOODY)).toBe(true);
      await settle(600);
      const r0k1 = r.eng.record!.k1;
      r.eng.end();
      await settle();
      r.eng = await w!.dock();
      r.engines();
      const eng = r.eng as any;
      const real = eng.checkKey.bind(eng);
      eng.checkKey = () => Promise.resolve(v);
      // The journal lets the key go (a Dismiss elsewhere): the provider's own read answers v.
      expect(w!.j.dismiss(HANDLE, r0k1, dismissal())).toBe(true);
      w!.j.pending();
      await settle(400);
      expect(s.state().phase.k).toBe('unknown');
      expect(s.state().door).toEqual({ ok: false, why: strings['ask.startUnresolved'] });
      expect(s.start('again', HOODY)).toBe(false);
      s.check();
      await settle(400);
      expect(s.state().phase.k, 'a second inconclusive read changes nothing').toBe('unknown');
      expect(posts('create')).toHaveLength(1);
      eng.checkKey = real;
      s.check();
      await settle(800);
      expect(s.state().phase.k).toBe('opened');
      expect(posts('create')).toHaveLength(1);
    });
  }
});

describe('a check that cannot tell, and another chat on the dock', () => {
  it('the engine no longer reports on it and the read by key fails: unknown stays, the key is kept, the door stays shut', async () => {
    const r = await rig({ createLost: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    r.eng.end();
    await settle();
    r.eng = await w!.dock();
    r.engines();
    (w!.agent as any).createKeyGet = () => Promise.reject({ kind: 'network' });
    s.check();
    await settle(800);
    expect(s.state().phase.k).toBe('unknown');
    expect(s.state().door).toEqual({ ok: false, why: strings['ask.startUnresolved'] });
    expect(s.start('again', HOODY)).toBe(false);
  });

  it('the dock then opens another chat: that chat\'s session never opens the start (the session must be its own key\'s)', async () => {
    const r = await rig({ createLost: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    expect(s.state().phase.k).toBe('unknown');
    r.eng.newConversation();
    await settle();
    expect(r.eng.send('Something else')).toBe(true);
    await settle(1500);
    expect(r.eng.session(), 'the dock holds its other chat').toBeTruthy();
    expect(s.state().phase.k).toBe('unknown');
    expect(s.state().door.ok).toBe(false);
  });
});

describe('a journal-less replay after a reload', () => {
  it('the realm default cannot be read on the replay: the row stays unknown (the key may have left), never Not sent', async () => {
    const clock = manualClock();
    let st: unknown = { v: 1, a: {} };
    const store = { read: () => JSON.parse(JSON.stringify(st)), write: (_a: string, x: unknown) => { if (x) st = JSON.parse(JSON.stringify(x)); } } as StoreIO;
    const agent = new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], createLost: true, caps: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'approval_policy', 'acp_default'], acpDefault: { delegated_agent: '' } }, clock);
    const flush = async (ms = 0) => { const d = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } }; await d(); for (let l = ms; l > 0; l -= 10) { clock.run(10); await d(); } };
    const a = new AskEngine(slot, agent, store, clock);
    a.open();
    await flush();
    a.send('Build me a small dashboard');
    await flush(100);
    // A reload: a new engine on the same store; its first-message row has no text and no options.
    const b = new AskEngine(slot, agent, store, clock);
    b.open();
    await flush(50);
    (agent as any).o.acpDefault = 'fail';
    expect(b.send('Build me a small dashboard')).toBe(true);
    await flush(300);
    const row = users(b.getSnapshot(), C).find((u: any) => u.via === 'create');
    expect(row).toMatchObject({ state: 'unknown' });
    expect(agent.log.filter((x) => x[0] === 'create'), 'nothing is replayed without its options').toHaveLength(1);
  });
});

describe('one start per place, shared; holds never cancel', () => {
  it('two holders of one place see the same start; releasing every hold keeps it; a page that comes back sees its phase', async () => {
    const r = await rig({ createLost: true });
    const a = open(r), b = open(r);
    expect(a.start('Build me a dashboard', HOODY)).toBe(true);
    expect(b.state()).toBe(a.state());
    expect(b.start('two', HOODY)).toBe(false);
    a.release(); b.release();
    a.release();
    await settle(600);
    const c = open(r);
    expect(c.state().phase.k).toBe('unknown');
    expect(c.start('two', HOODY)).toBe(false);
    expect(posts('create')).toHaveLength(1);
  });

  it('state() is the same object until the door or the phase changes; detached methods work', async () => {
    const r = await rig();
    const { state, start, release } = open(r);
    const s0 = state();
    expect(state()).toBe(s0);
    expect(start('Hi', HOODY)).toBe(true);
    expect(state()).not.toBe(s0);
    const s1 = state();
    expect(state()).toBe(s1);
    await settle(2000);
    expect(state().phase.k).toBe('opened');
    release();
  });

  it('All realms, a missing account or an unnamed computer has no starter', async () => {
    await rig();
    expect(starterOf('', AT)).toBeNull();
    expect(starterOf(ACCOUNT, { ...AT, realm: '__all__' })).toBeNull();
    expect(starterOf(ACCOUNT, { ...AT, computer: { ...AT.computer, name: '' } })).toBeNull();
  });
});

describe('the dock\'s own create (never follow_realm_backend)', () => {
  const dockBody = (extra = '') => '{"realm":"' + REALM + '","computer":"' + slot.computer + '","tool_mode":"standard","dir_scope":"home"' + extra + ',"approval":{"mode":"default"},"helper_gates":true,"expected_binding":{"realm":"' + REALM + '","computer":"' + slot.computer + '"}}';
  it('an agent without acp_default: Hoody\'s agent, helper_gates, no read', async () => {
    const r = await rig();
    r.eng.send('Hello');
    await settle(1500);
    expect(posts('acpDefault')).toHaveLength(0);
    expect(bodies()).toEqual([dockBody()]);
  });
  it('acp_default says claude: the create names Claude Code', async () => {
    const r = await rig({ caps: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'approval_policy', 'acp_default'], acpDefault: { delegated_agent: 'claude' } });
    r.eng.send('Hello');
    await settle(1500);
    expect(posts('acpDefault')).toHaveLength(1);
    expect(bodies()).toEqual([dockBody(',"backend":"acp","delegated_agent":"claude"')]);
  });
  it('acp_default says none: Hoody\'s agent', async () => {
    const r = await rig({ caps: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'approval_policy', 'acp_default'], acpDefault: { delegated_agent: '' } });
    r.eng.send('Hello');
    await settle(1500);
    expect(bodies()).toEqual([dockBody()]);
  });
  it('acp_default cannot be read: nothing is sent, the row says why (never a silent native start)', async () => {
    const r = await rig({ caps: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'approval_policy', 'acp_default'], acpDefault: 'fail' });
    r.eng.send('Hello');
    await settle(1500);
    expect(posts('create')).toHaveLength(0);
    expect(lastUser(r.eng)).toMatchObject({ state: 'notSent', reason: 'ask.defaultUnread' });
    expect(storedKeys(w!.fs), 'no key was kept for a create that never left').toEqual([]);
  });
});

describe('the attach carries helper_gates', () => {
  async function handedBack(o: Parameters<typeof world>[0]) {
    const r = await rig({ createLost: true, ...o });
    r.eng.send('Build me a dashboard');
    await settle(300);
    r.eng.check(lastUser(r.eng)!.id);
    await settle(600);
    const u = lastUser(r.eng)!;
    expect(u).toMatchObject({ state: 'notSent', reason: 'ask.handedOff' });
    return { r, u };
  }
  it('a person\'s Send on a handed-back first message attaches with helper_gates: true', async () => {
    const { r, u } = await handedBack({});
    r.eng.resend(u.id);
    await settle(900);
    const at = posts('attach');
    expect(at).toHaveLength(1);
    expect((at[0]![1][0] as any).helper_gates).toBe(true);
    expect(posts('turn')).toHaveLength(1);
  });
  it('400 helper_gates_unavailable: a typed refusal, Not sent with its words, no retry without', async () => {
    const { r, u } = await handedBack({ helperGatesUnavailable: true });
    r.eng.resend(u.id);
    await settle(900);
    expect(posts('attach')).toHaveLength(1);
    expect(posts('turn')).toHaveLength(0);
    expect(lastUser(r.eng)).toMatchObject({ state: 'notSent', reason: 'ask.helperGatesOff' });
  });
});

// ---- a reload while the create is in flight (the band, Check and the shut door were gone) ----

/** A dock engine over the journal-backed store, as registry.ts builds it (the old source first, then the journal's own records: the
 *  record outlives the page; rows come back without text). */
function storedDock(): AskEngine {
  const store = { read: (a: string) => w!.j.dockRead(a, readStore(a)), apply: (a: string, op: any) => w!.j.dockApply(a, op) } as StoreIO;
  return new AskEngine(slot, w!.agent, store, w!.clock, { journal: { j: w!.j, handle: HANDLE } });
}
/** A rig whose engine is a stored dock engine. */
async function storedRig(o: Parameters<typeof world>[0] = {}): Promise<Rig> {
  const r = await rig(o);
  r.eng = storedDock();
  r.eng.open();
  await w!.flush();
  return r;
}
/** The page reloads: every place goes (memory), and the next page's engine reads the same store and journal. A reload's engine draws
 *  past the first one's keys (two manual clocks would draw the same keys; crypto never does). */
async function reload(r: Rig): Promise<void> {
  resetStartersForTests();
  for (let i = 0; i < 10_000; i++) w!.clock.random(1);
  r.eng = storedDock();
  r.eng.open();
  await settle(900);
}

describe('a reloaded page takes up the slot\'s unproven create', () => {
  it('a reload during a lost create: the start is unknown again, the door shut, no second create; Check opens the chat', async () => {
    const r = await storedRig({ createLost: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    expect(s.state().phase, 'this page\'s own unknown is not a taken-up one').toEqual({ k: 'unknown' });
    const k1 = r.eng.record!.k1;
    const sid = (w!.agent as any).createdByKey.get(k1) as string;
    expect(sid, 'the create reached the agent').toBeTruthy();
    await reload(r);
    const s2 = open(r);
    expect(s2.state().phase, 'the band is back after the reload, saying its text is not here').toEqual({ k: 'unknown', taken: true });
    expect(s2.state().door).toEqual({ ok: false, why: strings['ask.startUnresolved'] });
    expect(s2.start('Build me a dashboard', HOODY), 'never a second start over the unproven key').toBe(false);
    await settle();
    expect(posts('create')).toHaveLength(1);
    s2.check();
    await settle(800);
    expect(s2.state().phase, 'a start taken up from the journal names no kind of page: it shows on every page').toEqual({ k: 'opened', ref: { computer: HANDLE, realm: REALM, sid } });
    expect(s2.state().phase).not.toHaveProperty('from');
    expect(posts('create'), 'check never sends again').toHaveLength(1);
  });

  it('a reload during a create that never arrived: Check proves notAdmitted, notSent, the door opens', async () => {
    const r = await storedRig({ createLostBefore: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    expect(s.state().phase.k).toBe('unknown');
    await reload(r);
    const s2 = open(r);
    expect(s2.state().phase.k).toBe('unknown');
    s2.check();
    await settle(800);
    expect(s2.state().phase.k).toBe('notSent');
    expect(s2.state().door.ok).toBe(true);
    expect(posts('create')).toHaveLength(1);
  });

  it('nothing is taken up after a proven chat (the create answered)', async () => {
    const r = await storedRig();
    const s = open(r);
    expect(s.start('Hi', HOODY)).toBe(true);
    await settle(2000);
    expect(s.state().phase.k).toBe('opened');
    await reload(r);
    const s2 = open(r);
    expect(s2.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
  });

  it('nothing is taken up when the journal let the key go before the reload (a Dismiss elsewhere)', async () => {
    const r = await storedRig({ createLost: true });
    const s = open(r);
    expect(s.start('Hi', HOODY)).toBe(true);
    await settle(600);
    expect(s.state().phase.k).toBe('unknown');
    const k1 = r.eng.record!.k1;
    expect(w!.j.dismiss(HANDLE, k1, dismissal())).toBe(true);
    await reload(r);
    const s2 = open(r);
    expect(s2.state().phase.k).toBe('none');
  });

  it('nothing is taken up while another account is shown (the journal is not read in this account\'s name)', async () => {
    const r = await storedRig({ createLost: true });
    const s = open(r);
    expect(s.start('Hi', HOODY)).toBe(true);
    await settle(600);
    expect(s.state().phase.k).toBe('unknown');
    await reload(r);
    showAccount(OTHER);
    try {
      const s2 = open(r);
      expect(s2.state().phase.k).toBe('none');
      s2.release();
    } finally { showAccount(ACCOUNT); }
  });

  it('Stop tracking is not undone on the same page; a later reload takes the key up once more (C9)', async () => {
    const r = await storedRig({ createLost: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    await reload(r);
    const s2 = open(r);
    const ph = s2.state().phase;
    expect(ph.k).toBe('unknown');
    expect(s2.settle(ph)).toBe(true);
    expect(s2.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
    // The engine publishes again (any change): the key the person took off is not taken up again here.
    r.engines();
    s2.release();
    const s3 = open(r);
    expect(s3.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
    s3.release();
    await reload(r);
    const s4 = open(r);
    expect(s4.state().phase.k, 'a new page shows the unproven key again').toBe('unknown');
  });
});

// ---- a changed unproven record while an outcome is shown; a Check still out at Stop tracking ----

/** The agent's createKeyGet held until `go()`: a Check that is still out. */
function holdKeyReads(): { go: () => void } {
  const real = (w!.agent as any).createKeyGet.bind(w!.agent);
  let go: () => void = () => {};
  const gate = new Promise<void>((res) => { go = res; });
  (w!.agent as any).createKeyGet = (...a: unknown[]) => gate.then(() => real(...a));
  return { go: () => go() };
}

describe('the record is read again before any start; Stop tracking fences a Check still out', () => {
  it('notSent is shown, then the dock makes an unproven create here: the place shows it unknown and Send makes no second create', async () => {
    const r = await rig({ createLostBefore: true });
    const s = open(r);
    expect(s.start('first', HOODY)).toBe(true);
    await settle(600);
    s.check();
    await settle(800);
    expect(s.state().phase.k).toBe('notSent');
    // The dock's own create, lost on its way: an unproven record under a new key the journal holds.
    (w!.agent as any).o.createLost = true;
    r.eng.newConversation();
    await settle();
    expect(r.eng.send('from the dock')).toBe(true);
    await settle(600);
    const rec = r.eng.record!;
    expect(rec.k1 && !rec.s && r.eng.keyHeld(rec.k1)).toBe(true);
    const creates = posts('create').length;
    expect(s.state().phase, 'the new unknown wins over the notSent shown').toEqual({ k: 'unknown', taken: true });
    expect(s.state().door).toEqual({ ok: false, why: strings['ask.startUnresolved'] });
    expect(s.start('second', HOODY)).toBe(false);
    await settle();
    expect(posts('create')).toHaveLength(creates);
  });

  it('start() asks the journal itself: an unproven create no publish has told the place of yet is taken up and the start refused', async () => {
    const r = await storedRig({ createLost: true });
    const s0 = open(r);
    expect(s0.start('first', HOODY)).toBe(true);
    await settle(600);
    const rec = r.eng.record!;
    await reload(r);
    // The new page's journal answer is not in yet (nothing published); the place opens with nothing taken up.
    const real = r.eng.unprovenCreate.bind(r.eng);
    r.eng.unprovenCreate = () => null;
    const s = open(r);
    expect(s.state().phase.k).toBe('none');
    // The journal says it now, and nothing has told the place.
    r.eng.unprovenCreate = real;
    expect(real()).toBe(rec.k1);
    const creates = posts('create').length;
    expect(s.start('second', HOODY)).toBe(false);
    expect(s.state().phase).toEqual({ k: 'unknown', taken: true });
    await settle();
    expect(posts('create')).toHaveLength(creates);
  });

  it('a key this page proved notSent is not taken up again while its record lingers', async () => {
    const r = await rig({ createLostBefore: true });
    const s = open(r);
    expect(s.start('first', HOODY)).toBe(true);
    await settle(600);
    const k1 = r.eng.record!.k1;
    s.check();
    await settle(800);
    expect(s.state().phase.k).toBe('notSent');
    // As if the journal kept the key a moment longer.
    r.eng.unprovenCreate = () => k1;
    r.engines();
    expect(s.state().phase.k).toBe('notSent');
  });

  it('a Check still out when Stop tracking ends the start retires nothing and leaves the journal entry; a reload takes it up again', async () => {
    const r = await storedRig({ createLostBefore: true });
    const s = open(r);
    expect(s.start('first', HOODY)).toBe(true);
    await settle(600);
    const ph = s.state().phase;
    expect(ph.k).toBe('unknown');
    const k1 = r.eng.record!.k1;
    const held = holdKeyReads();
    s.check();
    await settle();
    expect(s.settle(ph)).toBe(true);
    expect(s.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
    held.go();
    await settle(800);
    expect(posts('createKeyGet').length, 'the read was out').toBeGreaterThan(0);
    expect(posts('createKeyRetire'), 'nothing retired after Stop tracking').toHaveLength(0);
    expect(r.eng.keyHeld(k1), 'the journal entry is untouched').toBe(true);
    expect(s.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
    await reload(r);
    const s2 = open(r);
    expect(s2.state().phase).toEqual({ k: 'unknown', taken: true });
  });

  it('Check on this page’s own lost create proves the session through the engine, which hands its first message back (the walk: an empty chat)', async () => {
    const r = await rig({ createLost: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    expect(s.state().phase.k).toBe('unknown');
    const k1 = r.eng.record!.k1;
    s.check();
    await settle(900);
    const sid = (w!.agent as any).createdByKey.get(k1) as string;
    expect(s.state().phase).toEqual({ k: 'opened', ref: { computer: HANDLE, realm: REALM, sid }, from: '' });
    expect(posts('create')).toHaveLength(1);
    // The engine's own recovery: the chat is the engine's, and its first message, proved by a read and not by its create reply, is
    // handed back with its text (never sent by the page); a read of the key alone left the chat without it.
    expect(r.eng.record?.s).toBe(sid);
    const u = lastUser(r.eng)!;
    expect(u).toMatchObject({ state: 'notSent', reason: 'ask.handedOff', text: 'Build me a dashboard' });
    expect(r.eng.restorable()).toEqual([u.id]);
    expect(posts('turn')).toHaveLength(0);
  });

  it('the engine’s own Check still out at Stop tracking settles nothing: no retire, the key is kept, the dock row stays unknown', async () => {
    const r = await rig({ createLost: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    const ph = s.state().phase;
    expect(ph.k).toBe('unknown');
    const k1 = r.eng.record!.k1;
    const held = holdKeyReads();
    s.check();
    await settle();
    expect(s.settle(ph)).toBe(true);
    held.go();
    await settle(900);
    expect(posts('createKeyGet').length, 'the read was out').toBeGreaterThan(0);
    expect(posts('turn'), 'no first message after Stop tracking').toHaveLength(0);
    expect(posts('createKeyRetire')).toHaveLength(0);
    expect(lastUser(r.eng), 'the late answer is not acted on: the dock row stays unknown').toMatchObject({ state: 'unknown' });
    expect(r.eng.record?.s ?? null).toBe(null);
    expect(r.eng.keyHeld(k1), 'the journal entry is untouched').toBe(true);
    expect(s.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
  });

  it('a Check still out that would prove the session settles nothing after Stop tracking: the journal keeps the key', async () => {
    const r = await storedRig({ createLost: true });
    const s = open(r);
    expect(s.start('first', HOODY)).toBe(true);
    await settle(600);
    const ph = s.state().phase;
    const k1 = r.eng.record!.k1;
    await reload(r);
    const s2 = open(r);
    const ph2 = s2.state().phase;
    expect(ph2.k).toBe('unknown');
    void ph;
    const held = holdKeyReads();
    s2.check();
    await settle();
    expect(s2.settle(ph2)).toBe(true);
    held.go();
    await settle(800);
    expect(r.eng.keyHeld(k1)).toBe(true);
    expect(s2.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
  });

  it('Stop tracking releases the engine the place holds NOW: a dock engine replaced after the start ran (and reloaded the same unknown row) does not keep the person stuck', async () => {
    const r = await storedRig({ createLost: true });
    const s = open(r);
    expect(s.start('first', HOODY)).toBe(true);
    await settle(600);
    const ph = s.state().phase;
    expect(ph).toEqual({ k: 'unknown' });
    // The dock engine ends; a new one reads the same store and journal and shows the same unknown first message. The place attaches it.
    r.eng.end();
    r.eng = storedDock();
    r.eng.open();
    await settle(900);
    r.engines();
    expect(r.eng.holdsUnknownCreate(), 'the replacement holds the unknown first message').toBe(true);
    expect(s.settle(s.state().phase)).toBe(true);
    expect(r.eng.holdsUnknownCreate(), 'Stop tracking released it on the engine the place holds now').toBe(false);
    const creates = posts('create').length;
    expect(s.start('again', HOODY)).toBe(true);
    await settle(2000);
    expect(posts('create')).toHaveLength(creates + 1);
    expect(s.state().phase.k).toBe('opened');
  });

  it('after Stop tracking, neither a replaced engine nor an account switch away and back takes the key up again on this page', async () => {
    const r = await storedRig({ createLost: true });
    const s0 = open(r);
    expect(s0.start('first', HOODY)).toBe(true);
    await settle(600);
    await reload(r);
    const s = open(r);
    const ph = s.state().phase;
    expect(ph.k).toBe('unknown');
    expect(s.settle(ph)).toBe(true);
    // The dock engine ends and a new one reads the same store.
    r.eng.end();
    r.eng = storedDock();
    r.eng.open();
    await settle(900);
    r.engines();
    expect(s.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
    showAccount(OTHER);
    try { r.engines(); expect(s.state().phase.k).toBe('none'); } finally { showAccount(ACCOUNT); }
    r.engines();
    await settle();
    expect(s.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
  });
});

describe('the journal is where a reloaded start is found (the prod walk: the dock shows another chat)', () => {
  it('the dock holds a proven chat, then a start\'s create is lost and the page reloads: the start is taken up from the journal, no second create', async () => {
    const r = await storedRig({});
    const s = open(r);
    expect(s.start('first', HOODY)).toBe(true);
    await settle(2000);
    const ph = s.state().phase;
    expect(ph.k).toBe('opened');
    const proven = r.eng.record!;
    expect(proven.s).toBeTruthy();
    expect(s.settle(ph)).toBe(true);
    (w!.agent as any).o.createLost = true;
    expect(s.start('second', HOODY)).toBe(true);
    await settle(600);
    expect(s.state().phase.k).toBe('unknown');
    const creates = posts('create').length;
    // The chat page of the first chat writes its record (as /ai/c does): the dock's stored front record is that proven chat, and the
    // second start's create is known only to the journal (dockRead: the source's record comes first).
    expect(w!.j.dockApply(ACCOUNT, { k: 'put', rec: proven } as any)).toBe(true);
    await reload(r);
    expect(r.eng.record?.s, 'the reloaded dock shows the proven chat').toBe(proven.s);
    const s2 = open(r);
    expect(s2.state().phase, 'taken up although the dock\'s front chat names a session').toEqual({ k: 'unknown', taken: true });
    expect(s2.start('third', HOODY)).toBe(false);
    await settle();
    expect(posts('create')).toHaveLength(creates);
    s2.check();
    await settle(800);
    expect(s2.state().phase.k).toBe('opened');
  });

  /** The journal's view, stubbed: entries of this handle and their records (found by create key wherever they are; null: none;
   *  'unreadable': the record store cannot be read). findCreate is the create location only, as the real one: a moved record is not there. */
  function journalSays(r: Rig, entries: Array<Record<string, unknown>>, recs: Record<string, Record<string, unknown> | null | 'unreadable'> = {}): void {
    const base = { kind: 'create', h: HANDLE, r: REALM, s: null, c: '', ct: slot.computer, at: 1 };
    (w!.j as any).scan = () => ({ s: 'ok', acct: ACCOUNT, entries: entries.map((x) => ({ ...base, c: x.k, ...x })) });
    const look = (k: string) => {
      const x = k in recs ? recs[k] : { p: slot.project, c: slot.computer, r: REALM, s: null, k1: k };
      return x === 'unreadable' ? { t: 'unreadable' } : x === null ? { t: 'missing' } : { t: 'found', rec: x };
    };
    (w!.j as any).lookupK1 = (_h: string, _r: string, k: string) => look(k);
    (w!.j as any).findCreate = (_h: string, _r: string, k: string) => { const x = look(k); return x.t === 'found' && !(x.rec as any).s ? x.rec : null; };
  }
  it('unprovenCreate: only a create of this computer and realm with no session, not a fork, of this project; the newest wins', async () => {
    const r = await rig();
    journalSays(r, [
      { k: 'k-turn', kind: 'turn', at: 99 },
      { k: 'k-sess', s: 'sid-1', at: 99 },
      { k: 'k-realm', r: 'f'.repeat(24), at: 99 },
      { k: 'k-ct', ct: 'other-computer', at: 99 },
      { k: 'k-recsess', at: 9 },
      { k: 'k-fork', at: 9 },
      { k: 'k-proj', at: 9 },
      { k: 'k-old', at: 2 },
      { k: 'k-new', at: 3 },
    ], {
      'k-recsess': { p: slot.project, s: 'sid-2' },
      'k-fork': { p: slot.project, s: null, fk: { s: 'sid-0', i: 1 } },
      'k-proj': { p: 'another-project', s: null },
    });
    expect(r.eng.unprovenCreate(), 'k-recsess: its record moved to its proven session and is found there').toBe('k-new');
    journalSays(r, [{ k: 'k-norec', at: 5 }], { 'k-norec': null });
    expect(r.eng.unprovenCreate(), 'an entry without its record is still a create that may have left').toBe('k-norec');
    journalSays(r, []);
    expect(r.eng.unprovenCreate()).toBeNull();
  });
  it('unprovenCreate: keys the caller is done with are passed over, so an older create behind them is found; unreadable records say nothing', async () => {
    const r = await rig();
    journalSays(r, [{ k: 'k-old', at: 2 }, { k: 'k-mid', at: 3 }, { k: 'k-new', at: 4 }]);
    expect(r.eng.unprovenCreate()).toBe('k-new');
    expect(r.eng.unprovenCreate(new Set(['k-new']))).toBe('k-mid');
    expect(r.eng.unprovenCreate(new Set(['k-new', 'k-mid']))).toBe('k-old');
    expect(r.eng.unprovenCreate(new Set(['k-new', 'k-mid', 'k-old']))).toBeNull();
    journalSays(r, [{ k: 'k-a', at: 2 }, { k: 'k-b', at: 3 }], { 'k-a': 'unreadable' });
    expect(r.eng.unprovenCreate(), 'records that cannot be read cannot rule out another project or a fork').toBeNull();
  });
  it('unprovenCreate: nothing while another account is shown, or while the journal cannot be read', async () => {
    const r = await rig();
    journalSays(r, [{ k: 'k1' }]);
    showAccount(OTHER);
    try { expect(r.eng.unprovenCreate()).toBeNull(); } finally { showAccount(ACCOUNT); }
    expect(r.eng.unprovenCreate()).toBe('k1');
    (w!.j as any).scan = () => ({ s: 'unreadable' });
    expect(r.eng.unprovenCreate()).toBeNull();
    (w!.j as any).scan = () => ({ s: 'ok', acct: OTHER, entries: [{ k: 'k1', kind: 'create', h: HANDLE, r: REALM, s: null, c: 'k1', ct: slot.computer, at: 1 }] });
    expect(r.eng.unprovenCreate()).toBeNull();
  });
});

// ---- every unproven key, a moved or unreadable record, Stop during settlement and before the retire ----

describe('an older unproven create behind a stopped key; Stop tracking fences the settlement and the retire', () => {
  it('an older unproven create behind the key this page stopped tracking is taken up: Send makes no create over it', async () => {
    const r = await storedRig({ createLost: true });
    const s0 = open(r);
    expect(s0.start('first', HOODY)).toBe(true);
    await settle(600);
    const kA = r.eng.record!.k1;
    const ph0 = s0.state().phase;
    expect(ph0.k).toBe('unknown');
    expect(s0.settle(ph0)).toBe(true);
    (w!.agent as any).lost.create = false;
    expect(s0.start('second', HOODY)).toBe(true);
    await settle(600);
    const kB = r.eng.record!.k1;
    expect(kB).not.toBe(kA);
    // A new page: both creates are unproven; the newest is taken up and the person stops tracking it.
    await reload(r);
    const s = open(r);
    const ph = s.state().phase;
    expect(ph).toEqual({ k: 'unknown', taken: true });
    expect(r.eng.unprovenCreate()).toBe(kB);
    expect(s.settle(ph)).toBe(true);
    r.engines();
    expect(s.state().phase, 'the older unproven create is the place\'s unknown now').toEqual({ k: 'unknown', taken: true });
    expect(s.state().door).toEqual({ ok: false, why: strings['ask.startUnresolved'] });
    const creates = posts('create').length;
    expect(s.start('third', HOODY)).toBe(false);
    await settle();
    expect(posts('create')).toHaveLength(creates);
    expect(s.settle(s.state().phase)).toBe(true);
    r.engines();
    expect(s.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
  });

  it('Stop tracking while a Check\'s settlement waits for the record lock: the record does not move, the entry is kept, nothing is owed', async () => {
    const r = await storedRig({ createLost: true });
    const s0 = open(r);
    expect(s0.start('first', HOODY)).toBe(true);
    await settle(600);
    const k1 = r.eng.record!.k1;
    await reload(r);
    const s = open(r);
    const ph = s.state().phase;
    expect(ph.k).toBe('unknown');
    let free: () => void = () => {};
    const gate = new Promise<void>((res) => { free = res; });
    void (globalThis.navigator as any).locks.request(recsLockName(ACCOUNT), () => gate);
    const owed = w!.j.owed();
    s.check();
    await settle();
    expect(posts('createKeyGet').length, 'the read answered; its settlement waits for the record lock').toBeGreaterThan(0);
    expect(s.settle(ph)).toBe(true);
    free();
    await settle(800);
    expect(r.eng.keyHeld(k1), 'the journal entry is untouched').toBe(true);
    expect(w!.j.lookupK1(HANDLE, REALM, k1, ACCOUNT), 'the record did not move to the session').toMatchObject({ t: 'found', rec: { s: null } });
    expect(w!.j.owed(), 'no owed retry was left behind').toBe(owed);
    expect(s.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
  });

  it('Stop tracking right after the record moved, before the entry\'s removal: the move stays (the server proved it), the entry is kept', async () => {
    const r = await storedRig({ createLost: true });
    const s0 = open(r);
    expect(s0.start('first', HOODY)).toBe(true);
    await settle(600);
    const k1 = r.eng.record!.k1;
    await reload(r);
    const s = open(r);
    const ph = s.state().phase;
    expect(ph.k).toBe('unknown');
    const recs = (w!.j as any).records;
    const move = recs.moveCreate.bind(recs);
    let moved = false;
    recs.moveCreate = async (...a: unknown[]) => { const out = await move(...a); if (!moved) { moved = true; expect(s.settle(ph)).toBe(true); } return out; };
    s.check();
    await settle(800);
    expect(moved, 'the settlement moved the record').toBe(true);
    expect(w!.j.lookupK1(HANDLE, REALM, k1, ACCOUNT)).toMatchObject({ t: 'found', rec: { s: expect.any(String) } });
    expect(r.eng.keyHeld(k1), 'the entry is not removed after Stop tracking').toBe(true);
    expect(s.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
  });

  it('a check whose settlement Stop overtakes answers unknown, never the verdict it read', async () => {
    const r = await storedRig({ createLost: true });
    const s0 = open(r);
    expect(s0.start('first', HOODY)).toBe(true);
    await settle(600);
    const k1 = r.eng.record!.k1;
    let live = true;
    const recs = (w!.j as any).records;
    const move = recs.moveCreate.bind(recs);
    recs.moveCreate = async (...a: unknown[]) => { const out = await move(...a); live = false; return out; };
    const got = r.eng.checkKey(k1, () => live);
    await settle(800);
    expect(await got).toEqual({ t: 'unknown' });
    expect(r.eng.keyHeld(k1), 'the entry is not removed after Stop').toBe(true);
  });

  it('an owed settlement queued before Stop is dropped when it runs after Stop: nothing is written', async () => {
    const r = await storedRig({ createLost: true });
    const s0 = open(r);
    expect(s0.start('first', HOODY)).toBe(true);
    await settle(600);
    const k1 = r.eng.record!.k1;
    const owed = w!.j.owed();
    let live = true;
    const recs = (w!.j as any).records;
    const move = recs.moveCreate.bind(recs);
    recs.moveCreate = async () => null;
    const got = r.eng.checkKey(k1, () => live);
    await settle(800);
    expect(await got).toMatchObject({ t: 'settled' });
    expect(w!.j.owed(), 'the record write was not kept: the settlement is owed').toBe(owed + 1);
    live = false;
    recs.moveCreate = move;
    await w!.j.sweep();
    await settle();
    expect(w!.j.owed(), 'the owed item is dropped').toBe(owed);
    expect(w!.j.lookupK1(HANDLE, REALM, k1, ACCOUNT)).toMatchObject({ t: 'found', rec: { s: null } });
    expect(r.eng.keyHeld(k1)).toBe(true);
  });

  it('Stop tracking after the send lock\'s look but before the retire is dispatched: no retire is sent, the entry is kept', async () => {
    const r = await storedRig({ createLostBefore: true });
    const s0 = open(r);
    expect(s0.start('first', HOODY)).toBe(true);
    await settle(600);
    const k1 = r.eng.record!.k1;
    await reload(r);
    const s = open(r);
    const ph = s.state().phase;
    expect(ph.k).toBe('unknown');
    // The second look at this page's own admission for the key after the read is the one under the send lock, right before the retire.
    const door = (w!.j as any).door;
    const holds = door.holds.bind(door);
    let seen = 0;
    door.holds = (a: string, h: string, k: string) => {
      const out = holds(a, h, k);
      if (k === k1 && posts('createKeyGet').length > 0 && ++seen === 2) expect(s.settle(ph)).toBe(true);
      return out;
    };
    s.check();
    await settle(800);
    expect(seen, 'the check reached the look under the send lock').toBeGreaterThanOrEqual(2);
    expect(posts('createKeyRetire'), 'nothing retired after Stop tracking').toHaveLength(0);
    expect(r.eng.keyHeld(k1)).toBe(true);
    expect(s.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
  });

  it('a retire already dispatched when Stop tracking comes is not acted on: the entry stays, and a reload\'s Check proves the fenced key notSent', async () => {
    const r = await storedRig({ createLostBefore: true });
    const s0 = open(r);
    expect(s0.start('first', HOODY)).toBe(true);
    await settle(600);
    const k1 = r.eng.record!.k1;
    await reload(r);
    const s = open(r);
    const ph = s.state().phase;
    const real = (w!.agent as any).createKeyRetire.bind(w!.agent);
    let go: () => void = () => {};
    let out = 0;
    const gate = new Promise<void>((res) => { go = res; });
    (w!.agent as any).createKeyRetire = (...a: unknown[]) => { out++; return gate.then(() => real(...a)); };
    s.check();
    await settle(800);
    expect(out, 'the retire is out').toBe(1);
    expect(s.settle(ph)).toBe(true);
    go();
    await settle(800);
    expect(r.eng.keyHeld(k1), 'its answer is not acted on: the entry stays').toBe(true);
    expect(s.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
    (w!.agent as any).createKeyRetire = real;
    await reload(r);
    const s2 = open(r);
    expect(s2.state().phase).toEqual({ k: 'unknown', taken: true });
    s2.check();
    await settle(800);
    expect(s2.state().phase.k).toBe('notSent');
  });

  it('the run ends after the journal\'s last look but before the engine acts on its answer: the engine does nothing', async () => {
    const r = await rig({ createLost: true });
    const s = open(r);
    expect(s.start('Build me a dashboard', HOODY)).toBe(true);
    await settle(600);
    const ph = s.state().phase;
    expect(ph.k).toBe('unknown');
    const j = w!.j as any;
    let ended = false;
    for (const m of ['check', 'checkCreate']) {
      const real = j[m].bind(j);
      j[m] = async (...a: unknown[]) => { const out = await real(...a); if (!ended) { ended = true; expect(s.settle(ph)).toBe(true); } return out; };
    }
    s.check();
    await settle(900);
    expect(ended, 'the engine\'s own check went through the journal').toBe(true);
    expect(posts('turn')).toHaveLength(0);
    expect(lastUser(r.eng), 'the answer is not acted on: the dock row stays unknown').toMatchObject({ state: 'unknown' });
    expect(r.eng.record?.s ?? null).toBe(null);
    expect(s.state()).toMatchObject({ door: { ok: true }, phase: { k: 'none' } });
  });
});

// New chat's approvals choice reaches the create body as the choice itself: Strict is `approval.mode: 'always'` in the body
// that creates the chat (the agent then asks for every action), and neither Default nor a Default start where Allow everything
// is on carries it.
describe('New chat approvals in the create body', () => {
  const modeOf = () => posts('create').map((x) => (x[1][0] as { approval?: { mode?: string } }).approval);
  const yolos = () => posts('yolo').map((x) => x[1][1]);
  it('Strict: the one create carries mode always', async () => {
    const r = await rig();
    const s = open(r);
    expect(s.start('What runs on atlas?', { agent: 'chat', model: 'hoody-ai/hoody-free', strict: true })).toBe(true);
    await settle(2000);
    expect(s.state().phase.k).toBe('opened');
    expect(modeOf()).toEqual([{ mode: 'always' }]);
  });
  it('Default where the start switches Allow everything on: mode default, never always', async () => {
    const r = await rig();
    const s = open(r);
    expect(s.state().auto).toBe('on');
    expect(s.start('What runs on atlas?', { agent: 'chat', model: 'hoody-ai/hoody-free', strict: false })).toBe(true);
    await settle(2000);
    expect(s.state().phase.k).toBe('opened');
    expect(modeOf()).toEqual([{ mode: 'default' }]);
    expect(yolos()).toEqual([true]);
  });
  it('Default where the switch is off: mode default, never always', async () => {
    const r = await rig();
    const s = open(r);
    r.eng.setAuto(false);
    expect(s.start('What runs on atlas?', { agent: 'chat', model: 'hoody-ai/hoody-free', strict: false })).toBe(true);
    await settle(2000);
    expect(s.state().phase.k).toBe('opened');
    expect(modeOf()).toEqual([{ mode: 'default' }]);
    expect(yolos()).toEqual([false]);
  });
});
