// The "All computers" chat list's reads. useAllChats(at) follows the shown realm's
// computers (allChats.logic followedComputers) and, for each one it reads, holds that computer's change feed
// (allChats useChangeFeed) and its chat reads (data.ts useChats with that feed: the same paging, last-active repair, Needs
// you, marks and Bot tags, unchanged). The reads run in one hidden reader per computer (`readers`, rendered by the
// list), which hands its result to a store; the store wakes the list only when what it shows changed (its rows, counts,
// Load more and whether its coverage is proven complete).
//
// Coverage is coverage.logic's one judge: allChats.logic allSources lists the computer list's state (its
// refresh in flight or paused included), the containers rows no computer can be built from, the computers not read (or
// whose feed is refused, or with no answer yet) and every read computer's own sources; coverage() proves them complete
// or not. The list reads only that, to hide its generic notice.
import { containersRoute, queryClient, useComputersAll, type Target } from '@core';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useChangeFeed, type ChatFeed, type FeedWhy } from './allChats';
import { allComputerOf, allSources, computerGap, followedComputers, listGap, mergeRows, type AllComputer, type ComputerGap, type Followed } from './allChats.logic';
import type { ChatRow } from './chats.logic';
import { coverage, settled, type Source } from './coverage.logic';
import { useChats, type ChatsAt, type ChatsRead } from './data';

export interface Part {
  feed: ChatFeed;
  read: ChatsRead | null;
}

const REFUSED: ReadonlySet<FeedWhy | undefined> = new Set<FeedWhy | undefined>(['budget', 'locks', 'closed']);

/** What a computer's part shows (exported for its test): a change of it wakes the list. */
export function digest(p: Part): string {
  const r = p.read;
  const rows = r?.rows?.map((x) => [x.key, x.mark, x.title, x.at, x.bot, x.group, x.claude, x.cwd].join('\u0001')).join('\u0002') ?? '-';
  return [p.feed.why, p.feed.live, rows, r ? coverage(r.sources) : '-', r ? settled(r.sources) : '-', r?.isPending, r?.error?.code, r?.shown, r?.total, !!r?.loadMore, r?.loadingMore].join('|');
}

/** Each computer's latest Part; subscribers hear only a change of what the list shows (the digest). */
function createParts() {
  const parts = new Map<string, Part>();
  const digests = new Map<string, string>();
  const subs = new Set<() => void>();
  let version = 0;
  const notify = () => { version++; for (const l of [...subs]) l(); };
  return {
    put(id: string, p: Part) {
      parts.set(id, p);
      const d = digest(p);
      if (digests.get(id) !== d) { digests.set(id, d); notify(); }
    },
    drop(id: string) {
      if (!parts.delete(id)) return;
      digests.delete(id);
      notify();
    },
    get: (id: string) => parts.get(id),
    subscribe(l: () => void) { subs.add(l); return () => { subs.delete(l); }; },
    version: () => version,
  };
}
type Parts = ReturnType<typeof createParts>;

function Reads({ at, feed, id, parts }: { at: ChatsAt; feed: ChatFeed; id: string; parts: Parts }) {
  const read = useChats(at, { feed: { tokens: feed.tokens, live: feed.live } });
  useEffect(() => parts.put(id, { feed, read }));
  return null;
}

function ComputerChats({ f, realm, parts }: { f: Followed; realm: string; parts: Parts }) {
  const id = f.computer.id;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one place per computer and realm (the target is rebuilt per render)
  const at = useMemo<ChatsAt>(() => ({ target: f.target, realm }), [id, f.computer.project, f.computer.server, realm]);
  const feed = useChangeFeed(at);
  const refused = REFUSED.has(feed.why);
  useEffect(() => { if (refused) parts.put(id, { feed, read: null }); });
  useEffect(() => () => parts.drop(id), [id, parts]);
  return refused ? null : <Reads at={at} feed={feed} id={id} parts={parts} />;
}

export interface AllChatsRead {
  /** The followed computers, the top-bar one first; null while the computer list is not known. */
  followed: AllComputer[] | null;
  /** The Target of a followed computer (by container id): where a row's requests go. null: not a followed computer. */
  targetOf: (computerId: string) => Target | null;
  /** Re-reads ONE followed computer's chats (a finished rename or close on it); nothing else is read. */
  refetchOf: (computerId: string) => void;
  rows: ChatRow[] | undefined;
  /** coverage() over every source (allChats.logic allSources): true only when the list is provably all there is (it
   *  hides the generic notice; nothing ever claims there are no chats). */
  complete: boolean;
  /** settled() over the same sources: no read pending, so whether `complete` holds is known (the notice waits for it). */
  settled: boolean;
  /** coverage() and settled() over the gaps that name no computer (the computer list, its unbuildable rows): the
   *  list's own line below it. A computer's own gap is its group's note (gapOf). */
  listComplete: boolean;
  listSettled: boolean;
  /** One followed computer's own gap (allChats.logic computerGap): its group's note. */
  gapOf: (computerId: string) => ComputerGap | null;
  /** Re-reads ONE followed computer: its reads, or its refused feed (its group note's Refresh). */
  refreshOf: (computerId: string) => void;
  /** The chats the read computers hold (an upper bound while pages remain), above the rows when a page remains: the
   *  table's Show more. null before any computer answered. */
  total: number | null;
  isPending: boolean;
  /** The computer list could not be read and nothing is shown. */
  error: unknown;
  loadMore: (() => void) | undefined;
  loadingMore: boolean;
  refetch: () => void;
  /** The hidden per-computer readers: render them once, anywhere. */
  readers: ReactNode;
}

