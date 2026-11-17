// A chat's background shells: the per-session list and a keyed stop of one
// job. Declared routes and one settled Api, like stop.ts and session.ts. The stop is sent once per call, with the key the
// caller minted for that one attempt (kit/agent/shellJobStop.ts mints a new key on every press and never resends). The
// adapters hand the kit parser (kit/agent/jobStop.ts) the settled answer as plain data; they decide nothing about it.
import { defineRoute } from '../routes';
import type { Target } from '../ctx';
import type { CallInput, Route } from '../routes';
import { call } from '../providers/call';
import type { Settled } from '../providers/types';

export const bashJobRoutes = {
  list: defineRoute({ method: 'GET', path: '/sessions/:id/bash-jobs', scope: 'agent', timeoutMs: 20000 }),
  // No body: the job and the key say everything, so a key is always bound to one constant request. readsStatus: the
  // success status comes back with the body, because only a 200 proves what the body says (kit/agent/jobStop.ts).
  stop: defineRoute<unknown, Record<string, never>>({ method: 'POST', path: '/sessions/:id/bash-jobs/:job_id/stop', scope: 'agent', body: [], idem: true, readsStatus: true }),
} as const;

export interface BashJobsApi {
  /** The chat's shell jobs, always fresh (a read). `realm`: the chat's own (default: the context's). */
  list(id: string, realm?: string): Promise<Settled<unknown>>;
  /** Stops one job under `key` (a change, sent once; the caller reads a lost answer back itself). */
  stop(id: string, jobId: string, key: string, realm?: string): Promise<Settled<unknown>>;
}

/** `target`: the computer every call goes to (default: the context's at each call). */
export function bashJobsApi(target?: Target): BashJobsApi {
  const base = (params: Record<string, string>, realm: string | undefined): CallInput =>
    ({ params, ...(realm ? { realm } : {}), ...(target ? { target } : {}) }) as CallInput;
  return {
    list: (id, realm) => call(bashJobRoutes.list as Route, base({ id }, realm), false),
    stop: (id, jobId, key, realm) => call(bashJobRoutes.stop as Route, { ...base({ id, job_id: jobId }, realm), idem: key, recovers: true } as CallInput, true),
  };
}

/** The list answer for the kit store: the raw body, or not readable. */
export function jobListReplyOf(r: Settled<unknown>): { ok: true; body: unknown } | { ok: false } {
  return r.ok ? { ok: true, body: r.body } : { ok: false };
}

/** The stop answer as the kit parser's JobStopReply: the success status with the raw body (the route reads its status), or
 *  the refusal's status and code. A lost answer has no status (0), and so has a success whose status was not read; the
 *  parser reads both as unknown. */
export function jobStopReplyOf(r: Settled<unknown>): { ok: true; status: number; body: unknown } | { ok: false; status: number; code: string } {
  if (!r.ok) return { ok: false, status: r.err.status, code: r.err.code };
  const a = r.body !== null && typeof r.body === 'object' ? (r.body as { status?: unknown; body?: unknown }) : {};
  return { ok: true, status: typeof a.status === 'number' ? a.status : 0, body: a.body };
}
