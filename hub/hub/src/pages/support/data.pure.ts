// The Support page's data minus its one browser-only hook (split out of data.ts so the terminal build shares it; the
// design notes are at the top of data.ts). data.ts re-exports every name here and keeps useCountPages (window focus,
// pageshow and visibility listeners). One core source and one unclaimed-send store: `source` is exported only for
// data.ts, never re-created.
import { alive, api, attemptFor, attemptStored, capture, coreSource, heldAttempts, holdAttempt, onAuthPurge, onBump, outcomeOf, useAttemptsVersion, useCan, type Ctx, type HeldAttempt, type HubError, type SourceTable } from '@core';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { candidateTickets, LIST_LIMIT, mergeMessages, PAGE_MAX, possibleMatch, selectClosed, selectLimits, selectList, selectThread, sendVerdict, type Limits, type Message, type SendVerdict, type Thread, type Ticket, type TicketPage, type TicketStatus } from './logic';
import { routes } from './routes';

export type ListParams = { status: TicketStatus | null; cursor: string | null; limit: number };
type GetParams = { id: string; before: number | null };

export const supportTable: SourceTable = {
  reads: {
    list: {
      route: routes.list,
      input: (p: ListParams) => ({ query: { ...(p.status ? { status: p.status } : {}), ...(p.cursor ? { cursor: p.cursor } : {}), limit: Math.min(p.limit, PAGE_MAX) } }),
      select: selectList,
    },
    get: {
      route: routes.get,
      input: (p: GetParams) => ({ params: { id: p.id }, ...(p.before !== null ? { query: { before_seq: p.before } } : {}) }),
      select: selectThread,
    },
    limits: { route: routes.limits, select: selectLimits },
  },
};
export const source = coreSource('support', supportTable);

export const invalidateSupport = () => source.invalidate(['list', 'get', 'limits']);

/** Support is the account's own: a token session sends nothing (core would refuse it unsent too). */
export const useAccount = () => useCan('account');

/** The same array object while every element is the same (a page list changes length as pages load, so it cannot be a
 *  hook's dependency list itself). */
function useSameList<T>(list: readonly T[]): readonly T[] {
  const ref = useRef(list);
  if (ref.current.length !== list.length || ref.current.some((x, i) => x !== list[i])) ref.current = list;
  return ref.current;
}

/** The list under one exact status filter (null = all), in the API's order (last update first; never sorted
 *  here): page one, then each Load more continues with the last page's cursor. A filter change starts again from
 *  page one (a cursor is bound to its filter). */
export function useTickets(status: TicketStatus | null) {
  const account = useAccount();
  const [pages, setPages] = useState<{ status: TicketStatus | null; cursors: (string | null)[]; restarts: number }>({ status, cursors: [null], restarts: 0 });
  // Every filter change drops the loaded pages and their cursors, a return to an earlier filter too: its old cursors
  // (and a later page's old error) never come back without a new Load more.
  if (pages.status !== status) setPages({ status, cursors: [null], restarts: pages.restarts });
  const cursors = pages.status === status ? pages.cursors : [null];
  const qs = source.useQueries<TicketPage, ListParams>('list', cursors.map((cursor) => ({ status, cursor, limit: LIST_LIMIT })), { enabled: account });
  const loaded = useSameList(qs.map((q) => q.data));
  // A restart reads page one afresh once the later pages are gone (their reads are not repeated): the cached page
  // one may still carry the refused cursor as its next one.
  useEffect(() => {
    if (pages.restarts > 0) void source.invalidate(['list']);
  }, [pages.restarts]);
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: Ticket[] = [];
    for (const p of loaded) {
      for (const t of p?.tickets ?? []) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        out.push(t);
      }
    }
    return out;
  }, [loaded]);
  const last = loaded[loaded.length - 1];
  const first = qs[0];
  const tail = qs[qs.length - 1];
  const error = first?.isError ? first.error : null;
  // A later page the server refused as INVALID_CURSOR. Page one sends no cursor, so only a Load more page can carry
  // this code.
  const cursorRefused = qs.some((q, i) => i > 0 && q.isError && (q.error as { code?: unknown } | null)?.code === 'INVALID_CURSOR');
  return {
    account,
    rows: first?.data ? rows : undefined,
    isPending: account && !!first?.isPending,
    error,
    /** A later page failed: the loaded rows stay, with a band and Try again. */
    partial: qs.slice(1).some((q) => q.isError),
    /** The later page's rejection, shown with the partial band's Details. */
    partialError: qs.slice(1).find((q) => q.isError)?.error ?? null,
    cursorRefused,
    dropped: loaded.reduce((n, p) => n + (p?.dropped ?? 0), 0),
    nextCursor: last?.nextCursor ?? null,
    loadingMore: qs.length > 1 && !!tail?.isPending,
    loadMore: () => {
      if (!last?.nextCursor) return;
      setPages({ status, cursors: [...cursors, last.nextCursor], restarts: pages.restarts });
    },
    /** A cursor the server no longer takes (422 INVALID_CURSOR): start again from page one, read afresh. */
    restart: () => setPages({ status, cursors: [null], restarts: pages.restarts + 1 }),
    refetch: () => void source.invalidate(['list']),
    /** The partial band's Try again: a refused cursor starts again from page one (reading it again cannot help). */
    retryPartial: () => (cursorRefused ? setPages({ status, cursors: [null], restarts: pages.restarts + 1 }) : void source.invalidate(['list'])),
  };
}

