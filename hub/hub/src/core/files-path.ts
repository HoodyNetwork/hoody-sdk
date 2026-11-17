// files-path.ts: the one helper for paths on a computer's files program. Routes, links
// and Backups build every files-program path here, never by hand.
//
// Contract, in plain words:
//   - pathPartsProblem(parts): why a list of path parts cannot be sent, or null. The parts are names kept exactly as
//     the computer has them: '%', '\' and control characters are fine (each part is percent-encoded when sent),
//     never refused or trimmed. The list is read once, element by element, into a plain copy that is checked and
//     encoded (a getter or an overridden method can never answer one thing to the check and another to the send).
//     Refused only what the files program cannot address: an empty part, '.' or '..', a
//     '/' or NUL inside a part, a first part that starts with '\' (hoody-files reads it as absolute
//     in its path normalization), or a path over MAX_PATH_BYTES (UTF-8, parts joined by '/').
//   - encodePathParts(method, parts, atFilesRoot): the path as sent, '/'-joined, each part encodeURIComponent'd.
//     atFilesRoot (the parts follow /api/v1/files directly): the files program reads a whole first segment that is
//     exactly one of its alias names (stat grep glob realpath append move copy chmod chown) as a command on that
//     alias's method, and /api/v1/files/health is its health check (HEAD is answered as GET, and the other methods
//     find no file there). Such a first part, 'health' included, is written with its first letter as
//     %XX on EVERY method, which the program decodes back to the folder's own name
//     (the program reads the segment raw). Never applied deeper: only the first segment is read so.
//   - filesUrl(base, parts, query): a direct link under a files-program base address (https only), built the same
//     way; '' while the base is unknown or the parts refused. The address is a credential: never shown in full,
//     never stored in a held change.
//   - normalizeDirPath(raw): the one canonical absolute folder path from typed or stored text, or null when it cannot
//     name one. It is absolute only ('~' is never expanded), drops repeated and trailing '/' and
//     '.' parts, refuses '..' (never resolved: /a/link/.. is the parent of the link's target), keeps every name exactly
//     (no trim, case or Unicode change), and its parts pass pathPartsProblem, so null means exactly a path the files
//     program cannot be asked about. Pure and idempotent. DirPicker and every page that reads its check go through it;
//     no other copy (guard std.dirPathCopy).
//   - lossyName(name): a name the files program already made lossy (it holds U+FFFD): shown, with its actions off,
//     because the name sent back would not name the same file.
//   - protectedPath(resolved, mounts): true when a resolved absolute path is '/', or is or is under a protected
//     system subtree (PROTECTED_ROOTS, '/lib*' meaning /lib, /lib32, /lib64, /libx32 ...), unless it lies strictly
//     inside one of the listed mounts (a storage or a PC share: their contents are not this computer's system).
//     A path that is not a clean absolute path ('//', a trailing '/', '.', '..' or NUL anywhere) is protected
//     (unknown is never a pass); a listed mount that is not clean exempts nothing.

export const FILES_ALIASES: readonly string[] = Object.freeze(['stat', 'grep', 'glob', 'realpath', 'append', 'move', 'copy', 'chmod', 'chown']);
/** Linux PATH_MAX: a longer path can never be named on the computer. */
export const MAX_PATH_BYTES = 4096;
export const PROTECTED_ROOTS: readonly string[] = Object.freeze(['/bin', '/boot', '/dev', '/etc', '/lib*', '/proc', '/run', '/sbin', '/sys', '/usr', '/var', '/hoody']);

const utf8 = new TextEncoder();

export type PathPartsProblem = 'not_list' | 'empty_part' | 'dot_part' | 'slash_in_part' | 'nul_in_part' | 'leading_backslash' | 'too_long';

// The parts read once each into a plain array (a part is at least one byte, so a list longer than the bound is
// refused before reading it), or the problem with the list itself.
function snapshot(parts: unknown): string[] | PathPartsProblem {
  if (!Array.isArray(parts)) return 'not_list';
  const n: unknown = parts.length;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return 'not_list';
  if (n > MAX_PATH_BYTES) return 'too_long';
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const p: unknown = parts[i];
    if (typeof p !== 'string' || p === '') return 'empty_part';
    out.push(p);
  }
  return out;
}

