// decisionEvidence: what an approval's answer proves
// about OUR decision. Pure and engine-free. Answers are parsed at the boundary: one parser per wire shape checks the
// discriminator, the identity (against the captured target) and every field it reads, including the optional
// fields the agent's schema defines (protocol.GateDecision remember/superseded), and returns a typed value or 'unknown'. A
// contradictory payload is 'unknown'. The classifiers take only the parsed types.
//
// Wire shapes (the agent's HTTP API):
//   - the confirm reply: 200, or 409 with a code and details (the confirm claim, its record's details or the
//     resolved-gate fallback, gate_cancelled and the confirm refusals);
//   - the event.gate_resolved frame (its request_id is the gateway's own correlation id, so a frame
//     never proves whose decision applied).
//
// Only positive evidence settles anything:
//   - applied: a 200 to our confirm, or a gate_already_resolved record for our gate and generation, answered, with a decision and
//     OUR request_id (the gateway keeps the winning caller's own request_id in the record, recordConfirmLocked).
//   - elsewhere: the same record naming ANOTHER request_id.
//   - ended: the gate ended without any decision, said positively by a parsed gate_cancelled refusal, a parsed record whose outcome
//     is cancelled, yolo or timeout, or a parsed frame for the captured target whose outcome and provenance agree on that.
//   - unknown: everything else, gate_decision_pending included (its outcome is not known yet; nothing is resent).

export type DecisionEvidence = 'applied' | 'elsewhere' | 'ended' | 'unknown';

export interface OurDecision {
  /** The gateway gate (id and generation) the decision was sent for, captured at send. */
  gate: { id: string; generation: number };
  /** The request_id the decision was sent with. */
  requestId: string;
}

/** A confirm's settled reply, as the host's transport reports it. The parser takes it as `unknown` and checks it whole: `ok` is
 *  the boolean discriminator; a success carries no refusal metadata, a refusal is `ok: false` with its status, code, details. */
export type ConfirmReply = { ok: true; status?: number } | { ok: false; status?: number; code?: string; details?: unknown };

/** The gate a resolution frame must name: the daemon's own number for it, captured with the card. */
export type FrameTarget = { kind: 'confirm'; gateId: number } | { kind: 'question'; questionId: number };

/** protocol.GateDecision, parsed. */
export interface GateDecision {
  approved: boolean; persistDirs: boolean; sessionScope: boolean; trustContainer: boolean;
  remember?: boolean; superseded?: boolean;
}

type NoDecisionOutcome = 'cancelled' | 'yolo' | 'timeout';
type NoDecisionBy = 'yolo' | 'cancelled' | 'closed' | 'context_cancelled' | 'timeout';

/** A parsed confirm reply. */
export type ParsedReply =
  | { kind: 'ok' }
  /** 409 gate_already_resolved with a record for our gate: `decision` null = decision_unknown. */
  | { kind: 'record'; outcome: 'answered' | NoDecisionOutcome | 'incarnation_ended' | 'unknown'; decision: GateDecision | null; requestId?: string }
  /** 409 gate_cancelled for our gate: the gate resolved without consuming our decision. `by` is absent from an older agent. */
  | { kind: 'cancelled'; outcome: NoDecisionOutcome; by?: NoDecisionBy }
  /** A recognized refusal that carries no evidence about the decision (pending, stale, no gate, mismatch, ...). */
  | { kind: 'refused'; code: string }
  | { kind: 'unknown' };

/** A parsed event.gate_resolved for the captured target. */
export type ParsedFrame =
  /** `scopeApplied: false` + `note`: an approving session-scope decision the agent applied to this call only (a locked
   *  approval policy froze the allow rule; the daemon's answer). */
  | { kind: 'answered'; decision?: GateDecision; scopeApplied?: false; note?: string }
  | { kind: 'ended'; outcome: NoDecisionOutcome; by: NoDecisionBy };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const has = (o: Obj, k: string): boolean => o[k] !== undefined;
const optStr = (o: Obj, k: string): boolean => !has(o, k) || typeof o[k] === 'string';
const optInt = (o: Obj, k: string): boolean => !has(o, k) || isInt(o[k]);

