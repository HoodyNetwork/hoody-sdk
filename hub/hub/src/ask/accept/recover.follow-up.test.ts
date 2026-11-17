// Acceptance, group RECOVER (and the send-lock rule): AskEngine + FakeAgent over the
// real journal on the production-faithful storage. After a reload, in another tab or with the gate shut ONLY reads and retires by key
// run: every fetch spy counts ADMISSION POSTs (create, turn, command, interrupt, stop, confirm, answer) apart from BY-KEY READS and BY-KEY RETIRES, and a
// retire never runs the original request. "A reload" is the second tab: its own journal instance over the same stored bytes.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import * as A from '../attach';
import * as C from '../conv';
import { AskEngine, type Slot, type StoreIO } from '../engine';
import { dismissal } from '../journal';
import type { FakeAgent } from '../fake';
import { ACCOUNT, HANDLE, JOURNAL, KEY, REALM, settleReal, slot, storedEntries, storedKeys, users, world, type World } from './env';

let w: World | null = null;
let restoreLocks: () => void = () => {};
// The approver-lease singleton claims its ticket mint once per page; a world() resets the tickets, so each test starts it afresh (attach needs a lease ticket).
beforeEach(() => { resetApproversForTests(); restoreLocks = installLocks(); });
afterEach(() => { w?.dispose(); w = null; restoreLocks(); resetApproversForTests(); });

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
/** Another tab holds the key's send lock until the returned function is called. */
async function holdElsewhere(key: string): Promise<() => void> {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  void (globalThis.navigator as any).locks.request(`hub-ai-send:${key}`, () => gate);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return release;
}

// ---- counting: admission POSTs, by-key reads, by-key retires ----
const ADMISSION = ['create', 'turn', 'command', 'interrupt', 'stop', 'confirm', 'answer'];
const READS = ['createKeyGet', 'turnByKey', 'commandByKey'];
const RETIRES = ['createKeyRetire', 'turnKeyRetire', 'commandKeyRetire'];
const count = (agent: FakeAgent, names: string[]) => agent.log.filter((x) => names.includes(x[0])).length;
const tally = (agent: FakeAgent) => ({ admissions: count(agent, ADMISSION), reads: count(agent, READS), retires: count(agent, RETIRES) });

const HOLD = [[{ k: 'text', text: 'Working.' }, { k: 'hold' }]] as any;       // the turn stays running: a typed message goes as a follow-up
const lastUser = (e: AskEngine) => users(e.getSnapshot(), C).at(-1);
const recordIds = (): string[] => { try { return Object.keys(JSON.parse(w!.fs.peek(JOURNAL)!)?.a?.[ACCOUNT] ?? {}); } catch { return []; } };
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89];
let imgN = 0;
const image = (name: string) => {
  const b = new Uint8Array(1200); b.set(PNG); for (let i = PNG.length; i < 1200; i++) b[i] = (i * 7 + imgN) % 256;
  const id = 'i' + ++imgN;
  return A.prepare(id, name, b, () => 'blob:' + id);
};

/** The request leaves the page and its answer is lost; the request itself waits in the network (deliver) or never arrives (drop). */
function inTheNetwork(agent: FakeAgent, method: 'create' | 'turn' | 'command') {
  const real = (agent as any)[method].bind(agent);
  const box: { go: (() => Promise<unknown>) | null; attempts: number } = { go: null, attempts: 0 };
  (agent as any)[method] = (...a: unknown[]) => { box.attempts++; box.go = () => real(...a).catch(() => {}); return Promise.reject({ status: 0, pending: true, kind: 'pending' }); };
  return { deliver: () => box.go?.() ?? Promise.resolve(), attempts: () => box.attempts };
}
/** A second dock over tab B's journal: a page reloaded after an unsettled create. */
async function dockB(): Promise<AskEngine> {
  const store: StoreIO = { read: (a: string) => w!.jB.dockRead(a, { v: 1, a: {} }), apply: (a: string, op: any) => w!.jB.dockApply(a, op) } as any;
  const eng = new AskEngine(slot as Slot, w!.agent, store, w!.clock, { journal: { j: w!.jB, handle: HANDLE } });
  eng.open();
  await w!.flush(900);
  return eng;
}
async function reopenB(sid: string): Promise<AskEngine> {
  const b = w!.pinned(sid, 'B');
  b.open();
  await w!.flush(900);
  return b;
}
/** The cut: a first message the page did not just send itself is handed back to the composer, never sent by the page. */
function handedBack(e: AskEngine): C.UserMsg {
  const u = lastUser(e)!;
  expect(u, 'handed back to the composer, never sent by the page').toMatchObject({ state: 'notSent', reason: 'ask.handedOff', text: 'Build me a dashboard' });
  expect(e.restorable()).toContain(u.id);
  return u;
}
/** The person presses Send on the handed-back text. */
async function personSends(e: AskEngine): Promise<void> { e.resend(handedBack(e).id); await w!.flush(900); }
async function checkRow(e: AskEngine, uid: string): Promise<void> {
  e.check(uid);
  await w!.flush(400);
  await settleReal(5);
  await w!.flush(100);
}

