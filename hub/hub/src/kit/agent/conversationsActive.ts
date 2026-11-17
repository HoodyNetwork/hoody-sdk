// conversationsActive.ts: how a page reaches an ACTIVE conversation source (one that can send, stop, decide, answer and
// check) without importing ask/. The twin of conversations.ts: the same contract (a source for exactly that conversation, one
// hold per open, `release()` once, holders of one reference share the provider's engine), but the source is an ActiveSource,
// which exists only through `activateSource`: every action on it is checked with `can()` when it is called, so a
// surface that holds one still cannot send around the prerequisites (journal, recovery, attachment lease, approver lease).
// A page that only reads keeps using `useConversation`. Engine-free: nothing here imports ask/.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useCore } from '@core';
import type { ShownComputer } from './conversations';
import { convKey, type ActiveSource, type ConvRef } from './source';

export interface HeldActive { source: ActiveSource; release(): void }
export interface ActiveConversationProvider {
  open(account: string, ref: ConvRef, at: ShownComputer | null): HeldActive | null;
  /** The starts of new chats in one place. Absent on a provider that cannot start chats. */
  starter?(account: string, at: StartAt): Starter | null;
}

/** What a new chat starts with: the provider turns it into the explicit create body. */
export interface StartOpts {
  /** The agent's name (Just chat is `chat`). */
  agent: string;
  /** Hoody models: the provider/model spec the chat runs. Absent when Claude Code runs it. */
  model?: string;
  /** Claude Code runs the chat: its model spec, or '' for Claude Code's own default. */
  claude?: { model: string };
  /** An absolute folder on the computer; absent: the home folder. */
  cwd?: string;
  /** Strict approvals; false: Default. */
  strict: boolean;
  /** Leaves Approve automatically Off for this start only (New workflow's start, so its save card shows). The person can turn it On
   *  in the Agent panel (the chat page has no switch); the next start gets the choice from before this one back, not the default. */
  askFirst?: true;
  /** The kind of page that made the start: absent or '' is New chat's. useStarter sets it for any other kind (a caller's own is replaced). */
  from?: string;
}
/** Where a start goes: the computer the page shows, and one realm (never All realms). */
export interface StartAt { computer: ShownComputer; realm: string }
/** A start's phase (C9). `opened` is the only phase a page may navigate on: it exists once the agent proved the session (the
 *  create's answer, or a read by its key). `waiting`: an earlier send of this computer's conversation is still on its way, so
 *  nothing has left. `starting`: the create may be on its way. `unknown`: a chat may have been made; never shown as made or as not
 *  sent. `notSent`: the agent definitely made nothing (`why` in the host's words). `unknown` with `taken`: an unproven create of the
 *  place this page did not start (a reload while it was in flight, or the dock's own), taken up from what the journal holds; its
 *  text was never stored, so the page cannot show it. */
export type StartPhase =
  | { k: 'none' }
  | { k: 'waiting' }
  | { k: 'starting' }
  /** `from`: the kind of page that made the start (StartOpts.from); absent for an unproven create taken up from the journal. */
  | { k: 'opened'; ref: ConvRef; from?: string }
  | { k: 'notSent'; why: string }
  | { k: 'unknown'; taken?: true };
/** Whether a start may leave now: the activation prerequisites (journal, recovery, leases), or the one that is missing, in words. */
export type StartDoor = { ok: true } | { ok: false; why: string };
/** What a start made here now does about approvals before its first message goes, for a chat that is not Strict: `on`: every action
 *  in the new chat runs without asking (the chat's Allow everything, switched on first); `off`: it is confirmed off first, so the chat
 *  asks; `none`: the agent here has no such switch; `unknown`: not known yet (the agent has not answered). A Strict chat asks every
 *  time whatever this says. A page shows it before Send; it is a read and changes nothing a start does. */
