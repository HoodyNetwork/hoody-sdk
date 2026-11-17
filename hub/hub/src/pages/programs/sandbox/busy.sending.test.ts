// Another tab's request still out (core sendingChanges), in both directions: while tab A's
// sandbox save of a program is out, tab B's Start/Stop/Restart/boot of that program wait (sandboxBusy); while tab A's
// start, stop, restart or boot of it is out, tab B sends no sandbox save (lifecycleBusy). Another program or another
// computer is never blocked. A send core cannot attribute is tied to no program and blocks none (Programs could show
// it no Check again or Dismiss) and stays listed. Once an attributed send's answer lands, or its stamp expires, the
// row leaves sendingChanges; a pending or unknown outcome is then listed held (heldChanges), which keeps the program
// blocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { programLock } from '@core';
import { CHANGE_STORE_KEY, SENDING_STALE_MS } from '@core/change-store';
import * as C from '@core/changes';
import { boot, R1, TARGET } from '@core/test/env';
import { lifecycleBusy, sandboxBusy } from './busy';
import { SANDBOX_LOCK, sandboxHold } from './data';

const OTHER_COMPUTER = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
const metaOf = (lock: string, identity: Record<string, unknown>) => ({ base: 'lock:' + lock, target: { project: { id: 'p1' }, container: { id: 'c1' } }, realm: R1, identity, by: 'q:test@' + lock });
const outs: Array<() => void> = [];
// Tab A sends and its request stays out until the test answers it; then tab B (a fresh registry on the same storage).
async function outInA(lock: string, identity: Record<string, unknown>, withMeta = true) {
  const meta = withMeta ? metaOf(lock, identity) : undefined;
  let open: (v: { outcome: 'pending'; idem: string }) => void = () => {};
  const p = new Promise<{ outcome: 'pending'; idem: string }>((r) => { open = r; });
  outs.push(() => open({ outcome: 'pending', idem: 'K-after' }));
  const send = vi.fn((_k: string | undefined) => p);
  const done = C.guarded(C.realmScoped(`${lock}|${String(identity.id)}`), 'd', send, meta as never);
  for (let i = 0; i < 20 && !send.mock.calls.length; i++) await Promise.resolve();
  expect(send).toHaveBeenCalledTimes(1);
  C.reloadChangesForTests();
  return { open, done };
}
const announce = () => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));

beforeEach(() => { boot({ realm: R1 }); });
afterEach(async () => { vi.useRealTimers(); for (const o of outs.splice(0)) o(); for (let i = 0; i < 50; i++) await Promise.resolve(); });

describe('another tab\'s sandbox save blocks this tab\'s lifecycle buttons', () => {
  it('the same program on the same computer only', async () => {
    await outInA(SANDBOX_LOCK, { id: '7' });
    expect(C.heldChanges(SANDBOX_LOCK)).toEqual([]);
    expect(sandboxBusy('p', TARGET, 'prog:7', '7')).toBe(true);
    expect(sandboxBusy('p', TARGET, 'prog:8', '8')).toBe(false);
    expect(sandboxBusy('p', OTHER_COMPUTER, 'prog:7', '7')).toBe(false);
  });
});

describe('another tab\'s start, stop, restart or boot blocks this tab\'s sandbox save', () => {
  for (const [act, identity] of [['start', { id: '7', port: null }], ['stop', { id: '7', port: null, all: false }], ['restart', { id: '7', port: 8001, all: false }], ['boot', { id: '7', boot: true }]] as const) {
    it(`${act}: the same program on the same computer only`, async () => {
      await outInA(programLock[act], identity);
      expect(lifecycleBusy(TARGET, undefined, 'prog:7', '7')).toBe(true);
      expect(lifecycleBusy(TARGET, undefined, 'prog:8', '8')).toBe(false);
      expect(lifecycleBusy(OTHER_COMPUTER, undefined, 'prog:7', '7')).toBe(false);
    });
  }
  it('a numeric id on the wire names the same program', async () => {
    await outInA(programLock.restart, { id: 7, port: null, all: false });
    expect(lifecycleBusy(TARGET, undefined, 'prog:7', '7')).toBe(true);
  });
});

describe('a send core cannot attribute', () => {
  // Core keeps a metadata-free record listed, unattributed, in every lock while out, past its stamp and once its
  // answer is pending, and Programs can show no Check again / Dismiss for it (no identity or target): it
  // can be tied to no program, so it blocks none, never every program on every computer.
  it('while out: blocks no program either way', async () => {
    await outInA(SANDBOX_LOCK, { id: '7' }, false);
    expect(C.sendingChanges(SANDBOX_LOCK).some((c) => !c.attributed)).toBe(true);
    expect(sandboxBusy('p', TARGET, 'prog:7', '7')).toBe(false);
    expect(lifecycleBusy(TARGET, undefined, 'prog:7', '7')).toBe(false);
  });
  it('past its stamp, outcome unknown: still blocks nothing', async () => {
    vi.useFakeTimers({ now: 10_000 });
    await outInA(SANDBOX_LOCK, { id: '7' }, false);
    await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 200);
    expect(C.sendingChanges(SANDBOX_LOCK).some((c) => !c.attributed)).toBe(true);
    expect(sandboxBusy('p', TARGET, 'prog:7', '7')).toBe(false);
    expect(lifecycleBusy(TARGET, undefined, 'prog:7', '7')).toBe(false);
  });
  it('answered pending: still listed by core, blocks nothing here', async () => {
    const a = await outInA(programLock.restart, { id: '7', port: null, all: false }, false);
    a.open({ outcome: 'pending', idem: 'KA' });
    await a.done;
    announce();
    expect(C.sendingChanges(SANDBOX_LOCK).some((c) => !c.attributed)).toBe(true);
    expect(sandboxBusy('p', TARGET, 'prog:7', '7')).toBe(false);
    expect(lifecycleBusy(TARGET, undefined, 'prog:7', '7')).toBe(false);
  });
});

describe('an attributed send whose stamp expires', () => {
  it('leaves sending and blocks only as the tied hold, which the page shows with its controls', async () => {
    vi.useFakeTimers({ now: 10_000 });
    await outInA(SANDBOX_LOCK, { id: '7' });
    await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 200);
    announce();
    expect(C.sendingChanges(SANDBOX_LOCK)).toEqual([]);
    // The hold the Sandbox panel and row actions show (Check again / Dismiss: sandboxHold).
    expect(sandboxHold('7', TARGET)).toBeDefined();
    expect(sandboxBusy('p', TARGET, 'prog:7', '7')).toBe(true);
    expect(sandboxBusy('p', TARGET, 'prog:8', '8')).toBe(false);
    expect(lifecycleBusy(TARGET, undefined, 'prog:8', '8')).toBe(false);
  });
});

describe('the answer hands over to the hold', () => {
  it('still busy once A\'s answer lands pending (held), and nothing else becomes busy', async () => {
    const a = await outInA(SANDBOX_LOCK, { id: '7' });
    a.open({ outcome: 'pending', idem: 'KA' });
    await a.done;
    announce();
    expect(C.sendingChanges(SANDBOX_LOCK)).toEqual([]);
    expect(sandboxBusy('p', TARGET, 'prog:7', '7')).toBe(true);
    expect(sandboxBusy('p', TARGET, 'prog:8', '8')).toBe(false);
  });
});
