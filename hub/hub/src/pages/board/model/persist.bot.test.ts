// Vitest: a Bot tile (in memory {project, computer, realm, bot, name?}, stored with its computer id under `computer`)
// is stored and read back like any tile; the reader keeps it only with a realm and a Bot id a key can carry. A Hub from before Bot tiles
// (persist.v1-frozen.ts plays that tab) reads it as a bad tile: that slot is empty, the rest of the Board stays.
import { describe, expect, it } from 'vitest';
import { addTile, freshRealm, isRefusal, type Board, type BotTile, type RealmBoards, type Refusal, type Tile } from './boards';
import { parseRealmBoards, parseTile, toStored } from './persist';
import { parseRealmBoards as oldParse, parseTile as oldParseTile } from './persist.v1-frozen';
import { slots } from './tree';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
const NOW = 1_800_000_000_000;
const REALM = '0123456789abcdef01234567';
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const wire = (x: unknown): unknown => JSON.parse(JSON.stringify(x));
const save = (s: RealmBoards): unknown => wire(toStored(s));
// The frozen parser (persist.v1-frozen.ts) keeps the earlier storage shape: its tiles name the computer `container`. Shown to it, and
// read back from it, at the call site.
const v1In = (x: unknown): unknown => JSON.parse(JSON.stringify(x).replace(/"computer":/g, '"container":'));
const v1Out = <T>(x: unknown): T => JSON.parse(JSON.stringify(x).replace(/"container":/g, '"computer":')) as T;
const bot: BotTile = { project: 'p1', computer: 'c1', realm: REALM, bot: 'chief' };
const program: Tile = { project: 'p1', computer: 'c1', program: 'terminal', session: 2 };
const web: Tile = { url: 'https://example.com/a', name: 'Docs' };
const port: Tile = { project: 'p1', computer: 'c2', protocol: 'http', port: 8080 };
/** A realm whose one Board holds the tiles in order. */
function realmWith(...tiles: Tile[]): RealmBoards {
  const s = freshRealm(rand);
  let b: Board = s.boards[0]!;
  for (const t of tiles) b = must(addTile(b, t, rand)).board;
  return { ...s, boards: [b] };
}
const tilesOf = (s: RealmBoards): (Tile | null)[] => { const b = s.boards[0]!; return slots(b.layout).map((k) => b.tiles[k] ?? null); };
/** The tiles as payloads: every tile carries a tile id (S-id, boards.ts), which these checks do not compare. */
const plain = (ts: (Tile | null)[]): (Tile | null)[] => ts.map((t) => { if (!t) return null; const { tid: _tid, ...rest } = t; return rest as Tile; });

describe('Bot tiles in storage', () => {
  it('a saved Board with a Bot tile reads back the same, every other tile intact', () => {
    const s = realmWith(program, { ...bot, name: 'Our chief' }, web, port);
    const back = parseRealmBoards(save(s), rand, NOW);
    expect(back.notice).toBeNull();
    expect(tilesOf(back.state)).toEqual(tilesOf(s));
    expect(plain(tilesOf(back.state))).toContainEqual({ ...bot, name: 'Our chief' });
    expect(save(back.state)).toEqual(save(s));
  });

  it('the Global realm is a realm a Bot tile keeps', () => {
    expect(parseTile({ ...bot, realm: 'global' })).toEqual({ ...bot, realm: 'global' });
  });

  it.each([
    ['a realm that is neither global nor 24 hex', { ...bot, realm: 'personal' }],
    ['an upper-case realm id', { ...bot, realm: REALM.toUpperCase() }],
    ['no realm', { project: 'p1', computer: 'c1', bot: 'chief' }],
    ['an empty Bot id', { ...bot, bot: '' }],
    ['a Bot id with the key separator', { ...bot, bot: 'a~b' }],
    ['a Bot id with a space', { ...bot, bot: 'a b' }],
    ['a Bot id with a control character', { ...bot, bot: 'a\u0007' }],
    ['a Bot id longer than 64', { ...bot, bot: 'x'.repeat(65) }],
    ['a Bot id that is not a string', { ...bot, bot: 7 }],
    ['a computer id that is not one DNS label', { ...bot, computer: 'c 1' }],
    ['a project that is not a string', { ...bot, project: null }],
  ])('a Bot tile with %s is a bad tile', (_why, raw) => {
    expect(parseTile(raw)).toBeNull();
  });

  it.each([
    ['without a realm', {}],
    ['with a realm a Bot tile keeps', { realm: 'global' }],
  ])('a stored port tile carrying a stray bot key %s stays that port tile, as before Bot tiles', (_why, extra) => {
    const raw = { ...port, bot: 'chief', ...extra };
    expect(parseTile(raw)).toEqual(port);
    expect(v1Out(oldParseTile(v1In(raw)))).toEqual(port);
    const stored = save(realmWith(program, port)) as { boards: { tiles: Record<string, unknown> }[] };
    const tiles = stored.boards[0]!.tiles;
    const slot = Object.keys(tiles).find((k) => (tiles[k] as { port?: number } | null)?.port === 8080)!;
    tiles[slot] = raw;
    const back = parseRealmBoards(stored, rand, NOW);
    expect(back.notice).toBeNull();
    expect(plain(tilesOf(back.state))).toEqual([program, port]);
  });

  it('a stored tile with only a protocol or only a port beside a bot key is read as a port tile (bad, as before)', () => {
    expect(parseTile({ ...bot, protocol: 'http' })).toBeNull();
    expect(parseTile({ ...bot, port: 8080 })).toBeNull();
  });

  it('a stored Bot tile with a bad part becomes an empty slot, the rest of the Board loads, with the bad-tile notice', () => {
    const stored = save(realmWith(program, bot)) as { boards: { tiles: Record<string, unknown> }[] };
    const tiles = stored.boards[0]!.tiles;
    const slot = Object.keys(tiles).find((k) => (tiles[k] as { bot?: string } | null)?.bot === 'chief')!;
    tiles[slot] = { ...bot, realm: 'nope' };
    const back = parseRealmBoards(stored, rand, NOW);
    expect(back.notice).toEqual({ kind: 'tile' });
    expect(plain(tilesOf(back.state))).toEqual([program, null]);
  });

  it('a Hub from before Bot tiles drops the Bot tile as a bad tile and keeps the rest of the Board', () => {
    const s = realmWith(program, bot, web);
    // The frozen parser is the Hub from before Bot tiles and before the rename: it knows only `container`.
    const old = oldParse(v1In(save(s)), rand, NOW);
    expect(old.notice).toEqual({ kind: 'tile' });
    expect(tilesOf(v1Out<RealmBoards>(old.state))).toEqual([program, null, web]);
    expect(old.state.boards[0]!.layout).toEqual(s.boards[0]!.layout);
  });
});
