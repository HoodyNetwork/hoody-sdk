// Vitest: a "new terminal" Add link (links.ts boardAddPath { kind: 'terminal', session: 'new' }; Computers'
// New terminal): the Board finds the computer as for any Add link, then puts a terminal of the next free number on the
// active Board, past the computer's live sessions when that read answers, past what the Boards and recents know when
// it fails.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, boardSlots, createBoard, freshRealm, isRefusal, type Board, type RealmBoards, type TileRef } from './model/boards';
import type * as AddNew from './addNew';
import type * as Computers from './computers';
import type { TermSession } from './termSessions';
import { toStored } from './model/persist';
import { resetFixtureSessions, setListDown } from './fixtures';
import page from './page';

const toasts: Array<{ title: string }> = [];
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string }) => { toasts.push(c); return 'toast-1'; } }));
// Live reads the test answers by hand (null: the real read), and a computer list the test can drop atlas from.
type Read = { signal: AbortSignal; answer: (rows: readonly TermSession[] | null) => void };
const H = vi.hoisted(() => ({ hand: false, reads: [] as Read[], hide: false, subs: new Set<() => void>() }));
vi.mock('./addNew', async (orig) => {
  const real = await orig<typeof AddNew>();
  return {
    ...real,
    readLiveFor: (...a: Parameters<typeof real.readLiveFor>) => {
      if (!H.hand) return real.readLiveFor(...a);
      return new Promise<readonly TermSession[] | null>((answer) => { H.reads.push({ signal: a[1], answer }); });
    },
  };
});
vi.mock('./computers', async (orig) => {
  const real = await orig<typeof Computers>();
  const { useSyncExternalStore } = await import('react');
  const sub = (f: () => void) => { H.subs.add(f); return () => { H.subs.delete(f); }; };
  return {
    ...real,
    useBoardComputers: () => {
      const r = real.useBoardComputers();
      const hide = useSyncExternalStore(sub, () => H.hide);
      return hide && r.rows ? { ...r, rows: r.rows.filter((c) => c.name !== 'atlas') } : r;
    },
  };
});
const hideAtlas = () => { H.hide = true; H.subs.forEach((f) => f()); };
const rows = (...ns: number[]) => ns.map((n) => ({ n, offered: true }) as unknown as TermSession);

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const link = `/board?add=terminal-new&cid=${atlas.id}`;
const stored = async () => (await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards | null;
const terminals = async () => (await stored())?.boards.flatMap((b) => Object.values(b.tiles)).filter((x) => !!x && 'program' in x && x.program === 'terminal').map((x) => (x as { session: number }).session) ?? [];

beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  resetBoardsForTests();
  toasts.length = 0;
  H.hand = false; H.reads.length = 0; H.hide = false;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});

