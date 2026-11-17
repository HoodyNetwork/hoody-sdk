// One rule set for typing a path with a folder's entries offered: the composer's "@" picker (kit/agent/mention.ts)
// and PathField both use it. Paths are relative to a root the host chose and never leave it by name: a leading "/" or "~", or a
// ".." anywhere, is 'outside', and nothing is read for it. The host reads the folders (the kit knows no computer) and never goes
// into a link (the fence is a scope rule, not a security boundary).

/** One entry of a folder that is offered. */
export interface PathEntry {
  name: string;
  /** A real folder the picker may go into (the host says no for a link). */
  dir: boolean;
}

/** What the host knows of the folder being typed or browsed now. */
export interface PathReads {
  entries: readonly PathEntry[];
  reading?: boolean;
  failed?: boolean;
  /** The folder `entries` are of (relative, '' for the root, a trailing "/" otherwise), or null while none is read: entries of
   *  another folder than the one asked for are never offered (they are stale for one render, or one read, after a move). */
  dir?: string | null;
  /** The folder asked for is out of the root by a link (the host never reads it): said like a path out of the root. */
  outside?: boolean;
  /** The folder to read ('' for the root, "a/b/" below it), or null when nothing is asked: the host reads only while it is a
   *  string. Must keep one identity (useCallback). A new function is taken as another host: the field tells the old one
   *  want(null) and asks the new one. want(null) followed by want(dir) must be safe. */
  want: (dir: string | null) => void;
}

/** The folder part ("src/kit/", '' for none) and the name being typed; 'outside' for a path that may leave the root (a leading
 *  "/" or "~", or ".." anywhere: a name like "..x" too, rare and never a way up). */
export function pathSplit(text: string): { dir: string; name: string } | 'outside' {
  if (text.startsWith('/') || text.startsWith('~') || text.includes('..')) return 'outside';
  const cut = text.lastIndexOf('/') + 1;
  return { dir: text.slice(0, cut), name: text.slice(cut) };
}

/** Most entries offered at once. */
export const PATH_MAX = 50;

/** The entries for `name`: dotfiles only when `name` starts with "."; folders first, then files; names that start with it, then
 *  names that hold it; case ignored; at most PATH_MAX. */
export function pathMatches(entries: readonly PathEntry[], name: string): PathEntry[] {
  const q = name.toLowerCase();
  const dots = name.startsWith('.');
  const rank = (e: PathEntry): number | null => {
    // A typed dot asks for hidden names only (a name holding a dot elsewhere is not one of them).
    if (e.name.startsWith('.') !== dots) return null;
    const n = e.name.toLowerCase();
    const hit = n.startsWith(q) ? 0 : n.includes(q) ? 1 : null;
    return hit === null ? null : (e.dir ? 0 : 2) + hit;
  };
  const ranked: Array<{ e: PathEntry; r: number; i: number }> = [];
  entries.forEach((e, i) => { const r = rank(e); if (r !== null) ranked.push({ e, r, i }); });
  ranked.sort((a, b) => a.r - b.r || a.i - b.i);
  return ranked.slice(0, PATH_MAX).map((x) => x.e);
}

/** `entry` under `dir`: a folder ends in "/" (the next level is typed after it). */
export function pathJoin(dir: string, e: PathEntry): string {
  return dir + e.name + (e.dir ? '/' : '');
}

/** The folders above `dir` ("a/b/"), top first, as [path, name]: ['', ''], ['a/', 'a'], ['a/b/', 'b']. */
export function pathCrumbs(dir: string): Array<[string, string]> {
  const out: Array<[string, string]> = [['', '']];
  let at = 0;
  for (;;) {
    const i = dir.indexOf('/', at);
    if (i < 0) break;
    out.push([dir.slice(0, i + 1), dir.slice(at, i)]);
    at = i + 1;
  }
  return out;
}

/** The folder one up from `dir` ("a/b/" to "a/", "a/" to ''), '' at the root. */
export function pathUp(dir: string): string {
  const trimmed = dir.replace(/\/$/u, '');
  const i = trimmed.lastIndexOf('/');
  return i < 0 ? '' : trimmed.slice(0, i + 1);
}

/** Every entry of a folder, as Browse lists it: folders, then files, then hidden folders and files, each in the listing's order. */
export function browseOrder(entries: readonly PathEntry[]): PathEntry[] {
  const rank = (e: PathEntry) => (e.name.startsWith('.') ? 2 : 0) + (e.dir ? 0 : 1);
  return entries.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i).map((x) => x.e);
}
