// Vitest: the Recent list's Clear toast puts the list back only in the realm it was cleared in. After a realm switch
// its Undo restores nothing (the other realm's stored recents stay as they were) and says so; in the same realm it
// restores (page.add2.test.tsx holds that case).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { setRealm } from '@core/ctx';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { freshRealm, type RealmBoards, type TileRef } from './model/boards';
import { toStored } from './model/persist';
import { resetFixtureSessions, setListDown } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const S = strings as Record<string, string>;
const toasts: Array<{ title: string; action?: { label: string; onAction: () => void } }> = [];
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string }) => { toasts.push(c); return 'toast-1'; } }));

const OTHER_REALM = fixtureWorld.realms.map((r) => r.id).find((id) => id !== FIXTURE_REALM) as string;
const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const storedIn = async (realm: string) => (await storedForTests(BOARDS_KEY, realm)) as RealmBoards | null;
const rec = (session: number): TileRef => ({ project: atlas.project_id, computer: atlas.id, program: 'terminal', session });
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

describe('Board: Recent Clear, its Undo and the realm', () => {
  it('after a realm switch the Undo restores nothing in the other realm, and says so', async () => {
    await renderPage(page, { path: '/board' });
    await cryptIdleForTests();
    await store({ ...freshRealm(() => 0.5), recents: [rec(3), rec(2), rec(1)] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: new RegExp(S['empty.add']!) }));
    // Clear is the Recent card's header button (the card's section is named by its heading "Recent · n").
    await screen.findByRole('grid', { name: S['picker.recent'] });
    await user.click(within(screen.getByRole('region', { name: new RegExp('^' + S['picker.recent'] + ' · \\d+$') })).getByRole('button', { name: S['picker.recentClear'] }));
    await waitFor(async () => expect((await storedIn(FIXTURE_REALM))?.recents).toEqual([]));
    const toast = toasts.find((x) => x.title === S['recent.cleared']);
    expect(toast?.action?.label).toBe(S['undo.label']);
    const before = await storedIn(OTHER_REALM);
    await act(async () => { setRealm(OTHER_REALM); await cryptIdleForTests(); });
    await act(async () => { toast!.action!.onAction(); await cryptIdleForTests(); });
    expect(toasts.map((x) => x.title)).toContain(S['recent.notRestored']);
    // Nothing of the first realm's list reached the other realm's stored Boards, and the first realm's stays cleared.
    expect(await storedIn(OTHER_REALM)).toEqual(before);
    expect((await storedIn(OTHER_REALM))?.recents ?? []).toEqual([]);
    expect((await storedIn(FIXTURE_REALM))?.recents).toEqual([]);
  });
});
