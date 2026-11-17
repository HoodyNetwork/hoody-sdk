/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first; the page
   reaches storage only through core */
// Vitest, S-strip: a tile header dragged onto a strip tab moves the tile to that Board, and
// dropped on New Board makes a Board named after it; the tab or New Board under the pointer is drawn as the drop place.
// What moves is captured when the drag starts: a tile closed in another tab mid-drag is not moved, and the toast says so.
// The open Board's own tab is no drop place, and a release drops only on the place drawn (a strip scrolled under a
// still pointer draws it again).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, waitFor } from '@app/testing';
import { FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import type * as Kit from '@kit';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, closeSlot, createBoard, findTileSlot, freshRealm, isRefusal, onActive, renameBoard, type RealmBoards, type Refusal, type Tile } from './model/boards';
import { parseRealmBoards, toStored } from './model/persist';
import page from './page';
import { resetFixtureSessions, setListDown } from './fixtures';
import strings from './strings.en.json';

type Toast = { title: string; action?: { label: string; onAction: () => void } };
const seen = vi.hoisted(() => ({ toasts: [] as Toast[] }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return { ...kit, showToast: (x: Toast) => { seen.toasts.push(x); return 'toast-' + seen.toasts.length; } };
});

const S = strings;
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
// Web tiles the Hub frames (under fixture mode's proxy domain): an outside site would draw a card, not a frame.
const web = (path: string): Tile => ({ url: 'https://docs.fixture.invalid/' + path });
/** Board "Start" with two web tiles (active), Board "Other" empty. */
function realm(): RealmBoards {
  let s = freshRealm(rand);
  for (const t of [web('one'), web('two')]) s = must(onActive(s, (b) => { const r = addTile(b, t, rand); return isRefusal(r) ? r : r.board; }));
  s = must(renameBoard(s, s.boards[0]!.id, 'Start'));
  const two = must(createBoard(s, rand, 'Other'));
  return { ...two, active: s.boards[0]!.id };
}
async function store(s: RealmBoards) {
  await act(async () => {
    await cryptIdleForTests();
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}
async function open(s: RealmBoards) {
  await renderPage(page);
  await screen.findByRole('group', { name: 'Board tiles' });
  await store(s);
  await screen.findByRole('tab', { name: /Other/ });
}
const stored = async () => parseRealmBoards(JSON.parse(JSON.stringify(await storedForTests(BOARDS_KEY, FIXTURE_REALM)))).state;
const tidOf = (s: RealmBoards, path: string) => s.boards.flatMap((b) => Object.values(b.tiles)).find((t) => t && 'url' in t && t.url.endsWith('/' + path))?.tid as string;
const boardOf = (s: RealmBoards, tid: string) => s.boards.filter((b) => findTileSlot(b, tid) !== null).map((b) => b.name);
const area = () => screen.getByRole('group', { name: 'Board tiles' });
/** The tile showing docs.fixture.invalid/<path>: its header. */
const headOf = (path: string) => {
  const g = [...area().querySelectorAll<HTMLElement>('[role="group"][id]')].find((x) => (x.querySelector('iframe')?.getAttribute('src') ?? '').endsWith('docs.fixture.invalid/' + path))!;
  return g.querySelector<HTMLElement>('[class*="head"]')!;
};
const tabLabel = (name: RegExp) => screen.getByRole('tab', { name }).querySelector<HTMLElement>('[data-tab-id]')!;
const newDrop = () => document.querySelector<HTMLElement>('[data-board-new-drop]')!;
/** What the browser finds under the pointer while the drag is over the strip (jsdom lays nothing out). */
let under: Element | null = null;
const at = (type: string, x: number, y: number) => act(() => { window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y })); });
function dragOnto(head: HTMLElement, el: Element | null) {
  act(() => { head.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 40, clientY: 10 })); });
  under = el;
  at('pointermove', 60, 5);
  at('pointermove', 80, 5);
}

beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  resetBoardsForTests();
  seen.toasts = [];
  under = null;
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => under });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
});

