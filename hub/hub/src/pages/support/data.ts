// The Support page's data: the reads through core, and the two keyed writes (a new
// ticket, a reply) as attempts held in core (core/attempts.ts) BEFORE they leave. The hold mints the attempt's
// `client_key`, survives a reload and every tab of the account sees it; while it is held nothing of that target is
// sent again. Only a definite answer to the send frees it (sent, or a recognised refusal), or the person's warned
// Stop tracking. A read never frees it: Check again (check.ts) only looks for a possible match and says so. The
// draft text stays in this module's memory, never in the stored hold: a reload keeps the hold and loses the draft.
// Close sends no body and no key, and is held the same way (one close per ticket while its answer is unknown): a
// repeat changes nothing only while the ticket stays closed, and a reply reopens it. Only a definite answer, a read
// that shows the ticket closed, or the warned Stop tracking frees it.
// Every write passes `recovers`: the page shows its own pending banner and reads the outcome back itself, so core
// sends no second "may have gone through" notice, and a support 503 with its own code stays a definite refusal.
import { source, useAccount } from './data.pure';
import type { ListParams } from './data.pure';
export { supportTable, invalidateSupport, useAccount, useTickets, useThread, useLimits, CREATE_LOCK, replyLock, closeLock, BY_CREATE, BY_REPLY, BY_CLOSE, draftOf, metaOf, useHeld, roomFor, keepAnswer, useUnclaimed, unclaimedLocksForTests, resetUnclaimedForTests, sendCreate, sendReply, stopTracking, closeTicket, closeLanded, readThreadLatest, readListFirst, checkAgain } from './data.pure';
export type { Draft, AttemptMeta, SendResult, Unclaimed, CloseResult, CheckHint } from './data.pure';
import { useEffect, useState } from 'react';
import { hostEnv } from '@core';
import { COUNT_LIMIT, COUNT_PAGES, type TicketPage } from './logic';

/** The nav count's reads: the unfiltered list, `limit` 50, page after page while a cursor comes back, at most 4. */
export function useCountPages() {
  const account = useAccount();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const qs = source.useQueries<TicketPage, ListParams>('list', cursors.map((cursor) => ({ status: null, cursor, limit: COUNT_LIMIT })), { enabled: account });
  const pages = qs.map((q) => (q.isError ? undefined : q.data));
  const next = pages[pages.length - 1]?.nextCursor ?? null;
  useEffect(() => {
    if (next && cursors.length < COUNT_PAGES && !cursors.includes(next)) setCursors([...cursors, next]);
  }, [next, cursors]);
  // The window or tab shown again reads the list again (core has no focus refetch): a reply that came meanwhile
  // shows in the count and the list.
  useEffect(() => {
    if (!account) return;
    const again = () => void source.invalidate(['list']);
    const env = hostEnv();
    const visible = () => {
      if (env.visible()) again();
    };
    const offs = [env.onLifecycle('focus', again), env.onLifecycle('pageshow', again), env.onVisibilityChange(visible)];
    return () => { for (const off of offs) off(); };
  }, [account]);
  return { account, pages, failed: qs.some((q) => q.isError) };
}
