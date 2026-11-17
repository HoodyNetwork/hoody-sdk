// Focus on switch: a chip tap and a pointer on a live tile's body enter the tile (its frame takes focus); a card
// tile's chip hands focus to the Board surface; the Empty chip and a long press only switch or open the menu; plain
// arrows stay Board moves and Ctrl+Alt+arrow enters (pins).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, duplicateBoard, freshRealm, isRefusal, onActive, setActiveBoard, splitAt, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { toStored } from './model/persist';
import page from './page';
import { resetFixtureSessions } from './fixtures';
import { LONG_PRESS_MS } from './parts/Chips';

const byName = (n: string) => fixtureWorld.computers.find((c) => c.name === n)!;
const atlas = byName('atlas');
const cedar = byName('cedar');
const tileOf = (c: { id: string; project_id: string }, program: TileRef['program'], session = 1): TileRef => ({ project: c.project_id, computer: c.id, program, session, ...(program === 'files' ? { view: 'root' } : {}) });
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
function withTiles(...tiles: TileRef[]): RealmBoards {
  let s = freshRealm(rand);
  for (const t of tiles) s = must(onActive(s, (b): Board | Refusal => { const r = addTile(b, t, rand); return isRefusal(r) ? r : r.board; }));
  return s;
}
async function open(s: RealmBoards) {
  await renderPage(page);
  await screen.findByRole('group', { name: 'Board tiles' });
  await act(async () => {
    await cryptIdleForTests();
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}
const area = () => screen.getByRole('group', { name: 'Board tiles' });
const tile = (name: RegExp) => screen.getByRole('group', { name });
const frameOf = (title: string) => screen.getByTitle(title);
let size = { w: 1280, h: 800 };
beforeEach(() => {
  resetFixtureSessions();
  resetBoardsForTests();
  size = { w: 1280, h: 800 };
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size.w);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size.h);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('a chip tap enters the tile', () => {
  it('a tap on a live tile\'s chip shows it and its frame takes focus', async () => {
    size = { w: 400, h: 500 };
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    const chips = await screen.findByRole('toolbar', { name: 'Tiles' });
    await screen.findByTitle('terminal-1 on atlas');
    await user.click(within(chips).getByRole('button', { name: /terminal-1/ }));
    await waitFor(() => expect(document.activeElement).toBe(frameOf('terminal-1 on atlas')));
    expect(tile(/terminal-1/).getAttribute('data-hub-keys')).toBe('frame');
  });

  it('Enter on a focused chip does the same', async () => {
    size = { w: 400, h: 500 };
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    const chips = await screen.findByRole('toolbar', { name: 'Tiles' });
    await screen.findByTitle('terminal-1 on atlas');
    act(() => within(chips).getByRole('button', { name: /terminal-1/ }).focus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(frameOf('terminal-1 on atlas')));
  });

  it('a card tile\'s chip shows the card and hands focus to the Board surface', async () => {
    size = { w: 400, h: 500 };
    const user = userEvent.setup();
    await open(withTiles(tileOf(cedar, 'terminal'), tileOf(atlas, 'files')));
    const chips = await screen.findByRole('toolbar', { name: 'Tiles' });
    await screen.findByTitle('files-1 on atlas');
    await user.click(within(chips).getByRole('button', { name: /cedar/ }));
    await waitFor(() => expect(document.activeElement).toBe(area()));
    expect(document.querySelectorAll('[data-hub-keys="frame"]')).toHaveLength(0);
  });

  it('the Empty chip only shows the empty slot: no picker, no frame focus', async () => {
    size = { w: 400, h: 500 };
    const user = userEvent.setup();
    const s = must(onActive(withTiles(tileOf(atlas, 'terminal')), (b): Board | Refusal => { const r = splitAt(b, b.active, 'right', rand); return isRefusal(r) ? r : r.board; }));
    await open(s);
    const chips = await screen.findByRole('toolbar', { name: 'Tiles' });
    await screen.findByTitle('terminal-1 on atlas');
    await user.click(within(chips).getByRole('button', { name: /terminal-1/ }));
    await waitFor(() => expect(document.activeElement).toBe(frameOf('terminal-1 on atlas')));
    await user.click(within(chips).getByRole('button', { name: 'Empty' }));
    expect(within(chips).getByRole('button', { name: 'Empty' }).getAttribute('aria-current')).toBe('true');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement?.tagName).not.toBe('IFRAME');
  });

  it('a long press opens the tile menu and does not enter', async () => {
    size = { w: 400, h: 500 };
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    const chips = await screen.findByRole('toolbar', { name: 'Tiles' });
    await screen.findByTitle('terminal-1 on atlas');
    const chip = within(chips).getByRole('button', { name: /terminal-1/ });
    await user.pointer({ keys: '[MouseLeft>]', target: chip });
    await act(() => new Promise((r) => setTimeout(r, LONG_PRESS_MS + 100)));
    await user.pointer({ keys: '[/MouseLeft]', target: chip });
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(document.activeElement?.tagName).not.toBe('IFRAME');
  });
});

describe('a pointer on a live tile\'s body enters it', () => {
  it('a click on the loading skeleton over the frame enters the tile', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    const frame = await screen.findByTitle('terminal-1 on atlas');
    const skeleton = frame.parentElement?.querySelector('[aria-hidden="true"]:has(> i)') as HTMLElement | null;
    expect(skeleton).not.toBeNull();
    await user.click(skeleton as HTMLElement);
    await waitFor(() => expect(document.activeElement).toBe(frame));
    expect(tile(/terminal-1/).getAttribute('data-hub-keys')).toBe('frame');
  });

  it('a touch tap on the skeleton enters, and the touch\'s compatibility mousedown does not take the focus back', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    const frame = await screen.findByTitle('terminal-1 on atlas');
    const skeleton = frame.parentElement?.querySelector('[aria-hidden="true"]:has(> i)') as HTMLElement;
    await user.pointer([{ keys: '[TouchA>]', target: skeleton }, { keys: '[/TouchA]', target: skeleton }]);
    await waitFor(() => expect(document.activeElement).toBe(frame));
    await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(document.activeElement).toBe(frame);
  });

  it('a second finger touching the body while the first is held leaves the first finger\'s press alone', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    const frame = await screen.findByTitle('terminal-1 on atlas');
    const skeleton = frame.parentElement?.querySelector('[aria-hidden="true"]:has(> i)') as HTMLElement;
    await user.pointer([
      { keys: '[TouchA>]', target: skeleton },
      { keys: '[TouchB>]', target: skeleton },
      { keys: '[/TouchB]', target: skeleton },
      { keys: '[/TouchA]', target: skeleton },
    ]);
    await waitFor(() => expect(document.activeElement).toBe(frame));
  });

  it('a press held across a switch to a duplicated Board (same slots, the tile kept) enters nothing on release', async () => {
    const user = userEvent.setup();
    const one = withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files'));
    const firstId = one.active;
    const two = must(setActiveBoard(must(duplicateBoard(one, firstId, rand)), firstId));
    await open(two);
    const frame = await screen.findByTitle('terminal-1 on atlas');
    const tileRoot = tile(/terminal-1/);
    const skeleton = frame.parentElement?.querySelector('[aria-hidden="true"]:has(> i)') as HTMLElement;
    await user.pointer({ keys: '[MouseLeft>]', target: skeleton, coords: { clientX: 10, clientY: 10 } });
    act(() => area().focus());
    await user.keyboard('2');
    await waitFor(() => expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true'));
    // React kept the pressed tile's root (same slot key): this exercises Board-switch cancellation on a retained tile root (the
    // switch's disposal on board.id, and the entry's own Board check).
    const kept = tile(/terminal-1/);
    expect(kept).toBe(tileRoot);
    const target = (kept.querySelector('[aria-hidden="true"]:has(> i)') as HTMLElement | null) ?? kept;
    await user.pointer({ keys: '[/MouseLeft]', target, coords: { clientX: 10, clientY: 10 } });
    await act(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
    expect(document.activeElement?.tagName).not.toBe('IFRAME');
  });

  it('a pointer that moves away (a scroll) does not enter', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    const frame = await screen.findByTitle('terminal-1 on atlas');
    const skeleton = frame.parentElement?.querySelector('[aria-hidden="true"]:has(> i)') as HTMLElement;
    await user.pointer([
      { keys: '[MouseLeft>]', target: skeleton, coords: { clientX: 10, clientY: 10 } },
      { target: skeleton, coords: { clientX: 10, clientY: 60 } },
      { keys: '[/MouseLeft]', target: skeleton, coords: { clientX: 10, clientY: 60 } },
    ]);
    await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(document.activeElement).not.toBe(frame);
  });

  it('a gesture the browser takes over (pointercancel) does not enter', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    const frame = await screen.findByTitle('terminal-1 on atlas');
    const skeleton = frame.parentElement?.querySelector('[aria-hidden="true"]:has(> i)') as HTMLElement;
    await user.pointer({ keys: '[MouseLeft>]', target: skeleton, coords: { clientX: 10, clientY: 10 } });
    act(() => { skeleton.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, clientX: 10, clientY: 10, pointerId: 1, isPrimary: true })); });
    await user.pointer({ keys: '[/MouseLeft]', target: skeleton, coords: { clientX: 10, clientY: 10 } });
    await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(document.activeElement).not.toBe(frame);
  });

  it('a control in the body keeps its own press: Back to Board does not enter', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    const frame = await screen.findByTitle('terminal-1 on atlas');
    const focusSpy = vi.spyOn(HTMLIFrameElement.prototype, 'focus');
    await user.click(within(tile(/terminal-1/)).getByRole('button', { name: /Back/ }));
    await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(focusSpy).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(frame);
    expect(document.activeElement).toBe(area());
  });

  it('a card tile is unchanged: a click on it does not move focus into the card', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(cedar, 'terminal'), tileOf(atlas, 'files')));
    await screen.findByTitle('files-1 on atlas');
    const card = tile(/cedar/);
    act(() => area().focus());
    const body = card.lastElementChild as HTMLElement;
    await user.pointer([{ keys: '[MouseLeft>]', target: body }, { keys: '[/MouseLeft]', target: body }]);
    await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(document.activeElement?.tagName).not.toBe('IFRAME');
    expect(card.getAttribute('data-hub-keys')).toBeNull();
  });
});

describe('plain arrows stay Board moves, Ctrl+Alt+arrow enters', () => {
  it('ArrowRight moves the active tile and focus stays on the Board; Ctrl+Alt+ArrowLeft enters', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    await screen.findByTitle('terminal-1 on atlas');
    await screen.findByTitle('files-1 on atlas');
    act(() => area().focus());
    await user.keyboard('{ArrowLeft}');
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(document.activeElement).toBe(area());
    await user.keyboard('{ArrowRight}');
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(document.activeElement).toBe(area());
    await user.keyboard('{Control>}{Alt>}{ArrowLeft}{/Alt}{/Control}');
    await waitFor(() => expect(document.activeElement?.tagName).toBe('IFRAME'));
  });
});
