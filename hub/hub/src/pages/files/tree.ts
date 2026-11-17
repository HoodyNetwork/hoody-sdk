// A folder copy's tree walk and tree compare, pure: no React, no core.
//
// Contract, in plain words:
//   - manifestOf(raw) reads one folder listing of the files program with each entry's own type (`listing_manifest`:
//     type, size from lstat, `name_lossy`, and the entries it could not read in `skipped`). An entry without a type,
//     a listing without its `skipped` list (an older files program) or a skipped row without a name and a reason is
//     no listing: null, never a guess and no older shape. A type it does not know is 'unknown' (not
//     copied). Anything that is not a listing, or an entry it cannot read, is null: never a shorter tree.
//   - walkTree(src, dest, at) walks the folder being copied, one listing per folder, by what `at` has read: reading
//     (the folders still needed), failed (a read failed), refused (why it cannot be copied and checked from the Hub),
//     or done (its folders, files with sizes, links, and the pipes, sockets and devices the files program leaves out).
//     Refused: an entry the listing could not read ('unreadable': the copy would stop part
//     way); a name the Hub cannot read back at either end ('names': lossy, or one core cannot address); a path past
//     the deepest folder core reads, at either end ('deep'); over WALK_MAX_ENTRIES entries or WALK_MAX_FOLDERS
//     folders ('big', said as soon as it is known). A path is judged at the source and where it goes, since the two
//     sit at different depths.
//     A link whose target the listing does not give as the link's own text is listed in `opaque`: it is copied, but
//     a lost answer cannot be checked against it. The files program gives a relative target as written, but an
//     absolute one normalized from its serve root (two different targets can read the same) and one leading out as
//     '[external]'; a lossy name or no target is no text either.
//   - compareTrees(src, dest, walked, at, hashAt) says whether the destination holds this copy: every folder, every
//     link with the same target text, and every file with the same size and then the same SHA-256, both read now.
//     Items missing or different count, a missing folder with everything under it (nothing under it is read); every
//     file there with the same size is hashed before a count is given, so the count is exact. A failed read or an
//     unreadable entry at the destination fails it, and a link it cannot compare leaves it
//     unchecked (no verdict either way). Items at the destination the source does not have are not this copy's.
//     A count comes with what it is made of (Copy the rest): the items whose name is free (a missing
//     folder once) and the ones whose name holds something else.
import { blockedPath, joinPath } from './logic';

export type EntryType = 'file' | 'dir' | 'symlink' | 'fifo' | 'socket' | 'device' | 'unknown';
export interface MEntry { readonly name: string; readonly type: EntryType; readonly size: number; readonly lossy: boolean; readonly target?: string }
export interface Manifest { readonly entries: readonly MEntry[]; readonly skipped: number }
/** What a read gave: the value, 'failed', or undefined when it has not answered yet. */
export type Got<T> = T | 'failed' | undefined;
export type ListingAt = (path: string) => Got<Manifest>;
/** A SHA-256 read as compareTrees takes it; 'unknown': asked, and no answer came in its time (data.ts HASH_READ_MS). */
export type HashAt = (path: string) => Got<string> | 'unknown';

/** One copy the Hub can check: at most this many entries and folders, the folder itself counted
 *  in both. */
export const WALK_MAX_ENTRIES = 2000;
export const WALK_MAX_FOLDERS = 200;

const TYPES: ReadonlySet<string> = new Set(['file', 'dir', 'symlink', 'fifo', 'socket', 'device', 'unknown']);
const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const own = (o: Record<string, unknown>, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

export function manifestOf(raw: unknown): Manifest | null {
  const d = obj(raw);
  if (!d || !Array.isArray(own(d, 'entries'))) return null;
  const list = own(d, 'entries') as unknown[];
  const out: MEntry[] = [];
  const skipped = own(d, 'skipped');
  if (!Array.isArray(skipped)) return null;
  for (const s of skipped) { const x = obj(s); if (!x || typeof own(x, 'name') !== 'string' || typeof own(x, 'reason') !== 'string') return null; }
  for (const e of list) {
    const x = obj(e);
    const name = x && own(x, 'name');
    const size = x && own(x, 'size');
    if (!x || typeof name !== 'string' || !name || name.includes('/') || typeof own(x, 'is_dir') !== 'boolean') return null;
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) return null;
    const type = own(x, 'type');
    if (typeof type !== 'string') return null;
    const target = own(x, 'target');
    out.push({ name, type: TYPES.has(type) ? (type as EntryType) : 'unknown', size, lossy: own(x, 'name_lossy') === true, ...(typeof target === 'string' ? { target } : {}) });
  }
  return { entries: out, skipped: skipped.length };
}