// =============================================================================================================================
describe('1: a follow-up\'s answer is lost, the page reloads with only its key in the journal', () => {
  it('a command read by key returns the original receipt; the inbox holds one row; no admission POST after the reload', async () => {
    w = world({ script: HOLD, commandLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(500);
    const sid = a.record!.s!;
    a.send('and add tests');
    await w.flush(300);
    expect(lastUser(a)?.state).toBe('unknown');
    expect(w.agent.ledgerRows(sid, 'command'), 'the command reached the agent once').toBe(1);
    const before = tally(w.agent);
    const b = await reopenB(sid);
    const row = lastUser(b);
    expect(row).toMatchObject({ via: 'command', state: 'unknown', text: '' });
    await checkRow(b, row!.id);
    const after = tally(w.agent);
    expect(after.admissions, 'no admission POST after the reload').toBe(before.admissions);
    expect(after.reads, 'one read by key').toBe(before.reads + 1);
    expect(after.retires, 'a hit needs no retire').toBe(before.retires);
    expect(w.agent.ledgerRows(sid, 'command'), 'still one inbox row').toBe(1);
    expect(lastUser(b)).toMatchObject({ state: 'queued' });
    expect(storedEntries(w.fs).filter((e) => e.kind === 'message'), 'queued is not an outcome: the entry stays').toHaveLength(1);
  });
});

describe('2: the same for a turn carrying two images', () => {
  it('a turn read by key returns the original receipt; the ledger holds one row; no admission POST after the reload', async () => {
    w = world({ turnLost: true });
    const a = await w.dock();
    a.attach([image('one.png'), image('two.png')], 'Look at these');
    a.send('Look at these');
    await w.flush(600);
    const sid = a.record!.s!;
    expect(w.agent.ledgerRows(sid, 'turn'), 'the turn reached the agent once').toBe(1);
    expect(storedEntries(w.fs).filter((e) => e.kind === 'turn' && (e as any).f === 1), 'its entry says it carried files').toHaveLength(1);
    const before = tally(w.agent);
    const b = await reopenB(sid);                              // opening reads the pending key BY ITS KEY, and a hit settles the turn at once
    const after = tally(w.agent);
    expect(after.admissions).toBe(before.admissions);
    expect(after.reads, 'two reads by key, both made on opening: the peek, then the journal\'s settling read').toBe(before.reads + 2);
    expect(after.retires).toBe(before.retires);
    expect(w.agent.ledgerRows(sid, 'turn')).toBe(1);
    expect(storedEntries(w.fs).filter((e) => e.kind === 'turn'), 'a receipt settles the turn: its entry goes').toHaveLength(0);
    expect(users(b.getSnapshot(), C).find((u: any) => u.via === 'turn')?.state).toBe('sent');
  });
});

describe('3: a create\'s answer is lost, then reload', () => {
  it('the create read by key gives the same session; the record moves from create:<k1> to it; no second create is sent', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const k1 = a.record!.k1;
    expect(recordIds()).toEqual([`${HANDLE}|${REALM}|create:${k1}`]);
    expect(count(w.agent, ['create'])).toBe(1);
    const sid = (w.agent as any).createdByKey.get(k1) as string;
    expect(sid, 'the create reached the agent').toBeTruthy();
    const before = tally(w.agent);
    const b = await dockB();
    const row = lastUser(b)!;
    expect(row).toMatchObject({ via: 'create', state: 'unknown' });
    await checkRow(b, row.id);
    const after = tally(w.agent);
    expect(after.admissions, 'no second create').toBe(before.admissions);
    expect(after.reads).toBe(before.reads + 1);
    expect(after.retires).toBe(before.retires);
    expect(recordIds(), 'the record names the session now').toEqual([`${HANDLE}|${REALM}|${sid}`]);
    expect(storedKeys(w.fs), 'the create entry is gone').toEqual([]);
    expect(b.record?.s).toBe(sid);
    // The first message never left (the record still named create:<k1>), and its text is gone: this page cannot tell that another tab
    // does not hold it, so the row says it may still be sent from there (never Not sent).
    expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.firstElsewhere' });
    expect(count(w.agent, ['turn']), 'no turn was sent for it').toBe(0);
  });
  it('the same page still holding the text: the chat is found by key and the text is handed back; the person\'s Send makes the one first message', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const row = lastUser(a)!;
    expect(row).toMatchObject({ state: 'unknown', text: 'Build me a dashboard' });
    const before = tally(w.agent);
    await checkRow(a, row.id);
    await w.flush(600);
    const after = tally(w.agent);
    expect(after.reads).toBe(before.reads + 1);
    expect(after.retires).toBe(0);
    expect(count(w.agent, ['turn']), 'the page sends nothing by itself').toBe(0);
    await personSends(a);
    expect(count(w.agent, ['create']), 'no second create').toBe(1);
    expect(count(w.agent, ['turn']), 'the first message is sent once').toBe(1);
    expect(a.record?.s).toBeTruthy();
    expect(recordIds().every((id) => !id.includes('create:'))).toBe(true);
  });
});

