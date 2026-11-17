// Pure functions of the Support page: one parser per wire shape, the thread merge,
// the status words, the limits rows, the error words, the nav count and the port of the server's text cleaning
// (the API's single cleaning pass). No React, no I/O. Ticket subjects and message bodies are untrusted
// text written by a person: they stay strings here and are rendered as text nodes only.

export type TicketStatus = 'open' | 'waiting_user' | 'closed';
export const STATUSES: readonly TicketStatus[] = ['open', 'waiting_user', 'closed'];
/** The ticket categories, in the server's order. */
export const CATEGORIES = ['account', 'billing', 'servers', 'computers', 'files', 'networking', 'ai', 'bots', 'affiliates', 'security', 'bug', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
/** The string key of a ticket's category label: a category this page does not know reads as Other. */
export const categoryKey = (c: string): `category.${Category}` => `category.${(CATEGORIES as readonly string[]).includes(c) ? (c as Category) : 'other'}`;
export const LIMIT_ROWS = ['open', 'tickets_day', 'tickets_30d', 'messages_day', 'retained'] as const;
export type LimitRow = (typeof LIMIT_ROWS)[number];

/** The real field rules (the schemas' maxLength values are transport bounds only). */
export const SUBJECT_MAX = 200;
export const BODY_MAX = 4000;
export const BODY_MAX_LINES = 200;

/** The screen as New ticket reads it: its height and whether it is phone-narrow. */
export interface Room {
  /** At least 820 px tall. */
  tall: boolean;
  /** At least 1000 px tall. */
  roomy: boolean;
  /** Narrower than 768 px. */
  phone: boolean;
}
/**
 * Rows of New ticket's Message box: taller where the screen has room under the fields. A phone keeps a modest box (its
 * keyboard takes half the screen); a short screen keeps the old eight.
 */
export function messageRows(room: Room): number {
  if (room.phone) return room.tall ? 10 : 8;
  if (room.roomy) return 18;
  return room.tall ? 14 : 8;
}
export const LIST_LIMIT = 20;
/** GET /support/tickets publishes `limit` maximum 50: the list read clamps every page size to it. */
export const PAGE_MAX = 50;
/** Nav count: pages of `limit` 50, at most 4. */
export const COUNT_LIMIT = 50;
export const COUNT_PAGES = 4;

export interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  terminal: boolean;
  unread: boolean;
  createdAt: string;
  lastMessageAt: string;
  closedAt: string | null;
  reopenable: boolean;
}
export interface Message {
  id: string;
  seq: number;
  from: 'you' | 'support';
  body: string;
  createdAt: string;
}
export interface TicketPage {
  tickets: Ticket[];
  nextCursor: string | null;
  /** Rows the parser could not read: they are left out, and the list says some could not be shown. */
  dropped: number;
}
export interface Thread {
  ticket: Ticket;
  /** Oldest first (the wire sends newest first). */
  messages: Message[];
  hasOlder: boolean;
}
export type Limits = { tier: 'free' | 'paid' | 'banned' | null } & Record<LimitRow, { used: number; max: number } | null>;

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
/** The answer's `data` (core hands the body or its data; both are read). */
const dataOf = (raw: unknown): Record<string, unknown> | null => {
  const o = obj(raw);
  if (!o) return null;
  return obj(o.data) ?? o;
};

export function parseTicket(v: unknown): Ticket | null {
  const o = obj(v);
  if (!o) return null;
  const id = str(o.id), subject = str(o.subject), category = str(o.category), status = str(o.status);
  const createdAt = str(o.created_at), lastMessageAt = str(o.last_message_at);
  if (!id || subject === null || !category || !createdAt || !lastMessageAt) return null;
  if (!STATUSES.includes(status as TicketStatus)) return null;
  if (typeof o.terminal !== 'boolean' || typeof o.unread !== 'boolean' || typeof o.reopenable !== 'boolean') return null;
  const closedAt = o.closed_at === null || o.closed_at === undefined ? null : str(o.closed_at);
  if (o.closed_at !== null && o.closed_at !== undefined && closedAt === null) return null;
  return { id, subject, category, status: status as TicketStatus, terminal: o.terminal, unread: o.unread, createdAt, lastMessageAt, closedAt, reopenable: o.reopenable };
}

