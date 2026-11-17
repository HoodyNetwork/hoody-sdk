// dispose.ts: a send admitted under the store lock when the session is reset before its continuation resumes is not
// sent: no heartbeat, no request, and the stamp its admission stored is taken back. A subscriber of the notice after the
// admission that resets the session ends the press unsent as well.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as changes from './changes';
import type * as store from './change-store';
import type * as env from './test/env';

const hook = vi.hoisted(() => ({ wrote: false, run: null as null | (() => void) }));
vi.mock('./change-store', async (orig) => {
  const real = await orig<typeof store>();
  return {
    ...real,
    writeChanges: (...a: Parameters<typeof real.writeChanges>) => { const r = real.writeChanges(...a); hook.wrote = true; return r; },
    readChangesState: (...a: Parameters<typeof real.readChangesState>) => {
      const r = real.readChangesState(...a);
      if (hook.wrote && hook.run) { const h = hook.run; hook.run = null; h(); } // the admission's read-back: the last thing it does
      return r;
    },
  };
});

// The setup files load core before this file's mock exists: a fresh module graph takes the mocked change store.
let m: { changes: typeof changes; store: typeof store; env: typeof env };
beforeEach(async () => {
  vi.resetModules();
  m = { changes: await import('./changes'), store: await import('./change-store'), env: await import('./test/env') };
});
afterEach(() => { vi.useRealTimers(); hook.wrote = false; hook.run = null; });

describe('a reset between admission and the send', () => {
  it('sends nothing, starts no heartbeat and leaves no sending stamp', async () => {
    vi.useFakeTimers({ now: 50_000 });
    const R1 = m.env.R1;
    m.env.boot({ realm: R1 });
    const META = { base: 'lock:computer.lifecycle', target: { project: { id: 'p1' }, container: { id: 'c1' } }, realm: R1, identity: { computer: 'c1' }, by: 'q:lifecycle@computer.lifecycle' };
    const send = vi.fn(async () => ({ outcome: 'pending' as const, idem: 'K' }));
    let reset = false, shownAfter = 0;
    hook.run = () => { reset = true; m.changes.resetChanges(); };
    const off = m.changes.subscribeChanges(() => { if (reset && m.changes.sendingChanges('lock:computer.lifecycle', { realm: R1 }).length > 0) shownAfter++; });
    const r = await m.changes.guarded('s', 'd', send, META);
    off();
    expect(shownAfter).toBe(0); // no notice shows the outgoing send as out once the session is gone
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 50; i++) await Promise.resolve();
    expect(hook.run).toBeNull(); // the reset happened inside the admission
    expect(send).not.toHaveBeenCalled();
    expect(r).toEqual({ outcome: 'stale' });
    expect(vi.getTimerCount()).toBe(0);
    expect((m.store.readChanges() ?? []).filter((x) => x.sending)).toEqual([]);
    // the ended press left no request marked as out: the next press of the same change is not refused as BUSY
    const next = vi.fn(async () => ({ outcome: 'done' as const }));
    await m.changes.guarded('s', 'd', next, META);
    expect(next).toHaveBeenCalledTimes(1);
  });

  const META = (R1: string) => ({ base: 'lock:computer.lifecycle', target: { project: { id: 'p1' }, container: { id: 'c1' } }, realm: R1, identity: { computer: 'c1' }, by: 'q:lifecycle@computer.lifecycle' });
  const settle = async () => { await vi.advanceTimersByTimeAsync(0); for (let i = 0; i < 50; i++) await Promise.resolve(); };

  it('a press that replays a kept key keeps the key, loses the stamp, and sends nothing', async () => {
    vi.useFakeTimers({ now: 50_000 });
    m.env.boot({ realm: m.env.R1 });
    const meta = META(m.env.R1);
    await m.changes.guarded('s', 'd', async (k) => ({ outcome: 'pending' as const, idem: k ?? 'K' }), meta);
    expect(await m.changes.release('s', 'd', m.changes.holdOfLock('s', 'd')!)).toBe(true); // freed, K kept
    hook.wrote = false;
    const send = vi.fn(async () => ({ outcome: 'pending' as const, idem: 'K' }));
    hook.run = () => { m.changes.resetChanges(); };
    const r = await m.changes.guarded('s', 'd', send, meta);
    await settle();
    expect(hook.run).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(r).toEqual({ outcome: 'stale' });
    expect(vi.getTimerCount()).toBe(0);
    const kept = m.store.readChanges() ?? [];
    expect(kept.filter((x) => x.sending)).toEqual([]);
    expect(kept.map((x) => x.key)).toEqual(['K']); // the key the first send made stays held
  });

  it('a press that minted its key drops it again, and a record left with nothing is deleted', async () => {
    vi.useFakeTimers({ now: 50_000 });
    m.env.boot({ realm: m.env.R1 });
    const send = vi.fn(async () => ({ outcome: 'pending' as const, idem: 'F' }));
    hook.run = () => { m.changes.resetChanges(); };
    const r = await m.changes.guarded('s', 'd', send, META(m.env.R1), undefined, 'F');
    await settle();
    expect(hook.run).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(r).toEqual({ outcome: 'stale' });
    expect(m.store.readChanges() ?? []).toEqual([]);
  });

  it('a subscriber that resets on the notice after the admission: no request, no heartbeat, no stamp', async () => {
    vi.useFakeTimers({ now: 50_000 });
    m.env.boot({ realm: m.env.R1 });
    const meta = META(m.env.R1);
    const send = vi.fn(async () => ({ outcome: 'pending' as const, idem: 'F' }));
    let fired = false, admitted = false;
    hook.run = () => { admitted = true; }; // the admission's read-back is done: the next notice is the one after it
    let shownAfter = 0;
    const off = m.changes.subscribeChanges(() => {
      if (admitted && !fired) { fired = true; m.changes.resetChanges(); }
      else if (fired && m.changes.sendingChanges('lock:computer.lifecycle', { realm: m.env.R1 }).length > 0) shownAfter++;
    });
    const r = await m.changes.guarded('s', 'd', send, meta, undefined, 'F');
    off();
    await settle();
    expect(fired).toBe(true);
    expect(shownAfter).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(r).toEqual({ outcome: 'stale' });
    expect(vi.getTimerCount()).toBe(0);
    expect(m.store.readChanges() ?? []).toEqual([]);
  });
});