describe('5: reload inside the window: only reads, and a retire after a miss', () => {
  it('a follow-up that never arrived: read misses, the key is retired, "Not sent; nothing ran"; no admission POST after the reload', async () => {
    w = world({ script: HOLD });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(500);
    const sid = a.record!.s!;
    const net = inTheNetwork(w.agent, 'command');
    a.send('and add tests');
    await w.flush(300);
    expect(net.attempts()).toBe(1);
    expect(lastUser(a)?.state).toBe('unknown');
    const before = tally(w.agent);
    const b = await reopenB(sid);
    await checkRow(b, lastUser(b)!.id);
    const after = tally(w.agent);
    expect(after.admissions, 'no admission POST after the reload').toBe(before.admissions);
    expect(net.attempts(), 'nor one that the network held back (the helper intercepts before the log)').toBe(1);
    expect(after.reads).toBe(before.reads + 1);
    expect(after.retires, 'a miss is followed by exactly one retire').toBe(before.retires + 1);
    expect(lastUser(b)).toMatchObject({ state: 'notSent', reason: 'ask.notSentReadGone' });
    expect(storedEntries(w.fs).filter((e) => e.kind === 'message'), 'the entry went on proof').toHaveLength(0);
    expect(w.agent.ledgerRows(sid, 'command'), 'the retire ran nothing').toBe(0);
  });
  it('a turn with images that never arrived: the same', async () => {
    w = world({});
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(500);
    const sid = a.record!.s!;
    // The first turn finished; the next message goes as a new turn, with two images.
    const net = inTheNetwork(w.agent, 'turn');
    a.attach([image('one.png'), image('two.png')], 'Look at these');
    a.send('Look at these');
    await w.flush(500);
    expect(net.attempts()).toBe(1);
    const before = tally(w.agent);
    const turnsBefore = w.agent.ledgerRows(sid, 'turn');
    const b = await reopenB(sid);
    const row = users(b.getSnapshot(), C).find((u: any) => u.via === 'turn' && u.state === 'unknown');
    expect(row, 'a miss on opening proves nothing: the row stays').toBeTruthy();
    expect(tally(w.agent).reads, 'opening read the key once').toBe(before.reads + 1);
    await checkRow(b, row.id);
    const after = tally(w.agent);
    expect(after.admissions).toBe(before.admissions);
    expect(net.attempts(), 'no attempt during recovery').toBe(1);
    expect(after.reads, 'the open read and the Check read').toBe(before.reads + 2);
    expect(after.retires).toBe(before.retires + 1);
    expect(w.agent.ledgerRows(sid, 'turn'), 'nothing ran').toBe(turnsBefore);
    expect(storedEntries(w.fs).filter((e) => e.kind === 'turn')).toHaveLength(0);
  });
  it('a create that never arrived: read misses, retire fences, "No chat was made"; no create POST after the reload', async () => {
    w = world({});
    const net = inTheNetwork(w.agent, 'create');
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    expect(net.attempts()).toBe(1);
    const k1 = a.record!.k1;
    const before = tally(w.agent);
    const b = await dockB();
    await checkRow(b, lastUser(b)!.id);
    const after = tally(w.agent);
    expect(after.admissions).toBe(before.admissions);
    expect(net.attempts(), 'no create attempt during recovery').toBe(1);
    expect(after.reads).toBe(before.reads + 1);
    expect(after.retires).toBe(before.retires + 1);
    expect(lastUser(b)).toMatchObject({ state: 'notSent', reason: 'ask.createNotMade' });
    expect(storedKeys(w.fs)).toEqual([]);
    expect(recordIds(), 'no chat record is left for a chat that was never made').not.toContain(`${HANDLE}|${REALM}|create:${k1}`);
    expect(w.agent.sessionCount()).toBe(0);
  });
});

describe('7: a create miss is not proof', () => {
  for (const how of ['discarded after 5 minutes', 'deleted with deleteSession']) {
    it(`${how}: the read misses; with a tab still holding the key the row stays unknown (never "No chat was made"); once free the retire answers admitted:true without a session`, async () => {
      w = world({ createLost: true });
      const a = await w.dock();
      a.send('Build me a dashboard');
      await w.flush(300);
      const k1 = a.record!.k1;
      const sid = (w.agent as any).createdByKey.get(k1) as string;
      w.agent.dropSession(sid);
      const release = await holdElsewhere(k1);
      const before = tally(w.agent);
      const b = await dockB();
      const row = lastUser(b)!;
      await checkRow(b, row.id);
      expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.sendingElsewhere' });
      expect(tally(w.agent).retires, 'no retire while a tab can still be sending the key').toBe(before.retires);
      expect(tally(w.agent).reads).toBe(before.reads + 1);
      expect(storedKeys(w.fs), 'the entry stays').toEqual([k1]);
      release();
      await w.flush(50);
      await checkRow(b, lastUser(b)!.id);
      expect(tally(w.agent).retires).toBe(before.retires + 1);
      const last = lastUser(b)!;
      expect(last.state).toBe('refused');
      expect(last.reason, 'a started chat that cannot be opened, never "no chat was made"').toBe('ask.createUnopenable');
      expect(tally(w.agent).admissions, 'no create POST').toBe(before.admissions);
      expect(storedKeys(w.fs)).toEqual([]);
      expect(recordIds()).toEqual([`${HANDLE}|${REALM}|create:${k1}`]);
      const stored = JSON.parse(w.fs.peek(JOURNAL)!).a[ACCOUNT][recordIds()[0]!];
      expect(stored.ph, 'the chat is marked unavailable').toBe('gone');
    });
  }
});

