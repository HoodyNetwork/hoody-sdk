// The files a chat's edit tools changed, read the same way live and from history, and kept in memory only.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as C from './conv';
import { EDIT_ROWS, EDITS_KEEP, EDITS_PENDING, TEXT_MAX, addEdit, editOf, editRows, foldEdits, settleEdit, turnFiles, type Edit, type TurnEdits } from './edits';
import * as L from './logic';
import type { Snapshot } from './engine';
import { convSnapshot, type Host } from './source';
import { cacheBlocks } from './transcriptCache';

let SEQ = 0;
const env = (type: string, data: any) => ({ seq: ++SEQ, incarnation: 'i1', turn_id: 'T1', event: { type, data } });
const frame = (e: any): L.Action => ({ type: 'frame', name: e.event.type.slice(6), data: e, now: 0 });
const user = (id: string, text: string, p: Partial<C.UserMsg> = {}): C.UserMsg => ({ id, text, at: 0, key: 'k' + id, via: 'turn', state: 'sent', turnId: null, commandId: null, reason: '', ...p });
function started(): C.Conv {
  let c = C.addUser(C.emptyConv('s1'), user('1', 'fix it', { via: 'create', state: 'sending' }));
  c = C.addTurn(c, { turnId: 'T1', user: '1', now: 0 });
  return C.patchUser(c, '1', { state: 'sent', turnId: 'T1' });
}
const HOST: Host = { computer: 'atlas', realm: 'Personal', folder: '/home/me/app' };
function snap(conv: C.Conv): Snapshot {
  return {
    phase: 'ready', blocked: null, band: null, starting: false, conv, status: null, gates: [], gate: null,
    decision: { pending: false, unknown: false }, dormant: false, checking: false, auto: { cap: false, on: null, busy: false, err: '', note: '' },
    needLogin: false, followUps: true, recent: null, version: 1, sendable: true, dup: null, att: { items: [], refused: [], dropped: '', reading: false },
  } as Snapshot;
}

/** One call: [id, tool, input, result]; result null = none yet. */
type Call = [string, string, Record<string, unknown>, Record<string, unknown> | null];
const SECRET = 'TOP-SECRET-WRITE-CONTENT-7f3a';
const CALLS: Call[] = [
  ['a', 'edit_file', { path: 'src/app.ts', old_string: 'let x = 1', new_string: 'let x = 2', mode: 'x' }, {}],
  ['b', 'write_file', { path: '/home/me/app/README.md', content: SECRET }, {}],
  ['c', 'edit_file', { path: 'src/gone.ts', old_string: 'a', new_string: 'b' }, {}],
  ['d', 'delete_file', { path: 'src/gone.ts' }, {}],
  ['e', 'edit_file', { path: 'src/fail.ts', old_string: 'q', new_string: 'r' }, { is_error: true, output: 'not found' }],
  ['f', 'edit_minified_file', { path: 'src/maybe.css', old_string: 'color-crimson', new_string: 'color-azure', computer: 'orca.1a2b' }, { is_error: true, error_code: 'outcome_unknown' }],
  ['g', 'bash', { command: 'rm -rf build' }, {}],
  ['h', 'write_minified_file', { path: 'src/open.js', content: 'x' }, null],
];

function live(calls: Call[]): C.Conv {
  let c = started();
  for (const [id, name, input, res] of calls) {
    c = C.onTurn(c, frame(env('event.tool_call', { tool_id: id, name, summary: '', arguments: input })));
    if (res) c = C.onTurn(c, frame(env('event.tool_result', { tool_id: id, ...res })));
  }
  c = C.onTurn(c, frame(env('event.stream_chunk', { text: 'Done.' })));
  c = C.onTurn(c, frame(env('event.agent_done', { outcome: 'completed' })));
  return C.onTurn(c, { type: 'receipt', body: { turn_id: 'T1', state: 'completed' } }, 5000);
}
function history(calls: Call[]): C.Conv {
  const messages: any[] = [{ role: 'user', blocks: [{ kind: 'text', text: 'fix it' }] }];
  for (const [id, name, input, res] of calls) {
    messages.push({ role: 'assistant', blocks: [{ kind: 'tool_use', tool_id: id, tool_name: name, input }] });
    if (res) messages.push({ role: 'user', blocks: [{ kind: 'tool_result', tool_id: id, ...res }] });
  }
  messages.push({ role: 'assistant', blocks: [{ kind: 'text', text: 'Done.' }] });
  const h = C.historyFrom({ messages }, { liveTail: false, idOf: (i) => 'h' + i, at: 0 });
  return { ...C.emptyConv('s1'), users: Object.fromEntries(h.users.map((u) => [u.id, u])), turns: h.turns };
}
const rows = (c: C.Conv) => foldEdits(c.turns.map((t) => t.s.edits)).map(({ key: _k, ...r }) => r);

