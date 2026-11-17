// Vitest, S-id: every tile on a Board carries a tile id. A new tile gets an id no
// tile of the realm has, nor one made earlier in the same operation; a moved tile keeps its id, because the whole tile
// object moves; a cleared or closed tile's id ends. Stored Boards without ids get deterministic ones at load (legacyTid),
// so a tab of an earlier release that writes them back without ids still leaves every tile one stable id.
// The conservation table checks each operation as a map from tile payload to tile id, before and after, not by counts.
import { describe, expect, it } from 'vitest';
import {
  addTile, allTids, applyPreset, boardSlots, closeSlot, deleteBoard, duplicateBoard, freshRealm, importBoard, isRefusal, keyedAddTile,
  moveSlot, onActive, recordStep, setTile, splitAt, swapSlots, toggleMax, undoStep, activeBoard, createBoard, TID,
  MAX_BOARDS, MAX_SLOTS, type Board, type RealmBoards, type Refusal, type Tile, type TileRef,
} from './boards';
import { VALUE_MAX } from '@core/cryptStore';
import { merge } from './merge';
import { legacyTid, parseRealmBoards, toStored } from './persist';
import { parseRealmBoards as oldParse, toStored as oldToStored } from './persist.v1-frozen';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
const zero = () => 0;
const NOW = 1_800_000_000_000;
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const term = (session: number, computer = 'c1'): TileRef => ({ project: 'p1', computer, program: 'terminal', session });
const web = (path: string): Tile => ({ url: 'https://docs.example/' + path });
const wire = (x: unknown): unknown => JSON.parse(JSON.stringify(x));
/** The tile without its id: what the tile is (its payload). */
const payload = (t: Tile): string => { const { tid: _tid, ...rest } = t; return JSON.stringify(rest); };
/** payload -> tid over a Board's filled slots. */
const ids = (b: Board): Map<string, string> => new Map(Object.values(b.tiles).filter((t): t is Tile => !!t).map((t) => [payload(t), t.tid as string]));
const tidsOf = (b: Board): string[] => Object.values(b.tiles).filter((t): t is Tile => !!t).map((t) => t.tid as string);
/** A Board holding `tiles` (added one by one). */
function boardWith(...tiles: Tile[]): Board {
  let b = freshRealm(rand).boards[0] as Board;
  for (const t of tiles) b = must(addTile(b, t, rand)).board;
  return b;
}
const realmOf = (...boards: Board[]): RealmBoards => ({ v: 1, active: (boards[0] as Board).id, boards, recents: [] });
const distinct = (xs: string[]): boolean => new Set(xs).size === xs.length;