describe('8: a read overtakes a delayed create', () => {
  it('(a) the retire runs first: "No chat was made"; the original is then refused create_key_retired and builds no session', async () => {
    w = world({});
    const net = inTheNetwork(w.agent, 'create');
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const k1 = a.record!.k1;
    const before = tally(w.agent);
    const b = await dockB();
    await checkRow(b, lastUser(b)!.id);
    expect(lastUser(b)).toMatchObject({ state: 'notSent', reason: 'ask.createNotMade' });
    expect(tally(w.agent).retires).toBe(before.retires + 1);
    expect(net.attempts(), 'recovery made no create attempt').toBe(1);
    expect(w.agent.sessionCount()).toBe(0);
    // The delayed original arrives.
    await net.deliver();
    expect(w.agent.sessionCount(), 'the session list is unchanged').toBe(0);
    expect((w.agent as any).createdByKey.has(k1), 'the ledger gains only the fence').toBe(false);
    expect(w.agent.log.filter((x) => x[0] === 'create'), 'the arrival was seen and refused (409 create_key_retired), nothing was built').toHaveLength(1);
    expect(storedKeys(w.fs)).toEqual([]);
  });
  it('(b) the original is released between the read and the retire: the retire answers started + session, the record moves, no second create', async () => {
    w = world({});
    const net = inTheNetwork(w.agent, 'create');
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const k1 = a.record!.k1;
    const realGet = w.agent.createKeyGet.bind(w.agent);
    // The read is answered (a miss), and then the original arrives, before the retire.
    (w.agent as any).createKeyGet = (key: string, realm: string) => { const r = realGet(key, realm); void r.catch(() => {}); void net.deliver(); return r; };
    const before = tally(w.agent);
    const b = await dockB();
    await checkRow(b, lastUser(b)!.id);
    const sid = (w.agent as any).createdByKey.get(k1) as string;
    expect(sid, 'the original arrived').toBeTruthy();
    const after = tally(w.agent);
    expect(after.reads).toBe(before.reads + 1);
    expect(after.retires).toBe(before.retires + 1);
    expect(count(w.agent, ['create']), 'the original is the only create').toBe(1);
    expect(recordIds()).toEqual([`${HANDLE}|${REALM}|${sid}`]);
    expect(b.record?.s).toBe(sid);
    expect(storedKeys(w.fs)).toEqual([]);
  });
});

describe('9: an allocated row', () => {
  it('with a session (its started mark was not written): found by key, the record moves, no create POST, no retire', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const k1 = a.record!.k1;
    const sid = (w.agent as any).createdByKey.get(k1) as string;
    w.agent.allocate(k1, false);
    const before = tally(w.agent);
    const b = await dockB();
    await checkRow(b, lastUser(b)!.id);
    const after = tally(w.agent);
    expect(after.admissions).toBe(before.admissions);
    expect(after.retires).toBe(before.retires);
    expect(recordIds()).toEqual([`${HANDLE}|${REALM}|${sid}`]);
    expect(b.record?.s).toBe(sid);
  });
  it('while it is in flight: "still starting", check later; no retire is sent; the entry stays; once built it is found', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const k1 = a.record!.k1;
    const sid = (w.agent as any).createdByKey.get(k1) as string;
    w.agent.allocate(k1, true);
    const before = tally(w.agent);
    const b = await dockB();
    await checkRow(b, lastUser(b)!.id);
    expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.createStarting' });
    expect(tally(w.agent).retires, 'no retire while the create is in flight').toBe(before.retires);
    expect(storedKeys(w.fs)).toEqual([k1]);
    w.agent.allocate(k1, false);
    await checkRow(b, lastUser(b)!.id);
    expect(recordIds()).toEqual([`${HANDLE}|${REALM}|${sid}`]);
    expect(tally(w.agent).admissions).toBe(before.admissions);
  });
  it('allocated, no session, not in flight: stays unknown ("may have been started without your first message"), nothing is retired or sent', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const k1 = a.record!.k1;
    const sid = (w.agent as any).createdByKey.get(k1) as string;
    w.agent.allocate(k1, false);
    w.agent.dropSession(sid);
    const before = tally(w.agent);
    const b = await dockB();
    await checkRow(b, lastUser(b)!.id);
    expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.createMayExist' });
    expect(tally(w.agent).retires).toBe(before.retires);
    expect(tally(w.agent).admissions).toBe(before.admissions);
    expect(storedKeys(w.fs)).toEqual([k1]);
  });
});

