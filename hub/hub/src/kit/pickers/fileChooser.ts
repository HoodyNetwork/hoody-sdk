// FileChooser's pure part: what a host tells the chooser (folders, previews, finds), how a folder's entries are ordered
// and filtered, what a typed path means, what a pick is, and the small list of recent places kept on this device.
// Paths follow PathField's rules (pathPick.ts): relative to a root the host chose ('' is the root, a folder ends in "/"),
// and never out of it by name. The kit knows no computer: a place names one only by the id the host gave.
import { hostEnv } from '@core';
import type { CodeLang } from '../data/Ids';
import type { IconName } from '../icons';
import { pathSplit, type PathEntry, type PathReads } from '../forms/pathPick';

/** One entry of a folder, with what the host's listing knows of it. */
export interface ChooserEntry extends PathEntry {
  /** Bytes, for a file; null or absent when the listing did not say. */
  size?: number | null;
  /** Milliseconds since the epoch; null or absent when the listing did not say. */
  modified?: number | null;
  /** A link: drawn with the link mark. It opens only when the host also says `dir`. */
  link?: boolean;
  /** Why the host can neither open nor hand back this entry (a name it cannot write back), in words. */
  off?: string;
}

/** A folder on one computer (null: the host has one place only). */
export interface ChooserPlace {
  computer: string | null;
  dir: string;
}

/** What the host knows of the folder asked for. */
export interface ChooserFolder {
  /** The folder `entries` are of, or null while none is read: another folder's entries are never shown. */
  place: ChooserPlace | null;
  entries: readonly ChooserEntry[];
  reading?: boolean;
  failed?: boolean;
  /** The failed read's rejection, for the error's details. */
  error?: unknown;
  /** The folder is out of the root by a link: nothing is read. */
  outside?: boolean;
  /** Why this folder is never read (too deep, a name the read cannot send), in the host's words. */
  blocked?: string;
  /** Items the folder holds that the listing could not show. */
  hidden?: number;
  /** Reads the folder again after a failure. */
  retry?: () => void;
}

export interface ChooserFileRef {
  computer: string | null;
  /** The file's path under the root ("a/b/name"). */
  path: string;
  name: string;
}

export type ChooserPreviewState =
  | { kind: 'loading' }
  /** `lang`: how the text is coloured (the kit CodeBlock's); without it, plain. */
  | { kind: 'text'; text: string; more: boolean; lang?: CodeLang }
  | { kind: 'image'; url: string }
  /** No preview for this file, and why, in words. */
  | { kind: 'none'; why: string }
  | { kind: 'failed'; error?: unknown };

/** The host's preview read: one file at a time, only while asked. */
export interface ChooserPreview {
  /** The file `state` is of. */
  of: ChooserFileRef | null;
  state: ChooserPreviewState;
  want: (file: ChooserFileRef | null) => void;
  retry?: () => void;
}

export interface ChooserFindAsk {
  computer: string | null;
  dir: string;
  query: string;
  /** Counts the person's asks: the same words asked again are a new search. */
  round: number;
}

/** A match of a find: the entry, and the folder it is in. */
export interface ChooserFound extends ChooserEntry {
  dir_in: string;
}

/** The host's search below a folder: runs only when asked. */
export interface ChooserFind {
  /** The ask `items` answer. */
  of: ChooserFindAsk | null;
  items: readonly ChooserFound[];
  reading?: boolean;
  failed?: boolean;
  error?: unknown;
  /** More matched than the host lists. */
  capped?: boolean;
  /** Why no search can run below this folder (the host's words), or null. */
  off?: (place: ChooserPlace) => string | null;
  want: (ask: ChooserFindAsk | null) => void;
}

/** Everything a host reads for the chooser. Each `want` keeps one identity, as PathReads' does. */
export interface ChooserReads {
  folder: ChooserFolder;
  want: (place: ChooserPlace | null) => void;
  preview?: ChooserPreview;
  find?: ChooserFind;
}

/** A place the side column offers ("Home", the chat's folder). */
export interface ChooserPlaceLink {
  id: string;
  label: string;
  dir: string;
  icon?: IconName;
}

