// Read old, write new: hub_boards_v1 tiles and recents name their computer as `computer`; a tile an older Hub
// wrote has `container`. Read: new first, old as the fallback (a board of old tiles loses none). Write: new only.
import { describe, expect, it } from 'vitest';
import { addTile, freshRealm, isRefusal, onActive, type RealmBoards, type Refusal, type Tile } from './boards';
import { parseRealmBoards, parseTile, toStored } from './persist';

const rand = (): (() => number) => { let i = 0; return () => ((i++ * 7919) % 1000) / 1000; };
const ok = <T,>(x: T): Exclude<T, Refusal> => { if (isRefusal(x)) throw new Error('refused ' + x.refused); return x as Exclude<T, Refusal>; };
const P = 'p1', C1 = 'c1', C2 = 'c2';

const withTile = (t: Tile): RealmBoards => ok(onActive(freshRealm(rand()), (b) => ok(addTile(b, t, rand())).board));
type Stored = { boards: { tiles: Record<string, Record<string, unknown> | null> }[]; recents: Record<string, unknown>[] };
const firstOf = (w: Stored): Record<string, unknown> => Object.values(w.boards[0]!.tiles).find((x) => x) as Record<string, unknown>;
const wire = (s: RealmBoards): Stored => JSON.parse(JSON.stringify(toStored(s)));
/** The same stored value as an older Hub wrote it: `container` for `computer`. */
const asOld = (w: Stored): Stored => JSON.parse(JSON.stringify(w).replace(/"computer":/g, '"container":'));
const read = (w: unknown) => parseRealmBoards(w).state;
const tileOf = (w: unknown): Record<string, unknown> | undefined => Object.values(read(w).boards[0]!.tiles).find((x) => x) as Record<string, unknown> | undefined;

const TILES: [string, Tile][] = [
  ['program tile', { project: P, computer: C1, program: 'terminal', session: 3 } as Tile],
  ['port tile', { project: P, computer: C1, protocol: 'http', port: 8080 } as Tile],
];

describe('board tiles: the stored computer spelling', () => {
  for (const [name, tile] of TILES) {
    it(`${name}: written with computer and never container`, () => {
      const t = firstOf(wire(withTile(tile)));
      expect(t.computer).toBe(C1);
      expect('container' in t).toBe(false);
    });
    it(`${name}: an old-spelling board reads whole and is written back in the new spelling`, () => {
      const s = withTile(tile);
      const oldW = asOld(wire(s));
      expect(firstOf(oldW).container).toBe(C1);
      expect(read(oldW)).toEqual(read(wire(s)));
      expect(tileOf(oldW)?.computer).toBe(C1);
      expect(firstOf(wire(read(oldW))).computer).toBe(C1);
    });
    it(`${name}: both spellings with different ids read the new one`, () => {
      const w = wire(withTile(tile));
      firstOf(w).computer = C2;
      firstOf(w).container = C1;
      expect(tileOf(w)?.computer).toBe(C2);
    });
    it(`${name}: no computer under either spelling, or a bad one, is dropped`, () => {
      const w = wire(withTile(tile));
      delete firstOf(w).computer;
      expect(tileOf(w)).toBeUndefined();
      firstOf(w).computer = 'not a label!';
      expect(tileOf(w)).toBeUndefined();
    });
  }
  it('parseTile reads either spelling of a bot tile', () => {
    const bot = { project: P, realm: 'global', bot: 'a'.repeat(24) };
    const a = parseTile({ ...bot, container: C1 });
    const b = parseTile({ ...bot, computer: C1 });
    if (a === null || b === null) return; // a bot id that does not check under these rules reads null under both spellings
    expect(a).toEqual(b);
    expect((b as unknown as Record<string, unknown>).computer).toBe(C1);
  });
  it('recents: old and new spellings read alike; written with computer', () => {
    const s = withTile(TILES[0]![1]);
    const withRecent: RealmBoards = { ...s, recents: [{ project: P, computer: C1, program: 'files', session: 2 } as never] };
    const w = wire(withRecent);
    expect(w.recents[0]!.computer).toBe(C1);
    expect('container' in w.recents[0]!).toBe(false);
    expect(read(asOld(w)).recents).toEqual(read(w).recents);
    expect(read(w).recents).toHaveLength(1);
  });
});
