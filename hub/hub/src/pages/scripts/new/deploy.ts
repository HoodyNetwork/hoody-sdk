// Making a New script draft live once: the reviewed snapshot's exact
// bytes, written once, with the draft reserved across tabs and reloads before anything is sent.
//
// Order of one Make it live: the verdict must hold for these very bytes (snapshot.ts) → the draft record must be open, or
// reserved with its last send known not sent (Try again, below) → the snapshot must be of the record's computer (project and
// container) and folder, and the path in that folder → the computer's clock is read (the op's sentAfter, kept with the deploy)
// → the record moves into sending by compare-and-set (only one tab wins this) → the write (or the template's instantiate) is
// sent once through the bound sends → done: the one finalizer; anything else: the reservation stays, its phase stored.
//
// No answer of a send frees a reservation (C9): neither the agent's refusal nor any not_sent,
// whoever made it, with one exception: the computer's definite refusal (failed) of a FIRST write send, whose op id is
// fresh, frees the draft back to open (records.ts releaseRefused), shown with the refusal's own words and Change address. A non-held not_sent stores didnt: shown DIDNT_DEPLOY, with Try again or Discard. Every other answer (the
// agent's refusal, a not_sent because core holds an earlier send of the change: READ_BACK_FIRST, BUSY, HELD_BY_OTHER, a lost
// answer, an account change) stores held: "This deploy may have gone through" (a refusal is shown as such), with no Try again.
// One refusal of the agent's is not held: an instantiate it refused for its own sign-in state (LOGIN_REFUSALS, answered before it
// takes the request's key) stores didnt, its words shown, with Try again under the same key once the agent is signed in.
// The only way into the sender is the stored record's compare-and-set into sending: open → deploying (beginDeploy), or didnt →
// sending (sendAgain: Try again, the same reservation, path, op id or Idempotency-Key and clock, never a second one). A record in
// sending or held refuses it, whatever an earlier answer said. The page does no recovery of its own (no hold lookup, no settle,
// no replay; core's held-change notice stays the recovery surface of the write) but one, an exception to
// that rule: a Check whose fresh read gets hoody-exec's own "Script not found" for exactly the reservation's path (data.ts
// execSaysAbsent) marks the reservation didnt by compare-and-set on its op id and frees core's hold of its own send (the held
// change whose shown identity names that op id or Idempotency-Key, taken before the read; never an earlier send of the path),
// with its key kept (core's settleHeld; changes.ts release(): "a retry of the same change replays it"). Only a write: it is first
// settled by hoody-exec's journal (ops/settle): fenced or refused frees it, and Deploy again then sends
// under a fresh op id (the fenced one is refused while the journal keeps it, 8 days);
// committed (made, then removed) frees it the same way (ABSENT_REMOVED); any other answer keeps it (ABSENT_KEPT). An
// instantiate has no journal to fence a send delayed before the agent saw it, which could make the script after the read, a
// Discard too: no read frees it, it stays held until its own proof, a Check that finds the
// script (ABSENT_UNPROVEN). Any other 404, a 5xx, no answer or another path frees nothing. Nor does an absent read while core still holds
// another send of the path (Deploy again would only queue behind it: ABSENT_HELD), or when its list can't be read or it won't
// free this send (ABSENT_KEPT): then nothing moves, Check again later. A second exception: a
// Check that finds the script at a write's path asks hoody-exec's journal (ops/settle, which also fences an op it never saw)
// before anything is finished: committed makes it live and frees that write's own hold; refused or fenced
// proves the file another writer's: never "It's live", the hold freed and the draft back to open, shown as the address
// taken with Change address; anything else makes it live, the hold kept (confirmDeployed). The send is freed before the reservation is marked, so
// no tab is offered Deploy again while core still holds it. The draft is released only by a fresh read of its
// computer showing the script at its path (confirmDeployed: the draft is marked deployed; for a write, only unless the journal
// proves the file another writer's: then it is open again, above), or by the person's own Discard
// draft, warned that it may already be deployed (records.ts discardDraft with mayBeDeployed). Never by a status code, a gate's
// rewrite or a switch of the shown computer.
import { execOf, newIdemKey, newOpId } from '../logic';
import { HELD_CODES, type BoundSends, type NoAnswer } from '../data';
import { beatDeploy, beginDeploy, deployStale, DEPLOY_BEAT_MS, finishDeploy, markAbsent, markDeploy, readDraftRecord, releaseRefused, releaseTaken, sendAgain, type Moved, type RecordRead } from './records';
import type { DraftDeploy, DraftRecord } from '@core';
import { bytesToSend, type Snapshot, type SnapshotVerdict } from './snapshot';

