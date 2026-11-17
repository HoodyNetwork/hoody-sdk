// A New script draft's durable lifecycle, over core's draft
// records (one per draft, compare-and-set under the change-store lock, shared by every tab):
//
//   - Attempts. `current` is the attempt being built; `retained` the last attempt with a usable answer, kept until the
//     current one has one. A new attempt is allocated against the current generation the caller read: a stale tab (another
//     tab already moved on) allocates nothing and closes nothing. An older attempt's ask is closed only after the record says
//     it is no longer needed.
//   - The deploy reservation. Before a deploy is sent the record moves open → deploying with the deploy's recovery
//     metadata (path, op id or idempotency key, the computer's pre-send clock, the attempt). Only one tab can make that move,
//     so a second Make it live of the same draft (another tab, a reload) is refused before anything is sent. The sending tab
//     beats while it waits; a deploy whose beat is older than DEPLOY_BEAT_STALE_MS reads as unknown everywhere (never
//     unlocked by a timer). The reservation's phase is stored with it: sending while a send is or may be
//     out, didnt once its send was known not sent, held once its outcome is held or unknown. The only way into the sender
//     is a compare-and-set to sending: open → deploying (beginDeploy) or didnt → sending (sendAgain, Try again: the same
//     reservation, op id and key). sending and held refuse it. A reservation ends only through the finalizer, once a fresh
//     read shows the script, or through the person's warned Discard; no answer of a send frees it.
//   - The finalizer, one for an immediate success and for a recovered commit: deploying → live_cleanup (made live, sends
//     nothing again) → close every attempt ask, checking each close's own answer → consumed. A close that cannot be proven
//     leaves live_cleanup, which a later finalize finishes; it never sends a second write.
//   - Discard: open → discarded, then the attempts' asks are closed. A draft under a deploy is discarded only by the person,
//     warned that it may already be deployed (deploying → discarded); a draft made live never is.
//
// The store is bounded (DRAFTS_MAX): a new draft that finds it full is admitted in ONE
// write under the cross-tab lock (core admitDraftRecord, fail closed without the lock), which drops at most one record that
// holds no build: an ended one first (kept only for other tabs), else the oldest open draft that never reserved an attempt
// (current 0) and has no stored ask, both judged on the store as read under that lock. A draft that reserved an attempt, has
// an ask or is under a deploy is never dropped (its outcome may be unknown): the store stays full. A dropped open draft is
// announced as soon as that write is known done.
//
// The reservation is the draft (draftId), not the computer: a rebind changes the record's computer only while it is open.
// An attempt's ask stays where it was made (its project, computer, realm and owner): after a rebind the older attempts are
// still found, read and closed through their own stored asks (attemptAsks), never through the draft's binding of now.
import { admitDraftRecord, putDraftRecord, readDraftRecords, readScriptAsks, type DraftDeploy, type DraftMode, type DraftRecord, type ScriptAsk, type ScriptAskWrite } from '@core';
import { makeT, showToast } from '@kit';
import type { Binding } from '../data';
import strings from '../strings.en.json';
import { attemptOf, attemptPath, closeAsk } from '../writer';

export const DEPLOY_BEAT_MS = 5_000;
export const DEPLOY_BEAT_STALE_MS = 30_000;

export type RecordRead = DraftRecord | null | 'unreadable';
export function readDraftRecord(draftId: string): RecordRead {
  const all = readDraftRecords();
  if (all === 'unreadable') return 'unreadable';
  return all.find((r) => r.draftId === draftId) ?? null;
}

const at = (r: DraftRecord) => ({ compId: r.compId, realm: r.realm, owner: r.owner });
const placeOf = (r: DraftRecord, n: number) => ({ ...at(r), path: attemptPath(r.project, r.draftId, n) });
const stamp = (r: Omit<DraftRecord, 'updatedAt'>): DraftRecord => ({ ...r, updatedAt: Date.now() });

/** The stored asks of this draft's attempt n (every attempt without n), whatever binding each was made in. */
export function attemptAsks(draftId: string, n?: number): ScriptAsk[] | 'unreadable' {
  const all = readScriptAsks();
  if (all === 'unreadable') return 'unreadable';
  return all.filter((a) => { const at = attemptOf(a.path); return !!at && at.draftId === draftId && (n === undefined || at.n === n); });
}

/** Close attempt n: its run in memory at the record's place, and every stored ask of it where it was made. 'ok' only when each
 *  close answered ok (an unreadable store proves nothing). */
