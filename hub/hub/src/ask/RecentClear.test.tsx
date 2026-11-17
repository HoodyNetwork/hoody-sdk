// Clear list in the Recent popover: which footer each state shows, that the plan and the confirm are the engine's, and that a
// plan finished after the popover closed does nothing. The engine is a stand-in here; its rules are recent.clear.test.ts's.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useStrings } from '@kit';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLEAR_RECHECK_MS, RecentClear } from './AskPanel';
import type { AskEngine, Snapshot } from './engine';
import type { ClearOutcome, ClearPlan } from './recentClear';
import strings from './strings.en.json';

afterEach(() => cleanup());

const key = (n: number) => ({ k1: 'k' + n, p: 'p', c: 'c', r: 'r', s: 's' + n });
const planOf = (n: number): ClearPlan => ({ account: 'a', slot: { p: 'p', c: 'c', r: 'r' }, gen: 1, keys: Array.from({ length: n }, (_, i) => key(i + 1)) });
function fake(o: Partial<Record<string, any>> = {}) {
  return {
    clearSupport: () => 'ok', clearCandidatesNow: () => 2, planLive: () => true,
    planClear: vi.fn(async () => planOf(2)), clearRecent: vi.fn(async (): Promise<ClearOutcome> => ({ t: 'done', removed: 2 })), verifyClear: vi.fn((): ClearOutcome => ({ t: 'unconfirmed', keys: [] })),
    ...o,
  } as unknown as AskEngine & { planClear: ReturnType<typeof vi.fn>; clearRecent: ReturnType<typeof vi.fn> };
}
// Without `snap`, each render passes a new snapshot (as the engine's publishes do).
function View({ eng, snap = { recent: [] } as unknown as Snapshot }: { eng: AskEngine; snap?: Snapshot }) {
  const t = useStrings(strings);
  return <RecentClear eng={eng} snap={snap} computer="Misty" t={t} />;
}
/** A snapshot with a new Recent array of n rows (the engine publishes a new array on every load and again when the titles arrive). */
const rowsSnap = (n: number, o: { title?: string; ph?: string } = {}) =>
  ({ recent: Array.from({ length: n }, (_, i) => ({ k1: 'k' + i, title: o.title ?? '', at: 0, ph: o.ph ?? 'idle', current: false })) }) as unknown as Snapshot;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('Clear list', () => {
  it('is not offered when the engine cannot clear (no journal)', () => {
    const { container } = render(<View eng={fake({ clearSupport: () => 'no' })} />);
    expect(container.textContent).toBe('');
  });
  it('without Web Locks the entry is disabled and says why', () => {
    render(<View eng={fake({ clearSupport: () => 'noLocks' })} />);
    expect(screen.getByRole('group').textContent).toContain('Clear list');
  });
  it('nothing clearable: the entry is disabled with its reason, and a click plans nothing', async () => {
    const eng = fake({ clearCandidatesNow: () => 0 });
    render(<View eng={eng} />);
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    await flush();
    expect(eng.planClear).not.toHaveBeenCalled();
  });
  it('plan, confirm with the count and the computer, then the done line', async () => {
    const eng = fake();
    render(<View eng={eng} />);
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    await flush();
    expect(eng.planClear).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toMatch(/2/);
    expect(screen.getByRole('status').textContent).toContain('Misty');
    fireEvent.click(screen.getByText('Remove from list'));
    await flush();
    expect(eng.clearRecent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toMatch(/2/);
  });
  it('Cancel at the confirm sends nothing', async () => {
    const eng = fake();
    render(<View eng={eng} />);
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    await flush();
    fireEvent.click(screen.getByText('Cancel'));
    await flush();
    expect(eng.clearRecent).not.toHaveBeenCalled();
    screen.getByText('Clear list…');
  });
  it('a plan with no keys says nothing is clearable instead of asking to confirm', async () => {
    const eng = fake({ planClear: vi.fn(async () => planOf(0)) });
    render(<View eng={eng} />);
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    await flush();
    expect(screen.queryByText('Remove from list')).toBeNull();
  });
  it('a nothing-clearable result holds while the same rows are shown: a new array for them (titles arrived, a reload, another order) plans nothing more', async () => {
    const eng = fake({ planClear: vi.fn(async () => planOf(0)) });
    const { rerender } = render(<View eng={eng} snap={rowsSnap(2)} />);
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    await flush();
    expect(eng.planClear).toHaveBeenCalledTimes(1);
    const reversed = { recent: [...(rowsSnap(2).recent ?? [])].reverse() } as unknown as Snapshot;
    for (const snap of [rowsSnap(2, { title: 'Read the port' }), rowsSnap(2), reversed]) {
      rerender(<View eng={eng} snap={snap} />);
      await flush();
      fireEvent.click(screen.getByText('Clear list…'));
      await flush();
      expect(eng.planClear).toHaveBeenCalledTimes(1);
    }
  });
  it('a nothing-clearable result ends when a shown conversation changes phase: the same rows, read again', async () => {
    const eng = fake({ planClear: vi.fn(async () => planOf(0)) });
    const { rerender } = render(<View eng={eng} snap={rowsSnap(2, { ph: 'running' })} />);
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    await flush();
    rerender(<View eng={eng} snap={rowsSnap(2)} />);
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    await flush();
    expect(eng.planClear).toHaveBeenCalledTimes(2);
  });
  it('a nothing-clearable result ends when Recent shows other rows: Clear is offered again and plans again', async () => {
    const eng = fake({ planClear: vi.fn(async () => planOf(0)) });
    const { rerender } = render(<View eng={eng} snap={rowsSnap(2)} />);
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    await flush();
    expect(eng.planClear).toHaveBeenCalledTimes(1);
    eng.planClear.mockImplementation(async () => planOf(2));
    rerender(<View eng={eng} snap={rowsSnap(3)} />);
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    await flush();
    expect(eng.planClear).toHaveBeenCalledTimes(2);
    screen.getByText('Remove from list');
  });
  it('rows that change while the check reads: its nothing-clearable result does not hold for the new rows', async () => {
    let done!: (p: ClearPlan) => void;
    const eng = fake({ planClear: vi.fn(() => new Promise<ClearPlan>((r) => { done = r; })) });
    const { rerender } = render(<View eng={eng} snap={rowsSnap(2)} />);
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    await flush();
    rerender(<View eng={eng} snap={rowsSnap(3)} />);
    await act(async () => { done(planOf(0)); await Promise.resolve(); });
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    await flush();
    expect(eng.planClear).toHaveBeenCalledTimes(2);
  });
  it('an unconfirmed result offers Check again, and the check runs on the engine', async () => {
    const eng = fake({ clearRecent: vi.fn(async (): Promise<ClearOutcome> => ({ t: 'unconfirmed', keys: [] })), verifyClear: vi.fn((): ClearOutcome => ({ t: 'done', removed: 2 })) });
    render(<View eng={eng} />);
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    await flush();
    fireEvent.click(screen.getByText('Remove from list'));
    await flush();
    fireEvent.click(screen.getByText(/check again/i));
    await flush();
    expect((eng as any).verifyClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/check again/i)).toBeNull();
  });
  it('a plan that finishes after the view went away changes nothing', async () => {
    let done!: (p: ClearPlan) => void;
    const eng = fake({ planClear: vi.fn(() => new Promise<ClearPlan>((r) => { done = r; })) });
    const { unmount } = render(<View eng={eng} />);
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    unmount();
    await act(async () => { done(planOf(2)); await Promise.resolve(); });
    expect(eng.clearRecent).not.toHaveBeenCalled();
  });
  it('a confirm whose plan went stale returns to the entry', async () => {
    let live = true;
    const eng = fake({ planLive: () => live });
    const { rerender } = render(<View eng={eng} />);
    await flush();
    fireEvent.click(screen.getByText('Clear list…'));
    await flush();
    screen.getByText('Remove from list');
    live = false;
    rerender(<View eng={eng} />);
    await flush();
    expect(screen.queryByText('Remove from list')).toBeNull();
  });
  // The checks read state no row shows (a session going idle on its computer, another engine letting go of one),
  // so a held entry with the same rows ends after CLEAR_RECHECK_MS and the checks decide again.
  const later = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); await Promise.resolve(); });
  it('a nothing-clearable result for the same rows ends after the recheck time: a session that went idle meanwhile is offered', async () => {
    vi.useFakeTimers();
    try {
      const eng = fake({ planClear: vi.fn(async () => planOf(0)) });
      const { rerender } = render(<View eng={eng} snap={rowsSnap(2)} />);
      await flush();
      fireEvent.click(screen.getByText('Clear list…'));
      await flush();
      expect(eng.planClear).toHaveBeenCalledTimes(1);
      eng.planClear.mockImplementation(async () => planOf(1));
      // A publish of the same rows partway does not restart the wait.
      await later(CLEAR_RECHECK_MS - 5_000);
      rerender(<View eng={eng} snap={rowsSnap(2, { title: 'Read the port' })} />);
      await flush();
      fireEvent.click(screen.getByText('Clear list…'));
      await flush();
      expect(eng.planClear).toHaveBeenCalledTimes(1);
      await later(5_000);
      fireEvent.click(screen.getByText('Clear list…'));
      await flush();
      expect(eng.planClear).toHaveBeenCalledTimes(2);
      screen.getByText('Remove from list');
    } finally { vi.useRealTimers(); }
  });
  it('cheap checks at zero are read again after the recheck time: another engine letting go of one enables Clear', async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const eng = fake({ clearCandidatesNow: vi.fn(() => n) });
      render(<View eng={eng} />);
      await flush();
      fireEvent.click(screen.getByText('Clear list…'));
      await flush();
      expect(eng.planClear).not.toHaveBeenCalled();
      // Still zero at the first recheck: it stays held and is read again at the next one.
      await later(CLEAR_RECHECK_MS);
      fireEvent.click(screen.getByText('Clear list…'));
      await flush();
      expect(eng.planClear).not.toHaveBeenCalled();
      n = 1;
      await later(CLEAR_RECHECK_MS - 1);
      fireEvent.click(screen.getByText('Clear list…'));
      await flush();
      expect(eng.planClear).not.toHaveBeenCalled();
      await later(1);
      fireEvent.click(screen.getByText('Clear list…'));
      await flush();
      expect(eng.planClear).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('an offered entry sets no recheck: nothing is read again while Clear is available', async () => {
    vi.useFakeTimers();
    try {
      const count = vi.fn(() => 2);
      const eng = fake({ clearCandidatesNow: count });
      const { unmount } = render(<View eng={eng} snap={rowsSnap(2)} />);
      await flush();
      const before = count.mock.calls.length;
      await later(CLEAR_RECHECK_MS * 3);
      expect(count.mock.calls.length).toBe(before);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('a held entry that unmounts leaves no recheck behind', async () => {
    vi.useFakeTimers();
    try {
      const eng = fake({ clearCandidatesNow: () => 0 });
      const { unmount } = render(<View eng={eng} />);
      await flush();
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
