// dispose.ts: resetChanges stops what the outgoing session's changes still run on timers: the sending heartbeats and
// the stale re-read; a renewal already queued for the store lock does nothing after it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANGE_STORE_KEY, readChanges, SENDING_HEARTBEAT_MS, SENDING_STALE_MS, writeChanges } from './change-store';
import { guarded, resetChanges } from './changes';
import { boot, R1 } from './test/env';

const META = { base: 'lock:computer.lifecycle', target: { project: { id: 'p1' }, container: { id: 'c1' } }, realm: R1, identity: { computer: 'c1' }, by: 'q:lifecycle@computer.lifecycle' };
const outs: Array<() => void> = [];
const held = () => {
  let open: (v: { outcome: 'pending'; idem: string }) => void = () => {};
  const p = new Promise<{ outcome: 'pending'; idem: string }>((r) => { open = r; });
  outs.push(() => { open({ outcome: 'pending', idem: 'K' }); });
  return () => p;
};
const stampOf = () => readChanges()!.find((r) => r.id.endsWith('s\u0000d'))!.sending!;
afterEach(async () => { vi.useRealTimers(); for (const o of outs.splice(0)) o(); for (let i = 0; i < 50; i++) await Promise.resolve(); });

describe('resetChanges stops the timers of the outgoing session', () => {
  it('the sending heartbeat: the stamp of a send still out is not renewed after a reset', async () => {
    vi.useFakeTimers({ now: 50_000 });
    boot({ realm: R1 });
    void guarded('s', 'd', held(), META);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    const first = stampOf().at;
    const timers = vi.getTimerCount();
    resetChanges();
    expect(vi.getTimerCount()).toBeLessThan(timers); // the heartbeat interval is gone
    await vi.advanceTimersByTimeAsync(SENDING_STALE_MS + 2 * SENDING_HEARTBEAT_MS);
    expect(stampOf().at).toBe(first);
  });
  it('a renewal already waiting for the store lock does nothing once the session is reset', async () => {
    vi.useFakeTimers({ now: 50_000 });
    boot({ realm: R1 });
    void guarded('s', 'd', held(), META);
    await vi.advanceTimersByTimeAsync(0);
    const first = stampOf().at;
    // Another holder keeps the store lock, so the beat's turn queues behind it.
    let free!: () => void;
    const locks = (globalThis.navigator as unknown as { locks: { request: (n: string, cb: () => unknown) => Promise<unknown> } }).locks;
    void locks.request('hub_changes', () => new Promise<void>((r) => { free = r; }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(SENDING_HEARTBEAT_MS + 10); // the beat fires and queues
    resetChanges();
    free();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 50; i++) await Promise.resolve();
    expect(stampOf().at).toBe(first);
  });
  it('the stale re-read timer is cancelled', async () => {
    vi.useFakeTimers({ now: 50_000 });
    boot({ realm: R1 });
    void guarded('s', 'd', held(), META);
    await vi.advanceTimersByTimeAsync(0);
    const rec = readChanges()![0]!;
    // Another tab's stamp is stored: this tab reads it and arms one re-read at its expiry.
    writeChanges([{ ...rec, sending: { ...rec.sending!, tab: 'another-tab' }, t: rec.t + 1 }]);
    resetChanges();
    window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
    await vi.advanceTimersByTimeAsync(0);
    const armed = vi.getTimerCount();
    expect(armed).toBeGreaterThan(0);
    resetChanges();
    expect(vi.getTimerCount()).toBeLessThan(armed);
  });
});
