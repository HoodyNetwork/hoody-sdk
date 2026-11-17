// Jump to's places on Files that the view does not draw now (manifest searchHide; the shell loads this, never the
// page). In a realm with no computer the page asks for one instead (view.tsx ComputerRequired): its tabs and questions
// are not drawn, except Transfers, which still opens there. While the list is read, or after a failed read (the
// page's failure, which a retry may clear), nothing is left out.
// Only page 1 of the computer list is read (core computersPage, the shell's shared read): "no computer" needs the
// whole list, and the list is known whole only when page 1 is all of it (core useComputersAll's contract), so the
// later pages Files itself walks would never change the answer.
import { computersPage, pickComputer, useCore } from '@core';
import type { SearchHide } from '@kit';
import { useMemo } from 'react';
import { computerOf, type FilesComputer } from './data';

/** What Files leaves out for this computer list; null: it draws every place (or the list is not known yet). */
export function filesHide(list: { rows: number | null; failed: boolean; complete: boolean }): SearchHide | null {
  return list.rows === 0 && list.complete && !list.failed ? { only: ['?tab=transfers'] } : null;
}

/** How many of a page's raw rows Files lists in this realm: core's one realm rule, as useFilesComputers keeps them. */
export function realmRows(raw: readonly unknown[], realm: string): number {
  const all = raw.map(computerOf).filter((c): c is FilesComputer => c !== null);
  return all.filter((c) => pickComputer([c], { realm, remembered: c.id }) === c).length;
}

/** A row the walk Files reads accepts: an object with a non-empty string id (core power.ts readPage). */
const readableRow = (r: unknown): boolean => {
  const id = r && typeof r === 'object' ? (r as { id?: unknown }).id : undefined;
  return typeof id === 'string' && id !== '';
};

/** filesHide's list from page 1's read: no answer yet → rows null; whole only when page 1 says it is all of the list. A
 *  page with a row the walk refuses is unreadable there (Files keeps its earlier rows and draws them), so it is a
 *  failed read here, never an empty list. */
type PageRead = { data?: { rows: readonly unknown[]; complete: boolean }; isError: boolean };
export function firstPageList(q: PageRead, realm: string): Parameters<typeof filesHide>[0] {
  if (q.data && !q.data.rows.every(readableRow)) return { rows: null, failed: true, complete: false };
  return { rows: q.data ? realmRows(q.data.rows, realm) : null, failed: q.isError, complete: !!q.data?.complete };
}

export default function useFilesSearchHide(): SearchHide | null {
  const q = computersPage.use();
  const realm = useCore().realm;
  const list = useMemo(() => firstPageList({ data: q.data, isError: q.isError }, realm), [q.data, q.isError, realm]);
  return filesHide(list);
}
