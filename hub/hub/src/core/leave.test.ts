// The leave guard (core/leave.ts). The browser's prompt is armed only while work runs; askLeave asks
// only then, through the shell's asker (none mounted: Stay), and a fault reads as Stay.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { askLeave, holdLeave, leaveCount, onLeaveCount, resetLeave, setLeaveAsker } from './leave';

const releases: Array<() => void> = [];
const hold = () => { const r = holdLeave('upload'); releases.push(r); return r; };
afterEach(() => { while (releases.length) releases.pop()!(); vi.restoreAllMocks(); });
const unload = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };

describe('leave guard', () => {
  it('counts holds; a release ends only its own hold, and releasing twice changes nothing', () => {
    const a = hold(), b = hold();
    expect(leaveCount()).toBe(2);
    a(); a();
    expect(leaveCount()).toBe(1);
    b();
    expect(leaveCount()).toBe(0);
  });

  it('the tab-close prompt is armed only while something runs, and disarmed at zero', () => {
    expect(unload()).toBe(false);
    const add = vi.spyOn(window, 'addEventListener'), rm = vi.spyOn(window, 'removeEventListener');
    const a = hold(), b = hold();
    expect(add.mock.calls.filter(([n]) => n === 'beforeunload')).toHaveLength(1);
    expect(unload()).toBe(true);
    a();
    expect(unload()).toBe(true);
    b();
    expect(rm.mock.calls.filter(([n]) => n === 'beforeunload')).toHaveLength(1);
    expect(unload()).toBe(false);
  });

  it('tells listeners about each change, and stops after unsubscribe', () => {
    const fn = vi.fn();
    const off = onLeaveCount(fn);
    const a = hold();
    a();
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    hold();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('askLeave', () => {
  it('nothing running: goes on without asking anyone', async () => {
    const ask = vi.fn(async () => false);
    const off = setLeaveAsker(ask);
    await expect(askLeave()).resolves.toBe(true);
    expect(ask).not.toHaveBeenCalled();
    off();
    await expect(askLeave()).resolves.toBe(true);
  });

  it('something running: the shell asker decides, with the count; Stay is false', async () => {
    hold(); hold();
    const ask = vi.fn(async () => false);
    const off = setLeaveAsker(ask);
    await expect(askLeave()).resolves.toBe(false);
    expect(ask).toHaveBeenCalledWith(2);
    ask.mockResolvedValueOnce(true);
    await expect(askLeave()).resolves.toBe(true);
    off();
  });

  it('an asker that throws reads as Stay; a stale unregister leaves the current asker in place', async () => {
    hold();
    const offA = setLeaveAsker(async () => { throw new Error('x'); });
    await expect(askLeave()).resolves.toBe(false);
    const b = vi.fn(async () => true);
    const offB = setLeaveAsker(b);
    offA();
    await expect(askLeave()).resolves.toBe(true);
    expect(b).toHaveBeenCalled();
    offB();
  });

  it('no shell asker while something runs: nobody can be asked, so it stays', async () => {
    hold();
    await expect(askLeave()).resolves.toBe(false);
  });

  it('a replaced module (a hot update) keeps the holds and the one prompt listener', async () => {
    const release = hold();
    const add = vi.spyOn(window, 'addEventListener');
    vi.resetModules();
    const fresh = await import('./leave');
    expect(fresh.leaveCount()).toBe(1);
    const other = fresh.holdLeave('copy');
    expect(add).not.toHaveBeenCalledWith('beforeunload', expect.anything());
    release();
    other();
    expect(fresh.leaveCount()).toBe(0);
    expect(leaveCount()).toBe(0);
    expect(unload()).toBe(false);
  });
});

describe('leave guard: the shared state is this layout only', () => {
  it('a state another layout left under the earlier key is neither adopted nor armed or disarmed by this module', async () => {
    const OLD = Symbol.for('hoody.hub.leave');
    const g = globalThis as unknown as Record<symbol, unknown>;
    const stale = { holds: new Map([[1, 'upload']]), listeners: new Set<() => void>(), seq: 1, asker: null, onBeforeUnload: vi.fn() };
    g[OLD] = stale;
    try {
      vi.resetModules();
      const fresh = await import('./leave');
      expect(fresh.leaveCount()).toBe(0);
      const add = vi.spyOn(window, 'addEventListener'), rm = vi.spyOn(window, 'removeEventListener');
      const release = fresh.holdLeave('copy');
      expect(add.mock.calls.filter(([n]) => n === 'beforeunload')).toHaveLength(1);
      expect(stale.holds.size).toBe(1);
      release();
      expect(rm.mock.calls.filter(([n]) => n === 'beforeunload')).toHaveLength(1);
      expect(stale.onBeforeUnload).not.toHaveBeenCalled();
      expect(stale.holds.size).toBe(1);
    } finally {
      Reflect.deleteProperty(g, OLD);
    }
  });
});

describe('resetLeave', () => {
  it('ends every hold, disarms the prompt, drops the asker and tells then clears the count listeners; an old release stays a no-op', async () => {
    const fn = vi.fn();
    onLeaveCount(fn);
    const old = holdLeave('upload');
    holdLeave('copy');
    setLeaveAsker(async () => true);
    fn.mockClear();
    resetLeave();
    expect(leaveCount()).toBe(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(unload()).toBe(false);
    await expect(askLeave()).resolves.toBe(true);
    const next = hold();
    await expect(askLeave()).resolves.toBe(false); // the dropped asker is not asked
    old();
    expect(leaveCount()).toBe(1);
    next();
    expect(fn).toHaveBeenCalledTimes(1); // cleared with the reset: it hears nothing after
  });
});
