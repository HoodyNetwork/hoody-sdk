// The loops list's reads: the computer's loops in every realm this login serves (GET /loops?realm=all), and
// each listed chat's title (GET /sessions/{id}, read in the loop's own realm). Read-only: no change is declared here
// (loop changes are edit.ts).
import { agent, coreSource, defineRoute, useRealms, type SourceError } from '@core';
import { activeCount, loopRow, loopsOf, sessionsToRead, chatTitle, type LoopRow } from './logic';

export const loopRoutes = {
  // realm 'list': `all` lists every realm this login serves; rows carry their realm.
  loops: defineRoute({ method: 'GET', path: '/loops', scope: 'agent', realm: 'list' }),
} as const;

const REFRESH_MS = 30_000;

const source = coreSource('ai', {
  reads: {
    'auto.loops': {
      route: loopRoutes.loops,
      // 'all', or undefined for the realm shown (an agent pinned to one realm refuses `all`).
      input: (realm?: string) => (realm ? { realm } : {}),
      select: (raw) => loopsOf(raw).map(loopRow),
    },
    'auto.loopChat': {
      route: agent.agentRoutes.session,
      input: (p?: { sid: string; realm: string }) => (p ? { params: { id: p.sid }, realm: p.realm || undefined } : {}),
      select: (raw) => chatTitle(raw),
    },
  },
});

export interface LoopsRead {
  rows: LoopRow[] | undefined;
  /** Active loops, over every realm (`scope: 'all'`) or only the realm shown (`'here'`: a pinned agent, or a token
   *  session pinned to one realm, whose `all` core sends as its realm). Null unless the last read answered. */
  active: number | null;
  scope: 'all' | 'here';
  /** Chat titles by `${realm}/${sid}`: the title, null (the chat has none), absent (not read: reading, failed or
   *  past the read bound). */
  titles: ReadonlyMap<string, string | null>;
  isPending: boolean;
  error: SourceError | null;
  refetch: () => void;
}

export function useLoops(): LoopsRead {
  const all = source.useQuery<LoopRow[], string | undefined>('auto.loops', 'all', { refetchInterval: REFRESH_MS });
  // A realm-pinned agent answers `all` with 400 realm_scope_unsupported: its plain listing is the pinned realm's.
  const pinned = all.error?.code === 'realm_scope_unsupported';
  // A token session's calls carry its pinned realm whatever was asked: a session pinned to one realm lists that realm
  // only; one pinned to 'all' still lists every realm.
  const pin = useRealms().pinned;
  const tokenPinned = pin !== null && pin !== 'all';
  const here = source.useQuery<LoopRow[], string | undefined>('auto.loops', undefined, { enabled: pinned, refetchInterval: pinned ? REFRESH_MS : false });
  const q = pinned ? here : all;
  const rows = q.data;
  const reads = rows ? sessionsToRead(rows) : [];
  const chats = source.useQueries<string | null, { sid: string; realm: string }>('auto.loopChat', reads);
  const titles = new Map<string, string | null>();
  reads.forEach((p, i) => {
    const c = chats[i];
    if (c?.isSuccess) titles.set(`${p.realm}/${p.sid}`, c.data);
  });
  return {
    rows,
    // A failed refresh keeps the last rows on screen (marked stale by the table) but never their count.
    active: rows && !q.error ? activeCount(rows) : null,
    scope: pinned || tokenPinned ? 'here' : 'all',
    titles,
    isPending: q.isPending,
    error: q.error ?? null,
    refetch: () => void q.refetch(),
  };
}
