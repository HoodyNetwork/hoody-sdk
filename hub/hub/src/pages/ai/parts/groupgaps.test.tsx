// Vitest: in All computers each computer's note keeps its own grace.
// A known gap shows at once; a read in flight shows once THAT computer's read has lasted PENDING_NOTE_MS, whatever the
// others do; a shown note keeps its words while its Refresh reads again; a new realm starts every computer again.
import { act, renderHook } from '@app/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComputerGap } from './allChats.logic';
import { PENDING_NOTE_MS, useGroupGapsShown } from './ChatList';

type G = ComputerGap | null;
const reading: G = { kind: 'reading' };
const partial: G = { kind: 'partial' };
const view = (a: G, b: G) => [{ id: 'atlas', gap: a }, { id: 'cinder', gap: b }];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const run = (a: G, b: G, scope = 'r1') => renderHook(({ g, s }) => useGroupGapsShown(g, s), { initialProps: { g: view(a, b), s: scope } });

describe('useGroupGapsShown', () => {
  it('a known gap shows at once; a read in flight only after its grace', () => {
    const h = run(partial, reading);
    expect(h.result.current.get('atlas')).toEqual(partial);
    expect(h.result.current.has('cinder')).toBe(false);
    act(() => vi.advanceTimersByTime(PENDING_NOTE_MS - 100));
    expect(h.result.current.has('cinder')).toBe(false);
    act(() => vi.advanceTimersByTime(200));
    expect(h.result.current.get('cinder')).toEqual(reading);
  });

  it("one computer's long read never lets another's fresh read show early", () => {
    const h = run(reading, null);
    act(() => vi.advanceTimersByTime(PENDING_NOTE_MS + 100));
    expect(h.result.current.has('atlas')).toBe(true);
    h.rerender({ g: view(reading, reading), s: 'r1' });
    expect(h.result.current.has('cinder')).toBe(false);
    act(() => vi.advanceTimersByTime(PENDING_NOTE_MS - 200));
    expect(h.result.current.has('cinder')).toBe(false);
    // cinder's read answers whole inside its grace: it never showed.
    h.rerender({ g: view(reading, null), s: 'r1' });
    act(() => vi.advanceTimersByTime(PENDING_NOTE_MS * 2));
    expect(h.result.current.has('cinder')).toBe(false);
  });

  it("a later read's grace is its own: an earlier one's start does not shorten it", () => {
    const h = run(reading, null);
    act(() => vi.advanceTimersByTime(PENDING_NOTE_MS - 300));
    h.rerender({ g: view(reading, reading), s: 'r1' });
    act(() => vi.advanceTimersByTime(400));
    expect(h.result.current.has('atlas')).toBe(true);
    expect(h.result.current.has('cinder')).toBe(false);
    act(() => vi.advanceTimersByTime(PENDING_NOTE_MS));
    expect(h.result.current.has('cinder')).toBe(true);
  });

  it('a shown note keeps its words while its Refresh reads again, and goes once the read is whole', () => {
    const h = run(partial, null);
    expect(h.result.current.get('atlas')).toEqual(partial);
    h.rerender({ g: view(reading, null), s: 'r1' });
    expect(h.result.current.get('atlas')).toEqual(partial);
    act(() => vi.advanceTimersByTime(PENDING_NOTE_MS * 2));
    expect(h.result.current.get('atlas')).toEqual(partial);
    h.rerender({ g: view(null, null), s: 'r1' });
    expect(h.result.current.has('atlas')).toBe(false);
  });

  it('a new realm starts every computer again', () => {
    const h = run(reading, null);
    act(() => vi.advanceTimersByTime(PENDING_NOTE_MS + 100));
    expect(h.result.current.has('atlas')).toBe(true);
    h.rerender({ g: view(reading, null), s: 'r2' });
    expect(h.result.current.has('atlas')).toBe(false);
    act(() => vi.advanceTimersByTime(PENDING_NOTE_MS + 100));
    expect(h.result.current.has('atlas')).toBe(true);
  });
});