/** The computer list has no answer of now (core's useComputersAll keeps `complete` while it refreshes a whole answer):
 *  a watched containers-list query in flight, paused, or stale. An observer going stale notifies the cache. */
function useListBusy(): boolean {
  const subscribe = useCallback((cb: () => void) => queryClient.getQueryCache().subscribe(cb), []);
  const busy = () =>
    queryClient
      .getQueryCache()
      .findAll({ predicate: (q) => q.queryKey.includes(containersRoute.id) && q.getObserversCount() > 0 })
      .some((q) => q.state.fetchStatus !== 'idle' || q.isStale());
  return useSyncExternalStore(subscribe, busy, busy);
}

export function useAllChats(at: ChatsAt): AllChatsRead {
  const list = useComputersAll();
  const listBusy = useListBusy();
  const [parts] = useState(createParts);
  useSyncExternalStore(parts.subscribe, parts.version, parts.version);
  const current = at.target.container.id;
  const built = useMemo(() => {
    if (!list.rows) return null;
    const rows = list.rows.map(allComputerOf).filter((c): c is AllComputer => c !== null);
    return { followed: followedComputers(rows, current), unbuilt: list.rows.length - rows.length };
  }, [list.rows, current]);
  const followed = built?.followed ?? null;

  const read = (followed ?? []).filter((f) => f.read);
  const got = read.map((f) => ({ f, part: parts.get(f.computer.id) }));
  const rows = followed ? mergeRows(got.flatMap(({ f, part }) => (part?.read?.rows ? [{ f, rows: part.read.rows }] : []))) : undefined;
  // Each read computer's sources carry its own staleness (useChats: its feed, the network).
  const sources: Source[] = allSources({
    list: followed ? listGap(list, listBusy) : 'reading',
    unbuilt: built?.unbuilt ?? 0,
    computers: (followed ?? []).map((f) => {
      const part = parts.get(f.computer.id);
      if (!f.read || (part && REFUSED.has(part.feed.why))) return { id: f.computer.id, unread: true };
      return part?.read ? { id: f.computer.id, sources: part.read.sources } : { id: f.computer.id };
    }),
  });
  const listSources: Source[] = allSources({ list: followed ? listGap(list, listBusy) : 'reading', unbuilt: built?.unbuilt ?? 0, computers: [] });
  const pending = got.some(({ part }) => !part || (part.read !== null && part.read.isPending));
  const reads = got.flatMap(({ part }) => (part?.read ? [part.read] : []));
  const more = reads.filter((r) => r.loadMore);
  // Each computer with a further page counts at least one above its rows (useChats `shown`); the sum stays above the
  // rows while any page remains, so the table keeps its Show more.
  const held = reads.reduce((n, r) => n + (r.shown ?? r.rows?.length ?? 0), 0);
  const total = reads.length ? Math.max(held, (rows?.length ?? 0) + (more.length ? 1 : 0)) : null;
  return {
    followed: followed ? followed.map((f) => f.computer) : null,
    targetOf: (id) => followed?.find((f) => f.computer.id === id)?.target ?? null,
    refetchOf: (id) => { if (followed?.some((f) => f.computer.id === id)) parts.get(id)?.read?.refetch(); },
    rows,
    complete: coverage(sources),
    settled: settled(sources),
    listComplete: coverage(listSources),
    // Offline is known at once for the computer list too: the network mark the computers' reads carry.
    listSettled: settled([...listSources, ...sources.filter((x) => x.kind === 'network')]),
    gapOf: (id) => {
      const f = followed?.find((x) => x.computer.id === id);
      if (!f) return null;
      const part = parts.get(id);
      return computerGap(f, part ? { refused: REFUSED.has(part.feed.why), ...(part.read ? { sources: part.read.sources } : {}) } : undefined);
    },
    refreshOf: (id) => {
      const part = parts.get(id);
      if (!part) return;
      if (REFUSED.has(part.feed.why)) part.feed.retry();
      else part.read?.refetch();
    },
    total,
    isPending: !followed ? list.loading || list.more : rows === undefined || (rows.length === 0 && pending),
    error: !followed && list.failed ? list.error : null,
    loadMore: more.length ? () => { for (const r of more) r.loadMore?.(); } : undefined,
    loadingMore: reads.some((r) => r.loadingMore),
    // Re-reads every source: the computer list, each read computer's reads (each also takes its next waiting step), and
    // each refused feed.
    refetch: () => {
      list.retry();
      for (const r of reads) r.refetch();
      for (const { part } of got) if (part && REFUSED.has(part.feed.why)) part.feed.retry();
    },
    readers: read.map((f) => <ComputerChats key={f.computer.id} f={f} realm={at.realm} parts={parts} />),
  };
}
