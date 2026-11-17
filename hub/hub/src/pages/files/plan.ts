// The Files page's change rules, pure: no React, no core.
//
// Contract, in plain words:
//   - nameProblem(name, parent, taken?): why a new name (New folder, Rename) cannot be sent, or null. It refuses
//     what the files program refuses or changes (empty, `/` or `\`, `.`/`..`, leading or trailing spaces, which it
//     trims: Rust's trim also takes U+0085, a C1 control, refused anywhere), what core cannot address yet (a control
//     character or `%` in a part, a name over 256 characters, an
//     alias as the first part, past MAX_DEPTH: logic.ts blockedPath), and a name already in the folder.
//   - protectedPath(real): a resolved path inside /bin /boot /dev /etc /lib* /proc /run /sbin /sys /usr /var /hoody
//     (/lib* = /lib, /lib32, /lib64, /libx32),
//     except mount contents (/run/hoody-files/vfs/…, /hoody/mounts/permanent/…). renameTyped asks a typed name to
//     rename one. foreignDisk(real, mounts): inside a storage or a PC share, not this computer's own disk.
//   - planDelete(items, realOf, mounts): the ONE delete planner: every entry point that deletes (button, key,
//     row menu, a selection) asks it. It refuses `/`, a mount point and any folder holding one (judged on the resolved
//     path too), and every folder delete while the open storages are not known for sure. It asks a typed name for a
//     protected path, any folder (this kit has no complete listing, so a folder's count is unknown), and anything
//     on another disk; an unknown storage list makes a file typed too. Several items are always typed (their count).
//     Shared folders: it refuses where received folders appear (/hoody/shares), each received folder itself
//     (its root is a mount, not a folder of this computer) and a folder holding them; what is inside a received folder
//     is another computer's (typed, `received`); an item that is, holds or is inside a folder this computer shares
//     (`sharedOut`: the source paths of its shares and, where read, where each resolves), judged on the selected path
//     and on where it resolves, is typed and marked `shared`.
//   - storageIn(path, real, mounts): the open storage at or under a folder (either spelling), for delete and rename.
//   - mkdirProved / renameProved / deleteProved: what a fresh listing of the parent folder proves about a change that
//     may have gone through (core `proves`): 'applied', 'not_applied', or undefined (no verdict: it stays held).
//     A listing of another folder or another computer proves nothing, and neither does an entry whose version the
//     listing cannot establish (size and modified time for a file, modified time for a folder).
import { blockedPath, joinPath, nameIn, parentOf, partsOf, type Entry } from './logic';
import { compareTrees, walkTree, type Manifest } from './tree';

export type NameProblem = 'empty' | 'spaces' | 'dots' | 'chars' | 'long' | 'deep' | 'alias' | 'taken';
const CONTROL_OR_SLASH = /[/\\%\u0000-\u001f\u007f-\u009f]/;

export function nameProblem(name: string, parent: string, taken: readonly string[] = []): NameProblem | null {
  if (!name.trim()) return 'empty';
  if (name !== name.trim()) return 'spaces';
  if (name === '.' || name === '..') return 'dots';
  if (CONTROL_OR_SLASH.test(name)) return 'chars';
  if (name.length > 256) return 'long';
  const b = blockedPath(joinPath(parent, name));
  if (b === 'deep' || b === 'alias') return b;
  if (b) return 'chars';
  return taken.includes(name) ? 'taken' : null;
}

const PROTECTED = ['/bin', '/boot', '/dev', '/etc', '/proc', '/run', '/sbin', '/sys', '/usr', '/var', '/hoody'];
const MOUNT_ROOTS = ['/run/hoody-files/vfs', '/hoody/mounts/permanent'];
const inside = (path: string, root: string) => path === root || path.startsWith(root + '/');

export function protectedPath(real: string): boolean {
  if (MOUNT_ROOTS.some((r) => inside(real, r) && real !== r)) return false;
  return PROTECTED.some((r) => inside(real, r)) || /^\/lib(32|64|x32)?(\/|$)/.test(real);
}

export interface MountRef { readonly path: string; readonly label: string }
export interface Mounts { readonly complete: boolean; readonly items: readonly MountRef[] }

export function foreignDisk(real: string, mounts: readonly MountRef[]): boolean {
  return MOUNT_ROOTS.some((r) => inside(real, r) && real !== r) || mounts.some((m) => inside(real, m.path));
}

