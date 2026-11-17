// The "All computers" chat list's state: the list scope, and one change feed per
// followed computer inside the stream budget.
//
// - Scope: This computer (the default) or All computers, kept for the tab (it survives moving between /ai routes) and
//   back to This computer when the account changes or the core starts again.
// - Feed: useChangeFeed(at) asks the stream budget (core/stream-budget.ts) for the computer's change-feed stream (kind
//   changes, rank changes: the computer's reserved slot) and, while it holds it, follows GET /changes/stream: frames
//   update the tokens (allChats.logic applyFrame); a dropped stream keeps the slot and the tokens (not live: the lists
//   re-read slowly) and reconnects after FEED_BACKOFF_MS (once the page is visible again when it is hidden); a stream
//   that is over for good (refused: 4xx, denied) frees the slot and reads as closed until retry().
// - why: pending (no slot answer yet), reconnecting, budget or locks (no slot: better streams, or another tab, hold
//   them), closed, allRealms (GET /changes/stream takes one realm: All realms has no feed and the lists re-read slowly).
//   budget, locks and closed leave the computer's chats unknown: the list names it with the reason and reads nothing.
import { onBump, stream, streamBudget, streamComputer, type StreamBudget, type StreamState, type Watch, type WhyNot } from '@core';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { applyFrame } from './allChats.logic';
import type { Tokens } from './chats.logic';
import { chatRoutes, type ChatsAt } from './data';
import { whenVisible } from './allChats.web';

export type ChatScope = 'here' | 'all';

let scope: ChatScope = 'here';
const scopeSubs = new Set<() => void>();
function setChatScope(v: ChatScope): void {
  if (v === scope) return;
  scope = v;
  for (const l of [...scopeSubs]) l();
}
// A realm switch keeps the choice; anything else that starts the context again (account, sign-out, a new core) drops it.
onBump((reason) => { if (reason !== 'switch' && reason !== 'fallback') setChatScope('here'); });

export function useChatScope(): [ChatScope, (v: ChatScope) => void] {
  const v = useSyncExternalStore((l) => { scopeSubs.add(l); return () => { scopeSubs.delete(l); }; }, () => scope, () => scope);
  return [v, setChatScope];
}

/** Tests only. */
export function resetChatScopeForTests(): void { setChatScope('here'); }

/** The budget entry's key for the chat list's feed (one per computer). */
export const FEED_KEY = 'ai-chats';
/** Reconnect waits after a dropped stream: 1, 2, 5, then 10 s. */
export const FEED_BACKOFF_MS: readonly number[] = [1000, 2000, 5000, 10000];

/** What one connection reports: each frame, and `open`, `down` (dropped: try again) or `over` (refused for good). */
export interface FeedEvents {
  frame(name: string, data: string): void;
  state(s: 'open' | 'down' | 'over'): void;
}
export type FeedConnect = (at: ChatsAt, ev: FeedEvents) => { close(): void };

export type FeedWhy = WhyNot | 'allRealms';
export interface ChatFeed {
  tokens: Tokens | null;
  live: boolean;
  why?: FeedWhy;
  retry(): void;
}

/** GET /changes/stream through kit-io: a 503, a 5xx, a network drop or the stream ending is `down`; any other refusal
 *  (a 4xx: realm not served, not found) is `over`. */
export const connectChanges: FeedConnect = (at, ev) => {
  const h = stream(chatRoutes.changesStream, {
    target: at.target,
    realm: at.realm,
    onEvent: (name: string, data: string) => ev.frame(name, data),
    onState: (s: StreamState) => {
      if (s.state === 'open') ev.state('open');
      else if (s.state === 'error') ev.state(s.status === 0 || s.status === 429 || s.status >= 500 ? 'down' : 'over');
      else if (s.state === 'closed') ev.state(s.reason === 'denied' || s.reason === 'aborted' ? 'over' : 'down');
    },
  });
  if (h.refused) queueMicrotask(() => ev.state('over'));
  return h;
};

// Tests only: a connection to use in place of GET /changes/stream (the fixture transport ends every stream after its
// frames, so a test that needs a feed staying live holds one itself).
let connectForTests: FeedConnect | null = null;
export function setFeedConnectForTests(c: FeedConnect | null): void { connectForTests = c; }

interface FeedView { tokens: Tokens | null; live: boolean; why?: FeedWhy }

export function useChangeFeed(at: ChatsAt, o: { budget?: StreamBudget; connect?: FeedConnect } = {}): ChatFeed {
  const one = at.realm !== 'all';
  const [view, setView] = useState<FeedView>(() => ({ tokens: null, live: false, why: one ? 'pending' : 'allRealms' }));
  const watch = useRef<Watch | null>(null);
  const atRef = useRef(at);
  atRef.current = at;
  const pid = at.target.project.id, cid = at.target.container.id;
  useEffect(() => {
    if (!one) { setView({ tokens: null, live: false, why: 'allRealms' }); return; }
    setView({ tokens: null, live: false, why: 'pending' });
    let gone = false;
    let tokens: Tokens | null = null;
    const budget = o.budget ?? streamBudget();
    const connect = o.connect ?? connectForTests ?? connectChanges;
    const w = budget.watch({
      computer: streamComputer(atRef.current.target), key: FEED_KEY, kind: 'changes', level: 'stream', rank: 'changes',
      open(g) {
        let conn: { close(): void } | null = null;
        let wait: (() => void) | null = null;
        let attempt = 0, over = false;
        const drop = () => { const c = conn; conn = null; c?.close(); };
        const start = () => {
          wait = null;
          if (over || gone) return;
          let mine = true;
          // Not live until the stream says it is open (the budget counts an opened stream as live).
          g.live(false);
          conn = connect(atRef.current, {
            frame(name, data) {
              if (!mine || over || gone) return;
              const t = applyFrame(tokens, name, data);
              if (t !== tokens) { tokens = t; setView((v) => ({ ...v, tokens: t })); }
            },
            state(st) {
              if (!mine || over || gone) return;
              if (st === 'open') { attempt = 0; g.live(true); return; }
              mine = false;
              drop();
              if (st === 'over') { over = true; g.ended(); return; }
              g.live(false);
              const ms = FEED_BACKOFF_MS[Math.min(attempt++, FEED_BACKOFF_MS.length - 1)]!;
              const timer = setTimeout(() => { wait = whenVisible(start); }, ms);
              wait = () => clearTimeout(timer);
            },
          });
        };
        start();
        return { close() { over = true; wait?.(); wait = null; drop(); } };
      },
      onMode(m) {
        if (gone) return;
        setView((v) => (m.mode === 'stream' ? { tokens: v.tokens, live: true } : { tokens: v.tokens, live: false, why: m.why ?? 'pending' }));
      },
    });
    watch.current = w;
    return () => { gone = true; watch.current = null; w.release(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one feed per computer and realm (the target object may be rebuilt)
  }, [one, pid, cid, at.realm]);
  return { ...view, retry: () => watch.current?.retry() };
}
