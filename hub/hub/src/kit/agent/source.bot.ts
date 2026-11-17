// source.bot.ts: the Bot's conversation source. READ-ONLY: it has no send, stop, decide or
// answer, so `isActive()` is false. The host sends to the Bot through its own path (Bots useSay: POST /bots/{id}/messages with
// an Idempotency-Key, read back by key), and the Bot's own gate is the host's one pinned card, so `gates` is always empty here.
//
// Two inputs:
// - the Bot's log, as the host reads it (any page type: the kit never reads its rows), handed back unchanged by `page()`;
// - the live text of the Bot's own session, read through a read-only conversation source (useConversation) on the session the
//   Bot view names NOW. The session id is never cached: when the view names another session (a reset), the old source is let
//   go and no text of the old session shows, not even for the render before the new hold answers. bot.* frames on that session
//   are the Bot runtime's own tool calls; a read-only source never answers them, and none of its gates are taken.
// Stream budget (core/stream-budget.ts): the session stream is held at rank 'bot', the lowest, so under pressure it
// is the FIRST stream closed (its text then arrives with the turn's log row). The log is not a stream here and is never cut.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Action, Capability, CapFacts } from './capability';
import { can as capOf } from './capability';
import { useConversation, type ShownComputer } from './conversations';
import type { ConversationSource, ConvRef, ConvSnapshot } from './source';

/** The live reply of the Bot's current session: its text so far, the session and reply it came from, and whether it ended (a
 *  finished reply stays shown until the log row it becomes arrives, so the text never blinks out between the two). */
export interface BotTail { sid: string; key: string; text: string; done: boolean }

export interface BotSource<P> extends ConversationSource {
  readonly kind: 'bot';
  readonly ref: { bot: string };
  /** The Bot's log page as the host read it (undefined while not read), unchanged. */
  page(): P | undefined;
  /** The reply the Bot's current session is writing now, or null (no session, not streaming, or another session's). */
  tail(): BotTail | null;
}

/** What the host knows of the Bot now. */
export interface BotFeed<P> {
  page: P | undefined;
  /** The Bot's own session as the Bot view names it now; null while the view has none or is not read. */
  sid: string | null;
  /** The Bot's running turn (view.turn_id); null while none runs or the view is not read. */
  turnId: string | null;
  /** The newest Bot reply row the host's log holds (its seq; -1 for none). A finished reply is shown until this moves past the
   *  value it had when that reply started: its row has then arrived and takes its place in the same render. */
  mark: number;
  /** Called once when a reply this source saw streaming ends: the host reads its log now instead of at its next poll. */
  onReplyEnd?: () => void;
}

/** Where the Bot's session lives: the Bot's computer (its handle and shown record) and the Bot's realm. */
export interface BotHome { computer: string; realm: string; at: ShownComputer | null }

const FACTS: CapFacts = {
  mode: 'read',
  backend: 'bot',
  reach: 'ok',
  state: 'idle',
  daemonPaused: false,
  approval: 'unknown',
  firstTurnStarted: false,
  turn: false,
  gate: 'none',
  gateBlocked: false,
  decisionPending: false,
  queued: false,
  children: false,
  shells: false,
  unsettledSends: 0,
  prereq: { journal: false, recovery: false, attachment: false, approver: 'notNeeded' },
};

const EMPTY: ConvSnapshot['blocks'] = Object.freeze([]);
const NO_GATES: ConvSnapshot['gates'] = Object.freeze([]);

/** The live reply in a session snapshot: its last block, while it is a reply still streaming. */
export function streamingReply(s: ConvSnapshot | null): { key: string; text: string } | null {
  const last = s?.blocks[s.blocks.length - 1];
  return last && last.k === 'reply' && last.streaming && !last.final && last.text !== '' ? { key: last.key, text: last.text } : null;
}
export const streamingText = (s: ConvSnapshot | null): string | null => streamingReply(s)?.text ?? null;

/** The reply `key` as the snapshot holds it now, once it is no longer streaming (its final text), else null. */
export function endedReply(s: ConvSnapshot | null, key: string): string | null {
  const b = s?.blocks.find((x) => x.k === 'reply' && x.key === key);
  return b && b.k === 'reply' && !b.streaming && b.text !== '' ? b.text : null;
}

/** The streaming tail to show: only from a source on the session the Bot names now. */
export function tailOf(sid: string | null, session: ConversationSource | null, snap: ConvSnapshot | null): BotTail | null {
  if (sid === null || session === null || snap === null) return null;
  const ref = session.ref as Partial<ConvRef>;
  if (ref.sid !== sid) return null;
  const r = streamingReply(snap);
  return r === null ? null : { sid, key: r.key, text: r.text, done: false };
}

/** A reply this source saw: the mark the host's log had when it started, and its text (final once `done`). */
interface Seen { src: string; sid: string; key: string; text: string; done: boolean; mark: number }

