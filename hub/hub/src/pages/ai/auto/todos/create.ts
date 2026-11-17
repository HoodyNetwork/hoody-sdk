// Making a TODO by hand (POST /todos, the agent's createTodo), in the realm shown, under the context the drawer
// opened in. Pure parts (the form, its limits, the body, a lost answer's look-alikes) and the one store that sends it.
//   - The limits are the agent's, read from its code: the title is cut at 200 runes and the
//     details at 1024; tags are trimmed, a leading '#' dropped, empty and repeated
//     ones dropped, each cut at 40 runes and at most 12 kept; priority is a whole number 0..4;
//     an empty folder is refused. The
//     agent cuts silently; this form refuses what it would cut, so what is saved is what the person wrote. Stricter than the
//     agent: a title is required (the agent makes one from the details when it is blank), and the
//     folder must be absolute (New chat's folderOk; the agent checks only that it is not empty, but a relative one names no
//     place on the computer).
//   - createTodo is not keyed and never sent again. A filing equal to an open TODO of the same title, folder, computer, realm
//     and body is not filed: the agent answers that TODO with deduped true.
//   - Its answer lost, the store never sends again. Check again reads the realm's open TODOs and lists those with the same
//     title, details and folder made since the send ("may be yours"), saying how many; the person picks one or stops
//     tracking it. A lost filing that was deduped made nothing new, so no look-alike shows (it stays unknown until dismissed).
import { alive, api, capture, defineRoute, errorInfo, onBump, outcomeOf, stringOrEmpty as str, type CallInput, type Ctx, type Route } from '@core';
import { folderOk } from '../../new/logic';

export const createRoute = defineRoute({ method: 'POST', path: '/todos', scope: 'agent', realm: 'realm', body: ['title', 'body', 'priority', 'tags', 'cwd'] });
/** The realm's open TODOs (a lost filing's check). */
export const openRoute = defineRoute({ method: 'GET', path: '/todos', scope: 'agent', realm: 'realm', query: ['open_only'] });

/** The agent's limits (see the head of this file for where each is read). */
export const TITLE_MAX = 200;
export const BODY_MAX = 1024;
export const TAGS_MAX = 12;
export const TAG_MAX = 40;
export const PRIORITIES = [0, 1, 2, 3, 4] as const;
export const DEFAULT_PRIORITY = 2;

/** Runes, as the agent counts them (Go's utf8: one per code point). */
export const runes = (s: string): number => Array.from(s).length;

export interface TodoDraft {
  title: string;
  details: string;
  priority: number;
  /** Comma-separated, as typed. */
  tags: string;
  /** An absolute folder on the computer. */
  cwd: string;
}

/** The tags as the agent keeps them: trimmed, leading '#' dropped, empty and repeated ones dropped. Not cut: tagProblem
 *  refuses a tag or a count the agent would cut. */
export function tagsOf(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const t = raw.trim().replace(/^#+/, '').trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export type DraftProblem = 'title' | 'titleLong' | 'detailsLong' | 'tagsMany' | 'tagLong' | 'priority' | 'cwd';

/** Everything the form would refuse, in field order (none: it can be sent). */
export function problemsOf(d: TodoDraft): DraftProblem[] {
  const out: DraftProblem[] = [];
  if (d.title.trim() === '') out.push('title');
  else if (runes(d.title.trim()) > TITLE_MAX) out.push('titleLong');
  if (runes(d.details.trim()) > BODY_MAX) out.push('detailsLong');
  if (!(PRIORITIES as readonly number[]).includes(d.priority)) out.push('priority');
  const tags = tagsOf(d.tags);
  if (tags.length > TAGS_MAX) out.push('tagsMany');
  if (tags.some((t) => runes(t) > TAG_MAX)) out.push('tagLong');
  if (!folderOk(d.cwd)) out.push('cwd');
  return out;
}

export interface NewTodoBody {
  title: string;
  body?: string;
  priority: number;
  tags?: string[];
  cwd: string;
}

/** The request body for a draft with no problem; null otherwise. */
export function bodyOf(d: TodoDraft): NewTodoBody | null {
  if (problemsOf(d).length > 0) return null;
  const details = d.details.trim();
  const tags = tagsOf(d.tags);
  return { title: d.title.trim(), ...(details ? { body: details } : {}), priority: d.priority, ...(tags.length ? { tags } : {}), cwd: d.cwd };
}

export const EMPTY_TODO: TodoDraft = { title: '', details: '', priority: DEFAULT_PRIORITY, tags: '', cwd: '' };

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Rec) : null);