/** What the page shows while a deploy's outcome is unknown, with a link to the bound computer's Scripts list. */
export const MAY_HAVE_GONE_THROUGH = "So it isn't known whether this deploy made the script. Check looks for it on the computer; Discard drops only this draft.";
/** What the page shows for a reservation whose send was not sent, or that a Check found absent (phase didnt; records.ts
 *  canTryAgain), with Try again and Discard. */
export const DIDNT_DEPLOY = "This deploy hasn't made the script. Try again or Discard.";

/** The agent's refusals that say its own Hoody login is missing or no longer valid (409). The
 *  instantiate handler answers them before it takes the request's Idempotency-Key (the login check is its
 *  first step, "Nothing was read or changed", and a refusal keeps no receipt): this request made nothing. */
export const LOGIN_REFUSALS: readonly string[] = ['not_logged_in', 'hoody_auth_expired'];

export type DeployAnswer =
  | { outcome: 'done'; live: 'consumed' | 'live_cleanup' }
  /** The agent refused this send: shown as refused; the reservation stays (held), freed only by a fresh read or Discard. Also a
   *  Check that proved the found file another writer's (REVISION_MISMATCH): the draft is open again, shown as the address taken. */
  | { outcome: 'failed'; code: string }
  /** This send did not go out (nothing was sent by this call). */
  | { outcome: 'not_sent'; code: 'NOT_CHECKED' | 'NO_RECORD' | 'DEPLOYING' | 'ALREADY_LIVE' | 'DISCARDED' | 'NO_CLOCK' | 'NOT_SHOWN' | 'STALE' | 'BAD_PATH' | 'RESERVED_PATH' | string }
  /** The deploy may have gone through (C9): the draft stays reserved with its metadata (MAY_HAVE_GONE_THROUGH). `why`: a Check's
   *  read that got no answer, when its failure said why. */
  | { outcome: 'pending'; code: string; why?: NoAnswer };

export interface DeployDeps {
  sends: Pick<BoundSends, 'write' | 'clock' | 'exists'> & Partial<Pick<BoundSends, 'instantiate'>>;
  rand?: (n: number) => Uint8Array;
  read?: (draftId: string) => RecordRead;
}
const rnd = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
type Sent = { outcome: string; code?: string };
type Taken = Extract<Moved, { ok: true }>;

/** Why an existing record allows no send now, or null when it is open (a new reservation) or didnt (Try again). */
function blocked(r: Exclude<RecordRead, 'unreadable'>): DeployAnswer | null {
  if (r === null) return { outcome: 'not_sent', code: 'NO_RECORD' };
  if (r.state === 'deploying') {
    if (r.deploy?.phase === 'didnt') return null;
    if (r.deploy?.phase === 'held' || deployStale(r)) return { outcome: 'pending', code: 'DEPLOY_UNKNOWN' };
    return { outcome: 'not_sent', code: 'DEPLOYING' };
  }
  if (r.state === 'live_cleanup' || r.state === 'consumed') return { outcome: 'not_sent', code: 'ALREADY_LIVE' };
  if (r.state === 'discarded') return { outcome: 'not_sent', code: 'DISCARDED' };
  return null;
}

/**
 * The compare-and-set into sending: open → a new reservation with `fresh`'s metadata; didnt → the same reservation again (Try
 * again), for the same kind and path only. Anything else, or a record moved since it was read, takes nothing.
 */
async function take(rec: DraftRecord, kind: DraftDeploy['kind'], path: string, fresh: () => Promise<Omit<DraftDeploy, 'beatAt' | 'phase'> | DeployAnswer>): Promise<Taken | DeployAnswer> {
  if (rec.state === 'deploying') {
    if (rec.deploy?.kind !== kind || rec.deploy.path !== path) return { outcome: 'not_sent', code: 'RESERVED_PATH' };
    const again = await sendAgain(rec);
    return again.ok ? again : { outcome: 'not_sent', code: 'RECORD_MOVED' };
  }
  const d = await fresh();
  if (!('opId' in d)) return d;
  const reserved = await beginDeploy(rec, d);
  return reserved.ok ? reserved : { outcome: 'not_sent', code: reserved.why === 'stale' || reserved.why === 'state' ? 'DEPLOYING' : 'NO_RECORD' };
}

