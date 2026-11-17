// Vitest, S-hist-ui: Close Board replaces Delete Board. Closing (the Board menu, a tab's
// menu or a middle-click on the tab) keeps the Board in Closed Boards and its toast's Undo opens it again; an empty Board
// is closed with no entry and no Undo. The Closed Boards dialog lists the realm's entries: Restore opens one (focusable
// with the reason at nine Boards), Remove takes one out with an Undo that puts it back under a fresh cid, and Clear all
// asks first and removes only the entries it listed when it asked.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { FIXTURE_REALM } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import type * as Kit from '@kit';
import { BOARDS_HISTORY_KEY, resetClosedForTests } from './closed';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, createBoard, freshRealm, isRefusal, onActive, renameBoard, type RealmBoards, type Refusal, type Tile } from './model/boards';
import { parseClosedHistory, type ClosedHistory } from './model/history';
import { parseRealmBoards, toStored } from './model/persist';
import page from './page';
import { closeText, restoreText } from './parts/ClosedBoardsDialog';
import strings from './strings.en.json';
import { resetFixtureSessions, setListDown } from './fixtures';

type Toast = { title: string; action?: { label: string; onAction: () => void } };
const seen = vi.hoisted(() => ({ toasts: [] as Toast[] }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  return { ...kit, showToast: (x: Toast) => { seen.toasts.push(x); return 'toast-' + seen.toasts.length; } };
});

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const web = (path: string): Tile => ({ url: 'https://docs.example/' + path });
const withTile = (s: RealmBoards, path: string) => must(onActive(s, (b) => { const r = addTile(b, web(path), rand); return isRefusal(r) ? r : r.board; }));
/** Boards "Start" (one web tile, active), "Work" (one web tile) and "Other" (empty), plus `more` empty Boards. */
function realm(more = 0): RealmBoards {
  let s = withTile(freshRealm(rand), 'start');
  s = must(renameBoard(s, s.boards[0]!.id, 'Start'));
  const first = s.boards[0]!.id;
  s = withTile(must(createBoard(s, rand, 'Work')), 'work');
  s = must(createBoard(s, rand, 'Other'));
  for (let i = 0; i < more; i++) s = must(createBoard(s, rand, 'Extra ' + (i + 1)));
  return { ...s, active: first };
}
async function store(s: RealmBoards) {
  await act(async () => {
    await cryptIdleForTests();
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
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
const settle = async () => { for (let i = 0; i < 6; i++) await act(() => cryptIdleForTests()); };
const storedBoards = async () => parseRealmBoards(JSON.parse(JSON.stringify(await storedForTests(BOARDS_KEY, FIXTURE_REALM)))).state;
const storedHistory = async (): Promise<ClosedHistory> => parseClosedHistory(JSON.parse(JSON.stringify((await storedForTests(BOARDS_HISTORY_KEY, FIXTURE_REALM)) ?? null)));
const names = (h: ClosedHistory) => h.entries.map((e) => e.board.name);
const S = strings as Record<string, string>;
const tt = (k: string, v: Record<string, unknown> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x] ?? ''));
/** The browser refuses the seals numbered in `fail` (1 = the next seal), and seals the others. */
function failSeals(...fail: number[]) {
  const subtle = globalThis.crypto.subtle;
  const real = subtle.encrypt.bind(subtle);
  let i = 0;
  return vi.spyOn(subtle, 'encrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['encrypt']>) => {
    i++;
    if (fail.includes(i)) throw new DOMException('refused', 'OperationError');
    return real(...a);
  });
}
/** Releases of seals a test held: afterEach lets every one go, so a failed assertion never leaves a write hanging. */
const held: (() => void)[] = [];
/** Holds every seal (a write on its way) until released. */
function holdSeals() {
  const subtle = globalThis.crypto.subtle;
  const real = subtle.encrypt.bind(subtle);
  let open!: () => void;
  const gate = new Promise<void>((res) => { open = res; });
  const spy = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['encrypt']>) => { await gate; return real(...a); });
  let done = false;
  const release = () => { if (done) return; done = true; open(); spy.mockRestore(); };
  held.push(release);
  return { sealing: () => vi.waitFor(() => expect(spy).toHaveBeenCalled()), release };
}
const lastToast = () => seen.toasts[seen.toasts.length - 1];
async function closeFromMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Boards' }));
  await user.click(await screen.findByRole('menuitem', { name: /^Close Board/ }));
}
async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Boards' }));
  await user.click(await screen.findByRole('menuitem', { name: /^Closed Boards/ }));
  return screen.findByRole('dialog', { name: 'Closed Boards' });
}

beforeAll(async () => { await page.load(); }, 180_000);
beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  resetBoardsForTests();
  resetClosedForTests();
  seen.toasts = [];
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});
afterEach(async () => { for (const r of held.splice(0)) r(); await settle(); vi.restoreAllMocks(); });