// Where folders shared by other computers appear: each direct child is one share's mount.
const SHARES_ROOT = '/hoody/shares';
/** Inside a folder another computer shares with this one (the files are that computer's). */
export const inReceivedShare = (real: string): boolean => inside(real, SHARES_ROOT) && real !== SHARES_ROOT;
// /hoody/shares itself, a share's own root, or a folder that holds them: never deleted from here.
const shareRoot = (real: string): boolean => inside(SHARES_ROOT, real) || (inReceivedShare(real) && partsOf(real).length === 3);

export const renameTyped = (real: string): boolean => protectedPath(real);

/** The open storage at or under a folder, judged on its listed path and where it resolves, or undefined. */
export const storageIn = (path: string, real: string, mounts: readonly MountRef[]): MountRef | undefined =>
  mounts.find((m) => inside(m.path, real) || inside(m.path, path));

export interface DeleteItem { readonly path: string; readonly name: string; readonly dir: boolean; readonly size: number | null; readonly modified: number | null }
export type DeleteRefusal = 'root' | 'shareRoot' | 'mountsUnknown' | { readonly mount: string };
export interface DeletePlan {
  readonly refused: DeleteRefusal | null;
  /** The words the person types to arm Delete, or null for a plain confirm. */
  readonly typed: string | null;
  readonly protected: boolean;
  /** The storage's label when every item is on one other disk ('' for a PC share or one not listed). */
  readonly foreign: string | null;
  readonly unknownCount: boolean;
  /** An item is inside a folder another computer shares with this one: it is deleted on that computer. */
  readonly received: boolean;
  /** An item is, holds or is inside a folder this computer shares: the other computer loses it too. */
  readonly shared: boolean;
}

export function planDelete(items: readonly DeleteItem[], realOf: (path: string) => string, mounts: Mounts | null, sharedOut: readonly string[] = []): DeletePlan {
  const known = mounts !== null && mounts.complete;
  const list = mounts?.items ?? [];
  let refused: DeleteRefusal | null = null;
  let prot = false, unknownCount = false, foreign: string | null = null, typed = false, received = false, shared = false;
  for (const it of items) {
    const real = realOf(it.path);
    if (it.path === '/' || real === '/' || partsOf(it.path).length === 0) { refused = 'root'; break; }
    if (shareRoot(real) || shareRoot(it.path)) { refused = 'shareRoot'; break; }
    if (inReceivedShare(real)) { received = true; typed = true; }
    // The selected path and where it resolves, against each spelling of a shared folder given (its path, and where it
    // resolves when the planner could read that): a match on either side warns.
    if (sharedOut.some((sp) => [it.path, real].some((p) => inside(sp, p) || inside(p, sp)))) { shared = true; typed = true; }
    if (it.dir) {
      // A mount at the folder or under it (either spelling of the folder): Close it first.
      const held = storageIn(it.path, real, list);
      if (held) { refused = { mount: held.label }; break; }
      if (!known) { refused = 'mountsUnknown'; break; }
      unknownCount = true;
      typed = true;
    }
    // What a received folder holds is another computer's files, not this computer's system.
    if (protectedPath(real) && !inReceivedShare(real)) { prot = true; typed = true; }
    if (foreignDisk(real, list)) {
      typed = true;
      const m = list.find((x) => inside(real, x.path));
      foreign = foreign === null || foreign === (m?.label ?? '') ? (m?.label ?? '') : '';
    }
    if (!known) typed = true;
  }
  if (refused) return { refused, typed: null, protected: false, foreign: null, unknownCount: false, received: false, shared: false };
  // Several items are always typed: one press must not take a whole selection without its count read back.
  if (items.length > 1) return { refused: null, typed: `${items.length} items`, protected: prot, foreign, unknownCount, received, shared };
  return { refused: null, typed: typed ? items[0]!.name : null, protected: prot, foreign, unknownCount, received, shared };
}

// ── What a fresh listing proves ──────────────────────────────────────────────────────────────

/** A folder as read, with its computer and path; hidden: items it holds that the Hub cannot show; whole: it names every
 *  item in the folder (logic.ts folderOf). A name missing from it proves an absence only when whole. */
