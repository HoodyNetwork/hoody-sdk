// byId.ts: one computer read by its exact id, for a pane a link names by id (`acid` / `bcid`,
// logic.ts ID_KEY). Read only when the realm's list Files holds does not have that id (a realm past the pages Files reads,
// or a list still in parts): the answer must be a computer of the realm shown, by core's one realm rule (pickComputer,
// as useFilesComputers), or the pane has no computer. Never matched by name or handle.
import { computerRuntimeRoute, defineQuery, pickComputer, useCore } from '@core';
import { computerOf, type FilesComputer } from './data';

// Core's route for GET /computers/:id (its runtime read asks ?runtime=true; this read asks for the computer alone).
const computerById = defineQuery<unknown, unknown, { id: string }>(computerRuntimeRoute, { input: (p) => ({ params: { id: p.id } }), select: (r) => (r && typeof r === 'object' ? (r as { data?: unknown }).data ?? null : null) });

/** The computer `id` names in the realm shown: `computer` as last read (null when the API has none, or not in this realm),
 *  `settled` once no read is going and one has answered or failed, `fresh` when the latest read itself found it. A link's
 *  ask needs `fresh`: an earlier answer kept while a new read is going or after it failed proves nothing (the computer may
 *  be gone since). `id` null reads nothing. */
export function useComputerById(id: string | null): { computer: FilesComputer | null; settled: boolean; fresh: boolean } {
  const realm = useCore().realm;
  const q = computerById.use({ id: id ?? '-' }, { enabled: id !== null });
  if (id === null) return { computer: null, settled: true, fresh: false };
  const c = q.data === undefined ? null : computerOf(q.data);
  // An answer that the computer is not there (404) outweighs an earlier read kept from before.
  const gone = q.isError && q.error?.status === 404;
  const mine = !gone && c && c.id === id && pickComputer([c], { realm, remembered: c.id }) === c ? c : null;
  const settled = !q.isFetching && (q.isError || q.data !== undefined);
  return { computer: mine, settled, fresh: settled && q.isSuccess && mine !== null };
}
