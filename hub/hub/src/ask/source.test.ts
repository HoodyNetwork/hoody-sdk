// The read-only conversation source on an Ask engine. Each engine block maps to one
// kit block in the dock's own words; a gate keeps the identity it was drawn for; the facts make every write
// `read_only`; the source has no send method; the snapshot is one object per engine snapshot; release goes once.
import { describe, expect, it, vi } from 'vitest';
import { ACTIONS, can, type CapFacts } from '@kit/agent/capability';
import { isActive } from '@kit/agent/source';
import * as C from './conv';
import type { AskEngine, CardView, Snapshot } from './engine';
import type { Gate, Step } from './logic';
import { blocksOf, convSnapshot, engineSource, factsOf, gatesOf, metaStatus, type Host } from './source';
import { shownReply } from './Column';
import strings from './strings.en.json';

const w = (k: keyof typeof strings, v: Record<string, string | number> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => String(v[n] ?? ''));
const HOST: Host = { computer: 'atlas', realm: 'Personal' };

const user = (over: Partial<C.UserMsg> = {}): C.UserMsg => ({
  id: 'u1', text: 'fix the build', at: 1000, key: 'k1', via: 'turn', state: 'sent', turnId: 't1', commandId: null, reason: '', ...over,
});
const step = (over: Partial<Step> = {}): Step => ({ id: 's1', name: 'bash', summary: 'npm test', ok: true, n: 1, seg: 0, ...over });
const trail = (over: Partial<Extract<C.Block, { k: 'trail' }>> = {}): Extract<C.Block, { k: 'trail' }> => ({
  k: 'trail', key: 'tr1', rows: [{ k: 'step', step: step() }], total: 1, shown: 1, live: null, failed: false, unknown: false, done: true, ms: null, ...over,
});
const gate = (over: Partial<Gate> = {}): Gate => ({ kind: 'confirm', id: 'g1', generation: 2, cause: '', risk: 'low', leaseRequired: false, dnum: null, tool: 'bash', ...over });
const card = (over: Partial<CardView> = {}): CardView => ({ key: 'c1', gate: gate(), helper: false, addressing: false, decision: null, held: null, decidable: true, ...over });
function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    phase: 'ready', blocked: null, band: null, starting: false, conv: C.emptyConv('s1'), status: null, gates: [], gate: null,
    decision: { pending: false, unknown: false }, dormant: false, checking: false, auto: { cap: false, on: null, busy: false, err: '', note: '' },
    needLogin: false, followUps: true, recent: null, version: 1, sendable: true, dup: null, att: { items: [], refused: [], dropped: '', reading: false },
    ...over,
  };
}

