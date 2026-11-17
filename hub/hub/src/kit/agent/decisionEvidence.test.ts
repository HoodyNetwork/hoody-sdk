// Vitest: what a confirm's reply and a gate's resolution frame prove about our decision (the rule is
// "parse at the boundary"). Rows are the agent's real shapes: the confirm reply (record details,
// resolvedDetails fallback, incarnation_ended, issued id without a record, gate_decision_pending, gate_type_mismatch,
// decision_incomplete, stale_gate, no_pending_gate, all 409), gate_cancelled, the gate decision and
// the event.gate_resolved frame. Plus a malformed row per field read and the contradiction rows.
// Only positive, parsed evidence settles anything; everything else stays 'unknown'.
import { describe, expect, it } from 'vitest';
import {
  evidenceOfFrame, evidenceOfReply, parseConfirmReply, parseDecision, parseGateResolved,
  type ConfirmReply, type DecisionEvidence, type FrameTarget,
} from './decisionEvidence';

const ours = { gate: { id: 'i7:3', generation: 2 }, requestId: 'hub-r-1' };
const allow = { approved: true, persist_dirs: false, session_scope: false, trust_computer: false };
const rec = (o: Record<string, unknown>) => ({ gate_id: 'i7:3', generation: 2, ...o });
const r409 = (code: string, details?: unknown): ConfirmReply => ({ ok: false, status: 409, code, details });
const answered = (o: Record<string, unknown> = {}) => r409('gate_already_resolved', rec({ outcome: 'answered', decision: allow, request_id: 'hub-r-1', ...o }));
const evidence = (r: unknown): DecisionEvidence => evidenceOfReply(ours, parseConfirmReply(ours, r));

