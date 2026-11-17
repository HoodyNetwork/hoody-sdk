// Vitest: an Add link (links.ts boardAddPath; Apps' Put on Board) while the Board is not ready yet (its saved Boards
// still opening: useBoards().ready false, the Board shows its skeleton). The link is taken at once all the same: the
// address drops the id, and the tile is added when the Board is ready, or a notice says it was not when the Board
// is left first.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, waitFor } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import type * as Data from './data';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, boardSlots, createBoard, freshRealm, isRefusal, type Board, type RealmBoards, type TileRef } from './model/boards';
import { toStored } from './model/persist';
import { resetFixtureSessions, setListDown } from './fixtures';
import page from './page';

const toasts: Array<{ title: string }> = [];
// Readiness held off by the test, on top of the real one.
const H = vi.hoisted(() => ({ hold: false, subs: new Set<() => void>() }));
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string }) => { toasts.push(c); return 'toast-1'; } }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const { useSyncExternalStore } = await import('react');
  const sub = (f: () => void) => { H.subs.add(f); return () => { H.subs.delete(f); }; };
  return {
    ...real,
    useBoards: () => {
      const r = real.useBoards();
      const hold = useSyncExternalStore(sub, () => H.hold);
      return hold ? { ...r, ready: false } : r;
    },
  };
});
const setHold = (on: boolean) => { H.hold = on; H.subs.forEach((f) => f()); };

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const link = `/board?add=terminal-3&cid=${atlas.id}`;

beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  resetBoardsForTests();
  toasts.length = 0;
  H.hold = true;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});

describe('Board: an Add link before the Board is ready', () => {
  it('the address drops the id while the saved Boards open; once they are open the tile is added and gets the keys', async () => {
    const r = await renderPage(page, { path: link });
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    expect(screen.queryByRole('group', { name: 'Board tiles' })).toBeNull();
    act(() => setHold(false));
    const f = await screen.findByTitle('terminal-3 on atlas');
    await waitFor(() => expect(document.activeElement).toBe(f));
    expect(toasts).toEqual([]);
  });

  it('a link queued before the Board mounts, the list already read, waits for the measure: on a Board that pages it goes last', async () => {
    // Three stacked tiles in 1000 x 250 page as [1, 2] / [3]; split from the active tile, the 2nd would move to the next page.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 250);
    let n = 0;
    const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
    const term = (session: number): TileRef => ({ project: atlas.project_id, computer: atlas.id, program: 'terminal', session });
    const s = freshRealm(rand);
    let b = s.boards[0] as Board;
    for (const i of [1, 2, 3]) { const x = addTile(b, term(i), rand); if (isRefusal(x)) throw new Error('refused'); b = x.board; }
    const [x, y, z] = boardSlots(b) as [string, string, string];
    const stacked: Board = { ...b, active: x, layout: { dir: 'col', ratio: 0.5, a: { slot: x }, b: { dir: 'col', ratio: 0.5, a: { slot: y }, b: { slot: z } } } };
    act(() => setHold(false));
    const r = await renderPage(page);
    await cryptIdleForTests();
    await act(async () => {
      await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored({ ...s, boards: [stacked] }));
      // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
      await cryptIdleForTests();
    });
    await screen.findByTitle('terminal-1 on atlas'); // the list is read and cached: the next mount has it at its first render
    act(() => setHold(true));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Board tiles' })).toBeNull());
    await act(() => r.router.navigate({ href: '/board?add=terminal-9&cid=' + atlas.id } as never));
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    act(() => setHold(false));
    await waitFor(async () => {
      const saved = (await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards;
      const on = saved.boards[0]!;
      expect(boardSlots(on).map((id) => (on.tiles[id] as TileRef).session)).toEqual([1, 2, 3, 9]);
    });
  });

  it('an Add link with ?b= taken before the Board is ready puts the tile on that Board once it is', async () => {
    let n = 0;
    const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
    const two = createBoard(freshRealm(rand), rand, 'Two');
    if (isRefusal(two)) throw new Error('refused');
    const s: RealmBoards = { ...two, active: two.boards[0]!.id };
    const r = await renderPage(page);
    await cryptIdleForTests();
    await act(async () => {
      await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
      // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
      await cryptIdleForTests();
    });
    const id = s.boards[1]!.id;
    await act(() => r.router.navigate({ href: `/board?b=${id}&add=terminal-3&cid=${atlas.id}` } as never));
    await waitFor(() => expect(r.router.state.location.search).toEqual({ b: id }));
    act(() => setHold(false));
    await screen.findByTitle('terminal-3 on atlas');
    await waitFor(async () => {
      const st = (await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards;
      expect(Object.values(st.boards.find((b) => b.id === id)!.tiles).filter(Boolean)).toHaveLength(1);
    });
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
  });

  it('leaving before the saved Boards open says the tile was not added, and going Back finds no id in the address', async () => {
    const r = await renderPage(page, { path: link });
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    await act(() => r.router.navigate({ href: `/board/open/${atlas.name}.${atlas.id.slice(-4)}/files-1` } as never));
    await waitFor(() => expect(toasts.map((x) => x.title)).toEqual(["The Board closed before the tile from the Board link was added. Put it on the Board again to add it."]));
    await act(async () => { r.router.history.back(); });
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/board'));
    expect(r.router.state.location.search).toEqual({});
  });
});
