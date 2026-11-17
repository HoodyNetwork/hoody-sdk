// Remove a program the person added (the daemon's openapi removeProgram: POST /programs/remove/{id}, no body), under C9.
//
// Who may be removed: only a row of scope 'yours' (the overview's hoody_kit is not true). The daemon itself guards
// nothing here (its removal deletes any row it is asked for), so a system program is never
// offered and never sent; a temporary program has no such route (it is stopped, and leaves by itself).
// A running program needs no stop first: the removal's own reload stops it, and the confirm says so.
//
// Settlement (the daemon's own answers to a removal). No answer carries a machine code, so
// the route declares none and the refusals are told apart by the daemon's own fixed sentences, on this program's id:
//   - 2xx: removed. The page still reads the overview afresh before it says so.
//   - 400 "Program with ID {id} not found": it was not there any more. Nothing was removed by this send.
//   - 400 "program {id} was removed but its configuration was NOT removed…": the row IS gone; what is left of it is
//     swept when the computer's program service next starts. Shown as removed with that note, never as refused.
//   - any other 400 opening "program {id} was removed" (a check after the removal failed): the row was deleted, so
//     it is never shown as refused; it is unknown and the list is read back.
//   - a 400 with no readable text (an error body over kit.ts's cap arrives empty): cannot be told from the line above,
//     so it is unknown: Check again reads the list.
//   - any other 4xx: refused, nothing removed.
//   - 5xx (the daemon's own "PERSIST: …" included), timeout, network: may have gone through. Core holds the change;
//     only a fresh overview that no longer lists the program proves it (core complete), or the person's warned
//     Dismiss frees it. A read that still lists it proves nothing. Nothing is ever sent a second time.
//
// The attempt lives in module state, keyed by account, realm, computer and program (ops.ts opKey): a redraw, a closed
// dialog or a remount shows the same state, and Check again reads the computer the send went to.
import { defineMutation, defineRoute, heldChanges, onAuthPurge, programModel, type HeldChange, type HubError, type Target } from '@core';
import { useSyncExternalStore } from 'react';
import { readOverview } from '../data';

const IDX = 1;
const PAGE = 'programs';
export const REMOVE_LOCK = 'daemon.program.remove';

/** The removal. No idempotency key (the daemon takes none): it is sent once per confirm and never again. Not secret:
 *  the answer is {success, id} or {success, error}. The removal reloads the process manager during the call: 60 s,
 *  like start and edit. */
export const removeRoute = defineRoute({ method: 'POST', path: '/api/v1/daemon/programs/remove/:id', scope: 'kit', kit: 'daemon', index: 1, timeoutMs: 60000 });

export interface RemoveVars {
  id: string;
  /** The name the person confirmed (shown with a held removal; never part of the lock). */
  name: string;
  target: Target;
}

const removeM = defineMutation<RemoveVars>(removeRoute, {
  input: (v) => ({ index: IDX, recovers: true, target: v.target, params: { id: v.id } }),
  lock: REMOVE_LOCK,
  lockKey: (v) => ({ id: v.id }),
  identity: (v) => ({ id: v.id, name: v.name }),
  page: PAGE,
});

// ── What an answer means ─────────────────────────────────────────────────────────────

export type RemoveVerdict =
  | { kind: 'removed' }
  /** It was not on the computer any more. */
  | { kind: 'already' }
  /** The row is gone; the computer could not clear what it had installed for it. */
  | { kind: 'leftover' }
  | { kind: 'refused'; error: HubError | undefined }
  /** A refusal with no readable text: it may have been removed. */
  | { kind: 'unclear' }
  | { kind: 'pending'; hold: string | undefined }
  | { kind: 'notSent'; code: string | null }
  | { kind: 'stale' };

/** The daemon's raw refusal text, or null when the answer carried none. */
function rawText(e: HubError | undefined): string | null {
  const d = e?.data as { error?: unknown } | undefined;
  return typeof d?.error === 'string' ? d.error : null;
}

/** A 4xx refusal of a removal of program `id`, by the daemon's fixed sentences (anchored at the start, on this id). */
export function refusalOf(status: number | undefined, raw: string | null, id: string): 'already' | 'leftover' | 'unclear' | 'refused' {
  if (status !== 400) return 'refused';
  if (raw === null || raw.trim() === '') return 'unclear';
  if (raw === `Program with ID ${id} not found`) return 'already';
  if (raw.startsWith(`program ${id} was removed but its configuration was NOT removed`)) return 'leftover';
  // Any other answer that opens by saying the row was removed (its checks after the removal failed): not a refusal.
  // What stands is not known from the sentence, so the list is read back.
  if (raw.startsWith(`program ${id} was removed`)) return 'unclear';
  return 'refused';
}