describe('new tiles get an id no tile of the realm has', () => {
  it('addTile: a valid id, kept on the tile; a tile\'s own id is kept only while no tile has it', () => {
    const b = boardWith(term(1), term(2));
    expect(tidsOf(b).every((t) => TID.test(t))).toBe(true);
    expect(distinct(tidsOf(b))).toBe(true);
    const own = must(addTile(b, { ...term(3), tid: 'townid01' }, rand)).board;
    expect(ids(own).get(payload(term(3)))).toBe('townid01');
    const clash = must(addTile(b, { ...term(3), tid: tidsOf(b)[0] as string }, rand)).board;
    expect(ids(clash).get(payload(term(3)))).not.toBe(tidsOf(b)[0]);
    expect(distinct(tidsOf(clash))).toBe(true);
    const bad = must(addTile(b, { ...term(3), tid: 'NOT-AN-ID' }, rand)).board;
    expect(ids(bad).get(payload(term(3)))).toMatch(TID);
  });

  it('a source that keeps repeating, tiles added on two Boards: every id differs over the realm', () => {
    let s = realmOf(freshRealm(zero).boards[0] as Board);
    s = must(createBoard(s, zero));
    for (const board of s.boards.map((b) => b.id)) {
      s = { ...s, active: board };
      for (let i = 1; i <= 3; i++) s = must(onActive(s, (b, taken) => { const x = addTile(b, term(i, 'c' + board), zero, taken); return isRefusal(x) ? x : x.board; }));
    }
    const all = s.boards.flatMap(tidsOf);
    expect(all).toHaveLength(6);
    expect(distinct(all)).toBe(true);
  });

  it('ids made earlier in the same operation count (duplicate and import of a 6-tile Board, repeating source)', () => {
    let b = freshRealm(zero).boards[0] as Board;
    for (let i = 1; i <= 6; i++) b = must(addTile(b, term(i), zero)).board;
    const s = realmOf(b);
    const dup = must(duplicateBoard(s, b.id, zero));
    const imp = must(importBoard(dup, b, zero));
    const all = imp.boards.flatMap(tidsOf);
    expect(all).toHaveLength(18);
    expect(distinct(all)).toBe(true);
  });

  it('allTids is every id on every Board, and a new Set each call', () => {
    const a = boardWith(term(1)), b = boardWith(term(2));
    const s = realmOf(a, { ...b, id: 'bsecond1' });
    const t = allTids(s);
    expect([...t].sort()).toEqual([...tidsOf(a), ...tidsOf(b)].sort());
    t.add('tmutated1');
    expect(allTids(s).has('tmutated1')).toBe(false);
  });
});

describe('conservation table: each operation, payload -> id before and after', () => {
  const b = boardWith(term(1), term(2), web('a'));
  const slotsOf = boardSlots(b);
  const [x, y, z] = slotsOf as [string, string, string];

  it('swapSlots, moveSlot (centre and each edge), applyPreset, toggleMax: every tile keeps its id', () => {
    const ops: [string, Board][] = [
      ['swap', must(swapSlots(b, x, z))],
      ['move centre', must(moveSlot(b, x, y, 'centre'))],
      ...(['left', 'right', 'up', 'down'] as const).map((side): [string, Board] => ['move ' + side, must(moveSlot(b, x, z, side))]),
      ['preset', must(applyPreset(b, 'grid', rand))],
      ['max', must(toggleMax(b, y))],
    ];
    for (const [name, after] of ops) expect([name, ids(after)]).toEqual([name, ids(b)]);
    // the id is the tile's, not the slot's: after a swap the slot holds the other tile's id
    const swapped = must(swapSlots(b, x, z));
    expect(swapped.tiles[x]?.tid).toBe(b.tiles[z]?.tid);
  });

  it('setTile: a replace gets a new id (never the old one, never one in the realm); a clear ends it; keepTid keeps the slot\'s id', () => {
    const s = realmOf(b, { ...boardWith(term(9)), id: 'bother01' });
    const replaced = must(onActive(s, (bb, taken) => setTile(bb, x, term(5), rand, { taken })));
    const nt = activeBoard(replaced).tiles[x]?.tid as string;
    expect(nt).toMatch(TID);
    expect(allTids(s).has(nt)).toBe(false);
    const cleared = must(setTile(b, x, null));
    expect(cleared.tiles[x]).toBeNull();
    expect(new Set(tidsOf(cleared))).toEqual(new Set(tidsOf(b).filter((t) => t !== b.tiles[x]?.tid)));
    const changed = must(setTile(b, x, { ...term(1), view: 'session' }, rand, { keepTid: true }));
    expect(changed.tiles[x]).toEqual({ ...term(1), view: 'session', tid: b.tiles[x]?.tid });
    // the same tile object passed back without keepTid is still a new tile
    const again = must(setTile(b, z, b.tiles[z] as Tile, rand));
    expect(again.tiles[z]?.tid).not.toBe(b.tiles[z]?.tid);
  });

  it('split + copy: the copy is a new tile with its own id; the original keeps its own', () => {
    const r = must(splitAt(b, z, 'right', rand));
    const after = must(setTile(r.board, r.slot, b.tiles[z] as Tile, rand));
    expect(after.tiles[z]?.tid).toBe(b.tiles[z]?.tid);
    expect(after.tiles[r.slot]?.tid).not.toBe(b.tiles[z]?.tid);
    expect(distinct(tidsOf(after))).toBe(true);
  });

  it('closeSlot ends that tile\'s id; the others keep theirs', () => {
    const after = must(closeSlot(b, y));
    const before = ids(b);
    before.delete(payload(b.tiles[y] as Tile));
    expect(ids(after)).toEqual(before);
  });

  it('duplicateBoard and importBoard: the same payloads, every id new', () => {
    const s = realmOf(b);
    const dup = must(duplicateBoard(s, b.id, rand));
    const copy = dup.boards[1] as Board;
    expect([...ids(copy).keys()].sort()).toEqual([...ids(b).keys()].sort());
    expect(tidsOf(copy).some((t) => tidsOf(b).includes(t))).toBe(false);
    const imp = must(importBoard(s, b, rand));
    const got = imp.boards[1] as Board;
    expect(tidsOf(got).some((t) => tidsOf(b).includes(t))).toBe(false);
  });

  it('keyedAddTile on an existing and on a new program board: an id no Board of the realm has', () => {
    const nano = { for: { c: 'c1', k: 'ow:nano' }, name: 'Nano · atlas' };
    const s = realmOf(b);
    const a = must(keyedAddTile(s, nano, term(8003), rand));
    const t1 = (a.state.boards.find((x) => x.id === a.board) as Board).tiles[a.slot]?.tid as string;
    expect(allTids(s).has(t1)).toBe(false);
    const c = must(keyedAddTile(a.state, nano, term(8004), rand));
    const t2 = (c.state.boards.find((x) => x.id === c.board) as Board).tiles[c.slot]?.tid as string;
    expect(allTids(a.state).has(t2)).toBe(false);
  });

  it('undoStep puts the Board back with the ids it had; deleteBoard leaves the others\' ids', () => {
    const other: Board = { ...boardWith(term(7)), id: 'bother02' };
    const s = realmOf(b, other);
    const next = must(onActive(s, (bb, taken) => setTile(bb, x, term(6), rand, { taken })));
    const undone = undoStep(next, recordStep({}, b, 'change'));
    expect(undone && ids(activeBoard(undone.state))).toEqual(ids(b));
    const del = must(deleteBoard(s, b.id, rand));
    expect(ids(del.boards[0] as Board)).toEqual(ids(other));
  });
});

