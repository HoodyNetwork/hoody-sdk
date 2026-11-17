// The Agent tools editor's reads and its one change, on core. The catalogue is the agent's (no realm); the save goes
// through the agents list's source (data.ts agentsSource), held under its lock when its answer is lost (C9): only a fresh list
// that shows what it wrote frees it, or the person stopping the wait after a warning.
import { coreSource, isRealmOrGlobal, refreshFresh, useCurrentComputer, useRunner, type HeldChange, type Target } from '@core';
import { useCallback, useMemo } from 'react';
import { useAiRealm } from '../aiRealm';
import { agentsSource } from './data';
import { agentsOf, type AgentRow } from './logic';
import { catalogueOf, type CatalogTool, type ToolsSave } from './tools';
import { TOOLS_LOCK, toolsRoutes, type ToolsVars } from './toolsApi';

const catalogueSource = coreSource('ai-agent-tools', {
  reads: { catalogue: { route: toolsRoutes.catalogue, select: (raw): CatalogTool[] | null => catalogueOf(raw) } },
});

/** Where a save goes: the top bar's computer and one realm (the page's, aiRealm.ts: under All realms the computer's own;
 *  never All realms); null when there is none. */
export interface ToolsAt { target: Target; realm: string }
export function useToolsAt(): ToolsAt | null {
  const target = useCurrentComputer();
  const { realm } = useAiRealm();
  return useMemo(() => (target && isRealmOrGlobal(realm) ? { target, realm } : null), [target, realm]);
}

/** The agent's tool catalogue (null data: an answer that is not the whole catalogue). */
export function useCatalogue(enabled: boolean) {
  return catalogueSource.useQuery<CatalogTool[] | null>('catalogue', undefined, { enabled });
}

/** A fresh read of the agents list (the one the index shows) on `computer` in `realm`: the row of `name`, null when it is
 *  not there, undefined when there is no fresh answer (nothing is sent on that). Fresh is core's read-back (refreshFresh): a
 *  request sent now whose own network success is what the cache holds, under the same account and generation. Never a
 *  clock: a refetch that another one cancelled hands back the cached list, stamped in the same millisecond as a load that
 *  just landed. `own`: never a read already out when Save was pressed (it joins no earlier flight; its own request is sent
 *  now). Every enabled list read of that computer in that realm is re-read; they must all show the same row. */
export function useFreshRow(name: string, computer: string, realm: string) {
  return useCallback(async (): Promise<AgentRow | null | undefined> => {
    const ours = agentsSource.readTarget('list', { computer });
    // Only the lists read in the editor's realm: the list read's params are the realm it names (data.ts useAgents(enabled,
    // realm)), as folders/writes.ts freshRead takes only its own params. A list of this computer cached from another realm
    // (a Global chat's header, an earlier visit) holds that realm's agents: re-read and compared, it made every Save refuse
    // (readFirst), and alone it would judge the save by another realm's row.
    const f = await refreshFresh((k) => ours(k) && k[7] === realm, { own: true });
    if (f.state !== 'fresh' || f.answers.length === 0) return undefined;
    let row: AgentRow | null | undefined;
    for (const a of f.answers) {
      const rows = agentsOf(a.data);
      if (!rows) return undefined;
      const r = rows.find((x) => x.name === name) ?? null;
      if (row !== undefined && JSON.stringify(r) !== JSON.stringify(row)) return undefined;
      row = r;
    }
    return row;
  }, [name, computer, realm]);
}

/** The save of one agent's tools: sent once, a lost answer held (that agent's, on this computer). */
export function useToolsSave(at: ToolsAt | null, name: string) {
  const m = agentsSource.useMutation<unknown, ToolsVars>('tools');
  const computer = at?.target.container.id ?? '';
  const pick = useCallback((i: Record<string, unknown>) => i.computer === computer && i.name === name, [computer, name]);
  const heldBy = useCallback((h: HeldChange) => agentsSource.heldBy('tools', h), []);
  const vars = useCallback(
    (i: Record<string, unknown>): ToolsVars => {
      const tools = Array.isArray(i.tools) ? i.tools.map(String) : [];
      const kind = i.kind === 'none' || i.kind === 'every' ? i.kind : 'list';
      const save: ToolsSave = { kind, tools, none: kind === 'none', confirm: false };
      return {
        target: at?.target as Target, realm: String(i.realm ?? ''), name: String(i.name ?? ''), save,
        identity: { computer: String(i.computer ?? ''), realm: String(i.realm ?? ''), name: String(i.name ?? ''), kind, tools, whole: i.whole === true },
      };
    },
    [at],
  );
  return useRunner<ToolsVars>(m, { lock: TOOLS_LOCK, pick, vars, heldBy });
}