describe('blocksOf: each engine block in the dock’s words', () => {
  it('a message sent into a running turn is marked a follow-up (it does not start a turn); a turn\'s own prompt is not', () => {
    const fu = (via: C.Via) => (blocksOf([{ k: 'user', key: 'b', msg: user({ via }) }])[0] as { followUp?: true }).followUp;
    expect(fu('command')).toBe(true);
    expect(fu('turn')).toBeUndefined();
    expect(fu('create')).toBeUndefined();
  });
  it('a user message keeps its text and time; its send state is a note (bad only when it did not go)', () => {
    // The block also names the request the row stands for: the identity Check and the row actions bind to; a sent row offers no action.
    expect(blocksOf([{ k: 'user', key: 'b1', msg: user() }])).toEqual([{ k: 'user', key: 'b1', text: 'fix the build', at: 1000, req: { key: 'k1', kind: 'turn' } }]);
    const note = (state: C.SendState, reason = '') => (blocksOf([{ k: 'user', key: 'b', msg: user({ state, reason }) }])[0] as { note?: unknown }).note;
    expect(note('sending')).toEqual({ text: w('ask.sending') });
    expect(note('queued')).toEqual({ text: w('ask.queued') });
    // A reopened chat's pictures: the agent's id for one it serves, a marked tile for one it cannot; a nameless one is numbered.
    const ID = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
    expect((blocksOf([{ k: 'user', key: 'b', msg: user({ pics: [{ id: ID, name: 'shot.png' }, { id: null, name: '' }] }) }])[0] as { files?: unknown }).files).toEqual([
      { id: expect.stringContaining(':pic0'), kind: 'image', name: 'shot.png', stored: ID },
      { id: expect.stringContaining(':pic1'), kind: 'image', name: w('ask.attPicture', { n: 2 }), gone: true },
    ]);
    // While an approval or a question waits, a queued message is read after the answer (it never declines what waits).
    expect((blocksOf([{ k: 'user', key: 'b', msg: user({ state: 'queued' }) }], { gate: true })[0] as { note?: unknown }).note).toEqual({ text: w('ask.queuedGate') });
    expect((blocksOf([{ k: 'user', key: 'b', msg: user({ state: 'sending' }) }], { gate: true })[0] as { note?: unknown }).note).toEqual({ text: w('ask.sending') });
    // C9: a send of unknown outcome is never shown as sent or as failed.
    expect(note('unknown')).toEqual({ text: w('ask.mayHave') });
    expect(note('notSent')).toEqual({ text: w('ask.notSent'), bad: true });
    expect(note('refused')).toEqual({ text: w('ask.refused'), bad: true });
    expect(note('superseded')).toEqual({ text: w('ask.superseded') });
    expect(blocksOf([{ k: 'user', key: 'b', msg: user({ text: '' }) }])[0]).toMatchObject({ note: { text: w('ask.reachedAgent') } });
    // A reopened chat's message that was only pictures has no text and waits for none: no note.
    expect((blocksOf([{ k: 'user', key: 'b', msg: user({ text: '', pics: [{ id: ID, name: '' }] }) }])[0] as { note?: unknown }).note).toBeUndefined();
  });

  it('a reply carries no usage counts: the snapshot lists them per turn (:2140,:2143)', () => {
    const bare = blocksOf([{ k: 'reply', key: 'r0:0', text: 'done', streaming: false, cut: false, cost: 0.5, at: 1, final: true } as never])[0]!;
    expect('responses' in bare || 'responsesSkipped' in bare).toBe(false);
    // Turn 0 asked and answered with no text (no reply block); turn 1 replied. Both are in the snapshot's usage, each named by its own question.
    const counts = (n: number) => ({ input: n, output: n, cacheRead: n, cacheWrite: 0 });
    const t0 = { ...C.addTurn(C.addUser(C.emptyConv('s1'), user({ id: 'u1', text: 'Look at the logs' })), { turnId: 't1', user: 'u1', now: 1 }) };
    const withCounts = (c: C.Conv, ti: number, rs: ReturnType<typeof counts>[], end: boolean): C.Conv => ({ ...c, turns: c.turns.map((t, i) => (i === ti ? { ...t, s: { ...t.s, responses: rs, ...(end ? { terminal: { state: 'completed', code: '', retryAt: null, effects: false } } : {}) } } : t)) });
    let c = withCounts(t0, 0, [counts(1)], true);
    c = C.addTurn(C.addUser(c, user({ id: 'u2', key: 'k2', text: 'And the disk?', turnId: 't2' })), { turnId: 't2', user: 'u2', now: 2 });
    c = withCounts(c, 1, [counts(2), counts(3)], false);
    const sn = convSnapshot(snap({ conv: c }), HOST, 0);
    expect(sn.usage).toEqual([
      { key: 't:t1', turn: 1, asked: 'Look at the logs', responses: [counts(1)] },
      { key: 't:t2', turn: 2, asked: 'And the disk?', responses: [counts(2), counts(3)] },
    ]);
    expect(sn.blocks.some((x) => x.k === 'reply' && x.key === 'r0:0'), 'turn 0 has no reply block').toBe(false);
  });

  it('a user message’s images and text files are chips; control characters never reach the page', () => {
    const msg = user({ text: 'look\u0007 here', imgs: [{ id: 'i1', kind: 'image', name: 'a.png', media: 'image/png', data: '', bytes: 3, url: 'blob:x' }], files: [{ id: 'f1', kind: 'text', name: 'log.txt', text: 'x', bytes: 1, lines: 12 }] });
    const b = blocksOf([{ k: 'user', key: 'b', msg }])[0] as Extract<ReturnType<typeof blocksOf>[number], { k: 'user' }>;
    expect(b.text).not.toContain('\u0007');
    expect(b.files).toEqual([
      { id: 'i1', kind: 'image', name: 'a.png', url: 'blob:x' },
      { id: 'f1', kind: 'text', name: 'log.txt', meta: w('ask.attLines_other', { n: 12 }) },
    ]);
    // A file read from a computer names it on its chip.
    const far = user({ text: 'x', files: [{ id: 'f2', kind: 'text', name: 'app.log', text: 'x', bytes: 1, lines: 3, from: 'beta:/srv/app.log' }] });
    const fb = blocksOf([{ k: 'user', key: 'c', msg: far }])[0] as Extract<ReturnType<typeof blocksOf>[number], { k: 'user' }>;
    expect(fb.files).toEqual([{ id: 'f2', kind: 'text', name: 'app.log', meta: w('ask.attLinesFrom', { n: 3, from: 'beta:/srv/app.log' }) }]);
  });

  it('a one-line text file reads "1 line", never "1 lines" (also when read from a computer)', () => {
    const one = user({ text: 'see', files: [{ id: 'f1', kind: 'text', name: 'plan.md', text: 'x', bytes: 1, lines: 1 }] });
    const b = blocksOf([{ k: 'user', key: 'b', msg: one }])[0] as Extract<ReturnType<typeof blocksOf>[number], { k: 'user' }>;
    expect(b.files).toEqual([{ id: 'f1', kind: 'text', name: 'plan.md', meta: '1 line · goes in as text' }]);
    const far = user({ text: 'see', files: [{ id: 'f2', kind: 'text', name: 'app.log', text: 'x', bytes: 1, lines: 1, from: 'beta:/srv/app.log' }] });
    const fb = blocksOf([{ k: 'user', key: 'c', msg: far }])[0] as Extract<ReturnType<typeof blocksOf>[number], { k: 'user' }>;
    expect(fb.files).toEqual([{ id: 'f2', kind: 'text', name: 'app.log', meta: '1 line · goes in as text · from beta:/srv/app.log' }]);
  });

  it('a trail is one steps block: its label, its state and every row with the tool’s verb', () => {
    const b = blocksOf([trail({ rows: [{ k: 'step', step: step({ at: 0, end: 2000 }) }, { k: 'note', text: 'thinking' }], total: 2, ms: 3000 })])[0];
    expect(b).toEqual({
      k: 'steps', key: 'tr1', label: w('ask.stepsTime', { steps: '2 steps', time: '3 s' }), count: w('ask.stepsTime', { steps: '2 steps', time: '3 s' }), state: 'ok',
      rows: [
        { id: 's1', state: 'ok', verb: strings['ask.tool.run'], summary: 'npm test', time: '2 s' },
        { id: 'tr1:n1', state: 'ok', kind: 'note', verb: w('ask.note'), summary: 'thinking' },
      ],
    });
  });

  it('a time under a second is not drawn: no "0 s" on a fast step or a fast trail', () => {
    const b = blocksOf([trail({ rows: [{ k: 'step', step: step({ at: 0, end: 400 }) }, { k: 'step', step: step({ id: 's2', at: 0, end: 999 }) }, { k: 'step', step: step({ id: 's3', at: 0, end: 1000 }) }], total: 3, ms: 900 })])[0] as unknown as { label: string; count: string; rows: readonly Record<string, unknown>[] };
    expect(b.count).toBe('3 steps');
    expect(b.label).toBe('3 steps');
    expect(b.rows[0]).not.toHaveProperty('time');
    expect(b.rows[1]).not.toHaveProperty('time');
    expect(b.rows[2]).toMatchObject({ time: '1 s' });
  });

  it('a running trail is labelled by its live step; failed and unknown trails say so', () => {
    expect(blocksOf([trail({ done: false, live: step({ ok: null, summary: 'npm run build' }) })])[0]).toMatchObject({ state: 'running', label: 'npm run build' });
    // Whatever runs, `count` says how many steps (and how long once known): the page's summary row reads it, never the command.
    expect(blocksOf([trail({ done: false, total: 3, live: step({ ok: null, summary: 'npm run build' }) })])[0]).toMatchObject({ count: '3 steps' });
    expect(blocksOf([trail({ failed: true })])[0]).toMatchObject({ state: 'failed' });
    expect(blocksOf([trail({ unknown: true })])[0]).toMatchObject({ state: 'unknown' });
  });

  it('a step row: running, failed with its reason, held by hooks, and an unknown result reads “may have run”, never failed', () => {
    const row = (s: Partial<Step>) => (blocksOf([trail({ rows: [{ k: 'step', step: step(s) }] })])[0] as { rows: readonly unknown[] }).rows[0];
    expect(row({ ok: null })).toMatchObject({ state: 'running' });
    expect(row({ ok: false, why: 'exit 1' })).toMatchObject({ state: 'failed', note: w('ask.stepFailedWhy', { why: 'exit 1' }) });
    expect(row({ ok: false })).toMatchObject({ state: 'failed', note: w('ask.stepFailed') });
    expect(row({ ok: false, held: true })).toMatchObject({ state: 'failed', note: w('ask.stepHeld') });
    expect(row({ ok: false, unknown: true })).toMatchObject({ state: 'unknown', note: w('ask.stepUnknown') });
    expect(row({ name: 'mcp__gh__list_issues', summary: '' })).toMatchObject({ verb: 'list issues' });
  });

  it('a step\'s text: one line for the row, the line breaks kept for the open row; a text that is not all of it says so', () => {
    const row = (s: Partial<Step>) => (blocksOf([trail({ rows: [{ k: 'step', step: step(s) }] })])[0] as unknown as { rows: readonly Record<string, unknown>[] }).rows[0]!;
    // One line: nothing more is carried.
    expect(row({ summary: '$ npm test' })).not.toHaveProperty('text');
    expect(row({ summary: '$ npm test' })).not.toHaveProperty('cut');
    expect(row({ summary: '$ cd /srv &&\n\nmake' })).toMatchObject({ summary: '$ cd /srv && make', text: '$ cd /srv &&\n\nmake' });
    // The agent cuts a command at 500 bytes and ends it with three dots: that one is not the whole command.
    expect(row({ name: 'bash', summary: '$ ' + 'x'.repeat(500) + '...' })).toMatchObject({ cut: true });
    expect(row({ name: 'bash', summary: '[bg] $ ' + 'x'.repeat(500) + '...' })).toMatchObject({ cut: true });
    // A shorter command that ends in three dots is whole; so is another tool's text.
    expect(row({ name: 'bash', summary: '$ echo wait...' })).not.toHaveProperty('cut');
    expect(row({ name: 'grep', summary: 'x'.repeat(500) + '...' })).not.toHaveProperty('cut');
    // The host's own bound.
    expect(row({ name: 'grep', summary: 'y'.repeat(2000) })).toMatchObject({ cut: true });
    expect((row({ name: 'grep', summary: 'y'.repeat(2000) }).summary as string).length).toBe(1500);
  });

  it('a reply is cleaned, loses the close marker, and says where a cut reply goes on; an empty reply draws nothing', () => {
    const r = { k: 'reply' as const, key: 'r1', text: 'Done.', streaming: false, cut: true, cost: 0.01, at: 5, final: true };
    expect(blocksOf([r])).toEqual([{ k: 'reply', key: 'r1', text: 'Done.', streaming: false, final: true, cost: 0.01, at: 5, cut: w('ask.replyCut') }]);
    expect(blocksOf([{ ...r, cut: false }])[0]).not.toHaveProperty('cut');
    expect(blocksOf([{ ...r, text: '' }])).toEqual([]);
  });

  it('a streaming reply shows no caret while the turn waits on a decision', () => {
    const r = { k: 'reply' as const, key: 'r1', text: 'Two steps need you.', streaming: true, cut: false, cost: null, at: null, final: false };
    expect(blocksOf([r])[0]).toMatchObject({ streaming: true });
    expect(blocksOf([r], { gate: true })[0]).toMatchObject({ streaming: false });
  });

  it('a decided card stays a decided line', () => {
    const d: C.Decided = { step: 1, kind: 'once', tool: 'bash', text: 'npm test' };
    expect(blocksOf([{ k: 'decided', key: 'd1', d }])).toEqual([{ k: 'decided', key: 'd1', d: { kind: 'once', tool: 'bash', text: 'npm test' } }]);
  });

  it('the agent\'s compaction summary is a summary block (its text as a reply shows it), never a message of the person\'s', () => {
    const text = '**Goals**\n- Fix the cart total';
    expect(blocksOf([{ k: 'summary', key: 'c0', text }])).toEqual([{ k: 'summary', key: 'c0', text: shownReply(text) }]);
    expect(blocksOf([{ k: 'summary', key: 'c0', text: '' }])).toEqual([]);
  });

  it('outcomes, errors, the unsure note and held hooks are lines; a completed turn adds none', () => {
    const o = (state: 'completed' | 'failed' | 'cancelled' | 'interrupted', code = '') => blocksOf([{ k: 'outcome', key: 'o', state, code, retryAt: null, effects: false, retry: null }]);
    expect(o('completed')).toEqual([]);
    expect(o('cancelled')).toEqual([{ k: 'line', key: 'o', text: w('ask.o.cancelled'), tone: 'muted' }]);
    expect(o('interrupted')).toEqual([{ k: 'line', key: 'o', text: w('ask.o.interrupted'), tone: 'muted' }]);
    expect(o('failed')).toEqual([{ k: 'line', key: 'o', text: w('ask.o.failed'), tone: 'bad' }]);
    expect(blocksOf([{ k: 'error', key: 'e', code: '', retryAt: null }])).toEqual([{ k: 'line', key: 'e', text: w('ask.o.failed'), tone: 'bad' }]);
    // An outcome that could not be told carries Check again (recheck: a read of the conversation, never a send).
    expect(blocksOf([{ k: 'unsure', key: 'u' }])).toEqual([{ k: 'line', key: 'u', text: w('ask.o.unsure'), tone: 'info', recheck: true }]);
    expect(blocksOf([{ k: 'hooks', key: 'h' }])).toEqual([{ k: 'line', key: 'h', text: w('ask.hooksBody'), tone: 'info', agentApp: w('ask.hooksOpenAgent') }]);
  });

  it('a failure no Retry helps links to the models page, where its next step is taken; other failures carry no link', () => {
    const models = { label: w('ask.openModels'), href: '/ai/models' };
    const o = (code: string) => blocksOf([{ k: 'outcome', key: 'o', state: 'failed', code, retryAt: null, effects: false, retry: null }])[0];
    expect(o('model_unavailable')).toEqual({ k: 'line', key: 'o', text: w('ask.noModel'), tone: 'bad', link: models });
    expect(o('context_overflow')).toMatchObject({ link: models });
    expect(blocksOf([{ k: 'error', key: 'e', code: 'no_credentials', retryAt: null }])[0]).toMatchObject({ link: models });
    expect(o('agent_error')).not.toHaveProperty('link');
    expect(o('rate_limit')).not.toHaveProperty('link');
  });
});

