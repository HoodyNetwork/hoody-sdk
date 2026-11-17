// Vitest: a conversation tile on the mounted Board. Focus anywhere in its native body enters the tile (the
// focus lock reads the tile's FrameHandle with contains, not ===); arrows pressed there never move tiles; Escape there
// leaves the tile to the Board surface; plain arrows on the Board surface still move tiles.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import { computerHandle, FIXTURE_REALM, fixtureWorld } from '@core';
import { cryptIdleForTests, storedForTests, writeSealedForTests } from '@core/cryptStore';
import { can, provideActiveConversations, type Action, type ActiveConversationProvider, type ActiveSource, type CapFacts, type ConvSnapshot } from '@kit';
import { BOARDS_KEY, resetBoardsForTests } from './data';
import { convTileUrl } from './links';
import { addTile, freshRealm, isRefusal, onActive, type Board, type RealmBoards, type Refusal, type Tile, type TileRef } from './model/boards';
import { toStored } from './model/persist';
import page from './page';
import { resetFixtureSessions } from './fixtures';

const atlas = fixtureWorld.computers.find((c) => c.name === 'atlas')!;
const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const snap: ConvSnapshot = { facts, title: 'Fix it', gates: [], meta: { computer: 'atlas', realm: 'Global', status: 'idle' }, blocks: [{ k: 'reply', key: 'r1', text: 'All done here', streaming: false, final: true, cost: null, at: null }] };
// An active source: the tile's composer and gate cards act on it; nothing here is answered (no send runs).
const sends: unknown[] = [];
const provider: ActiveConversationProvider = {
  open: (_a, ref) => ({
    source: {
      kind: 'session', ref, snapshot: () => snap, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, facts),
      send: (d: unknown) => { sends.push(d); return new Promise(() => {}); }, stop: () => new Promise(() => {}), decide: () => new Promise(() => {}),
      answer: () => new Promise(() => {}), check: () => new Promise(() => {}), dismissDecision: () => {}, canDismiss: () => false,
    } as unknown as ActiveSource,
    release: () => {},
  }),
};

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
  // The first render of a file is cold under a loaded host: wait longer than the 5 s default for the Board itself.
  await screen.findByRole('group', { name: 'Board tiles' }, { timeout: 12_000 });
  await act(async () => {
    await cryptIdleForTests();
    await writeSealedForTests(BOARDS_KEY, FIXTURE_REALM, toStored(s));
    // eslint-disable-next-line no-restricted-globals -- the storage event another tab's write raises names its area
    window.dispatchEvent(new StorageEvent('storage', { key: BOARDS_KEY, storageArea: localStorage }));
    await cryptIdleForTests();
  });
}
const area = () => screen.getByRole('group', { name: 'Board tiles' });
const tileGroup = (name: RegExp) => screen.getAllByRole('group').find((g) => name.test(g.getAttribute('aria-label') ?? ''))!;
const conv = (): Tile => ({ url: convTileUrl(window.location.origin, { computer: computerHandle(atlas), realm: 'global', sid: 's1' }), name: 'Fix it' });
// The layout's reading order: the tiles as drawn, and the stored Board's slots in
// layout order with the tile each holds, so a swap or a move shows even where no class or divider value changes.
const drawnOrder = () => [...area().querySelectorAll<HTMLElement>('[role="group"][aria-label]')].map((g) => g.getAttribute('aria-label'));
const storedOrder = async () => {
  const b = ((await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards | null)?.boards.find((x) => x.active) ?? ((await storedForTests(BOARDS_KEY, FIXTURE_REALM)) as RealmBoards | null)?.boards[0];
  return b ? JSON.stringify({ layout: b.layout, tiles: b.tiles }) : null;
};
/** Everything a tile move, swap, focus move or resize would change: each tile's class (the active one), the divider's value,
 *  the drawn order and the stored layout. */
const boardState = async () => [tileGroup(/files-1/).className, tileGroup(/Fix it/).className, screen.getByRole('separator').getAttribute('aria-valuenow'), drawnOrder(), await storedOrder()];
/** Each key alone, the Board's state checked after it (a key and its inverse in one batch could cancel out). */
async function eachKeyKeeps(user: ReturnType<typeof userEvent.setup>, keys: readonly string[], still: () => void) {
  const before = await boardState();
  expect(before[3]).toHaveLength(2);
  expect(before[4]).not.toBeNull();
  for (const k of keys) {
    await user.keyboard(k);
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(await boardState(), k).toEqual(before);
    still();
  }
}
const files: TileRef = { project: atlas.project_id, computer: atlas.id, program: 'files', session: 1, view: 'root' } as TileRef;

beforeEach(() => {
  resetFixtureSessions();
  resetBoardsForTests();
  sends.length = 0;
  provideActiveConversations(provider);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 1280);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 800);
});
afterEach(() => { provideActiveConversations(null); vi.restoreAllMocks(); });