describe('an id the caller holds (one undo can put back), or an import file carries, is never given to a new tile (repeating source)', () => {
  /** Two Boards, A holding one terminal, made with a source that keeps repeating: every free id is the same first one. */
  function twoBoards(): { s: RealmBoards; a: Board; first: string } {
    let s = realmOf(freshRealm(zero).boards[0] as Board);
    s = must(onActive(s, (b, taken) => { const x = addTile(b, term(1), zero, taken); return isRefusal(x) ? x : x.board; }));
    s = must(createBoard(s, zero));
    const a = s.boards[0] as Board;
    return { s: { ...s, active: a.id }, a, first: tidsOf(a)[0] as string };
  }
  const realmIds = (s: RealmBoards): string[] => s.boards.flatMap(tidsOf);
  const onB = (s: RealmBoards): RealmBoards => ({ ...s, active: (s.boards[1] as Board).id });
  /** What data.ts holds: every id seen, the recorded Board's among them. */
  const heldBy = (b: Board): Set<string> => new Set(tidsOf(b));
  const addOnB = (s: RealmBoards, held: Set<string>): RealmBoards =>
    must(onActive(onB(s), (b, taken) => { const x = addTile(b, term(2, 'c2'), zero, taken); return isRefusal(x) ? x : x.board; }, held));

  for (const [what, edit] of [
    ['clear', (b: Board, taken: Set<string>) => setTile(b, b.active, null, zero, { taken })],
    ['replace', (b: Board, taken: Set<string>) => setTile(b, b.active, web('x'), zero, { taken })],
    ['close', (b: Board) => closeSlot(b, b.active)],
  ] as const) {
    it(`${what} on Board A, a tile added on Board B, then undo on A: every id of the realm differs`, () => {
      const { s, a, first } = twoBoards();
      const u = recordStep({}, a, what);
      const edited = must(onActive(s, edit));
      expect(realmIds(edited)).not.toContain(first);
      const added = addOnB(edited, heldBy(a));
      expect(tidsOf(added.boards[1] as Board)).not.toContain(first);
      const undone = undoStep({ ...added, active: a.id }, u);
      expect(undone && ids(activeBoard(undone.state))).toEqual(ids(a));
      expect(undone && distinct(realmIds(undone.state))).toBe(true);
    });
  }

  it('duplicateBoard and keyedAddTile keep off the held ids', () => {
    const { s, a, first } = twoBoards();
    const cleared = must(onActive(s, (b, taken) => setTile(b, b.active, null, zero, { taken })));
    const withTerm = addOnB(cleared, heldBy(a));
    const dup = must(duplicateBoard(withTerm, (withTerm.boards[1] as Board).id, zero, '', heldBy(a)));
    expect(realmIds(dup)).not.toContain(first);
    const k = must(keyedAddTile(cleared, { for: { c: 'c1', k: 'ow:nano' }, name: 'Nano' }, term(8001), zero, heldBy(a)));
    expect(realmIds(k.state)).not.toContain(first);
  });

  it('importBoard: a file Board absent from the realm, its tile id is never given again (empty realm too)', () => {
    const file: Board = { ...boardWith(term(3)), id: 'bfile001', tiles: {} };
    const slot = boardSlots(file)[0] as string;
    const own = { ...file, tiles: { [slot]: { ...term(3), tid: 'taaaaaaaa' } } };
    for (const s of [realmOf({ ...(freshRealm(zero).boards[0] as Board), id: 'bempty01' }), twoBoards().s]) {
      const r = must(importBoard(s, own, zero));
      const got = tidsOf(r.boards[r.boards.length - 1] as Board);
      expect(got).toHaveLength(1);
      expect(got).not.toContain('taaaaaaaa');
      expect(distinct(realmIds(r))).toBe(true);
    }
    const { s, a, first } = twoBoards();
    const cleared = must(onActive(s, (b, taken) => setTile(b, b.active, null, zero, { taken })));
    const r = must(importBoard(cleared, { ...own, tiles: { [slot]: term(3) } }, zero, heldBy(a)));
    expect(realmIds(r)).not.toContain(first);
  });
});

