// The AI pane's reads: the chat list of the top bar's computer and realm. Read-only: no
// change is declared here (row actions and sending live elsewhere).
//
// - Sessions: GET /sessions in pages of 50, most recently active first (`order=last_active`; an older agent drops the
//   key and answers newest started first), "Show more" reads the next page. A row that a later page repeats (it moved
//   to the front during the walk) re-lists the loaded pages before "Show more" can end.
// - Needs you: GET /gates in pages of 100 (the agent's cap); `meta.omitted` or a larger total reads "and more" and pages.
//   A chat a gate waits in that no loaded page holds is read by itself (GET /sessions/{id}, its `session`), 20 at a time:
//   more such chats read "and more", and "Show more waiting" reads the next 20. A gates read or a chat read that failed
//   sets `gatesError` and is read again every 30 s until it answers. `needs` counts only what successful reads found:
//   the pane never claims there is nothing waiting (no "Agent ready"), it shows a count only when it is above zero.
// - Bot tags: GET /bots of the realm(s) (Bots are few: at most 20 read) names them. A row's `origin` says which Bot,
//   named only when the listed Bot's uid is the origin's; only while a loaded row or waiting chat read by itself
//   carries no state (an older agent) is each Bot's open delegates read.
// - Running marks: a current agent's row's `state`. An older agent's rows: GET /sessions/{id}/state for the listed chats active in the
//   last 30 minutes, at most 20, every 15 s while the page is visible.
// - Fresh lists: one realm shown → GET /changes every 15 s while visible; the sessions or gates topic moving (or the
//   scope changing) re-lists that list. All realms (GET /changes takes one realm) or a feed that cannot be read → the
//   lists re-read every 30 s instead. A caller holding its own feed (`feed`, GET /changes/stream) replaces the
//   polled GET /changes: its token moves re-list the same way, and while it is not live the lists re-read every 30 s.
// - A realm-pinned agent answers `realm=all` with 400 realm_scope_unsupported: the plain listings (no realm on the wire,
//   the agent's own realm) are read instead.
// - A hidden page starts no read (a feed answer that lands while hidden holds its re-list); showing it reads what went
//   stale and the held re-lists.
// - Shared with the shell (core/chat-lists.ts, chat-attention.ts): the four list reads are core's definitions, so the
//   shell's chat-attention observer and this page hold ONE query per list page, and the pinned fallback is core's
//   (chatListRealm), so both ask the same realm. While that observer runs it ticks GET /gates page 1 every 30 s
//   (visible only) and this page sets no timer of its own for that page: /ai reads it once per tick. Paging, the waiting-chat bound and the pinned fallback belong to one place: another
//   computer or realm starts from its own first values in its first render.
import { SESSION_PAGE, REPAIR_MAX, BOTS_MAX, STATE_MS, FEED_MS, SLOW_MS, MISSING_STEP, source } from './data.pure';
import type { PageIn, OneIn } from './data.pure';
export { chatRoutes, SESSION_PAGE, GATE_PAGE, BOTS_MAX, STATE_MS, FEED_MS, SLOW_MS, MISSING_STEP, useChatsAt } from './data.pure';
export type { ChatsAt } from './data.pure';
import type { ChatsAt } from './data.pure';
import { chatListRealm, chatPlace, chatTickedPlace, markPinned, onPinned, pinnedRev, useChatAttentionRev, useChatNotes, type SourceError } from '@core';
import { useNow } from '@kit';
import { useVisible, useOnline } from './data.web';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { chatRows, gatesSoFar, keyOf, missingGateChats, moved, stateReads, type Bot, type ChatRow, type GatePage, type Session, type SessionPage, type Tokens } from './chats.logic';
import { freshSources, readState, sessionSources, type Source } from './coverage.logic';

