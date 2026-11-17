// chat-attention.ts: what the shell knows about the AI chats nobody is looking at, so the AI "needs you" dot (TopBar,
// BottomNav, Sidebar: ask useAskWaiting) lights for a chat the AI page let go, and the AI page marks a chat whose turn
// ended after it was left running.
//
// Contract, in plain words:
//   - useChatAttention() is the observer; the shell mounts it once (shell/live.tsx), for every page. It reads GET /gates
//     page 1 of the top bar's computer and realm, through the AI page's own read (chat-lists.ts chatListReads: one query
//     key, so on /ai one read per tick serves both) and its realm rule (chatListRealm: `all`, or the plain listing once
//     the agent refused `all` with 400 realm_scope_unsupported). It reads again SLOW_MS after the last answer, from
//     whoever asked (an AI page re-list counts), while the tab is visible; a hidden tab sends nothing. A failed read
//     waits twice as long each time, up to 16 ticks, and a success resets it.
//   - attentionGates() is what that read found, for the shown account and computer: the gates whose realm the login
//     serves (the realm list; a gate of any other realm, or any gate while the list is unknown, never counts) and not
//     a Bot's own session. The Ask registry ORs "such a gate whose chat no engine holds" into anyWaiting.
//   - Notes (left running): noteLeftRunning() records a chat the last holder let go while its turn ran ({computer, realm,
//     sid}, the time), at most NOTES_MAX per account (the newest kept) and NOTE_TTL_MS each; clearChatNote() drops one
//     when the chat is opened again. While the shown computer has notes, the observer also reads GET /sessions page 1
//     (the AI page's read again) and records each noted chat's state there (`last`). chatNotes() lists them; the AI page
//     marks a noted chat "Turn ended" once it is idle (never "finished": idle follows a failed turn too) and "Closed"
//     once closed.
//   - The notes live in memory, mirrored to session storage (hub_ai_attn_v1, registered, purged at sign-out) for a reload
//     of this tab. Every storage step is wrapped: without storage the notes still work for the page's life.
//   - No browser alert comes from here.
import { SLOW_MS, MAX_BACKOFF, listSource, emit, setFound, countedGates, noteChatStates, useChatNotes } from './chat-attention.pure';
export { SLOW_MS, NOTES_MAX, NOTE_TTL_MS, onChatAttention, chatAttentionRev, useChatAttentionRev, attentionGates, countedGates, noteLeftRunning, clearChatNote, chatNotes, noteChatStates, noteMark, useChatNotes, seedAttentionForTests, resetChatAttentionForTests } from './chat-attention.pure';
export type { AttentionGates, ChatNote } from './chat-attention.pure';
import { useVisible } from './chat-attention.web';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { chatListRealm, chatPlace, markPinned, onPinned, pinnedRev, type ChatGatePage, type ChatListIn, type ChatSessionPage } from './chat-lists';
import { useCurrentComputer } from './computer';
import { queryClient, useCore } from './query';
import { useRealms } from './realms';

// ---- the observer ----
interface Polled { isFetching: boolean; isError: boolean; dataUpdatedAt: number; errorUpdatedAt: number; refetch: () => unknown }
/** Reads `q` again SLOW_MS after its last answer (anyone's), doubled per failure in a row; nothing while `on` is false. */
function useTick(q: Polled, on: boolean): void {
  const last = Math.max(q.dataUpdatedAt, q.errorUpdatedAt);
  const failedLast = q.isError && q.errorUpdatedAt >= q.dataUpdatedAt;
  // Failures in a row, counted once per answer.
  const run = useRef({ last: 0, fails: 0 });
  if (last !== run.current.last) run.current = { last, fails: failedLast ? Math.min(run.current.fails + 1, MAX_BACKOFF) : 0 };
  const wait = failedLast ? SLOW_MS * Math.min(2 ** run.current.fails, MAX_BACKOFF) : SLOW_MS;
  const qRef = useRef(q);
  qRef.current = q;
  useEffect(() => {
    if (!on || !last || q.isFetching) return;
    const id = setTimeout(() => { if (!qRef.current.isFetching) void qRef.current.refetch(); }, Math.max(0, last + wait - Date.now()));
    return () => clearTimeout(id);
  }, [on, last, wait, q.isFetching]);
}