export interface Walked {
  /** Folders, relative to the folder copied ('' is that folder), parents before children. */
  readonly dirs: readonly string[];
  readonly files: readonly { readonly rel: string; readonly size: number }[];
  readonly links: readonly { readonly rel: string; readonly target: string }[];
  /** Links whose target cannot be compared (see comparable): copied, never checked. */
  readonly opaque: readonly string[];
  /** Pipes, sockets, devices and types the files program does not copy. */
  readonly left: readonly string[];
}
export type WalkRefusal = 'unreadable' | 'names' | 'deep' | 'big';
export type Walk = { readonly state: 'reading'; readonly need: readonly string[] } | { readonly state: 'failed' } | { readonly state: 'refused'; readonly why: WalkRefusal } | ({ readonly state: 'done' } & Walked);

const relJoin = (rel: string, name: string) => (rel ? `${rel}/${name}` : name);
/** A link target the Hub can compare as the link's own text: given, relative (the files program gives
 *  those as written; an absolute one is normalized), not the program's redaction, not a lossy name. */
const comparable = (t: string | undefined): t is string => typeof t === 'string' && t !== '' && !t.startsWith('/') && t !== '[external]' && !t.includes('\uFFFD');
const abs = (root: string, rel: string) => (rel ? joinPath(root, rel) : root);
/** Why a path at either end cannot be read back by the Hub, or null. */
function unreadable(src: string, dest: string, rel: string): 'names' | 'deep' | null {
  let deep = false;
  for (const p of [abs(src, rel), abs(dest, rel)]) {
    // blockedPath says 'deep' only for a path whose names are all readable: any other answer is a name.
    const b = blockedPath(p);
    if (b === 'deep') deep = true;
    else if (b) return 'names';
  }
  return deep ? 'deep' : null;
}

export function walkTree(src: string, dest: string, at: ListingAt): Walk {
  const dirs: string[] = [''];
  const files: { rel: string; size: number }[] = [];
  const links: { rel: string; target: string }[] = [];
  const opaque: string[] = [];
  const left: string[] = [];
  const need: string[] = [];
  let failed = false;
  let refused: WalkRefusal | null = null;
  let entries = 1;
  for (let i = 0; i < dirs.length && !refused; i++) {
    const rel = dirs[i]!;
    const m = at(abs(src, rel));
    if (m === undefined) { need.push(abs(src, rel)); continue; }
    if (m === 'failed') { failed = true; continue; }
    if (m.skipped > 0) { refused = 'unreadable'; break; }
    entries += m.entries.length;
    for (const e of m.entries) {
      const r = relJoin(rel, e.name);
      if (e.type === 'fifo' || e.type === 'socket' || e.type === 'device' || e.type === 'unknown') { left.push(r); continue; }
      const why = e.lossy ? 'names' : unreadable(src, dest, r);
      // A name the Hub cannot read back outranks depth: it can never be checked, wherever it is copied.
      if (why === 'names') { refused = 'names'; break; }
      if (why) { refused ??= why; continue; }
      if (e.type === 'dir') dirs.push(r);
      else if (e.type === 'symlink') { if (comparable(e.target)) links.push({ rel: r, target: e.target }); else opaque.push(r); }
      else files.push({ rel: r, size: e.size });
    }
    if (entries > WALK_MAX_ENTRIES || dirs.length > WALK_MAX_FOLDERS) refused = 'big';
  }
  if (refused) return { state: 'refused', why: refused };
  if (failed) return { state: 'failed' };
  if (need.length) return { state: 'reading', need };
  return { state: 'done', dirs, files, links, opaque, left };
}