async function closeAttempt(r: DraftRecord, n: number, removed?: (a: ScriptAsk) => void): Promise<'ok' | 'unknown'> {
  let ok = (await closeAsk(placeOf(r, n), removed)) === 'ok';
  const asks = attemptAsks(r.draftId, n);
  if (asks === 'unreadable') return 'unknown';
  for (const a of asks) {
    if (!a.realm || !a.owner) { ok = false; continue; }
    if ((await closeAsk({ compId: a.compId, path: a.path, realm: a.realm, owner: a.owner }, removed)) !== 'ok') ok = false;
  }
  return ok ? 'ok' : 'unknown';
}

/** The fields an answer's use depends on moved since `prev` was read. */
const generationMoved = (cur: DraftRecord, prev: DraftRecord): boolean => cur.current !== prev.current || cur.retained !== prev.retained || cur.state !== prev.state;

/** Why a lifecycle move did not happen. 'stale': another tab moved the draft since this one read it; 'state': the draft is not
 *  in a state that allows the move (deploying, live, discarded); 'gone': no record; the rest are the store's own answers. */
export type Refused = 'stale' | 'state' | 'gone' | Exclude<ScriptAskWrite, 'ok' | 'changed'>;
export type Moved = { ok: true; record: DraftRecord; dropped?: DraftRecord } | { ok: false; why: Refused };
const fail = (w: ScriptAskWrite): Moved => ({ ok: false, why: w === 'changed' ? 'stale' : (w as Refused) });

async function move(prev: DraftRecord, next: DraftRecord): Promise<Moved> {
  const w = await putDraftRecord(next, prev);
  return w === 'ok' ? { ok: true, record: next } : fail(w);
}

/** The record of a new draft (attempt 0), bound where the draft is. An existing record is returned as it is (another tab that
 *  admitted the same draft first included). A full store makes room once, in the same locked write (victimOf). */
export async function openRecord(draftId: string, mode: DraftMode, b: Binding): Promise<Moved> {
  const cur = readDraftRecord(draftId);
  if (cur === 'unreadable') return { ok: false, why: 'unreadable' };
  if (cur) return { ok: true, record: cur };
  const rec = stamp({ draftId, mode, project: b.target.project.id, compId: b.target.container.id, realm: b.realm, owner: b.owner, exec: b.exec, current: 0, retained: null, state: 'open', deploy: null });
  const { w, dropped } = await admitDraftRecord(rec, victimOf);
  if (w === 'changed') {
    const now = readDraftRecord(draftId);
    return now && now !== 'unreadable' ? { ok: true, record: now } : fail(w);
  }
  if (w !== 'ok') return fail(w);
  if (dropped?.state === 'open') showToast({ title: t('draft.droppedOldest'), tone: 'info' /* noDetails: the store keeps DRAFTS_MAX drafts; the oldest one with no build was dropped to make room */ });
  return dropped ? { ok: true, record: rec, dropped } : { ok: true, record: rec };
}

const t = makeT(strings);

/** The record a new draft may push out of a full store, judged on the drafts and asks as stored (admitDraftRecord passes them
 *  under its lock): the oldest ended one, else the oldest open draft that never reserved an attempt (current 0: nextAttempt
 *  reserves before its ask is stored) and that no stored ask belongs to. Never one under a deploy; none at all: null. */
export function victimOf(drafts: readonly DraftRecord[], asks: readonly ScriptAsk[]): DraftRecord | null {
  const asked = new Set(asks.map((a) => attemptOf(a.path)?.draftId).filter((d): d is string => !!d));
  const oldest = (l: DraftRecord[]) => [...l].sort((x, y) => x.updatedAt - y.updatedAt)[0] ?? null;
  return oldest(drafts.filter((r) => r.state === 'consumed' || r.state === 'discarded'))
    ?? oldest(drafts.filter((r) => r.state === 'open' && r.deploy === null && r.current === 0 && !asked.has(r.draftId)));
}

/** Rebind an open draft (step 2): its attempts belong to the old computer and are kept as they are. */
export async function rebindRecord(prev: DraftRecord, b: Binding): Promise<Moved> {
  if (prev.state !== 'open') return { ok: false, why: 'state' };
  return move(prev, stamp({ ...prev, project: b.target.project.id, compId: b.target.container.id, realm: b.realm, owner: b.owner, exec: b.exec }));
}

/**
 * Allocate attempt n+1 against the generation the caller read (`prev.current`). `currentUsable`: the current attempt has a
 * usable answer, so it becomes the retained one (an older retained attempt is then closed, after the record moved).
 */
export async function nextAttempt(prev: DraftRecord, currentUsable: boolean): Promise<Moved> {
  if (prev.state !== 'open') return { ok: false, why: 'state' };
  const retained = currentUsable && prev.current > 0 ? prev.current : prev.retained;
  const m = await move(prev, stamp({ ...prev, current: prev.current + 1, retained }));
  if (m.ok && prev.retained !== null && prev.retained !== retained) await closeAttempt(prev, prev.retained);
  return m;
}

