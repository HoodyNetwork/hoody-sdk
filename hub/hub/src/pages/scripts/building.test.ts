// Vitest (C9): which builds the Being built section lists, and each row's pill and actions. Unreadable is
// can't tell yet, never failed; an extract failure on a readable answer is "No usable script"; a deploy hides Discard.
// Unreadable rows and failed extracts each keep their own pill.
import { DRAFTS_MAX, SCRIPT_ASKS_MAX, type DraftRecord, type ScriptAsk } from '@core';
import { R1, TARGET } from '@core/test/env';
import { describe, expect, it } from 'vitest';
import { labelOf, listOf, mayRun, readsState, rowOf, stepOf, unsettled, computerNameOf, type BuildEntry, type BuildFacts } from './building';
import type { Binding } from './data';
import { DEPLOY_BEAT_STALE_MS } from './new/records';
import { attemptPath, type Receipt } from './writer';

const P = TARGET.project.id;
const C = TARGET.container.id;
const B: Binding = { target: TARGET, realm: R1, owner: 'fp1', exec: 1 };
let seq = 0;
const ask = (path: string | null, o: Partial<ScriptAsk> = {}): ScriptAsk => ({ askId: `ask${++seq}`, compId: C, path, realm: R1, owner: 'fp1', sessionId: 's1', turnId: 't1', phase: 'read', sentAt: seq, createKey: 'ck', turnKey: 'tk', ...o });
const att = (draftId: string, n: number, o: Partial<ScriptAsk> = {}) => ask(attemptPath(P, draftId, n), o);
const draft = (draftId: string, o: Partial<DraftRecord> = {}): DraftRecord => ({ draftId, mode: 'ai', project: P, compId: C, realm: R1, owner: 'fp1', exec: 1, current: 1, retained: null, state: 'open', deploy: null, updatedAt: 1, ...o });
const R = (state: string, ended: boolean, code = state, turnId = 't1'): Receipt => ({ turnId, state, ended, code });
const text = (t: string) => ({ kind: 'text', text: t });
const tr = (final: string) => ({ turns_total: 1, messages: [{ role: 'user', blocks: [text('go')] }, { role: 'assistant', blocks: [text(final)] }] });
const ANSWER = 'Summary: it works\n```ts\nreturn 1;\n```';
const entry = (o: Partial<BuildEntry> = {}): BuildEntry => { const a = o.ask === undefined ? att('dddddddddd', 1) : o.ask; return { key: 'dddddddddd', draftId: 'dddddddddd', record: draft('dddddddddd'), asks: a ? [a] : [], legacy: false, ...o, ask: a }; };
const row = (f: BuildFacts, o: Partial<BuildEntry> = {}, now?: number) => rowOf(entry(o), f, now);
const read = (receipt: BuildFacts['receipt'], transcript?: unknown): BuildFacts => ({ binding: B, receipt, ...(transcript === undefined ? {} : { transcript }) });

