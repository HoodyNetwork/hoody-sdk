// TEST ONLY. A frozen copy of persist.ts as the Board stored it before conversation tiles (sha256 prefix
// 935ce3be285d2fc3): an old Hub tab still open reads and writes with this. Never edit it to follow persist.ts, and never
// import it from product code (persist.compat.test.ts alone imports it).
// Reading a realm's stored Boards (hub_boards_v1, one value per account and realm). Pure: fail closed, never throws.
//
// Contract, in plain words:
//   - parseRealmBoards(raw) → {state, notice}. Nothing stored (null) gives a fresh realm and no notice. A stored
//     value that is not a v1 document, or keeps no valid Board, gives a fresh realm and notice {kind: 'reset'}.
//     Boards that fail give {kind: 'boards', n} (the others load); a bad tile in a good Board gives {kind: 'tile'}.
//     The view says so in one line. Nothing is written back here: the skipped data stays until the next save.
//   - Whole value unreadable (the reset case): its raw text is kept beside the fresh state as unreadable {at, raw}
//     (at most UNREADABLE_MAX characters) and written back with every later save, so the first save of the fresh
//     Board never destroys what was there. It is dropped UNREADABLE_DAYS after `at`. A kept unreadable stays as it is.
//   - Invalid parts are dropped, never fixed: a Board with a bad id or layout, a layout with a repeated slot or more
//     than MAX_SLOTS slots or deeper than the slot count allows, a ratio outside (0, 1) (one inside is clamped to
//     RATIO_MIN..RATIO_MAX). A bad tile (a project or
//     container that is not one DNS label, an unknown program, a session outside 1..65535, a view that is not a
//     plain name, params that are not a small plain object; a web tile whose address is not http(s); a port tile
//     with a bad protocol, port or script path; an ssh that is not a terminal's or fails sshRules) becomes an empty
//     slot: an SSH tile is never read back as a plain terminal. A tile name that cleanName refuses is
//     dropped (the default label shows). Recents keep program tiles only. Boards past MAX_BOARDS go.
//   - Params are shape-checked (plain object, at most 64 keys, small values), then kept only as storableParams
//     allows, on read AND on write (toStored), whatever wrote them: options the view does not have, the catalogue's
//     refused options (ssh_password, env, cmd…), Board-owned ones and values failing their checks are dropped, and so
//     is a raw credential (a JWT or bearer header) typed into a plain text field (storageRefusal). URL options
//     (iframe_url, panel) are kept exactly as typed, user:pw@ and query included.
//   - gone (ids of Boards deleted, for the two-tab merge) keeps valid ids of Boards not present, at most GONE_MAX.
//   - keep (keep the Board loaded on other pages) is kept only as the value true; anything else reads as off.
//   - toStored(state) is what is written: the same shape, so read(write(x)) is x.
import { CATALOG as CAT, isTileProgram } from '../embed/catalog';
import { storableParams } from '../embed/options';
import { routeOk } from '../links';
import { parseMode } from '../scroll/mode';
import { GONE_MAX, MAX_BOARDS, RECENTS_MAX, cleanName, forKeyOk, webUrl } from './boards';
// An old Hub tab's own limit: boards.ts allows 8, the tab this file stands in for allows 6.
const MAX_SLOTS = 6;
import { freshRealm, isProgramTile, type Board, type BoardFor, type PortTile, type Rand, type RealmBoards, type Tile, type TileRef } from './persist.v1-types';
import { RATIO_MAX, RATIO_MIN, slots, type Node } from './tree';
import { sshOf, type Ssh } from '../sshRules';

export const UNREADABLE_MAX = 32768;
export const UNREADABLE_DAYS = 30;
const DAY_MS = 86_400_000;

export type LoadNotice = { readonly kind: 'reset' } | { readonly kind: 'boards'; readonly n: number } | { readonly kind: 'tile' } | null;
export interface Loaded {
  readonly state: RealmBoards;
  readonly notice: LoadNotice;
  /** Nothing usable is stored: state is a fresh realm no one has written yet (nothing stored, or the reset case). */
  readonly fresh?: true;
}

