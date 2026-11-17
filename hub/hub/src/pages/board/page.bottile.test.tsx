// Vitest: a Bot tile on the mounted Board, beside a port tile, on core's fixture
// world. Its tile menu is a port tile's without the share link (a Bot tile has no address): Change program, Swap,
// Split, a plain Duplicate (no new session: the copy is the same Bot) and its computer's links; no Change session and no
// Options. A program tile beside it keeps Duplicate (new session). Duplicate stores the same Bot again with its own tile id. Change
// program opens the picker. With the Bot tile active, O is off (no options) and R reloads it: the Bots page's tile view
// mounts again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import type * as Kit from '@kit';
import type { PageShortcut } from '@kit';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, freshRealm, isRefusal, onActive, type Board, type BotTile, type PortTile, type TileRef, type RealmBoards, type Refusal, type Tile } from './model/boards';
import { toStored } from './model/persist';
import page from './page';
import { holdList, resetFixtureSessions, setListDown } from './fixtures';
import strings from './strings.en.json';

// The Bots page's tile view, as its contribution gives it: each mount is counted, so a reload shows as one more.
const views = vi.hoisted(() => ({ mounts: 0, keys: [] as PageShortcut[] }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<typeof Kit>();
  const { useEffect } = await import('react');
  const View = ({ target }: { target: string }) => {
    useEffect(() => { views.mounts++; }, []);
    return <p>bot view {target}</p>;
  };
  return {
    ...kit,
    useContributions: () => ({ ...kit.useContributions(), tileViews: [{ pageId: 'bots', id: 'bot', title: 'Bot', Component: View, href: '/bots' }] }),
    usePageShortcuts: (k: PageShortcut[]) => { views.keys = k; kit.usePageShortcuts(k); },
  };
});