/** What was chosen. */
export interface ChooserResult {
  /** The computer the file is on (null when the host has one place only). */
  computer: { id: string; name: string } | null;
  /** The computer's realm by name, when the host's list says. */
  realm: string | null;
  /** The path under the root; a folder ends in "/" ('' is the root). */
  path: string;
  /** The path as it reads on the computer: the root's label and `path` joined. */
  fullPath: string;
  name: string;
  kind: 'file' | 'folder';
  size: number | null;
}

/** A PathField host's reads as the chooser takes them: one place, names only (plus whatever its entries carry). */
export function chooserFolderOf(read: PathReads): ChooserFolder {
  return {
    place: read.dir === null || read.dir === undefined ? null : { computer: null, dir: read.dir },
    entries: read.entries,
    ...(read.reading ? { reading: true } : {}),
    ...(read.failed ? { failed: true } : {}),
    ...(read.outside ? { outside: true } : {}),
  };
}

export const samePlace = (a: ChooserPlace | null, b: ChooserPlace | null): boolean => a !== null && b !== null && a.computer === b.computer && a.dir === b.dir;

export type ChooserSort = 'name' | 'size' | 'modified';
export interface ChooserView {
  sort: ChooserSort;
  desc: boolean;
  /** Names that start with a dot are listed. */
  hidden: boolean;
  /** The preview column is shown. */
  preview: boolean;
}
export const DEFAULT_VIEW: ChooserView = { sort: 'name', desc: false, hidden: false, preview: true };

// Made on first use, then kept: nothing is built when the module loads.
let collator: Intl.Collator | undefined;
const byName = { compare: (a: string, b: string): number => (collator ??= new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })).compare(a, b) };

/** The rows of a folder: names that cannot be written as a path inside the root are left out (pathSplit), hidden names
 *  only when asked (or when the filter itself starts with a dot), names holding `filter` (case ignored); folders first,
 *  then by the chosen column (an unknown size or time sorts last either way), then by name. */
export function chooserRows<E extends ChooserEntry>(entries: readonly E[], dir: string, view: Pick<ChooserView, 'sort' | 'desc' | 'hidden'>, filter = ''): E[] {
  const q = filter.toLowerCase();
  const dots = view.hidden || filter.startsWith('.');
  const rows = entries.filter((e) => pathSplit(dir + e.name) !== 'outside' && (dots || !e.name.startsWith('.')) && (q === '' || e.name.toLowerCase().includes(q)));
  const num = (e: E): number | null => (view.sort === 'size' ? (e.dir ? null : e.size ?? null) : e.modified ?? null);
  return rows.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    if (view.sort !== 'name') {
      const x = num(a), y = num(b);
      if (x !== y) {
        if (x === null) return 1;
        if (y === null) return -1;
        return view.desc ? y - x : x - y;
      }
      return byName.compare(a.name, b.name);
    }
    return view.desc ? byName.compare(b.name, a.name) : byName.compare(a.name, b.name);
  });
}

/** How many names the hidden-files switch would add. */
export const hiddenCount = (entries: readonly ChooserEntry[]): number => entries.filter((e) => e.name.startsWith('.')).length;

/** What the text typed in the chooser's box means: a filter of the open folder (no "/"), or a path under the root (its
 *  folder is opened, its last part filters). A path may start with the root's own label ("/etc/ho" under "/", "~/src"
 *  under "~"). 'outside' for a path that may leave the root. */
export function typedPlace(text: string, rootLabel: string): { dir: string; name: string } | { filter: string } | 'outside' {
  if (!text.includes('/')) return { filter: text };
  const root = rootLabel.endsWith('/') ? rootLabel : `${rootLabel}/`;
  const rel = text.startsWith(root) ? text.slice(root.length) : text;
  const split = pathSplit(rel);
  return split === 'outside' ? 'outside' : split;
}

/** "~" or "~/…" typed in the box, on a host that names the home folder (`home`: a folder under the root): the same path
 *  written in full, the home folder's path and then the rest, so it is listed like any typed path. Any other text is kept as
 *  typed. */
export function expandHome(text: string, rootLabel: string, home: string | undefined): string {
  if (home === undefined || !(text === '~' || text.startsWith('~/'))) return text;
  return `${fullPathOf(rootLabel, home).replace(/\/+$/u, '')}/${text.slice(2)}`;
}

