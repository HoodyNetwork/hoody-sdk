// The dock's wake for a rate-limited failure's Retry (DockSession.tsx useRetryWake): at the time, in steps past the longest timer.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TIMER_MS, useRetryWake } from './DockSession';

describe('useRetryWake', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); });
  afterEach(() => { vi.useRealTimers(); });

  it('counts a wake at the time and not before', () => {
    const at = Date.now() + 5000;
    const { result } = renderHook(() => useRetryWake(at));
    act(() => { vi.advanceTimersByTime(4999); });
    expect(result.current, 'woke before the time').toBe(0);
    act(() => { vi.advanceTimersByTime(60); });
    expect(result.current, 'never woke').toBe(1);
  });

  it('waits a time further away than a timer can in steps: no early wake, no immediate firing', () => {
    const far = Date.now() + MAX_TIMER_MS + 100_000;
    const set = vi.spyOn(globalThis, 'setTimeout');
    const { result } = renderHook(() => useRetryWake(far));
    const delays = set.mock.calls.map((c) => Number(c[1] ?? 0));
    expect(delays, 'no timer for the far time').toContain(MAX_TIMER_MS);
    expect(delays.every((d) => d <= MAX_TIMER_MS), 'a delay past what a timer takes').toBe(true);
    act(() => { vi.advanceTimersByTime(MAX_TIMER_MS); });
    expect(result.current, 'woke at the cap, not at the time').toBe(0);
    act(() => { vi.advanceTimersByTime(100_100); });
    expect(result.current, 'never woke at the real time').toBe(1);
  });

  it('nothing waits: no timer', () => {
    const set = vi.spyOn(globalThis, 'setTimeout');
    const { result } = renderHook(() => useRetryWake(null));
    expect(set.mock.calls.map((c) => Number(c[1] ?? 0)).filter((d) => d >= 1000), 'a timer with nothing to wait for').toEqual([]);
    expect(result.current).toBe(0);
  });
});
