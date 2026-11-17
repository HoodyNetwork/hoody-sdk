import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountdown } from './words';

// The 429 wait: seconds left, read from the clock at each render, a tick a second only while a wait is set.
const T0 = new Date('2026-10-31T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

function run(initial: number | null) {
  const seen: number[] = [];
  const hook = renderHook(
    ({ until }: { until: number | null }) => {
      const left = useCountdown(until);
      seen.push(left);
      return left;
    },
    { initialProps: { until: initial } },
  );
  return { ...hook, seen };
}

describe('useCountdown', () => {
  it('no wait: 0, and no timer runs', () => {
    const { result } = run(null);
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('counts the seconds down once a second and stops at 0, never below', () => {
    const { result } = run(T0 + 5000);
    expect(result.current).toBe(5);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(4);
    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current).toBe(1);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(0);
    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('a part of a second left counts as the whole second: 500 ms shows 1, 1500 ms shows 2', () => {
    expect(run(T0 + 500).result.current).toBe(1);
    expect(run(T0 + 1500).result.current).toBe(2);
    expect(run(T0 + 1).result.current).toBe(1);
  });

  it('a later deadline set while a wait runs shows its own seconds at once, not on the next tick', () => {
    const { result, rerender } = run(T0 + 5000);
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current).toBe(3);
    vi.setSystemTime(T0 + 2500);
    rerender({ until: T0 + 2500 + 10_000 });
    expect(result.current).toBe(10);
  });

  it('a wait set long after the last render counts from now: no frame reads the old time', () => {
    const { result, rerender, seen } = run(null);
    vi.setSystemTime(T0 + 60_000);
    seen.length = 0;
    rerender({ until: T0 + 60_000 + 8000 });
    expect(result.current).toBe(8);
    expect(seen.every((s) => s <= 8)).toBe(true);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(7);
  });

  it('the clock moved back: a new deadline shows its full seconds at once', () => {
    const { result, rerender } = run(T0 + 5000);
    act(() => void vi.advanceTimersByTime(2000));
    vi.setSystemTime(T0 + 500);
    rerender({ until: T0 + 500 + 10_000 });
    expect(result.current).toBe(10);
  });

  it('the wait cleared: 0 and the timer is gone; an unmount leaves none either', () => {
    const { result, rerender, unmount } = run(T0 + 5000);
    expect(vi.getTimerCount()).toBe(1);
    rerender({ until: null });
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    rerender({ until: T0 + 9000 });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
