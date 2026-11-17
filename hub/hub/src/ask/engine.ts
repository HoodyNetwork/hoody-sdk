// engine.ts: one Ask conversation's life on one computer. It owns the network (through AgentIO), the stream, the timers
// and the record in hub_ask_v1, and
// publishes an immutable snapshot that the panel draws (subscribe/getSnapshot, for useSyncExternalStore).
//
// Rules:
//   - nothing is sent before the person presses Send; typed text stays in memory;
//   - every mutation carries its key; an unknown outcome keeps key and text, and Check status repeats exactly
//     that (create: k1 + the stored body; a turn: its key; a follow-up: its command key) (C9). Once a message may
//     have reached the agent it never goes out under another key: a definite refusal of a replay keeps it
//     unknown, and Send again reuses the key. A follow-up's key (and its command id once queued) is stored
//     (k3, c3): after a reload its row is read back by id, or dismissed, and never takes new typing. A reused key
//     (422) never reads as Not sent; a follow-up older than 12 h is never sent again (the agent forgets its key);
//   - switched Off, nothing goes out until a read of the session taken now says Off;
//   - a decision names the gate the person saw (id + generation + request id) and stays pending until the agent
//     answers; a lost answer is read back (Check status), never sent again on its own;
//   - Escape never stops or denies; a stopped turn says earlier steps may have run;
//   - the engine ends when the account, realm generation or computer it was made for is gone: on its next
//     network step, or at once when core bumps the generation (registry.ts calls checkAlive).
import * as A from './attach';
import * as C from './conv';
import type { AgentIO, StreamHandlers } from './data';
import { approvalModeOf, leaseRoutes } from './data';
import * as F from './fork';
import { ForkRecovery, checkAnswer, drainReplyPending, markMaking, type ForkRow } from './forkRecovery';
import * as G from './gates';
import * as L from './logic';
import type { AskRecord, AskStore, Gate } from './logic';
import { agent, RANKS, type Level, type Rank, type Target, type Ticket } from '@core';
import { tix, type ApproverHandle, type ApproverRef } from '@kit/agent/approver';
import { approvers } from '@kit/agent/approver-live';
import { parseRateLimit, rateLimitSupersedes, type RateLimitReading } from '@kit/agent/rateLimit';
import type { WithdrawOutcome } from '@kit/agent/source';
import { canWithdraw, fileCount } from './rowActions';
import { clearCandidates, idleKeys, judgeVerification, stillClearable, type ClearEnv, type ClearKey, type ClearOutcome, type ClearPlan } from './recentClear';
import { SendToken, currentAccount, dismissal, dockLockAvailable, forkLockName, guardIO, holdChatLock, holdIfFree, legacyRead, okHandle, stripEvidence, type Accepts, type Entry, type ForkHold, type Late, type Settled as JournalSettled, type FirstState, type JRec, type Journal, type NotSentWhy, type Op, type Verdict } from './journal';

/** A journaled send that never left (nothing was sent and its entry is gone). */
class NotSentErr { constructor(readonly why: NotSentWhy) {} }
/** What is proven of one decision request (decisionProof). */
export type DecisionProof = 'applied' | 'refused' | 'elsewhere' | 'chatElsewhere' | 'notKept' | 'notTaken';
/** A fork reply that PROVES another binding: checkStarted MISMATCH on what is known. While this page's owner is not known yet (empty),
 *  the owner is not compared (the reply stays unknown, as before), so only a proven realm or computer mismatch, or an owner mismatch
 *  against a known owner, refuses and marks the key for good. */
export function forkBoundElsewhere(b: unknown, want: { realm: string; container: string; owner: string }): boolean {
  if (want.owner) return L.checkStarted(b, want) === 'MISMATCH';
  const s = L.isObj(b) && L.isObj(b.started) ? b.started : null;
  const got = s && typeof s.owner_fingerprint === 'string' ? s.owner_fingerprint : '';
  return got !== '' && L.checkStarted(b, { ...want, owner: got }) === 'MISMATCH';
}
/** A journaled send that left: its verdict (settled and admitted ones resolve instead) and the raw rejection, if any. */
class SentErr { constructor(readonly v: Verdict, readonly e: unknown) {} }
/** What sendJ copies out of the door's outcome: the verdict, what its settlement returned, and (after a cancel that found the call claimed) the call's own settlement. */
interface SendOut { v?: Verdict; settled?: JournalSettled; late?: Promise<Late> }

export interface Clock {
  now(): number;
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
  random(n: number): Uint8Array | null;
}
export const realClock: Clock = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  random: (n) => { const b = new Uint8Array(n); try { crypto.getRandomValues(b); return b; } catch { return null; } },
};

export interface Slot {
  account: string;
  project: string;
  computer: string;
  /** The top bar's realm: a 24-hex id, 'global', or 'all'. */
  realm: string;
  /** The computer's display name (a label for the person; never a host). */
  name: string;
  /** The SERVER the computer runs on (`container.server_name`): the host label the agent's address is built from. Absent while
   *  it is not known; the engine then reaches no agent (core/hosts.ts makes no address) rather than a guessed host. */
  server?: string;
}

/** The one place a Target is made from a slot's parts: the server (never the display name) is the container's `server_name`,
 *  and an unknown server names none. */
export function targetOf(project: string, id: string, server?: string): Target {
  return { project: { id: project }, container: server ? { id, server_name: server } : { id } };
}

export interface StoreBase {
  read(account: string): AskStore;
  /** Runs fn while no other tab of this browser runs one (navigator.locks). Absent, or when it rejects before running fn: fn runs
   *  unlocked (the agent still refuses a second decision as pending). A rejection after fn ran (fn threw) runs nothing again. */
  lock?(fn: () => void): Promise<void>;
}
/** A store that takes snapshots: a journal view (one session's record) and the in-memory test store. */
export interface WriteStore extends StoreBase {
  /** false when the browser did not keep it (storage blocked or full); anything else counts as kept. A journal view's write answers with a
   *  PROMISE of the same (the record lock is asynchronous): that is pending, not kept - only a caller that awaits it may treat it as kept. */
  write(account: string, st: AskStore | null, opts?: { admit?: string }): boolean | void | Promise<boolean>;
  apply?: never;
}
/** The dock's shared store: ONE per-key operation at a time, applied to the fresh stored list. It has no snapshot path, so no caller can hand
 *  it a view that would drop a record another tab added. */
export interface ApplyStore extends StoreBase {
  /** One change to one record. false: not kept; 'recentFull': refused by the capacity rule (nothing written). */
  apply(account: string, op: C.DockOp): C.DockAnswer | Promise<C.DockAnswer>;
  write?: never;
}
export type StoreIO = WriteStore | ApplyStore;

/** The column's state when there is no usable conversation yet. */
export type Blocked = { key: string; act: 'retry' | 'agent' | 'none'; tone: 'warn' | 'bad' | 'muted'; agent: boolean };
export type Band =
  | { k: 'stopped' }
  | { k: 'starting' }
  | { k: 'provisioning' }
  | { k: 'unreachable' }
  | { k: 'lost' }
  | { k: 'busy' }
  | null;

/** `errE`: the rejection behind `err` when the session refused the switch with an error of its own (the note's Details); it is
 *  meaningful only while `err` is set, and absent for the notes with no rejection (an unread mode, an answer that differs). */
export interface AutoState { cap: boolean; on: boolean | null; busy: boolean; err: string; errE?: unknown; note: string }
/** One parked approval or question as the panel draws it. `decision`: this page's answer to it is on its way
 *  (sending) or its outcome was lost (unknown): no second decision until the agent's own evidence settles it.
 *  `addressing`: the agent reported it before its answerable identity: shown, not answerable yet. `helper`: a
 *  helper's gate, answered in the Agent. */
/** `held`: no decision can go from this card yet: one is waiting for the cross-tab lock (claiming), or K3_MAX
 *  decisions are unsettled (full). */
export interface CardView { key: string; gate: Gate; helper: boolean; addressing: boolean; decision: 'sending' | 'unknown' | null; held: 'claiming' | 'full' | null; decidable: boolean }
/** How a page's start went: the agent took it, nothing reached the agent, or it may have (C9). */
export type StartOutcome = 'sent' | 'notSent' | 'unknown';
/** Hears how a start went, with the row its first message went as (null: no row was made, nothing left). */
export type StartTell = (o: StartOutcome, row: string | null) => void;

export interface RecentRow { k1: string; title: string; at: number; ph: string; current: boolean }

export interface Snapshot {
  phase: 'checking' | 'ready' | 'blocked' | 'ended';
  blocked: Blocked | null;
  band: Band;
  starting: boolean;
  conv: C.Conv;
  status: C.Status;
  /** Every gate the session holds, oldest first (the session's own evidence decides this list, never a turn). */
  gates: CardView[];
  /** The session's approval mode could not be read and a gate is parked: it is held to the strict rule, and Check again reads it (checkMode). */
  modeUnread?: true;
  /** The first of the lead's own cards (the composer's note, the "needs you" dot). */
  gate: Gate | null;
  /** The chat is shown from what this browser remembers while the agent is asked what happened meanwhile (loadPhase `catching_up`):
   *  a turn shown at an open whose receipt has not said yet whether it still runs, or a turn that ended unseen being read back from
   *  the transcript. Nothing is proven running. */
  catchingUp?: true;
  /** `notKept`: the last decision was not sent because the journal did not keep its record (nothing left; decide again).
   *  `elsewhere`: it was not sent because this chat's create key is marked bound elsewhere (nothing more is sent to it from here). */
  decision: { pending: boolean; unknown: boolean; notKept?: boolean; elsewhere?: true };
  /** The agent has no live session for this conversation now (nothing runs, nothing can be parked). */
  dormant: boolean;
  /** The open gate came from this turn's frames and nothing here can answer it (policy changed). */
  checking: boolean;
  /** A stream that was open broke and has not opened again (streamLost): only then is a catch-up told as "Reconnecting…"
   *  (source.ts showsReconnecting). Absent = true (snapshots built by hand keep the old wording). */
  streamBroke?: boolean;
  auto: AutoState;
  needLogin: boolean;
  /** Follow-ups while a turn runs (POST /sessions/{id}/commands) are supported by this agent. */
  followUps: boolean;
  recent: RecentRow[] | null;
  /** Recent is full of conversations that are still running or waiting to be checked, so this one is not listed there yet (a refused dock save). */
  recentFull?: true;
  version: unknown;
  /** Send can work now (see canSend). */
  sendable: boolean;
  /** A page's text owes a new conversation, but a first message that may exist still stands: nothing goes over it until it is checked. */
  freshHeld?: true;
  /** Send held a message that may duplicate a waiting follow-up (the composer offers Send anyway): `earlier` when the
   *  waiting row lost its text in a reload, so it cannot be compared. */
  dup: { text: string; earlier: boolean } | null;
  /** The draft's images and text files, why the last files picked were not added, why a draft's files
   *  were let go (a strings key, or ''), and whether picked files are still being read. In memory only. */
  att: { items: A.Att[]; refused: A.Refusal[]; dropped: string; reading: boolean };
  /** While the conversation has no session yet (a first message whose create may not have left), the key the journal files that
   *  message under: the CREATE key, not the row's turn key. Once the session exists the row's own key is its request (kind turn). */
  createKey?: string;
  /** Details > Usage: the turns this page saw stream with counts in this session (C.usageTurns), kept across a rebuild from the
   *  transcript and the same chat opened again (C.mergeUsage). Absent on a snapshot not built by the engine: read from `conv`. */
  usage?: readonly C.UsageEntry[];
  /** The Claude Code account's last usage-limit reading (event.rate_limit, or the event.replay snapshot's rate_limit) for this
   *  conversation's session, absent until one arrives. Account state: kept across /clear, a new incarnation and a lagged stream;
   *  only a reading that supersedes it replaces it, and nothing clears it (the chip ages each window out at its reset). Another
   *  conversation opened in this slot starts with none. */
  rateLimit?: RateLimitReading;
  /** The turn the agent's last applied /state named (null: none), since this conversation was (re)opened here; absent until one
   *  was applied. Until the turn shown agrees with it, the turn shown may come from the stored record only (a turn another tab
   *  started is not in it, and a stored turn's receipt can end it first), so it is no proof that a turn ended. */
  stateTurn?: string | null;
}

/** The files a Retry carries: the failed message's own. */
type Carry = Pick<C.UserMsg, 'imgs' | 'files'>;
/** Why a message that had to wake its chat first did not go, by the wake's answer. */
const wakeReason = (a: 'failed' | 'helperGates' | 'gone'): string => (a === 'helperGates' ? 'ask.helperGatesOff' : a === 'gone' ? 'ask.attachGone' : 'ask.attachFailed');
const hasAtt = (u: Carry): boolean => !!(u.imgs?.length || u.files?.length);
const carried = (c: Carry): Carry => ({ ...(c.imgs?.length ? { imgs: c.imgs } : {}), ...(c.files?.length ? { files: c.files } : {}) });
/** History users read again: each one that is a message sent from here with files (its text plus fences) keeps that
 *  message's typed text and file chips. The history carries no message ids, so messages are matched by the text the
 *  agent got, in order, counting the ones sent without files too: the n-th sent "look" is the n-th "look" row. When
 *  the counts differ (another tab sent the same text, or a row is missing), no row of that text gets chips: a chip is
 *  never moved onto another message. A picture the history row itself names (a stored one) is never drawn twice. */
export function keepAtt(hist: readonly C.UserMsg[], had: readonly C.UserMsg[]): C.UserMsg[] {
  const group = <T,>(xs: readonly T[], key: (x: T) => string): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const x of xs) { const k = key(x); const g = m.get(k); if (g) g.push(x); else m.set(k, [x]); }
    return m;
  };
  const sent = had.filter((u) => u.state === 'sent').sort((a, b) => a.at - b.at);
  const rows = group(hist.map((h, i) => ({ h, i })), (r) => r.h.text);
  const out = [...hist];
  for (const [text, us] of group(sent, (u) => A.messageText(u.text, u.files))) {
    const rs = rows.get(text);
    if (!rs || rs.length !== us.length || !us.some(hasAtt)) continue;
    us.forEach((u, j) => {
      const r = rs[j] as { h: C.UserMsg; i: number };
      if (!hasAtt(u)) return;
      // The history row may name the same pictures as stored ones (the agent's record of them). One picture is drawn once: the
      // chips sent from here stand for them when the counts agree (nothing is read again); otherwise the agent's record is what
      // was sent, so its pictures stay and this page's image chips are not put beside them. Text files are carried either way.
      const c = carried(u), stored = r.h.pics?.length ?? 0;
      if (!stored || !c.imgs?.length) { out[r.i] = { ...r.h, text: u.text, ...c }; return; }
      const { pics: _pics, ...row } = r.h;
      out[r.i] = c.imgs.length === stored ? { ...row, text: u.text, ...c } : { ...r.h, text: u.text, ...(c.files ? { files: c.files } : {}) };
    });
  }
  return out;
}

const READ_MS = 20000, WAKE_MS = 3000, START_POLL_MS = 5000, START_POLLS = 36;
const RECEIPT_POLL_MS = 1500, RECEIPT_POLLS = 20, STOP_POLL_MS = 2000, STOP_POLLS = 45, PAINT_MS = 40;
/** No frame for this long while the panel watches: the session is read again (a silent stream, another tab's work). */
const QUIET_MS = 30000;
/** What a new conversation arms on its first send. */
const AUTO_DEFAULT = true;
/** A dormant session is read again this often while the panel is open. */
const DORMANT_MS = 30000;
/** Without a stream (watch level `state`, or a stream the budget refused), the session's state is read this often. */
const STATE_MS = 5000;
/** Sessions with counts whose Details > Usage turns a UsageLedger keeps (Snapshot.usage); the one folded longest ago goes first. */
export const USAGE_SESSIONS = 32;
/** Wake-ups (visibility, online, another tab's store write) read the session at most this often. */
const WAKE_GAP_MS = 2000;

type Settled<T = unknown> = { ok: true; b: T } | { ok: false; e: unknown };
function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  return p.then((b) => ({ ok: true as const, b }), (e: unknown) => ({ ok: false as const, e }));
}
/** Whether a turn's receipt state says the agent closed it (completed, failed, cancelled): every close saves the transcript with the
 *  turn's boundary before the receipt says so, so a transcript read after such a receipt holds the turn. Not `interrupted`: a turn
 *  the agent lost at a restart never closed, and its prompt may be the transcript's only trace of it. */
function closedState(v: unknown): boolean {
  return L.isTerminalState(v) && v !== 'interrupted';
}
function lostAnswer(e: unknown): boolean {
  const x = L.isObj(e) ? e : null;
  return !x || x.pending === true || typeof x.status !== 'number' || x.status === 0 || x.status >= 500;
}
/** The record's failed turn is still the agent's newest (so the transcript's last turn is that failed turn). */
export function tailFailed(want: string, newest: { id: string; state: string } | null | 'bad'): boolean {
  return !!newest && newest !== 'bad' && newest.id === want && newest.state === 'failed';
}
/** Whether the transcript's last turn is the record's failed turn, from two turn-list reads taken before and after the
 *  transcript read (so another client's newer turn cannot slip in between). true only when both name `want` as the
 *  newest turn and failed, with the same error code; false when both agree on something else (another newest turn, or
 *  no turn); 'unsure' when they disagree or either failed: never shown as failed or done (C9). */
export function tailVerdict(want: string, a: { id: string; state: string; code?: string } | null | 'bad', b: { id: string; state: string; code?: string } | null | 'bad'): boolean | 'unsure' {
  if (a === 'bad' || b === 'bad') return 'unsure';
  if (!a || !b) return !a && !b ? false : 'unsure';
  if (a.id !== b.id || a.state !== b.state || (a.code ?? '') !== (b.code ?? '')) return 'unsure';
  return tailFailed(want, a);
}
/** The newest entry of a turn list (newest first): {id, state, code} (code: its error_code, '' when absent); null for an
 *  empty list; 'bad' for a read that failed or a malformed entry (never read as "no turn"). */
const LEDGER_STATES: Readonly<Record<string, 1>> = { accepted: 1, dispatched: 1, completed: 1, failed: 1, cancelled: 1, interrupted: 1 };
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
function newestTurn(r: Settled): { id: string; state: string; code: string } | null | 'bad' {
  const items = r.ok && L.isObj(r.b) && Array.isArray(r.b.turns) ? (r.b.turns as unknown[]) : null;
  if (!items) return 'bad';
  if (!items.length) return null;
  const t0 = items[0];
  // A state outside the ledger's own words is a malformed read, never one that could agree with another.
  if (!(L.isObj(t0) && L.seg(t0.turn_id) && typeof t0.state === 'string' && own(LEDGER_STATES, t0.state))) return 'bad';
  // A code that is present but not a string is a malformed read, never one that could agree with another.
  if (own(t0, 'error_code') && typeof t0.error_code !== 'string') return 'bad';
  return { id: t0.turn_id, state: t0.state, code: typeof t0.error_code === 'string' ? t0.error_code : '' };
}
/** What the agent holds under a turn key: `hit` (the turn that key admitted), `miss` (nothing under it, which proves nothing: the request may still
 *  be on its way), `bad` (not read, or not readable: never "no turn") or `stale` (the record or its key moved while the read was out: the
 *  answer is about a key this conversation no longer holds, so it is applied nowhere). The turn list names no key, so it never stands in for this. */
type KeyedTurn = { k: 'hit'; id: string; state: string } | { k: 'miss' } | { k: 'bad' } | { k: 'stale' };
function codeOf(e: unknown): string {
  if (!L.isObj(e)) return '';
  if (typeof e.code === 'string') return e.code;
  const d = L.isObj(e.data) ? e.data : null;
  return d && typeof d.code === 'string' ? d.code : '';
}

/** The wait for the chat lock ends after this long: nothing is sent and the row says so. */
const LOCK_WAIT_MS = 10000;
const forkTarget = (h: string, r: string, parent: string, idx: number | null): string => `${h}|${r}|${parent}|${idx === null ? 'all' : idx}`;
/** The fork creates in flight, per journal (every engine on the page shares them): a press on a target while one is unsettled joins it, whichever
 *  engine (the dock's, a pinned chat's, a reopened one) made it. */
const forkFlights = new WeakMap<Journal, Map<string, Promise<F.ForkOutcome>>>();

/** Check status re-sends a follow-up only this long after it was sent (the agent keeps its key 24 h after it settles). */
const FOLLOW_CHECK_MS = 12 * 3600 * 1000;

/** Sign-ins that may have gone through (core answered signed in, unknown, or dropped the call when the Hub moved away), by
 *  account and computer, for the life of the page: never a second sign-in for them (C9). A later send only reads the agent's
 *  status; a ready read of that agent taken after the hold was recorded lets it go, whichever read it is (the
 *  open, a realm check or the read after a send). Module-wide, so a new engine for the same computer keeps it.
 *  Each hold keeps its place in `signSeq`; a read notes `signSeq` when it starts, so a read already out before
 *  the hold (an answer from before the sign-in) never lifts it. */
const signHeld = new Map<string, number>();
let signSeq = 0;
/** Tests only. */
export function resetSignHoldsForTests(): void { signHeld.clear(); signSeq = 0; }

/** What a recovery that proved nothing tells the person (journal/recover.ts `check`): the verdict's machine reason, never its text. */
function unknownReason(why: string): string {
  switch (why) {
    case 'heldElsewhere': return 'ask.sendingElsewhere';
    case 'inFlight': return 'ask.createStarting';
    case 'allocatedNoSession': return 'ask.createMayExist';
    case 'noId': case 'noEntry': case 'wrongDestination': case 'noDestination': case 'noKeyRead': case 'admittedUnknown': case 'retiredUnknown': return 'ask.noResend';
    default: return 'ask.checkFailed';
  }
}

/** The ONE predicate for "this key never reached the agent": parsed evidence in the record (na), never the person's dismissal (dk). */
const notAdmitted = (rec: { na?: string[] }, key: string): boolean => !!key && (rec.na ?? []).includes(key);

/** The Details > Usage turns each session's views listed (C.mergeUsage), memory only: of the sessions with counts, the USAGE_SESSIONS
 *  folded most recently, by the caller's key (account, computer and session). One per page (registry.ts), shared by its engines. */
export class UsageLedger {
  private m = new Map<string, C.UsageEntry[]>();
  /** `now` (C.usageTurns of a view of session `key`) merged into what was kept for it, kept, and returned. */
  fold(key: string, now: readonly C.UsageEntry[]): C.UsageEntry[] {
    const had = this.m.get(key);
    // A session with nothing counted takes no place: only one with counts can push another out.
    if (!had && now.length === 0) return [];
    const merged = C.mergeUsage(had ?? [], now);
    this.m.delete(key);
    this.m.set(key, merged);
    while (this.m.size > USAGE_SESSIONS) this.m.delete(this.m.keys().next().value as string);
    return C.shownUsage(merged);
  }
}

export class AskEngine {
  private readonly io: AgentIO;
  private readonly store: StoreIO;
  private readonly clock: Clock;
  readonly slot: Slot;
  private gen = 0;
  private timers: unknown[] = [];
  private es: { close(): void; setRank?(r: Rank): void } | null = null;
  private listeners = new Set<() => void>();
  private snap: Snapshot;
  private paintQueued = false;
  // flow state
  private version: unknown = null;
  private rd: L.Readiness | null = null;
  private realm = '';
  private computerRealms: string[] | null = null;
  private rec: AskRecord | null = null;
  private conv: C.Conv = C.emptyConv();
  private conn = { lost: false, reconnecting: false };
  /** True from a stream's loss (streamLost) until a stream opens again; a deliberate close (dock closed, watch level
   *  lowered) and a reset clear it. Every catch-up keeps `conn.reconnecting` (the turn's state is unsure, so the chat shows
   *  loading), but only this says a connection broke (Reconnecting…): a slow first read or a reopened dock is not one. */
  private broke = false;
  /** The current stream said open (its `open` handler ran): a loss of it is a broken connection; a stream that never opened is not. */
  private esOpen = false;
  private cgen = 0;
  private syncing = 0;
  private stateTurn: string | null | undefined = undefined;
  /** The usage-limit reading and the session whose frames gave it: a reading belongs to that session (the daemon keeps one per
   *  session), so another conversation picked or started in this slot never shows it. */
  private rl: { sid: string; r: RateLimitReading } | null = null;
  private syncN = 0;
  private again = false;
  /** A fresh resync was asked for while one was out: it runs when that one answers (one resync read at a time). */
  private syncOwed = false;
  /** The owed resync is the person's Check (it is not gated at off). */
  private syncOwedExplicit = false;
  /** The generation whose receipt read is in flight (0: none): a reset's new conversation is never held by it. */
  private reading = 0;
  /** The turn whose receipt `reading` is out for: a read of an older turn never holds back the current one's. */
  private readingTurn = '';
  private rpolls = 0;
  /** The session's gates (gates.ts): the only source of the cards. */
  private book: G.Book = G.emptyBook();
  /** This page's decisions not settled yet, by gate id: never a second one while one is out or unknown. */
  /** Decisions whose outcome this page does not know, by gate key. `own`: this page sent it (and stores it); the others
   *  came from the stored record (another tab, or this tab before a reload) and stay only while the store holds them.
   *  `tok`: the order token when the attempt became known here (a snapshot issued after it can retire it). */
  private attempts = new Map<string, { rid: string; status: 'sending' | 'unknown'; kind: C.Decided['kind']; tool: string; text: string; said?: Said; own: boolean; tok: number; done?: boolean }>();
  /** Request ids of decision attempts settled here: a merge with another tab's record never brings them back. A
   *  later attempt on the same gate has its own request id, so it is kept. */
  private goneRid = new Set<string>();
  /** Settlements made here that the store does not hold yet (the next write adds them): gates seen to end (dg), and
   *  per gate a definite refusal that left it answerable, or its end, which clears that (dr). */
  private dgNew: string[] = [];
  private drOps: [string, string | null][] = [];
  /** A decision this page settled. `refused`: a definite refusal, the gate stays answerable; otherwise the gate is over
   *  (answered, or it ended). A held card (no request id of its own) only passes the gate's end on. */
  private settleRid(key: string, rid: string, refused = false): void {
    if (rid) this.goneRid.add(rid);
    if (refused) this.drOps.push([key, rid]);
    else { this.dgNew.push(key); this.drOps.push([key, null]); }
  }
  /** Gates whose decision is waiting for the cross-tab lock: no second click goes meanwhile. */
  private claiming = new Set<string>();
  /** Request ids whose claim waits for the cross-tab store lock: nothing of them is sent, attempted or proved yet. */
  private claimRids = new Set<string>();
  // Snapshot order: every /state read records the token current when it went out; a snapshot reaches the book only
  // when it went out after the last applied snapshot (or decision answer) arrived, so the book never takes an older
  // view after a newer one (two reads can carry the same watermark, which is read before the content).
  private tokN = 0;
  private appliedTok = 0;
  private dormant = false;
  // The reconcile loop: one read of /state in flight; a trigger meanwhile asks for one more pass after it.
  private rcBusy = false;
  private rcDirty = false;
  private rcFail = 0;
  private rcTimer: unknown = null;
  private rcWhy = new Set<string>();
  private quietT: unknown = null;
  private auto: AutoState = { cap: false, on: null, busy: false, err: '', note: '' };
  // Approve automatically starts On for a NEW conversation: the first send arms it through the session's own answer, so its first action already runs in the
  // chosen mode. A conversation that already exists is never switched On for the person (reopen and endStart start Off),
  // and turning it back On by hand after Off asks first (the Composer's confirm). Off is guarded (turnOut): nothing that
  // can start a turn goes out before the session confirms Off. An On the session shows that this page did not arm (another
  // client's) is put Off before the next turn, visibly: the chip turns Off with its note. Any Off seen ends the wish; a
  // refused or unconfirmed On ends it too (a locked or Strict policy), and the chip says why.
  // One narrow exception (StartOpts.askFirst, New workflow's start): that start goes Off so the person sees the workflow on its save
  // card. That is a usability choice, a review step they asked for, not containment; the same Off guard applies, and they can turn
  // it On in the Agent panel (the chat page has no switch). autoAside keeps the wish that start set aside and gives it back when that
  // conversation is left, so the next start gets the choice from before, not the default.
  private wantAuto = true;
  private autoAside: boolean | null = null;
  /** A page's start waiting to be sent or watched, and a prefill's owed new conversation. */
  private pend: { text: string; tell: StartTell; uid: string | null; told: StartOutcome | null; opts?: L.CreateOpts; askFirst?: true } | null = null;
  // A start's explicit choices while its send() runs (nextOpts), then by its row (rowOpts), and each create's options by its
  // key k1 (createOpts); in memory only: a reload recovers by reading, never by sending again.
  private nextOpts: L.CreateOpts | null = null;
  private rowOpts = new Map<string, L.CreateOpts>();
  private createOpts = new Map<string, L.CreateOpts>();
  /** Each first-message row's create key, once its record is made (read by the start provider: the key a start keeps). */
  private rowKey = new Map<string, string>();
  private freshOwed = false;
  /** The slot's stored conversation has been picked up (or there was none) since the last open(): a new
   *  conversation made before that would be replaced by the stored one when it is. */
  private loaded = false;
  private pumping = false;
  private pumpQueued = false;
  // Mode reads in issue order: an answer older than one already applied is stale (it may say On after Off).
  private readN = 0;
  private readApplied = 0;
  /** The session auto.on was read from: an answer counts only for that session (Off in B is not Off in A). */
  private autoSid: string | null = null;
  /** Moves at each Off/On request: an approval read started before it answers about the past and is ignored. */
  private autoSeq = 0;
  /** The switch writes still out (setAuto's `outcome`, each a once): every one ends exactly once, by its own answer or by reset(). */
  private autoWrites = new Set<(o: 'answered' | 'unknown') => void>();
  private suspended = false;
  /** What the holders ask of the stream (setWatch; the registry's aggregate for a pinned engine). The dock's own engine stays at stream/dock. */
  private wLevel: Level = 'stream';
  private wRank: Rank = 'dock';
  /** The rank the open stream was asked at. */
  private esRank: Rank | null = null;
  /** The budget (or another tab's locks) gave the stream no slot: it is waited for with state reads, and a good read is the
   *  recovery (not a lost connection). Cleared when a stream opens or is lost for another reason. */
  private budgetWait = false;
  /** A turn ran while frames stopped reaching this page (the level closed the stream, no slot, the stream was lost, the dock
   *  closed): the conversation is read back from the history once nothing runs (finish, then any good state read while it is still
   *  owed, or the watch rising again). Set where delivery stops (markBlind), cleared only by a history rebuild that was applied (or a
   *  reset): a failed, superseded or deferred read keeps it, and no later turn clears it. */
  private historyOwed = false;
  /** The history read (by its histN) that is out, and the session|turn it reads: an automatic rebuild of the same turn while it is
   *  out starts nothing (the one out is the one that applies); a person's Check or another turn's read supersedes it. */
  private histBusy = 0;
  private histFor = '';
  /** Follow-ups being read back by their command id (no journal): one read per row at a time. */
  private cmdChecks = new Set<string>();
  /** What a Remove or Edit press on a queued row was for, by row, kept while its answer is out or unknown: a read that later proves the
   *  message withdrawn removes the row for a Remove, and leaves it as Taken back (its text for Edit) otherwise. */
  private readonly wdIntent = new Map<string, 'remove' | 'edit'>();
  /** Rows whose withdraw answered 404: "cannot be taken back here" shows only once a read proves the command still queued. */
  private readonly wd404 = new Set<string>();
  private ids = 0;
  private recent: RecentRow[] | null = null;
  /** Each loadRecent() takes a fresh read generation; only the newest read's titles are published (and Clear bumps it). */
  private recentGen = 0;
  /** The Recent popover is open on this engine (the panel's effect sets it; unmount and engine replacement clear it). */
  private recentShown = false;
  /** The conversation the person picked while this engine was still loading: loading opens it, whatever the store's order is by then. */
  private want: { k1: string; seq: number } | null = null;
  private selSeq = 0;
  /** A dock save that was not kept, owed to the store: the conversation, the generation it belongs to, and whether the capacity rule refused
   *  it (sticky per conversation and generation until a kept put or a reset). */
  private dockOwed: { k1: string; gen: number; full: boolean } | null = null;
  /** The row of the newest dock put this engine sent (a retry re-sends it; it never touches the journal or the record's clock). */
  private lastDockRow: AskRecord | null = null;
  private dockRetrying = false;
  /** Messages that may have reached the agent (an answer was lost once): never sent again under another key. */
  private maybe = new Set<string>();
  /** Follow-up keys this page settled or dismissed: a merge with another tab's record never brings them back. */
  private goneK3 = new Set<string>();
  /** Displaced turn keys (kw) this page settled: a save drops them even when another tab still lists them. */
  private goneKw = new Set<string>();
  /** The turn pointer (k2, t) this page last read or wrote: a stored record that moved past it was moved by another tab. */
  private ptr: { k1: string; k2: string; t: string | null } | null = null;
  private dupNow: Snapshot['dup'] = null;
  /** Text-less waiting rows the person already sent past (Send anyway): they do not ask again. */
  private dupSeen = new Set<string>();
  /** A duplicate turn receipt was taken: the turn's history is read back when it ends. */
  private reread = false;
  /** The turn shown live at an open (the record's, or the one its key admitted), by the agent's turn id. The transcript read at that
   *  open may already hold it (the page that watched it left before it ended), so the replay must not rebuild it beside the
   *  transcript's copy: its receipt decides (resync), and a closed one is read back from the transcript instead. Kept until a resync
   *  shows the turn still open, or the transcript read after its close is applied.
   *  `prompt`: that transcript held the turn's prompt after its last boundary, so the turn had not been saved as ended by then. */
  private adopted: { turn: string; prompt: boolean } | null = null;
  /** Command events whose command id no row holds yet (the frame outran the POST answer), applied at its receipt. */
  private early = new Map<string, NonNullable<ReturnType<typeof C.commandFrame>>>();