const REPLIES: [string, unknown, DecisionEvidence][] = [
  ['a 200 to our confirm', { ok: true }, 'applied'],
  ['a 200 with its status', { ok: true, status: 200 }, 'applied'],
  // the discriminator
  ['ok that is the string "false" on a refusal', { ok: 'false', status: 409, code: 'gate_decision_pending' }, 'unknown'],
  ['an answered record naming us without ok', { status: 409, code: 'gate_already_resolved', details: rec({ outcome: 'answered', decision: allow, request_id: 'hub-r-1' }) }, 'unknown'],
  ['ok true with a refusal status and code', { ok: true, status: 409, code: 'gate_decision_pending' }, 'unknown'],
  ['ok true with refusal details', { ok: true, details: rec({ outcome: 'cancelled', decision_unknown: true }) }, 'unknown'],
  ['ok true with a 500', { ok: true, status: 500 }, 'unknown'],
  ['ok that is a number', { ok: 1 }, 'unknown'],
  ['a reply that is not an object', 'ok', 'unknown'],
  ['a reply that is null', null, 'unknown'],
  // gate_already_resolved with the hub's record (confirmRecord.details) or the resolvedDetails fallback (same shape)
  ['answered by our decision (our request_id)', answered(), 'applied'],
  ['answered by our approval of this call only (remember false)', answered({ decision: { ...allow, remember: false } }), 'applied'],
  ['answered by our approval with remember true', answered({ decision: { ...allow, remember: true } }), 'applied'],
  ['answered by a superseded denial naming us', answered({ decision: { ...allow, approved: false, superseded: true } }), 'applied'],
  ['answered by a decision naming another request_id', answered({ request_id: 'tab-2' }), 'elsewhere'],
  ['answered by a decision with no request_id (whose is unknown)', r409('gate_already_resolved', rec({ outcome: 'answered', decision: allow })), 'unknown'],
  ['answered with an empty request_id', answered({ request_id: '' }), 'unknown'],
  ['answered but the decision was not reported (decision_unknown)', r409('gate_already_resolved', rec({ outcome: 'answered', decision_unknown: true })), 'unknown'],
  ['cancelled without a decision', r409('gate_already_resolved', rec({ outcome: 'cancelled', decision_unknown: true })), 'ended'],
  ['auto-approved by YOLO', r409('gate_already_resolved', rec({ outcome: 'yolo', decision_unknown: true })), 'ended'],
  ['a helper gate that timed out', r409('gate_already_resolved', rec({ outcome: 'timeout', decision_unknown: true })), 'ended'],
  ['the record defaulted to outcome unknown', r409('gate_already_resolved', rec({ outcome: 'unknown', decision_unknown: true })), 'unknown'],
  ['another incarnation (incarnation_ended)', r409('gate_already_resolved', rec({ outcome: 'incarnation_ended', decision_unknown: true })), 'unknown'],
  // malformed records: one row per field read
  ['record: another gate', r409('gate_already_resolved', { gate_id: 'i7:4', generation: 2, outcome: 'cancelled', decision_unknown: true }), 'unknown'],
  ['record: gate_id that is a number', r409('gate_already_resolved', { gate_id: 3, generation: 2, outcome: 'cancelled', decision_unknown: true }), 'unknown'],
  ['record: another generation', r409('gate_already_resolved', { gate_id: 'i7:3', generation: 1, outcome: 'cancelled', decision_unknown: true }), 'unknown'],
  ['record: generation that is a string', r409('gate_already_resolved', { gate_id: 'i7:3', generation: '2', outcome: 'cancelled', decision_unknown: true }), 'unknown'],
  ['record: no generation', r409('gate_already_resolved', { gate_id: 'i7:3', outcome: 'cancelled', decision_unknown: true }), 'unknown'],
  ['record: no outcome', r409('gate_already_resolved', rec({ decision_unknown: true })), 'unknown'],
  ['record: an unrecognized outcome', r409('gate_already_resolved', rec({ outcome: 'expired', decision_unknown: true })), 'unknown'],
  ['record: outcome that is a number', r409('gate_already_resolved', rec({ outcome: 1, decision_unknown: true })), 'unknown'],
  ['record: both decision and decision_unknown', answered({ decision_unknown: true }), 'unknown'],
  ['record: neither decision nor decision_unknown', r409('gate_already_resolved', rec({ outcome: 'cancelled' })), 'unknown'],
  ['record: decision_unknown that is not true', r409('gate_already_resolved', rec({ outcome: 'cancelled', decision_unknown: false })), 'unknown'],
  ['record: approved that is not a boolean', answered({ decision: { ...allow, approved: 'yes' } }), 'unknown'],
  ['record: persist_dirs missing', answered({ decision: { approved: true, session_scope: false, trust_computer: false } }), 'unknown'],
  ['record: session_scope that is not a boolean', answered({ decision: { ...allow, session_scope: 1 } }), 'unknown'],
  ['record: trust_computer missing', answered({ decision: { approved: true, persist_dirs: false, session_scope: false } }), 'unknown'],
  ['record: remember that is not a boolean', answered({ decision: { ...allow, remember: 'yes' } }), 'unknown'],
  ['record: remember "no"', answered({ decision: { ...allow, remember: 'no' } }), 'unknown'],
  ['record: superseded that is not a boolean', answered({ decision: { ...allow, superseded: 'yes' } }), 'unknown'],
  ['record: decision that is a string', answered({ decision: 'broken' }), 'unknown'],
  ['record: request_id that is not a string', answered({ request_id: 7 }), 'unknown'],
  // contradictions
  ['record: a cancelled record that carries a decision', r409('gate_already_resolved', rec({ outcome: 'cancelled', decision: allow })), 'unknown'],
  ['record: a yolo record that carries a decision', r409('gate_already_resolved', rec({ outcome: 'yolo', decision: allow, request_id: 'hub-r-1' })), 'unknown'],
  ['record: a cancelled record naming our request_id', r409('gate_already_resolved', rec({ outcome: 'cancelled', decision_unknown: true, request_id: 'hub-r-1' })), 'unknown'],
  ['record: a record that carries a provenance', r409('gate_already_resolved', rec({ outcome: 'cancelled', decision_unknown: true, provenance: 'cancelled' })), 'unknown'],
  ['record: no details', r409('gate_already_resolved'), 'unknown'],
  ['record: details that are an array', r409('gate_already_resolved', [rec({ outcome: 'cancelled', decision_unknown: true })]), 'unknown'],
  // gate_cancelled
  ['gate_cancelled by a session.cancel', r409('gate_cancelled', rec({ outcome: 'cancelled', provenance: 'cancelled' })), 'ended'],
  ['gate_cancelled by a YOLO arm', r409('gate_cancelled', rec({ outcome: 'yolo', provenance: 'yolo' })), 'ended'],
  ['gate_cancelled by a session close', r409('gate_cancelled', rec({ outcome: 'cancelled', provenance: 'closed' })), 'ended'],
  ['gate_cancelled by the turn unwinding', r409('gate_cancelled', rec({ outcome: 'cancelled', provenance: 'context_cancelled' })), 'ended'],
  ['gate_cancelled by a helper timeout', r409('gate_cancelled', rec({ outcome: 'timeout', provenance: 'timeout' })), 'ended'],
  ['gate_cancelled from an older agent (empty provenance)', r409('gate_cancelled', rec({ outcome: 'cancelled', provenance: '' })), 'unknown'],
  ['gate_cancelled without a provenance', r409('gate_cancelled', rec({ outcome: 'cancelled' })), 'unknown'],
  ['gate_cancelled with provenance decision', r409('gate_cancelled', rec({ outcome: 'cancelled', provenance: 'decision' })), 'unknown'],
  ['gate_cancelled with an answered outcome', r409('gate_cancelled', rec({ outcome: 'answered', provenance: 'cancelled' })), 'unknown'],
  ['gate_cancelled with an unrecognized provenance', r409('gate_cancelled', rec({ outcome: 'cancelled', provenance: 'gone' })), 'unknown'],
  ['gate_cancelled whose outcome and provenance disagree (yolo / cancelled)', r409('gate_cancelled', rec({ outcome: 'yolo', provenance: 'cancelled' })), 'unknown'],
  ['gate_cancelled whose outcome and provenance disagree (cancelled / timeout)', r409('gate_cancelled', rec({ outcome: 'cancelled', provenance: 'timeout' })), 'unknown'],
  ['gate_cancelled carrying a decision', r409('gate_cancelled', rec({ outcome: 'cancelled', provenance: 'cancelled', decision: allow })), 'unknown'],
  ['gate_cancelled carrying a broken decision', r409('gate_cancelled', rec({ outcome: 'cancelled', provenance: 'cancelled', decision: 'broken' })), 'unknown'],
  ['gate_cancelled carrying decision_unknown', r409('gate_cancelled', rec({ outcome: 'cancelled', provenance: 'cancelled', decision_unknown: true })), 'unknown'],
  ['gate_cancelled carrying a request_id', r409('gate_cancelled', rec({ outcome: 'cancelled', provenance: 'cancelled', request_id: 'hub-r-1' })), 'unknown'],
  ['gate_cancelled for another gate', r409('gate_cancelled', { gate_id: 'i7:9', generation: 2, outcome: 'cancelled', provenance: 'cancelled' }), 'unknown'],
  ['gate_cancelled for another generation', r409('gate_cancelled', { gate_id: 'i7:3', generation: 5, outcome: 'cancelled', provenance: 'cancelled' }), 'unknown'],
  ['gate_cancelled with a provenance that is a number', r409('gate_cancelled', rec({ outcome: 'cancelled', provenance: 3 })), 'unknown'],
  // refusals that carry no evidence (all 409 on the agent), and other failures
  ['gate_decision_pending (outcome not known yet; nothing is resent)', r409('gate_decision_pending', rec({})), 'unknown'],
  ['gate_decision_pending after a lost connection', r409('gate_decision_pending', rec({ reason: 'connection_lost' })), 'unknown'],
  ['stale_gate (a newer generation is live)', r409('stale_gate', { gate_id: 'i7:3', generation: 3, type: 'confirm' }), 'unknown'],
  ['stale_gate without details', r409('stale_gate'), 'unknown'],
  ['no_pending_gate', r409('no_pending_gate'), 'unknown'],
  ['gate_type_mismatch', r409('gate_type_mismatch'), 'unknown'],
  ['decision_incomplete', r409('decision_incomplete'), 'unknown'],
  ['a 409 with an unknown code', r409('something_new', rec({ outcome: 'cancelled', decision_unknown: true })), 'unknown'],
  ['a 409 without a code', r409('', rec({ outcome: 'cancelled', decision_unknown: true })), 'unknown'],
  ['gate_already_resolved under another status', { ok: false, status: 400, code: 'gate_already_resolved', details: rec({ outcome: 'cancelled', decision_unknown: true }) }, 'unknown'],
  ['gate_cancelled under another status', { ok: false, status: 200, code: 'gate_cancelled', details: rec({ outcome: 'cancelled', provenance: 'cancelled' }) }, 'unknown'],
  ['a 500', { ok: false, status: 500, code: 'internal_error' }, 'unknown'],
  ['a lost reply (no status)', { ok: false }, 'unknown'],
];