/** Sends once while the record holds the reservation; the sender beats so other tabs read it as being sent, not abandoned. The
 *  last beat is awaited before the answer is stored, so the phase's compare-and-set never races this tab's own beat. */
async function sendOnce<T>(taken: Taken, send: (d: DraftDeploy) => Promise<T>): Promise<{ r: T; last: DraftRecord }> {
  let cur = taken.record;
  let beating: Promise<void> = Promise.resolve();
  const beat = setInterval(() => { beating = beating.then(() => beatDeploy(cur).then((m) => { if (m.ok) cur = m.record; })); }, DEPLOY_BEAT_MS);
  try {
    const r = await send(taken.record.deploy as DraftDeploy);
    return { r, last: cur };
  } finally {
    clearInterval(beat);
    await beating;
  }
}

const finished = (f: Awaited<ReturnType<typeof finishDeploy>>): DeployAnswer => (f.state === 'refused' ? { outcome: 'pending', code: 'RECORD_MOVED' } : { outcome: 'done', live: f.state });

/** The one answer of a send: done finalizes; a non-held not_sent stores didnt; a definite refusal of a first write send
 *  (`first`) frees the draft back to open (releaseRefused); an instantiate the agent refused for its own sign-in state
 *  (`loginFrees`, LOGIN_REFUSALS: answered before the agent takes the request's key, so this request made nothing and the same
 *  key may go again) stores didnt, shown as the refusal it is; anything else stores held. A didnt reservation is only ever one
 *  whose earlier sends are known not to have landed, so the refusal of a Try again proves the same. */
async function settleSend(read: (id: string) => RecordRead, draftId: string, opId: string, r: Sent, unknown: string, first = false, loginFrees = false): Promise<DeployAnswer> {
  const now = read(draftId);
  const latest = now !== 'unreadable' && now && now.state === 'deploying' && now.deploy?.opId === opId && now.deploy.phase === 'sending' ? now : null;
  if (r.outcome === 'done') return latest ? finished(await finishDeploy(latest)) : { outcome: 'pending', code: 'RECORD_MOVED' };
  // 'failed' is always the computer's definite refusal (liveErrors.ts: core keeps only listed codes; unknowns and 5xx arrive as
  // pending). On a first send its op id is fresh, so no earlier request of it can have landed: nothing was written.
  if (first && r.outcome === 'failed' && latest && (await releaseRefused(latest, opId)).ok) return { outcome: 'failed', code: r.code ?? 'REFUSED' };
  const loginOut = loginFrees && r.outcome === 'failed' && LOGIN_REFUSALS.includes(r.code ?? '');
  const didnt = loginOut || (r.outcome === 'not_sent' && !HELD_CODES.includes(r.code ?? ''));
  // A record that moved meanwhile (a warned Discard) keeps what it says; this answer then only reports.
  if (latest) await markDeploy(latest, opId, didnt ? 'didnt' : 'held');
  if (r.outcome === 'failed') return { outcome: 'failed', code: r.code ?? 'REFUSED' };
  if (didnt) return { outcome: 'not_sent', code: r.code ?? 'NOT_SENT' };
  return { outcome: 'pending', code: r.code ?? unknown };
}

/**
 * One Make it live of an AI or blank draft (or its Try again): a write of the snapshot's bytes to `path`. `attempt` (an AI
 * draft's) is the attempt the bytes are from: it is compared with the record read after the byte check's await, so code of an
 * attempt another tab has moved past is never sent, nor reserved under the newer attempt.
 */
