// The Agents index's one read: GET /agents on the computer's agent, in the context's realm unless the caller names one
// (read only).
import { coreSource } from '@core';
import { routes } from '../routes';
import { agentsOf, type AgentRow } from './logic';
import { toolsChange } from './toolsApi';

const source = coreSource('ai-agents', {
  // A caller may name the realm (New chat under All realms reads the computer's own realm, which the top bar does not show).
  reads: { list: { route: routes.agents, input: (realm?: string) => (realm ? { realm } : {}) } },
  changes: { tools: toolsChange },
});
/** The agents list's source: the tools editor saves through its change, so the save's read-back is this list. */
export const agentsSource = source;

export interface AgentsRead {
  /** undefined while the first read runs or after it failed; never [] for a failed read. */
  rows: AgentRow[] | undefined;
  pending: boolean;
  failed: boolean;
  retrying: boolean;
  /** The rejection, for the error state's details (null for an answer that is not a list). */
  error: unknown;
  retry: () => void;
}

/** The agents of the selected computer, read while `enabled` (a computer is chosen): in `realm` when it is given, else in
 *  the context's realm. */
export function useAgents(enabled: boolean, realm?: string): AgentsRead {
  const q = source.useQuery<unknown, string | undefined>('list', realm, { enabled });
  const rows = q.data === undefined ? undefined : (agentsOf(q.data) ?? undefined);
  return {
    rows,
    pending: enabled && q.isPending,
    // An answer that is not a list is a failed read, not "no agents".
    failed: !!q.error || (q.data !== undefined && rows === undefined),
    retrying: q.isFetching,
    error: q.error ?? null,
    retry: () => void q.refetch(),
  };
}