export interface Refusal {
  kind: 'pending' | 'failed' | 'not_sent' | 'stale';
  code: string;
  status: number;
  error?: unknown;
}
export type Settled = { ok: true; body: unknown } | { ok: false; err: Refusal };

export function refusalOf(e: unknown, change: boolean): Refusal {
  const x = rec(e) ?? {};
  return { kind: outcomeOf(e, change), code: (errorInfo(e).code ?? '').toLowerCase(), status: typeof x.status === 'number' ? x.status : 0, error: e };
}

async function call(route: Route, input: CallInput, change: boolean): Promise<Settled> {
  try {
    return { ok: true, body: (await api(route, input)) ?? {} };
  } catch (e) {
    return { ok: false, err: refusalOf(e, change) };
  }
}

/** A TODO a lost filing may have made: its id, number and when it was made. */
export interface Lookalike {
  id: string;
  num: number;
  createdAt: string;
}

export interface CreateApi {
  /** The realm's open TODOs; a failed or malformed read is not ok (never "none"). */
  list(): Promise<{ ok: true; items: Rec[] } | { ok: false }>;
  create(body: NewTodoBody): Promise<Settled>;
}

/** The calls in `realm` under `ctx` (the context the drawer opened in). */
export function createApi(realm: string, ctx: Ctx): CreateApi {
  const at = (input: CallInput): CallInput => ({ ...input, ctx, recovers: true, ...(realm ? { realm } : {}) });
  return {
    list: async () => {
      const r = await call(openRoute as Route, at({ query: { open_only: true } }), false);
      const b = rec(r.ok ? r.body : null);
      if (!b || !Array.isArray(b.items)) return { ok: false };
      const items: Rec[] = [];
      for (const x of b.items) {
        const t = rec(x);
        if (!t || !str(t.id)) return { ok: false };
        items.push(t);
      }
      return { ok: true, items };
    },
    create: (body) => call(createRoute as Route, at({ body } as CallInput), true),
  };
}

/** Skew allowed between this browser's clock and the agent's. */
export const SKEW_MS = 120_000;