export async function deployWrite(deps: DeployDeps, v: { draftId: string; snapshot: Snapshot; verdict: SnapshotVerdict; path: string; attempt?: number; expectRoute?: { route: string | null; answeredBy: string | null } }): Promise<DeployAnswer> {
  const read = deps.read ?? readDraftRecord;
  const bytes = await bytesToSend(v.verdict, v.snapshot);
  if (bytes === null) return { outcome: 'not_sent', code: 'NOT_CHECKED' };
  const rec = read(v.draftId);
  if (rec === 'unreadable') return { outcome: 'not_sent', code: 'NO_RECORD' };
  const no = blocked(rec);
  if (no || !rec) return no ?? { outcome: 'not_sent', code: 'NO_RECORD' };
  if (rec.project !== v.snapshot.project || rec.compId !== v.snapshot.compId || rec.exec !== v.snapshot.exec) return { outcome: 'not_sent', code: 'STALE' };
  if (execOf(v.path) !== rec.exec) return { outcome: 'not_sent', code: 'BAD_PATH' };
  if (v.attempt !== undefined && (rec.state === 'deploying' ? rec.deploy?.attempt : rec.current) !== v.attempt) return { outcome: 'not_sent', code: 'STALE' };
  // A first send: take() reserves anew (beginDeploy) only from open; a deploying record is a resend of its reservation.
  const first = rec.state === 'open';
  const taken = await take(rec, 'write', v.path, async () => {
    const sentAfter = await deps.sends.clock();
    if (sentAfter === null) return { outcome: 'not_sent', code: 'NO_CLOCK' };
    return { kind: 'write', path: v.path, opId: newOpId(deps.rand ?? rnd), sentAfter, attempt: rec.current };
  });
  if (!('ok' in taken)) return taken;
  // Try again sends under the reservation's own op id and clock: its earlier send never left, so that clock still bounds this one.
  const { r } = await sendOnce(taken, (d) => deps.sends.write({ path: d.path, content: bytes, ifRevision: null, opId: d.opId, ...(v.expectRoute ? { expectRoute: v.expectRoute } : {}) }));
  return settleSend(read, v.draftId, (taken.record.deploy as DraftDeploy).opId, r, 'WRITE_UNKNOWN', first);
}

/** One Make it live of an idea draft (or its Try again): the template made at `path`, with the request's Idempotency-Key stored
 *  before it is sent (Try again sends under the same key: its earlier request never left). */
export async function deployInstantiate(deps: DeployDeps, v: { draftId: string; project: string; compId: string; exec: number; name: string; path: string; vars: Record<string, string>; callerKey?: string; sent?: (idem: string) => void }): Promise<DeployAnswer> {
  const read = deps.read ?? readDraftRecord;
  const instantiate = deps.sends.instantiate;
  if (!instantiate) return { outcome: 'not_sent', code: 'NOT_WIRED' };
  const rec = read(v.draftId);
  if (rec === 'unreadable') return { outcome: 'not_sent', code: 'NO_RECORD' };
  const no = blocked(rec);
  if (no || !rec) return no ?? { outcome: 'not_sent', code: 'NO_RECORD' };
  if (rec.project !== v.project || rec.compId !== v.compId || rec.exec !== v.exec) return { outcome: 'not_sent', code: 'STALE' };
  if (execOf(v.path) !== rec.exec) return { outcome: 'not_sent', code: 'BAD_PATH' };
  // The request as reserved: the caller's object may change while the send is out.
  const vars = { ...v.vars };
  const taken = await take(rec, 'instantiate', v.path, async () => ({ kind: 'instantiate', path: v.path, opId: newIdemKey(deps.rand ?? rnd), sentAfter: null, attempt: rec.current }));
  if (!('ok' in taken)) return taken;
  // `sent`: the key this request goes under, told before it goes (StepLive keeps the request for a Deploy again under it).
  const { r } = await sendOnce(taken, (d) => { v.sent?.(d.opId); return instantiate({ name: v.name, path: d.path, vars, ...(v.callerKey ? { callerKey: v.callerKey } : {}), idem: d.opId }); });
  return settleSend(read, v.draftId, (taken.record.deploy as DraftDeploy).opId, r, 'INSTANTIATE_UNKNOWN', false, true);
}

