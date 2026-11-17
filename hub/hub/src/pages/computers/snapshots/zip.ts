// Files as .zip: the folder paths a person picks and the download address of each, built from the
// computer's own files-program address (programUrl), never a hard-coded host. The files program zips one folder per
// request and streams it; the browser saves it and shows the progress. A read, so nothing is held.
import { filesUrl } from '@core';

/** A folder path as the files program names it: absolute, no '.', '..' or empty parts, no backslash, '%' or control
 *  characters, at most 1024 characters. Returns the clean path ('/home/me'), or null when it is not one. The root
 *  itself is refused: one archive cannot hold a whole computer. */
export function zipPath(raw: string): string | null {
  const v = raw.trim();
  if (!v.startsWith('/') || v.length > 1024 || /[\\%\u0000-\u001f\u007f]/.test(v)) return null;
  const parts = v.split('/').filter((p) => p !== '');
  if (parts.length === 0 || parts.some((p) => p === '.' || p === '..')) return null;
  return '/' + parts.join('/');
}

/** The download address of a clean folder path under a files-program base address, or '' while the base is unknown.
 *  Built by core (filesUrl): a first part the files program would read as a command (stat, glob, its health check ...)
 *  goes with its first letter as %XX, which it takes as the folder's own name. */
export function zipUrl(base: string, path: string): string {
  return filesUrl(base, path.split('/').filter(Boolean), 'zip');
}

/** The file name the program gives the archive: the folder's own name plus .zip. */
export function zipName(path: string): string {
  return (path.split('/').pop() || 'folder') + '.zip';
}

/** Where the folder picker opens: the top of the computer, not a home folder. */
export const BROWSE_START = '/';

/** Folders offered before any is typed (an ordinary computer has them). */
export const START_FOLDERS = ['/root', '/home', '/etc'] as const;

/** At most this many folders in one list: each is its own download. */
export const MAX_FOLDERS = 10;
