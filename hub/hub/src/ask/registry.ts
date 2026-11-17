// registry.ts: the Ask engines of this page, one per (account, project, computer, realm). An engine outlives the
// dock (the shell unmounts the panel when the dock closes): closing only suspends its stream, reopening resumes
// it by replay, and a running task on another computer keeps its engine, so its "needs you" still lights the
// toggle. An engine whose context is gone (sign-out, realm switch, account change) ends: at once on core's
// generation bump (onBump below), else on its next network step or the next look (engineFor), and is replaced.
//
// Fixture mode (the dev server and the shots) swaps the agent for fake.ts, whose scenario comes from the
// `askfx` query parameter; the production build defines __HUB_FIXTURES__ false and drops that branch.
import { useSyncExternalStore } from 'react';
import { hostEnv, attentionGates, clearChatNote, computerHandle, fixtureModeActive, fixtureComputer, fixtureChats, addFixtureAgent, type FixtureChatSeed, noteLeftRunning, onBump, onRouting, RANKS, routingAllows, type Level, type Rank, type Target } from '@core';
import { liveIO, readStore, withFixtureDest, type AgentIO } from './data';
import { Journal, isWatchedKey, legacyRead, type Entry } from './journal';
import { revoke } from './attachio';
import { AskEngine, UsageLedger, realClock, targetOf, type Slot, type Snapshot, type StoreIO } from './engine';
import { ForkRecovery } from './forkRecovery';
import { FakeAgent, scripts, type Beat, type FakeOptions } from './fake';
import * as C from './conv';
import { phasesOf, readActivity, type Activity } from './activity';

const engines = new Map<string, AskEngine>();
const listeners = new Set<() => void>();
const unsubs = new Map<AskEngine, () => void>();
/** The engines pinned to one conversation (openRef): they share the dock's lifecycle (context bump, storage events, waiting). */
const pinned = new Map<string, Pinned>();
/** A pinned entry. `eng` is the engine the holders see: the one pinned to the reference, or, while the dock's engine still
 *  has the conversation's send to finish, that dock engine itself (`lent`): the same conversation is never held by
 *  two engines. When the dock's engine is quiet the conversation moves to a pinned engine and `eng` changes (`swaps` are told). */
interface Pinned {
  eng: AskEngine; n: number; unsub: () => void; lent: boolean; swaps: Set<() => void>;
  /** What the pinned engine is made from (a lent entry makes it at the swap). */
  account: string; ref: ConvRef; c: Computer;
  /** Calls the lent watch off (the dock engine's subscription that waits for its quiet point). */
  off: (() => void) | null;
  /** The watch levels holders asked for (RefHandle.watch). A holder that never asked counts as stream at `dock`. */
  watches: Set<HolderWatch>;
}
interface HolderWatch { level: Level; rank: Rank }
let version = 0;

/** One decision claim at a time across this browser's tabs (the host's lock manager: web navigator.locks, terminal the
 *  session's). Read at each claim through hostEnv(), never at module load (a terminal load reads no browser global). Without
 *  one the engine claims unlocked. */
function storeLock(): StoreIO['lock'] {
  try {
    const l = hostEnv().locks;
    if (!l || typeof l.request !== 'function') return undefined;
    return (fn) => l.request('hoody-ask-decide', {}, () => { fn(); });
  } catch { return undefined; }
}
/** Whether core allowed each engine's server when last looked at (routingResume). */
const routed = new WeakMap<AskEngine, boolean>();
// The journal of this page: the AI tab's requests, its chats and an earlier release's evidence. The dock's records are written through
// it (evidence stripped, nothing the journal does not cover is lost), and every engine admits its sends at its door.
const journal = new Journal();
/** Details > Usage's turns for the page: an engine that replaces another, or a pinned one on the same chat, lists what it saw. */
const usage = new UsageLedger();
/** The computers this page has seen, by container id: the migration names a source row's computer by its handle. */
const handles = new Map<string, string>();
/** The page's computer directory (the shell registers it): a computer's handle and the other way round. Optional: without it
 *  the migration names computers the engines of this page have seen. */
export interface ComputerDirectory {
  resolve(handle: string): { project: string; id: string; name: string; server?: string } | null;
  handleOf(container: string): string | null;
}
let directory: ComputerDirectory | null = null;
const handleOf = (container: string): string | null => {
  let d: string | null = null;
  try { d = directory?.handleOf(container) ?? null; } catch { d = null; }
  return d ?? handles.get(container) ?? null;
};
function migrateNow(): void {
  try { journal.migrate(legacyRead(), handleOf); } catch { /* a source that cannot be read concludes nothing */ }
}
/** Registers the computer directory and copies the old evidence in again (a source that could not be read earlier is tried now). */
export function setComputerDirectory(d: ComputerDirectory | null): void { directory = d; migrateNow(); }
/** The requests this page has sent whose outcome it has not learned (the journal's entries), a computer's or all. */
export function unsettledSends(handle?: string): readonly Entry[] { return journal.pending(handle); }
/** Tells `fn` when the journal's entries change (a request settled, or one was admitted, here or in another tab). The journal
 *  publishes only what a GLOBAL scan sees change, and nothing scans on its own: while anyone listens, the page's own changes (an engine
 *  publishing) and another tab's writes (the storage event) each schedule one coalesced global scan, which publishes if the entries differ. */
