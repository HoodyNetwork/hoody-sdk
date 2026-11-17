// Vitest: "Keep frames loaded on other pages", the Board menu's checkbox, through the real router
// and the shell's page host. Leaving is a route no page of this test serves (page tests load one page; the host then
// shows none). On, the Board stays loaded and hidden while the person is away: its frame is the same element on
// return (it never reloads). Off, the Board unloads as before. The
// choice is the realm's, stored with its Boards. A kept Board hiding closes its "Added to …" toast, whose Open Board
// a hidden Board could not follow.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, freshRealm, isRefusal, onActive, setKeepLoaded, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { toStored } from './model/persist';
import page from './page';
import { resetFixtureSessions, setListDown } from './fixtures';
import boardStrings from './strings.en.json';
// Toast titles come from the strings file (a reworded or re-punctuated string needs no test edit).
const said = (k: keyof typeof boardStrings, v: Record<string, string>): string => boardStrings[k].replace(/\{\{(\w+)\}\}/g, (_, x: string) => v[x] ?? '');

const toasts: Array<{ title: string; id: string }> = [];
const closed: string[] = [];
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return {
    ...kit,
    showToast: (c: { title: string }) => { const id = `toast-${toasts.length + 1}`; toasts.push({ title: c.title, id }); return id; },
    closeToast: (id: string) => { closed.push(id); },
  };
});

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const handle = atlas.name + '.' + atlas.id.slice(-4);
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
const tile: TileRef = { project: atlas.project_id, computer: atlas.id, program: 'terminal', session: 1 };
function withTerminal(keep: boolean): RealmBoards {
  const s = onActive(freshRealm(rand), (b): Board | Refusal => { const r = addTile(b, tile, rand); return isRefusal(r) ? r : r.board; });
  if (isRefusal(s)) throw new Error('refused');
  return setKeepLoaded(s, keep);
}

