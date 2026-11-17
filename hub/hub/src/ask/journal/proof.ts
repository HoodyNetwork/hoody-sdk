// proof.ts: the ONLY place a Verdict, a removal proof, a Dismissal or a Kept is made, and every classifier that turns evidence
// into a Verdict.
//
// The rules:
//   - Four classifiers, one per evidence source: the POST reply (classifyReply), a receipt read (classifyReceipt), a gate
//     closure frame (classifyClosure) and a command frame (classifyCommandFrame). Each is an ORDERED allow-list; the default
//     is `unknown`. A 404 never proves anything. A failed read never proves "not admitted".
//   - A gate frame proves only that the gate CLOSED, never whose decision applied (the frame carries no request id of ours).
//   - A Verdict is frozen and registered in a private WeakSet; a look-alike object is not one.
//   - A removal proof is bound to its store, account, handle and key: fromVerdict (settled on any route but create,
//     notAdmitted, closed), fromCreateKept (a create's settled verdict AND the Kept that records.ts minted for it),
//     fromDismissal (the person), neverLeft (the door, for an entry whose request never left).
//   - No catch block, error code or details field reaches a constructor: callers hand constructors a Verdict.
import * as L from '../logic';
import type { Entry, Ident, Route } from './types';

export type Src = 'reply' | 'receipt' | 'retire' | 'frame';
export type VerdictType = 'settled' | 'admitted' | 'notAdmitted' | 'closed' | 'unknown';
export interface Verdict {
  readonly t: VerdictType;
  readonly src: Src;
  readonly acct: string;
  readonly h: string;
  readonly k: string;
  readonly route: Route;
  /** A short machine reason. Never shown. */
  readonly why: string;
  readonly body: unknown;
  /** A settled create: the new session (absent = settled, the chat is unavailable). */
  readonly sid?: string;
  /** Ids the attempt's own reply gave, for a later read by id (turn_id of admission_unconfirmed, command_id of a queued receipt). */
  readonly ref?: { readonly turn?: string; readonly command?: string };
}
export type Result = { readonly ok: true; readonly b: unknown } | { readonly ok: false; readonly e: unknown };

const issued = new WeakSet<object>();
function mk(t: VerdictType, src: Src, id: Ident & { route: Route }, why: string, extra: { body?: unknown; sid?: string; ref?: { turn?: string; command?: string } } = {}): Verdict {
  const v: Verdict = Object.freeze({
    t, src, acct: id.acct, h: id.h, k: id.k, route: id.route, why, body: extra.body ?? null,
    ...(extra.sid !== undefined ? { sid: extra.sid } : {}),
    ...(extra.ref && (extra.ref.turn || extra.ref.command) ? { ref: Object.freeze({ ...extra.ref }) } : {}),
  });
  issued.add(v);
  return v;
}
export const isVerdict = (v: unknown): v is Verdict => typeof v === 'object' && v !== null && issued.has(v);
/** Unknown, from a source that could not even look (a refused read, a missing id). Made here so callers never build one. */
export const unknownVerdict = (src: Src, id: Ident & { route: Route }, why: string): Verdict => mk('unknown', src, id, why);

// ---- reading a core HubError ----
function codeOf(e: unknown): string {
  if (!L.isObj(e)) return '';
  if (typeof e.code === 'string') return e.code;
  const d = L.isObj(e.data) ? e.data : null;
  return d && typeof d.code === 'string' ? d.code : '';
}
function detailsOf(e: unknown): Record<string, unknown> {
  const x = L.isObj(e) ? e : {};
  return L.isObj(x.details) && !Array.isArray(x.details) ? x.details
    : L.isObj(x.data) && L.isObj(x.data.details) && !Array.isArray(x.data.details) ? x.data.details : {};
}
const statusOf = (e: unknown): number => (L.isObj(e) && typeof e.status === 'number' ? e.status : 0);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

