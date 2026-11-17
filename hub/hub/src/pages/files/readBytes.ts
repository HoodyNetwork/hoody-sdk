// One file's bytes from a computer's files program, for readers outside the Files page (the AI composer's "From a computer…"
// source, the pictures a chat's step made). Pure: it loads only core and this folder's route and path modules, never the
// '@kit' barrel, so the kit graph (ask/pictures.tsx) may import it (app/kitGraph.test.ts). ./links re-exports both names.
import { download } from '@core';
import { blockedPath as refusedPath, partsOf } from './logic';
import { LIST_BYTES, folderRoute } from './routes';
import type { FilesComputer as ReadComputer } from './data';

/** The most one file read answers (the files route's own bound). */
export const FILE_READ_MAX = LIST_BYTES;
/** One file's bytes on one computer, read once and whole (the files program's getFile, the route a folder is listed by): nothing is
 *  kept or cached. null for a path the Files read never asks (the top folder, a name it refuses, a computer with no address yet); a
 *  file over `maxBytes` rejects unread with core's `too_large`, and any other failure rejects with core's rejection. The caller
 *  proves the path is a file first (its folder's listing): on a folder this read answers that folder's listing. */
export async function readFileBytes(c: ReadComputer, path: string, o: { maxBytes: number; signal?: AbortSignal }): Promise<Uint8Array | null> {
  const parts = partsOf(path);
  if (parts.length === 0 || refusedPath(path) || !c.project_id || !c.server_name) return null;
  const got = await download(folderRoute, {
    target: { project: { id: c.project_id }, container: { id: c.id, server_name: c.server_name } },
    params: { parts }, maxBytes: Math.min(o.maxBytes, FILE_READ_MAX), ...(o.signal ? { signal: o.signal } : {}),
  });
  return new Uint8Array(await new Blob(got.parts).arrayBuffer());
}
