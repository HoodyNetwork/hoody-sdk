/* eslint-disable no-restricted-globals -- the tests store a Board as another browser tab would; the page reaches
   storage only through core */
// Vitest: a tile header held to drag shows it at once. A mouse press marks the tile
// pressed (data-pressed="press": grabbing cursor, selected header, accent outline) before the 4 px threshold, and a
// release without a drag clears it. A touch press first shows the hold (data-pressed="hold", the filling bar), and
// the pressed state once the 400 ms hold passes. Dragging while still over the tile it started on outlines it with
// "Release to cancel". A header that cannot drag (a maximised tile) is never marked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, waitFor } from '@app/testing';
import { FIXTURE_REALM } from '@core';
import { pressClasses } from '@kit';
import { cryptIdleForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, freshRealm, isRefusal, onActive, splitAt, type RealmBoards, type Refusal, type Tile } from './model/boards';
import { toStored } from './model/persist';
import page from './page';
import { resetFixtureSessions, setListDown } from './fixtures';
import strings from './strings.en.json';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
// Web tiles the Hub frames (under fixture mode's proxy domain): an outside site would draw a card, not a frame.
const web = (path: string): Tile => ({ url: 'https://docs.fixture.invalid/' + path });
function withTiles(...tiles: Tile[]): RealmBoards {
  let s = freshRealm(rand);
  for (const t of tiles) s = must(onActive(s, (b) => { const r = addTile(b, t, rand); return isRefusal(r) ? r : r.board; }));
  return s;
}
async function open(s: RealmBoards) {
  await renderPage(page);
  await screen.findByRole('group', { name: 'Board tiles' });
  await act(async () => {
    await cryptIdleForTests();
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}
const area = () => screen.getByRole('group', { name: 'Board tiles' });
const tiles = () => [...area().querySelectorAll<HTMLElement>('[role="group"][id]')];
const headOf = (tile: HTMLElement) => tile.querySelector<HTMLElement>('[class*="head"]') as HTMLElement;
function press(el: HTMLElement, pointerType: 'mouse' | 'touch', x = 40, y = 10, pointerId = 1) {
  const ev = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  Object.defineProperty(ev, 'pointerId', { value: pointerId });
  act(() => { el.dispatchEvent(ev); });
}
const at = (type: string, x: number, y: number, pointerId = 1) => act(() => {
  const ev = new MouseEvent(type, { clientX: x, clientY: y });
  Object.defineProperty(ev, 'pointerId', { value: pointerId });
  window.dispatchEvent(ev);
});
/** The tiles' addresses in Board order: a drag that moved nothing leaves them as they were. */
const order = () => tiles().map((x) => x.getAttribute('aria-label') ?? '');
/** Another tab writes the Board (as open does): the page takes it while a press is held. */
async function store(s: RealmBoards) {
  await act(async () => {
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}
const CANCEL = 'Release to cancel';

beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  resetBoardsForTests();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('drag feedback on a tile header', () => {
  it('a mouse press marks the tile at once, before any move; a release without a drag clears it', async () => {
    await open(withTiles(web('a'), web('b')));
    await waitFor(() => expect(tiles()).toHaveLength(2));
    const [first, second] = tiles() as [HTMLElement, HTMLElement];
    press(headOf(first), 'mouse');
    expect(first.getAttribute('data-pressed')).toBe('press');
    expect(second.hasAttribute('data-pressed')).toBe(false);
    // The kit draws it: the ring on the tile, the fill on its header.
    expect(first.classList.contains(pressClasses('press').card!)).toBe(true);
    expect(headOf(first).classList.contains(pressClasses('press').head!)).toBe(true);
    expect(second.classList.contains(pressClasses('press').card!)).toBe(false);
    at('pointerup', 40, 10);
    await waitFor(() => expect(first.hasAttribute('data-pressed')).toBe(false));
    expect(first.classList.contains(pressClasses('press').card!)).toBe(false);
  });

  it('dragging while still over the tile it started on outlines it with "Release to cancel"; elsewhere, Swap', async () => {
    await open(withTiles(web('a'), web('b')));
    await waitFor(() => expect(tiles()).toHaveLength(2));
    const [first] = tiles() as [HTMLElement];
    press(headOf(first), 'mouse', 40, 10);
    at('pointermove', 300, 400);
    expect(await screen.findByText(CANCEL)).toBeInTheDocument();
    expect(first.getAttribute('data-pressed')).toBe('press');
    at('pointermove', 960, 400);
    expect(await screen.findByText(strings['drag.swap'])).toBeInTheDocument();
    expect(screen.queryByText(CANCEL)).toBeNull();
    const before = order();
    at('pointermove', 300, 400);
    at('pointerup', 300, 400);
    await waitFor(() => expect(first.hasAttribute('data-pressed')).toBe(false));
    expect(screen.queryByText(CANCEL)).toBeNull();
    expect(order()).toEqual(before);
  });

  it('a touch hold held still shows "Release to cancel" once the hold passes, and releasing there moves nothing', async () => {
    await open(withTiles(web('a'), web('b')));
    await waitFor(() => expect(tiles()).toHaveLength(2));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const [first] = tiles() as [HTMLElement];
    const before = order();
    press(headOf(first), 'touch', 300, 10);
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByText(CANCEL)).toBeInTheDocument();
    at('pointerup', 300, 10);
    await waitFor(() => expect(screen.queryByText(CANCEL)).toBeNull());
    expect(first.hasAttribute('data-pressed')).toBe(false);
    expect(order()).toEqual(before);
  });

  it('a touch released before the hold, or a cancelled pointer, clears the mark and never starts a drag', async () => {
    await open(withTiles(web('a'), web('b')));
    await waitFor(() => expect(tiles()).toHaveLength(2));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const [first] = tiles() as [HTMLElement];
    const before = order();
    press(headOf(first), 'touch');
    act(() => { vi.advanceTimersByTime(200); });
    at('pointerup', 40, 10);
    act(() => { vi.advanceTimersByTime(400); });
    expect(first.hasAttribute('data-pressed')).toBe(false);
    expect(screen.queryByText(CANCEL)).toBeNull();
    press(headOf(first), 'mouse');
    at('pointermove', 960, 400);
    expect(await screen.findByText(strings['drag.swap'])).toBeInTheDocument();
    at('pointercancel', 960, 400);
    await waitFor(() => expect(first.hasAttribute('data-pressed')).toBe(false));
    expect(screen.queryByText(strings['drag.swap'])).toBeNull();
    at('pointerup', 960, 400);
    expect(order()).toEqual(before);
  });

  it('one gesture at a time: a second pointer neither marks its tile nor moves or ends the first one', async () => {
    await open(withTiles(web('a'), web('b')));
    await waitFor(() => expect(tiles()).toHaveLength(2));
    const [first, second] = tiles() as [HTMLElement, HTMLElement];
    const before = order();
    press(headOf(first), 'mouse', 40, 10, 1);
    press(headOf(second), 'mouse', 700, 10, 2);
    expect(second.hasAttribute('data-pressed')).toBe(false);
    at('pointermove', 960, 400, 2);
    expect(screen.queryByText(strings['drag.swap'])).toBeNull();
    at('pointerup', 960, 400, 2);
    expect(first.getAttribute('data-pressed')).toBe('press');
    at('pointerup', 40, 10, 1);
    await waitFor(() => expect(first.hasAttribute('data-pressed')).toBe(false));
    expect(order()).toEqual(before);
  });

  it('the Board changing under a press (its tiles swapped in another tab) ends it: no tile stays marked, and a move or release then does nothing', async () => {
    const s = withTiles(web('a'), web('b'));
    await open(s);
    await waitFor(() => expect(tiles()).toHaveLength(2));
    const [first] = tiles() as [HTMLElement];
    // Pressed, not yet dragging (a drag holds the state: another tab's write then waits for its release).
    press(headOf(first), 'mouse');
    expect(first.getAttribute('data-pressed')).toBe('press');
    const b = s.boards[0]!;
    const [x, y] = Object.keys(b.tiles);
    await store({ ...s, boards: [{ ...b, tiles: { ...b.tiles, [x!]: b.tiles[y!]!, [y!]: b.tiles[x!]! } }] });
    await waitFor(() => expect(tiles().some((t) => t.hasAttribute('data-pressed'))).toBe(false));
    const swapped = order();
    at('pointermove', 960, 400);
    expect(screen.queryByText(strings['drag.swap'])).toBeNull();
    at('pointerup', 960, 400);
    expect(order()).toEqual(swapped);
  });

  it('a click-only header (a maximised tile) enters on its own release only: not on another pointer\'s, nor after a cancel', async () => {
    const s = withTiles(web('a'), web('b'));
    const b = s.boards[0]!;
    await open({ ...s, boards: [{ ...b, max: b.active }] });
    await waitFor(() => expect(tiles().filter((x) => x.getAttribute('aria-hidden') === 'true')).toHaveLength(1));
    const only = tiles().find((x) => x.getAttribute('aria-hidden') !== 'true') as HTMLElement;
    const head = headOf(only);
    const inside = () => only.getAttribute('data-hub-keys') === 'frame';
    const upOn = (el: HTMLElement, pointerId: number, type = 'pointerup') => act(() => {
      const ev = new MouseEvent(type, { bubbles: true, clientX: 40, clientY: 10 });
      Object.defineProperty(ev, 'pointerId', { value: pointerId });
      el.dispatchEvent(ev);
    });
    expect(inside()).toBe(false);
    press(head, 'mouse', 40, 10, 1);
    upOn(head, 2);
    upOn(head, 1, 'pointercancel');
    upOn(head, 1);
    await new Promise((r) => setTimeout(r, 50));
    expect(inside()).toBe(false);
    press(head, 'mouse', 40, 10, 1);
    upOn(head, 1);
    await waitFor(() => expect(inside()).toBe(true));
  });

  it('the only tile on a wide Board is never marked: there is nowhere to move it', async () => {
    await open(withTiles(web('a')));
    await waitFor(() => expect(tiles()).toHaveLength(1));
    const [only] = tiles() as [HTMLElement];
    press(headOf(only), 'mouse');
    expect(only.hasAttribute('data-pressed')).toBe(false);
    at('pointermove', 600, 400);
    expect(screen.queryByText(CANCEL)).toBeNull();
    at('pointerup', 600, 400);
  });

  it('an empty slot\'s header gets the same kit marks: the ring on the slot, the fill on its header', async () => {
    let s = freshRealm(rand);
    s = must(onActive(s, (b) => {
      const r = addTile(b, web('a'), rand);
      if (isRefusal(r)) return r;
      const sp = splitAt(r.board, r.slot, 'right', rand);
      return isRefusal(sp) ? sp : sp.board;
    }));
    await open(s);
    const empty = await screen.findByRole('group', { name: strings['empty.chip'] });
    press(headOf(empty), 'mouse');
    expect(empty.getAttribute('data-pressed')).toBe('press');
    expect(empty.classList.contains(pressClasses('press').card!)).toBe(true);
    expect(headOf(empty).classList.contains(pressClasses('press').head!)).toBe(true);
    at('pointerup', 40, 10);
    await waitFor(() => expect(empty.hasAttribute('data-pressed')).toBe(false));
    // A touch hold on it: the hold bar with its hold time, then the press once the hold passes.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    press(headOf(empty), 'touch');
    expect(empty.getAttribute('data-pressed')).toBe('hold');
    expect(headOf(empty).classList.contains(pressClasses('hold').head!)).toBe(true);
    expect(headOf(empty).style.getPropertyValue('--press-hold')).toBe('400ms');
    act(() => { vi.advanceTimersByTime(400); });
    expect(empty.getAttribute('data-pressed')).toBe('press');
    at('pointerup', 40, 10);
    await waitFor(() => expect(empty.hasAttribute('data-pressed')).toBe(false));
  });

  it('a touch press shows the hold first, then the pressed state once the hold passes', async () => {
    await open(withTiles(web('a'), web('b')));
    await waitFor(() => expect(tiles()).toHaveLength(2));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const [first] = tiles() as [HTMLElement];
    press(headOf(first), 'touch');
    expect(first.getAttribute('data-pressed')).toBe('hold');
    // The kit's hold bar on the header fills over the hold time (--press-hold), and the hold ends at exactly that time.
    expect(headOf(first).classList.contains(pressClasses('hold').head!)).toBe(true);
    expect(headOf(first).style.getPropertyValue('--press-hold')).toBe('400ms');
    act(() => { vi.advanceTimersByTime(399); });
    expect(first.getAttribute('data-pressed')).toBe('hold');
    act(() => { vi.advanceTimersByTime(1); });
    expect(first.getAttribute('data-pressed')).toBe('press');
    at('pointerup', 40, 10);
    await waitFor(() => expect(first.hasAttribute('data-pressed')).toBe(false));
  });

  it('a header that cannot drag (a maximised tile) is never marked', async () => {
    const s = withTiles(web('a'), web('b'));
    const b = s.boards[0]!;
    await open({ ...s, boards: [{ ...b, max: b.active }] });
    // The maximised tile is the one shown; the other stays mounted, hidden (aria-hidden, inert).
    await waitFor(() => expect(tiles().filter((x) => x.getAttribute('aria-hidden') === 'true')).toHaveLength(1));
    const only = tiles().find((x) => x.getAttribute('aria-hidden') !== 'true') as HTMLElement;
    press(headOf(only), 'mouse');
    expect(only.hasAttribute('data-pressed')).toBe(false);
    at('pointerup', 40, 10);
  });
});
