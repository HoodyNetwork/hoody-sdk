// Delete a note: the answer rules and the attempt record (no React here, so the C9 rules are tested without a browser).
//   - Notes deletes a note for good, with everything inside it (it keeps no bin), so the page asks first (parts/DeleteNote.tsx).
//   - The delete is sent once. Only Notes' own `{ success: true }` is "deleted"; only Notes' own refusal is "not deleted".
//   - Any other answer is unknown: the attempt stays on record under its note (`<computer id>~<note id>`), outside the dialog
//     and the render, and offers only Check again, which reads the CAPTURED note through the Api that sent the delete. Nothing
//     is sent a second time while the attempt is on record.
//   - The read settles it only when Notes itself answers, and the page then says only what that read proves: the note is
//     not in this notebook any more (deleted, by this send or another, or moved: Notes answers both the same), the note is
//     still there (a delete still running in Notes may yet remove it), or the notebook itself cannot be found. A read
//     that cannot tell leaves the attempt as it was.
//   - The records end with the session (sessionRemoveAttempts): after a sign-out, the next person in this tab sees no
//     attempt of the last one, and an answer still out then finds its record gone and says nothing.
import { onAuthPurge } from '@core';
import type { RemoveApi, Settled } from './api';
import { notesCode } from './logic';
import type { Computer, Rejection } from './types';

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** removed: Notes said so. gone: this notebook holds no such note (deleted before, or moved to another notebook: never
 *  told as deleted). noNotebook: Notes cannot find the notebook (a refusal: nothing is known about the note).
 *  notSent: nothing left. cantRemove: Notes refused this person. protected: Notes wants its own sign-in. refused:
 *  another refusal of Notes' own. */
export type RemoveOutcome = 'removed' | 'gone' | 'noNotebook' | 'notSent' | 'unknown' | 'cantRemove' | 'protected' | 'refused';

/** The delete's answer table. A refusal counts only with a code Notes itself sends (logic.ts notesCode): an edge or
 *  proxy answer in between says nothing about the note, so it is unknown. */
export function removeOutcome(r: Settled): RemoveOutcome {
  if (r.ok) return obj(r.body) && r.body.success === true ? 'removed' : 'unknown';
  const e = r.err;
  if (!obj(e)) return 'unknown';
  const x = e as Rejection;
  if (x.notSent && !x.pending) return 'notSent';
  if (x.pending || x.stale || x.kind === 'pending') return 'unknown';
  const c = notesCode(e);
  const s = x.status ?? 0;
  if (x.kind === 'private' || s === 401 || s === 403) return c ? 'cantRemove' : x.kind === 'private' ? 'protected' : 'unknown';
  if (!c) return 'unknown';
  if (s === 404 && c === 'not_found') return 'gone';
  if (s === 404 && c === 'notebook_not_found') return 'noNotebook';
  return s >= 400 && s < 500 ? 'refused' : 'unknown';
}

/** The read after an unknown delete. there: Notes answered this very note. gone: Notes' own "not found" for the note.
 *  noNotebook: Notes' own "not found" for the notebook. Else unsure. */
export function presentOf(r: Settled, id: string): 'there' | 'gone' | 'noNotebook' | 'unsure' {
  if (r.ok) return obj(r.body) && r.body.id === id ? 'there' : 'unsure';
  const e = r.err;
  if (!obj(e) || (e as Rejection).stale) return 'unsure';
  const c = notesCode(e);
  if (e.status !== 404) return 'unsure';
  return c === 'not_found' ? 'gone' : c === 'notebook_not_found' ? 'noNotebook' : 'unsure';
}

/** The note a delete is for, captured when Delete was pressed. */
export interface RemoveTarget {
  /** `<computer id>~<note id>`: the row's id. */
  readonly key: string;
  readonly computer: Computer;
  /** The notebook the note was listed in. */
  readonly nb: string;
  readonly id: string;
  /** The title as the row showed it ('' for a note the list does not hold). */
  readonly title: string;
}

/** How an attempt ended. `there`: a read after an unknown answer found the note (all it proves: the note was there then). */
export type RemoveEnd = Exclude<RemoveOutcome, 'unknown'> | 'there';