/**
 * The person checked: a fresh read of the draft's computer for the deploy's path. Only a read showing the script there releases
 * the draft (marked deployed, through the one finalizer, which also finishes a live draft's cleanup), unless the found file is
 * proven another writer's: a write's op that hoody-exec's journal settles refused or fenced frees its hold and opens the draft
 * again, { failed, REVISION_MISMATCH } (the address taken), or { pending, TAKEN_KEPT } when core won't free the hold. hoody-exec's own "Script
 * not found" for the path (the exception above) marks the reservation didnt and frees core's hold of its
 * own send, key kept: { not_sent, ABSENT }, Deploy again; a write whose op the journal settles committed, and a second read
 * still finds none, was made and removed since: { not_sent, ABSENT_REMOVED }, freed the same way. An instantiate frees nothing (no journal fences a late send):
 * { pending, ABSENT_UNPROVEN }, held until a Check finds the script. While core holds another send of the path, nothing moves:
 * { pending, ABSENT_HELD }; while its list can't be read or it won't free this send, { pending, ABSENT_KEPT }: Check again
 * later. Only with `heldOf`, `heldAt` and `release` (the wizard's bound
 * sends): a caller without them (the Scripts list) changes nothing and answers ABSENT_SEEN (an instantiate: ABSENT_UNPROVEN), or, for a write's script found
 * there, FOUND_SEEN (it can't ask the journal, so it never makes a write live). Anything else keeps it reserved
 * ("may have gone through"), with why when the read's failure said.
 */
