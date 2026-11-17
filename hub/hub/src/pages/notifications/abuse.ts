// Abuse notices: the owner routes of the API, the two
// reads and the reply. Every route is the account's own on the base host (a realm host refuses them): scope 'base' in every realm
// view. A token session reads nothing here (useCan('account')): the reply refuses tokens, and a realm-pinned token's
// reads would go to a realm host that refuses them.
//
// The reply carries no idempotency key, so it is held in core's attempts (core/attempts.ts) BEFORE it leaves: the hold
// is stored, survives closing the drawer, navigation and a reload, and belongs to the account shown when it was taken
// (another account neither sees it nor frees it). While a reply of a notice is held, nothing of that notice is sent
// again. A definite answer frees it (sent, or a refusal). A lost answer or a 5xx keeps it: the section says "This may
// have gone through", Check again re-reads the notice and settles nothing (a reply has no key, so matching text is no
// proof), and the warned Stop tracking frees only the hold that was shown. The draft text stays in this module's memory,
// never in the stored hold.
import { alive, api, attemptFor, capture, coreSource, useCore, defineQuery, defineRoute, heldAttempts, holdAttempt, outcomeOf, useAttemptsVersion, useCan, type AttemptHold, type HeldAttempt, type HubError } from '@core';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { parseNoticeDetail, parseNoticeList, parseReplyAnswer, type AbuseNotice, type AbuseNoticeDetail, type AbuseNoticePage } from './abuseLogic';

const READ_CODES = ['ABUSE_NOTICE_FIELD_INVALID', 'ABUSE_NOTICE_NOT_FOUND', 'INSUFFICIENT_PERMISSIONS', 'RATE_LIMIT_EXCEEDED'] as const;

export const abuseRoutes = {
  list: defineRoute({ method: 'GET', path: '/abuse-notices', scope: 'base', query: ['page', 'limit'], codes: [...READ_CODES] }),
  get: defineRoute({ method: 'GET', path: '/abuse-notices/:id', scope: 'base', codes: [...READ_CODES] }),
  /** 201 {message}. JWT only (a token, Basic or impersonation is refused 403). */
  reply: defineRoute({
    method: 'POST',
    path: '/abuse-notices/:id/messages',
    scope: 'base',
    body: ['body'],
    codes: ['ABUSE_NOTICE_FIELD_INVALID', 'ABUSE_NOTICE_TEXT_INVALID', 'ABUSE_NOTICE_NOT_FOUND', 'ABUSE_NOTICE_RESOLVED', 'ABUSE_NOTICE_REPLY_LIMIT', 'INSUFFICIENT_PERMISSIONS', 'RATE_LIMIT_EXCEEDED'],
  }),
} as const;

/** One page of the list (the API's limit cap). */
export const LIST_LIMIT = 100;
/** The pages the list reads at most: the newest MAX_PAGES × LIST_LIMIT notices. */
export const MAX_PAGES = 10;

class Malformed extends Error {
  readonly code = 'MALFORMED_ANSWER';
}
const orThrow = <T>(v: T | null): T => {
  if (v === null) throw new Malformed('The answer did not have the expected shape.');
  return v;
};

// The list, one read per page (page 1, 2, ...): a malformed page throws, which reads as a failed page.
const listSource = coreSource('notifications-abuse', {
  reads: { list: { route: abuseRoutes.list, input: (page: number) => ({ query: { page, limit: LIST_LIMIT } }), select: (r: unknown) => orThrow(parseNoticeList(r)) } },
});
const pagesUpTo = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);
const getQ = defineQuery<unknown, AbuseNoticeDetail, string>(abuseRoutes.get, {
  input: (id) => ({ params: { id } }),
  select: (r) => r as AbuseNoticeDetail,
});

/** Notices are the account's own: nothing is read in a token session. */
export const useAbuseAccount = () => useCan('account');

/** The whole list as read: every page up to MAX_PAGES. `capped`: the last page read still had more. */
export interface NoticeList {
  readonly rows: readonly AbuseNotice[];
  readonly total: number;
  readonly capped: boolean;
}

/** The account's notices, newest first (the API's order): page 1, then each next page while the last one says more,
 *  up to MAX_PAGES, so the page's search, filter and sort see every notice. A page that fails or is malformed fails the
 *  whole list (never a silently short list); until the last page is in, the list is loading. */
