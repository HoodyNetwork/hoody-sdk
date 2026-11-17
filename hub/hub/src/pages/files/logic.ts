// The Files page's pure rules: paths, what core can open today, the files program's listing, why a folder could not
// be read, and the URL of the two panes. No React, no I/O.
//
// Contract, in plain words:
//   - A path is '/' or '/part/part', parts exactly as the computer has them. cleanPath reads one from the URL and
//     refuses '.', '..', a relative path and anything over 4,096 bytes; it never trims or rewrites a name.
//   - blockedPath says why a folder cannot be opened yet, or null. Core's path params hold one part each and refuse
//     '%', '\', control characters and parts over 256 characters (core/routes.ts), so there is one route per depth up
//     to MAX_DEPTH, and the files program reads some first parts as its own commands. A name
//     holding U+FFFD was made lossy by the files program: opening it would ask for another name. Core multi-part paths
//     and a command-safe first part would lift 'deep', 'name' and 'alias'. 'long' is a path over MAX_PATH_BYTES (Linux PATH_MAX), which no computer can
//     name: it stays.
//   - listingOf reads GET /api/v1/files/<folder> ({entries: [{name, is_dir, size, modified, type?, mode?}]}; type and
//     mode only for Open with: what the entry is and its execute bit, apps execHint); rootListingOf reads
//     the top folder from listRootDirectory, GET /?json (a DirectoryListing: {paths: [{name, path_type, mtime, size}]},
//     mtime in milliseconds, a folder's size its item count; a link to a folder opens, as the REST listing describes a
//     link by what it points at). In a folder listing one unreadable entry makes the whole answer unreadable (null),
//     as does a body without its list: never a shorter list, never a false empty folder. folderOf adds the folder
//     listing's `skipped` list (the entries the program could not read, files openapi FileListing): they count as
//     hidden, and the listing is whole only when it is empty; no list or a malformed one is no listing (null, no older
//     shape). nameIn says what a listing shows under a name: the entry, 'absent' only on a whole listing, else
//     'unknown': a name missing from a listing that leaves entries out is never proved gone. The top
//     folder is never whole: GET /?json drops an entry it cannot read without a word. The top folder instead leaves
//     out an item it cannot show (a path_type beyond the four documented ones, a name it cannot use) and counts it,
//     so the folder still shows with a note saying how many are left out; no paths list stays null.
//   - problemOf: why a folder read failed. 401 always means the proxy kept the Hub out; 403 means that too when the
//     computer's access rules are known to be set, the files program refusing the folder when they are known to be
//     open, and a refusal with no cause named ('denied') when the computer list could not say. Core's 'too_large' (an answer over the route's
//     byte bound) is too many entries. An answer that is no listing (not JSON, broken
//     JSON, no entries, an unreadable entry) is unreadable; a read nothing answered (core reachOf 'unreachable') is
//     unreachable; anything else (a 5xx, an abort, a cause not known) is failed, never "the computer didn't answer"
//     All three retry with a read only.
//   - The URL: pane A is `a` (a computer handle) and `ap` (its path), pane B `b` and `bp`. The computer page's link
//     (?computer=&path=) replaces pane A whole. Each pane's table keeps
//     its own view keys under its letter (aq, asort, apage, asel, akind). Moving a pane drops its own view keys but
//     its sort, and never touches the other pane.
import { computerHandle, reachOf, type SourceError } from '@core';
import { execHint } from '../apps/links';

/** The deepest path the page opens (blockedPath answers 'deep' past it); ro.routes.ts declares one route per depth up to it. */
export const MAX_DEPTH = 8;
/** The longest path the Hub sends. */
export const MAX_PATH_BYTES = 4096;
/** First parts the files program takes as its own commands on GET. */
export const ALIAS_FIRST: ReadonlySet<string> = new Set(['stat', 'grep', 'glob', 'realpath', 'append', 'move', 'copy', 'chmod', 'chown', 'health']);

