// chat-lists.ts: the agent's chat-list reads that the AI page and the shell's chat-attention observer share
// (chat-attention.ts). One definition each, so both use ONE TanStack query key and one parse: on /ai a tick reads
// GET /gates once, never once per reader.
//
// Contract, in plain words:
//   - chatListRoutes: GET /sessions and GET /gates on a computer. `sessions`/`gates` are realm 'list' (one realm or
//     `all`; rows carry their realm); `sessionsHere`/`gatesHere` are realm 'opt' and are read with realm '' (no realm
//     on the wire: a realm-pinned agent's own listing, after it answered `all` with 400 realm_scope_unsupported).
//   - chatListReads: the coreSource read table of the 'ai' source for those four routes. A reader declares these very
//     objects in its coreSource('ai', ...) table; its params are a ChatListIn ({target, realm, page}), the realm being
//     the one the read asks ('' for the plain listings).
//   - chatPlace(target, shown) names one place (computer and the top bar's realm); pinnedAt(place) says the agent there
//     refused `all` (markPinned records it). Both readers take the realm through chatListRealm, so they ask the same.
//   - The parse: sessionsOf / sessionOf / sessionAnswerOf (a session row, run state, pending_gate and origin) and gatesOf
//     (a pending gate: the chat it waits in). Pages import them from here (pages/ai chats.logic re-exports them).
import type { Target } from './ctx';
import { onTeardown } from './realm';
import { defineRoute } from './routes';
import { stringOrEmpty as str } from './shape';

export const chatListRoutes = {
  sessions: defineRoute({ method: 'GET', path: '/sessions', scope: 'agent', realm: 'list', query: ['limit', 'page', 'order'] }),
  gates: defineRoute({ method: 'GET', path: '/gates', scope: 'agent', realm: 'list', query: ['limit', 'page'] }),
  sessionsHere: defineRoute({ method: 'GET', path: '/sessions', scope: 'agent', realm: 'opt', query: ['limit', 'page', 'order'] }),
  gatesHere: defineRoute({ method: 'GET', path: '/gates', scope: 'agent', realm: 'opt', query: ['limit', 'page'] }),
} as const;

export const CHAT_SESSION_PAGE = 50;
export const CHAT_GATE_PAGE = 100;

/** One list read's params: the computer, the realm the read asks ('' = the plain listing) and the page. */
export interface ChatListIn { target: Target; realm: string; page: number }

/** One listed session, as GET /sessions and GET /sessions/{id} answer it (the fields the lists read). */
export interface ChatSession {
  id: string;
  realm: string;
  name?: string;
  firstMessage?: string;
  agent?: string;
  cwd: string;
  startedAt: number | null;
  lastAt: number | null;
  claude: boolean;
  /** The run state (idle | running | parked | closed); undefined on an older agent's row, which carries none. */
  state?: string;
  /** An approval or question waits for a person in this chat. */
  pendingGate: boolean;
  /** The Bot that opened the chat (`ref` absent: the Bot's own session); null on any other chat. */
  origin: ChatOrigin | null;
}

export interface ChatOrigin {
  botId: string;
  /** The Bot instance (`bot_uid`): an id is reused when a Bot is deleted and created again. */
  uid: string;
  realm: string;
  ref?: string;
}

/** A pending gate (GET /gates): the chat it waits in. */
export interface ChatGate {
  sid: string;
  realm: string;
  agent?: string;
}

export interface ChatGatePage {
  gates: ChatGate[];
  total: number;
  omitted: number;
}

