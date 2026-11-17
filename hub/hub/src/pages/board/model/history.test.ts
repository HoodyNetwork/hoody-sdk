// Vitest, S-hist-model: Closed Boards' rules. The caps (ten entries, the store's byte limit)
// keep the newest and never the entry this tab just closed; every entry that goes is remembered in `removed` (newest 256),
// so a merge with a tab still holding it never brings it back; an empty Board is never an entry, and a Board with a tile
// is kept whole (its Scroll mode included). What is stored is read fail closed.
import { VALUE_MAX } from '@core/cryptStore';
import { describe, expect, it } from 'vitest';
import { addTile, freshRealm, isRefusal, renameBoard, type Board, type Refusal } from './boards';
import {
  CLOSED_BYTES_MAX, CLOSED_MAX, CLOSED_REMOVED_MAX, HISTORY_FULL, addClosed, emptyHistory, historyBytes, mergeClosedHistory, newCid,
  normalizeClosedHistory, parseClosedHistory, removeClosed, toStoredHistory, type ClosedBoard, type ClosedHistory,
} from './history';

let n = 0;
const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
function must<T extends object>(x: T | Refusal): Exclude<T, Refusal> {
  if (isRefusal(x)) throw new Error('refused ' + x.refused);
  return x as Exclude<T, Refusal>;
}
/** A Board named `name` with one web tile (path `p`, padded to `pad` characters). */
function board(name: string, p = name, pad = 0): Board {
  const s0 = freshRealm(rand);
  const s = must(renameBoard(s0, s0.boards[0]!.id, name.slice(0, 32)));
  const b = { ...s.boards[0]!, id: 'b' + name.toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(4, 'x').slice(0, 16) };
  return must(addTile(b, { url: 'https://docs.example/' + p + 'x'.repeat(pad) }, rand)).board;
}
const entry = (cid: string, closedAt: number, b: Board = board('B' + cid)): ClosedBoard => ({ cid, closedAt, board: b });
const h = (entries: ClosedBoard[], removed: string[] = []): ClosedHistory => ({ v: 1, entries, removed });
const cids = (x: ClosedHistory | typeof HISTORY_FULL) => ('refused' in x ? x : x.entries.map((e) => e.cid));
const round = (x: ClosedHistory) => parseClosedHistory(JSON.parse(JSON.stringify(toStoredHistory(x))));

describe('Closed Boards caps', () => {
  it('the byte cap is the encrypted store\'s VALUE_MAX', () => { expect(CLOSED_BYTES_MAX).toBe(VALUE_MAX); });

  it('keeps the ten newest, newest first; the rest are remembered as removed', () => {
    const all = Array.from({ length: 12 }, (_, i) => entry('cold' + String(i).padStart(2, '0'), 1000 + i));
    const out = normalizeClosedHistory(h(all)) as ClosedHistory;
    expect(out.entries).toHaveLength(CLOSED_MAX);
    expect(out.entries[0]!.cid).toBe('cold11');
    expect(out.removed).toEqual(['cold00', 'cold01']);
  });

  it('the entry this tab just closed is never the one evicted, even when it is the oldest', () => {
    const all = Array.from({ length: 10 }, (_, i) => entry('cnew' + i, 2000 + i));
    const out = addClosed(h(all), 'cmine', board('Mine'), 1);
    expect(cids(out)).toContain('cmine');
    expect((out as ClosedHistory).entries).toHaveLength(CLOSED_MAX);
    expect((out as ClosedHistory).removed).toEqual(['cnew0']);
  });

  it('bytes: the oldest others go until the value fits; one entry over the cap alone is HISTORY_FULL', () => {
    const big = (cid: string, at: number) => entry(cid, at, board('Big' + cid, cid, 15_000));
    const out = addClosed(h([big('caaaa', 10), big('cbbbb', 20), big('ccccc', 30)]), 'cmine', board('Mine', 'mine', 15_000), 5) as ClosedHistory;
    expect(historyBytes(out)).toBeLessThanOrEqual(CLOSED_BYTES_MAX);
    expect(cids(out)).toContain('cmine');
    expect(out.removed).toContain('caaaa');
    expect(addClosed(emptyHistory(), 'chuge', board('Huge', 'huge', 50_000), 5)).toEqual(HISTORY_FULL);
  });

  it('a kept entry that fits alone but not with the removed list is HISTORY_FULL, never a value over the cap', () => {
    const removed = Array.from({ length: CLOSED_REMOVED_MAX }, (_, i) => 'crm' + String(i).padStart(5, '0'));
    const mine = (pad: number) => board('Mine', 'mine', pad);
    let pad = 40_000;
    while (!('refused' in addClosed(emptyHistory(), 'cmine', mine(pad + 100), 5))) pad += 100; // the largest that fits alone
    expect('refused' in addClosed(emptyHistory(), 'cmine', mine(pad), 5)).toBe(false);
    expect(addClosed(h([], removed), 'cmine', mine(pad), 5)).toEqual(HISTORY_FULL);
  });

  it('removed keeps the newest 256, each once', () => {
    const ids = Array.from({ length: 300 }, (_, i) => 'cr' + String(i).padStart(4, '0'));
    const out = removeClosed(h([]), [...ids, ids[299]!]);
    expect(out.removed).toHaveLength(CLOSED_REMOVED_MAX);
    expect(out.removed[0]).toBe('cr0044');
    expect(out.removed.at(-1)).toBe('cr0299');
  });
});

