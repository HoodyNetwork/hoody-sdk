// Archives in Files: the pure rules behind Look inside and Extract. No React here.
//
// Contract, in plain words:
//   - openableArchive(name): only what the files program opens (zip, tar, tar.gz/bz2/xz and their short forms). It
//     detects by the last extension and takes every .gz/.bz2/.xz as a tar, so a plain `notes.txt.gz` is refused here
//     (the program would fail on it). kind.ts keeps its wider icon test.
//   - extractFolderName(archive, taken, parent): the new folder an archive goes into, the archive name less its
//     archive extension, then `name (2)`, `name (3)`... until one is free; null when none is.
//   - The parsers read the files program's answers at the boundary: a malformed or self-contradicting body is null
//     (unknown), never an empty list or a success. The program names at most 1000 skipped and replaced entries and
//     counts every one, so a list shorter than its count is whole only at that cap.
//   - Only the send's own answer settles an extract (doneFor, parseExtractFailed). The program takes no request key
//     and its running and finished lists name no client attempt, so no read proves which run was this one: a lost
//     or unreadable answer stays unknown until the person dismisses it (the program echoes no request key).
//   - entryLabel(path): an entry's name as shown, with controls and direction or invisible formatting characters
//     written out, so a name inside an archive cannot pass for another.
import { displayName } from './logic';
import { nameProblem } from './plan';

const OPENABLE = /\.(zip|tar|tgz|tbz2?|txz|tar\.(gz|bz2|xz))$/i;
export const openableArchive = (name: string): boolean => OPENABLE.test(name);