describe('storage budget: what tile ids add to a full realm', () => {
  it('nine full Boards: ids add at most one `,"tid":"t…"` of 8 characters per tile, and the value stays under VALUE_MAX', () => {
    let s = realmOf(freshRealm(rand).boards[0] as Board);
    while (s.boards.length < MAX_BOARDS) s = must(createBoard(s, rand));
    for (const id of s.boards.map((b) => b.id)) {
      s = { ...s, active: id };
      for (let i = 1; i <= MAX_SLOTS; i++) s = must(onActive(s, (b, taken) => { const x = addTile(b, term(i, 'c' + id), rand, taken); return isRefusal(x) ? x : x.board; }));
    }
    const tiles = s.boards.flatMap(tidsOf);
    expect(tiles).toHaveLength(MAX_BOARDS * MAX_SLOTS);
    const bare: RealmBoards = { ...s, boards: s.boards.map((b) => ({ ...b, tiles: Object.fromEntries(Object.entries(b.tiles).map(([k, t]) => [k, t ? JSON.parse(payload(t)) as Tile : null])) })) };
    const withIds = JSON.stringify(toStored(s)).length, without = JSON.stringify(toStored(bare)).length;
    expect(withIds - without).toBeLessThanOrEqual(tiles.length * ',"tid":"taaaaaaaa"'.length);
    expect(withIds).toBeLessThan(VALUE_MAX);
  });
});