/** One ticket's thread: the latest page (which marks it read on the server), plus each older page asked for. Each
 *  latest-page answer re-reads the list, so its unread mark and the nav count follow the read. */
export function useThread(id: string | undefined) {
  const account = useAccount();
  const [older, setOlder] = useState<{ id: string | undefined; before: number[] }>({ id, before: [] });
  const before = older.id === id ? older.before : [];
  const params: GetParams[] = id ? [{ id, before: null }, ...before.map((b) => ({ id, before: b }))] : [];
  const qs = source.useQueries<Thread, GetParams>('get', params, { enabled: account && !!id });
  const latest = qs[0];
  const tail = qs.length > 1 ? qs[qs.length - 1] : undefined;
  const pages = qs.map((q) => q.data);
  const samePages = useSameList(pages);
  const messages = useMemo(() => samePages.reduce<Message[]>((all, p) => (p ? mergeMessages(all, p.messages) : all), []), [samePages]);
  const oldest = pages[pages.length - 1];
  const readAt = latest?.isSuccess ? latest.dataUpdatedAt : 0;
  useEffect(() => {
    if (readAt) void source.invalidate(['list']);
  }, [readAt]);
  // The latest page moved past the first older boundary (many new messages since Show older): the pages no longer
  // meet, so start again from the latest page rather than show a gap.
  const latestFirst = latest?.data?.messages.reduce((m, x) => Math.min(m, x.seq), Infinity) ?? Infinity;
  const gap = before.length > 0 && latestFirst !== Infinity && latestFirst > (before[0] ?? Infinity);
  useEffect(() => {
    if (gap) setOlder({ id, before: [] });
  }, [gap, id]);
  return {
    ticket: latest?.data?.ticket,
    messages,
    hasOlder: (oldest ?? latest?.data)?.hasOlder ?? false,
    isPending: !!latest?.isPending,
    error: latest?.isError ? latest.error : null,
    /** The last Show older read failed: its band offers Try again, which reads that same page again. */
    olderError: tail?.isError ? tail.error : null,
    loadingOlder: !!tail && (tail.isPending || tail.isFetching),
    showOlder: () => {
      if (tail?.isError) {
        void tail.refetch();
        return;
      }
      const first = messages[0];
      if (!id || !first || before.includes(first.seq)) return;
      setOlder({ id, before: [...before, first.seq] });
    },
    refetch: () => latest?.refetch(),
  };
}

export function useLimits(enabled = true) {
  const account = useAccount();
  return source.useQuery<Limits, void>('limits', undefined, { enabled: account && enabled });
}

// ---- Writes ----

/** The attempts' locks: one new ticket at a time per account, one reply and one close at a time per ticket. */
export const CREATE_LOCK = 'support:create';
export const replyLock = (ticket: string) => `support:reply:${ticket}`;
export const closeLock = (ticket: string) => `support:close:${ticket}`;
export const BY_CREATE = 'support:create';
export const BY_REPLY = 'support:reply';
export const BY_CLOSE = 'support:close';

/** What an attempt holds outside the stored record: the exact text sent. Lost on reload, never stored. */
export interface Draft {
  readonly subject?: string;
  readonly category?: string;
  readonly body: string;
}
const drafts = new Map<string, Draft>();
export const draftOf = (holdId: string): Draft | undefined => drafts.get(holdId);