/** Sends the removal once. Never throws. */
export async function sendRemove(v: RemoveVars): Promise<RemoveVerdict> {
  const res = await removeM.run(v);
  if (res.outcome === 'done') return { kind: 'removed' };
  if (res.outcome === 'pending') return { kind: 'pending', hold: res.hold };
  if (res.outcome === 'stale') return { kind: 'stale' };
  if (res.outcome === 'not_sent') return { kind: 'notSent', code: res.error?.code ?? null };
  const kind = refusalOf(res.error?.status, rawText(res.error), v.id);
  return kind === 'refused' ? { kind, error: res.error } : { kind };
}

/** What a fresh overview says about program `id`: 'gone' (a readable overview that does not list it), 'listed', or
 *  'unread' (no fresh answer, or one that is not the daemon's overview). Reads only. */
export async function readGone(id: string, target: Target): Promise<'gone' | 'listed' | 'unread'> {
  let raw: unknown;
  try {
    raw = await readOverview(target);
  } catch {
    return 'unread';
  }
  const m = programModel(raw);
  // Absence proves the removal only in an answer that carries the program list at all.
  if (!m || !Array.isArray((raw as { programs?: unknown } | null)?.programs)) return 'unread';
  return m.rows.some((r) => r.key === `prog:${id}`) ? 'listed' : 'gone';
}

// ── Core's holds of this lock ────────────────────────────────────────────────────────

const sameTarget = (h: HeldChange, t: Target) => h.target?.container.id === t.container.id && h.target?.project.id === t.project.id;

export interface RemoveHold {
  id: string;
  name: string;
  hold: string | undefined;
  own: boolean;
}

/** The removals core holds on this computer (any realm: the lock names a program of one computer). */
export function removeHolds(target: Target | null): RemoveHold[] {
  if (!target) return [];
  const out: RemoveHold[] = [];
  for (const h of heldChanges(REMOVE_LOCK)) {
    if (!sameTarget(h, target)) continue;
    const i = (h.identity ?? {}) as { id?: unknown; name?: unknown };
    if (typeof i.id !== 'string' && typeof i.id !== 'number') continue;
    out.push({ id: String(i.id), name: typeof i.name === 'string' ? i.name : '', hold: h.hold, own: removeM.heldBy(h) === 'self' });
  }
  return out;
}

/** The fresh read proved the held removal: core frees exactly that send. True when it freed it. */
export function completeRemove(v: RemoveVars, hold: string | undefined): Promise<boolean> {
  return hold === undefined ? Promise.resolve(false) : removeM.complete(v, hold);
}

/** The person's warned Dismiss of the hold that was shown. True when that send was let go. */
export function dismissRemove(v: RemoveVars, hold: string | undefined): Promise<boolean> {
  return hold === undefined ? Promise.resolve(false) : removeM.dismiss(v, hold);
}

// ── The attempt store ────────────────────────────────────────────────────────────────

export type RemoveStatus = 'working' | 'unknown' | 'refused' | 'notSent';

export interface RemoveAttempt {
  id: string;
  name: string;
  /** The computer the removal went to; a read-back reads this one, never the current one. */
  target: Target;
  status: RemoveStatus;
  /** Unknown: the hold this send left in core. Absent: core holds nothing (the answer was a 2xx the list has not
   *  shown yet, or a refusal with no text), so a Dismiss only closes the note. */
  hold?: string;
  /** Unknown: the computer answered that it removed it; only the list has not shown it yet. */
  accepted?: boolean;
  /** Refused: the rejection, for the kit's error details. Not sent: its code. */
  error?: HubError;
  code?: string;
  checking?: boolean;
  /** A check found nothing new (shown once). */
  stuck?: boolean;
}

let attempts: ReadonlyMap<string, RemoveAttempt> = new Map();
const listeners = new Set<() => void>();
function commit(next: Map<string, RemoveAttempt>): void {
  attempts = next;
  for (const l of listeners) l();
}

// The store ends with the session, as parts/ops.ts's does: an attempt of the last session must not show, be checked or
// be said "removed" in the next one. A send or read-back still out then finds its attempt gone (`current()` in
// runRemove and checkRemove) and says nothing. Hooked at the first attempt kept.
let purgeHooked = false;
function hookPurge(): void {
  if (purgeHooked) return;
  purgeHooked = true;
  try {
    onAuthPurge(() => { commit(new Map()); });
  } catch {
    /* a unit test's partial @core mock has no purge; the app's core always does */
  }
}

