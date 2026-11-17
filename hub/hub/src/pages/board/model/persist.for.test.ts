// Vitest: a program board's key survives a store and a load, a malformed
// one is dropped (the Board is kept, as an ordinary Board); and a two-tab merge never keeps more than nine Boards: the
// Boards already stored stay, a creation of this tab not yet stored gives way (`capped` names it).
import { describe, expect, it } from 'vitest';
import { createBoard, deleteBoard, freshRealm, isRefusal, keyedAddTile, MAX_BOARDS, renameBoard, reorderBoard, type RealmBoards, type Refusal, type TileRef } from './boards';
import { merge } from './merge';
import { parseRealmBoards, toStored } from './persist';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
const term = (session: number): TileRef => ({ project: 'p1', computer: 'c1', program: 'terminal', session });
const realmWith = (k: number, from = freshRealm(rand)): RealmBoards => { let s = from; while (s.boards.length < k) s = must(createBoard(s, rand)); return s; };

describe('persist_keeps_for_and_drops_a_malformed_one', () => {
  it('the key goes through a store and a load', () => {
    const s = must(keyedAddTile(freshRealm(rand), { for: { c: 'c1', k: 'ow:nano' }, name: 'Nano · atlas' }, term(8003), rand)).state;
    const back = parseRealmBoards(JSON.parse(JSON.stringify(toStored(s))));
    expect(back.notice).toBeNull();
    expect(back.state.boards[1]).toMatchObject({ name: 'Nano · atlas', for: { c: 'c1', k: 'ow:nano' } });
  });
  it('a malformed key is dropped and the Board kept: wrong types, a control character, too long, a bad computer id, extra keys', () => {
    const s = toStored(realmWith(1));
    for (const bad of [{ c: 'c1' }, { c: 'c1', k: 3 }, { c: 'c1', k: 'ow:\nnano' }, { c: 'c1', k: 'x'.repeat(65) }, { c: 'bad id!', k: 'ow:nano' }, { c: 'c1', k: '' }, 'ow:nano', { c: 'c1', k: 'ow:nano', x: 1 }]) {
      const raw = { ...s, boards: [{ ...s.boards[0], for: bad }] };
      const back = parseRealmBoards(JSON.parse(JSON.stringify(raw)));
      expect(back.state.boards).toHaveLength(1);
      expect(back.state.boards[0]).not.toHaveProperty('for');
    }
  });
});

describe('merge never keeps more than nine Boards', () => {
  it('8 stored; another tab stored a ninth; this tab made its own ninth: the stored ninth stays, this one gives way', () => {
    const base = realmWith(MAX_BOARDS - 1);
    const theirs = must(keyedAddTile(base, { for: { c: 'c1', k: 'ow:nano' }, name: 'Nano · atlas' }, term(8003), rand)).state;
    const mine = must(createBoard(base, rand, 'Mine'));
    const m = merge(base, mine, theirs);
    expect(m.state.boards).toHaveLength(MAX_BOARDS);
    expect(m.state.boards.some((b) => b.for?.k === 'ow:nano')).toBe(true);
    expect(m.state.boards.some((b) => b.name === 'Mine')).toBe(false);
    expect(m.capped).toEqual(['Mine']);
    expect(m.state.boards.map((b) => b.id)).toContain(m.state.active);
  });
  it('this tab also reordered (its order leads the merge): the other tab\'s stored ninth still stays, this tab\'s gives way', () => {
    const base = realmWith(MAX_BOARDS - 1);
    const theirs = must(keyedAddTile(base, { for: { c: 'c1', k: 'ow:nano' }, name: 'Nano · atlas' }, term(8003), rand)).state;
    const mine = must(createBoard(reorderBoard(base, 1, 0), rand, 'Mine'));
    const m = merge(base, mine, theirs);
    expect(m.state.boards.map((b) => b.id).slice(0, 2)).toEqual(mine.boards.map((b) => b.id).slice(0, 2));
    expect(m.state.boards).toHaveLength(MAX_BOARDS);
    expect(m.state.boards.some((b) => b.for?.k === 'ow:nano')).toBe(true);
    expect(m.capped).toEqual(['Mine']);
  });
  it('nine stored; another tab deleted one this tab renamed and stored a new ninth: the stored nine stay, the renamed one gives way (yielded)', () => {
    const base = realmWith(MAX_BOARDS);
    const x = base.boards[3]!.id;
    const theirs = must(createBoard(must(deleteBoard(base, x, rand)), rand, 'Theirs'));
    const mine = must(renameBoard(base, x, 'Kept here'));
    const m = merge(base, mine, theirs);
    expect(m.state.boards).toHaveLength(MAX_BOARDS);
    expect(m.state.boards.map((b) => b.id)).toEqual(theirs.boards.map((b) => b.id));
    expect(m.capped).toEqual([]);
    expect(m.yielded).toEqual(['Kept here']);
  });
  it('a creation of this tab gives way before a Board it kept over a delete', () => {
    const base = realmWith(MAX_BOARDS);
    const x = base.boards[3]!.id;
    const theirs = must(createBoard(must(deleteBoard(base, x, rand)), rand, 'Theirs'));
    const mine = must(createBoard(must(deleteBoard(must(renameBoard(base, x, 'Kept here')), base.boards[5]!.id, rand)), rand, 'Mine'));
    const m = merge(base, mine, theirs);
    expect(m.state.boards).toHaveLength(MAX_BOARDS);
    expect(m.state.boards.find((b) => b.id === x)?.name).toBe('Kept here');
    expect(m.state.boards.some((b) => b.name === 'Theirs')).toBe(true);
    expect(m.capped).toEqual(['Mine']);
    expect(m.yielded).toEqual([]);
  });
  it('under nine, both new Boards are kept and nothing is capped', () => {
    const base = realmWith(3);
    const m = merge(base, must(createBoard(base, rand, 'Mine')), must(createBoard(base, rand, 'Theirs')));
    expect(m.state.boards).toHaveLength(5);
    expect(m.capped).toEqual([]);
  });
});
