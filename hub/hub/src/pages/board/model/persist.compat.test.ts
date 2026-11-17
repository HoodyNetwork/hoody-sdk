// Vitest: storage compatibility: a conversation tile IS a web tile whose address is
// the conversation's own canonical Hub link. A tab of an earlier release still open keeps it (persist.v1-frozen.ts, a frozen copy of
// persist.ts from before the conversation-link change, plays that tab), and the new reader finds the conversation in its address
// (tileConv). One tile has one value everywhere, so a link pasted through the picker and a tile convTile made are the
// same tile, in memory, in storage and in a two-tab merge.
import { describe, expect, it } from 'vitest';
import { convTile, convTileUrl, hubOrigin, parseConvTileUrl, tileConv } from '../links';
import { addTile, freshRealm, isRefusal, setTile, type Board, type ConvRef, type RealmBoards, type Refusal, type Tile } from './boards';
import { merge } from './merge';
import { parseRealmBoards, toStored } from './persist';
import { parseRealmBoards as oldParse, toStored as oldToStored } from './persist.v1-frozen';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
const NOW = 1_800_000_000_000;
const ORIGIN = 'https://hoody.example';
const ref: ConvRef = { computer: 'atlas.4f2a', realm: '0123456789abcdef01234567', sid: 's_7Hq2.k:9' };
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
/** A realm with one Board holding `tile` in its first slot. */
function realmWith(tile: Tile): RealmBoards {
  const s = freshRealm(rand);
  const { board } = must(addTile(s.boards[0]!, tile, rand));
  return { ...s, boards: [board] };
}
const firstTile = (s: RealmBoards): Tile | null => { const b = s.boards[0]!; return b.tiles[b.active] ?? null; };
// The frozen parser (persist.v1-frozen.ts) keeps the earlier storage shape: its tiles name the computer `container`. Read back from it at
// the call site.
const v1Out = <T>(x: unknown): T => JSON.parse(JSON.stringify(x).replace(/"container":/g, '"computer":')) as T;
/** A tile as compared here: without its tile id (S-id gives every tile on a Board one; its rules are boards.tid.test.ts). */
const noTid = (t: unknown): unknown => { if (!t || typeof t !== 'object') return t; const { tid: _tid, ...rest } = t as { tid?: string }; return rest; };
/** A stored value without its tiles' ids: what a tab of an earlier release (persist.v1-frozen.ts) writes back. */
const dropTids = (x: unknown): unknown => { const v = x as { boards: { tiles: Record<string, unknown> }[] }; return { ...v, boards: v.boards.map((b) => ({ ...b, tiles: Object.fromEntries(Object.entries(b.tiles).map(([k, t]) => [k, t ? noTid(t) : t])) })) }; };
/** What a tab writes to storage and the next tab reads: JSON text. */
const wire = (x: unknown): unknown => JSON.parse(JSON.stringify(x));
const save = (s: RealmBoards): unknown => wire(toStored(s));