describe('editOf: an allowlist per tool', () => {
  it('an edit keeps path, old, new and replace_all; nothing else', () => {
    expect(editOf('a', 'edit_file', { path: 'p', old_string: 'o', new_string: 'n', replace_all: true, extra: 'z' })).toEqual({ id: 'a', verb: 'edited', path: 'p', old: 'o', new: 'n', all: true, ok: null });
  });
  it('a write keeps its length, never its content', () => {
    const e = editOf('b', 'write_file', { path: 'p', content: SECRET });
    expect(e).toEqual({ id: 'b', verb: 'written', path: 'p', size: SECRET.length, ok: null });
    expect(JSON.stringify(e)).not.toContain(SECRET);
  });
  it('texts are cut at TEXT_MAX and say so; an over-long or missing path is no edit', () => {
    const e = editOf('a', 'edit_file', { path: 'p', old_string: 'x'.repeat(TEXT_MAX + 5), new_string: 'y' });
    expect(e?.old).toHaveLength(TEXT_MAX);
    expect(e?.cut).toBe(true);
    expect(editOf('a', 'edit_file', { path: 'p'.repeat(2000), old_string: 'o', new_string: 'n' })).toBeNull();
    expect(editOf('a', 'delete_file', {})).toBeNull();
    expect(editOf('a', 'read_file', { path: 'p' })).toBeNull();
    expect(editOf('a', 'edit_file', 'nope')).toBeNull();
  });
  it('a delegated session’s redacted arguments are kept as given', () => {
    expect(editOf('a', 'edit_file', { path: 'p', old_string: 'key=[REDACTED]', new_string: 'key=[REDACTED#2]' })).toMatchObject({ old: 'key=[REDACTED]', new: 'key=[REDACTED#2]' });
  });
});

