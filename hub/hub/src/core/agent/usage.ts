// One chat's per-call usage: GET /sessions/{id}/usage (getSessionUsage), paged by an
// exclusive `after_id` cursor. One declared route and one settled Api; reads only, always fresh. The reading of the
// answer (and everything built on it) is in kit/agent/usage.ts.
import { defineRoute } from '../routes';
import type { Target } from '../ctx';
import type { CallInput, Route } from '../routes';
import { call } from '../providers/call';
import type { Settled } from '../providers/types';

export const usageRoutes = {
  session: defineRoute({ method: 'GET', path: '/sessions/:id/usage', scope: 'agent', query: ['after_id', 'limit'], timeoutMs: 20000 }),
} as const;

export interface UsageApi {
  /** One page of the chat's rows after `after` (default: from its first row). `realm`: default the context's. */
  session(id: string, o?: { after?: number; limit?: number; realm?: string }): Promise<Settled<unknown>>;
}

/** `target`: the computer every call goes to (default: the context's at each call). */
export function usageApi(target?: Target): UsageApi {
  return {
    session: (id, o = {}) => {
      const query: Record<string, number> = {};
      if (o.after !== undefined && o.after > 0) query.after_id = o.after;
      if (o.limit !== undefined) query.limit = o.limit;
      const input = { params: { id }, ...(Object.keys(query).length ? { query } : {}), ...(o.realm ? { realm: o.realm } : {}), ...(target ? { target } : {}) } as CallInput;
      return call(usageRoutes.session as Route, input, false);
    },
  };
}