// The place (chatPlace: computer and realm) whose GET /gates page 1 the shell's observer ticks now, or null. Only a list
// of that same place leaves page 1 to it (one read per tick); every other list (another computer followed, a folder's
// own computer or realm) keeps its own timer.
let ticked: string | null = null;
/** The place the shell's observer ticks GET /gates page 1 for now, or null. */
export const chatTickedPlace = (): string | null => ticked;

/** Whether the query under this exact hash has answered (data or error), by this observer or the AI page's. */
function answeredKey(hash: string): boolean {
  const st = queryClient.getQueryCache().get(hash)?.state;
  return !!st && Math.max(st.dataUpdatedAt, st.errorUpdatedAt) > 0;
}

/** The shell's chat-attention observer (see the contract). Mount once. */
export function useChatAttention(): void {
  const core = useCore();
  const target = useCurrentComputer();
  const realms = useRealms();
  const visible = useVisible();
  const account = core.account;
  const on = account !== null && !core.loggingOut && target !== null;
  const shown = realms.selected;
  useSyncExternalStore(onPinned, pinnedRev, pinnedRev);
  const place = target ? chatPlace(target, shown) : '';
  const { realm, here } = chatListRealm(place, shown);
  const fallbackTarget = target ?? { project: { id: '' }, container: { id: '' } };
  const p: ChatListIn = { target: fallbackTarget, realm, page: 1 };
  // TanStack starts only the first load of a key, and only while visible. Once that exact key (account, realm,
  // generation, computer, params) has answered, the observer is disabled and useTick does every re-read (refetch()
  // ignores enabled): neither a show nor a key change while hidden (computer, realm, account, generation) reads, and
  // no read goes past the failure backoff. The cached answer still reaches this hook while disabled.
  const gName = here ? 'chats.gatesHere' : 'chats.gates';
  const gHash = listSource.useQueryHash(gName, p);
  const gq = listSource.useQuery<ChatGatePage, ChatListIn>(gName, p, { enabled: on && visible && !answeredKey(gHash), refetchInterval: false });
  useTick(gq, on && visible);
  useEffect(() => {
    ticked = on && visible ? place : null;
    emit();
    return () => { ticked = null; emit(); };
  }, [on, visible, place]);
  useEffect(() => {
    if (shown === 'all' && !here && gq.error?.code === 'realm_scope_unsupported' && place) markPinned(place);
  }, [shown, here, gq.error?.code, place]);

  // The gates that count, for this account and computer: from the last answer that has not failed since.
  const served = realms.rows ? realms.rows.map((r) => r.id) : null;
  const gates = on && gq.data && !gq.isError ? countedGates(gq.data.gates, shown, served) : null;
  const computer = target?.container.id ?? '';
  const gk = gates ? JSON.stringify(gates.map((g) => [g.realm, g.sid])) : '';
  useEffect(() => {
    setFound(gates && account ? { account, computer, gates } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gk names the gates
  }, [account, computer, gk, gates === null]);
  useEffect(() => () => setFound(null), []);

  // The noted chats of this computer: one sessions read, while there are any.
  const noted = useChatNotes(computer).length > 0;
  const sName = here ? 'chats.sessionsHere' : 'chats.sessions';
  const sHash = listSource.useQueryHash(sName, p);
  const sq = listSource.useQuery<ChatSessionPage, ChatListIn>(sName, p, { enabled: on && noted && visible && !answeredKey(sHash), refetchInterval: false });
  useTick(sq, on && visible && noted);
  const rows = sq.data && !sq.isError ? sq.data.sessions : null;
  useEffect(() => {
    if (rows && account && computer) noteChatStates(account, computer, rows);
  }, [rows, account, computer]);
}