describe('Board: a "new terminal" Add link', () => {
  it('opens the next number past the computer\'s live sessions, gets the keys, and goes to recents', async () => {
    const r = await renderPage(page, { path: link, state: 'sessions' });
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    const f = await screen.findByTitle('terminal-10 on atlas');
    await waitFor(() => expect(document.activeElement).toBe(f));
    await waitFor(async () => expect(await terminals()).toEqual([10]));
    expect((await stored())?.recents[0]).toMatchObject({ computer: atlas.id, program: 'terminal', session: 10 });
    expect(toasts).toEqual([]);
  });

  it('when the live read fails, it goes past what the Boards and recents know', async () => {
    const r = await renderPage(page, { path: '/board', state: 'sessionsFailed' });
    await cryptIdleForTests();
    const s: RealmBoards = { ...freshRealm(() => 0.5), recents: [{ project: atlas.project_id, computer: atlas.id, program: 'terminal', session: 12 }] };
    await act(async () => {
      await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
      // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
      await cryptIdleForTests();
    });
    await act(() => r.router.navigate({ href: link } as never));
    expect(await screen.findByTitle('terminal-13 on atlas')).toBeInTheDocument();
    await waitFor(async () => expect(await terminals()).toEqual([13]));
    expect(toasts).toEqual([]);
  });

  it('two links queued while the first read is out get two numbers, in order', async () => {
    H.hand = true;
    const r = await renderPage(page, { path: link, state: 'sessions' });
    await waitFor(() => expect(H.reads).toHaveLength(1));
    await act(() => r.router.navigate({ href: link + '&b=' } as never));
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    expect(H.reads).toHaveLength(1);
    await act(async () => { H.reads[0]!.answer(rows(4)); });
    expect(await screen.findByTitle('terminal-5 on atlas')).toBeInTheDocument();
    await waitFor(() => expect(H.reads).toHaveLength(2));
    await act(async () => { H.reads[1]!.answer(rows(4)); });
    expect(await screen.findByTitle('terminal-6 on atlas')).toBeInTheDocument();
    await waitFor(async () => expect((await terminals()).sort((a, b) => a - b)).toEqual([5, 6]));
  });

  it('leaving the Board while its read is out adds nothing, says so, and a late answer changes nothing', async () => {
    H.hand = true;
    const r = await renderPage(page, { path: link, state: 'sessions' });
    await waitFor(() => expect(H.reads).toHaveLength(1));
    await act(() => r.router.navigate({ href: `/board/open/${atlas.name}.${atlas.id.slice(-4)}/files-1` } as never));
    await waitFor(() => expect(toasts.map((x) => x.title)).toEqual(['The Board closed before the tile from the Board link was added. Put it on the Board again to add it.']));
    expect(H.reads[0]!.signal.aborted).toBe(true);
    await act(async () => { H.reads[0]!.answer(rows()); });
    await cryptIdleForTests();
    expect(await terminals()).toEqual([]);
  });

  it('a link the list stops showing the computer for is settled once: its late read places nothing', async () => {
    H.hand = true;
    await renderPage(page, { path: link, state: 'sessions' });
    await waitFor(() => expect(H.reads).toHaveLength(1));
    act(() => hideAtlas());
    await waitFor(() => expect(toasts.map((x) => x.title)).toEqual(["This Board link doesn't match a computer here, so nothing was added."]));
    await act(async () => { H.reads[0]!.answer(rows()); });
    await cryptIdleForTests();
    expect(await terminals()).toEqual([]);
    expect(screen.queryByTitle(/^terminal-\d+ on atlas$/)).toBeNull();
  });

  it('a rename holding the state defers the link: no read until it closes, then one read and one tile', async () => {
    H.hand = true;
    const user = userEvent.setup();
    const r = await renderPage(page, { path: '/board', state: 'sessions' });
    await user.click(await screen.findByRole('button', { name: 'Boards' }));
    await user.click(screen.getByRole('menuitem', { name: /^Rename/ }));
    await user.type(await screen.findByRole('textbox', { name: /^Rename / }), 'x');
    await act(() => r.router.navigate({ href: link } as never));
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    await cryptIdleForTests();
    expect(H.reads).toHaveLength(0);
    expect((screen.getByRole('textbox', { name: /^Rename / }) as HTMLInputElement).value).toContain('x');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(H.reads).toHaveLength(1));
    await act(async () => { H.reads[0]!.answer(rows(4)); });
    expect(await screen.findByTitle('terminal-5 on atlas')).toBeInTheDocument();
    await waitFor(async () => expect(await terminals()).toEqual([5]));
  });

  it('another tab\'s write keeps an open rename and its hold: the link waits for the rename to close, then counts that tab\'s Board', async () => {
    H.hand = true;
    const user = userEvent.setup();
    const r = await renderPage(page, { path: '/board', state: 'sessions' });
    await user.click(await screen.findByRole('button', { name: 'Boards' }));
    await user.click(screen.getByRole('menuitem', { name: /^Rename/ }));
    await user.type(await screen.findByRole('textbox', { name: /^Rename / }), 'x');
    await act(() => r.router.navigate({ href: link } as never));
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    let n = 0;
    const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
    const two = createBoard(freshRealm(rand), rand, 'Two');
    if (isRefusal(two)) throw new Error('refused');
    const placed = addTile(two.boards[1]!, { project: atlas.project_id, computer: atlas.id, program: 'terminal', session: 12 }, rand);
    if (isRefusal(placed)) throw new Error('refused');
    const other: RealmBoards = { ...two, active: two.boards[0]!.id, boards: [two.boards[0]!, placed.board] };
    await act(async () => {
      await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(other));
      // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
      await cryptIdleForTests();
    });
    // keepshown: the write leaves the rename open, so its hold stands and the link still waits.
    await waitFor(() => expect(document.querySelector('[data-refreshing]')).toBeNull());
    expect(screen.getByRole('textbox', { name: /^Rename / })).toBeInTheDocument();
    expect(H.reads).toHaveLength(0);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /^Rename / })).toBeNull());
    await waitFor(() => expect(H.reads).toHaveLength(1));
    await act(async () => { H.reads[0]!.answer(rows(4)); });
    await waitFor(async () => expect((await terminals()).sort((a, b) => a - b)).toEqual([12, 13]));
  });

  it('a window resized while the read is out places the tile by the new size: on a Board now paging it goes last', async () => {
    H.hand = true;
    let h = 900;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => h);
    // Every observer the page makes hears the resize (the Board's area, and the strip row's own fit).
    const fires: Array<() => void> = [];
    const fire = () => { for (const f of fires) f(); };
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { fires.push(cb); } observe() {} disconnect() {} });
    let n = 0;
    const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
    const term = (session: number): TileRef => ({ project: atlas.project_id, computer: atlas.id, program: 'terminal', session });
    const s = freshRealm(rand);
    let b = s.boards[0] as Board;
    for (const i of [1, 2, 3]) { const x = addTile(b, term(i), rand); if (isRefusal(x)) throw new Error('refused'); b = x.board; }
    const [x, y, z] = boardSlots(b) as [string, string, string];
    const stacked: Board = { ...b, active: x, layout: { dir: 'col', ratio: 0.5, a: { slot: x }, b: { dir: 'col', ratio: 0.5, a: { slot: y }, b: { slot: z } } } };
    const r = await renderPage(page, { state: 'sessions' });
    await cryptIdleForTests();
    await act(async () => {
      await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored({ ...s, boards: [stacked] }));
      // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
      await cryptIdleForTests();
    });
    await screen.findByTitle('terminal-1 on atlas');
    await act(() => r.router.navigate({ href: link } as never));
    await waitFor(() => expect(H.reads).toHaveLength(1));
    h = 250;
    act(() => fire());
    await act(async () => { H.reads[0]!.answer(rows(4)); });
    await waitFor(async () => {
      const on = (await stored())!.boards[0]!;
      expect(boardSlots(on).map((id) => (on.tiles[id] as TileRef).session)).toEqual([1, 2, 3, 5]);
    });
    vi.unstubAllGlobals();
  });

  it('an answer that comes while a rename holds the state places nothing; the release reads again and places once', async () => {
    H.hand = true;
    const user = userEvent.setup();
    await renderPage(page, { path: link, state: 'sessions' });
    await waitFor(() => expect(H.reads).toHaveLength(1));
    await user.click(await screen.findByRole('button', { name: 'Boards' }));
    await user.click(screen.getByRole('menuitem', { name: /^Rename/ }));
    await user.type(await screen.findByRole('textbox', { name: /^Rename / }), 'x');
    await act(async () => { H.reads[0]!.answer(rows(4)); });
    await cryptIdleForTests();
    expect(await terminals()).toEqual([]);
    expect((screen.getByRole('textbox', { name: /^Rename / }) as HTMLInputElement).value).toContain('x');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(H.reads).toHaveLength(2));
    await act(async () => { H.reads[1]!.answer(rows(6)); });
    expect(await screen.findByTitle('terminal-7 on atlas')).toBeInTheDocument();
    await waitFor(async () => expect(await terminals()).toEqual([7]));
  });

  it('a tile drag that starts just before the answer, not drawn yet, still holds the link until the drag ends', async () => {
    H.hand = true;
    const r = await renderPage(page, { path: link, state: 'sessions' });
    await waitFor(() => expect(H.reads).toHaveLength(1));
    await act(async () => { H.reads[0]!.answer(rows(4)); });
    await screen.findByTitle('terminal-5 on atlas');
    await act(() => r.router.navigate({ href: link + '&b=' } as never));
    await waitFor(() => expect(H.reads).toHaveLength(2));
    const area = screen.getByRole('group', { name: 'Board tiles' });
    await waitFor(() => expect(area.querySelector('[class*="head"]')).not.toBeNull());
    const head = area.querySelector('[class*="head"]') as HTMLElement;
    act(() => { head.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 40, clientY: 10 })); });
    // The drag begins (hold(true)) and the read answers in one task: the answer runs before React draws the hold.
    await act(async () => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 300 }));
      H.reads[1]!.answer(rows(4));
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    await cryptIdleForTests();
    expect(await terminals()).toEqual([5]);
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 400, clientY: 300 })); });
    await waitFor(() => expect(H.reads).toHaveLength(3));
    await act(async () => { H.reads[2]!.answer(rows(4)); });
    await waitFor(async () => expect((await terminals()).sort((a, b) => a - b)).toEqual([5, 6]));
  });

  it('two links in a row get two numbers', async () => {
    const r = await renderPage(page, { path: link, state: 'sessions' });
    await screen.findByTitle('terminal-10 on atlas');
    await act(() => r.router.navigate({ href: link + '&b=' } as never));
    expect(await screen.findByTitle('terminal-11 on atlas')).toBeInTheDocument();
    await waitFor(async () => expect((await terminals()).sort((a, b) => a - b)).toEqual([10, 11]));
  });

  it('a computer not in the list adds nothing and says so, as any Add link', async () => {
    await renderPage(page, { path: '/board?add=terminal-new&cid=000000000000000000000000', state: 'sessions' });
    await waitFor(() => expect(toasts.map((x) => x.title)).toEqual(["This Board link doesn't match a computer here, so nothing was added."]));
    expect(await terminals()).toEqual([]);
  });
});
