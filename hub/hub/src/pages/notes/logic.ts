// The Notes page's rules. Pure functions of
// their arguments: no React, no requests. Search, filters and sort are NOT here: useDataView owns them.
//   clean(s, max)     untrusted text for display: controls, bidi and zero-width characters removed, white space
//                     folded, cut to `max` code points on a grapheme boundary. '' when nothing is left.
//   checkTitle(s)     a New note title: {value} (trimmed, 1-200 code points, no controls) or {err}.
//   newId(ms, bytes)  the page id the Hub picks: 12 hex of the clock, 10 hex of 5 random bytes, then '08'.
//   notesCode(e)      the Notes code of a kit rejection, or null (anything not JSON {code, message} has none).
//   stateOf(e)        a list read's rejection -> one per-computer state.
//   createOutcome(r)  the New note answer table: created | notSent | unknown | cantAdd | protected | noPlace | gone | taken.
//   listNote(n, part) what a read list's group row says: partial before empty.
//   readBack(r, sent) the one read-back after an unknown outcome: 'matching' or 'unsure', never "created".
//   emptyKinds(cs, l)  the empty list's computers by what their Notes answered.
//   isDenied(l)        a blocked computer only its owner can open up (not the owner, no access).
//   emptyWays(k, o)    the empty list's ways on, most useful first, at most two.
//   emptyOpenTarget()  the computer the empty list's Open Notes opens.
//   noteLink(base, u, n, ro)   a note's Copy link (its own address in the computer's Notes), read-only with `ro`.
//   agentCommand(c, nb, n)     a note's Copy for an agent: the in-computer CLI read of it as Markdown, or none.
import type { Computer, CreateBody, CreateOutcome, Loaded, Me, NotesState, Recent, Rejection, SentNote } from './types';

export const ID = /^[0-9a-z]{24,28}$/;
const OURS = /^[0-9a-f]{22}08$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
// Bidi controls and invisible format characters; ZWJ and ZWNJ stay (emoji sequences and several scripts need them).
const HIDDEN = /[­؜ᅟᅠ឴឵᠋-᠏​‎‏‪-‮⁠-⁤⁦-⁯ㅤ﻿ﾠ]|\udb40[\udc00-\udc7f]/g;
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/g;
// Codes the Notes handlers send. Only these count as Notes' own answer: an edge or proxy body that happens to
// carry `code` stays out.
const CODES = ['unauthorized', 'forbidden', 'notebook_no_access', 'notebook_readonly', 'notebook_not_found', 'not_found', 'bad_request', 'validation_error', 'parent_required', 'section_must_be_root', 'root_not_found', 'too_many_requests', 'notes_busy', 'unknown'];

export const MAX_COMPUTERS = 8;
export const RECENT = 10;
export const TITLE_MAX = 200;
export const MD_BYTES = 5 * 1024 * 1024;

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const cps = (s: string): number => Array.from(s).length;

function graphemes(s: string): string[] {
  if (typeof Intl === 'undefined' || !('Segmenter' in Intl)) return Array.from(s);
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment);
}

export function clean(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  const t = s.replace(LONE, '$1').replace(HIDDEN, '').replace(/[\s\u0000-\u001f\u007f-\u009f]+/g, ' ').trim();
  if (cps(t) <= max) return t;
  let out = '';
  let n = 0;
  for (const g of graphemes(t)) {
    const k = cps(g);
    if (n + k > max - 1) break;
    out += g;
    n += k;
  }
  return out.replace(/\s+$/, '') + '…';
}

export type TitleError = 'empty' | 'control' | 'long';
export function checkTitle(s: unknown): { value: string } | { err: TitleError } {
  const v = String(s ?? '').trim();
  if (!v) return { err: 'empty' };
  if (CONTROL.test(v) || v.replace(LONE, '$1') !== v || v.replace(HIDDEN, '') !== v) return { err: 'control' };
  if (cps(v) > TITLE_MAX) return { err: 'long' };
  return { value: v };
}

const hex = (bytes: ArrayLike<number>): string => Array.from(bytes as ArrayLike<number>, (b) => (b < 16 ? '0' : '') + b.toString(16)).join('');
export function newId(ms: number, bytes: ArrayLike<number>): string {
  return ('000000000000' + Math.floor(ms).toString(16)).slice(-12) + hex(bytes).slice(0, 10) + '08';
}