export type Blocked = 'deep' | 'name' | 'alias' | 'lossy' | 'long';
export type Problem = 'access' | 'denied' | 'refused' | 'gone' | 'tooBig' | 'unreadable' | 'unreachable' | 'failed';
/** A computer's proxy access rules as the computer list says: set, open (none), or not known. */
export type Rules = 'set' | 'open' | 'unknown';
export type PaneKey = 'a' | 'b';

export interface Entry {
  name: string;
  dir: boolean;
  /** Bytes, for files only. */
  size: number | null;
  /** Milliseconds since the epoch, when the program said. */
  modified: number | null;
  /** The program turned this name lossy (U+FFFD): its actions are off. */
  lossy: boolean;
  /** What the listing says it is (Open with): absent when the listing did not say. */
  type?: EntryType;
  /** A regular file's execute bit, a hint only (the exec decides); null when the listing gave no mode. */
  exec?: boolean | null;
}
export type EntryType = 'file' | 'dir' | 'symlink' | 'other';
const typeOf = (v: unknown): EntryType | undefined => (v === 'file' || v === 'dir' || v === 'symlink' ? v : typeof v === 'string' ? 'other' : undefined);

const LOSSY = '�';
// What core refuses in one path param (core/routes.ts buildRequest).
const BAD_PART = /[/\\%\u0000-\u001f\u007f]/;
const enc = new TextEncoder();

export function partsOf(path: string): string[] {
  return path.split('/').filter(Boolean);
}

export function joinPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

export function parentOf(path: string): string {
  const p = partsOf(path);
  return p.length <= 1 ? '/' : '/' + p.slice(0, -1).join('/');
}

/** A path from the URL ('/' when absent), or null when it is not one the Hub sends. */
export function cleanPath(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return '/';
  if (typeof raw !== 'string' || raw.charAt(0) !== '/') return null;
  const parts = partsOf(raw);
  if (parts.some((p) => p === '.' || p === '..')) return null;
  const path = '/' + parts.join('/');
  return enc.encode(path).length > MAX_PATH_BYTES ? null : path;
}

/** One part core can send as a path param today. */
export function partOk(s: string): boolean {
  return !!s && s !== '.' && s !== '..' && s.length <= 256 && !BAD_PART.test(s);
}

/** Why the folder at `path` cannot be opened yet, or null (see the contract). */
export function blockedPath(path: string): Blocked | null {
  const parts = partsOf(path);
  if (parts.some((p) => p.includes(LOSSY))) return 'lossy';
  if (parts.some((p) => !partOk(p))) return 'name';
  // Over Linux PATH_MAX the computer can never name it: core's `*parts` refuses it unsent (ROUTE_PARAMS, core
  // files-path.ts), and the Hub says why up front instead (parts joined by '/', as core counts them).
  if (enc.encode(parts.join('/')).length > MAX_PATH_BYTES) return 'long';
  if (parts.length > MAX_DEPTH) return 'deep';
  if (parts.length && ALIAS_FIRST.has(parts[0]!)) return 'alias';
  return null;
}

export interface Crumb { name: string; path: string }
export function crumbsOf(path: string): Crumb[] {
  const parts = partsOf(path);
  return [{ name: '/', path: '/' }, ...parts.map((name, i) => ({ name, path: '/' + parts.slice(0, i + 1).join('/') }))];
}

/** A name as text: control characters written as \xNN, never raw. */
export function displayName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f-\u009f]/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}

const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** The entries of a listing, or null when the body is not one or any entry in it cannot be read: a listing is shown
 *  whole or not at all, never shorter than the answer (and so never a false empty folder). */
