// data-hub-busy: the settle hook the e2e search proofs wait on (app/e2e-search.ts). A view root carries it only while it
// loads (rows kept on screen included); its absence means settled. Never a value: "false" would read as busy to a
// presence check. A test hook, never in published text. The kit is its only writer: DataTable marks its own root, and a
// page view root (the Logs list, Program output) takes useBusyMark on the ref it already has.
import { type RefObject, useLayoutEffect } from 'react';

/** The attribute to spread on a view root: present only while `loading`. Use useBusyMark instead when the root is a ref. */
export function busyMark(loading: boolean): { 'data-hub-busy'?: '' } {
  return loading ? { 'data-hub-busy': '' } : {};
}

/** Marks `ref`'s element while `loading`. A layout effect after every render: the mark changes in the same commit as the
 *  rows, before the browser can be read, and follows the element when the root is swapped. */
export function useBusyMark(ref: RefObject<HTMLElement | null>, loading: boolean): void {
  useLayoutEffect(() => {
    ref.current?.toggleAttribute('data-hub-busy', loading);
  });
}