// ---- the lists ----
/** Codes documented as "may have run". */
export const DOUBT: Readonly<Record<Route, ReadonlySet<string>>> = {
  create: new Set(['creation_interrupted', 'idempotency_key_reused', 'admission_write_failed', 'internal_error', 'service_unavailable']),
  turn: new Set(['admission_unconfirmed', 'idempotency_key_reused', 'session_terminating', 'internal_error', 'service_unavailable']),
  command: new Set(['admission_unconfirmed', 'idempotency_key_reused', 'internal_error', 'service_unavailable']),
  confirm: new Set(['gate_decision_pending', 'no_pending_gate', 'stale_gate', 'internal_error', 'service_unavailable']),
  answer: new Set(['decision_unconfirmed', 'no_pending_gate', 'stale_gate', 'internal_error', 'service_unavailable']),
};
/** Every route also refuses these. */
export const REFUSED_COMMON: ReadonlySet<string> = new Set(['bad_request', 'invalid_realm', 'forbidden', 'payload_too_large', 'rate_limited']);
/** Codes documented as "nothing ran", or refused before dispatch (besides REFUSED_COMMON). */
export const REFUSED: Readonly<Record<Route, ReadonlySet<string>>> = {
  create: new Set(['realm_blocked', 'realm_corrupt', 'realm_conflict', 'container_conflict', 'computer_conflict', 'delegated_agent_invalid', 'invalid_tool_mode', 'invalid_dir_scope',
    'unsupported_setting', 'realm_not_allowed', 'approval_policy_unsatisfiable', 'approval_policy_locked', 'binding_mismatch', 'binding_unverifiable',
    'approver_lease_invalid', 'delegated_agent_unavailable', 'cwd_not_found', 'container_gone', 'computer_gone', 'acp_container_unsupported', 'acp_computer_unsupported', 'unknown_model',
    'unknown_chat_agent', 'model_unavailable', 'policy_commit_failed', 'session_terminating', 'restriction_unknown']),
  turn: new Set(['realm_scope_unsupported', 'empty_prompt', 'invalid_tool_mode', 'invalid_dir_scope', 'realm_not_allowed', 'gate_parked', 'turn_in_flight',
    'approval_policy_active', 'admission_write_failed', 'restriction_unknown']),
  command: new Set(['realm_scope_unsupported', 'realm_not_allowed', 'session_closed', 'command_unsupported', 'command_queue_full', 'idempotency_keys_exhausted',
    'admission_write_failed', 'restriction_unknown']),
  confirm: new Set(['realm_scope_unsupported', 'approved_required', 'gate_type_mismatch', 'decision_incomplete', 'approver_lease_required', 'approver_lease_invalid',
    'approver_lease_expired']),
  answer: new Set(['realm_scope_unsupported', 'gate_type_mismatch', 'gate_cancelled']),
};
const KEY_RETIRED: Readonly<Record<string, Route>> = { create_key_retired: 'create', turn_key_retired: 'turn', command_key_retired: 'command' };
const COMMAND_END: ReadonlySet<string> = new Set(['committed', 'superseded', 'refused', 'failed']);
const OUTCOMES: ReadonlySet<string> = new Set(['answered', 'cancelled', 'yolo', 'timeout']);
const PROVENANCE: ReadonlySet<string> = new Set(['decision', 'yolo', 'cancelled', 'closed', 'context_cancelled', 'timeout']);
const DETAIL_OUTCOMES: ReadonlySet<string> = new Set(['answered', 'cancelled', 'timeout', 'yolo', 'incarnation_ended', 'unknown']);

/** What a reply classifier needs to know about the request it answers. */
export interface ReplyCtx extends Ident {
  route: Route;
  /** confirm and answer: the gate and its generation; confirm: the request id is `k`. */
  gate?: string;
  gen?: number;
  /** create: the engine's own test of a 2xx body ("is this THE session I asked for"). A body it does not accept is `unknown`, never a
   *  settlement: the request may have been admitted, but not as this reply says. In memory only, never stored. */
  accepts?: Accepts;
}
/** A create's test of a 2xx body: true = this is the session asked for; false = it is not proven (unknown); the literal 'refuse' = the
 *  reply PROVES another binding (settled as refused: the chat's record is removed, never moved to that session). */
