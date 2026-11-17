// Acceptance, group PROOF: the classifiers are the only source of a verdict, and a verdict is
// the only thing that removes an entry. The cells below are the verdict table; the lists are checked against the agent's
// documented codes (agent-codes.json) and against each other.
import { describe, expect, it } from 'vitest';
import { DOUBT, REFUSED, REFUSED_COMMON, classifyClosure, classifyCommandFrame, classifyReceipt, classifyReply, dismissal, fromCreateKept, fromDismissal, fromVerdict, mintKept, unknownVerdict, type Result } from '../journal/proof';
import type { Route } from '../journal/types';
import fixture from './agent-codes.json';

const H = 'atlas.tlas', R = 'f1f1f1f1f1f1f1f1f1f1f1f1', A = '64f0c0ffee0000000000c0de';
const K32 = 'hx-' + 'a'.repeat(32), K24 = 'hx-' + 'b'.repeat(24);
const ident = (route: Route) => ({ acct: A, h: H, k: route === 'confirm' || route === 'answer' ? K24 : K32, route });
const reply = (route: Route, gate = 'G1', gen = 3) => ({ ...ident(route), gate, gen });
const err = (status: number, code: string, details?: unknown): Result => ({ ok: false, e: { status, code, ...(details !== undefined ? { details } : {}) } });
const ok = (b: unknown): Result => ({ ok: true, b });
const DEC = { approved: true, persist_dirs: false, session_scope: false, trust_computer: false };
const resolved = (o: Record<string, unknown> = {}) => ({ gate_id: 'G1', generation: 3, outcome: 'answered', decision: DEC, request_id: K24, ...o });
const ROUTES: Route[] = ['create', 'turn', 'command', 'confirm', 'answer'];

describe('the lists agree with each other and with the agent\'s documented codes', () => {
  it('DOUBT and REFUSED (with the common refusals) are disjoint for every route', () => {
    for (const r of ROUTES) {
      const refused = new Set([...REFUSED[r], ...REFUSED_COMMON]);
      expect([...DOUBT[r]].filter((c) => refused.has(c)), `${r}: a code is both "may have run" and "nothing ran"`).toEqual([]);
    }
  });
  it('every listed code is documented for its operation (agent-codes.json), except the few documented elsewhere in the spec', () => {
    // forbidden: the Source IP Guard's code, documented once for the whole API. The rest: documented in the route table of
    // the agent but absent from the checked-in spec text of these operations.
    const ELSEWHERE: Record<string, readonly string[]> = {
      // container_conflict, container_gone, acp_container_unsupported: the spellings before the rename, still accepted for an
      // agent that has not been updated (deploy skew); the renamed agent documents computer_* only.
      create: ['forbidden', 'unsupported_setting', 'delegated_agent_unavailable', 'unknown_chat_agent', 'model_unavailable', 'container_conflict', 'container_gone', 'acp_container_unsupported'],
      turn: ['forbidden', 'session_terminating', 'approval_policy_active'],
      command: ['forbidden'], confirm: ['forbidden'], answer: ['forbidden'],
    };
    for (const r of ROUTES) {
      const documented = new Set((fixture.ops as Record<string, { codes: string[] }>)[r]!.codes);
      const undocumented = [...DOUBT[r], ...REFUSED[r], ...REFUSED_COMMON].filter((c) => !documented.has(c) && !ELSEWHERE[r]!.includes(c));
      expect(undocumented, `${r}: listed but not documented`).toEqual([]);
    }
  });
  it('no row proves anything from a 404, on any route', () => {
    for (const r of ROUTES) {
      const v = classifyReply(reply(r), err(404, 'session_not_found'));
      expect(v.t, r).toBe('unknown');
      expect(classifyReply(reply(r), err(404, 'bad_request')).t, `${r}: a 404 with a refusal code`).toBe('unknown');
    }
  });
});