export function notesCode(e: unknown): string | null {
  if (!obj(e) || typeof e.status !== 'number' || e.status < 400 || e.status > 599) return null;
  const d = e.data;
  if (!obj(d) || typeof d.code !== 'string' || typeof d.message !== 'string' || d.code !== e.code) return null;
  return CODES.includes(d.code) ? d.code : null;
}

/** A rejection of a list read (capabilities, me, recent) -> a state. 'dropped': the read died; nothing is drawn. */
export function stateOf(e: unknown): NotesState {
  const x = (obj(e) ? e : {}) as Rejection;
  if (!obj(e) || x.stale || x.superseded || x.kind === 'stale' || x.kind === 'aborted') return 'dropped';
  const k = x.kind;
  const c = notesCode(e);
  if (k === 'private') return c === 'forbidden' ? 'notOwner' : c ? 'noAccess' : 'protected';
  if (k === 'rate_limited' || k === 'quota' || c === 'notes_busy') return 'busy';
  if (k === 'unreachable') return x.code === 'TIMEOUT' ? 'unreachable' : 'cantTell';
  if (k === 'preflight_refused') return 'cantTell';
  if (k === 'unavailable' && (x.status ?? 0) >= 502 && (x.status ?? 0) <= 504) return 'unreachable';
  if (k === 'not_sent') return 'unreachable';
  return 'unexpected';
}

/** Capabilities: {service:'hoody-notes', features:[...]}. Only a 404 not_found says "older Notes". */
export function capsState(body: unknown): 'ok' | 'older' | 'unexpected' {
  if (!obj(body) || body.service !== 'hoody-notes' || !Array.isArray(body.features)) return 'unexpected';
  return body.features.includes('recent') ? 'ok' : 'older';
}
export function capsRefused(e: unknown): NotesState {
  return obj(e) && e.status === 404 && notesCode(e) === 'not_found' ? 'older' : stateOf(e);
}

export function parseMe(b: unknown): Me | null {
  if (!obj(b) || typeof b.userId !== 'string' || !ID.test(b.userId) || typeof b.notebookId !== 'string' || !ID.test(b.notebookId) || typeof b.role !== 'string') return null;
  return { userId: b.userId, notebookId: b.notebookId, role: b.role };
}