  /** The session this engine is pinned to (a conversation named by its reference), or null for the dock's engine, which
   *  follows its slot's current conversation. A pinned engine is that conversation only: it never makes or switches to
   *  another, and sends nothing without its session. */
  readonly pinSid: string | null;
  /** The journal this engine's request evidence is written into (ask/journal), with its computer's handle. Present: every
   *  keyed request (create, turn, follow-up, decision) is admitted by the journal's door (its entry written and read back)
   *  before it leaves; the engine's io is the guard that refuses a keyed send without that door's ticket; an entry is removed
   *  only by proof (a classified reply, a read by id, a frame, or the person); and the engine never asks again under a key. */
  private readonly jr: { j: Journal; handle: string } | null;
  /** The cancel tokens of the sends in progress: ending the engine cancels every one (a wait is never stranded). */
  private holds = new Set<SendToken>();
  /** This engine's one approver-lease handle, opened on first need with the conversation's realm (a draft engine's is
   *  known only at its create) and closed when the conversation changes or the engine ends. A non-Strict handle sends nothing:
   *  it only mints tickets. Null for an engine without a journal. */
  private lease: ApproverHandle | null = null;
  private leaseRef(r: string, sid: string | null): ApproverRef {
    const target = targetOf(this.slot.project, this.slot.computer, this.slot.server);
    return { computer: this.slot.computer, realm: r, sid, target };
  }
  private leaseHandle(r: string): ApproverHandle | null {
    if (!this.jr) return null;
    if (!this.lease) this.lease = approvers().open(this.leaseRef(r, this.rec?.s ?? this.pinSid));
    return this.lease;
  }
  private dropLease(): void { const h = this.lease; this.lease = null; this.strictMode = null; this.handleStrict = false; this.modeLost = false; if (h) h.close(); }
  /** What the handle was last told: Strict (the page must hold the lease) or not. */
  private handleStrict = false;
  /** Approval reads in flight (this generation) and not given up on: each is bounded (READ_MS), so a read nobody answers cannot hold
   *  the handle shut for good. */
  private readPending = 0;
  /** The approval mode could not be read (the read timed out or failed and none answered since): the chat counts Strict, the
   *  handle follows the parked gate on that footing, and the card says so with a Check again (checkMode). */
  private modeLost = false;
  /** Reads the approval mode again (the Check again beside a gate whose mode could not be read). */
  checkMode(): void { this.readAuto(undefined, false); }
  /** The one place that matches the approver handle to the facts: the page needs the lease while the chat is Strict (the mode as
   *  activation() counts it: only a read 'default' relaxes it) AND a gate card is parked; it opens the handle and tells it Strict
   *  then, and tells it not Strict when either fact goes (a lease held for a gate that left is given back). While the mode is not
   *  known and a read is in flight it changes nothing (the answer decides). Called from every transition that moves one of its facts:
   *  publish() (a card added or removed by a frame, a state reconcile or a decision; a read answering publishes too), and a read
   *  dropped by an Off/On request (which publishes nothing); a yolo frame moves neither fact but asks a dropped read again. A
   *  conversation change or the end closes the handle (dropLease). */
  private reconcileApproverHandle(): void {
    const rec = this.rec;
    if (!this.jr || !rec || !rec.s || !rec.r || this.phaseNow === 'ended') return;
    if (this.readPending > 0 && this.strictMode === null) return;
    const strict = this.strictMode ?? this.auto.cap;
    const want = strict && this.book.list.length > 0;
    // A lease already held for a parked gate is kept while that card stays (a read that relaxes the chat does not take it back
    // mid-gate); it goes back when the card does.
    if (want || (this.handleStrict && this.book.list.length > 0)) {
      if (!this.handleStrict) { this.handleStrict = true; this.leaseHandle(rec.r)?.setStrict(true); }
      return;
    }
    if (this.handleStrict) { this.handleStrict = false; this.lease?.setStrict(false); }
  }
  /** The session's approval mode as the last read told it (Strict is `always`); null until one has. */
  private strictMode: boolean | null = null;
  /** What a host needs besides the journal to let this engine's chat send: read only, changes nothing.
   *  `journal`: this engine admits its sends at the journal's door. `ref`: the chat's lease address (null until the session
   *  and its realm are known). `strict`: the chat needs a HELD approver lease; a chat whose approval mode was not read yet
   *  counts as Strict when the agent has an approval route at all (never "not needed" by default), and as not Strict when it has none. */
  activation(): { journal: boolean; ref: ApproverRef | null; strict: boolean } {
    const sid = this.rec?.s ?? this.pinSid, r = this.rec?.r;
    return { journal: !!this.jr && this.journalReady(), ref: this.jr && sid && r ? this.leaseRef(r, sid) : null, strict: this.strictMode ?? this.auto.cap };
  }
  /** What this page's own decisions are known to have become, by request id: `applied` (the agent took exactly this
   *  request), `refused` (a definite refusal; the card stays or goes, nothing applied), `elsewhere` (another request won the
   *  gate), `chatElsewhere` (never sent: the chat's create key is marked bound elsewhere, journal NotSentWhy 'elsewhere'), `notKept`
   *  (never sent: the journal kept no record of it), `notTaken` (never sent: its claim found the card gone or taken). Only these
   *  are proof; a gate that merely left the snapshot proves nothing and records none (C9). Bounded. */
  private proofs = new Map<string, DecisionProof>();
  private prove(rid: string, o: DecisionProof): void {
    if (!rid) return;
    this.proofs.set(rid, o);
    if (this.proofs.size > 64) this.proofs.delete(this.proofs.keys().next().value as string);
  }
  decisionProof(rid: string): DecisionProof | undefined { return this.proofs.get(rid); }
  /** Whether this request's claim still waits for the cross-tab lock (its card may already be gone; the claim then proves notTaken). */
  claimWaiting(rid: string): boolean { return this.claimRids.has(rid); }
  /** This page's own decision attempt on a gate (its request id and whether the answer is still on its way or was lost). */
  attemptOf(key: string): { rid: string; status: 'sending' | 'unknown' } | undefined {
    const a = this.attempts.get(key);
    return a && a.own && a.rid ? { rid: a.rid, status: a.status } : undefined;
  }
  /** The request ids of this page's own decisions whose answer was lost (their outcome is not known). */
  unknownDecisions(): string[] { return [...this.attempts.values()].filter((a) => a.own && a.rid && a.status === 'unknown').map((a) => a.rid); }
  /** A state or approval read: the stamp is taken just before the call, the epoch it names is told after it. */
  private leaseRead(rec: AskRecord, read: () => Promise<unknown>): Promise<unknown> {
    const stamp = this.jr ? approvers().stamp() : 0;
    return read().then((b) => {
      const e = agent.approverEpochOf(b);
      if (this.jr && e !== null && rec.s) approvers().noteEpoch(this.leaseRef(rec.r, rec.s), e, stamp);
      return b;
    });
  }
  /** A decision was not sent because the journal did not keep its record (nothing left; decide again). */
  private notKept = false;
  /** The gate (card key) whose decision was refused because the chat is marked bound elsewhere (NotSentWhy 'elsewhere'): the snapshot
   *  says so only while that card is still shown, and a new decision or a fresh session clears it. */
  private decisionElsewhere: { key: string; gen: number } | null = null;
  /** Keys this page settled or the person dismissed: a store that still holds their entry (a removal owed) never shows them
   *  as another tab's rows. */
  private settledHere = new Set<string>();
  constructor(slot: Slot, io: AgentIO, store: StoreIO, clock: Clock = realClock, opts: { sid?: string; journal?: { j: Journal; handle: string }; usage?: UsageLedger } = {}) {
    this.slot = slot; this.store = store; this.clock = clock;
    this.usage = opts.usage ?? new UsageLedger();
    this.jr = opts.journal ?? null;
    this.io = this.jr ? guardIO(io, { acct: slot.account, container: slot.computer }) : io;
    this.pinSid = typeof opts.sid === 'string' && L.seg(opts.sid) ? opts.sid : null;
    this.snap = this.build('checking', null, null);
  }

  // ---- the snapshot ----
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = (): Snapshot => this.snap;
  private phaseNow: Snapshot['phase'] = 'checking';
  private att: { items: A.Att[]; refused: A.Refusal[]; dropped: string } = { items: [], refused: [], dropped: '' };
  /** Files being read for this draft (beginRead tokens). A token leaves when its files arrive, or when the draft it
   *  was read for goes (New conversation, the panel closing, the engine ending): late files are then let go. */
  private attReads = new Set<number>();
  /** This page's own unsure verdict not kept by the store yet (see save): the conversation and turn it was about,
   *  and whether it was unsure. It stays through a write the browser refused, until a later save keeps it. */
  private uOp: { k1: string; t: string; set: boolean } | null = null;
  /** History reads in turn: a result older than the newest one started is let go. */
  private histN = 0;
  private readSeq = 0;
  /** The object URLs of sent messages' thumbnails (a draft's are its items' own), revoked when the conversation goes. */
  private urls = new Set<string>();
  /** How object URLs are let go (attachio.revoke in the browser; tests count). */
  revokeUrl: (url: string) => void = () => {};
  private blockedNow: Blocked | null = null;
  private bandNow: Band = null;
  private startingNow = false;
  private cards(): CardView[] {
    return this.book.list.map((x) => {
      const a = this.attempts.get(x.key);
      const decision = a ? a.status : null;
      const held = decision ? null : this.claiming.has(x.key) ? 'claiming' as const : this.journalFull() ? 'full' as const : null;
      return { key: x.key, gate: x.gate, helper: !!x.helper, addressing: x.addressing, decision, held, decidable: !x.helper && !x.addressing && !decision && !x.gate.invalid && !x.gate.blocked && !held };
    });
  }
  /** Snapshot.catchingUp: the turn adopted at an open is still running here and undecided (its receipt decides, resync), or a
   *  history read the chat owes (a turn that ended unseen) is out. */
  private catchingUpNow(): boolean {
    const t = C.current(this.conv);
    if (this.adopted && t && t.s.turnId === this.adopted.turn && C.running(t)) return true;
    return this.historyOwed && this.histBusy !== 0;
  }
  private build(phase: Snapshot['phase'], blocked: Blocked | null, band: Band): Snapshot {
    const gates = this.cards();
    const lead = gates.find((c) => !c.helper && !c.gate.invalid) ?? null;
    return {
      phase, blocked, band, starting: this.startingNow,
      conv: this.conv,
      status: C.statusOf(this.conv, this.conn),
      gates,
      ...(this.modeLost && gates.length > 0 ? { modeUnread: true as const } : {}),
      gate: lead ? lead.gate : null,
      ...(this.catchingUpNow() ? { catchingUp: true as const } : {}),
      decision: { pending: !!lead && lead.decision === 'sending', unknown: !!lead && lead.decision === 'unknown', notKept: this.notKept, ...(this.elsewhereShown(gates) ? { elsewhere: true as const } : {}) },
      dormant: this.dormant,
      checking: this.syncing !== 0,
      streamBroke: this.broke,
      auto: { ...this.auto },
      needLogin: !!this.rd && this.rd.state === 'login',
      followUps: this.followUps,
      recent: this.recent,
      ...(this.recentFullNow() ? { recentFull: true as const } : {}),
      version: this.version,
      sendable: this.canSend(),
      ...(this.freshOwed && this.holdsUnknownCreate() ? { freshHeld: true as const } : {}),
      dup: this.dupNow,
      att: { items: [...this.att.items], refused: [...this.att.refused], dropped: this.att.dropped, reading: this.attReads.size > 0 },
      ...(this.rec && !this.rec.s ? { createKey: this.rec.k1 } : {}),
      ...(this.stateTurn !== undefined ? { stateTurn: this.stateTurn } : {}),
      ...(this.rl && this.rl.sid === this.rec?.s ? { rateLimit: this.rl.r } : {}),
      usage: this.foldUsage(),
    };
  }
  /** What each session's view listed for Details > Usage (Snapshot.usage), from the ledger this engine was given (the page's, so an
   *  engine that replaced this one, or another on the same chat, lists what this one saw). Folded at every build, at every stream frame
   *  (painted later) and at every reply (its commands may drop the turn it filled before the next publish), so nothing that replaces
   *  the conversation before the next publish (open, reopen, a history rebuild, a new turn's command) loses a count. */
  private usage: UsageLedger;
  private foldUsage(): C.UsageEntry[] {
    const sid = this.conv.sid, now = C.usageTurns(this.conv);
    return sid ? this.usage.fold(this.slot.account + ' ' + this.slot.computer + ' ' + sid, now) : now;
  }
  private followUps = true;
  private publish(): void {
    this.keepObserved();
    this.reconcileApproverHandle();
    this.markFirstRows();
    this.snap = this.build(this.phaseNow, this.blockedNow, this.bandNow);
    for (const f of [...this.listeners]) { try { f(); } catch { /* a listener's own */ } }
    // Never from inside the step that published (it goes on after, and a reset under it would be undone): next.
    if ((this.pend || this.freshOwed) && !this.pumpQueued) {
      this.pumpQueued = true;
      queueMicrotask(() => { this.pumpQueued = false; this.pumpStart(); });
    }
  }
  /** Repaint soon (stream frames: at most every 40 ms). */
  private paint(): void {
    if (this.paintQueued) return;
    this.paintQueued = true;
    this.later(() => { this.paintQueued = false; this.publish(); }, PAINT_MS);
  }
  private set(phase: Snapshot['phase'], o: { blocked?: Blocked | null; band?: Band } = {}): void {
    this.phaseNow = phase;
    if (o.blocked !== undefined) this.blockedNow = o.blocked;
    if (o.band !== undefined) this.bandNow = o.band;
    this.publish();
  }
  private block(key: string, o: Partial<Blocked> = {}): void {
    this.closeStream();
    this.set('blocked', { blocked: { key, act: o.act ?? 'retry', tone: o.tone ?? 'warn', agent: o.agent ?? true } });
  }