// Longest first, so `a.tar.gz` loses `.tar.gz`, not `.gz`.
const STRIP = /\.(tar\.(gz|bz2|xz)|zip|tar|tgz|tbz2?|txz)$/i;
const NAME_MAX = 99;
export function extractFolderName(archive: string, taken: readonly string[], parent: string): string | null {
  const base = archive.replace(STRIP, '') || archive;
  for (let n = 1; n <= NAME_MAX; n++) {
    const cand = n === 1 ? base : `${base} (${n})`;
    const p = nameProblem(cand, parent, taken);
    if (!p) return cand;
    if (p !== 'taken') return null;
  }
  return null;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const nat = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const optNat = (v: unknown): number | null | undefined => (v === null || v === undefined ? null : nat(v) ? v : undefined);
const str = (v: unknown): v is string => typeof v === 'string';

/** How many skipped or replaced entries an answer names; its count still counts every one. */
export const LIST_MAX = 1000;
/** A named list beside its count: whole when it names every entry, or exactly LIST_MAX of more; each item read. */
const capped = (list: unknown, count: unknown, item: (v: unknown) => boolean): count is number =>
  Array.isArray(list) && nat(count) && list.length === Math.min(count, LIST_MAX) && list.every(item);
const skippedItem = (v: unknown): boolean => { const o = obj(v); return !!o && str(o.path) && str(o.reason); };

// Direction controls and every default-ignorable character (invisible: joiners, variation selectors, tag characters
// beyond the BMP too): written out by code point, as displayName writes out control characters.
const HIDDEN = /[\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
const written = (c: string): string => { const n = c.codePointAt(0) ?? 0; return n > 0xffff ? `\\u{${n.toString(16)}}` : '\\u' + n.toString(16).padStart(4, '0'); };
/** An archive entry's name as shown and as its labels say it; the path itself is sent unchanged. */
export const entryLabel = (path: string): string => displayName(path).replace(HIDDEN, written);

// ── Look inside: GET ?preview ─────────────────────────────────────────────────────────────────────────────────
/** link: a symbolic or hard link; special: neither a file, a folder nor a link (a pipe, a device). Neither is extracted. */
export interface ArchiveEntry { readonly path: string; readonly dir: boolean; readonly link: boolean; readonly special: boolean; readonly size: number; readonly modified: number | null }
export interface ArchiveList { readonly format: string; readonly totalFiles: number; readonly totalSize: number; readonly entries: readonly ArchiveEntry[] }
const FORMATS = new Set(['zip', 'tar', 'tar.gz', 'tar.bz2', 'tar.xz']);
/** The program's listing. total_files counts every entry the archive holds (folders and links too); the program
 *  leaves some out of `entries` (names it cannot read), never adds any. Its entry_type says what an entry is (a zip's
 *  mode bits or a tar's header, never the name: a tar folder's path need not end in `/`) and is `directory` exactly
 *  when is_dir is. The archive's own top folder (a tar's `./`) comes as a folder with an empty path: counted, never
 *  listed. A body where entry_type and is_dir disagree, a file with no path, or more entries than total_files, is null. */
export function parseArchiveList(raw: unknown): ArchiveList | null {
  const b = obj(raw);
  if (!b || !str(b.format) || !FORMATS.has(b.format) || !nat(b.total_files) || !nat(b.total_size) || !Array.isArray(b.entries)) return null;
  if (b.entries.length > b.total_files) return null;
  const entries: ArchiveEntry[] = [];
  for (const r of b.entries) {
    const e = obj(r);
    if (!e || !str(e.path) || typeof e.is_dir !== 'boolean' || !nat(e.size) || !str(e.entry_type) || !e.entry_type) return null;
    if ((e.entry_type === 'directory') !== e.is_dir) return null;
    if (!e.path && !e.is_dir) return null;
    const modified = optNat(e.modified_time);
    if (modified === undefined) return null;
    if (!e.path) continue;
    const link = e.entry_type === 'symlink' || e.entry_type === 'hardlink';
    const special = !e.is_dir && !link && e.entry_type !== 'file';
    entries.push({ path: e.path, dir: e.is_dir, link, special, size: e.size, modified: modified === null ? null : modified * 1000 });
  }
  return { format: b.format, totalFiles: b.total_files, totalSize: b.total_size, entries };
}

// ── Extract: the send's answer ─────────────────────────────────────────────────────────────────────────────
/** whole: false for a selective extraction (one entry or folder of the archive). */
export interface ExtractDone { readonly files: number; readonly bytes: number; readonly destination: string; readonly id: string; readonly skipped: number; readonly replaced: number; readonly whole: boolean }
/** Whole-archive or selective, as a body says it: `selective` true with a non-empty `selective_path`, or neither. */
const wholeOf = (selective: unknown, path: unknown): boolean | null =>
  selective === true ? (str(path) && path ? false : null) : selective === undefined && path === undefined ? true : null;
/** POST ?extract's success answer. replaced[] and skipped[] name what their counts count (capped at LIST_MAX): a body
 *  where they differ, or an item of the wrong shape, is null. */
export function parseExtractDone(raw: unknown): ExtractDone | null {
  const b = obj(raw);
  if (!b || b.success !== true || !nat(b.extracted_files) || !nat(b.extracted_bytes) || !str(b.destination) || !b.destination || !str(b.extraction_id) || !b.extraction_id) return null;
  if (!capped(b.replaced, b.replaced_count, str) || !capped(b.skipped, b.skipped_count, skippedItem)) return null;
  // Each replaced file was extracted: more replaced than extracted contradicts itself.
  if (b.replaced_count > b.extracted_files) return null;
  const whole = wholeOf(b.selective, b.selective_path);
  if (whole === null) return null;
  return { files: b.extracted_files, bytes: b.extracted_bytes, destination: b.destination, id: b.extraction_id, skipped: b.skipped_count, replaced: b.replaced_count, whole };
}

/** A success answer that proves this extract done: one that reads whole, of the whole archive, naming this very
 *  folder (`dest`, as the program builds it). Null for any other: the attempt stays held, never done. */
export function doneFor(raw: unknown, dest: string): ExtractDone | null {
  const d = parseExtractDone(raw);
  return d && d.whole && d.destination === dest ? d : null;
}

/** What a failed extraction's answer says it changed in the folder: files replaced and files added, or 'none' for a
 *  refusal before any run (none of the run's keys, success absent or false, and a non-empty error or code, each one
 *  that is there a non-empty string). A run's failure carries success false, its error, its extraction id and both
 *  lists; any other shape, an empty body or a contradictory one (success true beside an error) included, is null:
 *  what changed is unknown. */
export type ExtractChanged = { readonly replaced: number; readonly created: number } | 'none';
const RUN_KEYS = ['extraction_id', 'skipped', 'skipped_count', 'replaced', 'replaced_count', 'created', 'created_count'];
export function parseExtractFailed(raw: unknown): ExtractChanged | null {
  const b = obj(raw);
  if (!b) return null;
  if (RUN_KEYS.every((k) => !(k in b))) {
    const said = (k: string) => k in b && str(b[k]) && b[k] !== '';
    if (('success' in b && b.success !== false) || ('error' in b && !said('error')) || ('code' in b && !said('code'))) return null;
    return said('error') || said('code') ? 'none' : null;
  }
  if (b.success !== false || !str(b.error) || !str(b.extraction_id) || !b.extraction_id) return null;
  if (!capped(b.replaced, b.replaced_count, str) || !capped(b.created, b.created_count, str) || !capped(b.skipped, b.skipped_count, skippedItem)) return null;
  return { replaced: b.replaced_count, created: b.created_count };
}
