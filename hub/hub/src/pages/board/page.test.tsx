// Vitest: the Board page through the real router on core's fixture world (Personal: atlas running, cedar stopped,
// fjord paused). First visit, the picker, live and placeholder tiles, keys, Boards, reload, realm switch, parent-key
// messages and the program view. The Board area is given a desktop size (jsdom measures 0) unless a test wants
// one tile at a time.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TERM_THEMES } from './options/themes';
import { act, configure, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { computerLifecycle, FIXTURE_BOOT_TOKEN, FIXTURE_REALM, fixtureWorld, heldChanges, lifecycleLock, localSetting, rememberedComputerId } from '@core';
import { cryptIdleForTests, storedForTests, vaultForTests, writeSealedForTests } from '@core/cryptStore';
import { newBaseKey, newKeyId } from '@core/crypt/envelope';
import { setRealm } from '@core/ctx';
import { CHANGE_STORE_KEY, readChanges, writeChanges } from '@core/change-store';
import type { PageShortcut } from '@kit';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, createBoard, focusSlot, freshRealm, isRefusal, onActive, splitAt, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { toStored } from './model/persist';
import page from './page';
import { NOTES_ROADMAP, NOTES_TEAM, NOTES_USER, holdList, resetFixtureSessions, setListDown, setRentalEnded } from './fixtures';
import { ADD_WAIT_MS } from './parts/BoardView';
import { CATALOG, startView } from './embed/catalog';
import boardStrings from './strings.en.json';
import { findTile, kindNames, toKind } from './parts/browse.testkit';
// A tile's accessible name (its card's text: name, then its line).
const nameOf = (row: HTMLElement) => row.getAttribute('aria-label') ?? '';
// Toast titles come from the strings file (a reworded or re-punctuated string needs no test edit).
const said = (k: keyof typeof boardStrings, v: Record<string, string>): string => boardStrings[k].replace(/\{\{(\w+)\}\}/g, (_, x: string) => v[x] ?? '');

// Toasts are the shell's (not rendered here): what the page asked to show is recorded.
const toasts: Array<{ title: string; tone?: string; action?: { label: string; onAction: () => unknown } }> = [];
// A phone is the kit's media question; tests answer it.
let phone = false;
// Pages this load hides, as the shell's PagesProvider would: usePageLink falls back to the classic Hub's view,
// useServedPageLink gives none (no classic fallback).
const hiddenPages = new Set<string>();
// The lift the page gives the shell's focus-mode restore button, as last asked.
let lift: number | undefined;
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown> & { useChromeHidden: (...a: unknown[]) => void }>();
  return {
    ...kit,
    showToast: (c: (typeof toasts)[number]) => { toasts.push(c); return 'toast-1'; },
    useIsPhone: () => phone,
    openShortcutsSheet: () => { sheets++; },
    useChromeHidden: (...a: unknown[]) => { lift = (a[2] as { lift?: number } | undefined)?.lift; kit.useChromeHidden(...a); },
    usePageShortcuts: (k: PageShortcut[]) => { pageKeys = k; (kit.usePageShortcuts as (k: PageShortcut[]) => void)(k); },
    usePageLink: (id: string) => (hiddenPages.has(id) ? { kind: 'classic', href: `/auth/home?view=${id}` } : (kit.usePageLink as (id: string) => unknown)(id)),
    useServedPageLink: (id: string) => (hiddenPages.has(id) ? null : (kit.useServedPageLink as (id: string) => unknown)(id)),
  };
});

let sheets = 0;
// The page's keys, as last given to the shell.
let pageKeys: PageShortcut[] = [];
const UID = fixtureWorld.account.id;
const OTHER_REALM = fixtureWorld.realms.map((r) => r.id).find((id) => id !== FIXTURE_REALM) as string;
const byName = (n: string) => fixtureWorld.computers.find((c) => c.name === n)!;
const atlas = byName('atlas');
const cedar = byName('cedar');
const fjord = byName('fjord');
const borealis = byName('borealis');
// A tile as the picker writes it: Files' catalogue default needs a path, so it starts on its Root view.
const tileOf = (c: { id: string; project_id: string }, program: TileRef['program'], session = 1): TileRef => ({ project: c.project_id, computer: c.id, program, session, ...(program === 'files' ? { view: 'root' } : {}) });
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);

function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
function withTiles(...tiles: TileRef[]): RealmBoards {
  let s = freshRealm(rand);
  for (const t of tiles) s = must(onActive(s, (b): Board | Refusal => { const r = addTile(b, t, rand); return isRefusal(r) ? r : r.board; }));
  return s;
}
// The stored document as text, through core (raw: other layouts, and the sealed bytes); values go through core's
// encrypted store seams (as another tab's store would write them, then its storage event).
const raw = () => localSetting(BOARDS_KEY, { keepAtSignOut: true });
async function seed(realm: string, s: RealmBoards) {
  await cryptIdleForTests();
  await writeSealedForTests(BOARDS_KEY, realm, toStored(s));
  // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
  window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
  await cryptIdleForTests();
}
// renderPage boots core afresh (storage emptied), so a stored set arrives after render, as another tab's write would.
async function open(s: RealmBoards | null, opts: Parameters<typeof renderPage>[1] = {}) {
  const r = await renderPage(page, opts);
  if (s) await act(() => seed(FIXTURE_REALM, s));
  return r;
}
/** This account's stored value for a realm, opened (undefined: nothing stored). */
async function storedBoards(realm = FIXTURE_REALM): Promise<RealmBoards | undefined> {
  return ((await storedForTests(BOARDS_KEY, realm)) as RealmBoards | null) ?? undefined;
}
/** A stored tile as the assertions here compare it: it must carry its tile id (S-id), which is then left out. */
function plain<T>(t: T): T {
  if (!t || typeof t !== 'object') return t;
  const { tid, ...rest } = t as { tid?: unknown };
  expect(tid).toMatch(/^t[a-z0-9]{4,24}$/);
  return rest as T;
}
const area = () => screen.getByRole('group', { name: 'Board tiles' });
const frames = () => Array.from(document.querySelectorAll('iframe'));

let size: { w: number; h: number } = { w: 1280, h: 800 };
beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  holdList.wait = null;
  resetBoardsForTests(); // each test is a new page: core's prefs and crypt store start afresh (test setup)
  toasts.length = 0;
  phone = false;
  hiddenPages.clear();
  size = { w: 1280, h: 800 };
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => size.w);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size.h);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Board: first visit and the picker', () => {
  it('shows one Main Board with the welcome lines and a primary Add', async () => {
    await renderPage(page);
    expect(await screen.findByRole('tab', { name: /Main/ })).toBeInTheDocument();
    expect(screen.getByText('Put your computers side by side')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add a program/ })).toBeInTheDocument();
    expect(frames()).toHaveLength(0);
    // Nothing is stored before the first change.
    expect(raw().get()).toBeNull();
  });

  it('adds atlas › Terminal › terminal-1 and frames it with Board options and no token', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await user.click(await screen.findByRole('button', { name: /Add a program/ }));
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    await user.click(await screen.findByRole('row', { name: /^terminal-1/ }));
    const f = await screen.findByTitle('terminal-1 on atlas');
    expect(f.tagName).toBe('IFRAME');
    const src = f.getAttribute('src') ?? '';
    expect(src).toMatch(/^https:\/\//);
    expect(src).toContain('parent_keys=true');
    expect(src).not.toMatch(/token/i);
    expect(f.getAttribute('sandbox')).toContain('allow-scripts');
    expect(f.getAttribute('referrerpolicy')).toBe('origin');
    // Stored after the write delay: the Board, never a URL.
    await waitFor(async () => expect(await storedBoards()).toBeDefined());
    expect(JSON.stringify(await storedBoards())).not.toMatch(/https?:|token/i);
  });

  it('Files has one session: the picker skips that step and the tile starts on its Root view', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await user.click(await screen.findByRole('button', { name: /Add a program/ }));
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Files/));
    expect(await screen.findByTitle('files-1 on atlas')).toBeInTheDocument();
    await waitFor(async () => expect(Object.values((await storedBoards())?.boards[0]?.tiles ?? {}).find(Boolean)).toMatchObject({ program: 'files', session: 1, view: 'root' }));
  });

  it('SQLite is offered with one session: the picker skips that step and the tile starts on its Overview', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await user.click(await screen.findByRole('button', { name: /Add a program/ }));
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/SQLite/));
    expect(await screen.findByTitle('sqlite-1 on atlas')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /New session/ })).not.toBeInTheDocument();
    await waitFor(async () => expect(Object.values((await storedBoards())?.boards[0]?.tiles ?? {}).find(Boolean)).toMatchObject({ program: 'sqlite', session: 1, view: 'overview' }));
  });

  it('Notes is offered with one session: Whole app skips the session step and the tile starts on Notes home', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await user.click(await screen.findByRole('button', { name: /Add a program/ }));
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/^Notes/));
    await user.click(await screen.findByRole('row', { name: /^Whole app/ }));
    expect(await screen.findByTitle('notes-1 on atlas')).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /New session/ })).not.toBeInTheDocument();
    await waitFor(async () => expect(Object.values((await storedBoards())?.boards[0]?.tiles ?? {}).find(Boolean)).toMatchObject({ program: 'notes', session: 1, view: 'home' }));
  });

  it('Notes, Choose a page: the notebooks you can open, then their pages with a search; the tile opens that page by ids and is named after it', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await user.click(await screen.findByRole('button', { name: /Add a program/ }));
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/^Notes/));
    await user.click(await screen.findByRole('row', { name: /^Choose a page/ }));
    await waitFor(() => expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Personal', 'Team']));
    await user.click(screen.getByRole('option', { name: 'Team' }));
    await waitFor(() => expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Roadmap', 'Untitled page', 'Release notes']));
    // The page step's search field has the focus: typing searches.
    expect(screen.getByRole('searchbox', { name: 'Search pages' })).toHaveFocus();
    await user.keyboard('road');
    await waitFor(() => expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Roadmap']));
    await user.click(screen.getByRole('option', { name: 'Roadmap' }));
    const f = await screen.findByTitle('Roadmap on atlas');
    expect(f.getAttribute('src')).toContain(`/notebook/${NOTES_USER}/${NOTES_ROADMAP}`);
    // One page opens without the notebook sidebar, as a page put on the Board from Notes does.
    expect(f.getAttribute('src')).toContain('sidebar=hidden');
    await waitFor(async () => expect(plain(Object.values((await storedBoards())?.boards[0]?.tiles ?? {}).find(Boolean))).toEqual({ project: atlas.project_id, computer: atlas.id, program: 'notes', session: 1, view: 'node', params: { userId: NOTES_USER, nodeId: NOTES_ROADMAP, sidebar: 'hidden' }, name: 'Roadmap' }));
  });

  it('Notes, Paste a page address: only an address with both ids is taken; a stopped computer is not offered Choose a page', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await user.click(await screen.findByRole('button', { name: /Add a program/ }));
    await user.click(await screen.findByRole('row', { name: /cedar/ }));
    await user.click(await findTile(/^Notes/));
    await screen.findByRole('row', { name: /^Whole app/ });
    expect(screen.queryByRole('row', { name: /^Choose a page/ })).toBeNull();
    await user.click(screen.getByRole('row', { name: /^Paste a page address/ }));
    const field = await screen.findByRole('textbox', { name: 'Page address' });
    await user.type(field, 'https://notes.example/notebook/abc');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText(/Paste the address of a page open in Notes/)).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, `https://notes.example/notebook/${NOTES_USER}/${NOTES_ROADMAP}?x=1`);
    await user.type(screen.getByRole('textbox', { name: 'Name (optional)' }), 'Plan');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(async () => expect(Object.values((await storedBoards())?.boards[0]?.tiles ?? {}).find(Boolean)).toMatchObject({ computer: cedar.id, program: 'notes', view: 'node', params: { userId: NOTES_USER, nodeId: NOTES_ROADMAP, sidebar: 'hidden' }, name: 'Plan' }));
  });

  it('Notes, Paste a page address: the address bar\'s short form is taken, its notebook giving the user id; one you cannot open is refused', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await user.click(await screen.findByRole('button', { name: /Add a program/ }));
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/^Notes/));
    await user.click(await screen.findByRole('row', { name: /^Paste a page address/ }));
    const field = await screen.findByRole('textbox', { name: 'Page address' });
    await user.type(field, `https://notes.example/f1b2c3d4e5f6a7b8c9d0e1f2/${NOTES_ROADMAP}`);
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText(/in a notebook you can't open on atlas/)).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, `https://notes.example/${NOTES_TEAM}/${NOTES_ROADMAP}`);
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(async () => expect(Object.values((await storedBoards())?.boards[0]?.tiles ?? {}).find(Boolean)).toMatchObject({ computer: atlas.id, program: 'notes', view: 'node', params: { userId: NOTES_USER, nodeId: NOTES_ROADMAP } }));
  });

  it('no computers in the realm: the picker says so and offers Computers', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'empty' });
    await user.click(await screen.findByRole('button', { name: /Add a program/ }));
    expect(await screen.findByText(/^No computers in /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Computers' })).toBeInTheDocument();
    // A web address needs no computer: it is the one thing left to pick (the one tile, in the Other card).
    expect(screen.getAllByRole('row').map(nameOf)).toEqual([expect.stringMatching(/^Web address/)]);
    expect(screen.getByRole('heading', { name: said('browse.count', { title: boardStrings['picker.other'], count: '1' }) })).toBeInTheDocument();
  });
});