export type Accepts = (body: Record<string, unknown>) => boolean | 'refuse';

/** A confirm/answer decision object: four booleans. */
function validDecision(d: unknown): boolean {
  return L.isObj(d) && typeof d.approved === 'boolean' && typeof d.persist_dirs === 'boolean' && typeof d.session_scope === 'boolean' && typeof d.trust_computer === 'boolean';
}

/** gate_already_resolved details, validated whole. Returns the parsed facts or null. */
function resolvedDetails(d: Record<string, unknown>): { gate: string; gen: number; outcome: string; decision: boolean; rid: string } | null {
  if (typeof d.gate_id !== 'string' || !d.gate_id || !isInt(d.generation) || typeof d.outcome !== 'string' || !DETAIL_OUTCOMES.has(d.outcome)) return null;
  const hasDecision = d.decision !== undefined, unknownDecision = d.decision_unknown !== undefined;
  if (hasDecision === unknownDecision) return null;                              // exactly one of the two
  if (hasDecision && !validDecision(d.decision)) return null;
  if (unknownDecision && d.decision_unknown !== true) return null;
  if (d.request_id !== undefined && typeof d.request_id !== 'string') return null;
  return { gate: d.gate_id, gen: d.generation, outcome: d.outcome, decision: hasDecision, rid: typeof d.request_id === 'string' ? d.request_id : '' };
}

// ---- 1. the POST reply (only door.post calls it) ----
export function classifyReply(c: ReplyCtx, r: Result): Verdict {
  const id = { acct: c.acct, h: c.h, k: c.k, route: c.route };
  const v = (t: VerdictType, why: string, extra: Parameters<typeof mk>[4] = {}) => mk(t, 'reply', id, why, extra);
  if (!r.ok) {
    const e = r.e;
    // P1: core or the guard refused it before anything left.
    if (L.isObj(e) && (e.kind === 'not_sent' || e.notSent === true)) return v('notAdmitted', 'unsent');
    const status = statusOf(e), code = codeOf(e), d = detailsOf(e);
    // A 404 proves nothing (a hidden session, a missing route).
    if (status === 404) return v('unknown', 'notFound');
    // P4: documented as "may have run". A turn names its receipt for a later read by id.
    if (DOUBT[c.route].has(code)) {
      const turn = c.route === 'turn' && (code === 'admission_unconfirmed' || code === 'idempotency_key_reused') && L.seg(d.turn_id) ? d.turn_id : undefined;
      return v('unknown', 'doubt', turn ? { ref: { turn } } : {});
    }
    // P5: confirm 409 gate_already_resolved: valid details naming this gate and generation decide whether it was OUR decision.
    if (c.route === 'confirm' && status === 409 && code === 'gate_already_resolved') {
      const x = resolvedDetails(d);
      if (x && x.gate === c.gate && x.gen === c.gen) {
        return x.outcome === 'answered' && x.decision && x.rid === c.k ? v('settled', 'own', { body: d }) : v('notAdmitted', 'other');
      }
    }
    // P6: answer 409 gate_already_answered with exactly {gate_id, generation} for this gate.
    if (c.route === 'answer' && status === 409 && code === 'gate_already_answered') {
      const keys = Object.keys(d);
      if (keys.length === 2 && d.gate_id === c.gate && d.generation === c.gen) return v('notAdmitted', 'other');
    }
    // P7: a retired key that was never admitted.
    if (KEY_RETIRED[code] === c.route && d.admitted === 'false') return v('notAdmitted', 'retired');
    // P8: documented as "nothing ran".
    if (status >= 400 && status <= 599 && (REFUSED_COMMON.has(code) || REFUSED[c.route].has(code))) return v('notAdmitted', 'refused');
    // P9: everything else (status 0, abort, pending, stale, SCRUB_FAILED, a malformed body, an unlisted code).
    return v('unknown', 'doubt');
  }
  // P2: a 2xx body.
  const b = r.b;
  if (!L.isObj(b)) return v('unknown', 'badReply');
  switch (c.route) {
    case 'create': {
      if (!L.seg(b.session_id)) return v('unknown', 'noSession');
      let ok: 'made' | 'refuse' | 'no' = 'made';
      if (c.accepts) { try { const a = c.accepts(b); ok = a === true ? 'made' : a === 'refuse' ? 'refuse' : 'no'; } catch { ok = 'no'; } }
      if (ok === 'refuse') return v('settled', 'refused', { body: b, sid: b.session_id });
      return ok === 'made' ? v('settled', 'made', { body: b, sid: b.session_id }) : v('unknown', 'notThis');
    }
    case 'turn': return L.seg(b.turn_id) ? v('settled', 'accepted', { body: b }) : v('unknown', 'noTurn');
    case 'command': {
      if (!L.seg(b.command_id)) return v('unknown', 'noCommand');
      const st = typeof b.state === 'string' ? b.state : '';
      if (COMMAND_END.has(st)) return v('settled', st, { body: b });
      return st === 'queued' ? v('admitted', 'queued', { body: b, ref: { command: b.command_id } }) : v('unknown', 'badState');
    }
    case 'confirm':
    case 'answer': return b.status === 'ok' ? v('settled', 'applied', { body: b }) : v('unknown', 'badReply');
    default: return v('unknown', 'badRoute');
  }
}

