// Vitest: the coverage notice's grace, on fake timers. A gap that is only a read in flight shows
// after exactly PENDING_NOTE_MS; each new pending read starts its own grace; a known gap (answered, or offline) shows at once.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_NOTE_MS, useGapShown } from './ChatList';
import { settled, type Source } from './coverage.logic';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
type P = { gap: boolean; known: boolean; read?: string };
const hook = (gap: boolean, known: boolean, read = 'a') =>
  renderHook((p: P) => useGapShown(p.gap, p.known, p.read ?? 'a'), { initialProps: { gap, known, read } as P });

describe('useGapShown', () => {
  it('the grace is 1.5 s', () => { expect(PENDING_NOTE_MS).toBe(1500); });

  it('a pending gap: nothing at 1.49 s, the notice at 1.5 s', () => {
    const h = hook(true, false);
    expect(h.result.current).toBe(false);
    tick(1490);
    expect(h.result.current).toBe(false);
    tick(10);
    expect(h.result.current).toBe(true);
  });

  it('a known gap shows at once', () => {
    expect(hook(true, true).result.current).toBe(true);
  });

  it('no gap never shows', () => {
    const h = hook(false, false);
    tick(PENDING_NOTE_MS * 4);
    expect(h.result.current).toBe(false);
  });

  it('the grace restarts on each new pending read: an earlier read never carries its timer over', () => {
    const h = hook(true, false);
    tick(1000);
    h.rerender({ gap: false, known: true }); // the read answered: whole
    expect(h.result.current).toBe(false);
    h.rerender({ gap: true, known: false }); // a new read in flight
    tick(1000); // 2 s since the first read, 1 s since this one
    expect(h.result.current).toBe(false);
    tick(490);
    expect(h.result.current).toBe(false);
    tick(10);
    expect(h.result.current).toBe(true);
  });

  it('a notice shown for an earlier read is not carried over: the next read in flight gets its own grace', () => {
    const h = hook(true, false);
    tick(PENDING_NOTE_MS);
    expect(h.result.current).toBe(true);
    h.rerender({ gap: false, known: true }); // the stuck read answered: whole
    expect(h.result.current).toBe(false);
    h.rerender({ gap: true, known: false }); // a scope switch or refresh: a new read in flight
    expect(h.result.current).toBe(false);
    tick(1490);
    expect(h.result.current).toBe(false);
    tick(10);
    expect(h.result.current).toBe(true);
  });

  it('a new read started while the earlier one is still out gets its own grace (no gap-free render between)', () => {
    const h = hook(true, false, 'atlas|realm-1');
    tick(1000);
    h.rerender({ gap: true, known: false, read: 'atlas|realm-2' }); // a realm change: the earlier read never answered
    tick(1000); // 2 s since the first read, 1 s since this one
    expect(h.result.current).toBe(false);
    tick(490);
    expect(h.result.current).toBe(false);
    tick(10);
    expect(h.result.current).toBe(true);
  });

  it('a line shown for an earlier read is not carried to a new one still out', () => {
    const h = hook(true, false, 'all|realm-1');
    tick(PENDING_NOTE_MS);
    expect(h.result.current).toBe(true);
    h.rerender({ gap: true, known: false, read: 'all|realm-2' });
    expect(h.result.current).toBe(false);
    tick(1490);
    expect(h.result.current).toBe(false);
    tick(10);
    expect(h.result.current).toBe(true);
  });

  it('once shown it stays while the gap does, a refresh in it included', () => {
    const h = hook(true, true);
    h.rerender({ gap: true, known: false });
    expect(h.result.current).toBe(true);
    h.rerender({ gap: false, known: true });
    expect(h.result.current).toBe(false);
  });
});

describe('settled: offline is known at once', () => {
  const s = (kind: Source['kind'], state: Source['state']): Source => ({ kind, computer: '', state });
  it('a read in flight is not known', () => { expect(settled([s('sessions', 'pending')])).toBe(false); });
  it('offline is known, even with reads paused', () => {
    expect(settled([s('sessions', 'pending'), s('network', 'pending')])).toBe(true);
  });
  it('a feed not live is a read in flight, not offline', () => {
    expect(settled([s('feed', 'pending')])).toBe(false);
  });
});