let unsettledListeners = 0;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
export const UNSETTLED_SCAN_MS = 250;
function scanSoon(): void {
  if (!unsettledListeners || scanTimer !== null) return;
  scanTimer = setTimeout(() => { scanTimer = null; if (unsettledListeners) { try { journal.pending(); } catch { /* unreadable: nothing is concluded */ } } }, UNSETTLED_SCAN_MS);
}
export function subscribeUnsettled(fn: () => void): () => void {
  unsettledListeners += 1;
  const off = journal.subscribe(fn);
  listeners.add(scanSoon);
  scanSoon();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    off();
    unsettledListeners -= 1;
    if (!unsettledListeners) { listeners.delete(scanSoon); if (scanTimer !== null) { clearTimeout(scanTimer); scanTimer = null; } }
  };
}
// The dock's shared store takes ONE per-key operation at a time (no snapshot path exists), queued here so this tab's own reads see it, and run
// under the account's dock lock (every writer of hub_ask_v1 takes it): see journal.dockApplyLocked.
const store: StoreIO = { read: (account) => journal.dockRead(account, readStore(account)), apply: (account, op) => journal.dockApplyLocked(account, op), get lock() { return storeLock(); } };

function emit(): void {
  version++;
  for (const l of [...listeners]) l();
}

/** Whether an engine may be replaced for a server that became known (or changed) without losing anything: nothing of it on its way or
 *  unknown, and no draft files only it holds. A busy engine keeps the server it was made for until an open after it settles. */
function canMove(eng: AskEngine): boolean {
  const s = eng.getSnapshot();
  return !eng.inFlight() && !eng.holdsUnknownCreate() && s.att.items.length === 0 && !s.att.reading;
}
/** Whether an engine holds nothing the person wrote or is owed: nothing on its way or unknown, no conversation, no message row (one not
 *  sent or refused keeps its words and files for Edit and Retry), and no draft file. Ending it, or starting it over, loses nothing. */
function holdsNothing(eng: AskEngine): boolean {
  if (!canMove(eng) || eng.hasConversation()) return false;
  return eng.getSnapshot().conv.turns.length === 0;
}
/** The dock engines a caller asked to move to another known server while they were busy (canMove false), by slot key. Once such an
 *  engine holds nothing (holdsNothing), the dock is told (useOwedMoves) and asks again (engineFor), so the move happens then, not only
 *  at its next open. An engine left holding the person's words (a message the agent refused, a conversation) is never moved on its
 *  own: it stays on its server (core refuses its new requests there) until the person starts over. */
const owedMoves = new Map<string, AskEngine>();
let moveRev = 0;
const moveListeners = new Set<() => void>();
function owedMoveReady(k: string, eng: AskEngine): void {
  if (owedMoves.get(k) !== eng || !holdsNothing(eng)) return;
  owedMoves.delete(k);
  moveRev++;
  for (const l of [...moveListeners]) l();
}
const subscribeMoves = (l: () => void) => { moveListeners.add(l); return () => { moveListeners.delete(l); }; };
const moveRevNow = () => moveRev;
/** Moves each time a dock engine that a caller asked to move while busy becomes quiet: the dock's engine choice reads it again. */
export function useOwedMoves(): number { return useSyncExternalStore(subscribeMoves, moveRevNow, moveRevNow); }

export function slotKey(s: Slot): string { return [s.account, s.project, s.computer, s.realm].join('|'); }

/** The engine for a slot (made and opened on first use). */
export function engineFor(slot: Slot, target: Target): AskEngine {
  const k = slotKey(slot);
  const have = engines.get(k);
  // An engine made for another server (or before the server was known: it reaches no agent) is ended and replaced once a caller
  // knows the server, only while nothing of it is on its way (canMove). A slot with no server (the row withholds it) keeps the
  // engine, its conversation, draft files and unknown outcomes: core refuses every new request of it while the latest accepted
  // row withholds the server or names another (core/routing.ts), and the same engine goes on once the row names it again.
  // A busy engine asked for another known server keeps its server for now; the move is owed and the dock is told once it is quiet.
  const differs = !!have && !!slot.server && have.slot.server !== slot.server;
  // A move already owed (asked for while it was busy) happens only once the engine holds nothing: the dock asks again when it is told,
  // and a message refused meanwhile must not be ended with it.
  const owed = !!have && owedMoves.get(k) === have;
  const moved = differs && (owed ? holdsNothing(have!) : canMove(have!));
  if (have && !moved && have.getSnapshot().phase !== 'ended' && have.checkAlive()) {
    if (differs) owedMoves.set(k, have); else owedMoves.delete(k);
    return have;
  }
  owedMoves.delete(k);
  if (have && moved) have.end();
  if (have) drop(k, have);
  noteServer(k, slot);
  // A new engine gets a new connection (taken on the current context); the slot's activity reads share it.
  const io = ioFor(slot, target);
  keepIO(k, slot, io);
  const handle = computerHandle({ id: slot.computer, name: slot.name });
  handles.set(slot.computer, handle);
  migrateNow();
  const eng = new AskEngine(slot, io, store, realClock, { journal: { j: journal, handle }, usage });
  routed.set(eng, routingAllows(slot.computer, slot.server));
  eng.revokeUrl = revoke;
  // The dock's engine never takes up a conversation a pinned engine holds (its stored front record, a Recent row).
  eng.held = (sid) => heldPinned(slot.account, slot.computer, sid);
  // Clear list: any engine of this account and computer (dock or pinned, lent or not) holding the session keeps its reference.
  eng.inUse = (sid) => inUse(slot.account, slot.computer, sid);
  // Room a kept dock save freed, or a Clear that ran, lets another engine's owed dock save go through.
  eng.onDockKept = () => retryOthers(slot.account, eng);
  eng.onClearDone = () => retryOthers(slot.account, null);
  engines.set(k, eng);
  unsubs.set(eng, eng.subscribe(() => { if (eng.getSnapshot().phase === 'ended') drop(k, eng); else owedMoveReady(k, eng); emit(); }));
  eng.open();
  emit();
  return eng;
}
function drop(k: string, eng: AskEngine): void {
  if (engines.get(k) === eng) engines.delete(k);
  if (owedMoves.get(k) === eng) owedMoves.delete(k);
  unsubs.get(eng)?.();
  unsubs.delete(eng);
}

