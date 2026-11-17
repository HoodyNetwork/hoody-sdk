/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first; the page
   reaches storage only through core */
// Vitest: the program view's Other ▸ New Board makes the
// Board under the cross-tab lock against the Boards as stored (data.ts applyLocked), as the Board view's New does. Two
// tabs near the nine-Board cap cannot both make one: the one that commits second is refused on what the other stored,
// says the realm is full, and never says "Added". At the cap, its New Board is off and says why.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, createBoard, freshRealm, isRefusal, MAX_BOARDS, onActive, setKeepLoaded, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { parseRealmBoards, toStored } from './model/persist';
import page from './page';
import { resetFixtureSessions, setListDown } from './fixtures';
import boardStrings from './strings.en.json';

const said = (k: keyof typeof boardStrings, v: Record<string, string>): string => boardStrings[k].replace(/\{\{(\w+)\}\}/g, (_, x: string) => v[x] ?? '');
const toasts: Array<{ title: string }> = [];
const L = vi.hoisted(() => ({ phone: false }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, useIsPhone: () => L.phone, showToast: (c: { title: string }) => { toasts.push({ title: c.title }); return `toast-${toasts.length}`; } };
});

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const handle = atlas.name + '.' + atlas.id.slice(-4);
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const tile: TileRef = { project: atlas.project_id, computer: atlas.id, program: 'terminal', session: 1 };
/** One Board short of the cap: Main with terminal-1, and seven more. */
function oneShort(): RealmBoards {
  let s = must(onActive(freshRealm(rand), (b): Board | Refusal => { const r = addTile(b, tile, rand); return isRefusal(r) ? r : r.board; }));
  while (s.boards.length < MAX_BOARDS - 1) s = must(createBoard(s, rand, 'B' + s.boards.length));
  return { ...s, active: s.boards[0]!.id };
}
async function store(s: RealmBoards) {
  await act(async () => {
    await cryptIdleForTests();
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}
const stored = async () => parseRealmBoards(JSON.parse(JSON.stringify(await storedForTests(BOARDS_KEY, FIXTURE_REALM)))).state;

beforeAll(async () => { await page.load(); }, 180_000);
beforeEach(() => {
  L.phone = false;
  resetFixtureSessions();
  setListDown(false);
  resetBoardsForTests();
  toasts.length = 0;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('the program view makes a new Board under the cross-tab lock', () => {
  it('two tabs at the cap: this tab commits after the other stored its Board, is refused, says full, never "Added"', async () => {
    const user = userEvent.setup();
    await renderPage(page, { path: `/board/open/${handle}/terminal-2` });
    await screen.findByRole('heading', { level: 1 });
    await store(oneShort());
    expect(await screen.findByTitle('terminal-2 on atlas')).toBeInTheDocument();
    // Another tab holds the Boards lock: this tab's New Board waits for it, and meanwhile that tab makes the ninth Board.
    const locks = (navigator as unknown as { locks: LockManager }).locks;
    const realLock = locks.request.bind(locks) as (...a: unknown[]) => Promise<unknown>;
    let release!: () => void;
    const gate = new Promise<void>((x) => { release = x; });
    vi.spyOn(locks, 'request').mockImplementation((async (...a: unknown[]) => {
      if (String(a[0]).startsWith('hub_boards_add:')) await gate;
      return realLock(...a);
    }) as never);
    await user.click(screen.getByRole('button', { name: said('view.other', {}) }));
    await user.click(await screen.findByRole('menuitem', { name: said('view.newBoard', {}) }));
    const now = await stored();
    expect(now.boards).toHaveLength(MAX_BOARDS - 1); // nothing of this tab's was stored before the lock
    await store(must(createBoard(now, rand, 'Theirs')));
    release();
    await waitFor(() => expect(toasts.length).toBeGreaterThan(0));
    await act(() => cryptIdleForTests());
    const titles = toasts.map((x) => x.title);
    expect(titles.some((x) => x.startsWith('Added'))).toBe(false);
    expect(titles.some((x) => /9 Boards/.test(x))).toBe(true);
    const end = await stored();
    expect(end.boards).toHaveLength(MAX_BOARDS);
    expect(end.boards.map((b) => b.name)).toContain('Theirs');
  });

  it('kept, and hidden before the lock lets the New Board land: the Board is made, no "Added" toast offers a dead Open Board', async () => {
    const user = userEvent.setup();
    const { router } = await renderPage(page, { path: `/board/open/${handle}/terminal-2` });
    await screen.findByRole('heading', { level: 1 });
    const s = must(onActive(freshRealm(rand), (b): Board | Refusal => { const r = addTile(b, tile, rand); return isRefusal(r) ? r : r.board; }));
    await store(setKeepLoaded(s, true));
    expect(await screen.findByTitle('terminal-2 on atlas')).toBeInTheDocument();
    const locks = (navigator as unknown as { locks: LockManager }).locks;
    const realLock = locks.request.bind(locks) as (...a: unknown[]) => Promise<unknown>;
    let release!: () => void;
    const gate = new Promise<void>((x) => { release = x; });
    vi.spyOn(locks, 'request').mockImplementation((async (...a: unknown[]) => {
      if (String(a[0]).startsWith('hub_boards_add:')) await gate;
      return realLock(...a);
    }) as never);
    await user.click(screen.getByRole('button', { name: said('view.other', {}) }));
    await user.click(await screen.findByRole('menuitem', { name: said('view.newBoard', {}) }));
    await act(async () => { await router.navigate({ href: '/elsewhere' } as never); });
    await waitFor(() => expect(document.querySelector('[data-hub-page="board"]')?.hasAttribute('data-hub-page-hidden')).toBe(true));
    release();
    await waitFor(async () => expect((await stored()).boards).toHaveLength(2));
    await act(() => cryptIdleForTests());
    expect(toasts.map((x) => x.title).filter((x) => x.startsWith('Added'))).toEqual([]);
  });
});

describe('the program view at the nine-Board cap', () => {
  it('Other ▸ New Board is off and says why: the realm already has nine Boards', async () => {
    const user = userEvent.setup();
    await renderPage(page, { path: `/board/open/${handle}/terminal-2` });
    await screen.findByRole('heading', { level: 1 });
    await store(must(createBoard(oneShort(), rand, 'Ninth')));
    expect(await screen.findByTitle('terminal-2 on atlas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: said('view.other', {}) }));
    const item = await screen.findByRole('menuitem', { name: new RegExp('^' + said('view.newBoard', {})) });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(item).toHaveTextContent(said('move.boardsFull', { n: String(MAX_BOARDS) }));
  });
});

describe('the program view on a phone, its Board full', () => {
  it('Add names the full Board and a step a phone has (no Other Board menu there)', async () => {
    L.phone = true;
    await renderPage(page, { path: `/board/open/${handle}/terminal-9` });
    await screen.findByRole('heading', { level: 1 });
    let s = oneShort();
    for (let i = 2; i <= 8; i++) s = must(onActive(s, (b): Board | Refusal => { const r = addTile(b, { ...tile, session: i }, rand); return isRefusal(r) ? r : r.board; }));
    await store(s);
    const name = said('view.fullPhone', { board: boardStrings['board.main'] });
    expect(await screen.findByRole('button', { name })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: said('view.full', { board: boardStrings['board.main'] }) })).toBeNull();
  });
});