function stamp(s: unknown): number | null {
  if (typeof s !== 'string' || s.length > 40) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** The recent answer. A malformed answer is null ("unexpected"); one malformed row is skipped and the answer marked partial. */
export function parseRecent(b: unknown, me: Me | null): Recent | null {
  if (!obj(b) || !Array.isArray(b.items) || typeof b.partial !== 'boolean' || (me && b.notebookId !== me.notebookId)) return null;
  const c = b.create;
  let create: Recent['create'] = null;
  let partial = b.partial;
  if (c !== null) {
    if (!obj(c) || typeof c.parentId !== 'string' || !ID.test(c.parentId)) return null;
    create = { parentId: c.parentId, section: clean(c.sectionName, 60) };
  }
  const items: Recent['items'] = [];
  for (let i = 0; i < b.items.length && i < 20; i++) {
    const r: unknown = b.items[i];
    if (!obj(r) || typeof r.nodeId !== 'string' || !ID.test(r.nodeId) || typeof r.hasBody !== 'boolean') {
      partial = true;
      continue;
    }
    items.push({ id: r.nodeId, title: clean(r.name, 120), section: clean(r.sectionName, 60), at: stamp(r.changedAt), hasBody: r.hasBody });
  }
  return { items, partial: partial || b.items.length > 20, create };
}

/**
 * The New note answer table. Final only for a definite Notes refusal (400/403/404/409 with a Notes code) or an
 * uncoded 401/403 from the edge, which never reached Notes. Everything else after the send is unknown: one read-back.
 */
export function createOutcome(r: { ok: true; body: unknown } | { ok: false; err: unknown }, ourId: string): CreateOutcome {
  if (r.ok) return obj(r.body) && r.body.id === ourId && r.body.type === 'page' ? 'created' : 'unknown';
  const e = r.err;
  if (!obj(e)) return 'unknown';
  const x = e as Rejection;
  if (x.notSent && !x.pending) return 'notSent';
  if (x.pending || x.kind === 'pending') return 'unknown';
  const c = notesCode(e);
  const s = x.status ?? 0;
  if (x.kind === 'private' || s === 401 || s === 403) return c ? 'cantAdd' : x.kind === 'private' ? 'protected' : 'unknown';
  if (!c) return 'unknown';
  if (s === 400) return 'noPlace';
  if (s === 404 && (c === 'notebook_not_found' || c === 'not_found')) return 'gone';
  if (s === 409) return 'taken';
  return 'unknown';
}

export function readBack(r: { ok: boolean; body?: unknown }, sent: SentNote): 'matching' | 'unsure' {
  const b = r.ok ? r.body : null;
  return obj(b) && b.id === sent.id && b.type === 'page' && b.parentId === sent.parentId && b.name === sent.name ? 'matching' : 'unsure';
}

/** What a computer's group row says about a list that was read: 'partial' whenever rows may be missing (an incomplete
 *  list with no usable row proves nothing, so it is never called empty), 'empty' for a whole list with no note, else nothing. */
export function listNote(count: number, partial: boolean): 'partial' | 'empty' | null {
  return partial ? 'partial' : count === 0 ? 'empty' : null;
}

/** The busy retry wait: Retry-After when readable and at most 5 s, else null. */
export function retryDelay(e: unknown): number | null {
  const ms = obj(e) ? e.retryAfterMs : null;
  return typeof ms === 'number' && ms >= 0 && ms <= 5000 ? Math.max(ms, 250) : null;
}

export function fileName(title: string): string {
  const base = clean(title || '', 80).replace(/[^A-Za-z0-9._ -]/g, '').replace(/^[ .]+|[ .]+$/g, '');
  return (base || 'note') + '.md';
}

/** The create body admitted by the route's guard: a page with an id the Hub picked and nothing else. */
export function createGuard(body: unknown): boolean {
  const b = obj(body) ? body : null;
  const a = b && obj(b.attributes) ? b.attributes : null;
  if (!b || !a || b.type !== 'page' || typeof b.id !== 'string' || !OURS.test(b.id) || typeof b.parentId !== 'string' || !ID.test(b.parentId) || typeof a.name !== 'string') return false;
  for (const k of Object.keys(a)) if (!['type', 'parentId', 'name'].includes(k)) return false;
  return (a.type === undefined || a.type === 'page') && (a.parentId === undefined || a.parentId === b.parentId);
}

export function createBody(id: string, parentId: string, name: string): CreateBody {
  return { id, type: 'page', parentId, attributes: { name } };
}


/** The address of one note in a computer's Notes program, from the program's base address (notesUrl): the page route
 *  /notebook/<userId>/<nodeId>. `embedded` adds the sidebar-hidden look the Hub's own detail pane wants. null when the base is
 *  not an https address or an id is not a Notes id (nothing is linked then). */
export function noteUrl(base: string | null, userId: string, nodeId: string, embedded = false): string | null {
  if (!base || !ID.test(userId) || !ID.test(nodeId)) return null;
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  return `${u.origin}/notebook/${userId}/${nodeId}${embedded ? '?sidebar=hidden' : ''}`;
}

/** What the empty list names when no computer lists a note, each kind with its computers in the
 *  page's order: `none` answered with its whole list, and it holds no note; `failed` gave no whole list the Hub can
 *  read (no answer, busy, an answer the Hub does not understand, an outcome not known, or a list marked partial: some
 *  of its rows were left out, so an empty one proves nothing; Try again helps); `off` is not running; `blocked`
 *  answered but cannot be read here (protected, older, not the owner, no access); `reading` has not answered yet. */
export interface EmptyKinds {
  none: Computer[];
  failed: Computer[];
  off: Computer[];
  blocked: Computer[];
  reading: Computer[];
}
const FAILED_STATES: ReadonlySet<string> = new Set(['unreachable', 'cantTell', 'unexpected', 'busy']);
export function emptyKinds(cs: readonly Computer[], loads: Readonly<Record<string, Loaded | undefined>>): EmptyKinds {
  const k: EmptyKinds = { none: [], failed: [], off: [], blocked: [], reading: [] };
  for (const c of cs) {
    const l = loads[c.id];
    if (c.state !== 'running') k.off.push(c);
    else if (!l || l.state === 'loading') k.reading.push(c);
    else if (l.state === 'ok') (l.recent.partial ? k.failed : k.none).push(c);
    else if (FAILED_STATES.has(l.state)) k.failed.push(c);
    else k.blocked.push(c);
  }
  return k;
}

/** A blocked computer only its owner can open up: the person is not its owner, or has no access to its notebook. Nothing
 *  on this page helps there (Open Notes would refuse too), so the empty list says to ask the owner. */
export function isDenied(l: Loaded | undefined): boolean {
  return l?.state === 'notOwner' || l?.state === 'noAccess';
}

/** The empty list says "No notes yet" (not "No notes to show") only when every computer it names answered with its
 *  whole list and none holds a note: none failed, is blocked, is still being read or is not running (a stopped one may
 *  hold notes), and the page read every computer: `unread` is how many it did not (it reads the first MAX_COMPUTERS). */
export function emptyNoneYet(k: EmptyKinds, unread: number): boolean {
  return k.none.length > 0 && k.failed.length + k.blocked.length + k.reading.length + k.off.length + unread === 0;
}

/** The list is a failed read, not an empty one: every running computer was read and none gave its whole list (a stopped
 *  one has nothing to give). Then the page shows the kit error state, never "No notes to show". */
export function emptyIsError(k: EmptyKinds): boolean {
  return k.failed.length > 0 && k.none.length + k.reading.length + k.blocked.length === 0;
}

/** The computer whose own Notes the empty list's Open Notes opens (a new tab), or undefined: the first protected or
 *  older one (to sign in or update), else the first that answered with no note (to look or write there); only one
 *  with an address (`urlOf`). Never one that failed, is not running, or that its owner alone can read. */
export function emptyOpenTarget(k: EmptyKinds, loads: Readonly<Record<string, Loaded | undefined>>, urlOf: (c: Computer) => string | null): Computer | undefined {
  const fix = k.blocked.find((c) => {
    const st = loads[c.id]?.state;
    return (st === 'protected' || st === 'older') && urlOf(c) !== null;
  });
  return fix ?? k.none.find((c) => urlOf(c) !== null);
}

/** A way on from the empty list: New note, Try again (the computers that gave no whole list), Computers (some aren't
 *  running), Open Notes (one computer's own Notes, emptyOpenTarget). */
export type EmptyWay = 'new' | 'retry' | 'computers' | 'open';
/** The ways on the empty list shows, most useful first, at most two (the primary, then the secondary). `canNew`: a
 *  computer can take a note now; `computers`: the Computers page can be opened; `open`: emptyOpenTarget found one. */
export function emptyWays(k: EmptyKinds, o: { canNew: boolean; computers: boolean; open: boolean }): EmptyWay[] {
  const ways: EmptyWay[] = [];
  if (o.canNew) ways.push('new');
  if (k.failed.length > 0) ways.push('retry');
  if (k.off.length > 0 && o.computers) ways.push('computers');
  if (o.open) ways.push('open');
  return ways.slice(0, 2);
}

// ── Copy link ──────────────────────────────────────────────────────────────────────

/** A note's Copy link and Copy read-only link: the note's own address in its computer's Notes (noteUrl, the address Open
 *  note opens), never the Hub's. `readOnly` adds Notes' view option mode=readonly: the note opens with editing turned off.
 *  That option is a view, not a right: Notes still lets whoever opens it edit once the option is taken off the address.
 *  null when noteUrl gives none. */
export function noteLink(base: string | null, userId: string, nodeId: string, readOnly = false): string | null {
  const u = noteUrl(base, userId, nodeId);
  return u && readOnly ? `${u}?mode=readonly` : u;
}

/** Copy for an agent: the command an agent on the note's computer runs to read it as Markdown (the hoody CLI, which reaches
 *  that computer's Notes). Every id must be one the shell reads as one plain word, so a hostile id gives no command at all,
 *  never one cut short or one that runs something else. */
export function agentCommand(computerId: string, notebookId: string, noteId: string): string | null {
  if (![computerId, notebookId, noteId].every((x) => ID.test(x))) return null;
  return `hoody --computer ${computerId} notes document get --notebook-id ${notebookId} --node-id ${noteId} --format md`;
}
