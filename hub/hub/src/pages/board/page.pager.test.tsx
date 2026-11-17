// Vitest: a Board that pages, mounted. Past 4 tiles in Fit the Board shows pages of 4 instead of one tile at a
// time: the pager, the keys, a close that stays on its page, a new tile that goes last, drops that only swap, and the saved
// layout left alone. The pages themselves are model/pages.test.ts.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld, FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, boardSlots, equaliseBoard, focusSlot, freshRealm, isRefusal, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { toStored } from './model/persist';
import { withMode } from './scroll';
import strings from './strings.en.json';
import page from './page';

vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, showToast: () => 'toast-1' };
});

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const term = (session: number): TileRef => ({ project: atlas.project_id, computer: atlas.id, program: 'terminal', session });
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
/** A realm with one Board of `count` terminals, terminal-1 first in reading order. */
function realm(count: number, f: (b: Board) => Board = (b) => b): RealmBoards {
  const s = freshRealm(rand);
  let b = s.boards[0] as Board;
  for (let i = 1; i <= count; i++) b = must(addTile(b, term(i), rand)).board;
  return { ...s, boards: [f(b)] };
}
const activeAt = (i: number) => (b: Board): Board => must(focusSlot(b, boardSlots(b)[i] as string));

beforeAll(async () => { await page.load(); }, 180_000);

