// What a running turn waits on, as the working row says it: the agent compacting the conversation (event.compaction_started until
// event.compacted or the next sign of the model), else the model thinking. Only while the turn is proven working.
import { describe, expect, it } from 'vitest';
import * as C from './conv';
import type { Snapshot } from './engine';
import * as L from './logic';
import { workOf } from './source';

let SEQ = 0;
const env = (type: string, data: unknown, o: { turn?: string } = {}) => ({ seq: ++SEQ, incarnation: 'i1', turn_id: o.turn ?? 'T1', event: { type, data } });
const frame = (e: ReturnType<typeof env>) => ({ type: 'frame' as const, name: e.event.type.slice(6), data: e });
const run = (...as: L.Action[]) => as.reduce((x, a) => L.reduce(x, a), L.reduce(L.initial(), { type: 'turn', turnId: 'T1' }));

describe('AskState.compacting', () => {
  it('compaction_started sets it; compacted clears it', () => {
    const s = run(frame(env('event.compaction_started', { summarized_turns: 4, kept_turns: 2, auto: false })));
    expect(s.compacting).toBe(true);
    expect(L.reduce(s, frame(env('event.compacted', { from_tokens: 9000, to_tokens: 2000 }))).compacting).toBe(false);
  });
  it('a delegated agent compacting its own context counts too', () => {
    expect(run(frame(env('event.compaction_started', { summarized_turns: 0, kept_turns: 0, auto: true, agent: 'claude' }))).compacting).toBe(true);
  });
  it("a helper's frame never sets it", () => {
    expect(run(frame(env('event.compaction_started', { helper_id: 'h1' }))).compacting).toBe(false);
  });
  it('any sign of the model or the end of the turn clears it, even with no compacted frame seen', () => {
    for (const [type, data] of [
      ['event.stream_chunk', { text: 'So' }], ['event.thinking_chunk', { text: 'hm' }], ['event.tool_call', { tool_id: 't1', name: 'bash' }],
      ['event.error', { code: 'compaction_failed' }], ['event.agent_done', { outcome: 'completed' }],
    ] as const) {
      const s = run(frame(env('event.compaction_started', { auto: true })), frame(env(type, data)));
      expect(s.compacting, type).toBe(false);
    }
  });
  it("another turn's frame changes nothing", () => {
    expect(run(frame(env('event.compaction_started', { auto: true }, { turn: 'T2' }))).compacting).toBe(false);
  });
});

const user: C.UserMsg = { id: 'u1', text: 'hello', at: 1, key: 'k-u1', via: 'turn', state: 'sent', turnId: null, commandId: null, reason: '' };
function snapOf(turnId: string | null, ...as: L.Action[]): Snapshot {
  let c = C.addUser(C.emptyConv('sess-1'), user);
  c = C.addTurn(c, { turnId, user: user.id, now: 1 });
  for (const a of as) c = C.onTurn(c, a, 1);
  return { phase: 'ready', band: null, status: C.statusOf(c, { lost: false, reconnecting: false }), conv: c } as unknown as Snapshot;
}

describe('workOf', () => {
  it('a working turn waits on the model: thinking', () => {
    expect(workOf(snapOf('T1'))).toEqual({ work: 'thinking' });
  });
  it('a working turn whose agent compacts: compacting, then thinking again once it is done', () => {
    const start = frame(env('event.compaction_started', { summarized_turns: 3, kept_turns: 1, auto: false }));
    expect(workOf(snapOf('T1', start))).toEqual({ work: 'compacting' });
    expect(workOf(snapOf('T1', start, frame(env('event.compacted', { from_tokens: 1, to_tokens: 1 }))))).toEqual({ work: 'thinking' });
  });
  it('a turn the agent has not named (the message is still on its way) says nothing', () => {
    expect(workOf(snapOf(null))).toEqual({});
  });
  it('an idle chat says nothing', () => {
    expect(workOf({ phase: 'ready', band: null, status: null, conv: C.emptyConv('sess-1') } as unknown as Snapshot)).toEqual({});
  });
});
