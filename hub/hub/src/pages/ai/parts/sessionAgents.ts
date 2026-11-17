// The agents a chat may switch to (Details → Session): GET /agents on the chat's computer in the chat's OWN realm, not the
// realm the tab shows (the top bar may show all realms, or another one). Read only while the Session tab is open.
import type { Target } from '@core';
import { coreSource } from '@core';
import { routes } from '../routes';
import { agentsOf } from '../agents/logic';

const source = coreSource('ai-session-agents', {
  reads: {
    list: {
      route: routes.agents,
      input: (p: { target: Target; realm: string }) => ({ target: p.target, realm: p.realm }),
    },
  },
});

export interface SessionAgents {
  /** The names offered without the product's own; undefined while the first read runs; null when the read failed (never a shorter list). */
  names: string[] | null | undefined;
}

/** The names a chat may switch to from one GET /agents answer: the product's own agents are out; an answer that is not a list is null
 *  (a failed read), never "no agents". */
export function namesOffered(answer: unknown): string[] | null {
  const rows = agentsOf(answer);
  return rows ? rows.filter((r) => !r.productOwned).map((r) => r.name) : null;
}

export function useSessionAgents(target: Target, realm: string): SessionAgents {
  const q = source.useQuery<unknown, { target: Target; realm: string }>('list', { target, realm });
  if (q.error) return { names: null };
  if (q.data === undefined) return { names: undefined };
  return { names: namesOffered(q.data) };
}
