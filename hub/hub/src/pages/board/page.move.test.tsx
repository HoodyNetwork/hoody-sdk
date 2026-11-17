/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first; the page
   reaches storage only through core */
// Vitest, S-move: the tile menu's "Move to Board…" and the B key open one dialog for the tile
// they were opened on. Move commits under the cross-tab lock: the tile is stored on the chosen Board (or a new Board
// named after it), the toast offers Move back, and both Boards' undo steps are gone. A tile closed in another tab
// before the move commits is not moved, and the toast says so.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import type * as Kit from '@kit';
import type { PageShortcut } from '@kit';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, closeSlot, createBoard, findTileSlot, freshRealm, isRefusal, onActive, renameBoard, type Board, type RealmBoards, type Refusal, type Tile } from './model/boards';
import { parseRealmBoards, toStored } from './model/persist';
import page from './page';
import { resetFixtureSessions, setListDown } from './fixtures';
import strings from './strings.en.json';

type Toast = { title: string; action?: { label: string; onAction: () => void } };
const seen = vi.hoisted(() => ({ toasts: [] as Toast[], keys: [] as PageShortcut[] }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return {
    ...kit,
    showToast: (x: Toast) => { seen.toasts.push(x); return 'toast-' + seen.toasts.length; },
    usePageShortcuts: (k: PageShortcut[]) => { seen.keys = k; kit.usePageShortcuts(k); },
  };
});

const S = strings;
const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const web = (path: string): Tile => ({ url: 'https://docs.example/' + path });
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
const flush = () => act(() => cryptIdleForTests());

// The Board view is a lazy chunk, and a cold first import takes tens of seconds on a loaded host: load it once here so
// each first find timeout measures the page, not the transform.
beforeAll(async () => { await page.load(); }, 180_000);
beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  resetBoardsForTests();
  seen.toasts = [];
  seen.keys = [];
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Move to Board', () => {
  it('the tile menu moves the tile to the chosen Board, stored; Move back puts it back', async () => {
    const user = userEvent.setup();
    const s0 = realm();
    await open(s0);
    const group = screen.getAllByRole('group').filter((g) => /docs\.example/.test(g.getAttribute('aria-label') ?? ''))[0]!;
    await user.click(within(group).getByRole('button', { name: /Tile menu/ }));
    await user.click(await screen.findByRole('menuitem', { name: new RegExp(S['tile.moveTo']) }));
    const dialog = await screen.findByRole('dialog');
    const move = within(dialog).getByRole('button', { name: S['move.confirm'] });
    expect(move).toBeDisabled(); // nothing chosen at first
    await user.click(within(dialog).getByRole('radio', { name: /Other/ }));
    await user.click(move);
    let tid = '';
    await waitFor(async () => {
      const st = await stored();
      const other = st.boards.find((b) => b.name === 'Other')!;
      tid = Object.values(other.tiles).find(Boolean)?.tid ?? '';
      expect([tidOf(s0, 'one'), tidOf(s0, 'two')]).toContain(tid);
    });
    const kept = tid === tidOf(s0, 'one') ? tidOf(s0, 'two') : tidOf(s0, 'one');
    await flush();
    const toast = seen.toasts.find((x) => x.action?.label === S['move.back'])!;
    expect(toast).toBeDefined();
    expect(await screen.findByRole('tab', { name: /Other/, selected: true })).toBeTruthy();
    act(() => { toast.action!.onAction(); });
    await waitFor(async () => expect(boardOf(await stored(), tid)).toEqual(['Start']));
    // The other tile never moved, and each tile is stored once.
    expect(boardOf(await stored(), kept)).toEqual(['Start']);
  });

  it('B opens the dialog for the active tile; New Board makes a Board named after the tile', async () => {
    const user = userEvent.setup();
    const s0 = realm();
    await open(s0);
    const b = seen.keys.find((k) => k.key === 'b');
    expect(b?.enabled).not.toBe(false);
    act(() => { b!.run(); });
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: new RegExp(S['move.newBoard']) }));
    await user.click(within(dialog).getByRole('button', { name: S['move.confirm'] }));
    await waitFor(async () => expect((await stored()).boards).toHaveLength(3));
    const st = await stored();
    const made = st.boards[2] as Board;
    expect(made.name).not.toBe('');
    expect(Object.values(made.tiles).filter(Boolean)).toHaveLength(1);
    const activeTid = Object.values(made.tiles).find(Boolean)!.tid as string;
    expect(boardOf(st, activeTid)).toEqual([made.name]);
    expect([tidOf(s0, 'one'), tidOf(s0, 'two')]).toContain(activeTid);
  });

  it('a tile closed in another tab before the move commits is not moved: the toast says so', async () => {
    const user = userEvent.setup();
    const s0 = realm();
    await open(s0);
    const tid = tidOf(s0, 'two'); // the active tile (added last)
    act(() => { seen.keys.find((k) => k.key === 'b')!.run(); });
    const dialog = await screen.findByRole('dialog');
    const tileName = /^Move (.*) to$/.exec(within(dialog).getByRole('heading').textContent ?? '')?.[1] ?? '?';
    await user.click(within(dialog).getByRole('radio', { name: /Other/ }));
    // Another tab holds the Boards lock: the move waits for it, and meanwhile that tab closes the tile and stores first.
    const locks = (navigator as unknown as { locks: LockManager }).locks;
    const realLock = locks.request.bind(locks) as (...a: unknown[]) => Promise<unknown>;
    let release!: () => void;
    const gate = new Promise<void>((x) => { release = x; });
    let asked = false;
    vi.spyOn(locks, 'request').mockImplementation((async (...a: unknown[]) => {
      if (String(a[0]).startsWith('hub_boards_add:')) { asked = true; await gate; }
      return realLock(...a);
    }) as never);
    await user.click(within(dialog).getByRole('button', { name: S['move.confirm'] }));
    await waitFor(() => expect(asked).toBe(true));
    const now = await stored();
    const start = now.boards.find((b) => b.name === 'Start')!;
    await store({ ...now, boards: now.boards.map((b) => (b.id === start.id ? must(closeSlot(start, findTileSlot(start, tid)!)) : b)) });
    await screen.findByRole('group', { name: 'Board tiles' }); // their value is shown
    release();
    await waitFor(() => expect(seen.toasts.some((x) => x.title === fill(S['move.stale'], { name: tileName }))).toBe(true));
    const st = await stored();
    expect(boardOf(st, tid)).toEqual([]);
    expect(Object.values(st.boards.find((b) => b.name === 'Other')!.tiles).filter(Boolean)).toHaveLength(0);
    expect(seen.toasts.some((x) => x.action?.label === S['move.back'])).toBe(false);
  });
});