export interface Listing { readonly computer: string; readonly path: string; readonly entries: readonly Entry[]; readonly hidden?: number; readonly whole?: boolean }
type Verdict = 'applied' | 'not_applied' | undefined;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** The parent folder's listing among the answers, on the change's computer, or null. */
function parentListing(id: Record<string, unknown>, answers: readonly (readonly unknown[])[]): Listing | null {
  const want = parentOf(String(id.path));
  for (const group of answers) for (const a of group) {
    const l = a as Listing;
    if (l && l.computer === id.computer && l.path === want && Array.isArray(l.entries)) return l;
  }
  return null;
}
const leaf = (path: string) => partsOf(path).at(-1) ?? '';
const known = (v: unknown): v is number => typeof v === 'number';
/** same / other / unknown: whether the listed entry is the version the person approved. A file needs its size and
 *  modified time on both sides, a folder its modified time; anything less is unknown, never the same. */
function versionOf(e: Entry, id: Record<string, unknown>): 'same' | 'other' | 'unknown' {
  if (e.dir !== id.dir) return 'other';
  if (!known(e.modified) || !known(id.modified)) return 'unknown';
  if (e.dir) return e.modified === id.modified ? 'same' : 'other';
  if (!known(e.size) || !known(id.size)) return 'unknown';
  return e.size === id.size && e.modified === id.modified ? 'same' : 'other';
}

export function mkdirProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const id = obj(identity);
  const l = parentListing(id, answers);
  if (!l) return undefined;
  const e = nameIn(l, leaf(String(id.path)));
  if (e === 'unknown') return undefined;
  if (e === 'absent') return 'not_applied';
  return e.dir ? 'applied' : undefined;
}

export function renameProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const id = obj(identity);
  const l = parentListing(id, answers);
  if (!l) return undefined;
  const from = nameIn(l, leaf(String(id.path)));
  const to = typeof id.to === 'string' ? nameIn(l, id.to) : 'unknown';
  if (typeof to === 'object' && from === 'absent' && versionOf(to, id) === 'same') return 'applied';
  if (typeof from === 'object' && to === 'absent' && versionOf(from, id) === 'same') return 'not_applied';
  return undefined;
}

export function deleteProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const id = obj(identity);
  const l = parentListing(id, answers);
  if (!l) return undefined;
  const e = nameIn(l, leaf(String(id.path)));
  if (e === 'unknown') return undefined;
  // Gone, or something else has the name now: the approved item is not there (not proven to be this delete).
  if (e === 'absent') return 'applied';
  // A folder still there was not deleted: its own time moves with its contents, so it is no version proof here.
  if (e.dir && id.dir === true) return 'not_applied';
  const v = versionOf(e, id);
  return v === 'same' ? 'not_applied' : v === 'other' ? 'applied' : undefined;
}

// ── Copy / Move to the other side, on one computer ─────────────────
//   - keepBothName(name, taken, dir): the Keep-both name: `name-1.ext` for a file (before its last extension,
//     never for a dot file), `name-1` for a folder, the first number free in the folder; null past 999 or when the
//     name would be one the files program refuses (nameProblem's own rules, depth aside).
//   - transferBlock(src, other): why the item cannot go to the other side's folder, or null. Both sides on ONE
//     running computer, the other side's folder listed (its names known), not the item's own folder, never into the
//     item itself, never past what core can address.
//   - placeOf(real, mounts): the place a resolved path is on (its innermost open storage, a mount root's entry, or
//     this computer's own disk, key ''). A move between two places is refused before it is sent.
//   - copyProved / moveProved: what a fresh read proves (core `proves`). A file copy: the destination's SHA-256
//     equal to the source's, both read now, other bytes → not applied, a folder there → no verdict (a file that
//     became a folder may have been copied in part); a folder copy is copyJudge's (below); a move: the
//     approved version at the destination and none at the source. presentAt: whether a fresh listing shows a path.

const KEEP_MAX = 999;
export function keepBothName(name: string, taken: readonly string[], dir = false): string | null {
  const dot = dir ? -1 : name.lastIndexOf('.');
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let n = 1; n <= KEEP_MAX; n++) {
    const cand = `${base}-${n}${ext}`;
    if (cand.length > 256) return null;
    if (!taken.includes(cand)) return cand;
  }
  return null;
}

export type TransferBlock = 'noOther' | 'otherComputer' | 'otherStopped' | 'otherUnlisted' | 'sameFolder' | 'intoItself' | 'deep';
export interface TransferSide { readonly computer: string | undefined; readonly running: boolean; readonly path: string | null; readonly listed: boolean }