// A generation bump (realm switch, account change) ends every engine made for the old context right away, so an
// idle one never shows its old conversation until its next step.
onBump(() => { for (const e of [...engines.values()]) e.checkAlive(); for (const p of [...pinned.values()]) p.eng.checkAlive(); migrateNow(); });
// A computer's row names the engine's server again after withholding it (or after naming another): core refused the engine's reads
// meanwhile (core/routing.ts), so an engine those refusals left unreachable or blocked checks again on its own, as its Try Again
// does (reads only: nothing it sent or holds is sent again). Only on that transition, only while nothing of it is on its way, and
// only for an engine that holds no conversation, message row or file (open() would drop them).
function routingResume(): void {
  for (const eng of [...engines.values(), ...[...pinned.values()].filter((p) => !p.lent).map((p) => p.eng)]) {
    const now = routingAllows(eng.slot.computer, eng.slot.server);
    const was = routed.get(eng);
    routed.set(eng, now);
    if (was !== false || !now) continue;
    const snap = eng.getSnapshot();
    if (snap.phase === 'ended' || eng.inFlight()) continue;
    // open() starts the engine over (its conversation and message rows go): only an engine that holds none of them (nothing typed,
    // sent, attached or unknown) is restarted; any other keeps its band and its own Try Again, so nothing the person wrote is lost.
    if (!holdsNothing(eng)) continue;
    if (snap.phase === 'blocked' || snap.band?.k === 'unreachable') eng.open();
  }
}
onRouting(routingResume);
// Another tab changed the journal's stores or the old source: the old evidence is copied in again, and every engine heals (reads
// only) and wakes: nothing is written back (absence is authoritative).
// Through the host seam (web: the window 'storage' event), held until the host env resolves: nothing is read at load.
hostEnv().onExternalChange((_area, key) => {
  if (!isWatchedKey(key)) return;
  migrateNow();
  scanSoon();
  for (const eng of [...engines.values(), ...[...pinned.values()].map((p) => p.eng)]) { eng.heal(); eng.wake(); }
});

/** A conversation named by its reference: the computer's handle, the realm it is bound to and its session id. */
export interface ConvRef { computer: string; realm: string; sid: string }
export interface RefHandle {
  current(): AskEngine;
  release(): void;
  /** This holder's watch level: the engine follows the strongest of its holders' (stream > state > off), at the best
   *  rank among those that want a stream, so a passive holder never downgrades another's. Until a holder asks, it counts as
   *  stream at `dock`. */
  watch(level: Level, rank?: Rank): void;
  /** Tells `fn` when `current()` becomes another engine (the dock's engine handed the conversation over); returns its off. */
  onSwap(fn: () => void): () => void;
}

/** What the dock does with its conversation: `none` (no conversation yet), `finishing` (it has one, but a send or
 *  an unknown outcome is still the dock engine's to finish: it stays on the dock's engine, visibly, and moves when quiet), or
 *  `ref` (quiet: the conversation is shown at its reference; opening that reference makes the hand-over). */
export type Handoff = { k: 'none' } | { k: 'finishing' } | { k: 'ref'; ref: ConvRef };

/** The pinned engine (not a lent dock engine) that holds `sid` on this account's computer. */
function heldPinned(account: string, computer: string, sid: string): boolean {
  for (const p of pinned.values()) {
    if (p.lent || p.eng.pinSid !== sid || p.eng.slot.account !== account || p.eng.slot.computer !== computer) continue;
    if (p.eng.getSnapshot().phase !== 'ended') return true;
  }
  return false;
}
/** Whether any engine of this account and computer holds `sid` right now: every dock engine's current conversation and every pinned
 *  entry, lent or not (heldPinned skips lent entries, which is not enough for Clear). */
function inUse(account: string, computer: string, sid: string): boolean {
  for (const e of engines.values()) {
    if (e.slot.account === account && e.slot.computer === computer && e.getSnapshot().phase !== 'ended' && e.session() === sid) return true;
  }
  for (const p of pinned.values()) {
    if (p.account !== account || p.c.id !== computer || p.ref.sid !== sid) continue;
    if (p.eng.getSnapshot().phase !== 'ended') return true;
  }
  return false;
}
/** Tells the dock engines of the account (but `except`) to send the dock save they owe, if any. Nothing loops: a retry refused again triggers nothing. */
function retryOthers(account: string, except: AskEngine | null): void {
  for (const e of [...engines.values()]) if (e !== except && e.slot.account === account) e.retryDock();
}
/** The dock's engine of this account and computer that holds `sid` now. */
function dockHolding(account: string, computer: string, sid: string): AskEngine | null {
  for (const e of engines.values()) if (e.slot.account === account && e.slot.computer === computer && e.getSnapshot().phase !== 'ended' && e.session() === sid) return e;
  return null;
}
/** The slot's dock engine, if one exists (never makes one). */
export function dockHandoff(slot: Slot): Handoff {
  const e = engines.get(slotKey(slot));
  if (!e || e.getSnapshot().phase === 'ended' || !e.hasConversation()) return { k: 'none' };
  const sid = e.session(), r = e.record?.r;
  if (!sid || !r || !e.quiet()) return { k: 'finishing' };
  return { k: 'ref', ref: { computer: computerHandle({ id: slot.computer, name: slot.name }), realm: r, sid } };
}
/** Re-renders with the dock's hand-off state. */
export function useDockHandoff(slot: Slot): Handoff {
  useEnginesVersion();
  return dockHandoff(slot);
}
/** The engine pinned to one conversation (made on first use, shared by every holder): it is that conversation only, and its
 *  evidence is the journal's. Null when neither the directory nor `at` (the computer the page shows) names the computer:
 *  `at` counts only when its handle is the reference's, so a chat never opens on another computer. */
