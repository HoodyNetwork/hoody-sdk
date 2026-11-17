// The chat list's rules, pure: what the agent's answers say, which rows show, their group,
// their marks and tags, and which few chats get a state read. data.ts reads; ChatList.tsx draws.
//
// - Rows come from GET /sessions (paged reads are ordered newest-started). The Bot's own session (agent `bot`, or a Bot's
//   `session_id`) and rows with no first message (drafts, settings sessions) are never listed.
// - Groups: "Needs you" (the chat has a pending gate in GET /gates) first, then Today / Yesterday / Last 7 days / Older by
//   `last_request_at` (else `started_at`), within what is loaded.
// - Marks: needs you (accent square) from the gates or the row's `pending_gate`; running (ok dot) from the row's own
//   `state`, or, on an older agent's row that carries no state, from a state read; a chat the AI page let go while
//   its turn ran (core chat-attention notes, until it is opened) reads "Turn ended" once idle and "Closed" once closed;
//   anything else shows none.
// - Bot tags: a row's `origin` names its Bot (`ref` present: a delegate; absent: the Bot's own session, never listed);
//   an older agent's row takes them from the Bot delegate reads.
// - A gate page that left gates out (`meta.omitted`) or a total beyond what is loaded says "and more" (the group pages).

import { gatesOf, noteMark, sessionAnswerOf, sessionOf, sessionsOf, stringOrEmpty as str, type ChatGate, type ChatGatePage, type ChatOrigin, type ChatSession, type ChatSessionPage } from '@core';
import { LOCALE, formatRelative } from '@kit';

// The list reads' parse is core's (core/chat-lists.ts: the shell's chat-attention observer reads the same queries).
export { gatesOf, sessionAnswerOf, sessionOf, sessionsOf };
export type Session = ChatSession;
export type Origin = ChatOrigin;
export type Gate = ChatGate;
export type GatePage = ChatGatePage;
export type SessionPage = ChatSessionPage;

export type ChatGroup = 'needs' | 'today' | 'yesterday' | 'week' | 'older';
export const GROUP_ORDER: readonly ChatGroup[] = ['needs', 'today', 'yesterday', 'week', 'older'];

export interface Bot {
  id: string;
  realm: string;
  name: string;
  /** The Bot's own session ('' until its first message). */
  session: string;
  /** The Bot instance ('' when the list gives none). */
  uid: string;
}