/** The steps a path bar draws: every one while there are at most five, else the top, the folded middle (one menu) and the
 *  last two, so a deep folder never pushes the bar wider than the dialog. */
export function foldCrumbs<C>(crumbs: readonly C[]): { head: C[]; folded: C[]; tail: C[] } {
  if (crumbs.length <= 5) return { head: [...crumbs], folded: [], tail: [] };
  return { head: crumbs.slice(0, 1), folded: crumbs.slice(1, -2), tail: crumbs.slice(-2) };
}

/** The words a top place is named with. */
export type TopPlaceWords = (key: 'fc.topComputer' | 'fc.topHome' | 'fc.topAt', vars?: Record<string, string>) => string;

/** The side column's first places: the top folder, named for what it is ("Computer (/)" for the computer's own top, "Home
 *  (~)", else the root's path), then the home folder by its path when the host names one below the root. */
export function topPlaces(rootLabel: string, home: string | undefined, say: TopPlaceWords): ChooserPlaceLink[] {
  const top: ChooserPlaceLink = {
    id: 'top',
    label: rootLabel === '/' ? say('fc.topComputer') : rootLabel === '~' ? say('fc.topHome', { path: '~' }) : say('fc.topAt', { root: rootLabel }),
    dir: '',
    icon: rootLabel === '~' ? 'home' : 'files',
  };
  if (home === undefined || home === '') return [top];
  return [top, { id: 'home-top', label: say('fc.topHome', { path: fullPathOf(rootLabel, home).replace(/\/+$/u, '') }), dir: home, icon: 'home' }];
}

/** A path under the root as it reads on the computer ("/" + "etc/hosts", "~" + "src/" → "~/src/"). */
export function fullPathOf(rootLabel: string, path: string): string {
  const root = rootLabel.endsWith('/') ? rootLabel : `${rootLabel}/`;
  return path === '' ? rootLabel : root + path;
}

/** A long name in two parts, so the row can cut it in the middle and keep its ending (the extension, a counter): the
 *  start shrinks with an ellipsis, the end never does. A short name is one part. */
export function nameParts(name: string): [string, string] {
  const chars = [...name];
  if (chars.length <= 24) return [name, ''];
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? [...name.slice(dot)].length : 0;
  const keep = Math.min(12, Math.max(6, ext + 4));
  return [chars.slice(0, -keep).join(''), chars.slice(-keep).join('')];
}

/** The icon of an entry, by what it is and how its name ends. */
export function entryIcon(e: Pick<ChooserEntry, 'name' | 'dir'>): IconName {
  if (e.dir) return 'files';
  const ext = /\.([A-Za-z0-9]+)$/u.exec(e.name)?.[1]?.toLowerCase() ?? '';
  if (IMAGE.has(ext)) return 'file-image';
  if (ARCHIVE.has(ext)) return 'file-archive';
  if (CODE.has(ext)) return 'file-code';
  return 'file';
}
const IMAGE: ReadonlySet<string> = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif']);
const ARCHIVE: ReadonlySet<string> = new Set(['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'zst', 'rar']);
const CODE: ReadonlySet<string> = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'py', 'go', 'rs', 'sh', 'c', 'h', 'cpp', 'java', 'rb', 'php', 'css', 'html', 'xml', 'yaml', 'yml', 'toml', 'sql', 'lua']);

/** An `accept` rule by name ending: files whose name ends in one of `extensions` (no dot, case ignored) can be chosen;
 *  any other file is refused with `why`. */
export function acceptExtensions(extensions: readonly string[], why: string): (e: ChooserEntry) => string | null {
  const ok = new Set(extensions.map((x) => x.toLowerCase().replace(/^\./u, '')));
  return (e) => (e.dir || ok.has(/\.([^.]+)$/u.exec(e.name)?.[1]?.toLowerCase() ?? '') ? null : why);
}

