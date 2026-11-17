// Vitest: a followed link download is read every 2 s for the first minute after it
// began, then every 10 s, judged by the clock when the band draws. Before, the band judged by a moment it
// kept and moved only at the newest download's minute, so a download followed by Check again more than a minute after
// its press, or one left alone when a newer one ended first, stayed at 2 s. Only the speed is under test: the reads
// answer nothing here, so every line stays running. A wall clock set back while the minute timer waits re-arms the timer
// (a clock jump between draws).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@app/testing';
import type * as Files from '../data';
import type * as Data from './data';
import { useLinkLines } from './LinkBand';

const h = vi.hoisted(() => ({ entries: [] as Data.LinkEntry[], reads: [] as { ids: string[]; fast: boolean }[] }));
vi.mock('./data', async (importOriginal) => {
  const m = await importOriginal<typeof Data>();
  return {
    ...m,
    useLinkEntries: () => h.entries,
    useHeldLinks: () => [],
    useFollowed: (_c: unknown, ids: readonly string[], fast: boolean) => { h.reads.push({ ids: [...ids], fast }); return []; },
  };
});

const ATLAS = { id: 'c-atlas', name: 'atlas' } as unknown as Files.FilesComputer;
/** The reads the folder's notice and Transfers share (useLinkLines), drawn alone. */
function LinkBand({ c }: { c: Files.FilesComputer }) { useLinkLines(c); return null; }
const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const followed = (id: string, at: number): Data.LinkEntry => ({ id, computer: ATLAS.id, computerName: 'atlas', folder: '/tmp', filename: `${id}.iso`, state: 'accepted', at });
/** The speed the band asks for now, and for which downloads. */
const last = () => h.reads.at(-1)!;
const at = (ms: number) => act(() => { vi.advanceTimersByTime(T0 + ms - Date.now()); });

beforeEach(() => {
  h.entries = [];
  h.reads = [];
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(T0);
});
afterEach(() => { vi.useRealTimers(); });

describe('Download from link: 2 s for the first minute, then 10 s', () => {
  it('one followed download: fast for its first minute, slow from then on', () => {
    h.entries = [followed('a', T0)];
    render(<LinkBand c={ATLAS} />);
    expect(last()).toEqual({ ids: ['a'], fast: true });
    at(59_000);
    expect(last().fast).toBe(true);
    at(60_000);
    expect(last()).toEqual({ ids: ['a'], fast: false });
    at(200_000);
    expect(last().fast).toBe(false);
  });

  it('followed by Check again 90 s after its press: slow at once, never 2 s', () => {
    // The band draws before the download is followed (its answer was lost; it is held).
    const v = render(<LinkBand c={ATLAS} />);
    at(90_000);
    // Check again found it: it is followed under its press time (data.ts accepted keeps the entry's first moment).
    h.entries = [followed('a', T0)];
    v.rerender(<LinkBand c={ATLAS} />);
    expect(last()).toEqual({ ids: ['a'], fast: false });
    at(200_000);
    expect(last().fast).toBe(false);
  });

  it('a newer download that ends first: the older one still goes slow at its own minute', () => {
    h.entries = [followed('a', T0)];
    const v = render(<LinkBand c={ATLAS} />);
    at(30_000);
    h.entries = [followed('b', T0 + 30_000), followed('a', T0)];
    v.rerender(<LinkBand c={ATLAS} />);
    expect(last()).toEqual({ ids: ['b', 'a'], fast: true });
    // a's minute passes while b keeps the band fast; b ends at 70 s, before its own minute.
    at(70_000);
    expect(last().fast).toBe(true);
    h.entries = [followed('a', T0)];
    v.rerender(<LinkBand c={ATLAS} />);
    expect(last()).toEqual({ ids: ['a'], fast: false });
    at(200_000);
    expect(last().fast).toBe(false);
  });

  it('a newer download that ends before the older one\'s minute: the older one goes slow at that minute', () => {
    h.entries = [followed('a', T0)];
    const v = render(<LinkBand c={ATLAS} />);
    at(30_000);
    h.entries = [followed('b', T0 + 30_000), followed('a', T0)];
    v.rerender(<LinkBand c={ATLAS} />);
    at(40_000);
    h.entries = [followed('a', T0)];
    v.rerender(<LinkBand c={ATLAS} />);
    expect(last().fast).toBe(true);
    at(60_000);
    expect(last()).toEqual({ ids: ['a'], fast: false });
  });

  it('the wall clock set back 30 s while the minute timer waits: still fast at the old deadline, slow at its minute', () => {
    // The timer fires on its own schedule, so it fires while the clock reads 30 s
    // short of the minute; the band must arm again for the rest rather than stay at 2 s until something else draws it.
    h.entries = [followed('a', T0)];
    render(<LinkBand c={ATLAS} />);
    act(() => { vi.advanceTimersByTime(50_000); });
    vi.setSystemTime(T0 + 20_000);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(Date.now()).toBe(T0 + 30_000);
    expect(last().fast).toBe(true);
    act(() => { vi.advanceTimersByTime(29_000); });
    expect(last().fast).toBe(true);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(last()).toEqual({ ids: ['a'], fast: false });
  });
});