describe('the chat’s files', () => {
  const want = [
    { verb: 'edited', path: 'src/app.ts', old: 'let x = 1', new: 'let x = 2' },
    { verb: 'written', path: '/home/me/app/README.md', size: SECRET.length },
    { verb: 'deleted', path: 'src/gone.ts' },
    { verb: 'edited', path: 'src/maybe.css', computer: 'orca.1a2b', old: 'color-crimson', new: 'color-azure', unsure: true },
  ];
  it('live: ran counts, failed is none, unknown may have, no result yet shows nothing, delete after edit reads deleted', () => {
    expect(rows(live(CALLS))).toEqual(want);
  });
  it('history reads the same files', () => {
    expect(rows(history(CALLS))).toEqual(rows(live(CALLS)));
  });
  it('past the steps’ window (200) every edit is still listed', () => {
    const many: Call[] = Array.from({ length: 260 }, (_, i) => [`x${i}`, 'edit_file', { path: `f${i}.ts`, old_string: 'a', new_string: 'b' }, {}]);
    const c = live(many);
    expect(c.turns[0]!.s.steps.length).toBeLessThanOrEqual(200);
    expect(rows(c)).toHaveLength(260);
    expect(rows(history(many))).toHaveLength(260);
  });
  it('a turn keeps one entry per file that ran; a replayed call is one edit', () => {
    const many: Call[] = Array.from({ length: 1020 }, (_, i) => [`x${i}`, 'edit_file', { path: `f${i}`, old_string: 'a', new_string: 'b' }, {}]);
    expect(live(many).turns[0]!.s.edits).toHaveLength(1020);
    const same: Call[] = Array.from({ length: 30 }, (_, i) => [`y${i}`, 'edit_file', { path: 'one', old_string: 'a', new_string: String(i) }, {}]);
    expect(live(same).turns[0]!.s.edits).toHaveLength(1);
    let c = started();
    const call = env('event.tool_call', { tool_id: 'a', name: 'edit_file', arguments: { path: 'p', old_string: 'a', new_string: 'b' } });
    c = C.onTurn(c, frame(call));
    c = C.onTurn(c, frame({ ...call, seq: ++SEQ }));
    expect(c.turns[0]!.s.edits).toHaveLength(1);
  });
  it('a call seen again after its result keeps the result (a replay without the result again)', () => {
    let c = started();
    const call = env('event.tool_call', { tool_id: 'a', name: 'edit_file', arguments: { path: 'p', old_string: 'a', new_string: 'b' } });
    c = C.onTurn(c, frame(call));
    c = C.onTurn(c, frame(env('event.tool_result', { tool_id: 'a' })));
    c = C.onTurn(c, frame({ ...call, seq: ++SEQ }));
    expect(rows(c).map((r) => r.path)).toEqual(['p']);
  });
  it('a replaced call goes: one edit of a, then many of b, keeps a and the last b', () => {
    const many: Call[] = [['a0', 'edit_file', { path: 'a', old_string: 'x', new_string: 'y' }, {}], ...Array.from({ length: 505 }, (_, i): Call => [`b${i}`, 'edit_file', { path: 'b', old_string: 'x', new_string: String(i) }, {}])];
    expect(rows(live(many)).map((r) => [r.path, r.new])).toEqual([['a', 'y'], ['b', '504']]);
  });
  it('a failed call keeps the call before it: 500 files, then a failed edit of the first, keeps all 500', () => {
    const many: Call[] = Array.from({ length: EDIT_ROWS }, (_, i): Call => [`f${i}`, 'edit_file', { path: `f${i}`, old_string: 'x', new_string: 'y' }, {}]);
    const c = live([...many, ['again', 'edit_file', { path: 'f0', old_string: 'y', new_string: 'z' }, { is_error: true, output: 'no match' }]]);
    expect(rows(c)).toHaveLength(EDIT_ROWS);
    expect(rows(c).find((r) => r.path === 'f0')).toMatchObject({ old: 'x', new: 'y' });
  });
  it('a new incarnation (the session attached again) starts the turn’s calls afresh', () => {
    let s = L.reduce(L.initial({ turnId: 'T1' }), frame(env('event.tool_call', { tool_id: 'a', name: 'delete_file', arguments: { path: 'p' } })));
    s = L.reduce(s, frame(env('event.tool_result', { tool_id: 'a' })));
    expect(s.edits).toHaveLength(1);
    s = L.reduce(s, frame({ seq: 1, incarnation: 'i2', turn_id: 'T1', event: { type: 'event.stream_chunk', data: { text: 'x' } } }));
    expect(s.edits).toEqual([]);
  });
  it('the same path on another computer is another file', () => {
    const c = live([
      ['a', 'edit_file', { path: 'p', old_string: 'a', new_string: 'b' }, {}],
      ['b', 'delete_file', { path: 'p', computer: 'orca.1a2b' }, {}],
    ]);
    expect(rows(c).map((r) => r.verb)).toEqual(['edited', 'deleted']);
  });
  it('a helper’s calls are not the chat’s', () => {
    let c = started();
    c = C.onTurn(c, frame(env('event.tool_call', { tool_id: 'a', name: 'edit_file', helper_id: 'h1', arguments: { path: 'p', old_string: 'a', new_string: 'b' } })));
    c = C.onTurn(c, frame(env('event.tool_result', { tool_id: 'a', helper_id: 'h1' })));
    expect(rows(c)).toEqual([]);
  });
  it('the last reply of a finished turn carries the count, never the files', () => {
    const bs = C.blocks(live(CALLS), 0);
    const reply = bs.find((b) => b.k === 'reply') as any;
    expect(reply.files).toBe(4);
    expect(turnFiles(live(CALLS).turns[0]!.s)).toBe(4);
  });
});