describe('Board: the keys lock', () => {
  // Frames run by hand: requestAnimationFrame queues the callback, cancelAnimationFrame drops the one it names (React
  // Aria's FocusScope cancels its own frame when the picker's dialog unmounts: a dropped frame must never run).
  const handFrames = () => {
    const queue: FrameRequestCallback[] = [];
    const byId = new Map<number, FrameRequestCallback>();
    let next = 0;
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { queue.push(cb); byId.set(++next, cb); return next; });
    const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      const cb = byId.get(id);
      byId.delete(id);
      const i = cb ? queue.indexOf(cb) : -1;
      if (i >= 0) queue.splice(i, 1);
    });
    return { queue, mockRestore: () => { raf.mockRestore(); caf.mockRestore(); } };
  };
  const tileGroup = (name: RegExp) => screen.getAllByRole('group').find((g) => name.test(g.getAttribute('aria-label') ?? ''))!;
  const pickTerminal = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: /Add a program/ }));
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    await user.click(await screen.findByRole('row', { name: /^terminal-1/ }));
    return screen.findByTitle('terminal-1 on atlas');
  };

  it('after a pick the keys go to the program: its frame has focus and the tile carries the shell\'s frame flag', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    const f = await pickTerminal(user);
    await waitFor(() => expect(document.activeElement).toBe(f));
    const g = tileGroup(/terminal-1/);
    await waitFor(() => expect(g.getAttribute('data-hub-keys')).toBe('frame'));
    expect(within(g).getByText('Keys go to the program · Ctrl+Alt+B to leave')).toBeInTheDocument();
  });

  it('Options on a terminal with no kept theme previews the Hub look the tile gets, on the Board and in the program view', async () => {
    const user = userEvent.setup();
    const bg = () => (within(screen.getByRole('dialog')).getByRole('figure', { name: 'Terminal preview' }).firstElementChild as HTMLElement).style.backgroundColor;
    const want = TERM_THEMES.hoodyDark?.background ?? '';
    const rgb = (hex: string) => 'rgb(' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';
    document.documentElement.setAttribute('data-hx-theme', 'dark');
    try {
      const r = await renderPage(page);
      await pickTerminal(user);
      await user.click(within(tileGroup(/terminal-1/)).getByRole('button', { name: /Tile menu/ }));
      await user.click(await screen.findByRole('menuitem', { name: /^Options/ }));
      await waitFor(() => expect([want, rgb(want)]).toContain(bg()));
      r.unmount();
      const handle = atlas.name + '.' + atlas.id.slice(-4);
      await renderPage(page, { path: `/board/open/${handle}/terminal-2` });
      await screen.findByTitle('terminal-2 on atlas');
      await user.click(screen.getByRole('button', { name: 'Tile menu' }));
      await user.click(await screen.findByRole('menuitem', { name: /^Options/ }));
      await waitFor(() => expect([want, rgb(want)]).toContain(bg()));
    } finally { document.documentElement.removeAttribute('data-hx-theme'); }
  });

  it('a terminal follows the Hub look: its frame reloads with the dark palette when the Hub turns dark, toolbar hidden', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    const f = await pickTerminal(user);
    const q = () => new URL(screen.getByTitle('terminal-1 on atlas').getAttribute('src') ?? '').searchParams;
    expect(q().get('hide-toolbar')).toBe('true');
    expect(JSON.parse(q().get('theme') ?? '{}')).toMatchObject({ background: TERM_THEMES.hoodyLight?.background });
    try {
      act(() => document.documentElement.setAttribute('data-hx-theme', 'dark'));
      await waitFor(() => expect(JSON.parse(q().get('theme') ?? '{}')).toMatchObject({ background: TERM_THEMES.hoodyDark?.background }));
      expect(f).toBeDefined();
    } finally { document.documentElement.removeAttribute('data-hx-theme'); }
  });

  it('a terminal tile\'s menu reaches its Screenshot and Raw output; each opens in a new tab', async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    const spy = vi.spyOn(window, 'open').mockImplementation((u) => { opened.push(String(u)); return null; });
    try {
      await renderPage(page);
      await pickTerminal(user);
      const g = tileGroup(/terminal-1/);
      await user.click(within(g).getByRole('button', { name: /Tile menu/ }));
      await user.click(await screen.findByRole('menuitem', { name: /^Screenshot/ }));
      await user.click(within(g).getByRole('button', { name: /Tile menu/ }));
      await user.click(await screen.findByRole('menuitem', { name: /^Output as a page/ }));
      expect(opened).toEqual([expect.stringMatching(/terminal-1\.[^/]+\/api\/v1\/terminal\/screenshot\?terminal_id=1&format=png&save=false$/), expect.stringMatching(/\/api\/v1\/terminal\/raw\?terminal_id=1&format=html$/)]);
    } finally { spy.mockRestore(); }
  });

  it('a terminal tile\'s menu changes its shell: the session ends, starts on the pick, and the tile reloads', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    const f = await pickTerminal(user);
    await user.click(within(tileGroup(/terminal-1/)).getByRole('button', { name: /Tile menu/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Change shell…' }));
    const d = await screen.findByRole('dialog', { name: 'Change the shell of terminal-1' });
    expect(await within(d).findByText(/terminal-1 runs bash now\./)).toBeInTheDocument();
    await user.click(within(d).getByRole('radio', { name: 'zsh' }));
    await user.click(within(d).getByRole('button', { name: 'End it and change' }));
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(said('shell.done', { name: 'terminal-1', shell: 'zsh' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByTitle('terminal-1 on atlas')).not.toBe(f));
  });

  it('the Board\'s own tile menu offers Restart terminal… for that tile\'s terminal, naming the shell it starts', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await pickTerminal(user);
    await user.click(within(tileGroup(/terminal-1/)).getByRole('button', { name: /Tile menu/ }));
    await user.click(await screen.findByRole('menuitem', { name: /^Restart terminal/ }));
    const d = await screen.findByRole('alertdialog', { name: 'Restart terminal-1' });
    expect(await within(d).findByText(/ends everything running in terminal-1 and starts bash there again/)).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Restart' })).toBeInTheDocument();
  });

  it('a program that does not hand Ctrl+Alt+B to the Hub (Files) promises no chord: the hint says click outside the tile', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await user.click(await screen.findByRole('button', { name: /Add a program/ }));
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Files/));
    await screen.findByTitle('files-1 on atlas');
    const g = tileGroup(/files-1/);
    await waitFor(() => expect(g.getAttribute('data-hub-keys')).toBe('frame'));
    expect(within(g).getByText('Keys go to the program · click outside the tile to leave')).toBeInTheDocument();
    expect(within(g).queryByText(/Ctrl\+Alt\+B/)).not.toBeInTheDocument();
  });

  it('the lock stays while focus is on the tile\'s own buttons; Escape there leaves to the Board keys', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await pickTerminal(user);
    const g = tileGroup(/terminal-1/);
    await waitFor(() => expect(g.getAttribute('data-hub-keys')).toBe('frame'));
    act(() => within(g).getAllByRole('button')[0]!.focus());
    await act(() => new Promise((r) => setTimeout(r, 5)));
    expect(g.getAttribute('data-hub-keys')).toBe('frame');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(g.getAttribute('data-hub-keys')).toBeNull());
    expect(document.activeElement).toBe(area());
  });

  it('focus anywhere outside the tile ends the lock; a click on the header (no drag) enters the program again', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    const f = await pickTerminal(user);
    const g = tileGroup(/terminal-1/);
    await waitFor(() => expect(g.getAttribute('data-hub-keys')).toBe('frame'));
    act(() => screen.getByRole('tab', { name: /Main/ }).focus());
    await waitFor(() => expect(g.getAttribute('data-hub-keys')).toBeNull());
    await user.click(within(g).getByText('terminal-1'));
    await waitFor(() => expect(document.activeElement).toBe(f));
    await waitFor(() => expect(g.getAttribute('data-hub-keys')).toBe('frame'));
  });

  it('a pending entry never takes focus back: a pick on a stopped computer waits, but the person entering another tile wins', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    const f = await pickTerminal(user);
    await user.click(await screen.findByRole('button', { name: 'Add a program' }));
    await user.click(await screen.findByRole('row', { name: /cedar/ }));
    // Frames run by hand from here, so the person's move lands while the entry is still waiting.
    const { queue, ...raf } = handFrames();
    try {
      await user.click(await findTile(/Files/));
      expect(screen.getByText('cedar is stopped')).toBeInTheDocument();
      act(() => { queue.shift()?.(0); queue.shift()?.(0); });
      act(() => f.focus());
      // More frames than the entry waits for (ENTER_TRIES): its fallback has had its chance.
      act(() => { for (let i = 0; i < 40 && queue.length; i++) queue.shift()?.(0); });
      expect(document.activeElement).toBe(f);
    } finally { raf.mockRestore(); }
  });

  it('a pending entry is taken when the pick is made: entering another tile before its first frame still wins', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    const f = await pickTerminal(user);
    await user.click(await screen.findByRole('button', { name: 'Add a program' }));
    await user.click(await screen.findByRole('row', { name: /cedar/ }));
    const { queue, ...raf } = handFrames();
    try {
      await user.click(await findTile(/Files/));
      expect(screen.getByText('cedar is stopped')).toBeInTheDocument();
      act(() => f.focus());
      act(() => { for (let i = 0; i < 40 && queue.length; i++) queue.shift()?.(0); });
      expect(document.activeElement).toBe(f);
    } finally { raf.mockRestore(); }
  });

  it('a pending entry belongs to its Board: switching Boards cancels it, so it never enters the same slot on the other Board', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await pickTerminal(user);
    await user.click(await screen.findByRole('button', { name: 'Boards' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Duplicate/ }));
    // The copy is active and holds the same slot ids; its terminal is closed and the freed slot gets a program on a
    // stopped computer, so that entry waits.
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(2));
    const copy = await screen.findByTitle('terminal-1 on atlas');
    await user.click(within(tileGroup(/terminal-1/)).getByRole('button', { name: 'Tile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Close/ }));
    await user.click(await screen.findByRole('button', { name: /Add a program/ }));
    await user.click(await screen.findByRole('row', { name: /cedar/ }));
    const { queue, ...raf } = handFrames();
    try {
      await user.click(await findTile(/Files/));
      expect(copy.isConnected).toBe(false);
      await user.click(screen.getAllByRole('tab')[0] as HTMLElement);
      const main = await screen.findByTitle('terminal-1 on atlas');
      act(() => { for (let i = 0; i < 40 && queue.length; i++) queue.shift()?.(0); });
      expect(document.activeElement).not.toBe(main);
    } finally { raf.mockRestore(); }
  });

  it('with the tile maximised (no dragging), a click on its header still enters the program', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    const f = await pickTerminal(user);
    const g = tileGroup(/terminal-1/);
    await user.click(within(g).getByRole('button', { name: /^Maximise/ }));
    act(() => screen.getByRole('tab', { name: /Main/ }).focus());
    await waitFor(() => expect(g.getAttribute('data-hub-keys')).toBeNull());
    await user.click(within(g).getByText('terminal-1'));
    await waitFor(() => expect(document.activeElement).toBe(f));
  });
});