export function openRef(account: string, ref: ConvRef, at?: { project: string; id: string; name: string; server?: string }): RefHandle | null {
  const c = directory?.resolve(ref.computer) ?? (at && at.name && computerHandle(at) === ref.computer ? at : null);
  if (!c) return null;
  handles.set(c.id, ref.computer);
  migrateNow();
  // The chat is opened: a note that it was left running (core chat-attention) goes.
  clearChatNote(account, { computer: c.id, realm: ref.realm, sid: ref.sid });
  const k = JSON.stringify([account, ref.computer, ref.realm, ref.sid]);
  let e = pinned.get(k);
  while (e && (e.eng.getSnapshot().phase === 'ended' || !e.eng.checkAlive())) {
    // checkAlive() ends the engine, and that publishes: a listener may already have replaced this entry (a reentrant openRef). The
    // replacement is the entry then, and it is asked too (it may itself have ended meanwhile); only an entry still filed here is
    // removed. Each pass removes the entry it asked, so the loop ends at a live entry or at none.
    if (pinned.get(k) === e) { retire(e); pinned.delete(k); }
    e = pinned.get(k);
  }
  // An entry made before the server was known reaches no agent (and one made for another server the wrong one): its engine is replaced in place.
  if (e && c.server && e.c.server !== c.server) rebuildOnServer(k, e, c);
  // A new entry is born holding its opener (n = 1): a holder that opens and releases while the dock lets go (reentrantly) cannot
  // take the entry away from the opener.
  let joined = true;
  if (!e) {
    joined = false;
    // The dock's engine holds this session: the same conversation is not opened a second time. At a quiet point it lets go and
    // the conversation moves to a pinned engine, which is filed under its key BEFORE the dock lets go (the dock's publish can
    // reach a subscriber that opens this reference again: it finds the entry); otherwise the dock engine's send is still its
    // own to finish, and the holders are lent that engine until it is quiet (watchLent).
    const dock = dockHolding(account, c.id, ref.sid);
    if (dock && !dock.quiet()) {
      const lent: Pinned = { eng: dock, n: 1, unsub: dock.subscribe(() => emit()), lent: true, swaps: new Set(), account, ref, c, off: null, watches: new Set() };
      pinned.set(k, lent);
      lent.off = watchLent(k, lent);
      e = lent;
    } else {
      const eng = buildPinned(account, ref, c);
      const fresh: Pinned = { eng, n: 1, unsub: eng.subscribe(() => emit()), lent: false, swaps: new Set(), account, ref, c, off: null, watches: new Set() };
      pinned.set(k, fresh);
      e = fresh;
      dock?.letGo();
      eng.open();
    }
  }
  const mine = e;
  // A holder that joins and never asks counts as stream at `dock` (applyWatch): the demand is set again with it (a later
  // tile, or the AI tab's chat, never inherits the reduced watch of the holders before it).
  if (joined) { mine.n++; if (pinned.get(k) === mine) applyWatch(mine); }
  let done = false;
  let w: HolderWatch | null = null;
  return {
    // A lent entry settles on every read: a listener that runs before the lend's watch still gets the right engine.
    current: () => { settleLent(k, mine); return mine.eng; },
    onSwap: (fn) => { mine.swaps.add(fn); return () => { mine.swaps.delete(fn); }; },
    watch: (level, rank) => {
      if (done) return;
      if (!w) { w = { level, rank: rank ?? 'dock' }; mine.watches.add(w); } else { w.level = level; if (rank) w.rank = rank; }
      if (pinned.get(k) === mine) applyWatch(mine);
    },
    release: () => {
      if (done) return;
      done = true;
      if (w) { mine.watches.delete(w); w = null; }
      if (--mine.n > 0 || pinned.get(k) !== mine) { if (pinned.get(k) === mine) applyWatch(mine); return; }
      retire(mine);
      pinned.delete(k);
      // Let go while its turn ran (a lent dock engine's too: nobody holds this reference now): core notes it, so the AI page
      // can say "Turn ended" once it is idle.
      const snap = mine.eng.getSnapshot();
      if (snap.phase !== 'ended' && snap.status !== null) noteLeftRunning(mine.account, { computer: mine.c.id, realm: mine.ref.realm, sid: mine.ref.sid });
      // A lent dock engine is the dock's: letting the reference go never ends it.
      if (!mine.lent) mine.eng.end();
    },
  };
}

