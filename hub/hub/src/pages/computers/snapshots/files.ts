// The files-program reads of Files as .zip, through core's kit transport (kit 'files', port 1, the same
// address as programUrl(c, 'files')). Reads only: a folder's subfolders for the picker, and the up-front count that
// estimates whether a folder fits one .zip. Each takes the folder as one multi-part path (core's `*parts`), which core
// writes (core/files-path.ts encodePathParts): a first part the files program would read as a command (stat, glob, its
// health check ...) goes with its first letter as %XX, so such a top folder is listed like any other.
// The picker still walks at most MAX_DEPTH parts; a deeper folder is typed, and its count is unknown.
import { coreSource, defineRoute, type SourceTable } from '@core';
import type { PathReads } from '@kit';
import { useCallback, useMemo, useState } from 'react';
import { subjectOf, targetOf, type Subject } from '../data';


export const MAX_DEPTH = 8;
/** The server's archive limit: more files than this never go in one .zip (hoody-files ARCHIVE_TOO_LARGE). */
export const ZIP_FILE_LIMIT = 100_000;
/** A pattern that names nothing, so the search walks the whole folder and only counts (total_scanned). */
const NO_MATCH = '**/.hoody-zip-count-probe-none';
const COUNT_QUERY = ['pattern', 'max_results', 'max_files_scanned', 'no_ignore', 'hidden', 'timeout'] as const;

/** The computer's top folder `/`: the files program lists it at its root, `GET /?json` (without
 *  `json` it answers its HTML page). There is no `GET /api/v1/files` without a path part. */
export const rootRoute = defineRoute({ method: 'GET', path: '/', scope: 'kit', kit: 'files', index: 1, query: ['json'], maxBytes: 2 * 1024 * 1024 });
/** A folder's listing, GET /api/v1/files/<folder> (at least one part). */
export const folderRoute = defineRoute({ method: 'GET', path: '/api/v1/files/*parts', scope: 'kit', kit: 'files', index: 1, maxBytes: 2 * 1024 * 1024 });
/** A folder's up-front count, GET /api/v1/files/glob/<folder>: the glob command, then the folder's parts. */
export const countRoute = defineRoute({ method: 'GET', path: '/api/v1/files/glob/*parts', scope: 'kit', kit: 'files', index: 1, query: [...COUNT_QUERY], timeoutMs: 40_000 });

/** One folder of one computer, as the reads take it. */
export interface FolderParams extends Subject { path: string }
/** The folder's own subfolders, sorted, or null when the answer is not a listing. */
export type Subfolders = string[] | null;
/** An estimate, never a proof: the search skips .git, stops at its depth limit without saying so, and counts folders
 *  too, while the archive counts files, takes .git and refuses a too-deep tree. under: at most ZIP_FILE_LIMIT files
 *  and folders were found (it likely fits); over: more were found (it may not fit); unknown: the count could not say
 *  (a timeout, a refusal, a folder too deep for a route). Every state keeps the download: only the archive knows. */
export type FolderCount = 'under' | 'over' | 'unknown';

const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const partsOf = (path: string): string[] => path.split('/').filter(Boolean);
// The top folder `/` is read at the root (no path); every other folder as its parts.
const params = (p: FolderParams): Record<string, string[]> => { const parts = partsOf(p.path); return parts.length ? { parts } : {}; };
// Core builds a read's key from its input even while the read is off: no target without a placed computer.
const where = (p: FolderParams) => (p.id && p.project && p.server ? { target: targetOf(p), params: params(p) } : { params: params(p) });

const folderName = (x: Record<string, unknown> | undefined, isDir: boolean): string[] =>
  x && isDir && typeof x.name === 'string' && x.name && !x.name.includes('/') ? [x.name] : [];

/** GET /api/v1/files/<folder> → its subfolders (FileListing entries with is_dir). */
export function subfoldersOf(raw: unknown): Subfolders {
  const d = obj(raw);
  if (!d || !Array.isArray(d.entries)) return null;
  return d.entries.flatMap((e) => { const x = obj(e); return folderName(x, x?.is_dir === true); }).sort((a, b) => a.localeCompare(b));
}

/** GET /?json (listRootDirectory) → the top folder's subfolders. This listing has its own shape (DirectoryListing):
 *  paths[] with name and path_type, a folder being Dir or SymlinkDir. */