/** The stored hold's plain metadata: never the text. */
export interface AttemptMeta {
  readonly ticket: string | null;
  readonly category: string | null;
}
export const metaOf = (h: HeldAttempt): AttemptMeta => {
  const m = (h.meta ?? {}) as { ticket?: unknown; category?: unknown };
  return { ticket: typeof m.ticket === 'string' ? m.ticket : null, category: typeof m.category === 'string' ? m.category : null };
};

/** The attempts held now for a lock (this account's, any tab), re-read when core's holds change. */
export function useHeld(lock: string | null): readonly HeldAttempt[] {
  useAttemptsVersion();
  return lock ? heldAttempts(lock) : [];
}

export interface SendResult {
  readonly verdict: SendVerdict | 'held' | 'notSent';
  readonly code?: string;
  readonly status?: number;
  /** Retry-After of a refused send, in milliseconds. */
  readonly retryAfterMs?: number;
  /** The refusal's data (field, rule, limit…), as the server gave it. */
  readonly data?: unknown;
  readonly error?: unknown;
  readonly ticket?: Ticket;
  readonly cleaned?: boolean;
  /** The held attempt, when the answer was lost. */
  readonly hold?: string;
}

const cleanedOf = (raw: unknown): boolean => {
  const d = (raw as { data?: { cleaned?: unknown } } | null)?.data?.cleaned ?? (raw as { cleaned?: unknown } | null)?.cleaned;
  return !!d && typeof d === 'object' && Object.values(d as Record<string, unknown>).some((v) => Array.isArray(v) && v.length > 0);
};
/** A support 503 with its own code is a definite refusal, and so is a duplicate whatever core called it: its error reads failed in the banner's Details,
 *  never "may have gone through". */
const definite = (e: unknown): unknown => (e && typeof e === 'object' ? { ...(e as object), kind: 'failed', pending: false } : e);
const DEFINITE_ANSWER: readonly SendVerdict[] = ['busy', 'unavailable', 'duplicate'];

const ticketOf = (raw: unknown): Ticket | undefined => {
  const d = (raw as { data?: { ticket?: unknown } } | null)?.data?.ticket ?? (raw as { ticket?: unknown } | null)?.ticket;
  return selectClosed({ data: d }) ?? undefined;
};

/** How long a create, a reply or a close waits for its answer. Past it the outcome is unknown, as with any lost answer:
 *  the attempt stays held, and the banner offers Check again and Stop tracking. Without a bound a connection that never
 *  answers would leave the send busy, with neither, for as long as the browser keeps it open. */
const WRITE_TIMEOUT_MS = 60000;

/** One send under its held attempt. The hold is taken first; without it nothing is sent. */
async function send(lock: string, by: string, meta: AttemptMeta, draft: Draft, call: (key: string, ctx: ReturnType<typeof capture>) => Promise<unknown>): Promise<SendResult> {
  const ctx = capture();
  const at: SentAt = { lock, draft, ctx, hold: null, freed: false };
  const r = await sendOnce(lock, by, meta, draft, call, ctx, at);
  SENT_CTX.set(r, at);
  return r;
}