export type StartAuto = 'on' | 'off' | 'none' | 'unknown';
/** `auto` absent (a provider that does not say): unknown. */
export interface StartState { door: StartDoor; phase: StartPhase; auto?: StartAuto }
/** The starts of new chats in one place: one account, one computer, one realm. The contract a provider keeps (C9: an
 *  unknown start is never shown as started or failed, and a start still in flight is never claimed):
 *  - Sharing: every holder of the same account + computer + realm gets a view of the SAME start; a second mount, or a page that
 *    comes back, shows the phase of the start already there. An unproven create of the place that no start here runs (a reload
 *    while it was in flight, or one the dock made while an earlier outcome is still shown) is taken up from what the journal holds
 *    (`unknown` with `taken`, key kept, door shut), over any outcome shown; it is never shown as nothing.
 *  - Holds: `release()` drops this hold only. It never cancels, retires or loses a start in flight; the start lives in the
 *    provider until its outcome is known and settled.
 *  - Snapshots: `state()` returns the same object until the door, the phase or `auto` changes, and `state().phase` is the same object
 *    until the phase itself moves (a door-only change keeps it). Methods are callable detached (`const { state } = starter`),
 *    never relying on `this`.
 *  - `start()`: an unproven create of the place is taken up first (see Sharing: then it refuses), and the door and the busy
 *    check are judged together, at the call, before anything is queued. Busy means a start here is waiting, starting or UNRESOLVED: its key is kept and the journal has not resolved it (an unknown the person stopped
 *    tracking is no longer the provider's: see `settle`). The provider keeps this guard itself and never relies on the engine to
 *    refuse or replace a pending start.
 *  - `notSent` only on the journal's `notAdmitted` verdict (ask/journal/proof.ts `VerdictType`), never on a weaker "miss": the
 *    create never left (`unsent`), the agent refused it (`refused`), or a key retire fenced it (`{retired: true, admitted:
 *    "false"}`: `retired` / `fenced`; that answer may come from the retire itself or from a later read of a key an earlier
 *    retire already fenced).
 *  - `check()`: never sends again; it is the journal's recovery by key (ask/journal/recover.ts `check`). A read MISS proves
 *    nothing (verdict `unknown`, why `miss`: the create may still be on its way). `notAdmitted` comes only from a fence: the retire
 *    that follows a miss, taken under the send lock while nobody holds the key, or a read of a key an earlier retire fenced. A bare miss, a key held elsewhere (`heldElsewhere`), a retire
 *    that fails, is blocked, cannot be read or answers `admitted: unknown` (`retiredUnknown` / `admittedUnknown`), and every other
 *    `unknown` verdict leave the phase `unknown` with the key kept, so an unknown never reads as not sent.
 *  - `opened`: the session is proven (the create's answer, or a read by its key naming the session). A proven session identity
 *    beats every first-message outcome: when the engine reports the first message `notSent` or `unknown` after the session
 *    exists, the phase is still `opened` (the chat page shows that message in its own C9 states). It is never `notSent`.
 *  - `settle(shown)`: identity-checked; it frees only the phase object passed, if that is still the current one. Settling an
 *    `unknown` (Stop tracking) ends the start here: the door opens and `check()` has nothing to read, while the journal keeps the
 *    key untouched (no read, no retire; whoever else shows it can still check it). The provider never takes that key up again on
 *    this page. It is the person's choice to give up on the unknown: a next start may make a second chat, so the page says where
 *    the first one shows if it was made. A start still shown lets its key go only on a verdict: `opened` (admitted, session proven) or `notAdmitted`. */