/** Why nothing in `folder` can go to the other side, whatever the item (several items), or null.
 *  The other side's folder being listed is part of it: its names must be known. */
export function sideBlock(computer: string, folder: string, other: TransferSide | null): TransferBlock | null {
  if (!other || !other.computer) return 'noOther';
  if (other.computer !== computer) return 'otherComputer';
  if (!other.running) return 'otherStopped';
  if (other.path === null) return 'otherUnlisted';
  if (other.path === folder) return 'sameFolder';
  return other.listed ? null : 'otherUnlisted';
}

export function transferBlock(src: { computer: string; path: string; dir: boolean }, other: TransferSide | null): TransferBlock | null {
  const side = sideBlock(src.computer, parentOf(src.path), other);
  if (side !== null && side !== 'otherUnlisted') return side;
  if (!other || other.path === null) return 'otherUnlisted';
  if (src.dir && inside(other.path, src.path)) return 'intoItself';
  if (blockedPath(joinPath(other.path, leaf(src.path))) === 'deep') return 'deep';
  return other.listed ? null : 'otherUnlisted';
}

/** A destination a copy or move may be sent to: a whole path core can address, not the item, not inside it. */
export function transferDestOk(src: string, dest: string | undefined): dest is string {
  if (!dest || !dest.startsWith('/') || partsOf(dest).length === 0 || blockedPath(dest)) return false;
  return dest !== src && !dest.startsWith(src + '/') && dest === '/' + partsOf(dest).join('/');
}

/** A copy's success answer, as the files program sends it (openapi CopyResponse). */
export interface CopyDone {
  readonly success: true;
  readonly source: string;
  readonly destination: string;
  readonly skipped: readonly { readonly path: string; readonly reason: string }[];
  readonly skipped_count: number;
}
/** The program names at most this many left-out entries; skipped_count counts every one. */
export const COPY_SKIPPED_MAX = 1000;
/** A success answer that proves this very copy made: success true, naming this source and this destination (both in
 *  the program's "/"-prefixed form, as the Hub sends them), with a `skipped` list of {path, reason} strings (at most
 *  COPY_SKIPPED_MAX) and a whole-number skipped_count no smaller than it (the list may be cut). Null for any other: the
 *  copy stays held ("may have gone through"), never done. A plain copy of the fields read, nothing else. */
export function copyDoneOf(raw: unknown, source: string, dest: string): CopyDone | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  if (b.success !== true || b.source !== source || b.destination !== dest) return null;
  if (!Array.isArray(b.skipped) || b.skipped.length > COPY_SKIPPED_MAX) return null;
  const skipped: { path: string; reason: string }[] = [];
  for (const x of b.skipped) {
    const r = obj(x);
    if (typeof r.path !== 'string' || typeof r.reason !== 'string') return null;
    skipped.push({ path: r.path, reason: r.reason });
  }
  const count = b.skipped_count;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < skipped.length) return null;
  return { success: true, source, destination: dest, skipped, skipped_count: count };
}

export interface Place { readonly key: string; readonly label: string }
export function placeOf(real: string, mounts: readonly MountRef[]): Place {
  const m = mounts.filter((x) => inside(real, x.path)).sort((a, b) => b.path.length - a.path.length)[0];
  if (m) return { key: m.path, label: m.label };
  for (const r of MOUNT_ROOTS) if (inside(real, r) && real !== r) return { key: `${r}/${partsOf(real.slice(r.length))[0]}`, label: '' };
  return { key: '', label: '' };
}

/** The listing of one folder of the change's computer among the answers, or null. */
function listingAt(id: Record<string, unknown>, path: string, answers: readonly (readonly unknown[])[]): Listing | null {
  for (const group of answers) for (const a of group) {
    const l = a as Listing;
    if (l && l.computer === id.computer && l.path === path && Array.isArray(l.entries)) return l;
  }
  return null;
}
/** A SHA-256 read of one file of the change's computer among the answers, or undefined. */
function hashAt(id: Record<string, unknown>, path: string, answers: readonly (readonly unknown[])[]): string | undefined {
  for (const group of answers) for (const a of group) {
    const h = obj(a);
    if (h.computer === id.computer && h.path === path && typeof h.hash === 'string' && /^[0-9a-f]{64}$/.test(h.hash)) return h.hash;
  }
  return undefined;
}

