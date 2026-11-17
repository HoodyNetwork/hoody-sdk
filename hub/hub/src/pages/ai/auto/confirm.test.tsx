// Vitest: the shared confirm binding (confirm.ts) on its own, with no
// page around it, so each of its guards is pinned by itself: the deadline timer discards an open confirm with no other
// render, and take() at the press rechecks the deadline and needs the identity read.
import { act, renderHook } from '@app/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoundConfirm, useDeadlines } from './confirm';

type A = 'approve';

function mount(o: { identify?: () => Promise<string | null>; clock?: { t: number } } = {}) {
  const clock = o.clock ?? { t: 1_000 };
  const identify = vi.fn(o.identify ?? (() => Promise.resolve('proposal\np1\n0')));
  const h = renderHook(() =>
    useBoundConfirm<A>({ target: 'todo_a', offered: () => true, identify, now: () => clock.t }),
  );
  return { h, clock, identify };
}

// As a press does: the open renders before its identity read answers (act flushes the render, then the read settles).
async function opened(open: () => void) {
  act(open);
  await act(async () => {});
}

describe('useBoundConfirm', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('discards an open confirm when its deadline passes, with no other render', async () => {
    const { h, clock } = mount();
    await opened(() => h.result.current.open('approve', 'p1', 2_000));
    expect(h.result.current.ask?.ident).toBe('proposal\np1\n0');
    clock.t = 2_001;
    await act(async () => {
      vi.advanceTimersByTime(1_100);
    });
    expect(h.result.current.ask).toBeNull();
    expect(h.result.current.changed).toBe(true);
  });

  it('take() refuses a confirm whose deadline passed before any render saw it', async () => {
    const { h, clock } = mount();
    await opened(() => h.result.current.open('approve', 'p1', 2_000));
    expect(h.result.current.ask).not.toBeNull();
    clock.t = 2_000;
    let taken: unknown = 'unset';
    act(() => {
      taken = h.result.current.take();
    });
    expect(taken).toBeNull();
    expect(h.result.current.changed).toBe(true);
  });

  it('take() refuses a confirm whose identity read has not answered', async () => {
    const { h } = mount({ identify: () => new Promise<string | null>(() => {}) });
    await opened(() => h.result.current.open('approve', 'p1', null));
    expect(h.result.current.reading).toBe(true);
    let taken: unknown = 'unset';
    act(() => {
      taken = h.result.current.take();
    });
    expect(taken).toBeNull();
  });

  it('take() hands back the confirm with the identity read at the open', async () => {
    const { h } = mount();
    await opened(() => h.result.current.open('approve', 'p1', 5_000));
    let taken: { ident: string | null } | null = null;
    act(() => {
      taken = h.result.current.take();
    });
    expect(taken).toMatchObject({ action: 'approve', pid: 'p1', target: 'todo_a', ident: 'proposal\np1\n0' });
  });
});

describe('useBoundConfirm: a read that answers late belongs to its own open only', () => {
  // Reads the test answers by hand, in the order and batch it chooses.
  function deferred() {
    const q: Array<(v: string | null) => void> = [];
    const identify = () => new Promise<string | null>((r) => q.push(r));
    return { identify, answer: (i: number, v: string | null) => q[i]!(v) };
  }
  function mountD() {
    const d = deferred();
    const h = renderHook(() => useBoundConfirm<'pause' | 'delete'>({ target: 'loop_a', offered: () => true, identify: d.identify }));
    return { h, d };
  }

  it('a close in the same batch as its read keeps it closed', async () => {
    const { h, d } = mountD();
    act(() => h.result.current.open('delete'));
    await act(async () => {
      h.result.current.close();
      d.answer(0, 'loop\nloop_a\ndelete');
    });
    expect(h.result.current.ask).toBeNull();
    let taken: unknown = 'unset';
    act(() => {
      taken = h.result.current.take();
    });
    expect(taken).toBeNull();
  });

  it('a take() that found no identity is not undone by the read answering after it', async () => {
    const { h, d } = mountD();
    act(() => h.result.current.open('delete'));
    let first: unknown = 'unset';
    await act(async () => {
      first = h.result.current.take();
      d.answer(0, 'loop\nloop_a\ndelete');
    });
    expect(first).toBeNull();
    expect(h.result.current.ask).toBeNull();
  });

  it('two presses before a render send once', async () => {
    const { h, d } = mountD();
    act(() => h.result.current.open('delete'));
    await act(async () => d.answer(0, 'loop\nloop_a\ndelete'));
    const got: unknown[] = [];
    act(() => {
      got.push(h.result.current.take(), h.result.current.take());
    });
    expect(got[0]).toMatchObject({ action: 'delete', ident: 'loop\nloop_a\ndelete' });
    expect(got[1]).toBeNull();
  });

  it('a read that answers before the open has rendered still binds it', async () => {
    const h = renderHook(() =>
      useBoundConfirm<'pause'>({ target: 'loop_a', offered: () => true, identify: () => Promise.resolve('loop\nloop_a\npause') }),
    );
    await act(async () => h.result.current.open('pause'));
    expect(h.result.current.reading).toBe(false);
    expect(h.result.current.ask?.ident).toBe('loop\nloop_a\npause');
  });

  it("an earlier open's read never fills a newer open", async () => {
    const { h, d } = mountD();
    act(() => h.result.current.open('delete'));
    act(() => h.result.current.open('pause'));
    await act(async () => d.answer(0, 'loop\nloop_a\ndelete'));
    expect(h.result.current.ask).toMatchObject({ action: 'pause', ident: null });
    await act(async () => d.answer(1, 'loop\nloop_a\npause'));
    expect(h.result.current.ask).toMatchObject({ action: 'pause', ident: 'loop\nloop_a\npause' });
  });
});

describe('useDeadlines', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders again once the earliest deadline ahead passes', async () => {
    const clock = { t: 1_000 };
    let renders = 0;
    renderHook(() => {
      renders += 1;
      useDeadlines([3_000, 2_000, Number.NaN], () => clock.t);
    });
    const before = renders;
    clock.t = 2_001;
    await act(async () => {
      vi.advanceTimersByTime(1_100);
    });
    expect(renders).toBeGreaterThan(before);
  });
});