export interface Starter {
  /** The same object until the door or the phase changes (a store snapshot). */
  state(): StartState;
  subscribe(fn: () => void): () => void;
  /** Starts a chat with `text` as its first message. False (nothing sent) unless the door is open and no start here is waiting,
   *  starting or unknown; checked when it is called, atomically with queueing it. */
  start(text: string, o: StartOpts): boolean;
  /** An unknown start: the journal's recovery by its key (read, then a retire only after a miss). `notSent` only on a
   *  `notAdmitted` verdict; a bare miss and a failed, blocked or unreadable retire stay `unknown` with the key kept. Never sends
   *  it again. */
  check(): void;
  /** The page took the outcome it SHOWS: `opened` (it went to the chat), `notSent`, or an `unknown` the person stops tracking
   *  (the start ends here and the door opens; the journal keeps the key). `shown` is that phase object from
   *  state(); a phase that is no longer current (another start, a reopened screen) is left alone and the answer is false.
   *  Nothing is sent. */
  settle(shown: StartPhase): boolean;
  /** Drops this hold only; the start itself is untouched. */
  release(): void;
}

let provider: ActiveConversationProvider | null = null;
const subs = new Set<() => void>();
/** Registers (or, with null, removes) the provider; holders open again on the new one. */
export function provideActiveConversations(p: ActiveConversationProvider | null): void {
  provider = p;
  for (const f of [...subs]) f();
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const current = () => provider;

/** The active source of `ref` while the component is mounted, or null (no provider, no account, or the computer is not named).
 *  It opens again when the reference, the shown computer, the account or the provider changes, releasing the old hold. */
export function useActiveConversation(ref: ConvRef | null, at: ShownComputer | null): ActiveSource | null {
  return useActiveConversationHold(ref, at).source;
}

/** `useActiveConversation`, plus `opening` (as useConversationHold): a hold is about to be made for the current identity (a
 *  provider, an account and a reference exist, and the provider has not answered for this identity yet). Never opening with a
 *  source; a provider that answered no source (or threw) ends it. */
export function useActiveConversationHold(ref: ConvRef | null, at: ShownComputer | null): { source: ActiveSource | null; opening: boolean } {
  const core = useCore();
  const account = core.account ?? '';
  const p = useSyncExternalStore(subscribe, current, current);
  const key = ref ? convKey(ref) : '';
  // The server is NOT part of the hold's identity: letting the hold go would end a conversation's engine with a send on its way.
  const atKey = at ? `${at.project}|${at.id}|${at.name}` : '';
  // `source` null: the provider answered for this identity with no source (it can't be named).
  const [held, setHeld] = useState<{ p: ActiveConversationProvider; k: string; source: ActiveSource | null } | null>(null);
  /** The server the held entry was last opened with ('' = none). */
  const opened = useRef('');
  // The core generation is part of the identity (as in useConversation): a realm switch or account change ends the engines made
  // for the old context, so the same reference opens again under the new one.
  const want = `${core.gen}|${account}|${key}|${atKey}`;
  useEffect(() => {
    if (!p || !ref || !account) { setHeld(null); return; }
    let h: HeldActive | null = null;
    try { h = p.open(account, ref, at); } catch { h = null; }
    opened.current = at?.server ?? '';
    setHeld({ p, k: want, source: h ? h.source : null });
    return () => { h?.release(); };
    // `want` names every input (generation, account, reference, shown computer); the objects themselves may be rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, want]);
  // A server that becomes known (or changes) reaches the held entry in place: one more open with it, let go at once (the registry moves
  // the entry's engine once nothing of it is on its way). A server no longer known lets nothing go and is never filled from a cache.
  const server = at?.server ?? '';
  useEffect(() => {
    if (!held || !held.source || held.k !== want || !server || server === opened.current || !p || !ref || !account) return;
    opened.current = server;
    let h: HeldActive | null = null;
    try { h = p.open(account, ref, at); } catch { h = null; }
    h?.release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held, server]);
  // A hold for an earlier identity is never shown for a new one, even for the render before the effect runs. A new provider for
  // the same identity keeps showing the held source until its own answer replaces it (as before: no render without a source).
  const same = held !== null && held.k === want;
  const source = same ? held.source : null;
  // Opening: no source shown, and this provider has not answered for this identity yet.
  return { source, opening: !source && !(same && held.p === p) && !!p && !!ref && !!account };
}

const NO_STATE: StartState = Object.freeze({ door: Object.freeze({ ok: false, why: '' }), phase: Object.freeze({ k: 'none' }) }) as StartState;
const noSub = () => () => {};
/** The starter of `at` while the component is mounted, and its state. The start itself is the provider's: it outlives the page, so
 *  leaving New chat never cancels it, and coming back shows where it is. Null starter: no provider, no account, no starts here.
 *  `from` names the kind of page ('' New chat, 'workflow' New workflow's drawer). Its starts carry it (New chat's go as given), and a
 *  start another kind of page made shows here as `none` once it is `opened`, so only a page of its own kind goes to its chat (one taken
 *  up from the journal has no kind and shows everywhere). Except a start this mount showed unresolved (waiting, starting, unknown): the
 *  person watched it here, or pressed Check again here, so its `opened` shows here too, whichever kind made it. The door and every
 *  other phase are the place's, shown to every page: one start at a time per place. */
export function useStarter(at: StartAt | null, from = ''): { starter: Starter | null; state: StartState } {
  const account = useCore().account ?? '';
  const p = useSyncExternalStore(subscribe, current, current);
  // The server is part of the place: a start made before it was known reaches no agent, so it opens again once it is known (or names
  // another). A row that withholds it keeps the hold on the server last named for the same place, as the dock keeps its engine (core
  // refuses every new request while the row withholds it: core/routing.ts), so withheld then named again neither lets the start go nor
  // takes it again. Only this mounted hold keeps it: a New chat mounted while the row withholds the server names none (no cached host).
  const place = at ? `${account}|${at.computer.project}|${at.computer.id}|${at.computer.name}|${at.realm}` : '';
  const named = at?.computer.server ?? '';
  const [kept, setKept] = useState({ place, server: named });
  let server = kept.server;
  if (kept.place !== place || (named && named !== kept.server)) { server = named; setKept({ place, server: named }); }
  const want = at ? `${place}|${server}` : '';
  const [held, setHeld] = useState<{ k: string; p: ActiveConversationProvider; s: Starter } | null>(null);
  useEffect(() => {
    if (!p || !at || !account || typeof p.starter !== 'function') { setHeld(null); return; }
    let s: Starter | null = null;
    try { s = p.starter(account, at); } catch { s = null; }
    setHeld(s ? { k: want, p, s } : null);
    return () => { s?.release(); };
    // `want` names every input; the objects themselves may be rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, want]);
  // A starter of an earlier place or of a replaced/removed provider is never shown, even for the render before the effect runs.
  const own = held && held.k === want && held.p === p ? held.s : null;
  const raw = useSyncExternalStore(own ? own.subscribe : noSub, own ? own.state : () => NO_STATE, own ? own.state : () => NO_STATE);
  // New chat's starts go as given, on the provider's own starter. Another kind of page gets a copy (detached methods, as the
  // provider's) whose starts carry its kind.
  const starter = useMemo<Starter | null>(() => (own && from ? { ...own, start: (text: string, o: StartOpts) => own.start(text, { ...o, from }) } : own), [own, from]);
  const ph = raw.phase;
  // Whether this mount showed this starter's start unresolved; kept through its `opened`, ended by any other phase or another starter.
  const [seen, setSeen] = useState<{ s: Starter | null; on: boolean }>({ s: null, on: false });
  const watched = ph.k === 'waiting' || ph.k === 'starting' || ph.k === 'unknown' || (ph.k === 'opened' && seen.s === own && seen.on);
  if (seen.s !== own || seen.on !== watched) setSeen({ s: own, on: watched });
  const hide = ph.k === 'opened' && ph.from !== undefined && ph.from !== from && !watched;
  const state = useMemo<StartState>(() => (hide ? { door: raw.door, phase: NO_STATE.phase, ...(raw.auto ? { auto: raw.auto } : {}) } : raw), [raw, hide]);
  return { starter, state };
}