describe('Board: the picker beyond the six programs (web address, named session, ports, scripts)', () => {
  const add = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: /Add a program/ }));
  };
  const firstStored = async () => plain(Object.values((await storedBoards())?.boards[0]?.tiles ?? {}).find(Boolean));

  it('Web address: the address is kept exactly as typed, with its own name; only http and https are taken', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await add(user);
    // Item 48: Web address and Connect over SSH are on the chosen computer's step.
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/^Web address/));
    const address = await screen.findByRole('textbox', { name: 'Address' });
    expect(address).toHaveFocus();
    await user.type(address, 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Type a full address that starts with http:// or https://')).toBeInTheDocument();
    expect(frames()).toHaveLength(0);
    await user.clear(address);
    await user.type(address, 'https://user:pw@docs.example/guide?x=1');
    await user.type(screen.getByRole('textbox', { name: 'Name (optional)' }), 'Docs{Enter}');
    // An outside site is never framed: the tile's card names its host and opens it in a new tab.
    expect(await screen.findByText("This site can't be shown here.")).toBeInTheDocument();
    expect(screen.getByText(/^docs\.example can't be shown inside the Hub/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open in new tab' }).some((l) => l.textContent?.includes('Open in new tab') && l.getAttribute('href') === 'https://user:pw@docs.example/guide?x=1')).toBe(true);
    expect(frames()).toHaveLength(0);
    await waitFor(async () => expect(await firstStored()).toEqual({ url: 'https://user:pw@docs.example/guide?x=1', name: 'Docs' }));
  });

  it("a search that is a web address offers to open it in the only running computer's browser, named after its host", async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await add(user);
    await user.type(await screen.findByRole('searchbox', { name: 'Search computers' }), 'https://example.org/a');
    expect(screen.queryByRole('row', { name: /^Open javascript/ })).toBeNull();
    // An outside site opens as a new tab of atlas's browser (started first: none runs), whose display is the tile: the
    // Web address card's one tile.
    await user.click(await screen.findByRole('row', { name: "Open example.org in atlas's browser" }));
    expect(await screen.findByTitle('browser-1 on atlas')).toBeInTheDocument();
  });

  it('Open by number: prefilled with the next number, and the name shows on the tile', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await add(user);
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    await user.click(await screen.findByRole('row', { name: /^Open by number/ }));
    const num = await screen.findByRole('textbox', { name: 'Terminal number' });
    expect(num).toHaveFocus();
    expect((num as HTMLInputElement).value).toBe('2');
    // No placeholder: the number field commits on blur, so a typed number and a hint could disagree.
    const name = screen.getByRole('textbox', { name: 'Name (optional)' });
    expect(name.getAttribute('placeholder')).toBeNull();
    await user.type(name, 'build{Enter}');
    expect(await screen.findByTitle('build on atlas')).toBeInTheDocument();
    await waitFor(async () => expect(await firstStored()).toMatchObject({ program: 'terminal', session: 2, name: 'build' }));
  });

  it('Open by number opens exactly the number typed: display-10 is display 10, not the next free one', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await add(user);
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Display/));
    await user.click(await screen.findByRole('row', { name: /^Open by number/ }));
    const num = await screen.findByRole('textbox', { name: 'Display number' });
    await user.clear(num);
    await user.type(num, '10{Enter}');
    expect(await screen.findByTitle('display-10 on atlas')).toBeInTheDocument();
    await waitFor(async () => expect(await firstStored()).toMatchObject({ program: 'display', session: 10 }));
  });

  it('Open by number refuses a new terminal in the Hub\'s launch range and holds the number to 9999; nothing is added', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await add(user);
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    await user.click(await screen.findByRole('row', { name: /^Open by number/ }));
    const num = await screen.findByRole('textbox', { name: 'Terminal number' });
    await user.clear(num);
    await user.type(num, '8500');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText(/8001 to 9999 is where the Hub starts apps/)).toBeInTheDocument();
    await user.clear(num);
    await user.type(num, '12000');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    // The field holds 1 to 9999: past it, it settles on 9999 (the range's end), which is a new launch-range terminal here.
    await waitFor(() => expect((num as HTMLInputElement).value).toBe('9999'));
    expect(screen.getByText(/8001 to 9999 is where the Hub starts apps/)).toBeInTheDocument();
    expect(screen.queryByTitle(/^terminal-(8500|12000) on atlas$/)).toBeNull();
    expect(await firstStored()).toBeUndefined();
  });

  it('Open by number opens a launch-range terminal the computer lists now, refuses one it does not, and never opens a display there', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'sessions' });
    await add(user);
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    // The live list has answered (New session counts its numbers): the refusal below is the list's answer, not a read on its way.
    await waitFor(() => expect(screen.getByRole('row', { name: /^New session/ }).textContent).toBe('New sessionOpens as terminal-10'));
    await user.click(screen.getByRole('row', { name: /^Open by number/ }));
    const num = await screen.findByRole('textbox', { name: 'Terminal number' });
    await user.clear(num);
    await user.type(num, '8503');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText(/This terminal can open here only after this computer's list confirms it exists/)).toBeInTheDocument();
    await user.clear(num);
    await user.type(num, '8502');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByTitle('terminal-8502 on atlas')).toBeInTheDocument();
    // Display 8502: the listed terminal 8502 does not prove a display runs there (sessionNumber.ts).
    await add(user);
    await user.click((await screen.findAllByRole('row', { name: /atlas/ })).find((o) => !/terminal-/.test(o.textContent ?? ''))!);
    await user.click(await findTile(/Display/));
    await user.click(await screen.findByRole('row', { name: /^Open by number/ }));
    const dnum = await screen.findByRole('textbox', { name: 'Display number' });
    await user.clear(dnum);
    await user.type(dnum, '8502');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('8001 to 9999 is where the Hub starts apps. Open those from their app, or from the tile that already shows one.')).toBeInTheDocument();
    expect(screen.queryByTitle('display-8502 on atlas')).toBeNull();
    expect(screen.queryByTitle('terminal-8503 on atlas')).toBeNull();
  });

  it('a running computer lists its own HTTP ports and served scripts; a port opens on its address', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await add(user);
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    // Its ports and scripts are their own kind, once read.
    await waitFor(() => expect(kindNames()).toContain(boardStrings['browse.tab.ports']));
    toKind(boardStrings['browse.tab.ports']);
    const ports = await screen.findByRole('grid', { name: 'Web ports' });
    expect(within(ports).getAllByRole('row').map(nameOf)).toEqual([expect.stringMatching(/^port 3000.*shop/), expect.stringMatching(/^port 8080.*api/), expect.stringMatching(/^port 8081.*api/)]);
    const scripts = screen.getByRole('grid', { name: 'Scripts' });
    expect(within(scripts).getAllByRole('row').map(nameOf)).toEqual(['/, ' + boardStrings['picker.scriptDesc'], '/orders/list, ' + boardStrings['picker.scriptDesc']]);
    await user.click(within(ports).getByRole('row', { name: /port 3000/ }));
    const f = await screen.findByTitle('port 3000 on atlas');
    expect(f.getAttribute('src')).toMatch(new RegExp(`^https://${atlas.project_id}-${atlas.id}-.*-3000\\.`));
    await waitFor(async () => expect(await firstStored()).toEqual({ project: atlas.project_id, computer: atlas.id, protocol: 'http', port: 3000 }));
  });

  it('a terminal lists the computer\'s live sessions with their facts; New session skips every number held, a program\'s terminal too', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'sessions' });
    await add(user);
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    await waitFor(() => expect(screen.getByRole('row', { name: /^New session/ }).textContent).toBe('New sessionOpens as terminal-10'));
    // The Sessions card's tiles: each session with its facts as its line, then New session and Open by number.
    const list = screen.getByRole('grid', { name: 'Sessions' });
    expect(within(list).getAllByRole('row').map(nameOf)).toEqual([
      expect.stringMatching(/^terminal-1, bash · \/home\/user · 1 window open · Used 2 minutes ago$/),
      'terminal-4, zsh · /srv/app · Shell ended',
      expect.stringMatching(/^terminal-7, ssh ops@db\.example\.com:2222 · \/home\/ops · 2 windows open · Used .*ago$/),
      'New session, Opens as terminal-10',
      'Open by number, ' + boardStrings['picker.byNumberDesc'],
    ]);
    await user.click(screen.getByRole('row', { name: /^terminal-4/ }));
    await waitFor(async () => expect(await firstStored()).toMatchObject({ program: 'terminal', session: 4 }));
  });

  it('an ssh session picked by number keeps its destination: the tile is an SSH tile, gated like one Connect over SSH made', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'sessions' });
    await add(user);
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    await user.click(await screen.findByRole('row', { name: /^terminal-7/ }));
    await waitFor(async () => expect(await firstStored()).toMatchObject({ program: 'terminal', session: 7, ssh: { host: 'db.example.com', user: 'ops', port: 2222 } }));
    const fresh = (await storedBoards())?.recents[0];
    expect(fresh).toMatchObject({ session: 7, ssh: { host: 'db.example.com', user: 'ops', port: 2222 } });
  });

  it('an ssh session opened by number keeps its destination, as its row does', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'sessions' });
    await add(user);
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    await screen.findByRole('row', { name: /^terminal-7/ });
    await user.click(screen.getByRole('row', { name: /^Open by number/ }));
    const num = await screen.findByRole('textbox', { name: 'Terminal number' });
    await user.clear(num);
    await user.type(num, '7{Enter}');
    await waitFor(async () => expect(await firstStored()).toMatchObject({ program: 'terminal', session: 7, ssh: { host: 'db.example.com', user: 'ops', port: 2222 } }));
  });

  it('a short-lived ssh session that is never a row keeps its destination when opened by number', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'sessions' });
    await add(user);
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    await screen.findByRole('row', { name: /^terminal-7/ });
    expect(screen.queryByRole('row', { name: /^terminal-8/ })).toBeNull();
    await user.click(screen.getByRole('row', { name: /^Open by number/ }));
    const num = await screen.findByRole('textbox', { name: 'Terminal number' });
    await user.clear(num);
    await user.type(num, '8{Enter}');
    await waitFor(async () => expect(await firstStored()).toMatchObject({ program: 'terminal', session: 8, ssh: { host: 'cache.example.com', user: 'ops', port: 22 } }));
  });

  it('a program\'s or a short-lived terminal is never a row, even when a tile holds its number', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal', 9), tileOf(atlas, 'terminal', 8)), { state: 'sessions' });
    await screen.findByTitle('terminal-9 on atlas');
    await user.click(screen.getAllByRole('button', { name: 'Tile menu' })[0]!);
    await user.click(await screen.findByRole('menuitem', { name: /^Change session/ }));
    await waitFor(() => expect(screen.getByRole('row', { name: /^New session/ }).textContent).toBe('New sessionOpens as terminal-10'));
    const rows = screen.getAllByRole('row').map((o) => o.textContent ?? '');
    expect(rows.filter((x) => /^terminal-(8|9)/.test(x))).toEqual([]);
  });

  it('the named form takes the same next free number; other programs and a failed read keep what the Boards know', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'sessions' });
    await add(user);
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    await waitFor(() => expect(screen.getByRole('row', { name: /^New session/ }).textContent).toBe('New sessionOpens as terminal-10'));
    await user.click(screen.getByRole('row', { name: /^Open by number/ }));
    expect(((await screen.findByRole('textbox', { name: 'Terminal number' })) as HTMLInputElement).value).toBe('10');
    await user.click(screen.getByRole('button', { name: 'Back to atlas · Terminal' }));
    await user.click(await findTile(/Agent/));
    expect((await screen.findByRole('row', { name: /^New session/ })).textContent).toBe('New sessionOpens as agent-2');
    expect(screen.queryByText(/window open/)).toBeNull();
  });

  it('when the sessions cannot be read the step still offers terminal-1 and terminal-2', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'sessionsFailed' });
    await add(user);
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    const list = await screen.findByRole('grid', { name: 'Sessions' });
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(within(list).getAllByRole('row').map((o) => o.textContent)).toEqual(['terminal-1', 'New sessionOpens as terminal-2', 'Open by numberChoose its number and name']);
  });

  it('a stopped computer\'s terminal reads no sessions', async () => {
    const user = userEvent.setup();
    await renderPage(page, { state: 'sessions' });
    await add(user);
    await user.click(await screen.findByRole('row', { name: /cedar/ }));
    await user.click(await findTile(/Terminal/));
    const list = await screen.findByRole('grid', { name: 'Sessions' });
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(within(list).getAllByRole('row').map((o) => o.textContent)).toEqual(['terminal-1', 'New sessionOpens as terminal-2', 'Open by numberChoose its number and name']);
  });

  it('Connect over SSH: a terminal on a running computer that runs ssh, named user@host, on the next free number', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await add(user);
    // Item 48: Web address and Connect over SSH are on the chosen computer's step.
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/^Connect over SSH/));
    expect(screen.getByText(/The host's key is not checked yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    await user.type(screen.getByRole('textbox', { name: 'Host' }), 'db.example.com');
    await user.type(screen.getByRole('textbox', { name: 'User' }), 'ops');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByTitle('ops@db.example.com on atlas')).toBeInTheDocument();
    await waitFor(async () => expect(await firstStored()).toMatchObject({ computer: atlas.id, program: 'terminal', session: 2, ssh: { host: 'db.example.com', user: 'ops', port: 22 }, name: 'ops@db.example.com' }));
  });

  it('an SSH tile whose session has gone opens no frame: it says so and Connect again starts that ssh once, then frames it', async () => {
    const user = userEvent.setup();
    await open(withTiles({ ...tileOf(atlas, 'terminal'), session: 5, ssh: { host: 'db.example.com', user: 'ops', port: 2222 }, name: 'ops@db.example.com:2222' }));
    expect(await screen.findByText('The ssh connection to ops@db.example.com:2222 has ended')).toBeInTheDocument();
    expect(frames()).toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'Open in a new tab' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Connect again' }));
    expect(await screen.findByTitle('ops@db.example.com:2222 on atlas')).toBeInTheDocument();
  });

  it('an SSH tile whose number now runs something else stays closed, with no way to reopen it there', async () => {
    await open(withTiles({ ...tileOf(atlas, 'terminal'), session: 1, ssh: { host: 'db.example.com', user: 'ops', port: 22 }, name: 'ops@db.example.com' }));
    expect(await screen.findByText('terminal-1 no longer goes to ops@db.example.com')).toBeInTheDocument();
    expect(frames()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Connect again' })).toBeNull();
  });

  it('a Connect over SSH link opens the form filled in; the address keeps only the Board, and Connect is still the person\'s', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    const r = await renderPage(page, { path: `/board?connect=ssh&computer=${handle}&host=db.example.com&user=ops&port=2222` });
    expect(await screen.findByRole('textbox', { name: 'Host' })).toHaveValue('db.example.com');
    expect(screen.getByRole('textbox', { name: 'User' })).toHaveValue('ops');
    expect(screen.getByRole('textbox', { name: 'Port' })).toHaveValue('2222');
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    expect(screen.queryByTitle(/ on atlas$/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByTitle('ops@db.example.com:2222 on atlas')).toBeInTheDocument();
  });

  // An Add link (links.ts boardAddPath; Apps' Put on Board).
  const addLink = (rest: string) => `/board?${rest}`;
  const LIST_FAILED = "Your computers didn't load, so the tile from the Board link isn't on the Board yet. While you stay on the Board, it's tried again when they load.";
  const listFailedMany = (k: number) => `Your computers didn't load, so the tiles from ${k} Board links aren't on the Board yet. While you stay on the Board, they're tried again when they load.`;
  const LIST_SLOW = "Your computers are taking a while to load, so the tile from the Board link isn't on the Board yet. While you stay on the Board, it's tried again when they load.";
  const listSlowMany = (k: number) => `Your computers are taking a while to load, so the tiles from ${k} Board links aren't on the Board yet. While you stay on the Board, they're tried again when they load.`;
  const ADD_FULL = "The Board is full, so the tile from the Board link wasn't added. Close a tile or open another Board, then put it on the Board again.";
  const ADD_LEFT = "The Board closed before the tile from the Board link was added. Put it on the Board again to add it.";
  const borealis = byName('borealis');
  const tilesNow = async (i = 0) => Object.values((await storedBoards())?.boards[i]?.tiles ?? {}).filter((x): x is NonNullable<typeof x> => x !== null).map(plain);

  it('an Add link puts that terminal on the active Board once, gives it the keys, and the address keeps only the Board', async () => {
    const r = await renderPage(page, { path: addLink(`add=terminal-3&cid=${atlas.id}`) });
    const f = await screen.findByTitle('terminal-3 on atlas');
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    await waitFor(async () => expect(await tilesNow()).toEqual([{ project: atlas.project_id, computer: atlas.id, program: 'terminal', session: 3, view: 'session' }]));
    expect((await storedBoards())?.recents[0]).toMatchObject({ computer: atlas.id, program: 'terminal', session: 3 });
    await waitFor(() => expect(document.activeElement).toBe(f));
    // The same link again (a second Put on Board) adds a second tile; the address drops it again.
    await act(() => r.router.navigate({ href: addLink(`add=terminal-3&cid=${atlas.id}`) } as never));
    await waitFor(async () => expect(await tilesNow()).toHaveLength(2));
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    expect(toasts).toEqual([]);
  });

  it('an Add link for an agent session puts that agent tile on the Board, with the view the picker would give it', async () => {
    const r = await renderPage(page, { path: addLink(`add=agent-2&cid=${atlas.id}`) });
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    await waitFor(async () => expect(await tilesNow()).toEqual([{ project: atlas.project_id, computer: atlas.id, program: 'agent', session: 2, view: startView(CATALOG, 'agent') }]));
    expect(toasts).toEqual([]);
  });

  it('two Add links taken while the list fails both wait, each with its notice; after Try again both tiles are added', async () => {
    setListDown(true);
    const r = await renderPage(page, { state: 'flaky', path: addLink(`add=terminal-3&cid=${atlas.id}`) });
    await waitFor(() => expect(toasts.filter((x) => x.title === LIST_FAILED)).toHaveLength(1));
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    await act(() => r.router.navigate({ href: addLink(`add=display-2&cid=${atlas.id}`) } as never));
    // The new link gets its own notice, which counts both waiting links.
    await waitFor(() => expect(toasts.filter((x) => x.title === listFailedMany(2))).toHaveLength(1));
    expect(toasts.filter((x) => x.title === LIST_FAILED)).toHaveLength(1);
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    expect(await tilesNow()).toEqual([]);
    setListDown(false);
    await act(async () => { await toasts.at(-1)!.action!.onAction(); });
    await waitFor(async () => expect((await tilesNow()).map((x) => ('program' in x ? x.program + '-' + x.session : '')).sort()).toEqual(['display-2', 'terminal-3']));
    expect(toasts.filter((x) => /doesn't match a computer/.test(x.title))).toEqual([]);
  });

  it('a failed reread keeps the old list, which does not prove a computer missing: the link waits, then a read settles it', async () => {
    const r = await renderPage(page, { state: 'flaky' });
    await screen.findByRole('group', { name: 'Board tiles' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Add a program/ })).toBeEnabled());
    setListDown(true);
    await act(async () => { await r.queryClient.refetchQueries(); });
    // borealis is not in this realm's list (kept from the read before the failed one).
    await act(() => r.router.navigate({ href: addLink(`add=terminal-1&cid=${borealis.id}`) } as never));
    await waitFor(() => expect(toasts.at(-1)?.title).toBe(LIST_FAILED));
    expect(toasts.filter((x) => /doesn't match a computer/.test(x.title))).toEqual([]);
    expect(r.router.state.location.search).toEqual({});
    setListDown(false);
    await act(async () => { await toasts.at(-1)!.action!.onAction(); });
    await waitFor(() => expect(toasts.at(-1)?.title).toBe("This Board link doesn't match a computer here, so nothing was added."));
    expect(await tilesNow()).toEqual([]);
  });

  it('a link that is not a whole Add link is dropped from the address at once and adds nothing, with a notice', async () => {
    const r = await renderPage(page, { path: addLink(`add=shell-1&cid=${atlas.id}`) });
    await waitFor(() => expect(toasts.at(-1)?.title).toBe("This Board link isn't complete, so nothing was added."));
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    expect(await tilesNow()).toEqual([]);
  });

  it('an Add link for a web port keeps its route; one for a computer not in this realm adds nothing and says so', async () => {
    const r = await renderPage(page, { path: addLink(`add=port-3000&cid=${atlas.id}&path=%2Fapp%2Fmain`) });
    await waitFor(async () => expect(await tilesNow()).toEqual([{ project: atlas.project_id, computer: atlas.id, protocol: 'http', port: 3000, path: '/app/main' }]));
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    await act(() => r.router.navigate({ href: addLink('add=display-1&cid=0000000000000000000000ff') } as never));
    await waitFor(() => expect(toasts.at(-1)?.title).toBe("This Board link doesn't match a computer here, so nothing was added."));
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    expect(await tilesNow()).toHaveLength(1);
  });

  it('an Add link whose computer list fails to load waits, not called missing: the notice says so and offers Try again', async () => {
    const r = await renderPage(page, { state: 'failed', path: addLink(`add=terminal-3&cid=${atlas.id}`) });
    await waitFor(() => expect(toasts.at(-1)?.title).toBe(LIST_FAILED));
    expect(toasts.at(-1)?.action?.label).toBe('Try again');
    expect(toasts.filter((x) => /doesn't match a computer/.test(x.title))).toEqual([]);
    // The id leaves the address at once, even while the tile waits.
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    expect(await tilesNow()).toEqual([]);
    // A different link, while the list still fails, gets its own notice.
    const n = toasts.length;
    await act(() => r.router.navigate({ href: addLink(`add=display-2&cid=${atlas.id}`) } as never));
    await waitFor(() => expect(toasts.length).toBe(n + 1));
    expect(toasts.at(-1)?.title).toBe(listFailedMany(2));
  });

  it('a first list read that stays unanswered says so after a while, with Try again; each later link is told once, counting every waiting link', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const r = await renderPage(page, { state: 'slow', path: addLink(`add=terminal-3&cid=${atlas.id}`) });
      await waitFor(() => expect(r.router.state.location.search).toEqual({}));
      await screen.findByRole('group', { name: 'Board tiles' });
      expect(toasts).toEqual([]);
      await act(async () => { vi.advanceTimersByTime(ADD_WAIT_MS); });
      await waitFor(() => expect(toasts.map((x) => x.title)).toEqual([LIST_SLOW]));
      expect(toasts[0]!.action?.label).toBe('Try again');
      await act(() => r.router.navigate({ href: addLink(`add=display-2&cid=${atlas.id}`) } as never));
      await waitFor(() => expect(toasts.map((x) => x.title)).toEqual([LIST_SLOW, listSlowMany(2)]));
      await act(async () => { vi.advanceTimersByTime(ADD_WAIT_MS); });
      expect(toasts).toHaveLength(2);
      expect(await tilesNow()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a read that is slow, then fails, says so once: the failure adds no second notice for the same link', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      setListDown(true);
      let release: () => void = () => {};
      holdList.wait = new Promise<void>((res) => { release = res; });
      const r = await renderPage(page, { state: 'flaky', path: addLink(`add=terminal-3&cid=${atlas.id}`) });
      await waitFor(() => expect(r.router.state.location.search).toEqual({}));
      await screen.findByRole('group', { name: 'Board tiles' });
      await act(async () => { vi.advanceTimersByTime(ADD_WAIT_MS); });
      await waitFor(() => expect(toasts.map((x) => x.title)).toEqual([LIST_SLOW]));
      await act(async () => { release(); });
      // The read has failed now (the computer list's query is in error).
      await waitFor(() => expect(r.queryClient.getQueryCache().getAll().some((q) => q.state.status === 'error')).toBe(true));
      await act(async () => { vi.advanceTimersByTime(ADD_WAIT_MS); });
      expect(toasts.map((x) => x.title)).toEqual([LIST_SLOW]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('two links taken while the first read is still out, then failed, hear one notice that counts both', async () => {
    setListDown(true);
    let release: () => void = () => {};
    const gate = new Promise<void>((res) => { release = res; });
    holdList.wait = gate;
    const r = await renderPage(page, { state: 'flaky', path: addLink(`add=terminal-3&cid=${atlas.id}`) });
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    await act(() => r.router.navigate({ href: addLink(`add=display-2&cid=${atlas.id}`) } as never));
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    expect(toasts).toEqual([]);
    await act(async () => { release(); });
    await waitFor(() => expect(toasts.map((x) => x.title)).toEqual([listFailedMany(2)]));
  });

  it('on a full Board each Add link says it was not added, the second one too', async () => {
    const r = await renderPage(page);
    await screen.findByRole('group', { name: 'Board tiles' });
    await act(() => seed(FIXTURE_REALM, withTiles(tileOf(atlas, 'files'), tileOf(atlas, 'terminal', 1), tileOf(atlas, 'terminal', 2), tileOf(atlas, 'display', 1), tileOf(atlas, 'display', 2), tileOf(atlas, 'agent', 1), tileOf(atlas, 'terminal', 5), tileOf(atlas, 'terminal', 6))));
    await screen.findByTitle(/files-1 on atlas/);
    await act(() => r.router.navigate({ href: addLink(`add=terminal-3&cid=${atlas.id}`) } as never));
    await waitFor(() => expect(toasts.map((x) => x.title)).toEqual([ADD_FULL]));
    await act(() => r.router.navigate({ href: addLink(`add=terminal-4&cid=${atlas.id}`) } as never));
    await waitFor(() => expect(toasts.map((x) => x.title)).toEqual([ADD_FULL, ADD_FULL]));
    expect(await tilesNow()).toHaveLength(8);
  });

  it('a link waiting on a failed read survives another tab\'s saved Boards opening, and is added once the list loads', async () => {
    setListDown(true);
    const r = await renderPage(page, { state: 'flaky', path: addLink(`add=terminal-3&cid=${atlas.id}`) });
    await waitFor(() => expect(toasts.map((x) => x.title)).toEqual([LIST_FAILED]));
    await act(() => seed(FIXTURE_REALM, withTiles(tileOf(atlas, 'files'))));
    await waitFor(async () => expect(await tilesNow()).toHaveLength(1));
    setListDown(false);
    await act(async () => { await toasts.at(-1)!.action!.onAction(); });
    await waitFor(async () => expect((await tilesNow()).map((x) => ('program' in x ? x.program : ''))).toEqual(['files', 'terminal']));
    expect(r.router.state.location.search).toEqual({});
  });

  it('leaving the Board while a link waits says the tile was not added', async () => {
    const r = await renderPage(page, { state: 'failed', path: addLink(`add=terminal-3&cid=${atlas.id}`) });
    await waitFor(() => expect(toasts.map((x) => x.title)).toEqual([LIST_FAILED]));
    await act(() => r.router.navigate({ href: `/board/open/${atlas.name}.${atlas.id.slice(-4)}/files-1` } as never));
    await waitFor(() => expect(toasts.map((x) => x.title)).toEqual([LIST_FAILED, ADD_LEFT]));
  });

  it('a Connect over SSH link wins over an Add link in the same address: the form opens and no tile is added', async () => {
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    const r = await renderPage(page, { path: addLink(`connect=ssh&computer=${handle}&host=db.example.com&user=ops&add=terminal-3&cid=${atlas.id}`) });
    expect(await screen.findByRole('textbox', { name: 'Host' })).toHaveValue('db.example.com');
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    expect(await tilesNow()).toEqual([]);
  });

  it('with the computers already read, a Connect over SSH link still wins over an Add link in the same address', async () => {
    const r = await renderPage(page);
    await screen.findByRole('group', { name: 'Board tiles' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Add a program/ })).toBeEnabled());
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    await act(() => r.router.navigate({ href: addLink(`connect=ssh&computer=${handle}&host=db.example.com&user=ops&add=terminal-3&cid=${atlas.id}`) } as never));
    expect(await screen.findByRole('textbox', { name: 'Host' })).toHaveValue('db.example.com');
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
    expect(await tilesNow()).toEqual([]);
  });

  it('under StrictMode, with the computers already read, an Add link still adds one tile and gives it the keys', async () => {
    configure({ reactStrictMode: true });
    try {
      const r = await renderPage(page);
      await screen.findByRole('group', { name: 'Board tiles' });
      await waitFor(() => expect(screen.getByRole('button', { name: /Add a program/ })).toBeEnabled());
      // Leave the Board (its program view), so the Board mounts again with the list already read.
      await act(() => r.router.navigate({ href: `/board/open/${atlas.name}.${atlas.id.slice(-4)}/files-1` } as never));
      await act(() => r.router.navigate({ href: addLink(`add=terminal-3&cid=${atlas.id}`) } as never));
      const f = await screen.findByTitle('terminal-3 on atlas');
      await waitFor(async () => expect(await tilesNow()).toHaveLength(1));
      await waitFor(() => expect(document.activeElement).toBe(f));
    } finally {
      configure({ reactStrictMode: false });
    }
  });

  it('an Add link on a Board with a maximised tile shows the new tile (the maximise moves to it) and gives it the keys', async () => {
    let s = withTiles(tileOf(atlas, 'files'));
    s = { ...s, boards: s.boards.map((b) => ({ ...b, max: b.active })) };
    const r = await open(s);
    await screen.findByTitle(/files-1 on atlas/);
    await act(() => r.router.navigate({ href: addLink(`add=terminal-3&cid=${atlas.id}`) } as never));
    const f = await screen.findByTitle('terminal-3 on atlas');
    await waitFor(async () => {
      const b = (await storedBoards())!.boards[0]!;
      const slot = Object.entries(b.tiles).find(([, x]) => x && 'program' in x && x.program === 'terminal')?.[0];
      expect(b.max).toBe(slot);
    });
    await waitFor(() => expect(document.activeElement).toBe(f));
  });

  it('an Add link with ?b= puts the tile on that Board and gives it the keys there', async () => {
    let s = withTiles(tileOf(atlas, 'files'));
    s = must(createBoard(s, rand, 'Two'));
    const two = s.boards[1]!.id;
    s = { ...s, active: s.boards[0]!.id };
    const r = await open(s);
    await screen.findByTitle(/files-1 on atlas/);
    await act(() => r.router.navigate({ href: addLink(`b=${two}&add=terminal-3&cid=${atlas.id}`) } as never));
    const f = await screen.findByTitle('terminal-3 on atlas');
    await waitFor(async () => expect((await storedBoards())?.boards.find((b) => b.id === two) && Object.values((await storedBoards())!.boards.find((b) => b.id === two)!.tiles).filter(Boolean)).toHaveLength(1));
    await waitFor(() => expect(document.activeElement).toBe(f));
    await waitFor(() => expect(r.router.state.location.search).toEqual({}));
  });

  it('Connect over SSH names the wrong field and sends nothing until it can be sent', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await add(user);
    // Item 48: Web address and Connect over SSH are on the chosen computer's step.
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/^Connect over SSH/));
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('Type the host to connect to')).toBeInTheDocument();
    expect(screen.getByText('Type the user to sign in as')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Host' }), '-oProxyCommand=x');
    await user.type(screen.getByRole('textbox', { name: 'User' }), 'ops');
    await user.clear(screen.getByRole('textbox', { name: 'Port' }));
    await user.type(screen.getByRole('textbox', { name: 'Port' }), '99999');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('Letters, digits and . _ : [ ] - only, not starting with -')).toBeInTheDocument();
    expect(screen.getByText('A number from 1 to 65535')).toBeInTheDocument();
    expect(screen.queryByTitle(/ on atlas$/)).toBeNull();
    // Back returns to the computer's step it came from.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('grid', { name: 'Hoody Kit' })).toBeInTheDocument();
  });

  it('a script opens on the computer\'s Exec address plus its route; a web tile has no session or options entries', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await add(user);
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    // The script's tile is named by its route, then its line ("/orders/list, A script of this computer").
    await user.click(await findTile(/^\/orders\/list,/));
    const f = await screen.findByTitle('/orders/list on atlas');
    expect(f.getAttribute('src')).toMatch(/-1\.[^/]+\/orders\/list$/);
    await waitFor(async () => expect(await firstStored()).toEqual({ project: atlas.project_id, computer: atlas.id, protocol: 'exec', port: 1, path: '/orders/list' }));
  });

  it('a stopped computer lists the six programs only (nothing is read from it)', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await add(user);
    await user.click(await screen.findByRole('row', { name: /cedar/ }));
    expect(await findTile(/Terminal/)).toBeInTheDocument();
    // No Ports & scripts kind (nothing read), and no ports or scripts card anywhere.
    expect(kindNames()).not.toContain(boardStrings['browse.tab.ports']);
    expect(screen.queryByRole('grid', { name: 'Web ports' })).toBeNull();
    expect(screen.queryByRole('grid', { name: 'Scripts' })).toBeNull();
  });
});