export function parseMessage(v: unknown): Message | null {
  const o = obj(v);
  if (!o) return null;
  const id = str(o.id), seq = int(o.seq), body = str(o.body), createdAt = str(o.created_at);
  if (!id || seq === null || body === null || !createdAt || (o.from !== 'you' && o.from !== 'support')) return null;
  return { id, seq, from: o.from, body, createdAt };
}

/** GET /support/tickets. Throws when the answer has no ticket list at all (the read failed). */
export function selectList(raw: unknown): TicketPage {
  const d = dataOf(raw);
  if (!d || !Array.isArray(d.tickets)) throw new Error('support list: no tickets');
  const tickets: Ticket[] = [];
  let dropped = 0;
  for (const row of d.tickets) {
    const t = parseTicket(row);
    if (t) tickets.push(t);
    else dropped++;
  }
  const next = d.next_cursor === null || d.next_cursor === undefined ? null : str(d.next_cursor);
  return { tickets, nextCursor: next && next.length > 0 ? next : null, dropped };
}

/** GET /support/tickets/:id. Each page arrives newest first: sorted ascending by seq here, never reversed blindly. */
export function selectThread(raw: unknown): Thread {
  const d = dataOf(raw);
  const ticket = parseTicket(d?.ticket);
  if (!d || !ticket || !Array.isArray(d.messages)) throw new Error('support thread: unreadable');
  const messages = d.messages.map(parseMessage).filter((m): m is Message => m !== null);
  return { ticket, messages: mergeMessages([], messages), hasOlder: d.has_older === true };
}

/** Pages merged by seq, duplicates dropped (a page may overlap after a new message), oldest first. */
export function mergeMessages(a: readonly Message[], b: readonly Message[]): Message[] {
  const by = new Map<number, Message>();
  for (const m of a) by.set(m.seq, m);
  for (const m of b) by.set(m.seq, m);
  return [...by.values()].sort((x, y) => x.seq - y.seq);
}

/** POST /support/tickets/:id/close answers the ticket itself, not {ticket}. */
export function selectClosed(raw: unknown): Ticket | null {
  return parseTicket(dataOf(raw));
}

export function selectLimits(raw: unknown): Limits {
  const d = dataOf(raw);
  if (!d) throw new Error('support limits: unreadable');
  const tier = d.tier === 'free' || d.tier === 'paid' || d.tier === 'banned' ? d.tier : null;
  const row = (k: LimitRow) => {
    const r = obj(d[k]);
    const used = int(r?.used), max = int(r?.max);
    return used === null || max === null ? null : { used, max };
  };
  return { tier, open: row('open'), tickets_day: row('tickets_day'), tickets_30d: row('tickets_30d'), messages_day: row('messages_day'), retained: row('retained') };
}

/** The rows the limits line names: any row with used >= max - 1. */
export function nearLimits(l: Limits | undefined): LimitRow[] {
  if (!l) return [];
  return LIMIT_ROWS.filter((k) => {
    const r = l[k];
    return r !== null && r.max > 0 && r.used >= r.max - 1;
  });
}

export type StatusWord = 'waitingYou' | 'waitingSupport' | 'closed' | 'closedForGood';
/** Closed for good: terminal, or closed and no longer reopenable. */
export function closedForGood(t: Ticket): boolean {
  return t.terminal || (t.status === 'closed' && !t.reopenable);
}
export function statusWord(t: Ticket): StatusWord {
  if (t.status === 'waiting_user') return 'waitingYou';
  if (t.status === 'open') return 'waitingSupport';
  return closedForGood(t) ? 'closedForGood' : 'closed';
}

/** The nav count over the pages read so far: null (no badge) while a page is pending, failed, or the bound was reached
 *  with more still to read. It never shows a number it could not complete. */