export interface ChatsRead {
  rows: ChatRow[] | undefined;
  /** Sessions the realm(s) hold beyond the loaded pages: "Show more" reads the next. */
  total: number | null;
  /** The count the list shows: `total` less the loaded sessions it hides (Bot sessions, drafts); exact once all are
   *  loaded, an upper bound before. */
  shown: number | null;
  loaded: number;
  loadMore: (() => void) | undefined;
  loadingMore: boolean;
  /** Waiting chats exist beyond those read ("and more"): a gates page left some out, more pages wait, or more chats
   *  outside the loaded pages wait than were read. `moreGates` reads the next of them. */
  gatesMore: boolean;
  moreGates: (() => void) | undefined;
  /** Chats waiting for you (Needs you), over the gates and chats read. */
  needs: number;
  /** A gates read or a waiting chat's own read failed (Needs you may miss chats); `refetch` reads them again. */
  gatesError: SourceError | null;
  /** This computer's reads as coverage sources (coverage.logic): each session page, each gates page, each waiting chat
   *  read by itself, more waiting chats than read, and staleness (no live feed, offline). The views hide their generic notice only when coverage() proves
   *  them complete. */
  sources: Source[];
  /** The folders chats ran in (GET /sessions/cwds; with All realms, the listed rows' folders). */
  folders: string[];
  isPending: boolean;
  error: SourceError | null;
  /** Re-reads every read source and takes the next waiting step (`moreGates`), if any. */
  refetch: () => void;
  /** The first session page read again: true when it answers (the proof an agent sign-in waits for, app/AgentSignIn Reread). */
  reread: () => Promise<boolean>;
}

const okData = <T,>(qs: ReadonlyArray<{ data?: T; isSuccess: boolean }>): T[] => qs.filter((q) => q.isSuccess && q.data !== undefined).map((q) => q.data as T);
// The last answer of each read, kept through a failed refresh (the failure is reported beside it).
const lastData = <T,>(qs: ReadonlyArray<{ data?: T }>): T[] => qs.filter((q) => q.data !== undefined).map((q) => q.data as T);
const failed = (qs: ReadonlyArray<{ isError: boolean }>): boolean => qs.some((q) => q.isError);
// A waiting chat's own read that failed; 404 not_found is an answer (the chat is gone: nothing to list).
const unanswered = (q: { isError: boolean; error: SourceError | null }): boolean => q.isError && q.error?.code !== 'not_found';

/** State that belongs to one place (computer and realm): another place reads `init` from its very first render (a reset
 *  in an effect would come one render late, after that render's reads were already asked for with the old value). */
function usePlaced<T>(key: string, init: T): [T, (f: (v: T) => T) => void] {
  const [s, set] = useState<{ key: string; v: T }>({ key, v: init });
  const v = s.key === key ? s.v : init;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- init is a constant of each call site
  const update = useCallback((f: (v: T) => T) => set((o) => ({ key, v: f(o.key === key ? o.v : init) })), [key]);
  return [v, update];
}

/** A change feed the caller holds (GET /changes/stream in the stream budget): its latest tokens, and whether it
 *  is live now. A caller that passes one gets no polled GET /changes. */
export interface ChatsFeed {
  tokens: Tokens | null;
  live: boolean;
}