describe('Board: tiles', () => {
  it('Duplicate tile of terminal 8000 gives the lowest free number, never 8000 again', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal', 8000)));
    const g = (await screen.findByTitle('terminal-8000 on atlas')).closest('[role="group"]') as HTMLElement;
    await user.click(within(g).getByRole('button', { name: /Tile menu/ }));
    await user.click(await screen.findByRole('menuitem', { name: /^Duplicate/ }));
    expect(await screen.findByTitle('terminal-1 on atlas')).toBeInTheDocument();
    expect(screen.getAllByTitle('terminal-8000 on atlas')).toHaveLength(1);
    await waitFor(async () => {
      const b = (await storedBoards())?.boards[0];
      expect(Object.values(b?.tiles ?? {}).map((t) => (t as TileRef).session).sort((x, y) => x - y)).toEqual([1, 8000]);
    });
  });

  it('a stopped computer shows its card and no frame', async () => {
    await open(withTiles(tileOf(cedar, 'terminal')));
    expect(await screen.findByText('cedar is stopped')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(frames()).toHaveLength(0);
  });

  it('a computer outside the realm is gone: card, Pick another program, no frame', async () => {
    await open(withTiles({ project: 'p0', computer: 'c0ffee000000000000000000', program: 'terminal', session: 1 }));
    expect(await screen.findByText(/no longer in this realm/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick another program' })).toBeInTheDocument();
    expect(frames()).toHaveLength(0);
  });

  it('two tiles side by side get two frames and a divider with a text value', async () => {
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    expect(await screen.findByTitle('terminal-1 on atlas')).toBeInTheDocument();
    expect(screen.getByTitle('files-1 on atlas')).toBeInTheDocument();
    const sep = screen.getByRole('separator');
    // The kit Splitter owns the value (aria-valuenow is the kit's, never written by the page).
    expect(sep.getAttribute('aria-valuetext')).toBe('50 %');
    expect(sep.getAttribute('aria-valuenow')).toBe('50');
  });

  it('the divider keeps its arrows: → moves it 5 points and the active tile stays', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    await screen.findByTitle('files-1 on atlas');
    const sep = screen.getByRole('separator');
    act(() => sep.focus());
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(screen.getByRole('separator').getAttribute('aria-valuetext')).toBe('55 %'));
    expect(document.activeElement).toBe(screen.getByRole('separator'));
  });

  it('an agent tile signs in with core\'s boot token in its frame only: never in ↗, storage or text', async () => {
    await open(withTiles(tileOf(atlas, 'agent')));
    const f = await screen.findByTitle('agent-1 on atlas');
    expect(f.getAttribute('src')).toContain('hdy_token=' + FIXTURE_BOOT_TOKEN);
    const share = screen.getByRole('link', { name: 'Open in new tab' });
    expect(share.getAttribute('href')).not.toMatch(/hdy_token|fixture-boot/);
    expect(raw().get() ?? '').not.toMatch(/hdy_token|fixture-boot/);
    expect(document.body.textContent).not.toMatch(/fixture-boot/);
  });

  it('a narrow window shows one tile at a time with chips; the layout is not changed', async () => {
    size = { w: 400, h: 500 };
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    const chips = await screen.findByRole('toolbar', { name: 'Tiles' });
    expect(within(chips).getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText(/Showing one tile at a time/)).toBeInTheDocument();
    expect((await storedBoards())?.boards[0]).toBeDefined();
  });
});