const BOARD_ID = /^b[a-z0-9]{4,16}$/;
// A program board's computer: a container id, as an Add link names it (links.ts CID).
const FOR_CID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const SLOT_ID = /^s[a-z0-9]{3,16}$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const VIEW = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
const PARAM_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const PARAMS_MAX_KEYS = 64;
const PARAMS_MAX_CHARS = 8192;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function parseLayout(v: unknown, depth: number, seen: Set<string>): Node | null {
  if (!isObj(v) || depth > MAX_SLOTS) return null;
  if ('slot' in v) {
    if (typeof v.slot !== 'string' || !SLOT_ID.test(v.slot) || seen.has(v.slot) || seen.size >= MAX_SLOTS) return null;
    seen.add(v.slot);
    return { slot: v.slot };
  }
  if ((v.dir !== 'row' && v.dir !== 'col') || typeof v.ratio !== 'number' || !(v.ratio > 0 && v.ratio < 1)) return null;
  const a = parseLayout(v.a, depth + 1, seen);
  const b = a && parseLayout(v.b, depth + 1, seen);
  return a && b ? { dir: v.dir, ratio: Math.min(RATIO_MAX, Math.max(RATIO_MIN, v.ratio)), a, b } : null;
}

function parseParams(v: unknown): Record<string, never> | null {
  if (v === undefined) return {};
  if (!isObj(v)) return null;
  const keys = Object.keys(v);
  if (keys.length > PARAMS_MAX_KEYS || keys.some((k) => !PARAM_KEY.test(k))) return null;
  let text: string;
  try { text = JSON.stringify(v); } catch { return null; }
  return text.length <= PARAMS_MAX_CHARS ? (JSON.parse(text) as Record<string, never>) : null;
}

/** A tile's own label, when it has a usable one (cleanName rules, not empty). */
const nameOf = (v: Record<string, unknown>): { name?: string } => {
  const n = typeof v.name === 'string' ? cleanName(v.name) : null;
  return n ? { name: n } : {};
};