export function useChats(at: ChatsAt, o: { feed?: ChatsFeed } = {}): ChatsRead {
  const visible = useVisible();
  const online = useOnline();
  // A clock that ticks with the state reads, so day groups and the 30-minute window follow time.
  const now = useNow(true, STATE_MS);
  const one = at.realm !== 'all';

  // A pinned agent refuses `all`: read its plain listings then (no realm on the wire: its own realm). The rule and its
  // memory are core's (chatListRealm), shared with the shell's observer, so both ask the same reads.
  const place = chatPlace(at.target, at.realm);
  useSyncExternalStore(onPinned, pinnedRev, pinnedRev);
  const { realm, here } = chatListRealm(place, at.realm);
  // While the shell's observer ticks GET /gates page 1 of this same place (core chat-attention), this list adds no timer
  // for it; a list of any other place (a followed computer, a folder's own) keeps its own.
  useChatAttentionRev();
  const ticker = chatTickedPlace() === place;
  // Chats this page let go while their turn ran (core notes): "Turn ended" once idle, "Closed" once closed.
  const notesHere = useChatNotes(at.target.container.id);
  const noted = useMemo(() => new Map(notesHere.map((n) => [keyOf(n.realm, n.sid), n.last])), [notesHere]);

  // The change feed (one realm only). A feed that cannot be read leaves the lists on the slow re-read; so does a list
  // whose last read failed (the feed's tokens may never move again to re-list it).
  const changes = source.useQuery<Tokens, { at: ChatsAt; realm: string }>('chats.changes', { at, realm: at.realm }, { enabled: one && visible && !o.feed, refetchInterval: one && visible && !o.feed ? FEED_MS : false });
  const tokensNow = o.feed ? o.feed.tokens ?? undefined : changes.data;
  const feedOk = one && (o.feed ? o.feed.live && tokensNow !== undefined : !changes.error && tokensNow !== undefined);
  const slowIf = (bad: boolean) => (feedOk && !bad ? false : visible ? SLOW_MS : false);

  const [pages, setPages] = usePlaced(place, 1);
  const [gatePages, setGatePages] = usePlaced(place, 1);
  const [missingMax, setMissingMax] = usePlaced(place, MISSING_STEP);
  const pageIns = useMemo(() => Array.from({ length: pages }, (_, i) => ({ target: at.target, realm, page: i + 1 })), [at, realm, pages]);
  const gateIns = useMemo(() => Array.from({ length: gatePages }, (_, i) => ({ target: at.target, realm, page: i + 1 })), [at, realm, gatePages]);
  // Whether each list's last read failed, as state: the options of the next render take it (a ref would wait for some
  // later render that may never come).
  const [sBad, setSBad] = useState(false);
  const [gBad, setGBad] = useState(false);
  const sq = source.useQueries<SessionPage, PageIn>(here ? 'chats.sessionsHere' : 'chats.sessions', pageIns, { enabled: visible, refetchInterval: slowIf(sBad) });
  const gateKey = here ? 'chats.gatesHere' : 'chats.gates';
  const gq1 = source.useQueries<GatePage, PageIn>(gateKey, gateIns.slice(0, 1), { enabled: visible, refetchInterval: ticker ? false : slowIf(gBad) });
  const gqN = source.useQueries<GatePage, PageIn>(gateKey, gateIns.slice(1), { enabled: visible, refetchInterval: slowIf(gBad) });
  const gq = [...gq1, ...gqN];
  const sFailed = failed(sq);
  const gFailed = failed(gq);
  useEffect(() => setSBad(sFailed), [sFailed]);
  useEffect(() => setGBad(gFailed), [gFailed]);

  const first = sq[0];
  useEffect(() => {
    if (!one && first?.error?.code === 'realm_scope_unsupported') markPinned(place);
  }, [one, first?.error?.code, place]);

  // Re-list on token moves: compare each answer with the one before of the same place (a place's first answer moves
  // nothing). A move that lands while the page is hidden is held and re-listed when the page is shown.
  const last = useRef<{ place: string; t: Tokens } | null>(null);
  const held = useRef({ place: '', sessions: false, gates: false });
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const sqRef = useRef(sq);
  const gqRef = useRef(gq);
  sqRef.current = sq;
  gqRef.current = gq;
  const relist = (list: 'sessions' | 'gates') => {
    for (const q of list === 'sessions' ? sqRef.current : gqRef.current) void q.refetch();
  };
  useEffect(() => {
    const t = tokensNow;
    if (!t) return;
    const prev = last.current?.place === place ? last.current.t : null;
    last.current = { place, t };
    if (held.current.place !== place) held.current = { place, sessions: false, gates: false };
    for (const list of ['sessions', 'gates'] as const) {
      if (!moved(prev, t, list)) continue;
      if (visibleRef.current) relist(list);
      else held.current[list] = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per feed answer; place is read with it
  }, [tokensNow]);
  useEffect(() => {
    if (!visible || held.current.place !== place) return;
    for (const list of ['sessions', 'gates'] as const) {
      if (!held.current[list]) continue;
      held.current[list] = false;
      relist(list);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the page is shown
  }, [visible]);

  const sessionPages = okData(sq);
  const sessions: Session[] = sessionPages.flatMap((p) => p.sessions);
  const total = sessionPages.length ? sessionPages[sessionPages.length - 1]!.total : null;
  const gp = lastData(gq);
  const { gates, more: pagesMore } = gatesSoFar(gp);

  // order=last_active: a chat that becomes active while the pages are walked moves to the front, so a later page
  // repeats a row and the row it pushed down is on no loaded page. A repeat re-lists the loaded pages (each a fresh
  // read) before the walk counts as complete, at most REPAIR_MAX times for these pages; past that, Show more counts
  // distinct chats.
  const loadedKeys = new Set(sessions.map((x) => keyOf(x.realm, x.id)));
  const overlap = sessions.length > loadedKeys.size;
  const settled = sq.every((q) => !q.isFetching);
  const answeredAt = sq.map((q) => q.dataUpdatedAt).join(',');
  const repairs = useRef({ at: '', n: 0 });
  if (repairs.current.at !== `${place}#${pages}`) repairs.current = { at: `${place}#${pages}`, n: 0 };
  // A repair counts when it starts, so the last one is still running until its reads settle: Show more waits for it.
  const repairing = overlap && (repairs.current.n < REPAIR_MAX || !settled);
  useEffect(() => {
    const r = repairs.current;
    if (!overlap || !settled || !visible || r.n >= REPAIR_MAX) return;
    r.n += 1;
    relist('sessions');
    // Runs once per set of answers that holds a repeat: answeredAt is load-bearing (relist reads refs).
  }, [overlap, settled, answeredAt, visible]);

  // One more than the bound tells whether waiting chats wait beyond it.
  const candidates = missingGateChats(gates, sessions, missingMax + 1);
  const missing = candidates.slice(0, missingMax);
  const missingMore = candidates.length > missingMax;
  const [mBad, setMBad] = useState(false);
  const mq = source.useQueries<Session | null, OneIn>('chats.session', missing.map((m) => ({ at, realm: m.realm, id: m.sid })), { enabled: visible, refetchInterval: mBad && visible ? SLOW_MS : false });
  const mFailed = mq.some(unanswered);
  useEffect(() => setMBad(mFailed), [mFailed]);
  const mqRef = useRef(mq);
  mqRef.current = mq;
  // A chat's last answer is kept through a failed refresh, but not past a 404: that chat is gone until a later answer
  // shows it again (a failed refresh after the 404 never brings the old answer back). The gone chats are kept per place
  // for as long as the hook lives, and recorded only after a commit (an abandoned render records nothing); the render
  // drops a chat whose own latest answer is the 404 by itself.
  const goneRef = useRef(new Map<string, Set<string>>());
  const goneHere = goneRef.current.get(place);
  const isGone = (i: number): boolean => {
    const q = mq[i]!;
    return (q.isError && !unanswered(q)) || (!q.isSuccess && goneHere?.has(keyOf(missing[i]!.realm, missing[i]!.sid)) === true);
  };
  const goneSeen = mq.map((q, i) => `${keyOf(missing[i]!.realm, missing[i]!.sid)}:${q.isSuccess ? 'ok' : q.isError && !unanswered(q) ? 'gone' : '-'}`).join(',');
  useEffect(() => {
    let set = goneRef.current.get(place);
    missing.forEach((m, i) => {
      const q = mqRef.current[i];
      const k = keyOf(m.realm, m.sid);
      if (q?.isError && !unanswered(q)) {
        if (!set) goneRef.current.set(place, (set = new Set()));
        set.add(k);
      } else if (q?.isSuccess) set?.delete(k);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goneSeen names every chat read and its outcome kind
  }, [place, goneSeen]);
  const extra = mq.flatMap((q, i) => (q.data && !isGone(i) ? [q.data] : []));

  const bq = source.useQuery<Bot[], { at: ChatsAt; realm: string }>('chats.bots', { at, realm }, { enabled: visible, refetchInterval: visible ? 60_000 : false });
  const bots = useMemo(() => (bq.data ?? []).slice(0, BOTS_MAX), [bq.data]);
  // Current agents' rows name their Bot (origin): the delegate lists are read only while some loaded row, a waiting chat read by
  // itself included, carries no state (an older agent).
  const older = sessions.some((x) => x.state === undefined) || extra.some((x) => x.state === undefined);
  const dq = source.useQueries<string[], { at: ChatsAt; bot: Bot }>('chats.delegates', older ? bots.map((bot) => ({ at, bot })) : [], { enabled: visible, refetchInterval: visible ? 60_000 : false });
  const delegates = new Map<string, string>();
  bots.forEach((b, i) => {
    for (const sid of dq[i]?.data ?? []) delegates.set(keyOf(b.realm, sid), b.name);
  });
  const gatesMore = pagesMore || missingMore;
  const gatesFail = gq.find((q) => q.isError)?.error ?? mq.find(unanswered)?.error ?? null;

  // Rows first without states (to choose whom to read), then with the answers.
  const base = chatRows({ sessions, extra, gates, bots, delegates, states: new Map(), now });
  const reads = visible ? stateReads(base, now) : [];
  const tq = source.useQueries<string, OneIn>('chats.state', reads.map((r) => ({ at, realm: r.realm, id: r.sid })), { refetchInterval: visible ? STATE_MS : false });
  const states = new Map<string, string>();
  reads.forEach((r, i) => {
    const q = tq[i];
    if (q?.isSuccess && q.data) states.set(keyOf(r.realm, r.sid), q.data);
  });
  const rows = first?.isSuccess || sessionPages.length ? chatRows({ sessions, extra, gates, bots, delegates, states, now, noted }) : undefined;

  const cq = source.useQuery<string[], { at: ChatsAt; realm: string }>('chats.cwds', { at, realm: at.realm }, { enabled: one && visible });
  const folders = useMemo(() => {
    const set = new Set<string>(one ? (cq.data ?? []) : []);
    for (const s of sessions) if (s.cwd) set.add(s.cwd);
    return [...set];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed when the folders or loaded sessions change
  }, [one, cq.data, sessions.length]);

  const loadMore = () => setPages((n) => n + 1);
  const gatesLoading = gq[gq.length - 1]?.isPending === true;
  // One press does one thing, so it starts at most one gates read or MISSING_STEP chat reads: re-read the first page
  // that left gates out (they changed while it was read); else widen the chat-read bound by MISSING_STEP; else read the
  // next gates page.
  const moreGates = gatesMore && !gatesLoading
    ? () => {
        const omittedAt = gqRef.current.findIndex((q) => (q.data?.omitted ?? 0) > 0);
        if (omittedAt >= 0) void gqRef.current[omittedAt]!.refetch();
        else if (missingMore) setMissingMax((n) => n + MISSING_STEP);
        else if (pagesMore) setGatePages((n) => n + 1);
      }
    : undefined;
  // Refresh re-reads every read source, and also takes the next waiting step: the views keep no other way
  // to the waiting chats beyond those read with zero rows or in All, so repeated Refresh reaches each of them.
  const refetch = () => {
    repairs.current.n = 0;
    for (const q of sqRef.current) void q.refetch();
    for (const q of gqRef.current) void q.refetch();
    for (const q of mqRef.current) void q.refetch();
    moreGates?.();
  };
  const reread = useCallback(async () => {
    const q = sqRef.current[0];
    if (!q) return false;
    const r = await q.refetch();
    return !r.isError && r.data !== undefined;
  }, []);
  // Coverage: each read's state now (coverage.logic readState: a read in flight or paused is pending, a refresh
  // included), plus staleness (freshSources: no live change feed, or offline). A waiting chat's own 404 is `gone` only
  // from its latest read; the chat hidden after an earlier 404 (isGone) is about the rows, never coverage.
  const sources: Source[] = [
    ...sessionSources({ pages: sq.map((q) => ({ state: readState(q), size: q.data?.sessions.length ?? 0 })), pageSize: SESSION_PAGE, loaded: loadedKeys.size, total, repairing }),
    ...gq.map((q, i): Source => {
      const st = readState(q);
      return { kind: 'gates', computer: '', state: st === 'complete' && i === gq.length - 1 && pagesMore ? 'more' : st };
    }),
    ...mq.map((q): Source => ({ kind: 'waiting', computer: '', state: readState(q, true) })),
    ...(missingMore ? [{ kind: 'waiting' as const, computer: '', state: 'more' as const }] : []),
    // The feed's own refusal is an answer (failed, known now); with a feed handed in, or no answer yet, it stays pending.
    ...freshSources({ feedLive: feedOk, feedRefused: one && !o.feed && readState(changes) === 'failed', online }),
  ];
  const sessionsMore = sources.some((x) => x.kind === 'sessions' && x.state === 'more');
  const hidden = rows ? loadedKeys.size - rows.filter((r) => loadedKeys.has(r.key)).length : 0;
  // With a further page, the count stays above the rows (a waiting chat read by itself may already show the one chat the
  // next page holds): the table offers Show more only below its total.
  const shown = total === null || !rows ? null : Math.max(rows.length + (sessionsMore ? 1 : 0), total - hidden);
  const loadingMore = sq.length > 1 && sq[sq.length - 1]!.isPending;
  return {
    rows,
    total,
    shown,
    loaded: loadedKeys.size,
    loadMore: sessionsMore ? loadMore : undefined,
    loadingMore,
    gatesMore,
    moreGates,
    needs: rows ? rows.filter((r) => r.group === 'needs').length : 0,
    gatesError: (gatesFail as SourceError | null) ?? null,
    sources,
    folders,
    isPending: first?.isPending ?? true,
    error: (first?.error as SourceError | null) ?? null,
    refetch,
    reread,
  };
}