describe('the POST reply', () => {
  it('a 2xx names what it made: a session, a turn, a command (an unknown state is not settled), an applied decision', () => {
    expect(classifyReply(reply('create'), ok({ session_id: 'sess-1' }))).toMatchObject({ t: 'settled', sid: 'sess-1' });
    expect(classifyReply(reply('create'), ok({}))).toMatchObject({ t: 'unknown' });
    expect(classifyReply(reply('turn'), ok({ turn_id: 't1' })).t).toBe('settled');
    expect(classifyReply(reply('turn'), ok({ state: 'accepted' })).t).toBe('unknown');
    expect(classifyReply(reply('command'), ok({ command_id: 'c1', state: 'committed' })).t).toBe('settled');
    expect(classifyReply(reply('command'), ok({ command_id: 'c1', state: 'queued' }))).toMatchObject({ t: 'admitted', ref: { command: 'c1' } });
    expect(classifyReply(reply('command'), ok({ command_id: 'c1', state: 'mystery' })).t).toBe('unknown');
    expect(classifyReply(reply('confirm'), ok({ status: 'ok' })).t).toBe('settled');
    expect(classifyReply(reply('confirm'), ok({})).t).toBe('unknown');
    expect(classifyReply(reply('answer'), ok('ok')).t).toBe('unknown');
  });
  it('confirm 409 gate_already_resolved: our request id with a decision settles; another id is notAdmitted; malformed details are unknown', () => {
    const c = reply('confirm');
    expect(classifyReply(c, err(409, 'gate_already_resolved', resolved())).t).toBe('settled');
    expect(classifyReply(c, err(409, 'gate_already_resolved', resolved({ request_id: 'hx-' + 'c'.repeat(24) }))).t).toBe('notAdmitted');
    expect(classifyReply(c, err(409, 'gate_already_resolved', resolved({ outcome: 'cancelled', decision: undefined, decision_unknown: true }))).t).toBe('notAdmitted');
    expect(classifyReply(c, err(409, 'gate_already_resolved', resolved({ gate_id: 'G2' }))).t, 'another gate').toBe('unknown');
    expect(classifyReply(c, err(409, 'gate_already_resolved', resolved({ generation: 4 }))).t, 'another generation').toBe('unknown');
    expect(classifyReply(c, err(409, 'gate_already_resolved', resolved({ decision: { approved: true } }))).t, 'a decision with three booleans missing').toBe('unknown');
    expect(classifyReply(c, err(409, 'gate_already_resolved', resolved({ decision_unknown: true }))).t, 'both a decision and decision_unknown').toBe('unknown');
    expect(classifyReply(c, err(409, 'gate_already_resolved', { gate_id: 'G1' })).t).toBe('unknown');
    expect(classifyReply(c, err(409, 'gate_already_resolved')).t).toBe('unknown');
  });
  it('answer 409 gate_already_answered is notAdmitted only with exactly {gate_id, generation} for this gate', () => {
    const c = reply('answer');
    expect(classifyReply(c, err(409, 'gate_already_answered', { gate_id: 'G1', generation: 3 })).t).toBe('notAdmitted');
    expect(classifyReply(c, err(409, 'gate_already_answered', { retry_after_ms: 1 })).t).toBe('unknown');
    expect(classifyReply(c, err(409, 'gate_already_answered', { gate_id: 'G1', generation: 3, retry_after_ms: 1 })).t, 'extra keys').toBe('unknown');
    expect(classifyReply(c, err(409, 'gate_already_answered', { gate_id: 'G9', generation: 3 })).t).toBe('unknown');
  });
  it('422 idempotency_key_reused is unknown on every keyed route', () => {
    for (const r of ['create', 'turn', 'command'] as Route[]) expect(classifyReply(reply(r), err(422, 'idempotency_key_reused')).t, r).toBe('unknown');
  });
  it('confirm 409 gate_cancelled is unknown (it is documented for answer only); answer gate_cancelled is a refusal', () => {
    expect(classifyReply(reply('confirm'), err(409, 'gate_cancelled')).t).toBe('unknown');
    expect(classifyReply(reply('answer'), err(409, 'gate_cancelled')).t).toBe('notAdmitted');
  });
  it('a retired key is notAdmitted only when details.admitted is exactly "false" and the code is this route\'s', () => {
    expect(classifyReply(reply('turn'), err(409, 'turn_key_retired', { admitted: 'false' })).t).toBe('notAdmitted');
    expect(classifyReply(reply('turn'), err(409, 'turn_key_retired', { admitted: 'unknown' })).t).toBe('unknown');
    expect(classifyReply(reply('turn'), err(409, 'turn_key_retired', { admitted: 'true' })).t).toBe('unknown');
    expect(classifyReply(reply('turn'), err(409, 'turn_key_retired')).t).toBe('unknown');
    expect(classifyReply(reply('turn'), err(409, 'command_key_retired', { admitted: 'false' })).t, 'a command code on a turn').toBe('unknown');
    expect(classifyReply(reply('create'), err(409, 'create_key_retired', { admitted: 'false' })).t).toBe('notAdmitted');
  });
  it('a turn\'s admission_unconfirmed names its receipt (turn_id) for a later read by id', () => {
    expect(classifyReply(reply('turn'), err(409, 'admission_unconfirmed', { turn_id: 't9' }))).toMatchObject({ t: 'unknown', ref: { turn: 't9' } });
    expect(classifyReply(reply('command'), err(409, 'admission_unconfirmed', { turn_id: 't9' })).ref).toBeUndefined();
  });
  it('documented refusals are notAdmitted, doubt codes are unknown, anything else (status 0, 5xx, pending, a stale call, an unlisted code) is unknown', () => {
    expect(classifyReply(reply('create'), err(400, 'bad_request')).t).toBe('notAdmitted');
    expect(classifyReply(reply('create'), err(403, 'forbidden')).t).toBe('notAdmitted');
    expect(classifyReply(reply('turn'), err(409, 'turn_in_flight')).t).toBe('notAdmitted');
    expect(classifyReply(reply('create'), err(500, 'internal_error')).t).toBe('unknown');
    expect(classifyReply(reply('create'), err(0, 'bad_request')).t, 'a refusal code with no HTTP status proves nothing').toBe('unknown');
    expect(classifyReply(reply('turn'), err(302, 'forbidden')).t, 'nor does a code on a non-error status').toBe('unknown');
    expect(classifyReply(reply('create'), err(0, '')).t).toBe('unknown');
    expect(classifyReply(reply('create'), err(400, 'some_new_code')).t, 'no broad 4xx rule').toBe('unknown');
    expect(classifyReply(reply('confirm'), err(409, 'gate_decision_pending')).t).toBe('unknown');
    expect(classifyReply(reply('turn'), { ok: false, e: { pending: true } }).t).toBe('unknown');
    expect(classifyReply(reply('turn'), { ok: false, e: new Error('boom') }).t).toBe('unknown');
    expect(classifyReply(reply('turn'), { ok: false, e: { stale: true } }).t).toBe('unknown');
  });
  it('an error core made before anything left (not_sent) is notAdmitted', () => {
    expect(classifyReply(reply('turn'), { ok: false, e: { kind: 'not_sent', notSent: true, code: 'TICKET_REFUSED' } }).t).toBe('notAdmitted');
    expect(classifyReply(reply('turn'), { ok: false, e: { notSent: true } }).t).toBe('notAdmitted');
  });
});

