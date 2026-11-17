// The AI pane's routes, limits and read source (split out of data.ts so the terminal build shares them; the notes are at
// the top of data.ts). One coreSource, never re-created. data.ts re-exports the public names and keeps useChats (tab
// visibility and online listeners); REPAIR_MAX, source, PageIn and OneIn are for data.ts.
import { agent, agentHomeRoute, botsListRoute, chatListReads, chatListRoutes, coreSource, defineRoute, useCurrentComputer, useRealms, type ChatListIn, type Target } from '@core';
import { useMemo } from 'react';
import { botsOf, delegatesOf, sessionAnswerOf, stateOf, tokensOf, type Bot } from './chats.logic';

export const chatRoutes = {
  // The list reads are core's (core/chat-lists.ts), shared with the shell's chat-attention observer: one query key each.
  // realm 'list': `all` lists every realm this login serves; rows carry their realm. Without include_system: TODO
  // residents never show. A realm-pinned agent's own listings: realm 'opt' sent with realm '' carries no realm (a 'list'
  // route always carries one, and core fills the shown realm, `all`, in when none is named).
  sessions: chatListRoutes.sessions,
  gates: chatListRoutes.gates,
  sessionsHere: chatListRoutes.sessionsHere,
  gatesHere: chatListRoutes.gatesHere,
  state: defineRoute({ method: 'GET', path: '/sessions/:id/state', scope: 'agent', realm: 'realm', timeoutMs: 20000 }),
  // Core's route (core/pathProbe.ts agentHome: a chat path link's ~ reads the same folders).
  cwds: agentHomeRoute,
  changes: defineRoute({ method: 'GET', path: '/changes', scope: 'agent', realm: 'realm' }),
  // The same tokens over SSE (snapshot, changed, end frames; no ids). Frames are small JSON objects.
  changesStream: defineRoute({ method: 'GET', path: '/changes/stream', scope: 'agent', realm: 'realm', stream: { id: 65536, noId: 65536 }, maxBytes: 16777216, timeoutMs: 20000 }),
  delegates: defineRoute({ method: 'GET', path: '/bots/:id/delegates', scope: 'agent', realm: 'bot', query: ['state', 'limit'] }),
} as const;

export const SESSION_PAGE = 50;
/** Re-lists of the loaded pages after a repeated row (last-active order), per set of pages. */
export const REPAIR_MAX = 2;
export const GATE_PAGE = 100;
export const BOTS_MAX = 20;
export const STATE_MS = 15_000;
export const FEED_MS = 15_000;
export const SLOW_MS = 30_000;
/** Waiting chats outside the loaded pages read at a time ("Show more waiting" reads the next as many). */
export const MISSING_STEP = 20;

/** Where the list reads: the computer and the top bar's realm ('all' or one realm). */
export interface ChatsAt {
  target: Target;
  realm: string;
}

export type PageIn = ChatListIn;
export interface OneIn { at: ChatsAt; realm: string; id: string }

export const source = coreSource('ai', {
  reads: {
    ...chatListReads,
    'chats.session': {
      route: agent.agentRoutes.session,
      input: (p: OneIn) => ({ target: p.at.target, realm: p.realm, params: { id: p.id } }),
      select: (raw) => sessionAnswerOf(raw),
    },
    'chats.state': {
      route: chatRoutes.state,
      input: (p: OneIn) => ({ target: p.at.target, realm: p.realm, params: { id: p.id } }),
      select: (raw) => stateOf(raw),
    },
    'chats.cwds': {
      route: chatRoutes.cwds,
      input: (p: { at: ChatsAt; realm: string }) => ({ target: p.at.target, realm: p.realm }),
      select: (raw) => {
        const c = (raw as { cwds?: unknown } | null)?.cwds;
        return Array.isArray(c) ? c.filter((x): x is string => typeof x === 'string' && x !== '') : [];
      },
    },
    'chats.changes': {
      route: chatRoutes.changes,
      input: (p: { at: ChatsAt; realm: string }) => ({ target: p.at.target, realm: p.realm }),
      select: (raw) => tokensOf(raw),
    },
    'chats.bots': {
      route: botsListRoute,
      input: (p: { at: ChatsAt; realm: string }) => ({ target: p.at.target, realm: p.realm || undefined, query: { limit: BOTS_MAX, page: 1 } }),
      select: (raw) => botsOf(raw),
    },
    'chats.delegates': {
      route: chatRoutes.delegates,
      input: (p: { at: ChatsAt; bot: Bot }) => ({ target: p.at.target, realm: p.bot.realm, params: { id: p.bot.id }, query: { state: 'open', limit: 100 } }),
      select: (raw) => delegatesOf(raw),
    },
  },
});

/** Where the chat list reads now: the top bar's computer and realm; null without a computer. */
export function useChatsAt(): ChatsAt | null {
  const target = useCurrentComputer();
  const realm = useRealms().selected;
  return useMemo(() => (target && realm ? { target, realm } : null), [target, realm]);
}
