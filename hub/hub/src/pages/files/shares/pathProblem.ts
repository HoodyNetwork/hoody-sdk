// Whether a folder can be shared, judged before anything is sent. A mirror of the API's path check
// (the API's own rules, in its order) plus what the Hub alone knows: a folder
// on connected storage is another disk, not this computer's. The API stays the judge; the Hub only disables Share
// with the reason, so a drift here can hide Share from a folder the API would take, never send one it refuses.
import { foreignDisk, type MountRef } from '../plan';

export type SharePathProblem =
  | 'empty' | 'chars' | 'long' | 'relative' | 'dots' | 'root' | 'system' | 'received' | 'connected';

const MAX_PATH_LENGTH = 1000;
const VALID_CHARS = /^[a-zA-Z0-9/\-_.()]+$/;
const ROOTS = ['/', '/hoody'];
// Where received shares appear (now and before /hoody/shares): a received folder is never shared on.
const RECEIVED = ['/hoody/shares', '/hoody/containers'];
const SYSTEM = ['/proc', '/sys', '/dev', '/boot', '/run', '/var/run'];

/** The mirrored API rules, for api.contract.test.ts (it compares them with the API's own constants). */
export const SHARE_PATH_RULES = { maxLength: MAX_PATH_LENGTH, validChars: VALID_CHARS, roots: ROOTS, received: RECEIVED, system: SYSTEM } as const;

const under = (path: string, root: string) => path === root || path.startsWith(root + '/');

/** The path the API stores for a folder: repeated and trailing slashes collapsed. Dot segments are refused, not resolved. */
export function sharePathOf(path: string): string {
  return '/' + path.split('/').filter((s) => s !== '').join('/');
}

/** Why this folder cannot be shared, or null. `mounts` is the computer's connected storage, when known. */
export function sharePathProblem(path: string, mounts: readonly MountRef[] = []): SharePathProblem | null {
  if (path === '') return 'empty';
  if (path.includes('\0') || !VALID_CHARS.test(path)) return 'chars';
  if (path.length > MAX_PATH_LENGTH) return 'long';
  if (!path.startsWith('/')) return 'relative';
  if (path.split('/').some((s) => s === '.' || s === '..')) return 'dots';
  const p = sharePathOf(path);
  if (p.includes('..')) return 'dots';
  if (ROOTS.includes(p)) return 'root';
  if (RECEIVED.some((r) => under(p, r))) return 'received';
  if (SYSTEM.some((r) => under(p, r))) return 'system';
  if (foreignDisk(p, mounts)) return 'connected';
  return null;
}