describe('gatesOf: a card keeps the gate it was drawn for', () => {
  it('maps identity, helper, addressing, held and the decision state (unknown stays unknown)', () => {
    expect(gatesOf([card({ decision: 'unknown', held: 'full', helper: true, addressing: true })])).toEqual([
      { key: 'c1', ref: { id: 'g1', generation: 2 }, gate: gate(), helper: true, addressing: true, held: 'full', decision: 'unknown' },
    ]);
  });
});

describe('factsOf: a read source', () => {
  it('every write is read_only and the source has no send method', () => {
    const f = factsOf(snap({ status: 'working', gates: [card()], gate: gate() }));
    expect(f.mode).toBe('read');
    for (const a of ACTIONS) expect(can(a, f)).toEqual({ ok: false, reason: 'read_only' });
    const src = engineSource({ current: () => engineOf(snap()), release: () => {} }, { computer: 'atlas.a1b2', realm: 'global', sid: 's1' }, () => HOST);
    expect(isActive(src)).toBe(false);
    for (const m of ['send', 'stop', 'decide', 'answer', 'check', 'dismissDecision']) expect(m in src).toBe(false);
  });

  it('checking reads as loading; a blocked or ended engine as unreachable; a running turn and an open gate are facts', () => {
    expect(factsOf(snap({ phase: 'checking' })).state).toBe('loading');
    expect(factsOf(snap({ phase: 'blocked', blocked: { key: 'ask.unreachable', act: 'retry', tone: 'warn', agent: false } })).reach).toBe('unreachable');
    expect(factsOf(snap({ phase: 'ended' })).reach).toBe('unreachable');
    const f = factsOf(snap({ status: 'working', gate: gate({ kind: 'question' }), gates: [card({ gate: gate({ kind: 'question' }) })] }));
    expect(f).toMatchObject({ reach: 'ok', state: 'running', turn: true, gate: 'question' });
    expect(factsOf(snap({ decision: { pending: false, unknown: true } })).decisionPending).toBe(true);
  });

  it('Check status is promised only for what it can read: an unknown row counts, a row still sending does not (Check refuses it)', () => {
    const conv = (...us: C.UserMsg[]): C.Conv => ({ ...C.emptyConv('s1'), sid: 's1', users: Object.fromEntries(us.map((u) => [u.id, u])), loose: us.map((u) => u.id) });
    expect(factsOf(snap({ conv: conv(user({ state: 'sending' })) })).unsettledSends).toBe(0);
    expect(factsOf(snap({ conv: conv(user({ state: 'unknown' })) })).unsettledSends).toBe(1);
    expect(factsOf(snap({ conv: conv(user({ state: 'unknown' }), user({ id: 'u2', key: 'k2', state: 'sending' })) })).unsettledSends).toBe(1);
  });

  it('the header status: loading, running, needs you (a gate waits), idle', () => {
    expect(metaStatus(snap({ phase: 'checking' }))).toBe('loading');
    expect(metaStatus(snap({ status: 'working' }))).toBe('running');
    expect(metaStatus(snap({ status: 'waiting', gates: [card()] }))).toBe('needs');
    expect(metaStatus(snap({ gates: [card({ decision: 'sending' })] }))).toBe('idle');
    expect(metaStatus(snap())).toBe('idle');
  });
});

