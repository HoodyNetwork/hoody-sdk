// Vitest: a served page is a destination (followPageLink); only "no link at all" (the page hidden) hides a control.
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlace } from './pagelinks';

const fx = vi.hoisted(() => ({ link: null as { kind: string; href: string } | null, go: vi.fn(), follow: vi.fn() }));

vi.mock('@kit', () => ({
  usePageLink: () => fx.link,
  useGo: () => fx.go,
  followPageLink: (...a: unknown[]) => fx.follow(...a),
}));

beforeEach(() => {
  fx.go.mockReset();
  fx.follow.mockReset();
});

describe('usePlace', () => {
  it('a Hub link goes to the page path', () => {
    fx.link = { kind: 'hub', href: '/computers' };
    const { result } = renderHook(() => usePlace('computers'));
    result.current?.open();
    expect(fx.follow).toHaveBeenCalledWith({ kind: 'hub', href: '/computers/servers' }, fx.go);
  });

  it('the Bare metal servers stay on this page: a Hub market link opens the view in place, never /market', () => {
    // Leaving /billing (the /market route redirects back) would drop the suspension the page holds,
    // so a market link stays on the page.
    fx.link = { kind: 'hub', href: '/market' };
    const { result } = renderHook(() => usePlace('market'));
    expect(result.current?.href).toBe('/billing?view=servers');
    result.current?.open();
    expect(fx.follow).toHaveBeenCalledWith({ kind: 'hub', href: '/billing?view=servers' }, fx.go);
  });

  it('only no link at all hides the control', () => {
    fx.link = null;
    expect(renderHook(() => usePlace('computers')).result.current).toBeNull();
  });
});