export function useAbuseNotices() {
  const enabled = useAbuseAccount();
  const [want, setWant] = useState(1);
  const qs = listSource.useQueries<AbuseNoticePage, number>('list', pagesUpTo(want), { enabled });
  // A failed page fails the list; the pages read so far are a stable array while every page is the same object.
  const failed = qs.find((q) => q.isError);
  const loaded = useSame(qs.map((q) => q.data));
  const walk = useMemo(() => {
    const rows: AbuseNotice[] = [];
    const seen = new Set<string>();
    let total = 0;
    for (const [i, p] of loaded.entries()) {
      if (!p) return { kind: 'loading' as const };
      // A notice pushed onto the next page by a newer one between two reads shows once.
      for (const n of p.rows) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        rows.push(n);
      }
      total = Math.max(total, p.total);
      if (!p.more) return { kind: 'done' as const, list: { rows, total, capped: false } };
      if (i + 1 >= MAX_PAGES) return { kind: 'done' as const, list: { rows, total, capped: true } };
    }
    return { kind: 'next' as const };
  }, [loaded]);
  const next = !failed && walk.kind === 'next';
  // Keyed on `want` too: a next page already cached answers at once, and the walk goes on.
  useEffect(() => {
    if (next) setWant((w) => Math.min(MAX_PAGES, w + 1));
  }, [next, want]);
  return {
    data: !failed && walk.kind === 'done' ? walk.list : undefined,
    isPending: enabled && !failed && walk.kind !== 'done',
    error: failed?.error ?? null,
    refetch: () => listSource.invalidate(['list']),
  };
}

/** The same array object while every element is the same. */
function useSame<T>(list: readonly T[]): readonly T[] {
  const ref = useRef(list);
  if (ref.current.length !== list.length || ref.current.some((x, i) => x !== list[i])) ref.current = list;
  return ref.current;
}

/** One notice with its messages; parsed against the id asked for. */
export function useAbuseNotice(id: string | undefined) {
  const enabled = useAbuseAccount() && !!id;
  const q = getQ.use(id ?? '', { enabled });
  const raw = q.data as unknown;
  const parsed = raw === undefined || !id ? undefined : parseNoticeDetail(raw, id);
  return {
    data: parsed ?? undefined,
    malformed: parsed === null,
    isPending: enabled && q.isPending,
    error: q.error,
    refetch: q.refetch,
  };
}

const invalidate = () => Promise.all([listSource.invalidate(['list']), getQ.invalidate()]);

// ---- the reply ----

/** One reply at a time per notice, per account (core's attempts are filed per account). */
export const replyLock = (notice: string) => `abuse-notice:reply:${notice}`;
export const BY_REPLY = 'notifications:abuse-reply';

const drafts = new Map<string, string>();
/** The text a held reply was sent with, while this tab still has it (a reload loses it; the hold stays). */
export const draftOf = (holdId: string): string | undefined => drafts.get(holdId);

// Stop tracking in progress, outside any view: core hides a hold while its removal is queued, so until core answers the
// hold stays listed here (for the account that asked), and a refused or unresolved stop is remembered by hold id.
// A drawer closed and opened again in the meantime, or another notice and back, shows the same thing.
interface Stopping {
  readonly h: HeldAttempt;
  readonly account: string | null;
  readonly done: Promise<StopResult>;
}
const stopping = new Map<string, Stopping>();
const stopFailed = new Set<string>();
let stopVersion = 0;
const stopListeners = new Set<() => void>();
const stopChanged = () => {
  stopVersion += 1;
  for (const l of stopListeners) l();
};
const useStopVersion = () =>
  useSyncExternalStore(
    (l) => (stopListeners.add(l), () => void stopListeners.delete(l)),
    () => stopVersion,
    () => stopVersion,
  );

/** The replies held now for a notice (this account's, any tab), re-read when core's holds change; a hold whose Stop
 *  tracking core has not answered yet stays in the list. */
export function useHeldReplies(notice: string | null): readonly HeldAttempt[] {
  useAttemptsVersion();
  useStopVersion();
  const account = useCore().account;
  if (!notice) return [];
  const lock = replyLock(notice);
  const listed = heldAttempts(lock);
  const pending = [...stopping.values()].filter((x) => x.account === account && x.h.lock === lock && !listed.some((l) => l.id === x.h.id)).map((x) => x.h);
  return [...listed, ...pending];
}

/** This hold's last Stop tracking was refused or could not be confirmed (it is still held). */
export function useStopFailed(holdId: string | undefined): boolean {
  useStopVersion();
  return !!holdId && stopFailed.has(holdId);
}
/** A new Check again: the last stop's failure line goes. */
export function clearStopFailed(holdId: string): void {
  if (stopFailed.delete(holdId)) stopChanged();
}

export type ReplyResult =
  | { readonly verdict: 'sent' }
  /** The answer was lost or was a 5xx: held, never sent again. */
  | { readonly verdict: 'unknown' }
  /** A definite refusal: nothing was written. */
  | { readonly verdict: 'refused'; readonly code?: string; readonly error: unknown }
  /** Not sent: a reply of this notice is held already (HELD), or this browser could not keep the hold. */
  | { readonly verdict: 'notSent'; readonly code?: string };