describe('the running turn id', () => {
  const withTurn = (turnId: string | null) => C.addTurn(C.addUser(C.emptyConv('s1'), user({ id: 'h9', turnId })), { turnId, user: 'h9', now: 1 });
  it('a running turn the agent named: its id, whatever its rows are called; none for an unnamed, ended or absent turn', () => {
    expect(convSnapshot(snap({ conv: withTurn('t7'), status: 'working' as Snapshot['status'] }), HOST, 0).turnId).toBe('t7');
    expect(convSnapshot(snap({ conv: withTurn(null), status: 'working' as Snapshot['status'] }), HOST, 0)).not.toHaveProperty('turnId');
    expect(convSnapshot(snap(), HOST, 0)).not.toHaveProperty('turnId');
    const c0 = withTurn('t7');
    const ended: C.Conv = { ...c0, turns: c0.turns.map((t) => ({ ...t, s: { ...t.s, terminal: { outcome: 'completed' } as never } })) };
    expect(C.running(C.current(ended))).toBe(false);
    expect(convSnapshot(snap({ conv: ended }), HOST, 0)).not.toHaveProperty('turnId');
    expect(convSnapshot(snap({ conv: ended }), HOST, 0).endedTurnId).toBe('t7');
    expect(convSnapshot(snap({ conv: c0, status: 'working' as Snapshot['status'] }), HOST, 0)).not.toHaveProperty('endedTurnId');
    const end = (c: C.Conv): C.Conv => ({ ...c, turns: c.turns.map((t) => ({ ...t, s: { ...t.s, terminal: { outcome: 'completed' } as never } })) });
    const two = end(C.addTurn(C.addUser(end(withTurn('t7')), user({ id: 'h10', turnId: 't8' })), { turnId: 't8', user: 'h10', now: 2 }));
    expect(convSnapshot(snap({ conv: two }), HOST, 0).endedTurnId).toBe('t8');
  });
  it('turnConfirmed only when the agent\'s last state read since the open names the turn shown running (or none while none runs)', () => {
    const run = { conv: withTurn('t7'), status: 'working' as Snapshot['status'] };
    expect(convSnapshot(snap(), HOST, 0)).not.toHaveProperty('turnConfirmed');
    expect(convSnapshot(snap({ stateTurn: null }), HOST, 0).turnConfirmed).toBe(true);
    expect(convSnapshot(snap({ stateTurn: 't9' }), HOST, 0)).not.toHaveProperty('turnConfirmed');
    expect(convSnapshot(snap({ ...run }), HOST, 0)).not.toHaveProperty('turnConfirmed');
    expect(convSnapshot(snap({ ...run, stateTurn: 't7' }), HOST, 0).turnConfirmed).toBe(true);
    expect(convSnapshot(snap({ ...run, stateTurn: null }), HOST, 0)).not.toHaveProperty('turnConfirmed');
    expect(convSnapshot(snap({ conv: withTurn(null), status: 'working' as Snapshot['status'], stateTurn: 't7' }), HOST, 0)).not.toHaveProperty('turnConfirmed');
  });
});

