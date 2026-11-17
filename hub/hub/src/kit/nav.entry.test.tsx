// Vitest: useLocationEntry gives the history entry the location is, by its key: the
// router's own key first, the history's plain key when that is all there is, '' when there is neither. Like every part
// of the location, a page reads it from its own last location while that is not the live one (PageNavHold).
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const live = vi.hoisted(() => ({ location: { pathname: '/board', state: {} as Record<string, unknown> } }));
vi.mock('@tanstack/react-router', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@tanstack/react-router')),
  useNavigate: () => () => {},
  useRouterState: (o: { select: (s: typeof live) => unknown }) => o.select(live),
}));

import { PageNavHoldContext, type PageNavHold, useLocationEntry } from './nav';

const at = (state: Record<string, unknown>, pathname = '/board') => {
  live.location = { pathname, state };
  return renderHook(() => useLocationEntry()).result.current;
};

describe('useLocationEntry', () => {
  it("reads the router's entry key, ahead of the history's plain key", () => {
    expect(at({ __TSR_key: 'k1', key: 'h1' })).toBe('k1');
  });

  it("falls back to the history's plain key", () => {
    expect(at({ key: 'h2' })).toBe('h2');
  });

  it("is '' when the history gives no key (no state, or a state without one)", () => {
    expect(at({})).toBe('');
    live.location = { pathname: '/board', state: undefined as never };
    expect(renderHook(() => useLocationEntry()).result.current).toBe('');
  });

  it("a page whose hold does not own the live location reads its own last location's key; owning, the live one", () => {
    live.location = { pathname: '/files', state: { __TSR_key: 'files-entry' } };
    const mine = { pathname: '/board', state: { __TSR_key: 'board-entry' } };
    const hold = (owns: boolean): PageNavHold => ({ location: mine as never, owns: () => owns, hidden: () => !owns });
    const wrap = (owns: boolean) => ({ children }: { children: ReactNode }) => <PageNavHoldContext value={hold(owns)}>{children}</PageNavHoldContext>;
    expect(renderHook(() => useLocationEntry(), { wrapper: wrap(false) }).result.current).toBe('board-entry');
    expect(renderHook(() => useLocationEntry(), { wrapper: wrap(true) }).result.current).toBe('files-entry');
  });
});
