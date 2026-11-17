/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first: its sealed bytes go
   straight into localStorage, as that tab's write would leave them. */
// Vitest, the mounted Board: a keyed Add link
// (`&for=ow:nano&label=Nano`) lands on its program board on that computer, "Nano · atlas", made by the first link and
// reused by the next; the tile gets the keys. A link that cannot land adds nothing and offers Show it (the
// single-program view). A New Board another tab beat to the ninth Board is refused with the full-realm words, and the
// other tab's program board stays.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderPage, screen, waitFor } from '@app/testing';
import userEvent from '@testing-library/user-event';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { boardFor, boardSlots, createBoard, freshRealm, isRefusal, keyedAddTile, MAX_BOARDS, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { parseRealmBoards, toStored } from './model/persist';
import { resetFixtureSessions, setListDown } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const S = strings as Record<string, string>;
const said = (k: string, v: Record<string, string>) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => v[x] ?? '');
const toasts: Array<{ title: string; tone?: string; action?: { label: string; onAction: () => void } }> = [];
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: (typeof toasts)[number]) => { toasts.push(c); return 'toast-1'; } }));

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const NANO = { c: atlas.id, k: 'ow:nano' };
const term = (session: number): TileRef => ({ project: atlas.project_id, computer: atlas.id, program: 'terminal', session });
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const stored = async () => (await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards | null;
const realmWith = (k: number): RealmBoards => { let s = freshRealm(rand); while (s.boards.length < k) s = must(createBoard(s, rand, 'Board ' + (s.boards.length + 1))); return s; };
const keyed = (session: number) => `/board?add=terminal-${session}&cid=${atlas.id}&for=ow%3Anano&label=Nano`;
const tilesOf = (b: Board | undefined) => Object.values(b?.tiles ?? {}).filter(Boolean);
async function store(s: RealmBoards) {
  await act(async () => {
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}

beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  resetBoardsForTests();
  toasts.length = 0;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});

describe('a keyed Add link lands on its program board', () => {
  it('the first link makes "Nano · atlas" (active, tile entered); the second adds to it; the same place again adds nothing', async () => {
    const r = await renderPage(page, { path: '/board' });
    await screen.findByRole('tab', { name: /Main/ });
    await act(() => r.router.navigate({ href: keyed(8003) } as never));
    expect(await screen.findByRole('tab', { name: /Nano · atlas/, selected: true })).toBeInTheDocument();
    const f = await screen.findByTitle('terminal-8003 on atlas');
    await waitFor(() => expect(document.activeElement).toBe(f));
    expect(r.router.state.location.search).not.toHaveProperty('for');
    await act(() => r.router.navigate({ href: keyed(8004) } as never));
    expect(await screen.findByTitle('terminal-8004 on atlas')).toBeInTheDocument();
    await act(() => r.router.navigate({ href: keyed(8003) } as never));
    await waitFor(async () => {
      const s = await stored();
      expect(s?.boards).toHaveLength(2);
      expect(tilesOf(boardFor(s as RealmBoards, NANO))).toHaveLength(2);
    });
    expect(screen.getAllByRole('tab', { name: /Nano · atlas/ })).toHaveLength(1);
    expect(toasts).toEqual([]);
  });

  it('the landing enters its tile though another tab\'s value was opening meanwhile (the Board kept shown, busy)', async () => {
    const r = await renderPage(page, { path: '/board' });
    await screen.findByRole('tab', { name: /Main/ });
    await cryptIdleForTests();
    await store(realmWith(2));
    await screen.findByRole('tab', { name: /Board 2/ });
    const now = (await stored()) as RealmBoards;
    const kept = localStorage.getItem(BOARDS_KEY);
    await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored({ ...now, boards: now.boards.map((b, i) => (i === 0 ? { ...b, name: 'Theirs' } : b)) })));
    const theirs = localStorage.getItem(BOARDS_KEY) as string;
    localStorage.setItem(BOARDS_KEY, kept as string);
    // The landing waits for the cross-tab lock, and the other tab's value stays opening (the Board stays shown, marked
    // busy: keepshown), until each is released.
    const locks = (navigator as unknown as { locks: LockManager }).locks;
    const realLock = locks.request.bind(locks) as (...a: unknown[]) => Promise<unknown>;
    const subtle = globalThis.crypto.subtle;
    const realDec = subtle.decrypt.bind(subtle);
    let openLock!: () => void, openDec!: () => void;
    const lk = new Promise<void>((x) => { openLock = x; }), dec = new Promise<void>((x) => { openDec = x; });
    const sLock = vi.spyOn(locks, 'request').mockImplementation((async (...a: unknown[]) => { await lk; return realLock(...a); }) as never);
    const sDec = vi.spyOn(subtle, 'decrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['decrypt']>) => { await dec; return realDec(...a); });
    try {
      await act(() => r.router.navigate({ href: keyed(8003) } as never));
      await waitFor(() => expect(sLock).toHaveBeenCalled());
      act(() => { localStorage.setItem(BOARDS_KEY, theirs); window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage })); });
      await waitFor(() => expect(document.querySelector('[aria-busy="true"][data-refreshing]')).not.toBeNull());
      expect(screen.getByRole('tab', { name: /Board 2/ })).toBeInTheDocument();
      openLock();
      await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
      openDec();
    } finally { openLock(); openDec(); sLock.mockRestore(); sDec.mockRestore(); }
    expect(await screen.findByRole('tab', { name: /Nano · atlas/, selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Theirs/ })).toBeInTheDocument();
    const f = await screen.findByTitle('terminal-8003 on atlas');
    await waitFor(() => expect(document.activeElement).toBe(f));
    expect(toasts).toEqual([]);
  });

  it('keyed_add_boards_full_adds_nothing: 9 Boards, no Nano board: nothing changes, the toast offers Show it, which opens the program view', async () => {
    const r = await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    await store(realmWith(MAX_BOARDS));
    await screen.findByRole('tab', { name: /Board 9/ });
    const before = JSON.stringify(await stored());
    await act(() => r.router.navigate({ href: keyed(8003) } as never));
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(said('keyed.boardsFull', { name: 'Nano', computer: 'atlas' })));
    expect(JSON.stringify(await stored())).toBe(before);
    const t = toasts.find((x) => x.action)!;
    expect(t.action!.label).toBe(S['keyed.show']);
    await act(async () => { t.action!.onAction(); });
    await waitFor(() => expect(r.router.state.location.pathname).toBe(`/board/open/${encodeURIComponent(atlas.name + '.' + atlas.id.slice(-4))}/terminal-8003`));
  });

  it('keyed_add_board_full_adds_nothing: the Nano board holds 8 tiles: the toast names it and offers Show it', async () => {
    const r = await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    let s = realmWith(1);
    for (let i = 0; i < 8; i++) s = must(keyedAddTile(s, { for: NANO, name: 'Nano · atlas' }, term(8001 + i), rand)).state;
    await store(s);
    await screen.findByRole('tab', { name: /Nano · atlas/ });
    await act(() => r.router.navigate({ href: keyed(8100) } as never));
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(said('keyed.boardFull', { board: 'Nano · atlas', name: 'Nano', computer: 'atlas' })));
    expect(tilesOf(boardFor((await stored()) as RealmBoards, NANO))).toHaveLength(8);
  });
});

