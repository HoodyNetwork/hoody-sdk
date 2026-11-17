// The Board and the program view on real data: computer list rows with their
// API colours (fixture state colours) flow through useBoardComputers, boardInfo / infoFor and the tile. One realm:
// each tile's stripe and mark are its computer's; All realms: the realm is a visible chip and in the group's name.
// On a split Board, pressing the realm chip, or clicking or dragging across its open popover, moves no tile and
// enters no program.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, configure, fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, freshRealm, isRefusal, onActive, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { toStored } from './model/persist';
import page from './page';
import { resetFixtureSessions } from './fixtures';

const byName = (n: string) => fixtureWorld.computers.find((c) => c.name === n)!;
const atlas = byName('atlas'), cedar = byName('cedar'), borealis = byName('borealis'), fjord = byName('fjord');
const realmName = (id: string) => fixtureWorld.realms.find((r) => r.id === id)!.name;
const tileOf = (c: { id: string; project_id: string }, session = 1): TileRef => ({ project: c.project_id, computer: c.id, program: 'terminal', session });
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function withTiles(...tiles: TileRef[]): RealmBoards {
  let s = freshRealm(rand);
  for (const t of tiles) {
    const r = onActive(s, (b): Board | Refusal => { const x = addTile(b, t, rand); return isRefusal(x) ? x : x.board; });
    if (isRefusal(r)) throw new Error('refused');
    s = r;
  }
  return s;
}
async function seed(realm: string, s: RealmBoards) {
  await cryptIdleForTests();
  await writeSealedForTests(BOARDS_KEY, realm, toStored(s));
  // eslint-disable-next-line no-restricted-globals -- another tab's write is played through the storage event, as data.test does
  window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
  await cryptIdleForTests();
}
// The stored layout and which tile sits where (pressing the chip makes its tile the active one: that is not a move).
const layoutOf = async (realm: string) => {
  const b = ((await storedForTests(BOARDS_KEY, realm)) as RealmBoards | null)?.boards[0];
  return JSON.stringify(b ? { layout: b.layout, tiles: b.tiles } : null);
};
const stripe = (g: HTMLElement) => g.querySelector<HTMLElement>('[class*="stripe"]');
const markOf = (g: HTMLElement) => g.querySelector<HTMLElement>('[data-computer-color]');

// The first render loads the page's chunks (slow on a busy host): wait as the Board's page test does.
// A test runs several waits, so its own timeout stays above them: a missing chip fails on its query, not on time.
configure({ asyncUtilTimeout: 15000 });
vi.setConfig({ testTimeout: 60_000 });

