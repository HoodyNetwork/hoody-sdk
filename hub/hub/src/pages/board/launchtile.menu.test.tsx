// Vitest, the mounted Board on core's fixture transport: a terminal an app launch placed (Apps "Put on Board", the
// run-open band 8001-9999) offers neither Restart terminal nor Change shell, in the Board's tile menu or the program
// view's. The terminal list those act on holds only 1-8000, so they would call a running launch "not running"
// instead. A plain terminal keeps both.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { addTile, freshRealm, isRefusal, onActive, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { toStored } from './model/persist';
import page from './page';
import { holdList, resetFixtureSessions, setListDown } from './fixtures';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const term = (session: number): TileRef => ({ project: atlas.project_id, computer: atlas.id, program: 'terminal', session });
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function withTiles(...tiles: TileRef[]): RealmBoards {
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
  await screen.findByRole('group', { name: 'Board tiles' }); // the account opens as the page loads
  await act(async () => {
    await cryptIdleForTests();
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}
const tileGroup = (name: RegExp) => screen.getAllByRole('group').find((g) => name.test(g.getAttribute('aria-label') ?? ''))!;
const menuNames = () => screen.getAllByRole('menuitem').map((m) => m.textContent ?? '');

beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  holdList.wait = null;
  resetBoardsForTests();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('a launch tile offers no Restart terminal or Change shell', () => {
  it('the Board tile menu: terminal-8003 has neither, terminal-2 beside it keeps both', async () => {
    const user = userEvent.setup();
    await open(withTiles(term(8003), term(2)));
    await screen.findByTitle('terminal-8003 on atlas');
    await user.click(within(tileGroup(/terminal-8003/)).getByRole('button', { name: /Tile menu/ }));
    await screen.findAllByRole('menuitem');
    expect(menuNames().some((x) => /^Restart terminal|^Change shell/.test(x))).toBe(false);
    await user.keyboard('{Escape}');
    await user.click(within(tileGroup(/terminal-2/)).getByRole('button', { name: /Tile menu/ }));
    await screen.findAllByRole('menuitem');
    expect(menuNames().filter((x) => /^Restart terminal|^Change shell/.test(x))).toHaveLength(2);
  });

  it('the program view tile menu: terminal-8003 has neither', async () => {
    const user = userEvent.setup();
    const handle = atlas.name + '.' + atlas.id.slice(-4);
    await renderPage(page, { path: `/board/open/${handle}/terminal-8003` });
    await screen.findByTitle('terminal-8003 on atlas');
    await user.click(screen.getByRole('button', { name: 'Tile menu' }));
    await screen.findAllByRole('menuitem');
    expect(menuNames().some((x) => /^Restart terminal|^Change shell/.test(x))).toBe(false);
  });
});
