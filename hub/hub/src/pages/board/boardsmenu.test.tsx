// Vitest: the Board's one Boards ▾ menu, mounted through the real router
// on core's fixture world. Desktop: Boards ▾ starts the strip; every Board as a one-of choice with its tile count (1-9),
// New Board, the open Board's own rows under its name (Rename in place on its tab, Move left/right, Duplicate, Close),
// Closed Boards…, Export, Import… (refused at 9 Boards, said here), Keep frames loaded, Keyboard shortcuts… (?). No ⋯ after
// the tabs: a tab's own menu opens on the tab. Phone: the same menu starts the chips row (its button the open Board's
// name, a tray titled Boards), with Rename as a dialog and an Undo row; the chips row's + is named Add a program.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, createBoard, filledCount, freshRealm, isRefusal, onActive, setActiveBoard, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { toStored } from './model/persist';
import page from './page';
import { resetFixtureSessions } from './fixtures';
import strings from './strings.en.json';

let phone = false;
let sheets = 0;
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, showToast: () => 'toast-1', useIsPhone: () => phone, openShortcutsSheet: () => { sheets++; } };
});

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const tileOf = (session: number): TileRef => ({ project: atlas.project_id, computer: atlas.id, program: 'terminal', session });
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
/** Main with `tiles` terminals, then the named Boards after it (empty); `open` the index of the open Board. */
function realm(tiles: number, names: readonly string[] = [], open = 0): RealmBoards {
  let s = freshRealm(rand);
  for (let i = 1; i <= tiles; i++) s = must(onActive(s, (b): Board | Refusal => { const r = addTile(b, tileOf(i), rand); return isRefusal(r) ? r : r.board; }));
  for (const name of names) s = must(createBoard(s, rand, name));
  return must(setActiveBoard(s, (s.boards[open] as Board).id));
}
async function open(s: RealmBoards) {
  await renderPage(page);
  await screen.findByRole('heading', { level: 1 }, { timeout: 15_000 }); // the account is open once the page is drawn
  await act(async () => {
    await cryptIdleForTests();
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}
const stored = async () => ((await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards | null) ?? undefined;
const rows = () => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
const row = (name: RegExp) => rows().find((r) => name.test(r.textContent ?? '')) ?? null;
const boardsButton = () => screen.findByRole('button', { name: strings.boards });

let size = { w: 1280, h: 800 };
beforeEach(() => {
  resetFixtureSessions();
  resetBoardsForTests();
  phone = false;
  sheets = 0;
  size = { w: 1280, h: 800 };
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size.w);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size.h);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Boards ▾ on desktop', () => {
  it('starts the strip, named Boards; the tab list is Board tabs; no Board menu at the end and no ⋯ after the tabs', async () => {
    await open(realm(1, ['Two']));
    const boards = await boardsButton();
    expect(boards).toHaveAttribute('aria-haspopup');
    expect(screen.getByRole('tablist', { name: strings['board.tabs'] })).toBeInTheDocument();
    expect(boards.compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Board menu' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Tab actions/ })).toBeNull();
  });

  it('lists every Board with its tile count as one choice, the open one checked (its mark in place of its key), 1-9 as the keys', async () => {
    await open(realm(2, ['Two', 'Three']));
    await userEvent.setup().click(await boardsButton());
    const menu = await screen.findByRole('menu', { name: strings.boards });
    const radios = within(menu).getAllByRole('menuitemradio');
    expect(radios.map((r) => (r.textContent ?? '').replace(/\d$/, ''))).toEqual(['Main · 2 tiles', 'Two · 0 tiles', 'Three · 0 tiles']);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('aria-checked', 'false');
    expect(radios.map((r) => r.querySelector('kbd')?.textContent)).toEqual([undefined, '2', '3']);
    expect(radios[0]!.querySelector('[data-current]')).not.toBeNull();
  });

  it('a Board row opens that Board', async () => {
    const user = userEvent.setup();
    await open(realm(1, ['Two']));
    await user.click(await boardsButton());
    await user.click(screen.getByRole('menuitemradio', { name: /^Two · / }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true'));
  });

  it('New Board makes a Board; at 9 Boards it stays, disabled, with the reason', async () => {
    const user = userEvent.setup();
    await open(realm(1));
    await user.click(await boardsButton());
    await user.click(row(/^New Board/)!);
    await waitFor(async () => expect((await stored())?.boards).toHaveLength(2));
  });

  it('at 9 Boards: New Board and Import… are disabled and say why; Import says it first, before any file is chosen', async () => {
    const user = userEvent.setup();
    await open(realm(1, ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9']));
    await user.click(await boardsButton());
    const make = row(/^New Board/)!;
    const imp = row(/^Import Board/)!;
    expect(make).toHaveAttribute('aria-disabled', 'true');
    expect(imp).toHaveAttribute('aria-disabled', 'true');
    expect(imp).toHaveAccessibleDescription(/holds 9 Boards\. Close one first\./);
  });

  it('the open Board\'s rows sit under its name: Rename (F2), Move left, Move right, Duplicate, Close Board', async () => {
    await open(realm(1, ['Two'], 1));
    await userEvent.setup().click(await boardsButton());
    const group = screen.getByRole('group', { name: 'Two' });
    const names = within(group).getAllByRole('menuitem').map((r) => r.textContent ?? '');
    // A row's text ends with its key (F2) or, disabled, its reason (the last Board cannot move right).
    expect(names.map((x) => x.replace(/F2$/, '').replace(strings['board.alreadyLast'], ''))).toEqual(['Rename', 'Move left', 'Move right', 'Duplicate', 'Close Board']);
    expect(names[0]).toMatch(/F2$/);
  });

  it('Move left is disabled on the first Board (Already first); Move right moves it one place', async () => {
    const user = userEvent.setup();
    await open(realm(1, ['Two']));
    await user.click(await boardsButton());
    expect(row(/^Move left/)).toHaveAttribute('aria-disabled', 'true');
    expect(row(/^Move left/)).toHaveAccessibleDescription(strings['board.alreadyFirst']);
    await user.click(row(/^Move right/)!);
    await waitFor(() => expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Two', 'Main']));
    await user.click(await boardsButton());
    expect(row(/^Move right/)).toHaveAttribute('aria-disabled', 'true');
    expect(row(/^Move right/)).toHaveAccessibleDescription(strings['board.alreadyLast']);
    await user.click(row(/^Move left/)!);
    await waitFor(() => expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Main', 'Two']));
  });

  it('Rename starts the rename in place on the open tab, which keeps the keyboard; Enter keeps the name', async () => {
    const user = userEvent.setup();
    await open(realm(1, ['Two']));
    await user.click(await boardsButton());
    await user.click(row(/^Rename/)!);
    const field = await screen.findByRole('textbox', { name: /Main/ });
    await waitFor(() => expect(document.activeElement).toBe(field));
    // Two frames more (the menu's own close hands focus back): the field still has it.
    await new Promise((r) => setTimeout(r, 80));
    expect(document.activeElement).toBe(field);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.clear(field);
    await user.type(field, 'Ops{Enter}');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Ops' })).toBeInTheDocument());
  });

  it('holds no Add a program row (the bar has it) and keeps Keep frames loaded as an on/off row', async () => {
    await open(realm(1));
    await userEvent.setup().click(await boardsButton());
    expect(row(/^Add a program/)).toBeNull();
    expect(screen.getByRole('menuitemcheckbox', { name: /Keep frames loaded/ })).toBeInTheDocument();
  });

  it('Keyboard shortcuts… comes last, shows ?, and opens the shell\'s sheet', async () => {
    const user = userEvent.setup();
    await open(realm(1));
    await user.click(await boardsButton());
    const last = rows().at(-1)!;
    expect(last.textContent).toMatch(/^Keyboard shortcuts…\?$/);
    await user.click(last);
    expect(sheets).toBe(1);
  });

  it("a tab's own menu opens on the tab (Shift+F10), named for it, with Duplicate and Close Board", async () => {
    const user = userEvent.setup();
    await open(realm(1, ['Two']));
    screen.getByRole('tab', { name: 'Main' }).focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    const menu = await screen.findByRole('menu', { name: /Main/ });
    expect(within(menu).getByRole('menuitem', { name: /^Duplicate/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /^Close Board/ })).toBeInTheDocument();
  });

  it('Escape closes it and gives the keys back to the Board surface', async () => {
    const user = userEvent.setup();
    await open(realm(1));
    await user.click(await boardsButton());
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    // The page's own close (onBoardMenu) hands the keys to the Board surface after the kit's return to the trigger.
    await waitFor(() => expect(document.activeElement).not.toBe(screen.getByRole('button', { name: strings.boards })));
  });
});

describe('the Boards menu on a phone', () => {
  beforeEach(() => {
    phone = true;
    size = { w: 390, h: 700 };
  });

  it('starts the chips row: its button is the open Board\'s name, and it opens the Boards menu', async () => {
    const user = userEvent.setup();
    await open(realm(1));
    await user.click(await screen.findByRole('button', { name: /^Main/ }));
    // The same rows as Boards ▾ (on a real phone a tray titled Boards; the kit's tray reads its own phone query, so here it
    // is the popover, named by its button).
    expect(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: /^Main · / })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('Rename opens the Rename dialog (no tabs to rename in place); no keys shown on rows', async () => {
    const user = userEvent.setup();
    await open(realm(1));
    await user.click(await screen.findByRole('button', { name: /^Main/ }));
    expect(screen.getByRole('menu').querySelector('kbd')).toBeNull();
    await user.click(row(/^Rename/)!);
    expect(await screen.findByRole('textbox', { name: strings['board.rename'] })).toBeInTheDocument();
  });

  it('moves the Board: Move right then the order is kept', async () => {
    const user = userEvent.setup();
    await open(realm(1, ['Two']));
    await user.click(await screen.findByRole('button', { name: /^Main/ }));
    await user.click(row(/^Move right/)!);
    await waitFor(async () => expect((await stored())?.boards.map((b) => b.name || 'Main')).toEqual(['Two', 'Main']));
  });

  it('Undo: nothing to undo is said; after a change, Undo names it and undoes it', async () => {
    const user = userEvent.setup();
    await open(realm(2));
    await user.click(await screen.findByRole('button', { name: /^Main/ }));
    const none = row(/^Undo/)!;
    expect(none).toHaveAttribute('aria-disabled', 'true');
    expect(none).toHaveAccessibleDescription(strings['layout.nothingToUndo']);
    await user.keyboard('{Escape}');
    // A change: x closes the open tile (one of the two left).
    const filled = async () => { const st = (await stored())!; return filledCount(st.boards.find((b) => b.id === st.active)!); };
    act(() => screen.getByRole('group', { name: 'Board tiles' }).focus());
    await user.keyboard('x');
    await waitFor(async () => expect(await filled()).toBe(1));
    // Undo now names it and is enabled; choosing it puts the tile back.
    await user.click(await screen.findByRole('button', { name: /^Main/ }));
    const undo = row(/^Undo/)!;
    expect(undo).not.toHaveAttribute('aria-disabled');
    expect(undo.textContent).toMatch(/^Undo: close /);
    await user.click(undo);
    await waitFor(async () => expect(await filled()).toBe(2));
  });

  it("the chips row's + is named Add a program", async () => {
    await open(realm(1));
    // The + after the chips (outside their toolbar, in the chips row).
    const row = (await screen.findByRole('toolbar', { name: 'Tiles' })).parentElement!;
    expect(within(row).getByRole('button', { name: strings['board.addProgram'] })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Add a tile' })).toBeNull();
  });
});