export function unreadCount(pages: readonly (TicketPage | undefined)[], bound = COUNT_PAGES): number | null {
  let n = 0;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (!p) return null;
    if (p.dropped > 0) return null;
    n += p.tickets.filter((t) => t.unread).length;
    if (p.nextCursor === null) return n;
    if (i + 1 >= bound) return null;
  }
  return null;
}

// ---- Text cleaning: a port of the API's single cleaning pass, its steps in the API's order,
// repeated to a fixed point, at most MAX_CLEAN_PASSES. Used only to look for a possible match after a lost answer:
// a match never settles anything.

const LINE_BREAK_RE = /\r\n|[\r\u0085\u2028\u2029]/g;
const C6_NOISE_GLOBAL = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B\u200E\u200F\u2060\u3164\uFEFF\uFFA0\u{E0100}-\u{E01EF}]/gu;
const ZWNJ = 0x200c, ZWJ = 0x200d, VS15 = 0xfe0e, VS16 = 0xfe0f;
const JOINING_SCRIPTS = ['Arabic', 'Syriac', 'Nko', 'Mongolian', 'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Sinhala'];
const JOINING_SCRIPT_RES = JOINING_SCRIPTS.map((s) => new RegExp(`\\p{Script_Extensions=${s}}`, 'u'));
const LETTER_OR_MARK_RE = /[\p{L}\p{M}]/u;
const EXT_PICT_RE = /\p{Extended_Pictographic}/u;
const EMOJI_RE = /\p{Emoji}/u;
const EMOJI_MODIFIER_RE = /\p{Emoji_Modifier}/u;
const MONGOLIAN_LETTER_RE = /(?=\p{L})\p{Script_Extensions=Mongolian}/u;
const LINE_SPACE_UNIT_RE = /^[\t\p{Zs}]$/u;
export const MAX_CLEAN_PASSES = 4;

const isC7 = (cp: number): boolean => cp === ZWNJ || cp === ZWJ || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x180b && cp <= 0x180d) || cp === 0x180f;
const ch = (cp: number | undefined): string => (cp === undefined ? '' : String.fromCodePoint(cp));
const scriptShared = (a: string, b: string): boolean => JOINING_SCRIPT_RES.some((re) => re.test(a) && re.test(b));

function inJoiningScript(cps: readonly number[], i: number): boolean {
  if (i === 0 || i === cps.length - 1) return false;
  const prev = ch(cps[i - 1]), next = ch(cps[i + 1]);
  return LETTER_OR_MARK_RE.test(prev) && LETTER_OR_MARK_RE.test(next) && scriptShared(prev, next);
}
function inEmojiSequence(cps: readonly number[], i: number): boolean {
  if (i === 0 || i === cps.length - 1) return false;
  if (!EXT_PICT_RE.test(ch(cps[i + 1]))) return false;
  const prev = ch(cps[i - 1]);
  if (EXT_PICT_RE.test(prev)) return true;
  return i >= 2 && (cps[i - 1] === VS16 || EMOJI_MODIFIER_RE.test(prev)) && EXT_PICT_RE.test(ch(cps[i - 2]));
}
function cleanContextual(cps: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i] as number;
    if (!isC7(cp)) {
      out.push(cp);
      continue;
    }
    if (cp === ZWJ || cp === ZWNJ) {
      if (cps[i - 1] === cp || cps[i + 1] === cp) continue;
      if (inJoiningScript(cps, i) || (cp === ZWJ && inEmojiSequence(cps, i))) out.push(cp);
      continue;
    }
    if (cp === VS15 || cp === VS16) {
      if (i > 0 && EMOJI_RE.test(ch(cps[i - 1]))) out.push(cp);
      continue;
    }
    if (cp >= 0xfe00 && cp <= 0xfe0d) continue;
    if (i > 0 && MONGOLIAN_LETTER_RE.test(ch(cps[i - 1]))) out.push(cp);
  }
  return out;
}
function trimLineEndSpace(line: string): string {
  let end = line.length;
  while (end > 0 && LINE_SPACE_UNIT_RE.test(line[end - 1] as string)) end--;
  return end === line.length ? line : line.slice(0, end);
}
function trimNewlines(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text.charCodeAt(start) === 0x0a) start++;
  while (end > start && text.charCodeAt(end - 1) === 0x0a) end--;
  return text.slice(start, end);
}