async function sendOnce(lock: string, by: string, meta: AttemptMeta, draft: Draft, call: (key: string, ctx: ReturnType<typeof capture>) => Promise<unknown>, ctx: Ctx, at: SentAt): Promise<SendResult> {
  const got = await holdAttempt(lock, { by, meta });
  if (!got.ok) return { verdict: got.code === 'HELD' ? 'held' : 'notSent', code: got.code };
  const hold = got.hold;
  at.hold = hold.id;
  // Whether the hold was freed while the send was out (another tab's Stop tracking): its answer then
  // belongs to no box, since the lock may have taken newer text since. Read from the stored truth (core's authority
  // read, not the display list); an unreadable store counts as freed: the answer is dropped (said nowhere),
  // never kept on a guess. The read, release() and keepAnswer run in one microtask chain, so no other tab's write
  // lands between them.
  const freedMeanwhile = () => attemptStored(hold.id, by).s !== 'ok';
  if (!alive(ctx)) {
    hold.release();
    return { verdict: 'notSent' };
  }
  drafts.set(hold.id, draft);
  try {
    const raw = await call(hold.key, ctx);
    at.freed = freedMeanwhile();
    hold.release();
    drafts.delete(hold.id);
    void invalidateSupport();
    const ticket = ticketOf(raw);
    return { verdict: 'sent', cleaned: cleanedOf(raw), ...(ticket ? { ticket } : {}) };
  } catch (e) {
    const err = e as HubError | null;
    const code = typeof err?.code === 'string' ? err.code : undefined;
    const status = typeof err?.status === 'number' ? err.status : undefined;
    const verdict = sendVerdict(outcomeOf(e, true), code);
    const ra = typeof err?.retryAfterMs === 'number' && err.retryAfterMs > 0 ? err.retryAfterMs : typeof err?.retryAfter === 'number' && err.retryAfter > 0 ? err.retryAfter * 1000 : undefined;
    const facts = { ...(code ? { code } : {}), ...(status !== undefined ? { status } : {}), ...(ra !== undefined ? { retryAfterMs: ra } : {}), data: err?.data, error: DEFINITE_ANSWER.includes(verdict) ? definite(e) : e };
    if (verdict === 'unknown') {
      hold.sent();
      void invalidateSupport();
      return { verdict, hold: hold.id, ...facts };
    }
    // A definite answer: the attempt ends, the draft unlocks. The next deliberate press is a new attempt (new key).
    at.freed = freedMeanwhile();
    hold.release();
    drafts.delete(hold.id);
    // A duplicate's earlier copy is saved: the list and the thread read it again.
    if (verdict === 'notFound' || verdict === 'closedForGood' || verdict === 'messageCap' || verdict === 'duplicate') void invalidateSupport();
    return { verdict, ...facts };
  }
}

/** A send's answer whose box or drawer was left before it came (the Thread is keyed per ticket; the palette can leave
 *  the New ticket drawer): kept, in this module's memory like the draft, for the next box or drawer of the same lock,
 *  so a definite refusal is still said and its text is still there to edit, and a created ticket still opens. One per
 *  lock, under the send's own context: another account or realm, a sign-out or a reset never shows it (`alive`), every
 *  entry is dropped at the bump or purge that ends its context, and an answer that comes after that end is never kept.
 *  Never kept: a lost answer ('unknown': its hold is the stored record, and
 *  the banner reads it), nothing sent ('held', 'notSent': no answer came, no text was taken), and an answer whose hold
 *  was freed while it was out (another tab's Stop tracking: the lock may hold newer text since). */
export interface Unclaimed {
  readonly result: SendResult;
  readonly draft: Draft;
  /** The send's hold: a created ticket opens only in a drawer that showed this hold (NewTicket); a box that shows any
   *  other hold of the lock drops the answer unsettled (a newer send, perhaps another tab's, holds the lock now). */
  readonly hold: string;
  /** When the answer came (Date.now()): a busy refusal's wait counts from here, not from when a box takes it. */
  readonly at: number;
}
interface SentAt {
  readonly lock: string;
  readonly draft: Draft;
  readonly ctx: Ctx;
  hold: string | null;
  freed: boolean;
}
const unclaimed = new Map<string, Unclaimed & { readonly ctx: Ctx }>();
const unclaimedListeners = new Set<() => void>();
let unclaimedVersion = 0;
const unclaimedChanged = () => {
  unclaimedVersion++;
  for (const l of unclaimedListeners) l();
};
const SENT_CTX = new WeakMap<SendResult, SentAt>();
/** At most this many kept answers, one per lock. A still-wanted answer is never pushed out:
 *  past the cap, one of an ended context goes first (the oldest); with none, the new answer is not kept. */
const UNCLAIMED_MAX = 8;
/** Room for a kept answer of `lock`, given the kept answers oldest first (`alive`: its context still shown): drop the
 *  named lock's entry (`drop`: its own older answer, or the oldest of an ended context past the cap) and keep the new
 *  one, or `null`: the cap is full of answers still wanted, so the new one is not kept. */
export function roomFor(entries: readonly (readonly [lock: string, alive: boolean])[], lock: string, max: number): { readonly drop: string | null } | null {
  if (entries.some(([l]) => l === lock)) return { drop: lock };
  if (entries.length < max) return { drop: null };
  const dead = entries.find(([, a]) => !a);
  return dead ? { drop: dead[0] } : null;
}
// Any bump (a switch of account or realm, a fallback, an end) ends every context a kept answer was kept under, and a
// sign-out purges: drop them all then, whether or not a support page is mounted.
const clearUnclaimed = () => {
  if (unclaimed.size === 0) return;
  unclaimed.clear();
  unclaimedChanged();
};
onBump(clearUnclaimed);
onAuthPurge(clearUnclaimed);