const S = strings;
const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const bot: BotTile = { project: atlas.project_id, computer: atlas.id, realm: FIXTURE_REALM, bot: 'chief' };
const port: PortTile = { project: atlas.project_id, computer: atlas.id, protocol: 'http', port: 3000 };
const notes: TileRef = { project: atlas.project_id, computer: atlas.id, program: 'notes', session: 1 };
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function withTiles(...tiles: Tile[]): RealmBoards {
  let s = freshRealm(rand);
  for (const t of tiles) {
    const next = onActive(s, (b): Board | Refusal => { const r = addTile(b, t, rand); return isRefusal(r) ? r : r.board; });
    if (isRefusal(next)) throw new Error('refused ' + next.refused);
    s = next;
  }
  return s;
}
async function open(s: RealmBoards) {
  await renderPage(page);
  await screen.findByRole('group', { name: 'Board tiles' });
  await act(async () => {
    await cryptIdleForTests();
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
  await screen.findByText(`bot view ${atlas.id}~${FIXTURE_REALM}~chief`);
}
const tileGroup = (name: RegExp) => screen.getAllByRole('group').find((g) => name.test(g.getAttribute('aria-label') ?? ''))!;
const area = () => screen.getByRole('group', { name: 'Board tiles' });
// A menu's item names with each other tile's Swap label made generic, so two tiles' menus compare.
const menuOf = async (user: ReturnType<typeof userEvent.setup>, name: RegExp): Promise<string[]> => {
  await user.click(within(tileGroup(name)).getByRole('button', { name: /Tile menu/ }));
  const items = (await screen.findAllByRole('menuitem')).map((m) => (m.textContent ?? '').replace(/^Swap with .*/, 'Swap with …'));
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryAllByRole('menuitem')).toHaveLength(0));
  return items;
};
const storedTiles = async () => Object.values(((await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards | null)?.boards[0]?.tiles ?? {})
  .filter((x): x is Tile => x !== null);
const key = (k: string) => views.keys.find((x) => x.key === k);

beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  holdList.wait = null;
  resetBoardsForTests();
  views.mounts = 0;
  views.keys = [];
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('a Bot tile on the Board', () => {
  it("has a port tile's menu without the share link: no Change session, no Options", async () => {
    const user = userEvent.setup();
    await open(withTiles(port, bot));
    const botMenu = await menuOf(user, /chief/);
    const portMenu = await menuOf(user, /port 3000/);
    expect(botMenu).toEqual([S['tile.changeProgram'], 'Swap with …', S['tile.splitRight'], S['tile.splitDown'], S['tile.duplicateSame'], S['tile.moveTo'],
      S['tile.openPrograms'], S['tile.openComputer'], S['tile.openLogs'], S['tile.openTunnels'], S['tile.close']].map((x) => expect.stringContaining(x)));
    expect(botMenu.some((x) => x.startsWith(S['tile.changeSession']) || x.startsWith(S['tile.options']))).toBe(false);
    expect(botMenu.some((x) => x.startsWith(S['tile.duplicate']))).toBe(false);
    expect(portMenu.some((x) => x.startsWith(S['tile.copyLink']))).toBe(true);
    expect(portMenu.filter((x) => !x.startsWith(S['tile.copyLink']))).toEqual(botMenu);
  });

  it('a program tile beside it keeps Duplicate (new session); the Bot tile says Duplicate', async () => {
    const user = userEvent.setup();
    await open(withTiles(notes, bot));
    const progMenu = await menuOf(user, /notes/i);
    const botMenu = await menuOf(user, /chief/);
    expect(progMenu.filter((x) => x.startsWith(S['tile.duplicate']))).toHaveLength(1);
    expect(botMenu.filter((x) => x === S['tile.duplicateSame'])).toHaveLength(1);
  });

  it('Duplicate stores the same Bot again with its own tile id, and both tiles draw its view', async () => {
    const user = userEvent.setup();
    await open(withTiles(bot));
    await user.click(within(tileGroup(/chief/)).getByRole('button', { name: /Tile menu/ }));
    await user.click(await screen.findByRole('menuitem', { name: S['tile.duplicateSame'] }));
    await waitFor(async () => expect(await storedTiles()).toHaveLength(2));
    const [a, b] = (await storedTiles()) as [BotTile, BotTile];
    const { tid: ta, ...ra } = a;
    const { tid: tb, ...rb } = b;
    // Stored tiles name the computer under `computer`, as the in-memory Bot tile does.
    expect(ra).toEqual(bot);
    expect(rb).toEqual(bot);
    expect(ta).toMatch(/^t[a-z0-9]{4,24}$/);
    expect(tb).toMatch(/^t[a-z0-9]{4,24}$/);
    expect(ta).not.toBe(tb);
    expect(await screen.findAllByText(`bot view ${atlas.id}~${FIXTURE_REALM}~chief`)).toHaveLength(2);
  });

  it('Change program is offered and opens the picker for the tile', async () => {
    const user = userEvent.setup();
    await open(withTiles(bot));
    await user.click(within(tileGroup(/chief/)).getByRole('button', { name: /Tile menu/ }));
    await user.click(await screen.findByRole('menuitem', { name: new RegExp('^' + S['tile.changeProgram']) }));
    expect(await screen.findByRole('dialog', { name: S['tile.changeProgram'] })).toBeInTheDocument();
  });

  it('with the Bot tile active, O is off and opens nothing; R mounts its view again', async () => {
    const user = userEvent.setup();
    await open(withTiles(port, bot));
    await waitFor(() => expect(key('o')?.enabled).toBe(false));
    expect(key('r')?.enabled).toBe(true);
    const before = views.mounts;
    act(() => area().focus());
    await user.keyboard('o');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.keyboard('r');
    await waitFor(() => expect(views.mounts).toBe(before + 1));
    expect(screen.getByText(`bot view ${atlas.id}~${FIXTURE_REALM}~chief`)).toBeInTheDocument();
  });
});