/**
 * Attempt n has a readable, usable answer. Judged on the record as stored NOW, never on the caller's copy: a tab that read an
 * older generation (another tab replaced, discarded or deployed since) gets 'stale' and its answer is not used. When n is still
 * the current attempt of an open draft it becomes the retained one, and the attempt retained before it is closed (after the
 * record moved, compare-and-set). An answer of an attempt that is neither current nor retained is late: it changes nothing and
 * its ask is closed. That close is safe without the lock: `current` only grows and `retained` only ever takes the current
 * attempt's number, so an attempt below current that is not retained can never be needed again.
 */
export async function attemptUsable(prev: DraftRecord, n: number): Promise<{ use: boolean; record: DraftRecord | null; why?: Refused }> {
  const cur = readDraftRecord(prev.draftId);
  if (cur === 'unreadable') return { use: false, record: null, why: 'unreadable' };
  if (cur === null) return { use: false, record: null, why: 'gone' };
  if (n !== cur.current || cur.state !== 'open') {
    if (n < cur.current && n !== cur.retained) await closeAttempt(cur, n);
    return { use: false, record: cur, why: cur.state !== 'open' ? 'state' : 'stale' };
  }
  if (generationMoved(cur, prev)) return { use: false, record: cur, why: 'stale' };
  if (cur.retained === n) return { use: true, record: cur };
  const m = await move(cur, stamp({ ...cur, retained: n }));
  if (!m.ok) return { use: false, record: null, why: m.why };
  if (cur.retained !== null) await closeAttempt(cur, cur.retained);
  return { use: true, record: m.record };
}

/** The reservation, with the deploy's recovery metadata, written before the deploy is sent. */
export async function beginDeploy(prev: DraftRecord, d: Omit<DraftDeploy, 'beatAt' | 'phase'>): Promise<Moved> {
  if (prev.state !== 'open') return { ok: false, why: 'state' };
  return move(prev, stamp({ ...prev, state: 'deploying', deploy: { ...d, beatAt: Date.now(), phase: 'sending' } }));
}

/** Try again: a reservation whose send was known not sent goes back to sending, by compare-and-set on the stored record (one
 *  tab wins; sending and held refuse it). The deploy's path, op id or key and clock are kept. */
export async function sendAgain(prev: DraftRecord): Promise<Moved> {
  if (prev.state !== 'deploying' || prev.deploy?.phase !== 'didnt') return { ok: false, why: 'state' };
  return move(prev, stamp({ ...prev, deploy: { ...prev.deploy, beatAt: Date.now(), phase: 'sending' } }));
}

/** The answer of the send made under `opId`: didnt (known not sent) or held (held or unknown), only from sending. */
export async function markDeploy(prev: DraftRecord, opId: string, phase: 'didnt' | 'held'): Promise<Moved> {
  if (prev.state !== 'deploying' || prev.deploy?.opId !== opId || prev.deploy.phase !== 'sending') return { ok: false, why: 'state' };
  return move(prev, stamp({ ...prev, deploy: { ...prev.deploy, phase } }));
}

/** A FIRST send under `opId` that the computer refused with a definite 4xx (the one answer that frees a reservation): nothing
 *  was written, and no earlier request of this reservation exists (its op id is fresh), so the draft goes back to open, by
 *  compare-and-set from sending. The page then shows the refusal's own words, Change address and Make it live (a new
 *  reservation). Never for a resend (didnt -> sending: an earlier send of it may have landed) or the idea way. */
export async function releaseRefused(prev: DraftRecord, opId: string): Promise<Moved> {
  if (prev.state !== 'deploying' || prev.deploy?.opId !== opId || prev.deploy.phase !== 'sending') return { ok: false, why: 'state' };
  return move(prev, stamp({ ...prev, state: 'open', deploy: null }));
}

/** A Check found a script at a write's path, and hoody-exec's journal settled the reservation's op refused or fenced:
 *  the file there is another writer's, and no send of the op can make one (a refused op replays its refusal; a
 *  fenced one is refused OP_FENCED). Every send of a reservation goes under its op id (an earlier id was fenced before
 *  markAbsent replaced it), so the draft goes back to open, its code kept, like releaseRefused: the page shows the address was
 *  just taken, with Change address and Make it live (a new reservation). Only the reservation the Check read (`opId`), held or
 *  with a stale sender, by compare-and-set. */