export function listingOf(raw: unknown): Entry[] | null {
  const d = obj(raw);
  if (!d || !Array.isArray(d.entries)) return null;
  const out: Entry[] = [];
  for (const e of d.entries) {
    const x = obj(e);
    if (!x || typeof x.name !== 'string' || !x.name || x.name.includes('/') || typeof x.is_dir !== 'boolean') return null;
    const secs = count(x.modified);
    const type = typeOf(x.type);
    const exec = execHint(x.type, x.mode);
    out.push({ name: x.name, dir: x.is_dir, size: x.is_dir ? null : count(x.size), modified: secs === null ? null : secs * 1000, lossy: x.name.includes(LOSSY), ...(type ? { type } : {}), ...(exec !== null ? { exec } : {}) });
  }
  return out;
}

/** A folder's rows; hidden: how many items it holds that the Hub cannot show; whole: the listing names every item in
 *  the folder, so a name missing from it is absent (never the top folder's). */
export interface Folder { entries: Entry[]; hidden: number; whole: boolean }
/** A folder read now for Check again (data.ts freshListing): its rows, and whether the listing is whole. */
export interface FreshFolder { readonly entries: readonly Entry[]; readonly whole: boolean }

/** GET /api/v1/files/<folder> (no ?q, no ?backend): its rows, and its `skipped` list as hidden. null when it is no
 *  listing (listingOf), or its `skipped` list is missing or not a list of {name, reason}. */
export function folderOf(raw: unknown): Folder | null {
  const entries = listingOf(raw);
  const skipped = obj(raw)?.skipped;
  if (!entries || !Array.isArray(skipped)) return null;
  for (const s of skipped) { const x = obj(s); if (!x || typeof x.name !== 'string' || typeof x.reason !== 'string') return null; }
  return { entries, hidden: skipped.length, whole: skipped.length === 0 };
}

/** What a listing shows under `name`: the entry; 'absent' only when the listing is whole; otherwise 'unknown'. */
export function nameIn(l: { readonly entries: readonly Entry[]; readonly whole?: boolean }, name: string): Entry | 'absent' | 'unknown' {
  return l.entries.find((x) => x.name === name) ?? (l.whole === true ? 'absent' : 'unknown');
}
// A Set, never an object lookup: '__proto__' or 'toString' must not read as a known kind.
const DIR_TYPES: ReadonlySet<unknown> = new Set(['Dir', 'SymlinkDir']);
const FILE_TYPES: ReadonlySet<unknown> = new Set(['File', 'SymlinkFile']);
export function rootListingOf(raw: unknown): Folder | null {
  const d = obj(raw);
  if (!d || !Array.isArray(d.paths)) return null;
  const entries: Entry[] = [];
  let hidden = 0;
  for (const e of d.paths) {
    const x = obj(e);
    const dir = x && DIR_TYPES.has(x.path_type);
    if (!x || !(dir || FILE_TYPES.has(x.path_type)) || typeof x.name !== 'string' || !x.name || x.name.includes('/')) { hidden += 1; continue; }
    // Its kind, for Open with: a file, a folder, or a link to a file (SQLite Studio and Run take regular files only). A
    // link to a folder keeps no kind: it opens as a folder, and Open terminal here works in it as before.
    const type: EntryType | null = x.path_type === 'File' ? 'file' : x.path_type === 'Dir' ? 'dir' : x.path_type === 'SymlinkFile' ? 'symlink' : null;
    entries.push({ name: x.name, dir: !!dir, size: dir ? null : count(x.size), modified: count(x.mtime), lossy: x.name.includes(LOSSY), ...(type ? { type } : {}) });
  }
  return { entries, hidden, whole: false };
}

/** An entry whose name the Hub can pass back exactly (actions on). */
export function entryOk(e: Entry): boolean {
  return !e.lossy;
}