export function copyProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const id = obj(identity);
  const dest = String(id.dest ?? '');
  if (!dest.startsWith('/')) return undefined;
  const l = listingAt(id, parentOf(dest), answers);
  if (!l) return undefined;
  const e = nameIn(l, leaf(dest));
  if (e === 'unknown') return undefined;
  if (e === 'absent') return 'not_applied';
  // A folder at a file copy's name proves nothing: the item may have become a folder before the send, and a cut
  // folder copy leaves part of it.
  if (e.dir) return undefined;
  const a = hashAt(id, dest, answers), b = hashAt(id, String(id.path), answers);
  if (a === undefined || b === undefined) return undefined;
  return a === b ? 'applied' : 'not_applied';
}

// ── A folder copy, proved by comparing both trees ──────────────────────────────────────────────
/** A tree read (data.ts tree reads) of one folder of the change's computer among the answers: the manifest, or
 *  undefined when this read-back did not read it. */
const treeAt = (id: Record<string, unknown>, answers: readonly (readonly unknown[])[]) => (path: string): Manifest | undefined => {
  for (const group of answers) for (const a of group) {
    const x = obj(a);
    if (x.computer !== id.computer || x.path !== path) continue;
    const t = obj(x.tree);
    if (Array.isArray(t.entries) && typeof t.skipped === 'number') return x.tree as Manifest;
  }
  return undefined;
};

/** What a fresh read proves about a held copy, and for a folder copy how many items it found missing or different.
 *  A file copy: copyProved. A folder copy: nothing at the name → not applied; a file there while the source is a
 *  folder → not applied (another item, never replaced); the source walked and both trees compared, read now: equal →
 *  applied; missing or different items → no verdict, with their count: the copy may still be running (its answer
 *  was lost, or the program stopped it part way), so it stays held and is checked again; anything not read, refused,
 *  failed or unchecked → no verdict. */
export function copyJudge(identity: unknown, answers: readonly (readonly unknown[])[]): { verdict: Verdict; missing?: number } {
  const id = obj(identity);
  if (id.dir !== true) return { verdict: copyProved(identity, answers) };
  const src = String(id.path ?? ''), dest = String(id.dest ?? '');
  if (!dest.startsWith('/') || !src.startsWith('/')) return { verdict: undefined };
  const l = listingAt(id, parentOf(dest), answers);
  if (!l) return { verdict: undefined };
  const e = nameIn(l, leaf(dest));
  if (e === 'unknown') return { verdict: undefined };
  if (e === 'absent') return { verdict: 'not_applied' };
  if (!e.dir) {
    // A file at the name: another item, unless the source became a file (then the program copied a file).
    const s = listingAt(id, parentOf(src), answers)?.entries.find((x) => x.name === leaf(src));
    return { verdict: s?.dir ? 'not_applied' : undefined };
  }
  const at = treeAt(id, answers);
  const w = walkTree(src, dest, at);
  if (w.state !== 'done') return { verdict: undefined };
  const c = compareTrees(src, dest, w, at, (p) => hashAt(id, p, answers));
  if (c.state === 'equal') return { verdict: 'applied' };
  if (c.state === 'differs') return { verdict: undefined, missing: c.count };
  return { verdict: undefined };
}

/** Whether the fresh listing of a path's folder (this change's computer) shows it; undefined when not read, or when it
 *  does not show it and is not whole. */
export function presentAt(identity: unknown, path: string, answers: readonly (readonly unknown[])[]): boolean | undefined {
  if (!path.startsWith('/')) return undefined;
  const l = listingAt(obj(identity), parentOf(path), answers);
  const e = l ? nameIn(l, leaf(path)) : 'unknown';
  return e === 'unknown' ? undefined : e !== 'absent';
}

export function moveProved(identity: unknown, answers: readonly (readonly unknown[])[]): Verdict {
  const id = obj(identity);
  const src = String(id.path ?? ''), dest = String(id.dest ?? '');
  if (!dest.startsWith('/')) return undefined;
  const ls = listingAt(id, parentOf(src), answers), ld = listingAt(id, parentOf(dest), answers);
  if (!ls || !ld) return undefined;
  const from = nameIn(ls, leaf(src));
  const to = nameIn(ld, leaf(dest));
  if (typeof to === 'object' && from === 'absent' && versionOf(to, id) === 'same') return 'applied';
  if (typeof from === 'object' && to === 'absent' && versionOf(from, id) === 'same') return 'not_applied';
  return undefined;
}
