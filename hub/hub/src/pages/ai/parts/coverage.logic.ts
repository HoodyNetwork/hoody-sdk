// The chat lists' one coverage judge: whether what a list shows is PROVABLY all there is.
// The Hub never claims a definite "No chats": coverage only decides whether the generic "Some chats may not be shown"
// notice is hidden. Anything not proven is not complete.
//
// - Every source read has ONE state for its read as it is NOW: pending (no answer of now: a read in flight, a refresh
//   of an earlier answer included; a read paused offline; an answer kept from another key while this one loads), complete,
//   more (a next page or more waiting chats exist), failed, or gone (a 404 from THIS read: the chat is gone, which is an
//   answer). Nothing is remembered across reads: a chat kept hidden after an earlier 404 is the rows' business.
// - Sources: the computer list itself (its refresh included), each containers row no computer can be built from, a
//   computer the list does not read (or whose feed is refused, or with no answer yet), each session page, each gates
//   page, each waiting chat read by itself; and staleness: the change feed that keeps a computer's answers
//   current when it is not live (answers idle since may be old), the computer list once core's staleTime passed, and
//   the network while the browser is offline (every answer may be old then, a read idle since included).
// - coverage(sources) is true only when every source is complete or gone.
import type { SourceError } from '@core';

export type ReadState = 'pending' | 'complete' | 'more' | 'failed' | 'gone';
export type SourceKind = 'computers' | 'unbuilt' | 'computer' | 'sessions' | 'gates' | 'waiting' | 'feed' | 'network';

export interface Source {
  kind: SourceKind;
  /** The computer it belongs to (All computers); '' for one computer's own list and for the computer list. */
  computer: string;
  state: ReadState;
}

/** Provably complete: every source answered now, and nothing remains to read. */
export function coverage(sources: readonly Source[]): boolean {
  return sources.every((s) => s.state === 'complete' || s.state === 'gone');
}

/** Whether the gap is known now, so a list may say some chats may not be shown at once: every source has
 *  an answer of now (none pending), or the browser is offline (a refresh paused offline is known at once,
 *  nothing can re-read anything). Only a read in flight is not known yet: a scope switch or a refresh never flashes the
 *  notice while its reads run. */
export function settled(sources: readonly Source[]): boolean {
  return sources.some((s) => s.kind === 'network') || sources.every((s) => s.state !== 'pending');
}

/** The query flags readState reads (a TanStack query result has them all). */
export interface ReadFlags {
  isSuccess: boolean;
  isError: boolean;
  isFetching: boolean;
  isPaused?: boolean;
  isPlaceholderData?: boolean;
  error?: SourceError | null;
}

/** One read's state now, from its query flags. A read in flight or paused (offline) is pending even with an earlier
 *  answer kept; so is an answer kept from another key. A 404 is `gone` only where the caller says it means the thing
 *  is gone (a waiting chat's own read), and only from the read that answered it. Age is not a query flag here: core's
 *  chat reads pass no staleTime, so TanStack calls them stale the moment they answer; `freshSources` judges it. */
export function readState(q: ReadFlags, notFoundIsGone = false): ReadState {
  if (q.isFetching || q.isPaused || q.isPlaceholderData || (!q.isSuccess && !q.isError)) return 'pending';
  if (q.isError) return notFoundIsGone && q.error?.code === 'not_found' ? 'gone' : 'failed';
  return 'complete';
}

/** The session pages of one computer as sources: each page's own read; the last page, answered, is `more` while a
 *  further page exists, and `failed` when the walk cannot prove its end (an empty later page below the total, or a full
 *  page with no total said). A running repeat re-list holds the pages pending. */
export function sessionSources(p: {
  pages: ReadonlyArray<{ state: ReadState; size: number }>;
  pageSize: number;
  loaded: number;
  total: number | null;
  repairing: boolean;
}): Source[] {
  if (p.pages.length === 0) return [{ kind: 'sessions', computer: '', state: 'pending' }];
  return p.pages.map((page, i): Source => {
    const at = (state: ReadState): Source => ({ kind: 'sessions', computer: '', state });
    if (page.state !== 'complete') return at(page.state);
    if (p.repairing) return at('pending');
    if (i < p.pages.length - 1) return at('complete');
    const further = p.total === null ? page.size >= p.pageSize : p.loaded < p.total;
    if (!further) return at('complete');
    const unproven = p.total === null || (p.pages.length > 1 && page.size === 0);
    return at(unproven ? 'failed' : 'more');
  });
}

/** Staleness as sources: the change feed that re-reads a computer's lists on every change, when it is not
 *  live (all realms read without one; a feed down or not yet answered), and the network while the browser is offline
 *  (nothing can re-read anything). Either way an answer idle since may be old, so the list is not provably complete.
 *  A feed whose own read answered with a refusal (`feedRefused`) is `failed`, an answer of now, so the gap is known at
 *  once (settled), like any other refused read; one not answered yet stays `pending`. */
export function freshSources(f: { feedLive: boolean; online: boolean; feedRefused?: boolean }): Source[] {
  return [
    ...(f.feedLive ? [] : [{ kind: 'feed' as const, computer: '', state: f.feedRefused ? ('failed' as const) : ('pending' as const) }]),
    ...(f.online ? [] : [{ kind: 'network' as const, computer: '', state: 'pending' as const }]),
  ];
}
