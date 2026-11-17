// Acceptance (C9): a page's text that owes a NEW conversation never makes it over a first message
// whose create answer was lost (an unknown row with no session of its own): that row and its Check live only in the dock, so a new
// conversation would take them from view. The new conversation stays owed until the row is settled; Send says so; a start ends not sent.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import * as C from '../conv';
import { AskEngine, type Slot, type StoreIO } from '../engine';
import { newAsk } from '../logic';
import { HANDLE, slot, users, world, settleReal, type World } from './env';

let w: World | null = null;
let restoreLocks: () => void = () => {};
beforeEach(() => { resetApproversForTests(); restoreLocks = installLocks(); });
afterEach(() => { w?.dispose(); w = null; restoreLocks(); resetApproversForTests(); });

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
const lastUser = (e: AskEngine) => users(e.getSnapshot(), C).at(-1);
/** A second dock over tab B's journal: a page reloaded after a create whose answer was lost, the agent holding a session no key proves. */
async function reloaded(): Promise<AskEngine> {
  w = world({ createLost: true });
  const a = await w.dock();
  a.send('Build me a dashboard');
  await w.flush(300);
  const k1 = a.record!.k1;
  const sid = (w.agent as any).createdByKey.get(k1) as string;
  w.agent.allocate(k1, false);
  w.agent.dropSession(sid);
  const store: StoreIO = { read: (x: string) => w!.jB.dockRead(x, { v: 1, a: {} }), apply: (x: string, op: any) => w!.jB.dockApply(x, op) } as any;
  const b = new AskEngine(slot as Slot, w.agent, store, w.clock, { journal: { j: w.jB, handle: HANDLE } });
  b.open();
  await w.flush(900);
  await b.check(lastUser(b)!.id);
  await w.flush(400);
  await settleReal(5);
  return b;
}

describe('a prefill over a reloaded unknown create', () => {
  it('the unknown row, its record and its Check stay; the new conversation stays owed (no reset)', async () => {
    const b = await reloaded();
    const row = lastUser(b)!;
    expect(row).toMatchObject({ state: 'unknown', reason: 'ask.createMayExist' });
    const k1 = b.record?.k1;
    expect(k1).toBeTruthy();
    expect(b.holdsUnknownCreate()).toBe(true);
    b.wantFresh();
    await w!.flush(600);
    expect(b.owesFresh()).toBe(true);
    expect(b.record?.k1).toBe(k1);
    expect(lastUser(b)).toMatchObject({ id: row.id, state: 'unknown' });
  });
  it('send() with the fresh owed is refused while the row stands', async () => {
    const b = await reloaded();
    b.wantFresh();
    await w!.flush(300);
    expect(b.send('a prefilled text')).toBe(false);
    expect(lastUser(b)).toMatchObject({ state: 'unknown' });
  });
  it('a start that waits behind such a row ends not sent, and sends nothing', async () => {
    const b = await reloaded();
    const told: string[] = [];
    const before = w!.agent.log.filter((x) => ['create', 'turn', 'command'].includes(x[0])).length;
    b.queueStart('Another chat', (o) => { told.push(o); });
    await w!.flush(600);
    expect(told).toEqual(['notSent']);
    expect(w!.agent.log.filter((x) => ['create', 'turn', 'command'].includes(x[0])).length).toBe(before);
    expect(lastUser(b)).toMatchObject({ state: 'unknown' });
  });
  it('a start surface that stopped tracking the key releases the hold: a new start is then the person\'s own choice, the journal untouched', async () => {
    const b = await reloaded();
    const k1 = b.record!.k1;
    expect(b.holdsUnknownCreate()).toBe(true);
    b.releaseCreate(k1);
    expect(b.holdsUnknownCreate()).toBe(false);
    expect(b.keyHeld(k1), 'nothing was read or retired').toBe(true);
    expect(b.getSnapshot().freshHeld).toBeUndefined();
  });
  it('wantFresh and releaseFresh publish: the snapshot\'s freshHeld follows at once, with nothing else changing', async () => {
    const b = await reloaded();
    expect(b.getSnapshot().freshHeld).toBeUndefined();
    b.wantFresh();
    expect(b.getSnapshot().freshHeld, 'Send must say it waits, in the same breath').toBe(true);
    b.releaseFresh();
    expect(b.getSnapshot().freshHeld, 'and stop saying it when the page lets the fresh conversation go').toBeUndefined();
  });
  it('an unknown TURN row (its session is in Recent) does not hold a new conversation back', async () => {
    w = world();
    const a = await w.dock();
    a.send('Build me a dashboard');
    await w.flush(900);
    expect(a.holdsUnknownCreate()).toBe(false);
  });
});

describe('the person\'s own New conversation', () => {
  it('asks first for a running task and for an unconfirmed first message; goes at once otherwise', () => {
    expect(newAsk(true, false)).toBe('ask.newConfirm');
    expect(newAsk(false, true)).toBe('ask.newConfirmUnsure');
    expect(newAsk(true, true)).toBe('ask.newConfirm');
    expect(newAsk(false, false)).toBeNull();
  });
});