describe('Board: options', () => {
  const firstTile = async () => Object.values((await storedBoards())?.boards[0]?.tiles ?? {}).find(Boolean) as { params?: unknown } | undefined;
  it('the options button with "1 changed" opens the panel; Save writes the options, reloads the frame once, and u undoes it', async () => {
    const user = userEvent.setup();
    await open(withTiles({ ...tileOf(atlas, 'terminal'), params: { cursorStyle: 'bar' } }));
    const before = await screen.findByTitle('terminal-1 on atlas');
    await user.click(screen.getByRole('button', { name: /\(1 changed\)$/ }));
    const dialog = await screen.findByRole('dialog', { name: /Options for terminal-1/ });
    await user.click(within(dialog).getByRole('button', { name: 'Text' }));
    const size = within(dialog).getByRole('textbox', { name: 'Font size' });
    await user.clear(size);
    await user.type(size, '18');
    await user.tab();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(async () => expect((await firstTile())?.params).toEqual({ cursorStyle: 'bar', fontSize: 18 }));
    // Reloaded once: a new frame (an agent's asks for a fresh token), on the new address.
    expect(screen.getByTitle('terminal-1 on atlas')).not.toBe(before);
    expect(screen.getByTitle('terminal-1 on atlas').getAttribute('src')).toContain('fontSize=18');
    expect(toasts.at(-1)?.title).toBe(said('options.reloaded', { name: 'terminal-1' }));
    expect(screen.getByRole('button', { name: /\(2 changed\)$/ })).toBeInTheDocument();
    act(() => area().focus());
    await user.keyboard('u');
    await waitFor(async () => expect((await firstTile())?.params).toEqual({ cursorStyle: 'bar' }));
  });

  // After a load: a stored option the catalogue no longer takes is gone from the tile on read; its id
  // (never its value) stays with the tile in memory, so the drawer says so and Save writes it away.
  const STALE_NOTICE = 'Some saved options no longer apply and will be removed when you save.';
  // The Board opens as stored, then the same Board is stored again with the stale option in (as an older Hub wrote it).
  async function openStale(...extra: TileRef[]) {
    const s = withTiles({ ...tileOf(atlas, 'terminal'), params: { cursorStyle: 'bar' } }, ...extra);
    await open(s);
    const doc = toStored(s) as unknown as { boards: Array<{ tiles: Record<string, { params?: Record<string, unknown> } | null> }> };
    const tile = Object.values(doc.boards[0]!.tiles).find((x) => x?.params)!;
    tile.params = { ...tile.params, parent_keys: true };
    await act(async () => {
      await cryptIdleForTests();
      await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, doc);
      // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
      window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
      await cryptIdleForTests();
    });
  }
  const staleSlot = async () => Object.entries((await storedBoards())?.boards[0]?.tiles ?? {}).find(([, x]) => (x as { params?: unknown } | null)?.params)?.[0];

  it('a stored option the catalogue no longer takes: Options shows the stale-options notice, Save writes it away, and the drawer reopens clean', async () => {
    const user = userEvent.setup();
    await openStale();
    await screen.findByTitle('terminal-1 on atlas');
    expect(JSON.stringify(await storedBoards())).toContain('parent_keys');
    await user.click(screen.getByRole('button', { name: /\(1 changed\)$/ }));
    const dialog = await screen.findByRole('dialog', { name: /Options for terminal-1/ });
    expect(within(dialog).getByText(STALE_NOTICE)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-disabled');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(async () => expect(JSON.stringify(await storedBoards())).not.toContain('parent_keys'));
    expect(JSON.stringify(await storedBoards())).not.toContain('dropped');
    expect((await firstTile())?.params).toEqual({ cursorStyle: 'bar' });
    await user.click(screen.getByRole('button', { name: /\(1 changed\)$/ }));
    const again = await screen.findByRole('dialog', { name: /Options for terminal-1/ });
    expect(within(again).queryByText(STALE_NOTICE)).toBeNull();
    expect(within(again).getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('Save with a change as well: the notice goes with the saved tile, and u brings back the options as they were', async () => {
    const user = userEvent.setup();
    await openStale();
    await screen.findByTitle('terminal-1 on atlas');
    await user.click(screen.getByRole('button', { name: /\(1 changed\)$/ }));
    const dialog = await screen.findByRole('dialog', { name: /Options for terminal-1/ });
    expect(within(dialog).getByText(STALE_NOTICE)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Text' }));
    const size = within(dialog).getByRole('textbox', { name: 'Font size' });
    await user.clear(size);
    await user.type(size, '18');
    await user.tab();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(async () => expect((await firstTile())?.params).toEqual({ cursorStyle: 'bar', fontSize: 18 }));
    await act(() => cryptIdleForTests());
    await user.click(screen.getByRole('button', { name: /\(2 changed\)$/ }));
    const again = await screen.findByRole('dialog', { name: /Options for terminal-1/ });
    expect(within(again).queryByText(STALE_NOTICE)).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    act(() => area().focus());
    await user.keyboard('u');
    await waitFor(async () => expect((await firstTile())?.params).toEqual({ cursorStyle: 'bar' }));
  });

  it('an undoable edit on that Board, once its own write folds back, keeps the stale-options notice and the undo step', async () => {
    const user = userEvent.setup();
    await openStale(tileOf(atlas, 'terminal', 2));
    await screen.findByTitle('terminal-2 on atlas');
    const before = await staleSlot();
    await user.click(screen.getAllByRole('button', { name: 'Tile menu' })[0]!);
    await user.click(await screen.findByRole('menuitem', { name: /^Swap with/ }));
    await waitFor(async () => expect(await staleSlot()).not.toBe(before));
    await waitFor(async () => expect(JSON.stringify(await storedBoards())).not.toContain('parent_keys'));
    await act(() => cryptIdleForTests());
    // No two-tab notice: this tab's own write came back with the same Board content.
    expect(screen.queryByText(/changed in another tab|another tab/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: /\(1 changed\)$/ }));
    const dialog = await screen.findByRole('dialog', { name: /Options for terminal-1/ });
    expect(within(dialog).getByText(STALE_NOTICE)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    act(() => area().focus());
    await user.keyboard('u');
    await waitFor(async () => expect(await staleSlot()).toBe(before));
  });

  it('O opens the panel for the active tile; a tile with no saved options shows no count', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal')));
    await screen.findByTitle('terminal-1 on atlas');
    expect(screen.queryByRole('button', { name: /changed\)$/ })).toBeNull();
    act(() => area().focus());
    await user.keyboard('o');
    expect(await screen.findByRole('dialog', { name: /Options for terminal-1/ })).toBeInTheDocument();
  });
});

describe('Board: phones', () => {
  it('the Boards menu starts the chips row: Boards with counts, New Board, Rename, Move left/right, Duplicate, Close, Undo', async () => {
    const user = userEvent.setup();
    phone = true;
    size = { w: 390, h: 700 };
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'terminal')));
    const chips = await screen.findByRole('toolbar', { name: 'Tiles' });
    // The second tile of one session says so on its chip.
    expect(await within(chips).findByText('terminal-1 · atlas (2)')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Boards' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Main/ }));
    // The same menu as the desktop's Boards ▾, the Boards a one-of choice first.
    const names = [...document.querySelectorAll('[role^="menuitem"]')].map((m) => m.textContent ?? '');
    expect(names[0]).toMatch(/^Main · 2 tiles/);
    expect(screen.getByRole('menuitemradio', { name: /^Main · 2 tiles/ })).toHaveAttribute('aria-checked', 'true');
    for (const want of ['New Board', 'Rename', 'Move left', 'Move right', 'Duplicate', 'Close Board', 'Undo', 'Closed Boards']) expect(names.some((n) => n.startsWith(want)), want).toBe(true);
    // Add a program is the chips row's own +, named so (not "Add a tile"), not a menu row.
    expect(names.some((n) => n.startsWith('Add a program'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Focus mode' })).toBeInTheDocument();
    // The shell's restore button sits above the chips row.
    expect(lift).toBe(44);
  });
  it('the phone Boards menu has Keyboard shortcuts, after a divider, which opens the shell\'s sheet', async () => {
    const user = userEvent.setup();
    phone = true;
    size = { w: 390, h: 700 };
    sheets = 0;
    await open(withTiles(tileOf(atlas, 'terminal')));
    await user.click(await screen.findByRole('button', { name: /^Main/ }));
    // Close Board is undone from Closed Boards, so it is no destructive entry: Keyboard shortcuts comes last.
    const names = screen.getAllByRole('menuitem').map((m) => m.textContent ?? '');
    expect(names[names.length - 1]!.replace(/….*$/, '')).toBe('Keyboard shortcuts');
    await user.click(screen.getByRole('menuitem', { name: /Keyboard shortcuts/ }));
    expect(sheets).toBe(1);
  });
});

describe('Board: stopped and attention cards', () => {
  it('Start goes through core\'s lifecycle change: the card reads Starting and offers no second press', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(cedar, 'terminal')));
    await user.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByText('Starting cedar…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(frames()).toHaveLength(0);
  });

  it('a paused computer offers Resume', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(fjord, 'terminal')));
    expect(await screen.findByText('fjord is paused')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(await screen.findByText('Resuming fjord…')).toBeInTheDocument();
  });

  it('an unknown outcome says Start may have gone through and offers Check again, never Start', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(cedar, 'terminal')), { state: 'powerUnknown' });
    await user.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByText('Start may have gone through')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('a held Start offers a warned Dismiss; confirming frees it and Start comes back', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(cedar, 'terminal')), { state: 'powerUnknown' });
    await user.click(await screen.findByRole('button', { name: 'Start' }));
    await user.click(await screen.findByRole('button', { name: 'Stop tracking' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent("Stop tracking only if you know it didn't go through. If it did, sending again makes a second one.");
    await user.click(within(dialog).getByRole('button', { name: 'Stop tracking' }));
    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByText('Start may have gone through')).toBeNull();
  });

  it('a restart held from Computers: no Dismiss or Check again here, the card names Computers and opens it on that computer', async () => {
    const user = userEvent.setup();
    const r = await open(withTiles(tileOf(cedar, 'terminal')), { state: 'powerUnknown' });
    await screen.findByText('cedar is stopped');
    await act(async () => { await computerLifecycle.forPage('computers').run({ id: cedar.id, op: 'restart' }); });
    expect(await screen.findByText('Restart may have gone through')).toBeInTheDocument();
    // Another page sent it: only that page can check or stop tracking it, so the card says where.
    expect(screen.getByText("Computers sent this to terminal-1's computer and the answer was lost. Check or stop tracking it there.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop tracking' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open in Computers' }));
    await waitFor(() => expect(r.router.state.location.href).toContain('/computers?sel=' + encodeURIComponent(cedar.name + '.' + cedar.id.slice(-4))));
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('a refused Start shows the refusal and offers Start again', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(cedar, 'terminal')), { state: 'powerRefused' });
    await user.click(await screen.findByRole('button', { name: 'Start' }));
    await waitFor(() => expect(document.querySelector('[data-outcome="failed"]')).not.toBeNull());
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('expired → Open in Plans & Billing; failed and suspended → Open in Computers; none offers Start', async () => {
    await open(withTiles(tileOf(cedar, 'terminal'), tileOf(fjord, 'terminal'), tileOf(borealis, 'terminal')), { state: 'needsLook' });
    expect(await screen.findByText("cedar's subscription has ended")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in Plans & Billing' })).toBeInTheDocument();
    expect(screen.getByText('fjord has a problem')).toBeInTheDocument();
    expect(screen.getByText('borealis is suspended')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Open in Computers' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^(Start|Resume)$/ })).toBeNull();
  });

  // The API leaves a computer whose server's rental ended out of the list (it is stopped with server_expired, and
  // listed only with include_expired): its tile says the subscription ended, never "deleted or moved".
  it('a tile of a computer the list leaves out because its rental ended → the subscription card, not "deleted or moved"', async () => {
    await open(withTiles(tileOf(cedar, 'terminal')), { state: 'expiredGone' });
    expect(await screen.findByText("cedar's subscription has ended")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open in Plans & Billing' })).toBeInTheDocument();
    expect(screen.queryByText(/deleted,? or moved/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^(Start|Resume)$/ })).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });

  // The read that includes ended rentals is made again when the computers asked about change: with another tile
  // already known gone (that read cached, whole, without cedar), cedar's rental ending while the Board is open must not
  // be judged by the old answer.
  it('a rental that ends while the Board is open, beside a tile already gone → the subscription card, never the old answer', async () => {
    setRentalEnded([]);
    try {
      const ghost = { id: 'c0a7150000000000000000ff', project_id: cedar.project_id };
      const r = await open(withTiles(tileOf(ghost, 'terminal'), tileOf(cedar, 'terminal')), { state: 'rentalEnds' });
      expect(await screen.findByText(/no longer in this realm/)).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument();
      setRentalEnded(['cedar']);
      // The list's own next read (its 30 s poll), and only it: the ended-rentals read is not asked from here.
      await act(async () => { await r.queryClient.refetchQueries({ predicate: (q) => !JSON.stringify(q.queryKey).includes('include_expired') }); });
      expect(await screen.findByText("cedar's subscription has ended")).toBeInTheDocument();
      await waitFor(() => expect(screen.getAllByText(/no longer in this realm/)).toHaveLength(1));
      expect(screen.queryByRole('button', { name: /^(Start|Resume)$/ })).toBeNull();
    } finally {
      setRentalEnded([]);
    }
  });
});

describe('Board: keys', () => {
  it('x closes the active tile with a toast, u puts it back', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    await screen.findByTitle('files-1 on atlas');
    act(() => area().focus());
    await user.keyboard('x');
    await waitFor(() => expect(frames()).toHaveLength(1));
    expect(toasts.at(-1)?.title).toMatch(/^Tile closed\. (terminal|files)-1 keeps running on atlas\.$/);
    expect(toasts.at(-1)?.action?.label).toBe('Undo');
    await user.keyboard('u');
    await waitFor(() => expect(frames()).toHaveLength(2));
  });

  it('n opens the picker on the empty slot; s splits', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal')));
    await screen.findByTitle('terminal-1 on atlas');
    act(() => area().focus());
    await user.keyboard('s');
    expect(await screen.findByRole('row', { name: /atlas/ })).toBeInTheDocument();
    // The count heads the Layout menu: the picker closes first.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('row', { name: /atlas/ })).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Layout' }));
    expect(within(await screen.findByRole('menu')).getByText('2 of 8 tiles')).toBeInTheDocument();
  });
});

describe('Board: keyboard resize', () => {
  it('Alt+Shift+arrows stop where a tile would go below 240 px', async () => {
    const user = userEvent.setup();
    size = { w: 600, h: 500 };
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(atlas, 'files')));
    await screen.findByTitle('files-1 on atlas');
    act(() => area().focus());
    // The left tile active: its right edge moves right.
    await user.keyboard('h');
    for (let i = 0; i < 6; i++) await user.keyboard('{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}');
    const pct = Number(/(\d+)/.exec(screen.getByRole('separator').getAttribute('aria-valuetext') ?? '')?.[1]);
    // 600 px less padding and gap: the right tile keeps at least 240 px.
    expect(pct).toBeGreaterThan(50);
    expect(pct).toBeLessThanOrEqual(59);
  });
});

