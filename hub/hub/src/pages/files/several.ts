// Copy / Move several selected items to the other side, on one computer,
// pure: no React, no core.
//
// Contract, in plain words:
//   - planSeveral(items, destFolder, taken, onTaken) gives each item, in the order shown, where it goes or why it is
//     left out. A name free in the destination keeps it. A taken name (by the folder, or by an item planned before it)
//     gets the Keep-both name when onTaken is 'keep' (never a name taken when Files checked), or is left out
//     ('taken') when it is 'skip'. Items whose own names are free are placed first, so a Keep-both name never takes another selected
//     item's own name. Left out too: no free Keep-both name ('noName'), a name the files program refuses there
//     ('badName'), too deep for core ('deep'), and a folder going into itself ('intoItself').
//   - planRest(src, dest, missing, dirs) plans Copy the rest: each item a held folder copy is missing
//     goes to its own place in that copy, never under a Keep-both name; a name refused there or too deep is left out.
//   - SEVERAL_MAX: how many items one press sends; SEVERAL_FOLDERS_MAX: how many of them may be folder copies (each is
//     walked before the press, as a single folder copy is); sizeRefusal says which bound a selection is over.
//   - capRest(rows): the rows of Copy the rest one press takes, under the same bounds, and how many wait.
//   - tallyOf(rows): what a run did, for the summary: sent and done, the one that may have gone through, the one
//     refused (its code), those not sent, and (Copy the rest) the names made meanwhile.
import { joinPath, parentOf } from './logic';
import { keepBothName, nameProblem, transferDestOk } from './plan';

export const SEVERAL_MAX = 100;
export const SEVERAL_FOLDERS_MAX = 5;

export interface SevItem { readonly path: string; readonly name: string; readonly dir: boolean; readonly size: number | null; readonly modified: number | null }
export type SevSkip = 'taken' | 'noName' | 'badName' | 'deep' | 'intoItself';
export interface SevRow { readonly item: SevItem; readonly name: string | null; readonly dest: string | null; readonly skip: SevSkip | null }

const inside = (path: string, root: string) => path === root || path.startsWith(root + '/');

export function planSeveral(items: readonly SevItem[], destFolder: string, taken: readonly string[], onTaken: 'keep' | 'skip'): readonly SevRow[] {
  const inDest = new Set(taken);
  // Free names first: an item whose own name is free keeps it, whatever comes before it in the list.
  const used = new Set(taken);
  for (const it of items) if (!inDest.has(it.name) && !(it.dir && inside(destFolder, it.path))) used.add(it.name);
  return items.map((it): SevRow => {
    const out = (skip: SevSkip): SevRow => ({ item: it, name: null, dest: null, skip });
    if (it.dir && inside(destFolder, it.path)) return out('intoItself');
    let name = it.name;
    if (inDest.has(it.name)) {
      if (onTaken === 'skip') return out('taken');
      const kb = keepBothName(it.name, [...used], it.dir);
      if (kb === null) return out('noName');
      name = kb;
    }
    const p = nameProblem(name, destFolder);
    if (p === 'deep') return out('deep');
    if (p !== null) return out('badName');
    const dest = joinPath(destFolder, name);
    if (!transferDestOk(it.path, dest)) return out('intoItself');
    used.add(name);
    return { item: it, name, dest, skip: null };
  });
}

/** Copy the rest: the items a held folder copy from `src` to `dest` is missing (tree.ts compareTrees
 *  `missing`, paths relative to the copy; `dirs` the walk's folders), each going to its own place in the copy. Never a
 *  Keep-both name: an item lands where the copy has it or not at all (a name taken by then is the program's 409). */
export function planRest(src: string, dest: string, missing: readonly string[], dirs: ReadonlySet<string>): readonly SevRow[] {
  return missing.map((rel): SevRow => {
    const name = rel.slice(rel.lastIndexOf('/') + 1);
    const to = joinPath(dest, rel);
    const item: SevItem = { path: joinPath(src, rel), name, dir: dirs.has(rel), size: null, modified: null };
    const p = nameProblem(name, parentOf(to));
    if (p === 'deep') return { item, name: null, dest: null, skip: 'deep' };
    if (p !== null) return { item, name: null, dest: null, skip: 'badName' };
    return { item, name, dest: to, skip: null };
  });
}

/** Copy the rest in presses: the rows one press takes, in order, as one several-items press takes them
 *  (SEVERAL_MAX items, SEVERAL_FOLDERS_MAX folder copies); `more` counts the items left for the next press. A row the
 *  plan left out takes no place. */
export function capRest(rows: readonly SevRow[]): { readonly rows: readonly SevRow[]; readonly more: number } {
  let items = 0, folders = 0, cut = rows.length;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.skip) continue;
    if (items + 1 > SEVERAL_MAX || (r.item.dir && folders + 1 > SEVERAL_FOLDERS_MAX)) { cut = i; break; }
    items++;
    if (r.item.dir) folders++;
  }
  return { rows: rows.slice(0, cut), more: rows.slice(cut).filter((r) => !r.skip).length };
}

/** Why one press cannot take these items at all: too many, or too many folder copies (each is walked first). */
export function sizeRefusal(items: number, folderCopies: number): 'tooMany' | 'tooManyFolders' | null {
  if (items > SEVERAL_MAX) return 'tooMany';
  return folderCopies > SEVERAL_FOLDERS_MAX ? 'tooManyFolders' : null;
}

/** One item's outcome in a run: done (with what a folder copy left out), may have gone through, refused, not sent;
 *  and for Copy the rest taken: the name was made meanwhile (the program's 409), kept, nothing sent
 *  over it, and the run goes on. */
export type SevOutcome =
  | { readonly kind: 'done'; readonly left?: number }
  | { readonly kind: 'taken' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed'; readonly code?: string; readonly status?: number; readonly route?: string }
  | { readonly kind: 'not_sent'; readonly code?: string; readonly status?: number; readonly route?: string };

export interface Tally { readonly done: number; readonly taken: number; readonly pending: SevRow | null; readonly failed: { row: SevRow; code?: string } | null; readonly notSent: number; readonly left: number }

/** What a run did: `outcomes[i]` is rows[i]'s, absent for a row never reached. Rows the plan left out, or `out`
 *  (left out by a check before the press), are not counted. */
export function tallyOf(rows: readonly SevRow[], outcomes: ReadonlyMap<number, SevOutcome>, out: ReadonlySet<number> = new Set()): Tally {
  let done = 0, notSent = 0, left = 0, taken = 0;
  let pending: SevRow | null = null;
  let failed: { row: SevRow; code?: string } | null = null;
  rows.forEach((r, i) => {
    if (r.skip || out.has(i)) return;
    const o = outcomes.get(i);
    if (!o || o.kind === 'not_sent') { notSent++; return; }
    if (o.kind === 'done') { done++; left += o.left ?? 0; return; }
    if (o.kind === 'taken') { taken++; return; }
    if (o.kind === 'pending') pending = r;
    else failed = { row: r, ...(o.code ? { code: o.code } : {}) };
  });
  return { done, taken, pending, failed, notSent, left };
}

/** The folder the items are in (all from one folder: the selection of one listing). */
export const folderOf = (items: readonly SevItem[]): string => (items[0] ? parentOf(items[0].path) : '/');