describe('a read by id and a frame', () => {
  it('a command read that answers 403, 404, 429 or a core not_sent describes the READ: unknown, never a removal', () => {
    for (const e of [{ status: 403, code: 'forbidden' }, { status: 404, code: 'not_found' }, { status: 429, code: 'rate_limited' }, { kind: 'not_sent', notSent: true }]) {
      expect(classifyReceipt(ident('command'), 'command', 'c1', { ok: false, e }).t).toBe('unknown');
    }
  });
  it('a receipt naming the id read settles an ended command and ADMITS a queued one (the entry stays); another id proves nothing', () => {
    expect(classifyReceipt(ident('command'), 'command', 'c1', ok({ command_id: 'c1', state: 'committed' })).t).toBe('settled');
    expect(classifyReceipt(ident('command'), 'command', 'c1', ok({ command_id: 'c1', state: 'queued' }))).toMatchObject({ t: 'admitted', ref: { command: 'c1' } });
    expect(classifyReceipt(ident('command'), 'command', 'c1', ok({ command_id: 'c2', state: 'committed' })).t).toBe('unknown');
    expect(classifyReceipt(ident('command'), 'command', '', ok({ command_id: 'c1', state: 'committed' })).t, 'no id read').toBe('unknown');
    expect(classifyReceipt(ident('turn'), 'turn', 't1', ok({ turn_id: 't1' })).t).toBe('settled');
    expect(classifyReceipt(ident('turn'), 'turn', 't1', ok({ turn_id: 't2' })).t).toBe('unknown');
  });
  it('a closure frame closes only with a documented outcome and consistent provenance; pending, missing or contradictory ones prove nothing', () => {
    const g = { id: 'G1', generation: 3, kind: 'confirm' as const };
    const f = (o: Record<string, unknown>) => classifyClosure(ident('confirm'), g, { kind: 'confirm', ...o });
    expect(f({ outcome: 'answered', provenance: 'decision' }).t).toBe('closed');
    expect(f({ outcome: 'cancelled', provenance: 'cancelled' }).t).toBe('closed');
    expect(f({ outcome: 'pending' }).t).toBe('unknown');
    expect(f({}).t).toBe('unknown');
    expect(f({ outcome: 'answered', provenance: 'cancelled' }).t, 'answered by cancellation').toBe('unknown');
    expect(f({ outcome: 'cancelled', provenance: 'decision' }).t).toBe('unknown');
    expect(f({ outcome: 'answered', provenance: 'invented' }).t).toBe('unknown');
    expect(f({ outcome: 'cancelled', decision: DEC }).t, 'a decision on a cancellation').toBe('unknown');
    expect(classifyClosure(ident('answer'), { id: 'G1', generation: 3, kind: 'question' }, { kind: 'confirm', outcome: 'answered' }).t, 'another gate kind').toBe('unknown');
    expect(classifyClosure(ident('confirm'), g, 'closed').t).toBe('unknown');
  });
  it('a question answered under a gateway id, or a late cancelled copy, is CLOSED (never settled): the card says closed, not applied', () => {
    const q = { id: 'G1', generation: 3, kind: 'question' as const };
    const a = classifyClosure(ident('answer'), q, { kind: 'question', outcome: 'answered', request_id: 'req-123', provenance: 'decision' });
    expect(a.t).toBe('closed');
    const c = classifyClosure(ident('confirm'), { id: 'G1', generation: 3, kind: 'confirm' }, { kind: 'confirm', outcome: 'cancelled', request_id: K24, provenance: 'cancelled' });
    expect(c.t).toBe('closed');
    expect(c.t).not.toBe('settled');
  });
  it('a command frame settles only through the command id this page holds', () => {
    const f = (ids: string[], kind: 'committed' | 'settled', state: string) => ({ type: 'command' as const, kind, ids, state });
    expect(classifyCommandFrame(ident('command'), 'c1', f(['c1'], 'committed', 'committed')).t).toBe('settled');
    expect(classifyCommandFrame(ident('command'), 'c1', f(['c2'], 'committed', 'committed')).t).toBe('unknown');
    expect(classifyCommandFrame(ident('command'), undefined, f(['c1'], 'committed', 'committed')).t).toBe('unknown');
    expect(classifyCommandFrame(ident('command'), 'c1', f(['c1'], 'settled', 'refused')).t).toBe('settled');
    expect(classifyCommandFrame(ident('command'), 'c1', f(['c1'], 'settled', 'queued')).t).toBe('unknown');
  });
});