describe('Board: Boards', () => {
  it('+ creates Board 2 and selects it; at 9 Boards + is disabled', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await screen.findByRole('tab', { name: /Main/ });
    await user.click(screen.getByRole('button', { name: 'New Board' }));
    expect(await screen.findByRole('tab', { name: /Board 2/, selected: true })).toBeInTheDocument();
  });

  it('refuses a tenth Board with the reason', async () => {
    let s = freshRealm(rand);
    for (let i = 2; i <= 9; i++) s = must(createBoard(s, rand, 'Board ' + i));
    await open(s);
    await screen.findByRole('tab', { name: /Board 9/ });
    // Soft-disabled: New Board stays focusable and says its reason.
    const plus = screen.getByRole('button', { name: 'New Board' });
    expect(plus).toHaveAttribute('aria-disabled', 'true');
    expect(plus).toHaveAccessibleDescription(/holds 9 Boards/);
  });

  it('Close Board closes at once, with no confirm (it is undone from Closed Boards: page.closed.test.tsx)', async () => {
    const user = userEvent.setup();
    const s = must(createBoard(withTiles(tileOf(atlas, 'terminal')), rand, 'Work'));
    await open(s);
    await screen.findByRole('tab', { name: /Work/, selected: true });
    await user.click(screen.getByRole('button', { name: 'Boards' }));
    expect(screen.queryByRole('menuitem', { name: /Delete Board/ })).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: /^Close Board/ }));
    await waitFor(() => expect(screen.queryByRole('tab', { name: /Work/ })).toBeNull());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('reload restores the Board; another realm has its own set', async () => {
    const user = userEvent.setup();
    const r = await renderPage(page);
    await user.click(await screen.findByRole('button', { name: 'New Board' }));
    await screen.findByRole('tab', { name: /Board 2/ });
    await waitFor(async () => expect((await storedBoards())?.boards).toHaveLength(2));
    const kept = (await storedBoards()) as RealmBoards;
    r.unmount();
    // A reload: what this account stored for the realm comes back.
    await open(kept);
    expect(await screen.findByRole('tab', { name: /Board 2/, selected: true })).toBeInTheDocument();
    act(() => setRealm(OTHER_REALM));
    await waitFor(() => expect(screen.queryByRole('tab', { name: /Board 2/ })).toBeNull());
    expect(screen.getAllByRole('tab')).toHaveLength(1);
  });

  // A wrong file is an error with its fix; an imported Board shows itself, so no toast.
  const fileField = () => document.querySelector('input[type="file"]') as HTMLInputElement;
  it('Import of a file that is not a Board: an error whose action opens the file chooser again', async () => {
    const user = userEvent.setup({ applyAccept: false });
    await renderPage(page);
    await screen.findByRole('tab', { name: /Main/ });
    toasts.length = 0;
    await user.upload(fileField(), new File(['{"kind":"something-else"}'], 'x.json', { type: 'application/json' }));
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(boardStrings['board.notABoard']));
    const toast = toasts.find((x) => x.title === boardStrings['board.notABoard'])!;
    expect(toast.tone).toBe('error');
    expect(toast.action?.label).toBe(boardStrings['board.chooseFile']);
    const click = vi.spyOn(fileField(), 'click').mockImplementation(() => {});
    toast.action!.onAction();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('Import of a Board file: the Board opens selected, and no toast says so', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await screen.findByRole('tab', { name: /Main/ });
    const src = must(createBoard(freshRealm(rand), rand, 'Imported one'));
    const doc = { kind: 'hoody-board', v: 1, board: toStored({ v: 1, active: src.active, boards: [src.boards[1]!], recents: [] }).boards[0] };
    toasts.length = 0;
    await user.upload(fileField(), new File([JSON.stringify(doc)], 'board.json', { type: 'application/json' }));
    expect(await screen.findByRole('tab', { name: /Imported one/, selected: true })).toBeInTheDocument();
    expect(toasts).toHaveLength(0);
  });
});

describe('Board: parent keys', () => {
  it('ignores a hoody-parent-key message that is not from a tile frame', async () => {
    // happy-dom 21 gives a frame whose page loading is disabled no window (contentWindow null), so
    // the Board would register nothing. A browser frame always has one: stand in a stable one per frame.
    const frameWins = new WeakMap<HTMLIFrameElement, Window>();
    vi.spyOn(HTMLIFrameElement.prototype, 'contentWindow', 'get').mockImplementation(function (this: HTMLIFrameElement) {
      if (!frameWins.has(this)) frameWins.set(this, {} as Window);
      return frameWins.get(this)!;
    });
    const s = withTiles(tileOf(atlas, 'terminal'));
    // The terminal (left) is active, an empty slot is on its right.
    await open(must(onActive(s, (b) => must(focusSlot(must(splitAt(b, b.active, 'right', rand)).board, b.active)))));
    const f = await screen.findByTitle('terminal-1 on atlas');
    const before = area().getAttribute('aria-activedescendant');
    const origin = new URL(f.getAttribute('src') ?? '').origin;
    // Right origin, wrong window (this page's own): ignored.
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'hoody-parent-key', v: 1, chord: 'right' }, origin, source: window })); });
    expect(area().getAttribute('aria-activedescendant')).toBe(before);
    // Right window, wrong origin: ignored.
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'hoody-parent-key', v: 1, chord: 'right' }, origin: 'https://elsewhere.example', source: (f as HTMLIFrameElement).contentWindow })); });
    expect(area().getAttribute('aria-activedescendant')).toBe(before);
    // Its own window and origin: the chord moves to the next tile.
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'hoody-parent-key', v: 1, chord: 'right' }, origin, source: (f as HTMLIFrameElement).contentWindow })); });
    await waitFor(() => expect(area().getAttribute('aria-activedescendant')).not.toBe(before));
  });
});