/** Keep a send's answer for the next box of its lock: called by the box that sent it when it was left before the answer. */
export function keepAnswer(result: SendResult): void {
  const at = SENT_CTX.get(result);
  if (!at?.hold || at.freed || !alive(at.ctx) || result.verdict === 'unknown' || result.verdict === 'held' || result.verdict === 'notSent') return;
  const room = roomFor([...unclaimed].map(([l, e]) => [l, alive(e.ctx)] as const), at.lock, UNCLAIMED_MAX);
  if (!room) return;
  if (room.drop !== null) unclaimed.delete(room.drop);
  unclaimed.set(at.lock, { result, draft: at.draft, ctx: at.ctx, hold: at.hold, at: Date.now() });
  unclaimedChanged();
}

/** The kept answer of a lock (read in render, re-read when one is kept or taken), and taking it: the box takes it in an
 *  effect, and settles it only when `take` says it was this very entry (once, whatever re-runs the effect). One of
 *  another context is never shown. */
export function useUnclaimed(lock: string | null): { readonly kept: Unclaimed | null; readonly take: (e: Unclaimed) => boolean } {
  const sub = useCallback((l: () => void) => {
    unclaimedListeners.add(l);
    return () => void unclaimedListeners.delete(l);
  }, []);
  const v = () => unclaimedVersion;
  useSyncExternalStore(sub, v, v);
  const e = lock ? unclaimed.get(lock) : undefined;
  const kept = e && alive(e.ctx) ? e : null;
  const take = useCallback(
    (want: Unclaimed) => {
      if (!lock || unclaimed.get(lock) !== want) return false;
      unclaimed.delete(lock);
      unclaimedChanged();
      return true;
    },
    [lock],
  );
  return { kept, take };
}

/** Tests only: the locks with a kept answer, oldest first (one of a dead context is hidden by `alive`, so only this
 *  shows it). */
export function unclaimedLocksForTests(): string[] {
  return [...unclaimed.keys()];
}

/** Tests only. */
export function resetUnclaimedForTests(): void {
  unclaimed.clear();
  unclaimedChanged();
}

export function sendCreate(v: { category: string; subject: string; body: string }): Promise<SendResult> {
  return send(CREATE_LOCK, BY_CREATE, { ticket: null, category: v.category }, v, (key, ctx) =>
    api(routes.create, { body: { subject: v.subject, category: v.category, body: v.body, client_key: key } as never, ctx, recovers: true, timeoutMs: WRITE_TIMEOUT_MS }));
}

export function sendReply(ticket: string, body: string): Promise<SendResult> {
  return send(replyLock(ticket), BY_REPLY, { ticket, category: null }, { body }, (key, ctx) =>
    api(routes.reply, { params: { id: ticket }, body: { body, client_key: key } as never, ctx, recovers: true, timeoutMs: WRITE_TIMEOUT_MS }));
}

/** The person's warned Stop tracking: the attempt is forgotten and its draft unlocks. */
export function stopTracking(h: HeldAttempt): boolean {
  const handle = attemptFor(h.id, h.by);
  if (!handle) return false;
  const ok = handle.dismiss(true);
  if (ok) drafts.delete(h.id);
  return ok;
}

export type CloseResult =
  | { outcome: 'done'; ticket: Ticket | null }
  | { outcome: 'pending' | 'failed' | 'not_sent' | 'stale'; code?: string; verdict?: SendVerdict; retryAfterMs?: number; error: unknown };

/** Close one ticket under its held attempt: while a close of it may have gone through (this tab, a reload, another
 *  tab), no second close is sent (HELD, not sent). */