export async function releaseTaken(prev: DraftRecord, opId: string): Promise<Moved> {
  if (prev.state !== 'deploying' || prev.deploy?.opId !== opId || prev.deploy.kind !== 'write' || !(prev.deploy.phase === 'held' || deployStale(prev))) return { ok: false, why: 'state' };
  return move(prev, stamp({ ...prev, state: 'open', deploy: null }));
}

/** A Check proved the deploy's script absent (the computer's own "Script not found" at its path): a held reservation, or one whose
 *  sender stopped beating, becomes didnt, so Deploy again (sendAgain) may send it once more under the same path, op id or key and
 *  clock. Only the reservation the Check read (`opId`), by compare-and-set; a fresh sending one is never taken from its sender. */
export async function markAbsent(prev: DraftRecord, opId: string, nextOpId?: string): Promise<Moved> {
  if (prev.state !== 'deploying' || prev.deploy?.opId !== opId || !(prev.deploy.phase === 'held' || deployStale(prev))) return { ok: false, why: 'state' };
  // `nextOpId` (a write whose op hoody-exec's journal settled as fenced or refused): a resend under the old op id
  // would only be refused again, so Deploy again sends under a fresh one; the kept clock still precedes it (settle's sentAfter).
  return move(prev, stamp({ ...prev, deploy: { ...prev.deploy, ...(nextOpId ? { opId: nextOpId } : {}), phase: 'didnt' } }));
}

/** The sending tab's heartbeat while its deploy waits for an answer. */
export async function beatDeploy(prev: DraftRecord): Promise<Moved> {
  if (prev.state !== 'deploying' || prev.deploy?.phase !== 'sending') return { ok: false, why: 'state' };
  return move(prev, stamp({ ...prev, deploy: { ...prev.deploy, beatAt: Date.now() } }));
}

/** A send nobody is answering for: its sender's beat is old. It stays reserved (unknown), never freed by time. */
export const deployStale = (r: DraftRecord, now = Date.now()): boolean => r.state === 'deploying' && r.deploy?.phase === 'sending' && now - r.deploy.beatAt > DEPLOY_BEAT_STALE_MS;

/** The stored record allows Try again (what the page offers; sendAgain decides). */
export const canTryAgain = (r: RecordRead): boolean => !!r && r !== 'unreadable' && r.state === 'deploying' && r.deploy?.phase === 'didnt';

/** The attempts whose asks are still stored for this draft: 1..current (an attempt never started has none). */
const attempts = (r: DraftRecord): number[] => Array.from({ length: r.current }, (_, i) => i + 1);

/**
 * One finalizer for an immediate success and a recovered commit: the record says live before anything is cleaned, then
 * every attempt ask is closed and each close's own answer is checked. 'live_cleanup': made live, cleanup to finish later (no
 * second write is ever sent for it). Idempotent: a draft already live_cleanup is finished; consumed answers consumed.
 */
export async function finishDeploy(prev: DraftRecord): Promise<{ state: 'consumed' | 'live_cleanup' } | { state: 'refused'; why: Refused }> {
  let r = prev;
  if (r.state === 'consumed') return { state: 'consumed' };
  if (r.state === 'deploying') {
    const m = await move(r, stamp({ ...r, state: 'live_cleanup' }));
    if (!m.ok) return { state: 'refused', why: m.why };
    r = m.record;
  } else if (r.state !== 'live_cleanup') return { state: 'refused', why: 'state' };
  let clean = true;
  for (const n of attempts(r)) if ((await closeAttempt(r, n)) !== 'ok') clean = false;
  if (!clean) return { state: 'live_cleanup' };
  const m = await move(r, stamp({ ...r, state: 'consumed' }));
  return m.ok ? { state: 'consumed' } : { state: 'live_cleanup' };
}

/**
 * Discard: the record says discarded first, then the attempts are closed (each checked). Only a draft under no deploy, unless
 * the person discards one whose deploy may have gone through (`mayBeDeployed`: the page warned that the script may already be
 * on the computer); a draft made live is never discarded.
 */
export async function discardDraft(prev: DraftRecord, o: { mayBeDeployed?: boolean } = {}): Promise<{ ok: true; clean: boolean; removed: ScriptAsk[] } | { ok: false; why: Refused }> {
  if (!(prev.state === 'open' || (o.mayBeDeployed === true && prev.state === 'deploying'))) return { ok: false, why: 'state' };
  const m = await move(prev, stamp({ ...prev, state: 'discarded', deploy: null }));
  if (!m.ok) return { ok: false, why: m.why };
  let clean = true;
  // The asks as this discard removed them (a turn another tab stored after the caller's read included), for what it reports.
  const removed: ScriptAsk[] = [];
  for (const n of attempts(prev)) if ((await closeAttempt(prev, n, (a) => removed.push(a))) !== 'ok') clean = false;
  return { ok: true, clean, removed };
}
