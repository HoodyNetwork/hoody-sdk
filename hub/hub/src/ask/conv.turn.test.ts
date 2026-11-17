// Vitest: the producer of a reply's turn index. A transcript turn is named by its place among turn_boundaries only when its OWN
// boundary lies inside it; a transcript whose turns and boundaries disagree names no turn, so no reply gets a Fork menu from a guess.
// The boundary the page read for the turn (`pin`) rides on the same turn, so a fork re-reads exactly what was shown.
import { describe, expect, it } from 'vitest';
import * as C from './conv';
import type { Snapshot } from './engine';
import { factsOf } from './source';

const u = (text: string) => ({ role: 'user', blocks: [{ kind: 'text', text }] });
const a = (text: string) => ({ role: 'assistant', blocks: [{ kind: 'text', text }] });
const read = (body: unknown, liveTail = false) => C.historyFrom(body, { liveTail, idOf: (i) => 'h' + i, at: 1 });
const conv = (body: unknown, liveTail = false) => { const h = read(body, liveTail); return { ...C.emptyConv('s'), users: Object.fromEntries(h.users.map((x) => [x.id, x])), turns: h.turns }; };
const replies = (c: C.Conv) => C.blocks(c, 0).filter((b): b is Extract<C.Block, { k: 'reply' }> => b.k === 'reply');

describe('history turns name their boundary', () => {
  it('two turns: index and pin from turn_boundaries (0 is a real index)', () => {
    const h = read({ messages: [u('one'), a('first'), u('two'), a('second')], turn_boundaries: [1, 3] });
    expect(h.turns.map((t) => [t.idx, t.pin])).toEqual([[0, 1], [1, 3]]);
  });
  it('replies carry their turn; a streaming or unfinished reply does not', () => {
    const c = conv({ messages: [u('one'), a('first'), u('two'), a('second')], turn_boundaries: [1, 3] });
    expect(replies(c).map((r) => [r.text, r.turn])).toEqual([['first', 0], ['second', 1]]);
  });
  it('a follow-up inside a turn is the same turn: its reply is the turn\'s last chunk', () => {
    const c = conv({ messages: [u('one'), a('mid'), u('and this'), a('end'), u('next'), a('last')], turn_boundaries: [3, 5] });
    expect(c.turns.map((t) => [t.idx, t.pin])).toEqual([[0, 3], [1, 5]]);
    expect(replies(c).map((r) => [r.text, r.turn])).toEqual([['mid', undefined], ['end', 0], ['last', 1]]);
  });
  it('a boundary outside its turn names nothing', () => {
    const h = read({ messages: [u('one'), a('first'), u('two'), a('second')], turn_boundaries: [1, 1] });
    expect(h.turns.map((t) => t.idx), 'the second turn\'s boundary is not inside it').toEqual([0, undefined]);
  });
  it('boundaries that go back, or none at all, name nothing', () => {
    expect(read({ messages: [u('one'), a('first'), u('two'), a('second')], turn_boundaries: [3, 1] }).turns.map((t) => t.idx)).toEqual([undefined, undefined]);
    expect(read({ messages: [u('one'), a('first')] }).turns.map((t) => t.idx)).toEqual([undefined]);
  });
  it('the live tail (a turn still running) is left out and the finished turns keep their indexes', () => {
    const h = read({ messages: [u('one'), a('first'), u('two'), a('partial')], turn_boundaries: [1] }, true);
    expect(h.turns.map((t) => [t.idx, t.pin])).toEqual([[0, 1]]);
  });
  it('a turn finished live (not read from history) has no turn index', () => {
    const c = conv({ messages: [u('one'), a('first')], turn_boundaries: [1] });
    const t = C.addTurn(c, { turnId: 't2', user: null, now: 1 });
    expect(t.turns[t.turns.length - 1]?.idx).toBeUndefined();
  });
});

describe('completedTurns (the capability fact Fork reads)', () => {
  const snap = (c: C.Conv): Snapshot => ({ phase: 'ready', conv: c, status: null, dormant: false, gates: [], band: null, blocked: null, decision: { pending: false, unknown: false } }) as unknown as Snapshot;
  it('counts the finished turns the conversation shows', () => {
    expect(factsOf(snap(conv({ messages: [u('one'), a('first'), u('two'), a('second')], turn_boundaries: [1, 3] }))).completedTurns).toBe(2);
    expect(factsOf(snap(C.emptyConv('s'))).completedTurns).toBe(0);
  });
  it('a turn that is still running is not finished', () => {
    const c = C.addTurn(conv({ messages: [u('one'), a('first')], turn_boundaries: [1] }), { turnId: 't2', user: null, now: 1 });
    expect(factsOf(snap(c)).completedTurns).toBe(1);
  });
});