describe('a keyed Add link on a Board that pages', () => {
  it('goes last under 4 slots: tiles on earlier pages keep their place', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1000);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 250);
    const r = await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    let s = realmWith(1);
    for (const i of [8001, 8002, 8003]) s = must(keyedAddTile(s, { for: NANO, name: 'Nano · atlas' }, term(i), rand)).state;
    const b = boardFor(s, NANO)!;
    const [x, y, z] = boardSlots(b) as [string, string, string];
    const stacked: Board = { ...b, active: x, layout: { dir: 'col', ratio: 0.5, a: { slot: x }, b: { dir: 'col', ratio: 0.5, a: { slot: y }, b: { slot: z } } } };
    await store({ ...s, boards: s.boards.map((o) => (o.id === b.id ? stacked : o)) });
    await screen.findByRole('tab', { name: /Nano · atlas/ });
    await act(() => r.router.navigate({ href: keyed(8004) } as never));
    await waitFor(async () => {
      const on = boardFor((await stored()) as RealmBoards, NANO)!;
      expect(boardSlots(on).map((id) => (on.tiles[id] as TileRef).session)).toEqual([8001, 8002, 8003, 8004]);
    });
  });
});

describe('ordinary_create_after_keyed_ninth_never_drops_landing', () => {
  const realmName = () => fixtureWorld.realms.find((x) => x.id === FIXTURE_REALM)!.name;
  /** 8 Boards shown and stored; answers the bytes another tab stores with its keyed ninth (not yet written). */
  async function eightAndTheirs(): Promise<string> {
    await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    const eight = realmWith(MAX_BOARDS - 1);
    await store(eight);
    await screen.findByRole('tab', { name: /Board 8/ });
    const before = localStorage.getItem(BOARDS_KEY) as string;
    await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(must(keyedAddTile(eight, { for: NANO, name: 'Nano · atlas' }, term(8003), rand)).state)));
    const theirs = localStorage.getItem(BOARDS_KEY) as string;
    localStorage.setItem(BOARDS_KEY, before);
    return theirs;
  }
  async function keptAfter(): Promise<RealmBoards> {
    for (let i = 0; i < 4; i++) await act(() => cryptIdleForTests());
    return parseRealmBoards(JSON.parse(JSON.stringify(await stored()))).state;
  }

  it('Duplicate board as the other tab stores its keyed ninth: refused as a full realm, the program board stays', async () => {
    const theirs = await eightAndTheirs();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Boards' }));
    const item = await screen.findByRole('menuitem', { name: /^Duplicate/ });
    act(() => {
      fireEvent.click(item);
      localStorage.setItem(BOARDS_KEY, theirs);
    });
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(said('board.fullRealm', { realm: realmName() })));
    const after = await keptAfter();
    expect(after.boards).toHaveLength(MAX_BOARDS);
    expect(boardFor(after, NANO)).toBeDefined();
  });

  it('Import of a Board file as the other tab stores its keyed ninth: refused as a full realm, the program board stays', async () => {
    const theirs = await eightAndTheirs();
    const src = must(createBoard(freshRealm(rand), rand, 'Imported one'));
    const doc = { kind: 'hoody-board', v: 1, board: toStored({ v: 1, active: src.active, boards: [src.boards[1]!], recents: [] }).boards[0] };
    const field = document.querySelector('input[type="file"]') as HTMLInputElement;
    act(() => {
      fireEvent.change(field, { target: { files: [new File([JSON.stringify(doc)], 'board.json', { type: 'application/json' })] } });
      localStorage.setItem(BOARDS_KEY, theirs);
    });
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(said('board.importFull', { realm: realmName() })));
    const after = await keptAfter();
    expect(after.boards).toHaveLength(MAX_BOARDS);
    expect(boardFor(after, NANO)).toBeDefined();
    expect(after.boards.some((b) => b.name === 'Imported one')).toBe(false);
  });

  it('8 Boards; another tab stores its keyed ninth as this tab presses New Board: this tab is refused, the program board stays after a reload', async () => {
    await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    const eight = realmWith(MAX_BOARDS - 1);
    await store(eight);
    await screen.findByRole('tab', { name: /Board 8/ });
    // The other tab's value: the same 8 and its Nano board (sealed as its store would leave it).
    const before = localStorage.getItem(BOARDS_KEY) as string;
    await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(must(keyedAddTile(eight, { for: NANO, name: 'Nano · atlas' }, term(8003), rand)).state)));
    const theirs = localStorage.getItem(BOARDS_KEY) as string;
    localStorage.setItem(BOARDS_KEY, before);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'New Board' }));
      localStorage.setItem(BOARDS_KEY, theirs); // stored by the other tab first
    });
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(said('board.fullRealm', { realm: fixtureWorld.realms.find((x) => x.id === FIXTURE_REALM)!.name })));
    for (let i = 0; i < 4; i++) await act(() => cryptIdleForTests());
    const after = parseRealmBoards(JSON.parse(JSON.stringify(await stored()))).state;
    expect(after.boards).toHaveLength(MAX_BOARDS);
    expect(boardFor(after, NANO)).toBeDefined();
    expect(after.boards.some((b) => b.name === 'Board 9')).toBe(false);
  });
});