export async function closeTicket(id: string): Promise<CloseResult> {
  const ctx = capture();
  const got = await holdAttempt(closeLock(id), { by: BY_CLOSE, meta: { ticket: id, category: null } });
  if (!got.ok) return { outcome: 'not_sent', code: got.code, error: { kind: 'not_sent', notSent: true, code: got.code } };
  const hold = got.hold;
  if (!alive(ctx)) {
    hold.release();
    return { outcome: 'not_sent', error: { kind: 'not_sent', notSent: true } };
  }
  try {
    const raw = await api(routes.close, { params: { id }, ctx, recovers: true, timeoutMs: WRITE_TIMEOUT_MS });
    hold.release();
    void invalidateSupport();
    return { outcome: 'done', ticket: selectClosed(raw) };
  } catch (e) {
    const err = e as HubError | null;
    const code = typeof err?.code === 'string' ? err.code : undefined;
    const ra = typeof err?.retryAfterMs === 'number' && err.retryAfterMs > 0 ? err.retryAfterMs : typeof err?.retryAfter === 'number' && err.retryAfter > 0 ? err.retryAfter * 1000 : undefined;
    const facts = { ...(code ? { code } : {}), ...(ra !== undefined ? { retryAfterMs: ra } : {}) };
    // A 503 with one of support's own codes is a definite refusal; any other 5xx or a lost answer may have
    // closed it: the hold stays.
    const verdict = sendVerdict(outcomeOf(e, true), code);
    if (verdict === 'unknown') {
      hold.sent();
      void invalidateSupport();
      return { outcome: 'pending', verdict, ...facts, error: e };
    }
    hold.release();
    if (DEFINITE_ANSWER.includes(verdict)) return { outcome: 'failed', verdict, ...facts, error: definite(e) };
    return { outcome: outcomeOf(e, true), verdict, ...facts, error: e };
  }
}

/** A lost close: the ticket read again. A closed status settles it (the hold is freed: the close it held is no
 *  longer needed); open, or a read that failed, keeps it. */
export async function closeLanded(h: HeldAttempt): Promise<boolean | null> {
  const id = metaOf(h).ticket;
  if (!id) return null;
  try {
    const t = selectThread(await api(routes.get, { params: { id }, query: { limit: 1 }, ctx: capture() }));
    void invalidateSupport();
    if (t.ticket.status !== 'closed') return false;
    attemptFor(h.id, BY_CLOSE)?.release();
    return true;
  } catch {
    return null;
  }
}

/** Check again's reads (never a write): the latest page of the ticket, or the first unfiltered list page. */
export async function readThreadLatest(id: string): Promise<Thread | null> {
  try {
    const t = selectThread(await api(routes.get, { params: { id }, ctx: capture() }));
    void invalidateSupport();
    return t;
  } catch {
    return null;
  }
}
export async function readListFirst(): Promise<TicketPage | null> {
  try {
    const page = selectList(await api(routes.list, { query: { limit: LIST_LIMIT }, ctx: capture() }));
    void invalidateSupport();
    return page;
  } catch {
    return null;
  }
}

/** What Check again found: a possible match (a hint, never a settlement), nothing, or a read that failed. */
export type CheckHint =
  | { readonly kind: 'match'; readonly at: string; readonly ticket: string; readonly checkedAt: number }
  | { readonly kind: 'none'; readonly checkedAt: number }
  | { readonly kind: 'noDraft'; readonly checkedAt: number }
  | { readonly kind: 'failed'; readonly checkedAt: number };

/** Check again for one held attempt: reads only, sends nothing, frees nothing. */
export async function checkAgain(h: HeldAttempt, now: () => number = Date.now): Promise<CheckHint> {
  const meta = metaOf(h);
  const draft = draftOf(h.id);
  if (meta.ticket) {
    const thread = await readThreadLatest(meta.ticket);
    if (!thread) return { kind: 'failed', checkedAt: now() };
    if (!draft) return { kind: 'noDraft', checkedAt: now() };
    const m = possibleMatch(thread.messages, draft.body, h.startedAt);
    return m ? { kind: 'match', at: m.createdAt, ticket: meta.ticket, checkedAt: now() } : { kind: 'none', checkedAt: now() };
  }
  const page = await readListFirst();
  if (!page) return { kind: 'failed', checkedAt: now() };
  if (!draft || draft.subject === undefined || draft.category === undefined) return { kind: 'noDraft', checkedAt: now() };
  for (const t of candidateTickets(page.tickets, draft.category, draft.subject, h.startedAt)) {
    const thread = await readThreadLatest(t.id);
    if (!thread) return { kind: 'failed', checkedAt: now() };
    const m = possibleMatch(thread.messages, draft.body, h.startedAt);
    if (m) return { kind: 'match', at: m.createdAt, ticket: t.id, checkedAt: now() };
  }
  return { kind: 'none', checkedAt: now() };
}