describe('Edits lists the newest 500 files and counts the rest', () => {
  const files = (n: number, from = 0, res: Record<string, unknown> | null = {}): Call[] =>
    Array.from({ length: n }, (_, i): Call => [`w${from + i}`, 'edit_file', { path: `f${from + i}`, old_string: 'o', new_string: `n${from + i}` }, res]);
  /** The calls (results as given), then results that come later, then the turn's end. */
  function delayed(calls: Call[], later: [string, Record<string, unknown>][]): C.Conv {
    let c = started();
    for (const [id, name, input, res] of calls) {
      c = C.onTurn(c, frame(env('event.tool_call', { tool_id: id, name, summary: '', arguments: input })));
      if (res) c = C.onTurn(c, frame(env('event.tool_result', { tool_id: id, ...res })));
    }
    for (const [id, res] of later) c = C.onTurn(c, frame(env('event.tool_result', { tool_id: id, ...res })));
    c = C.onTurn(c, frame(env('event.agent_done', { outcome: 'completed' })));
    return C.onTurn(c, { type: 'receipt', body: { turn_id: 'T1', state: 'completed' } }, 5000);
  }
  /** The same, read from history: results after all the calls. */
  function delayedHistory(calls: Call[], later: [string, Record<string, unknown>][]): C.Conv {
    const messages: any[] = [{ role: 'user', blocks: [{ kind: 'text', text: 'fix it' }] }];
    for (const [id, name, input] of calls) messages.push({ role: 'assistant', blocks: [{ kind: 'tool_use', tool_id: id, tool_name: name, input }] });
    for (const [id, res] of later) messages.push({ role: 'user', blocks: [{ kind: 'tool_result', tool_id: id, ...res }] });
    messages.push({ role: 'assistant', blocks: [{ kind: 'text', text: 'Done.' }] });
    const h = C.historyFrom({ messages }, { liveTail: false, idOf: (i) => 'h' + i, at: 0 });
    return { ...C.emptyConv('s1'), users: Object.fromEntries(h.users.map((u) => [u.id, u])), turns: h.turns };
  }
  const view = (c: C.Conv) => convSnapshot(snap(c), HOST, 0);
  const fail = { is_error: true, output: 'no match' };

  it('500 files: all listed, nothing more', () => {
    const v = view(live(files(EDIT_ROWS)));
    expect(v.edits).toHaveLength(EDIT_ROWS);
    expect(v.editsMore).toBeUndefined();
  });
  it('one file more: the newest 500 are listed, each with its change, and 1 is counted, live and from history', () => {
    for (const c of [live(files(EDIT_ROWS + 1)), history(files(EDIT_ROWS + 1))]) {
      const v = view(c);
      expect(v.edits).toHaveLength(EDIT_ROWS);
      expect(v.edits!.some((e) => e.path === 'f0')).toBe(false);
      expect(v.edits!.at(-1)!.path).toBe(`f${EDIT_ROWS}`);
      expect(v.edits!.every((e) => e.diff && !e.cut)).toBe(true);
      expect(v.editsMore).toBe(1);
    }
  });
  it('more than 2000 files in one turn are all counted, and a file written again is a row, not a second count', () => {
    const v = view(live(files(2100)));
    expect(v.edits).toHaveLength(EDIT_ROWS);
    expect(v.editsMore).toBe(2100 - EDIT_ROWS);
    const again = view(live([...files(2100), ['again', 'edit_file', { path: 'f0', old_string: 'o', new_string: 'again' }, {}]]));
    expect(again.edits!.at(-1)).toMatchObject({ path: 'f0', diff: { new: 'again' } });
    expect(again.editsMore).toBe(2100 - EDIT_ROWS);
  });
  it('calls whose results come later count only once they ran: none yet is nothing, failed is nothing', () => {
    const calls = files(EDITS_PENDING + 1, 0, null);
    const ids = calls.map((x) => x[0]);
    expect(view(delayed(calls, [])).edits).toEqual([]);
    expect(view(delayed(calls, [])).editsMore).toBeUndefined();
    for (const c of [delayed(calls, ids.map((id) => [id, fail])), delayedHistory(calls, ids.map((id) => [id, fail]))]) {
      expect(view(c).edits).toEqual([]);
      expect(view(c).editsMore).toBeUndefined();
    }
    for (const c of [delayed(calls, ids.map((id) => [id, {}])), delayedHistory(calls, ids.map((id) => [id, {}]))]) {
      const v = view(c);
      expect(v.edits).toHaveLength(EDIT_ROWS);
      expect(v.edits!.every((e) => e.diff && !e.cut)).toBe(true);
      expect(v.editsMore).toBe(EDITS_PENDING + 1 - EDIT_ROWS);
    }
    const unsure = view(delayed(calls.slice(0, 3), [['w0', { is_error: true, error_code: 'outcome_unknown' }]]));
    expect(unsure.edits).toEqual([expect.objectContaining({ path: 'f0', unsure: true })]);
  });
  it('a file that ran stays listed while many later calls wait and then fail', () => {
    const later = files(EDITS_PENDING, 1, null);
    const A: Call = ['a', 'edit_file', { path: 'A', old_string: 'x', new_string: 'y' }, {}];
    const v = view(delayed([A, ...later], later.map((x) => [x[0], fail])));
    expect(v.edits).toEqual([expect.objectContaining({ path: 'A', diff: { old: 'x', new: 'y' } })]);
    expect(v.editsMore).toBeUndefined();
    // From history its result comes after them all: still listed. Within EDITS_PENDING waiting calls it keeps its change; past
    // them it keeps its file and says its change was cut (the texts of the oldest waiting calls are not kept).
    const fails = (n: number) => files(n, 1, null).map((x): [string, Record<string, unknown>] => [x[0], fail]);
    const h = view(delayedHistory([[...A.slice(0, 3), null] as Call, ...files(EDITS_PENDING - 1, 1, null)], [['a', {}], ...fails(EDITS_PENDING - 1)]));
    expect(h.edits).toEqual([expect.objectContaining({ path: 'A', diff: { old: 'x', new: 'y' } })]);
    const past = view(delayedHistory([[...A.slice(0, 3), null] as Call, ...later], [['a', {}], ...fails(EDITS_PENDING)]));
    expect(past.edits).toEqual([expect.objectContaining({ path: 'A', cut: true })]);
    expect(past.edits![0]!.diff).toBeUndefined();
    expect(past.editsMore).toBeUndefined();
  });
  it('a file changed in two turns shows its newest change once', () => {
    const one = live([['a', 'edit_file', { path: 'A', old_string: 'x', new_string: 'one' }, {}]]);
    const two = live([['b', 'edit_file', { path: 'A', old_string: 'one', new_string: 'two' }, {}]]);
    const v = view({ ...one, turns: [one.turns[0]!, { ...two.turns[0]!, idx: 1 }] } as C.Conv);
    expect(v.edits).toEqual([expect.objectContaining({ path: 'A', diff: { old: 'one', new: 'two' } })]);
    expect(v.editsMore).toBeUndefined();
  });
  it('past EDITS_KEEP entries the oldest goes and a file that ran is still counted', () => {
    const t: TurnEdits = { edits: Array.from({ length: EDITS_KEEP }, (_, i): Edit => ({ id: `k${i}`, verb: 'deleted', path: `k${i}`, ok: true })), editsLost: 0, editsSeen: new Set(), editsFailed: new Set() };
    addEdit(t, { id: 'new', verb: 'deleted', path: 'new', ok: null });
    expect(t.edits).toHaveLength(EDITS_KEEP);
    expect(t.editsLost).toBe(1);
    expect(turnFiles(t)).toBe(EDITS_KEEP);
    expect(editRows([t]).more).toBe(EDITS_KEEP - EDIT_ROWS);
  });
  it("a turn keeps an edit's texts for its newest 500 files only; an older one is past every list", () => {
    const c = live(files(EDIT_ROWS + 10));
    const kept = c.turns[0]!.s.edits.filter((e) => e.old !== undefined);
    expect(kept).toHaveLength(EDIT_ROWS);
    expect(c.turns[0]!.s.edits.slice(0, 10).every((e) => e.old === undefined && e.cut)).toBe(true);
  });
  it('a replay of a call a later edit of its file replaced keeps the newer edit, live and from history', () => {
    const A: Call = ['a', 'edit_file', { path: 'P', old_string: 'x', new_string: 'old' }, {}];
    const B: Call = ['b', 'edit_file', { path: 'P', old_string: 'old', new_string: 'new' }, {}];
    const F: Call = ['f', 'edit_file', { path: 'Q', old_string: 'x', new_string: 'y' }, fail];
    for (const c of [live([A, B, F, A, F]), history([A, B, F, A, F])]) {
      expect(view(c).edits).toEqual([expect.objectContaining({ path: 'P', diff: { old: 'old', new: 'new' } })]);
      expect(view(c).editsMore).toBeUndefined();
    }
  });
  it('failed calls never push a replaced call out: a replay of it after 20000 failures keeps the newer edit', () => {
    const t: TurnEdits = { edits: [], editsLost: 0, editsSeen: new Set(), editsFailed: new Set() };
    const A: Edit = { id: 'a', verb: 'edited', path: 'P', old: 'x', new: 'old', ok: null };
    addEdit(t, A); settleEdit(t, 'a', { ok: true });
    addEdit(t, { ...A, id: 'b', old: 'old', new: 'new' }); settleEdit(t, 'b', { ok: true });
    for (let i = 0; i < EDITS_KEEP + 5; i++) { addEdit(t, { id: `f${i}`, verb: 'edited', path: 'Q', old: 'x', new: 'y', ok: null }); settleEdit(t, `f${i}`, { ok: false }); }
    addEdit(t, A); settleEdit(t, 'a', { ok: true });
    expect(editRows([t]).rows).toEqual([expect.objectContaining({ path: 'P', new: 'new' })]);
  });
  it('a replay of a failed call while 1000 calls wait keeps every waiting call\'s change, live and from history', () => {
    const F: Call = ['bad', 'edit_file', { path: 'Q', old_string: 'x', new_string: 'y' }, fail];
    const waiting = files(EDITS_PENDING, 0, null);
    const v = view(delayed([F, ...waiting, F], [['w0', {}]]));
    expect(v.edits).toEqual([expect.objectContaining({ path: 'f0', diff: { old: 'o', new: 'n0' } })]);
    const messages: any[] = [{ role: 'user', blocks: [{ kind: 'text', text: 'fix it' }] }];
    const use = ([id, name, input]: Call) => messages.push({ role: 'assistant', blocks: [{ kind: 'tool_use', tool_id: id, tool_name: name, input }] });
    const result = (id: string, res: Record<string, unknown>) => messages.push({ role: 'user', blocks: [{ kind: 'tool_result', tool_id: id, ...res }] });
    use(F); result('bad', fail); waiting.forEach(use); use(F); result('bad', fail); result('w0', {});
    messages.push({ role: 'assistant', blocks: [{ kind: 'text', text: 'Done.' }] });
    const h = C.historyFrom({ messages }, { liveTail: false, idOf: (i) => 'h' + i, at: 0 });
    const hv = view({ ...C.emptyConv('s1'), users: Object.fromEntries(h.users.map((u) => [u.id, u])), turns: h.turns });
    expect(hv.edits).toEqual([expect.objectContaining({ path: 'f0', diff: { old: 'o', new: 'n0' } })]);
  });
  it('a replayed waiting call past the pending limit keeps its change cut, live and from history', () => {
    const calls = files(EDITS_PENDING + 5, 0, null);
    const again = calls.slice(0, 3);
    const ok = again.map((x): [string, Record<string, unknown>] => [x[0], {}]);
    for (const c of [delayed([...calls, ...again], ok), delayedHistory([...calls, ...again], ok)]) {
      const v = view(c);
      expect(v.edits!.map((e) => e.path)).toEqual(['f0', 'f1', 'f2']);
      expect(v.edits!.every((e) => e.cut && !e.diff)).toBe(true);
    }
  });
  it('a replay of a waiting call whose texts were dropped does not get them back', () => {
    const t: TurnEdits = { edits: [], editsLost: 0, editsSeen: new Set(), editsFailed: new Set() };
    const call = (i: number): Edit => ({ id: `p${i}`, verb: 'edited', path: `p${i}`, old: 'o', new: 'n', ok: null });
    for (let i = 0; i <= EDITS_PENDING + 5; i++) addEdit(t, call(i));
    for (let i = 0; i <= EDITS_PENDING + 5; i++) addEdit(t, call(i));
    expect(t.edits.filter((e) => e.old !== undefined)).toHaveLength(EDITS_PENDING);
    expect(t.edits.slice(0, 6).every((e) => e.old === undefined && e.cut)).toBe(true);
  });
  it('a new incarnation clears the count with the list', () => {
    let s = L.reduce(L.initial({ turnId: 'T1' }), frame(env('event.stream_chunk', { text: 'a' })));
    s = { ...s, editsLost: 3, editsSeen: new Set(['x']), editsFailed: new Set(['y']) };
    s = L.reduce(s, frame({ seq: 1, incarnation: 'i2', turn_id: 'T1', event: { type: 'event.stream_chunk', data: { text: 'x' } } }));
    expect(s.editsLost).toBe(0);
    expect(s.editsSeen.size).toBe(0);
    expect(s.editsFailed.size).toBe(0);
  });
});

