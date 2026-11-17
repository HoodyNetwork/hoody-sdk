// Board scroll mode, mounted: the Board menu toggle, the taller area, storage and following the
// active tile. The geometry itself is scroll/geom.test.ts.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { fixtureWorld, FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { focusSlot, freshRealm, isRefusal, setTile, splitAt, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { toStored } from './model/persist';
import { tileBoxes } from './model/geom';
import { boardHeight, scrollStyles, withMode } from './scroll';
import page from './page';

vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, showToast: () => 'toast-1' };
});

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const tileOf = (program: TileRef['program'], session = 1): TileRef => ({ project: atlas.project_id, computer: atlas.id, program, session, ...(program === 'files' ? { view: 'root' } : {}) });
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
/** Tiles stacked top to bottom (each new one splits the last downward): halves, then quarters. */
function stack(...tiles: TileRef[]): RealmBoards {
  const s = freshRealm(rand);
  let b = must(setTile(s.boards[0] as Board, (s.boards[0] as Board).active, tiles[0] as TileRef, rand));
  for (const t of tiles.slice(1)) {
    const r = must(splitAt(b, b.active, 'down', rand));
    b = must(setTile(r.board, r.slot, t, rand));
  }
  return { ...s, boards: [b] };
}
const three = () => stack(tileOf('terminal', 1), tileOf('terminal', 2), tileOf('terminal', 3));
const onBoard = (s: RealmBoards, f: (b: Board) => Board): RealmBoards => ({ ...s, boards: [f(s.boards[0] as Board)] });

// The Board view is a lazy chunk: warmed once here, so no test's first wait spends its time on the cold transform.
beforeAll(async () => { await page.load(); }, 180_000);

async function open(s: RealmBoards) {
  await renderPage(page);
  // The strip shows once the account's store has opened: wait for that, then for the tab.
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
const stored = async (): Promise<RealmBoards | undefined> => ((await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards | null) ?? undefined;
const area = () => screen.getByRole('group', { name: 'Board tiles' });
const view = () => area().parentElement as HTMLElement;
const areaHeight = () => area().style.height;
async function menu(user: ReturnType<typeof userEvent.setup>, item: RegExp, role: 'menuitem' | 'menuitemcheckbox' = 'menuitem') {
  await user.click(await screen.findByRole('button', { name: 'Layout' }));
  await user.click(await screen.findByRole(role, { name: item }));
}

let size = { w: 1280, h: 500 };
let scrolled: number[] = [];
const hadScrollTo = Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'scrollTo');
const oldScrollTo = HTMLElement.prototype.scrollTo;
beforeEach(() => {
  resetBoardsForTests();
  size = { w: 1280, h: 500 };
  scrolled = [];
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size.w);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size.h);
  HTMLElement.prototype.scrollTo = function (this: HTMLElement, o?: ScrollToOptions | number) {
    const top = typeof o === 'object' ? o.top ?? 0 : 0;
    scrolled.push(top);
    this.scrollTop = top;
  } as typeof HTMLElement.prototype.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  if (hadScrollTo) HTMLElement.prototype.scrollTo = oldScrollTo;
  else delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
});