/** What shows: nothing once the log mark has moved past the one the reply started at (its row has arrived and takes its place,
 *  whether or not the session has said the reply ended: a closed or reconnecting stream can still read "streaming"); else the
 *  streaming tail; else the finished reply of this session whose row has not arrived. Pure, so the frame the row arrives in is
 *  the frame the reply leaves. `seen` is the reply as recorded for this render (`now`), or null. */
export function shownTail(live: BotTail | null, seen: Seen | null, sid: string | null, mark: number): BotTail | null {
  if (seen && seen.sid === sid && mark > seen.mark && (!live || live.key === seen.key)) return null;
  if (live) return live;
  if (!seen || seen.sid !== sid) return null;
  return { sid: seen.sid, key: seen.key, text: seen.text, done: seen.done };
}

const nothing = () => () => undefined;
const none = (): ConvSnapshot | null => null;

/** The Bot's source while the component is mounted. `home` null: the Bot's computer is not known yet (no live text). */
export function useBotSource<P>(bot: string, feed: BotFeed<P>, home: BotHome | null): BotSource<P> {
  const { page, sid, turnId, mark, onReplyEnd } = feed;
  const computer = home?.computer ?? null;
  const realm = home?.realm ?? null;
  const ref = useMemo<ConvRef | null>(() => (computer && realm && sid ? { computer, realm, sid } : null), [computer, realm, sid]);
  const session = useConversation(ref, home?.at ?? null);
  // Rank 'bot' as soon as the hold answers: an unwatched hold counts as 'dock' and would outrank chat streams.
  useEffect(() => { session?.watch('stream', 'bot'); }, [session]);
  const snap = useSyncExternalStore(session ? session.subscribe : nothing, session ? session.snapshot : none, session ? session.snapshot : none);
  const live = tailOf(sid, session, snap);
  // The reply last seen streaming, kept (in the render, from the snapshot) once it ends, until its log row arrives. It belongs to
  // one source: the Bot's computer, realm and session, with the hold answering. When any of that changes (the tab left, the
  // computer unknown, another session), it is dropped in that render and the effect below discards it.
  const [seen, setSeen] = useState<Seen | null>(null);
  const srcKey = ref && session ? `${ref.computer}|${ref.realm}|${ref.sid}` : null;
  const cur = seen && srcKey !== null && seen.src === srcKey && seen.sid === sid ? seen : null;
  const ended = !live && cur && !cur.done ? endedReply(snap, cur.key) : null;
  const now: Seen | null = live
    ? { src: srcKey ?? '', sid: live.sid, key: live.key, text: live.text, done: false, mark: cur && cur.key === live.key ? cur.mark : mark }
    : cur && ended !== null ? { ...cur, text: ended, done: true } : cur;
  const endRef = useRef(onReplyEnd);
  endRef.current = onReplyEnd;
  // Record what was seen when it changes; call onReplyEnd once, on the render a seen reply turns done.
  const nSrc = now?.src ?? null;
  const nSid = now?.sid ?? null;
  const nKey = now?.key ?? null;
  const nText = now?.text ?? null;
  const nDone = now?.done ?? false;
  const nMark = now?.mark ?? -1;
  const seenRef = useRef<Seen | null>(seen);
  useEffect(() => {
    const prev = seenRef.current;
    if (nSrc === null || nSid === null || nKey === null || nText === null) {
      if (prev !== null) { seenRef.current = null; setSeen(null); }
      return;
    }
    if (prev && prev.src === nSrc && prev.sid === nSid && prev.key === nKey && prev.text === nText && prev.done === nDone && prev.mark === nMark) return;
    const next: Seen = { src: nSrc, sid: nSid, key: nKey, text: nText, done: nDone, mark: nMark };
    seenRef.current = next;
    setSeen(next);
    if (nDone && !(prev && prev.sid === nSid && prev.key === nKey && prev.done)) endRef.current?.();
  }, [nSrc, nSid, nKey, nText, nDone, nMark]);
  const tail = shownTail(live, now, sid, mark);
  const tSid = tail?.sid ?? null;
  const tKey = tail?.key ?? null;
  const tText = tail?.text ?? null;
  const tDone = tail?.done ?? false;
  return useMemo<BotSource<P>>(() => {
    const shown: BotTail | null = tSid !== null && tKey !== null && tText !== null ? { sid: tSid, key: tKey, text: tText, done: tDone } : null;
    const facts: CapFacts = { ...FACTS, turn: turnId !== null, state: turnId !== null ? 'running' : 'idle' };
    const snapshot = (): ConvSnapshot => ({ facts, title: null, blocks: EMPTY, gates: NO_GATES, ...(turnId !== null ? { turnId } : {}) });
    return {
      kind: 'bot',
      ref: { bot },
      snapshot,
      subscribe: session ? session.subscribe : nothing,
      // The session stream's rank is fixed ('bot'); a holder of this source does not change it.
      watch: () => undefined,
      can: (a: Action): Capability => capOf(a, facts),
      page: () => page,
      tail: () => shown,
    };
  }, [bot, page, turnId, session, tSid, tKey, tText, tDone]);
}