/** Go's unicode.IsSpace (strings.Fields): the agent's whitespace, never JS \\s (which also takes U+FEFF). */
const GO_FIELDS = /[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/;
const fields = (s: string): string => s.split(GO_FIELDS).filter(Boolean).join(' ');

/** Go's strings.ToLower: each code point on its own, one code point out. JS lowercases the whole string with
 *  context and special casing: a final sigma becomes ς and İ becomes i plus a combining dot, where Go gives σ and i. */
const goLower = (s: string): string => Array.from(s, (c) => String.fromCodePoint(c.toLowerCase().codePointAt(0) ?? 0)).join('');

/** The agent's filing identity in one place: the title lowercased as
 *  Go does with whitespace runs as one space, the folder as sent, the body with whitespace runs as one space. Priority and tags
 *  are not part of it: a filing that differs only there is deduped onto the first one, unchanged. Computer and realm are the
 *  place's. */
export function identityOf(b: { title: string; body?: string; cwd: string }): string {
  return `${fields(goLower(b.title))}\u0000${b.cwd}\u0000${fields(b.body ?? '')}`;
}

/** The open TODOs a lost filing may have made: the same filing identity, made around the send or after it. Newest first. */
export function lookalikes(items: readonly Rec[], sent: NewTodoBody, sentAt: number): Lookalike[] {
  const want = identityOf(sent);
  return items
    .filter((t) => identityOf({ title: str(t.title), body: str(t.body), cwd: str(t.cwd) }) === want
      && (Date.parse(str(t.created_at)) || 0) >= sentAt - SKEW_MS)
    .map((t) => ({ id: str(t.id), num: typeof t.num === 'number' ? t.num : 0, createdAt: str(t.created_at) }))
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

export type Phase = 'idle' | 'running' | 'done' | 'refused' | 'unsure';
export interface CreateView {
  phase: Phase;
  refusal: Refusal | null;
  /** Done: the TODO the answer names (or the one the person picked), and whether it was an open one already (deduped). */
  todo: { id: string; num: number } | null;
  deduped: boolean;
  /** Done from the person's pick of a look-alike, not from an answer. */
  picked: boolean;
  reading: boolean;
  /** After a check: what the read saw ('failed': it could not be read). */
  observed: 'read' | 'failed' | null;
  lookalikes: Lookalike[];
}
const IDLE: CreateView = { phase: 'idle', refusal: null, todo: null, deduped: false, picked: false, reading: false, observed: null, lookalikes: [] };

/** A filing this tab sent whose outcome is not known: still out, its answer lost ('unsure'), or lost and no longer tracked
 *  ('forgotten'). Kept per place (account, realm, computer) for the tab's life, outside any store or drawer: a
 *  closed drawer, a realm switch (a new context, so a new store) or a remount never makes it sendable again. Only a definite
 *  answer or the person's pick removes it; forgotten ones are never dropped (one per lost answer the person
 *  stopped tracking, so the ledger grows only with what the person does). */
interface Lost {
  readonly body: NewTodoBody;
  readonly sentAt: number;
  state: 'out' | 'unsure' | 'forgotten';
}
/** What happened to a lost filing, told to every store tracking it: its answer, or the person's pick or Stop
 *  tracking in any drawer. */
type Answer =
  | { kind: 'done'; todo: { id: string; num: number }; deduped: boolean; picked?: true }
  | { kind: 'refused'; refusal: Refusal }
  | { kind: 'unsure' }
  | { kind: 'forgotten' };
const LEDGER = new Map<string, Lost[]>();
/** The stores tracking a filing, by filing, each with the context it was made in; a store is here only while it tracks one and
 *  its context lives (an ended one goes when its context ends, not at the next answer). */
const TRACKERS = new Map<Lost, Map<(a: Answer) => void, Ctx>>();
/** Drops every tracker whose context ended; the ledger keeps the filing (its guard and its unsure state stay). */
function dropEndedTrackers(): void {
  for (const [lost, t] of TRACKERS) {
    for (const [f, c] of t) if (!alive(c)) t.delete(f);
    if (t.size === 0) TRACKERS.delete(lost);
  }
}
// A realm or account switch (a bump) ends every context made before it; a store useKept replaced is never told again.
onBump(() => dropEndedTrackers());

/** The place a filing belongs to: the account, the realm and the computer it was sent under. */
export const placeOf = (ctx: Ctx, realm: string): string => `${ctx.account}\n${realm}\n${ctx.target?.container.id ?? ''}`;

function ledgerOf(place: string): Lost[] {
  let l = LEDGER.get(place);
  if (!l) LEDGER.set(place, (l = []));
  return l;
}
/** Records what happened to a lost filing and tells its trackers. An unsure answer never undoes Stop tracking;
 *  a definite answer or a pick removes it, and an empty place goes. */
function settle(place: string, lost: Lost, a: Answer): void {
  if (a.kind === 'unsure') {
    if (lost.state === 'out') lost.state = 'unsure';
  } else if (a.kind === 'forgotten') {
    lost.state = 'forgotten';
  } else {
    const l = LEDGER.get(place);
    if (l?.includes(lost)) l.splice(l.indexOf(lost), 1);
    if (l?.length === 0) LEDGER.delete(place);
  }
  for (const f of [...(TRACKERS.get(lost)?.keys() ?? [])]) f(a);
}

/** Tests only. */
export function resetLedgerForTests(): void {
  LEDGER.clear();
  TRACKERS.clear();
}

/** Tests only: places with a ledger and filings with a tracker (both go when nothing is left in them). */
export function ledgerSizesForTests(): { places: number; trackers: number } {
  return { places: LEDGER.size, trackers: [...TRACKERS.values()].reduce((n, t) => n + t.size, 0) };
}

export interface CreateStore {
  readonly ctx: Ctx;
  view(): CreateView;
  subscribe(fn: () => void): () => void;
  /** Sends the filing once; refused while one is out or unsure. */
  send(body: NewTodoBody): Promise<void>;
  /** A lost answer: reads the realm's open TODOs and lists the look-alikes. Sends nothing. */
  check(): Promise<void>;
  /** A lost answer: the person says this look-alike is theirs. */
  pick(id: string): void;
  /** The person stops tracking a lost filing: nothing is sent, nothing is claimed. The filing may still arrive, so a filing
   *  of the same identity is never sent again from this tab (mayBeFiled); a changed title, details or folder is a new TODO. */
  forget(): void;
  /** A filing of the same identity (identityOf) in this place is out, unsure or forgotten: sending it is refused. */
  mayBeFiled(body: NewTodoBody): boolean;
  /** Back to idle after a refusal (the words are the form's). */
  clear(): void;
  holds(): boolean;
}

export function createTodoStore(o: { api: CreateApi; ctx?: Ctx; now?: () => number; place?: string }): CreateStore {
  const ctx = o.ctx ?? capture();
  const now = o.now ?? Date.now;
  const place = o.place ?? placeOf(ctx, ctx.realm);
  // A filing of this place still out or unsure (sent from an earlier store: a closed drawer, a context since switched) is this
  // store's to track: it opens unsure, and its answer, when it comes to the store that sent it, comes here too.
  let mine: Lost | null = null;
  let v: CreateView = IDLE;
  let gen = 0;
  const subs = new Set<() => void>();
  const set = (p: Partial<CreateView>) => {
    v = { ...v, ...p };
    for (const f of [...subs]) f();
  };
  const busy = () => v.phase === 'running' || v.phase === 'unsure';
  const taken = (body: NewTodoBody) => (LEDGER.get(place) ?? []).some((x) => identityOf(x.body) === identityOf(body));
  const heard = (a: Answer) => {
    // A store whose context ended is replaced (useKept): it stops tracking and the live one shows the answer.
    if (!alive(ctx)) return untrack();
    gen++;
    if (a.kind === 'unsure') {
      if (v.phase === 'running') set({ phase: 'unsure' });
      return;
    }
    untrack();
    if (a.kind === 'done') set({ ...IDLE, phase: 'done', todo: a.todo, deduped: a.deduped, picked: a.picked === true });
    else if (a.kind === 'refused') set({ ...IDLE, phase: 'refused', refusal: a.refusal });
    else set(IDLE);
  };
  const track = (lost: Lost) => {
    mine = lost;
    let t = TRACKERS.get(lost);
    if (!t) TRACKERS.set(lost, (t = new Map()));
    t.set(heard, ctx);
  };
  function untrack(): void {
    if (!mine) return;
    const t = TRACKERS.get(mine);
    t?.delete(heard);
    if (t?.size === 0) TRACKERS.delete(mine);
    mine = null;
  }
  const open = (LEDGER.get(place) ?? []).find((x) => x.state !== 'forgotten');
  if (open) {
    track(open);
    v = { ...IDLE, phase: 'unsure' };
  }
  return {
    ctx,
    view: () => v,
    subscribe: (fn) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    holds: () => busy(),
    mayBeFiled: (body) => taken(body),
    send: async (body) => {
      if (busy() || v.phase === 'done' || taken(body)) return;
      const lost: Lost = { body, sentAt: now(), state: 'out' };
      ledgerOf(place).push(lost);
      track(lost);
      set({ ...IDLE, phase: 'running' });
      const r = await o.api.create(body);
      if (!r.ok) {
        if (r.err.kind === 'pending') {
          set({ refusal: r.err });
          return settle(place, lost, { kind: 'unsure' });
        }
        return settle(place, lost, { kind: 'refused', refusal: r.err });
      }
      const t = rec(rec(r.body)?.todo);
      const id = str(t?.id);
      // A 2xx that names no TODO may have filed one: checked like a lost answer.
      if (!t || !id) return settle(place, lost, { kind: 'unsure' });
      settle(place, lost, { kind: 'done', todo: { id, num: typeof t.num === 'number' ? t.num : 0 }, deduped: rec(r.body)?.deduped === true });
    },
    check: async () => {
      const lost = mine;
      if (v.phase !== 'unsure' || v.reading || !alive(ctx) || !lost) return;
      const g = gen;
      set({ reading: true });
      const r = await o.api.list();
      if (g !== gen) return;
      if (!r.ok) return set({ reading: false, observed: 'failed', lookalikes: [] });
      set({ reading: false, observed: 'read', lookalikes: lookalikes(r.items, lost.body, lost.sentAt) });
    },
    pick: (id) => {
      const l = v.lookalikes.find((x) => x.id === id);
      if (v.phase !== 'unsure' || v.reading || !l || !mine) return;
      // Every store tracking it (this one included) shows it done and stops tracking.
      settle(place, mine, { kind: 'done', todo: { id: l.id, num: l.num }, deduped: false, picked: true });
    },
    forget: () => {
      if (v.phase !== 'unsure' || !mine) return;
      // Still possibly filed: kept, so the same filing is never sent again from this tab; every tracker goes idle.
      settle(place, mine, { kind: 'forgotten' });
    },
    clear: () => {
      if (v.phase === 'refused') set(IDLE);
    },
  };
}