describe('Close Board', () => {
  it('the Board menu closes the Board into Closed Boards, and Undo opens it again', async () => {
    const user = userEvent.setup();
    await open(realm());
    await screen.findByRole('tab', { name: /Start/, selected: true });
    expect(screen.queryByRole('menuitem', { name: /Delete Board/ })).toBeNull();
    await closeFromMenu(user);
    await waitFor(() => expect(screen.queryByRole('tab', { name: /Start/ })).toBeNull());
    await settle();
    expect(names(await storedHistory())).toEqual(['Start']);
    expect((await storedBoards()).boards.map((b) => b.name)).toEqual(['Work', 'Other']);
    expect(lastToast()?.title).toBe('“Start” is kept in Closed Boards.');
    await act(async () => { lastToast()!.action!.onAction(); });
    expect(await screen.findByRole('tab', { name: /Start/, selected: true })).toBeInTheDocument();
    await settle();
    expect(names(await storedHistory())).toEqual([]);
    expect((await storedBoards()).boards.map((b) => b.name).sort()).toEqual(['Other', 'Start', 'Work']);
  });

  it('Undo whose entry could not be taken out of Closed Boards says it stays there too', async () => {
    const user = userEvent.setup();
    await open(realm());
    await screen.findByRole('tab', { name: /Start/, selected: true });
    await closeFromMenu(user);
    await waitFor(() => expect(screen.queryByRole('tab', { name: /Start/ })).toBeNull());
    await settle();
    // The live Board's write seals (1); the history removal's seals are refused.
    failSeals(...Array.from({ length: 30 }, (_, i) => i + 2));
    await act(async () => { lastToast()!.action!.onAction(); });
    expect(await screen.findByRole('tab', { name: /Start/, selected: true })).toBeInTheDocument();
    await waitFor(() => expect(lastToast()?.title).toBe(tt('closed.restoredKept', { name: 'Start' })));
  });

  it('an empty Board closes with no entry and no Undo; the realm\'s one empty Board cannot be closed', async () => {
    const user = userEvent.setup();
    await open(realm());
    await user.click(screen.getByRole('tab', { name: /Other/ }));
    await closeFromMenu(user);
    await waitFor(() => expect(screen.queryByRole('tab', { name: /Other/ })).toBeNull());
    await settle();
    expect(lastToast()?.title).toBe('“Other” had no programs, so it isn\'t kept in Closed Boards.');
    expect(lastToast()?.action).toBeUndefined();
    expect(names(await storedHistory())).toEqual([]);
  });

  it('a middle-click on a tab closes that Board, not the one shown', async () => {
    await open(realm());
    await screen.findByRole('tab', { name: /Start/, selected: true });
    const work = screen.getByRole('tab', { name: /Work/ });
    fireEvent.mouseDown(work, { button: 1 });
    fireEvent(work, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
    await waitFor(() => expect(screen.queryByRole('tab', { name: /Work/ })).toBeNull());
    await settle();
    expect(names(await storedHistory())).toEqual(['Work']);
    expect(screen.getByRole('tab', { name: /Start/, selected: true })).toBeInTheDocument();
  });

  it('the only Board, empty, offers Close Board disabled with its reason', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await screen.findByRole('group', { name: 'Board tiles' });
    await store(freshRealm(rand));
    await user.click(await screen.findByRole('button', { name: 'Boards' }));
    const item = await screen.findByRole('menuitem', { name: /^Close Board/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('the Closed Boards dialog', () => {
  async function closedTwo(user: ReturnType<typeof userEvent.setup>, more = 0) {
    await open(realm(more));
    await screen.findByRole('tab', { name: /Start/, selected: true });
    await closeFromMenu(user);
    await waitFor(() => expect(screen.queryByRole('tab', { name: /Start/ })).toBeNull());
    await settle();
    await user.click(screen.getByRole('tab', { name: /Work/ }));
    await closeFromMenu(user);
    await waitFor(() => expect(screen.queryByRole('tab', { name: /Work/ })).toBeNull());
    await settle();
    expect(names(await storedHistory())).toEqual(['Work', 'Start']);
  }

  it('lists the realm\'s closed Boards newest first; Restore opens one and the dialog closes', async () => {
    const user = userEvent.setup();
    await closedTwo(user);
    const dialog = await openDialog(user);
    const rows = within(dialog).getAllByRole('listitem');
    expect(rows.map((r) => within(r).getAllByText(/./)[0]!.textContent)).toEqual(['Work', 'Start']);
    expect(within(rows[0]!).getByText('1 tile')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Restore Start' }));
    expect(await screen.findByRole('tab', { name: /Start/, selected: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Closed Boards' })).toBeNull());
    await settle();
    expect(names(await storedHistory())).toEqual(['Work']);
  });

  it('at nine Boards Restore stays focusable and does nothing', async () => {
    const user = userEvent.setup();
    await closedTwo(user, 6); // 9 Boards, 2 closed: 7 open
    await act(async () => { await user.click(screen.getByRole('button', { name: /New Board/ })); });
    await screen.findByRole('tab', { name: /Board 8/ });
    await act(async () => { await user.click(screen.getByRole('button', { name: /New Board/ })); });
    await screen.findByRole('tab', { name: /Board 9/ });
    await settle();
    const dialog = await openDialog(user);
    const restore = within(dialog).getByRole('button', { name: /^Restore Start/ });
    expect(restore).toHaveAttribute('aria-disabled', 'true');
    await user.click(restore);
    await settle();
    expect(names(await storedHistory())).toEqual(['Work', 'Start']);
  });

  it('Remove takes one entry out, and its Undo puts it back under a fresh cid', async () => {
    const user = userEvent.setup();
    await closedTwo(user);
    const before = (await storedHistory()).entries.find((e) => e.board.name === 'Start')!.cid;
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Remove Start from Closed Boards' }));
    await settle();
    expect(names(await storedHistory())).toEqual(['Work']);
    expect(lastToast()?.title).toBe('Removed “Start” from Closed Boards.');
    await act(async () => { lastToast()!.action!.onAction(); });
    await settle();
    const h = await storedHistory();
    expect(names(h).sort()).toEqual(['Start', 'Work']);
    const again = h.entries.find((e) => e.board.name === 'Start')!.cid;
    expect(again).not.toBe(before);
    expect(h.removed).toContain(before);
  });

  it('Clear all asks first, and removes only the entries it listed: one closed meanwhile stays', async () => {
    const user = userEvent.setup();
    await closedTwo(user);
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Clear all' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Clear 2 closed Boards?' });
    // Another tab closes a Board meanwhile: its entry is not in the list the confirm was asked for.
    const other = await storedHistory();
    await act(async () => {
      await cryptIdleForTests();
      await writeSealedForTests(BOARDS_HISTORY_KEY, FIXTURE_REALM, {
        ...other,
        entries: [{ cid: 'clate', closedAt: Date.now(), board: { ...other.entries[0]!.board, id: 'blate', name: 'Late' } }, ...other.entries],
      });
      // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_HISTORY_KEY, storageArea: localStorage }));
      await cryptIdleForTests();
    });
    await user.click(within(confirm).getByRole('button', { name: 'Clear' }));
    await settle();
    expect(names(await storedHistory())).toEqual(['Late']);
  });

  it('two presses of Restore while the first is on its way make one Board', async () => {
    const user = userEvent.setup();
    await closedTwo(user);
    const dialog = await openDialog(user);
    const seals = holdSeals();
    await user.click(within(dialog).getByRole('button', { name: 'Restore Start' }));
    await seals.sealing();
    const again = within(dialog).getByRole('button', { name: /^Restore Work/ });
    expect(again).toHaveAttribute('aria-disabled', 'true');
    await user.click(again);
    await user.click(within(dialog).getByRole('button', { name: /^Restore Start/ }));
    seals.release();
    await settle();
    expect((await storedBoards()).boards.map((b) => b.name).sort()).toEqual(['Other', 'Start']);
    expect(names(await storedHistory())).toEqual(['Work']);
  });

  it('a dialog Restore on its way makes Close\'s Undo of the same entry wait: one Board', async () => {
    const user = userEvent.setup();
    await open(realm());
    await screen.findByRole('tab', { name: /Start/, selected: true });
    await closeFromMenu(user);
    await waitFor(() => expect(screen.queryByRole('tab', { name: /Start/ })).toBeNull());
    await settle();
    const undo = lastToast()!;
    const dialog = await openDialog(user);
    const seals = holdSeals();
    await user.click(within(dialog).getByRole('button', { name: 'Restore Start' }));
    await seals.sealing();
    await act(async () => { undo.action!.onAction(); });
    expect(lastToast()?.title).toBe(tt('closed.busy'));
    seals.release();
    await settle();
    expect((await storedBoards()).boards.map((b) => b.name).sort()).toEqual(['Other', 'Start', 'Work']);
    expect(names(await storedHistory())).toEqual([]);
  });

  it('Close\'s Undo on its way makes the dialog\'s Restore of the same entry wait: one Board', async () => {
    const user = userEvent.setup();
    await open(realm());
    await screen.findByRole('tab', { name: /Start/, selected: true });
    await closeFromMenu(user);
    await waitFor(() => expect(screen.queryByRole('tab', { name: /Start/ })).toBeNull());
    await settle();
    const undo = lastToast()!;
    const seals = holdSeals();
    await act(async () => { undo.action!.onAction(); });
    await seals.sealing();
    const dialog = await openDialog(user);
    const restore = within(dialog).getByRole('button', { name: /^Restore Start/ });
    expect(restore).toHaveAttribute('aria-disabled', 'true');
    await user.click(restore);
    seals.release();
    await settle();
    expect((await storedBoards()).boards.map((b) => b.name).sort()).toEqual(['Other', 'Start', 'Work']);
    expect(names(await storedHistory())).toEqual([]);
  });

  it('Remove\'s Undo on its way makes the dialog\'s rows wait: nothing else starts', async () => {
    const user = userEvent.setup();
    await closedTwo(user);
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Remove Start from Closed Boards' }));
    await settle();
    const undo = lastToast()!;
    const seals = holdSeals();
    await act(async () => { undo.action!.onAction(); });
    await seals.sealing();
    const restore = within(dialog).getByRole('button', { name: /^Restore Work/ });
    expect(restore).toHaveAttribute('aria-disabled', 'true');
    await user.click(restore);
    seals.release();
    await settle();
    expect(names(await storedHistory()).sort()).toEqual(['Start', 'Work']);
    expect((await storedBoards()).boards.map((b) => b.name)).toEqual(['Other']);
  });

  it('a dialog Restore on its way makes Remove\'s Undo wait and say so', async () => {
    const user = userEvent.setup();
    await closedTwo(user);
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Remove Start from Closed Boards' }));
    await settle();
    const undo = lastToast()!;
    const seals = holdSeals();
    await user.click(within(dialog).getByRole('button', { name: 'Restore Work' }));
    await seals.sealing();
    await act(async () => { undo.action!.onAction(); });
    expect(lastToast()?.title).toBe(tt('closed.busy'));
    seals.release();
    await settle();
    expect(names(await storedHistory())).toEqual([]);
    expect((await storedBoards()).boards.map((b) => b.name).sort()).toEqual(['Other', 'Work']);
  });

  it('a restore whose Board is not saved says so, and does not say it was never opened', async () => {
    const user = userEvent.setup();
    await closedTwo(user);
    const dialog = await openDialog(user);
    failSeals(...Array.from({ length: 30 }, (_, i) => i + 1));
    await user.click(within(dialog).getByRole('button', { name: 'Restore Start' }));
    await waitFor(() => expect(lastToast()?.title).toBe(tt('closed.restoreUnsaved', { name: 'Start' })));
    vi.mocked(globalThis.crypto.subtle.encrypt).mockRestore();
    await settle();
    expect(names(await storedHistory())).toContain('Start');
  });

  it('with nothing closed it says so and offers no Clear all', async () => {
    const user = userEvent.setup();
    await open(realm());
    const dialog = await openDialog(user);
    expect(within(dialog).getByText(/No closed Boards in this realm/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Clear all' })).toBeNull();
  });
});

describe('outcome texts (closeText, restoreText)', () => {
  it('each Close refusal says what it means for the live Board, never another answer\'s words', () => {
    const say = (refused: string) => closeText(tt, 'Work', { refused } as never).title;
    expect(say('BOARD_CHANGED')).toBe(tt('closed.changed', { name: 'Work' }));
    expect(say('NOT_ADDED')).toBe(tt('closed.notDone', { name: 'Work' }));
    expect(say('NOT_FOUND')).toBe(tt('closed.boardGone', { name: 'Work' }));
    expect(say('NOT_STORED')).toBe(tt('closed.notClosedUnconfirmed', { name: 'Work' }));
    expect(say('HISTORY_FULL')).toBe(tt('closed.notClosed', { name: 'Work', why: tt('closed.tooBig') }));
    expect(closeText(tt, 'Work', { refused: 'NOT_KNOWN' } as never)).toEqual({ title: tt('closed.closeUnknown', { name: 'Work' }), tone: 'unknown' });
    expect(new Set(['BOARD_CHANGED', 'NOT_ADDED', 'NOT_FOUND', 'NOT_STORED'].map(say)).size).toBe(4);
  });
  it('a restore not saved or not known never reads as never opened', () => {
    expect(restoreText(tt, 'Work', 'full', { refused: 'BOARD_NOT_STORED' } as never)?.title).toBe(tt('closed.restoreUnsaved', { name: 'Work' }));
    expect(restoreText(tt, 'Work', 'full', { refused: 'NOT_KNOWN' } as never)?.tone).toBe('unknown');
    expect(restoreText(tt, 'Work', 'full', { refused: 'BOARDS_FULL' } as never)?.title).toBe('full');
    expect(restoreText(tt, 'Work', 'full', { entryKept: true })?.title).toBe(tt('closed.restoredKept', { name: 'Work' }));
    expect(restoreText(tt, 'Work', 'full', { entryKept: false })).toBeNull();
  });
});