function problemOf(parts: readonly string[]): PathPartsProblem | null {
  let bytes = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p === '.' || p === '..') return 'dot_part';
    if (p.includes('/')) return 'slash_in_part';
    if (p.includes('\u0000')) return 'nul_in_part';
    if (i === 0 && p.charAt(0) === '\\') return 'leading_backslash';
    bytes += utf8.encode(p).length + (i ? 1 : 0);
  }
  return bytes > MAX_PATH_BYTES ? 'too_long' : null;
}

export function pathPartsProblem(parts: unknown): PathPartsProblem | null {
  const snap = snapshot(parts);
  return typeof snap === 'string' ? snap : problemOf(snap);
}

/** The first part as the files program must see it at /api/v1/files/<first>: an alias name or 'health' with its
 *  first letter percent-encoded (on every method), anything else as encodeURIComponent writes it. */
function firstPart(part: string): string {
  const enc = encodeURIComponent(part);
  if (!FILES_ALIASES.includes(part) && part !== 'health') return enc;
  return '%' + part.charCodeAt(0).toString(16).toUpperCase() + enc.slice(1);
}

/** The parts as sent ('a/b%20c'), or null when pathPartsProblem refuses them. */
export function encodePathParts(method: string, parts: readonly string[], atFilesRoot: boolean): string | null {
  void method; // every method is written the same way (see firstPart); kept so callers name what they send
  const snap = snapshot(parts);
  if (typeof snap === 'string' || problemOf(snap) !== null) return null;
  const out: string[] = [];
  for (let i = 0; i < snap.length; i++) out.push(i === 0 && atFilesRoot ? firstPart(snap[i]!) : encodeURIComponent(snap[i]!));
  return out.join('/');
}

/** A direct GET link to a path under the files program at `base` (https), or '' when it cannot be built. */
export function filesUrl(base: string, parts: readonly string[], query?: Readonly<Record<string, string>> | string): string {
  if (typeof base !== 'string' || !base.startsWith('https://')) return '';
  const enc = encodePathParts('GET', parts, true);
  if (enc === null) return '';
  const q = typeof query === 'string' ? query : query ? Object.keys(query).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(query[k]!)).join('&') : '';
  return base.replace(/\/+$/, '') + '/api/v1/files' + (enc ? '/' + enc : '') + (q ? '?' + q : '');
}

/** The parts of an absolute path ('/home/me' → ['home', 'me']); '/' → []. Null when it is not absolute. */
export function partsOfPath(path: string): string[] | null {
  if (typeof path !== 'string' || path.charAt(0) !== '/') return null;
  return path.split('/').filter((p) => p !== '');
}

/** One canonical absolute folder path from typed or stored text, or null when it cannot name one (see the contract). */
export function normalizeDirPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.charAt(0) !== '/' || raw.includes('\u0000')) return null;
  const parts: string[] = [];
  for (const p of raw.slice(1).split('/')) {
    if (p === '' || p === '.') continue;
    if (p === '..') return null;
    parts.push(p);
  }
  return pathPartsProblem(parts) === null ? '/' + parts.join('/') : null;
}

export function lossyName(name: string): boolean {
  return typeof name === 'string' && name.includes('�');
}

const inside = (path: string, root: string): boolean => path === root || path.startsWith(root + '/');

// An absolute path with no empty, '.' or '..' part and no NUL ('/' alone included), else null.
const cleanParts = (p: unknown): string[] | null => {
  if (typeof p !== 'string' || p.charAt(0) !== '/' || p.includes('\u0000')) return null;
  if (p === '/') return [];
  const parts = p.slice(1).split('/');
  return parts.some((x) => x === '' || x === '.' || x === '..') ? null : parts;
};

export function protectedPath(resolved: string, mounts: readonly string[] = []): boolean {
  const parts = cleanParts(resolved);
  if (!parts || parts.length === 0) return true;
  const path = '/' + parts.join('/');
  for (const m of mounts) {
    // A listed mount may end in '/'; anything else unclean, or the root, exempts nothing.
    const mparts = cleanParts(typeof m === 'string' && m.length > 1 ? m.replace(/\/$/, '') : m);
    if (mparts && mparts.length > 0 && path.startsWith('/' + mparts.join('/') + '/')) return false;
  }
  return PROTECTED_ROOTS.some((r) => (r.endsWith('*') ? new RegExp('^' + r.slice(0, -1) + '[^/]*(/|$)').test(path) : inside(path, r)));
}
