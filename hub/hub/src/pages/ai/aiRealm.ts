// aiRealm.ts: the realm the AI tab's one-realm pages (Agents, Workflows, TODOs, Skills, Instructions, Memory, Models &
// keys, Connections & MCP, Rules & hooks) read and change in.
//
// Contract, in plain words:
//   - One realm at the top (an account session's pick, or a token session pinned to one realm): that realm, as before.
//   - All realms (an account session, or an access key with no realm limit): the current computer's own realm by
//     realmOf (logic.ts), the rule New chat follows: Global for a computer in no realm (no realm at the top shows it),
//     its one realm for a computer in one, and 'all' for a computer in several (the page asks for one realm, as before).
//   - The computer's realms come from the shown realm's computer list (core computersPage: the shell's own read, one
//     cache entry, so no request of its own). A computer the rows do not hold (past the first page, or the list failed,
//     its rows kept from an earlier read included) or a row whose realm_ids is not a list of realm ids is not told:
//     'all', never Global. The row is judged by membershipOf and realmOf (logic.ts), as New chat judges its computer's
//     record, so this page and New chat never disagree.
//   - `deciding`: All realms, a current computer, and that list has not answered yet. The page shows itself loading,
//     never the realm question it may not need.
//   - No current computer: the realm at the top ('all' under All realms), as before.
//   - A page names this realm on every call it makes (the context's realm is 'all' under All realms, which a one-realm
//     route refuses unsent).
import { computersPage, useCurrentComputer, useRealms } from '@core';
import { useMemo } from 'react';
import { membershipOf, realmOf } from './logic';

export interface AiRealm {
  /** The realm the page reads and changes in: 'global', a realm id, or 'all' (no one realm: the page asks for one). */
  readonly realm: string;
  /** Under All realms the computer's realms are not read yet: nothing is decided. */
  readonly deciding: boolean;
}

const rowOf = (rows: readonly unknown[] | undefined, id: string): Record<string, unknown> | undefined =>
  rows?.find((r): r is Record<string, unknown> => !!r && typeof r === 'object' && (r as { id?: unknown }).id === id);

/** The page's realm from the realm at the top, the current computer's id and the list's rows (see the contract). */
export function aiRealmOf(selected: string, computer: string | null, rows: readonly unknown[] | undefined): string {
  if (selected !== 'all' || computer === null) return selected;
  const ids = membershipOf(rowOf(rows, computer), computer);
  return ids === null ? 'all' : realmOf(ids, null) ?? 'all';
}

/** The page's realm now (see the contract). */
export function useAiRealm(): AiRealm {
  const selected = useRealms().selected;
  const target = useCurrentComputer();
  const id = target?.container.id ?? null;
  const on = selected === 'all' && id !== null;
  const list = computersPage.use(undefined, { enabled: on });
  // Rows kept from an earlier read after the last one failed prove nothing now: not told.
  const rows = on && !list.isError ? list.data?.rows : undefined;
  const deciding = on && rows === undefined && list.isPending;
  return useMemo(() => ({ realm: aiRealmOf(selected, id, rows), deciding }), [selected, id, rows, deciding]);
}