describe('conv_tile_link_is_the_canonical_hub_link', () => {
  it('the address is the Hub page with the conversation route, computer by handle and realm', () => {
    expect(convTileUrl(ORIGIN, ref)).toBe(`${ORIGIN}/auth/home#/ai/c/s_7Hq2.k%3A9?computer=atlas.4f2a&realm=0123456789abcdef01234567`);
    expect(parseConvTileUrl(convTileUrl(ORIGIN, ref), ORIGIN)).toEqual(ref);
  });
  it('a handle with URL characters or a supplementary character, and the Global realm, round-trip', () => {
    for (const g of [
      { computer: 'my-box&co=1+é.ab12', realm: 'global', sid: 'abc' },
      { computer: 'box\u{1F680}.ab12', realm: 'global', sid: 'abc' },
    ]) expect(parseConvTileUrl(convTileUrl(ORIGIN, g), ORIGIN), g.computer).toEqual(g);
  });
  it('a reference the Board would not keep has no link', () => {
    for (const bad of [
      { ...ref, computer: '' }, { ...ref, computer: 'a/b' }, { ...ref, computer: 'a b' }, { ...ref, computer: 'x'.repeat(81) },
      { ...ref, computer: 'box\uD800.ab12' }, { ...ref, computer: 'box\uDC00.ab12' }, { ...ref, computer: 'box.ab12\uD83D' },
      { ...ref, realm: 'GLOBAL' }, { ...ref, realm: '0123456789ABCDEF01234567' }, { ...ref, realm: '0123' },
      { ...ref, sid: '' }, { ...ref, sid: '../x' }, { ...ref, sid: 'a/b' }, { ...ref, sid: 'x'.repeat(129) },
    ]) expect(convTileUrl(ORIGIN, bad), JSON.stringify(bad)).toBe('');
    expect(convTileUrl('', ref)).toBe('');
    expect(convTileUrl('null', ref)).toBe('');
    // An origin is exactly an origin: no path, no trailing slash, as URL writes it.
    for (const o of [ORIGIN + '/', ORIGIN + '/x', 'https://Hoody.Example', 'ftp://hoody.example']) expect(convTileUrl(o, ref), o).toBe('');
    expect(convTile('', ref)).toBeNull();
  });
  it('only the exact canonical link on this Hub names a conversation; every other address is just a web tile', () => {
    const u = convTileUrl(ORIGIN, ref);
    for (const other of [
      u.replace(ORIGIN, 'https://elsewhere.example'),
      u.replace('https://', 'http://'),
      u.replace('/auth/home#', '/#'),
      u.replace('/auth/home#', '/auth/home?hub=v3#'),
      u + '&panel=activity',
      u.replace('?computer=atlas.4f2a&realm=0123456789abcdef01234567', '?realm=0123456789abcdef01234567&computer=atlas.4f2a'),
      u.replace('#/ai/c/', '#/ai/f/'),
      u.replace('#/ai/c/s_7Hq2.k%3A9', '#/ai/c/s_7Hq2.k%3A9/x'),
      u.replace('#/ai/c/s_7Hq2.k%3A9', '#/ai/c/s_7Hq2.k:9'),
      u.replace('realm=0123456789abcdef01234567', 'realm=nope'),
      u.replace('computer=atlas.4f2a&', ''),
      u + '#more',
    ]) {
      expect(parseConvTileUrl(other, ORIGIN), other).toBeNull();
      expect(tileConv({ url: other }, ORIGIN), other).toBeNull();
    }
    expect(parseConvTileUrl(u, '')).toBeNull();
  });
  it('tileConv reads only web tiles', () => {
    expect(tileConv({ url: convTileUrl(ORIGIN, ref), name: 'Orders fix' }, ORIGIN)).toEqual(ref);
    expect(tileConv({ project: 'p1', computer: 'c1', program: 'agent', session: 1 }, ORIGIN)).toBeNull();
    expect(tileConv({ project: 'p1', computer: 'c1', protocol: 'http', port: 8080 }, ORIGIN)).toBeNull();
    expect(tileConv(null, ORIGIN)).toBeNull();
  });
});

describe('conv_tile_persist_round_trip', () => {
  it('stored as a plain web tile {url, name}; read back identical; the conversation is in its address', () => {
    const tile = convTile(ORIGIN, ref, 'Orders fix')!;
    expect(tile).toEqual({ url: convTileUrl(ORIGIN, ref), name: 'Orders fix' });
    const stored = save(realmWith(tile)) as { boards: { tiles: Record<string, unknown>; active: string }[] };
    const b = stored.boards[0]!;
    expect(noTid(b.tiles[b.active])).toEqual(tile);
    const back = parseRealmBoards(stored, rand, NOW);
    expect(back.notice).toBeNull();
    expect(noTid(firstTile(back.state))).toEqual(tile);
    expect(tileConv(firstTile(back.state), ORIGIN)).toEqual(ref);
    expect(save(back.state)).toEqual(stored);
  });
  it('without a name the default label stays (no name stored)', () => {
    const tile = convTile(ORIGIN, ref)!;
    expect(tile).toEqual({ url: convTileUrl(ORIGIN, ref) });
    expect(noTid(firstTile(parseRealmBoards(save(realmWith(tile)), rand, NOW).state))).toEqual(tile);
  });
  it('read on another Hub origin (or with none) it is the web tile it is stored as, and names no conversation', () => {
    const t = firstTile(parseRealmBoards(save(realmWith(convTile(ORIGIN, ref, 'Orders fix')!)), rand, NOW).state);
    for (const o of ['https://other.example', '']) expect(tileConv(t, o)).toBeNull();
  });
});

