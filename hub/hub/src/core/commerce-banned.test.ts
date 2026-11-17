// The Market ban latch notifies its subscribers on every change, whoever writes it (UpgradeLink hides
// itself the moment the latch is set, without waiting for an unrelated render).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { marketBanned, marketLatch, subscribeMarketBanned } from './commerce';

afterEach(() => { marketLatch.banned = false; });

describe('subscribeMarketBanned', () => {
  it('a change notifies; the same value again does not', () => {
    const fn = vi.fn();
    const off = subscribeMarketBanned(fn);
    marketLatch.banned = true;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(marketBanned()).toBe(true);
    marketLatch.banned = true;
    expect(fn).toHaveBeenCalledTimes(1);
    marketLatch.banned = false;
    expect(fn).toHaveBeenCalledTimes(2);
    expect(marketBanned()).toBe(false);
    off();
    marketLatch.banned = true;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('a listener that throws does not stop the others or the write', () => {
    const bad = subscribeMarketBanned(() => { throw new Error('own'); });
    const fn = vi.fn();
    const off = subscribeMarketBanned(fn);
    marketLatch.banned = true;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(marketLatch.banned).toBe(true);
    bad();
    off();
  });
});
