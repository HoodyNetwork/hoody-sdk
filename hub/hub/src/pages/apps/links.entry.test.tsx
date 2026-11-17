// Vitest: Files' entry points hand the drawer the place the person pressed them from (the landing fence). The drawer is
// a stand-in that records what it was given; the press is taken at open(), before its chunk loads.
import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@app/testing';
import type * as Core from '@core';

const S = vi.hoisted(() => ({ props: [] as { pressedAt?: { gen: number; href: string } }[] }));
vi.mock('@core', async (orig) => ({ ...(await orig<typeof Core>()), useCan: () => true }));
vi.mock('./launch/openWith/OpenWith', () => ({
  default: (p: { pressedAt?: { gen: number; href: string } }) => { S.props.push(p); return <p>drawer</p>; },
  OpenTop: () => null,
}));
const { useOpenWithEntry } = await import('./links');
const { capture } = await import('@core');

const target = { project: { id: 'a'.repeat(24) }, container: { id: 'b'.repeat(24), server_name: 'n1' } };
const file = { path: '/srv/app/server.js', name: 'server.js', label: 'server.js', type: 'file' } as const;

describe('useOpenWithEntry: the entry press is the landing fence', () => {
  it('entry_press_captured_at_open: the address and context of the press, not of the drawer\'s mount', async () => {
    window.location.hash = '#/files?ap=%2Fsrv%2Fapp';
    const pressed = window.location.href;
    const gen = capture().gen;
    const { result } = renderHook(() => useOpenWithEntry({ target, running: true }));
    act(() => result.current.open({ kind: 'last', file }));
    window.location.hash = '#/files?ap=%2Felsewhere';
    render(<>{result.current.overlay}</>);
    expect(await screen.findByText('drawer')).toBeInTheDocument();
    expect(S.props.at(-1)?.pressedAt).toEqual({ gen, href: pressed });
  });
});