export function rootSubfoldersOf(raw: unknown): Subfolders {
  const d = obj(raw);
  if (!d || !Array.isArray(d.paths)) return null;
  return d.paths
    .flatMap((e) => { const x = obj(e); return folderName(x, x?.path_type === 'Dir' || x?.path_type === 'SymlinkDir'); })
    .sort((a, b) => a.localeCompare(b));
}

/** A glob answer that walked the whole folder within the budget is under; one stopped by the budget past the limit
 *  is over; anything else is unknown. */
export function countOf(raw: unknown): FolderCount {
  const d = obj(raw);
  const n = d?.total_scanned;
  if (!d || typeof n !== 'number' || typeof d.truncated !== 'boolean') return 'unknown';
  if (!d.truncated && n <= ZIP_FILE_LIMIT) return 'under';
  if (d.truncated && n > ZIP_FILE_LIMIT) return 'over';
  return 'unknown';
}

const reads: Record<string, NonNullable<SourceTable['reads']>[string]> = {
  folder0: { route: rootRoute, input: (p: FolderParams) => ({ ...where(p), query: { json: '' } }), select: (raw) => rootSubfoldersOf(raw), staleTime: 30_000 },
};
reads.folder = { route: folderRoute, input: (p: FolderParams) => where(p), select: (raw) => subfoldersOf(raw), staleTime: 30_000 };
reads.count = {
  route: countRoute,
  input: (p: FolderParams) => ({
    ...where(p),
    query: { pattern: NO_MATCH, max_results: 1, max_files_scanned: ZIP_FILE_LIMIT + 1, no_ignore: true, hidden: true, timeout: 30 },
  }),
  select: (raw) => countOf(raw),
  staleTime: 60_000,
};

const source = coreSource('computers', { reads });

type Who = Parameters<typeof subjectOf>[0];
const depthOf = (path: string) => partsOf(path).length;
const fp = (c: Who, path: string): FolderParams => ({ ...subjectOf(c), path });
/** A computer whose project, id and server are known: only then is there a files-program address to read. */
const placed = (c: Who): boolean => { const x = subjectOf(c); return !!(x.id && x.project && x.server); };

/** A folder's subfolders (the top folder `/` included), read while `enabled` (the picker is open on it). */
export function useSubfolders(c: Who, path: string, enabled: boolean) {
  const n = depthOf(path);
  const ok = n <= MAX_DEPTH && placed(c);
  return source.useQuery<Subfolders, FolderParams>(n === 0 ? 'folder0' : 'folder', fp(c, path), { enabled: enabled && ok });
}

/** The up-front count of a folder, read while `enabled` (before its Download shows). A folder deeper than the
 *  picker walks (MAX_DEPTH) counts as unknown without a read. */
export function useFolderCount(c: Who, path: string, enabled: boolean): { count: FolderCount | undefined; checking: boolean } {
  const n = depthOf(path);
  const ok = n >= 1 && n <= MAX_DEPTH && placed(c);
  const q = source.useQuery<FolderCount, FolderParams>('count', fp(c, path), { enabled: enabled && ok });
  if (!enabled) return { count: undefined, checking: false };
  // Too deep, no address, or a failed read: the count cannot say.
  if (!ok || q.isError) return { count: 'unknown', checking: false };
  return { count: q.data, checking: q.data === undefined };
}

/** The reads behind a kit PathField rooted at the computer's top folder (its value is the path without the leading
 *  "/"): the field asks for one folder at a time and is offered that folder's subfolders, never another folder's. A
 *  folder deeper than the picker walks, or a computer that cannot be read, lists nothing; the typed path stays the value. */
export function useFolderPathReads(c: Who): PathReads {
  const [dir, setDir] = useState<string | null>(null);
  const want = useCallback((d: string | null) => setDir(d), []);
  const path = '/' + (dir ?? '').replace(/\/+$/, '');
  const q = useSubfolders(c, path, dir !== null);
  const listed = dir !== null && Array.isArray(q.data) ? q.data : null;
  const failed = dir !== null && !listed && (q.isError || q.data === null || depthOf(path) > MAX_DEPTH || !placed(c));
  return useMemo(
    () => ({ entries: listed ? listed.map((name) => ({ name, dir: true })) : [], dir: listed ? dir : null, reading: dir !== null && !listed && !failed, failed, want }),
    [listed, dir, failed, want],
  );
}
