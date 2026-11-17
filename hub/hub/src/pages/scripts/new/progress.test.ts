// Vitest (New script): the Build step's progress words are projections of the
// assistant's real frames, for its own turn only, and never claim an end.
import { describe, expect, it } from 'vitest';
import strings from '../strings.en.json';
import { cursor, elapsed, frame, replay, resynced, snapshot, start, toolKind, withTurn, words, type Progress } from './progress';

const T = 'turn-1';
const INC = 'inc-a';
let n = 0;
// One envelope as the agent sends it: {seq, incarnation, turn_id, event: {type, data}}.
const env = (seq: number, type: string, data: Record<string, unknown> = {}, o: { turn?: string | null; inc?: string } = {}) => {
  const e: Record<string, unknown> = { seq, incarnation: o.inc ?? INC, event: { type: 'event.' + type, data } };
  if (o.turn !== null) e.turn_id = o.turn ?? T;
  return e;
};
const push = (p: Progress, seq: number, type: string, data: Record<string, unknown> = {}, o: { turn?: string | null; inc?: string } = {}) =>
  frame(p, type, env(seq, type, data, o), 1000);
const call = (id: string, name: string, args?: Record<string, unknown>) => ({ tool_id: id, name, summary: name, ...(args ? { arguments: args } : {}) });
const view = (p: Progress, o: { phase?: string; now?: number } = {}) => words(p, { computer: 'atlas', ...o });
const say = (w: { key: string; vars?: Record<string, string | number> } | null) => {
  if (!w) return null;
  const tpl = (strings as Record<string, string>)[w.key];
  if (typeof tpl !== 'string') throw new Error('no string ' + w.key);
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(w.vars?.[k] ?? '{' + k + '}'));
};
const rowsOf = (p: Progress) => view(p).rows.map((r) => (r.ok ? '✓ ' : '✕ ') + say(r));

describe('progress: calls and results', () => {
  it('shows a call as the current line and makes a row only when its result arrives, paired by tool_id', () => {
    n = 0;
    let p = start(T);
    p = push(p, ++n, 'tool_call', call('a', 'hoody_exec_routes', { action: 'discover' }));
    expect(say(view(p).line)).toBe('Looking at the addresses on atlas');
    expect(rowsOf(p)).toEqual([]);
    p = push(p, ++n, 'tool_call', call('b', 'hoody_exec_validate'));
    expect(say(view(p).line)).toBe('Running a code check');
    // The routes result arrives after the validate call: it settles its own call, not the latest one.
    p = push(p, ++n, 'tool_result', { tool_id: 'a', name: 'hoody_exec_routes', output: '[]' });
    expect(rowsOf(p)).toEqual(['✓ Looked at the addresses on atlas']);
    expect(say(view(p).line)).toBe('Running a code check');
    p = push(p, ++n, 'tool_result', { tool_id: 'b', name: 'hoody_exec_validate', output: '{"valid":false}' });
    // A ✓ says the check ran, never that it passed.
    expect(rowsOf(p)).toEqual(['✓ Looked at the addresses on atlas', '✓ Ran a code check']);
    expect(say(view(p).line)).toBe('Preparing the answer');
    // A result with no call of its own is no row.
    p = push(p, ++n, 'tool_result', { tool_id: 'zz', name: 'hoody_exec_validate' });
    expect(rowsOf(p)).toHaveLength(2);
  });

  it('a failed tool result is a ✕ row with its own words', () => {
    let p = start(T);
    p = push(p, 1, 'tool_call', call('a', 'hoody_exec_validate'));
    p = push(p, 2, 'tool_result', { tool_id: 'a', is_error: true, output: 'denied' });
    p = push(p, 3, 'tool_call', call('b', 'hoody_exec_routes'));
    p = push(p, 4, 'tool_result', { tool_id: 'b', is_error: true });
    expect(rowsOf(p)).toEqual(["✕ The code check didn't run", "✕ Couldn't look at the addresses"]);
  });

  it('names the monitor by its action', () => {
    expect(['health', 'stats', 'active'].map((a) => toolKind('hoody_exec_monitor', { action: a }))).toEqual(['health', 'health', 'health']);
    expect(toolKind('hoody_exec_monitor', { action: 'performance' })).toBe('perf');
    expect(toolKind('hoody_exec_monitor', {})).toBe('computer');
    expect(toolKind('hoody_exec_monitor', { action: 7 })).toBe('computer');
    expect(toolKind('bash')).toBeNull();
    let p = start(T);
    p = push(p, 1, 'tool_call', call('h', 'hoody_exec_monitor', { action: 'stats' }));
    expect(say(view(p).line)).toBe('Checking how atlas is doing');
    p = push(p, 2, 'tool_result', { tool_id: 'h' });
    p = push(p, 3, 'tool_call', call('q', 'hoody_exec_monitor', { action: 'performance', script_path: 'x.ts' }));
    expect(say(view(p).line)).toBe('Checking how a script performs');
    p = push(p, 4, 'tool_result', { tool_id: 'q' });
    p = push(p, 5, 'tool_call', call('c', 'hoody_exec_monitor'));
    expect(say(view(p).line)).toBe('Checking the computer');
    p = push(p, 6, 'tool_result', { tool_id: 'c' });
    expect(rowsOf(p)).toEqual(['✓ Checked how atlas is doing', '✓ Checked how a script performs', '✓ Checked the computer']);
  });

  it('a call of an unknown tool makes no row and the line goes back to preparing', () => {
    let p = start(T);
    p = push(p, 1, 'tool_call', call('x', 'bash'));
    p = push(p, 2, 'tool_result', { tool_id: 'x' });
    expect(rowsOf(p)).toEqual([]);
    expect(say(view(p).line)).toBe('Preparing the answer');
  });
});