  // ---- life ----
  /** Still this engine's flow; a context that is gone (account, realm generation, computer) ends the engine. */
  private live(g: number): boolean {
    if (g !== this.gen || this.phaseNow === 'ended') return false;
    if (this.io.alive()) return true;
    this.end();
    return false;
  }
  /** False (and the engine ended) when its context is gone; registry.ts asks on every core generation bump. */
  checkAlive(): boolean { return this.live(this.gen); }
  private later(fn: () => void, ms: number): unknown {
    const g = this.gen;
    const id = this.clock.set(() => { this.timers = this.timers.filter((x) => x !== id); if (this.live(g)) fn(); }, ms);
    this.timers.push(id);
    return id;
  }
  private cancel(id: unknown): void { this.clock.clear(id); this.timers = this.timers.filter((x) => x !== id); }
  private reset(): void {
    this.endAside();
    // Every generation change goes through here (a new conversation, an opened one, the same one opened again, end): a switch
    // write still out can no longer be told by its own answer (live(g) drops it), so it ends now, as unknown, before the
    // generation moves.
    for (const done of [...this.autoWrites]) done('unknown');
    this.gen++;
    this.broke = false;
    this.want = null;
    this.dockOwed = null;
    this.lastDockRow = null;
    this.readPending = 0;
    this.modeLost = false;
    this.stateTurn = undefined;
    for (const t of [...this.holds]) t.cancel();
    this.holds.clear();
    this.closeStream();
    for (const t of this.timers) this.clock.clear(t);
    this.timers = [];
    this.paintQueued = false;
    this.reread = false;
    this.adopted = null;
    this.historyOwed = false;
    this.histBusy = 0;
    this.histFor = '';
    this.cmdChecks.clear();
    this.wdIntent.clear();
    this.budgetWait = false;
    this.early.clear();
    this.rcBusy = false; this.rcDirty = false; this.rcFail = 0; this.rcTimer = null; this.rcWhy.clear(); this.quietT = null;
    this.claiming.clear(); this.claimRids.clear();
    this.syncOwed = false;
    this.syncOwedExplicit = false;
    this.gating.clear();
    this.regate.clear();
    this.intents.clear();
    this.dismissing.clear();
    this.admitted.clear();
    this.inGate = null;
  }
  /** A new conversation (or the same one read again from scratch): its gates and this page's decisions start over
   *  from the record and the agent. */
  private freshSession(): void {
    this.dropLease();
    this.book = G.emptyBook();
    this.attempts.clear();
    this.decisionElsewhere = null;
    this.dormant = false;
  }
  private closeStream(): void { this.esOpen = false; if (this.es) { this.es.close(); this.es = null; this.esRank = null; } }
  /** The watch level in force: `off` holds while the engine has nothing of its own to settle; with a send, a decision or words
   *  only it holds (not quiet), it reads the state instead, so a hidden holder never strands this engine's own work. */
  private level(): Level { return this.wLevel === 'off' && !this.quiet() ? 'state' : this.wLevel; }
  /** Rule (a), the read gate: no automatic read (a state read, a receipt, a history rebuild or a step of one, a retry timer) is
   *  dispatched at an effective `off`. The person's own Check, Stop and decisions are not automatic; the engine's own work lifts
   *  `off` to `state` (quiet()). What a gated read would have recovered stays owed for when the watch rises. */
  private autoOff(): boolean { return this.level() === 'off'; }
  /** The running turn's frames are not delivered from here on (no stream by the watch, or no slot): the history is owed. */
  private markBlind(): void { if (C.running(C.current(this.conv))) this.historyOwed = true; }
  /** Watched without a stream (by the level, or waiting for a slot): after a good read the chat is not reconnecting. */
  private streamless(): boolean { return !this.es && (this.level() !== 'stream' || this.budgetWait); }
  /** One observer rule, checked on every publish: at `state` something always watches: a read out, or the next one due. So the
   *  engine's own work that lifts a quiet `off` (a follow-up, a decision) is observed whatever came before. At `off`, the reads end
   *  at their next turn (recon). */
  private keepObserved(): void {
    if (this.level() !== 'state' || this.es || this.rcTimer || this.rcBusy || this.suspended || this.phaseNow !== 'ready' || !this.rec?.s) return;
    this.readLater('own');
  }
  /** The holders' watch. `stream`: the session's stream at `rank` (reopened from
   *  this page's cursor when `rank` is better; moved in place, with no reconnect, when it is worse). `state`: no stream, the state read
   *  every STATE_MS. `off`: no stream and no reads while quiet. Leases are the holders' (a hold keeps its lease pinned). */
  setWatch(level: Level, rank?: Rank): void {
    const was = this.level(), r0 = this.esRank;
    this.wLevel = level;
    if (rank) this.wRank = rank;
    const now = this.level();
    if (this.suspended || this.phaseNow !== 'ready' || !this.rec?.s) return;
    if (now !== 'stream') {
      if (this.es) { this.closeStream(); this.cgen++; }
      this.broke = false;
      this.markBlind();
      if (now === 'off') { if (this.rcTimer) { this.cancel(this.rcTimer); this.rcTimer = null; } return; }
      return this.readLater('state');
    }
    if (this.es) {
      if (r0 && RANKS.indexOf(this.wRank) < RANKS.indexOf(r0)) { this.closeStream(); this.cgen++; this.openStream(this.obsCursor()); }
      // A worse rank (the better holder let go) moves the open stream in place, so the budget cuts it in its new place.
      else if (r0 && this.wRank !== r0 && this.es.setRank) { this.es.setRank(this.wRank); this.esRank = this.wRank; }
      return;
    }
    if (was === 'stream') return;
    // Watched again: as at resume(), a running turn is read back by a resync (state, replay, stream); otherwise a state read reopens the stream.
    if (C.running(C.current(this.conv))) { this.conn.reconnecting = true; this.publish(); this.resync(false); return; }
    if (this.rcTimer) { this.cancel(this.rcTimer); this.rcTimer = null; }
    this.recon('watch');
  }
  /** The next state read in STATE_MS, unless one is already due. */
  private readLater(why: string): void {
    if (this.rcTimer || this.suspended) return;
    this.rcTimer = this.later(() => { this.rcTimer = null; this.recon(why); }, STATE_MS);
  }
  /** Ends observation for good (the account, realm or computer changed, or the panel went away). */
  end(): void {
    if (this.phaseNow === 'ended') return;
    this.reset();
    this.dropSent();
    this.dropDraft('');
    this.conv = C.emptyConv();
    this.set('ended', { blocked: null, band: null });
    this.listeners.clear();
    this.freshOwed = false;
    this.dropLease();
    if (this.pend) this.endStart(this.pend.uid ? 'unknown' : 'notSent');
  }
  /** The dock closed: no stream stays open. resume() picks it up again from the session's own state. */
  suspend(): void {
    if (this.suspended) return;
    this.suspended = true;
    this.broke = false;
    this.closeStream();
    this.cgen++;
    this.markBlind();
    // The panel closed or another computer took it: the draft's files are let go (said when it opens again), and
    // files still being read for it are dropped when they arrive. Sent messages keep theirs for when it reopens.
    this.dropDraft('ask.attDroppedClosed');
    this.publish();
  }
  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    if (this.phaseNow !== 'ready' || !this.rec?.s) return;
    // Decisions another tab sent or settled while this dock was closed (its storage wakes did not reach a closed panel).
    this.importDa();
    this.reassertDa();
    const running = C.running(C.current(this.conv));
    if (running) { this.conn.reconnecting = true; this.publish(); this.resync(false); }
    // Queued rows are read back by their id (a commit can fall out of the replay); the session's state says what
    // runs and what is parked now (reads only; nothing is sent).
    for (const u of Object.values(this.conv.users)) if (u.state === 'queued' && u.via === 'command' && u.commandId) this.checkCommand(u.id);
    this.recon('resume');
  }
  /** The page became visible again, came back online, or another tab changed this account's conversations. */
  /** Healing is a scan by key and only READS the request store: it never writes an entry. An entry the store no longer holds is
   *  gone for every tab (the person dismissed it, or a read settled it, in another tab), so this page drops its in-memory copy of
   *  that request; a store that cannot be read concludes nothing. The chat's record (state, not evidence) is put again only when it
   *  knows a turn: a first message's record is never rebuilt from memory. After the sweep, each first-message row that is
   *  still unknown goes through the gate again (it reads the durable state; it asks the network only to attach, and only for a row
   *  holding its text). */
  heal(): void {
    if (!this.jr || this.phaseNow === 'ended') return;
    const g = this.gen, jr = this.jr;
    void jr.j.sweep().then(() => {
      if (!this.live(g)) return;
      const rec = this.rec;
      if (!rec) return;
      this.dropGone(rec);
      if (this.rec !== rec) return;
      if (rec.t && !jr.j.has(jr.handle, rec.r, rec.s, rec.k1)) this.save({ front: true });
      this.adoptEntries();
      for (const u of Object.values(this.conv.users)) if (u.state === 'unknown' && this.isFirstRow(u)) this.firstTurn(u.id, 'owed');
    });
  }
  /** Drops what this page still holds of requests the store no longer holds an entry for: rows that were only Not sure, pending
   *  and replaced turn keys, follow-up keys and unknown decisions (their card is answerable again). A request in flight keeps its row.
   *  A create row and a first-message row are left alone: the gate reads the durable record, not the entry. */
  private dropGone(rec: AskRecord): void {
    const entries = this.scanSure();
    if (!entries) return;
    const have = new Set(entries.filter((e) => e.r === rec.r && (rec.s ? e.s === rec.s : e.s === null && e.c === rec.k1)).map((e) => e.k));
    for (const u of Object.values(this.conv.users)) {
      if (u.state !== 'unknown' && u.state !== 'queued') continue;
      if (this.isFirstRow(u)) continue;
      const k = u.via === 'create' && !rec.s ? rec.k1 : u.key;
      if (!k || have.has(k)) continue;
      this.dismissRow(u.id, true);
      if (this.rec !== rec) return;
    }
    let changed = false;
    if (rec.w && !have.has(rec.k2) && !this.sending(rec.k2)) { delete rec.w; delete rec.wf; changed = true; }
    const kw = (rec.kw ?? []).filter((k) => have.has(k));
    if (kw.length !== (rec.kw ?? []).length) {
      for (const k of rec.kw ?? []) if (!have.has(k)) this.goneKw.add(k);
      if (kw.length) { rec.kw = kw; if (rec.kwf) rec.kwf = rec.kwf.filter((k) => kw.includes(k)); } else { delete rec.kw; delete rec.kwf; }
      changed = true;
    }
    const k3 = (rec.k3 ?? []).filter((k) => have.has(k) || this.sending(k));
    if (k3.length !== (rec.k3 ?? []).length) {
      for (const k of rec.k3 ?? []) if (!k3.includes(k)) this.goneK3.add(k);
      if (k3.length) rec.k3 = k3; else delete rec.k3;
      if (rec.c3) { const c3 = Object.fromEntries(Object.entries(rec.c3).filter(([k]) => k3.includes(k))); if (Object.keys(c3).length) rec.c3 = c3; else delete rec.c3; }
      changed = true;
    }
    let decided = false;
    for (const [key, a] of [...this.attempts]) {
      if (a.status !== 'unknown' || have.has(a.rid)) continue;
      this.attempts.delete(key);
      this.goneRid.add(a.rid);
      this.drOps.push([key, a.rid]);
      decided = true;
    }
    if (decided) this.saveAttempts();
    else if (changed) this.save();
    if (decided || changed) this.publish();
    if (decided) this.recon('decision');
  }
  /** A request of this page still on its way (its row is `sending`): its entry may not be readable yet by a scan taken in between. */
  private sending(key: string): boolean { return Object.values(this.conv.users).some((u) => u.key === key && u.state === 'sending'); }
  /** Entries of this chat that another tab wrote since this page read it show as their own rows here, Not sure (a turn or follow-up
   *  this page did not see): they are never asked under again, and the person checks or dismisses them. */
  private adoptEntries(): void {
    const rec = this.rec, entries = this.scanSure();
    if (!this.jr || !rec || !rec.s || !entries || this.phaseNow !== 'ready') return;
    let changed = false;
    const shown = new Set(Object.values(this.conv.users).map((u) => u.key));
    for (const e of entries) {
      if (e.r !== rec.r || e.s !== rec.s || e.c !== rec.k1 || (e.kind !== 'turn' && e.kind !== 'message')) continue;
      if (shown.has(e.k) || this.settledHere.has(e.k) || rec.dk?.includes(e.k)) continue;
      if (e.kind === 'message') {
        rec.k3 = [...(rec.k3 ?? []).filter((k) => k !== e.k), e.k];
        this.conv = C.addUser(this.conv, { ...this.lostUser(e.k, 'command'), commandId: e.ci ?? null });
      } else {
        if (e.k === rec.k2 && rec.w) continue;
        rec.kw = [...(rec.kw ?? []).filter((k) => k !== e.k), e.k];
        if (e.f) rec.kwf = [...(rec.kwf ?? []).filter((k) => k !== e.k), e.k];
        this.conv = C.addUser(this.conv, { ...this.lostUser(e.k, 'turn'), reason: 'ask.otherTab' });
      }
      shown.add(e.k);
      changed = true;
    }
    if (changed) this.publish();
  }
  wake(): void {
    this.retryDock();
    this.heal();
    // Another tab's decision is taken in at once (its card offers no second one), and one it settled is let go,
    // whatever the read throttle says. A write that dropped this page's own attempt is undone.
    if (this.importDa()) this.publish();
    this.reassertDa();
    if (this.suspended || this.clock.now() - this.wokeAt < WAKE_GAP_MS) return;
    this.wokeAt = this.clock.now();
    this.recon('wake');
  }
  private wokeAt = -Infinity;

  // ---- the reconcile loop: the session's own state decides what the panel shows ----
  /** Reads GET /state (one in flight; a trigger meanwhile runs one more pass after it) and applies it: the gates it
   *  holds, the turn it runs, and the stream from its watermark. It only reads. A failed or incomplete read is read
   *  again with backoff while the panel is open. */
  private recon(why: string): void {
    const rec = this.rec;
    if (this.suspended || this.phaseNow !== 'ready' || !rec || !rec.s) return;
    // A quiet `off` reads nothing: wakes, timers and continuations armed before it end here (the engine's own work lifts it: level()).
    if (this.autoOff()) return;
    this.rcWhy.add(why);
    if (this.rcBusy) { this.rcDirty = true; return; }
    if (this.rcTimer) { this.cancel(this.rcTimer); this.rcTimer = null; }
    this.rcBusy = true;
    const g = this.gen, sid = rec.s, ep = this.book.epoch, whys = [...this.rcWhy], issued = this.tokN;
    this.rcWhy.clear();
    void settle(this.leaseRead(rec, () => this.io.state(sid, rec.r))).then((r) => {
      if (g !== this.gen) return;
      this.rcBusy = false;
      if (!this.live(g) || this.rec?.s !== sid) return;
      const again = () => { if (this.rcDirty) { this.rcDirty = false; this.recon('again'); } };
      if (!r.ok) {
        if (L.isObj(r.e) && r.e.status === 404) {
          // A 404 read while anything sent is unsettled (a decision or a message) proves nothing either: a hidden session answers the
          // same as a deleted one, and calling the chat gone would end it for good. What was sent stays unknown and the read is tried
          // again with backoff.
          if (!this.sentUnsettled()) return this.gone();
          this.retry('hidden');
          return again();
        }
        this.retry('failed');
        return again();
      }
      if (!this.applyState(r.b, ep, issued, whys.includes('quiet'))) { this.rcDirty = false; this.recon('epoch'); return; }
      again();
    });
  }
  /** Applies one /state snapshot (the reconcile loop's, or the one a turn resync read alongside its replay) to the
   *  gate book, the turn shown and the stream. `ep`: the book's epoch when the read began; `issued`: the order token
   *  when it went out; `quiet`: the watchdog asked (a stream behind it is reopened); `sync`: a resync's snapshot
   *  (the resync opens its own stream). False: the read began before the book moved to another incarnation (it may
   *  name one this page never saw), or before a newer snapshot or decision answer arrived (its content may be older
   *  though its watermark is not), so nothing is applied and the caller reads again. */
  private applyState(body: unknown, ep: number, issued: number, quiet: boolean, sync = false): boolean {
    if (ep !== this.book.epoch || issued < this.appliedTok) return false;
    const so = G.onState(this.book, body);
    if (so.stale) { this.retry('stale'); return true; }
    this.stateTurn = L.isObj(body) && L.seg(body.current_turn_id) ? body.current_turn_id : null;
    this.book = so.book;
    this.appliedTok = ++this.tokN;
    this.forgetAttempts(so.removed);
    if (!so.addressing) this.retireUnseen(issued);
    this.rcFail = 0;
    const b = body as Record<string, unknown>;
    this.dormant = so.dormant;
    // The one read gate: an answer that arrives at a quiet `off` updates the gates it names and starts nothing (no adoption, receipt,
    // history, stream or next read).
    if (this.autoOff()) { if (so.dormant) this.closeStream(); this.publish(); return true; }
    if (so.dormant) {
      this.closeStream();
      if (this.rcTimer) this.cancel(this.rcTimer);
      this.rcTimer = this.later(() => { this.rcTimer = null; this.recon('dormant'); }, DORMANT_MS);
      this.publish();
      return true;
    }
    this.adoptCurrent(b);
    // A silent stream: the session moved past what it delivered. It is opened again from this page's cursor.
    if (this.es && quiet && so.wm !== null && so.wm > this.book.seq) this.closeStream();
    // Judged before observe() asks for a stream again (a refused one answers later, through overBudget).
    if (!sync && this.streamless()) {
      // No frames: a good read is the recovery (the reply is read back at the turn's end), and queued follow-ups are read back by
      // their command id (a commit frame never comes).
      if (this.conn.lost || this.conn.reconnecting) { this.markBlind(); this.conn = { lost: false, reconnecting: false }; }
      for (const u of Object.values(this.conv.users)) if (u.state === 'queued' && u.via === 'command' && u.commandId) this.checkCommand(u.id);
    }
    // A history still owed (its read failed or was superseded) is read again once nothing runs, one read at a time.
    if (!sync) this.historyLater();
    if (!sync) this.observe();
    // A stream kept open is watched again (a silent one that missed nothing yet may still go dead).
    if (this.es && !this.quietT) this.armQuiet();
    if (so.addressing) this.retry('addressing');
    this.publish();
    return true;
  }
  /** True while anything sent to this chat has no known outcome: a decision of this page on its way or in doubt, a message whose
   *  answer is out or was lost (a row sending or unknown), or a request the record still holds unsettled (another tab's, or one
   *  from before a reload: w, k3, kw, da). A 404 then proves nothing (C9): the chat is read again, never called gone, until those
   *  settle or the person dismisses them. */
  private sentUnsettled(): boolean {
    if (this.attempts.size) return true;
    const rec = this.rec;
    if (rec && (rec.w || rec.k3?.length || rec.kw?.length || (rec.da && Object.keys(rec.da).length))) return true;
    return Object.values(this.conv.users).some((u) => u.state === 'sending' || u.state === 'unknown');
  }
  private retry(why: string): void {
    if (this.rcTimer || this.suspended || this.autoOff()) return;
    const ms = L.backoff(this.rcFail++);
    this.rcTimer = this.later(() => { this.rcTimer = null; this.recon(why); }, ms);
  }
  /** The turn the session runs now: shown when the panel shows none running (its frames went by unseen, so its
   *  reply is read from the history when it ends); a turn shown as running that the session no longer runs is
   *  read back by its receipt. No row is attributed to it and nothing is sent. */
  private adoptCurrent(b: Record<string, unknown>): void {
    const rec = this.rec as AskRecord;
    const cur = L.seg(b.current_turn_id) ? b.current_turn_id : null;
    const shown = C.current(this.conv);
    if (shown && C.running(shown) && shown.s.turnId && shown.s.turnId !== cur && (cur || b.state === 'idle')) { this.receipt(); return; }
    if (!cur || C.running(shown) || this.conv.turns.some((x) => x.s.turnId === cur)) return;
    this.markFirstRows();                                       // a first-message row stays one when the page learns this turn
    // (t, k2) is one pair: the session's state names a turn, not the key that made it, and it may be another tab's. A journaled
    // page records the turn only together with its key, from the durable record when that holds this very turn; otherwise it shows the
    // turn and records neither (the turn is settled through its own request entry, by Check, as the key is known there).
    if (this.jr) {
      const st = this.jr.j.firstState(this.jr.handle, rec.r, rec.k1, rec.k2);
      if (st.id === 'R7' && st.rec.t === cur) this.adoptRec(st);
    } else { rec.t = cur; rec.ph = 'working'; this.save(); }
    this.conv = C.addTurn(this.conv, { turnId: cur, loose: true, now: this.clock.now() });
    this.reread = true;
    this.conn.reconnecting = true;
    this.later(() => { if (!this.autoOff()) this.resync(false); }, 0);
  }
  /** The stream stays open while the panel is open and the session is live, whether or not a turn runs here: an
   *  approval of another tab's turn, or of a follow-up's new turn, arrives on it. */
  private observe(): void {
    if (this.suspended || this.phaseNow !== 'ready' || !this.rec?.s || this.dormant || this.es) return;
    // A turn adopted at the open is read whole first (its receipt decides what is shown of it, resync): a stream opened before
    // that would resume from the session's start and fill the turn with frames the transcript may already hold. The resync
    // opens the stream once it has decided; one is started here when none is out (the watch was off at the open).
    const t = C.current(this.conv);
    if (this.adopted && t && t.s.turnId === this.adopted.turn && C.running(t)) { if (!this.syncing) this.resync(false); return; }
    this.openStream(this.obsCursor());
  }
  private obsCursor(): L.Cursor | null {
    const a = this.cursor(), b = G.cursorOf(this.book);
    if (!b) return a;
    if (!a || a.incarnation !== b.incarnation) return b;
    return a.since >= b.since ? a : b;
  }
  private armQuiet(): void {
    if (this.quietT) this.cancel(this.quietT);
    this.quietT = this.later(() => { this.quietT = null; if (this.es) this.recon('quiet'); }, QUIET_MS);
  }
  /** Gates that left the book: this page's decisions on them are over (applied, refused, or the gate ended). An
   *  answer still on its way stays: it says whose the decision was. */
  private forgetAttempts(gone: G.SGate[]): void {
    let dirty = false;
    for (const x of gone) {
      const a = this.attempts.get(x.key);
      if (!a || a.status === 'sending') continue;
      // With a journal a gate that merely left the snapshot proves nothing about an unknown decision (C9).
      if (this.jr && a.status === 'unknown') continue;
      this.attempts.delete(x.key); this.settleRid(x.key, a.rid); dirty = true;
    }
    if (dirty) this.saveAttempts();
  }
  /** The stored record's decisions (da) and settlements (dg, dr), or null when this conversation has no stored record. */
  private storedDa(): { da: Record<string, string>; dg: string[]; dr: Record<string, string> } | null {
    const rec = this.rec;
    if (!rec || !rec.s) return null;
    const mine = C.convsFor(this.store.read(this.slot.account), this.slot.account, { p: rec.p, c: rec.c, r: rec.r }).find((x) => x.k1 === rec.k1);
    if (!mine) return null;
    // With a journal the decisions come from the request entries read now: an unreadable scan gives no record to conclude from.
    const seen = this.jr ? this.jr.j.attach(this.jr.handle, mine) : mine;
    return seen ? { da: seen.da ?? {}, dg: seen.dg ?? [], dr: seen.dr ?? {} } : null;
  }
  /** Decisions any tab sent on this conversation and nothing settled yet (the stored record's da): a card here
   *  offers no second one. Reconciles the attempts taken in earlier:
   *  - one a page refused definitely (dr names it for its gate) goes, and the card is answerable again;
   *  - one the store replaced with a newer attempt on that gate goes, and the newer one is taken in;
   *  - one whose gate a page saw end (dg names the gate) stays until a snapshot read after now settles it: this page's
   *    own view may still hold the gate, and the card must not offer a decision on a gate that is over. A gate in dg
   *    that this page still shows with no attempt is held the same way (an attempt with no request id);
   *  - one merely missing from da stays: a stale whole-record write may have dropped it, and its own tab stores it
   *    again.
   *  True when the page's attempts changed. */
  private importDa(): boolean {
    // An unreadable request store concludes nothing about an adopted decision.
    if (this.jr && !this.scanSure()) return false;
    const st = this.storedDa();
    if (!st) return false;
    const { da, dg, dr } = st;
    let changed = false, ended = false;
    for (const [k, a] of this.attempts) {
      if (a.own) continue;
      // With a journal the stored record's decisions come from the request entries: an adopted attempt whose entry the store no
      // longer holds is over for every tab (a successful read that lacks it is authoritative).
      if (this.jr && a.rid && !(k in da)) { this.attempts.delete(k); this.goneRid.add(a.rid); changed = true; continue; }
      if (!a.done && (dr[k] === a.rid || (k in da && da[k] !== a.rid))) { this.attempts.delete(k); changed = true; }
      else if (!a.done && dg.includes(k)) { a.done = true; a.tok = ++this.tokN; ended = true; }
    }
    for (const [k, rid] of Object.entries(da)) {
      if (this.attempts.has(k) || this.goneRid.has(rid) || dr[k] === rid) continue;
      const done = dg.includes(k);
      this.attempts.set(k, { rid, status: 'unknown', kind: 'once', tool: '', text: '', own: false, tok: ++this.tokN, ...(done ? { done } : {}) });
      changed = true; ended ||= done;
    }
    for (const x of this.book.list) {
      if (!dg.includes(x.key) || this.attempts.has(x.key)) continue;
      this.attempts.set(x.key, { rid: '', status: 'unknown', kind: 'once', tool: '', text: '', own: false, tok: ++this.tokN, done: true });
      changed = true; ended = true;
    }
    if (ended) this.recon('decision');
    return changed;
  }
  /** Another tab's whole-record write that read the store before this page's claim landed (localStorage across
   *  processes is eventually consistent) dropped an attempt of this page: it is stored again. One a page settled
   *  (its gate in dg, or it in dr) is not: that page judged it over, and storing it again would answer its write with
   *  another. */
  private reassertDa(): void {
    const st = this.storedDa();
    if (!st) return;
    for (const [k, a] of this.attempts) if (a.own && !this.goneRid.has(a.rid) && !st.dg.includes(k) && st.dr[k] !== a.rid && !(k in st.da)) return this.saveAttempts();
  }

  /** A snapshot issued after an attempt became known here that holds no gate under its key: the gate is not parked,
   *  so the decision is over (applied or not). An answer still on its way stays (it says whose the decision was).
   *  This settles attempts restored from the store whose gates this page never saw (their frames left the replay). */
  private retireUnseen(issued: number): void {
    let dirty = false;
    for (const [k, a] of this.attempts) {
      if (a.status === 'sending' || a.tok > issued || this.book.list.some((x) => x.key === k)) continue;
      if (this.jr && a.status === 'unknown') continue;
      this.attempts.delete(k); this.settleRid(k, a.rid); dirty = true;
    }
    if (dirty) this.saveAttempts();
  }
  /** The journal holds K3_MAX unsettled decisions: no new one goes until one settles (none is ever dropped). */
  private journalFull(): boolean { return this.attempts.size >= L.K3_MAX; }
  private saveAttempts(): void { this.save(); }

  // ---- the store (references only) ----
  private slotKey() { return { p: this.slot.project, c: this.slot.computer, r: this.realm }; }
  /** Saves the chat record. Fire-and-forget: a caller that authorizes a send, removes evidence or settles a turn uses `saveKept` and
   *  waits for the answer (a pinned engine's store is the journal's view, whose write is a promise of "kept", never a bare true).
   *  `admit`: the key the turn this save names was admitted under, passed only by a caller holding that answer (records.ts put, kp). */
  private save(o: { front?: boolean; admit?: string } = {}): void { void this.saveKept(o); }
  /** Resolves true when the journal kept the record of this save (a create leaves only when it did); a store without a journal, when
   *  its write was kept. */
  private saveKept(o: { front?: boolean; admit?: string } = {}): Promise<boolean> {
    const rec = this.rec;
    if (!rec) return Promise.resolve(false);
    rec.at = this.clock.now();
    const cur = this.store.read(this.slot.account);
    // Another tab on this conversation may have stored follow-up keys this page has not seen: they are kept (a key
    // lost would lose its row), except the ones this page settled or dismissed.
    const mine = this.jr ? this.storedOf(rec) : C.convsFor(cur, this.slot.account, { p: rec.p, c: rec.c, r: rec.r }).find((x) => x.k1 === rec.k1);
    // The same chat stored under another create key (two tabs opened a session this browser had no record of and each minted
    // one): the stored identity is the chat's, and this page takes it.
    if (this.jr && mine && mine.k1 !== rec.k1 && rec.s && mine.s === rec.s) { rec.k1 = mine.k1; this.ptr = null; }
    // Another tab dismissed this conversation's first message and dropped its record: a stale save never brings it
    // back (a stored record always knows its turn once one started, and only a new conversation saves to the front).
    if (!mine && !o.front && !rec.t && !this.pinSid) return Promise.resolve(false);
    // Another tab moved this conversation to another turn since this page last read or wrote it, and this page did
    // not move it: a late answer here (a failure, a phase) describes the older turn, so the stored pointer and the
    // phase and pending key that go with it stay.
    const p = this.ptr;
    let admit = o.admit;
    if (mine && p && p.k1 === rec.k1 && p.k2 === rec.k2 && p.t === rec.t && (mine.k2 !== rec.k2 || mine.t !== rec.t)) {
      // The stored pointer is adopted, not learned from an answer: it carries no admitted key.
      admit = undefined;
      rec.k2 = mine.k2; rec.t = mine.t; rec.ph = mine.ph;
      if (mine.w) rec.w = true; else delete rec.w;
      if (mine.wf) rec.wf = true; else delete rec.wf;
    }
    // The unsure mark (u) is the store's: this page changes it only by its own verdict on that same turn (uOp), so a
    // stale copy here never drops a mark another tab set, nor brings back one it cleared.
    // A verdict about another conversation or an older turn is obsolete: it goes.
    if (this.uOp && (this.uOp.k1 !== rec.k1 || this.uOp.t !== rec.t)) this.uOp = null;
    const op = this.uOp;
    const keptU = op ? (op.set ? op.t : undefined) : mine ? (mine.t === rec.t ? mine.u : undefined) : rec.u;
    if (keptU && keptU === rec.t) rec.u = keptU; else delete rec.u;
    const prev = rec.s ? mine : undefined;
    // Keys dismissed in any tab stay dismissed: their follow-up row, pending turn key (w) and live phase never return.
    const dk = [...(mine?.dk ?? []), ...(rec.dk ?? [])].filter((k, i, a) => a.indexOf(k) === i).slice(-L.K3_MAX);
    if (dk.length) rec.dk = dk;
    const na = [...(mine?.na ?? []), ...(rec.na ?? [])].filter((k, i, a) => a.indexOf(k) === i).slice(-L.K3_MAX);
    if (na.length) rec.na = na;
    if (dk.includes(rec.k2)) {
      delete rec.w;
      if (C.isLivePhase(rec.ph) && mine && !C.isLivePhase(mine.ph) && rec.t === mine.t) rec.ph = mine.ph;
    }
    const theirs = (prev?.k3 ?? []).filter((k) => !this.goneK3.has(k) && !dk.includes(k) && !rec.k3?.includes(k));
    const own = (rec.k3 ?? []).filter((k) => !dk.includes(k));
    // A turn key another tab sent (w) and no answer settled yet is never overwritten by this page's newer turn key:
    // it moves to kw, and its row stays until a page settles it or the person dismisses it.
    const kw = [...(mine?.kw ?? []), ...(rec.kw ?? [])];
    if (mine?.w && mine.k2 !== rec.k2) kw.push(mine.k2);
    const kwOut = kw.filter((k, i, a) => a.indexOf(k) === i && k !== rec.k2 && k !== rec.k1 && !this.goneKw.has(k) && !dk.includes(k)).slice(-L.JOURNAL_MAX);
    if (kwOut.length) rec.kw = kwOut; else delete rec.kw;
    // Which of them carried files (kwf) moves with them, from every copy: such a key never takes retyped text alone.
    const kwf = [...(mine?.kwf ?? []), ...(rec.kwf ?? []), ...(mine?.w && mine.wf && mine.k2 !== rec.k2 ? [mine.k2] : [])];
    const kwfOut = kwOut.filter((k) => kwf.includes(k));
    if (kwfOut.length) rec.kwf = kwfOut; else delete rec.kwf;
    let out: AskRecord = rec;
    if (theirs.length || own.length !== (rec.k3?.length ?? 0)) {
      const k3 = [...theirs, ...own].slice(-L.K3_MAX);
      const c3: Record<string, string> = {};
      for (const k of k3) { const id = rec.c3?.[k] ?? prev?.c3?.[k]; if (id) c3[k] = id; }
      out = { ...rec, k3, ...(Object.keys(c3).length ? { c3 } : {}) };
    }
    // Another tab's decisions not settled yet stay (a second tab never decides a gate the first one may have
    // answered), except the attempts this page settled (by request id: a newer attempt on that gate stays). This page
    // writes only its own attempts: the ones it took in stay as their tab left them (written from here, a stale copy
    // would bring back one its tab settled), and the record copy's da is never written back.
    const ownDa: Record<string, string> = {};
    for (const [k, a] of this.attempts) if (a.own) ownDa[k] = a.rid;
    const da = { ...(prev?.da ?? {}), ...ownDa };
    // The gates seen to end, which every page reads as evidence: the stored ones plus the ones this page saw.
    const dg = [...(prev?.dg ?? []), ...this.dgNew.filter((r, i, a) => !prev?.dg?.includes(r) && a.indexOf(r) === i)].slice(-L.SETTLED_MAX);
    if (dg.length) out = { ...out, dg }; else if (out.dg) { out = { ...out }; delete out.dg; }
    // Per gate, the latest definite refusal a page made (the gate stays answerable), cleared by the gate's end.
    const dr: Record<string, string> = { ...(prev?.dr ?? {}) };
    for (const [k, rid] of this.drOps) { delete dr[k]; if (rid) dr[k] = rid; }
    const drk = Object.keys(dr).slice(-L.SETTLED_MAX);
    if (drk.length) out = { ...out, dr: Object.fromEntries(drk.map((k) => [k, dr[k] as string])) }; else if (out.dr) { out = { ...out }; delete out.dr; }
    for (const [k, rid] of Object.entries(da)) if (this.goneRid.has(rid)) delete da[k];
    const dak = Object.keys(da).slice(-L.JOURNAL_MAX);
    if (dak.length || out.da) out = { ...out, ...(dak.length ? { da: Object.fromEntries(dak.map((k) => [k, da[k] as string])) } : {}) };
    if (!dak.length && out.da) { out = { ...out }; delete out.da; }
    // With a journal the record is state only: the request evidence (w, k3, kw, da) lives in per-key entries and is never written
    // into a record. The dock's engine mirrors its record into the journal (a pinned engine's store is the journal's view).
    const row = this.jr ? stripEvidence(out) : out;
    const putOpts = admit ? { admit } : undefined;
    let kept: Promise<boolean> = Promise.resolve(false);
    if (C.validPut(this.slot.account, row)) {
      const op = this.uOp;
      const w = this.storeOp({ k: 'put', rec: row, front: o.front }, putOpts);
      this.dgNew = []; this.drOps = [];
      // The unsure mark's op is settled when the write is kept: at once for a store that answers at once, when it resolves for one
      // that answers with a promise (the journal's view). A refused write leaves it for a later save.
      if (w instanceof Promise) { kept = w.then((v) => v !== false); void kept.then((k) => { if (k && this.uOp === op) this.uOp = null; }); }
      else { kept = Promise.resolve(w !== false); if (w !== false) this.uOp = null; }
      if (this.jr && !this.pinSid) kept = this.jr.j.put(this.jr.handle, row, putOpts).then((r) => r === 'ok');
    }
    this.ptr = { k1: rec.k1, k2: rec.k2, t: rec.t };
    return kept;
  }
  /** Drops the chat record from the journal and the old store; true when the journal kept the removal (a store without a journal: its write). */
  /** `keepJournal`: the dock's pointer goes but the journal's record stays (a first message claimed null in it: its other tab reads R6). */
  private dropRec(rec: AskRecord, keepJournal = false, acct?: string): Promise<boolean> {
    const jdrop = this.jr && !this.pinSid && !keepJournal ? this.jr.j.drop(this.jr.handle, rec.r, rec.s, rec.k1, acct) : Promise.resolve(true);
    const w = this.storeOp({ k: 'drop', p: rec.p, c: rec.c, r: rec.r, k1: rec.k1 });
    return Promise.all([jdrop, Promise.resolve(w)]).then(([a, b]) => a && b !== false);
  }
  /** THE door to the store for a dock save or removal: one per-key op. A store with `apply` takes it as is (and may answer
   *  later, 'recentFull' when the capacity rule refused it); a snapshot store gets the op applied to its own read. An invalid put sends
   *  nothing and answers false; a drop with nothing to drop answers kept. A dock put's answer is also recorded (dockOwed, retryDock). */
  private storeOp(op: C.DockOp, o: { admit?: string; retry?: boolean } = {}): boolean | void | Promise<boolean> {
    const acct = this.slot.account;
    const s = this.store;
    let sent: C.DockOp = op;
    if (op.k === 'put') {
      const rec = L.validRec(op.rec);
      if (!rec || !C.validAccount(acct)) return false;
      sent = { ...op, rec };
      this.lastDockRow = rec;
    }
    if (!s.apply) {
      const st = C.applyOp(s.read(acct), acct, sent);
      return st ? (o.admit ? s.write(acct, st, { admit: o.admit }) : s.write(acct, st)) : true;
    }
    const g = this.gen;
    const k1 = sent.k === 'put' ? sent.rec.k1 : null;
    const note = (a: C.DockAnswer): boolean => { if (k1 !== null) this.dockAnswered(k1, g, a, !!o.retry); return a === true; };
    let ans: C.DockAnswer | Promise<C.DockAnswer>;
    try { ans = s.apply(acct, sent); } catch { ans = false; }
    return ans instanceof Promise ? ans.then(note, () => note(false)) : note(ans);
  }
  /** The expression the snapshot's `recentFull` is: the capacity refusal of this conversation's dock save, in this generation. */
  private recentFullNow(): boolean { return !!this.dockOwed && this.dockOwed.full && this.dockOwed.gen === this.gen && this.dockOwed.k1 === this.rec?.k1; }
  /** A dock put's answer: kept clears what is owed for that conversation; 'recentFull' sets the sticky capacity flag;
   *  a plain refusal owes the save and leaves the flag as it was. A change of what the panel shows publishes; a kept retry refreshes a
   *  Recent list on screen. An answer of an older generation changes nothing. */
  private dockAnswered(k1: string, g: number, a: C.DockAnswer, retry: boolean): void {
    if (g !== this.gen || this.phaseNow === 'ended') return;
    const before = this.recentFullNow();
    if (a === true) { if (this.dockOwed?.k1 === k1) this.dockOwed = null; }
    else if (a === 'recentFull') this.dockOwed = { k1, gen: g, full: true };
    else if (!(this.dockOwed && this.dockOwed.k1 === k1 && this.dockOwed.gen === g)) this.dockOwed = { k1, gen: g, full: false };
    if (before !== this.recentFullNow()) this.publish();
    if (a === true) {
      if (retry && this.recentShown) this.loadRecent();
      try { this.onDockKept?.(); } catch { /* the registry's own */ }
    }
  }
  /** Sends the owed dock save of the current conversation once (never save(), the journal or the record's clock). Called by wake(), the
   *  registry after a Clear and after another engine's kept dock write: an engine with nothing owed does nothing. */
  retryDock(): void {
    const o = this.dockOwed, row = this.lastDockRow;
    if (!o || o.gen !== this.gen || this.rec?.k1 !== o.k1 || !row || row.k1 !== o.k1 || this.dockRetrying || this.phaseNow === 'ended') return;
    this.dockRetrying = true;
    void Promise.resolve(this.storeOp({ k: 'put', rec: row }, { retry: true })).then(() => { this.dockRetrying = false; }, () => { this.dockRetrying = false; });
  }
  /** Told by the registry: this engine's dock put was kept (the other engines of the account may retry what the room it freed allows). */
  onDockKept: (() => void) | null = null;
  /** The Recent popover is open on this engine (AskPanel's effect; cleared on unmount and on engine replacement). */
  setRecentShown(v: boolean): void { this.recentShown = v; }
  private key(route: 'create' | 'turn' | 'command' = 'turn'): string | null { return this.jr ? this.jr.j.mint(route) : L.newKey(this.clock.random(16)); }
  private requestId(route: 'confirm' | 'answer'): string | null { return this.jr ? this.jr.j.mint(route) : L.newRequestId(this.clock.random(12)); }
  /** The computer's handle names the journal's entries; one that is not well-formed sends nothing. */
  private journalReady(): boolean { return !this.jr || okHandle(this.jr.handle); }
  /** THE send door of a journaled engine: admit (the entry is written and read back) -> `onAdmit` -> post (the key's lock, one
   *  call with the ticket). Resolves with the reply when its verdict is settled or admitted; rejects NotSentErr (never left) or
   *  SentErr (left; the verdict is not a settlement). Cancelled by the engine's end/reset at any phase. `accepts` (a create): the
   *  engine's test of a 2xx body; one it does not accept is an unknown verdict, so it settles nothing; the literal 'refuse' (a reply that
   *  proves another binding) is settled as refused by the journal in one update: the chat record goes, nothing moves to that session. */
  private sendJ(fields: Record<string, unknown>, call: (t: readonly Ticket[]) => Promise<unknown>, onAdmit?: () => void, accepts?: Accepts, out?: SendOut): Promise<unknown> {
    const jr = this.jr;
    if (!jr) return Promise.reject(new NotSentErr('invalid'));
    const tok = new SendToken();
    this.holds.add(tok);
    const done = () => { this.holds.delete(tok); };
    const a = jr.j.admit({ acct: this.slot.account, container: this.slot.computer, h: jr.handle, ...fields } as Op, tok);
    if ('kind' in a) { done(); return Promise.reject(new NotSentErr(a.why)); }
    try { onAdmit?.(); } catch { /* a listener never breaks the send */ }
    const box: { r: { ok: true; b: unknown } | { ok: false; e: unknown } | null } = { r: null };
    const go = (t: Ticket): Promise<unknown> => {
      let p: Promise<unknown>;
      try { p = Promise.resolve(call([t])); } catch (e) { p = Promise.reject(e); }
      return p.then((b) => { box.r = { ok: true, b }; return b; }, (e: unknown) => { box.r = { ok: false, e }; throw e; });
    };
    return jr.j.post(a, go, accepts).then((o) => {
      done();
      if (o.kind === 'notSent') throw new NotSentErr(o.why);
      const v = o.v, r = box.r;
      if (out) { out.v = v; out.settled = o.settled; if (o.late) out.late = o.late; }
      if (v.t === 'settled' || v.t === 'admitted') return r && r.ok ? r.b : v.body;
      throw new SentErr(v, r && !r.ok ? r.e : undefined);
    }, (e: unknown) => { done(); throw e; });
  }
  /** Why a send that never left says so. */
  private notSentReason(e: NotSentErr): string { return e.why === 'full' ? 'ask.checkEarlier' : e.why === 'elsewhere' ? 'ask.chatElsewhere' : 'ask.notRemembered'; }
  /** The entries of the stored journal, or null when they cannot be read now (concludes nothing). */
  private scanSure(): readonly Entry[] | null {
    if (!this.jr) return null;
    const sc = this.jr.j.scan(this.jr.handle);
    return sc.s === 'ok' && sc.acct === currentAccount() ? sc.entries : null;
  }
  private uid(): string { return String(++this.ids); }

  // ---- open: computer, readiness, realm ----
  /** Starts (or restarts) the flow: the computer's state, the agent's readiness, the realm, then the stored conversation. */
  open(): void {
    // An ended engine never comes back (its context is gone, or a holder let it go): a new engine is made instead (registry).
    if (this.phaseNow === 'ended') return;
    this.loaded = false;
    this.reset();
    this.dropSent();
    this.conv = C.emptyConv();
    this.rec = null; this.rd = null; this.version = null; this.maybe.clear();
    this.freshSession();
    this.conn = { lost: false, reconnecting: false };
    this.startingNow = false;
    this.set('checking', { blocked: null, band: null });
    // A listener may have ended the engine in that publish: no request is made for it.
    if ((this.phaseNow as Snapshot['phase']) === 'ended') return; // (the compiler narrowed the phase at the set() above)
    const g = this.gen;
    void settle(this.io.computer(this.slot.computer)).then((r) => {
      if (!this.live(g)) return;
      const row = r.ok && L.isObj(r.b) ? (L.isObj(r.b.data) ? r.b.data : r.b) : null;
      this.computerRealms = row && Array.isArray(row.realm_ids) ? (row.realm_ids as unknown[]).filter((x): x is string => typeof x === 'string') : null;
      const st = row ? String(row.status || '').toLowerCase() : 'running';
      if (st === 'stopped' || st === 'paused') { this.set('checking', { band: { k: 'stopped' } }); this.preflight(g, true); return; }
      if (/^(starting|restarting|pending)$/.test(st)) { this.startingWait(g, 'starting'); return; }
      if (/^(creating|provisioning)$/.test(st)) { this.startingWait(g, 'provisioning'); return; }
      if (st === 'failed' || st === 'error') return this.block('ask.computerFailed', { act: 'none', tone: 'bad', agent: false });
      this.preflight(g, false);
    });
  }

  // A computer on its way up: its row is read again every 5 s (3 min for a start, 10 for a new computer).
  private startingWait(g: number, k: 'starting' | 'provisioning'): void {
    this.startingNow = k === 'starting';
    this.set('checking', { band: { k } });
    let n = 0;
    const max = k === 'starting' ? START_POLLS : START_POLLS * 4;
    const again = () => this.later(() => {
      if (++n > max) { this.startingNow = false; this.set('checking', { band: { k: 'unreachable' } }); return; }
      void settle(this.io.computer(this.slot.computer)).then((r) => {
        if (!this.live(g)) return;
        const row = r.ok && L.isObj(r.b) ? (L.isObj(r.b.data) ? r.b.data : r.b) : null;
        const st = row ? String(row.status || '').toLowerCase() : '';
        if (st === 'running') { this.startingNow = false; this.bandNow = null; this.preflight(g, false); return; }
        again();
      });
    }, START_POLL_MS);
    again();
  }

  /** Start the stopped computer (C9: an unknown outcome reads the row back; never sent twice on its own). */
  startComputer(): void {
    if (this.startingNow) return;
    const g = this.gen;
    this.startingNow = true;
    this.publish();
    void settle(this.io.start(this.slot.computer)).then((r) => {
      if (!this.live(g)) return;
      if (!r.ok && !lostAnswer(r.e)) { this.startingNow = false; this.set(this.phaseNow, { band: { k: 'stopped' } }); return; }
      this.startingWait(g, 'starting');
    });
  }

  private preflight(g: number, stopped: boolean): void {
    const health = () => settle(this.io.health()).then((x) => {
      if (x.ok || !L.isObj(x.e) || (x.e.status !== 502 && x.e.status !== 503)) return x;
      return new Promise<Settled>((res) => this.later(() => { void settle(this.io.health()).then(res); }, WAKE_MS));
    });
    let since = signSeq;
    const reads: Promise<Settled[]> = health().then((x): Settled[] | Promise<Settled[]> => { since = signSeq; return x.ok ? Promise.all([x, settle(this.io.version()), settle(this.io.authStatus())]) : [x]; });
    let timedOut = false;
    const budget = this.later(() => { timedOut = true; this.unreachable(stopped); }, READ_MS);
    void reads.then((r) => {
      if (!this.live(g) || timedOut) return;
      this.cancel(budget);
      for (const x of r) {
        if (!x.ok) {
          if (stopped) return this.set('ready', { band: { k: 'stopped' } });   // a stopped computer's agent does not answer: the band says why
          const v = L.readView(x.e);
          if (v.drop) return;
          if (v.key === 'ask.unreachable') return this.unreachable(false);
          return this.block(v.key as string, { act: v.key === 'ask.unsupported' ? 'agent' : 'retry', agent: v.key !== 'ask.accessRefused' });
        }
      }
      this.version = (r[1] as { b: unknown }).b;
      this.followUps = true;
      this.auto.cap = L.capOn(this.version, 'approval_policy');
      this.decideRealm(g, (r[2] as { b: unknown }).b, since);
    });
  }
  private unreachable(stopped: boolean): void {
    if (this.phaseNow === 'ready' && this.bandNow) return;
    this.set('ready', { band: stopped ? { k: 'stopped' } : { k: 'unreachable' }, blocked: null });
  }

  private decideRealm(g: number, status: unknown, since: number): void {
    const rd = L.readiness(this.version, status, this.slot.account);
    this.rd = rd;
    this.liftSignHold(rd, since);
    if (rd.state === 'unsupported') return this.block('ask.unsupported', { act: 'agent' });
    if (rd.state === 'identity') return this.block('ask.identityUnknown');
    if (rd.state === 'otherAccount') return this.block('ask.otherAccount', { act: 'agent' });
    const login = rd.state === 'login';
    const rr = L.realmFor({
      selected: this.slot.realm, pinned: rd.pinned, restricted: login ? false : rd.restricted,
      loginRealms: login ? null : rd.loginRealms, computerRealms: this.computerRealms, picked: null,
    });
    if ('choices' in rr) return this.block('ask.pickRealmTop', { act: 'none', agent: false });
    if ('error' in rr) return this.block(rr.error === 'PINNED' ? 'ask.pinned' : 'ask.realmNeeded', { act: 'none' });
    this.realm = rr.realm;
    if (login) return this.proceed(g);
    this.canAct(g, (k) => { if (k === 'renew') this.rd = { state: 'login', renew: true, pinned: rd.pinned }; this.proceed(g); });
  }

  // The realm read makes the agent resolve the realm's tokens, read-only; the status read after it says how
  // that went (the old canAct, decided from typed signals only).
  // `failed`: told when it ends any other way than done (refused, timed out, dropped); nothing was sent by it.
  private canAct(g: number, done: (k: 'ok' | 'renew') => void, failed?: () => void): void {
    if (L.realmAuth(null, this.realm, null) === 'ok') return done('ok');
    let timedOut = false;
    const budget = this.later(() => { timedOut = true; this.unreachable(false); failed?.(); }, READ_MS);
    // The status read's place among sign-in holds, noted as it starts (after the probe).
    let since = signSeq;
    void settle(this.io.probe(this.realm)).then((p) => { since = signSeq; return settle(this.io.authStatus()).then((s) => [p, s] as const); }).then(([p, s]) => {
      if (!this.live(g) || timedOut) return;
      this.cancel(budget);
      const fail = (key: string | null, o: Partial<Blocked> = {}) => { if (key) this.block(key, o); failed?.(); };
      // A ready status proves the sign-in whatever the probe says: the hold goes before a probe fault stops the check.
      if (s.ok) this.liftSignHold(L.readiness(this.version, s.b, this.slot.account), since);
      if (L.probeFault(p)) { const v = L.readView((p as { e: unknown }).e); return fail(v.drop ? null : (v.key as string)); }
      if (!s.ok) { const v = L.readView(s.e); return fail(v.drop ? null : (v.key as string)); }
      const rd = L.readiness(this.version, s.b, this.slot.account);
      if (rd.state === 'otherAccount') return fail('ask.otherAccount', { act: 'agent' });
      if (rd.state === 'login') return done('renew');
      if (rd.state !== 'ready' || this.rd?.state !== 'ready' || rd.owner !== this.rd.owner) return fail('ask.identityUnknown');
      const k = L.realmAuth(s.b, this.realm, p);
      if (k === 'update') return fail('ask.unsupported', { act: 'agent' });
      if (k === 'read') { const v = L.readView((p as { e?: unknown }).e); return fail(v.drop ? null : (v.key as string)); }
      done(k);
    });
  }

  /** Ready: the slot's current conversation is picked up where it is, else an empty one. */
  private proceed(g: number): void {
    this.loaded = true;
    const convs = C.convsFor(this.store.read(this.slot.account), this.slot.account, this.slotKey());
    if (this.pinSid) {
      const sid = this.pinSid;
      const mine = convs.find((r) => r.s === sid);
      if (mine) return this.reopen(g, mine);
      // Not stored here: the session is read from the agent with a record of its own; it is stored by its first save.
      const k1 = this.key('create'), k2 = this.key('turn');
      // A pinned chat this page cannot track (no keys can be made): it says so, never an empty idle chat.
      if (!k1 || !k2) return this.block('ask.cantOpenHere', { act: 'retry', agent: false });
      return this.reopen(g, { p: this.slot.project, c: this.slot.computer, r: this.realm, s: sid, t: null, k1, k2, rc: 'custom', n: null, at: this.clock.now(), i: null, q: 0, ph: 'completed', l: 'en' });
    }
    // The person picked a conversation while this engine loaded: it opens, unless another engine holds it now or it is gone (then the
    // front record decides, as without a pick).
    const want = this.want;
    this.want = null;
    if (want) {
      const w = convs.find((r) => r.k1 === want.k1);
      if (w && !(w.s && this.held?.(w.s))) return this.reopen(g, w);
    }
    // The front record may be a conversation another engine holds now (handed to its reference): this engine starts blank.
    const rec = convs[0] ?? null;
    if (rec && !(rec.s && this.held?.(rec.s))) return this.reopen(g, rec);
    this.set('ready', { blocked: null, band: this.bandNow && this.bandNow.k === 'stopped' ? this.bandNow : null });
  }

  // ---- reopening a stored conversation ----
  // `listed`: the pending turn key (w) was read BY KEY and said so ('hit': the turn it admitted; 'none': nothing under it, which proves
  // nothing; 'failed': not read).
  private reopen(g: number, rec0: AskRecord, listed?: 'hit' | 'none' | 'failed'): void {
    // With a journal the request evidence (w, k3, kw, da) is what its entries hold, joined to the record.
    const rec = this.jr ? this.jr.j.attach(this.jr.handle, rec0) ?? stripEvidence(rec0) : rec0;
    // A conversation that already exists is never switched On for the person: only a new one starts with the default.
    this.wantAuto = false;
    this.rec = { ...rec };
    this.ptr = { k1: rec.k1, k2: rec.k2, t: rec.t };
    this.dropSent();
    this.conv = C.emptyConv(rec.s);
    // Decisions this page (or another tab) sent whose outcome is not known: their cards offer no second one. They stay
    // the store's: this page writes only its own attempts.
    for (const [k, rid] of Object.entries(rec.da ?? {})) if (!this.attempts.has(k)) this.attempts.set(k, { rid, status: 'unknown', kind: 'once', tool: '', text: '', own: false, tok: ++this.tokN });
    this.set('checking', { blocked: null });
    if (!rec.s) {
      // The create may have made a session (C9): its text is gone (never stored), so Check status repeats the
      // create with the same key and stored body and then reads the session's turns.
      this.conv = C.addUser(this.conv, this.lostUser(rec.k2, 'create'));
      return this.set('ready', {});
    }
    if (rec.w && !listed) {
      // A turn key whose answer never came (w): the agent is asked what it holds under THAT key. A turn it admitted under it is the
      // record's turn. Nothing under it proves nothing (the request may still be on its way): the row waits for Check status or the
      // retyped text (under the same key). The agent's newest turn is never taken for it (it may be another tab's, a follow-up's or
      // another client's), and a page that cannot read by key adopts nothing.
      const held = this.rec, k2 = rec.k2;
      void this.keyedTurn(rec).then((t0) => {
        if (!this.live(g)) return;
        // The record or its key moved between the read and this callback (a queued heal, a stored pair adopted): the answer is about another key,
        // and the obsolete `rec` is never installed again. The conversation opens again from the record it holds now.
        if (t0.k === 'stale' || this.rec !== held || held?.k2 !== k2) return this.rec ? this.reopen(g, this.rec) : undefined;
        if (t0.k === 'bad') return this.reopen(g, rec, 'failed');
        if (t0.k === 'miss') return this.reopen(g, rec, 'none');
        this.reopen(g, rec, 'hit');
      });
      return;
    }
    const pending = !!rec.w;
    const live = !pending && C.isLivePhase(rec.ph);
    const hn = ++this.histN;
    void this.readHistory(rec, false).then(([t, verdict, failCode, , strictCode]) => {
      if (!this.live(g) || hn !== this.histN) return;
      if (!t.ok) {
        const e = t.e;
        // A session the agent no longer has proves nothing about a request that may have reached it: with a journal a chat
        // holding an unsettled request stays (its rows read unknown) until the person dismisses them.
        if (L.isObj(e) && e.status === 404 && !this.hasEvidence(rec)) {
          void this.dropRec(rec); this.rec = null; this.conv = C.emptyConv();
          // A pinned chat is that session only: its absence is said, as unknown (gone, or not reachable), never an empty
          // chat (C9). The dock's own conversation falls back to an empty one.
          if (this.pinSid) return this.block('ask.goneOrUnreachable', { act: 'retry', tone: 'muted', agent: false });
          return this.set('ready', {});
        }
        if (!live) return this.unreachable(false);
      }
      // The reads were about a failed turn: when another tab has moved this conversation to a newer turn meanwhile,
      // they describe the older one, so the conversation is opened again as stored (never A's verdict on B).
      const moved = (): AskRecord | null => {
        if (!(rec.ph === 'failed' && rec.t)) return null;
        const s0 = this.storedOf(rec);
        return s0 && s0.t !== rec.t ? s0 : null;
      };
      const m0 = moved();
      if (m0) return this.reopen(g, m0);
      const h = C.historyFrom(t.ok ? t.b : null, { liveTail: live && !!rec.t, idOf: () => 'h' + this.uid(), at: rec.at, lastFailed: verdict, failCode, strictCode });
      // A close marker naming another code than the turn list's is not that turn's: the verdict is unsure.
      const lastFailed = h.unsure ? 'unsure' : verdict;
      if (this.rec && this.rec.k1 === rec.k1) this.noteVerdict(this.rec, lastFailed, rec.t);
      const m1 = moved();
      if (m1) return this.reopen(g, m1);
      let conv: C.Conv = { ...C.emptyConv(rec.s), users: Object.fromEntries(h.users.map((u) => [u.id, u])), turns: h.turns, ...(lastFailed === 'unsure' && !live && !h.turns.length ? { unsure: true as const } : {}) };
      // Follow-ups not settled when the page went (k3: an answer lost, or queued and not read yet): their text is
      // gone, their keys are not; each shows as its own row, never bound to new typing (C9: two text-less rows cannot
      // be told apart). A row with a command id is read back by it; one without is dismissed by the person.
      for (const k of rec.k3 ?? []) conv = C.addUser(conv, { ...this.lostUser(k, 'command'), commandId: rec.c3?.[k] ?? null });
      // The same for a turn key no turn in the list answers.
      let owed: string | null = null;
      if (pending) {
        const lost = { ...this.lostUser(rec.k2, 'turn'), reason: listed === 'failed' ? 'ask.checkFailed' : '' };
        conv = C.addUser(conv, lost);
        // The agent holds a turn under this key: the row is read by that key through the journal, the one consumer that settles the
        // entry, moves the record's (turn, key) pair and shows the turn (Check status, by itself).
        if (listed === 'hit') owed = lost.id;
      }
      // Turn keys a newer one replaced before they settled (another tab): no read can tie a turn to them, so each
      // stays a row the person dismisses.
      for (const k of rec.kw ?? []) conv = C.addUser(conv, { ...this.lostUser(k, 'turn'), reason: 'ask.otherTab' });
      if (live && rec.t) {
        const tail = this.tailText(t.ok ? t.b : null);
        const u = tail !== null ? this.historyUser(tail) : null;
        if (u) conv = C.addUser(conv, u);
        conv = C.addTurn(conv, { turnId: rec.t, user: u ? u.id : null, now: this.clock.now() });
        const cur = C.current(conv) as C.TurnBlock;
        cur.startedAt = null;
        this.conv = conv;
        this.adopted = { turn: rec.t, prompt: !!u };
        this.conn.reconnecting = true;
        this.set('ready', {});
        this.readAuto();
        this.checkRestored();
        this.resync(false);
        this.recon('open');
        return;
      }
      if (live && !rec.t) {
        // A session and maybe a turn: the agent's own list says which.
        this.conv = conv;
        this.checkRestored();
        return this.adoptTurn(g);
      }
      this.conv = conv;
      this.set('ready', {});
      this.readAuto();
      this.checkRestored();
      this.recon('open');
      if (owed) this.check(owed);
    });
  }
  /** Restored follow-up rows with a command id are read back at once: one the agent already settled goes. */
  private checkRestored(): void {
    for (const u of Object.values(this.conv.users)) if (u.via === 'command' && !u.text && u.commandId && u.state === 'unknown') this.checkCommand(u.id);
  }
  private tailText(body: unknown): string | null {
    const ms = L.isObj(body) && Array.isArray(body.messages) ? (body.messages as unknown[]) : [];
    const bounds = L.isObj(body) && Array.isArray(body.turn_boundaries) ? (body.turn_boundaries as unknown[]).filter((x): x is number => typeof x === 'number') : [];
    const from = bounds.reduce((m, b) => Math.max(m, b), -1) + 1;
    for (let i = from; i < ms.length; i++) {
      const m = ms[i];
      if (!L.isObj(m) || m.role !== 'user' || !Array.isArray(m.blocks)) continue;
      const text = (m.blocks as unknown[]).filter(L.isObj).filter((b) => b.kind === 'text' && typeof b.text === 'string').map((b) => b.text as string).join('\n');
      if (text) return text;
    }
    return null;
  }
  private historyUser(text: string): C.UserMsg {
    return { id: 'h' + this.uid(), text, at: this.clock.now(), key: '', via: 'turn', state: 'sent', turnId: null, commandId: null, reason: '' };
  }
  private lostUser(key: string, via: C.Via): C.UserMsg {
    const id = 'u' + this.uid();
    this.maybe.add(id);
    const u: C.UserMsg = { id, text: '', at: this.clock.now(), key, via, state: 'unknown', turnId: null, commandId: null, reason: '' };
    // Its turn request carried files a reload did not keep: retyped text alone must never go under its key. (A first
    // message whose create went unanswered sent no turn yet, so its key carried nothing.)
    if (via === 'turn' && ((this.rec?.wf && key === this.rec.k2) || this.rec?.kwf?.includes(key))) u.lostFiles = true;
    return u;
  }
  /** The turn the stored key k2 admitted, read BY KEY through the journal (a repeatable read that settles, retires and stores nothing). A page without a
   *  journal cannot classify a read by key: it adopts nothing (`miss`, the row stays). */
  private keyedTurn(rec: AskRecord): Promise<KeyedTurn> {
    const jr = this.jr;
    if (!jr) return Promise.resolve({ k: 'miss' });
    if (!rec.s) return Promise.resolve({ k: 'bad' });
    const held = this.rec, k2 = rec.k2;
    return jr.j.peekTurn(this.io, jr.handle, rec.s, rec.r, k2).then((v): KeyedTurn => {
      if (this.rec !== held || held?.k2 !== k2) return { k: 'stale' };
      const id = v.t === 'settled' && L.isObj(v.body) && L.seg(v.body.turn_id) ? v.body.turn_id : null;
      if (id) return { k: 'hit', id, state: L.isObj(v.body) && typeof v.body.state === 'string' ? v.body.state : '' };
      return (v.t === 'unknown' && v.why === 'miss') || v.t === 'notAdmitted' ? { k: 'miss' } : { k: 'bad' };
    }, (): KeyedTurn => ({ k: 'bad' }));
  }
  /** The agent says, by the stored turn key (never by its turn list), whether that key started a turn. `row`: the text-less "may have
   *  gone through" row a failed read left (Check status reads again). */
  private adoptTurn(g: number, row?: string): void {
    const rec = this.rec as AskRecord;
    // The row is busy while the key is read; every end of the read puts it back to what it was (unknown, with its reason) unless the
    // read settles it. A row of ANOTHER key than the record's is never the one this hit is about.
    const was = row ? this.conv.users[row] : undefined;
    const back = (reason?: string) => { if (row && this.conv.users[row]) this.conv = C.patchUser(this.conv, row, { state: 'unknown', reason: reason ?? was?.reason ?? '' }); };
    if (row) { this.conv = C.patchUser(this.conv, row, { state: 'sending', reason: '' }); this.publish(); }
    // An opening or recovery that ends here reads this session's mode too, for the chip (a read never turns On here).
    if (this.autoSid !== rec.s) this.readAuto();
    const held = this.rec, k2 = rec.k2;                          // the identity the read is about, kept to the end
    const moved = () => this.rec !== held || held?.k2 !== k2;
    void this.keyedTurn(rec).then((t0) => {
      if (!this.live(g)) return;
      // The record or its key moved while the read was out, or between the read's check and this callback: the answer is about another
      // key. Nothing is adopted; the row stays unresolved.
      if (t0.k === 'stale' || moved()) { back(); return this.publish(); }
      if (t0.k === 'bad') {
        // A read that failed answers nothing: the stored phase stays, and a row says the check did not work.
        if (row) back('ask.checkFailed');
        else this.conv = C.addUser(this.conv, { ...this.lostUser(rec.k2, 'turn'), reason: 'ask.checkFailed' });
        this.set('ready', {});
        return this.recon('open');
      }
      // No turn under the key: the message has not started. The row stays (typed again it goes under the same key,
      // or the person dismisses it); the conversation is never called completed for it.
      if (t0.k === 'miss') {
        // With a journal a turn key is in flight only while its ENTRY is (rec.w joins it): a chat whose phase says "sending" but holds no
        // entry has nothing to recover (the key was fenced or never left), so it shows no row, whatever the stored phase says.
        if (row) back('ask.notStarted');
        else if (!this.jr || rec.w) this.conv = C.addUser(this.conv, { ...this.lostUser(rec.k2, 'turn'), reason: 'ask.notStarted' });
        this.set('ready', {});
        return this.recon('open');
      }
      const adopt = () => {
        // Only the turn this key admitted is adopted; the text-less row that stood for it goes, a row of another key stays unresolved.
        if (row && this.conv.users[row]?.key === rec.k2) this.conv = { ...this.conv, users: Object.fromEntries(Object.entries(this.conv.users).filter(([k]) => k !== row)), loose: this.conv.loose.filter((x) => x !== row) };
        else back();
        const tid = t0.id;
        rec.t = tid; rec.ph = 'working'; this.save();
        this.conv = C.addTurn(this.conv, { turnId: tid, now: this.clock.now() });
        // Admitted before the transcript above was read: it may be in it already, as a record's turn may (adopted). That read
        // was not cut at the last boundary, so what it holds of the turn is read again when the turn ends.
        this.adopted = { turn: tid, prompt: false };
        this.conn.reconnecting = true;
        this.set('ready', {});
        this.resync(false);
        this.recon('open');
      };
      // The key's ENTRY is still stored (its request is proven by this hit): the journal settles it by that key, the one consumer that removes
      // an entry on proof. Adoption alone would leave a proven request pending. The journal's answer decides nothing more here: the hit did.
      if (rec.w && this.jr) {
        void this.jr.j.check(this.io, this.jr.handle, k2).then((c) => c, () => null).then((c) => {
          if (!this.live(g) || moved()) { back(); return this.publish(); }
          // Adopt only after the journal PROVED the request and settled its entry (or holds the settlement owed). A failed or unknown check
          // leaves the entry, the pending key and the row as they were: nothing is called done that is not.
          if (!c || c.v.t !== 'settled' || (c.settled !== 'done' && c.settled !== 'owed')) { back('ask.checkFailed'); this.set('ready', {}); return this.recon('open'); }
          delete rec.w; delete rec.wf;
          adopt();
        });
        return;
      }
      adopt();
    });
  }

  // ---- sending ----
  /** Whether Send can work now (the conversation is ready and the computer and its agent are up). */
  canSend(): boolean {
    const k = this.bandNow?.k;
    if (!this.journalReady() || (this.pinSid && !this.rec?.s)) return false;
    return this.phaseNow === 'ready' && k !== 'stopped' && k !== 'starting' && k !== 'unreachable' && k !== 'provisioning';
  }
  /** Why a send with "Auto-approve this reply" cannot go now (a strings key), or null. It goes only as a fresh turn on the open
   *  chat with a journal, so its key and its policy are born together and nothing ever asks that key again without it: never as
   *  the first message (create), a follow-up while a turn runs, or the journal-less retype of a lost key. */
  autoTurnBlock(): string | null {
    if (!this.jr) return 'ask.autoTurnUnavailable';
    if (this.freshOwed || C.routeFor(this.conv) !== 'turn') return 'ask.autoTurnLater';
    return null;
  }
  /** Sends a typed message (Enter). Returns false when nothing was sent (not ready, a send still unsettled, or held
   *  as a possible duplicate of a waiting follow-up: `anyway` is the person's Send anyway). `policy`: the person picked
   *  "Auto-approve this reply" for this one message (never kept for the next). */
  send(text: string, anyway = false, carry?: Carry, policy?: 'auto_approve'): boolean {
    if (!this.canSend()) return false;
    if (policy && this.autoTurnBlock()) return false;
    // Images ride a turn only (a follow-up carries text), and the message with its files must fit (attach.ts).
    if (this.attBlock(text, carry)) return false;
    // A page's prefill owes a new conversation: it is made first, never the open one appended to.
    if (this.freshOwed) { if (this.unsettled() || !this.loaded) return false; this.freshNow(); }
    // Only a lost first message or turn takes the retyped text (one of each at most); unsettled follow-ups never do.
    // With a journal nothing is ever asked again under a key that may have left: the retyped text goes as a new message.
    const lost = this.jr ? undefined : this.conv.loose.map((id) => this.conv.users[id]).find((x) => x && x.state === 'unknown' && !x.text && x.via !== 'command' && !x.lostFiles);
    if (lost) {
      // A first message or turn a reload lost: the retyped text goes under its key, so it can never run twice (the
      // agent answers the stored receipt, or idempotency_key_reused when the earlier text differed: keyTaken).
      if (L.checkText(text)) return false;
      this.conv = C.patchUser(this.conv, lost.id, { text, at: this.clock.now(), state: 'sending', reason: '' });
      this.publish();
      if (lost.via === 'create' && !this.rec?.s) this.postCreate(lost.id);
      else this.turnOut(lost.id);
      return true;
    }
    if (L.checkText(text) || !C.canSendMore(this.conv)) return false;
    // The same text as a follow-up still waiting, or a waiting follow-up a reload left without its text: ask before a
    // second copy goes (the person may think the first one was lost).
    const waiting = Object.values(this.conv.users).filter((x) => x.via === 'command' && (x.state === 'queued' || x.state === 'unknown' || x.state === 'sending'));
    const same = waiting.some((x) => x.text === text);
    const blind = waiting.filter((x) => !x.text && !this.dupSeen.has(x.id));
    if (!anyway && (same || blind.length)) {
      this.dupNow = { text, earlier: !same };
      this.publish();
      return false;
    }
    if (anyway) for (const x of blind) this.dupSeen.add(x.id);
    this.dupNow = null;
    const via = C.routeFor(this.conv);
    if (via === 'command' && !this.followUps) return false;
    const key = this.key(via === 'command' ? 'command' : 'turn');
    if (!key) return false;
    if (policy && via !== 'turn') return false;
    const u: C.UserMsg = { id: 'u' + this.uid(), text, at: this.clock.now(), key, via, state: 'sending', turnId: null, commandId: null, reason: '', ...(carry ? carried(carry) : this.takeAtt()), ...(policy ? { auto: true as const } : {}) };
    this.conv = C.addUser(this.conv, u);
    this.publish();
    // A start's explicit choices go with its row: its create may wait for a sign-in, and a retry of the same row keeps them.
    if (via === 'create' && this.nextOpts) this.rowOpts.set(u.id, this.nextOpts);
    if (via === 'create') this.signInThenCreate(u.id);
    else this.routeOut(u.id);
    return true;
  }

  private signHoldKey(): string { return `${this.slot.account}\u0000${this.slot.computer}`; }
  // Only a ready read proves the sign-in went: readiness is 'ready' only for this engine's account (another account
  // reads 'otherAccount'), and the engine reads only its own computer's agent. Signed out, unreadable or unsure keeps it.
  private liftSignHold(rd: L.Readiness | null, since: number): void {
    const key = this.signHoldKey();
    const at = signHeld.get(key);
    if (rd?.state === 'ready' && at !== undefined && at <= since) signHeld.delete(key);
  }
  private signInThenCreate(uid: string): void {
    if (this.rd?.state !== 'login') return this.create(uid);
    const g = this.gen;
    // An earlier sign-in may have gone through: only the agent's status is read again, never a second sign-in.
    if (signHeld.has(this.signHoldKey())) return this.afterSignIn(g, uid);
    // Core's sign-in resolves, never rejects; a throw or rejection is a bug, read like a lost answer.
    const held = this.signHoldKey();
    void Promise.resolve().then(() => this.io.signIn()).then((r) => r, () => ({ kind: 'unknown' }) as const).then((r) => {
      const v = L.signInView(r);
      // Recorded whatever became of this engine meanwhile (New conversation, a realm change, a replacement engine): the hold
      // is the account's and computer's, not this flow's. Only the reads and the message below need the flow still live.
      if (v.hold) signHeld.set(held, ++signSeq);
      if (!this.live(g)) return;
      if (v.prove) return this.afterSignIn(g, uid);
      this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: v.key });
      this.publish();
    });
  }
  // The agent's own status after the sign-in. Not ready is never "could not" (C9): the sign-in may still finish.
  private afterSignIn(g: number, uid: string): void {
    const since = signSeq;
    void settle(this.io.authStatus()).then((r) => {
      if (!this.live(g)) return;
      const rd = r.ok ? L.readiness(this.version, r.b, this.slot.account) : null;
      if (!rd || rd.state !== 'ready') {
        this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: rd?.state === 'otherAccount' ? 'ask.otherAccount' : 'ask.signUnknown' });
        return this.publish();
      }
      this.liftSignHold(rd, since);
      this.rd = rd;
      // The realm check refused or timed out: the agent is signed in, but the create never went, so the message was not sent.
      const notSent = () => { if (!this.live(g)) return; this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: 'ask.notOpened' }); this.publish(); };
      this.canAct(g, (k) => {
        if (k === 'ok') return this.create(uid);
        notSent();
      }, notSent);
    });
  }

  private create(uid: string): void {
    const given = this.rowOpts.get(uid);
    if (given) return this.createWith(uid, given);
    this.dockOpts((o) => {
      if (!this.conv.users[uid]) return;
      if (o) return this.createWith(uid, o);
      this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: 'ask.defaultUnread' });
      this.publish();
    });
  }
  /** The dock's own create options: never follow_realm_backend. On an agent that has a realm default, it is read
   *  right before the create and sent explicitly; null when that answer cannot be read (the caller never falls back to a native start). */
  private dockOpts(then: (o: L.CreateOpts | null) => void): void {
    if (!L.capOn(this.version, 'acp_default')) return then({ helperGates: true });
    const g = this.gen;
    void settle(this.io.acpDefault(this.realm)).then((r) => {
      if (!this.live(g)) return;
      const d = r.ok && L.isObj(r.b) ? r.b.delegated_agent : undefined;
      then(d === 'claude' ? { claude: { model: '' }, helperGates: true } : d === '' ? { helperGates: true } : null);
    });
  }
  /** A row that reached a send path it cannot leave from (an assumption its callers keep was broken, or a key could not be
   *  minted) never stays Sending… with nothing to land it: Not sent when its key never left, unknown
   *  when an earlier send of the same key may have. Only a row still `sending` moves. */
  private strand(uid: string, mayHaveLeft: boolean): void {
    if (this.conv.users[uid]?.state !== 'sending') return;
    this.conv = C.patchUser(this.conv, uid, mayHaveLeft ? { state: 'unknown', reason: '' } : { state: 'notSent', reason: 'ask.startNotSent' });
    this.publish();
  }
  /** Whether a send under `key` may have left: the record (this page's, or the stored one every tab writes) still holds it as
   *  the pending turn key (k2 with w), a displaced unsettled turn key (kw) or an unsettled follow-up key (k3). With no record
   *  at all nothing proves the key fresh, so it may have. With a journal, Not sent needs proof:
   *  the key was minted by this page's journal and never admitted (journal unspent), and the entries, read for this engine's
   *  account, hold nothing of it. An unreadable journal, another account's, or a key this page did not mint reads unknown: a
   *  missing entry proves nothing (settled entries are removed, malformed ones skipped) and the stored record's evidence is
   *  empty when the entries cannot be read. */
  private keyMayHaveLeft(rec: AskRecord | null, key: string): boolean {
    if (!rec) return true;
    if (this.jr) return !this.jr.j.unspent(key) || this.jr.j.holdsKey(this.jr.handle, rec.r, key, this.slot.account) !== false;
    const holds = (r: AskRecord | undefined) => !!r && ((r.k2 === key && !!r.w) || !!r.kw?.includes(key) || !!r.k3?.includes(key));
    return holds(rec) || holds(this.storedOf(rec));
  }
  private createWith(uid: string, opts: L.CreateOpts): void {
    const u = this.conv.users[uid];
    if (!u) return;
    const k1 = this.key('create');
    if (!k1) return this.strand(uid, false);
    this.createOpts.set(k1, opts);
    this.rowKey.set(uid, k1);
    this.rec = {
      p: this.slot.project, c: this.slot.computer, r: this.realm, s: null, t: null, k1, k2: u.key, rc: 'custom', n: null,
      at: 0, i: null, q: 0, ph: 'opening', l: 'en',
    };
    if (hasAtt(u)) this.rec.wf = true;
    // The chat record is the recovery metadata of a create whose answer may be lost: no create leaves unless the journal kept it
    // first. A record that could not be kept is a request that was not sent (it can be tried again).
    if (!this.jr) { this.save({ front: true }); return this.postCreate(uid); }
    const g = this.gen, rec = this.rec;
    void this.saveKept({ front: true }).then((kept) => {
      if (!this.live(g) || this.rec !== rec) return;
      if (!kept) {
        this.conv = C.patchUser({ ...this.conv, sid: null }, uid, { state: 'notSent', reason: 'ask.notRemembered' });
        void this.dropRec(rec); this.rec = null;
        return this.publish();
      }
      this.postCreate(uid);
    });
  }

  private postCreate(uid: string): void {
    const g = this.gen, rec = this.rec as AskRecord;
    const opts = this.createOpts.get(rec.k1);
    if (!opts && !this.jr) {
      // A journal-less replay after a reload (the options were in memory only): the dock's own options again. A start's choices are
      // journaled and never replayed. Other bytes under the same key are refused by the agent (idempotency_key_reused), never run
      // twice; a realm default that cannot be read now leaves the row unknown (the key may have left before), never Not sent.
      return this.dockOpts((o) => {
        if (this.rec !== rec || !this.conv.users[uid]) return;
        if (!o) { this.conv = C.patchUser(this.conv, uid, { state: 'unknown', reason: '' }); return this.publish(); }
        this.createOpts.set(rec.k1, o);
        this.postCreate(uid);
      });
    }
    const body = opts ? L.createBody(rec.r, rec.c, opts) : null;
    if (!body) {
      // A first create whose options build no body: nothing leaves, and the record goes (it can be sent again).
      this.conv = C.patchUser({ ...this.conv, sid: null }, uid, { state: 'notSent', reason: 'ask.startNotSent' });
      void this.dropRec(rec); this.rec = null;
      return this.publish();
    }
    const arm = () => { this.conv = C.patchUser(this.conv, uid, { state: 'sending' }); this.publish(); };
    const k1 = rec.k1;
    let sent: Promise<unknown>;
    // What the reply must show is fixed at the send: a reply that comes after the engine ended or reset is judged by the same terms.
    const want = this.startedWant(rec), acct = this.slot.account;
    const out: SendOut = {};
    if (this.jr) sent = this.sendJ({ route: 'create', r: rec.r, key: k1 }, (t) => this.io.create(body, k1, rec.r, tix(...t, approvalModeOf(body) !== 'default' ? this.leaseHandle(rec.r)?.mintTicket(leaseRoutes.create, k1) : null)), arm, (b) => { const m = L.checkStarted(b, want); return m === 'MISSING' ? false : m === 'MISMATCH' ? 'refuse' : true; }, out);
    else { arm(); sent = this.io.create(body, k1, rec.r); }
    sent.then((res) => {
      const bad = L.checkStarted(res, want);
      if (bad === 'MISMATCH') {
        // The session exists (the reply names it) but is bound elsewhere, so nothing is sent to it and no record may route a turn to it:
        // the chat's record goes at BOTH of its addresses (a journaled settlement may already have moved it to the session, or owe the
        // move), the create address first so a late handoff finds nothing to move. Whether or not this engine is still the one asking:
        // the record is the account's, and a reload would reopen it.
        const sid = L.isObj(res) && L.seg(res.session_id) ? res.session_id : null;
        if (this.live(g)) {
          this.rec = null;
          this.conv = C.patchUser({ ...this.conv, sid: null }, uid, { state: 'refused', reason: 'ask.bindingFailed' });
          this.publish();
        }
        this.dropBound(rec, sid, acct);
        return;
      }
      if (!this.live(g)) return;
      if (bad === 'MISSING') {
        // The reply does not carry the evidence that this is the binding asked for: nothing is proven, so the create stays unknown (C9).
        // A journaled create never gets here (its `accepts` keeps the verdict unknown, so nothing was settled or moved); this is the
        // journal-less engine, whose Check status repeats the create under the same key.
        this.maybe.add(uid);
        rec.ph = 'unknown'; this.save();
        this.conv = C.patchUser(this.conv, uid, { state: 'unknown' });
        return this.publish();
      }
      // The reply settled the create: the journal moved the chat record to the session (or owes the move). Nothing is taken from the
      // reply but the proof that the session is live: the first message goes through the gate, which reads the durable record.
      if (this.jr) return this.firstTurn(uid, 'owed', { sid: (res as { session_id: string }).session_id });
      rec.s = (res as { session_id: string }).session_id;
      this.conv = { ...this.conv, sid: rec.s };
      const u = this.conv.users[uid];
      // A reload lost the text: the turn list says what the stored turn key did; the placeholder row goes with it.
      if (!u || !u.text) { rec.ph = 'sending'; this.save(); return this.adoptTurn(g, u ? uid : undefined); }
      rec.ph = 'sending';
      this.save();
      this.armAuto(uid, () => this.dispatch(uid));
    }, (e0: unknown) => {
      // A cancel that found the call claimed (the engine ended or reset): the call's own settlement arrives later, and a reply proving
      // another binding still takes its record away (the journal moved it to the session when it settled).
      if (out.late) void out.late.then((l) => {
        const body = l.v.t === 'settled' ? l.v.body : null;
        if (L.checkStarted(body, want) === 'MISMATCH') this.dropBound(rec, l.v.sid ?? (L.isObj(body) && L.seg(body.session_id) ? body.session_id : null), acct);
      }, () => { /* an unsettled call proves nothing; its entry stays for Check again */ });
      if (!this.live(g)) return;
      if (e0 instanceof NotSentErr) {
        // Never asked: no chat was made, so its record goes with the refusal (a reload brings no row back).
        this.conv = C.patchUser({ ...this.conv, sid: null }, uid, { state: 'notSent', reason: this.notSentReason(e0) });
        void this.dropRec(rec); this.rec = null;
        return this.publish();
      }
      // With a journal the verdict decides (journal/proof.ts): only an allow-listed refusal is definite.
      const e = e0 instanceof SentErr ? e0.e : e0;
      const unsure = e0 instanceof SentErr && e0.v.t === 'unknown';
      const v = L.errorView(e);
      if (v.drop) return;
      const code = codeOf(e);
      if (unsure || (!this.jr && (v.unknown || (this.maybe.has(uid) && code !== 'idempotency_key_reused' && code !== 'creation_interrupted')))) {
        // Lost, or a replay refused while the first send may have made the session: still unknown (C9).
        this.maybe.add(uid);
        rec.ph = 'unknown'; this.save(); this.conv = C.patchUser(this.conv, uid, { state: 'unknown' }); return this.publish();
      }
      this.refusedCreate(uid, e, v);
    });
  }
  /** What a create reply must show: the captured realm, container and the owner the readiness reported. */
  private startedWant(rec: AskRecord): { realm: string; container: string; owner: string } {
    return { realm: rec.r, container: rec.c, owner: this.rd && this.rd.state === 'ready' ? this.rd.owner : '' };
  }
  /** Removes the record of a create whose session is bound elsewhere, at the create address and then at the session's, until both
   *  removals are durable (a removal the store refused is tried again, 12 times at most with doubling waits up to 30 s, about five minutes; after that the record may remain). Independent
   *  of the engine's life: the record is the account's, not this page's. */
  private dropBound(rec: AskRecord, sid: string | null, acct: string = this.slot.account, left = 12): void {
    const at: AskRecord[] = [{ ...rec, s: null }];
    if (sid) at.push({ ...rec, s: sid });
    void (async () => {
      let ok = true;
      // The account that asked: a removal made after the person switched accounts must not report success for the shown one.
      for (const r of at) {
        try { ok = (await this.dropRec(r, false, acct)) && ok; } catch { ok = false; }
      }
      if (!ok && left > 1) this.clock.set(() => this.dropBound(rec, sid, acct, left - 1), Math.min(1000 * 2 ** (12 - left), 30000));
    })();
  }
  // A definite create refusal (the old refused()): a key the agent will not replay is final; creation_interrupted
  // with no session recorded never sent its turn, so "Not sent" and a fresh try are safe; idempotency_key_reused
  // may stand on a session an earlier send opened, so the record is kept and nothing is re-sent.
  private refusedCreate(uid: string, e: unknown, v: L.ErrorView): void {
    const rec = this.rec as AskRecord, code = codeOf(e);
    if (code === 'idempotency_key_reused') {
      this.conv = C.patchUser(this.conv, uid, { state: 'refused', reason: 'ask.keyReused' });
      return this.publish();
    }
    void this.dropRec(rec);
    this.rec = null;
    const reason = v.key === 'claude' ? 'ask.claudeUnavailable' : code === 'creation_interrupted' ? 'ask.notOpened' : (v.key as string);
    this.conv = C.patchUser({ ...this.conv, sid: null }, uid, { state: 'notSent', reason });
    this.publish();
  }

  private dispatch(uid: string): void {
    const g = this.gen, u = this.conv.users[uid];
    if (!u) return;
    const rec = this.rec;
    // A turn needs the session: a row routed here without one leaves nothing now.
    if (!rec?.s) return this.strand(uid, this.keyMayHaveLeft(rec, u.key));
    // A message classified as the chat's first leaves only from the gate's locked section.
    if (this.jr && this.intents.get(uid) === 'first' && this.inGate !== uid) return;
    this.intents.delete(uid);
    const b = L.turnBody(u.text, u.files, u.imgs);
    if (!b) return this.strand(uid, this.keyMayHaveLeft(rec, u.key));
    // The turn key is stored with w before the call (never the text): a lost answer and a reload find it again. A
    // new key moves an unsettled one to kw; with K3_MAX of them unsettled the message waits (none is ever dropped).
    if (rec.k2 !== u.key) {
      const mine = this.storedOf(rec);
      const open = new Set([...(mine?.kw ?? []), ...(rec.kw ?? []), ...(mine?.w ? [mine.k2] : []), ...(rec.w ? [rec.k2] : [])]);
      open.delete(u.key);
      if (open.size >= L.K3_MAX) { this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: 'ask.tooManyQueued' }); return this.publish(); }
    }
    // wf: this key's request carries files, which a reload cannot bring back (see lostUser).
    if (rec.k2 !== u.key || !rec.w || !!rec.wf !== hasAtt(u)) {
      rec.k2 = u.key; rec.w = true;
      if (hasAtt(u)) rec.wf = true; else delete rec.wf;
      this.save();
    }
    // The turn exists from now on (its frames may arrive before its receipt: they wait in its buffer).
    const arm = () => {
      if (!this.conv.turns.some((t) => t.users.includes(uid))) this.conv = C.addTurn(this.conv, { user: uid, now: this.clock.now() });
      this.conv = C.patchUser(this.conv, uid, { state: 'sending' });
      this.publish();
      if (!this.es) this.openStream(this.cursor());
    };
    const sid = rec.s, key = u.key;
    // The row's policy rides every request under its key (C.UserMsg.auto).
    const policy = u.auto ? 'auto_approve' as const : undefined;
    let sent: Promise<unknown>;
    if (this.jr) sent = this.sendJ({ route: 'turn', r: rec.r, sid, c: rec.k1, key, files: hasAtt(u) }, (t) => this.io.turn(sid, b.text, key, rec.r, b.attachments, policy, t), arm);
    else { arm(); sent = this.io.turn(sid, b.text, key, rec.r, b.attachments, policy); }
    sent.then((res) => {
      if (!this.live(g)) return;
      if (!L.isObj(res) || !L.seg(res.turn_id)) { this.unknownTurn(uid); return; }
      this.accepted(uid, res);
    }, (e0: unknown) => {
      if (!this.live(g)) return;
      if (e0 instanceof NotSentErr) { this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: this.notSentReason(e0) }); this.unlist(uid); return this.publish(); }
      const e = e0 instanceof SentErr ? e0.e : e0;
      const unsure = e0 instanceof SentErr && e0.v.t === 'unknown';
      const v = L.errorView(e);
      if (v.drop) return;
      if (unsure) return this.unknownTurn(uid);
      if (!this.jr && codeOf(e) === 'idempotency_key_reused') {
        // The key started a turn with other text earlier (keyTaken). The pending turn key stays stored: a reload
        // keeps the row until the person dismisses it.
        this.unTurn(uid);
        return this.keyTaken(uid);
      }
      // A replay refused definitely may still stand on a turn the first send started: it stays unknown.
      if (!this.jr && (v.unknown || this.maybe.has(uid))) return this.unknownTurn(uid);
      this.unTurn(uid);
      const had = this.settleKw(this.conv.users[uid]?.key);
      if (rec.w && rec.k2 === this.conv.users[uid]?.key) { delete rec.w; this.save(); } else if (had) this.save();
      if (codeOf(e) === 'turn_in_flight' || codeOf(e) === 'gate_parked') {
        // The session is busy (another client's turn): this message waits for nothing; the person sends it again.
        this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: 'ask.busy' });
        this.set(this.phaseNow, { band: { k: 'busy' } });
        this.later(() => { if (this.bandNow?.k === 'busy') this.set(this.phaseNow, { band: null }); }, 10000);
        return;
      }
      // A message with files the agent refused outright (400): the files are the likely cause; Edit takes it back.
      const reason = u?.auto && codeOf(e) === 'approval_policy_active' ? 'ask.autoTurnStrict' : u && hasAtt(u) && L.isObj(e) && e.status === 400 ? 'ask.attRefused' : v.key as string;
      this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason });
      this.publish();
    });
  }
  /** A displaced turn key (kw) this page settled leaves the record (and stays gone across other tabs' saves). */
  private settleKw(key: string | undefined): boolean {
    const rec = this.rec;
    if (!key || !rec) return false;
    this.goneKw.add(key); this.settledHere.add(key);
    if (!rec.kw?.includes(key)) return false;
    const kw = rec.kw.filter((k) => k !== key);
    if (kw.length) rec.kw = kw; else delete rec.kw;
    return true;
  }
  private unknownTurn(uid: string): void {
    const rec = this.rec as AskRecord;
    this.maybe.add(uid);
    const u = this.conv.users[uid];
    if (!u || !rec.dk?.includes(u.key)) { rec.ph = 'unknown'; this.save(); }
    this.conv = C.patchUser(this.conv, uid, { state: 'unknown' });
    this.publish();
  }
  /** A turn that was never admitted: its block goes and its message is loose again. */
  private unTurn(uid: string): void {
    const t = C.current(this.conv);
    if (t && !t.s.turnId && t.users[0] === uid) this.conv = { ...this.conv, turns: this.conv.turns.slice(0, -1), loose: [...this.conv.loose.filter((x) => x !== uid), uid] };
  }
  private accepted(uid: string, res: Record<string, unknown>): void {
    const rec = this.rec as AskRecord;
    rec.t = res.turn_id as string;
    rec.ph = 'working';
    // w belongs to the stored turn key: a late receipt for an earlier key (another tab sent a newer one since)
    // leaves the newer key pending.
    const key = this.conv.users[uid]?.key;
    if (rec.k2 === key) delete rec.w;
    this.settleKw(key);
    // The receipt answers the row's own request key, the one its turn was admitted under (never rec.k2, which another tab may have moved).
    this.save(key ? { admit: key } : {});
    this.conv = C.onTurn(this.conv, { type: 'turn', turnId: res.turn_id });
    this.conv = C.patchUser(this.conv, uid, { state: 'sent', turnId: res.turn_id as string });
    if (!this.es && !this.conn.reconnecting) this.openStream(this.cursor() ?? L.streamCursor(res.stream_url, rec.s));
    // A duplicate receipt (Check status, a retype) is the original answer: the turn may have ended meanwhile, its end
    // frame arriving while the block named no turn yet, so it is read back once.
    const dup = res.duplicate === true || this.maybe.has(uid);
    // Its frames may never have reached this page either: once it ends, its reply is read from the transcript.
    if (dup) this.reread = true;
    if (dup || (typeof res.state === 'string' && L.isTerminalState(res.state))) this.receipt();
    this.publish();
  }

  // A follow-up while the turn runs: a command the session reads at its next step. It never declines an open card (on_gate
  // wait): while an approval waits it stays queued, and the agent reads it once the approval is answered, either way.
  private command(uid: string): void {
    const g = this.gen, u = this.conv.users[uid];
    if (!u) return;
    const rec = this.rec;
    if (!rec?.s || !u.text) return this.strand(uid, this.keyMayHaveLeft(rec, u.key));
    if (this.jr && this.intents.get(uid) === 'first' && this.inGate !== uid) return;
    this.intents.delete(uid);
    // The key is stored before the call (never the text): a lost answer and a reload keep it (k3).
    // Each unsettled follow-up keeps its own key (a second one queued behind the first never replaces it); past
    // K3_MAX unsettled ones, the next waits.
    const k3 = rec.k3 ?? [];
    if (!k3.includes(u.key)) {
      // The follow-ups every tab of this chat holds unsettled count, not only this page's (their entries are the journal's).
      const open = new Set([...(this.jr ? this.storedOf(rec)?.k3 ?? [] : []), ...k3]);
      if (open.size >= L.K3_MAX) { this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: 'ask.tooManyQueued' }); return this.publish(); }
      rec.k3 = [...k3, u.key]; this.save();
    }
    const arm = () => { this.conv = C.patchUser(this.conv, uid, { state: 'sending' }); this.publish(); };
    const sid = rec.s, key = u.key, text = A.messageText(u.text, u.files);
    let sent: Promise<unknown>;
    if (this.jr) sent = this.sendJ({ route: 'command', cmd: 'message', r: rec.r, sid, c: rec.k1, key }, (t) => this.io.command(sid, text, key, rec.r, t), arm);
    else { arm(); sent = this.io.command(sid, text, key, rec.r); }
    sent.then((res) => {
      if (!this.live(g)) return;
      this.commandReceipt(uid, res);
    }, (e0: unknown) => {
      if (!this.live(g)) return;
      if (e0 instanceof NotSentErr) { this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: this.notSentReason(e0) }); this.unlist(uid); return this.publish(); }
      const e = e0 instanceof SentErr ? e0.e : e0;
      const unsure = e0 instanceof SentErr && e0.v.t === 'unknown';
      const v = L.errorView(e);
      if (v.drop) return;
      const code = codeOf(e);
      if (!this.jr && code === 'idempotency_key_reused') {
        // The key admitted other text earlier (keyTaken); the key stays stored until the row is dismissed.
        return this.keyTaken(uid);
      }
      if (unsure || (!this.jr && (v.unknown || this.maybe.has(uid)))) { this.maybe.add(uid); this.conv = C.patchUser(this.conv, uid, { state: 'unknown' }); return this.publish(); }
      this.dropK3(u.key);
      const st = L.isObj(e) ? e.status : undefined;
      if (st === 404 && code !== 'not_found') this.followUps = false;   // an agent without the route: wait for the reply, or Stop
      this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: st === 404 && code !== 'not_found' ? 'ask.followUnsupported' : code === 'session_closed' ? 'ask.gone' : 'ask.failed' });
      this.publish();
    });
  }
  /** idempotency_key_reused: the key was admitted earlier with other content (a message whose text this page lost),
   *  so this text did not go under it, and nothing here can prove whether it reached the agent some other way (an
   *  identical text in the conversation may be anyone's). The row stays "may have gone through" with Dismiss, never
   *  sent and never Send again (C9), and its key stays stored, so a reload shows the row again until it is dismissed
   *  (a turn key: the reload reads the turn list first, as for any pending turn). */
  private keyTaken(uid: string): void {
    this.maybe.add(uid);
    this.conv = C.patchUser(this.conv, uid, { state: 'unknown', reason: 'ask.cannotTell' });
    this.publish();
  }
  /** A send whose entry was never kept (so it never left): its key leaves this page's lists too, nothing stays counted. */
  private unlist(uid: string): void {
    const rec = this.rec, u = this.conv.users[uid];
    if (!rec || !u || u.state !== 'notSent') return;
    this.settledHere.add(u.key);
    if (rec.w && rec.k2 === u.key) { delete rec.w; delete rec.wf; }
    if (rec.k3?.includes(u.key)) { const k3 = rec.k3.filter((k) => k !== u.key); if (k3.length) rec.k3 = k3; else delete rec.k3; }
    this.save();
  }
  private noteCommandId(key: string, id: string): void {
    const rec = this.rec;
    if (!rec || !rec.k3?.includes(key) || rec.c3?.[key] === id) return;
    rec.c3 = { ...rec.c3, [key]: id };
    this.save();
  }
  private dropK3(key: string): void {
    const rec = this.rec;
    if (!rec || !rec.k3?.includes(key)) return;
    this.goneK3.add(key); this.settledHere.add(key);
    const k3 = rec.k3.filter((k) => k !== key);
    if (k3.length) rec.k3 = k3; else delete rec.k3;
    if (rec.c3 && key in rec.c3) { const c3 = { ...rec.c3 }; delete c3[key]; if (Object.keys(c3).length) rec.c3 = c3; else delete rec.c3; }
    this.save();
  }
  private commandReceipt(uid: string, res: unknown): void {
    if (!L.isObj(res) || !L.seg(res.command_id)) { this.maybe.add(uid); this.conv = C.patchUser(this.conv, uid, { state: 'unknown' }); return this.publish(); }
    const state = String(res.state || '');
    // Queued is not an outcome yet (nor a state this page does not know): the key stays stored until the agent
    // commits, supersedes, refuses or fails it, so a reload before then still shows the row (read back by its id).
    if (state === 'committed' || state === 'superseded' || state === 'refused' || state === 'failed') this.dropK3(this.conv.users[uid]?.key ?? '');
    this.conv = C.patchUser(this.conv, uid, { commandId: res.command_id });
    if (state === 'committed') this.commandCommitted(uid, String(res.how || ''), L.seg(res.turn_id) ? res.turn_id : '');
    else if (state === 'queued') {
      this.conv = C.patchUser(this.conv, uid, { state: 'queued' });
      this.noteCommandId(this.conv.users[uid]?.key ?? '', res.command_id);
      const cf = this.early.get(res.command_id);
      if (cf) { this.early.delete(res.command_id); this.commandEvent(cf); }
    }
    else if (state === 'superseded' || state === 'refused' || state === 'failed') this.conv = C.patchUser(this.conv, uid, { state: state === 'superseded' ? 'superseded' : 'refused', reason: res.reason === 'hook' ? 'ask.refusedHook' : 'ask.failed' });
    else { this.maybe.add(uid); this.conv = C.patchUser(this.conv, uid, { state: 'unknown' }); }   // a state this page does not know: not an outcome
    this.publish();
  }
  private commandCommitted(uid: string, how: string, turnId: string): void {
    const u = this.conv.users[uid];
    if (!u || u.state === 'sent') return;
    const t = C.current(this.conv);
    if (how === 'next_step' && t && (!turnId || t.s.turnId === turnId) && C.running(t)) { this.conv = C.commitIntoTurn(this.conv, uid); return; }
    if (turnId && this.conv.turns.some((x) => x.s.turnId === turnId)) { this.conv = C.commitIntoTurn(this.conv, uid); return; }
    if (turnId && how === 'new_turn') {
      // The session was idle by then and started a turn for it: its frames may carry no turn_id. Its receipt is read
      // at once, so a turn that already ended (a replayed receipt) settles instead of showing as running.
      const rec = this.rec as AskRecord;
      const prev = C.current(this.conv);
      this.conv = C.patchUser(C.addTurn(this.conv, { turnId, user: uid, loose: true, now: this.clock.now() }), uid, { state: 'sent', turnId });
      if (prev && !prev.s.terminal) {
        // The session was idle when this turn started, so the turn shown before had ended: still unfinished here, it
        // is a placeholder (a reopen) or its end went by unseen. It goes; the history read at the new turn's end
        // shows it as it ended.
        const gone = new Set(prev.users);
        const turns = this.conv.turns.slice();
        turns.splice(turns.length - 2, 1);
        this.conv = { ...this.conv, turns, users: Object.fromEntries(Object.entries(this.conv.users).filter(([k]) => !gone.has(k))) };
      }
      rec.t = turnId; rec.ph = 'working'; this.save();
      this.reread = true;   // its frames may have gone by unseen: the reply is read from the history when it ends
      // The new turn is read in full (receipt, state, replay) once any read in progress is done, so an approval or
      // question it already waits on shows, and a turn that already ended settles.
      this.conn.reconnecting = true;
      this.later(() => this.resync(false), 0);
      return;
    }
    // Delivered into a turn this page does not run (it ended, and shows from history after a reload), or a receipt
    // that names no turn: the message reached the agent; nothing new runs here.
    this.conv = C.patchUser(this.conv, uid, { state: 'sent', turnId: turnId || null });
  }

  /** Check status for a message whose outcome is unknown: the same call, the same key, the same text. */
  check(uid: string, alive?: () => boolean): void {
    const u = this.conv.users[uid];
    if (!u) return;
    // With a journal this page never asks again under a key: what happened is read back by the ids its own reply gave.
    // `alive` (New chat's start): once it reads false, the read retires nothing and its answer is not acted on.
    if (this.jr) return (u.state === 'unknown' || u.state === 'queued') ? this.checkJ(uid, alive) : undefined;
    // A queued follow-up is read back by its command id (a GET, never a send).
    if (u.state === 'queued' && u.via === 'command' && u.commandId && this.rec?.s) return this.checkCommand(uid);
    if (u.state !== 'unknown') return;
    // The agent keeps a settled follow-up's key 24 h, then reads it as new: an older row is never sent again, it is
    // left to the conversation and to Dismiss (12 h keeps well inside that window).
    if (u.via === 'command' && this.clock.now() - u.at > FOLLOW_CHECK_MS) {
      this.conv = C.patchUser(this.conv, uid, { reason: 'ask.tooOld' });
      return this.publish();
    }
    if (u.via === 'create' && !(this.rec && this.rec.s)) {
      if (!this.rec) return;
      if (!u.text) { this.conv = C.patchUser(this.conv, uid, { state: 'sending' }); this.publish(); return this.postCreate(uid); }
      return this.postCreate(uid);
    }
    if (!u.text) {
      // No read can tie these keys to a turn (a newer turn may be anyone's): they stay for Dismiss.
      if (u.reason === 'ask.otherTab' || (u.via === 'turn' && u.reason === 'ask.cannotTell')) return;
      // Text-less after a reload: a turn is read back from the agent's list; a follow-up by its command id, if any.
      if (u.via === 'turn' && this.rec?.w) {
        // A pending turn key: the conversation is read again from the agent (its turn list first).
        const rec = this.rec;
        this.reset();
        this.conn = { lost: false, reconnecting: false };
        return this.reopen(this.gen, rec);
      }
      if (u.via !== 'command' && this.rec?.s) return this.adoptTurn(this.gen, uid);
      if (u.via === 'command' && u.commandId && this.rec?.s) return this.checkCommand(uid);
      return;
    }
    this.turnOut(uid);
  }
  /** A text-less follow-up row (a reload) read back by its command id: the receipt settles it, never a resend. */
  /** A journaled row recovered by its KEY (the journal's check): the agent is asked what became of the key, never sent it again.
   *  A first message whose create is unsettled is recovered under the create key (k1): its own turn key (k2) never left. A first-message
   *  row never reads on its own authority: the gate (firstTurn) reads the durable record, and only a turn entry of the chat is read by key. */
  private readonly checkingJ = new Set<string>();
  /** First-message gate runs in flight, by row (one run per row). */
  private readonly gating = new Set<string>();
  /** Rows whose Send arrived while their gate was still clearing (firstTurn): each runs once the gate lets go. */
  private readonly regate = new Set<string>();
  /** The attempt's intent, fixed from a synchronous read before the first await. Only `first` is ever enforced. */
  private readonly intents = new Map<string, 'first' | 'later'>();
  /** The row whose first message is being dispatched from the gate's locked section (the only caller allowed to dispatch a `first` row). */
  private inGate: string | null = null;
  /** Rows whose dismissal waits for the store. */
  private readonly dismissing = new Set<string>();
  /** First-message rows whose key THIS page admitted (a POST of its own is on its way): the R5 it reads is its own. */
  private readonly admitted = new Set<string>();
  private checkJ(uid: string, alive?: () => boolean): void {
    const jr = this.jr, g = this.gen, u = this.conv.users[uid], rec = this.rec;
    if (!jr || !u) return;
    // One check per row at a time: a second answer could arrive after the first one's continuation and run that continuation again.
    if (this.checkingJ.has(uid) || this.gating.has(uid)) return;
    let key: string | undefined = u.via === 'create' && !rec?.s ? rec?.k1 : u.key;
    let create = u.via === 'create' && !rec?.s;
    if (rec && this.isFirstRow(u)) {
      const st = jr.j.firstState(jr.handle, rec.r, rec.k1, u.key);
      if (st.id === 'R2') {
        // The create is not handed off: it is read by its key (an entry present: the read may retire it; gone: a read only).
        create = true; key = rec.k1;
      } else if (st.id === 'R5') {
        // A turn entry of the chat exists: the turn is read by THAT entry's key (another tab's replacement may hold it), after the
        // record is adopted. The row itself is then judged by its own key (reconcile), never by another key's answer.
        this.adoptRec(st);
        const e = this.scanSure()?.find((x) => x.kind === 'turn' && x.r === st.rec.r && (x.c === st.rec.k1 || x.s === st.sid));
        if (!e) return this.firstTurn(uid, 'owed');
        key = e.k;
        create = false;
      } else if (st.id === 'R1') {
        // No record: only a turn entry of the chat can be read by its key; without one nothing is read.
        const e = this.scanSure()?.find((x) => x.kind === 'turn' && x.r === rec.r && x.c === rec.k1);
        if (!e) { this.conv = C.patchUser(this.conv, uid, { reason: 'ask.chatMissing' }); return this.publish(); }
        key = e.k; create = false;
      } else if (st.id === 'R7' && st.rec.k2 !== u.key && !notAdmitted(st.rec, u.key) && this.scanSure()?.some((x) => x.kind === 'turn' && x.k === u.key)) {
        // The record's pair (t, k2) names another key and says nothing proven about this row's: its OWN request entry is still stored, so
        // it is read by its key as any journaled turn. The pair, not the turn alone, decides which road a first-message row takes.
        this.adoptRec(st);
        key = u.key; create = false;
      } else {
        // R0, R3, R4, R6, R7: the gate decides (R4 may send, once, from the tab that holds the text).
        return this.firstTurn(uid, 'owed');
      }
    }
    if (!key) return;
    const entryHere = create && !!this.scanSure()?.some((e) => e.k === key);
    this.checkingJ.add(uid);
    this.conv = C.patchUser(this.conv, uid, { reason: '' });
    this.publish();
    // A follow-up the agent admitted (it gave the row a command id) is only read: a miss is a receipt it no longer keeps, never retired.
    const admitted = !create && key === u.key && u.via === 'command' && !!u.commandId;
    const read = create && !entryHere && rec ? jr.j.checkCreate(this.io, jr.handle, rec.r, rec.k1, alive) : jr.j.check(this.io, jr.handle, key, alive, admitted);
    void read.finally(() => { this.checkingJ.delete(uid); }).then(({ v }) => {
      const now = this.conv.users[uid]?.state;
      if (!this.live(g) || (alive && !alive()) || (now !== 'unknown' && now !== 'queued')) return;
      if (v.t === 'unknown') {
        this.conv = C.patchUser(this.conv, uid, { reason: unknownReason(v.why) });
        return this.publish();
      }
      // Another key's answer (a replacement first message) settles that key; this row is judged again by its own.
      if (key !== u.key && v.route === 'turn') { this.adoptEntries(); return this.firstTurn(uid, 'owed'); }
      if (v.t === 'notAdmitted') return this.notAdmittedRow(uid, v.route);
      if (v.route === 'create') return this.firstTurn(uid, 'owed');
      const b = v.body;
      if (!L.isObj(b)) return;
      if (v.route === 'turn') { this.maybe.delete(uid); this.accepted(uid, { ...b, duplicate: true }); return; }
      const st = String(b.state || '');
      if (L.seg(b.command_id)) this.noteCommandId(key as string, b.command_id);
      if (st === 'queued') { this.conv = C.patchUser(this.conv, uid, { state: 'queued', reason: '', commandId: L.seg(b.command_id) ? b.command_id : null, ...(this.wd404.delete(uid) ? { wd: 'off' as const } : {}) }); return this.publish(); }
      if (st === 'superseded' && b.reason === 'withdrawn') { this.withdrawnProven(uid); return this.publish(); }
      this.dropK3(u.key);
      if (st === 'committed') { this.maybe.delete(uid); this.commandCommitted(uid, String(b.how || ''), L.seg(b.turn_id) ? b.turn_id : ''); }
      else this.textlessSettled(uid, st);
      this.publish();
    });
  }
  /** A retire fenced the row's key and nothing was admitted with it (or a read found it already fenced): "Not sent; nothing ran". The
   *  journal has settled the entry (a first turn's key is fenced in the record first: settle.ts `once`); here the row says so, and a
   *  create's record goes (no chat was made). */
  private notAdmittedRow(uid: string, route: string): void {
    const u = this.conv.users[uid], rec = this.rec;
    this.maybe.delete(uid);
    if (route === 'create') {
      this.conv = C.patchUser({ ...this.conv, sid: null }, uid, { state: 'notSent', reason: 'ask.createNotMade' });
      if (rec) { void this.dropRec(rec); this.rec = null; }
      return this.publish();
    }
    if (rec && u) {
      if (rec.w && rec.k2 === u.key) { delete rec.w; delete rec.wf; }
      this.settleKw(u.key);
      this.dropK3(u.key);
      this.save();
    }
    this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: u?.text ? 'ask.notSentRead' : 'ask.notSentReadGone' });
    this.publish();
  }

  // ---- fork (ask/fork.ts is the pure side) ----
  // A fork is a keyed create that branches from this (pinned, live) chat. It has its own journaled record (`fk`) and no first message:
  // the create leaves only when the journal kept that record, and the person is told "opened" only once the create is SETTLED (the
  // reply names this fork and the journal moved its record to the new session). A lost answer stays unknown and KEEPS its record: the
  // record is what blocks the target, on every page, until a Check (ask/forkRecovery.ts) proves what became of it. A press and a Check
  // of one target exclude each other with the target lock T (journal/locks.ts), which is only ever tried.
  /** The parent's turn boundaries now (a read, never a send), or null when they could not be read. */
  turnPins(): Promise<readonly number[] | null> {
    const sid = this.rec?.s, r = this.rec?.r, g = this.gen;
    if (!this.jr || !sid || !r) return Promise.resolve(null);
    return Promise.resolve().then(() => this.io.transcript(sid, r)).then((b) => (this.live(g) ? F.boundsOf(b) : null), () => null);
  }
  /** The parent as the daemon holds it now (GET /state `live`): 'live' only for `live: true`, 'asleep' only for `live: false` (a dormant
   *  chat, which a fork reopens first), 'unknown' for a read that failed or says neither (a fork then stops: nothing is claimed or sent). */
  private parentState(sid: string, r: string): Promise<'live' | 'asleep' | 'unknown'> {
    return Promise.resolve().then(() => this.io.state(sid, r)).then(
      (b) => (L.isObj(b) && b.live === true ? 'live' : L.isObj(b) && b.live === false ? 'asleep' : 'unknown'),
      () => 'unknown' as const,
    );
  }
  /** Forks this chat. `spec`: "from here" (the 0-based turn and the boundary the page read for it); null: the whole chat. One flight per
   *  (chat, turn): a press while one is unsettled joins it. */
  fork(want: F.ForkSpec | null): Promise<F.ForkOutcome> {
    const jr = this.jr, rec = this.rec, parent = rec?.s ?? null;
    const refuse = (key: string, reason: F.ForkReason): Promise<F.ForkOutcome> => Promise.resolve({ k: 'refused', key, reason });
    if (!jr || !rec || !parent || !this.journalReady()) return refuse('ask.notRemembered', 'notRemembered');
    // A dormant parent (a chat the list shows that the computer no longer holds live) is reopened by the press itself (runFork).
    if (this.phaseNow !== 'ready') return refuse('ask.forkNotOpen', 'notOpen');
    // The boundary the page read for the turn is the one on the turn it shows (conv.ts TurnBlock.pin); a turn the page shows no boundary
    // for (one that finished live, before its history was read) cannot be forked from, and says it changed.
    let spec: { turn: number; pin: number } | null = null;
    if (want) {
      const pin = want.pin ?? this.conv.turns.find((x) => x.idx === want.turn)?.pin;
      if (pin === undefined) return refuse('ask.forkChanged', 'changed');
      spec = { turn: want.turn, pin };
    }
    const fid = forkTarget(jr.handle, rec.r, parent, spec ? spec.turn : null);
    // A press while one of this page's presses is unsettled joins it (UX only: the target lock and the record are the safety).
    let flights = forkFlights.get(jr.j);
    if (!flights) forkFlights.set(jr.j, (flights = new Map()));
    const flying = flights.get(fid);
    if (flying) return flying;
    const mine = flights;
    const run: Promise<F.ForkOutcome> = this.runFork(jr, rec, parent, spec, fid).finally(() => { if (mine.get(fid) === run) mine.delete(fid); });
    mine.set(fid, run);
    return run;
  }
  private async runFork(jr: { j: Journal; handle: string }, rec: AskRecord, parent: string, spec: { turn: number; pin: number } | null, _fid: string): Promise<F.ForkOutcome> {
    const g = this.gen, idx = spec ? spec.turn : null, whole = idx === null;
    const refuse = (key: string, reason: F.ForkReason): F.ForkOutcome => ({ k: 'refused', key, reason });
    const lose = (k1: string, reason: F.ForkReason): F.ForkOutcome => ({ k: 'unknown', k1, key: F.reasonKey(reason, whole), reason });
    // The account this press runs in: every write below is refused if the shown account is another (a record already written stays in its own).
    const acct = currentAccount() ?? '';
    if (!acct || acct !== this.slot.account) return refuse('ask.notRemembered', 'notRemembered');
    const scope = { acct, h: jr.handle, r: rec.r };
    // After every wait: the engine still live and the press's account still the one shown (an account switch during a read reopens,
    // claims and sends nothing in either account).
    const moved = (): F.ForkOutcome | null => (!this.live(g) ? refuse('ask.forkNotOpen', 'notOpen') : currentAccount() !== acct ? refuse('ask.forkAccountMoved', 'account') : null);
    const [bounds, state0] = await Promise.all([this.turnPins(), this.parentState(parent, rec.r)]);
    const m0 = moved();
    if (m0) return m0;
    if (bounds === null) return refuse('ask.forkNotRead', 'notRead');
    const pv = F.pinView(bounds, spec);
    if (pv === 'nothing') return refuse('ask.forkNoTurn', 'notOpen');
    // A pin that no longer matches is refused before any reopen: a fork already known to fail reopens nothing.
    if (pv === 'changed') return refuse('ask.forkChanged', 'changed');
    // A parent whose state could not be read is neither proven live nor proven asleep: nothing is reopened, claimed or sent.
    if (state0 === 'unknown') return refuse('ask.forkStateUnread', 'notRead');
    if (state0 === 'asleep') {
      // The parent is not live on the computer (a listed chat it put to sleep): reopen it first, as a person's Send does (attachSession), and
      // read again. Nothing is claimed or sent before it answers live; a reopen that fails says so, and nothing was made.
      const a = await this.attachSession(parent);
      const m1 = moved();
      if (m1) return m1;
      if (a !== 'ok') return refuse(a === 'helperGates' ? 'ask.forkReopenGates' : 'ask.forkReopenFailed', 'notOpen');
      // After a reopen only an explicit live answer goes on: a read that fails or says nothing does not confirm it (the chat may be open
      // again; it stays so, as after a person's Send).
      const state1 = await this.parentState(parent, rec.r);
      const m2 = moved();
      if (m2) return m2;
      if (state1 !== 'live') return refuse('ask.forkReopenUnconfirmed', 'notOpen');
    }
    const body = F.forkBody(rec.r, rec.c, parent, idx);
    if (!body) return refuse('ask.notRemembered', 'notRemembered');
    // T: this target, tried once. Another holder (a Check, or a press in another tab) means this press does not go on: it says what is
    // pending, or that the target is busy.
    let hold: ForkHold | null;
    try { hold = await holdIfFree(forkLockName(acct, jr.handle, rec.r, { s: parent, i: idx })); } catch { return refuse('ask.notRemembered', 'notRemembered'); }
    if (!hold) {
      const at = jr.j.lookupTarget(jr.handle, rec.r, { s: parent, i: idx }, acct);
      return at.t === 'found' ? lose(at.rec.k1, 'pending') : refuse(F.reasonKey('busy', whole), 'busy');
    }
    // T is released here, unless a claimed create outlives the send: then a detached continuation releases it (see `late` below).
    let late: Promise<Late> | null = null;
    let marking: Promise<void> | null = null;
    let k1 = '';
    const out: SendOut = {};
    try {
      // The late grant: the engine ended or the account moved while T was being granted.
      if (!this.live(g)) return refuse('ask.forkNotOpen', 'notOpen');
      if (currentAccount() !== acct) return refuse('ask.notRemembered', 'notRemembered');
      // The record is kept BEFORE the request leaves, by ONE claim in the journal's record update: an unresolved fork of the same target
      // that another tab (or an earlier press) holds is joined, and the capacity refuses; a record that was not kept is a request that
      // was not sent. The keys are minted by the claim, once it owns the fork: a joiner or a refused press mints none.
      const tpl: Omit<AskRecord, 'k1' | 'k2'> = {
        p: this.slot.project, c: rec.c, r: rec.r, s: null, t: null, rc: 'custom', n: null,
        at: this.clock.now(), i: null, q: 0, ph: 'completed', l: 'en', fk: { s: parent, i: idx },
      };
      const mint = (): { k1: string; k2: string } | null => {
        const a = this.key('create'), b = this.key('turn');
        return a && b ? { k1: a, k2: b } : null;
      };
      let claim = await jr.j.claimFork(jr.handle, tpl, mint, acct);
      // At the marker bound, the reply-pending marks whose press has ended (a closed page, a clear the store refused) are drained first
      // (forkRecovery.ts drainReplyPending; one of this very target under the T this press holds), and the claim is asked once more.
      if (claim.t === 'marks' && (await drainReplyPending(jr.j, acct, hold))) claim = await jr.j.claimFork(jr.handle, tpl, mint, acct);
      if (claim.t === 'join') return lose(claim.rec.k1, 'pending');
      if (claim.t === 'full') return refuse('ask.forkFull', 'full');
      if (claim.t === 'marks') return refuse('ask.forkMarksFull', 'refused');
      if (claim.t === 'lost') return refuse('ask.notRemembered', 'notRemembered');
      k1 = claim.k1;
      markMaking(jr.j, k1, true);
      // The engine ended while the claim waited: nothing was sent and no entry exists, so this claim is ours to release. A record that
      // cannot be removed now is an orphan a Check (or the next claim of the target) recovers.
      if (!this.live(g)) { await this.release(jr, rec.r, k1, acct); return refuse('ask.forkNotOpen', 'notOpen'); }
      const owner = this.rd && this.rd.state === 'ready' ? this.rd.owner : '';
      const want = { realm: rec.r, container: rec.c, owner, parent, idx };
      try {
        // The reply is judged by the journal's own verdict (`accepts`): one that is not this fork is unknown, so it settles nothing and
        // never moves the record to a session this fork did not make. The entry is written (and read back) before this runs; the claim is
        // read again under the record lock right before the request is posted: a claim freed meanwhile (records.ts claimFork frees a
        // claim that has no entry) is never posted - nothing is claimed, the door revokes the entry, and the press is a not-sent.
        await this.sendJ(
          { route: 'create', r: rec.r, key: k1 },
          async (t) => {
            if (!(await jr.j.forkHeld(jr.handle, rec.r, k1, acct))) throw new NotSentErr('notKept');
            return this.io.create(body, k1, rec.r, tix(...t));
          },
          undefined,
          // A reply that PROVES another binding (checkStarted MISMATCH: another computer, realm or owner) is refused, as a chat's create is:
          // the journal's settlement drops the record, never moves it to that session, and leaves the key's "bound elsewhere" marker in the
          // same update (records.ts refuseCreate), on which every Check refuses: the by-key receipt a Check reads carries no binding.
          (b) => (forkBoundElsewhere(b, want) ? 'refuse' : !F.checkForked(b, want)),
          out,
        );
      } catch (e0) {
        late = out.late ?? null;
        if (e0 instanceof NotSentErr) {
          // Never asked: no chat was made, so its record goes with the refusal. A record that cannot be removed does not change the
          // refusal (the claim has no entry: the next claim of the target frees it, or a Check).
          await this.release(jr, rec.r, k1, acct);
          const key = this.notSentReason(e0);
          return refuse(key, F.refusalReason(key));
        }
        // Decided by the journal's verdict first, never by the words of the error.
        const v = e0 instanceof SentErr ? e0.v : null;
        if (v && v.t === 'notAdmitted') {
          await this.release(jr, rec.r, k1, acct);
          if (v.why === 'retired') return refuse(F.reasonKey('none', whole), 'none');
          const key = F.forkRefusal(e0 instanceof SentErr ? e0.e : e0).key;
          return refuse(key, F.refusalReason(key));
        }
        // Unknown (a lost answer, a 404, a doubt, an unexpected throw): the record stays, and a Check recovers it.
        return lose(k1, 'lost');
      }
      const v = out.v;
      // Bound elsewhere: nothing of this fork may route a turn to that session. Refused whether or not the settlement was kept. One that
      // was not (owed) keeps the record as it was, so this press keeps T until the marker is written (holdUntilMarked): while T is held no
      // Check of any tab opens it (forkRecovery.ts).
      if (v && v.t === 'settled' && v.why === 'refused') {
        if (out.settled !== 'done' && v.sid) marking = this.holdUntilMarked(jr, rec.r, k1, v.sid, acct);
        return refuse('ask.forkElsewhere', 'refused');
      }
      // Settled: certified only when the journal's settlement is kept (done) AND the record is read back at the new session.
      const sid = v && v.t === 'settled' && v.sid !== undefined ? v.sid : null;
      const at = sid ? jr.j.lookupK1(jr.handle, rec.r, k1, acct) : null;
      if (sid && out.settled === 'done' && at && at.t === 'found' && at.rec.s === sid && at.rec.k1 === k1 && F.sameForkOrigin(at.rec.fk, tpl.fk)) return { k: 'opened', sid, k1 };
      return lose(k1, 'handoff');
    } finally {
      if (k1) markMaking(jr.j, k1, false);
      // A claimed create that outlived the send (the engine ended while it was in flight) keeps T until its own reply is classified and
      // settled: a late typed refusal drops the record here, under T, and nothing else moves after T is released. Every path then clears
      // the claim's reply-pending mark (records.ts `rp`): this press's reply can no longer make a marker.
      const pendingLate = late ?? out.late ?? null;
      if (pendingLate) void this.afterLate(jr, scope, k1, pendingLate, hold);
      else if (marking) void marking.finally(() => this.releaseT(jr, scope, k1, hold));
      else void this.releaseT(jr, scope, k1, hold);
    }
  }
  /** The tail of a send whose create was in flight when the engine ended: waits for the call's own settlement, drops the record when the
   *  agent definitely refused it (the proof is the verdict), and only then releases T. A reply that proved another binding whose
   *  settlement is owed keeps T until the marker is written, as on the press's own path (holdUntilMarked). Never rejects. */
  private async afterLate(jr: { j: Journal; handle: string }, scope: { acct: string; h: string; r: string }, k1: string, late: Promise<Late>, hold: ForkHold): Promise<void> {
    try {
      const l = await late;
      if (l.v.t === 'notAdmitted') await this.release(jr, scope.r, k1, scope.acct);
      else if (l.v.t === 'settled' && l.v.why === 'refused' && l.settled !== 'done' && l.v.sid) await this.holdUntilMarked(jr, scope.r, k1, l.v.sid, scope.acct);
    } catch { /* an unknown settlement keeps the record */ }
    finally { await this.releaseT(jr, scope, k1, hold); }
  }
  /** The end of a press's T: T is released at once (its holding time is unchanged), then its claim's reply-pending mark is cleared (k1: a
   *  claim was made); the hold is the proof that this press held the fork's T until its own reply was settled. A mark that cannot be
   *  cleared stays (the fork keeps counting toward MARKS_MAX until a Check that takes T clears it, or the record goes). Never rejects. */
  private async releaseT(jr: { j: Journal; handle: string }, scope: { acct: string; r: string }, k1: string, hold: ForkHold): Promise<void> {
    try { hold.release(); } catch { /* released */ }
    try { if (k1) await jr.j.clearReplyPending(hold, jr.handle, scope.r, k1, scope.acct); } catch { /* the mark stays */ }
  }
  /** Writes the "bound elsewhere" marker of a refused fork whose settlement is owed, until it is kept: at once, then after doubling waits up
   *  to 30 s, for as long as the page lives (fail closed: T stays held meanwhile). Independent of the engine's life. Never rejects. */
  private holdUntilMarked(jr: { j: Journal; handle: string }, realm: string, k1: string, sid: string, acct: string): Promise<void> {
    return new Promise<void>((done) => {
      const attempt = (n: number): void => {
        void (async () => {
          let ok = false;
          try {
            const lk = jr.j.lookupK1(jr.handle, realm, k1, acct);
            ok = (lk.t === 'found' && !!lk.rec.xb) || (currentAccount() === acct && (await jr.j.markElsewhere(jr.handle, realm, k1, sid)));
          } catch { ok = false; }
          if (ok) done();
          else this.clock.set(() => attempt(n + 1), Math.min(1000 * 2 ** Math.min(n, 5), 30000));
        })();
      };
      attempt(0);
    });
  }
  /** Removes this press's claim from the document. A document that refuses is asked twice more; false when the claim still stays. */
  private async release(jr: { j: Journal; handle: string }, realm: string, k1: string, acct: string): Promise<boolean> {
    for (let i = 0; i < 3; i++) if (await jr.j.drop(jr.handle, realm, null, k1, acct)) return true;
    return false;
  }
  /** The recovery of this chat's computer and realm (ask/forkRecovery.ts), or null when the chat is not journaled. */
  private forkRecovery(): ForkRecovery | null {
    const jr = this.jr, rec = this.rec, g = this.gen;
    if (!jr || !rec || !this.journalReady()) return null;
    return new ForkRecovery({ io: this.io, j: jr.j, handle: jr.handle, realm: rec.r, acct: this.slot.account, alive: () => this.live(g) });
  }
  /** Checks the pending fork of create key k1 (never sends it). */
  checkFork(k1: string): Promise<F.ForkOutcome> {
    const fr = this.forkRecovery();
    // Every Check answer is stamped by checkAnswer (the host's forkNow guard reads it), this one included.
    return fr ? fr.check(k1) : Promise.resolve(checkAnswer({ k: 'refused', key: 'ask.notRemembered', reason: 'notRemembered' }, this.slot.account, k1));
  }
  /** Hides the row of a pending fork (display only). */
  hideFork(k1: string): Promise<boolean> { return this.forkRecovery()?.hide(k1) ?? Promise.resolve(false); }
  /** The unconfirmed forks of this chat's computer and realm, or null when they cannot be read now. */
  forkRows(): ForkRow[] | null { return this.forkRecovery()?.pending() ?? null; }
  /** Where the fork `sid` lives, for a host that opens it: the computer's handle, the realm and the session. */
  chatRefOf(sid: string): { computer: string; realm: string; sid: string } | null {
    const jr = this.jr;
    return jr && L.seg(sid) ? { computer: jr.handle, realm: this.realm, sid } : null;
  }
  // ---- the first message: ONE gate ----
  /** Whether the row is the chat's first message, still unsettled: the create row, or the row holding the key the chat owes. */
  private isFirstRow(u: C.UserMsg): boolean {
    const rec = this.rec;
    if (!this.jr || !rec || u.via === 'command') return false;
    // The identity is the ROW's: a row seen as the chat's first message stays one when this page learns another tab's
    // turn (rec.t), until it settles; the gate then judges it against the durable record. Only a row met while no turn was known is one.
    if (this.firstRows.has(u.id)) return true;
    return !rec.t && (u.via === 'create' || (!!u.key && u.key === rec.k2));
  }
  /** The rows that were the chat's first message while no turn was known (see isFirstRow); pruned with the rows. */
  private readonly firstRows = new Set<string>();
  private markFirstRows(): void {
    const rec = this.rec;
    if (!this.jr || !rec) return;
    for (const id of this.firstRows) if (!this.conv.users[id]) this.firstRows.delete(id);
    if (rec.t) return;
    for (const u of Object.values(this.conv.users)) if (!this.firstRows.has(u.id) && this.isFirstRow(u)) this.firstRows.add(u.id);
  }
  /** The engine takes the durable record as its own (display and preparation only; it authorizes nothing). */
  private adoptRec(st: { rec: JRec }): void {
    const { h: _h, ...r } = st.rec;
    this.rec = { ...r };
    this.ptr = { k1: r.k1, k2: r.k2, t: r.t };
    if (r.s) this.conv = { ...this.conv, sid: r.s };
  }
  /** The rows of the dock say what the gate found, when it sent nothing. Text is always kept. */
  private show(uid: string, st: FirstState, mode: 'owed' | 'supersede'): void {
    const u = this.conv.users[uid];
    if (!u) return;
    const text = !!u.text;
    const set = (patch: Partial<C.UserMsg>): void => { this.conv = C.patchUser(this.conv, uid, patch); this.publish(); };
    if (st.id !== 'R0' && st.id !== 'R1') this.adoptRec(st);
    // Proven never sent (the record's na): no doubt is left, so the row is no longer one that "may have gone through".
    const taken = (): void => { this.maybe.delete(uid); set({ state: 'notSent', reason: 'ask.takenElsewhere' }); };
    switch (st.id) {
      case 'R0': return set({ state: 'unknown', reason: 'ask.checkFailed' });
      case 'R1': return set({ state: 'unknown', reason: 'ask.chatMissing' });
      case 'R2': return set({ state: 'unknown', reason: 'ask.createSaving' });
      case 'R3': return set(text ? { state: 'notSent', reason: 'ask.createUnopenable' } : { state: 'refused', reason: 'ask.createUnopenable' });
      case 'R4':
        set({ state: 'unknown', reason: 'ask.firstElsewhere' });
        // The chat exists on the agent: its state is read (a read, never a send), so the page shows it and follows the turn when it starts.
        if (this.phaseNow === 'ready') { this.readAuto(); this.recon('first'); }
        return;
      case 'R5':
        if (mode === 'supersede') return set({ state: 'notSent', reason: 'ask.takenElsewhere' });
        return u.state === 'sending' && this.admitted.has(uid) ? undefined : set({ state: 'unknown', reason: 'ask.otherTab' });
      case 'R6':
        // Not sent only on evidence (the claim that moved this key was read under the lock with no turn and no entry): a key the person
        // merely stopped tracking may have been admitted, and says nothing.
        if (text) return notAdmitted(st.rec, u.key) ? taken() : set({ state: 'unknown', reason: 'ask.otherTab' });
        return this.removeRow(uid);
      case 'R7':
        // The row's OWN key PROVEN never to have reached the agent (na: a claim or fence that ran while no turn of it existed) is judged
        // before any turn is attributed to it, whatever k2 and t the record carries now. The person's dismissal (dk) is
        // no such proof. A row without text has nothing to lose: it follows the turn.
        if (text && notAdmitted(st.rec, u.key)) return taken();
        if (mode === 'owed' && st.rec.k2 === u.key) return this.adoptTurn(this.gen, uid);
        if (!text) return this.adoptTurn(this.gen, uid);
        // A message this page typed in the gate never left (supersede). An owed row not fenced says nothing more: a later k2 proves
        // nothing about it.
        if (mode === 'supersede') return set({ state: 'notSent', reason: 'ask.takenElsewhere' });
        return set({ state: 'unknown', reason: 'ask.otherTab' });
    }
  }
  /** A handed-off first message: Not sent from here, text kept, and offered back to the composer (the panel takes it at once). */
  private handOff(uid: string): void {
    this.maybe.delete(uid);
    this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: 'ask.handedOff' });
    this.publish();
  }
  /** Rows whose text goes back to the composer as a draft (the panel calls takeBack for each): a handed-off first message, and one
   *  another tab took over (its text never left, so the person decides). */
  restorable(): string[] {
    return Object.values(this.conv.users).filter((u) => (u.reason === 'ask.handedOff' || u.reason === 'ask.takenElsewhere') && !!u.text && this.canTakeBack(u)).map((u) => u.id);
  }
  /** The one predicate for a row whose text can come back to the composer: Not sent, no doubt left (not a row that may have gone through),
   *  in a chat that exists. restorable() and takeBack() both read it. */
  private canTakeBack(u: C.UserMsg): boolean { return u.state === 'notSent' && !this.maybe.has(u.id) && !!this.rec?.s; }
  private removeRow(uid: string): void {
    const users = { ...this.conv.users };
    delete users[uid];
    this.maybe.delete(uid);
    this.conv = { ...this.conv, users, loose: this.conv.loose.filter((x) => x !== uid) };
    this.publish();
  }
  /** The first message of a chat that has (or is getting) a session. `owed`: the row's own key, which never left. `supersede`: a retyped
   *  message under a fresh key, which takes the first message over. `proof`: this call's own fresh create reply. */
  private firstTurn(uid: string, mode: 'owed' | 'supersede', proof?: { sid: string }): void {
    if (!this.jr || !this.conv.users[uid] || !this.rec) return;
    // A person's Send while this row's gate is still clearing (its exit already published the row Not sent, so a subscriber may
    // resend from that publish, before the gate lets go): it runs once the gate clears, never dropped with the row left sending.
    if (this.gating.has(uid)) { if (mode === 'supersede') this.regate.add(uid); return; }
    this.gating.add(uid);
    this.intents.set(uid, 'first');
    const g = this.gen;
    // Publishes when the gate clears: quiet() waits on `gating`, and the final row state was published while it still held the uid.
    // Returns whether a Send waited for it (that Send's row is then `sending` under its own fresh key, not this gate's).
    const done = (): boolean => {
      if (g !== this.gen) return false;
      this.gating.delete(uid); this.intents.delete(uid);
      const again = this.regate.delete(uid);
      this.publish();
      return again;
    };
    // The waiting Send goes as resend() would have sent it, if its row still waits to go.
    const resume = (again: boolean): void => { if (again && this.live(g) && this.conv.users[uid]?.state === 'sending') this.routeOut(uid); };
    this.runFirst(uid, mode, proof, g).then(() => resume(done()), () => {
      done();
      // Fail closed: nothing is known of what the gate did, so the row says so (a Send that waited for it included: it is not
      // run after a gate that failed this way).
      if (this.live(g) && this.conv.users[uid]?.state === 'sending') { this.conv = C.patchUser(this.conv, uid, { state: 'unknown', reason: 'ask.checkFailed' }); this.publish(); }
    });
  }
  private async runFirst(uid: string, mode: 'owed' | 'supersede', proof: { sid: string } | undefined, g: number): Promise<void> {
    const jr = this.jr as { j: Journal; handle: string };
    const u0 = this.conv.users[uid], rec0 = this.rec;
    if (!u0 || !rec0) return;
    const K = u0.key, k1 = rec0.k1, realm = rec0.r, acct = this.slot.account;
    const row = (): C.UserMsg | undefined => this.conv.users[uid];
    const read = (): FirstState => jr.j.firstState(jr.handle, realm, k1, K);
    const goes = (st: FirstState): st is Extract<FirstState, { sid: string }> => st.id === 'R4' || (mode === 'supersede' && st.id === 'R6');
    // 1. what the store says; the record is adopted for display and preparation (it authorizes nothing)
    const st1 = read();
    if (!goes(st1)) return this.show(uid, st1, mode);
    this.adoptRec(st1);
    const S = st1.sid;
    // A row without its text (a reload) never reaches the network: it says the message may still be sent from another tab.
    if (!u0.text) return this.show(uid, st1, mode);
    // The cut: a first message that reached R4 by a handoff (anything but this call's own create reply) is never
    // sent by the page. Its text goes back to the composer as a draft; the person presses Send (a supersede under a fresh key).
    if (mode === 'owed' && proof?.sid !== S) return this.handOff(uid);
    // 2. the session is live: this call's own create reply proves it (owed); a person's Send (supersede) attaches first
    this.conv = C.patchUser(this.conv, uid, { state: 'sending', reason: '' });
    this.publish();
    if (proof?.sid !== S) {
      const live = await this.attachSession(S);
      if (!this.live(g) || !row()) return;
      if (live !== 'ok') { this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: wakeReason(live) }); return this.publish(); }
    }
    // 3. the session's approval mode, before the lock (nothing that awaits the network runs inside it but the admit)
    if (!(await this.prepAuto(uid, mode))) return;
    if (!this.live(g) || !row()) return;
    // 4. the chat lock: one first message of one chat at a time, across tabs
    const hold = await holdChatLock(acct, jr.handle, realm, k1, { ms: LOCK_WAIT_MS, set: (fn, ms) => this.clock.set(fn, ms), clear: (id) => this.clock.clear(id) });
    if (!hold.ok) {
      // Nothing left: a person's Send (supersede) is Not sent (Send again); the own create reply's row stays unknown + Check.
      if (this.live(g) && row()) { this.conv = C.patchUser(this.conv, uid, { state: mode === 'supersede' ? 'notSent' : 'unknown', reason: 'ask.lockUnavailable' }); this.publish(); }
      return;
    }
    try {
      if (!this.live(g) || !row()) return;
      const st = read();                                          // THE authorizing read
      if (!goes(st)) return this.show(uid, st, mode);
      if (mode === 'supersede') {
        const c = await jr.j.claimFirst(jr.handle, realm, S, k1, K);
        if (!this.live(g) || !row()) return;
        if (c !== 'ok') { this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: c === 'taken' ? 'ask.takenElsewhere' : 'ask.notRemembered' }); return this.publish(); }
      }
      const fin = mode === 'supersede' ? read() : st;
      if (fin.id !== 'R4') return this.show(uid, fin, mode);
      this.adoptRec(fin);
      (this.rec as AskRecord).ph = 'sending';
      this.inGate = uid;
      try { this.dispatch(uid); if (row()?.state === 'sending') this.admitted.add(uid); } finally { this.inGate = null; }
    } finally { hold.release(); }
  }
  /** The session's approval mode before the first message: true when the message may go (armAuto says the row itself when it may not). */
  private prepAuto(uid: string, mode: 'owed' | 'supersede'): Promise<boolean> {
    return new Promise<boolean>((res) => {
      const ok = (): void => res(true), no = (): void => res(false);
      if (mode === 'owed') return this.armAuto(uid, ok, no);
      if (!this.auto.cap || this.wantAuto) return ok();
      const sid = this.rec?.s ?? null;
      this.readAuto((known) => {
        if (known && this.auto.on === false && sid && this.autoSid === sid) return ok();
        this.armAuto(uid, ok, no);
      });
    });
  }
  /** Attaches a recovered (allocated, or not proven live) session by id: 'ok' when it answered, 'helperGates' on 400
   *  helper_gates_unavailable, else 'failed'. The lease ticket the attach route requires comes from the handle. */
  private attachSession(sid: string): Promise<'ok' | 'failed' | 'helperGates' | 'gone'> {
    const rec = this.rec;
    if (!rec) return Promise.resolve('failed');
    // Every reopen resends helper_gates (they are never saved). A session started without them answers 400 helper_gates_unavailable:
    // a refusal (the reopen did not happen), never retried without them (there is no fallback for an older session).
    const body = L.createBody(rec.r, rec.c, { helperGates: true }), ticket = this.leaseHandle(rec.r)?.mintTicket(leaseRoutes.attach, null);
    if (!body || !ticket) return Promise.resolve('failed');
    // An attach asserts an approval policy and never sets one: the reopen asserts none, so the chat keeps its own (a Strict chat would
    // refuse a `default` assertion, approval_policy_unsatisfiable).
    const { approval: _asserted, ...reopen } = body;
    return settle(this.io.attach({ ...reopen, attach: sid }, rec.r, tix(ticket))).then((r) => {
      if (r.ok) return 'ok';
      const code = codeOf(r.e);
      // 404 not_found: the computer no longer has this chat (a chat never written to is discarded once it sleeps; an id it cannot see
      // answers the same).
      return code === 'helper_gates_unavailable' ? 'helperGates' : code === 'not_found' && L.isObj(r.e) && r.e.status === 404 ? 'gone' : 'failed';
    });
  }
  private checkCommand(uid: string): void {
    if (this.jr) return this.checkJ(uid);
    const g = this.gen, rec = this.rec as AskRecord, u = this.conv.users[uid];
    if (!u || !u.commandId || !rec.s || this.cmdChecks.has(uid)) return;
    this.cmdChecks.add(uid);
    this.conv = C.patchUser(this.conv, uid, { reason: '' });
    this.publish();
    void settle(this.io.commandGet(rec.s, u.commandId, rec.r)).then((r) => {
      if (g === this.gen) this.cmdChecks.delete(uid);
      const now = this.conv.users[uid]?.state;
      if (!this.live(g) || (now !== 'unknown' && now !== 'queued')) return;
      const b = r.ok && L.isObj(r.b) && r.b.command_id === u.commandId ? r.b : null;
      const st = b ? String(b.state || '') : '';
      if (st === 'queued') { this.conv = C.patchUser(this.conv, uid, { state: 'queued', reason: '', ...(this.wd404.delete(uid) ? { wd: 'off' as const } : {}) }); return this.publish(); }
      if (st === 'superseded' && b && b.reason === 'withdrawn') { this.withdrawnProven(uid); return this.publish(); }
      if (st !== 'committed' && st !== 'superseded' && st !== 'refused' && st !== 'failed') {
        // No answer, or a state this page does not know: nothing is settled.
        this.conv = C.patchUser(this.conv, uid, { reason: 'ask.checkFailed' });
        return this.publish();
      }
      this.dropK3(u.key);
      // Committed: into the running turn, a turn already shown, or a new turn, which is adopted (its stream and
      // questions show at once, with or without the text).
      if (st === 'committed' && b) { this.maybe.delete(uid); this.commandCommitted(uid, String(b.how || ''), L.seg(b.turn_id) ? b.turn_id : ''); }
      else this.textlessSettled(uid, st);
      this.publish();
    });
  }
  private textlessSettled(uid: string, state: string): void {
    this.maybe.delete(uid);
    this.conv = C.patchUser(this.conv, uid, state === 'committed' ? { state: 'sent', reason: '' } : { state: state === 'superseded' ? 'superseded' : 'refused', reason: 'ask.failed' });
  }
  /** The person removes a row the page cannot settle by itself: a follow-up that is queued or text-less, a turn a
   *  reload left without its text, one sent too long ago to check, or one a reused key left undecidable. Its key
   *  goes; nothing is sent. */
  dismiss(uid: string): void { this.dismissRow(uid, false); }
  /** Edit or Remove on a queued follow-up: the agent is asked, once per press, to take it back (POST …/withdraw, by its command id). Only
   *  `withdrawn` removes the row (and, for Edit, returns its text for the composer); `taken` and `ended` keep it and say what is true; a
   *  definite refusal keeps it queued; a lost answer is unknown: the row stays, offers no second press, and Check status reads the
   *  receipt (withdrawnProven). Nothing is ever sent again under the row's key. */
  async withdraw(uid: string, then: 'remove' | 'edit'): Promise<WithdrawOutcome> {
    const u = this.conv.users[uid], rec = this.rec;
    // Edit brings back the text only: a row with files is removed, never edited (its files would be lost on the way back).
    if (!u || !canWithdraw(u) || !rec?.s || (then === 'edit' && (!u.text || fileCount(u) > 0))) return { k: 'refused', code: 'not_withdrawable' };
    const g = this.gen, cmd = u.commandId as string;
    this.wdIntent.set(uid, then);
    this.conv = C.patchUser(this.conv, uid, { wd: 'sending', reason: '' });
    this.publish();
    let r: Settled;
    try { r = await settle(this.io.withdraw(rec.s, cmd, rec.r)); } catch (e) { r = { ok: false, e }; }
    if (!this.live(g)) return { k: 'unknown' };
    const now = this.conv.users[uid];
    if (r.ok) {
      const b = L.isObj(r.b) ? r.b : null;
      const c0 = b && L.isObj(b.command) && b.command.command_id === cmd ? b.command : null;
      // The receipt must agree with the outcome, as the agent decides it (withdrawCommand): withdrawn only with superseded/withdrawn;
      // taken with committed, or queued while a delivery holds it; ended with any other settled state. Anything else is no answer (unknown).
      const st0 = c0 ? String(c0.state || '') : '';
      const wdn = st0 === 'superseded' && c0?.reason === 'withdrawn';
      const out0 = c0 ? b?.outcome : null;
      const agrees = out0 === 'withdrawn' ? wdn
        : out0 === 'taken' ? st0 === 'committed' || st0 === 'queued'
        : out0 === 'ended' ? !wdn && (st0 === 'superseded' || st0 === 'refused' || st0 === 'failed')
        : false;
      const c = agrees ? c0 : null;
      const out = agrees ? out0 : null;
      if (out === 'withdrawn') {
        this.wdIntent.delete(uid);
        if (!now) return { k: 'withdrawn' };
        const text = now.text;
        this.dropWithdrawn(uid);
        return then === 'edit' && text && !this.conv.users[uid] ? { k: 'withdrawn', text } : { k: 'withdrawn' };
      }
      if (c && (out === 'taken' || out === 'ended')) {
        this.wdIntent.delete(uid);
        if (!now) return { k: out };
        const st = String(c.state || '');
        if (out === 'taken') {
          // Already on its way (or in the conversation): nothing was taken back. A committed receipt settles the row as sent now.
          this.conv = C.patchUser(this.conv, uid, { wd: 'taken' });
          if (st === 'committed' && now.state === 'queued') { this.dropK3(now.key); this.maybe.delete(uid); this.commandCommitted(uid, String(c.how || ''), L.seg(c.turn_id) ? c.turn_id : ''); }
          this.publish();
          return { k: 'taken' };
        }
        // It had ended without reaching the chat (a stop came first, a hook refused it): the receipt's own outcome, as a read would show it.
        this.dropK3(now.key);
        this.maybe.delete(uid);
        if (now.state === 'queued' || now.state === 'unknown') {
          this.conv = C.patchUser(this.conv, uid, st === 'superseded'
            ? { state: 'superseded', reason: '', wd: undefined }
            : { state: 'refused', reason: c.reason === 'hook' ? 'ask.refusedHook' : 'ask.failed', wd: undefined });
        }
        this.publish();
        return { k: 'ended' };
      }
    } else {
      const e = L.isObj(r.e) ? r.e : null;
      const code = codeOf(r.e);
      const status = e && typeof e.status === 'number' ? e.status : 0;
      // Definite: refused before anything was applied (notApplied), never sent (not_sent, stale), or any 4xx. Everything else may
      // have been applied (a lost answer, a 5xx, withdraw_unconfirmed): unknown.
      const definite = !!e && e.kind !== 'pending' && e.pending !== true
        && (e.notApplied === true || e.kind === 'not_sent' || e.kind === 'stale' || (status >= 400 && status < 500));
      if (definite) {
        this.wdIntent.delete(uid);
        if (!now) return { k: 'refused', code: code || 'failed' };
        if (status === 404 && now.state === 'queued') { this.wd404.add(uid); this.conv = C.patchUser(this.conv, uid, { wd: 'unknown', reason: '' }); }
        else if (status === 404 || code === 'command_not_withdrawable') this.conv = C.patchUser(this.conv, uid, { wd: 'off', reason: '' });
        else if (code === 'session_closed') this.conv = C.patchUser(this.conv, uid, { wd: 'closed', reason: '' });
        else this.conv = C.patchUser(this.conv, uid, { wd: undefined, reason: 'ask.withdrawFailed' });
        this.publish();
        // A 404 is an agent without the route OR a command (or chat) it no longer has: the row is read back (Check status, a read),
        // so its own receipt says which; an old agent's still reads queued and the row stays as it always was.
        if (status === 404 && this.conv.users[uid]?.state === 'queued') this.check(uid);
        return { k: 'refused', code: code || (status === 404 ? 'not_found' : 'failed') };
      }
    }
    if (now && now.state === 'queued') { this.conv = C.patchUser(this.conv, uid, { wd: 'unknown', reason: '' }); this.publish(); }
    return { k: 'unknown' };
  }
  /** A receipt or an event says the message was withdrawn (state superseded, reason withdrawn). While this page's own press is still out,
   *  its answer decides (it carries Edit's text). After a Remove the row goes; otherwise it stays as Taken back, with its text for Edit
   *  (never Send again: its key keeps answering the withdrawn receipt). */
  private withdrawnProven(uid: string): void {
    const u = this.conv.users[uid];
    if (!u || u.state === 'sent' || u.wd === 'sending') return;
    this.maybe.delete(uid);
    const intent = this.wdIntent.get(uid);
    this.wdIntent.delete(uid);
    if (intent === 'remove') return this.dropWithdrawn(uid);
    this.dropK3(u.key);
    this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: 'ask.withdrawn', wd: undefined });
  }
  /** A withdrawn row goes the way a dismissed one does (its key and journal entry with it). If the journal keeps the entry, the row stays
   *  as Taken back instead: it is never left looking queued. */
  private dropWithdrawn(uid: string): void {
    const u = this.conv.users[uid];
    if (!u) return;
    if (u.state !== 'queued' && u.state !== 'unknown') this.conv = C.patchUser(this.conv, uid, { state: 'queued' });
    this.dismissNow(uid, false);
    if (this.conv.users[uid]) { this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: 'ask.withdrawn', wd: undefined }); this.publish(); }
  }
  /** `gone`: the store no longer holds the row's entry (it was dismissed or settled in another tab), so the row goes whatever its
   *  reason; the person's own dismissal is limited to the rows below (every unsettled row of a journaled engine). */
  private dismissRow(uid: string, gone: boolean): void {
    const u = this.conv.users[uid];
    if (!u || (u.state !== 'unknown' && u.state !== 'queued' && !(u.state === 'notSent' && !u.text && this.jr))) return;
    // A first message owed to its key (R4) is dismissed in the record first, under the chat lock: another tab may be about to send it.
    // The row goes only when the store kept that.
    const rec0 = this.rec;
    if (this.jr && !gone && rec0?.s && !rec0.t && this.isFirstRow(u)) {
      if (this.dismissing.has(uid)) return;
      this.dismissing.add(uid);
      void this.dismissFirst(uid).finally(() => { this.dismissing.delete(uid); });
      return;
    }
    this.dismissNow(uid, gone);
  }
  /** The person dismisses a first message row of a chat that has a session: R4 is claimed null (the key can never be sent) under the chat lock. */
  private async dismissFirst(uid: string): Promise<void> {
    const jr = this.jr as { j: Journal; handle: string };
    const g = this.gen, u = this.conv.users[uid], rec = this.rec;
    if (!u || !rec || !rec.s) return;
    const hold = await holdChatLock(this.slot.account, jr.handle, rec.r, rec.k1, { ms: LOCK_WAIT_MS, set: (fn, ms) => this.clock.set(fn, ms), clear: (id) => this.clock.clear(id) });
    if (!hold.ok) {
      if (this.live(g) && this.conv.users[uid]) { this.conv = C.patchUser(this.conv, uid, { reason: 'ask.lockUnavailable' }); this.publish(); }
      return;
    }
    try {
      if (!this.live(g) || !this.conv.users[uid]) return;
      const st = jr.j.firstState(jr.handle, rec.r, rec.k1, u.key);
      if (st.id === 'R4') {
        const c = await jr.j.claimFirst(jr.handle, rec.r, st.sid, rec.k1, null);
        if (!this.live(g) || !this.conv.users[uid]) return;
        if (c === 'taken') { this.firstTurn(uid, 'owed'); return; }
        if (c !== 'ok') { this.conv = C.patchUser(this.conv, uid, { reason: 'ask.notRemembered' }); return this.publish(); }
      } else if (st.id === 'R0') { this.conv = C.patchUser(this.conv, uid, { reason: 'ask.checkFailed' }); return this.publish(); }
      this.dismissNow(uid, false, st.id === 'R4');
    } finally { hold.release(); }
  }
  private dismissNow(uid: string, gone: boolean, claimed = false): void {
    const u = this.conv.users[uid];
    if (!u) return;
    const rec = this.rec;
    const drops = !!rec && this.dropsRecord(u);
    // The person's own dismissal is the proof (journal/proof.ts); a row whose entry the store no longer holds needs none. When the
    // dismissal also drops the chat record, the record goes first and the entries only after the store kept that (a refused drop leaves
    // the row and its entry).
    if (this.jr && !gone && !drops && !this.dismissEntries(u)) return;
    const may = gone || !!this.jr || u.reason === 'ask.cannotTell' || u.reason === 'ask.tooOld' || u.reason === 'ask.notStarted' || (u.via === 'turn' && !u.text) || (u.via === 'command' && (!u.text || u.state === 'queued'));
    if (!may) return;
    if (drops && rec && this.jr && !gone) {
      const g = this.gen;
      void this.dropRec(rec, claimed).then((kept) => {
        if (!this.live(g) || this.rec !== rec || !this.conv.users[uid]) return;
        if (!kept || !this.dismissEntries(u)) { this.conv = C.patchUser(this.conv, uid, { reason: 'ask.notRemembered' }); return this.publish(); }
        this.dropK3(u.key);
        this.newConversation(true);
        if (this.pinSid) this.removeRow(uid);                     // a pinned dock keeps its conversation: only the row goes
      });
      return;
    }
    if (this.rec && u.key) this.rec.dk = [...(this.rec.dk ?? []).filter((k) => k !== u.key), u.key].slice(-L.K3_MAX);
    this.dropK3(u.key);
    if (rec && u.via !== 'command') {
      if (rec.w && rec.k2 === u.key) delete rec.w;
      this.settleKw(u.key);
      if (drops) {
        // A first message that never started a turn the page knows of: nothing of this conversation is left to keep,
        // so its record goes (no reload brings the row back) and the dock starts a new conversation.
        void this.dropRec(rec, claimed);
        this.newConversation(true);
        if (this.pinSid) this.removeRow(uid);
        return;
      }
      // The stored phase described the dismissed message: it goes back to the last known turn's own outcome, so a
      // reload never reads that turn as running again.
      const t = C.current(this.conv);
      if (C.isLivePhase(rec.ph) && t && !C.running(t) && t.s.terminal) rec.ph = t.s.terminal.state;
      this.save();
    }
    this.removeRow(uid);
  }
  /** Whether dismissing this row drops the chat record: a first message that never started a turn the page knows of. */
  private dropsRecord(u: C.UserMsg): boolean {
    const rec = this.rec;
    if (!rec || u.via === 'command') return false;
    return !rec.t && !this.conv.turns.length && !(rec.k3 ?? []).filter((k) => k !== u.key).length;
  }
  /** The person's dismissal of the entries behind a row (its key, and a create's chat key). False when this page still holds the key. */
  private dismissEntries(u: C.UserMsg): boolean {
    const jr = this.jr;
    if (!jr) return true;
    const keys = [u.key, ...(u.via === 'create' && this.rec && !this.rec.s ? [this.rec.k1] : [])];
    for (const k of keys) if (k && !jr.j.dismiss(jr.handle, k, dismissal())) return false;
    return true;
  }
  /** A message refused definitely ("Not sent · Send again"): the same key and text (a key the agent never
   *  admitted is safe to reuse, and reusing it can never run it twice). */
  resend(uid: string): void {
    const u = this.conv.users[uid];
    if (!u || u.state !== 'notSent' || !u.text || !this.canSend()) return;
    const rest = { ...this.conv, loose: this.conv.loose.filter((x) => x !== uid) };
    if (!C.canSendMore(rest)) return;
    this.conv = C.patchUser({ ...rest, loose: [...rest.loose, uid] }, uid, { state: 'sending', reason: '' });
    this.publish();
    if (u.via === 'create' && !this.rec?.s) return this.signInThenCreate(uid);
    // A first message whose session exists routes like any other: a follow-up while a turn runs, a turn otherwise
    // (under its own key, as before). Moving to or from the follow-up route takes a fresh key: the old one was never
    // admitted anywhere (a definite refusal), and a turn key reused as the follow-up key would equal k2, which the
    // store refuses as k3 (a reload would lose it).
    const to: C.Via = C.routeFor(this.conv) === 'command' && this.followUps ? 'command' : u.via === 'command' && this.followUps ? 'command' : 'turn';
    // An auto-approve message goes as a turn or not at all (a follow-up cannot carry the policy): it waits, Not sent.
    if (to === 'command' && u.auto) { this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: 'ask.autoTurnLater' }); return this.publish(); }
    // Images never take the follow-up route: the message waits (Not sent, its images kept) until the agent is done.
    if (to === 'command' && u.imgs?.length) { this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: 'ask.attImgLater' }); return this.publish(); }
    // With a journal a key is never asked under twice, and a key that was tried is never reused (a definite refusal or a failed entry
    // write consumed it): the row goes under a new one.
    if (this.jr || (to !== u.via && (to === 'command' || u.via === 'command'))) {
      const key = this.key(to === 'command' ? 'command' : 'turn');
      if (!key) { this.conv = C.patchUser(this.conv, uid, { state: 'notSent' }); return this.publish(); }
      this.conv = C.patchUser(this.conv, uid, { via: to, key });
      // The new key is published at once: a caller waiting on this request reads exactly this key, not the one that was refused.
      this.publish();
    }
    this.routeOut(uid);
  }
  /** Every message of a journaled engine to an existing session is classified HERE, from a synchronous read, before any await: the
   *  chat's first message (the record has no known turn) goes straight to the gate, which prepares inside it and lets the locked read
   *  decide; only a message classified later (a known turn) takes the ordinary preparation. Unreadable, missing and create states show. */
  private routeOut(uid: string): void {
    const jr = this.jr, u = this.conv.users[uid], rec = this.rec;
    if (!jr || !u || !rec || !rec.s || rec.t || u.via === 'command') { this.intents.set(uid, 'later'); return this.turnOut(uid); }
    const st = jr.j.firstState(jr.handle, rec.r, rec.k1, u.key);
    if (st.id === 'R7') { this.adoptRec(st); this.intents.set(uid, 'later'); return this.turnOut(uid); }
    if (st.id === 'R4' || st.id === 'R5' || st.id === 'R6') return this.firstTurn(uid, 'supersede');
    this.show(uid, st, 'supersede');
  }

  // ---- the stream ----
  private cursor(): L.Cursor | null {
    const t = C.current(this.conv);
    return t && t.s.inc ? { since: t.s.seq, incarnation: t.s.inc } : null;
  }
  private openStream(cz: L.Cursor | null): void {
    this.closeStream();
    if (this.suspended || !this.rec?.s) return;
    // Every path that wants the stream comes here: without the watch for one, the state is read instead (none while off).
    if (this.level() !== 'stream') { this.markBlind(); if (this.level() === 'state') this.readLater('state'); return; }
    this.cgen++;
    const g = this.gen, rec = this.rec;
    const h: StreamHandlers = {
      open: () => { if (!this.live(g)) return; this.budgetWait = false; this.esOpen = true; this.broke = false; this.armQuiet(); if (this.conn.reconnecting || this.conn.lost) { this.conn = { lost: false, reconnecting: false }; this.publish(); } },
      frame: (name, raw) => {
        if (!this.live(g)) return;
        this.armQuiet();
        let d: unknown = null;
        try { d = raw ? JSON.parse(raw) : null; } catch { d = null; }
        this.onFrame(name, d);
      },
      error: (why) => { if (!this.live(g)) return; if (why === 'budget' || why === 'locks') this.overBudget(); else this.streamLost(); },
    };
    this.es = this.io.stream(rec.s as string, cz, rec.r, h, this.wRank);
    if (this.es) this.esRank = this.wRank;
    else this.streamLost();
  }
  private onFrame(name: string, d: unknown): void {
    if (L.isObj(d) && L.isObj(d.event) && 'event.' + name === d.event.type) this.bookFrame(d);
    // A changed usage-limit reading needs no paint of its own: rate_limit and replay frames reach afterChange below, which paints
    // (or publishes) on every path.
    if (this.rec?.s) this.rateLimitFrame(this.rec.s, name, d);
    const cf = C.commandFrame(name, d);
    if (cf) {
      // Seq bookkeeping: the turn reducer sees every frame; command frames change nothing else in it.
      this.conv = C.onTurn(this.conv, { type: 'frame', name, data: d, now: this.clock.now() });
      this.commandEvent(cf);
      this.paint();
      return;
    }
    const before = C.current(this.conv)?.s ?? null;
    this.conv = C.onTurn(this.conv, { type: 'frame', name, data: d, now: this.clock.now() });
    // A stream_done's counts are kept now: the paint that publishes them comes later, and a reopen before it would drop them.
    this.foldUsage();
    const s = C.current(this.conv)?.s ?? null;
    if (name === 'end') this.cgen++;
    if (name === 'yolo_mode') this.autoFrame(d);
    void before; void s;
    if (name === 'lagged') {
      // The stream skipped events: the session's state says which gates are parked now.
      this.recon('gap');
      if (!(L.isObj(d) && d.code === 'replay_gap')) { this.streamLost(); return; }
    }
    this.afterChange();
  }
  /** event.command_committed / event.command_settled, live or from a replay: the follow-ups it names settle. */
  private commandEvent(cf: NonNullable<ReturnType<typeof C.commandFrame>>): void {
    // The journal settles a request only through the command id THIS page holds for it.
    if (this.jr && this.rec?.s) this.jr.j.observe(this.io, { type: 'command', r: this.rec.r, sid: this.rec.s, kind: cf.kind, ids: cf.ids, state: cf.state });
    for (const id of cf.ids) {
      const uid = Object.values(this.conv.users).find((u) => u.commandId === id)?.id;
      if (!uid) {
        this.early.set(id, { ...cf, ids: [id] });
        if (this.early.size > 32) this.early.delete(this.early.keys().next().value as string);
        continue;
      }
      if (cf.kind === 'settled' && cf.state !== 'superseded' && cf.state !== 'refused' && cf.state !== 'failed') {
        // A settled state this page does not know is not an outcome: the row stays unknown and keeps its key.
        if (this.conv.users[uid]?.state !== 'sent') { this.maybe.add(uid); this.conv = C.patchUser(this.conv, uid, { state: 'unknown' }); }
        continue;
      }
      if (cf.kind === 'settled' && cf.state === 'superseded' && cf.reason === 'withdrawn') { this.withdrawnProven(uid); continue; }
      this.dropK3(this.conv.users[uid]?.key ?? '');
      if (cf.kind === 'committed') { this.maybe.delete(uid); this.commandCommitted(uid, cf.how, cf.turnId); continue; }
      if (!this.conv.users[uid]?.text) { this.textlessSettled(uid, cf.state); continue; }
      if (this.conv.users[uid]?.state !== 'sent') this.conv = C.patchUser(this.conv, uid, { state: cf.state === 'superseded' ? 'superseded' : 'refused', reason: cf.reason === 'hook' ? 'ask.refusedHook' : 'ask.failed' });
    }
  }
  /** The turn reducer passes over command events: a replay's are applied here, so a follow-up that settled while the
   *  stream was down (dock suspended, connection lost) settles too, and its key goes. */
  private replayCommands(body: unknown): void {
    const evs = L.isObj(body) && Array.isArray(body.events) ? (body.events as unknown[]) : [];
    for (const e of evs) {
      const type = L.isObj(e) && L.isObj(e.event) && typeof e.event.type === 'string' ? e.event.type : '';
      const cf = type.startsWith('event.') ? C.commandFrame(type.slice(6), e) : null;
      if (cf) this.commandEvent(cf);
    }
  }
  /** A usage-limit reading in one frame of session `sid`, live or replayed: event.rate_limit's state, or event.replay's
   *  rate_limit when present (absent says nothing, never "cleared"). Kept only when it supersedes the one held for that session
   *  (protocol.RateLimitSupersedes), so a replay read after a newer frame never puts the older reading back; a reading held for
   *  another session counts as none. True when the reading changed. */
  private rateLimitFrame(sid: string, name: string, d: unknown): boolean {
    if (name !== 'rate_limit' && name !== 'replay') return false;
    const data = L.isObj(d) && L.isObj(d.event) && L.isObj(d.event.data) ? d.event.data : null;
    if (!data) return false;
    const raw = name === 'rate_limit' ? data.state : data.rate_limit;
    if (raw === undefined) return false;
    const r = parseRateLimit(raw);
    if (!r || !rateLimitSupersedes(this.rl?.sid === sid ? this.rl.r : null, r)) return false;
    this.rl = { sid, r };
    return true;
  }
  /** Every gate frame, whatever turn it names: the session's book of parked gates. */
  private bookFrame(env: unknown): void {
    const o = G.onEnvelope(this.book, env);
    this.book = o.book;
    // A gate-resolution frame proves its gate closed (never whose decision applied): the journal settles the decisions on it.
    if (this.jr && this.rec?.s && L.isObj(env) && L.isObj(env.event) && env.event.type === 'event.gate_resolved') {
      for (const x of o.resolved) this.jr.j.observe(this.io, { type: 'gate', r: this.rec.r, sid: this.rec.s, gate: { id: x.g.gate.id, generation: x.g.gate.generation, kind: x.g.gate.kind }, data: env.event.data });
    }
    for (const x of o.resolved) {
      const a = this.attempts.get(x.g.key);
      // A resolution while this page's answer is on its way: the answer says whose the decision was (the frame's
      // request id is the gateway's own, never the one this page sent).
      if (a && a.status === 'sending') continue;
      if (a) {
        this.attempts.delete(x.g.key); this.settleRid(x.g.key, a.rid); this.saveAttempts();
        if (x.requestId && x.requestId === a.rid) { this.prove(a.rid, 'applied'); this.conv = C.addDecided(this.conv, { kind: a.kind, tool: a.tool, text: a.text, ...a.said }); }
      }
    }
    if (o.newInc || o.unreadable || o.recheck) this.recon(o.newInc ? 'incarnation' : o.unreadable ? 'unreadable' : 'turnEnd');
    if (o.changed) this.paint();
  }
  private persistAt = 0;
  private afterChange(): void {
    const t = C.current(this.conv), rec = this.rec;
    if (!t || !rec) return this.paint();
    const s = t.s, ph0 = L.phase(s);
    // Waiting is the session's own word: a lead gate in the book while the turn runs.
    const ph = C.isLivePhase(ph0) && (ph0 === 'working' || ph0 === 'waiting') ? (this.book.list.some((x) => !x.helper) ? 'waiting' : 'working') : ph0;
    if (C.isLivePhase(ph) && (rec.ph !== ph || this.clock.now() - this.persistAt > 5000)) {
      rec.ph = ph as AskRecord['ph']; rec.i = s.inc; rec.q = s.seq;
      this.persistAt = this.clock.now();
      this.save();
    }
    if (s.terminal) return this.finish();
    if (s.ended) { this.receipt(); return this.paint(); }
    if (s.resync) { this.paint(); return this.resync(true); }
    if (s.done || s.discarded) this.receipt();
    this.paint();
  }
  /** The budget gave the stream no slot (or another tab holds the locks): not a lost connection. The state is read every STATE_MS,
   *  and each read asks for a slot again (observe), so the stream comes back once one is free (degraded). */
  private overBudget(): void {
    this.closeStream();
    this.cgen++;
    this.again = false;
    this.budgetWait = true;
    this.markBlind();
    // A resync that read the receipt, the state and the replay and then asked for the stream: the chat is current, not reconnecting.
    if (!this.syncing && this.conn.reconnecting && !this.conn.lost) { this.conn = { lost: false, reconnecting: false }; this.publish(); }
    this.readLater('budget');
  }
  private streamLost(): void {
    if (this.esOpen) this.broke = true;
    this.closeStream();
    this.cgen++;
    this.budgetWait = false;
    this.markBlind();
    // A resync's reads still out keep `syncing` until they answer (their answers are dropped: the stream generation
    // moved), so no second resync stacks its reads on them.
    this.again = false;
    // The panel keeps watching the session: the stream is opened again after a read of its state, with backoff.
    this.retry('stream');
    if (!C.running(C.current(this.conv))) { this.conn = { lost: false, reconnecting: false }; return this.publish(); }
    this.conn = { lost: true, reconnecting: true };
    this.publish();
  }
  /** Check status for a lost connection: the receipt, the state and the replay once, then the stream again. */
  checkNow(): void {
    if (this.syncing || this.reading === this.gen || !this.rec) return;
    this.conn = { lost: false, reconnecting: true };
    this.publish();
    this.resync(false, true);
  }
  /** `explicit`: a read the person's Stop asked for (its refusal's catch-up and its polls); all others obey the read gate. */
  private receipt(explicit = false): void {
    const g = this.gen, rec = this.rec, t = C.current(this.conv);
    if (!rec || !rec.s || !t || !t.s.turnId || (this.reading === g && this.readingTurn === t.s.turnId)) return;
    if (!explicit && this.autoOff()) { this.markBlind(); return; }
    const tid = t.s.turnId;
    this.reading = g; this.readingTurn = tid;
    void settle(this.io.receipt(rec.s, tid, rec.r)).then((r) => {
      if (this.reading === g && this.readingTurn === tid) { this.reading = 0; this.readingTurn = ''; }
      if (!this.live(g)) return;
      // The receipt is of the turn it asked about: once another turn is the chat's current one, its 404, its retries and its paint
      // say nothing about that one.
      if (C.current(this.conv)?.s.turnId !== tid) return;
      if (r.ok) { this.conv = C.onTurn(this.conv, { type: 'receipt', body: r.b }, this.clock.now()); if (C.current(this.conv)?.s.terminal) return this.finish(); }
      else if (L.isObj(r.e) && r.e.status === 404) {
        // A 404 receipt while anything sent is unsettled proves nothing (as a state read's, recon): the session is read again.
        if (!this.sentUnsettled()) return this.gone();
        this.retry('hidden');
      }
      const s = C.current(this.conv)?.s;
      if (s && s.ended && !s.terminal) return this.streamLost();
      this.paint();
      if (s && (s.done || s.discarded) && !s.terminal) {
        this.rpolls++;
        this.later(() => { if (C.current(this.conv)?.s.turnId !== tid || this.autoOff()) return; if (this.rpolls > RECEIPT_POLLS) { this.rpolls = 0; this.conn = { lost: true, reconnecting: true }; this.publish(); } else this.receipt(); }, RECEIPT_POLL_MS);
      }
    });
  }
  /** `explicit`: the person's Check (checkNow); every other resync is automatic and obeys the read gate (rule a). */
  private resync(keep: boolean, explicit = false): void {
    const g = this.gen, rec = this.rec, t0 = C.current(this.conv);
    if (!rec || !rec.s || !t0) return;
    const wasRunning = C.running(t0);
    if (keep && (!this.es || this.conn.lost)) return;
    if (this.syncing && keep) { this.again = true; return; }
    // A fresh resync interrupts delivery: its replay is the recovery of the frames between, and a replay that fails leaves the
    // running turn's history owed (rule c, below).
    if (!keep) { this.closeStream(); this.cgen++; this.again = false; }
    if (!keep && !explicit && this.autoOff()) { this.publish(); return; }
    // Another resync's reads are out: their answers are dropped (the stream generation moved), and this one runs
    // once they come back, so a flapping stream never stacks reads.
    if (this.syncing && !keep) { this.syncOwed = true; this.syncOwedExplicit ||= explicit; this.publish(); return; }
    const tok = ++this.syncN;
    this.syncing = tok;
    const cg = this.cgen, ep = t0.s.epoch, rv = t0.s.gateRev, sid = rec.s, bep = this.book.epoch, issued = this.tokN;
    this.publish();
    void Promise.all([
      t0.s.turnId ? settle(this.io.receipt(sid, t0.s.turnId, rec.r)) : Promise.resolve(null),
      settle(this.leaseRead(rec, () => this.io.state(sid, rec.r))),
      settle(this.io.replay(sid, rec.r)),
    ]).then(([rc, st, rp]) => {
      if (this.syncing === tok) this.syncing = 0;
      if (!this.live(g)) return;
      if (this.syncOwed) { const ex = this.syncOwedExplicit; this.syncOwed = false; this.syncOwedExplicit = false; if (!this.suspended) return this.resync(false, ex); }
      if (cg !== this.cgen) return this.publish();
      // A 404 receipt while anything sent is unsettled proves nothing (as a state read's, recon): it counts as a failed read, and the
      // session is read again.
      // The receipt asked about the turn that was current when this resync began: a 404 for that turn says nothing about a newer one
      // that became current while the reads were out.
      const hidden = !!rc && !rc.ok && L.isObj(rc.e) && rc.e.status === 404 && C.current(this.conv)?.s.turnId === t0.s.turnId;
      if (hidden && !this.sentUnsettled()) return this.gone();
      if (hidden) this.retry('hidden');
      const stb = st.ok ? st.b : null;
      // Rule (c): the turn was running and its frames since the cursor were not read back, whether or not it ended meanwhile
      // (finish below then rebuilds it).
      if (!rp.ok && wasRunning) this.historyOwed = true;
      // The turn shown live at the open (adopted): the transcript read then may hold it already, and the replay would build it a
      // second time beside that copy (one message, the same reply twice). Its receipt decides, by the agent's turn id:
      //  - closed: the transcript holds it. The replay's frames are not applied to it; it ends on the receipt and is read back
      //    from the transcript (finish);
      //  - interrupted: never saved as a turn, so the copy built here is the only one;
      //  - running, and the open's transcript held its prompt after the last boundary: it had not been saved as ended by then,
      //    so the copy built here is the only one too;
      //  - anything else (a receipt not readable or about another turn, or a running turn the transcript showed nothing open
      //    of: the agent saves a turn before it marks it ended): shown from the replay as any running turn, and read back from
      //    the transcript when it ends, so a copy built here never stays beside the transcript's.
      const ad = this.adopted, cur0 = C.current(this.conv);
      const mine = !!ad && t0.s.turnId === ad.turn && cur0?.s.turnId === ad.turn;
      const word = mine && rc && rc.ok && L.isObj(rc.b) && rc.b.turn_id === ad.turn ? rc.b.state : undefined;
      const closed = mine && closedState(word);
      this.conv = C.onTurn(this.conv, {
        type: 'reply', epoch: ep, rev: rv, receipt: rc && rc.ok ? rc.b : null, replay: rp.ok && !closed ? rp.b : null, state: stb,
        turnSince: L.isObj(stb) && typeof stb.turn_since === 'number' ? stb.turn_since : undefined,
      }, this.clock.now());
      // Decided only by a reply the turn took (one stamped with an incarnation the stream has left is read again, below).
      if (mine && !closed && !C.current(this.conv)?.s.replyDropped) {
        const open = word === 'interrupted' || (typeof word === 'string' && !L.isTerminalState(word) && ad.prompt);
        if (!open) this.reread = true;
        this.adopted = null;
      }
      // The replay's counts are kept before its commands run: a new turn's command drops an unfinished turn it may have filled.
      this.foldUsage();
      if (rp.ok) this.replayCommands(rp.b);
      // The replayed frames and the snapshot decide the cards: the stream reopened after them starts past both, so a
      // gate only the replay saw (it parked between the two reads) is booked from its frame.
      if (rp.ok && this.rec?.s === sid && bep === this.book.epoch && L.isObj(rp.b) && Array.isArray(rp.b.events)) for (const env of rp.b.events as unknown[]) this.bookFrame(env);
      if (stb && this.rec?.s === sid && !this.applyState(stb, bep, issued, false, true)) this.recon('epoch');
      const s = C.current(this.conv)?.s;
      if (!s) return this.publish();
      if (s.replyDropped) { this.again = false; this.publish(); return this.resync(keep); }
      // Usage-limit readings from the replay only once the reducer took the reply: a reply of an incarnation the stream has
      // left (replyDropped) would put that incarnation's reading back, and another rate-limit epoch always supersedes.
      if (rp.ok && this.rec?.s === sid && L.isObj(rp.b) && Array.isArray(rp.b.events)) for (const env of rp.b.events as unknown[]) {
        const type = L.isObj(env) && L.isObj(env.event) && typeof env.event.type === 'string' ? env.event.type : '';
        if (type.startsWith('event.')) this.rateLimitFrame(sid, type.slice(6), env);
      }
      if (s.stateLeftOut) this.again = true;
      if (s.gap) this.conv = { ...this.conv, gapTop: true };
      if (s.terminal) return this.finish();
      if (!(st.ok && rp.ok)) { this.conn = { lost: true, reconnecting: true }; this.again = false; return this.publish(); }
      this.conn = { lost: false, reconnecting: keep ? this.conn.reconnecting : true };
      const rb = rp.b;
      const max = L.isObj(rb) && typeof rb.max_seq === 'number' && rb.max_seq >= 0 && (!s.inc || rb.incarnation === s.inc) ? rb.max_seq : 0;
      this.conv = C.onTurn(this.conv, { type: 'resynced' });
      this.publish();
      if (s.done || s.discarded) this.receipt();
      const again = this.again;
      this.again = false;
      if (!keep) { const s2 = C.current(this.conv)?.s; this.openStream(s2 && s2.inc ? { since: Math.max(s2.seq, max), incarnation: s2.inc } : null); }
      // No stream by the watch: the reads just made are the recovery.
      if (!keep && !this.es && this.level() !== 'stream' && this.conn.reconnecting && !this.conn.lost) { this.conn = { lost: false, reconnecting: false }; this.publish(); }
      if (again) this.resync(true);
    });
  }

  // ---- gates ----
  /** The card a click was drawn for (id + generation), or the first answerable lead card: one the book holds now,
   *  answerable here, and with no decision of this page out or unknown on it. */
  private cardFor(kind: Gate['kind'], seen?: { id: string; generation: number }): G.SGate | null {
    const x = seen ? this.book.list.find((g) => g.gate.id === seen.id && g.gate.generation === seen.generation) : this.book.list.find((g) => !g.helper && !g.addressing);
    if (!x || x.helper || x.addressing || x.gate.invalid || x.gate.blocked || x.gate.kind !== kind || this.attempts.has(x.key) || this.claiming.has(x.key) || this.journalFull()) return null;
    return x;
  }
  /** Claims a gate for one decision across tabs: under the store lock, another tab's stored attempt is taken in
   *  and the card checked again; only then is this attempt stored (before it is sent) and sent. */
  private claim(kind: Gate['kind'], key: string, seen: { id: string; generation: number } | undefined, rid: string, go: () => void): void {
    const run = () => {
      this.importDa();
      const x = this.cardFor(kind, seen);
      // Nothing was sent for this call: its own request id says so (a caller waiting on it is answered, never by another call).
      if (!x || x.key !== key) { this.prove(rid, 'notTaken'); this.publish(); return; }
      go();
    };
    const lock = this.store.lock;
    if (!lock) return run();
    const g = this.gen;
    this.claiming.add(key); this.claimRids.add(rid);
    this.publish();
    // The id stays waiting until run() has attempted or proved it, so a caller never sees it neither waiting nor settled.
    const done = () => { if (g !== this.gen) return; this.claiming.delete(key); try { if (this.live(g)) run(); } finally { this.claimRids.delete(rid); } };
    // A request refused before its callback ran falls back to running unlocked; a callback that ran and threw also rejects the request,
    // and is never run again (its attempt may be stored and sent: a second run would find it and prove this request notTaken).
    let entered = false;
    void lock(() => { entered = true; done(); }).catch(() => { if (!entered) done(); });
  }
  /** Allow once / Allow for this session / Deny (with an optional reason, sent with Deny). `seen`: the gate the
   *  clicked card was drawn for; another gate (replaced before the repaint) is not decided. Returns THIS call's request id
   *  (its attempt and decisionProof are judged by it), or null when the engine took nothing. */
  decide(choice: L.Choice, reason?: string, seen?: { id: string; generation: number }): string | null {
    const x = this.cardFor('confirm', seen);
    if (!x) return null;
    const rid = this.requestId('confirm');
    const b = L.confirmBody(x.gate, choice, rid, choice === 'deny' ? reason : undefined);
    if (!b || !rid) return null;
    this.claim('confirm', x.key, seen, rid, () => {
      this.notKept = false; this.decisionElsewhere = null;
      this.attempts.set(x.key, { rid, status: 'sending', kind: choice, tool: x.gate.tool ?? '', text: choice === 'deny' && reason ? reason : gateLine(x.gate), own: true, tok: ++this.tokN });
      this.saveAttempts();
      this.publish();
      this.postDecision('confirm', x.key, b, rid, x.gate);
    });
    return rid;
  }
  /** The answer to a question gate: one string, or one per question id. Returns this call's request id, or null (as decide). */
  answer(value: string | Record<string, string>, seen?: { id: string; generation: number }): string | null {
    const x = this.cardFor('question', seen);
    if (!x) return null;
    const b = L.answerBody(x.gate, value), rid = this.requestId('answer');
    if (!b || !rid) return null;
    this.claim('question', x.key, seen, rid, () => {
      this.notKept = false; this.decisionElsewhere = null;
      const q = answeredLine(x.gate, value);
      this.attempts.set(x.key, { rid, status: 'sending', kind: 'answered', tool: '', text: q.text, said: q.said, own: true, tok: ++this.tokN });
      this.saveAttempts();
      this.publish();
      this.postDecision('answer', x.key, b, rid, x.gate);
    });
    return rid;
  }
  private postDecision(kind: 'confirm' | 'answer', key: string, b: L.ConfirmBody | L.AnswerBody, rid: string, gate: Gate): void {
    const g = this.gen, rec = this.rec as AskRecord, sid = rec.s as string;
    let p: Promise<unknown>;
    if (this.jr) p = this.sendJ({ route: kind, r: rec.r, sid, c: rec.k1, key: rid, gate: gate.id, gen: gate.generation }, (t) => {
      // The lease ticket and its generation exist only while this page displays the lease as held; else the decision carries the journal's alone.
      const d = this.leaseHandle(rec.r)?.decide(kind === 'confirm' ? leaseRoutes.confirm : leaseRoutes.answer) ?? null;
      return kind === 'confirm'
        ? this.io.confirm(sid, d && d.lease_generation !== undefined ? { ...(b as L.ConfirmBody), lease_generation: d.lease_generation } : (b as L.ConfirmBody), rec.r, tix(...t, d?.ticket))
        : this.io.answer(sid, b as L.AnswerBody, rec.r, tix(...t, d?.ticket));
    });
    else p = kind === 'confirm' ? this.io.confirm(sid, b as L.ConfirmBody, rec.r) : this.io.answer(sid, b as L.AnswerBody, rec.r);
    const mine = () => this.attempts.get(key)?.rid === rid;
    p.then((res) => {
      if (!this.live(g) || !mine()) return;
      void res;
      // A 200 is this decision applied, even when the stream already closed the card without naming it.
      this.prove(rid, 'applied');
      this.settledDecision(key, true, gate);
    }, (e0: unknown) => {
      if (!this.live(g) || !mine()) return;
      if (e0 instanceof NotSentErr) return this.refuseUnkept(key, rid, e0, gate.generation);
      const e = e0 instanceof SentErr ? e0.e : e0;
      const unsure = e0 instanceof SentErr && e0.v.t === 'unknown';
      const code = codeOf(e), ex = L.isObj(e) ? e : {};
      const det = L.isObj(ex.data) && L.isObj(ex.data.details) ? ex.data.details : L.isObj(ex.details) ? ex.details : {};
      // This request named as the one resolved settles the card; a 404 saying so proves nothing (below), like any other 404.
      if (!this.jr && code === 'gate_already_resolved' && det.request_id === rid && !L.decisionProvesNothing(ex.status)) { if (ex.status === 409) this.prove(rid, 'applied'); return this.settledDecision(key, true, gate); }
      if (this.jr ? unsure : (lostAnswer(e) || code === 'gate_decision_pending' || L.decisionProvesNothing(ex.status))) {
        // Unknown (a lost answer, a decision still pending, or a 404, which proves nothing: L.decisionProvesNothing): read back from the
        // session (its gate list and the stream), never sent again on its own. A gate
        // the book already let go of (its end came while the answer was out) settles it: the gate is over. (With a
        // journal a gate that merely left the book proves nothing: the decision stays unknown, C9.)
        if (!this.jr && !this.book.list.some((x) => x.key === key)) return this.settledDecision(key, false, gate);
        (this.attempts.get(key) as { status: string }).status = 'unknown';
        this.publish();
        this.recon('decision');
        return;
      }
      // A definite refusal: not applied. A gate named gone or changed goes at once (never shown as approved);
      // anything else leaves the card answerable. gate_already_answered without details is another answer still
      // being applied (it may fail and leave the question parked): the card stays. Either way the session is read
      // again.
      const a = this.attempts.get(key);
      const gone = L.GATE_GONE_CODES.includes(code) && !(code === 'gate_already_answered' && !Object.keys(det).length);
      this.attempts.delete(key); if (a) this.settleRid(key, a.rid, !gone); this.saveAttempts();
      this.prove(rid, ex.status === 409 && code === 'gate_already_resolved' && det.outcome === 'answered' && typeof det.request_id === 'string' && det.request_id !== '' && det.request_id !== rid ? 'elsewhere' : 'refused');
      if (gone && typeof ex.status === 'number' && ex.status >= 400 && ex.status < 500) {
        this.book = G.close(this.book, key, gate); this.appliedTok = ++this.tokN;
        // Another decision was applied first (another tab, client or person: the agent recorded the gate answered and
        // this request is not the one it took): one line says so, never a silent close. Which way it went is theirs.
        if (code === 'gate_already_resolved' && det.outcome === 'answered' && det.request_id !== rid) this.conv = C.addDecided(this.conv, { kind: 'elsewhere', tool: gate.tool ?? '', text: gateLine(gate) });
      }
      this.publish();
      this.recon('decision');
    });
  }
  /** The decision did not leave (its entry was not kept, or another tab's decision holds the gate): no attempt, no entry. */
  /** The refusal is shown only while the very card it was for (same key AND generation) is still listed. */
  private elsewhereShown(gates: readonly CardView[]): boolean {
    const x = this.decisionElsewhere;
    return x !== null && gates.some((c) => c.key === x.key && c.gate.generation === x.gen);
  }
  private refuseUnkept(key: string, rid: string, e: NotSentErr, gen: number): void {
    this.attempts.delete(key);
    this.goneRid.add(rid);
    if (e.why === 'decided') this.importDa();
    else if (e.why === 'elsewhere') { this.decisionElsewhere = { key, gen }; this.prove(rid, 'chatElsewhere'); }
    else if (e.why !== 'cancelled') { this.notKept = true; this.prove(rid, 'notKept'); }
    this.publish();
    if (e.why === 'decided') this.recon('decision');
  }
  /** The person dismisses a decision no read could settle (journaled engines): its entry goes and the card is answerable again.
   *  Nothing is sent. `key`: the gate (default: the first unknown one). */
  dismissDecision(key?: string): void {
    if (!this.jr) return;
    const k = key ?? [...this.attempts].find(([, x]) => x.status === 'unknown')?.[0];
    const a = k ? this.attempts.get(k) : undefined;
    if (!k || !a || a.status !== 'unknown') return;
    if (a.rid && !this.jr.j.dismiss(this.jr.handle, a.rid, dismissal())) return;
    this.attempts.delete(k);
    this.settleRid(k, a.rid, true);
    this.saveAttempts();
    this.publish();
    this.recon('decision');
  }
  /** Whether dismissDecision(key) would act now: a journaled engine holding an unknown attempt for that gate key (any, when no key). */
  canDismiss(key?: string): boolean {
    if (!this.jr) return false;
    for (const [k, a] of this.attempts) if (a.status === 'unknown' && (key === undefined || k === key)) return true;
    return false;
  }
  private settledDecision(key: string, applied: boolean, gate: Gate): void {
    const a = this.attempts.get(key);
    this.attempts.delete(key); if (a) this.settleRid(key, a.rid);
    if (applied) {
      // Applied: the gate is over. A snapshot read before this answer may still hold it: it is read again.
      this.book = G.close(this.book, key, gate);
      this.appliedTok = ++this.tokN;
      if (a) this.conv = C.addDecided(this.conv, { kind: a.kind, tool: a.tool, text: a.text, ...a.said });
    }
    this.saveAttempts();
    this.afterChange();
  }
  /** Check status for a decision whose answer was lost: reads only; the gate is never decided twice meanwhile. */
  checkDecision(): void { if ([...this.attempts.values()].some((a) => a.status === 'unknown')) this.recon('check'); }

  // ---- stop ----
  stop(): void {
    const t = C.current(this.conv), rec = this.rec;
    // A Stop still unresolved for this turn (on its way, or its answer lost) is never sent a second time.
    if (!t || !rec || !rec.s || !C.running(t) || t.s.stopping || t.s.stopUnsure) return;
    const b = L.cancelBody(t.s.turnId);
    if (!b) return;
    const g = this.gen, tid = b.turn_id;
    this.conv = C.onTurn(this.conv, { type: 'stop' });
    this.publish();
    void settle(this.io.cancel(rec.s, tid, rec.r)).then((r) => {
      if (!this.live(g)) return;
      // The answer belongs to the turn the Stop named: by now that turn may have ended and another begun in the same chat (a
      // follow-up, another tab's), and that one's Stop state is its own.
      if (!r.ok && !lostAnswer(r.e)) {
        // Refused: the turn runs on as before (Stop shows again); one receipt read catches a turn that just ended.
        this.conv = C.onTurn(this.conv, { type: 'stopRefused', turnId: tid });
        this.publish();
        if (C.current(this.conv)?.s.turnId === tid) this.receipt(true);
        return;
      }
      let k = 0;
      const poll = () => {
        const s = C.current(this.conv)?.s;
        if (!s || s.turnId !== tid || s.terminal) return;
        if (++k > STOP_POLLS) {
          // The cancellation's answer was lost and the turn never showed it ended: whether the Stop took is not known (C9). The
          // turn keeps Stop held and is no longer said to be stopping; Check again reads its receipt (checkOutcome).
          this.conv = C.onTurn(this.conv, { type: 'stopUnsure', turnId: tid });
          this.publish();
          return;
        }
        this.receipt(true);
        this.later(poll, STOP_POLL_MS);
      };
      poll();
    });
  }

  // ---- outcomes ----
  private finish(): void {
    const t = C.current(this.conv), rec = this.rec;
    if (!t || !rec || !t.s.terminal) return this.publish();
    // Only a turn this page saw end says how it ended. A turn rebuilt from the transcript carries the rebuild's placeholder
    // ('completed', or 'failed' from its close marker): the record keeps the word the turn's receipt gave it (failed, cancelled,
    // interrupted, or a failure nothing could confirm), which the next open reads.
    if (!t.history) { rec.ph = t.s.terminal.state; this.save(); }
    this.conn = { lost: false, reconnecting: false };
    // A turn ran with no stream for a while: its frames went by unseen, so the reply is read from the history (owed until applied).
    // A turn that cleared the conversation (/clear) left nothing of what is shown: the history is read again too.
    if (t.s.gap || t.s.cut || t.s.cleared || this.reread) this.historyOwed = true;
    // A turn adopted at the open, ended: closed, it is the transcript's. It is read back from there (owed until applied), and until
    // then the copy shown stands in for it as a transcript turn, which no frame, replay or receipt fills. Interrupted (never saved
    // as a turn), the copy shown is the only one and stays.
    if (this.adopted && this.adopted.turn === t.s.turnId) {
      if (closedState(t.s.terminal.state)) {
        this.historyOwed = true;
        if (!t.history) this.conv = { ...this.conv, turns: [...this.conv.turns.slice(0, -1), { ...t, history: true }] };
      } else this.adopted = null;
    }
    this.historyLater();
    this.reread = false;
    this.publish();
    // The stream stays open; the session's state says whether another turn (a follow-up's, another tab's) runs.
    this.recon('end');
  }
  /** The transcript, whether its last turn is known failed, and that turn's error code: when the record says its turn
   *  failed, the agent's turn list is read before and after the transcript, and the turn counts as failed only when both
   *  reads still name it as the newest (see tailVerdict). The code ('' unless failed) lets historyFrom refuse a close
   *  marker that names another code (an older turn a trim left last). The reads go one after another, never in parallel. */
  /** `prove`: also say whether the transcript's last turn is the record's turn (`last`): the agent's newest turn, read before and after
   *  the transcript, is that turn both times and closed, so no other turn was admitted around the read.
   *  The fifth value says the read was a cold open's: historyFrom then takes a close marker only with the code named (strictCode). */
  private readHistory(rec: AskRecord, auto: boolean, prove = false): Promise<[Settled, boolean | 'unsure', string, boolean, boolean]> {
    const sid = rec.s;
    if (!sid) return Promise.resolve([{ ok: false, e: null }, false, '', false, false]);
    // An automatic rebuild stops between its reads once the watch is off (rule a): if any step was gated the whole read counts
    // as failed (even a transcript that came back), so nothing applies and the history stays owed.
    let stopped = false;
    const gated = <T>(f: () => Promise<T>, none: T): Promise<T> => (auto && this.autoOff() ? (stopped = true, Promise.resolve(none)) : f());
    const off: Settled = { ok: false, e: null };
    const transcript = () => gated(() => settle(this.io.transcript(sid, rec.r)), off);
    // A record that names no turn (a chat opened cold: seeded, or started in another browser) knows nothing of how its last turn
    // ended, so the agent is asked: the transcript's last turn reads failed only when both turn-list reads name the same newest
    // turn as failed with the same code (tailVerdict against that turn); a close marker naming another code then reads unsure
    // (historyFrom). Reads that fail or disagree claim nothing (C9): never failed.
    // Not for a record with a turn key on its way (w) or a live phase: that turn is this browser's own, settled by its own reads.
    const cold = !rec.t && !rec.w && !C.isLivePhase(rec.ph);
    if (!cold && rec.ph !== 'failed' && !prove) return transcript().then((t) => [t, false, '', false, false]);
    const want = rec.t;
    const newest = () => gated(() => settle(this.io.turns(sid, rec.r)).then(newestTurn), 'bad' as const);
    return newest().then((a) => transcript().then((t) => newest().then((b): [Settled, boolean | 'unsure', string, boolean, boolean] => {
      if (stopped) return [off, false, '', false, false];
      if (cold) {
        // The code is the only tie between the agent's failed turn and the transcript's last marker: an empty one ties nothing
        // (an older turn a trim left last ends with its own marker), so the marker then reads unsure (strictCode), never failed.
        const v = a && a !== 'bad' ? tailVerdict(a.id, a, b) : false;
        return v === true && a && a !== 'bad' ? [t, true, a.code, false, true] : [t, false, '', false, true];
      }
      const v = rec.ph === 'failed' ? tailVerdict(want as string, a, b) : false;
      const last = !!a && a !== 'bad' && !!b && b !== 'bad' && a.id === want && b.id === want && closedState(a.state) && closedState(b.state);
      return [t, v, v === true && a && a !== 'bad' ? a.code : '', last, false];
    })));
  }
  /** Whether anything of this chat is unsettled: a pending turn or follow-up key, a decision in flight, an entry (stored here or by
   *  another tab). A session the agent no longer has proves none of it settled. */
  private hasEvidence(rec: AskRecord): boolean {
    if (!this.jr) return false;
    return !!(rec.w || rec.k3?.length || rec.kw?.length || (rec.da && Object.keys(rec.da).length) || this.attempts.size);
  }
  /** This conversation's record as the store holds it now (another tab may have moved it). */
  private storedOf(rec: AskRecord): AskRecord | undefined {
    // With a journal the stored record is the journal's (the one place every tab and engine of the chat writes), with the
    // request evidence its entries hold; the dock's own store is read only for a chat the journal does not hold yet.
    if (this.jr) {
      const { j, handle } = this.jr;
      const found = (rec.s ? j.find(handle, rec.r, rec.s) : null) ?? j.findCreate(handle, rec.r, rec.k1);
      if (found) return found;
      const old = C.convsFor(this.store.read(this.slot.account), this.slot.account, { p: rec.p, c: rec.c, r: rec.r }).find((x) => x.k1 === rec.k1);
      return old ? j.attach(handle, old) ?? stripEvidence(old) : undefined;
    }
    return C.convsFor(this.store.read(this.slot.account), this.slot.account, { p: rec.p, c: rec.c, r: rec.r }).find((x) => x.k1 === rec.k1);
  }
  /** Stores whether the record's turn's failure could be confirmed: 'unsure' marks it (Recent reads unknown); a
   *  confirmed or settled answer clears the mark. */
  private noteVerdict(rec: AskRecord, v: boolean | 'unsure', turn: string | null): void {
    if (!turn || rec.t !== turn || this.rec !== rec) return;
    const set = v === 'unsure';
    const stored = this.storedOf(rec);
    if (set) rec.u = turn; else delete rec.u;
    // The store already says so for this same turn (another tab, or an earlier kept write): only this copy follows,
    // nothing is written, and a verdict of this page's not kept yet is settled too. Without a stored record to prove
    // it (unreadable storage), this copy agreeing proves nothing: the verdict is written (and kept back if refused).
    if (stored && stored.t === turn && (stored.u === turn) === set) { if (this.uOp && this.uOp.k1 === rec.k1 && this.uOp.t === turn) this.uOp = null; return; }
    this.uOp = { k1: rec.k1, t: turn, set };
    this.save();
  }
  /** Check again on a last turn whose outcome could not be told: the conversation is read again the same way. On a Stop whose answer
   *  was lost (stopUnsure): the running turn's receipt is read once more (it may have ended since). Either way nothing is sent. */
  checkOutcome(): void {
    const t = C.current(this.conv);
    if (t && C.running(t) && t.s.stopUnsure) this.receipt(true);
    else this.reloadHistory(false);
  }
  /** Rule (c): an owed history is asked for when nothing runs, the watch allows an automatic read, and no read of the same turn
   *  is out. Called at finish and at every good streamless state read (a watch rising from off reads the state first). */
  private historyLater(): void {
    if (!this.historyOwed || C.running(C.current(this.conv))) return;
    this.reloadHistory(true);
  }
  private reloadHistory(auto = true): void {
    const g = this.gen, rec = this.rec;
    if (!rec || !rec.s) return;
    if (auto && this.autoOff()) { this.historyOwed = true; return; }
    const key = rec.s + '|' + (rec.t ?? '');
    if (auto && this.histBusy && this.histFor === key) return;
    // The read is about this session's turn as it is now: a result that comes back after a newer read started, or
    // after the record moved to another turn or session, changes nothing (it would mark or rebuild the wrong turn).
    const hn = ++this.histN, sid = rec.s, want = rec.t;
    // A turn shown live at an open and closed since is read back from here: the read proves whether the transcript's last turn is
    // that turn, so it keeps the agent's turn id (the chat still follows that turn; a state naming it never shows it a second time).
    const prove = !!want && this.adopted?.turn === want;
    this.histBusy = hn; this.histFor = key;
    void this.readHistory(rec, auto, prove).then(([t, verdict, failCode, last, strictCode]) => {
      if (this.histBusy === hn) { this.histBusy = 0; this.histFor = ''; }
      if (!this.live(g) || hn !== this.histN || this.rec !== rec || rec.s !== sid || rec.t !== want) return;
      // Nothing applies; the view no longer says it is catching up (Snapshot.catchingUp follows the read that ended).
      if (!t.ok || C.running(C.current(this.conv))) return this.publish();
      // Another tab moved this conversation to a newer turn meanwhile: the reads describe the older one. The record
      // takes the stored turn (save's own merge) and the history is read again for it; nothing of this read applies.
      const s0 = this.storedOf(rec);
      if (s0 && s0.t !== want) { this.save(); if (this.rec === rec && rec.t !== want) this.reloadHistory(auto); return; }
      const h = C.historyFrom(t.b, { liveTail: false, idOf: () => 'h' + this.uid(), at: this.clock.now(), lastFailed: verdict, failCode, strictCode });
      const lastFailed = h.unsure ? 'unsure' : verdict;
      this.noteVerdict(rec, lastFailed, want);
      if (this.rec !== rec || rec.t !== want) { if (this.rec === rec) this.reloadHistory(auto); return; }
      // Loose rows not settled (may have gone through, not sent, queued) stay: the history does not hold them.
      const keep = this.conv.loose.map((id) => this.conv.users[id]).filter((u): u is C.UserMsg => !!u && u.state !== 'sent');
      // The transcript holds no decided lines: the current turn's own stay on its history turn (the last one), when
      // there is one. An empty history replaces what was shown too (a turn read earlier, another tab's older turn):
      // with no turn to carry it, the conversation-level note follows the new verdict.
      const cur = C.current(this.conv);
      let turns = h.turns.length && cur && cur.decided.length ? [...h.turns.slice(0, -1), { ...(h.turns[h.turns.length - 1] as C.TurnBlock), decided: cur.decided }] : h.turns;
      // Proven the record's turn, and closed by its own boundary: the last transcript turn keeps that turn's id.
      const lt = turns[turns.length - 1];
      if (prove && last && want && lt && lt.pin !== undefined) turns = [...turns.slice(0, -1), { ...lt, s: { ...lt.s, turnId: want } }];
      const users = keepAtt(h.users, Object.values(this.conv.users));
      let conv: C.Conv = { ...C.emptyConv(rec.s), users: Object.fromEntries(users.map((u) => [u.id, u])), turns, gapTop: false, ...(!turns.length && lastFailed === 'unsure' ? { unsure: true as const } : {}) };
      for (const u of keep) conv = C.addUser(conv, u);
      this.conv = conv;
      this.historyOwed = false;   // applied: the conversation is the history's now
      this.adopted = null;
      this.publish();
    });
  }
  private gone(): void {
    const rec = this.rec;
    if (rec) { rec.ph = 'gone'; this.save(); }
    this.closeStream();
    this.block('ask.gone', { act: 'none', tone: 'muted' });
  }

  // ---- Approve automatically: the session's own YOLO mode (the old auto-approve, unchanged) ----
  private readAuto(done?: (known: boolean) => void, openHandle = true): void {
    const g = this.gen, rec = this.rec, seq = this.autoSeq, n = ++this.readN;
    if (!this.auto.cap || !rec || !rec.s) { done?.(false); return; }
    const aSid = rec.s;
    this.readPending++;
    // One read counts as out until it answers or READ_MS passes, whichever is first; an answer after that is still applied.
    let out = true, told = false;
    const finish = (known: boolean): void => { if (!told) { told = true; done?.(known); } };
    const release = (): void => { if (out) { out = false; this.cancel(budget); if (g === this.gen && this.readPending > 0) this.readPending--; } };
    const budget = this.later(() => {
      if (!out || !this.live(g)) return;
      out = false;
      if (this.readPending > 0) this.readPending--;
      if (this.strictMode === null && this.readPending === 0) this.modeLost = true;
      // A switch nothing has told yet stays unknown, with its note (and Check again), as an answer that told nothing (a write out
      // tells its own end).
      if (this.auto.on === null && !this.auto.err && !this.auto.busy) { this.auto.err = 'ask.autoUnknown'; this.auto.errE = undefined; }
      this.publish();
      finish(false);
    }, READ_MS);
    void settle(this.leaseRead(rec, () => this.io.approval(aSid, rec.r))).then((r) => {
      release();
      if (!this.live(g)) return;
      // Before the latest Off/On request, or a newer read: it learns nothing. If it was the last read out and the mode is still not
      // known (a newer answer the parser refused while this one was out), the card says so at once: no read or budget is left to.
      if (seq !== this.autoSeq || n < this.readApplied) {
        if (this.strictMode === null && this.readPending === 0 && !this.modeLost) { this.modeLost = true; this.publish(); }
        else this.reconcileApproverHandle();
        finish(false); return;
      }
      // The one parser (agent.approvalOf): only an answer it accepts with mode 'default' relaxes the chat. An
      // answer it refuses (no or another mode, locked not a boolean, YOLO armed under Strict) is unknown: the mode goes back to not
      // read (Strict, activation()), the card says so with a Check again, and the chip is never On. A failed read learns nothing:
      // the last answer stands, and none yet counts Strict. A read dropped by an Off/On request or a yolo frame learns nothing
      // (autoFrame asks again). A reopen's read also opens the handle (not Strict: it mints tickets); whether it is told Strict is
      // reconcileApproverHandle's.
      const ap = r.ok ? agent.approvalOf({ ok: true, body: r.b }) : null;
      // Every answer sets the approval state (an unknown one too), so an older read answering after it is dropped above.
      if (r.ok) this.readApplied = n;
      if (ap) { this.strictMode = ap.strict; this.modeLost = false; }
      else if (r.ok) { this.strictMode = null; if (this.readPending === 0) this.modeLost = true; }
      else if (this.strictMode === null && this.readPending === 0) this.modeLost = true;
      if (openHandle && ap) this.leaseHandle(rec.r);
      const yolo = ap ? ap.yolo : null;
      const known = yolo !== null;
      if (known) {
        this.auto.on = yolo; this.autoSid = rec.s; if (this.auto.err === 'ask.autoUnknown') this.auto.err = '';
        if (!this.auto.on) this.wantAuto = false;
      }
      // An unparsable answer leaves the switch unknown, and an answer without yolo never keeps the chip On; a failed read keeps
      // what was last heard. noDetails: the mode could not be read back, so there is no rejection to show.
      else {
        if (r.ok && (!ap || this.auto.on === true)) this.auto.on = null;
        if (this.auto.on === null) { this.auto.err = 'ask.autoUnknown'; this.auto.errE = undefined; }
      }
      this.publish();
      finish(known);
    });
  }
  private autoFrame(d: unknown): void {
    const ev = L.isObj(d) && L.isObj(d.event) && L.isObj(d.event.data) ? d.event.data : null;
    if (!ev || typeof ev.enabled !== 'boolean' || this.auto.busy) return;
    // The session's own event is newer than any read still out: those are ignored (autoSeq), so an older Off answer
    // never lets a message go after the session went On.
    this.autoSeq++;
    // A read still out is dropped by that bump (its yolo answer would be older than this frame): ask again, so the mode it was
    // bringing is not left unread.
    if (this.readPending > 0) this.readAuto(undefined, false);
    this.auto.on = ev.enabled; this.auto.err = ''; this.auto.errE = undefined; this.autoSid = this.rec?.s ?? null;
    // An On another client set is shown but never taken as the person's choice (the Off guard reads); an Off ends it.
    if (!ev.enabled) this.wantAuto = false;
    // Shown at once (the frame's own paint comes later): the page's approvals chip reads the chat again when this changes.
    this.publish();
  }
  /** The switch chip. Before the conversation's session exists it only sets what the first send arms. */
  /**
   * True when a write went out. `outcome` is told how THAT write ended, never another one (the send path writes too):
   * 'answered' when the session answered it (whatever it named) or refused it, 'unknown' when its answer was lost and a read
   * did not show it, or the conversation moved on (reset(): new, opened, the same one opened again, ended) before it ended.
   * Exactly once per write; a late answer after that tells nothing.
   */
  setAuto(want: boolean, outcome?: (o: 'answered' | 'unknown') => void): boolean {
    if (!this.auto.cap || this.auto.busy) return false;
    this.autoAside = null;   // the person's own choice replaces what the start set aside
    this.wantAuto = want;
    if (!this.rec || !this.rec.s) { this.auto.on = want; this.auto.err = ''; this.auto.errE = undefined; this.publish(); return false; }
    if (this.dormant) {
      // The switch is a live-chat write: a chat asleep on the computer is woken first. A wake that fails sent nothing (a definite answer).
      const a = this.auto;
      a.busy = true; a.err = ''; a.errE = undefined; a.note = '';
      this.publish();
      this.wakeNow(this.rec.s, (r) => {
        a.busy = false;
        if (r === 'ok') return this.putAuto(want, false, undefined, outcome);
        if (want && a.on !== true) this.wantAuto = false;
        a.err = want ? 'ask.autoFailOn' : 'ask.autoFailOff';
        this.publish();
        outcome?.('answered');
      });
      return true;
    }
    this.putAuto(want, false, undefined, outcome);
    return true;
  }
  private putAuto(want: boolean, first: boolean, next?: () => void, told?: (o: 'answered' | 'unknown') => void): void {
    const g = this.gen, rec = this.rec as AskRecord, a = this.auto;
    // This write's own end, once: its answer, or reset() (whichever is first); a later one is dropped.
    let outcome: ((o: 'answered' | 'unknown') => void) | undefined;
    if (told) {
      const once = (o: 'answered' | 'unknown'): void => { if (!this.autoWrites.delete(once)) return; told(o); };
      this.autoWrites.add(once);
      outcome = once;
    }
    this.autoSeq++;
    a.busy = true; a.err = ''; a.errE = undefined; a.note = '';
    this.publish();
    const settled = (o: 'answered' | 'unknown') => {
      a.busy = false;
      // An On the session did not take is no On here: a refused or unconfirmed On never lets a later send skip the guard.
      if (want && a.on !== true) this.wantAuto = false;
      if (a.on === want) { a.err = ''; a.errE = undefined; a.note = want ? 'ask.autoOnDone' : 'ask.autoOffDone'; this.later(() => { a.note = ''; this.publish(); }, 6000); }
      // noDetails: the answer named another mode than the wish; no call was refused.
      else if (!a.err) a.err = first ? 'ask.autoStartFail' : want ? 'ask.autoFailOn' : 'ask.autoFailOff';
      this.publish();
      next?.();
      outcome?.(o);
    };
    void settle(this.io.yolo(rec.s as string, want, rec.r)).then((r) => {
      if (!this.live(g)) { outcome?.('unknown'); return; }
      if (r.ok && L.isObj(r.b) && typeof r.b.yolo === 'boolean') {
        a.on = r.b.yolo; this.autoSid = rec.s;
        // A session this engine just made has not had its approval MODE read (only an opened one is): until it is, the chat counts as Strict
        // and a gate in its first turn cannot be decided (the active source needs a held approver lease for a Strict chat). Read it now.
        // The read only tells an OPEN handle (a Strict create opened one with its ticket): a default chat opens none for it.
        if (this.strictMode === null) this.readAuto(undefined, false);
        return settled('answered');
      }
      const e = r.ok ? null : r.e;
      if (!r.ok && !lostAnswer(e)) {
        const c = codeOf(e);
        a.err = c === 'approval_policy_locked' || c === 'approval_policy_active' ? 'ask.autoLocked' : first ? 'ask.autoStartFail' : want ? 'ask.autoFailOn' : 'ask.autoFailOff';
        a.errE = e;   // the note's Details and Copy details for support
        return settled('answered');
      }
      // The answer was lost: only a read tells the current mode; without one it is unknown, never the old value.
      this.readAuto((known) => { if (!known) a.on = null; const shown = known && a.on === want; if (!shown) { a.err = 'ask.autoUnknown'; a.errE = undefined; } settled(shown ? 'answered' : 'unknown'); });   // noDetails: a lost answer has no rejection
    });
  }
  // Before the first message: as the chip says (off unless switched on); the message waits for the answer, so its
  // first action already runs in the chosen mode. Arming that fails never stops the send (the agent asks before
  // each action); an Off the session does not confirm does: the message is not sent while it may approve alone.
  private armAuto(uid: string, next: () => void, fail?: () => void): void {
    if (!this.auto.cap) return next();
    // What the chip showed before the session existed is a wish: only the session's answer counts from here.
    this.auto.on = null;
    if (this.wantAuto) return this.putAuto(true, true, next);
    this.putAuto(false, false, () => {
      if (this.auto.on === false) return next();
      // A message that may already have reached the agent stays "may have gone through" (C9), never "Not sent".
      this.conv = C.patchUser(this.conv, uid, this.maybe.has(uid) ? { state: 'unknown', reason: 'ask.autoOffUnchecked' } : { state: 'notSent', reason: 'ask.autoOffFailed' });
      this.publish();
      fail?.();
    });
  }
  /** Every message out on an existing session (Send, a retype, Check status, Send again) goes through here: a turn,
   *  or a follow-up, which starts a turn too when the session went idle first. Switched Off, nothing goes until a
   *  read of this session's mode taken now says Off (another client may have switched it On; a cached Off or a read
   *  from before the last toggle never counts); otherwise Off is put first, and the message waits for it. */
  private turnOut(uid: string): void {
    // The computer put the chat to sleep (GET /state live:false): its turn and follow-up routes serve live chats only, so the message
    // wakes it first (wakeThen) and goes once it is awake.
    if (this.dormant && this.rec?.s) return this.wakeThen(uid);
    const go = () => (this.conv.users[uid]?.via === 'command' ? this.command(uid) : this.dispatch(uid));
    if (!this.auto.cap || this.wantAuto) return go();
    const sid = this.rec?.s ?? null;
    this.readAuto((known) => {
      if (known && this.auto.on === false && sid && this.autoSid === sid) return go();
      this.armAuto(uid, go);
    });
  }
  /** The one wake in flight for this engine's chat: every message sent while it is out waits for the same answer. */
  private waking: { sid: string; p: Promise<'ok' | 'failed' | 'helperGates' | 'gone'> } | null = null;
  /** Wakes the sleeping chat (POST /sessions with `attach`), then sends the message as turnOut would. Nothing of the message leaves
   *  before the wake answers ok, so a refused or unanswered wake is a message that definitely did not go: Not sent, with the reason,
   *  and Send again wakes again. A row whose own outcome is already in doubt (a retry under a key that may have left) keeps it. */
  private wakeThen(uid: string): void {
    const sid = this.rec?.s as string;
    this.wakeNow(sid, (a) => {
      const u = this.conv.users[uid];
      if (!u) return;
      if (a === 'ok') return this.turnOut(uid);
      if (u.state !== 'sending' || this.maybe.has(uid)) { this.conv = C.patchUser(this.conv, uid, { reason: 'ask.checkFailed' }); return this.publish(); }
      this.conv = C.patchUser(this.conv, uid, { state: 'notSent', reason: wakeReason(a) });
      this.publish();
    });
  }
  /** Wakes `sid` (joining a wake already out) and calls `then` with its answer while this engine still shows that chat. An ok wake
   *  clears `dormant` first: the stream and the reads follow the chat again (the dormant re-read is not needed any more). */
  private wakeNow(sid: string, then: (a: 'ok' | 'failed' | 'helperGates' | 'gone') => void): void {
    const g = this.gen;
    if (!this.waking || this.waking.sid !== sid) {
      const mine = { sid, p: this.attachSession(sid) };
      this.waking = mine;
      void mine.p.finally(() => { if (this.waking === mine) this.waking = null; });
    }
    void this.waking.p.then((a) => {
      if (!this.live(g) || this.rec?.s !== sid) return;
      if (a === 'ok' && this.dormant) {
        this.dormant = false;
        if (this.rcTimer) { this.cancel(this.rcTimer); this.rcTimer = null; }
        this.publish();
      }
      // 404 not_found: the computer no longer has the chat (a chat never written to is discarded once it sleeps). It is not asleep any
      // more (no message wakes it); the chat is read again, and a read that says the same ends it as gone (recon: never while a decision
      // is in doubt).
      if (a === 'gone' && this.dormant) this.dormant = false;
      then(a);
      if (a === 'gone') this.recon('wakeGone');
    });
  }
  /** What the chip shows before any session exists. */
  autoBefore(): boolean { return this.wantAuto; }
  /** What a page's start made now would put its new conversation in before the first message: true Approve automatically On, false Off;
   *  null when the agent here has no such switch (nothing is put), undefined while the agent's version is not read. The wish a start
   *  set aside counts (the next start gets it back: endAside). Reads only: it changes nothing a start does. */
  autoAtStart(): boolean | null | undefined { return this.version === null ? undefined : this.auto.cap ? (this.autoAside ?? this.wantAuto) : null; }
  /** What the chip shows: before a session exists, the person's choice; once it exists, the session's mode as last
   *  read or heard, null while that is not known (never the choice standing in for it). */
  autoShown(): boolean | null { return this.rec?.s ? this.auto.on : this.auto.on ?? this.wantAuto; }

  // ---- conversations ----
  /** New conversation: the current one stays in Recent (and keeps running on the agent). */
  // ---- images and text files ----
  /** Files are about to be read for this draft: Send waits until they arrive (attach with this token). */
  beginRead(): number {
    const k = ++this.readSeq;
    this.attReads.add(k);
    this.publish();
    return k;
  }
  /** How many more images and text files the draft takes (a read stops preparing files past this). */
  attRoom(): { imgs: number; texts: number } {
    const imgs = this.att.items.filter((x) => x.kind === 'image').length;
    return { imgs: Math.max(0, A.IMG_MAX - imgs), texts: Math.max(0, A.TXT_MAX - (this.att.items.length - imgs)) };
  }
  /** Files read by attachio.readFiles: each one that fits is added in order; each one that does not gets its line.
   *  With a token whose draft went meanwhile, nothing is added and the thumbnails are let go. */
  attach(list: readonly A.Prepared[], typed: string, token?: number): void {
    const letGo = () => { for (const p of list) if (p.ok && p.att.kind === 'image') this.revokeUrl(p.att.url); };
    if (token !== undefined && !this.attReads.delete(token)) return letGo();
    if (this.phaseNow === 'ended') return letGo();
    const refused: A.Refusal[] = [];
    const ok: A.Att[] = [];
    for (const p of list) {
      if (p.ok) ok.push(p.att);
      else refused.push(p.why);
    }
    const r = A.admit(this.att.items, ok, typed);
    for (const a of ok) if (a.kind === 'image' && !r.list.includes(a)) this.revokeUrl(a.url);
    this.att = { items: r.list, refused: [...refused, ...r.refused], dropped: '' };
    this.publish();
  }
  unattach(id: string): void {
    const a = this.att.items.find((x) => x.id === id);
    if (!a) return;
    if (a.kind === 'image') this.letGoDraftUrl(a.url);
    this.att = { ...this.att, items: this.att.items.filter((x) => x !== a), refused: [] };
    this.publish();
  }
  clearAttNotes(): void {
    if (!this.att.refused.length && !this.att.dropped) return;
    this.att = { ...this.att, refused: [], dropped: '' };
    this.publish();
  }
  /** Why Send cannot go now with `typed` and its files (the draft's, or `carry`'s for a Retry): a strings key, or null. */
  attBlock(typed: string, carry?: Carry): string | null {
    // A message a reload lost carried files that are gone: nothing may go under its key, and a new message could run
    // the same work twice. It is checked or dismissed first.
    if (this.conv.loose.some((id) => { const x = this.conv.users[id]; return !!x && x.state === 'unknown' && !!x.lostFiles; })) return 'ask.lostFiles';
    if (!carry && this.attReads.size) return 'ask.attReading';
    const items = carry ? [...(carry.imgs ?? []), ...(carry.files ?? [])] : this.att.items;
    if (!items.length) return null;
    // A message a reload lost takes the retyped text under its key: other files under that key would be refused as a
    // conflict, and the text must never go without its files, so the person sends the files with a new message.
    const lost = this.conv.loose.some((id) => { const x = this.conv.users[id]; return !!x && x.state === 'unknown' && !x.text && x.via !== 'command'; });
    if (lost) return 'ask.attLostFirst';
    const via = this.freshOwed ? 'create' : C.routeFor(this.conv);
    return A.sendBlock(typed, items, via === 'command' && !this.followUps ? 'turn' : via);
  }
  /** Retry of a failed turn: its own text with its own files, as a new message (the draft is left as it is). */
  retryMsg(uid: string): boolean {
    const u = this.conv.users[uid];
    if (!u || !u.text) return false;
    // Only the prompt of a turn that failed here: a turn read back from the history may have lost its files (the
    // history keeps no images), and its text alone must never go as if it were the same message.
    if (!this.conv.turns.some((t) => t.users[0] === uid && !t.history && t.s.terminal?.state === 'failed')) return false;
    return this.send(u.text, false, { imgs: u.imgs, files: u.files });
  }
  /** A message the agent definitely did not take (Not sent) goes back to the draft to be fixed: its files join the
   *  draft's and its text is returned for the composer. Never one whose outcome is unknown. */
  takeBack(uid: string): string | null {
    const u = this.conv.users[uid];
    if (!u || !this.canTakeBack(u)) return null;
    const mine = [...(u.imgs ?? []), ...(u.files ?? [])];
    const r = A.admit(this.att.items, mine, '');
    // All or nothing: a file the draft would refuse keeps the row and the draft as they are (the person is never left without it).
    if (r.refused.length > 0) return null;
    // A Retry shares its original message's image (same URL): while another message still shows it, the sent side
    // keeps the URL, and the draft letting it go leaves it alone.
    for (const i of u.imgs ?? []) {
      const shown = Object.values(this.conv.users).some((x) => x.id !== uid && !!x.imgs?.some((y) => y.url === i.url));
      if (!shown) this.urls.delete(i.url);
      if (!r.list.includes(i)) this.letGoDraftUrl(i.url);
    }
    this.att = { items: r.list, refused: r.refused, dropped: '' };
    const users = { ...this.conv.users };
    delete users[uid];
    this.conv = { ...this.conv, users, loose: this.conv.loose.filter((x) => x !== uid), turns: this.conv.turns.filter((t) => !t.users.includes(uid)) };
    this.publish();
    return u.text;
  }
  /** The draft's attachments move to the message being sent (its thumbnails keep their URLs until the conversation goes). */
  private takeAtt(): Pick<C.UserMsg, 'imgs' | 'files'> {
    const imgs = this.att.items.filter((x): x is A.Img => x.kind === 'image');
    const files = this.att.items.filter((x): x is A.TextFile => x.kind === 'text');
    for (const i of imgs) if (i.url) this.urls.add(i.url);
    this.att = { items: [], refused: [], dropped: '' };
    return { ...(imgs.length ? { imgs } : {}), ...(files.length ? { files } : {}) };
  }
  /** The conversation goes: sent messages' thumbnails are let go, except one the draft still shows (an Edit took a
   *  shared image back), which the draft now owns alone. */
  private dropSent(): void {
    for (const u of this.urls) if (!this.att.items.some((a) => a.kind === 'image' && a.url === u)) this.revokeUrl(u);
    this.urls.clear();
  }
  /** A draft image goes: its thumbnail is let go unless a sent message still shows it. */
  private letGoDraftUrl(url: string): void {
    if (!this.urls.has(url)) this.revokeUrl(url);
  }
  /** The draft's files go (said with `say`, when it had any), and files still being read for it will be let go. */
  private dropDraft(say: string): void {
    // Files still being read count: they were picked for this draft, and the person is told they went.
    const had = this.att.items.length > 0 || this.attReads.size > 0;
    this.attReads.clear();
    for (const a of this.att.items) if (a.kind === 'image') this.letGoDraftUrl(a.url);
    // A note already standing stays when there is nothing new to drop (a second close, React's double effects).
    this.att = { items: [], refused: [], dropped: had ? say : this.att.dropped };
  }

  /** `keepDraft`: a new conversation the engine makes itself (a page's text, a dismissed first message) keeps the
   *  draft's files, which go with the next send; the person's New conversation drops them, with a note. */
  newConversation(keepDraft = false): void {
    if (this.pinSid) return;
    // The person's New waits for a first message still on its way (newWaits; the header says so); the engine's own resets
    // come only once settled.
    if (!keepDraft && this.newWaits()) return;
    // Before the stored conversation is picked up, a reset would abandon the start (nothing would pick it up again):
    // the new conversation is owed instead and made once it is. The person's draft files go now, all the same, and
    // files still being read are let go (the owed reset keeps only what is attached after this).
    if (!this.loaded) {
      if (!keepDraft) { this.dropDraft('ask.attDropped'); this.publish(); }
      this.freshOwed = true; this.pumpStart(); return;
    }
    this.reset();
    this.dropSent();
    if (!keepDraft) this.dropDraft('ask.attDropped');
    this.rec = null;
    this.conv = C.emptyConv();
    this.conn = { lost: false, reconnecting: false };
    this.freshSession();
    this.wantAuto = AUTO_DEFAULT;
    this.auto = { ...this.auto, on: null, busy: false, err: '', errE: undefined, note: '' };
    this.autoSid = null;
    this.set('ready', { blocked: null });
  }
  // ---- text a page brought: always a NEW conversation; the one open before stays in Recent, untouched ----
  // Both wait on the engine, which outlives the panel: until the stored conversation is picked up (so it is not
  // restored over the new one) and until nothing of the open one is in flight (a reset would drop a send or a
  // decision still on its way, and its text with it). pumpStart runs at every publish.
  /** Whether a conversation is open here (a session, or a message on its way to one). */
  hasConversation(): boolean { return !!this.rec || Object.keys(this.conv.users).length > 0; }
  /** Something of the open conversation still on its way, or a first message whose create cannot be proven either way. */
  private unsettled(): boolean { return this.inFlight() || this.holdsUnknownCreate(); }
  /** Whether the person's New conversation waits: a first message whose create may be on its way (no session known yet)
   *  would be reset away with its outcome (C9). With a session known the conversation keeps its turn: it stays in Recent,
   *  and a reference holder is moved to its pinned engine at the switch. */
  newWaits(): boolean { return this.inFlight() && !this.rec?.s; }
  /** A send, an Approve automatically switch or a decision of the open conversation still on its way. */
  inFlight(): boolean {
    return this.auto.busy || this.claiming.size > 0 || Object.values(this.conv.users).some((u) => u.state === 'sending')
      || [...this.attempts.values()].some((a) => a.status === 'sending');
  }
  /** A first message whose create the page cannot prove either way (its answer was lost; no session is known): its row and its Check live
   *  only here (the journal keeps the key, no session carries it), so a new conversation made over it would take both from view (C9).
   *  An unknown turn or command row belongs to a session that stays in Recent, and is not held. */
  holdsUnknownCreate(): boolean {
    return !this.rec?.s && Object.values(this.conv.users).some((u) => u.state === 'unknown' && u.via === 'create' && !this.untracked.has(this.rowKey.get(u.id) ?? this.rec?.k1 ?? ''));
  }
  /** Create keys whose Check the person stopped tracking on a start surface: a new conversation is then their own choice, and the journal
   *  keeps the key untouched (nothing is read or retired). */
  private readonly untracked = new Set<string>();
  /** The person stopped tracking the first message made under `k1`: it no longer holds a new conversation back. */
  releaseCreate(k1: string): void {
    if (this.untracked.has(k1)) return;
    this.untracked.add(k1);
    this.publish();
  }
  // ---- handing the open conversation to its reference ----
  /** Asked by the registry: whether another engine (the one pinned to a reference) holds this session. This engine never
   *  takes such a session up (its stored front record, a Recent row): one conversation is one engine, one stream, one lease. */
  held: ((sid: string) => boolean) | null = null;
  /** The session this engine holds (a pinned engine: the one it is pinned to), or null while none is known (none yet, or a
   *  first message on its way to making one). */
  session(): string | null { return this.rec?.s || this.pinSid || null; }
  /** Whether the conversation can change hands now: the session is known, the engine has read it, and nothing of this engine
   *  is still on its way or unknown (C9): no row sending, unknown or queued, no decision attempt, no send holding the
   *  stream, no start or new conversation owed, no switch being decided; and no words or files only this engine holds (a
   *  message not sent, refused or superseded that can be edited or retried, the draft's files). Anything else waits: a hand-off then
   *  would drop evidence or content only this engine holds. */
  quiet(): boolean {
    if (this.phaseNow === 'checking' || this.phaseNow === 'ended' || !this.loaded || !this.session()) return false;
    if (this.unsettled() || this.holds.size > 0 || this.pend || this.freshOwed || this.gating.size > 0 || this.dismissing.size > 0) return false;
    if (this.attempts.size > 0) return false;
    // A Stop the person pressed is read to its end (its receipt polls): the engine's own work, so `off` never gates it.
    if (C.current(this.conv)?.s.stopping) return false;
    // Words and files only this engine holds stay with it: a message the person can still edit or retry (not sent, refused),
    // and the draft's files (attached, or still being read). A hand-off would drop them with the New-conversation note.
    if (this.att.items.length > 0 || this.attReads.size > 0) return false;
    return !Object.values(this.conv.users).some((u) => u.state === 'sending' || u.state === 'unknown' || u.state === 'queued'
      || ((u.state === 'notSent' || u.state === 'refused' || u.state === 'superseded') && (u.text !== '' || (u.imgs?.length ?? 0) > 0 || (u.files?.length ?? 0) > 0)));
  }
  /** Lets the open conversation go to its reference: only the dock's engine, only at a quiet point. It ends its stream and
   *  its lease and starts blank; the conversation stays in Recent and keeps running on the agent. The draft's files go with a
   *  note (as New conversation). Whether it let go. */
  letGo(): boolean {
    if (this.pinSid || !this.quiet()) return false;
    this.newConversation();
    return true;
  }
  /** A prefill (Schedules): the next message goes to a new conversation; send() refuses until it is made. */
  wantFresh(): void {
    if (this.pinSid) return;
    this.freshOwed = true;
    this.pumpStart();
    // Held behind an unknown first message: nothing else publishes, and Send's snapshot (freshHeld) must say so now.
    if (this.holdsUnknownCreate()) this.publish();
  }
  /** Whether a new conversation is owed and not made yet. */
  owesFresh(): boolean { return this.freshOwed; }
  /** An untouched prefill taken back: the new conversation only it asked for is no longer owed. One already
   *  made stays (it is the conversation shown). */
  releaseFresh(): void {
    const was = this.freshOwed;
    this.freshOwed = false;
    if (was && this.holdsUnknownCreate()) this.publish();   // the snapshot's freshHeld goes with it
  }
  /** A start (Home's quick ask): the text is sent as the first message of a new conversation once it can be, and
   *  `tell` hears how it went (unknown first, possibly sent later). One at a time: a second one while the first is
   *  still unsent is refused at once ('notSent'). */
  queueStart(text: string, tell: StartTell, opts?: L.CreateOpts, askFirst?: boolean): void {
    if (this.pinSid) { tell('notSent', null); return; }
    if (this.pend && !this.pend.uid) { tell('notSent', null); return; }
    // An earlier start still watched: its watch ends here, as far as it is known (it may have gone through).
    if (this.pend) this.endStart('unknown');
    this.pend = { text: text.trim(), tell, uid: null, told: null, ...(opts ? { opts } : {}), ...(askFirst ? { askFirst: true as const } : {}) };
    this.pumpStart();
  }
  // ---- a start's key, read by the start provider (ask/active.ts starter) ----
  /** The row of the start this engine is sending (its first message), or null: none queued, or not sent yet. */
  startRow(): string | null { return this.pend?.uid ?? null; }
  /** The computer's handle this engine files its journal under (a chat reference names the computer by it). */
  handle(): string { return this.jr?.handle ?? ''; }
  /** The create key of first-message row `uid`, once its record was made (before that nothing can have left); else null. */
  createKeyOf(uid: string): string | null { return this.rowKey.get(uid) ?? null; }
  /** The session the create under key `k1` made, when this engine holds that chat and its session is proven; else null. */
  sessionOfKey(k1: string): string | null { return this.rec && this.rec.k1 === k1 ? this.rec.s || null : null; }
  /** A first-message row's state and reason as shown now, or null when this engine no longer shows the row. */
  rowState(uid: string): { state: C.UserMsg['state']; reason: string | null } | null {
    const u = this.conv.users[uid];
    return u ? { state: u.state, reason: u.reason || null } : null;
  }
  /** Whether the journal still holds a request under key `k` on this computer: true, false, or null when it cannot be read or another
   *  account is shown. */
  keyHeld(k: string): boolean | null {
    if (!this.jr) return null;
    const sc = this.jr.j.scan(this.jr.handle);
    // Only this engine's own account can say: the journal shows another account's box while that account is shown.
    return sc.s === 'ok' && sc.acct === this.slot.account && currentAccount() === this.slot.account ? sc.entries.some((x) => x.k === k) : null;
  }
  /** The newest chat create of this slot that the journal still holds with no session proven: a start that may have gone through
   *  (a reload while it was in flight, a create the dock made). Its entry is a create of this computer and realm; its record, found by
   *  create key wherever it is now, names no session, no fork (a fork's create belongs to its target) and this project, or there is none.
   *  Keys in `skip` (the caller is done with them) are passed over, so an older create behind them is still found. Null without a
   *  journal, while another account is shown, or when the journal or its records cannot be read. The engine's own front record is not
   *  asked: the dock may show another conversation while a start's create is known only to the journal. */
  unprovenCreate(skip?: ReadonlySet<string>): string | null {
    if (!this.jr || currentAccount() !== this.slot.account) return null;
    const sc = this.jr.j.scan(this.jr.handle);
    if (sc.s !== 'ok' || sc.acct !== this.slot.account) return null;
    let best: { k: string; at: number } | null = null;
    for (const x of sc.entries) {
      if (x.kind !== 'create' || x.s !== null || x.r !== this.slot.realm || x.ct !== this.slot.computer || skip?.has(x.k)) continue;
      // A record that moved to its proven session is found too; records that cannot be read say nothing about project or fork.
      const at = this.jr.j.lookupK1(this.jr.handle, x.r, x.k, this.slot.account);
      if (at.t === 'unreadable') return null;
      if (at.t === 'found' && (at.rec.s || at.rec.fk || at.rec.p !== this.slot.project)) continue;
      if (!best || x.at > best.at) best = { k: x.k, at: x.at };
    }
    return best ? best.k : null;
  }
  /** A create key this engine no longer shows, recovered by key. While the journal holds its entry: the journal's check (a read, then
   *  a retire only after a miss, under the send lock). Once the entry is gone: a read by key only (checkCreate; a fenced key is still
   *  proved notAdmitted). Never sends it again. A settled create names its session; anything not proven is `unknown`. */
  async checkKey(k: string, alive?: () => boolean): Promise<{ t: Verdict['t']; sid?: string }> {
    // Never read in another account's name: while another account is shown nothing can be proved about this engine's key.
    if (!this.jr || currentAccount() !== this.slot.account) return { t: 'unknown' };
    const held = this.keyHeld(k);
    if (held === null) return { t: 'unknown' };
    try {
      const c = held ? await this.jr.j.check(this.io, this.jr.handle, k, alive) : await this.jr.j.checkCreate(this.io, this.jr.handle, this.slot.realm, k, alive);
      return c.v.t === 'settled' && c.v.sid ? { t: 'settled', sid: c.v.sid } : { t: c.v.t };
    } catch { return { t: 'unknown' }; }
  }
  /** The conversation an askFirst start set the wish aside for is over (or never began): the wish comes back. */
  private endAside(): void {
    if (this.autoAside === null) return;
    this.wantAuto = this.autoAside;
    this.autoAside = null;
  }
  private freshNow(): void {
    this.freshOwed = false;
    this.endAside();
    if (!this.hasConversation()) return;
    // As New conversation, except the person's own Approve automatically choice carries over; the first send arms it
    // through the normal guard (an On only seen from another client is not the person's and is not carried).
    const want = this.wantAuto;
    this.newConversation(true);
    this.wantAuto = want;
  }
  private endStart(o: StartOutcome): void {
    const p = this.pend;
    this.pend = null;
    if (p && p.told !== o) { try { p.tell(o, p.uid); } catch { /* the page's own */ } }
  }
  private pumpStart(): void {
    if (this.pumping || (!this.pend && !this.freshOwed)) return;
    this.pumping = true;
    try {
      const ph = this.phaseNow, k = this.bandNow?.k;
      if (ph === 'ended') return this.endStart(this.pend?.uid ? 'unknown' : 'notSent');
      const gone = ph === 'blocked' && this.blockedNow?.key === 'ask.gone';
      // A new conversation is made only once the stored one is picked up (else it would come back over it) and
      // nothing of the open one is still on its way; a failed or stopped start keeps it owed (Try again, Start).
      const settled = ((ph === 'ready' && this.loaded && k !== 'unreachable' && k !== 'stopped') || gone) && !this.unsettled();
      // Never under a start being watched: its conversation is the one shown, and resetting it would lose it from
      // view (and its outcome with it). A prefill owed after that start is made once the start is settled.
      if (this.freshOwed && settled && !this.pend?.uid) this.freshNow();
      const p = this.pend;
      if (!p) return;
      if (!p.uid) {
        // The computer is stopped, or the agent did not answer (polling a start ran out too): nothing goes now.
        if (ph === 'blocked' && !gone) return this.endStart('notSent');
        if ((k === 'unreachable' || k === 'stopped') && !this.startingNow) return this.endStart('notSent');
        // Nothing goes over a first message that may exist (its Check lives only in this conversation): the start ends not sent, its text kept.
        if (this.holdsUnknownCreate()) return this.endStart('notSent');
        if (!settled) return;   // checking, starting, provisioning, or something of the open one still in flight
        if (!this.canSend() || L.checkText(p.text)) return this.endStart('notSent');
        this.freshNow();
        if (p.askFirst) { this.autoAside = this.wantAuto; this.wantAuto = false; }
        // A start's explicit choices are what its create is made with; send() reaches create() synchronously or not at all.
        this.nextOpts = p.opts ?? null;
        // An empty carry: a start sends its own text only, never the dock's draft files (the draft is the place's, not the start's).
        const went = this.send(p.text, false, {});
        this.nextOpts = null;
        if (!went) { this.endAside(); return this.endStart('notSent'); }
        p.uid = Object.keys(this.conv.users)[0] ?? null;
        if (!p.uid) return this.endStart('unknown');
        return;
      }
      const st = this.conv.users[p.uid]?.state;
      if (st === 'sending') return;
      if (st === 'sent' || st === 'queued') return this.endStart('sent');
      // A refusal that cannot prove nothing ran (a reused key after a lost create) stays unknown (C9).
      if (st === 'refused' && this.maybe.has(p.uid)) return this.endStart('unknown');
      if (st === 'notSent' || st === 'refused' || st === 'superseded') return this.endStart('notSent');
      if (st === 'unknown') { if (p.told !== 'unknown') { p.told = 'unknown'; try { p.tell('unknown', p.uid); } catch { /* the page's own */ } } return; }
      // No longer shown here (another conversation opened): it may have gone through (C9).
      return this.endStart('unknown');
    } finally {
      this.pumping = false;
    }
  }
  /** Recent: this computer's conversations (references from the store, titles from the agent). `from`: the rows to show instead of a fresh
   *  store read (Clear's verification, which displays what it read through the dock's overlay). Every call takes a fresh read generation:
   *  only the newest read's titles are published. */
  loadRecent(from?: readonly AskRecord[]): void {
    const g = this.gen;
    const rg = ++this.recentGen;
    const recs = from ?? C.convsFor(this.store.read(this.slot.account), this.slot.account, this.slotKey());
    const cur = this.rec?.k1;
    this.recent = recs.map((r) => ({ k1: r.k1, title: '', at: r.at, ph: C.recentPhase(r), current: r.k1 === cur }));
    this.publish();
    if (!this.realm) return;
    void settle(this.io.sessions(this.realm)).then((r) => {
      if (!this.live(g) || this.recentGen !== rg) return;
      const items = r.ok && L.isObj(r.b) && Array.isArray(r.b.items) ? (r.b.items as unknown[]).filter(L.isObj) : [];
      const by = new Map(items.map((x) => [String(x.id), x]));
      this.recent = recs.map((rec) => {
        const row = rec.s ? by.get(rec.s) : undefined;
        const first = row && typeof row.first_message === 'string' ? row.first_message : '';
        const last = row && typeof row.last_request_at === 'string' ? Date.parse(row.last_request_at) : NaN;
        return { k1: rec.k1, title: first ? C.titleOf(first) : '', at: Number.isFinite(last) ? last : rec.at, ph: C.recentPhase(rec), current: rec.k1 === cur };
      });
      this.publish();
    });
  }
  /** Opens a stored conversation here. False when it did not: this engine is pinned, the conversation is unknown, or another
   *  engine holds it (it is open at its reference; this engine never holds a second copy). */
  openConversation(k1: string): boolean {
    if (this.pinSid) return false;
    const rec = C.convsFor(this.store.read(this.slot.account), this.slot.account, this.slotKey()).find((r) => r.k1 === k1);
    if (!rec) return false;
    if (rec.s && this.held?.(rec.s)) return false;
    // The person picked a conversation: a new one a page's prefill owed is no longer wanted.
    this.freshOwed = false;
    const seq = ++this.selSeq;
    // The save that moves it to the front may answer later (the dock lock): the selection never depends on it. Its completion acts only
    // for the pick and generation it was sent in, and re-reads Recent from the store (the overlay, or the stored order if it was refused).
    const moveFront = (): void => {
      const g = this.gen;
      const done = (): void => { if (this.selSeq === seq && this.gen === g && this.phaseNow !== 'ended') this.loadRecent(); };
      void Promise.resolve(this.storeOp({ k: 'put', rec, front: true })).then(done, done);
    };
    // Still loading: it is the slot's current one now, and loading picks it up (a reset here would abandon it).
    if (!this.loaded) { this.want = { k1, seq }; moveFront(); this.publish(); return true; }
    this.reset();
    this.freshSession();
    this.conn = { lost: false, reconnecting: false };
    // Another session: what the chip knew belonged to the one before, and so did an On choice; this one's mode is
    // read again.
    this.auto = { ...this.auto, on: null, busy: false, err: '', errE: undefined, note: '' };
    this.autoSid = null;
    this.wantAuto = false;
    moveFront();
    this.reopen(this.gen, rec);
    return true;
  }

  // ---- Clear list (recentClear.ts) ----
  /** Whether Clear can be offered here: a journaled dock engine over the shared dock store, in a browser that can take the dock lock. */
  clearSupport(): 'ok' | 'noLocks' | 'no' {
    if (!this.jr || this.pinSid || !this.store.apply) return 'no';
    return dockLockAvailable() ? 'ok' : 'noLocks';
  }
  /** Which of the registry's engines hold a session (all of this account and computer, dock or pinned, lent or not). */
  inUse: ((sid: string) => boolean) | null = null;
  /** Told by the registry after a Clear (any result): the engines of the account retry their owed dock saves. */
  onClearDone: (() => void) | null = null;
  private clearEnv(): ClearEnv | null {
    const jr = this.jr;
    if (!jr || this.pinSid || !this.inUse) return null;
    return { account: this.slot.account, handle: jr.handle, slot: this.slotKey(), current: this.rec?.k1, j: jr.j, read: () => this.store.read(this.slot.account), inUse: this.inUse };
  }
  /** How many references pass checks 0-5 right now (no server read): 0 disables Clear up front with its reason; -1: Clear is not available. */
  clearCandidatesNow(): number {
    const env = this.clearEnv();
    return env && this.clearSupport() === 'ok' ? clearCandidates(env).length : -1;
  }
  /** Whether a plan still belongs to what is shown: the same engine generation, account and slot. A plan that does not is dropped. */
  planLive(plan: ClearPlan): boolean {
    return this.gen === plan.gen && this.phaseNow !== 'ended' && this.slot.account === plan.account && currentAccount() === plan.account;
  }
  /** The plan: checks 0-5 on a fresh store read, then a read of each survivor's own state (check 6). Null: Clear is not available or the
   *  plan was dropped while it read (the account, slot or generation moved). Zero keys: nothing can be cleared now. */
  async planClear(): Promise<ClearPlan | null> {
    const env = this.clearEnv();
    if (!env || this.clearSupport() !== 'ok') return null;
    const g = this.gen;
    const same = (): boolean => this.gen === g && this.phaseNow !== 'ended' && currentAccount() === env.account && this.io.alive();
    const keys = await idleKeys(this.io, clearCandidates(env), same);
    if (!same()) return null;
    return { account: env.account, slot: env.slot, gen: g, keys };
  }
  /** Confirm: check 6 again for the plan's keys, then ONE removal under the dock lock from the fresh stored list. Every uncertain outcome
   *  is read back once (verifyClear), never assumed. Publishes Recent from a fresh read afterwards. */
  async clearRecent(plan: ClearPlan, live: () => boolean = () => true): Promise<ClearOutcome> {
    const env = this.clearEnv();
    const g = plan.gen;
    // `live` is the panel's: false once the popover that asked has closed (the plan is dropped and nothing more is written).
    const same = (): boolean => live() && this.gen === g && this.phaseNow !== 'ended' && currentAccount() === plan.account && this.slot.account === plan.account && this.io.alive();
    if (!env || !same() || this.clearSupport() !== 'ok') return { t: 'stale' };
    const keys = await idleKeys(this.io, plan.keys, same);
    if (!same()) return { t: 'stale' };
    if (!keys.length) return { t: 'same' };
    let out: ClearOutcome;
    try {
      // Under the dock lock the plan is judged once more: a lock that was held while the engine reset or ended, or the popover closed,
      // must not let the old plan write.
      const r = await env.j.dockRemove(plan.account, keys, (rec) => same() && stillClearable(env, rec));
      if (r.t === 'ok') out = { t: 'done', removed: r.removed.length };
      else if (r.t === 'failed') out = this.verifyKeys(plan.account, keys);
      else if (r.t === 'account_changed') out = { t: 'account' };
      else if (r.t === 'same' && !same()) out = { t: 'stale' };
      else out = { t: r.t };
    } catch { out = this.verifyKeys(plan.account, keys); }
    if (out.t === 'done' || out.t === 'same') { this.loadRecent(); }
    try { this.onClearDone?.(); } catch { /* the registry's own */ }
    return out;
  }
  /** Check again after an unconfirmed write: the same verification read, never a write. */
  verifyClear(plan: ClearPlan): ClearOutcome {
    if (this.gen !== plan.gen || this.phaseNow === 'ended' || this.slot.account !== plan.account) return { t: 'stale' };
    return this.verifyKeys(plan.account, plan.keys);
  }
  private verifyKeys(account: string, keys: readonly ClearKey[]): ClearOutcome {
    const jr = this.jr;
    if (!jr) return { t: 'unconfirmed', keys };
    const { out, base } = judgeVerification(account, keys, legacyRead());
    if (base) this.loadRecent(C.convsFor(jr.j.dockRead(account, base), account, this.slotKey()));
    return out;
  }

  // ---- for tests and the panel ----
  get realmUsed(): string { return this.realm; }
  get record(): AskRecord | null { return this.rec ? { ...this.rec } : null; }
  /** Every unsettled row of a journaled engine can be checked (a read by its key); one without a journal only by an id it holds. */
  get journaled(): boolean { return this.jr !== null; }
}