describe('an unavailable conversation is never an empty, idle chat (C9)', () => {
  const blocked = (key: string, tone: 'warn' | 'bad' | 'muted' = 'warn') => ({ phase: 'blocked' as const, blocked: { key, act: 'retry' as const, tone, agent: false } });
  const head = (o: Partial<Snapshot>) => convSnapshot(snap(o), HOST, 0);
  it('a failed first read, a stopped computer, a lost connection and a refusal: not reachable, explained first, never Idle or Running', () => {
    const cases: [Partial<Snapshot>, CapFacts['reach'], string][] = [
      [{ band: { k: 'unreachable' } }, 'unreachable', w('ask.unreachable', { computer: 'atlas' })],
      [{ phase: 'checking', band: { k: 'unreachable' } }, 'unreachable', w('ask.unreachable', { computer: 'atlas' })],
      [{ band: { k: 'stopped' } }, 'unreachable', w('ask.stopped', { computer: 'atlas' })],
      [{ band: { k: 'starting' } }, 'unreachable', w('ask.starting', { computer: 'atlas' })],
      [{ band: { k: 'provisioning' } }, 'unreachable', w('ask.provisioning', { computer: 'atlas' })],
      [{ band: { k: 'lost' }, status: 'working' }, 'unreachable', w('ask.lost')],
      [blocked('ask.accessRefused', 'bad'), 'forbidden', w('ask.accessRefused')],
      [blocked('ask.otherAccount'), 'forbidden', w('ask.otherAccount')],
      [blocked('ask.gone'), 'missing', w('ask.gone')],
      [blocked('ask.goneOrUnreachable', 'muted'), 'missing', w('ask.goneOrUnreachable')],
      [blocked('ask.cantOpenHere'), 'unreachable', w('ask.cantOpenHere')],
      [blocked('ask.unsupported'), 'unreachable', w('ask.unsupported', { computer: 'atlas' })],
      [blocked('ask.realmNeeded'), 'unreachable', w('ask.realmNeeded')],
    ];
    for (const [o, reach, text] of cases) {
      const v = head(o);
      expect(v.facts.reach, JSON.stringify(o)).toBe(reach);
      expect(v.blocks[0], JSON.stringify(o)).toMatchObject({ k: 'line', key: 'reach', text });
      expect(['idle', 'running', 'needs'], JSON.stringify(o)).not.toContain(v.meta!.status);
      expect(v.facts.state, JSON.stringify(o)).toBe('loading');
    }
  });
  it('the engine\'s connection states (status lost / reconnecting, band null): lost is not reachable, reconnecting is loading; neither is Running', () => {
    const lost = convSnapshot(snap({ status: 'lost' }), HOST, 0);
    expect(lost.facts).toMatchObject({ reach: 'unreachable', state: 'loading', turn: false });
    expect(lost.meta!.status).toBe('unreachable');
    expect(lost.blocks[0]).toMatchObject({ k: 'line', key: 'reach', text: w('ask.lost'), tone: 'info' });
    const rc = convSnapshot(snap({ status: 'reconnecting' }), HOST, 0);
    expect(rc.facts).toMatchObject({ reach: 'ok', state: 'loading', turn: false });
    expect(rc.meta!.status).toBe('loading');
    expect(rc.blocks[0]).toMatchObject({ k: 'line', key: 'reach', text: w('ask.status.reconnecting'), tone: 'info' });
  });
  it('a blocked key the dock has no words for still explains itself; an ended engine claims nothing', () => {
    expect(head(blocked('ask.somethingNew')).blocks[0]).toMatchObject({ k: 'line', key: 'reach', text: w('ask.unreachable', { computer: 'atlas' }) });
    const e = head({ phase: 'ended' });
    expect(e.facts.reach).toBe('unreachable');
    expect(e.meta!.status).toBe('loading');
  });
  it('a busy agent is still read: an info line, reach ok', () => {
    const v = head({ band: { k: 'busy' } });
    expect(v.facts.reach).toBe('ok');
    expect(v.blocks[0]).toMatchObject({ k: 'line', key: 'reach', text: w('ask.busy'), tone: 'info' });
  });
});