// ---- 2. a receipt read (by the id the attempt's own reply gave) ----
export type ReceiptKind = 'command' | 'turn';
/** `idRead`: the id the read asked for. A receipt must name it. A rejection of any kind describes the READ: unknown. */
export function classifyReceipt(c: Ident & { route: Route }, kind: ReceiptKind, idRead: string, r: Result): Verdict {
  const id = { acct: c.acct, h: c.h, k: c.k, route: c.route };
  const u = (why: string) => mk('unknown', 'receipt', id, why);
  if (!r.ok || !idRead || !L.isObj(r.b)) return u(r.ok ? 'badReply' : 'readFailed');
  const b = r.b;
  if (kind === 'turn') return L.seg(b.turn_id) && b.turn_id === idRead ? mk('settled', 'receipt', id, 'accepted', { body: b }) : u('noEvidence');
  if (!L.seg(b.command_id) || b.command_id !== idRead) return u('noEvidence');
  const st = typeof b.state === 'string' ? b.state : '';
  if (COMMAND_END.has(st)) return mk('settled', 'receipt', id, st, { body: b });
  return st === 'queued' ? mk('admitted', 'receipt', id, 'queued', { body: b, ref: { command: b.command_id } }) : u('badState');
}

// ---- 2b. A read or a retire BY KEY (recover.ts check) ----
// The routes: ask/data.ts (createKeyGet/Retire, turnByKey/Retire, commandByKey/Retire). A read changes nothing and a MISS proves
// nothing: it is `unknown` with why `miss` (the only thing that lets recover.ts go on to a retire). Only a retire fences a key, so
// only `{retired:true, admitted:"false"}` (from a retire, or from a read of a key an earlier retire fenced) is `notAdmitted`.
// "admitted: unknown", an in-flight create, an allocated row without a session, a refused or failed call, a hidden session (a bare
// 404 not_found) and every shape that is not listed stay `unknown`.
export type KeyRoute = 'create' | 'turn' | 'command';
const MISS_CODE: Readonly<Record<KeyRoute, string>> = { create: 'create_not_found', turn: 'turn_not_found', command: 'command_not_found' };
type KeyId = Ident & { route: KeyRoute };