describe('stored Boards: ids read, derived and written', () => {
  const stored = (tiles: Record<string, unknown>, id = 'bstored1', extra: Record<string, unknown> = {}) => ({
    v: 1, active: id, recents: [],
    boards: [{ id, name: '', layout: { dir: 'row', ratio: 0.5, a: { slot: 'saaa1' }, b: { dir: 'col', ratio: 0.5, a: { slot: 'sbbb2' }, b: { slot: 'sccc3' } } }, tiles, active: 'saaa1', max: null, ...extra }],
  });
  const raw = (t: TileRef, tid?: unknown) => ({ ...t, ...(tid === undefined ? {} : { tid }) });
  const loaded = (v: unknown): Board => parseRealmBoards(v, rand, NOW).state.boards[0] as Board;

  it('a Board without ids: each tile gets its legacy id, the same on every load, distinct per Board and slot', () => {
    const v = stored({ saaa1: raw(term(1)), sbbb2: raw(term(2)), sccc3: raw(term(3)) });
    const a = loaded(v), b = loaded(v);
    expect(a.tiles).toEqual(b.tiles);
    expect(a.tiles.saaa1?.tid).toBe(legacyTid('bstored1', 'saaa1'));
    expect(distinct(tidsOf(a))).toBe(true);
    expect(tidsOf(a).every((t) => TID.test(t))).toBe(true);
    const other = loaded(stored({ saaa1: raw(term(1)) }, 'bstored2'));
    expect(other.tiles.saaa1?.tid).not.toBe(a.tiles.saaa1?.tid);
    expect(legacyTid('bstored1', 'saaa1')).not.toBe(legacyTid('saaa1', 'bstored1'));
  });

  it('a valid stored id is kept; an invalid one is derived again; a repeated one stays on the first slot only', () => {
    const b = loaded(stored({ saaa1: raw(term(1), 'tkeep001'), sbbb2: raw(term(2), 'BAD id'), sccc3: raw(term(3), 'tkeep001') }));
    expect(b.tiles.saaa1?.tid).toBe('tkeep001');
    expect(b.tiles.sbbb2?.tid).toBe(legacyTid('bstored1', 'sbbb2', new Set(['tkeep001'])));
    expect(b.tiles.sccc3?.tid).not.toBe('tkeep001');
    expect(distinct(tidsOf(b))).toBe(true);
    for (const bad of [7, '', 't12', 't' + 'a'.repeat(25), 'xabcdef']) expect(loaded(stored({ saaa1: raw(term(1), bad) })).tiles.saaa1?.tid).toBe(legacyTid('bstored1', 'saaa1'));
  });

  it('a Bot tile is a tile like the others: a stored id kept, a missing one derived, written back last', () => {
    const botRaw = (tid?: string) => ({ project: 'p1', computer: 'c1', realm: 'global', bot: 'chief', ...(tid ? { tid } : {}) });
    const kept = loaded(stored({ saaa1: botRaw('tbotkeep1'), sbbb2: raw(term(2)) }));
    expect(kept.tiles.saaa1).toEqual({ project: 'p1', computer: 'c1', realm: 'global', bot: 'chief', tid: 'tbotkeep1' });
    const derived = loaded(stored({ saaa1: botRaw() }));
    expect(derived.tiles.saaa1?.tid).toBe(legacyTid('bstored1', 'saaa1'));
    expect(Object.keys(derived.tiles.saaa1 as object).at(-1)).toBe('tid');
    const back = parseRealmBoards(wire(toStored(parseRealmBoards(stored({ saaa1: botRaw('tbotkeep1') }), rand, NOW).state)), rand, NOW).state.boards[0] as Board;
    expect(back.tiles.saaa1?.tid).toBe('tbotkeep1');
  });

  it('a legacy id never takes a valid id a later slot of the same Board has', () => {
    const later = legacyTid('bstored1', 'saaa1');
    const b = loaded(stored({ saaa1: raw(term(1)), sbbb2: raw(term(2), later) }));
    expect(b.tiles.sbbb2?.tid).toBe(later);
    expect(b.tiles.saaa1?.tid).not.toBe(later);
  });

  it('round trip: read(write(x)) keeps every id and the Board stamp; a bad stamp is dropped; recents never keep an id', () => {
    const s = parseRealmBoards({ ...stored({ saaa1: raw(term(1), 'tkeep001'), sbbb2: raw(term(2)) }, 'bstored1', { at: 1234 }), recents: [raw(term(4), 'trecent1')] }, rand, NOW).state;
    expect((s.boards[0] as Board).at).toBe(1234);
    expect(s.recents[0]).toEqual(term(4));
    const back = parseRealmBoards(wire(toStored(s)), rand, NOW).state;
    expect(back).toEqual(s);
    // Written tiles name the computer under `computer`, as the in-memory tile does.
    expect(toStored({ ...s, recents: [{ ...term(4), tid: 'trecent1' }] }).recents[0]).toEqual({ project: 'p1', computer: 'c1', program: 'terminal', session: 4 });
    for (const at of [-1, 1.5, '12', null, Number.MAX_SAFE_INTEGER + 2]) expect(loaded(stored({}, 'bstored1', { at }))).not.toHaveProperty('at');
  });

  it('a tab of an earlier release reads a new value, keeps every tile and writes it back without ids; the new reader derives them again', () => {
    const s = parseRealmBoards(stored({ saaa1: raw(term(1), 'tkeep001'), sbbb2: raw(term(2)) }), rand, NOW).state;
    const written = wire(toStored(s));
    // The frozen parser is the Hub from before the rename: it knows only `container`, so the written tiles are shown to it
    // under that name (a pre-rename Hub tab drops a `computer` tile; persist.rename.test.ts keeps that one-way rule).
    const old = oldParse(JSON.parse(JSON.stringify(written).replace(/"computer":/g, '"container":')), rand, NOW);
    expect(old.notice).toBeNull();
    const rewritten = wire(oldToStored(old.state)) as { boards: { tiles: Record<string, { tid?: string } | null> }[] };
    expect(Object.values(rewritten.boards[0]?.tiles ?? {}).some((t) => t && 'tid' in t)).toBe(false);
    const back = loaded(rewritten);
    expect(back.tiles.saaa1?.tid).toBe(legacyTid('bstored1', 'saaa1'));
    expect(back.tiles.sbbb2?.tid).toBe(legacyTid('bstored1', 'sbbb2'));
    expect(ids(back).size).toBe(2);
  });

  it('one tile, one key order: an Options save (keepTid) stored and read back is no change in the two-tab merge', () => {
    // The merge compares Boards as JSON text: a tile whose id sat elsewhere in memory than in storage read as another tab's change.
    const base = parseRealmBoards(stored({ saaa1: raw({ ...term(1), view: 'session' }) }), rand, NOW).state;
    const b0 = base.boards[0] as Board;
    const t0 = b0.tiles.saaa1 as TileRef;
    const { view: _v, params: _p, ...ref } = t0;
    const mine = { ...base, boards: [must(setTile(b0, 'saaa1', { ...ref, view: 'session', params: { fontSize: 18 } }, rand, { keepTid: true }))] };
    const saved = parseRealmBoards(wire(toStored(mine)), rand, NOW).state;
    const m = merge(saved, mine, saved);
    expect(m.changed).toEqual([]);
    expect(JSON.stringify(mine)).toBe(JSON.stringify(saved));
    expect(Object.keys((mine.boards[0] as Board).tiles.saaa1 as TileRef).at(-1)).toBe('tid');
  });
});