export interface ChatSessionPage {
  sessions: ChatSession[];
  /** Every session the realm(s) hold, before paging (meta.total); null when the answer does not say. */
  total: number | null;
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const time = (v: unknown): number | null => {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const items = (raw: unknown): unknown[] => {
  const v = rec(raw).items;
  return Array.isArray(v) ? v : [];
};

function originOf(v: unknown): ChatOrigin | null {
  const o = rec(v);
  const botId = str(o.bot_id);
  if (o.kind !== 'bot' || !botId) return null;
  const ref = str(o.ref);
  return { botId, uid: str(o.bot_uid), realm: str(o.realm), ...(ref ? { ref } : {}) };
}

/** One session object; null without an id. */
export function sessionOf(raw: unknown): ChatSession | null {
  const r = rec(raw);
  const id = str(r.id);
  if (!id) return null;
  return {
    id,
    realm: str(r.realm),
    name: str(r.name) || undefined,
    firstMessage: str(r.first_message) || undefined,
    agent: str(r.agent) || undefined,
    cwd: str(r.cwd),
    startedAt: time(r.started_at),
    lastAt: time(r.last_request_at),
    claude: r.backend_kind === 'acp',
    ...(typeof r.state === 'string' ? { state: r.state } : {}),
    pendingGate: r.pending_gate === true,
    origin: originOf(r.origin),
  };
}

/** GET /sessions/{id}'s answer: the session row inside `session` (beside attached/started); null without one. */
export function sessionAnswerOf(raw: unknown): ChatSession | null {
  return sessionOf(rec(raw).session);
}

export function sessionsOf(raw: unknown): ChatSessionPage {
  const meta = rec(rec(raw).meta);
  const sessions = items(raw).map(sessionOf).filter((s): s is ChatSession => s !== null);
  return { sessions, total: typeof meta.total === 'number' ? num(meta.total) : null };
}

export function gatesOf(raw: unknown): ChatGatePage {
  const meta = rec(rec(raw).meta);
  const gates: ChatGate[] = [];
  for (const it of items(raw)) {
    const r = rec(it);
    const sid = str(r.session_id);
    if (sid) gates.push({ sid, realm: str(r.realm), agent: str(r.agent) || undefined });
  }
  return { gates, total: num(meta.total), omitted: num(meta.omitted) };
}

export const chatListReads = {
  'chats.sessions': {
    route: chatListRoutes.sessions,
    input: (p: ChatListIn) => ({ target: p.target, realm: p.realm || undefined, query: { limit: CHAT_SESSION_PAGE, page: p.page, order: 'last_active' } }),
    select: (raw: unknown) => sessionsOf(raw),
  },
  'chats.gates': {
    route: chatListRoutes.gates,
    input: (p: ChatListIn) => ({ target: p.target, realm: p.realm || undefined, query: { limit: CHAT_GATE_PAGE, page: p.page } }),
    select: (raw: unknown) => gatesOf(raw),
  },
  'chats.sessionsHere': {
    route: chatListRoutes.sessionsHere,
    input: (p: ChatListIn) => ({ target: p.target, realm: '', query: { limit: CHAT_SESSION_PAGE, page: p.page, order: 'last_active' } }),
    select: (raw: unknown) => sessionsOf(raw),
  },
  'chats.gatesHere': {
    route: chatListRoutes.gatesHere,
    input: (p: ChatListIn) => ({ target: p.target, realm: '', query: { limit: CHAT_GATE_PAGE, page: p.page } }),
    select: (raw: unknown) => gatesOf(raw),
  },
} as const;

// ---- the pinned fallback, one per place for both readers ----
const pinnedPlaces = new Set<string>();
const pinListeners = new Set<() => void>();
let pinRev = 0;

/** One place: the computer and the top bar's realm ('all' or one realm). */
export const chatPlace = (target: Target, shown: string): string => `${target.project.id}/${target.container.id}|${shown}`;
/** The agent of this place refused `all` (400 realm_scope_unsupported): its plain listings are read instead. */
export const pinnedAt = (place: string): boolean => pinnedPlaces.has(place);
export function markPinned(place: string): void {
  if (pinnedPlaces.has(place)) return;
  pinnedPlaces.add(place);
  pinRev++;
  for (const l of [...pinListeners]) l();
}
export function onPinned(l: () => void): () => void { pinListeners.add(l); return () => { pinListeners.delete(l); }; }
export const pinnedRev = (): number => pinRev;
/** The realm one place's list reads ask, and whether they are the plain listings (`here`): one realm reads that realm;
 *  `all` reads `all` unless the agent there refused it. */
export function chatListRealm(place: string, shown: string): { realm: string; here: boolean } {
  const here = shown === 'all' && pinnedAt(place);
  return { realm: here ? '' : shown, here };
}
// A torn-down context (sign-out, a realm switch) starts again from `all`.
try { onTeardown(() => { if (pinnedPlaces.size) { pinnedPlaces.clear(); pinRev++; for (const l of [...pinListeners]) l(); } }); } catch { /* no realm layer (a test): nothing to clear */ }

/** Tests: forget every pinned place. */
export function resetChatListsForTests(): void { pinnedPlaces.clear(); pinRev++; }