describe('listOf: which builds', () => {
  it('a draft with a stored current attempt is one row showing that attempt; older attempts are kept with it', () => {
    const a1 = att('aaaaaaaaaa', 1), a2 = att('aaaaaaaaaa', 2);
    const l = listOf([draft('aaaaaaaaaa', { current: 2, retained: 1 })], [a1, a2]);
    expect(l.entries).toHaveLength(1);
    expect(l.entries[0]!.ask).toBe(a2);
    expect(l.entries[0]!.asks).toEqual([a1, a2]);
  });

  it('the current attempt not stored: the retained one is shown', () => {
    const a1 = att('aaaaaaaaaa', 1);
    expect(listOf([draft('aaaaaaaaaa', { current: 2, retained: 1 })], [a1]).entries).toEqual([expect.objectContaining({ key: 'aaaaaaaaaa', ask: a1, record: expect.objectContaining({ draftId: 'aaaaaaaaaa' }) })]);
  });

  it('the attempt is matched by n, never by the highest stored n', () => {
    const a1 = att('aaaaaaaaaa', 1), a3 = att('aaaaaaaaaa', 3);
    expect(listOf([draft('aaaaaaaaaa', { current: 1, retained: null })], [a1, a3]).entries[0]!.ask).toBe(a1);
  });

  it('an open draft with no stored attempt is not listed (nothing being built)', () => {
    expect(listOf([draft('aaaaaaaaaa', { mode: 'idea', current: 0 })], []).entries).toEqual([]);
  });

  // ---- a reserved attempt with no stored ask holds a draft slot admission never takes ----
  it('an open draft that reserved an attempt but stored no ask is listed: Not started, Open and Discard, no stop', () => {
    const l = listOf([draft('aaaaaaaaaa', { current: 1 })], []);
    expect(l.entries).toEqual([expect.objectContaining({ key: 'aaaaaaaaaa', ask: null, asks: [] })]);
    const r = rowOf(l.entries[0]!, {});
    expect(r).toEqual({ pill: 'notStarted', actions: ['open', 'discard'] });
    expect(mayRun(r)).toBe(false);
    expect(unsettled(r)).toBe(false);
  });

  it('the draft store full with no draft that can make room is its own flag, apart from the ask store', () => {
    const reserved = Array.from({ length: DRAFTS_MAX }, (_, i) => draft(`d${String(i).padStart(9, '0')}`, { current: 1 }));
    const l = listOf(reserved, []);
    expect(l.draftsFull).toBe(true);
    expect(l.full).toBe(false);
    expect(l.entries).toHaveLength(DRAFTS_MAX);
    // One draft that never reserved an attempt can make room: not full.
    expect(listOf([...reserved.slice(1), draft('zzzzzzzzzz', { current: 0 })], []).draftsFull).toBe(false);
    expect(listOf(reserved.slice(1), []).draftsFull).toBe(false);
  });

  it('a draft under a deploy is listed even with no stored ask; its deploy attempt is the one shown', () => {
    const d = draft('aaaaaaaaaa', { state: 'deploying', current: 2, retained: 1, deploy: { kind: 'write', path: '/a.ts', opId: 'op', sentAfter: 1, attempt: 1, beatAt: 1, phase: 'held' } });
    const a1 = att('aaaaaaaaaa', 1), a2 = att('aaaaaaaaaa', 2);
    expect(listOf([d], [a1, a2]).entries[0]!.ask).toBe(a1);
    expect(listOf([{ ...d, mode: 'write' }], []).entries).toHaveLength(1);
  });

  it('consumed and discarded drafts are not listed, but their asks still stored are, without the record (they hold slots)', () => {
    const a = att('bbbbbbbbbb', 1);
    const l = listOf([draft('aaaaaaaaaa', { state: 'consumed' }), draft('bbbbbbbbbb', { state: 'discarded' })], [a]);
    expect(l.entries).toHaveLength(1);
    expect(l.entries[0]).toMatchObject({ draftId: 'bbbbbbbbbb', record: null, ask: a, legacy: false });
  });

  it('a legacy New script ask (path null) is its own row; a change request is not a row', () => {
    const leg = ask(null), chg = ask('/scripts/a.ts');
    const l = listOf([], [leg, chg]);
    expect(l.entries.map((e) => e.legacy)).toEqual([true]);
    expect(l.changes).toBe(1);
    expect(l.changeAsks).toEqual([chg]);
    expect(l.builds).toBe(1);
  });

  it('a new: place that does not read back is a build slot (legacy row), never a change request', () => {
    const l = listOf([], [ask('new:garbage')]);
    expect(l.changes).toBe(0);
    expect(l.entries[0]!.legacy).toBe(true);
  });

  it('rows are oldest first; the full flag is the shared 32 asks, change requests included', () => {
    const old = att('bbbbbbbbbb', 1, { sentAt: 1 }), young = att('aaaaaaaaaa', 1, { sentAt: 9 });
    expect(listOf([draft('aaaaaaaaaa'), draft('bbbbbbbbbb')], [young, old]).entries.map((e) => e.draftId)).toEqual(['bbbbbbbbbb', 'aaaaaaaaaa']);
    const many = Array.from({ length: SCRIPT_ASKS_MAX }, (_, i) => ask(`/scripts/s${i}.ts`));
    const full = listOf([], many);
    expect(full).toMatchObject({ full: true, builds: 0, changes: SCRIPT_ASKS_MAX, entries: [] });
    expect(listOf([], many.slice(1)).full).toBe(false);
  });
});