describe('a conversation tile on the Board', () => {
  it('is drawn natively (no frame of the Hub); focus in its body enters it; arrows there never move tiles; Escape leaves', async () => {
    const user = userEvent.setup();
    await open(withTiles(conv(), files));
    await screen.findByText('All done here');
    await screen.findByTitle('files-1 on atlas');
    const group = tileGroup(/Fix it/);
    expect(group.querySelector('iframe')).toBeNull();
    const log = screen.getByRole('log');
    act(() => log.focus());
    await waitFor(() => expect(tileGroup(/Fix it/).getAttribute('data-hub-keys')).toBe('frame'));
    // Neither the active tile (its class), the divider (the Board's own arrow target), the drawn order nor the stored layout
    // moves, after any one key: plain arrows (focus moves on the surface), Shift+arrow and H/L (swaps), Alt+Shift+arrow (resize).
    await eachKeyKeeps(user, ['{ArrowRight}', '{ArrowLeft}', '{ArrowDown}', '{Shift>}{ArrowRight}{/Shift}', '{Shift>}{ArrowLeft}{/Shift}', 'L', 'H', '{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}', '{Alt>}{Shift>}{ArrowLeft}{/Shift}{/Alt}'],
      () => expect(document.activeElement).toBe(log));
    expect(tileGroup(/Fix it/).getAttribute('data-hub-keys')).toBe('frame');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(area()));
    expect(tileGroup(/Fix it/).getAttribute('data-hub-keys')).toBeNull();
  });

  it('typing in its composer: arrows never move tiles, Escape while typing never leaves; empty Escape goes to the transcript, then Escape leaves', async () => {
    const user = userEvent.setup();
    await open(withTiles(conv(), files));
    await screen.findByText('All done here');
    await screen.findByTitle('files-1 on atlas');
    const box = screen.getByRole('textbox', { name: /message/i });
    await user.click(box);
    await waitFor(() => expect(tileGroup(/Fix it/).getAttribute('data-hub-keys')).toBe('frame'));
    await user.keyboard('ab');
    // Each key alone (arrows, Shift+arrows: a swap on the surface, Alt+Shift+arrows: a resize) keeps the Board as it was.
    await eachKeyKeeps(user, ['{ArrowLeft}', '{ArrowRight}', '{ArrowUp}', '{ArrowDown}', '{Alt>}{Shift>}{ArrowRight}{/Shift}{/Alt}', '{Shift>}{ArrowRight}{/Shift}', '{Shift>}{ArrowLeft}{/Shift}'],
      () => expect(document.activeElement).toBe(box));
    // A selection (Shift+Left), then text: Escape stays in the composer, the tile keeps the keys.
    await user.keyboard('{Escape}{Escape}');
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(document.activeElement).toBe(box);
    expect(tileGroup(/Fix it/).getAttribute('data-hub-keys')).toBe('frame');
    expect(box).toHaveValue('ab');
    // Empty: Escape hands focus to the transcript; the next Escape leaves the tile. Nothing was sent.
    await user.clear(box);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('log')));
    expect(tileGroup(/Fix it/).getAttribute('data-hub-keys')).toBe('frame');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(area()));
    expect(sends).toEqual([]);
  });

  it('the same order helpers see a swap made from the Board surface (so the checks above can fail)', async () => {
    const user = userEvent.setup();
    await open(withTiles(conv(), files));
    await screen.findByText('All done here');
    await screen.findByTitle('files-1 on atlas');
    const order = drawnOrder();
    const kept = await storedOrder();
    act(() => area().focus());
    await user.keyboard('l');
    await user.keyboard('H');
    await waitFor(() => expect(drawnOrder()).toEqual([...order].reverse()));
    await waitFor(async () => expect(await storedOrder()).not.toBe(kept));
  });

  it('Ctrl+Alt+arrow from the Board surface enters the conversation tile', async () => {
    const user = userEvent.setup();
    await open(withTiles(conv(), files));
    await screen.findByText('All done here');
    act(() => area().focus());
    await user.keyboard('{Control>}{Alt>}{ArrowLeft}{/Alt}{/Control}');
    await waitFor(() => expect(tileGroup(/Fix it/).contains(document.activeElement)).toBe(true));
    expect(tileGroup(/Fix it/).getAttribute('data-hub-keys')).toBe('frame');
  });
});