beforeEach(() => {
  resetFixtureSessions();
  resetBoardsForTests();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Board: each tile shows which computer it is', () => {
  it('one realm: two computers, two stripe colours and marks; a non-hex colour draws none; no realm chip', async () => {
    await renderPage(page, { state: 'colours' });
    await screen.findByRole('group', { name: 'Board tiles' });
    // atlas and fjord share the realm: two valid colours. A duplicate atlas tile keeps atlas's; cedar's is not a colour.
    expect(fjord.realm_ids).toEqual(atlas.realm_ids);
    await act(() => seed(FIXTURE_REALM, withTiles(tileOf(atlas), tileOf(fjord), tileOf(cedar), tileOf(atlas))));
    const a = await screen.findByRole('group', { name: 'terminal-1 · atlas' });
    const f = screen.getByRole('group', { name: 'terminal-1 · fjord' });
    const dup = screen.getByRole('group', { name: 'terminal-1 · atlas (2)' });
    const c = screen.getByRole('group', { name: 'terminal-1 · cedar' });
    await waitFor(() => expect(stripe(a)?.style.getPropertyValue('--board-computer')).toBe('#3B82F6'));
    expect(markOf(a)?.getAttribute('data-computer-color')).toBe('#3B82F6');
    expect(stripe(f)?.style.getPropertyValue('--board-computer')).toBe('#10B981');
    expect(markOf(f)?.getAttribute('data-computer-color')).toBe('#10B981');
    expect(stripe(dup)?.style.getPropertyValue('--board-computer')).toBe('#3B82F6');
    // cedar's row colour is 'red;x:url()': nothing of it reaches a style.
    expect(stripe(c)?.getAttribute('style')).toBeNull();
    expect(markOf(c)).toBeNull();
    for (const g of [a, f, c]) expect(within(g).queryByRole('button', { name: realmName(FIXTURE_REALM) })).toBeNull();
  });

  it('All realms: the realm is a visible chip and ends the group name (after the duplicate mark)', async () => {
    await renderPage(page, { state: 'colours', realm: 'all' });
    await screen.findByRole('group', { name: 'Board tiles' });
    await act(() => seed('all', withTiles(tileOf(atlas), tileOf(borealis), tileOf(atlas))));
    const home = realmName(atlas.realm_ids[0]!), acme = realmName(borealis.realm_ids[0]!);
    const a = await screen.findByRole('group', { name: `terminal-1 · atlas, realm ${home}` });
    const b = screen.getByRole('group', { name: `terminal-1 · borealis, realm ${acme}` });
    expect(screen.getByRole('group', { name: `terminal-1 · atlas (2), realm ${home}` })).toBeInTheDocument();
    expect(within(a).getByRole('button', { name: home })).toBeVisible();
    expect(within(b).getByRole('button', { name: acme })).toBeVisible();
    expect(stripe(a)?.style.getPropertyValue('--board-computer')).toBe('#3B82F6');
    expect(stripe(b)?.style.getPropertyValue('--board-computer')).toBe('#F59E0B');
  });

  it('on a split Board, the chip and its open popover never drag a tile or enter a program', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'colours', realm: 'all' });
    await screen.findByRole('group', { name: 'Board tiles' });
    await act(() => seed('all', withTiles(tileOf(atlas), tileOf(borealis))));
    const home = realmName(atlas.realm_ids[0]!);
    const a = await screen.findByRole('group', { name: `terminal-1 · atlas, realm ${home}` });
    const b = screen.getByRole('group', { name: /terminal-1 · borealis/ });
    // Enter the other tile first, so the chip's own tile is not the one with the keys.
    await user.click(within(b).getByText('borealis'));
    await waitFor(() => expect(b.getAttribute('data-hub-keys')).toBe('frame'));
    const before = await layoutOf('all');
    await user.click(within(a).getByRole('button', { name: home }));
    const text = within(await screen.findByRole('dialog', { name: 'Realm' })).getByText(home);
    // A click across the popover's text.
    fireEvent.pointerDown(text, { button: 0, clientX: 300, clientY: 40, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(text, { button: 0, clientX: 300, clientY: 40, pointerId: 1, pointerType: 'mouse' });
    // A drag across it, far enough to start a tile drag, released over the other tile.
    fireEvent.pointerDown(text, { button: 0, clientX: 300, clientY: 40, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(window, { clientX: 1000, clientY: 400, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(b, { button: 0, clientX: 1000, clientY: 400, pointerId: 1, pointerType: 'mouse' });
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(a.getAttribute('data-hub-keys')).toBeNull();
    expect(await layoutOf('all')).toBe(before);
    expect(screen.getAllByRole('group').filter((g) => /terminal-1 · /.test(g.getAttribute('aria-label') ?? '')).map((g) => g.getAttribute('aria-label'))).toEqual([
      `terminal-1 · atlas, realm ${home}`, expect.stringMatching(/terminal-1 · borealis/),
    ]);
  });
});

describe('program view: the same marks on its standalone tile', () => {
  for (const realm of [undefined, 'all'] as const) {
    it(`${realm ? 'All realms' : 'one realm'}: stripe, mark${realm ? ', realm chip and the full group name' : ''}`, async () => {
      await renderPage(page, { state: 'colours', path: '/board/open/atlas.00a1/terminal-1', ...(realm ? { realm } : {}) });
      const home = realmName(atlas.realm_ids[0]!);
      const g = await screen.findByRole('group', { name: realm ? `terminal-1 · atlas, realm ${home}` : 'terminal-1 · atlas' });
      await waitFor(() => expect(stripe(g)?.style.getPropertyValue('--board-computer')).toBe('#3B82F6'));
      expect(markOf(g)?.style.getPropertyValue('--computer')).toBe('#3B82F6');
      if (realm) expect(within(g).getByRole('button', { name: home })).toBeVisible();
      else expect(within(g).queryByRole('button', { name: home })).toBeNull();
    });
  }
});