function holdSeal() {
  const subtle = globalThis.crypto.subtle;
  const real = subtle.encrypt.bind(subtle);
  let open!: () => void;
  const gate = new Promise<void>((x) => { open = x; });
  const spy = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['encrypt']>) => { await gate; return real(...a); });
  return { sealing: () => waitFor(() => expect(spy).toHaveBeenCalled()), release: () => { open(); spy.mockRestore(); } };
}

describe('a Board a locked commit made, renamed while its store waits, then a lost race', () => {
  async function setUp() {
    const r = await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    const two = realmWith(2);
    await store(two);
    await screen.findByRole('tab', { name: /Board 2/ });
    // The other tab's value: Board 1 renamed (sealed as its store would leave it).
    const before = localStorage.getItem(BOARDS_KEY) as string;
    await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored({ ...two, boards: two.boards.map((b, i) => (i === 0 ? { ...b, name: 'Theirs' } : b)) })));
    const theirs = localStorage.getItem(BOARDS_KEY) as string;
    localStorage.setItem(BOARDS_KEY, before);
    return { r, theirs };
  }
  async function renameShown(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(screen.getByRole('button', { name: 'Boards' }));
    await user.click(screen.getByRole('menuitem', { name: /^Rename/ }));
    const box = await screen.findByRole('textbox', { name: /^Rename / });
    await user.clear(box);
    // Boards ▾ > Rename is the rename in place on the tab: Enter keeps it.
    await user.type(box, name + '{Enter}');
  }
  const after = async () => parseRealmBoards(JSON.parse(JSON.stringify(await stored()))).state;

  it('New Board: the rename stays on the Board the retry makes (the same Board)', async () => {
    const user = userEvent.setup();
    const { theirs } = await setUp();
    const held = holdSeal();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'New Board' }));
      await held.sealing();
      await screen.findByRole('tab', { name: /Board 3/, selected: true });
      await renameShown(user, 'Editors');
      localStorage.setItem(BOARDS_KEY, theirs); // the other tab stored first
    } finally { held.release(); }
    await waitFor(async () => expect((await after()).boards.map((b) => b.name)).toEqual(['Theirs', 'Board 2', 'Editors']));
    for (let i = 0; i < 4; i++) await act(() => cryptIdleForTests());
    expect((await after()).boards.map((b) => b.name)).toEqual(['Theirs', 'Board 2', 'Editors']);
  });

  it('a keyed landing: the rename stays on the program board the retry makes (the same Board)', async () => {
    const user = userEvent.setup();
    const { r, theirs } = await setUp();
    const held = holdSeal();
    try {
      await act(() => r.router.navigate({ href: keyed(8003) } as never));
      await held.sealing();
      await screen.findByRole('tab', { name: /Nano · atlas/, selected: true });
      await renameShown(user, 'Editors');
      localStorage.setItem(BOARDS_KEY, theirs);
    } finally { held.release(); }
    await waitFor(async () => expect(boardFor(await after(), NANO)?.name).toBe('Editors'));
    for (let i = 0; i < 4; i++) await act(() => cryptIdleForTests());
    const s = await after();
    expect(s.boards.map((b) => b.name)).toEqual(['Theirs', 'Board 2', 'Editors']);
    expect(tilesOf(boardFor(s, NANO)).map((x) => (x as { session?: number }).session)).toEqual([8003]);
  });
});