describe('convSnapshot', () => {
  it('title: the host’s, else the first message; meta: where it runs; gap and dormant carried', () => {
    let conv = C.emptyConv('s1');
    conv = { ...conv, users: { u1: user({ text: 'fix the build please' }) }, loose: ['u1'], gapTop: true };
    const v = convSnapshot(snap({ conv, dormant: true }), HOST, 0);
    expect(v.title).toBe('fix the build please');
    expect(v.meta).toEqual({ computer: 'atlas', realm: 'Personal', status: 'idle' });
    expect(v.gapTop).toBe(true);
    expect(v.blocks[v.blocks.length - 1]).toEqual({ k: 'line', key: 'dormant', text: w('ask.dormant'), tone: 'muted' });
    expect(convSnapshot(snap({ conv }), { ...HOST, title: 'Build fix', folder: '/home/ada/shop' }, 0)).toMatchObject({ title: 'Build fix', meta: { folder: '/home/ada/shop' } });
  });
});

function engineOf(s: Snapshot) {
  let cur = s;
  const subs = new Set<() => void>();
  const eng = {
    getSnapshot: () => cur,
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    put(n: Snapshot) { cur = n; for (const f of [...subs]) f(); },
    fakeSubs: subs,
  };
  return eng as unknown as AskEngine & { put(n: Snapshot): void; fakeSubs: Set<() => void> };
}