const NO_DECISION_OUTCOMES: readonly string[] = ['cancelled', 'yolo', 'timeout'];
/** Which provenance each non-decision outcome may carry (protocol.EventGateResolved): they must agree. */
const BY_FOR: Record<NoDecisionOutcome, readonly NoDecisionBy[]> = {
  cancelled: ['cancelled', 'closed', 'context_cancelled'], yolo: ['yolo'], timeout: ['timeout'],
};
const isNoDecisionOutcome = (v: unknown): v is NoDecisionOutcome => typeof v === 'string' && NO_DECISION_OUTCOMES.includes(v);
const byAgrees = (outcome: NoDecisionOutcome, by: unknown): by is NoDecisionBy =>
  typeof by === 'string' && (BY_FOR[outcome] as readonly string[]).includes(by);

/** protocol.GateDecision: four booleans, plus optional boolean remember and superseded. */
export function parseDecision(v: unknown): GateDecision | 'unknown' {
  if (!isObj(v)) return 'unknown';
  const { approved, persist_dirs, session_scope, trust_computer, remember, superseded } = v;
  if (typeof approved !== 'boolean' || typeof persist_dirs !== 'boolean' || typeof session_scope !== 'boolean' || typeof trust_computer !== 'boolean') return 'unknown';
  if (remember !== undefined && typeof remember !== 'boolean') return 'unknown';
  if (superseded !== undefined && typeof superseded !== 'boolean') return 'unknown';
  const d: GateDecision = { approved, persistDirs: persist_dirs, sessionScope: session_scope, trustContainer: trust_computer };
  if (remember !== undefined) d.remember = remember;
  if (superseded !== undefined) d.superseded = superseded;
  return d;
}

const ourGate = (ours: OurDecision, d: Obj): boolean =>
  d.gate_id === ours.gate.id && isInt(d.generation) && d.generation === ours.gate.generation;

const RECORD_OUTCOMES: readonly string[] = ['answered', 'cancelled', 'yolo', 'timeout', 'incarnation_ended', 'unknown'];

/** 409 gate_already_resolved details (confirmRecord.details): exactly one of a decision and decision_unknown: true; a decision
 *  and the winner's request_id only on an answered record (the gateway keeps them only for a consumed decision). */
function parseRecord(ours: OurDecision, d: unknown): ParsedReply {
  if (!isObj(d) || !ourGate(ours, d)) return { kind: 'unknown' };
  const { outcome } = d;
  if (typeof outcome !== 'string' || !RECORD_OUTCOMES.includes(outcome)) return { kind: 'unknown' };
  const withDecision = has(d, 'decision'), lost = has(d, 'decision_unknown');
  if (withDecision === lost) return { kind: 'unknown' };
  if (lost && d.decision_unknown !== true) return { kind: 'unknown' };
  if (!optStr(d, 'request_id') || d.request_id === '') return { kind: 'unknown' };
  if (has(d, 'provenance')) return { kind: 'unknown' };
  let decision: GateDecision | null = null;
  if (withDecision) {
    const p = parseDecision(d.decision);
    if (p === 'unknown' || outcome !== 'answered') return { kind: 'unknown' };
    decision = p;
  } else if (has(d, 'request_id')) return { kind: 'unknown' };
  const rec: ParsedReply = { kind: 'record', outcome: outcome as Extract<ParsedReply, { kind: 'record' }>['outcome'], decision };
  if (typeof d.request_id === 'string') rec.requestId = d.request_id;
  return rec;
}

/** 409 gate_cancelled details: our gate, a non-decision outcome, the frame's provenance ("" from an
 *  older agent), and no decision of any kind. */
function parseCancelled(ours: OurDecision, d: unknown): ParsedReply {
  if (!isObj(d) || !ourGate(ours, d)) return { kind: 'unknown' };
  if (has(d, 'decision') || has(d, 'decision_unknown') || has(d, 'request_id')) return { kind: 'unknown' };
  const { outcome, provenance } = d;
  if (!isNoDecisionOutcome(outcome) || typeof provenance !== 'string') return { kind: 'unknown' };
  if (provenance === '') return { kind: 'cancelled', outcome };
  return byAgrees(outcome, provenance) ? { kind: 'cancelled', outcome, by: provenance } : { kind: 'unknown' };
}