describe('parseConfirmReply + evidenceOfReply', () => {
  it.each(REPLIES)('%s', (_name, reply, want) => {
    expect(evidence(reply)).toBe(want);
  });
  it('recognizes the evidence-free refusals as refused, anything else as unknown', () => {
    expect(parseConfirmReply(ours, r409('no_pending_gate'))).toEqual({ kind: 'refused', code: 'no_pending_gate' });
    expect(parseConfirmReply(ours, r409('gate_decision_pending'))).toEqual({ kind: 'refused', code: 'gate_decision_pending' });
    expect(parseConfirmReply(ours, { ok: false, status: 404, code: 'no_pending_gate' })).toEqual({ kind: 'unknown' });
  });
  it.each([
    ['a cancelled record that carries a decision', r409('gate_already_resolved', rec({ outcome: 'cancelled', decision: allow }))],
    ['a yolo record that carries a decision', r409('gate_already_resolved', rec({ outcome: 'yolo', decision: allow, request_id: 'hub-r-1' }))],
    ['a timeout record that carries a decision', r409('gate_already_resolved', rec({ outcome: 'timeout', decision: allow }))],
    ['an incarnation_ended record that carries a decision', r409('gate_already_resolved', rec({ outcome: 'incarnation_ended', decision: allow }))],
    ['a cancelled record naming a request_id', r409('gate_already_resolved', rec({ outcome: 'cancelled', decision_unknown: true, request_id: 'hub-r-1' }))],
    ['gate_cancelled carrying a decision', r409('gate_cancelled', rec({ outcome: 'cancelled', provenance: 'cancelled', decision: allow }))],
  ] as const)('a contradiction is refused by the parser itself, not only by the classifier: %s', (_n, r) => {
    expect(parseConfirmReply(ours, r)).toEqual({ kind: 'unknown' });
  });
  // The parser's own result, not only the classifier's, for each check the classifier could mask.
  it.each([
    ['a record with an unrecognized outcome', r409('gate_already_resolved', rec({ outcome: 'expired', decision_unknown: true }))],
    ['a record whose outcome is a number', r409('gate_already_resolved', rec({ outcome: 1, decision_unknown: true }))],
    ['an answered record with an empty request_id', answered({ request_id: '' })],
    ['an answered record whose request_id is a number', answered({ request_id: 7 })],
    ['a reply whose ok is a string', { ok: 'false', status: 409, code: 'gate_decision_pending' }],
    ['a reply without ok', { status: 409, code: 'no_pending_gate' }],
    ['a success with a refusal code', { ok: true, status: 409, code: 'no_pending_gate' }],
  ] as const)('the parser itself refuses %s', (_n, r) => {
    expect(parseConfirmReply(ours, r)).toEqual({ kind: 'unknown' });
  });
  it('the parsed record carries no raw fields', () => {
    expect(parseConfirmReply(ours, answered({ decision: { ...allow, remember: false }, extra: 1 }))).toEqual({
      kind: 'record', outcome: 'answered', requestId: 'hub-r-1',
      decision: { approved: true, persistDirs: false, sessionScope: false, trustContainer: false, remember: false },
    });
  });
});

