// Abuse notices: the parsers of the owner routes' answers and the pure rules of the reply
// box. One parser per wire shape: it checks every field the section reads and returns a typed value, or null when the
// answer is malformed or contradicts itself (resolved without a resolved time, open with one). A null makes the read an
// error the section shows as such; nothing here guesses a value. The owner DTO is all there is: no reason, resolution
// note, suspension id or server id is read, and none is shown.

export type AbuseStatus = 'open' | 'resolved';
/** The linked suspension, read live by the API: null (none linked), 'active' or 'lifted'. */
export type Restriction = 'active' | 'lifted' | null;

export interface AbuseNotice {
  readonly id: string;
  readonly title: string;
  /** The server's name when the notice was sent; null when the API has none. */
  readonly serverLabel: string | null;
  readonly status: AbuseStatus;
  readonly restriction: Restriction;
  /** The API declares these nullable: null shows as not recorded, never as a made-up time. */
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly resolvedAt: string | null;
}

export interface AbuseMessage {
  /** Its place in the notice's thread: 1 for the first message, then 2, 3, ... (never proof of a reply). */
  readonly seq: number;
  /** 'admin': Hoody wrote it. 'owner': this account replied. */
  readonly author: 'admin' | 'owner';
  readonly body: string;
  readonly createdAt: string | null;
}

export interface AbuseNoticeDetail extends AbuseNotice {
  /** What Hoody wrote when it opened the notice. */
  readonly userMessage: string;
  /** Every message after it, oldest first (the API's order). */
  readonly messages: readonly AbuseMessage[];
}

export interface AbuseNoticePage {
  readonly rows: readonly AbuseNotice[];
  /** Every notice the account holds. */
  readonly total: number;
  /** A later page holds more (the API's `pagination.has_more`). */
  readonly more: boolean;
}

/** The reply box's bounds: the API's support_body profile. */
export const REPLY_MAX = 4000;
export const REPLY_MAX_LINES = 200;
/** The longest one line may be, in code points (support_body maxLineCodePoints). */
export const REPLY_MAX_LINE = 2000;
/** How many replies one notice takes from the owner (ABUSE_NOTICE_REPLY_LIMIT past it). */
export const REPLY_LIMIT = 20;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string';
/** An RFC 3339 date-time, as the API's `format: date-time` sends it (a date alone or any other text is not one). */
const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/;
/** Every part in range and the day real for its month (no normalisation: February 30 is not March 2). */
function isTime(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = TIME_RE.exec(v);
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const oh = m[8] === undefined ? 0 : Number(m[8]);
  const om = m[9] === undefined ? 0 : Number(m[9]);
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59 || oh > 23 || om > 59) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}
const isTimeOrNull = (v: unknown): v is string | null => v === null || isTime(v);
const isHex24 = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{24}$/.test(v);
/** A message's place in its thread: an integer from 1. */
const isSeq = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1;

function noticeFields(o: Obj): AbuseNotice | null {
  const { id, title, server_label, status, restriction, created_at, updated_at, resolved_at } = o;
  if (!isHex24(id) || !isText(title) || (server_label !== null && !isText(server_label))) return null;
  if (status !== 'open' && status !== 'resolved') return null;
  if (restriction !== null && restriction !== 'active' && restriction !== 'lifted') return null;
  if (!isTimeOrNull(created_at) || !isTimeOrNull(updated_at) || !isTimeOrNull(resolved_at)) return null;
  // Contradictions: a resolved notice has its time, an open one has none.
  if ((status === 'resolved') !== (resolved_at !== null)) return null;
  return { id, title, serverLabel: server_label, status, restriction, createdAt: created_at, updatedAt: updated_at, resolvedAt: resolved_at };
}

/** One list row, or null. */
export function parseNotice(raw: unknown): AbuseNotice | null {
  return isObj(raw) ? noticeFields(raw) : null;
}

/** One message, or null. */
export function parseMessage(raw: unknown): AbuseMessage | null {
  if (!isObj(raw)) return null;
  // Only these fields are read: anything else on the wire (an old `id`) is ignored.
  const { seq, author_kind, body, created_at } = raw;
  if (!isSeq(seq) || (author_kind !== 'admin' && author_kind !== 'owner') || !isText(body) || !isTimeOrNull(created_at)) return null;
  return { seq, author: author_kind, body, createdAt: created_at };
}