describe('progress: reply text', () => {
  it('prose-only chunks say preparing, never writing code', () => {
    let p = start(T);
    p = push(p, 1, 'stream_chunk', { text: 'Summary: counts sign-ups.\nPath: /monday-at-9\n' });
    p = push(p, 2, 'stream_chunk', { text: 'Some more words, no fence.' });
    expect(say(view(p).line)).toBe('Preparing the answer');
  });

  it('counts the lines of a fenced block while it arrives (a partial count, across chunks)', () => {
    let p = start(T);
    p = push(p, 1, 'stream_chunk', { text: 'Summary: x\n``' });
    expect(say(view(p).line)).toBe('Preparing the answer');
    p = push(p, 2, 'stream_chunk', { text: '`ts\nconst a = 1;\nconst b' });
    expect(view(p).line).toEqual({ key: 'flow.build.code', vars: { n: 2 } });
    expect(say(view(p).line)).toBe('Writing the code (about 2 lines so far)');
    p = push(p, 3, 'stream_chunk', { text: ' = 2;\r\nreturn a + b;\n' });
    expect(view(p).line?.vars?.n).toBe(3);
    // A fence line with an info string inside the block is code, not its end.
    p = push(p, 4, 'stream_chunk', { text: '```js\n' });
    expect(view(p).line?.vars?.n).toBe(4);
    p = push(p, 5, 'stream_chunk', { text: '```\nThat is all.' });
    expect(say(view(p).line)).toBe('Preparing the answer');
  });

  it('a tool call ends the text before it: a fence left open does not carry over', () => {
    let p = start(T);
    p = push(p, 1, 'stream_chunk', { text: '```ts\nconst a = 1;\n' });
    p = push(p, 2, 'tool_call', call('v', 'hoody_exec_validate'));
    p = push(p, 3, 'tool_result', { tool_id: 'v' });
    p = push(p, 4, 'stream_chunk', { text: 'const b = 2;\n' });
    expect(say(view(p).line)).toBe('Preparing the answer');
  });
});

describe('progress: retry, gate, start, elapsed', () => {
  it('a retry is neutral whatever its reason and counts down from its arrival', () => {
    let p = start(T);
    p = frame(p, 'retry', env(1, 'retry', { attempt: 2, max_retries: 5, wait_secs: 30, reason: 'rate limited by the provider' }), 10_000);
    expect(say(view(p, { now: 10_000 }).line)).toBe('Waiting to try again in 30 s (2 of 5).');
    expect(say(view(p, { now: 22_500 }).line)).toBe('Waiting to try again in 18 s (2 of 5).');
    expect(say(view(p, { now: 99_000 }).line)).toBe('Waiting to try again in 0 s (2 of 5).');
    expect(JSON.stringify(view(p))).not.toMatch(/rate|limit|provider/);
    // The next frame replaces it.
    p = push(p, 2, 'stream_chunk', { text: 'ok' });
    expect(say(view(p).line)).toBe('Preparing the answer');
    // A malformed retry says nothing new.
    const q = push(start(T), 1, 'retry', { attempt: '2', max_retries: 5, wait_secs: 30 });
    expect(view(q).line).toBeNull();
  });

  it('a gate waits for an approval; the stored phase before the turn says starting', () => {
    let p = start(T);
    p = push(p, 1, 'confirm_request', { gate_id: 1 });
    expect(say(view(p).line)).toBe('Waiting for an approval in the agent');
    p = push(p, 2, 'gate_resolved', { kind: 'confirm', gate_id: 1 });
    expect(say(view(p).line)).toBe('Preparing the answer');
    expect(say(view(start(), { phase: 'create' }).line)).toBe('Starting the assistant on atlas…');
    expect(say(view(start(), { phase: 'turn' }).line)).toBe('Starting the assistant on atlas…');
    expect(view(start(T), { phase: 'sent' }).line).toBeNull();
  });

  it('elapsed reads 1 min 12 s and 40 s; unknown or future is nothing', () => {
    expect(say(elapsed(1000, 73_000))).toBe('1 min 12 s');
    expect(say(elapsed(1000, 41_000))).toBe('40 s');
    expect(elapsed(undefined, 5)).toBeNull();
    expect(elapsed(9000, 5)).toBeNull();
  });

  it('agent_done ends the line without saying how the turn ended', () => {
    let p = start(T);
    p = push(p, 1, 'tool_call', call('a', 'hoody_exec_validate'));
    p = push(p, 2, 'agent_done', { outcome: 'completed' });
    expect(p.ended).toBe(true);
    expect(view(p).line).toBeNull();
    const all = Object.keys(strings).filter((k) => k.startsWith('flow.build.')).map((k) => (strings as Record<string, string>)[k]).join(' ');
    expect(all).not.toMatch(/\b(done|finished|complete|failed|written)\b/i);
  });
});

