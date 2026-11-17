// The guard hands out the members of AgentIO and nothing else. A member that every object has
// (valueOf, toString, constructor, __proto__ ...) used to come back bound to the raw io, and the raw io needs no ticket.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { ACCOUNT, REALM, posts, settleReal, slot, world, type World } from './env';
import { guardIO } from '../journal';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });
const guarded = (x: World) => guardIO(x.agent as any, { acct: ACCOUNT, container: slot.computer }) as any;

/** AgentIO's own members (ask/data.ts), spelled out here so the guard's list is checked against a second copy. */
const MEMBERS = ['health', 'version', 'authStatus', 'probe', 'signIn', 'sessions', 'create', 'attach', 'turn', 'turns', 'receipt', 'command', 'interrupt', 'stop',
  'commandGet', 'withdraw', 'createKeyGet', 'createKeyRetire', 'turnByKey', 'turnKeyRetire', 'commandByKey', 'commandKeyRetire', 'state', 'replay', 'transcript', 'confirm', 'answer', 'approval', 'yolo', 'cancel', 'stream', 'computer', 'start', 'alive', 'acpDefault'];
const INHERITED = ['valueOf', 'toString', 'toLocaleString', 'constructor', '__proto__', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__', 'then', 'toJSON', 'notAMember'];

describe('the guard refuses every member that is not on AgentIO', () => {
  it('guarded.valueOf() no longer hands out the raw io, and a ticketless turn through it reaches nothing', async () => {
    w = world();
    const g = guarded(w);
    const raw = (g.valueOf as undefined | (() => unknown))?.();
    expect(raw, 'valueOf returned something').toBeUndefined();
    expect(Object.prototype.valueOf.call(g), 'the guard itself').not.toBe(w.agent);
    const before = posts(w.agent, 'turn').length;
    await (raw as any)?.turn?.('sess-1', 'x', 'hx-00000000000000000000000000000000', REALM);
    await settleReal(3);
    expect(posts(w.agent, 'turn'), 'a ticketless turn reached the io').toHaveLength(before);
  });
  for (const name of INHERITED) {
    it(`${name} is undefined on the guard`, () => {
      w = world();
      expect(Reflect.get(guarded(w), name), name).toBeUndefined();
    });
  }
  it('symbols are refused too', () => {
    w = world();
    const g = guarded(w);
    for (const s of [Symbol.toPrimitive, Symbol.toStringTag, Symbol.iterator, Symbol.for('nodejs.util.inspect.custom')]) expect(Reflect.get(g, s), String(s)).toBeUndefined();
  });
  it('the guard has no prototype and exactly the members of AgentIO, none of them the io\'s own function', async () => {
    w = world();
    const g = guarded(w);
    expect(Object.getPrototypeOf(g)).toBeNull();
    expect([...Reflect.ownKeys(g)].map(String).sort()).toEqual([...MEMBERS].sort());
    for (const k of MEMBERS) {
      const d = Object.getOwnPropertyDescriptor(g, k)!;
      expect(typeof d.value, k).toBe('function');
      expect(d.value, k + ' is the io\'s own function').not.toBe((w.agent as any)[k]);
    }
    // a descriptor read does not get past the ticket either
    const before = posts(w.agent, 'turn').length;
    await Object.getOwnPropertyDescriptor(g, 'turn')!.value('sess-1', 'x', 'hx-00000000000000000000000000000000', REALM).catch(() => undefined);
    expect(posts(w.agent, 'turn')).toHaveLength(before);
  });
  it('the guard cannot be changed: nothing added, replaced or deleted', () => {
    w = world();
    const g = guarded(w);
    expect(Reflect.set(g, 'turn', () => 1)).toBe(false);
    expect(Reflect.set(g, 'extra', 1)).toBe(false);
    expect(Reflect.deleteProperty(g, 'turn')).toBe(false);
    expect(Object.isFrozen(g)).toBe(true);
  });
  it('every non-journaled member still works through the guard, bound to the io', async () => {
    w = world();
    const g = guarded(w);
    expect(g.alive()).toBe(true);
    await expect(g.health()).resolves.toBeDefined();
    const seen: unknown[] = [];
    const io: any = { alive() { seen.push(this); return true; }, health: () => Promise.resolve('h') };
    const dest = (await import('../data')).withFixtureDest(io, slot.computer);
    const g2 = guardIO(dest, { acct: ACCOUNT, container: slot.computer }) as any;
    expect(g2.alive()).toBe(true);
    expect(seen[0], 'bound to the io, not to the guard').toBe(io);
  });
});