describe('dragging a tile onto the Board strip', () => {
  it('onto a Board tab: the tab is drawn as the drop place, and the release moves the tile there, stored', async () => {
    const s0 = realm();
    await open(s0);
    const tid = tidOf(s0, 'one');
    dragOnto(headOf('one'), tabLabel(/Other/));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Other/ }).hasAttribute('data-drop-target')).toBe(true));
    expect(screen.getByRole('tab', { name: /Start/ }).hasAttribute('data-drop-target')).toBe(false);
    at('pointerup', 80, 5);
    await waitFor(async () => expect(boardOf(await stored(), tid)).toEqual(['Other']));
    expect(boardOf(await stored(), tidOf(s0, 'two'))).toEqual(['Start']);
    await waitFor(() => expect(seen.toasts.some((x) => x.action?.label === S['move.back'])).toBe(true));
    expect(screen.getByRole('tab', { name: /Other/ }).hasAttribute('data-drop-target')).toBe(false);
  });

  it('onto New Board: drawn as the drop place; the release makes a Board named after the tile, holding it', async () => {
    const s0 = realm();
    await open(s0);
    const tid = tidOf(s0, 'two');
    dragOnto(headOf('two'), newDrop());
    await waitFor(() => expect(newDrop().hasAttribute('data-drop-target')).toBe(true));
    at('pointerup', 80, 5);
    await waitFor(async () => expect((await stored()).boards).toHaveLength(3));
    const made = (await stored()).boards[2]!;
    expect(made.name).toMatch(/docs\.fixture\.invalid/);
    expect(boardOf(await stored(), tid)).toEqual([made.name]);
  });

  it('the open Board\'s own tab is no drop place: releasing there moves nothing', async () => {
    const s0 = realm();
    await open(s0);
    dragOnto(headOf('one'), tabLabel(/Start/));
    expect(screen.getByRole('tab', { name: /Start/ }).hasAttribute('data-drop-target')).toBe(false);
    at('pointerup', 80, 5);
    await act(() => cryptIdleForTests());
    expect(boardOf(await stored(), tidOf(s0, 'one'))).toEqual(['Start']);
    expect(seen.toasts).toEqual([]);
  });

  it('a strip place that differs at the release from the one drawn drops nothing: no move, no new Board', async () => {
    const s0 = realm();
    await open(s0);
    dragOnto(headOf('one'), tabLabel(/Other/));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Other/ }).hasAttribute('data-drop-target')).toBe(true));
    under = newDrop();
    at('pointerup', 80, 5);
    await act(() => cryptIdleForTests());
    const st = await stored();
    expect(boardOf(st, tidOf(s0, 'one'))).toEqual(['Start']);
    expect(st.boards.map((b) => b.name)).toEqual(['Start', 'Other']);
    expect(seen.toasts).toEqual([]);
  });

  it('the strip scrolling under a still pointer draws the drop place again; what was drawn before is not dropped on', async () => {
    const s0 = realm();
    await open(s0);
    dragOnto(headOf('one'), tabLabel(/Other/));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Other/ }).hasAttribute('data-drop-target')).toBe(true));
    under = null;
    act(() => { screen.getByRole('tablist').dispatchEvent(new Event('scroll')); });
    await waitFor(() => expect(screen.getByRole('tab', { name: /Other/ }).hasAttribute('data-drop-target')).toBe(false));
    under = tabLabel(/Other/);
    at('pointerup', 80, 5);
    await act(() => cryptIdleForTests());
    expect(boardOf(await stored(), tidOf(s0, 'one'))).toEqual(['Start']);
    expect(seen.toasts).toEqual([]);
  });

  it('a tile closed in another tab during the drag is not moved: the toast says so, and Other stays empty', async () => {
    const s0 = realm();
    await open(s0);
    const tid = tidOf(s0, 'one');
    dragOnto(headOf('one'), tabLabel(/Other/));
    const now = await stored();
    const start = now.boards.find((b) => b.name === 'Start')!;
    await store({ ...now, boards: now.boards.map((b) => (b.id === start.id ? must(closeSlot(start, findTileSlot(start, tid)!)) : b)) });
    at('pointerup', 80, 5);
    const stale = new RegExp('^' + S['move.stale'].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{\\{name\\}\\}', '.+') + '$');
    await waitFor(() => expect(seen.toasts.some((x) => stale.test(x.title))).toBe(true));
    const st = await stored();
    expect(boardOf(st, tid)).toEqual([]);
    expect(Object.values(st.boards.find((b) => b.name === 'Other')!.tiles).filter(Boolean)).toHaveLength(0);
  });
});