async function openHub(path: string, s: RealmBoards | null, state?: string) {
  const { router } = await renderPage(page, { path, ...(state ? { state } : {}) });
  if (s) {
    await screen.findByRole('heading', { level: 1 });
    await act(async () => {
      await cryptIdleForTests();
      await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
      // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
      await cryptIdleForTests();
    });
  }
  const go = async (href: string) => { await act(async () => { await router.navigate({ href } as never); }); };
  return { router, go };
}
const stored = async () => ((await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards | null) ?? undefined;
const AWAY = '/elsewhere';
const boardSlot = () => document.querySelector('[data-hub-page="board"]');
/** The tile's loading skeleton, drawn beside its frame while the frame reads 'loading'. */
const skeleton = (f: HTMLElement) => f.parentElement?.querySelector(':scope > [aria-hidden="true"]') ?? null;
const LEFT = 'The Board closed before the tile from the Board link was added. Put it on the Board again to add it.';

beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  resetBoardsForTests();
  toasts.length = 0;
  closed.length = 0;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Board kept loaded on other pages', () => {
  it('on: away on another page and back, the frame is the same element and was never unloaded', async () => {
    const { go } = await openHub('/board', withTerminal(true));
    const f = await screen.findByTitle('terminal-1 on atlas');
    await go(AWAY);
    await waitFor(() => expect(boardSlot()?.hasAttribute('data-hub-page-hidden')).toBe(true));
    expect(f.isConnected).toBe(true);
    await go('/board');
    await waitFor(() => expect(boardSlot()?.hasAttribute('data-hub-page-hidden')).toBe(false));
    expect(screen.getByTitle('terminal-1 on atlas')).toBe(f);
  });

  it('on: a frame that loaded before leaving reads loaded on return (no loading skeleton)', async () => {
    const { go } = await openHub('/board', withTerminal(true));
    const f = await screen.findByTitle('terminal-1 on atlas');
    expect(skeleton(f)).not.toBeNull();
    act(() => { f.dispatchEvent(new Event('load')); });
    await waitFor(() => expect(skeleton(f)).toBeNull());
    await go(AWAY);
    await waitFor(() => expect(boardSlot()?.hasAttribute('data-hub-page-hidden')).toBe(true));
    await go('/board');
    await waitFor(() => expect(boardSlot()?.hasAttribute('data-hub-page-hidden')).toBe(false));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(skeleton(f)).toBeNull();
  });

  it('on: the picker left open is still open on return (a Connect it holds is not dropped)', async () => {
    const user = userEvent.setup();
    const { go } = await openHub('/board', withTerminal(true));
    await screen.findByTitle('terminal-1 on atlas');
    await user.click(screen.getAllByRole('button', { name: /^Add a program/ })[0]!);
    expect(await screen.findByRole('row', { name: /^atlas/ })).toBeInTheDocument();
    await go(AWAY);
    await waitFor(() => expect(boardSlot()?.hasAttribute('data-hub-page-hidden')).toBe(true));
    await go('/board');
    await waitFor(() => expect(boardSlot()?.hasAttribute('data-hub-page-hidden')).toBe(false));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByRole('row', { name: /^atlas/ })).toBeInTheDocument();
  });

  it.each([[true, false], [false, true]])('kept %s: leaving with a Board link still waiting says it was not added: %s', async (keep, said) => {
    // The computer list cannot be read: the link waits for it.
    const { go, router } = await openHub('/board', withTerminal(keep), 'failed');
    await waitFor(() => expect(boardSlot()).not.toBeNull());
    await go(`/board?add=terminal-3&cid=${atlas.id}`);
    // Taken (the address drops it); the computer list cannot answer, so it waits.
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(screen.queryByTitle('terminal-3 on atlas')).toBeNull();
    await go(AWAY);
    await waitFor(() => expect(boardSlot()?.hasAttribute('data-hub-page-hidden') ?? false).toBe(keep));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(toasts.map((x) => x.title).includes(LEFT)).toBe(said);
  });

  it('off: the Board unloads when left, and comes back with a new frame', async () => {
    const { go } = await openHub('/board', withTerminal(false));
    const f = await screen.findByTitle('terminal-1 on atlas');
    await go(AWAY);
    await waitFor(() => expect(f.isConnected).toBe(false));
    await go('/board');
    const g = await screen.findByTitle('terminal-1 on atlas');
    expect(g).not.toBe(f);
  });

  it('the Board menu checkbox turns it on and off, says what it does, and stores it with the realm\'s Boards', async () => {
    const user = userEvent.setup();
    await openHub('/board', withTerminal(false));
    await screen.findByTitle('terminal-1 on atlas');
    await user.click(await screen.findByRole('button', { name: 'Boards' }));
    const item = await screen.findByRole('menuitemcheckbox', { name: 'Keep frames loaded on other pages' });
    expect(item.getAttribute('aria-checked')).toBe('false');
    await user.click(item);
    expect(toasts.map((x) => x.title)).toContain("Frames keep running while you use other pages, so they're ready when you come back. This uses more memory.");
    await waitFor(async () => expect((await stored())?.keep).toBe(true));
    await user.click(await screen.findByRole('button', { name: 'Boards' }));
    const again = await screen.findByRole('menuitemcheckbox', { name: 'Keep frames loaded on other pages' });
    expect(again.getAttribute('aria-checked')).toBe('true');
    await user.click(again);
    expect(toasts.map((x) => x.title)).toContain('Frames close when you leave the Board, and load again when you come back.');
    await waitFor(async () => expect((await stored())?.keep).toBeUndefined());
  });

  it('a kept Board hiding closes its "Added to Main" toast (Open Board would do nothing from a hidden Board)', async () => {
    const user = userEvent.setup();
    const { go } = await openHub(`/board/open/${handle}/terminal-2`, withTerminal(true));
    expect(await screen.findByTitle('terminal-2 on atlas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add to Main/ }));
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(said('view.added', { board: 'Main' })));
    const id = toasts.find((x) => x.title === said('view.added', { board: 'Main' }))!.id;
    expect(closed).not.toContain(id);
    await go(AWAY);
    await waitFor(() => expect(closed).toContain(id));
  });

  it('not kept, leaving keeps the "Added to Main" toast as before (its Open Board still works from an unloaded page)', async () => {
    const user = userEvent.setup();
    const { go } = await openHub(`/board/open/${handle}/terminal-2`, withTerminal(false));
    expect(await screen.findByTitle('terminal-2 on atlas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add to Main/ }));
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(said('view.added', { board: 'Main' })));
    await go(AWAY);
    expect(closed).toEqual([]);
  });
});