export async function confirmDeployed(deps: { sends: Pick<BoundSends, 'exists'> & Partial<Pick<BoundSends, 'heldOf' | 'heldAt' | 'release' | 'settle'>>; read?: (draftId: string) => RecordRead }, draftId: string): Promise<DeployAnswer> {
  const read = deps.read ?? readDraftRecord;
  const rec = read(draftId);
  if (rec === 'unreadable' || rec === null) return { outcome: 'pending', code: 'NO_RECORD' };
  if (rec.state === 'consumed') return { outcome: 'done', live: 'consumed' };
  if (rec.state === 'live_cleanup') return finished(await finishDeploy(rec));
  // Only a deploy nobody answered for is checked: a didnt one (shown absent, or known not sent) has nothing to prove or free.
  if (rec.state !== 'deploying' || !rec.deploy || rec.deploy.phase === 'didnt') return { outcome: 'not_sent', code: 'NO_DEPLOY' };
  const d = rec.deploy;
  const { heldOf, heldAt, release } = deps.sends;
  const frees = heldOf && heldAt && release ? { heldOf, heldAt, release } : null;
  // Core's hold of this reservation's own send (its op id or Idempotency-Key), read before the fresh read: only a send held
  // before the proof began is one it can free, and another send of the path (an earlier write's) is never this one.
  const hold = frees ? await frees.heldOf(d.kind, d.path, d.opId) : undefined;
  const seen = await deps.sends.exists(d.path);
  // The finalizer's compare-and-set: a record that moved while the read was out (another deploy, a Discard) is not finished.
  if (seen === true) {
    // Check finding the script frees core's hold of this deploy's own write (held before the read),
    // so a lost 200 settles once Check proves it live. Safe only because this write creates and never replaces (ifRevision
    // null): while a file is at the path no send of it can change anything (hoody-exec refuses it REVISION_MISMATCH, or replays
    // the op). The found file alone is not enough: it may be another writer's, and a send of this op still on
    // its way would create the draft's script once that file is deleted or moved. So hoody-exec's journal settles the op first
    // (ops/settle), before anything is finished:
    // - committed: this op made the file: the draft is finished (It's live), then its hold is freed;
    // - refused or fenced (never seen, and not admitted after while the journal keeps it: 8 days; past that hoody-exec forgets
    //   the fence): this op made nothing, so the file is another writer's. Never "It's
    //   live": the hold is freed, then the draft goes back to open, its code kept (records.ts releaseTaken), answered as the
    //   address taken (REVISION_MISMATCH: the page's own words, with Change address). A hold core won't free moves nothing
    //   (TAKEN_KEPT: Check again later);
    // - anything else (in progress, unknown, forgotten, no answer, no clock): finished, the hold kept for core's own
    //   recovery.
    // The key stays (release), so a late resend of the op replays. An instantiate is finished the same way: its hold stays. A
    // caller without holds (the Scripts list) can't settle the op, so a write it finds is never made live there:
    // FOUND_SEEN, nothing moves, and the draft's own Check settles it.
    if (d.kind === 'write' && !frees) return { outcome: 'pending', code: 'FOUND_SEEN' };
    const v = d.kind === 'write' && frees && deps.sends.settle && typeof d.sentAfter === 'number' ? await deps.sends.settle(d.opId, d.sentAfter) : null;
    if (frees && v && (v.state === 'failed' || v.state === 'not_sent')) {
      if (hold !== undefined && !(await frees.release(d.kind, hold))) return { outcome: 'pending', code: 'TAKEN_KEPT' };
      const back = await releaseTaken(rec, d.opId);
      return back.ok ? { outcome: 'failed', code: 'REVISION_MISMATCH' } : { outcome: 'pending', code: 'RECORD_MOVED' };
    }
    const done = finished(await finishDeploy(rec));
    if (frees && hold !== undefined && done.outcome === 'done' && v?.state === 'done') await frees.release(d.kind, hold);
    return done;
  }
  if (seen !== false) return { outcome: 'pending', code: 'NOT_KNOWN', ...(seen ? { why: seen } : {}) };
  // An instantiate has no journal: a send delayed before
  // the agent saw it could still make the script after this read, after a Discard too, and nothing can fence it. So the read
  // frees nothing: the deploy stays held, core's hold kept, until its own proof (a Check that finds the script makes it live).
  // Discard stays the warned way out ("it may already be deployed"). The Scripts list's Check answers the same:
  // never "hasn't made it".
  if (d.kind === 'instantiate') return { outcome: 'pending', code: 'ABSENT_UNPROVEN' };
  if (!frees) return { outcome: 'pending', code: 'ABSENT_SEEN' };
  // Deploy again goes through core, which refuses it behind any other send of the path it holds (an earlier write's, or a later
  // send of this op made while the read was out): then nothing moves. A list that can't be read may hold one: nothing either.
  const others = await frees.heldAt(d.kind, d.path);
  if (others === null) return { outcome: 'pending', code: 'ABSENT_KEPT' };
  if (others.some((h) => h.hold !== hold?.hold)) return { outcome: 'pending', code: 'ABSENT_HELD' };
  // First core's hold of the deploy's own send, freed on the proof, key kept; one it won't free (its request may still be out in
  // a tab) moves nothing. Core frees a send once: a second Check's release of it is refused.
  // A write is first settled by hoody-exec's journal: a send of the op delayed before admission could otherwise
  // land after this read (after a Discard too). Only fenced (never seen, and refused if it comes while the journal keeps it, 8
  // days) or refused (never applied) proves no send of it can make the script; Deploy again then goes under a fresh op id (the old one would be refused again).
  // committed proves this op made the script; a second read still finding none proves someone removed it since:
  // freed the same way, answered ABSENT_REMOVED (its own words). A late send of the op only replays its committed
  // entry, so Deploy again under the fresh op id makes the one script. In progress, unknown, forgotten or no answer keeps
  // everything: Check again later.
  let nextOpId: string | undefined;
  let removed = false;
  if (d.kind === 'write') {
    const v = deps.sends.settle && typeof d.sentAfter === 'number' ? await deps.sends.settle(d.opId, d.sentAfter) : null;
    if (v?.state === 'done') {
      // committed proves only that the op made the script: a first send can land between the read above and this settle.
      // So a second read, after the journal's answer, decides: the script there is live (its hold freed, as found);
      // no answer moves nothing; only still absent proves it removed since.
      const after = await deps.sends.exists(d.path);
      if (after === true) {
        const done = finished(await finishDeploy(rec));
        if (hold !== undefined && done.outcome === 'done') await frees.release(d.kind, hold);
        return done;
      }
      if (after !== false) return { outcome: 'pending', code: 'NOT_KNOWN', ...(after ? { why: after } : {}) };
      removed = true;
    }
    else if (!v || !(v.state === 'not_sent' || v.state === 'failed')) return { outcome: 'pending', code: 'ABSENT_KEPT' };
    nextOpId = newOpId(rnd);
  }
  if (hold !== undefined && !(await frees.release(d.kind, hold))) return { outcome: 'pending', code: 'ABSENT_KEPT' };
  // Then the reservation, by compare-and-set on the record read before the read (putDraftRecord compares every field): one that
  // moved meanwhile (a Check elsewhere, a Discard, a stale sender's beat) is never marked.
  const moved = await markAbsent(rec, d.opId, nextOpId);
  return moved.ok ? { outcome: 'not_sent', code: removed ? 'ABSENT_REMOVED' : 'ABSENT' } : { outcome: 'pending', code: 'RECORD_MOVED' };
}