describe('engineSource', () => {
  const REF = { computer: 'atlas.a1b2', realm: 'global', sid: 's1' };
  it('one snapshot object per engine snapshot; a change notifies and gives a new one', () => {
    const eng = engineOf(snap());
    const src = engineSource({ current: () => eng, release: () => {} }, REF, () => HOST);
    const a = src.snapshot();
    expect(src.snapshot()).toBe(a);
    const fn = vi.fn();
    const off = src.subscribe(fn);
    eng.put(snap({ status: 'working' }));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(src.snapshot()).not.toBe(a);
    expect(src.snapshot().meta?.status).toBe('running');
    off();
    expect(eng.fakeSubs.size).toBe(0);
    expect(src.kind).toBe('session');
    expect(src.ref).toEqual(REF);
  });

  it('reads the engine the handle holds now (a replaced engine is followed)', () => {
    let eng = engineOf(snap());
    const src = engineSource({ current: () => eng, release: () => {} }, REF, () => HOST);
    src.snapshot();
    eng = engineOf(snap({ status: 'working' }));
    expect(src.snapshot().meta?.status).toBe('running');
  });

  it('a host change (title from the chat list) gives a new snapshot after refresh()', () => {
    let host: Host = HOST;
    const src = engineSource({ current: () => engineOf(snap()), release: () => {} }, REF, () => host);
    const a = src.snapshot();
    const fn = vi.fn();
    src.subscribe(fn);
    host = { ...HOST, title: 'Build fix' };
    src.refresh();
    expect(fn).toHaveBeenCalled();
    expect(src.snapshot()).not.toBe(a);
    expect(src.snapshot().title).toBe('Build fix');
  });

  it('release lets the engine go once, however often it is called', () => {
    const release = vi.fn();
    const src = engineSource({ current: () => engineOf(snap()), release }, REF, () => HOST);
    src.release();
    src.release();
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe('a reply as drawn', () => {
  it.each([['a bell', '\u0007'], ['a reset escape', '\u001b[0m'], ['a bidi override', '\u202e']])('a key after a word and %s stays hidden', (_name, x) => {
    const text = `note${x}sk-live0123456789abcdef end`;
    expect(shownReply(text)).toBe('note[hidden] end');
    const b = blocksOf([{ k: 'reply', key: 'r', text, streaming: false, cut: false, cost: 0, at: 0 } as never]);
    expect(JSON.stringify(b)).not.toContain('0123456789abcdef');
  });
  it('plain text and its close marker read as before', () => {
    expect(shownReply('Done.')).toBe('Done.');
  });
});