type Computer = { project: string; id: string; name: string; server?: string };
/** The engine pinned to a reference, made and not opened (the caller files it, then opens it). */
function buildPinned(account: string, ref: ConvRef, c: Computer): AskEngine {
  const slot: Slot = { account, project: c.project, computer: c.id, realm: ref.realm, name: c.name, server: c.server };
  const target = targetOf(c.project, c.id, c.server);
  const io = ioFor(slot, target);
  const eng = new AskEngine(slot, io, journal.view(ref.computer, ref.sid), realClock, { sid: ref.sid, journal: { j: journal, handle: ref.computer }, usage });
  routed.set(eng, routingAllows(slot.computer, slot.server));
  eng.revokeUrl = revoke;
  return eng;
}
/** The server of an entry's computer became known (or changed): a lent entry takes it for the pinned engine it will make at its swap; any other
 *  entry's engine (made with no server, so it could send nothing) is ended and replaced in place, the holders keeping their count
 *  and watchers and told as at a swap. */
function rebuildOnServer(k: string, e: Pinned, c: Computer): void {
  if (!c.server || e.c.server === c.server) return;
  // A busy engine keeps its server (e.c unchanged), so a later open, once it settled, moves it.
  if (!e.lent && !canMove(e.eng)) return;
  e.c = c;
  if (e.lent) return;
  try {
    e.off?.(); e.off = null;
    e.unsub();
    e.eng.end();
    const eng = buildPinned(e.account, e.ref, c);
    e.eng = eng;
    e.unsub = eng.subscribe(() => emit());
    applyWatch(e);
    eng.open();
  } finally {
    if (pinned.get(k) === e) {
      for (const f of [...e.swaps]) f();
      emit();
    }
  }
}
/** An entry leaves the registry: its subscriptions (and a lent watch) are called off. */
function retire(e: Pinned): void { e.off?.(); e.off = null; e.unsub(); }
/** The entry's watch, beside its engine subscription: the strongest level its holders ask (stream > state > off;
 *  a holder that never asked is stream at `dock`), at the best rank among the holders that want a stream. A lent entry's
 *  engine is the dock's own, which streams while the dock watches: holders never set it. */
function applyWatch(e: Pinned): void {
  if (e.lent) return;
  const unasked = e.n - e.watches.size;
  let level: Level = unasked > 0 ? 'stream' : 'off';
  let rank: Rank | null = unasked > 0 ? 'dock' : null;
  for (const x of e.watches) {
    if (x.level === 'stream') { level = 'stream'; if (!rank || RANKS.indexOf(x.rank) < RANKS.indexOf(rank)) rank = x.rank; }
    else if (x.level === 'state' && level === 'off') level = 'state';
  }
  e.eng.setWatch(level, rank ?? undefined);
}

/** A lent entry's dock engine moved on (it holds another conversation) or ended: the holders go to the right engine at once. The
 *  watch does it in the dock engine's own publish; every read through the handle (`current()`) does it too, so a listener that
 *  runs before the watch (one installed before the lend) never reads the dock's next conversation. True when the entry changed. */
function settleLent(k: string, e: Pinned): boolean {
  if (!e.lent || pinned.get(k) !== e) return false;
  const dock = e.eng;
  if (dock.getSnapshot().phase === 'ended') {
    // The context is gone: the entry goes, and the holders are told (they read the ended engine, as any pinned holder does).
    retire(e);
    pinned.delete(k);
    e.lent = false;
    for (const f of [...e.swaps]) f();
    emit();
    return true;
  }
  if (dock.session() !== e.ref.sid) { swapLent(k, e); return true; }
  return false;
}
/** The lent entry takes the pinned engine over, in place: no second entry is filed, the holders keep their count and watchers. */
function swapLent(k: string, e: Pinned): void {
  // `lent` goes false before the new engine opens, so a read through the handle during open() finds a settled entry.
  if (!e.lent) return;
  try {
    e.off?.(); e.off = null;
    e.unsub();
    const eng = buildPinned(e.account, e.ref, e.c);
    e.eng = eng;
    e.lent = false;
    e.unsub = eng.subscribe(() => emit());
    applyWatch(e);
    eng.open();
  } finally {
    // The holders are told even if open() threw (the entry already holds the new engine), but not when the last of them left
    // while it opened: nobody is left to tell.
    if (pinned.get(k) === e) {
      for (const f of [...e.swaps]) f();
      emit();
    }
  }
}
/** Waits on a lent dock engine: when it moves on or ends, the holders are settled in the same publish; when it becomes quiet
 *  (its send answered, its unknown rows settled, its content kept or gone) it lets go in a microtask (the watch runs inside the
 *  engine's own publish) and the conversation moves to the pinned engine. Returns the call-off. */
function watchLent(k: string, lent: Pinned): () => void {
  const dock = lent.eng;
  let queued = false;
  return dock.subscribe(() => {
    if (pinned.get(k) !== lent || !lent.lent) return;
    if (settleLent(k, lent) || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (pinned.get(k) !== lent || !lent.lent) return;
      if (settleLent(k, lent)) return;
      // The dock lets go; its publish reaches this watch, which settles the entry (the session is gone) before letGo returns.
      dock.letGo();
    });
  });
}

/** The recovery of the unconfirmed forks of one computer and realm (ask/forkRecovery.ts), over the page's journal and that computer's shared agent
 *  connection, with no engine. Null when neither the directory nor `at` names the computer (as openRef). */
export function forkRecoveryFor(account: string, scope: { computer: string; realm: string }, at?: { project: string; id: string; name: string; server?: string }): ForkRecovery | null {
  const c = directory?.resolve(scope.computer) ?? (at && at.name && computerHandle(at) === scope.computer ? at : null);
  if (!c) return null;
  handles.set(c.id, scope.computer);
  const slot: Slot = { account, project: c.project, computer: c.id, realm: scope.realm, name: c.name, server: c.server };
  noteServer(slotKey(slot), slot);
  const target = targetOf(c.project, c.id, c.server);
  const io = sharedIO(slotKey(slot), slot, target);
  return new ForkRecovery({ io, j: journal, handle: scope.computer, realm: scope.realm, acct: account, alive: () => true });
}

