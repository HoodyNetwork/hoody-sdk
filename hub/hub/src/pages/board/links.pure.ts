// The Board's public hrefs and their parsers (split out of links.ts so the terminal build shares them). links.ts stays the
// only file other pages import from this folder: it re-exports every name here and keeps hubOrigin and tileConv (they
// read this Hub's own origin through core).
import type { Target } from '@core';
import { computersDomain } from './computers';
import { CATALOG, isTileProgram, oneSession, startView, TILE_PROGRAMS, type TileProgram } from './embed/catalog';
import type { EmbedValue } from './embed/build';
import { storableParams, tileUrl } from './embed/options';
import { SSH_HOST, SSH_USER } from './sshRules';
import { cleanName, forKeyOk, webUrl, type ConvRef, type UrlTile } from './model/boards';

export const links = {
  board: '/board',
  /** One Board of the current realm (an unknown id shows the active Board). */
  boardById: (id: string) => `/board?b=${encodeURIComponent(id)}`,
} as const;

/** What a Connect over SSH link fills in: the computer ssh runs from (its handle), the host, the user and
 *  the port. Never a password, a key or a command. */
export interface ConnectSshRef {
  readonly handle?: string;
  readonly host: string;
  readonly user?: string;
  readonly port?: number;
}

const HANDLE = /^[^\s/?#]{1,80}$/;
const portOk = (p: unknown): boolean => Number.isInteger(p) && (p as number) >= 1 && (p as number) <= 65535;

/** The Board with Connect over SSH open and filled in: `/board?connect=ssh&computer=…&host=…&user=…&port=…`. The
 *  person still presses Connect. '' when a value is one the form would refuse (link nothing then). */
export function boardConnectSshLink(r: ConnectSshRef): string {
  if (!SSH_HOST.test(r.host) || (r.user !== undefined && !SSH_USER.test(r.user)) || (r.port !== undefined && !portOk(r.port)) || (r.handle !== undefined && !HANDLE.test(r.handle))) return '';
  const q = new URLSearchParams({ connect: 'ssh' });
  if (r.handle !== undefined) q.set('computer', r.handle);
  q.set('host', r.host);
  if (r.user !== undefined) q.set('user', r.user);
  if (r.port !== undefined) q.set('port', String(r.port));
  return '/board?' + q.toString();
}

/** A Connect over SSH link's values read back for the form: each one the form would refuse is left out (the person
 *  fills it in); null when the link is not a Connect over SSH link. Values may arrive as numbers (the router's). */
export function parseConnectSsh(q: Readonly<Record<string, unknown>>): { computer?: string; host?: string; user?: string; port?: string } | null {
  if (q.connect !== 'ssh') return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
  const computer = str(q.computer), host = str(q.host), user = str(q.user), port = str(q.port);
  return {
    ...(HANDLE.test(computer) ? { computer } : {}),
    ...(SSH_HOST.test(host) ? { host } : {}),
    ...(SSH_USER.test(user) ? { user } : {}),
    ...(/^[0-9]{1,5}$/.test(port) && portOk(Number(port)) ? { port } : {}),
  };
}

// ── A conversation on a Board (AI tab) ───────────────────────────────────────────────────
/** The Hub's own page: the server serves the Hub there only (app/router.tsx), its routes live after the '#'. */
const HUB_PAGE = '/auth/home';
const CONV_REALM = /^(?:global|[0-9a-f]{24})$/;
// A session id is one opaque path segment (as the AI tab's references take it): never anything that leaves the path.
const CONV_SID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
// A lone UTF-16 surrogate: URL encoding would turn it into U+FFFD, so two handles would share one link.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** An origin a Board tile can name: exactly what URL gives as an http(s) origin (no path, no 'null'). */
function originOk(origin: string): boolean {
  if (!/^https?:\/\//.test(origin)) return false;
  try { return new URL(origin).origin === origin; } catch { return false; }
}

/** A conversation's canonical Hub link, the address its Board tile is stored under:
 *  `<origin>/auth/home#/ai/c/<sid>?computer=<handle>&realm=<realm>`. '' when the origin or a part of the reference is
 *  one the Board would not keep (link nothing then). */
export function convTileUrl(origin: string, r: ConvRef): string {
  if (!originOk(origin) || !CONV_REALM.test(r.realm) || !CONV_SID.test(r.sid)) return '';
  if (!HANDLE.test(r.computer) || LONE_SURROGATE.test(r.computer)) return '';
  const url = `${origin}${HUB_PAGE}#/ai/c/${encodeURIComponent(r.sid)}?${new URLSearchParams({ computer: r.computer, realm: r.realm }).toString()}`;
  return webUrl(url) === url ? url : '';
}

/** The reference a stored address names when it is exactly a conversation's canonical link on `origin` (convTileUrl),
 *  else null: another origin, page or route, a reordered or extra query value, a fragment, or a bad part. */
export function parseConvTileUrl(url: string, origin: string): ConvRef | null {
  const head = `${origin}${HUB_PAGE}#/ai/c/`;
  if (!originOk(origin) || !url.startsWith(head)) return null;
  const rest = url.slice(head.length);
  const q = rest.indexOf('?');
  if (q < 0) return null;
  let sid: string;
  try { sid = decodeURIComponent(rest.slice(0, q)); } catch { return null; }
  const p = new URLSearchParams(rest.slice(q + 1));
  const computer = p.get('computer'), realm = p.get('realm');
  if (computer === null || realm === null) return null;
  const r: ConvRef = { computer, realm, sid };
  return convTileUrl(origin, r) === url ? r : null;
}

/** A conversation's Board tile on `origin`: the web tile {url, name?} of its canonical link (its label kept by cleanName
 *  rules when not empty), or null when the reference has no link (convTileUrl). */
export function convTile(origin: string, r: ConvRef, name?: string): UrlTile | null {
  const url = convTileUrl(origin, r);
  if (!url) return null;
  const label = name === undefined ? null : cleanName(name);
  return { url, ...(label ? { name: label } : {}) };
}

export interface ProgramViewRef {
  readonly handle: string;
  readonly program: TileProgram;
  readonly session: number;
}

/** The program view: one program full-area (`/board/open/<handle>/<program>-<n>`). */
export function programViewPath(r: ProgramViewRef): string {
  return `/board/open/${encodeURIComponent(r.handle)}/${r.program}-${r.session}`;
}

/** A computer's HTTP port, or its Exec script by route (port 1), shown alone with "Add to Board". */
export interface PortViewRef {
  readonly handle: string;
  readonly protocol: 'http' | 'exec';
  readonly port: number;
  /** The script's route (`/`, `/orders/list`), for protocol 'exec'. */
  readonly path?: string;
}

export type ViewRef = ProgramViewRef | PortViewRef;

const ROUTE_SEGMENT = /^[A-Za-z0-9_.-]+$/;
/** The longest script route a tile, a stored Board and a view link take (one grammar for all three). */
export const ROUTE_MAX = 200;
/** A script route the Board can show: `/`, or `/` + plain segments (letters, digits, `_ . -`; no `.` or `..`), at
 *  most ROUTE_MAX characters. The picker offers, storage keeps and portViewPath links only these. */
export const routeOk = (path: string): boolean => path === '/' || (path.length <= ROUTE_MAX && path.startsWith('/') && path.slice(1).split('/').every((p) => ROUTE_SEGMENT.test(p) && p !== '.' && p !== '..'));

/** `/board/open/<handle>/port-<n>` for an HTTP port, `/board/open/<handle>/script/<route…>` for a script (the route's
 *  own segments; `/` is `…/script`). A route with other characters has no view: '' (link nothing then). */
export function portViewPath(r: PortViewRef): string {
  const base = `/board/open/${encodeURIComponent(r.handle)}/`;
  if (r.protocol === 'http') return Number.isInteger(r.port) && r.port >= 1 && r.port <= 65535 ? `${base}port-${r.port}` : '';
  const path = r.path ?? '/';
  return routeOk(path) ? `${base}script${path === '/' ? '' : path}` : '';
}

/** The sub-path below /board read back as a program, port or script view, or null. */
export function parseView(parts: readonly string[]): ViewRef | null {
  const program = parseProgramView(parts);
  if (program) return program;
  if (parts.length < 3 || parts[0] !== 'open') return null;
  const handle = parts[1] ?? '';
  if (!handle || handle.length > 80) return null;
  if (parts[2] === 'script') {
    const path = '/' + parts.slice(3).join('/');
    return routeOk(path) ? { handle, protocol: 'exec', port: 1, path } : null;
  }
  const m = parts.length === 3 ? /^port-([1-9][0-9]{0,4})$/.exec(parts[2] ?? '') : null;
  const port = m ? Number(m[1]) : 0;
  return port >= 1 && port <= 65535 ? { handle, protocol: 'http', port } : null;
}

/** The sub-path below /board read back as a program view, or null. */
export function parseProgramView(parts: readonly string[]): ProgramViewRef | null {
  if (parts.length !== 3 || parts[0] !== 'open') return null;
  const handle = parts[1] ?? '';
  const m = /^([a-z]+)-([1-9][0-9]{0,4})$/.exec(parts[2] ?? '');
  if (!handle || handle.length > 80 || !m || !isTileProgram(m[1])) return null;
  const session = Number(m[2]);
  return session <= 65535 ? { handle, program: m[1], session } : null;
}

/** Whether the Board can give a terminal or display tile of this session on this computer an address: false only when
 *  its host label is too long even in core's short form (HOST_LABEL_TOO_LONG). Built by the Board's own tile URL
 *  builder, so it follows every rule a tile follows. Any other refusal (no proxy domain here, a computer whose server
 *  is not known yet) stays the tile's own to show: true. */
export function tileHostFits(program: 'terminal' | 'display', session: number, target: { readonly id: string; readonly project_id: string; readonly server_name?: string }): boolean {
  const r = tileUrl(CATALOG, { program, session }, { id: target.id, project_id: target.project_id, server_name: target.server_name ?? '' }, { computersDomain: computersDomain() });
  return !('refused' in r && r.refused === 'HOST_LABEL_TOO_LONG');
}

/** What a files or notes tile opens on, instead of the program's start view (Put on Board for one folder, file or
 *  note: Files' rows, Notes' rows): a folder or a file by its absolute path as Files shows it
 *  (Files' folder and editor views), or one Notes page by the viewer's user id in its notebook and its node id (Notes'
 *  node view). */
export type BoardOpen =
  | { readonly view: 'folder' | 'editor'; readonly path: string }
  | { readonly view: 'node'; readonly userId: string; readonly nodeId: string };

/** Where another page puts a tile (Apps' Put on Board, Add to Board): a session of any tile program (a files or notes
 *  tile may open on one folder, file or note: BoardOpen), a new terminal (the Board picks its number, addNew.ts;
 *  Computers' New terminal), or a web port with its route. */
/** A program board an Add link lands on (Open with): its key on that computer and the program's
 *  name ("Nano"), which names a new board "Nano · <computer>". */
export interface BoardKey { readonly k: string; readonly label: string }
export type BoardAddAt = { kind: TileProgram; session: number; open?: BoardOpen; board?: BoardKey } | { kind: 'terminal'; session: 'new' } | { kind: 'port'; port: number; path: string };
/** An Add link read back: the computer's id and the tile, a program session (with what it opens on, when
 *  the link names it) or an HTTP port (path absent: `/`). */
export type BoardAddRef =
  | { readonly cid: string; readonly program: TileProgram; readonly session: number; readonly open?: BoardOpen; readonly board?: BoardKey }
  | NewTerminalRef
  | { readonly cid: string; readonly protocol: 'http'; readonly port: number; readonly path?: string };

/** An Add link for a new terminal, read back: the Board gives it its number (addNew.ts). */
export type NewTerminalRef = { readonly cid: string; readonly program: 'terminal'; readonly session: 'new' };
/** Whether an Add link (to build, or read back) is a new terminal's. */
export function isNewTerminal(x: BoardAddAt): x is { kind: 'terminal'; session: 'new' };
export function isNewTerminal(x: BoardAddRef): x is NewTerminalRef;
export function isNewTerminal(x: BoardAddAt | BoardAddRef): boolean {
  return 'session' in x && x.session === 'new' && ('kind' in x ? x.kind === 'terminal' : x.program === 'terminal');
}

/** Whether an Add link may name this session: a program the picker offers (it has a start view), and for a program
 *  with one instance (files, sqlite) only session 1, as the picker adds it. */
function addableSession(program: TileProgram, session: number): boolean {
  return startView(CATALOG, program) !== undefined && (session === 1 || !oneSession(CATALOG, program));
}

const NOTES_ID = /^[0-9a-z]{24,28}$/;
/** The tile's view and options for what it opens on, or null when a tile of this program cannot open there (files: a
 *  folder or a file by an absolute path without control characters; notes: one page by two Notes ids, as the
 *  catalogue's node view takes them). Only values the Board keeps in storage as given (storableParams: the catalogue's
 *  checks and size), so a stored tile opens where the link said, never quietly on the start view. A note opens with
 *  the notebook sidebar hidden: the Board's default for one page, not a value of the link, kept as
 *  an ordinary option the person can clear in the tile's Options. */
export function openTile(program: TileProgram, o: BoardOpen): { view: BoardOpen['view']; params: Record<string, EmbedValue> } | null {
  let params: Record<string, string>;
  if (o.view === 'node') {
    if (program !== 'notes' || !NOTES_ID.test(o.userId) || !NOTES_ID.test(o.nodeId)) return null;
    params = { userId: o.userId, nodeId: o.nodeId, sidebar: 'hidden' };
  } else {
    if (program !== 'files' || (o.view !== 'folder' && o.view !== 'editor') || !o.path.startsWith('/') || /[\u0000-\u001f\u007f-\u009f]/.test(o.path)) return null;
    params = { path: o.path };
  }
  const kept = storableParams(CATALOG, program, o.view, params);
  return Object.entries(params).every(([k, v]) => kept[k] === v) ? { view: o.view, params: kept } : null;
}
/** Whether a tile of this program can open on this (openTile). */
export const openFits = (program: TileProgram, o: BoardOpen): boolean => openTile(program, o) !== null;

// Program names are plain lowercase words with no regex metacharacters, so they join the pattern unescaped; a name with one would need escaping.
const ADD_RE = new RegExp(`^(${[...TILE_PROGRAMS, 'port'].join('|')})-([1-9][0-9]{0,4})$`);

const CID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

/** A program board's key and name as a link carries them, or null: a key of 1-64 characters with no control character
 *  (forKeyOk), and a name a Board name may be (cleanName), not empty. */
function boardKeyOf(k: unknown, label: unknown): BoardKey | null {
  if (!forKeyOk(k) || typeof label !== 'string') return null;
  const name = cleanName(label);
  return name ? { k, label: name } : null;
}

/** The Board putting one tile on its active Board, once: `/board?add=terminal-3&cid=<computer id>` (any tile program:
 *  agent-1, files-1, browser-2, notes-1…; a files tile on one folder or file adds `&open=folder|editor&at=<path>`, a
 *  notes tile on one page `&open=node&user=<user id>&node=<node id>`), or `/board?add=port-8080&cid=<computer id>&path=<route>` (no path for
 *  `/`), or `/board?add=terminal-new&cid=<computer id>` (a new terminal: the Board gives it the next free number,
 *  addNew.ts). The Board drops it from the address at once, then finds the computer by that exact id in the realm's
 *  list when the list answers. '' when the session (addableSession), number, port or route is one the Board would not keep
 *  (routeOk) or the id is not one (link nothing then). */
export function boardAddPath(target: Target, at: BoardAddAt): string {
  const cid = target.container.id;
  if (!CID.test(cid)) return '';
  if (isNewTerminal(at)) return '/board?' + new URLSearchParams({ add: 'terminal-new', cid }).toString();
  const n = at.kind === 'port' ? at.port : at.session;
  if (!portOk(n)) return '';
  if (at.kind !== 'port' && !addableSession(at.kind, n)) return '';
  if (at.kind !== 'port' && at.open && !openFits(at.kind, at.open)) return '';
  // A program board's link: `&for=<key>&label=<name>`, never with an opened file; '' when either is bad.
  const board = at.kind !== 'port' ? at.board : undefined;
  const key = board ? boardKeyOf(board.k, board.label) : null;
  if (board && (!key || (at.kind !== 'port' && at.open))) return '';
  const path = at.kind === 'port' && at.path !== '' && at.path !== '/' ? at.path : undefined;
  if (path !== undefined && !routeOk(path)) return '';
  const q = new URLSearchParams({ add: at.kind + '-' + n, cid });
  if (path !== undefined) q.set('path', path);
  const open = at.kind !== 'port' ? at.open : undefined;
  if (open) {
    q.set('open', open.view);
    if (open.view === 'node') { q.set('user', open.userId); q.set('node', open.nodeId); }
    else q.set('at', open.path);
  }
  if (key) { q.set('for', key.k); q.set('label', key.label); }
  return '/board?' + q.toString();
}

/** An Add link's values read back, or null when it is not a whole, valid Add link (a value of the wrong type included):
 *  then nothing is added. */
export function parseBoardAdd(q: Readonly<Record<string, unknown>>): BoardAddRef | null {
  const { add, cid, path, open, at, user, node, for: forKey, label } = q;
  if (typeof add !== 'string' || typeof cid !== 'string' || (path !== undefined && typeof path !== 'string')) return null;
  if ([open, at, user, node].some((v) => v !== undefined && typeof v !== 'string')) return null;
  const opens = open !== undefined || at !== undefined || user !== undefined || node !== undefined;
  // A program board's key and name: both or neither, valid, and only on a plain program tile.
  const keyed = forKey !== undefined || label !== undefined;
  const board = keyed ? boardKeyOf(forKey, label) : null;
  if (keyed && (!board || opens)) return null;
  if (add === 'terminal-new') return CID.test(cid) && !opens && !keyed ? { cid, program: 'terminal', session: 'new' } : null;
  const m = ADD_RE.exec(add);
  if (!m || !CID.test(cid)) return null;
  const n = Number(m[2]);
  if (!portOk(n)) return null;
  if (m[1] !== 'port') {
    const program = m[1];
    if (!isTileProgram(program) || !addableSession(program, n)) return null;
    if (!opens) return board ? { cid, program, session: n, board } : { cid, program, session: n };
    const o: BoardOpen | null =
      open === 'node' && typeof user === 'string' && typeof node === 'string' && at === undefined ? { view: 'node', userId: user, nodeId: node }
      : (open === 'folder' || open === 'editor') && typeof at === 'string' && user === undefined && node === undefined ? { view: open, path: at }
      : null;
    return o && openFits(program, o) ? { cid, program, session: n, open: o } : null;
  }
  if (opens || keyed) return null;
  if (path === undefined || path === '' || path === '/') return { cid, protocol: 'http', port: n };
  return routeOk(path) ? { cid, protocol: 'http', port: n, path } : null;
}

/** A chat's marked link (the kit's LinkHost.boardAdd): the Board's Add link for a program session or a web port
 *  of the chat's own computer, or '' for another computer, a tile the Board does not keep, or a terminal or display session the
 *  Board cannot address (BoardAddButton's own rules). A web port keeps its page when the path is a route the
 *  Board stores (routeOk); any other path, and the query, leave it at `/` (Open in a new tab keeps both). */
export function linkBoardAddPath(
  chat: { readonly id: string; readonly project: string; readonly server?: string | undefined },
  at: { readonly computer: string; readonly project: string; readonly family: 'program' | 'port'; readonly name: string; readonly n: string; readonly path?: string | undefined },
): string {
  if (at.computer !== chat.id || at.project !== chat.project) return '';
  const n = Number(at.n);
  if (!Number.isInteger(n) || n < 1) return '';
  const target: Target = { project: { id: chat.project }, container: { id: chat.id, server_name: chat.server ?? '' } };
  if (at.family === 'port') return boardAddPath(target, { kind: 'port', port: n, path: at.path !== undefined && routeOk(at.path) ? at.path : '/' });
  if (!isTileProgram(at.name)) return '';
  if ((at.name === 'terminal' || at.name === 'display') && !tileHostFits(at.name, n, { id: chat.id, project_id: chat.project, server_name: chat.server ?? '' })) return '';
  return boardAddPath(target, { kind: at.name, session: n });
}