describe('parseDecision', () => {
  it('keeps the optional remember and superseded only when the agent sent them', () => {
    expect(parseDecision(allow)).toEqual({ approved: true, persistDirs: false, sessionScope: false, trustContainer: false });
    expect(parseDecision({ ...allow, approved: false, superseded: true })).toMatchObject({ approved: false, superseded: true });
  });
  it.each([null, [], 'yes', { ...allow, remember: null }, { ...allow, superseded: 0 }])('refuses %j', (v) => {
    expect(parseDecision(v)).toBe('unknown');
  });
});

const T: FrameTarget = { kind: 'confirm', gateId: 3 };
const Q: FrameTarget = { kind: 'question', questionId: 4 };
const cf = (o: Record<string, unknown>) => ({ kind: 'confirm', gate_id: 3, ...o });

const ONCE = 'decision applied once; session_scope allow is frozen by the locked approval policy';
const allowSession = { ...allow, session_scope: true };
const scopedFrame = (o: Record<string, unknown> = {}) => cf({ outcome: 'answered', provenance: 'decision', decision: allowSession, session_scope_applied: false, note: ONCE, ...o });

const FRAMES: [string, FrameTarget, unknown, 'ended' | 'unknown'][] = [
  ['cancelled by a session.cancel', T, cf({ outcome: 'cancelled', provenance: 'cancelled' }), 'ended'],
  ['auto-approved by YOLO', T, cf({ outcome: 'yolo', provenance: 'yolo' }), 'ended'],
  ['a session close', T, cf({ outcome: 'cancelled', provenance: 'closed' }), 'ended'],
  ['the turn unwinding', T, cf({ outcome: 'cancelled', provenance: 'context_cancelled' }), 'ended'],
  ['a helper timeout, with the helper fields', T, cf({ outcome: 'timeout', provenance: 'timeout', helper_id: 'h1', parent_tool_call_id: 'tu1', task_id: 'h1' }), 'ended'],
  ['a question cancelled', Q, { kind: 'question', question_id: 4, outcome: 'cancelled', provenance: 'cancelled' }, 'ended'],
  ['answered by a decision (the frame never says whose)', T, cf({ outcome: 'answered', provenance: 'decision', decision: allow, request_id: 'hub-r-1' }), 'unknown'],
  ['answered by a decision carrying our request_id', T, cf({ outcome: 'answered', provenance: 'decision', request_id: 'hub-r-1' }), 'unknown'],
  // identity and kind
  ['a bare frame without kind or identity', T, { outcome: 'cancelled', provenance: 'cancelled' }, 'unknown'],
  ['an unrecognized kind', T, { kind: 'gate', gate_id: 3, outcome: 'cancelled', provenance: 'cancelled' }, 'unknown'],
  ['a question frame for a confirm target', T, { kind: 'question', question_id: 3, outcome: 'cancelled', provenance: 'cancelled' }, 'unknown'],
  ['another gate', T, cf({ gate_id: 9, outcome: 'cancelled', provenance: 'cancelled' }), 'unknown'],
  ['a gate_id that is a string', T, cf({ gate_id: '3', outcome: 'cancelled', provenance: 'cancelled' }), 'unknown'],
  ['a gate_id that is a gateway nonce', T, cf({ gate_id: 'i7:3', outcome: 'cancelled', provenance: 'cancelled' }), 'unknown'],
  ['a confirm frame that also carries a question_id', T, cf({ question_id: 4, outcome: 'cancelled', provenance: 'cancelled' }), 'unknown'],
  ['a question frame that also carries a gate_id', Q, { kind: 'question', question_id: 4, gate_id: 3, outcome: 'cancelled', provenance: 'cancelled' }, 'unknown'],
  ['another question', Q, { kind: 'question', question_id: 5, outcome: 'cancelled', provenance: 'cancelled' }, 'unknown'],
  // one malformed row per other field read
  ['a request_id that is a number', T, cf({ outcome: 'cancelled', provenance: 'cancelled', request_id: 7 }), 'unknown'],
  ['a holder that is a number', T, cf({ outcome: 'cancelled', provenance: 'cancelled', holder: 1 }), 'unknown'],
  ['a generation that is a string', T, cf({ outcome: 'cancelled', provenance: 'cancelled', generation: '1' }), 'unknown'],
  ['a helper_id that is a number', T, cf({ outcome: 'cancelled', provenance: 'cancelled', helper_id: 1 }), 'unknown'],
  ['a parent_tool_call_id that is an object', T, cf({ outcome: 'cancelled', provenance: 'cancelled', parent_tool_call_id: {} }), 'unknown'],
  ['a task_id that is a number', T, cf({ outcome: 'cancelled', provenance: 'cancelled', task_id: 2 }), 'unknown'],
  ['no outcome', T, cf({ provenance: 'cancelled' }), 'unknown'],
  ['an unrecognized outcome', T, cf({ outcome: 'expired', provenance: 'cancelled' }), 'unknown'],
  ['an older agent (no provenance)', T, cf({ outcome: 'cancelled' }), 'unknown'],
  ['an empty provenance', T, cf({ outcome: 'cancelled', provenance: '' }), 'unknown'],
  ['an unrecognized provenance', T, cf({ outcome: 'cancelled', provenance: 'vanished' }), 'unknown'],
  // contradictions
  ['outcome yolo with provenance cancelled', T, cf({ outcome: 'yolo', provenance: 'cancelled' }), 'unknown'],
  ['outcome timeout with provenance closed', T, cf({ outcome: 'timeout', provenance: 'closed' }), 'unknown'],
  ['outcome cancelled with provenance decision', T, cf({ outcome: 'cancelled', provenance: 'decision' }), 'unknown'],
  ['outcome answered with a non-decision provenance', T, cf({ outcome: 'answered', provenance: 'cancelled' }), 'unknown'],
  ['a non-decision ending that carries a decision', T, cf({ outcome: 'cancelled', provenance: 'cancelled', decision: allow }), 'unknown'],
  ['a non-decision ending that carries a broken decision', T, cf({ outcome: 'cancelled', provenance: 'cancelled', decision: 'x' }), 'unknown'],
  // session_scope_applied / note (the event.gate_resolved frame; from the daemon: false + a note, answered only)
  ['a cancelled frame with session_scope_applied "no"', T, cf({ outcome: 'cancelled', provenance: 'cancelled', session_scope_applied: 'no' }), 'unknown'],
  ['a cancelled frame with a note that is a number', T, cf({ outcome: 'cancelled', provenance: 'cancelled', note: 42 }), 'unknown'],
  ['a cancelled frame carrying the agent\'s applied-once metadata', T, cf({ outcome: 'cancelled', provenance: 'cancelled', session_scope_applied: false, note: ONCE }), 'unknown'],
  ['a malformed payload', T, 'cancelled', 'unknown'],
  ['no payload', T, null, 'unknown'],
];