async function open(s: RealmBoards) { await openWith(s); }
async function openWith(s: RealmBoards) {
  const r = await renderPage(page);
  await act(() => cryptIdleForTests());
  await screen.findByRole('tab', { name: /Main/ });
  await act(async () => {
    await cryptIdleForTests();
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
  await screen.findByTitle('terminal-1 on atlas');
  return r;
}
/** Three tiles stacked, the first active: too short to fit 250 px, on two pages of 2. */
function realm3Stacked(): RealmBoards {
  const s = realm(3);
  const b = s.boards[0] as Board;
  const [x, y, z] = boardSlots(b) as [string, string, string];
  return { ...s, boards: [{ ...b, active: x, layout: { dir: 'col', ratio: 0.5, a: { slot: x }, b: { dir: 'col', ratio: 0.5, a: { slot: y }, b: { slot: z } } } }] };
}
const stored = async (): Promise<RealmBoards> => (await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards;
const area = () => screen.getByRole('group', { name: strings.tiles });
/** The tiles on screen: the frames not inside a hidden, inert tile, by title. */
const onScreen = () => screen.getAllByTitle(/^terminal-\d+ on atlas$/)
  .filter((f) => !f.closest('[inert]'))
  .map((f) => f.getAttribute('title')!.replace(' on atlas', ''));
const mounted = () => screen.getAllByTitle(/^terminal-\d+ on atlas$/).length;
const chips = () => within(screen.getByRole('toolbar', { name: strings.chips }));
const countText = (page_: number, pages: number) => strings['pager.count'].replace('{{page}}', String(page_)).replace('{{pages}}', String(pages));
const press = async (user: ReturnType<typeof userEvent.setup>, key: string) => { area().focus(); await user.keyboard(key); };

let size = { w: 1350, h: 900 };
beforeEach(() => {
  resetBoardsForTests();
  size = { w: 1350, h: 900 };
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size.w);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size.h);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('past 4 tiles in Fit the Board pages at 4', () => {
  it('4 tiles draw the saved layout with dividers and no pager', async () => {
    await open(realm(4));
    expect(onScreen()).toHaveLength(4);
    expect(screen.queryByRole('toolbar', { name: strings.chips })).toBeNull();
    expect(screen.getAllByRole('separator').length).toBeGreaterThan(0);
  });
  it('5 tiles: page 1 of 2 holds the first 4, the 5th stays mounted, hidden and inert, and no divider shows', async () => {
    await open(realm(5, activeAt(0)));
    expect(onScreen()).toEqual(['terminal-1', 'terminal-2', 'terminal-3', 'terminal-4']);
    expect(mounted()).toBe(5);
    expect(screen.getByText(countText(1, 2))).toBeInTheDocument();
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
    expect(screen.queryByText(strings['board.oneAtATime'])).toBeNull();
  });
  it('the saved layout is what a stored Board keeps: paging writes nothing', async () => {
    const s = realm(6, activeAt(0));
    await open(s);
    const before = JSON.stringify((await stored()).boards[0]!.layout);
    expect(before).toBe(JSON.stringify(toStored(s).boards[0]!.layout));
  });
  it('8 tiles are two full pages', async () => {
    await open(realm(8, activeAt(7)));
    expect(onScreen()).toEqual(['terminal-5', 'terminal-6', 'terminal-7', 'terminal-8']);
    expect(screen.getByText(countText(2, 2))).toBeInTheDocument();
    expect(mounted()).toBe(8);
  });
  it('a short page uses the room: the one tile of page 2 fills the area', async () => {
    await open(realm(5, activeAt(4)));
    expect(onScreen()).toEqual(['terminal-5']);
    const tile = screen.getByTitle('terminal-5 on atlas').closest('[style*="width"]') as HTMLElement;
    expect(parseFloat(tile.style.width)).toBe(size.w - 8);
    expect(parseFloat(tile.style.height)).toBe(size.h - 8);
  });
  it('a tile off the page keeps its own page\'s size, so a flip resizes no frame', async () => {
    const user = userEvent.setup();
    await open(realm(8, activeAt(0)));
    const tile = screen.getByTitle('terminal-6 on atlas', { exact: true }).closest('[style*="width"]') as HTMLElement;
    const w = tile.style.width, h = tile.style.height;
    expect(parseFloat(w)).toBeGreaterThan(240);
    await press(user, '{PageDown}');
    await waitFor(() => expect(onScreen()).toContain('terminal-6'));
    expect(tile.style.width).toBe(w);
    expect(tile.style.height).toBe(h);
  });
  it('Scroll draws every tile, unpaged, while it fits', async () => {
    await open(realm(6, (b) => withMode(equaliseBoard(b), 'scroll')));
    expect(onScreen()).toHaveLength(6);
    expect(screen.queryByRole('toolbar', { name: strings.chips })).toBeNull();
  });
  // Tiles added one by one halve the last one, so the 6th is a quarter of a quarter wide: under 240 px here, in Scroll too,
  // which grows the height only. The Board keeps paging, and = (even shares) makes it fit. A known cost.
  it('Scroll with a layout too narrow to fit keeps paging; = then shows every tile', async () => {
    const user = userEvent.setup();
    await open(realm(6, (b) => withMode(activeAt(0)(b), 'scroll')));
    expect(onScreen()).toHaveLength(4);
    await press(user, '=');
    await waitFor(() => expect(onScreen()).toHaveLength(6));
  });
  it('Scroll too narrow to fit offers even shares beside the note: pressing it shows every tile, and it goes', async () => {
    const user = userEvent.setup();
    await open(realm(6, (b) => withMode(activeAt(0)(b), 'scroll')));
    expect(onScreen()).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: strings['overflow.even'] }));
    await waitFor(() => expect(onScreen()).toHaveLength(6));
    expect(screen.queryByRole('button', { name: strings['overflow.even'] })).toBeNull();
    // One undo step: the saved shares come back, and with them the paging and the button.
    await press(user, 'u');
    await waitFor(() => expect(onScreen()).toHaveLength(4));
    expect(screen.getByRole('button', { name: strings['overflow.even'] })).toBeInTheDocument();
  });
  it('Fit past 4 tiles offers no even shares: they would not stop it paging', async () => {
    await open(realm(6, activeAt(0)));
    expect(onScreen()).toHaveLength(4);
    expect(screen.queryByRole('button', { name: strings['overflow.even'] })).toBeNull();
  });
  it('a Scroll window too narrow even for even shares offers nothing', async () => {
    size = { w: 700, h: 500 };
    await open(realm(6, (b) => withMode(activeAt(0)(b), 'scroll')));
    expect(screen.queryByRole('button', { name: strings['overflow.even'] })).toBeNull();
  });
  it('maximising shows that tile with no pager; restoring goes back to its page', async () => {
    const user = userEvent.setup();
    await open(realm(5, activeAt(4)));
    await press(user, 'z');
    await waitFor(() => expect(screen.queryByText(countText(2, 2))).toBeNull());
    expect(onScreen()).toEqual(['terminal-5']);
    await press(user, 'z');
    await screen.findByText(countText(2, 2));
    expect(onScreen()).toEqual(['terminal-5']);
  });
  it('the frame count stays when a page flips: no frame is unmounted or remade', async () => {
    const user = userEvent.setup();
    await open(realm(6, activeAt(0)));
    const frame = screen.getByTitle('terminal-1 on atlas');
    await press(user, '{PageDown}');
    await waitFor(() => expect(onScreen()).toEqual(['terminal-5', 'terminal-6']));
    expect(screen.getByTitle('terminal-1 on atlas', { exact: true })).toBe(frame);
    expect(mounted()).toBe(6);
  });
});