/** A turn or command receipt read by key, or named by a retire that found the key admitted. */
function keyReceipt(id: KeyId, src: Src, b: unknown): Verdict {
  const u = (why: string) => mk('unknown', src, id, why);
  if (!L.isObj(b)) return u('badReply');
  if (id.route === 'turn') return L.seg(b.turn_id) ? mk('settled', src, id, 'accepted', { body: b }) : u('noEvidence');
  if (!L.seg(b.command_id)) return u('noEvidence');
  const st = typeof b.state === 'string' ? b.state : '';
  if (COMMAND_END.has(st)) return mk('settled', src, id, st, { body: b });
  return st === 'queued' ? mk('admitted', src, id, 'queued', { body: b, ref: { command: b.command_id } }) : u('badState');
}
/** A create that was admitted: the new session, or none (the chat is unavailable). */
const createMade = (id: KeyId, src: Src, why: string, b: Record<string, unknown>): Verdict =>
  L.seg(b.session_id) ? mk('settled', src, id, why, { body: b, sid: b.session_id }) : mk('settled', src, id, why, { body: b });

export function classifyKeyRead(c: Ident & { route: KeyRoute }, r: Result): Verdict {
  const id: KeyId = { acct: c.acct, h: c.h, k: c.k, route: c.route };
  const u = (why: string) => mk('unknown', 'receipt', id, why);
  if (!r.ok) {
    const e = r.e;
    if (statusOf(e) === 404 && codeOf(e) === MISS_CODE[c.route]) {
      if (c.route === 'create') return u('miss');
      const d = detailsOf(e);
      if (d.retired === false) return u('miss');
      if (d.retired === true) return d.admitted === 'false' ? mk('notAdmitted', 'receipt', id, 'retired') : u('retiredUnknown');
      return u('badMiss');
    }
    return u('readFailed');
  }
  const b = r.b;
  if (!L.isObj(b)) return u('badReply');
  if (c.route !== 'create') return keyReceipt(id, 'receipt', b);
  switch (b.state) {
    case 'started': return createMade(id, 'receipt', 'started', b);
    case 'allocated':
      if (typeof b.in_flight !== 'boolean') return u('badReply');
      if (b.in_flight) return u('inFlight');
      return L.seg(b.session_id) ? createMade(id, 'receipt', 'allocated', b) : u('allocatedNoSession');
    case 'retired': return b.admitted === 'false' ? mk('notAdmitted', 'receipt', id, 'retired') : u('retiredUnknown');
    default: return u('badState');
  }
}

export function classifyKeyRetire(c: Ident & { route: KeyRoute }, r: Result): Verdict {
  const id: KeyId = { acct: c.acct, h: c.h, k: c.k, route: c.route };
  const u = (why: string) => mk('unknown', 'retire', id, why);
  if (!r.ok) return u('retireFailed');
  const b = r.b;
  if (!L.isObj(b) || typeof b.retired !== 'boolean') return u('badReply');
  if (b.retired) return b.admitted === 'false' ? mk('notAdmitted', 'retire', id, 'fenced') : u('admittedUnknown');
  if (c.route === 'create') {
    // The handler fills `admitted` even for a row it only describes, so the state decides first.
    if (b.state === 'allocated') {
      if (typeof b.in_flight !== 'boolean') return u('badReply');
      if (b.in_flight) return u('inFlight');
      return L.seg(b.session_id) ? createMade(id, 'retire', 'allocated', b) : u('allocatedNoSession');
    }
    return b.admitted === 'true' ? createMade(id, 'retire', 'started', b) : u('admittedUnknown');
  }
  return b.admitted === 'true' ? keyReceipt(id, 'retire', b[c.route]) : u('admittedUnknown');
}

/** A fork's retire that found its row allocated, not in flight, with no session: the create was refused after it reserved the key (the
 *  fork's parent was gone), so no chat exists. The retire could not fence the row (it is reported, not retired), so this is the one
 *  place that reads it as the chat being unavailable: a settled create without a session, which the settler treats as it treats a
 *  started row without one. Any other verdict gives null. forkRecovery.ts is its only caller (journal.conformance.test.ts pins that). */
export function endedAsUnavailable(v: Verdict): Verdict | null {
  if (v.t !== 'unknown' || v.src !== 'retire' || v.route !== 'create' || v.why !== 'allocatedNoSession') return null;
  return mk('settled', 'retire', { acct: v.acct, h: v.h, k: v.k, route: 'create' }, 'ended');
}