describe('parseGateResolved: the parser\'s own result', () => {
  it('keeps the agent\'s valid answered, scope-limited resolution', () => {
    expect(parseGateResolved(T, scopedFrame())).toEqual({
      kind: 'answered', scopeApplied: false, note: ONCE,
      decision: { approved: true, persistDirs: false, sessionScope: true, trustContainer: false },
    });
  });
  it.each([
    ['an answered frame with a non-decision provenance', cf({ outcome: 'answered', provenance: 'cancelled' })],
    ['an answered frame whose provenance is a number', cf({ outcome: 'answered', provenance: 1 })],
    ['session_scope_applied that is a string', scopedFrame({ session_scope_applied: 'no' })],
    ['session_scope_applied true (the agent sends only false)', scopedFrame({ session_scope_applied: true })],
    ['a note that is a number', scopedFrame({ note: 42 })],
    ['an empty note', scopedFrame({ note: '' })],
    ['session_scope_applied without its note', scopedFrame({ note: undefined })],
    ['a note without session_scope_applied', scopedFrame({ session_scope_applied: undefined })],
    ['scope metadata without a decision', scopedFrame({ decision: undefined })],
    ['scope metadata on a denial', scopedFrame({ decision: { ...allowSession, approved: false } })],
    ['scope metadata on a decision without session_scope', scopedFrame({ decision: allow })],
    ['scope metadata on a cancelled frame', cf({ outcome: 'cancelled', provenance: 'cancelled', session_scope_applied: false, note: ONCE })],
  ] as const)('refuses %s', (_n, frame) => {
    expect(parseGateResolved(T, frame)).toBe('unknown');
  });
  it('refuses scope metadata on a question frame', () => {
    expect(parseGateResolved(Q, { kind: 'question', question_id: 4, outcome: 'answered', session_scope_applied: false, note: ONCE })).toBe('unknown');
  });
});

describe('parseGateResolved + evidenceOfFrame', () => {
  it.each(FRAMES)('%s', (_name, target, frame, want) => {
    expect(evidenceOfFrame(parseGateResolved(target, frame))).toBe(want);
  });
  it('an answered frame parses as answered, with its decision only when it is the agent\'s shape', () => {
    expect(parseGateResolved(T, cf({ outcome: 'answered', provenance: 'decision', decision: { ...allow, remember: false } })))
      .toEqual({ kind: 'answered', decision: { approved: true, persistDirs: false, sessionScope: false, trustContainer: false, remember: false } });
    expect(parseGateResolved(T, cf({ outcome: 'answered', provenance: 'decision', decision: { ...allow, remember: 'no' } }))).toBe('unknown');
    expect(parseGateResolved(Q, { kind: 'question', question_id: 4, outcome: 'answered' })).toEqual({ kind: 'answered' });
    expect(parseGateResolved(Q, { kind: 'question', question_id: 4, outcome: 'answered', decision: allow })).toBe('unknown');
  });
});