describe('where capacity is smaller', () => {
  it('at 1280 x 250 a page holds 2, with chips and the pager', async () => {
    size = { w: 1280, h: 250 };
    await open(realm(5, activeAt(2)));
    expect(onScreen()).toEqual(['terminal-3', 'terminal-4']);
    expect(screen.getByText(countText(2, 3))).toBeInTheDocument();
  });
  it('at 400 x 500 it is one tile at a time, as before: chips, the note, no pager', async () => {
    size = { w: 400, h: 500 };
    await open(realm(5, activeAt(1)));
    expect(onScreen()).toEqual(['terminal-2']);
    expect(screen.getByRole('toolbar', { name: strings.chips })).toBeInTheDocument();
    expect(screen.getByText(strings['board.oneAtATime'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['pager.next'] })).toBeNull();
  });
  it('a saved layout that does not fit, with room for its tiles on one page, draws them on that page with no pager', async () => {
    // Stacked halves of halves: the deepest tiles are under 160 px in 500, a grid of 3 gives each its minimum.
    const s = realm(1);
    let b = s.boards[0] as Board;
    for (const i of [2, 3]) { const r = must(addTile({ ...b, layout: b.layout }, term(i), rand)); b = r.board; }
    const stacked: Board = { ...b, layout: { dir: 'col', ratio: 0.5, a: { slot: boardSlots(b)[0] as string }, b: { dir: 'col', ratio: 0.5, a: { slot: boardSlots(b)[1] as string }, b: { slot: boardSlots(b)[2] as string } } } };
    size = { w: 1280, h: 500 };
    await open({ ...s, boards: [stacked] });
    expect(onScreen()).toHaveLength(3);
    expect(screen.queryByRole('toolbar', { name: strings.chips })).toBeNull();
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
    expect(screen.getByText(strings['overflow.fitted'])).toBeInTheDocument();
    expect(JSON.stringify((await stored()).boards[0]!.layout)).toBe(JSON.stringify(stacked.layout));
  });
});

describe('moving between pages', () => {
  it('Next and Previous show the page and make its first tile active; each is off at its end', async () => {
    const user = userEvent.setup();
    await open(realm(6, activeAt(1)));
    const prev = screen.getByRole('button', { name: strings['pager.prev'] });
    const next = screen.getByRole('button', { name: strings['pager.next'] });
    expect(prev).toBeDisabled();
    await user.click(next);
    await waitFor(() => expect(onScreen()).toEqual(['terminal-5', 'terminal-6']));
    await waitFor(async () => {
      const b = (await stored()).boards[0]!;
      expect(b.active).toBe(boardSlots(b)[4]);
    });
    expect(screen.getByRole('button', { name: strings['pager.next'] })).toBeDisabled();
    expect(area()).toHaveFocus();
    await user.click(screen.getByRole('button', { name: strings['pager.prev'] }));
    await waitFor(() => expect(onScreen()).toEqual(['terminal-1', 'terminal-2', 'terminal-3', 'terminal-4']));
  });
  it('PageDown and PageUp do the same and say the page', async () => {
    const user = userEvent.setup();
    await open(realm(5, activeAt(0)));
    await press(user, '{PageDown}');
    await waitFor(() => expect(onScreen()).toEqual(['terminal-5']));
    expect(screen.getByText(strings['announce.paged'].replace('{{page}}', '2').replace('{{pages}}', '2').replace('{{shown}}', '1').replace('{{count}}', '5'))).toBeInTheDocument();
    await press(user, '{PageUp}');
    await waitFor(() => expect(onScreen()).toHaveLength(4));
  });
  it('an arrow stays on the page: nothing to the right of the page\'s edge', async () => {
    const user = userEvent.setup();
    await open(realm(6, activeAt(4)));
    await press(user, '{ArrowLeft}');
    await press(user, '{ArrowUp}');
    expect(onScreen()).toEqual(['terminal-5', 'terminal-6']);
    await press(user, '{ArrowRight}');
    await waitFor(async () => {
      const b = (await stored()).boards[0]!;
      expect(b.active).toBe(boardSlots(b)[5]);
    });
    expect(onScreen()).toEqual(['terminal-5', 'terminal-6']);
  });
  it('a chip for a tile on another page shows that page', async () => {
    const user = userEvent.setup();
    await open(realm(6, activeAt(0)));
    await user.click(chips().getByRole('button', { name: /terminal-6/ }));
    await waitFor(() => expect(onScreen()).toEqual(['terminal-5', 'terminal-6']));
  });
  it('resize keys are off while the Board pages: the saved layout does not move', async () => {
    const user = userEvent.setup();
    const s = realm(5, activeAt(0));
    await open(s);
    await press(user, '{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}');
    expect(JSON.stringify((await stored()).boards[0]!.layout)).toBe(JSON.stringify(toStored(s).boards[0]!.layout));
  });
});