describe('progress: only the attempt\'s own turn', () => {
  it('ignores frames of another turn, untagged frames, helper frames and everything before the turn id is known', () => {
    let p = start();
    p = push(p, 1, 'tool_call', call('a', 'hoody_exec_validate'));
    expect(view(p).line).toBeNull();
    p = withTurn(p, T);
    p = push(p, 2, 'tool_call', call('b', 'hoody_exec_validate'), { turn: 'turn-0' });
    p = push(p, 3, 'tool_call', call('c', 'hoody_exec_validate'), { turn: null });
    p = push(p, 4, 'tool_call', { ...call('d', 'hoody_exec_validate'), helper_id: 'h1' });
    expect(view(p).line).toBeNull();
    p = push(p, 5, 'tool_call', call('e', 'hoody_exec_routes'));
    expect(say(view(p).line)).toBe('Looking at the addresses on atlas');
    // withTurn never swaps a known turn.
    expect(withTurn(p, 'turn-9').turnId).toBe(T);
  });

  it('drops a frame whose SSE name does not match its type', () => {
    const p = frame(start(T), 'tool_result', env(1, 'tool_call', call('a', 'hoody_exec_validate')));
    expect(view(p).line).toBeNull();
  });
});

describe('progress: replay, then stream', () => {
  const rep = (events: unknown[], o: { min?: number; max?: number; inc?: string } = {}) => ({ incarnation: o.inc ?? INC, min_seq: o.min ?? 1, max_seq: o.max ?? events.length, events });

  it('applies the replay, opens the stream at its cursor and drops repeated seqs', () => {
    let p = start(T);
    p = replay(p, rep([env(1, 'tool_call', call('a', 'hoody_exec_routes')), env(2, 'tool_result', { tool_id: 'a' }), env(3, 'tool_call', call('b', 'hoody_exec_validate'))]), 1);
    expect(cursor(p)).toEqual({ since: '3', incarnation: INC });
    expect(rowsOf(p)).toEqual(['✓ Looked at the addresses on atlas']);
    expect(view(p).partial).toBe(false);
    // The stream repeats seq 2 and 3 (an overlap): nothing doubles.
    p = push(p, 2, 'tool_result', { tool_id: 'a' });
    p = push(p, 3, 'tool_call', call('b', 'hoody_exec_validate'));
    p = push(p, 4, 'tool_result', { tool_id: 'b' });
    expect(rowsOf(p)).toEqual(['✓ Looked at the addresses on atlas', '✓ Ran a code check']);
  });

  it('a turn that ended between the replay and the stream stays ended; later stream repeats change nothing', () => {
    let p = start(T);
    p = replay(p, rep([env(1, 'tool_call', call('a', 'hoody_exec_validate')), env(2, 'tool_result', { tool_id: 'a' }), env(3, 'agent_done', { outcome: 'completed' })]), 1);
    expect(p.ended).toBe(true);
    p = push(p, 3, 'agent_done', {});
    p = push(p, 1, 'tool_call', call('a', 'hoody_exec_validate'));
    expect(view(p).line).toBeNull();
    expect(rowsOf(p)).toEqual(['✓ Ran a code check']);
  });

  it('the replay cursor covers events of other turns too (max_seq)', () => {
    let p = start(T);
    p = replay(p, rep([env(4, 'stream_chunk', { text: 'x' }, { turn: 'turn-0' })], { min: 1, max: 9 }), 3);
    expect(cursor(p).since).toBe('9');
  });

  it('a turn start the replay no longer holds (evicted) marks the list partial', () => {
    const evicted = replay(start(T), rep([env(40, 'tool_call', call('a', 'hoody_exec_validate')), env(41, 'tool_result', { tool_id: 'a' })], { min: 40, max: 41 }), 12);
    expect(view(evicted).partial).toBe(true);
    expect(rowsOf(evicted)).toEqual(['✓ Ran a code check']);
    expect(strings['flow.build.partial']).toBe("Earlier steps aren't available");
    const held = replay(start(T), rep([env(13, 'tool_call', call('a', 'hoody_exec_validate'))], { min: 13, max: 13 }), 12);
    expect(view(held).partial).toBe(false);
    // No turn_since: only a replay that starts at the first seq is whole.
    expect(view(replay(start(T), rep([], { min: 5, max: 9 }))).partial).toBe(true);
    expect(view(replay(start(T), rep([], { min: 1, max: 9 }))).partial).toBe(false);
  });

  it('a replay_gap frame starts the list over, says so and asks for a fresh replay', () => {
    let p = start(T);
    p = push(p, 1, 'tool_call', call('a', 'hoody_exec_routes'));
    p = push(p, 2, 'tool_result', { tool_id: 'a' });
    p = frame(p, 'lagged', { code: 'replay_gap' });
    expect(p.resync).toBe(true);
    expect(view(p).partial).toBe(true);
    expect(rowsOf(p)).toEqual([]);
    // The fresh replay shows what the ring still holds; the list stays partial.
    p = replay(p, rep([env(2, 'tool_result', { tool_id: 'a' }), env(7, 'tool_call', call('b', 'hoody_exec_validate')), env(8, 'tool_result', { tool_id: 'b' })], { min: 2, max: 8 }), 0);
    expect(p.resync).toBe(false);
    expect(view(p).partial).toBe(true);
    expect(rowsOf(p)).toEqual(['✓ Ran a code check']);
    // A lagged frame of another kind changes nothing.
    expect(frame(p, 'lagged', { code: 'slow' })).toBe(p);
  });

  it('an incarnation change starts over, retires the old one and asks for a fresh replay', () => {
    let p = start(T);
    p = push(p, 5, 'tool_call', call('a', 'hoody_exec_routes'));
    p = push(p, 6, 'tool_result', { tool_id: 'a' });
    p = push(p, 1, 'tool_call', call('b', 'hoody_exec_validate'), { inc: 'inc-b' });
    expect(p.inc).toBe('inc-b');
    expect(p.resync).toBe(true);
    expect(view(p).partial).toBe(true);
    expect(rowsOf(p)).toEqual([]);
    // seq starts over in the new incarnation: seq 1 was applied, seq 2 is new.
    p = push(p, 2, 'tool_result', { tool_id: 'b' }, { inc: 'inc-b' });
    expect(rowsOf(p)).toEqual(['✓ Ran a code check']);
    // A late frame of the old incarnation is dropped.
    p = push(p, 7, 'tool_call', call('c', 'hoody_exec_routes'), { inc: INC });
    expect(say(view(p).line)).toBe('Preparing the answer');
    // So is a replay of it.
    expect(replay(p, rep([], { inc: INC }))).toBe(p);
    expect(resynced(p).resync).toBe(false);
  });

  it('a replay_boundary naming another incarnation starts over', () => {
    let p = push(start(T), 1, 'tool_call', call('a', 'hoody_exec_routes'));
    p = frame(p, 'replay_boundary', { incarnation: 'inc-b' });
    expect(p.inc).toBe('inc-b');
    expect(p.partial).toBe(true);
    expect(p.resync).toBe(true);
  });
});

