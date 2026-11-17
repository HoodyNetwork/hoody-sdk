// Vitest: the Schedules Try again on a computer list not known owns only its own read (parts/listRetry).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useListRetry } from './parts/listRetry';

type Read = 'loading' | 'unknown' | undefined;
const hook = (read: Read) => renderHook(({ r }: { r: Read }) => useListRetry(r), { initialProps: { r: read } });

describe('schedules: the list Try again', () => {
  it('owns the loading its press started, and ends when that read ends', () => {
    const h = hook('unknown');
    act(() => h.result.current.retry(vi.fn()));
    h.rerender({ r: 'loading' });
    expect(h.result.current.askedAgain).toBe(true);
    h.rerender({ r: 'unknown' });
    expect(h.result.current.askedAgain).toBe(false);
  });

  it('a retry that fails before any loading render leaves nothing owned for a later read', async () => {
    const h = hook('unknown');
    await act(async () => { h.result.current.retry(() => Promise.resolve()); });
    h.rerender({ r: 'loading' });
    expect(h.result.current.askedAgain).toBe(false);
  });

  it('a promise settling while its loading still shows leaves the end to that read', async () => {
    let done!: () => void;
    const h = hook('unknown');
    act(() => h.result.current.retry(() => new Promise<void>((r) => { done = r; })));
    h.rerender({ r: 'loading' });
    await act(async () => { done(); });
    expect(h.result.current.askedAgain).toBe(true);
    h.rerender({ r: 'unknown' });
    expect(h.result.current.askedAgain).toBe(false);
  });

  it('an older attempt settling late does not end a newer one', async () => {
    let first!: () => void;
    const h = hook('unknown');
    act(() => h.result.current.retry(() => new Promise<void>((r) => { first = r; })));
    act(() => h.result.current.retry(() => new Promise<void>(() => {})));
    await act(async () => { first(); });
    h.rerender({ r: 'loading' });
    expect(h.result.current.askedAgain).toBe(true);
  });
});