describe('closing and adding on a page', () => {
  it('closing a tile stays on its page: the next tile there becomes active', async () => {
    const user = userEvent.setup();
    await open(realm(7, activeAt(4)));
    expect(onScreen()).toEqual(['terminal-5', 'terminal-6', 'terminal-7']);
    await press(user, 'x');
    await waitFor(() => expect(onScreen()).toEqual(['terminal-6', 'terminal-7']));
    const b = (await stored()).boards[0]!;
    expect(b.tiles[b.active]).toMatchObject({ session: 6 });
  });
  it('closing a lone tile on the last of 3 pages goes to page 2, not page 1', async () => {
    const user = userEvent.setup();
    size = { w: 1280, h: 250 };
    await open(realm(5, activeAt(4)));
    expect(screen.getByText(countText(3, 3))).toBeInTheDocument();
    await press(user, 'x');
    await waitFor(() => expect(onScreen()).toEqual(['terminal-3', 'terminal-4']));
  });
  it('closing the last tile of a page goes to the page before', async () => {
    const user = userEvent.setup();
    await open(realm(5, activeAt(4)));
    await press(user, 'x');
    await waitFor(() => expect(onScreen()).toHaveLength(4));
  });
  it('n on a Board that pages opens the picker on a new slot read last, the earlier tiles unmoved', async () => {
    const user = userEvent.setup();
    await open(realm(5, activeAt(0)));
    await press(user, 'n');
    await waitFor(async () => {
      const b = (await stored()).boards[0]!;
      expect(boardSlots(b)).toHaveLength(6);
      expect(b.tiles[boardSlots(b)[5] as string]).toBeNull();
      expect(b.active).toBe(boardSlots(b)[5]);
      expect(boardSlots(b).slice(0, 5).map((x) => (b.tiles[x] as TileRef).session)).toEqual([1, 2, 3, 4, 5]);
    });
    expect(screen.getByText(countText(2, 2))).toBeInTheDocument();
  });
  it('the add that makes the 5th tile goes last too', async () => {
    const user = userEvent.setup();
    await open(realm(4, activeAt(0)));
    await press(user, 'n');
    await waitFor(async () => {
      const b = (await stored()).boards[0]!;
      expect(boardSlots(b)).toHaveLength(5);
      expect(b.active).toBe(boardSlots(b)[4]);
      expect(boardSlots(b).slice(0, 4).map((x) => (b.tiles[x] as TileRef).session)).toEqual([1, 2, 3, 4]);
    });
  });
  it('s on a Board that pages goes last; on one that does not it goes beside the active tile', async () => {
    const user = userEvent.setup();
    await open(realm(5, activeAt(1)));
    await press(user, 's');
    await waitFor(async () => {
      const b = (await stored()).boards[0]!;
      expect(boardSlots(b)).toHaveLength(6);
      expect(b.active).toBe(boardSlots(b)[5]);
    });
  });
  it('an unpaged split right stays beside its tile', async () => {
    const user = userEvent.setup();
    await open(realm(3, activeAt(0)));
    await press(user, 's');
    await waitFor(async () => {
      const b = (await stored()).boards[0]!;
      expect(boardSlots(b)).toHaveLength(4);
      expect(b.active).toBe(boardSlots(b)[1]);
    });
  });
  it('unpaged, n splits along the active tile\'s longer side, not always to the right', async () => {
    const user = userEvent.setup();
    size = { w: 1350, h: 900 };
    // Two side by side: each half is taller than wide in the unit square, so the new tile goes below it.
    await open(realm(2, activeAt(0)));
    await press(user, 'n');
    await waitFor(async () => {
      const b = (await stored()).boards[0]!;
      expect(boardSlots(b)).toHaveLength(3);
      const root = b.layout as { dir: string; a: { dir?: string } };
      expect(root.dir).toBe('row');
      expect(root.a.dir).toBe('col');
    });
  });
  it('an Add link on a Board that pages under 4 slots goes last: tiles on earlier pages keep their place', async () => {
    size = { w: 1000, h: 250 };
    const r = await openWith(realm3Stacked());
    expect(screen.getByText(countText(1, 2))).toBeInTheDocument();
    await act(() => r.router.navigate({ href: '/board?add=terminal-9&cid=' + atlas.id } as never));
    await waitFor(async () => {
      const b = (await stored()).boards[0]!;
      expect(boardSlots(b).map((x) => (b.tiles[x] as TileRef).session)).toEqual([1, 2, 3, 9]);
    });
  });
  it('an Add link on a Scroll Board that overflows goes last too', async () => {
    const r = await openWith(realm(6, (b) => withMode(activeAt(0)(b), 'scroll')));
    expect(onScreen()).toHaveLength(4);
    await act(() => r.router.navigate({ href: '/board?add=terminal-9&cid=' + atlas.id } as never));
    await waitFor(async () => {
      const b = (await stored()).boards[0]!;
      expect(boardSlots(b).map((x) => (b.tiles[x] as TileRef).session)).toEqual([1, 2, 3, 4, 5, 6, 9]);
    });
  });
  it('a 9th tile is refused: the Board is full at 8', async () => {
    await open(realm(8, activeAt(0)));
    expect(screen.getByRole('button', { name: strings['board.full'] })).toBeDisabled();
  });
});
