// Pure functions of the notifications page (no React, no I/O).
// What the platform really sends is the only claim the page may make. The browser-alert rules
// live in core (core/alerts.ts), shared with the shell's alert runner.
import type { Notice, NoticePage, NoticeType, Severity } from './data';

// ── groups: the API's notification `type`, in plain words ──────────────────

export type GroupId = 'machines' | 'paid' | 'account' | 'notices';

export type ItemId =
  | 'failed'
  | 'running'
  | 'expired'
  | 'rental'
  | 'order'
  | 'share'
  | 'reminder'
  | 'renewed'
  | 'stopped'
  | 'deleted'
  | 'security'
  | 'keys'
  | 'payment'
  | 'projects'
  | 'standing'
  | 'maintenance'
  | 'announce';

export interface Group {
  id: GroupId;
  type: NoticeType;
  items: readonly ItemId[];
  /** The items that also reach a verified email address. */
  mail: readonly ItemId[];
}

export const GROUPS: readonly Group[] = [
  {
    id: 'machines',
    type: 'STATUS_UPDATE',
    items: ['failed', 'running', 'expired', 'rental', 'order', 'share'],
    mail: [],
  },
  {
    id: 'paid',
    type: 'BILLING',
    items: ['reminder', 'renewed', 'stopped', 'deleted'],
    mail: ['reminder', 'stopped', 'deleted'],
  },
  {
    id: 'account',
    type: 'ANNOUNCEMENT',
    items: ['security', 'keys', 'payment', 'projects', 'standing'],
    mail: [],
  },
  {
    id: 'notices',
    type: 'MAINTENANCE',
    items: ['maintenance', 'announce'],
    mail: ['announce'],
  },
];

/** The group a row files under, by its API `type`; anything unknown is 'other'. */
export function groupOf(n: Pick<Notice, 'type'>): GroupId | 'other' {
  return GROUPS.find((g) => g.type === n.type)?.id ?? 'other';
}

/** The platform marked it a warning or an error. */
export function needsLook(n: Pick<Notice, 'severity'>): boolean {
  return n.severity === 'WARNING' || n.severity === 'ERROR';
}

export const SEVERITIES: readonly Severity[] = ['INFO', 'SUCCESS', 'WARNING', 'ERROR'];

// ── message text: the notice rule (https links and **bold**) ─────────────
// Mirror of the server's notice-text rule, which renders the same text into email: change both
// together and keep logic.test.ts's CASES equal to the server's own test cases.
// - A bare `https://` URL is a link. Nothing else is (`http:`, `mailto:`, `javascript:` stay text).
//   Trailing sentence punctuation and `*` stay out of the link; a closing bracket stays in only when it
//   closes one opened inside the URL.
// - `**text**` is bold. The opener must be followed, and the closer preceded, by a non-space character;
//   the bold part is never empty and never spans a blank line. A `**` with no partner, or inside a URL,
//   stays as written. Bold may contain links.
// Notice text is stored verbatim, so never as markup: text parts, https links and bold, nothing else.

export interface Segment {
  text: string;
  href?: string;
  bold?: boolean;
}