/** One cleaning pass, in the server's order. */
export function cleanOnce(input: string, singleLine: boolean): string {
  let text = input.replace(LINE_BREAK_RE, '\n');
  text = text.replace(C6_NOISE_GLOBAL, '');
  text = cleanContextual(Array.from(text, (c) => c.codePointAt(0) as number))
    .map((cp) => String.fromCodePoint(cp))
    .join('');
  text = text.split('\n').map(trimLineEndSpace).join('\n');
  if (singleLine) text = text.trim();
  else text = trimNewlines(text).replace(/\n{4,}/g, '\n\n\n');
  return text.normalize('NFC');
}

/** What the server would store: cleanOnce to a fixed point, at most MAX_CLEAN_PASSES passes. */
export function cleanText(raw: string, singleLine: boolean): string {
  let text = raw;
  for (let pass = 0; pass < MAX_CLEAN_PASSES; pass++) {
    const next = cleanOnce(text, singleLine);
    if (next === text) break;
    text = next;
  }
  return text;
}

/** How far a possible match may sit before the attempt started (the clocks of the Hub and the API differ). */
export const MATCH_SLACK_MS = 2 * 60_000;

/** A possible match for a lost send: an own message whose body equals the draft after the server's cleaning, created
 *  at or after the attempt's start minus the slack. A HINT ONLY: an earlier identical message, another ticket with the
 *  same text or another tab's send all match too, so a match never settles the attempt. */
export function possibleMatch(messages: readonly Message[], draft: string, startedAt: number): Message | null {
  const want = cleanText(draft, false);
  const from = startedAt - MATCH_SLACK_MS;
  let found: Message | null = null;
  for (const m of messages) {
    const at = Date.parse(m.createdAt);
    if (m.from !== 'you' || !Number.isFinite(at) || at < from) continue;
    if (m.body === want) found = m;
  }
  return found;
}

/** A create's possible match: the tickets with the same category and subject (after cleaning), newest first. */
export function candidateTickets(tickets: readonly Ticket[], category: string, subject: string, startedAt: number): Ticket[] {
  const want = cleanText(subject, true);
  const from = startedAt - MATCH_SLACK_MS;
  return tickets.filter((t) => {
    const at = Date.parse(t.createdAt);
    return t.category === category && t.subject === want && Number.isFinite(at) && at >= from;
  });
}

/** The real size rules of a field, in code points and lines (the server's limits on the cleaned text). */
export function textSize(text: string): { chars: number; lines: number } {
  return { chars: Array.from(text).length, lines: text === '' ? 0 : text.split('\n').length };
}

/** The next UTC midnight after `now` (SUPPORT_BUSY's daily budget resets then). */
export function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** The words of SUPPORT_TEXT_INVALID's `rule`: a string key, or null for an unknown rule. */
export function textRuleKey(rule: unknown): string | null {
  switch (rule) {
    case 'empty':
      return 'text.empty';
    case 'too_long':
      return 'text.tooLong';
    case 'too_many_lines':
      return 'text.tooManyLines';
    case 'line_too_long':
      return 'text.lineTooLong';
    case 'multiline':
      return 'text.multiline';
    case 'nul':
    case 'escape':
    case 'c0_control':
    case 'c1_control':
    case 'lone_surrogate':
      return 'text.control';
    case 'bidi_control':
    case 'invisible_char':
    case 'tag_char':
      return 'text.hidden';
    case 'private_use':
    case 'noncharacter':
      return 'text.cantShow';
    case 'combining_flood':
      return 'text.marks';
    default:
      return null;
  }
}

/** A SUPPORT_TEXT_INVALID refusal's facts, read from the error's data (never its message). */
export interface TextRefusal {
  field: 'subject' | 'body';
  key: string;
  index: number | null;
  cleaned: boolean;
}
export function textRefusal(data: unknown): TextRefusal | null {
  const d = dataOf(data);
  const inner = obj(d?.data) ?? d;
  if (!inner) return null;
  const field = inner.field === 'subject' || inner.field === 'body' ? inner.field : null;
  const key = textRuleKey(inner.rule);
  if (!field || !key) return null;
  return { field, key, index: int(inner.index), cleaned: inner.at === 'cleaned' };
}

