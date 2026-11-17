// Attachment leases on a computer's agent: a lease keeps a live conversation, and a
// gate parked in it, from the gateway's idle sweep while no stream is attached. Three declared routes and one settled
// Api. A lease is not the approver lease: it only keeps the conversation open. Leases live in the agent's memory (an
// agent restart ends them), so a renew can answer 404 or 410 and the caller acquires again.
import { defineRoute } from '../routes';
import type { Target } from '../ctx';
import type { CallInput, Route } from '../routes';
import { call } from '../providers/call';
import type { Settled } from '../providers/types';

export const attachRoutes = {
  acquire: defineRoute<unknown, { ttl_ms?: number }>({ method: 'POST', path: '/sessions/:id/attachments', scope: 'agent', body: ['ttl_ms'] }),
  renew: defineRoute<unknown, { ttl_ms?: number }>({ method: 'PATCH', path: '/sessions/:id/attachments/:lease_id', scope: 'agent', body: ['ttl_ms'] }),
  release: defineRoute({ method: 'DELETE', path: '/sessions/:id/attachments/:lease_id', scope: 'agent' }),
} as const;

/** Every call settles and never rejects. `realm`: the conversation's own realm (default: the context's). */
export interface AttachApi {
  acquire(id: string, realm?: string, ttlMs?: number): Promise<Settled<unknown>>;
  renew(id: string, lease: string, realm?: string, ttlMs?: number): Promise<Settled<unknown>>;
  /** `keepalive`: the page is going away (the request should outlive it when the transport can). */
  release(id: string, lease: string, realm?: string, keepalive?: boolean): Promise<Settled<unknown>>;
}

/** `target`: the computer every call goes to (default: the context's at each call). */
export function attachApi(target?: Target): AttachApi {
  // recovers: a lease is taken, renewed and dropped by the manager, never pressed by the person, and it only keeps a
  // conversation open: a lost answer is the manager's own retry (kit/agent/lease.ts), so the shell must not announce
  // "a change may have gone through" (its one notice per context would also hide a real one). core still reports a call
  // whose context ended before its answer: that is the one case recovers does not cover.
  const send = (route: Route, input: CallInput) => call(route, { ...input, ...(target ? { target } : {}), recovers: true }, true);
  const realmOf = (realm?: string): Partial<CallInput> => (realm ? { realm } : {});
  const ttl = (ms?: number) => (ms === undefined ? {} : { body: { ttl_ms: ms } });
  return {
    acquire: (id, realm, ttlMs) => send(attachRoutes.acquire as Route, { params: { id }, ...realmOf(realm), ...ttl(ttlMs) } as CallInput),
    renew: (id, lease, realm, ttlMs) => send(attachRoutes.renew as Route, { params: { id, lease_id: lease }, ...realmOf(realm), ...ttl(ttlMs) } as CallInput),
    release: (id, lease, realm, keepalive) => send(attachRoutes.release as Route, { params: { id, lease_id: lease }, ...realmOf(realm), ...(keepalive === true ? { keepalive: true } : {}) } as CallInput),
  };
}

export interface LeaseGrant { id: string; expiresAt: number }

/** The hold a grant is taken for when its expiry cannot be used: two minutes, short of the agent's own default, so it is
 *  renewed at one minute and a wrong guess costs a renew, never a lease the agent already dropped. */
export const DEFAULT_LEASE_MS = 120000;

/** {lease_id, expires_at (RFC3339)} as a grant; null when the answer has no usable lease_id. An expiry that is missing,
 *  unreadable or not after `now` (this clock is ahead of the agent's by more than the hold) counts as DEFAULT_LEASE_MS
 *  from the current time: the renew then runs at half of it instead of looping on an expiry that is always in the past. */
export function leaseOf(body: unknown, now: number): LeaseGrant | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.lease_id !== 'string' || !b.lease_id || b.lease_id.length > 128) return null;
  const at = typeof b.expires_at === 'string' ? Date.parse(b.expires_at) : NaN;
  return { id: b.lease_id, expiresAt: Number.isFinite(at) && at > now ? at : now + DEFAULT_LEASE_MS };
}