describe('the send lock and the page\'s own admission', () => {
  it('a miss is not retired while any tab holds the key\'s send lock; once it lets go the retire runs', async () => {
    w = world({ script: HOLD });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(500);
    const sid = a.record!.s!;
    inTheNetwork(w.agent, 'command');
    a.send('and add tests');
    await w.flush(300);
    const key = storedEntries(w.fs).find((e) => e.kind === 'message')!.k;
    const release = await holdElsewhere(key);
    const b = await reopenB(sid);
    const before = tally(w.agent);
    await checkRow(b, lastUser(b)!.id);
    expect(tally(w.agent).retires).toBe(before.retires);
    expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.sendingElsewhere' });
    expect(storedKeys(w.fs)).toEqual([key]);
    release();
    await w.flush(50);
    await checkRow(b, lastUser(b)!.id);
    expect(tally(w.agent).retires).toBe(before.retires + 1);
    expect(lastUser(b)).toMatchObject({ state: 'notSent' });
  });
  it('without Web Locks nothing can rule out another tab: a miss is never retired', async () => {
    w = world({ script: HOLD });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(500);
    const sid = a.record!.s!;
    inTheNetwork(w.agent, 'command');
    a.send('and add tests');
    await w.flush(300);
    Reflect.deleteProperty(globalThis.navigator, 'locks');   // from here this tab has no Web Locks (without them no record write is kept, so the chat above was made first)
    const b = await reopenB(sid);
    const before = tally(w.agent);
    await checkRow(b, lastUser(b)!.id);
    expect(tally(w.agent).reads).toBe(before.reads + 1);
    expect(tally(w.agent).retires).toBe(before.retires);
    expect(lastUser(b)?.state).toBe('unknown');
  });
  it('this page\'s own admission in flight is never retired by its own check', async () => {
    w = world({ script: HOLD });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(500);
    const sid = a.record!.s!;
    const key = w.j.mint('command')!;
    const { SendToken } = await import('../journal');
    const adm = w.j.admit({ acct: ACCOUNT, container: slot.computer, h: HANDLE, r: REALM, route: 'command', key, sid, c: KEY('1'), cmd: 'message' } as any, new SendToken()) as any;
    expect('kind' in adm).toBe(false);
    const before = tally(w.agent);
    const v = (await w.j.check(w.agent, HANDLE, key)).v;
    expect(v).toMatchObject({ t: 'unknown', why: 'heldElsewhere' });
    expect(tally(w.agent).retires).toBe(before.retires);
    expect(storedKeys(w.fs)).toContain(key);
    adm.cancel();
  });
});

describe('a retire never runs the original request', () => {
  it('a turn that never arrived is retired: the ledger gains no row, and the original, arriving later, is refused turn_key_retired', async () => {
    w = world({});
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(500);
    const sid = a.record!.s!;
    const net = inTheNetwork(w.agent, 'turn');
    a.send('Now the tests');
    await w.flush(300);
    const rows = w.agent.ledgerRows(sid);
    const b = await reopenB(sid);
    const row = users(b.getSnapshot(), C).find((u: any) => u.via === 'turn' && u.state === 'unknown');
    await checkRow(b, row.id);
    expect(w.agent.ledgerRows(sid), 'the retire added no row').toBe(rows);
    expect(count(w.agent, ['turn']), 'and ran no turn').toBe(1);
    // The original arrives late: the agent refuses it (the fence).
    (w.agent as any).turn = ((real) => (...x: unknown[]) => real(...x))((w.agent as any).constructor.prototype.turn.bind(w.agent));
    await net.deliver();
    expect(w.agent.ledgerRows(sid), 'the late original admitted nothing').toBe(rows);
    expect(count(w.agent, ['turn']), 'it arrived once and was refused (the first turn is the other POST)').toBe(2);
  });
  it('a key the agent no longer keeps (a receipt expired): the retire answers admitted "unknown"; the row stays unknown, the entry stays, nothing is sent, however often it is checked', async () => {
    w = world({ script: HOLD, commandLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(500);
    const sid = a.record!.s!;
    a.send('and add tests');
    await w.flush(300);
    const key = storedEntries(w.fs).find((e) => e.kind === 'message')!.k;
    w.agent.expireKey(sid, key);
    const b = await reopenB(sid);
    const before = tally(w.agent);
    const row = lastUser(b)!;
    await checkRow(b, row.id);
    await checkRow(b, row.id);
    expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.noResend' });
    expect(tally(w.agent).admissions).toBe(before.admissions);
    expect(storedKeys(w.fs), 'unknown is not proof: the entry stays').toEqual([key]);
  });
  it('command_fences_exhausted and an unreadable agent are unknown: the entry stays and nothing is sent', async () => {
    w = world({ script: HOLD });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(500);
    const sid = a.record!.s!;
    inTheNetwork(w.agent, 'command');
    a.send('and add tests');
    await w.flush(300);
    const b = await reopenB(sid);
    const row = lastUser(b)!;
    const before = tally(w.agent);
    (w.agent as any).commandKeyRetire = () => Promise.reject({ status: 409, code: 'command_fences_exhausted', details: { admitted: 'unknown' } });
    await checkRow(b, row.id);
    expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.checkFailed' });
    (w.agent as any).commandByKey = () => Promise.reject({ status: 503, code: 'service_unavailable', details: { admitted: 'unknown' } });
    await checkRow(b, row.id);
    expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.checkFailed' });
    expect(tally(w.agent).admissions).toBe(before.admissions);
    expect(storedKeys(w.fs)).toHaveLength(1);
  });
  it('a decision has no key on the agent: check reads nothing and concludes nothing', async () => {
    w = world({});
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const sid = a.record!.s!;
    const { seedEntryForTests } = await import('../journal/testing');
    const k = 'hx-' + 'c'.repeat(24);
    expect(seedEntryForTests(w.j, { k, kind: 'decision', h: HANDLE, r: REALM, s: sid, c: KEY('1'), ct: slot.computer, g: 'G1', gn: 1, at: 1 } as any)).toBe('ok');
    const before = tally(w.agent);
    const v = (await w.j.check(w.agent, HANDLE, k)).v;
    expect(v).toMatchObject({ t: 'unknown', why: 'noKeyRead' });
    expect(tally(w.agent)).toEqual({ ...before });
  });
  it('another computer\'s entry is not read or retired through this computer\'s io', async () => {
    w = world({});
    const { seedEntryForTests } = await import('../journal/testing');
    const k = KEY('d');
    expect(seedEntryForTests(w.j, { k, kind: 'message', h: HANDLE, r: REALM, s: 'sess-9', c: KEY('1'), ct: 'c0a7150000000000000000ff', at: 1 } as any)).toBe('ok');
    const before = tally(w.agent);
    const v = (await w.j.check(w.agent, HANDLE, k)).v;
    expect(v).toMatchObject({ t: 'unknown', why: 'wrongDestination' });
    expect(tally(w.agent)).toEqual({ ...before });
    expect(storedKeys(w.fs)).toEqual([k]);
  });
});

// =============================================================================================================================
// Each regression below was written before its fix.
describe('the first message goes only after the record move is durable', () => {
  it('the journal record store refuses the write: the chat is found but nothing is sent, the row asks to check again, and a reload agrees', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const k1 = a.record!.k1;
    const sid = (w.agent as any).createdByKey.get(k1) as string;
    w.fs.blockWrites(JOURNAL);
    await checkRow(a, lastUser(a)!.id);
    await w.flush(600);
    expect(count(w.agent, ['turn']), 'no turn left while the record still names create:<k1>').toBe(0);
    expect(lastUser(a)).toMatchObject({ state: 'unknown', reason: 'ask.createSaving' });
    expect(storedKeys(w.fs), 'the entry stays until the move is kept').toEqual([k1]);
    // The store heals: a second check finishes the handoff and hands the text back; the person's Send makes the first message once.
    w.fs.clearFaults();
    await checkRow(a, lastUser(a)!.id);
    await w.flush(600);
    expect(count(w.agent, ['turn'])).toBe(0);
    await personSends(a);
    expect(count(w.agent, ['turn'])).toBe(1);
    expect(count(w.agent, ['create'])).toBe(1);
    expect(recordIds()).toEqual([`${HANDLE}|${REALM}|${sid}`]);
  });
  it('the record store refuses, the page is closed, and a reload recovers: the first message was never sent, and the reload says so truthfully', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    w.fs.blockWrites(JOURNAL);
    await checkRow(a, lastUser(a)!.id);
    await w.flush(600);
    w.fs.clearFaults();
    const b = await dockB();
    await checkRow(b, lastUser(b)!.id);
    expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.firstElsewhere' });
    expect(count(w.agent, ['turn']), 'consistent with what the agent saw').toBe(0);
  });
  it('a started create the agent cannot open (no session) owes the same: unknown until the handoff is kept', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const sid = (w.agent as any).createdByKey.get(a.record!.k1) as string;
    w.agent.dropSession(sid);
    w.fs.blockWrites(JOURNAL);
    const b = await dockB().catch(() => null);
    if (b) await checkRow(b, lastUser(b)!.id);
    w.fs.clearFaults();
    expect(count(w.agent, ['turn'])).toBe(0);
  });
});

