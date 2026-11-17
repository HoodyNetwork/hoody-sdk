// gates.test.ts: the session gate book's own orderings (gates.ts), where a snapshot's watermark and the stream's
// sequence numbers meet. The whole-engine orderings are in recon.test.ts.
import { describe, expect, it } from 'vitest';
import * as G from './gates';

const INC = 'inc-1';
/** A /state body showing confirm gate 7 (ref gate-7#1); its watermark `seq`, read before the daemon's content. */
function parked(seq: number, turn: string | null) {
  return {
    session_id: 's1', live: true, incarnation: INC, seq, state: 'parked', current_turn_id: turn,
    pending_gate: { type: 'confirm', gate_id: 7, tool_name: 'bash', params: { command: 'make' }, generation: 3 },
    pending_gate_ref: { id: 'gate-7', generation: 1, type: 'confirm' },
  };
}
const done = (seq: number, turn: string) => ({ seq, incarnation: INC, turn_id: turn, event: { type: 'event.agent_done', data: { outcome: 'completed' } } });
const opening = (seq: number, turn: string, generation = 1) => ({
  seq, incarnation: INC, turn_id: turn, gate: { id: 'gate-7', generation, type: 'confirm' },
  event: { type: 'event.confirm_request', data: { gate_id: 7, tool_name: 'bash', params: { command: 'make' } } },
});
const ids = (b: G.Book) => b.list.map((x) => x.gate.id + '#' + x.gate.generation);

describe('gates: a snapshot watermark is not an opening sequence', () => {
  it('A3 a snapshot read at watermark 10 shows turn B\'s gate; turn A\'s end (11) and the gate\'s opening (12) follow: the gate stays', () => {
    let b = G.onState(G.emptyBook(), parked(10, 'turn-B')).book;
    expect(ids(b)).toEqual(['gate-7#1']);
    const end = G.onEnvelope(b, done(11, 'turn-A'));
    b = end.book;
    expect(ids(b)).toEqual(['gate-7#1']);
    expect(end.recheck).toBe(true);
    b = G.onEnvelope(b, opening(12, 'turn-B')).book;
    expect(ids(b)).toEqual(['gate-7#1']);
  });
  it('a snapshot that named no turn: a turn\'s end keeps its gate and asks for a read', () => {
    const end = G.onEnvelope(G.onState(G.emptyBook(), parked(10, null)).book, done(11, 'turn-A'));
    expect(ids(end.book)).toEqual(['gate-7#1']);
    expect(end.recheck).toBe(true);
  });
  it('the end of the turn the snapshot named takes its gate', () => {
    const end = G.onEnvelope(G.onState(G.emptyBook(), parked(10, 'turn-B')).book, done(11, 'turn-B'));
    expect(ids(end.book)).toEqual([]);
  });
  it('a gate seen opening before a turn\'s end goes with that end', () => {
    const b = G.onEnvelope(G.onState(G.emptyBook(), { session_id: 's1', live: true, incarnation: INC, seq: 1, state: 'running', current_turn_id: 'turn-A' }).book, opening(5, 'turn-A')).book;
    expect(ids(G.onEnvelope(b, done(9, 'turn-A')).book)).toEqual([]);
  });
});

describe('gates: a closed gate stays off by its id and generation', () => {
  it('its late opening frame stays off; the same gate number under a new generation shows', () => {
    let b = G.onState(G.emptyBook(), parked(10, 'turn-B')).book;
    b = G.close(b, 'gate-7');
    expect(ids(b)).toEqual([]);
    expect(ids(G.onEnvelope(b, opening(12, 'turn-B')).book)).toEqual([]);
    expect(ids(G.onEnvelope(b, opening(12, 'turn-B', 2)).book)).toEqual(['gate-7#2']);
  });
  it('a gate the book no longer holds is closed by the ref the decision named', () => {
    let b = G.onState(G.emptyBook(), { session_id: 's1', live: true, incarnation: INC, seq: 1, state: 'running', current_turn_id: 'turn-B' }).book;
    b = G.close(b, 'gate-7', { id: 'gate-7', generation: 1 });
    expect(ids(G.onEnvelope(b, opening(12, 'turn-B')).book)).toEqual([]);
  });
  it('a later snapshot that still shows the gate brings it back (it was not over)', () => {
    let b = G.close(G.onState(G.emptyBook(), parked(10, 'turn-B')).book, 'gate-7');
    b = G.onState(b, parked(14, 'turn-B')).book;
    expect(ids(b)).toEqual(['gate-7#1']);
  });
});