/** One read of the chat list of one computer and realm (GET /sessions), over that computer's shared agent connection, with no
 *  engine (the Board's Picker). Null when neither the directory nor `at` names the computer (as openRef). */
export function sessionsFor(account: string, scope: { computer: string; realm: string }, at?: { project: string; id: string; name: string; server?: string }): (() => Promise<unknown>) | null {
  const c = directory?.resolve(scope.computer) ?? (at && at.name && computerHandle(at) === scope.computer ? at : null);
  if (!c) return null;
  const slot: Slot = { account, project: c.project, computer: c.id, realm: scope.realm, name: c.name, server: c.server };
  const k = slotKey(slot);
  return () => { noteServer(k, slot); return sharedIO(k, slot, targetOf(c.project, c.id, c.server)).sessions(scope.realm); };
}

/** Every live engine (for the "needs you" dot). */
export function allEngines(): AskEngine[] { return [...engines.values()]; }

/** True while any conversation of the shown account waits for the person (an open card), as far as this page knows: an
 *  engine's card, a gate the shell's observer read (core chat-attention) in a chat no engine holds, or a dock record. */
export function anyWaiting(account: string | null): boolean {
  if (!account) return false;
  for (const e of [...engines.values(), ...[...pinned.values()].map((p) => p.eng)]) if (e.slot.account === account && e.getSnapshot().gate) return true;
  // A gate in a chat nobody is looking at (the AI page let it go, or it never held it): no engine of this page holds it.
  const seen = attentionGates();
  if (seen && seen.account === account && seen.gates.length) {
    const held = new Set<string>();
    for (const e of engines.values()) if (e.slot.account === account) { const sid = e.session(); if (sid) held.add(`${e.slot.computer}|${sid}`); }
    for (const p of pinned.values()) if (p.account === account) held.add(`${p.c.id}|${p.ref.sid}`);
    if (seen.gates.some((g) => !held.has(`${seen.computer}|${g.sid}`))) return true;
  }
  // Conversations with no engine on this page: the phase their record last held.
  const live = new Set([...engines.values()].map((e) => e.record?.k1).filter(Boolean));
  return C.waitingRecs(store.read(account), account).some((r) => !live.has(r.k1));
}

