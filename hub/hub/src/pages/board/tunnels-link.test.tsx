// The Board tile menu links to Tunnels on the tile's computer: like Open in Programs, the
// tile's computer becomes the shell's computer first, then Tunnels opens. Shown in a program view and on the board
// grid (both menus come from useComputerLinks). A load that does not serve Tunnels shows no such item.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Kit from '@kit';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { chooseComputer, FIXTURE_REALM, fixtureWorld, rememberedComputerId } from '@core';
import { cryptIdleForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY } from './data';
import { addTile, freshRealm, isRefusal, onActive, type Board, type RealmBoards, type Refusal } from './model/boards';
import { toStored } from './model/persist';
import board from './page';

// Pages this load does not serve: usePageLink gives none for them.
const unserved = vi.hoisted(() => new Set<string>());
vi.mock('@kit', async (importOriginal) => {
  const kit = await importOriginal<typeof Kit>();
  const usePageLink: typeof kit.usePageLink = (id) => (unserved.has(id) ? null : kit.usePageLink(id));
  return { ...kit, usePageLink };
});
beforeEach(() => unserved.clear());

const named = (n: string) => {
  const c = fixtureWorld.computers.find((x) => x.name === n);
  if (!c) throw new Error(`no ${n}`);
  return c;
};

// The board grid with one tile (as page.test.tsx seeds it: a stored set arrives after render, like another tab's write).
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function gridWith(c: { id: string; project_id: string }): RealmBoards {
  const s = onActive(freshRealm(rand), (b): Board | Refusal => {
    const r = addTile(b, { project: c.project_id, computer: c.id, program: 'terminal', session: 1 }, rand);
    return isRefusal(r) ? r : r.board;
  });
  if (isRefusal(s)) throw new Error('refused ' + s.refused);
  return s;
}
async function openGrid(c: { id: string; project_id: string }) {
  const r = await renderPage(board);
  await act(async () => {
    await cryptIdleForTests();
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(gridWith(c)));
    // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
  return r;
}
// The links to the tile's computer, in menu order.
const COMPUTER_LINKS = /^(Open in Programs|Open in Computers|Open in Logs|Open in Tunnels)/;
const computerLinks = () => screen.getAllByRole('menuitem').map((m) => m.textContent?.match(COMPUTER_LINKS)?.[1]).filter(Boolean);

describe('board tile menu: Open in Tunnels', () => {
  it('makes the tile\'s computer the current one, then opens Tunnels', async () => {
    const user = userEvent.setup();
    const c = named('atlas');
    const handle = `${c.name}.${c.id.slice(-4)}`;
    const r = await renderPage(board, { path: `/board/open/${handle}/files-1` });
    await screen.findByTitle(`files-1 on ${c.name}`);
    // Another computer is the shell's for now.
    await act(async () => {
      chooseComputer(named('cedar'));
    });
    expect(rememberedComputerId()).toBe(named('cedar').id);
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    // Beside the other links to the tile's computer.
    expect(await screen.findByRole('menuitem', { name: /Open in Programs/ })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /Open in Tunnels/ }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/tunnels'));
    expect(rememberedComputerId()).toBe(c.id);
  });

  it('on the board grid: the computer links read Programs, computer, Logs, Tunnels, once each, and Tunnels opens on the tile\'s computer', async () => {
    const user = userEvent.setup();
    const c = named('atlas');
    const r = await openGrid(c);
    await screen.findByTitle(`terminal-1 on ${c.name}`);
    await act(async () => {
      chooseComputer(named('cedar'));
    });
    // The computer the shell has at the moment the route changes to /tunnels: the tile's, already (chosen first,
    // then followed). Swapping the two steps would open Tunnels on cedar.
    let atNav: string | null | undefined;
    const off = r.router.history.subscribe(() => { if (r.router.history.location.pathname === '/tunnels' && atNav === undefined) atNav = rememberedComputerId(); });
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await screen.findByRole('menuitem', { name: /Open in Tunnels/ });
    expect(computerLinks()).toEqual(['Open in Programs', 'Open in Computers', 'Open in Logs', 'Open in Tunnels']);
    await user.click(screen.getByRole('menuitem', { name: /Open in Tunnels/ }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/tunnels'));
    off();
    expect(atNav).toBe(c.id);
  });

  it('in a program view: the same four links in the same order, and the computer is set before the route changes', async () => {
    const user = userEvent.setup();
    const c = named('atlas');
    const r = await renderPage(board, { path: `/board/open/${c.name}.${c.id.slice(-4)}/files-1` });
    await screen.findByTitle(`files-1 on ${c.name}`);
    await act(async () => {
      chooseComputer(named('cedar'));
    });
    let atNav: string | null | undefined;
    const off = r.router.history.subscribe(() => { if (r.router.history.location.pathname === '/tunnels' && atNav === undefined) atNav = rememberedComputerId(); });
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await screen.findByRole('menuitem', { name: /Open in Tunnels/ });
    expect(computerLinks()).toEqual(['Open in Programs', 'Open in Computers', 'Open in Logs', 'Open in Tunnels']);
    await user.click(screen.getByRole('menuitem', { name: /Open in Tunnels/ }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/tunnels'));
    off();
    expect(atNav).toBe(c.id);
  });

  it('a load that does not serve Tunnels shows no Open in Tunnels; Open in Programs stays', async () => {
    unserved.add('tunnels');
    const user = userEvent.setup();
    const c = named('atlas');
    await renderPage(board, { path: `/board/open/${c.name}.${c.id.slice(-4)}/files-1` });
    await screen.findByTitle(`files-1 on ${c.name}`);
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    expect(await screen.findByRole('menuitem', { name: /Open in Programs/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Open in Tunnels/ })).toBeNull();
  });
});