/** What an answered question's decided line adds after its question: the listed option sent, or `typed` (the person's own words,
 *  never kept), and how many further questions the card asked. */
type Said = Pick<C.Decided, 'answer' | 'typed' | 'more'>;
/** The decided line of an answered question: its question's first line and what was answered. An answer that is one of the
 *  question's listed options is named; anything else was typed by the person and is never kept here (it may hold a secret). */
export function answeredLine(g: Gate, value: string | Record<string, string>): { text: string; said: Said } {
  const qs = g.questions?.length ? g.questions : [{ id: '', question: g.question ?? '', options: g.options ?? [] }];
  const q = qs[0] as { id: string; question: string; options: string[] };
  const v = typeof value === 'string' ? value : Object.prototype.hasOwnProperty.call(value, q.id) ? value[q.id] : undefined;
  const said: Said = typeof v === 'string' && q.options.includes(v) ? { answer: v } : { typed: true };
  if (qs.length > 1) said.more = qs.length - 1;
  return { text: (q.question.split('\n').find((x) => x.trim()) ?? '').trim(), said };
}

/** One line for a decided card: the command, the path, or the tool. */
export function gateLine(g: Gate): string {
  const p = L.isObj(g.params) ? g.params : {};
  if (typeof p.command === 'string') return p.command.split('\n')[0] as string;
  for (const k of ['path', 'file_path']) if (typeof p[k] === 'string') return p[k] as string;
  return g.tool ?? '';
}
