// Vitest: program boards. One board per program per computer, found
// by its stored key {c, k} (never by its name): the first keyed add creates it, later ones add a tile to it or focus the
// tile already at that place. Duplicate board and Import drop the key, so a copy is never the program's board. A
// duplicated tile never lands in the launch band (8001-9999).
import { describe, expect, it } from 'vitest';
import {
  boardFor, boardSlots, createBoard, duplicateBoard, freshRealm, importBoard, isRefusal, keyedAddTile, MAX_BOARDS, MAX_SLOTS, nextSession, renameBoard, reorderBoard,
  type Board, type RealmBoards, type Refusal, type TileRef,
} from './boards';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const term = (session: number, computer = 'c1'): TileRef => ({ project: 'p1', computer, program: 'terminal', session });
const NANO = { for: { c: 'c1', k: 'ow:nano' }, name: 'Nano · atlas' };
const realmWith = (boards: number): RealmBoards => { let s = freshRealm(rand); while (s.boards.length < boards) s = must(createBoard(s, rand)); return s; };
// Tiles as compared here: without their tile ids (S-id; the id rules are boards.tid.test.ts).
const tilesOf = (b: Board | undefined) => Object.values(b?.tiles ?? {}).filter(Boolean).map((t) => { const { tid: _tid, ...rest } = t as TileRef; return rest; });

describe('keyed_add_creates_then_reuses_program_board', () => {
  it('the first keyed add creates "Nano · atlas" with the key; the second adds a tile to it; a rename keeps it found', () => {
    const s0 = realmWith(2);
    const a = must(keyedAddTile(s0, NANO, term(8003), rand));
    expect(a.state.boards).toHaveLength(3);
    const made = boardFor(a.state, NANO.for);
    expect(made).toMatchObject({ name: 'Nano · atlas', for: { c: 'c1', k: 'ow:nano' } });
    expect(a.state.active).toBe(made!.id);
    expect(made!.tiles[a.slot]).toEqual({ ...term(8003), tid: expect.stringMatching(/^t[a-z0-9]{4,24}$/) });
    const renamed = must(renameBoard(reorderBoard(a.state, 2, 0), made!.id, 'My editors'));
    const b = must(keyedAddTile(renamed, NANO, term(8004), rand));
    expect(b.state.boards).toHaveLength(3);
    expect(b.board).toBe(made!.id);
    expect(tilesOf(boardFor(b.state, NANO.for))).toEqual([term(8003), term(8004)]);
  });
  it('another key, or the same key on another computer, gets its own board', () => {
    const a = must(keyedAddTile(freshRealm(rand), NANO, term(8003), rand)).state;
    const b = must(keyedAddTile(a, { for: { c: 'c1', k: 'ow:run' }, name: 'Run · atlas' }, term(8005), rand)).state;
    const c = must(keyedAddTile(b, { for: { c: 'c2', k: 'ow:nano' }, name: 'Nano · cedar' }, term(8003, 'c2'), rand)).state;
    expect(c.boards.map((x) => x.name)).toEqual(['', 'Nano · atlas', 'Run · atlas', 'Nano · cedar']);
  });
  it('a long name is cut to 32 characters', () => {
    const s = must(keyedAddTile(freshRealm(rand), { for: { c: 'c1', k: 'app:x' }, name: 'A very long program name here · atlas-computer' }, term(8003), rand)).state;
    expect([...boardFor(s, { c: 'c1', k: 'app:x' })!.name].length).toBeLessThanOrEqual(32);
  });
});

describe('keyed add with last', () => {
  it('asks of its target Board, and goes last when it says so', () => {
    const a = must(keyedAddTile(freshRealm(rand), NANO, term(8001), rand));
    const b = must(keyedAddTile(a.state, NANO, term(8002), rand));
    const first = boardFor(b.state, NANO.for)!;
    const order = boardSlots(first);
    const at = { ...b.state, boards: b.state.boards.map((x) => (x.id === first.id ? { ...x, active: order[0] as string } : x)) };
    const asked: string[] = [];
    const c = must(keyedAddTile(at, NANO, term(8003), rand, [], (x) => { asked.push(x.id); return true; }));
    expect(asked).toEqual([first.id]);
    expect(boardSlots(boardFor(c.state, NANO.for)!)).toEqual([...order, c.slot]);
  });
});

describe('keyed_add_focuses_tile_already_at_place', () => {
  it('Show twice: one tile, which becomes the active tile of the active board', () => {
    const a = must(keyedAddTile(freshRealm(rand), NANO, term(8003), rand));
    const more = must(keyedAddTile(a.state, NANO, term(8004), rand));
    const again = must(keyedAddTile(more.state, NANO, term(8003), rand));
    const b = boardFor(again.state, NANO.for)!;
    expect(tilesOf(b)).toHaveLength(2);
    expect(again.slot).toBe(a.slot);
    expect(b.active).toBe(a.slot);
    expect(again.state.active).toBe(b.id);
  });
});

