// Edit a program the person added: its name and its command (the daemon's openapi editProgram: POST
// /programs/edit/{id}; a field left out keeps its stored value), under C9.
//
// Who may be edited: only a row of scope 'yours' (the overview's hoody_kit is not true). A system program is never
// offered and never sent; a temporary program has no such route.
//
// What is sent: only the fields the person changed. The daemon merges them into the stored program, so another
// field changed elsewhere meanwhile (the sandbox, the boot switch) is never put back.
//
// Settlement (the daemon's own answers to an edit). No answer carries a machine code, so
// the refusals are told apart by the daemon's own fixed sentences, on this program's id (sandbox/data.ts
// persistedThenFailed, one reading for both senders of this route):
//   - 2xx: saved. The page still reads the program afresh before it says so.
//   - 400 that starts with one of the post-save sentences ("program {id} saved but NOT applied", …): the edit IS
//     stored; the computer could not apply it. Shown as saved with that note, never as refused.
//   - a 400 with no readable text (an error body over kit.ts's cap arrives empty): cannot be told from the line
//     above, so it is unknown: Check again reads the program.
//   - any other 4xx (an unknown id, a name another program has, a command the daemon refuses): refused, nothing saved.
//   - 5xx (the daemon's own "PERSIST: …" included), timeout, network: may have gone through. Core holds the change;
//     only a fresh read of the program whose name and command are the ones this send asked for proves it (core
//     complete), or the person's warned Dismiss frees it. A read that shows other values proves nothing (another
//     sender may have changed them since). Nothing is ever sent a second time.
//
// The attempt lives in module state, keyed by account, realm, computer and program (ops.ts opKey): a redraw, a closed
// drawer or a remount shows the same state, and Check again reads the computer the send went to.
import { api, defineMutation, heldChanges, onAuthPurge, type HeldChange, type HubError, type Target } from '@core';
import { useSyncExternalStore } from 'react';
import { persistedThenFailed } from '../sandbox/data';
import { sandboxRoutes } from '../sandbox/routes';

const IDX = 1;
const PAGE = 'programs';
export const EDIT_LOCK = 'daemon.program.edit';

// ── The read ─────────────────────────────────────────────────────────────────────────

/** What the drawer shows and a read-back compares: the stored name and command, and whether an edit is applied
 *  during the call (an enabled program that starts with the computer, starts on demand, has a port range or a
 *  sandbox: such an edit can restart it; any other program keeps what it runs until its next start). */