/** GET /abuse-notices: one page, `{data: [...], pagination: {total, has_more}}`. Null when the answer or any row is malformed. */
export function parseNoticeList(raw: unknown): AbuseNoticePage | null {
  if (!isObj(raw) || !Array.isArray(raw.data) || !isObj(raw.pagination)) return null;
  const { total, has_more } = raw.pagination;
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0 || typeof has_more !== 'boolean') return null;
  const rows: AbuseNotice[] = [];
  for (const r of raw.data) {
    const n = parseNotice(r);
    if (!n) return null;
    rows.push(n);
  }
  if (total < rows.length) return null;
  return { rows, total, more: has_more };
}

/** GET /abuse-notices/:id: `{data: {...notice, message, messages}}` (`message`: what Hoody wrote), for the asked id only. Null otherwise. */
export function parseNoticeDetail(raw: unknown, askedId: string): AbuseNoticeDetail | null {
  if (!isObj(raw) || !isObj(raw.data)) return null;
  const d = raw.data;
  const n = noticeFields(d);
  if (!n || n.id !== askedId || !isText(d.message) || !Array.isArray(d.messages)) return null;
  const messages: AbuseMessage[] = [];
  for (const m of d.messages) {
    const p = parseMessage(m);
    // The thread in order, numbered 1, 2, 3, ...: a duplicate, gap or wrong order makes the whole answer malformed.
    if (!p || p.seq !== messages.length + 1) return null;
    messages.push(p);
  }
  return { ...n, userMessage: d.message, messages };
}

/** The 201 answer of POST /abuse-notices/:id/messages: `{statusCode: 201, message, data: {message}}`, the stored message,
 *  written by the owner.
 *  Null when it is anything else: then the answer proves nothing and the reply stays held. */
export function parseReplyAnswer(raw: unknown): AbuseMessage | null {
  // The envelope the API's send() writes with the HTTP status: 201 and its message, or it proves nothing.
  if (!isObj(raw) || raw.statusCode !== 201 || !isText(raw.message) || !isObj(raw.data)) return null;
  const m = parseMessage(raw.data.message);
  return m && m.author === 'owner' ? m : null;
}

/** Every line break the API folds to LF before counting:
 *  CRLF counts once; a lone CR, NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR each start a new line. */
const LINE_BREAKS = /\r\n|[\r\u0085\u2028\u2029]/g;

/** The reply's size as the API counts it (code points, lines, the longest line in code points). */
export function replySize(text: string): { chars: number; lines: number; longestLine: number } {
  const folded = text.replace(LINE_BREAKS, '\n');
  const lines = folded === '' ? [] : folded.split('\n');
  return { chars: Array.from(folded).length, lines: lines.length, longestLine: lines.reduce((m, l) => Math.max(m, Array.from(l).length), 0) };
}

/** What the box may send now: non-blank text within the bounds. */
export function replyFits(text: string): boolean {
  const s = replySize(text);
  return text.trim() !== '' && s.chars <= REPLY_MAX && s.lines <= REPLY_MAX_LINES && s.longestLine <= REPLY_MAX_LINE;
}

/** How many replies this account has left on a notice. */
export function repliesLeft(d: AbuseNoticeDetail): number {
  return Math.max(0, REPLY_LIMIT - d.messages.filter((m) => m.author === 'owner').length);
}

/** The words key of a definite reply refusal, by its code; null: the kit's mapped sentence for the error. */
export type RefusalKey = 'an.err.resolved' | 'an.err.limit' | 'an.err.text' | 'an.err.gone';
export function refusalKey(code: string | undefined): RefusalKey | null {
  switch (code) {
    case 'ABUSE_NOTICE_RESOLVED':
      return 'an.err.resolved';
    case 'ABUSE_NOTICE_REPLY_LIMIT':
      return 'an.err.limit';
    case 'ABUSE_NOTICE_TEXT_INVALID':
    case 'ABUSE_NOTICE_FIELD_INVALID':
      return 'an.err.text';
    case 'ABUSE_NOTICE_NOT_FOUND':
      return 'an.err.gone';
    default:
      return null;
  }
}