describe('progress: /state snapshot', () => {
  it('fills the line when no frame said anything yet', () => {
    expect(say(view(snapshot(start(T), { current_step: { kind: 'model' } })).line)).toBe('Preparing the answer');
    expect(say(view(snapshot(start(T), { current_step: { kind: 'gate' } })).line)).toBe('Waiting for an approval in the agent');
    expect(say(view(snapshot(start(T), { current_step: { kind: 'tool', tool: 'hoody_exec_routes' } })).line)).toBe('Looking at the addresses on atlas');
    expect(say(view(snapshot(start(T), { current_step: { kind: 'tool', tool: 'hoody_exec_monitor' } })).line)).toBe('Checking the computer');
    expect(view(snapshot(start(T), { current_step: { kind: 'idle' } })).line).toBeNull();
  });

  it('never replaces newer frames with an older snapshot', () => {
    let p = push(start(T), 5, 'tool_call', call('a', 'hoody_exec_validate'));
    expect(say(view(snapshot(p, { incarnation: INC, seq: 4, current_step: { kind: 'model' } })).line)).toBe('Running a code check');
    expect(say(view(snapshot(p, { current_step: { kind: 'model' } })).line)).toBe('Running a code check');
    expect(say(view(snapshot(p, { incarnation: 'other', seq: 9, current_step: { kind: 'model' } })).line)).toBe('Running a code check');
    p = snapshot(p, { incarnation: INC, seq: 5, current_step: { kind: 'model' } });
    expect(say(view(p).line)).toBe('Preparing the answer');
  });
});