const URL_RE = /\bhttps:\/\/[^\s<>"']+/gi;
const BRACKET_OPEN: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const BLANK_LINE_GLOBAL_RE = /\n[ \t]*\n/g;

/** Trailing sentence punctuation and `*` stay text; a closing bracket stays in the URL only when it closes one opened inside. */
function trimUrlTail(u: string): string {
  // Bracket counts are taken once and kept up to date as characters come off: linear in the URL length.
  const counts = new Map<string, number>();
  for (const ch of u) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let end = u.length;
  for (;;) {
    const c = u.charAt(end - 1);
    const open = BRACKET_OPEN[c];
    if ('.,;:!?*'.includes(c) || (open !== undefined && (counts.get(open) ?? 0) < (counts.get(c) ?? 0))) {
      counts.set(c, (counts.get(c) ?? 0) - 1);
      end--;
      continue;
    }
    return u.slice(0, end);
  }
}

function safeHttpsHref(u: string): string | null {
  try {
    const p = new URL(u);
    return p.protocol === 'https:' && p.hostname ? p.href : null;
  } catch {
    return null;
  }
}

interface Link {
  start: number;
  end: number;
  href: string;
}

function findLinks(text: string): Link[] {
  const out: Link[] = [];
  // A link starts its own word: an https:// inside another URL of the same word (http://u@https://x,
  // http://a/?u=https://x) stays text. A word ends where a URL ends: whitespace or one of <>"'.
  // Both scans only move forward, so this stays linear.
  let scan = 0;
  let wordStart = 0;
  let nextScheme = text.indexOf('://');
  let lastScheme = -1;
  URL_RE.lastIndex = 0;
  for (let m = URL_RE.exec(text); m !== null; m = URL_RE.exec(text)) {
    for (; scan < m.index; scan++) if (/[\s<>"']/.test(text.charAt(scan))) wordStart = scan + 1;
    while (nextScheme !== -1 && nextScheme < m.index) {
      lastScheme = nextScheme;
      nextScheme = text.indexOf('://', nextScheme + 1);
    }
    if (lastScheme >= wordStart) continue;
    // Right after '/' or ':' the match is the tail of another URL (http://https://x): never a link of its own.
    const before = text.charAt(m.index - 1);
    if (before === '/' || before === ':') continue;
    const url = trimUrlTail(m[0]);
    const href = url ? safeHttpsHref(url) : null;
    if (href) out.push({ start: m.index, end: m.index + url.length, href });
  }
  return out;
}

const isSpace = (c: string) => c === '' || /\s/.test(c);

/** [open, close) index pairs of `**` markers, both outside every link. */
function findBold(text: string, links: Link[]): Array<[number, number]> {
  // One pass over the markers and the blank lines: a long message full of `**` must not stall a render.
  let li = 0;
  const markers: number[] = [];
  for (let i = text.indexOf('**'); i !== -1; i = text.indexOf('**', i + 2)) {
    while (li < links.length && (links[li]?.end ?? 0) <= i) li++;
    const l = links[li];
    if (!l || i + 2 <= l.start) markers.push(i);
  }
  const blanks: Array<[number, number]> = [];
  BLANK_LINE_GLOBAL_RE.lastIndex = 0;
  for (let m = BLANK_LINE_GLOBAL_RE.exec(text); m !== null; m = BLANK_LINE_GLOBAL_RE.exec(text)) blanks.push([m.index, m.index + m[0].length]);
  // A blank line lies wholly inside [a, b): blanks are sorted and do not overlap, and `a` only grows, so one pointer
  // walks them once (the first blank starting at or after a).
  let bi = 0;
  const spansBlank = (a: number, b: number) => {
    while (bi < blanks.length && (blanks[bi]?.[0] ?? 0) < a) bi++;
    const hit = blanks[bi];
    return hit !== undefined && hit[1] <= b;
  };
  // nextCloser[i]: the first marker at index >= i that can close (preceded by a non-space character), else -1.
  const nextCloser: number[] = new Array<number>(markers.length + 1).fill(-1);
  for (let i = markers.length - 1; i >= 0; i--) nextCloser[i] = isSpace(text.charAt((markers[i] ?? 0) - 1)) ? (nextCloser[i + 1] ?? -1) : i;
  const pairs: Array<[number, number]> = [];
  let a = 0;
  while (a < markers.length) {
    const open = markers[a] ?? 0;
    if (isSpace(text.charAt(open + 2))) {
      a++;
      continue;
    }
    let c = nextCloser[a + 1] ?? -1;
    if (c !== -1 && markers[c] === open + 2) c = nextCloser[c + 1] ?? -1;
    const close = c === -1 ? -1 : (markers[c] ?? -1);
    if (close === -1 || spansBlank(open + 2, close)) {
      a++;
      continue;
    }
    pairs.push([open, close]);
    a = c + 1;
  }
  return pairs;
}

export function noticeSegments(text: string): Segment[] {
  // One line ending everywhere: a blank line written with \r\n is still a blank line (the email normalises the same way).
  const s = String(text ?? '').replace(/\r\n?/g, '\n');
  const links = findLinks(s);
  const bold = findBold(s, links);
  // Cut points: every link edge and every marker edge.
  const cuts = new Set<number>([0, s.length]);
  for (const l of links) cuts.add(l.start).add(l.end);
  for (const [o, c] of bold) cuts.add(o).add(o + 2).add(c).add(c + 2);
  const points = [...cuts].sort((x, y) => x - y);
  const markerAt = new Set<number>();
  for (const [o, c] of bold) markerAt.add(o).add(c);
  const hrefAt = new Map<number, string>();
  for (const l of links) hrefAt.set(l.start, l.href);
  const out: Segment[] = [];
  let pair = 0;
  for (const [k, from] of points.entries()) {
    const to = points[k + 1] ?? from;
    if (from === to || markerAt.has(from)) continue;
    while (pair < bold.length && (bold[pair]?.[1] ?? 0) <= from) pair++;
    const p = bold[pair];
    const seg: Segment = { text: s.slice(from, to) };
    const href = hrefAt.get(from);
    if (href !== undefined) seg.href = href;
    if (p !== undefined && from >= p[0] + 2) seg.bold = true;
    const prev = out[out.length - 1];
    if (prev && !prev.href && !seg.href && !!prev.bold === !!seg.bold) prev.text += seg.text;
    else out.push(seg);
  }
  return out;
}

/** The message as plain text: markers removed, links as their URL. */
export function noticePlainText(text: string): string {
  return noticeSegments(text)
    .map((x) => x.text)
    .join('');
}

// ── read-back: what a fresh list proves about a mark-read ──────────────────
// core frees a change whose outcome is unknown only by these verdicts (defineMutation proves). A list answer
// does not name its box: an unread page holds unread rows, the archive read ones. An empty page is the unread
// box when every page is empty or another page reads as the archive; otherwise it proves nothing.

const isPage = (x: unknown): x is NoticePage => !!x && typeof x === 'object' && Array.isArray((x as NoticePage).rows);

function unreadPages(answers: readonly (readonly unknown[])[]): {
  pages: NoticePage[];
  unread: NoticePage[];
} {
  const pages = (answers[0] ?? []).filter(isPage);
  const archiveShown = pages.some((p) => p.rows.length > 0 && p.rows.every((r) => r.read));
  const allEmpty = pages.every((p) => p.rows.length === 0);
  const unread = pages.filter((p) => (p.rows.length > 0 ? p.rows.every((r) => !r.read) : archiveShown || allEmpty));
  return { pages, unread };
}

/** A mark-read of `identity.id` applied: the notice reads read, or a whole unread box lacks it. */
export function markReadProves(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const id = (identity as { id?: unknown } | undefined)?.id;
  if (typeof id !== 'string') return undefined;
  const { pages, unread } = unreadPages(answers);
  if (pages.some((p) => p.rows.some((r) => r.id === id && r.read))) return 'applied';
  return unread.some((p) => p.rows.length >= p.total && !p.rows.some((r) => r.id === id)) ? 'applied' : undefined;
}

/** Mark all read applied. `identity.ids` are the unread notices the page held at the press: none of them still
 * reads unread in a whole unread box (one that came after does not hold it). Without that list (no read yet, a
 * box cut short or empty at the press), only an empty unread box proves it. A box cut short proves nothing: it stays held until a
 * read proves it or the person forgets it. */
export function markAllProves(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const ids = (identity as { ids?: unknown } | undefined)?.ids;
  const { unread } = unreadPages(answers);
  // An empty list names nothing, so it proves nothing a non-empty box could hold against it.
  if (!Array.isArray(ids) || ids.length === 0) return unread.some((p) => p.total === 0 && p.rows.length === 0) ? 'applied' : undefined;
  const pressed = new Set(ids);
  return unread.some((p) => p.rows.length >= p.total && !p.rows.some((r) => pressed.has(r.id))) ? 'applied' : undefined;
}

/** What a Mark all read answer shows: BUSY (the earlier press is still out) changes nothing, READ_BACK_FIRST
 * (an earlier one may have gone through) is pending like a pending answer, stale shows nothing, any other
 * refusal is failed. */
export function readAllShown(r: { outcome: string; code?: string }): 'done' | 'pending' | 'failed' | null {
  if (r.outcome === 'done' || r.outcome === 'pending') return r.outcome;
  if (r.code === 'BUSY' || r.outcome === 'stale') return null;
  return r.code === 'READ_BACK_FIRST' ? 'pending' : 'failed';
}
