// Vitest: on a Board that pages, a tile header dragged onto
// a tile chip swaps the tile with that chip's slot, so a tile moves to another page by drag (the tile menu's Swap does
// the same by keys), also one tile at a time. The chip under the pointer is drawn as the drop place; its own chip, or a
// chip other than the one drawn at the release (the pointer left it, or the row moved under a still pointer), drops
// nothing; the swap is one undo step.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld, FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, boardSlots, freshRealm, isRefusal, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { toStored } from './model/persist';
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
/** One Board of six terminals, terminal-1 first and active: at 1350 x 900 in Fit, pages of 4 (1-4, then 5-6). */
function realm6(): RealmBoards {
  const s = freshRealm(rand);
  let b = s.boards[0] as Board;
  for (let i = 1; i <= 6; i++) b = must(addTile(b, term(i), rand)).board;
  return { ...s, boards: [{ ...b, active: boardSlots(b)[0] as string }] };
}
beforeAll(async () => { await page.load(); }, 180_000);

async function open(s: RealmBoards) {
  await renderPage(page);
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
}
const stored = async (): Promise<RealmBoards> => (await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards;
/** The terminal sessions in reading order of the stored Board. */
const order = async () => { const b = (await stored()).boards[0] as Board; return boardSlots(b).map((x) => (b.tiles[x] as TileRef | undefined)?.session); };
const chips = () => within(screen.getByRole('toolbar', { name: strings.chips }));
const chip = (name: RegExp) => chips().getByRole('button', { name });
const headOf = (session: number) => (screen.getByTitle(`terminal-${session} on atlas`).closest('[role="group"][id]') as HTMLElement).firstElementChild as HTMLElement;

/** What the browser finds under the pointer while the drag is over the chips row (jsdom lays nothing out). The pointer
 * moves to points left of the area, outside every tile box: jsdom's view has no size, so it does not bound a tile drop. */
let under: Element | null = null;
const at = (type: string, x: number, y: number) => act(() => { window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y })); });
function dragOnto(head: HTMLElement, el: Element | null) {
  act(() => { head.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 40, clientY: 10 })); });
  under = el;
  at('pointermove', -40, -40);
  at('pointermove', -60, -40);
}

let size = { w: 1350, h: 900 };
beforeEach(() => {
  resetBoardsForTests();
  under = null;
  size = { w: 1350, h: 900 };
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => under });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size.w);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size.h);
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
});

describe('dragging a tile onto a tile chip of a Board that pages', () => {
  it('onto a chip on another page: the chip is drawn as the drop place, and the release swaps the two, stored', async () => {
    await open(realm6());
    expect(await order()).toEqual([1, 2, 3, 4, 5, 6]);
    dragOnto(headOf(1), chip(/terminal-6/));
    await waitFor(() => expect(chip(/terminal-6/).hasAttribute('data-drop-target')).toBe(true));
    expect(chip(/terminal-5/).hasAttribute('data-drop-target')).toBe(false);
    at('pointerup', -60, -40);
    await act(() => cryptIdleForTests());
    await waitFor(async () => expect(await order()).toEqual([6, 2, 3, 4, 5, 1]));
    expect(chip(/terminal-6/).hasAttribute('data-drop-target')).toBe(false);
  });

  it('the swap is one undo step', async () => {
    await open(realm6());
    dragOnto(headOf(1), chip(/terminal-5/));
    at('pointerup', -60, -40);
    await waitFor(async () => expect(await order()).toEqual([5, 2, 3, 4, 1, 6]));
    act(() => { screen.getByRole('group', { name: strings.tiles }).focus(); });
    await act(async () => { screen.getByRole('group', { name: strings.tiles }).dispatchEvent(new KeyboardEvent('keydown', { key: 'u', bubbles: true })); });
    await act(() => cryptIdleForTests());
    await waitFor(async () => expect(await order()).toEqual([1, 2, 3, 4, 5, 6]));
  });

  it('onto its own chip: no drop place, and the release changes nothing', async () => {
    await open(realm6());
    dragOnto(headOf(1), chip(/terminal-1/));
    expect(chip(/terminal-1/).hasAttribute('data-drop-target')).toBe(false);
    at('pointerup', -60, -40);
    await act(() => cryptIdleForTests());
    expect(await order()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a release once the pointer left the chip drops nothing on it', async () => {
    await open(realm6());
    dragOnto(headOf(1), chip(/terminal-6/));
    await waitFor(() => expect(chip(/terminal-6/).hasAttribute('data-drop-target')).toBe(true));
    under = null;
    at('pointermove', -70, -40);
    expect(chip(/terminal-6/).hasAttribute('data-drop-target')).toBe(false);
    at('pointerup', -70, -40);
    await act(() => cryptIdleForTests());
    expect(await order()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a release over another chip than the one drawn (the row moved under a still pointer) drops nothing', async () => {
    await open(realm6());
    dragOnto(headOf(1), chip(/terminal-6/));
    await waitFor(() => expect(chip(/terminal-6/).hasAttribute('data-drop-target')).toBe(true));
    under = chip(/terminal-5/); // no move, no scroll event: only the release reads it
    at('pointerup', -60, -40);
    await act(() => cryptIdleForTests());
    expect(await order()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a release where the drawn chip is gone from under a still pointer drops nothing', async () => {
    await open(realm6());
    dragOnto(headOf(1), chip(/terminal-6/));
    await waitFor(() => expect(chip(/terminal-6/).hasAttribute('data-drop-target')).toBe(true));
    under = null;
    at('pointerup', -60, -40);
    await act(() => cryptIdleForTests());
    expect(await order()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('dragging a tile onto a tile chip, one tile at a time', () => {
  it('at 400 x 500 the shown tile\'s header drags onto another chip: drawn, then swapped, stored', async () => {
    size = { w: 400, h: 500 };
    await open(realm6());
    expect(screen.queryByRole('button', { name: strings['pager.prev'] })).toBeNull(); // one at a time: chips, no pager
    dragOnto(headOf(1), chip(/terminal-4/));
    await waitFor(() => expect(chip(/terminal-4/).hasAttribute('data-drop-target')).toBe(true));
    at('pointerup', -60, -40);
    await act(() => cryptIdleForTests());
    await waitFor(async () => expect(await order()).toEqual([4, 2, 3, 1, 5, 6]));
  });

  it('a click on the shown tile\'s header, with no drag, still enters the program and swaps nothing', async () => {
    size = { w: 400, h: 500 };
    await open(realm6());
    const user = userEvent.setup();
    await user.click(within(headOf(1)).getByText('terminal-1'));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTitle('terminal-1 on atlas')));
    expect(await order()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