export interface ChatRow {
  /** `${realm}/${sid}`: one row per chat even when every realm is listed. */
  key: string;
  sid: string;
  realm: string;
  title: string;
  cwd: string;
  /** The agent the chat runs on, when its row names one. */
  agent?: string;
  at: number | null;
  claude: boolean;
  /** The name of the Bot this chat is a delegate of ('' when its Bot cannot be named here). */
  bot?: string;
  group: ChatGroup;
  /** The time shown in the row ("2 minutes ago", "yesterday", "3 days ago"), from the same day count as `group`. */
  when?: string;
  /** needs you, running, or for a chat left running (core chat-attention notes): 'ended' once idle ("Turn ended": idle
   *  follows a failed turn too, so never "finished") and 'closed' once closed; null otherwise. */
  mark: 'needs' | 'running' | 'ended' | 'closed' | null;
  /** The row carried its own state: no state read is made for it. */
  rowState: boolean;
  /** All computers: the computer the chat is on (container id) and its handle; absent on one computer's list. */
  computer?: string;
  handle?: string;
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const items = (raw: unknown): unknown[] => {
  const v = rec(raw).items;
  return Array.isArray(v) ? v : [];
};

export const keyOf = (realm: string, sid: string): string => `${realm}/${sid}`;

/** The gates of every page read so far, and whether more wait beyond them ("and more"): a page left gates out
 *  (they changed while it was read), or the total is more than the pages hold. */
export function gatesSoFar(pages: readonly GatePage[]): { gates: Gate[]; more: boolean } {
  const gates = pages.flatMap((p) => p.gates);
  const last = pages[pages.length - 1];
  const omitted = pages.some((p) => p.omitted > 0);
  return { gates, more: !!last && (omitted || last.total > gates.length) };
}

export function botsOf(raw: unknown): Bot[] {
  const out: Bot[] = [];
  for (const it of items(raw)) {
    const r = rec(it);
    const id = str(r.id);
    // A Bot served by another process lists locked (no name): nothing of it can be read here.
    if (!id || r.owned_elsewhere === true) continue;
    out.push({ id, realm: str(r.realm), name: str(r.name) || id, session: str(r.session_id), uid: str(r.uid) });
  }
  return out;
}

/** The session ids of a Bot's open delegates (GET /bots/{id}/delegates?state=open). */
export function delegatesOf(raw: unknown): string[] {
  return items(raw)
    .map((it) => str(rec(it).session_id))
    .filter(Boolean);
}

/** A chat's title: its name, else the first line of its first message. */
export function titleOf(s: Pick<Session, 'name' | 'firstMessage'>): string {
  if (s.name?.trim()) return s.name.trim();
  const line = (s.firstMessage ?? '').split('\n').find((l) => l.trim()) ?? '';
  return line.trim();
}

/** Listed: not the Bot's own session, and the chat has a first message (drafts and settings sessions have none). */
export function listed(s: Session, botSessions: ReadonlySet<string>): boolean {
  if (s.agent === 'bot' || botSessions.has(keyOf(s.realm, s.id))) return false;
  if (s.origin && !s.origin.ref) return false;
  return !!s.firstMessage?.trim();
}

const DAY = 86_400_000;
const midnight = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** The day group of a time, by the reader's own calendar. A missing time reads as Older. */
export function dayGroup(at: number | null, now: number): Exclude<ChatGroup, 'needs'> {
  if (at === null) return 'older';
  const today = midnight(now);
  if (at >= today) return 'today';
  if (at >= midnight(today - 1)) return 'yesterday';
  if (at >= today - 6 * DAY) return 'week';
  return 'older';
}

const relFmt = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

/** The row's time in words, by the SAME calendar days as dayGroup, so a row in Yesterday reads "yesterday" and one in
 *  Last 7 days reads "N days ago" (kit formatRelative counts elapsed hours: 26 h before 01:35 is "yesterday" there while
 *  its calendar day is two days back). Today: seconds, minutes or hours, never a day. Older: formatRelative. */
export function whenLabel(at: number | null, now: number): string {
  if (at === null) return '';
  const g = dayGroup(at, now);
  if (g === 'today') {
    const diff = (at - now) / 1000, abs = Math.abs(diff);
    if (abs < 45) return relFmt.format(Math.round(diff), 'second');
    if (abs < 2700) return relFmt.format(Math.round(diff / 60), 'minute');
    return relFmt.format(Math.round(diff / 3600), 'hour');
  }
  if (g === 'yesterday' || g === 'week') return relFmt.format(-Math.round((midnight(now) - midnight(at)) / DAY), 'day');
  return formatRelative(at, now);
}

export interface RowsInput {
  sessions: readonly Session[];
  /** Sessions read one by one because a gate waits in them and no loaded page holds them. */
  extra?: readonly Session[];
  gates: readonly Gate[];
  bots: readonly Bot[];
  /** Delegate session keys (`realm/sid`) → the Bot's name (older agents' rows only). */
  delegates: ReadonlyMap<string, string>;
  /** State reads that answered: key → state (older agents' rows only). */
  states: ReadonlyMap<string, string>;
  now: number;
  /** Chats left running while their turn ran (core chat-attention notes): key → the state their last read said (used
   *  only where the row carries none). */
  noted?: ReadonlyMap<string, string | undefined>;
}

/** The list's rows: listed sessions once each, with their group, mark and tags. A chat a gate waits in is in "Needs
 *  you" even when no loaded page holds it, as soon as its own read answers. */
export function chatRows(i: RowsInput): ChatRow[] {
  const botSessions = new Set(i.bots.filter((b) => b.session).map((b) => keyOf(b.realm, b.session)));
  const botsByAddress = new Map(i.bots.map((b) => [keyOf(b.realm, b.id), b]));
  // A Bot is named only when the listed Bot is the same instance as the origin's: a Bot deleted and created again keeps
  // its id but not its uid, and its old delegates are tagged "Bot" without a name (also when either uid is missing).
  const botName = (o: Origin): string => {
    const b = botsByAddress.get(keyOf(o.realm, o.botId));
    return b && b.uid && b.uid === o.uid ? b.name : '';
  };
  const waiting = new Set(i.gates.filter((g) => g.agent !== 'bot').map((g) => keyOf(g.realm, g.sid)));
  const seen = new Set<string>();
  const out: ChatRow[] = [];
  for (const s of [...i.sessions, ...(i.extra ?? [])]) {
    const key = keyOf(s.realm, s.id);
    if (seen.has(key) || !listed(s, botSessions)) continue;
    seen.add(key);
    const at = s.lastAt ?? s.startedAt;
    // A current agent's row says itself whether it waits, runs and which Bot it works for; an older agent's row has the reads.
    const b9 = s.state !== undefined;
    const needs = waiting.has(key) || s.pendingGate;
    const state = b9 ? s.state : i.states.get(key);
    const bot = b9 ? (s.origin ? botName(s.origin) : undefined) : i.delegates.get(key);
    out.push({
      key,
      sid: s.id,
      realm: s.realm,
      title: titleOf(s),
      cwd: s.cwd,
      ...(s.agent ? { agent: s.agent } : {}),
      at,
      claude: s.claude,
      bot,
      group: needs ? 'needs' : dayGroup(at, i.now),
      when: whenLabel(at, i.now),
      mark: needs ? 'needs' : state === 'running' ? 'running' : i.noted?.has(key) ? noteMark(state ?? i.noted.get(key)) : null,
      rowState: b9,
    });
  }
  return out;
}

/** Gate chats no loaded page holds, in gate order, at most `max` (each is read by itself; the list reads the first
 *  `max` and offers the rest through "Show more waiting"). */
export function missingGateChats(gates: readonly Gate[], sessions: readonly Session[], max = 20): Array<{ sid: string; realm: string }> {
  const have = new Set(sessions.map((s) => keyOf(s.realm, s.id)));
  const out: Array<{ sid: string; realm: string }> = [];
  const seen = new Set<string>();
  for (const g of gates) {
    const k = keyOf(g.realm, g.sid);
    if (g.agent === 'bot' || have.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push({ sid: g.sid, realm: g.realm });
    if (out.length >= max) break;
  }
  return out;
}

export const STATE_WINDOW_MS = 30 * 60_000;
export const STATE_READS_MAX = 20;

/** The chats that get a state read: an older agent's rows only (a current agent's row carries its state), listed, not already
 *  waiting for you, active in the last 30 minutes, most recent first, at most 20. */
export function stateReads(rows: readonly ChatRow[], now: number, max = STATE_READS_MAX): Array<{ sid: string; realm: string }> {
  return rows
    .filter((r) => !r.rowState && r.group !== 'needs' && r.at !== null && now - r.at <= STATE_WINDOW_MS)
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, max)
    .map((r) => ({ sid: r.sid, realm: r.realm }));
}

/** A state read's answer: its `state` (idle | running | parked | closed), '' when absent. */
export function stateOf(raw: unknown): string {
  return str(rec(raw).state);
}

/** GET /changes: the scope and each readable topic's token. */
export interface Tokens {
  scope: string;
  tokens: Readonly<Record<string, string>>;
}

export function tokensOf(raw: unknown): Tokens {
  const r = rec(raw);
  const t = rec(r.tokens);
  const tokens: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) if (typeof v === 'string') tokens[k] = v;
  return { scope: str(r.scope), tokens };
}

/** Whether a topic moved between two answers: a new scope moves every topic; a token that changed, appeared or went
 *  (unreadable now) moves it. The first answer moves nothing (the lists were just read). */
export function moved(prev: Tokens | null, next: Tokens, topic: string): boolean {
  if (!prev) return false;
  if (prev.scope !== next.scope) return true;
  return prev.tokens[topic] !== next.tokens[topic];
}