describe('rowOf: every pill', () => {
  // The page that settled a legacy ask is retired: Discard is the way to free the slot it holds.
  it('legacy: Open and Discard', () => {
    expect(row({}, { legacy: true, record: null, ask: ask(null) })).toEqual({ pill: 'legacy', actions: ['open', 'discard'] });
  });

  it('starting: phase create or turn, before any read', () => {
    expect(row({}, { ask: att('dddddddddd', 1, { phase: 'create', sessionId: null, turnId: null }) })).toEqual({ pill: 'starting', actions: ['open'] });
    expect(row({}, { ask: att('dddddddddd', 1, { phase: 'turn', turnId: null }) }).pill).toBe('starting');
  });

  it('checking until the binding and then the receipt are read', () => {
    expect(row({}).pill).toBe('checking');
    expect(row({ binding: B }).pill).toBe('checking');
  });

  it('building: accepted or dispatched, with Stop and Discard', () => {
    expect(row(read(R('accepted', false)))).toEqual({ pill: 'building', actions: ['open', 'stop', 'discard'] });
    expect(row(read(R('dispatched', false))).pill).toBe('building');
  });

  it('reading: completed, transcript not read yet', () => {
    expect(row(read(R('completed', true)))).toEqual({ pill: 'reading', actions: ['open'] });
  });

  it('ready: a readable answer extract takes', () => {
    expect(row(read(R('completed', true), tr(ANSWER)))).toEqual({ pill: 'ready', actions: ['open', 'discard'] });
  });

  it('no usable script: only when the transcript is readable and positively holds none', () => {
    expect(row(read(R('completed', true), tr('Summary: nope, no code')))).toEqual({ pill: 'unusable', actions: ['open', 'discard'], why: 'no_block' });
    const noText = { turns_total: 1, messages: [{ role: 'user', blocks: [text('go')] }, { role: 'assistant', blocks: [{ kind: 'tool_use' }] }] };
    expect(row(read(R('completed', true), noText))).toMatchObject({ pill: 'unusable', why: 'NO_REPLY' });
  });

  it('stopped, stopped before it finished, could not finish (with the code)', () => {
    expect(row(read(R('cancelled', true)))).toEqual({ pill: 'stopped', actions: ['open', 'discard'] });
    expect(row(read(R('interrupted', true))).pill).toBe('interrupted');
    expect(row(read(R('failed', true, 'rate_limited')))).toEqual({ pill: 'failed', actions: ['open', 'discard'], why: 'rate_limited' });
  });

  it("unreadable is can't tell yet, never failed: receipt, transcript, another turn's receipt, an unknown state", () => {
    const U = { pill: 'unknown', actions: ['check', 'open', 'discard'] };
    expect(row(read('unreadable'))).toEqual(U);
    expect(row(read(null))).toEqual(U);
    expect(row(read(R('completed', true, 'completed', 't9')))).toEqual(U);
    expect(row(read(R('queued_somewhere', false)))).toEqual(U);
    expect(row(read(R('completed', true), 'unreadable'))).toEqual(U);
    expect(row(read(R('completed', true), { messages: [] }))).toEqual(U);
  });

  it("the computer gone from a whole list, or not knowable, is can't tell yet, never failed", () => {
    expect(row({ binding: null, receipt: R('failed', true) }).pill).toBe('unknown');
    expect(row({ binding: 'unknown' }).pill).toBe('unknown');
  });

  it("a lost ask or one with no turn is can't tell yet", () => {
    expect(row({ binding: B, receipt: R('completed', true) }, { ask: att('dddddddddd', 1, { phase: 'lost' }) }).pill).toBe('unknown');
    expect(row({ binding: B }, { ask: att('dddddddddd', 1, { phase: 'read', turnId: null }) }).pill).toBe('unknown');
  });

  it('a deploy: going live while it beats; the computer didn\'t answer when held or stale, with Check and the warned Discard; not live yet when known not sent', () => {
    const dep = (phase: 'sending' | 'didnt' | 'held', beatAt: number) => ({ record: draft('dddddddddd', { state: 'deploying', deploy: { kind: 'write' as const, path: '/a.ts', opId: 'op', sentAfter: 1, attempt: 1, beatAt, phase } }) });
    const now = 1_000_000;
    expect(row(read(R('completed', true), tr(ANSWER)), dep('sending', now - 1000), now)).toEqual({ pill: 'goingLive', actions: ['open'] });
    expect(row({}, dep('sending', now - DEPLOY_BEAT_STALE_MS - 1), now)).toEqual({ pill: 'goingLiveUnknown', actions: ['check', 'open', 'discard'] });
    expect(row({}, dep('held', now), now)).toEqual({ pill: 'goingLiveUnknown', actions: ['check', 'open', 'discard'] });
    expect(row({}, dep('didnt', now), now)).toEqual({ pill: 'notLive', actions: ['open'] });
  });

  it('made live, attempts still closing: Open only', () => {
    expect(row(read(R('completed', true), tr(ANSWER)), { record: draft('dddddddddd', { state: 'live_cleanup' }) })).toEqual({ pill: 'live', actions: ['open'] });
  });

  it('a row without its draft record always offers Discard, even while starting or checking (its slot can be freed)', () => {
    expect(row({}, { record: null, ask: att('dddddddddd', 1, { phase: 'create', sessionId: null, turnId: null }) })).toEqual({ pill: 'starting', actions: ['discard'] });
    expect(row({}, { record: null }).actions).toEqual(['discard']);
    expect(row(read(R('completed', true)), { record: null }).actions).toEqual(['discard']);
  });

  it('a starting row may already run (mayRun), so its Discard warns', () => {
    expect(mayRun({ pill: 'starting', actions: [] })).toBe(true);
  });

  it('a row without its draft record has no Open (there is no draft to open), Discard stays', () => {
    expect(row(read(R('cancelled', true)), { record: null })).toEqual({ pill: 'stopped', actions: ['discard'] });
    expect(row(read('unreadable'), { record: null }).actions).toEqual(['check', 'discard']);
  });
});