describe('what a verdict may remove (the removal door)', () => {
  it('a create\'s settled verdict alone is no proof; with the handoff Kept it is', () => {
    const v = classifyReply(reply('create'), ok({ session_id: 'sess-1' }));
    expect(v.t).toBe('settled');
    expect(fromVerdict(v)).toBeNull();
    const kept = mintKept({ acct: A, h: H, r: R, k1: K32, sid: 'sess-1' });
    expect(fromCreateKept(v, kept)).not.toBeNull();
    expect(fromCreateKept(classifyReply(reply('turn'), ok({ turn_id: 't1' })), kept), 'a turn verdict is not a create handoff').toBeNull();
  });
  it('an unknown or admitted verdict proves nothing; a settled/notAdmitted/closed one does; a forged object never does', () => {
    expect(fromVerdict(unknownVerdict('reply', ident('turn'), 'x'))).toBeNull();
    expect(fromVerdict(classifyReply(reply('turn'), err(0, '')))).toBeNull();
    expect(fromVerdict(classifyReply(reply('command'), ok({ command_id: 'c', state: 'queued' })))).toBeNull();
    expect(fromVerdict(classifyReply(reply('command'), ok({ command_id: 'c', state: 'committed' })))).not.toBeNull();
    // A turn entry goes only with the Kept of the chat record that replaces it (fromTurnKept).
    expect(fromVerdict(classifyReply(reply('turn'), ok({ turn_id: 't1' })))).toBeNull();
    expect(fromVerdict(classifyReply(reply('turn'), err(409, 'turn_in_flight')))).toBeNull();
    expect(fromVerdict({ t: 'settled', src: 'reply', acct: A, h: H, k: K32, route: 'turn', why: 'x', body: null } as never)).toBeNull();
    expect(fromVerdict(null)).toBeNull();
    expect(fromDismissal({ person: true } as never, { acct: A, h: H, k: K32 })).toBeNull();
    expect(fromDismissal(dismissal(), { acct: A, h: H, k: K32 })).not.toBeNull();
  });
});
