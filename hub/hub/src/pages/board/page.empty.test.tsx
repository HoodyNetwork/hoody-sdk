// Vitest: the Board page's side of adding tiles, and the empty Board. An empty Board (its one slot
// empty) shows the welcome alone: no tile header strip, no Close, no "1 of 8 tiles"; the count comes with the first tile.
// Recent's Clear in Add a program empties the realm's stored recents and its toast's Undo puts them back. With tiles,
// the strip has a labelled Add a program with a tooltip, focusable with its reason on a full Board (49); a Board of
// empty slots shows no count; a program tile has Change session and Options beside its name (50).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, boardSlots as boardSlotsOf, freshRealm, isRefusal, onActive, splitAt, type RealmBoards, type TileRef } from './model/boards';
import { toStored } from './model/persist';
import { resetFixtureSessions, setListDown } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const S = strings as Record<string, string>;
const toasts: Array<{ title: string; action?: { label: string; onAction: () => void } }> = [];
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string }) => { toasts.push(c); return 'toast-1'; } }));

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const stored = async () => (await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards | null;
const rec = (session: number): TileRef => ({ project: atlas.project_id, computer: atlas.id, program: 'terminal', session });
const must = (x: RealmBoards | { refused: string }): RealmBoards => { if (isRefusal(x)) throw new Error('refused'); return x as RealmBoards; };
const rnd = () => 0.5;
async function store(s: RealmBoards) {
  await act(async () => {
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
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

describe('Board: an empty Board', () => {
  it('shows the welcome alone: no tile header, no Close, no "1 of 8 tiles"; the first tile brings the count (the Layout menu heads with it)', async () => {
    const r = await renderPage(page, { path: '/board' });
    expect(await screen.findByText(S['empty.first']!)).toBeInTheDocument();
    const slot = await screen.findByRole('group', { name: S['empty.chip'] });
    expect(slot.querySelector('[class*="head"]')).toBeNull();
    expect(within(slot).queryByRole('button', { name: new RegExp(S['tile.closeEmptyTip']!) })).toBeNull();
    expect(screen.queryByText('1 of 8 tiles')).toBeNull();
    await act(() => r.router.navigate({ href: `/board?add=terminal-1&cid=${atlas.id}` } as never));
    expect(await screen.findByTitle('terminal-1 on atlas')).toBeInTheDocument();
    // The count heads the Layout menu.
    await userEvent.setup().click(screen.getByRole('button', { name: S['layout'] }));
    expect(within(await screen.findByRole('menu')).getByText('1 of 8 tiles')).toBeInTheDocument();
  });

  it('a Board of empty slots shows no count however many it has; the first tile brings "2 of 8 tiles"', async () => {
    const r = await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    let n = 0;
    const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
    const two = must(onActive(freshRealm(rand), (b) => { const x = splitAt(b, boardSlotsOf(b)[0]!, 'right', rand); return isRefusal(x) ? x : x.board; }));
    await store(two);
    await waitFor(() => expect(screen.getAllByRole('group', { name: S['empty.chip'] })).toHaveLength(2));
    expect(screen.queryByText(/of 8 tiles/)).toBeNull();
    await act(() => r.router.navigate({ href: `/board?add=terminal-1&cid=${atlas.id}` } as never));
    expect(await screen.findByTitle('terminal-1 on atlas')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: S['layout'] }));
    expect(within(await screen.findByRole('menu')).getByText('2 of 8 tiles')).toBeInTheDocument();
  });
});

describe('Board: Recent you can clear', () => {
  it('Clear empties the stored recents; the toast\'s Undo puts them back; Delete on a Recent tile drops one', async () => {
    await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    await store({ ...freshRealm(() => 0.5), recents: [rec(3), rec(2), rec(1)] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: new RegExp(S['empty.add']!) }));
    // The Recent card (its section, named by its heading "Recent · n"): its tiles, and Clear in its header.
    const recentCard = () => screen.getByRole('region', { name: new RegExp('^' + S['picker.recent'] + ' · \\d+$') });
    const recentTiles = () => within(screen.getByRole('grid', { name: S['picker.recent'] })).getAllByRole('row');
    await screen.findByRole('grid', { name: S['picker.recent'] });
    // Delete on a focused Recent tile drops it (a tile holds no button).
    act(() => { recentTiles()[1]!.focus(); });
    await user.keyboard('{Delete}');
    await waitFor(async () => expect((await stored())?.recents.map((x) => x.session)).toEqual([3, 1]));
    await user.click(within(recentCard()).getByRole('button', { name: S['picker.recentClear'] }));
    await waitFor(async () => expect((await stored())?.recents).toEqual([]));
    const toast = toasts.find((x) => x.title === S['recent.cleared']);
    expect(toast?.action?.label).toBe(S['undo.label']);
    await act(async () => { toast!.action!.onAction(); });
    await waitFor(async () => expect((await stored())?.recents.map((x) => x.session)).toEqual([3, 1]));
  });
});

describe('Board: a visible Add a program', () => {
  it('with tiles, the strip has a labelled Add a program with its N key (no key cap), apart from New Board; it opens the picker', async () => {
    const r = await renderPage(page, { path: '/board' });
    expect(await screen.findByText(S['empty.first']!)).toBeInTheDocument();
    // An empty Board: its welcome has the Add; the strip has none. (A shown key is not part of a kit button's name: it
    // is aria-hidden and given as aria-keyshortcuts.)
    const welcome = within(await screen.findByRole('group', { name: S['empty.chip'] })).getByRole('button', { name: S['board.addProgram'] });
    expect(screen.getAllByRole('button', { name: S['board.addProgram'] })).toEqual([welcome]);
    await act(() => r.router.navigate({ href: `/board?add=terminal-1&cid=${atlas.id}` } as never));
    expect(await screen.findByTitle('terminal-1 on atlas')).toBeInTheDocument();
    const add = await screen.findByRole('button', { name: S['board.addProgram'] });
    expect(add).toHaveTextContent(S['board.addProgram']!);
    // No key cap in the label: N is in its tooltip and aria-keyshortcuts.
    expect(add.querySelector('kbd')).toBeNull();
    expect(add).toHaveAttribute('aria-keyshortcuts', 'N');
    expect(screen.getByRole('button', { name: S['board.new'] })).not.toBe(add);
    await userEvent.setup().click(add);
    // The picker: its first screen, the computers as tiles.
    expect(await screen.findByRole('row', { name: /^atlas/ })).toBeInTheDocument();
  });

  it('on a full Board, Tab reaches Add, which reads its reason and does nothing on Enter or Space', async () => {
    await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    let full = freshRealm(rnd);
    for (let i = 1; i <= 8; i++) full = must(onActive(full, (b) => { const x = addTile(b, rec(i), rnd); return isRefusal(x) ? x : x.board; }));
    await store(full);
    expect(await screen.findByTitle('terminal-8 on atlas')).toBeInTheDocument();
    const add = await screen.findByRole('button', { name: S['board.addProgram'] });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(add).not.toBeDisabled();
    expect(add).toHaveAccessibleDescription(S['board.full']!);
    const user = userEvent.setup();
    document.body.focus();
    for (let i = 0; i < 80 && document.activeElement !== add; i++) await user.tab();
    expect(document.activeElement).toBe(add);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    // No picker opened (its first screen lists the computers as tiles).
    expect(screen.queryByRole('row', { name: /^atlas/ })).toBeNull();
  });

  it('with tiles, Add a program has a tooltip naming it and its key (the label collapses under 1200px)', async () => {
    const r = await renderPage(page, { path: '/board' });
    expect(await screen.findByText(S['empty.first']!)).toBeInTheDocument();
    await act(() => r.router.navigate({ href: `/board?add=terminal-1&cid=${atlas.id}` } as never));
    expect(await screen.findByTitle('terminal-1 on atlas')).toBeInTheDocument();
    const add = await screen.findByRole('button', { name: S['board.addProgram'] });
    const user = userEvent.setup();
    document.body.focus();
    for (let i = 0; i < 80 && document.activeElement !== add; i++) await user.tab();
    expect(document.activeElement).toBe(add);
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent(S['board.addProgram']!);
    expect(tip).toHaveTextContent('N');
  });
});

describe('Board: a tile program\'s options beside its title', () => {
  it('a program tile\'s Change session button beside its name opens Change session, its Options button opens the options; a web tile has neither', async () => {
    await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    const s0 = freshRealm(() => 0.5);
    const b0 = s0.boards[0]!;
    const slot = Object.keys(b0.tiles).length ? Object.keys(b0.tiles)[0]! : boardSlotsOf(b0)[0]!;
    const withTerm = { ...s0, boards: [{ ...b0, tiles: { ...b0.tiles, [slot]: { project: atlas.project_id, computer: atlas.id, program: 'terminal' as const, session: 1 } } }] };
    await store(withTerm);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Change session of terminal-1' }));
    expect(await screen.findByRole('grid', { name: S['picker.sessions'] })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Options for terminal-1' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await store({ ...s0, boards: [{ ...b0, tiles: { ...b0.tiles, [slot]: { url: 'https://example.com/' } } }] });
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Change session of/ })).toBeNull());
    expect(screen.queryByRole('button', { name: /^Options for/ })).toBeNull();
  });
});
