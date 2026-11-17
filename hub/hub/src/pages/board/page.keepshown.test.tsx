/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first; the page
   reaches storage only through core */
// Vitest: another tab's write is read in the
// background, so a dialog open on the Board stays open (and still works) while their value opens and after it shows;
// an edit meanwhile is refused visibly (the 'updating' note, the Board busy) and works again once their value opens.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import type * as Kit from '@kit';
import type { PageShortcut } from '@kit';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, createBoard, findTileSlot, freshRealm, isRefusal, onActive, renameBoard, type RealmBoards, type Refusal, type Tile } from './model/boards';
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
/** The sealed bytes another tab would store for `value`, with this tab's storage left as it was. */
async function sealedBytes(value: RealmBoards): Promise<string> {
  const before = localStorage.getItem(BOARDS_KEY);
  await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(value)));
  const bytes = localStorage.getItem(BOARDS_KEY) as string;
  if (before === null) localStorage.removeItem(BOARDS_KEY); else localStorage.setItem(BOARDS_KEY, before);
  return bytes;
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

describe('another tab\'s write keeps the Board\'s dialogs', () => {
  it('the Move dialog stays open across another tab\'s write, shows their Boards, and still moves', async () => {
    const user = userEvent.setup();
    const s0 = realm();
    await open(s0);
    act(() => { seen.keys.find((k) => k.key === 'b')!.run(); });
    const dialog = await screen.findByRole('dialog');
    // Another tab renames Other and stores.
    const now = await stored();
    const other = now.boards.find((b) => b.name === 'Other')!;
    await store(must(renameBoard(now, other.id, 'Theirs')));
    expect(dialog.isConnected).toBe(true);
    expect(screen.getByRole('dialog')).toBe(dialog);
    await within(dialog).findByRole('radio', { name: /Theirs/ });
    await user.click(within(dialog).getByRole('radio', { name: /Theirs/ }));
    await user.click(within(dialog).getByRole('button', { name: S['move.confirm'] }));
    const tid = tidOf(s0, 'two');
    await waitFor(async () => expect(boardOf(await stored(), tid)).toEqual(['Theirs']));
    await waitFor(() => expect(seen.toasts.some((x) => x.action?.label === S['move.back'])).toBe(true));
  });

  it('an edit while their value opens is refused visibly (the note, the Board busy); it works once their value opens', async () => {
    const s0 = realm();
    await open(s0);
    const tid = tidOf(s0, 'two'); // the active tile
    const now = await stored();
    const other = now.boards.find((b) => b.name === 'Other')!;
    const theirs = await sealedBytes(must(renameBoard(now, other.id, 'Theirs')));
    const subtle = globalThis.crypto.subtle;
    const real = subtle.decrypt.bind(subtle);
    let openIt!: () => void;
    const gate = new Promise<void>((r) => { openIt = r; });
    const spy = vi.spyOn(subtle, 'decrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['decrypt']>) => { await gate; return real(...a); });
    await act(async () => {
      localStorage.setItem(BOARDS_KEY, theirs);
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    });
    await waitFor(() => expect(document.querySelector('[aria-busy="true"][data-refreshing]')).not.toBeNull());
    const tiles = () => screen.getAllByRole('group').filter((g) => /docs\.example/.test(g.getAttribute('aria-label') ?? '')).length;
    expect(tiles()).toBe(2);
    act(() => { seen.keys.find((k) => k.key === 'x')!.run(); }); // close the active tile
    expect(await screen.findByText(S['notice.updating'])).toBeTruthy();
    // Nothing written (their bytes stand) and the tile is still shown (stored() would wait on the held open).
    expect(localStorage.getItem(BOARDS_KEY)).toBe(theirs);
    expect(tiles()).toBe(2);
    expect(seen.toasts.some((x) => x.action?.label === S['undo.label'])).toBe(false);
    openIt();
    spy.mockRestore();
    await waitFor(() => expect(document.querySelector('[data-refreshing]')).toBeNull());
    await screen.findByRole('tab', { name: /Theirs/ });
    expect(screen.queryByText(S['notice.updating'])).toBeNull();
    act(() => { seen.keys.find((k) => k.key === 'x')!.run(); });
    await waitFor(async () => expect(boardOf(await stored(), tid)).toEqual([]));
  });
});
