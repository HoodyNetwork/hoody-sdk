// Which programs may not be changed now, in both directions:
//  - useSandboxBusy (the list's row actions and run(), view.tsx; the inspector's, Detail.tsx): a sandbox save of the
//    program is still out (this tab's, or any tab's: core sendingChanges), held (core, any sender) or unclear (this
//    tab's note), so Start, Stop, Restart
//    and the boot switch wait until it is settled: a sandbox save can itself restart the program, and two changes in
//    flight leave neither outcome readable.
//  - lifecycleBusy (the Sandbox panel): a start, stop, restart or boot change of the program is held or in flight
//    (this page's op, or any tab's request still out: core sendingChanges), so no sandbox save is sent until it is
//    settled. The same while a removal of the program (parts/remove.ts) is out or held, in any tab.
//  - editOut: an edit of the program (parts/edit.ts) is out or held in any tab. The Sandbox panel waits for it through
//    lifecycleBusy; the row actions, Edit and Remove through the edit hook's busy (parts/EditProgram.tsx).
// The two locks differ, so core's admission never refuses the overlap: each side reads the other's sends and holds.
import { programLock, sendingChanges, useChangesVersion, useCurrentComputer, type Target } from '@core';
import { useCallback } from 'react';
import { coreHolds } from '../data';
import { EDIT_LOCK, editHolds } from '../parts/edit';
import { isHeld, opKey, type Op } from '../parts/ops';
import { REMOVE_LOCK, removeHolds } from '../parts/remove';
import { SANDBOX_LOCK, sandboxHold, sandboxSending, usePart, useSandboxSendsVersion } from './data';
import { getNote, useNotesVersion } from './notes';

const LIFECYCLE_LOCKS: readonly string[] = [programLock.start, programLock.stop, programLock.restart, programLock.boot];

/** A request of one of `locks` out in any tab (core sendingChanges, this account, no realm filter: these locks are
 *  per computer) that names program `id` on this computer. Ends with its answer or its stamp's expiry; a pending or
 *  unknown outcome is then listed held instead (sandboxHold / coreHolds). Only this page's own holds show Check again
 *  and Dismiss; another sender's hold is read-only here. A row core cannot attribute (no identity or target; core
 *  keeps it listed while its outcome is unknown, past its stamp and once pending) can be tied to no program and
 *  Programs can show no control for it, so it blocks none: never every program on every computer, with no way out.
  *  Re-renders ride useChangesVersion. */
function sendOut(locks: readonly string[], id: string, target: Target | null): boolean {
  if (!target) return false;
  return locks.some((lock) =>
    sendingChanges(lock).some((c) => {
      if (!c.attributed) return false;
      const of = (c.identity ?? {}) as { id?: unknown };
      return c.target?.container.id === target.container.id && c.target?.project.id === target.project.id && (typeof of.id === 'string' || typeof of.id === 'number') && String(of.id) === id;
    }),
  );
}

/** True while a sandbox save of this program on this computer is out (this tab's, or any tab's request), held or
 *  unclear. */
export function sandboxBusy(part: string, target: Target | null, rowKey: string, id: string): boolean {
  return sandboxSending(id, target) || sendOut([SANDBOX_LOCK], id, target) || sandboxHold(id, target) !== undefined || getNote(`${part}|${rowKey}`)?.outcome.kind === 'unclear';
}

/** The predicate for the list (re-renders on every lock or note change). */
export function useSandboxBusy(): (rowKey: string, id: string) => boolean {
  const changes = useChangesVersion();
  const notes = useNotesVersion();
  const sends = useSandboxSendsVersion();
  const target = useCurrentComputer();
  const part = usePart();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the versions are the change signal for the reads inside
  return useCallback((rowKey: string, id: string) => sandboxBusy(part, target, rowKey, id), [changes, notes, sends, part, target]);
}

/** A start, stop, restart or boot change of this program whose request is out in any tab, or that core holds (any
 *  sender). Remove reads it (parts/RemoveProgram.tsx): no removal is asked or sent meanwhile. */
export function lifecycleOut(target: Target | null, rowKey: string, id: string): boolean {
  return sendOut(LIFECYCLE_LOCKS, id, target) || coreHolds(target).some((h) => h.rowKey === rowKey);
}

/** A removal of this program whose request is out in any tab, or that core holds (any sender): its outcome is not
 *  known yet, so no other change of the program is sent meanwhile. */
export function removalOut(target: Target | null, id: string): boolean {
  return sendOut([REMOVE_LOCK], id, target) || removeHolds(target).some((h) => h.id === id);
}

/** An edit of this program (its name or command) whose request is out in any tab, or that core holds (any sender):
 *  its outcome is not known yet and its save can restart the program, so no other change of the program is offered
 *  or sent meanwhile. This tab's attempt store (parts/edit.ts) knows only this tab's sends. */
export function editOut(target: Target | null, id: string): boolean {
  return sendOut([EDIT_LOCK], id, target) || editHolds(target).some((h) => h.id === id);
}

/** True while a start, stop, restart or boot change of this program is held (core, any sender), its request is out
 *  in any tab, or this page's op for it is working or may have gone through; and while a removal or an edit of it is
 *  out or held (any tab). */
export function lifecycleBusy(target: Target | null, op: Op | undefined, rowKey: string, id: string): boolean {
  return isHeld(op) || lifecycleOut(target, rowKey, id) || removalOut(target, id) || editOut(target, id);
}
export { opKey };
