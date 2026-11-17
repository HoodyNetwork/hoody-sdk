/* eslint-disable no-restricted-globals -- these tests play another browser tab whose store lands first (its sealed
   bytes put in place before this tab's write); the page reaches storage only through core */
// Vitest: Duplicate tile reads its free session number from the Boards its change is made on. Pressed
// while a locked commit's store waits, the change is replayed on the Boards another tab stored first: a number that
// tab took meanwhile is not given again, and one undo takes the copy back.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { boardFor, createBoard, freshRealm, isRefusal, type Board, type RealmBoards, type Refusal, type TileRef } from './model/boards';
import { parseRealmBoards, toStored } from './model/persist';
import { resetFixtureSessions, setListDown } from './fixtures';
import page from './page';

vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: () => 'toast-1' }));

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const NANO = { c: atlas.id, k: 'ow:nano' };
let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const stored = async () => parseRealmBoards(JSON.parse(JSON.stringify(await storedForTests(BOARDS_KEY, FIXTURE_REALM)))).state;
const sessionsOf = (b: Board | undefined) => Object.values(b?.tiles ?? {}).filter(Boolean).map((t) => (t as TileRef).session).sort((x, y) => x - y);
async function store(s: RealmBoards) {
  await act(async () => {
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}
function holdSeal() {
  const subtle = globalThis.crypto.subtle;
  const real = subtle.encrypt.bind(subtle);
  let open!: () => void;
  const gate = new Promise<void>((x) => { open = x; });
  const spy = vi.spyOn(subtle, 'encrypt').mockImplementation(async (...a: Parameters<SubtleCrypto['encrypt']>) => { await gate; return real(...a); });
  return { sealing: () => waitFor(() => expect(spy).toHaveBeenCalled()), release: () => { open(); spy.mockRestore(); } };
}

beforeEach(() => {
  resetFixtureSessions();
  setListDown(false);
  resetBoardsForTests();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});

describe('duplicate_replays_on_the_stored_boards', () => {
  it('Duplicate while a keyed landing waits: this tab shows terminal 1, the other tab took 1 first, so the copy is stored as 2; undo takes it back', async () => {
    const user = userEvent.setup();
    const r = await renderPage(page, { path: '/board' });
    await screen.findByRole('tab', { name: /Main/ });
    const two = must(createBoard(freshRealm(rand), rand, 'Board 2'));
    await store(two);
    await screen.findByRole('tab', { name: /Board 2/ });
    // The other tab's value: terminal 1 on atlas put on Board 2 (sealed as its store would leave it).
    const b2 = two.boards[1]!;
    const theirsValue: RealmBoards = { ...two, boards: [two.boards[0]!, { ...b2, tiles: { ...b2.tiles, [Object.keys(b2.tiles)[0]!]: { project: atlas.project_id, computer: atlas.id, program: 'terminal', session: 1 } } as Board['tiles'] }] };
    const before = localStorage.getItem(BOARDS_KEY) as string;
    await act(() => writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(theirsValue)));
    const theirs = localStorage.getItem(BOARDS_KEY) as string;
    localStorage.setItem(BOARDS_KEY, before);
    const held = holdSeal();
    try {
      await act(() => r.router.navigate({ href: `/board?add=terminal-8003&cid=${atlas.id}&for=ow%3Anano&label=Nano` } as never));
      await held.sealing();
      await screen.findByRole('tab', { name: /Nano · atlas/, selected: true });
      const g = (await screen.findByTitle('terminal-8003 on atlas')).closest('[role="group"]') as HTMLElement;
      await user.click(within(g).getByRole('button', { name: /Tile menu/ }));
      await user.click(await screen.findByRole('menuitem', { name: /^Duplicate/ }));
      // This tab has not seen the other tab's store: 1 is free here.
      expect(await screen.findByTitle('terminal-1 on atlas')).toBeInTheDocument();
      localStorage.setItem(BOARDS_KEY, theirs); // the other tab stored first
    } finally { held.release(); }
    await waitFor(async () => expect(sessionsOf(boardFor(await stored(), NANO))).toEqual([2, 8003]));
    for (let i = 0; i < 4; i++) await act(() => cryptIdleForTests());
    const s = await stored();
    expect(sessionsOf(boardFor(s, NANO))).toEqual([2, 8003]);
    expect(sessionsOf(s.boards.find((b) => b.name === 'Board 2'))).toEqual([1]);
    expect(await screen.findByTitle('terminal-2 on atlas')).toBeInTheDocument();
    // The Nano board stays shown, and its copy is 2: terminal 1 is the other tab's, on Board 2.
    expect(screen.queryAllByTitle('terminal-1 on atlas')).toHaveLength(0);
    // One undo step: the copy goes, the landing and the other tab's tile stay.
    act(() => screen.getByRole('group', { name: 'Board tiles' }).focus());
    await user.keyboard('u');
    await waitFor(async () => expect(sessionsOf(boardFor(await stored(), NANO))).toEqual([8003]));
    expect(sessionsOf((await stored()).boards.find((b) => b.name === 'Board 2'))).toEqual([1]);
  });
});