export function subscribeAll(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
const versionNow = () => version;
/** Re-renders when any engine changes. */
export function useEnginesVersion(): number { return useSyncExternalStore(subscribeAll, versionNow, versionNow); }

/** One engine's snapshot. */
export function useSnapshot(eng: AskEngine): Snapshot { return useSyncExternalStore(eng.subscribe, eng.getSnapshot, eng.getSnapshot); }

// ---- running conversations: the agent's own state, read per slot while someone shows it ----
interface ActSlot { value: Activity | null; ph: Readonly<Record<string, string>> | null; phKey: string; subs: Set<() => void>; timer: ReturnType<typeof setTimeout> | null; busy: boolean; again: boolean; gen: number; round: number; slot: Slot; target: Target }
const acts = new Map<string, ActSlot>();
/** How often a shown count is read again while the page is visible. */
export const ACTIVITY_EVERY_MS = 15_000;

/** The computer's conversations in the top bar's realm (All realms: every realm's), as Recent lists them, read from
 *  the shared store; Recent's phases are set from the same read. They come from the store whatever the agent answers
 *  (a failed round proves nothing about them) and are kept while nobody looks (a store read does not go stale the
 *  way the agent's word does). */
function actStoreRead(a: ActSlot) {
  const st = store.read(a.slot.account);
  const all = st && Object.prototype.hasOwnProperty.call(st.a, a.slot.account) ? (st.a[a.slot.account] ?? []) : [];
  const recs = all.filter((x) => x.p === a.slot.project && x.c === a.slot.computer && (a.slot.realm === 'all' || x.r === a.slot.realm));
  const ph = phasesOf(recs);
  const phKey = JSON.stringify(ph);
  if (phKey !== a.phKey) { a.ph = ph; a.phKey = phKey; for (const l of [...a.subs]) l(); }
  return recs;
}
function actRound(k: string): void {
  const a = acts.get(k);
  if (!a || !a.subs.size) return;
  // Every look reads the phases, also while a round is in flight (its agent read may take a /state timeout).
  const recs = actStoreRead(a);
  if (a.busy) { a.again = true; return; }
  if (a.timer) { clearTimeout(a.timer); a.timer = null; }
  if (!hostEnv().visible()) return;
  a.busy = true;
  const gen = a.gen, round = ++a.round;
  noteServer(k, a.slot);
  void readActivity(sharedIO(k, a.slot, a.target), recs).catch(() => null).then((v) => {
    // A round given up for a newer one (the slot moved to its known server) is dropped whole: the newer round owns `busy`.
    if (a.round !== round) return;
    a.busy = false;
    if (acts.get(k) !== a) return;
    if (!hostEnv().visible()) return;
    // Read for a context that has since changed: dropped, and read again for the new one.
    if (a.gen !== gen) { a.again = false; if (a.subs.size) actRound(k); return; }
    a.value = v;
    for (const l of [...a.subs]) l();
    if (a.again) { a.again = false; actRound(k); return; }
    if (a.subs.size) a.timer = setTimeout(() => actRound(k), ACTIVITY_EVERY_MS);
  });
}
/** What was read stops being shown: nobody looks (no subscriber, the page hidden), so it may be stale by the next
 *  look. A round still in flight is dropped (its generation is old); the next look shows nothing until a new round
 *  answers. */
function actForget(a: ActSlot): void {
  a.gen++;
  a.value = null;
  a.again = false;
  if (a.timer) { clearTimeout(a.timer); a.timer = null; }
  for (const l of [...a.subs]) l();
}
/** Read the slot's running conversations again now (a send, Recent opened, the tab shown again). */
export function pokeActivity(slot: Slot): void { actRound(slotKey(slot)); }
/** The slot's running conversations, or null while not known (no badge). Reads while subscribed. */
export function activitySource(slot: Slot, target: Target): { get: () => Activity | null; phases: () => Readonly<Record<string, string>> | null; subscribe: (fn: () => void) => () => void } {
  const k = slotKey(slot);
  let a = acts.get(k);
  // A slot read before the server was known (or for another server) takes the known one; a slot whose row now withholds the
  // server takes that too (core refuses its reads until a row names one again: core/routing.ts).
  // A round in flight for the old target (it may wait out a /state timeout on no host) is given up, so the next look reads the
  // new server at once instead of after it, and its late answer is never shown under the new one.
  if (a && (a.slot.server ?? '') !== (slot.server ?? '')) {
    a.slot = slot; a.target = target; a.gen++; a.round++; a.busy = false; a.again = false;
    if (a.subs.size) actRound(k);
  }
  if (!a) { a = { value: null, ph: null, phKey: '', subs: new Set(), timer: null, busy: false, again: false, gen: 0, round: 0, slot, target }; acts.set(k, a); }
  const me = a;
  return {
    get: () => me.value,
    /** Each stored conversation's Recent phase from the latest round's store read; null before the first round. */
    phases: () => me.ph,
    subscribe: (fn) => {
      me.subs.add(fn);
      if (me.subs.size === 1) actRound(k);
      return () => {
        me.subs.delete(fn);
        if (!me.subs.size) actForget(me);
      };
    },
  };
}
// Subscribed at load. A browser env with no document (a node-run test importing this module) throws there by design
// (host-env.test.ts): no page, nothing to follow, as the original `typeof document` guard had it.
try {
  hostEnv().onVisibilityChange(() => {
    const hidden = !hostEnv().visible();
    for (const [k, a] of acts) { if (hidden) actForget(a); else actRound(k); }
  });
} catch { /* no document: no visibility to follow */ }
// A new context (realm switch, account change): nothing read for the old one is shown.
// The slots stay (their pages still show them); each reads again on the new context's connection.
onBump(() => {
  ios.clear();
  ioServers.clear();
  for (const [k, a] of acts) {
    a.gen++;
    a.value = null;
    // The phases too: the old context's words are never shown under the new one (a look reads them again).
    a.ph = null;
    a.phKey = '';
    for (const l of [...a.subs]) l();
    actRound(k);
  }
});

// ---- the agent ----
// One agent connection per slot, shared by its engine and its activity reads (in fixtures, one scripted agent); the
// activity reads make one only when no engine has.
const ios = new Map<string, AgentIO>();
/** The server each shared connection was MADE for ('' = made before the server was known), set with the connection and dropped
 *  with it. A connection made with no server reaches no agent, and one made for another server reaches the wrong one: when a
 *  caller names a different known server the connection is dropped, so the next use makes it again on that server. A caller
 *  with no server keeps the connection: core refuses its requests while the row withholds the server (core/routing.ts). */
const ioServers = new Map<string, string>();
function noteServer(k: string, slot: Slot): void {
  if (!slot.server) return;
  if (ios.has(k) && ioServers.get(k) !== slot.server) { ios.delete(k); ioServers.delete(k); }
}
function keepIO(k: string, slot: Slot, io: AgentIO): void {
  ios.set(k, io);
  ioServers.set(k, slot.server ?? '');
}
function sharedIO(k: string, slot: Slot, target: Target): AgentIO {
  let io = ios.get(k);
  if (!io) { io = ioFor(slot, target); keepIO(k, slot, io); }
  return io;
}
function ioFor(slot: Slot, target: Target): AgentIO {
  if (__HUB_FIXTURES__ && fixtureModeActive()) return fakeFor(slot);
  return liveIO(target);
}

/** Fixtures: one scripted agent per slot and scenario, the slot's one fake world. Every engine of the slot (the dock's, each pinned
 *  chat's, one made again after a context bump or a server change) and its activity reads reach the same agent, so a chat the dock
 *  started is there when the chat page opens it (a pinned engine on a fresh fake would read the started chat as gone).
 *  Kept across bumps, as a real agent keeps its sessions; tests forget it with the registry. */
const fakes = new Map<string, AgentIO>();

/** The fixture scenario: the page's `?askfx=`; a terminal Hub has no address, so there it is the HUB_ASKFX variable of the
 *  process (dev and shots only, like the rest of this branch). */
function askfx(): string {
  const page = hostEnv().pageAddress;
  if (page) return new URLSearchParams(page.search).get('askfx') ?? '';
  return (typeof process !== 'undefined' && process.env?.HUB_ASKFX) || '';
}
/** Dev and shots: the scripted agent on fixtureWorld, in the scenario `?askfx=` names. */
function fakeFor(slot: Slot): AgentIO {
  const fx = askfx();
  const k = slotKey(slot) + '|' + fx;
  const had = fakes.get(k);
  if (had) return had;
  const pc = fixtureComputer(slot.computer);
  const o: FakeOptions = {
    account: slot.account, pace: 260, computerStatus: pc?.status ?? 'running',
    realms: pc ? [...pc.realm_ids] : undefined,
    // The AI page's fixture chats (pages/ai/parts/fixtures.chats.ts chatWorld ids) exist on every fixture agent, then the other
    // chats the fixture list shows on this computer, so opening one shows its transcript (and a waiting one its card); a
    // scenario may set its own.
    seed: [...scripts.seed, ...fixtureChats(slot.computer).map((c) => ({ sid: c.id, turns: [{ text: c.ask, script: seedBeats(c.script), ...(c.pictures ? { pictures: c.pictures } : {}) }] }))],
    ...scenarios()[fx],
  };
  const agentFx = new FakeAgent(o, realClock);
  addFixtureAgent(agentFx);
  const io = withFixtureDest(agentFx, slot.computer);
  fakes.set(k, io);
  return io;
}

/** A listed fixture chat's one turn. */
function seedBeats(k: FixtureChatSeed['script']): Beat[] {
  if (k === 'approval') return scripts.approval;
  if (k === 'working') return [scripts.dashboard[0] as Beat, scripts.dashboard[1] as Beat, { k: 'hold' }];
  return scripts.dashboard;
}
// Built on call, never at module load, so a production build (no fixtures) drops the fake and its scripts.
function scenarios(): Record<string, Partial<FakeOptions>> {
  const hold: Beat = { k: 'hold' };
  return {
  approval: { script: [scripts.approval] },
  // The approval with auto-approval off by the agent's policy (Strict): a new chat's first send cannot arm it, so the card shows
  // in the app (`approval` alone is auto-approved on a new chat, ask/engine AUTO_DEFAULT).
  approvalStrict: { strictApproval: true, script: [scripts.approval] },
  // Hostile agent output: terminal escapes (clear screen, cursor moves, a hyperlink and a clipboard write),
  // bidi overrides and a hand-drawn look-alike of the approval card, then a real approval. The transcript must show the
  // look-alike as inert text and the real card only in the approvals area.
  hostile: { strictApproval: true, script: [scripts.hostile] },
  lanes: { script: [scripts.lanes] },
  helper: { script: [[...scripts.helper, hold]] },
  addressing: { refLagMs: 600_000, script: [scripts.approval] },
  question: { script: [scripts.question] },
  markdown: { script: [scripts.markdown] },
  markdownEdges: { script: scripts.markdownEdges },
  streaming: { script: [[...scripts.dashboard.slice(0, 3), { k: 'text', text: (scripts.dashboard[3] as { text: string }).text.slice(0, 120) }, hold]] },
  // Recent's order: each conversation's first turn asks to approve; its second keeps running.
  order: { script: [scripts.approval, [scripts.dashboard[0] as Beat, hold]] },
  working: { script: [[scripts.dashboard[0] as Beat, scripts.dashboard[1] as Beat, { k: 'tool', name: 'edit_file', summary: '/home/ada/dash/index.html', input: { path: '/home/ada/dash/index.html' } }, hold]] },
  // Withdraw: the turn keeps running, so a follow-up stays queued; each names the agent's answer to Edit/Remove.
  wdQueued: { script: [[scripts.dashboard[0] as Beat, hold]] },
  wdTaken: { withdraw: 'taken', script: [[scripts.dashboard[0] as Beat, hold]] },
  wdLost: { withdraw: 'lost', script: [[scripts.dashboard[0] as Beat, hold]] },
  wdMissing: { withdraw: 'missing', script: [[scripts.dashboard[0] as Beat, hold]] },
  createLost: { createLost: true },
  turnLost: { turnLost: true },
  decisionLost: { decisionLost: true, decisionLag: 60_000, script: [scripts.approval] },
  busy: { busy: true },
  lost: { streamDrops: true, script: [[...scripts.dashboard.slice(0, 2), hold]] },
  unreachable: { health: 'lost' },
  forbidden: { health: 'forbidden' },
  unsupported: { caps: ['approval_policy'] },
  other: { auth: 'other' },
  login: { auth: 'login' },
  rate: { script: [[{ k: 'fail', code: 'rate_limit', retryAt: new Date(Date.now() + 4 * 60000).toISOString() }]] },
  noModel: { script: [[{ k: 'fail', code: 'no_credentials' }]] },
  failed: { script: [scripts.failed] },
  // A message with a screenshot and a log; the reply names both (the fake does not read them).
  attach: { script: [scripts.attach] },
  // A step's reason, a hook-held step, a step of unknown outcome, then a conversation too long for the model.
  stepFacts: { script: [scripts.stepFacts] },
  stopped: { computerStatus: 'stopped', health: 'lost' },
  provisioning: { computerStatus: 'creating' },
  computerFailed: { computerStatus: 'failed' },
  };
}

/** Tests: forget every engine. */
export function resetRegistryForTests(): void {
  for (const [k, e] of engines) { drop(k, e); e.end(); }
  engines.clear();
  owedMoves.clear();
  for (const [, p] of pinned) { p.unsub(); p.eng.end(); }
  pinned.clear();
  directory = null;
  handles.clear();
  unsettledListeners = 0;
  if (scanTimer !== null) { clearTimeout(scanTimer); scanTimer = null; }
  for (const a of acts.values()) if (a.timer) clearTimeout(a.timer);
  acts.clear();
  ios.clear();
  ioServers.clear();
  fakes.clear();
}
