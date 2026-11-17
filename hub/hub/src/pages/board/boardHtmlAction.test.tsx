// Vitest: the Board's Download as HTML action, through the real router on core's fixture world: one row in the Boards
// menu, a dialog bound to the open Board, and the file the browser is handed (boardHtml.ts builds it; its own tests
// cover the document).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, createBoard, freshRealm, isRefusal, onActive, setActiveBoard, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { toStored } from './model/persist';
import page from './page';
import { resetFixtureSessions } from './fixtures';
import strings from './strings.en.json';

let phone = false;
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, showToast: () => 'toast-1', useIsPhone: () => phone };
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
const rows = () => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
const row = (name: RegExp) => rows().find((r) => name.test(r.textContent ?? '')) ?? null;
const boardsButton = () => screen.findByRole('button', { name: strings.boards });

let size = { w: 1280, h: 800 };
beforeEach(() => {
  resetFixtureSessions();
  resetBoardsForTests();
  phone = false;
  size = { w: 1280, h: 800 };
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size.w);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size.h);
});
afterEach(() => { vi.restoreAllMocks(); });


/** What the browser was asked to save: the file's name and its text. */
const saved: Array<{ name: string; blob: Blob }> = [];
beforeEach(() => {
  saved.length = 0;
  let last: Blob | null = null;
  URL.createObjectURL = (b: Blob | MediaSource) => { last = b as Blob; return 'blob:test'; };
  URL.revokeObjectURL = () => undefined;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { if (this.download && last) saved.push({ name: this.download, blob: last }); });
});

describe('Download as HTML', () => {
  it('is one row of the Boards menu, after Export Board; a tab\'s own menu has none', async () => {
    await open(realm(1, ['Ops Wall'], 0));
    await userEvent.click(await boardsButton());
    await waitFor(() => expect(row(/Download as HTML/)).not.toBeNull());
    const labels = rows().map((r) => r.textContent ?? '');
    expect(labels.filter((l) => l.includes(strings['board.html'])).length).toBe(1);
    expect(labels.findIndex((l) => l.includes(strings['board.html']))).toBe(labels.findIndex((l) => l.includes(strings['board.export'])) + 1);
  });
  it('asks first, naming the open Board and saying what the file is; Cancel saves nothing', async () => {
    await open(realm(1, ['Ops Wall'], 0));
    await userEvent.click(await boardsButton());
    await waitFor(() => expect(row(/Download as HTML/)).not.toBeNull());
    await userEvent.click(row(/Download as HTML/)!);
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(within(dialog).getByText(`Download ${strings['board.main']} as HTML`)).toBeInTheDocument();
    expect(within(dialog).getByText(strings['html.body'])).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText(`Download ${strings['board.main']} as HTML`)).toBeNull());
    expect(saved).toEqual([]);
  });
  it('is disabled on a Board with no tile and says why; pressing it opens nothing and saves nothing', async () => {
    await open(realm(1, ['Ops Wall'], 1));
    await userEvent.click(await boardsButton());
    await waitFor(() => expect(row(/Download as HTML/)).not.toBeNull());
    const r = row(/Download as HTML/)!;
    expect(r.getAttribute('aria-disabled')).toBe('true');
    expect(r.textContent).toContain(strings['html.empty']);
    await userEvent.click(r);
    expect(screen.queryByText('Download Ops Wall as HTML')).toBeNull();
    expect(saved).toEqual([]);
  });
  it('Download saves that Board as one page named for its realm, itself and the day, with no id and no request', async () => {
    await open(realm(1, ['Ops Wall'], 0));
    const fetched = vi.spyOn(globalThis, 'fetch');
    await userEvent.click(await boardsButton());
    await waitFor(() => expect(row(/Download as HTML/)).not.toBeNull());
    await userEvent.click(row(/Download as HTML/)!);
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(within(dialog).getByText(`Download ${strings['board.main']} as HTML`)).toBeInTheDocument();
    const before = fetched.mock.calls.length;
    await userEvent.click(within(dialog).getByRole('button', { name: strings['html.download'] }));
    await waitFor(() => expect(saved.length).toBe(1));
    expect(fetched.mock.calls.length).toBe(before);
    expect(saved[0]!.name).toMatch(/^hoody-board_[a-z0-9-]+_main_\d{4}-\d\d-\d\d\.html$/);
    const html = await saved[0]!.blob.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('h1')?.textContent).toBe(strings['board.main']);
    expect(doc.querySelectorAll('section').length).toBe(1);
    expect(doc.querySelector('section h2')?.textContent).toContain('terminal-1');
    // A program is a frame on its own address, with its link beside it; the file holds no script.
    expect(doc.querySelectorAll('script').length).toBe(0);
    expect(doc.querySelector('iframe')?.getAttribute('src')).toBe(doc.querySelector('section a')?.getAttribute('href'));
    // The computer's ids are in the file only where the tile's own address holds them (its frame and its Open in a new tab link),
    const link = doc.querySelector('section a')?.getAttribute('href') ?? '';
    expect(link).toMatch(/^https:\/\/[^/]*terminal-1\./);
    expect(link).not.toMatch(/theme|hide-toolbar|parent_/);
    // ...and its origin in the policy's frame-src, which is what lets the frame load.
    const rest = html.split(link.replace(/&/g, '&amp;')).join('').split(new URL(link).origin).join('');
    expect(rest).not.toContain(atlas.project_id);
    expect(rest).not.toContain(atlas.id);
    expect(html).not.toContain('hdy_');
    await waitFor(() => expect(screen.queryByText(`Download ${strings['board.main']} as HTML`)).toBeNull());
  });
});