describe('Board: program view', () => {
  it('opens atlas terminal-2 alone and adds it to Main', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    await renderPage(page, { path: `/board/open/${handle}/terminal-2` });
    expect(await screen.findByTitle('terminal-2 on atlas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add to Main/ }));
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(said('view.added', { board: 'Main' })));
    await waitFor(async () => { const b = (await storedBoards())?.boards[0]; expect(b?.tiles && Object.values(b.tiles)).toContainEqual(expect.objectContaining({ program: 'terminal', session: 2 })); });
  });

  it('the program view has no parent-key listener, so its hint never promises Ctrl+Alt+B', async () => {
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    await renderPage(page, { path: `/board/open/${handle}/terminal-2` });
    const f = await screen.findByTitle('terminal-2 on atlas');
    act(() => f.focus());
    expect(await screen.findByText('Keys go to the program · click outside the tile to leave')).toBeInTheDocument();
    expect(screen.queryByText(/Ctrl\+Alt\+B to leave/)).toBeNull();
  });

  it('the program view\'s tile menu changes the terminal\'s shell too', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    await renderPage(page, { path: `/board/open/${handle}/terminal-1` });
    const f = await screen.findByTitle('terminal-1 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Change shell…' }));
    const d = await screen.findByRole('dialog', { name: 'Change the shell of terminal-1' });
    // terminal-1 is listed (bash, with its incarnation): the ending names that shell, which the fixture terminal checks.
    expect(await within(d).findByText(/terminal-1 runs bash now\./)).toBeInTheDocument();
    await user.click(await within(d).findByRole('radio', { name: 'fish' }));
    await user.click(within(d).getByRole('button', { name: 'End it and change' }));
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain(said('shell.done', { name: 'terminal-1', shell: 'fish' })));
    await waitFor(() => expect(screen.getByTitle('terminal-1 on atlas')).not.toBe(f));
  });

  it('a terminal tile\'s menu offers Restart terminal…, which opens its confirmation and sends nothing yet', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    await renderPage(page, { path: `/board/open/${handle}/terminal-1` });
    await screen.findByTitle('terminal-1 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Restart terminal/ }));
    const d = await screen.findByRole('alertdialog', { name: 'Restart terminal-1' });
    expect(await within(d).findByText(/ends everything running in terminal-1/)).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Restart' })).toBeInTheDocument();
  });

  it('a terminal\'s Options show its shell, and Change opens the same Change shell dialog', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    await renderPage(page, { path: `/board/open/${handle}/terminal-1` });
    await screen.findByTitle('terminal-1 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Options/ }));
    const options = await screen.findByRole('dialog', { name: /Options for terminal-1/ });
    const row = options.querySelector('[data-opt="shell"]') as HTMLElement;
    expect(await within(row).findByText('bash')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Change the shell of terminal-1' }));
    const d = await screen.findByRole('dialog', { name: 'Change the shell of terminal-1' });
    expect(await within(d).findByText(/terminal-1 runs bash now\./)).toBeInTheDocument();
  });

  it('Change shell is a terminal\'s only: a Files view has no such entry', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    await renderPage(page, { path: `/board/open/${handle}/files-1` });
    await screen.findByTitle('files-1 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    expect(await screen.findByRole('menuitem', { name: /^Reload/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Change shell…' })).toBeNull();
  });

  it('a browser view\'s tile menu opens its DevTools; a Files view has no such entry', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    const v = await renderPage(page, { path: `/board/open/${handle}/browser-1` });
    await screen.findByTitle('browser-1 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'DevTools…' }));
    expect(await screen.findByRole('dialog', { name: 'DevTools for browser-1' })).toBeInTheDocument();
    v.unmount();
    await renderPage(page, { path: `/board/open/${handle}/files-1` });
    await screen.findByTitle('files-1 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    expect(await screen.findByRole('menuitem', { name: /^Reload/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^DevTools/ })).toBeNull();
  });

  it('the program view\'s tile menu reaches the terminal\'s tools too: Download output opens in a new tab', async () => {
    const user = userEvent.setup();
    const opened: string[] = [];
    const spy = vi.spyOn(window, 'open').mockImplementation((u) => { opened.push(String(u)); return null; });
    try {
      const handle = atlas.name + '.' + atlas.id.slice(-4);
      await renderPage(page, { path: `/board/open/${handle}/terminal-2` });
      await screen.findByTitle('terminal-2 on atlas');
      await user.click(screen.getByRole('button', { name: 'Tile menu' }));
      await user.click(await screen.findByRole('menuitem', { name: /^Download output/ }));
      expect(opened).toEqual([expect.stringMatching(/\/api\/v1\/terminal\/raw\?terminal_id=2&format=download$/)]);
    } finally { spy.mockRestore(); }
  });

  it('a port view shows the computer\'s port alone, without Options, and adds a port tile to Main', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    await renderPage(page, { path: `/board/open/${handle}/port-3000` });
    const f = await screen.findByTitle('port 3000 on atlas');
    expect(f.getAttribute('src')).toMatch(/-3000\./);
    await user.click(screen.getByRole('button', { name: /Add to Main/ }));
    await waitFor(async () => { const b = (await storedBoards())?.boards[0]; expect(b?.tiles && Object.values(b.tiles).map(plain)).toContainEqual({ project: atlas.project_id, computer: atlas.id, protocol: 'http', port: 3000 }); });
    expect(pageKeys.find((k) => k.key === 'o')?.enabled).toBe(false);
  });

  it('a script view opens the script\'s route on the Exec address', async () => {
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    await renderPage(page, { path: `/board/open/${handle}/script/orders/list` });
    expect((await screen.findByTitle('/orders/list on atlas')).getAttribute('src')).toMatch(/-1\.[^/]+\/orders\/list$/);
  });

  it('files-1 opens on its Root view; Options set here reload it and ride along with Add to Main', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    await renderPage(page, { path: `/board/open/${handle}/files-1` });
    const before = await screen.findByTitle('files-1 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /Options/ }));
    const dialog = await screen.findByRole('dialog', { name: /Options for files-1/ });
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Search' }));
    // The folder starts at /: replace it.
    expect(within(dialog).getByRole('textbox', { name: 'Search in' })).toHaveValue('/');
    await user.clear(within(dialog).getByRole('textbox', { name: 'Search in' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Search in' }), '/srv');
    await user.type(within(dialog).getByRole('textbox', { name: 'Search for' }), 'notes');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTitle('files-1 on atlas')).not.toBe(before);
    await user.click(screen.getByRole('button', { name: /Add to Main/ }));
    await waitFor(async () => expect(Object.values((await storedBoards())?.boards[0]?.tiles ?? {})).toContainEqual(expect.objectContaining({ program: 'files', view: 'search', params: { directory: '/srv', q: 'notes' } })));
  });

  it('a sign-in token typed into a plain option is not stored, and a notice says so (never a silent drop)', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    await renderPage(page, { path: `/board/open/${handle}/files-1` });
    await screen.findByTitle('files-1 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /Options/ }));
    const dialog = await screen.findByRole('dialog', { name: /Options for files-1/ });
    await user.click(within(dialog).getByRole('radio', { name: 'Search' }));
    await user.clear(within(dialog).getByRole('textbox', { name: 'Search in' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Search in' }), '/srv');
    await user.type(within(dialog).getByRole('textbox', { name: 'Search for' }), 'Bearer abc123');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toasts.map((x) => x.title)).toContain('1 option looks like a sign-in token, so the Board did not keep it. Tokens are never stored; this tab uses it until it closes.'));
    expect(toasts.find((x) => x.title.startsWith('1 option looks'))?.tone).toBe('warn');
  });

  it('an unknown handle says so and frames nothing', async () => {
    await renderPage(page, { path: '/board/open/nowhere.0000/terminal-1' });
    expect(await screen.findByText(/doesn't match a computer here/)).toBeInTheDocument();
    expect(frames()).toHaveLength(0);
  });
});

describe('Board: no silent loss', () => {
  it('a stored layout this Hub cannot read gets a band; the next change replaces it and says so', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await screen.findByRole('tab', { name: /Main/ });
    act(() => { raw().set(JSON.stringify({ x: 1, layout: 'other' })); });
    expect(await screen.findByText(/another version of the Hub can't be read by this one/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add a program/ }));
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    await user.click(await screen.findByRole('row', { name: /^terminal-1/ }));
    expect(await screen.findByText('Boards saved on this device by another version of the Hub were replaced by yours.')).toBeInTheDocument();
    await waitFor(async () => expect((await storedBoards())?.boards[0]?.tiles).toBeDefined());
  });
  it('a layout saved by a newer Hub gets its own band; a change is kept in this tab only and never replaces it', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await screen.findByRole('tab', { name: /Main/ });
    act(() => { raw().set(JSON.stringify({ v: 2, layout: 'newer' })); });
    expect(await screen.findByText(/saved by a newer version of the Hub/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add a program/ }));
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    await user.click(await screen.findByRole('row', { name: /^terminal-1/ }));
    expect(await screen.findByText('Boards could not be saved on this device. Changes last until this tab closes.')).toBeInTheDocument();
    expect(screen.queryByText(/were replaced by yours/)).toBeNull();
    expect(raw().get()).toBe(JSON.stringify({ v: 2, layout: 'newer' }));
  });
  it('a write that evicted other entries names both kinds', async () => {
    const user = userEvent.setup();
    await renderPage(page);
    await screen.findByRole('tab', { name: /Main/ });
    const a: Record<string, unknown> = {};
    for (let i = 0; i < 16; i++) a['acct' + String(i).padStart(2, '0')] = { [FIXTURE_REALM]: { v: 1 } };
    const mine: Record<string, unknown> = {};
    for (let i = 0; i < 64; i++) mine['realm' + String(i).padStart(2, '0')] = { v: 1 };
    a[UID] = mine;
    act(() => { raw().set(JSON.stringify({ v: 1, a })); });
    await user.click(screen.getByRole('button', { name: /Add a program/ }));
    await user.click(await screen.findByRole('row', { name: /atlas/ }));
    await user.click(await findTile(/Terminal/));
    await user.click(await screen.findByRole('row', { name: /^terminal-1/ }));
    expect(await screen.findByText(/the saved Boards of one other account on this device were removed .* your saved Boards in one other realm were removed/)).toBeInTheDocument();
  });
});

describe('Board: held band, Check again alone, program view, keys', () => {
  it('a stop held from another page on a running computer: the frame stays, a band says it may have gone through', async () => {
    await open(withTiles(tileOf(atlas, 'terminal')), { state: 'powerUnknown' });
    await screen.findByTitle('terminal-1 on atlas');
    await act(async () => { await computerLifecycle.run({ id: atlas.id, op: 'stop' }); });
    const band = await screen.findByRole('group', { name: 'Stop may have gone through' });
    // Its sender named no page: no link (not even Computers), the band says the page that sent it.
    // The band has one line: the title leads the sentence.
    expect(within(band).getByText("Stop may have gone through. Another page sent this to terminal-1's computer and the answer was lost. Check or stop tracking it on the page that sent it.")).toBeInTheDocument();
    expect(within(band).queryByRole('button')).toBeNull();
    expect(frames()).toHaveLength(1);
  });

  it('Check again works on the Board alone (its read is core\'s shared computers list): a proven start frees the band', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal')), { state: 'powerUnknown' });
    await screen.findByTitle('terminal-1 on atlas');
    await act(async () => { await computerLifecycle.forPage('board').run({ id: atlas.id, op: 'start' }); });
    const band = await screen.findByRole('group', { name: 'Start may have gone through' });
    await user.click(within(band).getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Start may have gone through' })).toBeNull());
    expect(frames()).toHaveLength(1);
  });

  it('program view on a phone: a program already on the Board offers "Add again", with where it is as the tooltip', async () => {
    phone = true;
    size = { w: 390, h: 700 };
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    await open(withTiles(tileOf(atlas, 'terminal', 2)), { path: `/board/open/${handle}/terminal-2` });
    expect(await screen.findByRole('button', { name: /^Add again/ })).toBeInTheDocument();
  });

  it('program view: Open in Computers opens on that computer (?sel= its handle); o opens Options', async () => {
    const user = userEvent.setup();
    const handle = fjord.name + '.' + fjord.id.slice(-4);
    const r = await renderPage(page, { path: `/board/open/${handle}/terminal-1`, state: 'needsLook' });
    await screen.findByRole('button', { name: 'Open in Computers' });
    act(() => { pageKeys.find((k) => k.key === 'o' && !k.mods)?.run(); });
    expect(await screen.findByRole('dialog', { name: /Options for terminal-1/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(await screen.findByRole('button', { name: 'Open in Computers' }));
    await waitFor(() => expect(r.router.state.location.href).toContain('sel=' + encodeURIComponent(handle)));
  });

  it('tile menu: Open in Computers opens Computers on the tile\'s computer (?sel= its handle)', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    const r = await renderPage(page, { path: `/board/open/${handle}/files-1` });
    await screen.findByTitle('files-1 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /Open in Computers/ }));
    await waitFor(() => expect(r.router.state.location.href).toContain('/computers?sel=' + encodeURIComponent(handle)));
  });

  it('tile menu on the board grid: Open in Programs and Open in Computers, Open in Computers opens on that computer', async () => {
    const user = userEvent.setup();
    const r = await open(withTiles(tileOf(atlas, 'terminal')));
    await screen.findByTitle('terminal-1 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    expect(await screen.findByRole('menuitem', { name: /Open in Programs/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^Open in Logs/ })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /Open in Computers/ }));
    await waitFor(() => expect(r.router.state.location.href).toContain('/computers?sel=' + encodeURIComponent(atlas.name + '.' + atlas.id.slice(-4))));
  });

  it('tile menu: Logs opens Logs on the tile\'s computer', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    const r = await open(withTiles(tileOf(atlas, 'terminal')));
    await screen.findByTitle('terminal-1 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /^Open in Logs/ }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/logs'));
    expect(r.router.state.location.href).toContain('computer=' + encodeURIComponent(handle));
  });

  it('Options: the computer name is a link to Computers (the panel\'s onOpenComputer)', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    const r = await renderPage(page, { path: `/board/open/${handle}/files-1` });
    await screen.findByTitle('files-1 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /Options/ }));
    const dialog = await screen.findByRole('dialog', { name: /Options for files-1/ });
    await user.click(within(dialog).getByRole('button', { name: 'Open atlas in Computers' }));
    await waitFor(() => expect(r.router.state.location.href).toContain('/computers?sel=' + encodeURIComponent(handle)));
  });

  it('tile menu: Open in Programs makes the tile\'s computer the current one, then opens Programs', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    const r = await renderPage(page, { path: `/board/open/${handle}/files-1` });
    await screen.findByTitle('files-1 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /Open in Programs/ }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/programs'));
    expect(rememberedComputerId()).toBe(atlas.id);
  });

  it('keys come in groups for the ? sheet; moving, swapping and resizing stay out of the palette', async () => {
    await open(withTiles(tileOf(atlas, 'terminal')));
    await screen.findByTitle('terminal-1 on atlas');
    const of = (key: string, mods?: string[]) => pageKeys.find((k) => k.key === key && String(k.mods ?? '') === String(mods ?? ''));
    expect(of('ArrowLeft')).toMatchObject({ group: 'Moving around', palette: false });
    expect(of('H')).toMatchObject({ group: 'Swap and resize', palette: false });
    expect(of('ArrowLeft', ['alt', 'shift'])).toMatchObject({ group: 'Swap and resize', palette: false });
    expect(of('n')).toMatchObject({ group: 'Tiles' });
    expect(of('n')?.palette).toBeUndefined();
    expect(of('}')).toMatchObject({ group: 'Boards' });
    expect(pageKeys.every((k) => typeof k.group === 'string')).toBe(true);
  });

  it('focus mode on and off keeps the same frames (the tile area never remounts)', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal')));
    const before = await screen.findByTitle('terminal-1 on atlas');
    act(() => area().focus());
    await user.keyboard('f');
    await waitFor(() => expect(screen.queryByRole('tablist')).toBeNull());
    expect(screen.getByTitle('terminal-1 on atlas')).toBe(before);
    act(() => area().focus());
    await user.keyboard('f');
    expect(await screen.findByRole('tablist')).toBeInTheDocument();
    expect(screen.getByTitle('terminal-1 on atlas')).toBe(before);
  });

  it('the Broadcast button sits at the strip end; focus mode hides the strip but keeps it mounted, so a broadcast keeps running', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal')));
    const button = await screen.findByRole('button', { name: 'Broadcast' });
    act(() => area().focus());
    await user.keyboard('f');
    await waitFor(() => expect(screen.queryByRole('tablist')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Broadcast' })).toBeNull();
    expect(button.isConnected).toBe(true);
    act(() => area().focus());
    await user.keyboard('f');
    expect(await screen.findByRole('button', { name: 'Broadcast' })).toBe(button);
  });

  it('leaving focus mode has a place for the keyboard: the strip\'s Focus button is marked for the shell\'s restore', async () => {
    await open(withTiles(tileOf(atlas, 'terminal')));
    const focusButton = await screen.findByRole('button', { name: /^Focus\b/ });
    expect(focusButton).toHaveAttribute('data-hub-restore-focus');
  });

  it('the strip\'s Focus button is named by what it shows: its name starts with its visible text (WCAG 2.5.3)', async () => {
    await open(withTiles(tileOf(atlas, 'terminal')));
    let name = '';
    const b = await screen.findByRole('button', { name: (n) => { if (!/^Focus\b/.test(n)) return false; name = n; return true; } });
    // What it shows, less the kit's aria-hidden key (given to assistive tech as aria-keyshortcuts instead).
    const shown = b.cloneNode(true) as HTMLElement;
    for (const x of shown.querySelectorAll('[aria-hidden="true"]')) x.remove();
    const squash = (x: string) => x.replace(/\s+/g, '');
    expect(squash(shown.textContent ?? '')).not.toBe('');
    expect(squash(name).startsWith(squash(shown.textContent ?? ''))).toBe(true);
    expect(shown.textContent).toMatch(/^Focus/);
    expect(b).toHaveAttribute('aria-keyshortcuts', 'F');
  });
});

describe('Board: a value that stops opening closes what holds it', () => {
  /** Another tab rotates the account's key and deletes the old one (nothing stored changes): this tab's opened Boards
   *  were sealed under the deleted key, so they lock. */
  async function lockStored() {
    await cryptIdleForTests();
    const v = vaultForTests();
    const rec = await v.account(UID);
    const id = newKeyId();
    await v.putKey(UID, id, await newBaseKey());
    await v.putAccount({ ...(rec as NonNullable<typeof rec>), active: id });
    await v.deleteKeys(UID, id);
    // eslint-disable-next-line no-restricted-globals -- another tab's rotation announcement (core's channel)
    const ch = new BroadcastChannel('hoody-hub-crypt');
    ch.postMessage({ type: 'rotate', uid: UID });
    ch.close();
    await new Promise((r) => setTimeout(r, 30));
    await cryptIdleForTests();
  }

  // On desktop Boards ▾ > Rename is the rename in place on the tab (the kit tells the page); on a
  // phone it is the rename dialog. Both are dropped by the lock the same way.
  for (const where of ['desktop', 'phone'] as const) {
    const startRename = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(await screen.findByRole('button', { name: where === 'phone' ? /^Main/ : 'Boards' }));
      await user.click(screen.getByRole('menuitem', { name: /^Rename/ }));
      return screen.findByRole('textbox', { name: where === 'phone' ? 'Rename' : /^Rename / });
    };
    const setWhere = () => { if (where === 'phone') { phone = true; size = { w: 390, h: 700 }; } };

    it(`${where}: an open rename holding a draft closes, and the draft shows nowhere`, async () => {
      const user = userEvent.setup();
      setWhere();
      await open(withTiles(tileOf(atlas, 'terminal'), tileOf(cedar, 'terminal')));
      const field = await startRename(user);
      await user.clear(field);
      await user.type(field, 'SecretDraft');
      if (where === 'phone') expect(screen.getByRole('dialog')).toBeInTheDocument();
      await act(() => lockStored());
      await waitFor(() => expect(screen.queryByRole('textbox', { name: /^Rename/ })).toBeNull());
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.body.textContent ?? '').not.toContain('SecretDraft');
    });

    // The draft cannot be kept (it is the value that stopped opening), so the
    // person is told it was not kept, with nothing of the draft or the Board's name in the words.
    it(`${where}: a rename dropped by the lock says the typed name was not kept, naming nothing of it`, async () => {
      const user = userEvent.setup();
      setWhere();
      await open(withTiles(tileOf(atlas, 'terminal')));
      const field = await startRename(user);
      await user.clear(field);
      await user.type(field, 'SecretDraft');
      const before = toasts.length;
      await act(() => lockStored());
      await waitFor(() => expect(screen.queryByRole('textbox', { name: /^Rename/ })).toBeNull());
      await waitFor(() => expect(toasts.slice(before).map((x) => x.title)).toContain(boardStrings['rename.lost']));
      expect(JSON.stringify(toasts.slice(before))).not.toMatch(/SecretDraft|Main/);
    });

    it(`${where}: with a rename closed before the lock, the lock says nothing about a rename`, async () => {
      const user = userEvent.setup();
      setWhere();
      await open(withTiles(tileOf(atlas, 'terminal')));
      await startRename(user);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('textbox', { name: /^Rename/ })).toBeNull());
      await act(() => lockStored());
      await act(() => cryptIdleForTests());
      expect(toasts.map((x) => x.title)).not.toContain(boardStrings['rename.lost']);
    });
  }

  // A name the Board cannot take (cleanName: a pasted tab, U+2028) was dropped with no words.
  it('a rename with a character a name cannot hold says so, each time, and the Board keeps its name', async () => {
    const user = userEvent.setup();
    phone = true;
    size = { w: 390, h: 700 };
    await open(withTiles(tileOf(atlas, 'terminal')));
    for (const round of [1, 2]) {
      await user.click(await screen.findByRole('button', { name: /^Main/ }));
      await user.click(screen.getByRole('menuitem', { name: /^Rename/ }));
      const field = await screen.findByRole('textbox', { name: 'Rename' });
      await user.clear(field);
      await user.click(field);
      await user.paste('Ops\u2028desk');
      const before = toasts.length;
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Rename' }));
      await waitFor(() => expect(toasts.slice(before).map((x) => x.title), `round ${round}`).toContain(boardStrings['board.nameInvalid']));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    await act(() => cryptIdleForTests());
    expect(JSON.stringify((await storedBoards()) ?? {})).not.toContain('desk');
  });

  it('with no rename ever opened, the lock says nothing about a rename', async () => {
    await open(withTiles(tileOf(atlas, 'terminal')));
    await screen.findByRole('button', { name: 'Boards' });
    await act(() => lockStored());
    await act(() => cryptIdleForTests());
    expect(toasts.map((x) => x.title)).not.toContain(boardStrings['rename.lost']);
  });

  it('a tile drag in progress ends: the shield goes, and its release changes nothing stored', async () => {
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(cedar, 'terminal')));
    await waitFor(() => expect(area().querySelector('[class*="head"]')).not.toBeNull());
    const head = area().querySelector('[class*="head"]') as HTMLElement;
    act(() => { head.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 40, clientY: 10 })); });
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 300 })); });
    await waitFor(() => expect(document.querySelector('[class*="shield"]')).not.toBeNull());
    await act(() => lockStored());
    await waitFor(() => expect(document.querySelector('[class*="shield"]')).toBeNull());
    // eslint-disable-next-line no-restricted-globals -- the sealed bytes, compared only
    const bytes = localStorage.getItem(BOARDS_KEY);
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 400, clientY: 300 })); });
    await act(() => cryptIdleForTests());
    // eslint-disable-next-line no-restricted-globals -- as above
    expect(localStorage.getItem(BOARDS_KEY)).toBe(bytes);
  });

  it('a tile press not yet a drag when the value locks: its window listeners end with the view (a later move or release of it reaches nothing)', async () => {
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(cedar, 'terminal')));
    await waitFor(() => expect(area().querySelector('[class*="head"]')).not.toBeNull());
    const head = area().querySelector('[class*="head"]') as HTMLElement;
    const live = new Set<unknown>();
    const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((t: string, l: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => { if (/^pointer(move|up|cancel)$/.test(t)) live.add(l); add(t, l, o); });
    vi.spyOn(window, 'removeEventListener').mockImplementation((t: string, l: EventListenerOrEventListenerObject, o?: boolean | EventListenerOptions) => { if (/^pointer(move|up|cancel)$/.test(t)) live.delete(l); remove(t, l, o); });
    act(() => { head.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 40, clientY: 10 })); });
    expect(live.size).toBe(3); // the press listens for move, release and cancel
    await act(() => lockStored());
    await waitFor(() => expect(live.size).toBe(0));
  });
});