describe('conv_tile_pasted_link_is_the_same_tile', () => {
  it('a link pasted through the picker ({url}) and the builder give one value, before and after a save', () => {
    const pasted: Tile = { url: convTileUrl(ORIGIN, ref) };
    expect(pasted).toEqual(convTile(ORIGIN, ref));
    expect(noTid(firstTile(parseRealmBoards(save(realmWith(pasted)), rand, NOW).state))).toEqual(pasted);
  });
  it("the tab's own save of a pasted link is no conflict in the two-tab merge (undo kept, no other-tab notice)", () => {
    // As the Board does: base = the stored value, working state = base + the picker's tile, the save acknowledged =
    // the working state stored and read back (data.ts merges against it). The link is this page's own Hub's.
    const here = hubOrigin();
    expect(here).toMatch(/^https?:\/\//);
    const link = convTileUrl(here, ref);
    expect(tileConv({ url: link })).toEqual(ref);
    const base = parseRealmBoards(save(freshRealm(rand)), rand, NOW).state;
    const b0 = base.boards[0] as Board;
    const mine: RealmBoards = { ...base, boards: [must(setTile(b0, b0.active, { url: link, name: 'Orders fix' }, rand))] };
    const saved = parseRealmBoards(save(mine), rand, NOW).state;
    const m = merge(base, mine, saved);
    expect(m.lost).toEqual([]);
    expect(m.changed).toEqual([]);
    expect(wire(m.state)).toEqual(wire(mine));
  });
});

describe('conv_tile_old_reader_new_writer_keeps_the_tile', () => {
  it('new writer → old tab parses and saves → new reader: the conversation tile is intact', () => {
    const tile = convTile(ORIGIN, ref, 'Orders fix')!;
    const written = save(realmWith(tile));
    // A tab of an earlier release still open: it reads the value and writes it back with every save of its own.
    const old = oldParse(written, rand, NOW);
    expect(old.notice).toBeNull();
    expect(firstTile(v1Out<RealmBoards>(old.state))).toEqual(tile);
    const rewritten = wire(oldToStored(old.state));
    expect(rewritten).toEqual(dropTids(written));
    const back = parseRealmBoards(rewritten, rand, NOW);
    expect(back.notice).toBeNull();
    expect(noTid(firstTile(back.state))).toEqual(tile);
    expect(tileConv(firstTile(back.state), ORIGIN)).toEqual(ref);
  });
  it('the old tab changing something else on the Board still keeps the tile', () => {
    const g: ConvRef = { ...ref, realm: 'global' };
    const tile = convTile(ORIGIN, g)!;
    const old = oldParse(save(realmWith(tile)), rand, NOW).state;
    const renamed = { ...old, boards: old.boards.map((b) => ({ ...b, name: 'Ops' })) };
    const back = parseRealmBoards(wire(oldToStored(renamed)), rand, NOW).state;
    expect(back.boards[0]!.name).toBe('Ops');
    expect(noTid(firstTile(back))).toEqual(tile);
    expect(tileConv(firstTile(back), ORIGIN)).toEqual(g);
  });
});

// MAX_SLOTS is 8, and an old tab read Boards of at most 6. The accepted residue: an old tab still open cannot read a Board of 7 or
// 8 slots, drops it, and its next save loses it. Pinned here so it stays a known cost, never a surprise.
describe('a Board of 7 or 8 slots and an old tab', () => {
  const board = (count: number): RealmBoards => {
    const s = freshRealm(rand);
    let b = s.boards[0]!;
    for (let i = 0; i < count; i++) b = must(addTile(b, { project: 'p1', computer: 'c1', program: 'terminal', session: i + 1 }, rand)).board;
    return { ...s, boards: [b] };
  };
  // What an old tab reads: the stored value with the computer under its old name, as earlier tiles have it.
  const oldShape = (x: unknown): never => JSON.parse(JSON.stringify(x).replace(/"computer":/g, '"container":')) as never;
  it.each([7, 8])('today\'s reader keeps %i slots', (count) => {
    const read = parseRealmBoards(save(board(count)), rand, NOW);
    expect(read.notice).toBeNull();
    expect(Object.keys(read.state.boards[0]!.tiles)).toHaveLength(count);
  });
  it('an old tab still reads 6 slots', () => {
    const old = oldParse(oldShape(save(board(6))), rand, NOW);
    expect(old.notice).toBeNull();
    expect(Object.keys(old.state.boards[0]!.tiles)).toHaveLength(6);
  });
  it.each([7, 8])('an old tab cannot read %i slots: the whole value resets, its raw text kept beside the fresh state', (count) => {
    const old = oldParse(oldShape(save(board(count))), rand, NOW);
    expect(old.notice?.kind).toBe('reset');
    expect(old.state.boards).toHaveLength(1);
    expect(Object.values(old.state.boards[0]!.tiles)).toEqual([null]);
  });
  it('beside another Board an old tab drops only the big one, and its save loses that Board', () => {
    const big = board(7);
    const small = { ...board(2).boards[0]!, id: 'bsmall01' };
    const old = oldParse(oldShape(save({ ...big, boards: [big.boards[0]!, small] })), rand, NOW);
    expect(old.notice).toEqual({ kind: 'boards', n: 1 });
    expect(old.state.boards.map((b) => b.id)).toEqual(['bsmall01']);
    const after = wire(oldToStored(old.state)) as { boards: { id: string }[] };
    expect(after.boards.map((b) => b.id)).toEqual(['bsmall01']);
  });
});