/** Why a folder read failed (see the contract). */
export function problemOf(err: unknown, rules: Rules): Problem {
  const e = (err ?? {}) as Partial<Pick<SourceError, 'kind' | 'status' | 'code'>>;
  const st = typeof e.status === 'number' ? e.status : null;
  if (st === 401) return 'access';
  // Only rules known to be set explain a 403; with rules not known the cause is not said.
  if (st === 403) return rules === 'set' ? 'access' : rules === 'unknown' ? 'denied' : 'refused';
  if (st === 404) return 'gone';
  // Core names an answer over the route's byte bound 'too_large' (its status stays 2xx).
  if (e.code === 'too_large') return 'tooBig';
  // An answer came but is no listing: not JSON, broken JSON (2xx with core's code), or the page's select refused it
  // (core: 'server' with no status).
  if (e.kind === 'server' && (st === null || (st >= 200 && st < 300))) return 'unreadable';
  return reachOf(err) === 'unreachable' ? 'unreachable' : 'failed';
}

// ── The URL ───────────────────────────────────────────────────────────────────────────

/** `idBad`: the address names an id (acid/bcid) that is no id: the pane still browses by its handle, but proves no computer
 *  for a link's ask. */
export interface PaneUrl { handle: string | undefined; path: string | null; id?: string; idBad?: true }
const PATH_KEY: Record<PaneKey, string> = { a: 'ap', b: 'bp' };
/** The view keys each pane's table keeps (kit useDataView with param = the pane letter), sort aside. */
const VIEW_KEYS = ['q', 'page', 'sel', 'kind'] as const;

export function panesOf(search: Readonly<Record<string, string>>): Record<PaneKey, PaneUrl> {
  const one = (k: PaneKey): PaneUrl => {
    const raw = search[ID_KEY[k]];
    const id = idOk(raw) ? raw : undefined;
    return { handle: search[k] || undefined, path: cleanPath(search[PATH_KEY[k]]), ...(id ? { id } : raw !== undefined ? { idBad: true as const } : {}) };
  };
  return { a: one('a'), b: one('b') };
}

const href = (q: Record<string, string>): string => {
  const s = new URLSearchParams(q).toString();
  return '/files' + (s ? '?' + s : '');
};

/** What a link asks a pane to do once on arrival (`aopen` / `bopen`): Preview its open row (a file), or the Open with
 *  drawer's Open terminal here for its folder, which the person still confirms. Read once, then dropped (ReadActions). */
export type PaneOpen = 'preview' | 'here';
export const OPEN_KEY: Record<PaneKey, string> = { a: 'aopen', b: 'bopen' };
export const paneOpenOf = (v: string | undefined): PaneOpen | null => (v === 'preview' || v === 'here' ? v : null);
/** A pane's exact computer (`acid` / `bcid`): a link that knows the computer's id (a chat's path link: the chat's bound
 *  computer) names it, and the pane resolves that id alone, never another computer with the same handle. It stays while
 *  the pane stays on that handle and goes with any move to another computer. */
export const ID_KEY: Record<PaneKey, string> = { a: 'acid', b: 'bcid' };
const idOk = (v: string | undefined): v is string => !!v && /^[A-Za-z0-9_-]{1,64}$/.test(v);
/** One entry name of a folder (never a path, `.` or `..`), as a link may name the row to open. */
const nameOk = (v: string | undefined): v is string => !!v && v !== '.' && v !== '..' && !v.includes('/') && !v.includes('\0');

/** `/files?computer=<handle>&path=<path>` (the computer page's link, and a chat's path link: `select=<name>` opens that
 *  row, `open=preview|here` asks the pane once, see PaneOpen) as pane A, or null when there is nothing to move. */