describe('Board: a held change links to the page that sent it, and the warned Dismiss frees only the send it was opened for', () => {
  const handleOf = (c: { name: string; id: string }) => c.name + '.' + c.id.slice(-4);

  it('another tab\'s newer send of the same change replacing the shown one while the warning is open: the warning closes and the newer send stays held', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(cedar, 'terminal')), { state: 'powerUnknown' });
    await user.click(await screen.findByRole('button', { name: 'Start' }));
    await user.click(await screen.findByRole('button', { name: 'Stop tracking' }));
    const dialog = await screen.findByRole('alertdialog');
    // Another tab of this account dismissed it and sent it again (a new incarnation); this tab adopts it in place.
    const rec = readChanges()!.find((x) => x.pending && x.inc !== undefined)!;
    act(() => {
      writeChanges([...readChanges()!.filter((x) => x.id !== rec.id), { ...rec, inc: 'other-tab-incarnation', at: (rec.at ?? 0) + 1, t: rec.t + 1 }]);
      window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    // Had the warning stayed, its confirm would be the one press that frees the newer send.
    if (dialog.isConnected) await user.click(within(dialog).getByRole('button', { name: 'Stop tracking' }));
    expect(screen.getByText('Start may have gone through')).toBeInTheDocument();
    expect(readChanges()!.filter((x) => x.pending).map((x) => x.inc)).toEqual(['other-tab-incarnation']);
    // Its own warning, opened now, frees it.
    await user.click(screen.getByRole('button', { name: 'Stop tracking' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Stop tracking' }));
    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('a stop held from Bots: the band names Bots and opens it, not Computers', async () => {
    const user = userEvent.setup();
    const r = await open(withTiles(tileOf(atlas, 'terminal')), { state: 'powerUnknown' });
    await screen.findByTitle('terminal-1 on atlas');
    await act(async () => { await computerLifecycle.forPage('bots').run({ id: atlas.id, op: 'stop' }); });
    const band = await screen.findByRole('group', { name: 'Stop may have gone through' });
    expect(within(band).getByText("Stop may have gone through. Bots sent this to terminal-1's computer and the answer was lost. Check or stop tracking it there.")).toBeInTheDocument();
    expect(within(band).queryByRole('button', { name: 'Open in Computers' })).toBeNull();
    await user.click(within(band).getByRole('button', { name: 'Open in Bots' }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/bots'));
  });

  it('a restart held from Home: the card names Home and opens it, not Computers', async () => {
    const user = userEvent.setup();
    const r = await open(withTiles(tileOf(cedar, 'terminal')), { state: 'powerUnknown' });
    await screen.findByText('cedar is stopped');
    await act(async () => { await computerLifecycle.forPage('home').run({ id: cedar.id, op: 'restart' }); });
    expect(await screen.findByText("Home sent this to terminal-1's computer and the answer was lost. Check or stop tracking it there.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open in Computers' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open in Home' }));
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/home'));
  });

  it('Computers hidden in this load: a hold Computers sent shows no link in the card or the band (no classic fallback)', async () => {
    hiddenPages.add('computers');
    await open(withTiles(tileOf(atlas, 'terminal'), tileOf(cedar, 'terminal')), { state: 'powerUnknown' });
    await screen.findByTitle('terminal-1 on atlas');
    await act(async () => { await computerLifecycle.forPage('computers').run({ id: atlas.id, op: 'stop' }); });
    await act(async () => { await computerLifecycle.forPage('computers').run({ id: cedar.id, op: 'restart' }); });
    const band = await screen.findByRole('group', { name: 'Stop may have gone through' });
    expect(within(band).getByText(/Check or stop tracking it on the page that sent it/)).toBeInTheDocument();
    expect(within(band).queryByRole('button')).toBeNull();
    expect(await screen.findByText('Restart may have gone through')).toBeInTheDocument();
    // The band (atlas) and the card (cedar) both say it; neither offers a link.
    expect(screen.getAllByText(/Another page sent this to terminal-1's computer and the answer was lost\. Check or stop tracking it on the page that sent it\.$/)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Open in Computers' })).toBeNull();
  });

  it('the sender page hidden (Bots): read-only text only, no link to it or to Computers', async () => {
    hiddenPages.add('bots');
    await open(withTiles(tileOf(atlas, 'terminal')), { state: 'powerUnknown' });
    await screen.findByTitle('terminal-1 on atlas');
    await act(async () => { await computerLifecycle.forPage('bots').run({ id: atlas.id, op: 'stop' }); });
    const band = await screen.findByRole('group', { name: 'Stop may have gone through' });
    expect(within(band).getByText(/Check or stop tracking it on the page that sent it/)).toBeInTheDocument();
    expect(within(band).queryByRole('button')).toBeNull();
  });

  it('program view: a hold Bots sent links to Bots; with Bots hidden it has no link', async () => {
    const r = await renderPage(page, { path: `/board/open/${handleOf(atlas)}/terminal-1`, state: 'powerUnknown' });
    await screen.findByTitle('terminal-1 on atlas');
    await act(async () => { await computerLifecycle.forPage('bots').run({ id: atlas.id, op: 'stop' }); });
    const band = await screen.findByRole('group', { name: 'Stop may have gone through' });
    expect(within(band).getByRole('button', { name: 'Open in Bots' })).toBeInTheDocument();
    r.unmount();
    hiddenPages.add('bots');
    await renderPage(page, { path: `/board/open/${handleOf(atlas)}/terminal-1`, state: 'powerUnknown' });
    await screen.findByTitle('terminal-1 on atlas');
    await act(async () => { await computerLifecycle.forPage('bots').run({ id: atlas.id, op: 'stop' }); });
    const band2 = await screen.findByRole('group', { name: 'Stop may have gone through' });
    expect(within(band2).queryByRole('button')).toBeNull();
  });
});

describe('Board: a hold Computers sent, with Computers hidden, leaves no way to Computers in the tile menu or Options', () => {
  const handleOf = (c: { name: string; id: string }) => c.name + '.' + c.id.slice(-4);
  // The tile menu's entries (it is closed again after reading).
  async function menuItems(user: ReturnType<typeof userEvent.setup>): Promise<string[]> {
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await screen.findAllByRole('menuitem');
    const names = screen.getAllByRole('menuitem').map((m) => m.textContent ?? '');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
    return names;
  }
  // Options of the tile: whether its computer name is a link (the panel's onOpenComputer); the name shows either way.
  async function optionsLinksComputer(user: ReturnType<typeof userEvent.setup>, tile: string): Promise<boolean> {
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /Options/ }));
    const dialog = await screen.findByRole('dialog', { name: new RegExp('Options for ' + tile) });
    expect(within(dialog).getAllByText(/atlas/).length).toBeGreaterThan(0);
    const linked = within(dialog).queryByRole('button', { name: 'Open atlas in Computers' }) !== null;
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    return linked;
  }
  async function gridWithHold(sender: 'computers' | 'bots' | null) {
    const r = await open(withTiles(tileOf(atlas, 'terminal')), { state: 'powerUnknown' });
    await screen.findByTitle('terminal-1 on atlas');
    if (sender) {
      await act(async () => { await computerLifecycle.forPage(sender).run({ id: atlas.id, op: 'stop' }); });
      await screen.findByRole('group', { name: 'Stop may have gone through' });
    }
    return r;
  }
  const hasOpenComputer = (names: string[]) => names.some((n) => /Open in Computers/.test(n));

  it('board grid, Computers hidden, a hold Computers sent: no Open in Computers in the menu (Programs and Logs stay), Options shows the name as plain text', async () => {
    const user = userEvent.setup();
    hiddenPages.add('computers');
    await gridWithHold('computers');
    const names = await menuItems(user);
    expect(hasOpenComputer(names)).toBe(false);
    expect(names.some((n) => /Open in Programs/.test(n))).toBe(true);
    expect(names.some((n) => /^Open in Logs/.test(n))).toBe(true);
    expect(await optionsLinksComputer(user, 'terminal-1')).toBe(false);
  });

  it('board grid, control: Computers served, the same hold: Open in Computers goes to the Hub Computers page on that computer', async () => {
    const user = userEvent.setup();
    const r = await gridWithHold('computers');
    expect(await optionsLinksComputer(user, 'terminal-1')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /Open in Computers/ }));
    await waitFor(() => expect(r.router.state.location.href).toContain('/computers?sel=' + encodeURIComponent(handleOf(atlas))));
  });

  it('board grid, control with Computers hidden: a hold Bots sent keeps the classic Open in Computers and the Options link', async () => {
    const user = userEvent.setup();
    hiddenPages.add('computers');
    await gridWithHold('bots');
    expect(hasOpenComputer(await menuItems(user))).toBe(true);
    expect(await optionsLinksComputer(user, 'terminal-1')).toBe(true);
  });

  it('board grid, Computers hidden and no hold: the classic Open in Computers and the Options link stay', async () => {
    const user = userEvent.setup();
    hiddenPages.add('computers');
    await gridWithHold(null);
    expect(hasOpenComputer(await menuItems(user))).toBe(true);
    expect(await optionsLinksComputer(user, 'terminal-1')).toBe(true);
  });

  it('board grid, Computers hidden: once Computers\' hold is gone (dismissed there), Open in Computers comes back without a remount', async () => {
    const user = userEvent.setup();
    hiddenPages.add('computers');
    await gridWithHold('computers');
    expect(hasOpenComputer(await menuItems(user))).toBe(false);
    const h = heldChanges(lifecycleLock.lock)[0]!;
    await act(async () => { await computerLifecycle.forPage('computers').dismiss({ id: atlas.id, op: 'stop' }, h.hold!); });
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Stop may have gone through' })).toBeNull());
    expect(hasOpenComputer(await menuItems(user))).toBe(true);
  });

  it('program view, Computers hidden, a hold Computers sent: no Open in Computers, Options shows the name as plain text; served: both link', async () => {
    const user = userEvent.setup();
    hiddenPages.add('computers');
    const r = await renderPage(page, { path: `/board/open/${handleOf(atlas)}/terminal-1`, state: 'powerUnknown' });
    await screen.findByTitle('terminal-1 on atlas');
    await act(async () => { await computerLifecycle.forPage('computers').run({ id: atlas.id, op: 'stop' }); });
    await screen.findByRole('group', { name: 'Stop may have gone through' });
    expect(hasOpenComputer(await menuItems(user))).toBe(false);
    expect(await optionsLinksComputer(user, 'terminal-1')).toBe(false);
    r.unmount();
    hiddenPages.clear();
    await renderPage(page, { path: `/board/open/${handleOf(atlas)}/terminal-1`, state: 'powerUnknown' });
    await screen.findByTitle('terminal-1 on atlas');
    await act(async () => { await computerLifecycle.forPage('computers').run({ id: atlas.id, op: 'stop' }); });
    await screen.findByRole('group', { name: 'Stop may have gone through' });
    expect(hasOpenComputer(await menuItems(user))).toBe(true);
    expect(await optionsLinksComputer(user, 'terminal-1')).toBe(true);
  });

  it('program view, Computers hidden: a hold Bots sent keeps the classic Open in Computers and the Options link', async () => {
    const user = userEvent.setup();
    hiddenPages.add('computers');
    await renderPage(page, { path: `/board/open/${handleOf(atlas)}/terminal-1`, state: 'powerUnknown' });
    await screen.findByTitle('terminal-1 on atlas');
    await act(async () => { await computerLifecycle.forPage('bots').run({ id: atlas.id, op: 'stop' }); });
    await screen.findByRole('group', { name: 'Stop may have gone through' });
    expect(hasOpenComputer(await menuItems(user))).toBe(true);
    expect(await optionsLinksComputer(user, 'terminal-1')).toBe(true);
  });
});

describe('Board keys after the Board menu, and a pending entry', () => {
  // The Board menu closed with Escape gives the keys back to the Board surface, so `s` splits.
  it('Board menu > Escape: focus goes back to the Board surface and s splits', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal')));
    await screen.findByTitle('terminal-1 on atlas');
    await user.click(await screen.findByRole('button', { name: 'Boards' }));
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(area()));
    await user.keyboard('s');
    expect(await screen.findByRole('row', { name: /atlas/ })).toBeInTheDocument();
    // The count heads the Layout menu: the picker closes first.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('row', { name: /atlas/ })).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Layout' }));
    expect(within(await screen.findByRole('menu')).getByText('2 of 8 tiles')).toBeInTheDocument();
  });

  // Only this menu's own button hands the keys back. Focus moved to another menu's button between
  // the menu's restore and the check stays there.
  it("focus moved to another menu's button after the Board menu closed stays there", async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal')));
    await screen.findByTitle('terminal-1 on atlas');
    await user.click(await screen.findByRole('button', { name: 'Boards' }));
    await screen.findByRole('menu');
    const other = document.createElement('button');
    other.setAttribute('aria-haspopup', 'true');
    other.setAttribute('aria-expanded', 'false');
    other.textContent = 'Another menu';
    document.body.append(other);
    const held: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { held.push(cb); return held.length; });
    try {
      await user.keyboard('{Escape}');
      // The first frames: the menu's restore to its button. Then the person moves on, before the next frame's check.
      act(() => { for (const cb of held.splice(0)) cb(performance.now()); });
      act(() => other.focus());
      for (let i = 0; i < 5 && held.length; i++) act(() => { for (const cb of held.splice(0)) cb(performance.now()); });
      expect(document.activeElement).toBe(other);
    } finally {
      raf.mockRestore();
      other.remove();
    }
  });

  it('a Boards menu item that opens a dialog keeps the focus in it (Rename, on a phone)', async () => {
    const user = userEvent.setup();
    phone = true;
    size = { w: 390, h: 700 };
    await open(withTiles(tileOf(atlas, 'terminal')));
    await user.click(await screen.findByRole('button', { name: /^Main/ }));
    await user.click(screen.getByRole('menuitem', { name: /^Rename/ }));
    const field = await screen.findByRole('textbox', { name: 'Rename' });
    await act(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(field);
  });

  // Opening the picker cancels a pending entry, so a later frame cannot take the keys into a tile.
  it('a pending entry is cancelled when s opens the picker: after Escape it never takes the keys into the tile', async () => {
    const user = userEvent.setup();
    await open(withTiles(tileOf(atlas, 'terminal')));
    const frame = await screen.findByTitle('terminal-1 on atlas');
    act(() => area().focus());
    const skeleton = frame.parentElement?.querySelector('[aria-hidden="true"]:has(> i)') as HTMLElement;
    expect(skeleton).not.toBeNull();
    // The touch release asks for the entry one frame later: that frame is held back until the picker came and went.
    const held: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { held.push(cb); return held.length; });
    await user.pointer([{ keys: '[TouchA>]', target: skeleton }, { keys: '[/TouchA]', target: skeleton }]);
    raf.mockRestore();
    expect(held.length).toBeGreaterThan(0);
    expect(document.activeElement).not.toBe(frame);
    act(() => area().focus());
    await user.keyboard('s');
    expect(await screen.findByRole('row', { name: /atlas/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('row', { name: /atlas/ })).toBeNull());
    act(() => area().focus());
    act(() => { for (const cb of held) cb(performance.now()); });
    expect(document.activeElement).not.toBe(frame);
    expect(document.activeElement).toBe(area());
  });
});