describe('keyed adds that cannot land change nothing', () => {
  it('keyed_add_boards_full_adds_nothing: 9 boards and no program board yet', () => {
    const s = realmWith(MAX_BOARDS);
    expect(keyedAddTile(s, NANO, term(8003), rand)).toEqual({ refused: 'BOARDS_FULL' });
  });
  it('9 boards, one of them the program board: the tile still goes on it', () => {
    const s = must(keyedAddTile(realmWith(MAX_BOARDS - 1), NANO, term(8003), rand)).state;
    expect(must(keyedAddTile(s, NANO, term(8004), rand)).state.boards).toHaveLength(MAX_BOARDS);
  });
  it('keyed_add_board_full_adds_nothing: the program board holds 8 tiles', () => {
    let s = freshRealm(rand);
    for (let i = 0; i < MAX_SLOTS; i++) s = must(keyedAddTile(s, NANO, term(8001 + i), rand)).state;
    expect(keyedAddTile(s, NANO, term(8100), rand)).toEqual({ refused: 'BOARD_FULL' });
    // A tile already there is still focused on a full board.
    expect(isRefusal(keyedAddTile(s, NANO, term(8002), rand))).toBe(false);
  });
});

describe('duplicate_and_import_drop_for', () => {
  it('Duplicate board copies the tiles, never the key; Import drops it too', () => {
    const s = must(keyedAddTile(freshRealm(rand), NANO, term(8003), rand)).state;
    const id = boardFor(s, NANO.for)!.id;
    const dup = must(duplicateBoard(s, id, rand, 'Copy'));
    expect(dup.boards.filter((b) => b.for)).toHaveLength(1);
    expect(dup.boards.find((b) => b.name === 'Copy')).not.toHaveProperty('for');
    const imported = must(importBoard(freshRealm(rand), boardFor(s, NANO.for)!, rand));
    expect(imported.boards.some((b) => b.for)).toBe(false);
  });
});

describe('duplicate_never_lands_in_band', () => {
  it('a duplicate of a terminal beside a launch tile gets a Board number, never 8001-9999', () => {
    const s = must(keyedAddTile(freshRealm(rand), NANO, term(8003), rand)).state;
    expect(nextSession(s, 'c1', 'terminal')).toBe(1);
    const t2 = must(keyedAddTile(s, { for: { c: 'c1', k: 'k2' }, name: 'x' }, term(4), rand)).state;
    // The lowest free number, not one past the highest: with only 4 taken, 1.
    expect(nextSession(t2, 'c1', 'terminal')).toBe(1);
    const top = must(keyedAddTile(t2, { for: { c: 'c1', k: 'k3' }, name: 'y' }, term(8000), rand)).state;
    // 8000 is taken now, and 1-3 and 5-7999 are free: the lowest free number, never 8000 again.
    expect(nextSession(top, 'c1', 'terminal')).toBe(1);
    const disp = must(keyedAddTile(freshRealm(rand), NANO, { project: 'p1', computer: 'c1', program: 'display', session: 8003 }, rand)).state;
    expect(nextSession(disp, 'c1', 'display')).toBe(1);
  });
});

describe('duplicate_takes_the_lowest_free_number', () => {
  // A realm whose first Board holds these terminal sessions on c1 (tiles keyed by slot; nextSession reads every tile).
  const withSessions = (sessions: readonly number[], program: TileRef['program'] = 'terminal'): RealmBoards => {
    const s = freshRealm(rand);
    const b = s.boards[0]!;
    const tiles = Object.fromEntries(sessions.map((n, i) => [`s${i}`, { project: 'p1', computer: 'c1', program, session: n }]));
    return { ...s, boards: [{ ...b, tiles: tiles as Board['tiles'] }] };
  };
  it('8000 taken alone: 1, never 8000 again', () => {
    expect(nextSession(withSessions([8000]), 'c1', 'terminal')).toBe(1);
    expect(nextSession(withSessions([8000], 'display'), 'c1', 'display')).toBe(1);
  });
  it('a gap is filled first: 1, 2 and 4 taken give 3', () => {
    expect(nextSession(withSessions([1, 2, 4, 8000]), 'c1', 'terminal')).toBe(3);
  });
  it('another computer or program does not count', () => {
    expect(nextSession(withSessions([1, 2]), 'c2', 'terminal')).toBe(1);
    expect(nextSession(withSessions([1, 2]), 'c1', 'display')).toBe(1);
  });
  it('every Board number taken (1-8000): a refusal, never an occupied number; the launch band does not free one', () => {
    const all = Array.from({ length: 8000 }, (_, i) => i + 1);
    const r = nextSession(withSessions(all), 'c1', 'terminal');
    expect(isRefusal(r as never)).toBe(true);
    expect(r).toEqual({ refused: 'SESSIONS_FULL' });
    expect(isRefusal(nextSession(withSessions([...all, 8003]), 'c1', 'terminal') as never)).toBe(true);
    expect(nextSession(withSessions(all.slice(0, 7999)), 'c1', 'terminal')).toBe(8000);
  });
  it('a program outside the band (files) runs to 65535: 1-65534 taken give 65535, all taken refuse', () => {
    const all = Array.from({ length: 65535 }, (_, i) => i + 1);
    // 8000 is no bound here: 1-8000 taken give 8001.
    expect(nextSession(withSessions(all.slice(0, 8000), 'files'), 'c1', 'files')).toBe(8001);
    expect(nextSession(withSessions(all.slice(0, 65534), 'files'), 'c1', 'files')).toBe(65535);
    expect(nextSession(withSessions(all, 'files'), 'c1', 'files')).toEqual({ refused: 'SESSIONS_FULL' });
    // The same numbers on another program leave files free.
    expect(nextSession(withSessions(all, 'files'), 'c1', 'agent')).toBe(1);
  });
});