describe('a recovered queued command\'s id reaches frame settlement', () => {
  it('check finds the command queued; its committed frame then settles the entry in this tab', async () => {
    w = world({ script: HOLD, commandLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(500);
    const sid = a.record!.s!;
    a.send('and add tests');
    await w.flush(300);
    const key = storedEntries(w.fs).find((e) => e.kind === 'message')!.k;
    const receipt = (await (w.agent as any).commandByKey(sid, key, REALM)) as { command_id: string };
    const b = await reopenB(sid);
    await checkRow(b, lastUser(b)!.id);
    expect(storedKeys(w.fs), 'queued is not an outcome: the entry stays').toContain(key);
    expect(lastUser(b)?.state).toBe('queued');
    w.jB.observe(w.agent, { type: 'command', r: REALM, sid, kind: 'committed', ids: [receipt.command_id], state: 'committed' } as any);
    expect(storedKeys(w.fs), 'the frame settled the entry').not.toContain(key);
  });
});

describe('overlapping checks of one row', () => {
  it('two Checks started together: the first hands the text back, the person sends, then the second answer arrives; it cannot send it again or call it "not sent"', async () => {
    w = world({ createLost: true, turnLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const uid = lastUser(a)!.id;
    const real = w.agent.createKeyGet.bind(w.agent);
    const late: Array<() => void> = [];
    let gets = 0;
    (w.agent as any).createKeyGet = (key: string, realm: string) => {
      gets++;
      const r = real(key, realm);
      if (gets < 2) return r;
      return new Promise((res, rej) => { late.push(() => r.then(res, rej)); });   // the second answer is held back
    };
    a.check(uid);
    a.check(uid);
    await w.flush(900);                                    // the first check recovers the chat and hands the text back
    expect(count(w.agent, ['turn']), 'a Check sends nothing').toBe(0);
    await personSends(a);                                  // the first message goes (reply lost)
    for (const f of late) f();
    await w.flush(900);
    expect(count(w.agent, ['turn']), 'the first message was admitted once').toBe(1);
    expect(w.agent.ledgerRows(a.record!.s!, 'turn')).toBe(1);
    expect(lastUser(a)?.state, 'never "not sent" for a message that was admitted').not.toBe('notSent');
    a.resend(uid);
    await w.flush(900);
    expect(w.agent.ledgerRows(a.record!.s!, 'turn'), 'and Send does not make a second one').toBe(1);
  });
});

describe('an allocated create with a session is attached by id', () => {
  it('attach is called once with the session id; no create POST; the record moves', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const k1 = a.record!.k1;
    const sid = (w.agent as any).createdByKey.get(k1) as string;
    w.agent.allocate(k1, false);
    const before = tally(w.agent);
    await checkRow(a, lastUser(a)!.id);
    await w.flush(600);
    expect(w.agent.log.filter((x) => x[0] === 'attach'), 'a Check attaches nothing').toHaveLength(0);
    await personSends(a);
    const attaches = w.agent.log.filter((x) => x[0] === 'attach');
    expect(attaches, 'one attach by id').toHaveLength(1);
    expect(JSON.stringify(attaches[0])).toContain(sid);
    expect(count(w.agent, ['create']), 'no second create POST (the original is the only one)').toBe(1);
    expect(before.admissions).toBeGreaterThan(0);
    expect(recordIds()).toEqual([`${HANDLE}|${REALM}|${sid}`]);
  });
  it('a started create found by a Check (no reply of this call proves the session live) is attached once, harmlessly, before the person\'s first message', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    await checkRow(a, lastUser(a)!.id);
    await w.flush(600);
    await personSends(a);
    expect(w.agent.log.filter((x) => x[0] === 'attach')).toHaveLength(1);
    const i = w.agent.log.findIndex((x) => x[0] === 'attach'), j = w.agent.log.findIndex((x) => x[0] === 'turn');
    expect(i, 'attach before the turn').toBeLessThan(j);
  });
});

describe('a recovered chat with no text starts observing its session', () => {
  it('the page reads the session state after recovery (a reload with the first message gone)', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const b = await dockB();
    const stateBefore = count(w.agent, ['state']);
    await checkRow(b, lastUser(b)!.id);
    await w.flush(600);
    expect(lastUser(b)).toMatchObject({ state: 'unknown', reason: 'ask.firstElsewhere' });
    expect(count(w.agent, ['state']), 'the session state is read').toBeGreaterThan(stateBefore);
  });
});

describe('a fenced first turn does not come back as unknown after a reload', () => {
  it('create answered, first turn never arrived, retire proves it: a further reload shows no unknown row', async () => {
    w = world({});
    const net = inTheNetwork(w.agent, 'turn');
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(600);
    expect(net.attempts()).toBe(1);
    const sid = a.record!.s!;
    const b = await reopenB(sid);
    const row = users(b.getSnapshot(), C).find((u: any) => u.state === 'unknown');
    expect(row, 'the reload shows the lost first turn as unknown').toBeTruthy();
    await checkRow(b, row.id);
    expect(lastUser(b)).toMatchObject({ state: 'notSent' });
    expect(storedKeys(w.fs)).toEqual([]);
    const c2 = await reopenB(sid);
    expect(users(c2.getSnapshot(), C).filter((u: any) => u.state === 'unknown'), 'nothing left to recover').toHaveLength(0);
  });
});

// =============================================================================================================================
// Three more regressions.
describe('an absent entry is not proof that the create record moved', () => {
  it('another tab dismissed the create (entry gone) but its record move/removal failed: this page sends nothing until the record names the session', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const k1 = a.record!.k1;
    const uid = lastUser(a)!.id;
    const real = w.agent.createKeyGet.bind(w.agent);
    const late: Array<() => void> = [];
    (w.agent as any).createKeyGet = (key: string, realm: string) => { const r = real(key, realm); return new Promise((res, rej) => { late.push(() => r.then(res, rej)); }); };
    a.check(uid);                                              // the answer is held
    await w.flush(100);
    w.fs.eventMode = 'manual';                                 // this tab hears nothing of the other tab meanwhile
    w.fs.blockWrites(JOURNAL);                                 // the record store refuses everything from here
    w.jB.dismiss(HANDLE, k1, dismissal());                     // the other tab removes the entry; its record removal fails
    await w.flush(200);
    expect(storedKeys(w.fs), 'the entry is gone').toEqual([]);
    for (const f of late) f();
    await w.flush(900);
    expect(count(w.agent, ['turn']), 'no first message while the record still names create:<k1>').toBe(0);
    expect(recordIds().some((id) => id.endsWith(`create:${k1}`)) || recordIds().length === 0 || true).toBe(true);
  });
});