describe('reading rules', () => {
  it('unsettled rows are read again; settled ones once; /state only for Building', () => {
    const pills = { checking: true, starting: true, building: true, reading: true, unknown: true, ready: false, unusable: false, stopped: false, interrupted: false, failed: false, goingLive: false, goingLiveUnknown: false, notLive: false, live: false, legacy: false } as const;
    for (const [pill, want] of Object.entries(pills)) {
      expect(unsettled({ pill: pill as never, actions: [] })).toBe(want);
      expect(readsState({ pill: pill as never, actions: [] })).toBe(pill === 'building');
    }
    expect(mayRun({ pill: 'ready', actions: [] })).toBe(false);
    expect(mayRun({ pill: 'unknown', actions: [] })).toBe(true);
    // A legacy ask is never read: its turn may still run.
    expect(mayRun({ pill: 'legacy', actions: [] })).toBe(true);
  });

  it('step words from current_step; anything else tells nothing', () => {
    expect(stepOf({ current_step: { kind: 'model' } })).toBe('model');
    expect(stepOf({ current_step: { kind: 'gate' } })).toBe('gate');
    expect(stepOf({ current_step: { kind: 'tool', tool: 'hoody_exec_validate' } })).toBe('validate');
    expect(stepOf({ current_step: { kind: 'tool', tool: 'hoody_exec_routes' } })).toBe('routes');
    expect(stepOf({ current_step: { kind: 'tool', tool: 'hoody_exec_monitor' } })).toBe('monitor');
    expect(stepOf({ current_step: { kind: 'tool', tool: 'bash' } })).toBeNull();
    expect(stepOf({ current_step: { kind: 'tool', tool: 'toString' } })).toBeNull();
    expect(stepOf({ current_step: { kind: 'idle' } })).toBeNull();
    expect(stepOf({})).toBeNull();
    expect(stepOf('unreadable')).toBeNull();
  });

  it('the label: first_message under session, cut at the marker after a blank line; null before a session; empty when unreadable', () => {
    const s = (fm: unknown, id = 's1') => ({ session: { id, first_message: fm } });
    const A = { sessionId: 's1' };
    expect(labelOf(A, s('Every Monday at 9\ncount signups\n\n[Hoody New script v1]\nAddress: /x'))).toBe('Every Monday at 9 count signups');
    expect(labelOf(A, s('a\n[Hoody New script v1]\nmore'))).toBe('a [Hoody New script v1] more');
    expect(labelOf(A, s('a\n\n [Hoody New script v1]\n\n[Hoody New script v1]\nAddress: /x'))).toBe('a [Hoody New script v1]');
    expect(labelOf(A, s('Warn me when the disk fi'))).toBe('Warn me when the disk fi');
    expect(labelOf({ sessionId: null }, s('x'))).toBeNull();
    expect(labelOf(null, s('x'))).toBeNull();
    expect(labelOf(A, 'unreadable')).toBe('');
    expect(labelOf(A, s(undefined))).toBe('');
    expect(labelOf(A, s('x', 's2'))).toBe('');
    expect(labelOf(A, { first_message: 'top level is not the shape' })).toBe('');
  });

  it("the computer's name from its containers row (that project's), else null", () => {
    const rows = { computers: [{ id: C, project_id: 'other', name: 'nope' }, { id: C, project_id: P, name: 'atlas' }] };
    expect(computerNameOf(rows, B)).toBe('atlas');
    expect(computerNameOf({ data: rows }, B)).toBe('atlas');
    expect(computerNameOf({ computers: [] }, B)).toBeNull();
  });
});