export const removeStore = {
  get: (key: string): RemoveAttempt | undefined => attempts.get(key),
  set(key: string, a: RemoveAttempt): void {
    hookPurge();
    commit(new Map(attempts).set(key, a));
  },
  patch(key: string, p: Partial<RemoveAttempt>): void {
    const cur = attempts.get(key);
    if (cur) commit(new Map(attempts).set(key, { ...cur, ...p }));
  },
  clear(key: string): void {
    if (!attempts.has(key)) return;
    const next = new Map(attempts);
    next.delete(key);
    commit(next);
  },
  /** Drops everything (tests). */
  reset(): void {
    commit(new Map());
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  snapshot: (): ReadonlyMap<string, RemoveAttempt> => attempts,
};

/** All removal attempts; re-renders on any change. */
export function useRemoveAttempts(): ReadonlyMap<string, RemoveAttempt> {
  return useSyncExternalStore(removeStore.subscribe, removeStore.snapshot, removeStore.snapshot);
}

/** A removal that blocks every other action of its program: being sent, or not yet known. */
export function removeBusy(a: RemoveAttempt | undefined): boolean {
  return !!a && (a.status === 'working' || a.status === 'unknown');
}

export type RemoveEnd = 'removed' | 'already' | 'leftover';

/**
 * Sends one confirmed removal and files what came back under `key`. Resolves with how it ended when the program is
 * known to be gone (the caller says so and reads the list again), undefined otherwise (the attempt stays in the
 * store: unknown with Check again, refused, or not sent).
 */
export async function runRemove(key: string, v: RemoveVars): Promise<RemoveEnd | undefined> {
  if (removeBusy(removeStore.get(key))) return undefined;
  const base = { id: v.id, name: v.name, target: v.target };
  removeStore.set(key, { ...base, status: 'working' });
  const mine = removeStore.get(key);
  const res = await sendRemove(v);
  // Only while the store still shows this send (a reset or another computer's attempt under the key is not it).
  const current = () => removeStore.get(key) === mine;
  if (!current()) return undefined;
  if (res.kind === 'stale') {
    removeStore.clear(key);
    return undefined;
  }
  if (res.kind === 'already' || res.kind === 'leftover') {
    removeStore.clear(key);
    return res.kind;
  }
  if (res.kind === 'refused') {
    removeStore.set(key, { ...base, status: 'refused', ...(res.error ? { error: res.error } : {}) });
    return undefined;
  }
  if (res.kind === 'notSent') {
    // An earlier removal of this program may have gone through (core kept its hold): shown held, never "not sent".
    const held = removeHolds(v.target).find((h) => h.id === v.id);
    if (held && (res.code === 'READ_BACK_FIRST' || res.code === 'HELD_BY_OTHER')) removeStore.set(key, { ...base, status: 'unknown', ...(held.hold ? { hold: held.hold } : {}) });
    else removeStore.set(key, { ...base, status: 'notSent', ...(res.code ? { code: res.code } : {}) });
    return undefined;
  }
  // Removed by the computer's own answer, pending, or unclear: one read-back of the list decides what is said.
  removeStore.set(key, { ...base, status: 'unknown', ...(res.kind === 'pending' && res.hold ? { hold: res.hold } : {}), ...(res.kind === 'removed' ? { accepted: true } : {}) });
  return (await checkRemove(key, removeStore.get(key))) ? 'removed' : undefined;
}

/**
 * Check again: one fresh read of the attempt's own computer, never a send. True when the list no longer has the
 * program and (for a held send) core freed exactly that hold: the attempt is then cleared. Anything else keeps it.
 */
export async function checkRemove(key: string, shown: RemoveAttempt | undefined): Promise<boolean> {
  const a = removeStore.get(key);
  if (!shown || !a || a.status !== 'unknown' || a.checking || a.hold !== shown.hold) return false;
  removeStore.patch(key, { checking: true });
  const mine = removeStore.get(key);
  const current = () => removeStore.get(key) === mine;
  const seen = await readGone(a.id, a.target);
  if (!current()) return false;
  if (seen !== 'gone') {
    removeStore.patch(key, { checking: false, stuck: true });
    return false;
  }
  if (a.hold !== undefined) {
    const freed = await completeRemove({ id: a.id, name: a.name, target: a.target }, a.hold);
    if (!current()) return false;
    // Core did not free it and still holds that send: the note stays and says where it stands.
    if (!freed && removeHolds(a.target).some((h) => h.id === a.id && h.hold === a.hold)) {
      removeStore.patch(key, { checking: false, stuck: true });
      return false;
    }
  }
  removeStore.clear(key);
  return true;
}

/** Dismiss of the attempt its control showed. A held send goes only when core freed that hold; a definite outcome, or
 *  an unknown one core holds nothing for, just closes. True when the note closed. */
export async function dismissRemoveAttempt(key: string, shown: RemoveAttempt): Promise<boolean> {
  if (shown.status === 'unknown' && shown.hold !== undefined && !(await dismissRemove({ id: shown.id, name: shown.name, target: shown.target }, shown.hold))) return false;
  const now = removeStore.get(key);
  const same = shown.status === 'unknown' ? now?.status === 'unknown' && now.hold === shown.hold : now === shown;
  if (same) removeStore.clear(key);
  return true;
}

export { removeM as __removeMutationForTests };
