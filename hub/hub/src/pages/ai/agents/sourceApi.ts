// The requests of the agent source editor: getAgentSource, putAgentSource,
// deleteAgent and resetAgentToShipped, declared once with core's defineRoute and sent through core's api(), settled
// (never rejects): an answer is {ok, body} or {ok:false, err} with a C9 outcome.
//   - putAgentSource carries its compare-and-swap in the body (`expected_revision`, getAgentSource's `revision`); core
//     refuses to send it without one. 409 revision_conflict is the agent's refusal before anything was written
//     (`notApplied`), with the current revision in details.
//   - deleteAgent and resetAgentToShipped run gated tools: the agent answers 200 {output, is_error}. A `daemon_paused`
//     error is a refusal before anything applied; any other is_error answer may have run in part, so it settles as
//     unknown ('pending') and the caller reads the agent back before saying either way.
//   - A change is sent once. A lost answer is 'pending', never 'failed'.
import { api, defineRoute, errorInfo, isRecord, outcomeOf, type CallInput, type Route, type Target } from '@core';

export const sourceRoutes = {
  get: defineRoute({ method: 'GET', path: '/agents/:name/source', scope: 'agent', realm: 'realm', timeoutMs: 20000 }),
  put: defineRoute<unknown, { content: string; expected_revision: string }>({
    method: 'PUT', path: '/agents/:name/source', scope: 'agent', realm: 'realm', body: ['content', 'expected_revision'],
    cas: { via: 'body', keys: ['expected_revision'] }, refuses: ['revision_conflict'],
  }),
  remove: defineRoute({ method: 'DELETE', path: '/agents/:name', scope: 'agent', realm: 'realm', envelope: true, refuses: ['daemon_paused'] }),
  reset: defineRoute({ method: 'POST', path: '/agents/:name/reset-to-shipped', scope: 'agent', realm: 'realm', envelope: true, refuses: ['daemon_paused'] }),
} as const;

/** What a failed call settled to. `currentRevision` is a 409 revision_conflict's details.current_revision. */
export interface Refusal {
  kind: 'pending' | 'failed' | 'not_sent' | 'stale';
  code: string;
  status: number;
  retryAfterMs: number | null;
  /** The agent refused before changing anything (a listed refusal: revision_conflict, daemon_paused). */
  notApplied: boolean;
  currentRevision: string | null;
}
export type Settled = { ok: true; body: unknown } | { ok: false; err: Refusal };

export interface SourceApi {
  get(): Promise<Settled>;
  put(content: string, expectedRevision: string): Promise<Settled>;
  remove(): Promise<Settled>;
  reset(): Promise<Settled>;
}


function refusal(e: unknown, change: boolean): Refusal {
  const x = isRecord(e) ? e : {};
  const d = isRecord(x.details) ? x.details : {};
  const rev = d.current_revision;
  return {
    kind: outcomeOf(e, change),
    // Only a code core knows or the route declares is kept (errorInfo's allowlist): whatever else the server wrote in its
    // code (or `error`) field is dropped, so it can never reach a sentence.
    code: (errorInfo(e).code ?? '').toLowerCase(),
    status: typeof x.status === 'number' ? x.status : 0,
    retryAfterMs: typeof x.retryAfterMs === 'number' ? x.retryAfterMs : null,
    notApplied: x.notApplied === true,
    currentRevision: typeof rev === 'string' && rev.length > 0 && rev.length <= 256 ? rev : null,
  };
}

async function call(route: Route, input: CallInput, change: boolean): Promise<Settled> {
  try {
    return { ok: true, body: (await api(route, input)) ?? {} };
  } catch (e) {
    return { ok: false, err: refusal(e, change) };
  }
}

/** The calls for one agent `name`, on `target` (default: the context's computer at each call) in `realm` (default: the
 *  context's). */
export function agentSourceApi(name: string, o: { target?: Target; realm?: string } = {}): SourceApi {
  const on = (input: CallInput): CallInput => ({ ...input, params: { name }, ...(o.target ? { target: o.target } : {}), ...(o.realm ? { realm: o.realm } : {}) });
  return {
    get: () => call(sourceRoutes.get as Route, on({}), false),
    put: (content, expected_revision) => call(sourceRoutes.put as Route, on({ body: { content, expected_revision } } as CallInput), true),
    remove: () => call(sourceRoutes.remove as Route, on({}), true),
    reset: () => call(sourceRoutes.reset as Route, on({}), true),
  };
}