/** A SUPPORT_QUOTA_REACHED refusal's facts. */
export interface QuotaRefusal {
  limit: LimitRow | null;
  banned: boolean;
  retryAfterS: number | null;
}
export function quotaRefusal(data: unknown): QuotaRefusal {
  const d = dataOf(data);
  const inner = obj(d?.data) ?? d;
  const limit = LIMIT_ROWS.includes(inner?.limit as LimitRow) ? (inner?.limit as LimitRow) : null;
  return { limit, banned: inner?.tier === 'banned', retryAfterS: int(inner?.retry_after_s) };
}

/** SUPPORT_DUPLICATE's facts: the ticket that holds the saved copy, and how long the same text stays refused. */
export function duplicateRefusal(data: unknown): { ticketId: string | null; retryAfterS: number | null } {
  const d = dataOf(data);
  const inner = obj(d?.data) ?? d;
  const id = inner?.ticket_id;
  return { ticketId: typeof id === 'string' && id ? id : null, retryAfterS: int(inner?.retry_after_s) };
}

/** What a send's refusal means for the page. */
export type SendVerdict =
  | 'sent'
  | 'unknown'
  | 'text'
  | 'field'
  | 'quota'
  | 'messageCap'
  | 'closedForGood'
  | 'keyConflict'
  | 'duplicate'
  | 'notFound'
  | 'busy'
  | 'unavailable'
  | 'rate'
  | 'other';
export function sendVerdict(outcome: string, code: string | undefined): SendVerdict {
  if (outcome === 'done') return 'sent';
  switch (code) {
    case 'SUPPORT_BUSY':
      return 'busy';
    case 'SUPPORT_STORAGE_FULL':
    case 'SUPPORT_UNAVAILABLE':
      return 'unavailable';
  }
  // Even on an answer core calls pending (the context died meanwhile): the API refused this request because a matching
  // earlier copy is saved, so nothing about this send is unknown.
  if (code === 'SUPPORT_DUPLICATE') return 'duplicate';
  if (outcome === 'pending') return 'unknown';
  switch (code) {
    case 'SUPPORT_TEXT_INVALID':
      return 'text';
    case 'SUPPORT_FIELD_INVALID':
      return 'field';
    case 'SUPPORT_QUOTA_REACHED':
      return 'quota';
    case 'SUPPORT_TICKET_LIMIT':
      return 'messageCap';
    case 'SUPPORT_TICKET_FULL':
    case 'SUPPORT_TICKET_EXPIRED':
      return 'closedForGood';
    case 'SUPPORT_IDEMPOTENCY_CONFLICT':
      return 'keyConflict';
    case 'SUPPORT_TICKET_NOT_FOUND':
      return 'notFound';
    case 'RATE_LIMIT_EXCEEDED':
      return 'rate';
  }
  return 'other';
}

/** The three hook refusals and the member-account check: which NoAccessState the page shows, or null. */
export type NoAccess = 'signIn' | 'token' | 'member';
export function noAccessOf(code: string | null | undefined, status: number | null | undefined): NoAccess | null {
  if (code === 'SUPPORT_NOT_FOR_ACCOUNT') return 'member';
  if (code === 'INSUFFICIENT_PERMISSIONS') return 'token';
  // Core refuses every /support call of a token session unsent (BASE_ONLY): the same words as the page's own check.
  if (code === 'TOKEN_SESSION_REFUSED') return 'signIn';
  if (status === 403) return 'signIn';
  return null;
}

/** A wait as one unit, rounded up: seconds under 90 s, minutes under 90 min, else hours. */
export function waitUnit(ms: number): { unit: 'seconds' | 'minutes' | 'hours'; count: number } {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 90) return { unit: 'seconds', count: s };
  const m = Math.ceil(s / 60);
  if (m < 90) return { unit: 'minutes', count: m };
  return { unit: 'hours', count: Math.ceil(m / 60) };
}
