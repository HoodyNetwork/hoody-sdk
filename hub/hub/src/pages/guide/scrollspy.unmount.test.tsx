// Vitest (including StrictMode): a jump re-reads the section once its scroll lock ends, on a timer. That timer
// belongs to the Guide while it is shown: a new jump replaces it, and leaving the page clears it, so no read runs
// after unmount (in a test run, after the environment is gone).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@app/testing';
import { useScrollSpy } from './parts/useScrollSpy';
import type { SectionId } from './logic';

const ORDER: readonly SectionId[] = ['ask', 'connect'];

beforeEach(() => {
  vi.useFakeTimers();
  for (const id of ORDER) {
    const el = document.createElement('section');
    el.id = `guide-${id}`;
    el.innerHTML = `<h2 tabindex="-1">${id}</h2>`;
    document.body.append(el);
  }
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('Guide scroll spy: the re-read after a jump', () => {
  it('runs nothing once the Guide is gone', () => {
    const { result, unmount } = renderHook(() => useScrollSpy(ORDER));
    act(() => result.current[1]('connect'));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    const reads = vi.spyOn(document, 'getElementById');
    vi.advanceTimersByTime(5_000);
    expect(reads).not.toHaveBeenCalled();
  });

  it('keeps one pending re-read for quick jumps, and it still runs while the Guide is shown', () => {
    const { result } = renderHook(() => useScrollSpy(ORDER));
    act(() => result.current[1]('connect'));
    act(() => { vi.advanceTimersByTime(300); });
    act(() => result.current[1]('ask'));
    expect(vi.getTimerCount()).toBe(1);
    const reads = vi.spyOn(document, 'getElementById');
    act(() => { vi.advanceTimersByTime(5_000); });
    // One read after the last jump's lock: one lookup per section.
    expect(reads).toHaveBeenCalledTimes(ORDER.length);
  });

  // StrictMode mounts, unmounts and mounts the hook again; a #hash arrival (view.tsx) jumps with
  // smooth=false. The re-read still runs once, exactly JUMP_LOCK_MS + 50 (950 ms) after the latest jump.
  it('under StrictMode, a hash arrival re-reads once at 950 ms after the latest jump, and never after unmount', () => {
    const { result, unmount } = renderHook(() => useScrollSpy(ORDER), { reactStrictMode: true });
    const before = document.activeElement;
    act(() => result.current[1]('connect', false));
    expect(result.current[0]).toBe('connect');
    // Arriving by link only scrolls: focus stays where it was.
    expect(document.activeElement).toBe(before);
    act(() => { vi.advanceTimersByTime(400); });
    act(() => result.current[1]('ask', false));
    expect(vi.getTimerCount()).toBe(1);
    const reads = vi.spyOn(document, 'getElementById');
    act(() => { vi.advanceTimersByTime(949); });
    expect(reads).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(reads).toHaveBeenCalledTimes(ORDER.length);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(reads).toHaveBeenCalledTimes(ORDER.length);

    act(() => result.current[1]('connect', false));
    reads.mockClear();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5_000);
    expect(reads).not.toHaveBeenCalled();
  });
});