describe('Board scroll mode', () => {
  it('in Fit a tall stack shows one tile at a time; Layout › Scroll shows every tile in a taller area that scrolls', async () => {
    const user = userEvent.setup();
    await open(three());
    // Fit: the quarters would be under 160 px in 500, so one tile at a time and no dividers.
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
    expect(areaHeight()).toBe('');
    expect(view().classList.contains(scrollStyles.scroll as string)).toBe(false);
    await menu(user, /^Scroll$/, 'menuitemcheckbox');
    await waitFor(() => expect(screen.getAllByRole('separator')).toHaveLength(2));
    expect(parseFloat(areaHeight())).toBeGreaterThan(size.h);
    expect(view().classList.contains(scrollStyles.scroll as string)).toBe(true);
  });

  it('the Layout menu\'s Scroll entry is a checkbox item: checked, with a check, only while the Board scrolls', async () => {
    const user = userEvent.setup();
    await open(three());
    await user.click(screen.getByRole('button', { name: 'Layout' }));
    const off = await screen.findByRole('menuitemcheckbox', { name: 'Scroll' });
    expect(off).toHaveAttribute('aria-checked', 'false');
    expect(off.querySelector('svg')).toBeNull();
    await user.click(off);
    await user.click(await screen.findByRole('button', { name: 'Layout' }));
    const on = await screen.findByRole('menuitemcheckbox', { name: 'Scroll' });
    expect(on).toHaveAttribute('aria-checked', 'true');
    expect(on.querySelector('svg')).not.toBeNull();
  });

  it('a short layout in Scroll stays the view height', async () => {
    const user = userEvent.setup();
    size = { w: 1280, h: 800 };
    await open(stack(tileOf('terminal', 1), tileOf('terminal', 2)));
    await menu(user, /^Scroll$/, 'menuitemcheckbox');
    await waitFor(() => expect(areaHeight()).toBe('800px'));
  });

  it('Scroll is stored on the Board, and going back to Fit stores the Board as it was', async () => {
    const user = userEvent.setup();
    const s = three();
    await open(s);
    await menu(user, /^Scroll$/, 'menuitemcheckbox');
    await waitFor(async () => expect((await stored())?.boards[0]?.mode).toBe('scroll'));
    await menu(user, /^Scroll$/, 'menuitemcheckbox');
    await waitFor(async () => expect((await stored())?.boards[0]).not.toHaveProperty('mode'));
    expect(JSON.stringify((await stored())?.boards[0])).toBe(JSON.stringify(toStored(s).boards[0]));
    expect(areaHeight()).toBe('');
  });

  it('a stored Scroll Board opens scrolling; a save without the field opens in Fit, unchanged', async () => {
    await open(onBoard(three(), (b) => withMode(b, 'scroll')));
    expect(parseFloat(areaHeight())).toBeGreaterThan(size.h);
    await screen.findByRole('button', { name: 'Boards' });
  });

  it('a save written before the field existed loads in Fit and is not rewritten', async () => {
    const s = three();
    await open(s);
    expect(areaHeight()).toBe('');
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); await cryptIdleForTests(); });
    expect(JSON.stringify(await stored())).toBe(JSON.stringify(toStored(s)));
  });

  it('moving down with the keyboard scrolls the active tile into view; the top tile needs no scroll', async () => {
    const user = userEvent.setup();
    const s = onBoard(three(), (b) => withMode(must(focusSlot(b, Object.keys(b.tiles)[0] as string)), 'scroll'));
    await open(s);
    expect(view().scrollTop).toBe(0);
    act(() => area().focus());
    await user.keyboard('j');
    await user.keyboard('j');
    await waitFor(() => expect(view().scrollTop).toBeGreaterThan(0));
    const down = view().scrollTop;
    await user.keyboard('k');
    await user.keyboard('k');
    await waitFor(() => expect(view().scrollTop).toBeLessThan(down));
  });

  it('a Board in Scroll keeps its scrollbar gutter while it shows one tile at a time, so its measured width never flips', async () => {
    size = { w: 200, h: 500 };
    await open(onBoard(three(), (b) => withMode(b, 'scroll')));
    expect(view().classList.contains(scrollStyles.gutter as string)).toBe(true);
    expect(view().classList.contains(scrollStyles.scroll as string)).toBe(false);
    expect(areaHeight()).toBe('');
  });

  it('a tile dragged while the view scrolls lands on the tile now under the pointer', async () => {
    const s = onBoard(three(), (b) => withMode(b, 'scroll'));
    await open(s);
    const b = s.boards[0] as Board;
    const ids = Object.keys(b.tiles);
    const boxes = tileBoxes(b.layout, size.w, boardHeight('scroll', b.layout, size.h));
    const last = boxes[ids[2] as string]!;
    let top = 0;
    vi.spyOn(area(), 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top, right: size.w, bottom: top + 2000, width: size.w, height: 2000, x: 0, y: top, toJSON: () => ({}) }) as DOMRect);
    const head = area().querySelector('[class*="head"]') as HTMLElement;
    act(() => { head.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 40, clientY: 10 })); });
    // Dragged to the middle of the screen: still over the tile itself, nothing to swap with.
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: size.w / 2, clientY: last.height / 2 })); });
    expect(screen.queryByText('Swap')).toBeNull();
    // The view scrolls the last tile up under the pointer, which has not moved: the target follows the scroll.
    top = -last.top;
    act(() => { view().dispatchEvent(new Event('scroll')); });
    expect(await screen.findByText('Swap')).toBeInTheDocument();
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: size.w / 2, clientY: last.height / 2 })); });
    await waitFor(async () => {
      const t = (await stored())?.boards[0]?.tiles ?? {};
      expect(t[ids[0] as string]).toMatchObject({ session: 3 });
      expect(t[ids[2] as string]).toMatchObject({ session: 1 });
    });
  });

  it('a release right after a scroll lands on the tile under the pointer, before the scroll event arrives', async () => {
    const s = onBoard(three(), (b) => withMode(b, 'scroll'));
    await open(s);
    const b = s.boards[0] as Board;
    const ids = Object.keys(b.tiles);
    const boxes = tileBoxes(b.layout, size.w, boardHeight('scroll', b.layout, size.h));
    const last = boxes[ids[2] as string]!;
    let top = 0;
    vi.spyOn(area(), 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top, right: size.w, bottom: top + 2000, width: size.w, height: 2000, x: 0, y: top, toJSON: () => ({}) }) as DOMRect);
    const head = area().querySelector('[class*="head"]') as HTMLElement;
    act(() => { head.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 40, clientY: 10 })); });
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: size.w / 2, clientY: last.height / 2 })); });
    expect(screen.queryByText('Swap')).toBeNull();
    // The view has scrolled the last tile under the pointer, but its scroll event is still queued at release.
    top = -last.top;
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: size.w / 2, clientY: last.height / 2 })); });
    await waitFor(async () => {
      const t = (await stored())?.boards[0]?.tiles ?? {};
      expect(t[ids[0] as string]).toMatchObject({ session: 3 });
      expect(t[ids[2] as string]).toMatchObject({ session: 1 });
    });
  });

  it('a view scrolling under a pressed header does not count toward starting a drag', async () => {
    const s = onBoard(three(), (b) => withMode(b, 'scroll'));
    await open(s);
    let top = 0;
    vi.spyOn(area(), 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top, right: size.w, bottom: top + 2000, width: size.w, height: 2000, x: 0, y: top, toJSON: () => ({}) }) as DOMRect);
    const head = area().querySelector('[class*="head"]') as HTMLElement;
    act(() => { head.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 40, clientY: 10 })); });
    // Following moved the area 100 px; the pointer itself moves 1 px, under the drag threshold.
    top = -100;
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 41, clientY: 10 })); });
    expect(area().parentElement?.querySelector('[class*="shield"]')).toBeNull();
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 41, clientY: 10 })); });
  });

  it('a divider dragged in Scroll never draws a tile under the minimum height, whatever the nested ratios', async () => {
    const user = userEvent.setup();
    await open(onBoard(three(), (b) => withMode(b, 'scroll')));
    // Make the nested split uneven first (the keyboard commits, so the area grows to fit it).
    const seps = screen.getAllByRole('separator');
    for (const sep of seps) { sep.focus(); for (let i = 0; i < 6; i++) await user.keyboard('{ArrowUp}'); }
    const tileHeights = () => [...area().querySelectorAll<HTMLElement>(':scope > [role="group"]')].map((el) => parseFloat(el.style.height)).filter((h) => !Number.isNaN(h));
    for (const i of [0, 1]) {
      for (const y of [-100000, 100000]) {
        const sep = screen.getAllByRole('separator')[i] as HTMLElement;
        act(() => { sep.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 })); });
        act(() => { sep.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: y })); });
        expect(Math.min(...tileHeights())).toBeGreaterThanOrEqual(160 - 0.01);
        act(() => { sep.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 10, clientY: y })); });
        await waitFor(() => expect(Math.min(...tileHeights())).toBeGreaterThanOrEqual(160 - 0.01));
      }
    }
  });

  it('a tile released above or below the scrolled view lands nowhere: the layout is unchanged', async () => {
    const s = onBoard(three(), (b) => withMode(b, 'scroll'));
    await open(s);
    const b = s.boards[0] as Board;
    const ids = Object.keys(b.tiles);
    const boxes = tileBoxes(b.layout, size.w, boardHeight('scroll', b.layout, size.h));
    const lastBox = boxes[ids[2] as string]!;
    // The view starts at screen y 100 and is scrolled so the last tile shows; the area starts above the screen.
    const top = 100 - lastBox.top;
    vi.spyOn(view(), 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top: 100, right: size.w, bottom: 100 + size.h, width: size.w, height: size.h, x: 0, y: 100, toJSON: () => ({}) }) as DOMRect);
    vi.spyOn(area(), 'getBoundingClientRect').mockImplementation(() => ({ left: 0, top, right: size.w, bottom: top + 2000, width: size.w, height: 2000, x: 0, y: top, toJSON: () => ({}) }) as DOMRect);
    const heads = area().querySelectorAll('[class*="head"]');
    const head = heads[heads.length - 1] as HTMLElement;
    const y0 = 100 + 10;
    act(() => { head.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 40, clientY: y0 })); });
    // Above the view: in area coordinates that is the middle of the tile above, which the view clips.
    const above = 100 - 130;
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: size.w / 2, clientY: above })); });
    expect(screen.queryByText('Swap')).toBeNull();
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: size.w / 2, clientY: above })); });
    await act(async () => { await cryptIdleForTests(); });
    const t2 = (await stored())?.boards[0]?.tiles ?? {};
    expect(t2[ids[2] as string]).toMatchObject({ session: 3 });
    expect(t2[ids[1] as string]).toMatchObject({ session: 2 });
  });

  it('a maximised tile in Scroll fills the view: no taller area, no scrolling', async () => {
    const user = userEvent.setup();
    await open(onBoard(three(), (b) => withMode(b, 'scroll')));
    act(() => area().focus());
    await user.keyboard('z');
    await waitFor(() => expect(areaHeight()).toBe(''));
    expect(view().classList.contains(scrollStyles.scroll as string)).toBe(false);
  });

  it('the Layout menu: the preset the Board shows is the one choice checked, Undo with nothing to undo says so', async () => {
    const user = userEvent.setup();
    await open(stack(tileOf('terminal', 1), tileOf('terminal', 2)));
    await user.click(screen.getByRole('button', { name: 'Layout' }));
    await screen.findByRole('menu');
    const checked = screen.getAllByRole('menuitemradio').filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toEqual([screen.getByRole('menuitemradio', { name: /^Two stacked/ })]);
    const undo = screen.getByRole('menuitem', { name: /^Undo/ });
    expect(undo).toHaveAttribute('aria-disabled', 'true');
    expect(undo).toHaveAccessibleDescription(/Nothing to undo yet/);
  });

  it('the Layout menu: every preset row leads with a picture of its panes, hidden from screen readers; the label stays the name', async () => {
    const user = userEvent.setup();
    await open(stack(tileOf('terminal', 1), tileOf('terminal', 2)));
    await user.click(screen.getByRole('button', { name: 'Layout' }));
    await screen.findByRole('menu');
    const want: Record<string, number> = { One: 1, 'Two side by side': 2, 'Two stacked': 2, 'One and two': 3, 'Grid 2 × 2': 4, 'Three columns': 3 };
    for (const [name, panes] of Object.entries(want)) {
      // "One" must not match "One and two".
      const row = screen.getByRole('menuitemradio', { name: new RegExp('^' + name + '(?! and)') });
      const pic = row.querySelector('svg');
      expect(pic, name).not.toBeNull();
      expect(pic).toHaveAttribute('aria-hidden', 'true');
      expect(pic!.querySelectorAll('rect')).toHaveLength(panes);
      expect(row).toHaveAccessibleName(new RegExp('^' + name + '(?! and)'));
    }
  });

  it('the Layout menu: a Board in no preset\'s arrangement (three stacked) has no preset checked', async () => {
    const user = userEvent.setup();
    await open(three());
    await user.click(screen.getByRole('button', { name: 'Layout' }));
    await screen.findByRole('menu');
    const radios = screen.getAllByRole('menuitemradio');
    expect(radios.length).toBeGreaterThan(1);
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toEqual([]);
  });

  it('the Layout menu judges a preset by the grown area in Scroll: a 2 × 2 grid a short window refuses in Fit is offered', async () => {
    const user = userEvent.setup();
    size = { w: 1280, h: 300 };
    await open(stack(tileOf('terminal', 1), tileOf('terminal', 2)));
    await user.click(screen.getByRole('button', { name: 'Layout' }));
    // The presets are one choice: radio rows.
    expect(await screen.findByRole('menuitemradio', { name: /Grid 2 × 2/ })).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Escape}');
    await menu(user, /^Scroll$/, 'menuitemcheckbox');
    await user.click(screen.getByRole('button', { name: 'Layout' }));
    expect(await screen.findByRole('menuitemradio', { name: /Grid 2 × 2/ })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('keyboard resize in Scroll is not held at the window\'s height: the area grows instead', async () => {
    const user = userEvent.setup();
    size = { w: 1280, h: 400 };
    // The lower tile is active: its top edge moves up.
    await open(onBoard(stack(tileOf('terminal', 1), tileOf('terminal', 2)), (b) => withMode(b, 'scroll')));
    act(() => area().focus());
    for (let i = 0; i < 6; i++) await user.keyboard('{Alt>}{Shift>}{ArrowUp}{/Shift}{/Alt}');
    // Fit would stop near 41 % (160 px of 392); Scroll goes on and the area grows.
    await waitFor(() => expect(Number(/(\d+)/.exec(screen.getByRole('separator').getAttribute('aria-valuetext') ?? '')?.[1])).toBeLessThanOrEqual(25));
    expect(parseFloat(areaHeight())).toBeGreaterThan(size.h);
  });
});
