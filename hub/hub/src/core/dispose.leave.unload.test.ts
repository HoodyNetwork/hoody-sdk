// dispose.ts: a host unsubscribe that throws leaves its listener inert (each arming has a listener of its own that
// answers only while current), the removal is tried again, and the next hold arms a new listener: it prompts on unload
// whether or not the failed unsubscribe removed anything.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdLeave, resetLeave } from './leave';

const unload = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
afterEach(() => { resetLeave(); vi.restoreAllMocks(); });

describe('resetLeave when the host cannot remove the unload listener', () => {
  it('the prompt that stays registered does nothing with no hold, and the next hold and release still work', () => {
    holdLeave('upload');
    expect(unload()).toBe(true);
    const real = window.removeEventListener.bind(window);
    const err = new Error('cannot remove');
    const rm = vi.spyOn(window, 'removeEventListener').mockImplementation((() => { throw err; }) as typeof window.removeEventListener);
    expect(() => resetLeave()).toThrow(err);
    expect(unload()).toBe(false); // registered still, but no hold: the tab closes freely
    rm.mockImplementation(real as typeof window.removeEventListener);
    const tried = rm.mock.calls.length;
    const release = holdLeave('upload');
    expect(rm.mock.calls.length).toBeGreaterThan(tried); // arming tries the failed removal again
    expect(unload()).toBe(true); // one prompt, not two
    release();
    expect(unload()).toBe(false);
    expect(rm.mock.calls.filter(([n]) => n === 'beforeunload').length).toBeGreaterThanOrEqual(2); // the removal was tried again
    vi.restoreAllMocks();
    // really gone now: another hold arms a fresh one, and its release removes it
    const again = holdLeave('upload');
    expect(unload()).toBe(true);
    again();
    expect(unload()).toBe(false);
  });

  it('an unsubscribe that removes the listener and then throws, on the first call and on the retry, still leaves a later hold prompting', () => {
    holdLeave('upload');
    expect(unload()).toBe(true);
    const real = window.removeEventListener.bind(window);
    let n = 0;
    const rm = vi.spyOn(window, 'removeEventListener').mockImplementation(((...a: Parameters<typeof window.removeEventListener>) => {
      real(...a);
      if (a[0] === 'beforeunload') { n++; throw new Error('removed, then threw'); }
    }) as typeof window.removeEventListener);
    expect(() => resetLeave()).toThrow('removed, then threw');
    expect(unload()).toBe(false);
    const release = holdLeave('upload'); // arming retries the failed removal: it removes nothing more and throws again
    expect(n).toBeGreaterThanOrEqual(2);
    expect(unload()).toBe(true); // a later hold still prompts
    release();
    expect(unload()).toBe(false);
    rm.mockRestore();
    const again = holdLeave('upload');
    expect(unload()).toBe(true);
    again();
    expect(unload()).toBe(false);
  });

  it('a listener the host failed to remove never answers for the holds of a later arming', () => {
    const real = window.removeEventListener.bind(window);
    const noop = vi.spyOn(window, 'removeEventListener').mockImplementation((() => { throw new Error('cannot remove'); }) as typeof window.removeEventListener);
    const first = holdLeave('upload');
    first(); // the last hold ends: the removal throws inside the release, which must not throw
    const second = holdLeave('upload');
    expect(unload()).toBe(true);
    let prevented = 0;
    const e = new Event('beforeunload', { cancelable: true });
    const spy = vi.spyOn(e, 'preventDefault').mockImplementation(() => { prevented++; });
    window.dispatchEvent(e);
    expect(prevented).toBe(1); // one live listener answers, not the dead one too
    second();
    noop.mockImplementation(real as typeof window.removeEventListener);
    spy.mockRestore();
  });
});