/** A path as the agent's "@" mention writes it: bare, or quoted when it holds whitespace or a quote (kit/agent/mention.ts). */
export function mentionText(path: string): string {
  return /\s|"/u.test(path) ? `@"${path.replace(/["\\]/gu, (c) => '\\' + c)}"` : `@${path}`;
}

/** A chosen file as words in a message, in the form the agent really reads. The agent expands nothing: an "@" path is
 *  text the model reads and opens with its own file tool, which reads the chat's own computer only. So a file on the
 *  chat's computer (`own`) is the plain mention; a file on another computer is the same mention followed by that
 *  computer's exact name, which the model can pass to the tools that take a computer. No `computer:path` form is written:
 *  the agent has none. */
export function fileReferenceText(picked: Pick<ChooserResult, 'computer' | 'fullPath'>, own: string | null): string {
  const mention = mentionText(picked.fullPath);
  if (picked.computer === null || picked.computer.id === own) return mention;
  return `${mention} (on the computer "${picked.computer.name.replace(/["\\]/gu, '')}")`;
}

/** Where a carried file came from, as one word-safe token: "<computer>:<path>". Shown on its chip and written on the
 *  fence line of a text file's contents; it names the origin for the reader, and is not a reference the agent resolves. */
export function fileOriginText(picked: Pick<ChooserResult, 'computer' | 'fullPath'>): string {
  return picked.computer ? `${picked.computer.name}:${picked.fullPath}` : picked.fullPath;
}

// ── Recent places and files, on this device ─────────────────────────────────────────────────────────────────────────
// Kept under `hub.v3.pane.filechooser.<name>` (the registered `hub.v3.pane.` prefix: purged with the account). Paths and
// computer names only, newest first, a few of each.

export interface RecentItem {
  computer: { id: string; name: string } | null;
  /** A folder ("a/b/", '' the root) or a file ("a/b/name"). */
  path: string;
}
export interface ChooserMemory {
  places: RecentItem[];
  files: RecentItem[];
  view: ChooserView;
}
export const RECENT_MAX = 8;
const STORE = 'hub.v3.pane.filechooser.';
const NAME_OK = /^[a-z][a-z0-9-]{1,30}$/u;

const itemOf = (v: unknown): RecentItem | null => {
  if (!v || typeof v !== 'object') return null;
  const x = v as { computer?: unknown; path?: unknown };
  if (typeof x.path !== 'string' || x.path.length > 4096 || pathSplit(x.path) === 'outside') return null;
  if (x.computer === null) return { computer: null, path: x.path };
  const c = x.computer as { id?: unknown; name?: unknown } | undefined;
  return c && typeof c.id === 'string' && typeof c.name === 'string' && c.id.length <= 64 && c.name.length <= 256 ? { computer: { id: c.id, name: c.name }, path: x.path } : null;
};
const listOf = (v: unknown): RecentItem[] => (Array.isArray(v) ? v.map(itemOf).filter((x): x is RecentItem => x !== null).slice(0, RECENT_MAX) : []);

/** What a stored value holds; anything not written by `rememberChooser` reads as nothing kept. */
export function memoryOf(raw: string | null): ChooserMemory {
  let v: { places?: unknown; files?: unknown; view?: Partial<Record<keyof ChooserView, unknown>> } = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) v = parsed as typeof v;
  } catch { /* nothing kept */ }
  const w = v.view && typeof v.view === 'object' ? v.view : {};
  return {
    places: listOf(v.places),
    files: listOf(v.files),
    view: {
      sort: w.sort === 'size' || w.sort === 'modified' ? w.sort : 'name',
      desc: w.desc === true,
      hidden: w.hidden === true,
      preview: w.preview !== false,
    },
  };
}

const sameItem = (a: RecentItem, b: RecentItem) => a.path === b.path && (a.computer?.id ?? null) === (b.computer?.id ?? null);
/** `item` first, once, and at most RECENT_MAX. */
export const pushRecent = (list: readonly RecentItem[], item: RecentItem): RecentItem[] => [item, ...list.filter((x) => !sameItem(x, item))].slice(0, RECENT_MAX);

/** What this device keeps for the chooser named `name` (nothing for a name that is no storage key part, or without storage). */
export function readChooserMemory(name: string | undefined): ChooserMemory {
  if (!name || !NAME_OK.test(name)) return memoryOf(null);
  try { return memoryOf(hostEnv().local?.getItem(STORE + name) ?? null); } catch { return memoryOf(null); }
}

export function rememberChooser(name: string | undefined, memory: ChooserMemory): void {
  if (!name || !NAME_OK.test(name)) return;
  try { hostEnv().local?.setItem(STORE + name, JSON.stringify(memory)); } catch { /* not kept */ }
}