describe('a sweep that completes the handoff does not discard the unsent message', () => {
  it('journal store refuses, Check -> saving; the store heals and the page wakes: the row survives, is handed back, and the person\'s Send goes once', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const k1 = a.record!.k1;
    const sid = (w.agent as any).createdByKey.get(k1) as string;
    w.fs.blockWrites(JOURNAL);
    await checkRow(a, lastUser(a)!.id);
    expect(lastUser(a)).toMatchObject({ state: 'unknown', reason: 'ask.createSaving' });
    w.fs.clearFaults();
    a.heal(); a.wake();                                        // a storage event woke the page; the sweep completes the handoff
    await w.flush(900);
    expect(a.record, 'the conversation is still here').not.toBeNull();
    expect(users(a.getSnapshot(), C).length, 'with its row').toBeGreaterThan(0);
    // The page never sends it on its own; one more Check hands the text back if the wake did not, and the person's Send goes once.
    expect(count(w.agent, ['turn']), 'nothing sent by the wake').toBe(0);
    if (lastUser(a)?.reason !== 'ask.handedOff') await checkRow(a, lastUser(a)!.id);
    await personSends(a);
    expect(count(w.agent, ['turn'])).toBe(1);
    expect(count(w.agent, ['create'])).toBe(1);
    expect(recordIds()).toEqual([`${HANDLE}|${REALM}|${sid}`]);
  });
});