export function startHref(search: Readonly<Record<string, string>>): string | null {
  const c = search.computer;
  if (!c) return null;
  // Pane A is replaced whole: its old computer, folder, view keys and ask go; pane B and the sort stay.
  const drop = new Set<string>(['computer', 'path', 'select', 'open', 'cid', 'a', PATH_KEY.a, OPEN_KEY.a, ID_KEY.a, ...VIEW_KEYS.map((k) => 'a' + k)]);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(search)) if (!drop.has(k)) out[k] = v;
  out.a = c;
  if (search.path && search.path !== '/') out.ap = search.path;
  if (idOk(search.cid)) out[ID_KEY.a] = search.cid;
  // A link that names an id the page can't read keeps no ask: its handle alone never stands in for the computer it meant.
  else if (search.cid !== undefined) return href(out);
  const sel = nameOk(search.select) ? search.select : null;
  if (sel) out.asel = sel;
  const ask = paneOpenOf(search.open);
  // Preview needs the row it opens; a folder's terminal needs none.
  if (ask === 'here' || (ask === 'preview' && sel)) out[OPEN_KEY.a] = ask;
  return href(out);
}

/** The URL with one pane moved to another computer or folder. */
export function paneHref(search: Readonly<Record<string, string>>, pane: PaneKey, to: { handle?: string; path: string; id?: string }): string {
  const out: Record<string, string> = {};
  const handle = to.handle ?? search[pane];
  // The exact id stays only while the pane stays on the same handle and the move names no computer by id; a move that
  // names one (paneTarget: a handle two computers share) replaces it.
  const keepId = to.id === undefined && handle === search[pane];
  const drop = new Set<string>([pane, PATH_KEY[pane], OPEN_KEY[pane], ...(keepId ? [] : [ID_KEY[pane]]), ...VIEW_KEYS.map((k) => pane + k)]);
  let placed = false;
  const place = () => {
    if (placed) return;
    placed = true;
    if (handle) out[pane] = handle;
    if (to.path !== '/') out[PATH_KEY[pane]] = to.path;
    if (handle && idOk(to.id)) out[ID_KEY[pane]] = to.id;
  };
  for (const [k, v] of Object.entries(search)) {
    if (k === pane) { place(); continue; }
    if (drop.has(k)) continue;
    out[k] = v;
  }
  place();
  return href(out);
}

/** A computer by its handle (name.last4), never by a bare id, and only while no other listed computer has the same
 *  handle (say a computer recreated under the same name): a handle two computers share names neither, so nothing opens,
 *  reads or changes the wrong one. The page then asks which one, and the pick carries its id (paneTarget). */
export function findByHandle<T extends { id: string; name: string }>(list: readonly T[], handle: string | undefined): T | undefined {
  const hits = handleHits(list, handle);
  return hits.length === 1 ? hits[0] : undefined;
}

/** Whether exactly one listed computer has this handle. */
export function handleUnique(list: readonly { id: string; name: string }[], handle: string | undefined): boolean {
  return handleHits(list, handle).length === 1;
}

/** Whether more than one listed computer has this handle: the pane says so and asks which one. */
export function handleShared(list: readonly { id: string; name: string }[], handle: string | undefined): boolean {
  return handleHits(list, handle).length > 1;
}

/** The listed computer a pane's address names: the one with its id when it carries one (never another computer with the
 *  same handle), else the only one with its handle. */
export function paneComputer<T extends { id: string; name: string }>(list: readonly T[], url: PaneUrl): T | undefined {
  return url.id ? list.find((x) => x.id === url.id) : findByHandle(list, url.handle);
}

/** Where a pane goes to show computer `c`: its handle, and its id too when another listed computer shares that handle. */
export function paneTarget(list: readonly { id: string; name: string }[], c: { id: string; name: string }, path: string): { handle: string; path: string; id?: string } {
  const handle = computerHandle(c);
  return { handle, path, ...(handleShared(list, handle) ? { id: c.id } : {}) };
}

function handleHits<T extends { id: string; name: string }>(list: readonly T[], handle: string | undefined): T[] {
  if (!handle) return [];
  const dot = handle.lastIndexOf('.');
  if (dot < 1) return [];
  const name = handle.slice(0, dot), tail = handle.slice(dot + 1);
  if (tail.length !== 4) return [];
  return list.filter((c) => c.name === name && c.id.endsWith(tail));
}