// ---- 3. a gate closure frame (observe) ----
export interface GateRef { readonly id: string; readonly generation: number; readonly kind: 'confirm' | 'question' }
/** The frame closes the gate `gate` (the MIRROR's gateway id and generation, matched by the reducer). It proves the gate CLOSED. */
export function classifyClosure(c: Ident & { route: Route }, gate: GateRef, data: unknown): Verdict {
  const id = { acct: c.acct, h: c.h, k: c.k, route: c.route };
  const u = (why: string) => mk('unknown', 'frame', id, why);
  if (!L.isObj(data) || data.kind !== gate.kind) return u('badFrame');
  const outcome = data.outcome;
  if (typeof outcome !== 'string' || !OUTCOMES.has(outcome)) return u('badOutcome');
  const prov = data.provenance;
  if (prov !== undefined) {
    if (typeof prov !== 'string' || !PROVENANCE.has(prov)) return u('badProvenance');
    if ((outcome === 'answered') !== (prov === 'decision')) return u('contradiction');
  }
  if (data.decision !== undefined && (outcome !== 'answered' || gate.kind !== 'confirm' || !validDecision(data.decision))) return u('badDecision');
  return mk('closed', 'frame', id, 'closed', { body: data });
}

// ---- 4. a command frame (event.command_committed / event.command_settled) ----
export interface CommandFrame { readonly type: 'command'; readonly kind: 'committed' | 'settled'; readonly ids: readonly string[]; readonly state: string }
/** Settles only through the command id THIS page holds from its own queued receipt (`cmd`). */
export function classifyCommandFrame(c: Ident & { route: Route }, cmd: string | undefined, f: CommandFrame): Verdict {
  const id = { acct: c.acct, h: c.h, k: c.k, route: c.route };
  const u = (why: string) => mk('unknown', 'frame', id, why);
  if (!cmd || !f.ids.includes(cmd)) return u('noEvidence');
  if (f.kind === 'committed') return mk('settled', 'frame', id, 'committed');
  if (f.kind === 'settled' && (f.state === 'superseded' || f.state === 'refused' || f.state === 'failed')) return mk('settled', 'frame', id, f.state);
  return u('badState');
}

// ---- removal proofs ----
export type StoreName = 'req' | 'mig';
export type ProofBy = 'verdict' | 'kept' | 'dismissal' | 'neverLeft';
export interface RemovalProof {
  readonly by: ProofBy;
  /** The store the proof names: a top-level entry is in req; a migrated member (m 1) or a source row (m 2) is in mig. */
  readonly store: StoreName;
  readonly acct: string;
  readonly h: string;
  readonly k: string;
  /** neverLeft: the removal deletes the name only if the stored value deep-equals this. */
  readonly written?: Readonly<Entry>;
}
const proofs = new WeakSet<object>();
function proof(by: ProofBy, store: StoreName, id: Ident, written?: Entry): RemovalProof {
  const p: RemovalProof = Object.freeze({ by, store, acct: id.acct, h: id.h, k: id.k, ...(written ? { written: Object.freeze({ ...written }) } : {}) });
  proofs.add(p);
  return p;
}
export const isProof = (p: unknown): p is RemovalProof => typeof p === 'object' && p !== null && proofs.has(p);

/** A proof from a Verdict: notAdmitted, closed, or settled on any route but create (a create's settled verdict needs fromCreateKept). */
export function fromVerdict(v: Verdict | null | undefined, store: StoreName = 'req'): RemovalProof | null {
  if (!isVerdict(v) || !v.acct || !v.h || !v.k) return null;
  if (v.t === 'settled' && v.route === 'create') return null;
  // A turn entry goes only with the Kept of the chat record that replaces it (fromTurnKept): the entry is the evidence that a first
  // message may have left.
  if (v.route === 'turn') return null;
  if (v.t !== 'settled' && v.t !== 'notAdmitted' && v.t !== 'closed') return null;
  return proof('verdict', store, v);
}

