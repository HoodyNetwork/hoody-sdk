// Vitest: the shared "a new link may still be propagating" piece. A link is fresh for about a
// minute after the server's created time; the row note goes away by itself when that minute ends, with no reload.
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFresh, PROPAGATION_MS, PropagatingNote } from './Propagating';
import strings from './Propagating.strings.en.json';

const AT = '2026-10-25T08:00:00.000Z';
const t0 = Date.parse(AT);
afterEach(() => vi.useRealTimers());

describe('isFresh', () => {
  it('is fresh for about a minute after the server created time, then not', () => {
    expect(isFresh(AT, t0)).toBe(true);
    expect(isFresh(AT, t0 + PROPAGATION_MS - 1)).toBe(true);
    expect(isFresh(AT, t0 + PROPAGATION_MS)).toBe(false);
    expect(isFresh(AT, t0 + 3600_000)).toBe(false);
  });
  it('a created time a little ahead of this clock (clock skew) still counts; far ahead, empty or unreadable does not', () => {
    expect(isFresh(AT, t0 - 30_000)).toBe(true);
    expect(isFresh(AT, t0 - PROPAGATION_MS + 1)).toBe(true);
    expect(isFresh(AT, t0 - PROPAGATION_MS)).toBe(false);
    for (const v of ['', null, undefined, 'soon']) expect(isFresh(v, t0)).toBe(false);
  });
});

describe('PropagatingNote', () => {
  it('row: shows while fresh and goes away by itself when the minute ends', async () => {
    vi.useFakeTimers({ now: t0 + 10_000 });
    render(<PropagatingNote createdAt={AT} />);
    expect(screen.getByText(strings['propagating.row'])).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROPAGATION_MS - 10_000 + 50);
    });
    expect(screen.queryByText(strings['propagating.row'])).toBeNull();
  });
  it('row: a clock moved back before the minute ends waits again, then the note still goes away', async () => {
    vi.useFakeTimers({ now: t0 + 10_000 });
    render(<PropagatingNote createdAt={AT} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
      vi.setSystemTime(t0 + 5_000);
      await vi.advanceTimersByTimeAsync(30_050);
    });
    expect(screen.getByText(strings['propagating.row'])).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROPAGATION_MS);
    });
    expect(screen.queryByText(strings['propagating.row'])).toBeNull();
  });
  it('row: unmounting clears its timer', () => {
    vi.useFakeTimers({ now: t0 + 10_000 });
    const { unmount } = render(<PropagatingNote createdAt={AT} />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('row: a new created time replaces the timer', () => {
    vi.useFakeTimers({ now: t0 + 10_000 });
    const { rerender } = render(<PropagatingNote createdAt={AT} />);
    rerender(<PropagatingNote createdAt={new Date(t0 + 5_000).toISOString()} />);
    expect(vi.getTimerCount()).toBe(1);
  });
  it('row: an old link shows nothing', () => {
    vi.useFakeTimers({ now: t0 + 5 * 60_000 });
    const { container } = render(<PropagatingNote createdAt={AT} />);
    expect(container.textContent).toBe('');
  });
  it('created: the create confirmation always says it can take about a minute', () => {
    render(<PropagatingNote variant="created" />);
    expect(screen.getByText(strings['propagating.created'])).toBeInTheDocument();
  });
});