describe('convSnapshot: the edits for Details', () => {
  it('relative paths open their folder under the chat’s; another computer’s file has no Open; sizes and unsure carried', () => {
    const v = convSnapshot(snap(live(CALLS)), HOST, 0, 'atlas.9f9f').edits!;
    expect(v.map((e) => [e.verb, e.path, e.open ?? null])).toEqual([
      ['edited', 'src/app.ts', '/files?computer=atlas.9f9f&path=%2Fhome%2Fme%2Fapp%2Fsrc'],
      ['written', '/home/me/app/README.md', '/files?computer=atlas.9f9f&path=%2Fhome%2Fme%2Fapp'],
      ['deleted', 'src/gone.ts', '/files?computer=atlas.9f9f&path=%2Fhome%2Fme%2Fapp%2Fsrc'],
      ['edited', 'src/maybe.css', null],
    ]);
    expect(v[0]!.diff).toEqual({ old: 'let x = 1', new: 'let x = 2' });
    expect(v[1]!.diff).toBeUndefined();
    expect(v[1]!.meta).toContain(String(SECRET.length));
    expect(v[3]).toMatchObject({ unsure: true, computer: 'orca.1a2b' });
  });
  it('no handle: no Open', () => {
    expect(convSnapshot(snap(live(CALLS)), HOST, 0).edits!.some((e) => e.open)).toBe(false);
  });
});