/** differs: `count` counts every item missing or different, a missing folder with everything under it; `missing` and
 *  `different` list what the rest is made of, each a path relative to the copy: `missing` the items
 *  whose name is free in a folder that is there (a missing folder once, never what is under it), `different` the
 *  ones whose name holds something else (a folder whose name a file took counts here, with nothing under it). */
export type Compare = { readonly state: 'reading'; readonly folders: readonly string[]; readonly hashes: readonly string[] } | { readonly state: 'failed' } | { readonly state: 'unchecked' } | { readonly state: 'differs'; readonly count: number; readonly missing: readonly string[]; readonly different: readonly string[] } | { readonly state: 'equal' };

const parentRel = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
const leafOf = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1);

export function compareTrees(src: string, dest: string, w: Walked, at: ListingAt, hashAt: HashAt): Compare {
  // The destination listing of each source folder that is there; a folder not there has no listing to read.
  const listed = new Map<string, Manifest>();
  const absent = new Set<string>();
  const folders: string[] = [];
  let failed = false;
  let missing = 0;
  const gone: string[] = [], other: string[] = [];
  // Listed only where the parent folder is there (read); under a missing folder only counted.
  const note = (rel: string, e: MEntry | undefined) => { if (listed.has(parentRel(rel))) (e ? other : gone).push(rel); };
  const entryIn = (rel: string): MEntry | undefined => listed.get(parentRel(rel))?.entries.find((e) => e.name === leafOf(rel));
  // Folders come parents first: a folder is there only when its parent is and lists it as a folder.
  for (const rel of w.dirs) {
    const there = rel === '' || (!absent.has(parentRel(rel)) && listed.has(parentRel(rel)) && entryIn(rel)?.type === 'dir');
    if (rel !== '' && (absent.has(parentRel(rel)) || listed.has(parentRel(rel))) && !there) { absent.add(rel); missing++; note(rel, entryIn(rel)); continue; }
    if (rel !== '' && !listed.has(parentRel(rel))) continue; // its parent is not read yet
    const m = at(abs(dest, rel));
    if (m === undefined) { folders.push(abs(dest, rel)); continue; }
    if (m === 'failed' || m.skipped > 0) { failed = true; continue; }
    listed.set(rel, m);
  }
  if (failed) return { state: 'failed' };
  if (folders.length) return { state: 'reading', folders, hashes: [] };
  const sameSize: string[] = [];
  for (const f of w.files) {
    // Under a missing folder entryIn finds nothing (only folders that are there are listed).
    const e = entryIn(f.rel);
    if (!e || e.type !== 'file' || e.size !== f.size) { missing++; note(f.rel, e); }
    else sameSize.push(f.rel);
  }
  let unchecked = w.opaque.length > 0;
  for (const l of w.links) {
    const e = entryIn(l.rel);
    if (e?.type !== 'symlink') { missing++; note(l.rel, e); }
    else if (!comparable(e.target)) unchecked = true;
    else if (e.target !== l.target) { missing++; note(l.rel, e); }
  }
  const hashes: string[] = [];
  let differ = 0;
  for (const rel of sameSize) {
    const a = hashAt(abs(src, rel)), b = hashAt(abs(dest, rel));
    if (a === 'failed' || b === 'failed') { failed = true; continue; }
    if (a === undefined || b === undefined) { hashes.push(abs(src, rel), abs(dest, rel)); continue; }
    // A read that never answered proves nothing either way: unchecked, never equal; a failure elsewhere still wins.
    if (a === 'unknown' || b === 'unknown') { unchecked = true; continue; }
    if (a !== b) { differ++; other.push(rel); }
  }
  if (failed) return { state: 'failed' };
  if (hashes.length) return { state: 'reading', folders: [], hashes };
  if (unchecked) return { state: 'unchecked' };
  return missing + differ ? { state: 'differs', count: missing + differ, missing: gone, different: other } : { state: 'equal' };
}