/** The confirm refusals the gateway sends with 409 that say nothing about the decision. */
const NO_EVIDENCE_409: readonly string[] = ['gate_decision_pending', 'stale_gate', 'no_pending_gate', 'gate_type_mismatch', 'decision_incomplete'];

/** Parses a confirm's reply for the decision sent as `ours`. */
export function parseConfirmReply(ours: OurDecision, r: unknown): ParsedReply {
  if (!isObj(r) || typeof r.ok !== 'boolean') return { kind: 'unknown' };
  if (r.ok === true) {
    // A success with refusal metadata, or a non-2xx status, contradicts itself.
    if (has(r, 'code') || has(r, 'details')) return { kind: 'unknown' };
    if (has(r, 'status') && !(isInt(r.status) && r.status >= 200 && r.status < 300)) return { kind: 'unknown' };
    return { kind: 'ok' };
  }
  if (r.status !== 409 || typeof r.code !== 'string') return { kind: 'unknown' };
  if (r.code === 'gate_already_resolved') return parseRecord(ours, r.details);
  if (r.code === 'gate_cancelled') return parseCancelled(ours, r.details);
  return NO_EVIDENCE_409.includes(r.code) ? { kind: 'refused', code: r.code } : { kind: 'unknown' };
}

const FRAME_OUTCOMES: readonly string[] = ['answered', ...NO_DECISION_OUTCOMES];

/** Parses an event.gate_resolved frame for the captured target. Another gate, a wrong kind or identity, a field of the wrong
 *  type, or outcome and provenance that disagree are 'unknown'. */
export function parseGateResolved(target: FrameTarget, data: unknown): ParsedFrame | 'unknown' {
  if (!isObj(data) || data.kind !== target.kind) return 'unknown';
  if (target.kind === 'confirm' ? (data.gate_id !== target.gateId || has(data, 'question_id')) : (data.question_id !== target.questionId || has(data, 'gate_id'))) return 'unknown';
  for (const k of ['request_id', 'holder', 'helper_id', 'parent_tool_call_id', 'task_id']) if (!optStr(data, k)) return 'unknown';
  if (!optInt(data, 'generation')) return 'unknown';
  const { outcome, provenance, session_scope_applied: scope, note } = data;
  if (typeof outcome !== 'string' || !FRAME_OUTCOMES.includes(outcome)) return 'unknown';
  // session_scope_applied and note come together, only as false + a note, only on an answered confirm frame whose decision
  // approved with session_scope (as the daemon sends it); anything else contradicts the frame.
  const scoped = has(data, 'session_scope_applied') || has(data, 'note');
  if (scoped && (scope !== false || typeof note !== 'string' || note === '')) return 'unknown';
  if (outcome === 'answered') {
    if (has(data, 'provenance') && provenance !== 'decision') return 'unknown';
    if (!has(data, 'decision')) return scoped ? 'unknown' : { kind: 'answered' };
    const d = parseDecision(data.decision);
    if (d === 'unknown' || target.kind !== 'confirm') return 'unknown';
    if (!scoped) return { kind: 'answered', decision: d };
    return d.approved && d.sessionScope ? { kind: 'answered', decision: d, scopeApplied: false, note: note as string } : 'unknown';
  }
  if (has(data, 'decision') || scoped) return 'unknown';
  const o = outcome as NoDecisionOutcome;
  return byAgrees(o, provenance) ? { kind: 'ended', outcome: o, by: provenance } : 'unknown';
}

/** What a parsed confirm reply proves about the decision sent as `ours`. */
export function evidenceOfReply(ours: OurDecision, p: ParsedReply): DecisionEvidence {
  switch (p.kind) {
    case 'ok': return 'applied';
    case 'cancelled': return p.by ? 'ended' : 'unknown';
    case 'record':
      if (p.outcome === 'answered') {
        if (!p.decision || !p.requestId) return 'unknown';
        return p.requestId === ours.requestId ? 'applied' : 'elsewhere';
      }
      return isNoDecisionOutcome(p.outcome) && p.decision === null ? 'ended' : 'unknown';
    default: return 'unknown';
  }
}

/** What a parsed frame proves: at most that the gate ended without a decision. */
export function evidenceOfFrame(p: ParsedFrame | 'unknown'): 'ended' | 'unknown' {
  return p !== 'unknown' && p.kind === 'ended' ? 'ended' : 'unknown';
}