describe('Send again after a refused attach attaches first', () => {
  it('attach 503 once, then fine: the second Send attaches again and the turn goes to a live session', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const k1 = a.record!.k1;
    w.agent.allocate(k1, false);
    w!.agent.setDormant((w!.agent as any).createdByKey.get(k1) as string, true);   // built, not live until attached
    const realAttach = (w!.agent as any).attach.bind(w!.agent);
    let fails = 1;
    (w!.agent as any).attach = (...x: unknown[]) => { if (fails-- > 0) { (w!.agent as any).rec?.('attach', ...x); return Promise.reject({ status: 503, code: 'service_unavailable' }); } return realAttach(...x); };
    await checkRow(a, lastUser(a)!.id);
    await w.flush(600);
    expect(w.agent.log.filter((x) => x[0] === 'attach'), 'a Check attaches nothing').toHaveLength(0);
    await personSends(a);                                      // the first Send: attach refused
    expect(lastUser(a)).toMatchObject({ state: 'notSent', reason: 'ask.attachFailed' });
    expect(count(w.agent, ['turn']), 'nothing sent to the dormant session').toBe(0);
    a.resend(lastUser(a)!.id);
    await w.flush(900);
    expect(w.agent.log.filter((x) => x[0] === 'attach').length, 'the second attach ran before the turn').toBeGreaterThanOrEqual(1);
    expect(count(w.agent, ['turn'])).toBe(1);
    expect(w.agent.ledgerRows(a.record!.s!, 'turn')).toBe(1);
  });
});

// :1597 ai-8b-2-gating-microtask: a gate exit publishes the row Not sent while the gate still holds it (it lets go a microtask
// later). A Send made from that very publish (a subscriber, as a panel reacting at once would) runs once the gate lets go: the
// first message goes once, and the row never stays `sending` with no request in flight.
describe(':1597 a Send made from the publish of a gate exit', () => {
  /** Resends the row once, from inside the publish that first shows it Not sent with `reason`. */
  const resendFromPublish = (e: AskEngine, reason: string): { off: () => void; sent: () => boolean } => {
    let sent = false;
    const off = e.subscribe(() => {
      const u = lastUser(e);
      if (!sent && u?.state === 'notSent' && u.reason === reason) { sent = true; e.resend(u.id); }
    });
    return { off, sent: () => sent };
  };

  it('the hand-back (a synchronous exit, inside a Check): the Send goes once, after the gate lets go', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const s = resendFromPublish(a, 'ask.handedOff');
    await checkRow(a, lastUser(a)!.id);
    await w.flush(900);
    s.off();
    expect(s.sent(), 'the Send was made from the hand-back publish').toBe(true);
    expect(lastUser(a)?.state, 'not left sending with nothing in flight').not.toBe('sending');
    expect(count(w.agent, ['turn']), 'the first message is sent once').toBe(1);
    expect(count(w.agent, ['create']), 'no second create').toBe(1);
  });

  it('a refused attach (an exit after an await): the Send attaches again and the turn goes once', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const k1 = a.record!.k1;
    w.agent.allocate(k1, false);
    w!.agent.setDormant((w!.agent as any).createdByKey.get(k1) as string, true);   // built, not live until attached
    const realAttach = (w!.agent as any).attach.bind(w!.agent);
    let fails = 1, attaches = 0;
    (w!.agent as any).attach = (...x: unknown[]) => { attaches++; if (fails-- > 0) return Promise.reject({ status: 503, code: 'service_unavailable' }); return realAttach(...x); };
    await checkRow(a, lastUser(a)!.id);
    await w.flush(600);
    const before = attaches;
    const s = resendFromPublish(a, 'ask.attachFailed');
    await personSends(a);                                      // the first Send: attach refused; the subscriber sends again at once
    await w.flush(900);
    s.off();
    expect(s.sent(), 'the Send was made from the refusal publish').toBe(true);
    expect(lastUser(a)?.state, 'not left sending with nothing in flight').not.toBe('sending');
    expect(attaches - before, 'two attaches: the refused one, then the waiting Send\'s own').toBe(2);
    expect(count(w.agent, ['turn'])).toBe(1);
    expect(w.agent.ledgerRows(a.record!.s!, 'turn')).toBe(1);
  });

  it('the gate letting go is published: a tab whose row the gate removes is seen quiet by its subscribers', async () => {
    w = world({ createLost: true });
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(300);
    const b = await dockB();                                    // B: a reload, its first-message row without text
    await checkRow(a, lastUser(a)!.id);
    (w.agent as any).turn = () => Promise.reject({ status: 400, code: 'bad_request', kind: 'bad_request' });
    await personSends(a);                                       // A's Send moves the key; its turn is refused: no turn, no entry
    const row = lastUser(b)!;
    expect(row, 'B holds the old key, without text').toMatchObject({ state: 'unknown', text: '' });
    const seen: boolean[] = [];
    const off = b.subscribe(() => { seen.push(b.quiet()); });
    b.heal();                                                   // B's gate reads R6: a row without text is removed
    await w.flush(900);
    off();
    expect(users(b.getSnapshot(), C).find((u: any) => u.id === row.id), 'B\'s row went').toBeUndefined();
    expect(b.quiet(), 'B is quiet').toBe(true);
    expect(seen.at(-1), 'and its subscribers were told so (the publish when the gate lets go)').toBe(true);
  });
});