/** One stored tile of any kind (program first, so a program tile carrying a stray url stays a program tile), or null. */
export function parseTile(v: unknown): Tile | null {
  if (!isObj(v)) return null;
  if ('program' in v) return parseProgramTile(v);
  if ('url' in v) {
    const url = typeof v.url === 'string' ? webUrl(v.url) : null;
    return url ? { url, ...nameOf(v) } : null;
  }
  const { project, container, protocol, port, path } = v;
  if (typeof project !== 'string' || !LABEL.test(project) || typeof container !== 'string' || !LABEL.test(container)) return null;
  if ((protocol !== 'http' && protocol !== 'exec') || typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (path !== undefined && (typeof path !== 'string' || !routeOk(path))) return null;
  const t: PortTile = { project, container, protocol, port };
  return { ...t, ...(typeof path === 'string' ? { path } : {}), ...nameOf(v) };
}

/** A terminal's ssh {host, user, port} exactly as sshRules sends it; undefined when absent, null when bad. */
function parseSsh(program: unknown, v: unknown): Ssh | null | undefined {
  if (v === undefined) return undefined;
  if (program !== 'terminal' || !isObj(v) || typeof v.host !== 'string' || typeof v.user !== 'string' || typeof v.port !== 'number') return null;
  const ssh = sshOf({ host: v.host, user: v.user, port: String(v.port) });
  return ssh && ssh.host === v.host && ssh.user === v.user && ssh.port === v.port ? ssh : null;
}

/** A program tile ({project, container, program, session, view?, params?, ssh?, name?}), or null. */
export function parseProgramTile(v: unknown): TileRef | null {
  if (!isObj(v)) return null;
  const { project, container, program, session, view } = v;
  if (typeof project !== 'string' || !LABEL.test(project) || typeof container !== 'string' || !LABEL.test(container)) return null;
  if (!isTileProgram(program) || typeof session !== 'number' || !Number.isInteger(session) || session < 1 || session > 65535) return null;
  if (view !== undefined && (typeof view !== 'string' || !VIEW.test(view))) return null;
  const shaped = parseParams(v.params);
  if (shaped === null) return null;
  const params = storableParams(CAT, program, view as string | undefined, shaped);
  const ssh = parseSsh(program, v.ssh);
  if (ssh === null) return null;
  const t: TileRef = { project, container, program, session };
  return { ...t, ...(view !== undefined ? { view } : {}), ...(Object.keys(params).length ? { params } : {}), ...(ssh ? { ssh } : {}), ...nameOf(v) };
}

/** A program board's key {c, k} exactly (Open with design §1.1); anything else is dropped and the Board kept as an ordinary one. */
function parseFor(v: unknown): BoardFor | undefined {
  if (!isObj(v) || Object.keys(v).length !== 2 || typeof v.c !== 'string' || !FOR_CID.test(v.c) || !forKeyOk(v.k)) return undefined;
  return { c: v.c, k: v.k };
}

function parseBoard(v: unknown, flag: () => void): Board | null {
  if (!isObj(v) || typeof v.id !== 'string' || !BOARD_ID.test(v.id)) return null;
  const name = typeof v.name === 'string' ? cleanName(v.name) : null;
  const layout = parseLayout(v.layout, 0, new Set());
  if (name === null || !layout) return null;
  const ids = slots(layout);
  const tilesIn = isObj(v.tiles) ? v.tiles : {};
  if (!isObj(v.tiles)) flag();
  const tiles: Record<string, Tile | null> = {};
  for (const s of ids) {
    const raw = tilesIn[s];
    const t = raw == null ? null : parseTile(raw);
    if (raw != null && !t) flag();
    tiles[s] = t;
  }
  const active = typeof v.active === 'string' && ids.includes(v.active) ? v.active : (ids[0] as string);
  const max = typeof v.max === 'string' && ids.includes(v.max) ? v.max : null;
  const key = parseFor(v.for);
  return { id: v.id, name, layout, tiles, active, max, ...(parseMode(v.mode) ? { mode: 'scroll' as const } : {}), ...(key ? { for: key } : {}) };
}

/** A realm's Boards from what is stored (see the contract). */
function keptUnreadable(raw: unknown, now: number): { at: number; raw: string } | undefined {
  const u = isObj(raw) && isObj(raw.unreadable) ? raw.unreadable : null;
  if (!u || typeof u.at !== 'number' || typeof u.raw !== 'string' || u.raw.length > UNREADABLE_MAX) return undefined;
  return u.at <= now && now - u.at < UNREADABLE_DAYS * DAY_MS ? { at: u.at, raw: u.raw } : undefined;
}

function reset(raw: unknown, rand: Rand, now: number): Loaded {
  let text: string;
  try { text = JSON.stringify(raw) ?? String(raw); } catch { text = String(raw); }
  const unreadable = keptUnreadable(raw, now) ?? { at: now, raw: text.slice(0, UNREADABLE_MAX) };
  return { state: { ...freshRealm(rand), unreadable }, notice: { kind: 'reset' }, fresh: true };
}

export function parseRealmBoards(raw: unknown, rand: Rand = Math.random, now: number = Date.now()): Loaded {
  if (raw === null || raw === undefined) return { state: freshRealm(rand), notice: null, fresh: true };
  if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.boards)) return reset(raw, rand, now);
  let badTile = false;
  const flag = () => { badTile = true; };
  const boards: Board[] = [];
  const ids = new Set<string>();
  let dropped = 0;
  for (const b of raw.boards) {
    const p = boards.length < MAX_BOARDS ? parseBoard(b, flag) : null;
    if (!p || ids.has(p.id)) { dropped++; continue; }
    ids.add(p.id);
    boards.push(p);
  }
  if (!boards.length) return reset(raw, rand, now);
  const active = typeof raw.active === 'string' && ids.has(raw.active) ? raw.active : (boards[0] as Board).id;
  const recents = (Array.isArray(raw.recents) ? raw.recents : []).slice(0, RECENTS_MAX).map(parseProgramTile).filter((t): t is TileRef => t !== null);
  const notice: LoadNotice = dropped ? { kind: 'boards', n: dropped } : badTile ? { kind: 'tile' } : null;
  const unreadable = keptUnreadable(raw, now);
  const gone = (Array.isArray(raw.gone) ? raw.gone : []).filter((g): g is string => typeof g === 'string' && BOARD_ID.test(g) && !ids.has(g)).slice(-GONE_MAX);
  return { state: { v: 1, active, boards, recents, ...(raw.keep === true ? { keep: true as const } : {}), ...(gone.length ? { gone } : {}), ...(unreadable ? { unreadable } : {}) }, notice };
}

function cleanTile<T extends Tile>(t: T): T {
  if (!isProgramTile(t)) return t;
  const { params, ...rest } = t;
  const kept = params ? storableParams(CAT, t.program, t.view, params) : {};
  return (Object.keys(kept).length ? { ...rest, params: kept } : rest) as T;
}
const cleanTiles = (tiles: Board['tiles']): Board['tiles'] => Object.fromEntries(Object.entries(tiles).map(([k, t]) => [k, t ? cleanTile(t) : null]));

/** The value written for a realm (the parsed shape itself, options cleaned again). */
export function toStored(s: RealmBoards): RealmBoards {
  return {
    v: 1,
    active: s.active,
    boards: s.boards.map((b) => ({ id: b.id, name: b.name, layout: b.layout, tiles: cleanTiles(b.tiles), active: b.active, max: b.max, ...(parseMode(b.mode) ? { mode: 'scroll' as const } : {}), ...(b.for ? { for: { c: b.for.c, k: b.for.k } } : {}) })),
    recents: s.recents.map(cleanTile),
    ...(s.keep ? { keep: true as const } : {}),
    ...(s.gone?.length ? { gone: s.gone } : {}),
    ...(s.unreadable ? { unreadable: s.unreadable } : {}),
  };
}

