import { act, renderHook } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNow } from './useNow';

// One clock for every page that shows a running time: it ticks only while `on`, refreshes at once when turned on, and leaves nothing behind.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const T0 = new Date('2026-10-31T12:00:00Z').getTime();

describe('useNow', () => {
  it('ticks every second by default while on', () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(T0);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(T0 + 1000);
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current).toBe(T0 + 3000);
  });

  it('ticks at the period it is given, and only then', () => {
    const { result } = renderHook(() => useNow(true, 60_000));
    act(() => void vi.advanceTimersByTime(59_999));
    expect(result.current).toBe(T0);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(T0 + 60_000);
  });

  it('sets no timer while off, and the value it gives is the time at render', () => {
    const { result, rerender } = renderHook(({ on }) => useNow(on), { initialProps: { on: false } });
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(T0 + 5000);
    rerender({ on: false });
    expect(result.current).toBe(T0 + 5000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('turned on, it shows the time at once (not the time it was last on) and then ticks', () => {
    const { result, rerender } = renderHook(({ on }) => useNow(on), { initialProps: { on: true } });
    act(() => void vi.advanceTimersByTime(1000));
    rerender({ on: false });
    vi.setSystemTime(T0 + 600_000);
    rerender({ on: true });
    expect(result.current).toBe(T0 + 600_000);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(T0 + 601_000);
  });

  it('no render after turning on shows a stored older time: off for 60 s, then on, the first frame is already the time now', () => {
    const seen: number[] = [];
    const { rerender } = renderHook(
      ({ on }) => {
        const v = useNow(on);
        // What was committed (drawn), not every call: React re-runs a render that set state while rendering, and throws the first result away.
        useLayoutEffect(() => void seen.push(v));
        return v;
      },
      { initialProps: { on: true } },
    );
    rerender({ on: false });
    vi.setSystemTime(T0 + 60_000);
    seen.length = 0;
    rerender({ on: true });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((v) => v === T0 + 60_000)).toBe(true);
  });

  it('mounted off, then turned on: the first drawn frame is already the time now, not the time of the mount', () => {
    const seen: number[] = [];
    const { rerender } = renderHook(
      ({ on }) => {
        const v = useNow(on);
        useLayoutEffect(() => void seen.push(v));
        return v;
      },
      { initialProps: { on: false } },
    );
    vi.setSystemTime(T0 + 60_000);
    seen.length = 0;
    rerender({ on: true });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((v) => v === T0 + 60_000)).toBe(true);
  });

  it('every turn-on is fresh, not only the first: on, off, on, off, on with the clock moving while off', () => {
    const seen: number[] = [];
    const { rerender } = renderHook(
      ({ on }) => {
        const v = useNow(on);
        useLayoutEffect(() => void seen.push(v));
        return v;
      },
      { initialProps: { on: true } },
    );
    const turnOn = (at: number) => {
      rerender({ on: false });
      vi.setSystemTime(at);
      seen.length = 0;
      rerender({ on: true });
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((v) => v === at)).toBe(true);
    };
    turnOn(T0 + 60_000);
    turnOn(T0 + 90_000);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('staying on does not jump: a re-render between ticks keeps the value, it moves only on a tick', () => {
    const { result, rerender } = renderHook(({ on }) => useNow(on), { initialProps: { on: true } });
    vi.setSystemTime(T0 + 400);
    rerender({ on: true });
    expect(result.current).toBe(T0);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(T0 + 1400);
  });

  it('stops its timer when turned off and when unmounted', () => {
    const { rerender, unmount } = renderHook(({ on }) => useNow(on), { initialProps: { on: true } });
    expect(vi.getTimerCount()).toBe(1);
    rerender({ on: false });
    expect(vi.getTimerCount()).toBe(0);
    rerender({ on: true });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a new period while on refreshes the time at once, then ticks at the new period', () => {
    const { result, rerender } = renderHook(({ ms }) => useNow(true, ms), { initialProps: { ms: 1000 } });
    act(() => void vi.advanceTimersByTime(1000));
    vi.setSystemTime(T0 + 31_000);
    rerender({ ms: 5000 });
    expect(result.current).toBe(T0 + 31_000);
    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current).toBe(T0 + 36_000);
  });

  it('a new period replaces the old timer, never adds one, and is the one that ticks', () => {
    const { result, rerender } = renderHook(({ ms }) => useNow(true, ms), { initialProps: { ms: 1000 } });
    rerender({ ms: 5000 });
    expect(vi.getTimerCount()).toBe(1);
    const before = result.current;
    act(() => void vi.advanceTimersByTime(4999));
    expect(result.current).toBe(before);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(before + 5000);
  });
});