export interface RemoveAttempt {
  readonly target: RemoveTarget;
  /** The Api that sent the delete: Check again reads through it. */
  readonly api: RemoveApi;
  /** sending: the delete is out. unknown: its answer said nothing. ended: settled (the record is gone). */
  phase: 'sending' | 'unknown' | 'ended';
  end?: RemoveEnd;
  /** With a refusal: Notes' answer, for the error's details. */
  err?: unknown;
}

export type OnRemoveEnd = (a: RemoveAttempt, end: RemoveEnd) => void;

export interface RemoveAttempts {
  get(key: string): RemoveAttempt | undefined;
  /** Sends the delete of `target`, once. null: that note already has an attempt on record, so nothing was sent. */
  send(target: RemoveTarget, api: RemoveApi, onEnd: OnRemoveEnd): RemoveAttempt | null;
  /** Check again: one read of the attempt's own note. true: the attempt is settled (by this read or already). */
  check(a: RemoveAttempt, onEnd: OnRemoveEnd): Promise<boolean>;
  subscribe(fn: () => void): () => void;
  /** Changes with every publish (a useSyncExternalStore snapshot). */
  version(): number;
  /** Drops every record without ending it: no onEnd runs, and an answer or read still out finds its record gone. */
  clear(): void;
}

export function createRemoveAttempts(): RemoveAttempts {
  const m = new Map<string, RemoveAttempt>();
  const subs = new Set<() => void>();
  let v = 0;
  const publish = () => {
    v++;
    for (const f of [...subs]) {
      try {
        f();
      } catch {
        /* the subscriber's */
      }
    }
  };
  // Only the record itself can end: a late answer of a replaced attempt changes nothing.
  const finish = (a: RemoveAttempt, end: RemoveEnd, onEnd: OnRemoveEnd): boolean => {
    if (m.get(a.target.key) !== a) return false;
    m.delete(a.target.key);
    a.phase = 'ended';
    a.end = end;
    publish();
    onEnd(a, end);
    return true;
  };
  return {
    get: (k) => m.get(k),
    send(target, api, onEnd) {
      if (m.has(target.key)) return null;
      const a: RemoveAttempt = { target, api, phase: 'sending' };
      m.set(target.key, a);
      publish();
      void api.remove(target.computer, target.nb, target.id).then((r) => {
        const o = removeOutcome(r);
        if (o === 'unknown') {
          if (m.get(target.key) === a) {
            a.phase = 'unknown';
            publish();
          }
          return;
        }
        if (!r.ok) a.err = r.err;
        finish(a, o, onEnd);
      }, () => {
        // An Api settles and never rejects; one that threw may still have sent: unknown, never "not deleted".
        if (m.get(target.key) === a) {
          a.phase = 'unknown';
          publish();
        }
      });
      return a;
    },
    async check(a, onEnd) {
      if (m.get(a.target.key) !== a) return true;
      if (a.phase !== 'unknown') return false;
      const p = presentOf(await a.api.present(a.target.computer, a.target.nb, a.target.id), a.target.id);
      if (m.get(a.target.key) !== a) return true;
      if (p === 'unsure') return false;
      return finish(a, p, onEnd);
    },
    subscribe: (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    version: () => v,
    clear() {
      if (m.size === 0) return;
      m.clear();
      publish();
    },
  };
}

/** A store whose records end with the session: `onPurge` (core's onAuthPurge) is hooked at the first delete sent, and every
 *  auth purge (sign-out, another account, Forget this browser) then clears it. */
export function sessionRemoveAttempts(onPurge: (fn: () => void) => unknown): RemoveAttempts {
  const s = createRemoveAttempts();
  let hooked = false;
  return {
    ...s,
    send(target, api, onEnd) {
      if (!hooked) {
        hooked = true;
        try {
          onPurge(() => { s.clear(); });
        } catch {
          /* a unit test's partial @core mock has no purge; the app's core always does */
        }
      }
      return s.send(target, api, onEnd);
    },
  };
}

/** The tab's delete attempts: they outlive the dialog, the row menu and the page, and end with the session. */
export const removeAttempts: RemoveAttempts = sessionRemoveAttempts((fn) => onAuthPurge(fn));