describe('memory only', () => {
  afterEach(() => vi.restoreAllMocks());
  it('no edit data rides a block or a step; a write’s content is nowhere in the snapshot', () => {
    for (const c of [live(CALLS), history(CALLS)]) {
      const s = convSnapshot(snap(c), HOST, 0, 'atlas.9f9f');
      expect(JSON.stringify(s)).not.toContain(SECRET);
      const blocks = JSON.stringify(s.blocks);
      // A step names its file (its summary); what an edit changed is in no block.
      for (const t of ['let x = 1', 'let x = 2', 'color-crimson', 'color-azure']) expect(blocks).not.toContain(t);
      // The engine's state never holds a write's content either (only its length).
      expect(JSON.stringify(c.turns.map((t) => t.s.edits))).not.toContain(SECRET);
      expect(JSON.stringify(c.turns.map((t) => t.s.steps))).not.toContain('let x = 2');
    }
  });
  it('the local chat copy (09b, cacheBlocks of the view) holds no edit: no diff, no write content, no count', () => {
    for (const c of [live(CALLS), history(CALLS)]) {
      const kept = JSON.stringify(cacheBlocks(convSnapshot(snap(c), HOST, 0, 'atlas.9f9f').blocks));
      for (const t of [SECRET, 'let x = 1', 'let x = 2', 'color-crimson', 'color-azure', '"files"']) expect(kept).not.toContain(t);
    }
  });
  it('a write held before its turn is known keeps its length only, never its content', () => {
    let s = L.initial({});
    s = L.reduce(s, frame(env('event.tool_call', { tool_id: 'w', name: 'write_file', arguments: { path: 'p', content: SECRET } })));
    expect(s.buffer).toHaveLength(1);
    expect(JSON.stringify(s)).not.toContain(SECRET);
    s = L.reduce(s, { type: 'turn', turnId: 'T1' } as L.Action);
    s = L.reduce(s, frame(env('event.tool_result', { tool_id: 'w' })));
    expect(foldEdits([s.edits])).toEqual([expect.objectContaining({ verb: 'written', path: 'p', size: SECRET.length })]);
    expect(JSON.stringify(s)).not.toContain(SECRET);
  });
  it('reading, folding and drawing the edits writes nothing to any storage', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    const open = typeof indexedDB !== 'undefined' ? vi.spyOn(indexedDB, 'open') : null;
    convSnapshot(snap(live(CALLS)), HOST, 0, 'atlas.9f9f');
    convSnapshot(snap(history(CALLS)), HOST, 0, 'atlas.9f9f');
    expect(set).not.toHaveBeenCalled();
    if (open) expect(open).not.toHaveBeenCalled();
  });
});
