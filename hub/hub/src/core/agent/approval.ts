// A conversation's approvals (Details → Session): its mode (Default, Strict, or locked by the
// computer's policy) and auto-approve (YOLO). The reply-scoped auto-approve on a send lives with the send.
//   - The mode is read from GET /sessions/{id}/approval. `locked` there means the computer's policy set it: the Hub
//     shows it and never changes it (the lock is monotonic and never sent from here).
//   - A mode change is one PUT, guarded by the read's revision (If-Match "<revision>"): a change that raced another
//     one is refused 412 and nothing is resent (`conflict`: read again). A change with no revision is never sent.
//   - Strict (`always`) refuses every automatic answer: YOLO, the turn-scoped auto-approve and allow rules.
//   - As every change here (C9), an answer only says it was taken; the read-back decides it, and a lost answer is
//     unknown, never resent.
import type { Target } from '../ctx';
import { defineRoute, type CallInput, type Route } from '../routes';
import { call } from '../providers/call';
import { obj } from '../providers/catalogue';
import { isStale, isUnknown } from '../providers/api';
import type { Outcome, Settled } from '../providers/types';
import { agentRoutes } from './routes';

/** The refusals a mode change or YOLO switch can meet. */
export const APPROVAL_CODES = ['session_busy', 'approval_policy_locked', 'approval_policy_active', 'approval_policy_unsatisfiable', 'precondition_failed'] as const;

export const approvalRoutes = {
  setMode: defineRoute<unknown, { mode: 'default' | 'always' }>({ method: 'PUT', path: '/sessions/:id/approval', scope: 'agent', body: ['mode'], cas: { via: 'etag' }, codes: [...APPROVAL_CODES] }),
} as const;

export type ApprovalMode = 'default' | 'always' | 'locked';

export interface Approval {
  /** `locked`: set by the computer's policy, whatever its mode. */
  mode: ApprovalMode;
  /** The policy as it runs (also under a lock): Strict refuses every automatic answer. */
  strict: boolean;
  /** The policy revision, the If-Match of the next change; null when the agent sent none (then no change is sent). */
  revision: number | null;
  /** Auto-approve (YOLO); null when the agent did not say. */
  yolo: boolean | null;
}

export interface ApprovalApi {
  approval(id: string): Promise<Settled<unknown>>;
  setMode(id: string, mode: 'default' | 'always', revision: number): Promise<Settled<unknown>>;
  setYolo(id: string, enabled: boolean): Promise<Settled<unknown>>;
}

/**
 * `target`: the computer every call goes to (default: the context's at each call). `realm`: the conversation's realm
 * every call carries (default: the context's at each call); an attempt passes the one it captured at send, so a late
 * read-back or Check again reads the same conversation after the page's realm changed.
 */
export function approvalApi(target?: Target, realm?: string): ApprovalApi {
  const on = (input: CallInput): CallInput => ({ ...input, ...(target ? { target } : {}), ...(realm ? { realm } : {}) });
  const read = (route: Route, input: CallInput = {}) => call(route, on(input), false);
  const write = (route: Route, input: CallInput = {}) => call(route, on(input), true);
  return {
    approval: (id) => read(agentRoutes.approval, { params: { id } }),
    setMode: (id, mode, revision) => write(approvalRoutes.setMode, { params: { id }, body: { mode }, ifMatch: `"${revision}"` }),
    setYolo: (id, enabled) => write(agentRoutes.yolo, { params: { id }, body: { enabled } }),
  };
}

/**
 * The one parser of the approval read: Approval, or null when the read failed, is malformed or
 * contradicts itself (the mode is then unknown). It checks every field read here against the agent's resource
 * (protocol.SessionApproval plus the gateway's flattened yolo): `mode` default|always and `locked` a boolean, both
 * always sent; `revision` a non-negative integer, else none (no change is then sent); `yolo` a boolean, else unknown.
 * YOLO armed under Strict is a contradiction (the agent disarms it there): unknown.
 */
export function approvalOf(a: Settled<unknown>): Approval | null {
  if (!a.ok || !obj(a.body)) return null;
  const b = a.body;
  if (b.mode !== 'default' && b.mode !== 'always') return null;
  if (typeof b.locked !== 'boolean') return null;
  if (b.mode === 'always' && b.yolo === true) return null;
  const revision = typeof b.revision === 'number' && Number.isSafeInteger(b.revision) && b.revision >= 0 ? b.revision : null;
  return {
    mode: b.locked === true ? 'locked' : b.mode,
    strict: b.mode === 'always',
    revision,
    yolo: typeof b.yolo === 'boolean' ? b.yolo : null,
  };
}

/** Read the approvals. stale: the page moved on. */
export async function readApproval(api: ApprovalApi, id: string): Promise<{ stale: boolean; approval: Approval | null; err: Settled<unknown> | null }> {
  const a = await api.approval(id);
  if (isStale(a)) return { stale: true, approval: null, err: null };
  const approval = approvalOf(a);
  return { stale: false, approval, err: approval ? null : a };
}

export type ApprovalChange = { field: 'mode'; value: 'default' | 'always' } | { field: 'yolo'; value: boolean };

/**
 * One change, sent once and not decided:
 *   sent      answered: the read-back decides it.
 *   unknown   the answer was lost: "may have gone through"; only a read decides it, nothing is resent.
 *   busy      409 session_busy: a turn, a gate, queued work, a helper or a shell keeps the chat busy. Nothing changed.
 *   refused   409 approval_policy_locked / _active / _unsatisfiable: the policy refuses it (Strict or locked). Nothing changed.
 *   conflict  412: the policy changed since it was read. Nothing changed; read again before choosing.
 *   failed    any other definite refusal (a change with no revision is refused here, unsent).
 *   stale     the page moved on.
 */
export type ApprovalSend =
  | { state: 'sent' }
  | { state: 'unknown' }
  | { state: 'busy' }
  | { state: 'refused'; code: string }
  | { state: 'conflict' }
  | { state: 'failed'; err: Outcome }
  | { state: 'stale' };

const NO_REVISION: Outcome = { kind: 'not_sent', code: 'CAS_REQUIRED', status: 0, retryAfter: null, details: {} };

export async function sendApproval(api: ApprovalApi, id: string, change: ApprovalChange, revision: number | null): Promise<ApprovalSend> {
  if (change.field === 'mode' && revision === null) return { state: 'failed', err: NO_REVISION };
  const r = change.field === 'mode' ? await api.setMode(id, change.value, revision!) : await api.setYolo(id, change.value);
  if (isStale(r)) return { state: 'stale' };
  if (r.ok) return { state: 'sent' };
  if (isUnknown(r)) return { state: 'unknown' };
  const code = r.err.code ?? '';
  if (code === 'session_busy') return { state: 'busy' };
  if (code === 'approval_policy_locked' || code === 'approval_policy_active' || code === 'approval_policy_unsatisfiable') return { state: 'refused', code };
  if (code === 'precondition_failed' || r.err.status === 412) return { state: 'conflict' };
  return { state: 'failed', err: r.err };
}

/** The read shows the change. */
export function shows(a: Approval | null, c: ApprovalChange): boolean {
  if (!a) return false;
  return c.field === 'mode' ? a.mode !== 'locked' && a.mode === c.value : a.yolo === c.value;
}