// Kept: records.ts says "the chat record now holds this create's session (or is marked unavailable)".
const kept = new WeakSet<object>();
export interface Kept { readonly acct: string; readonly h: string; readonly r: string; readonly k1: string; readonly sid: string | 'unavailable'; readonly refused?: true }
/** records.ts only. `refused`: the create was settled as REFUSED (its chat record removed, nothing moved to the session). */
export function mintKept(x: Kept): Kept {
  const k: Kept = Object.freeze({ acct: x.acct, h: x.h, r: x.r, k1: x.k1, sid: x.sid, ...(x.refused === true ? { refused: true as const } : {}) });
  kept.add(k);
  return k;
}
export const isKept = (k: unknown): k is Kept => typeof k === 'object' && k !== null && kept.has(k);
/** A create's settled verdict, with the Kept records.ts minted for the same (acct, h, k1 = v.k) and the same session. */
export function fromCreateKept(v: Verdict | null | undefined, k: Kept | null | undefined, store: StoreName = 'req'): RemovalProof | null {
  if (!isVerdict(v) || !isKept(k) || v.t !== 'settled' || v.route !== 'create') return null;
  if (k.acct !== v.acct || k.h !== v.h || k.k1 !== v.k || k.sid !== (v.sid ?? 'unavailable')) return null;
  // A refusal's Kept proves only a refused create, and a handoff's Kept never a refused one.
  if ((k.refused === true) !== (v.why === 'refused')) return null;
  return proof('kept', store, v);
}

// TurnKept: records.ts says "the chat record now holds this turn: it names a known turn (kind 'turn'), or the turn's key can never be
// sent again (kind 'fence': it is in the record's dismissed keys, or the record no longer depends on it)".
const turnKept = new WeakSet<object>();
export interface TurnKept { readonly kind: 'turn' | 'fence'; readonly acct: string; readonly h: string; readonly r: string; readonly sid: string; readonly c: string; readonly k: string }
/** records.ts only. */
export function mintTurnKept(x: TurnKept): TurnKept {
  const k: TurnKept = Object.freeze({ kind: x.kind, acct: x.acct, h: x.h, r: x.r, sid: x.sid, c: x.c, k: x.k });
  turnKept.add(k);
  return k;
}
export const isTurnKept = (k: unknown): k is TurnKept => typeof k === 'object' && k !== null && turnKept.has(k);
/** A turn's verdict (settled, or notAdmitted), with the TurnKept records.ts minted for the same (acct, h, key): the only way a turn
 *  entry is removed on evidence. A settled turn needs kind 'turn'; a notAdmitted one needs kind 'fence'. */
export function fromTurnKept(v: Verdict | null | undefined, k: TurnKept | null | undefined, store: StoreName = 'req'): RemovalProof | null {
  if (!isVerdict(v) || !isTurnKept(k) || v.route !== 'turn') return null;
  if (k.acct !== v.acct || k.h !== v.h || k.k !== v.k) return null;
  if (v.t === 'settled' ? k.kind !== 'turn' : v.t === 'notAdmitted' ? k.kind !== 'fence' : true) return null;
  return proof('kept', store, v);
}

// Dismissal: the person's own press. Made by the Dismiss handlers only.
const dismissals = new WeakSet<object>();
export interface Dismissal { readonly person: true }
export function dismissal(): Dismissal {
  const d: Dismissal = Object.freeze({ person: true as const });
  dismissals.add(d);
  return d;
}
export function fromDismissal(d: Dismissal | null | undefined, id: Ident, store: StoreName = 'req'): RemovalProof | null {
  return d && typeof d === 'object' && dismissals.has(d) && id.acct && id.h && id.k ? proof('dismissal', store, id) : null;
}

/** door.ts only: the request under this entry never left (state W, A, L or R). */
export function neverLeft(id: Ident, written: Entry): RemovalProof {
  return proof('neverLeft', 'req', id, written);
}
