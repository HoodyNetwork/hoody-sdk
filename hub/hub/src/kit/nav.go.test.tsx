// Vitest: useGo and useSearchParam hand the router the same scroll option. keepScroll keeps every scroller where it is
// (a jump started right before the navigation is not cancelled by the router's scroll restore); without it nothing changes.
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@tanstack/react-router')),
  useNavigate: () => navigate,
  useRouterState: () => undefined,
}));

import { useGo, useSearchParam } from './nav';

beforeEach(() => navigate.mockClear());

describe('useGo', () => {
  it('keepScroll turns the router scroll reset off', () => {
    const { result } = renderHook(() => useGo());
    result.current('/guide#build', { replace: true, keepScroll: true });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ href: '/guide#build', replace: true, resetScroll: false });
  });

  it('without keepScroll the router keeps its default (the option is left unset)', () => {
    const { result } = renderHook(() => useGo());
    result.current('/bots?sel=x');
    result.current('/bots?sel=y', { replace: true });
    expect(navigate.mock.calls[0]?.[0]).toEqual({ href: '/bots?sel=x', replace: false, resetScroll: undefined });
    expect(navigate.mock.calls[1]?.[0]).toEqual({ href: '/bots?sel=y', replace: true, resetScroll: undefined });
  });
});

describe('useSearchParam', () => {
  it('passes the same scroll option as useGo', () => {
    const { result } = renderHook(() => useSearchParam('tab'));
    result.current[1]('apps', { keepScroll: true });
    result.current[1]('work');
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({ resetScroll: false });
    expect(navigate.mock.calls[1]?.[0]).toMatchObject({ resetScroll: undefined });
  });
});