export interface Editable {
  name: string;
  command: string;
  appliesNow: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The daemon's program answer ({success, program} or the program itself) as an Editable; null when it is not one. */
export function editableOf(w: unknown): Editable | null {
  const p = isObj(w) && isObj(w.program) ? w.program : isObj(w) && 'id' in w ? w : null;
  if (!p || typeof p.name !== 'string' || typeof p.command !== 'string') return null;
  return {
    name: p.name,
    command: p.command,
    appliesNow: p.enabled !== false && (p.boot === true || p.lazy_load === true || isObj(p.port_range) || isObj(p.sandbox)),
  };
}

/** The program's name and command, through the secret route's scrub: the answer (environment values and webhook
 *  headers included) is emptied in place before anything else sees it. Never cached. null when the read failed or
 *  the answer was not a program. */
export async function readEditable(id: string, target: Target): Promise<Editable | null> {
  let got: Editable | null = null;
  const scrub = (a: unknown) => {
    got = editableOf(a);
    const o = isObj(a) ? a : null;
    const prog = o && isObj(o.program) ? o.program : o;
    if (prog) for (const k of Object.keys(prog)) delete prog[k];
  };
  try {
    await api(sandboxRoutes.program, { index: IDX, params: { id }, target, scrub });
  } catch {
    return null;
  }
  return got;
}

/** A short mark of a name and a command (cyrb53, as sandbox/block.ts fingerprint): tells in a hold's identity what a
 *  send asked for without carrying the command. Not a security property. */
export function mark(name: string, command: string): string {
  const s = `${name}\n${command}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

// ── The change ───────────────────────────────────────────────────────────────────────

export interface EditVars {
  id: string;
  /** The name and the command the program has once this send is stored (a read-back compares them). */
  name: string;
  command: string;
  /** What is sent: only the changed fields. */
  body: { name?: string; command?: string };
  target: Target;
}

/** The edit. No idempotency key (the daemon takes none): it is sent once per Save and never again. The route is the
 *  sandbox save's (one declaration of the daemon's edit); its 2xx answer, the whole program, is never read here. */
const editM = defineMutation<EditVars>(sandboxRoutes.edit, {
  input: (v) => ({ index: IDX, recovers: true, target: v.target, params: { id: v.id }, body: v.body }),
  lock: EDIT_LOCK,
  lockKey: (v) => ({ id: v.id }),
  identity: (v) => ({ id: v.id, name: v.name, mark: mark(v.name, v.command) }),
  page: PAGE,
});

export type EditVerdict =
  | { kind: 'saved' }
  /** Stored; the computer could not apply it. */
  | { kind: 'notApplied' }
  | { kind: 'refused'; error: HubError | undefined }
  /** A refusal with no readable text: it may have been saved. */
  | { kind: 'unclear' }
  | { kind: 'pending'; hold: string | undefined }
  | { kind: 'notSent'; code: string | null }
  | { kind: 'stale' };

/** The daemon's raw refusal text, or null when the answer carried none. */
function rawText(e: HubError | undefined): string | null {
  const d = e?.data as { error?: unknown } | undefined;
  return typeof d?.error === 'string' ? d.error : null;
}

/** A 4xx refusal of an edit of program `id`, by the daemon's fixed sentences (anchored at the start, on this id). */
export function refusalOf(status: number | undefined, raw: string | null, id: string): 'notApplied' | 'unclear' | 'refused' {
  if (status !== 400) return 'refused';
  if (raw === null || raw.trim() === '') return 'unclear';
  return persistedThenFailed(raw, id) ? 'notApplied' : 'refused';
}

/** Sends the edit once. Never throws. */
export async function sendEdit(v: EditVars): Promise<EditVerdict> {
  const res = await editM.run(v);
  if (res.outcome === 'done') return { kind: 'saved' };
  if (res.outcome === 'pending') return { kind: 'pending', hold: res.hold };
  if (res.outcome === 'stale') return { kind: 'stale' };
  if (res.outcome === 'not_sent') return { kind: 'notSent', code: res.error?.code ?? null };
  const kind = refusalOf(res.error?.status, rawText(res.error), v.id);
  return kind === 'refused' ? { kind, error: res.error } : { kind };
}

// ── Core's holds of this lock ────────────────────────────────────────────────────────

const sameTarget = (h: HeldChange, t: Target) => h.target?.container.id === t.container.id && h.target?.project.id === t.project.id;

export interface EditHold {
  id: string;
  name: string;
  mark: string;
  hold: string | undefined;
  own: boolean;
}

/** The edits core holds on this computer (any realm: the lock names a program of one computer). */
export function editHolds(target: Target | null): EditHold[] {
  if (!target) return [];
  const out: EditHold[] = [];
  for (const h of heldChanges(EDIT_LOCK)) {
    if (!sameTarget(h, target)) continue;
    const i = (h.identity ?? {}) as { id?: unknown; name?: unknown; mark?: unknown };
    if ((typeof i.id !== 'string' && typeof i.id !== 'number') || typeof i.mark !== 'string') continue;
    out.push({ id: String(i.id), name: typeof i.name === 'string' ? i.name : '', mark: i.mark, hold: h.hold, own: editM.heldBy(h) === 'self' });
  }
  return out;
}

// The lock is keyed by {id} (lockKey), so the variables only need the id and the computer to name it.
const varsOf = (a: { id: string; name: string; target: Target }): EditVars => ({ id: a.id, name: a.name, command: '', body: {}, target: a.target });

// ── The attempt store ────────────────────────────────────────────────────────────────

export type EditStatus = 'working' | 'unknown' | 'refused' | 'notSent';

export interface EditAttempt {
  id: string;
  /** The name the send asked for (the program's name once it is stored). */
  name: string;
  /** mark() of the name and command the send asked for: what a read-back must show. */
  mark: string;
  /** The computer the edit went to; a read-back reads this one, never the current one. */
  target: Target;
  status: EditStatus;
  /** Unknown: the hold this send left in core. Absent: core holds nothing (the answer was a 2xx a read has not
   *  shown yet, or a refusal with no text), so a Dismiss only closes the note. */
  hold?: string;
  /** Unknown: the computer answered that it saved it; only a read has not shown it yet. */
  accepted?: boolean;
  /** Refused: the rejection. Not sent: its code. */
  error?: HubError;
  code?: string;
  checking?: boolean;
  /** A check found nothing new (shown once). */
  stuck?: boolean;
}

let attempts: ReadonlyMap<string, EditAttempt> = new Map();
const listeners = new Set<() => void>();
function commit(next: Map<string, EditAttempt>): void {
  attempts = next;
  for (const l of listeners) l();
}

// The store ends with the session, as parts/ops.ts's and parts/remove.ts's do: an attempt of the last session must not
// show, be checked or be said "saved" in the next one. A send or read-back still out then finds its attempt gone (the
// identity checks in runEdit and checkEdit) and says nothing. Hooked at the first attempt kept.
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

export const editStore = {
  get: (key: string): EditAttempt | undefined => attempts.get(key),
  set(key: string, a: EditAttempt): void {
    hookPurge();
    commit(new Map(attempts).set(key, a));
  },
  patch(key: string, p: Partial<EditAttempt>): void {
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
  snapshot: (): ReadonlyMap<string, EditAttempt> => attempts,
};

/** All edit attempts; re-renders on any change. */
export function useEditAttempts(): ReadonlyMap<string, EditAttempt> {
  return useSyncExternalStore(editStore.subscribe, editStore.snapshot, editStore.snapshot);
}

/** An edit that blocks every other action of its program: being sent, or not yet known. */
export function editBusy(a: EditAttempt | undefined): boolean {
  return !!a && (a.status === 'working' || a.status === 'unknown');
}

export type EditEnd = 'saved' | 'notApplied';

/**
 * Sends one Save and files what came back under `key`. Resolves with how it ended when the edit is known to be
 * stored (the caller says so and reads the list again), undefined otherwise (the attempt stays in the store: unknown
 * with Check again, refused, or not sent; a stale send leaves nothing).
 */
export async function runEdit(key: string, v: EditVars): Promise<EditEnd | undefined> {
  if (editBusy(editStore.get(key))) return undefined;
  const base = { id: v.id, name: v.name, mark: mark(v.name, v.command), target: v.target };
  editStore.set(key, { ...base, status: 'working' });
  const mine = editStore.get(key);
  const res = await sendEdit(v);
  // Only while the store still shows this send (a reset or another computer's attempt under the key is not it).
  if (editStore.get(key) !== mine) return undefined;
  if (res.kind === 'stale') {
    editStore.clear(key);
    return undefined;
  }
  if (res.kind === 'notApplied') {
    editStore.clear(key);
    return 'notApplied';
  }
  if (res.kind === 'refused') {
    editStore.set(key, { ...base, status: 'refused', ...(res.error ? { error: res.error } : {}) });
    return undefined;
  }
  if (res.kind === 'notSent') {
    // An earlier edit of this program may have gone through (core kept its hold): shown held, with what THAT send
    // asked for, never "not sent".
    const held = editHolds(v.target).find((h) => h.id === v.id);
    if (held && (res.code === 'READ_BACK_FIRST' || res.code === 'HELD_BY_OTHER')) editStore.set(key, { id: v.id, name: held.name, mark: held.mark, target: v.target, status: 'unknown', ...(held.hold ? { hold: held.hold } : {}) });
    else editStore.set(key, { ...base, status: 'notSent', ...(res.code ? { code: res.code } : {}) });
    return undefined;
  }
  // Saved by the computer's own answer, pending, or unclear: one read-back of the program decides what is said.
  editStore.set(key, { ...base, status: 'unknown', ...(res.kind === 'pending' && res.hold ? { hold: res.hold } : {}), ...(res.kind === 'saved' ? { accepted: true } : {}) });
  return (await checkEdit(key, editStore.get(key))) ? 'saved' : undefined;
}

/**
 * Check again: one fresh read of the program on the attempt's own computer, never a send. True when the read shows
 * the name and command the send asked for and (for a held send) core freed exactly that hold: the attempt is then
 * cleared. Anything else keeps it.
 */
export async function checkEdit(key: string, shown: EditAttempt | undefined): Promise<boolean> {
  const a = editStore.get(key);
  if (!shown || !a || a.status !== 'unknown' || a.checking || a.hold !== shown.hold) return false;
  editStore.patch(key, { checking: true });
  const mine = editStore.get(key);
  const current = () => editStore.get(key) === mine;
  const seen = await readEditable(a.id, a.target);
  if (!current()) return false;
  if (!seen || mark(seen.name, seen.command) !== a.mark) {
    editStore.patch(key, { checking: false, stuck: true });
    return false;
  }
  if (a.hold !== undefined) {
    const freed = await editM.complete(varsOf(a), a.hold);
    if (!current()) return false;
    // Core did not free it and still holds that send: the note stays and says where it stands.
    if (!freed && editHolds(a.target).some((h) => h.id === a.id && h.hold === a.hold)) {
      editStore.patch(key, { checking: false, stuck: true });
      return false;
    }
  }
  editStore.clear(key);
  return true;
}

/** Dismiss of the attempt its control showed. A held send goes only when core freed that hold (the person's warned
 *  Dismiss); a definite outcome, or an unknown one core holds nothing for, just closes. True when the note closed. */
export async function dismissEditAttempt(key: string, shown: EditAttempt): Promise<boolean> {
  if (shown.status === 'unknown' && shown.hold !== undefined && !(await editM.dismiss(varsOf(shown), shown.hold))) return false;
  const now = editStore.get(key);
  const same = shown.status === 'unknown' ? now?.status === 'unknown' && now.hold === shown.hold : now === shown;
  if (same) editStore.clear(key);
  return true;
}

export { editM as __editMutationForTests };