describe('two tabs merge', () => {
  it('the union by cid, minus what either side removed: a removed entry never comes back', () => {
    const a = h([entry('caaaa', 1), entry('cbbbb', 2)]);
    const b = removeClosed(h([entry('caaaa', 1), entry('ccccc', 3)]), ['caaaa']);
    const m = mergeClosedHistory(a, b);
    expect(cids(m)).toEqual(['ccccc', 'cbbbb']);
    expect(m.removed).toEqual(['caaaa']);
    expect(cids(mergeClosedHistory(b, a))).toEqual(['ccccc', 'cbbbb']);
  });

  it('every removal of either side applies before the removed list is cut: a removal past 256 combined still holds', () => {
    const a = removeClosed(h([]), ['cdead']);
    const many = Array.from({ length: CLOSED_REMOVED_MAX }, (_, i) => 'cbx' + String(i).padStart(5, '0'));
    const b = h([entry('cdead', 1), entry('clive', 2)], many);
    for (const m of [mergeClosedHistory(a, b), mergeClosedHistory(b, a)]) {
      expect(cids(m)).toEqual(['clive']);
      expect(m.removed).toHaveLength(CLOSED_REMOVED_MAX);
    }
  });

  it('keeps the ten newest of both, whatever either tab just closed', () => {
    const a = h(Array.from({ length: 10 }, (_, i) => entry('ca' + String(i).padStart(3, '0'), 100 + i)));
    const b = h([entry('cbold', 1)]);
    const m = mergeClosedHistory(a, b);
    expect(cids(m)).not.toContain('cbold');
    expect(m.removed).toEqual(['cbold']);
  });
});

describe('what is an entry', () => {
  it('an empty Board is never written; a Board with a tile is kept whole, Scroll mode included', () => {
    const empty = freshRealm(rand).boards[0]!;
    expect(addClosed(emptyHistory(), 'cempt', empty, 5)).toEqual(emptyHistory());
    const scroll: Board = { ...board('Tall'), mode: 'scroll' };
    const out = round(addClosed(emptyHistory(), 'ctall', scroll, 5) as ClosedHistory);
    expect(out.entries[0]!.board).toEqual(scroll);
  });

  it('reads fail closed: bad cids, times, Boards, empty Boards and repeats are dropped; garbage is the empty history', () => {
    const good = toStoredHistory(h([entry('cgood', 9)]));
    const raw = { v: 1, removed: ['cgone', 7, 'BAD'], entries: [...good.entries, { cid: 'BAD', closedAt: 1, board: good.entries[0]!.board }, { cid: 'ctime', closedAt: -1, board: good.entries[0]!.board }, { cid: 'cnob', closedAt: 1, board: { id: 'x' } }, { cid: 'cempt', closedAt: 1, board: freshRealm(rand).boards[0] }, { ...good.entries[0]!, closedAt: 1 }] };
    const out = parseClosedHistory(JSON.parse(JSON.stringify(raw)));
    expect(cids(out)).toEqual(['cgood']);
    expect(out.removed).toEqual(['cgone', 'cempt']);
    for (const bad of [null, 'x', [], { v: 2, entries: good.entries }, { v: 1, entries: 'x' }]) expect(parseClosedHistory(bad)).toEqual(emptyHistory());
  });

  it('a fresh cid is none an entry or a removed one holds', () => {
    const x = h([entry('caaaa', 1)], ['cbbbb']);
    for (let i = 0; i < 20; i++) expect(['caaaa', 'cbbbb']).not.toContain(newCid(x, rand));
    expect(newCid(x, rand)).toMatch(/^c[a-z0-9]{4,16}$/);
  });
});
