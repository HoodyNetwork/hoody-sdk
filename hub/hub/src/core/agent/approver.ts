// The approver lease on a computer's agent: the three lease routes and their settled Api,
// and the reading half. The capability itself never passes through here except as the strings these helpers read out of an
// answer and blank in it. It is spent only by core as the X-Hoody-Approver-Lease header (a lease ticket's `spend`) and enters
// custody only through a lease ticket's `answer` hook. Leases live in the agent's memory and are bound to its execution epoch:
// an agent restart ends them.
import { defineRoute } from '../routes';
import type { Target } from '../ctx';
import type { CallInput, Route } from '../routes';
import { call } from '../providers/call';
import type { Settled } from '../providers/types';
import type { Ticket } from '../ticket';

/** The lease's life on the agent (10 min). Sure life on the Hub ends well before it. */
export const APPROVER_TTL_MS = 600_000;

const ACQ = ['approver_lease_held', 'approver_lease_invalid', 'not_found'] as const;
const KEY = ['approver_lease_invalid', 'approver_lease_expired', 'not_found'] as const;
const PATH = '/sessions/:id/approver-lease';
export const approverRoutes = {
  acquire: defineRoute<unknown, { holder: string; ttl_ms: number }>({ method: 'POST', path: PATH, scope: 'agent', body: ['holder', 'ttl_ms'], tickets: { lease: 'required' }, codes: ACQ, refuses: ACQ }),
  renew: defineRoute<unknown, { ttl_ms: number }>({ method: 'PATCH', path: PATH, scope: 'agent', body: ['ttl_ms'], tickets: { lease: 'required' }, codes: KEY, refuses: KEY }),
  release: defineRoute({ method: 'DELETE', path: PATH, scope: 'agent', tickets: { lease: 'required' }, codes: KEY, refuses: KEY }),
} as const;

/** Every call captures the context at the call, settles and never rejects. The ticket is the caller's lease ticket (custody mints it). */
export interface ApproverApi {
  /** A blank holder is not sent (the agent refuses it, and the ticket would be spent for nothing). */
  acquire(id: string, realm: string | undefined, holder: string, t: Ticket): Promise<Settled<unknown>>;
  renew(id: string, realm: string | undefined, t: Ticket): Promise<Settled<unknown>>;
  /** `keepalive`: the page is going away (the request should outlive it when the transport can). */
  release(id: string, realm: string | undefined, t: Ticket, keepalive: boolean): Promise<Settled<unknown>>;
}

const NOT_SENT: Settled<unknown> = { ok: false, err: { kind: 'not_sent', code: 'not_sent', status: 0, retryAfter: null, details: {} } };

/** `target`: the computer every call goes to (default: the context's at each call). */
export function approverApi(target?: Target): ApproverApi {
  const send = (route: Route, input: CallInput) => call(route, target ? { ...input, target } : input, true);
  const base = (id: string, realm: string | undefined, t: Ticket): CallInput => ({ params: { id }, ...(realm ? { realm } : {}), tickets: [t] } as CallInput);
  return {
    acquire: (id, realm, holder, t) => typeof holder !== 'string' || holder.trim() === ''
      ? Promise.resolve(NOT_SENT)
      : send(approverRoutes.acquire as Route, { ...base(id, realm, t), body: { holder, ttl_ms: APPROVER_TTL_MS } } as CallInput),
    renew: (id, realm, t) => send(approverRoutes.renew as Route, { ...base(id, realm, t), body: { ttl_ms: APPROVER_TTL_MS } } as CallInput),
    release: (id, realm, t, keepalive) => send(approverRoutes.release as Route, { ...base(id, realm, t), ...(keepalive ? { keepalive: true } : {}) } as CallInput),
  };
}

const HEADER_SAFE = /^[\x21-\x7e]{1,512}$/;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Where an answer can carry a capability: an acquire's `lease`, a create or attach answer's `approver_lease.lease` and
 *  `started.approver_lease.token`. */
function copies(raw: unknown): Array<[Record<string, unknown>, string]> {
  if (!obj(raw)) return [];
  const out: Array<[Record<string, unknown>, string]> = [[raw, 'lease']];
  if (obj(raw.approver_lease)) out.push([raw.approver_lease, 'lease']);
  const st = raw.started;
  if (obj(st) && obj(st.approver_lease)) out.push([st.approver_lease, 'token']);
  return out;
}

/** Every distinct, header-safe capability string the answer carries (all copies), in the order found. */
export function approverGrantsOf(raw: unknown): string[] {
  const seen: string[] = [];
  for (const [o, k] of copies(raw)) {
    const v = o[k];
    if (typeof v === 'string' && HEADER_SAFE.test(v) && !seen.includes(v)) seen.push(v);
  }
  return seen;
}

/** Blank every copy in place (the answer then holds no capability for anything else to read or keep). */
export function blankApproverGrants(raw: unknown): void {
  for (const [o, k] of copies(raw)) if (typeof o[k] === 'string') o[k] = '';
}

/** `info.epoch` or `epoch` of an answer: the agent's execution epoch. A trigger for a fresh look, never a proof. */
export function approverEpochOf(raw: unknown): string | null {
  if (!obj(raw)) return null;
  const e = obj(raw.info) && typeof raw.info.epoch === 'string' ? raw.info.epoch : raw.epoch;
  return typeof e === 'string' && e.length > 0 && e.length <= 128 ? e : null;
}

/** The lease generation an answer names (`generation`, `info.generation`, or the create answer's): display and decision data,
 *  never a removal proof. */
export function approverGenerationOf(raw: unknown): number | null {
  if (!obj(raw)) return null;
  const st = raw.started;
  const cands = [raw.generation, obj(raw.info) ? raw.info.generation : undefined, obj(raw.approver_lease) ? raw.approver_lease.generation : undefined,
    obj(st) && obj(st.approver_lease) ? st.approver_lease.generation : undefined];
  for (const g of cands) if (typeof g === 'number' && Number.isSafeInteger(g) && g >= 0) return g;
  return null;
}

/** Why a create or attach answer carries no capability though the session is Strict: another holder has it, or it was minted
 *  and dropped with the gateway's connection. */
export function approverErrorOf(raw: unknown): 'held' | 'required' | null {
  if (!obj(raw)) return null;
  if (raw.approver_lease_error === 'approver_lease_held') return 'held';
  if (raw.approver_lease_error === 'approver_lease_required') return 'required';
  return null;
}