/** How long a reply waits for its answer; past it the outcome is unknown (held), as with any lost answer. */
const REPLY_TIMEOUT_MS = 60000;

/** Send one reply, under its stored hold. Without the hold nothing is sent. */
export async function sendReply(notice: string, body: string): Promise<ReplyResult> {
  const ctx = capture();
  const got = await holdAttempt(replyLock(notice), { by: BY_REPLY, meta: { notice } });
  if (!got.ok) return { verdict: 'notSent', code: got.code };
  const hold = got.hold;
  if (!alive(ctx)) {
    hold.release();
    return { verdict: 'notSent' };
  }
  drafts.set(hold.id, body);
  try {
    const raw = await api(abuseRoutes.reply, { params: { id: notice }, body: { body } as never, ctx, recovers: true, timeoutMs: REPLY_TIMEOUT_MS });
    // Only the stored owner message proves it: any other success answer proves nothing, so the reply stays held.
    if (!parseReplyAnswer(raw)) {
      hold.sent();
      void invalidate();
      return { verdict: 'unknown' };
    }
    hold.release();
    drafts.delete(hold.id);
    void invalidate();
    return { verdict: 'sent' };
  } catch (e) {
    if (outcomeOf(e, true) === 'pending') {
      hold.sent();
      void invalidate();
      return { verdict: 'unknown' };
    }
    hold.release();
    drafts.delete(hold.id);
    const code = typeof (e as HubError | null)?.code === 'string' ? (e as HubError).code : undefined;
    if (code === 'ABUSE_NOTICE_RESOLVED' || code === 'ABUSE_NOTICE_REPLY_LIMIT' || code === 'ABUSE_NOTICE_NOT_FOUND') void invalidate();
    return { verdict: 'refused', ...(code ? { code } : {}), error: e };
  }
}

/** Check again: a fresh read of the held reply's own notice (from the hold, never the open drawer). It settles nothing:
 *  a reply has no key, so a message with the same text proves nothing. `ok` only when the read answered that very
 *  notice in its expected shape. */
export async function checkReply(h: HeldAttempt): Promise<{ readonly at: number; readonly ok: boolean }> {
  const notice = (h.meta as { notice?: unknown } | null)?.notice;
  const at = Date.now();
  if (typeof notice !== 'string') return { at, ok: false };
  try {
    const [raw] = await Promise.all([getQ.fetch(notice), listSource.invalidate(['list'])]);
    return { at, ok: parseNoticeDetail(raw, notice) !== null };
  } catch {
    return { at, ok: false };
  }
}

/** The person's warned Stop tracking of the hold that was shown. Core decides inside its store lock: only its sender,
 *  only under the account it was taken by (attemptFor answers null for another account's or sender's hold), only the
 *  state that was shown (its meta version), and never while a request of it is out (a send still running in any tab).
 *  'freed' or why not; nothing is removed unless 'freed'. */
export type StopResult = Awaited<ReturnType<AttemptHold['free']>>;
export function stopTracking(h: HeldAttempt): Promise<StopResult> {
  const going = stopping.get(h.id);
  if (going) return going.done;
  if (h.inFlight) return Promise.resolve('refused');
  const handle = attemptFor(h.id, BY_REPLY);
  if (!handle) return Promise.resolve('refused');
  const removal = handle.free('dismissed', { metaVersion: h.metaVersion });
  const done = (async (): Promise<StopResult> => {
    try {
      if (stopGate) await stopGate();
      const out = await removal;
      if (out === 'freed') {
        drafts.delete(h.id);
        stopFailed.delete(h.id);
      } else stopFailed.add(h.id);
      return out;
    } catch {
      stopFailed.add(h.id);
      return 'unresolved';
    } finally {
      stopping.delete(h.id);
      stopChanged();
    }
  })();
  stopping.set(h.id, { h, account: capture().account, done });
  stopFailed.delete(h.id);
  stopChanged();
  return done;
}

/** Tests only: hold every Stop tracking's answer until the returned function is called (the removal itself runs). */
let stopGate: (() => Promise<void>) | null = null;
export function gateStopForTests(): () => void {
  let open!: () => void;
  const p = new Promise<void>((res) => (open = res));
  stopGate = () => p;
  return () => {
    stopGate = null;
    open();
  };
}

/** Tests only. */
export function resetDraftsForTests(): void {
  drafts.clear();
  stopping.clear();
  stopFailed.clear();
  stopGate = null;
  stopChanged();
}
