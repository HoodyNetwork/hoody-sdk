// agentScope.ts: what a "Use with your agent" prompt names, from the page's live context.
//
// Contract, in plain words:
//   - agentScopeFacts(selected, computerId, rows, alias) is pure: the selected realm ('all' → null, else its full id
//     and nickname) and the computer the page acts on (null → none chosen) with the one realm it is named in.
//   - A computer's name is its row's own `name` only: never the routing node (server_name), never the Hub's
//     name.last4 handle. No row (the list not read yet, or past its first page): the computer is named by its full id
//     alone, and no realm is guessed for it.
//   - The computer's realm: the selected realm when the row is in it, else the row's only realm, else none (a
//     computer in several realms under All realms is named by its id, which already names it exactly).
//   - A nickname is the realm's alias only; a realm without one is named by its full id (never the short id).
//   - useAgentScopeFacts(computer): `computer` undefined → the computer the shell shows (useCurrentComputer); null →
//     none (the page acts on no one computer, or its filter names none); a string → that computer (a page's filter).
//     It reads the shown realm's computer list (the shell's shared read) only when a computer is named. `ask` marks a
//     page filter that names no computer (see filterComputer). The rows are the list's last good answer: a refetch that
//     fails keeps them (TanStack keeps the last data with the error), so a computer named before stays named; a first
//     read that fails has none, and the computer is named by its full id alone (scopeRows).
//   - filterComputer(param, resolved): a page's computer filter in its prompt is never dropped and never widened to
//     the page's unfiltered set while the page holds it: the row the filter resolved to; else the filter's own value
//     when it is a full computer id (the list not read yet or failed, an id from another realm or past the first
//     page); else ask (a handle not yet rewritten to its id, junk). No filter: none.
import { useMemo } from 'react';
import type { AgentHintFacts, AgentHintRealm } from '../kit/widgets/agentHints';
import { useCurrentComputer } from './computer';
import { computersPage } from './power';
import { useCore } from './query';
import { aliasOf } from './realm';
import { isRealmId, RE24 } from './realm-id';
import { useRealms } from './realms';
import { useCan } from './token';

function realmOf(id: string, alias: (id: string) => string | null): AgentHintRealm {
  const name = alias(id);
  return { id, name: name && name.trim() ? name : null };
}

/** The facts a page's prompt is built from (see the contract). */
export function agentScopeFacts(selected: string, computerId: string | null, rows: readonly unknown[] | undefined, alias: (id: string) => string | null): AgentHintFacts {
  const realm = isRealmId(selected) ? realmOf(selected, alias) : null;
  if (!computerId) return { realm, computer: null };
  const row = rows?.find((r): r is Record<string, unknown> => !!r && typeof r === 'object' && (r as { id?: unknown }).id === computerId);
  if (!row) return { realm, computer: { computer: { id: computerId, name: null }, realm: null } };
  const name = typeof row.name === 'string' && row.name.trim() ? row.name : null;
  const ids = Array.isArray(row.realm_ids) ? row.realm_ids.filter((x): x is string => typeof x === 'string' && isRealmId(x)) : [];
  const own = realm && ids.includes(realm.id) ? realm : ids.length === 1 ? realmOf(ids[0] as string, alias) : null;
  return { realm, computer: { computer: { id: computerId, name }, realm: own } };
}

/** The rows a prompt names a computer from: the list's last good answer while a computer is named, even when a later
 *  refetch failed (no row then names nothing: agentScopeFacts names the id alone, never "none"). */
export function scopeRows(on: boolean, list: { readonly data?: { readonly rows?: readonly unknown[] } | undefined }): readonly unknown[] | undefined {
  return on ? list.data?.rows : undefined;
}

/** The computer a page's filter names in its prompt (see the contract). */
export function filterComputer(param: string | null | undefined, resolved: string | null | undefined): { computer: string | null; ask: boolean } {
  if (resolved) return { computer: resolved, ask: false };
  if (!param) return { computer: null, ask: false };
  return RE24.test(param) ? { computer: param, ask: false } : { computer: null, ask: true };
}

/** The facts for the page's AgentHint (see the contract). */
export function useAgentScopeFacts(computer?: string | null, ask = false): AgentHintFacts {
  const realms = useRealms(); // re-renders on a realm switch and a nickname change
  const target = useCurrentComputer();
  const core = useCore();
  const readable = useCan('computers.read');
  const id = computer === undefined ? (target?.container.id ?? null) : computer;
  const on = !!id && core.account !== null && !core.loggingOut && readable;
  const list = computersPage.use(undefined, { enabled: on });
  const rows = scopeRows(on, list);
  return useMemo(() => {
    const facts = agentScopeFacts(realms.selected, id, rows, aliasOf);
    return ask && !facts.computer ? { ...facts, ask: true } : facts;
  }, [realms, id, rows, ask]);
}
