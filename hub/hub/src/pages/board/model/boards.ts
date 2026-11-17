// Boards and their tiles. Pure functions, no React, no I/O.
//
// Contract, in plain words:
//   - A realm (or All) has 1..MAX_BOARDS Boards and one active Board. A Board is {id, name, layout, tiles, active,
//     max}: layout is the split tree, tiles maps each slot id to a tile or null (an empty slot), active is the slot
//     that has focus, max the maximised slot or null.
//   - A tile is one of four kinds (Tile); none holds a sign-in token of its own, but a web address and a URL option
//     are kept exactly as typed, so they can carry user:pw@ or a key:
//       a program tile {project, computer, program, session, view?, params?, ssh?, name?} (TileRef);
//       a web tile {url, name?}: any http(s) address the person typed, kept exactly as typed (UrlTile);
//       a port tile {project, computer, protocol, port, path?, name?}: one of a computer's HTTP ports or exec scripts
//       (PortTile). Its address is built at render from the computer, so it follows the server.
//       a Bot tile {project, computer, realm, bot, name?}: one Bot on a computer, drawn by the Bots page's tile view
//       (BotTile): realm 'global' or a 24-hex realm id, bot the Bot's id as the agent lists it.
//       A Hub from before Bot tiles reads it as a bad tile (an empty slot) and keeps the rest of the Board.
//     A conversation tile (AI tab) IS a web tile: {url, name?} whose address is exactly the
//     conversation's canonical Hub link (links.ts convTileUrl). Its reference is read from the address
//     (links.ts tileConv) on this Hub's own origin, never kept beside it, so one tile has one value in memory, in
//     storage and in a two-tab merge, and a Hub tab from before conversation tiles keeps it as the web tile it is.
//     name is the person's own label for the tile; absent, the view shows the default label.
//   - At most MAX_SLOTS slots per Board (iframes are heavy). An operation that would pass a limit answers
//     {refused: code} and changes nothing; every other operation answers the new value.
//   - A Board's name '' means "unnamed": the view shows its default label ("Main"). Names are trimmed, at most
//     NAME_MAX characters, with no control characters. Renaming to nothing keeps the old name.
//   - recents: the realm's last full picks (computer, program, session), newest first, at most RECENTS_MAX; one can be
//     removed (dropRecent) and all cleared (clearRecents; restoreRecents undoes it).
//   - Undo is per Board (BoardUndo): each recorded change keeps the Board as it was, with a label for the menu.
//   - Ids come from an injected random source (rand() in [0, 1)), so tests are deterministic.
//   - Tile identity: every tile on a Board carries a tile id `tid`, unique over the realm's Boards
//     when it is made. A new tile (add, picker replace, split copy, duplicate, import) gets an id no tile of any Board has,
//     nor any id made earlier in the same operation, nor one the caller holds (`held`: data.ts gives every id this tab has seen, so an undo never puts back an id given
//     since), nor, on an
//     import, one the file carries. Moving a tile (swap, move, preset, maximise, undo) moves the whole
//     tile object, so its id goes with it; closing or clearing a slot ends it. Options save keeps the slot's id (keepTid).
//     Stored Boards without ids get them at load (persist.ts legacyTid). Board.at: a change stamp, set by a
//     cross-Board move (moveTileToBoard) on both Boards; the two-tab merge keeps a tile found on two Boards on the newer.
import type { EmbedValue } from '../embed/build';
import type { TileProgram } from '../embed/catalog';
import {
  equalise, hasSlot, neighbour, presetTree, PRESET_SLOTS, removeSlot, resizeToward, setRatio, slotNode, slots, splitSlot, rects,
  type Node, type Path, type Preset, type Side,
} from './tree';
import type { Ssh } from '../sshRules';
import { BOARD_IDS } from '@core';

export const MAX_SLOTS = 8;
export const MAX_BOARDS = 9;
export const NAME_MAX = 32;
export const RECENTS_MAX = 8;
export const HISTORY_MAX = 10;
export const GONE_MAX = 32;

export interface TileRef {
  readonly project: string;
  readonly computer: string;
  readonly program: TileProgram;
  readonly session: number;
  readonly view?: string;
  readonly params?: Readonly<Record<string, EmbedValue>>;
  /** A terminal Connect over SSH started: where its ssh goes, no secret. The frame opens only while
   *  terminal-N still is that ssh (parts/SshGate): a fresh attach would start a plain shell on the computer. */
  readonly ssh?: Ssh;
  /** The person's own label (cleanName rules); absent: <program>-<session>. */
  readonly name?: string;
  /** The tile's id (see the contract): absent only on a tile not yet on a Board (a recent, a picker answer). */
  readonly tid?: string;
  /** Option ids the load removed from the stored params (ids only, never values; persist.ts): the options drawer says so
   *  and its Save writes them away. Never stored. */
  readonly dropped?: readonly string[];
}

/** A web address tile: the address exactly as the person typed it (http or https only; see webUrl). */
export interface UrlTile {
  readonly url: string;
  readonly name?: string;
  readonly tid?: string;
}

/** A computer's HTTP port (protocol 'http') or exec script (protocol 'exec', port 1, path = the script's route). */
export interface PortTile {
  readonly project: string;
  readonly computer: string;
  readonly protocol: 'http' | 'exec';
  readonly port: number;
  readonly path?: string;
  readonly name?: string;
  readonly tid?: string;
}

/** The canonical conversation reference: its computer by handle (name.last4, never the id), the realm
 *  ('global' or a 24-hex id) and the session id. The same shape as the AI kit's ConvRef (kit/agent). */
export interface ConvRef {
  readonly computer: string;
  readonly realm: string;
  readonly sid: string;
}

/** One Bot on a computer: the Bots page's tile view draws it, by the Bot's key (botKeyOf). */
export interface BotTile {
  readonly project: string;
  readonly computer: string;
  readonly realm: string;
  readonly bot: string;
  readonly name?: string;
  readonly tid?: string;
}

export type Tile = TileRef | UrlTile | PortTile | BotTile;

export const isProgramTile = (t: Tile | null | undefined): t is TileRef => !!t && 'program' in t;
export const isUrlTile = (t: Tile | null | undefined): t is UrlTile => !!t && 'url' in t;
export const isPortTile = (t: Tile | null | undefined): t is PortTile => !!t && 'protocol' in t;
export const isBotTile = (t: Tile | null | undefined): t is BotTile => !!t && 'bot' in t;
/** The computer a tile runs on (program, port and Bot tiles), or null for a web tile. */
export const tileComputer = (t: Tile): { project: string; computer: string } | null => ('computer' in t ? { project: t.project, computer: t.computer } : null);

/** A typed web address, trimmed, when it can be a tile: an absolute http or https URL written with its `//` and a host and at most
 *  URL_MAX characters (anything else, javascript: and data: included, is null). Kept exactly as typed. */
export const URL_MAX = 2048;
export function webUrl(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  // The scheme's `//` is required: `https:example.org` parses as example.org but a frame resolves it on the Hub's host.
  if (!s || s.length > URL_MAX || !/^https?:\/\//i.test(s) || /[\u0000-\u001f\u007f\s]/.test(s)) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname ? s : null;
}

export interface Board {
  readonly id: string;
  readonly name: string;
  readonly layout: Node;
  readonly tiles: Readonly<Record<string, Tile | null>>;
  readonly active: string;
  readonly max: string | null;
  /** Scroll mode (scroll/mode.ts): the area grows past the view so tiles keep their height; absent = Fit. */
  readonly mode?: 'scroll';
  /** A program board (Open with): the computer and program key it is found by, never by its
   *  name. Absent on every other Board; Duplicate board and Import never copy it. */
  readonly for?: BoardFor;
  /** A change stamp (ms, non-negative integer): kept as read and written; set by the cross-Board move. */
  readonly at?: number;
}

/** A program board's key: the computer's id and the program's key (`ow:nano`, `ow:run`, `app:<name>`). */
export interface BoardFor { readonly c: string; readonly k: string }
export const FOR_KEY_MAX = 64;
/** A program key a link or a stored Board may carry: 1-64 characters, no control characters. */
export const forKeyOk = (k: unknown): k is string => typeof k === 'string' && k.length >= 1 && k.length <= FOR_KEY_MAX && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(k);

export interface RealmBoards {
  readonly v: 1;
  readonly active: string;
  readonly boards: readonly Board[];
  readonly recents: readonly TileRef[];
  /** Keep the Board page loaded while the person is on another page (shell useKeepPage): its frames
   *  keep running and never reload. Absent: off. */
  readonly keep?: true;
  /** Ids of Boards deleted here, newest last (at most GONE_MAX): another tab's merge drops only these (merge.ts). */
  readonly gone?: readonly string[];
  /** The raw text of an unreadable stored value, kept for a later recovery (persist.ts). */
  readonly unreadable?: { readonly at: number; readonly raw: string };
}

export type Refusal = { readonly refused: 'BOARD_FULL' | 'BOARDS_FULL' | 'PRESET_TOO_SMALL' | 'NAME_INVALID' | 'NOT_FOUND' | 'SESSIONS_FULL' };
export type Rand = () => number;

export const isRefusal = (x: unknown): x is Refusal => !!x && typeof x === 'object' && 'refused' in x;

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newId(prefix: string, rand: Rand, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  for (let attempt = 0; ; attempt++) {
    let s = prefix;
    for (let i = 0; i < 8; i++) s += ALNUM[Math.floor(rand() * ALNUM.length) % ALNUM.length];
    // A random source that keeps repeating (a test stub) still gets distinct ids.
    if (attempt > 32) s = s.slice(0, 5) + String(attempt).padStart(4, '0');
    if (!used.has(s)) return s;
  }
}

// ---- tile ids ----

/** A tile id as stored: 't' and 4-24 lower-case letters or digits. */
export const TID = /^t[a-z0-9]{4,24}$/;
const tidsOf = (b: Board, out: Set<string>): Set<string> => { for (const t of Object.values(b.tiles)) if (t?.tid) out.add(t.tid); return out; };
/** Every tile id on the realm's Boards, plus `extra`: what a new id must not be. A new Set each call. */
export const allTids = (s: RealmBoards, extra: Iterable<string> = []): Set<string> => s.boards.reduce((out, b) => tidsOf(b, out), new Set(extra));
/** The tile ids on one Board, plus `extra` (the default taken set of a Board operation called without its realm). */
export const boardTids = (b: Board, extra: Iterable<string> = []): Set<string> => tidsOf(b, new Set(extra));

/** The tile with `tid` as its last key, as persist.ts reads it back: the two-tab merge compares Boards as JSON text, so one
 *  tile must have one key order in memory and in storage. */
export function tileWithTid<T extends Tile>(tile: T, tid: string): T {
  const { tid: _old, ...rest } = tile;
  return { ...rest, tid } as T;
}

/** The tile with an id: its own when it is valid and not taken (`fresh` false), else a new one. The id joins `taken`, so
 *  ids made earlier in the same operation are never given again. */
export function withTid<T extends Tile>(tile: T, rand: Rand, taken: Set<string>, fresh = false): T {
  const own = !fresh && typeof tile.tid === 'string' && TID.test(tile.tid) && !taken.has(tile.tid);
  const tid = own ? (tile.tid as string) : newId('t', rand, taken);
  taken.add(tid);
  return tileWithTid(tile, tid);
}

/** A fresh Board: one empty slot, unnamed unless a name is given. */
export function newBoard(rand: Rand, takenIds: Iterable<string> = [], name = ''): Board {
  const slot = newId('s', rand);
  return { id: newId('b', rand, takenIds), name, layout: slotNode(slot), tiles: { [slot]: null }, active: slot, max: null };
}

/** A realm's first state: one fresh Board. */
export function freshRealm(rand: Rand): RealmBoards {
  const b = newBoard(rand);
  return { v: 1, active: b.id, boards: [b], recents: [] };
}

// ---- one Board ----

/** Slot ids in reading order, and how many hold a tile. */
export const boardSlots = (b: Board): string[] => slots(b.layout);
export const filledCount = (b: Board): number => boardSlots(b).filter((s) => b.tiles[s]).length;

function withLayout(b: Board, layout: Node, tiles: Record<string, Tile | null>, active?: string): Board {
  const ids = slots(layout);
  const t: Record<string, Tile | null> = {};
  for (const s of ids) t[s] = tiles[s] ?? null;
  const act = active && ids.includes(active) ? active : ids.includes(b.active) ? b.active : (ids[0] as string);
  return { ...b, layout, tiles: t, active: act, max: b.max && ids.includes(b.max) ? b.max : null };
}

/**
 * Applies a layout preset: the tiles keep their reading order in the preset's slots, empty slots fill the rest.
 * Refused when the Board has more tiles than the preset has slots (close some first).
 */
export function applyPreset(b: Board, preset: Preset, rand: Rand): Board | Refusal {
  const n = PRESET_SLOTS[preset];
  const ids = boardSlots(b);
  const filled = ids.filter((s) => b.tiles[s]);
  if (filled.length > n) return { refused: 'PRESET_TOO_SMALL' };
  const empty = ids.filter((s) => !b.tiles[s]);
  const use = [...filled, ...empty].slice(0, n);
  while (use.length < n) use.push(newId('s', rand, use));
  const layout = presetTree(preset, use);
  const out = withLayout(b, layout, { ...b.tiles }, b.active);
  return { ...out, max: null };
}

/** The slot a new slot splits from when the Board has no empty slot: the active one, along its longer side. */
export function splitSideFor(b: Board, slot: string): Side {
  const r = rects(b.layout)[slot];
  return r && r.h > r.w ? 'down' : 'right';
}

/** A Fit Board that holds this many slots pages when it gets one more (geom.ts boardPages): a new slot then goes last. */
export const PAGE_MAX = 4;

/**
 * Puts a tile on the Board: in the active slot when it is empty, else the first empty slot, else a new slot: split
 * from the active one, or, on a Fit Board that holds PAGE_MAX slots or more or with `last` (the caller sees it paging),
 * from the last one (as splitEnd), so tiles on earlier pages never shift. A maximised tile gives way: the maximise moves to the new tile (as it moves with focus), so the
 * new tile shows. Answers the Board and the slot it went to, or BOARD_FULL at MAX_SLOTS.
 */
export function addTile(b: Board, tile: Tile, rand: Rand, taken: Set<string> = boardTids(b), last = false): { board: Board; slot: string } | Refusal {
  const ids = boardSlots(b);
  const shown = (x: Board, slot: string): Board => (x.max ? { ...x, max: slot } : x);
  const target = !b.tiles[b.active] ? b.active : ids.find((s) => !b.tiles[s]);
  if (target) return { board: shown({ ...b, tiles: { ...b.tiles, [target]: withTid(tile, rand, taken) }, active: target }, target), slot: target };
  if (ids.length >= MAX_SLOTS) return { refused: 'BOARD_FULL' };
  const fresh = newId('s', rand, ids);
  const from = last || (b.mode !== 'scroll' && ids.length >= PAGE_MAX) ? (ids[ids.length - 1] as string) : b.active;
  const layout = splitSlot(b.layout, from, fresh, splitSideFor(b, from));
  return { board: shown(withLayout(b, layout, { ...b.tiles, [fresh]: withTid(tile, rand, taken) }, fresh), fresh), slot: fresh };
}

/** Sets or clears one slot's tile (change program/session, the picker's answer). A tile set here is a new tile with a new id
 *  (the slot's old id stays taken), except with keepTid (Options save: the same tile, changed), which keeps the slot's id. */
export interface SetTileOpts { readonly taken?: Set<string>; readonly keepTid?: boolean }
export function setTile(b: Board, slot: string, tile: null): Board | Refusal;
export function setTile(b: Board, slot: string, tile: Tile | null, rand: Rand, o?: SetTileOpts): Board | Refusal;
export function setTile(b: Board, slot: string, tile: Tile | null, rand?: Rand, o: SetTileOpts = {}): Board | Refusal {
  if (!hasSlot(b.layout, slot)) return { refused: 'NOT_FOUND' };
  if (tile === null || !rand) return { ...b, tiles: { ...b.tiles, [slot]: null } };
  const old = b.tiles[slot]?.tid;
  const taken = o.taken ?? boardTids(b);
  const next = o.keepTid && old ? tileWithTid(tile, old) : withTid(tile, rand, taken, true);
  return { ...b, tiles: { ...b.tiles, [slot]: next } };
}

/** Splits a slot (⋯ Split right / Split down, `s` / `v`): a new empty slot on that side, which becomes active. */
export function splitAt(b: Board, slot: string, side: Side, rand: Rand): { board: Board; slot: string } | Refusal {
  const ids = boardSlots(b);
  if (!ids.includes(slot)) return { refused: 'NOT_FOUND' };
  if (ids.length >= MAX_SLOTS) return { refused: 'BOARD_FULL' };
  const fresh = newId('s', rand, ids);
  return { board: withLayout(b, splitSlot(b.layout, slot, fresh, side), { ...b.tiles }, fresh), slot: fresh };
}

/** A new empty slot at the end of the reading order, which becomes active (a Board that pages adds here: tiles on earlier
 *  pages never shift). */
export function splitEnd(b: Board, rand: Rand): { board: Board; slot: string } | Refusal {
  const last = boardSlots(b).at(-1) as string;
  return splitAt(b, last, splitSideFor(b, last), rand);
}

/** Closes a slot (`x`): its sibling takes the room. The last slot is emptied instead. `heir`: the slot that becomes
 *  active when the closed one was (a Board that pages keeps its page); absent or gone, a neighbour of the closed one. */
export function closeSlot(b: Board, slot: string, heir?: string): Board | Refusal {
  if (!hasSlot(b.layout, slot)) return { refused: 'NOT_FOUND' };
  const next = removeSlot(b.layout, slot);
  if (next === null) return { ...b, tiles: { [slot]: null }, active: slot, max: null };
  const near = (heir !== undefined && heir !== slot && hasSlot(b.layout, heir) ? heir : undefined) ?? (['left', 'up', 'right', 'down'] as const).map((d) => neighbour(b.layout, slot, d)).find((s) => s !== null) ?? undefined;
  const tiles = { ...b.tiles };
  delete tiles[slot];
  return withLayout(b, next, tiles, b.active === slot ? near : b.active);
}

/** Swaps two slots' tiles (drop on a centre, Shift+arrows). */
export function swapSlots(b: Board, x: string, y: string): Board | Refusal {
  if (!hasSlot(b.layout, x) || !hasSlot(b.layout, y)) return { refused: 'NOT_FOUND' };
  if (x === y) return b;
  return { ...b, tiles: { ...b.tiles, [x]: b.tiles[y] ?? null, [y]: b.tiles[x] ?? null }, active: b.active === x ? y : b.active === y ? x : b.active };
}

export type DropZone = 'centre' | Side;

/** Drops slot `from` on slot `to` (Move): centre swaps, an edge splits `to` there and moves `from` into it. */
export function moveSlot(b: Board, from: string, to: string, zone: DropZone): Board | Refusal {
  if (!hasSlot(b.layout, from) || !hasSlot(b.layout, to)) return { refused: 'NOT_FOUND' };
  if (zone === 'centre' || from === to) return swapSlots(b, from, to);
  const without = removeSlot(b.layout, from);
  if (without === null) return b;
  const layout = splitSlot(without, to, from, zone);
  return withLayout(b, layout, { ...b.tiles }, from);
}

/** Maximise / restore (`z`, ⤢): the same toggle. */
export function toggleMax(b: Board, slot: string): Board | Refusal {
  if (!hasSlot(b.layout, slot)) return { refused: 'NOT_FOUND' };
  return { ...b, max: b.max === slot ? null : slot, active: slot };
}

export function focusSlot(b: Board, slot: string): Board | Refusal {
  if (!hasSlot(b.layout, slot)) return { refused: 'NOT_FOUND' };
  return b.active === slot ? b : { ...b, active: slot };
}

/** Moves focus to the neighbouring slot (arrows / h j k l); a maximise moves with it; unchanged at the Board's edge.
 *  `drawn`: the layout on screen when it is not the saved one (one page of a paged Board). */
export function focusToward(b: Board, side: Side, drawn: Node = b.layout): Board {
  const n = neighbour(drawn, b.active, side);
  return n && hasSlot(b.layout, n) ? { ...b, active: n, max: b.max ? n : null } : b;
}

/** Swaps the active slot with its neighbour (Shift+arrows); focus follows the tile. */
export function swapToward(b: Board, side: Side, drawn: Node = b.layout): Board {
  const n = neighbour(drawn, b.active, side);
  return n && hasSlot(b.layout, n) ? (swapSlots(b, b.active, n) as Board) : b;
}

/** Resizes the active slot's split on that side by 5% (Alt+Shift+arrows). */
export function resizeActive(b: Board, side: Side, delta = 0.05): Board {
  const layout = resizeToward(b.layout, b.active, side, delta);
  return layout === b.layout ? b : { ...b, layout };
}

export function setBoardRatio(b: Board, path: Path, ratio: number): Board {
  const layout = setRatio(b.layout, path, ratio);
  return layout === b.layout ? b : { ...b, layout };
}

export function equaliseBoard(b: Board): Board {
  return { ...b, layout: equalise(b.layout) };
}

// ---- a realm's Boards ----

/** The active Board (the first when the active id is gone). */
export function activeBoard(s: RealmBoards): Board {
  return s.boards.find((b) => b.id === s.active) ?? (s.boards[0] as Board);
}

function replaceBoard(s: RealmBoards, b: Board): RealmBoards {
  return { ...s, boards: s.boards.map((x) => (x.id === b.id ? b : x)) };
}

/** Applies a Board operation to the active Board; a refusal leaves the state as it was, and so does an operation
 *  that returns the Board unchanged (s itself comes back: nothing to write or undo). */
export function onActive(s: RealmBoards, f: (b: Board, taken: Set<string>) => Board | Refusal, held: Iterable<string> = []): RealmBoards | Refusal {
  const cur = activeBoard(s);
  const next = f(cur, allTids(s, held));
  return isRefusal(next) ? next : next === cur ? s : replaceBoard(s, next);
}

/** A name a user typed, cleaned, or null when it cannot be one (control characters, too long). */
export function cleanName(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s.length > NAME_MAX || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(raw)) return null;
  return s;
}

/** A new Board after the others ("Board N" from the view), made active. BOARDS_FULL at MAX_BOARDS. */
export function createBoard(s: RealmBoards, rand: Rand, name = ''): RealmBoards | Refusal {
  if (s.boards.length >= MAX_BOARDS) return { refused: 'BOARDS_FULL' };
  const b = newBoard(rand, s.boards.map((x) => x.id), cleanName(name) ?? '');
  return { ...s, active: b.id, boards: [...s.boards, b] };
}

export function renameBoard(s: RealmBoards, id: string, raw: string): RealmBoards | Refusal {
  const name = cleanName(raw);
  if (name === null) return { refused: 'NAME_INVALID' };
  const b = s.boards.find((x) => x.id === id);
  if (!b) return { refused: 'NOT_FOUND' };
  return name === '' || name === b.name ? s : replaceBoard(s, { ...b, name });
}

/**
 * The name of a copy: "<base> <word>", then "<base> <word> 2", "… 3", the first one no Board has, with the base cut
 * so the whole fits NAME_MAX.
 */
export function copyName(base: string, word: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) {
    const tail = ' ' + word + (n > 1 ? ' ' + n : '');
    const name = [...base].slice(0, Math.max(0, NAME_MAX - tail.length)).join('').trimEnd() + tail;
    if (!used.has(name) || n > MAX_BOARDS + 1) return name;
  }
}

/** A copy right after the original (same tiles, layout, active tile and maximise; the view names it), made active. */
export function duplicateBoard(s: RealmBoards, id: string, rand: Rand, name = '', held: Iterable<string> = []): RealmBoards | Refusal {
  if (s.boards.length >= MAX_BOARDS) return { refused: 'BOARDS_FULL' };
  const i = s.boards.findIndex((x) => x.id === id);
  if (i < 0) return { refused: 'NOT_FOUND' };
  const src = s.boards[i] as Board;
  const { for: _key, ...rest } = src; // a copy is never the program's board
  // The Board id is drawn first: a locked retry replays the same draws, and the tile ids it then refuses (held grew)
  // take extra draws, which must not move the Board an edit queued meanwhile names.
  const boardId = newId('b', rand, s.boards.map((x) => x.id));
  const taken = allTids(s, held);
  const tiles = Object.fromEntries(Object.entries(rest.tiles).map(([k, t]) => [k, t ? withTid(t, rand, taken, true) : null]));
  const copy: Board = { ...rest, tiles, id: boardId, name: cleanName(name) ?? src.name };
  const boards = [...s.boards];
  boards.splice(i + 1, 0, copy);
  return { ...s, active: copy.id, boards };
}

/** Deletes a Board (its id joins `gone`); the next one (else the previous) becomes active. The last Board is
 *  replaced by a fresh one. */
export function deleteBoard(s: RealmBoards, id: string, rand: Rand): RealmBoards | Refusal {
  const i = s.boards.findIndex((x) => x.id === id);
  if (i < 0) return { refused: 'NOT_FOUND' };
  const gone = [...(s.gone ?? []).filter((g) => g !== id), id].slice(-GONE_MAX);
  if (s.boards.length === 1) { const f = freshRealm(rand); return { ...s, active: f.active, boards: f.boards, gone }; }
  const boards = s.boards.filter((x) => x.id !== id);
  const active = s.active !== id ? s.active : (boards[Math.min(i, boards.length - 1)] as Board).id;
  return { ...s, active, boards, gone };
}

/** Moves a Board to another position (drag a Board tab). */
export function reorderBoard(s: RealmBoards, from: number, to: number): RealmBoards {
  if (from === to || from < 0 || to < 0 || from >= s.boards.length || to >= s.boards.length) return s;
  const boards = [...s.boards];
  const [b] = boards.splice(from, 1);
  boards.splice(to, 0, b as Board);
  return { ...s, boards };
}

export function setActiveBoard(s: RealmBoards, id: string): RealmBoards | Refusal {
  if (!s.boards.some((b) => b.id === id)) return { refused: 'NOT_FOUND' };
  return s.active === id ? s : { ...s, active: id };
}

/** Board N (1-9 keys), or the previous / next one (Ctrl+Alt+[ ]), wrapping. */
export function boardByNumber(s: RealmBoards, n: number): RealmBoards | Refusal {
  const b = s.boards[n - 1];
  return b ? setActiveBoard(s, b.id) : { refused: 'NOT_FOUND' };
}
export function stepBoard(s: RealmBoards, step: 1 | -1): RealmBoards {
  const i = s.boards.findIndex((b) => b.id === s.active);
  const next = s.boards[(i + step + s.boards.length) % s.boards.length] as Board;
  return { ...s, active: next.id };
}

/** Adds a Board read from a file (already validated) as a new Board after the others, made active. A new id when its
 *  own is taken; never a program board's key. BOARDS_FULL at MAX_BOARDS. */
export function importBoard(s: RealmBoards, b: Board, rand: Rand, held: Iterable<string> = []): RealmBoards | Refusal {
  if (s.boards.length >= MAX_BOARDS) return { refused: 'BOARDS_FULL' };
  const ids = s.boards.map((x) => x.id);
  const { for: _key, ...plain } = b;
  const id = ids.includes(plain.id) ? newId('b', rand, ids) : plain.id; // drawn before the tile ids, as in duplicateBoard
  const taken = tidsOf(plain, allTids(s, held)); // the file's own ids too: every imported tile is new
  const tiles = Object.fromEntries(Object.entries(plain.tiles).map(([k, t]) => [k, t ? withTid(t, rand, taken, true) : null]));
  const board = { ...plain, tiles, ...(id !== plain.id ? { id } : {}) };
  return { ...s, active: board.id, boards: [...s.boards, board] };
}

// ---- moving a tile to another Board ----

/** The slot holding the tile with this id on one Board, or null. */
export function findTileSlot(b: Board, tid: string): string | null {
  return boardSlots(b).find((s) => b.tiles[s]?.tid === tid) ?? null;
}

/** A change stamp later than `now` and every earlier stamp given (each at least one past it). */
export function nextStamp(now: number, ...prevs: Array<number | undefined>): number {
  return Math.max(Math.max(0, Math.trunc(now)), ...prevs.map((p) => (p ?? 0) + 1));
}

/** Where a moved tile goes: a Board by id, or a new Board after the others (named `name`, cleaned). */
export type MoveTarget = { readonly kind: 'board'; readonly toBoardId: string } | { readonly kind: 'new'; readonly name?: string };
/** What a move captured when it began (a drag, the menu, the B key): the tile by its id and the Board it was on.
 *  `deleted`: Board ids another tab deleted (the stored value's tombstones, `gone`): such a Board is gone for the move
 *  even when this tab's own change to it kept it in the merged state. */
export interface MoveTileOpts { readonly tid: string; readonly fromBoardId: string; readonly target: MoveTarget; readonly deleted?: readonly string[] }

/**
 * Moves one tile, the same object with its id, from one Board to another. NOT_FOUND when the tile is no longer
 * on the Board it was captured on (closed, replaced, moved off; a swap on that Board keeps it found, at its new slot),
 * when the source and the target are the same Board, or when either Board is gone (or deleted elsewhere: o.deleted).
 * BOARD_FULL when the target has no room, BOARDS_FULL for a new Board past MAX_BOARDS: checked before anything
 * changes. The source loses the slot (closeSlot: its sibling takes the room; a Board left empty stays open), both
 * Boards get a stamp later than either had (the two-tab merge keeps a tile found on two Boards only on the newer one:
 * merge.ts dedupeTids), and the target becomes active with the tile focused there.
 */
export function moveTileToBoard(s: RealmBoards, o: MoveTileOpts, rand: Rand, now: number = Date.now()): { state: RealmBoards; toBoardId: string; toSlot: string } | Refusal {
  const dead = (id: string): boolean => o.deleted?.includes(id) ?? false;
  const from = dead(o.fromBoardId) ? undefined : s.boards.find((b) => b.id === o.fromBoardId);
  const fromSlot = from ? findTileSlot(from, o.tid) : null;
  if (!from || !fromSlot) return { refused: 'NOT_FOUND' };
  const tile = from.tiles[fromSlot] as Tile;
  let to: Board;
  let made = false;
  if (o.target.kind === 'board') {
    const id = o.target.toBoardId;
    const found = id === from.id || dead(id) ? undefined : s.boards.find((b) => b.id === id);
    if (!found) return { refused: 'NOT_FOUND' };
    to = found;
  } else {
    if (s.boards.length >= MAX_BOARDS) return { refused: 'BOARDS_FULL' };
    to = newBoard(rand, s.boards.map((b) => b.id), cleanName(o.target.name ?? '') ?? '');
    made = true;
  }
  // The target's own ids only: the tile keeps its id (it is not on the target), never a new one.
  const added = addTile(to, tile, rand, boardTids(to));
  if (isRefusal(added)) return added;
  const left = closeSlot(from, fromSlot);
  if (isRefusal(left)) return left;
  const at = nextStamp(now, from.at, to.at);
  const src: Board = { ...left, at };
  const dst: Board = { ...added.board, at };
  const boards = s.boards.map((b) => (b.id === src.id ? src : b.id === dst.id ? dst : b));
  const next: RealmBoards = { ...s, active: dst.id, boards: made ? [...boards, dst] : boards };
  return { state: isProgramTile(tile) ? pushRecent(next, tile) : next, toBoardId: dst.id, toSlot: added.slot };
}

/** The lowest free session number of a program on a computer, over every Board of the realm (Duplicate tile). A
 *  terminal or display gets one of the Board's own numbers (BOARD_IDS, 1-8000): the launch band above them (8001-9999)
 *  is where app launches run, so a launch tile is not counted and a duplicate never lands there. A number in use is
 *  never given again: when every one is taken, SESSIONS_FULL (the caller adds nothing). */
export function nextSession(s: RealmBoards, computer: string, program: TileProgram): number | Refusal {
  const banded = program === 'terminal' || program === 'display';
  const top = banded ? BOARD_IDS[1] : 65535;
  const used = new Set<number>();
  for (const b of s.boards) {
    for (const t of Object.values(b.tiles)) {
      if (isProgramTile(t) && t.computer === computer && t.program === program) used.add(t.session);
    }
  }
  for (let n = 1; n <= top; n++) if (!used.has(n)) return n;
  return { refused: 'SESSIONS_FULL' };
}

/** The program board with this key, or undefined. */
export const boardFor = (s: RealmBoards, f: BoardFor): Board | undefined => s.boards.find((b) => b.for?.c === f.c && b.for.k === f.k);

/** A keyed add: the program board's key and the name a new one gets ("Nano · atlas"). */
export interface KeyedAdd { readonly for: BoardFor; readonly name: string }

/**
 * Puts a launch's tile on its program board: the board with this key (created after the others, named, when there is
 * none: BOARDS_FULL at MAX_BOARDS); on it, the tile already at that place (same computer, program and number) becomes
 * active, else the tile goes in as addTile puts one (BOARD_FULL at MAX_SLOTS). That board becomes the active one.
 * Answers the realm, the board's id, the tile's slot and, when this add made the board, that board as it was made
 * (empty: what an undo of the landing goes back to). Nothing changes on a refusal.
 */
export function keyedAddTile(s: RealmBoards, add: KeyedAdd, tile: TileRef, rand: Rand, held: Iterable<string> = [], last: (b: Board) => boolean = () => false): { state: RealmBoards; board: string; slot: string; made?: Board } | Refusal {
  let state = s;
  let b = boardFor(s, add.for);
  const isNew = !b;
  if (!b) {
    if (s.boards.length >= MAX_BOARDS) return { refused: 'BOARDS_FULL' };
    const name = cleanName([...add.name.replace(/\s+/g, ' ').trim()].slice(0, NAME_MAX).join('').trimEnd()) ?? '';
    b = { ...newBoard(rand, s.boards.map((x) => x.id), name), for: { c: add.for.c, k: add.for.k } };
    state = { ...s, boards: [...s.boards, b] };
  }
  const same = boardSlots(b).find((slot) => {
    const t = b!.tiles[slot];
    return isProgramTile(t) && t.computer === tile.computer && t.program === tile.program && t.session === tile.session;
  });
  if (same) {
    const focused = focusSlot(b, same);
    if (isRefusal(focused)) return focused;
    const shown = focused.max && focused.max !== same ? { ...focused, max: same } : focused; // a maximise moves with focus, as for addTile
    return { state: { ...replaceBoard(state, shown), active: b.id }, board: b.id, slot: same };
  }
  const added = addTile(b, tile, rand, allTids(state, held), last(b));
  if (isRefusal(added)) return added;
  return { state: { ...replaceBoard(state, added.board), active: b.id }, board: b.id, slot: added.slot, ...(isNew ? { made: b } : {}) };
}

/** A full pick goes first in the realm's recents (one entry per computer, program and session; no options kept, the
 *  ssh destination kept: it is what the session is, and the tile's gate needs it). */
export function pushRecent(s: RealmBoards, t: TileRef): RealmBoards {
  const plain: TileRef = { project: t.project, computer: t.computer, program: t.program, session: t.session, ...(t.ssh ? { ssh: t.ssh } : {}) };
  return { ...s, recents: [plain, ...s.recents.filter((x) => recentKey(x) !== recentKey(plain))].slice(0, RECENTS_MAX) };
}
const recentKey = (x: TileRef) => x.project + '/' + x.computer + '/' + x.program + '/' + x.session;

/** The realm's recents without that entry (the picker's remove). */
export function dropRecent(s: RealmBoards, t: TileRef): RealmBoards {
  const k = recentKey(t);
  return s.recents.some((x) => recentKey(x) === k) ? { ...s, recents: s.recents.filter((x) => recentKey(x) !== k) } : s;
}

/** Keep the Board loaded on other pages, or not: the realm's choice, stored with its Boards. */
export function setKeepLoaded(s: RealmBoards, on: boolean): RealmBoards {
  if (on === !!s.keep) return s;
  if (on) return { ...s, keep: true };
  const { keep: _, ...rest } = s;
  return rest;
}

/** The realm's recents emptied (the picker's Clear). */
export function clearRecents(s: RealmBoards): RealmBoards {
  return s.recents.length ? { ...s, recents: [] } : s;
}

/** Clear undone: the cleared entries come back after any pick made since (newer first), at most RECENTS_MAX. */
export function restoreRecents(s: RealmBoards, before: readonly TileRef[]): RealmBoards {
  const now = new Set(s.recents.map(recentKey));
  return { ...s, recents: [...s.recents, ...before.filter((x) => !now.has(recentKey(x)))].slice(0, RECENTS_MAX) };
}

// ---- undo (`u` / Ctrl+Z: the last 10 layout changes of each Board) ----

export interface UndoStep { readonly board: Board; readonly label: string }
export type BoardUndo = Readonly<Record<string, readonly UndoStep[]>>;

/** Remembers `before` (the Board as it was) under its id, at most HISTORY_MAX steps per Board. */
export function recordStep(u: BoardUndo, before: Board, label: string): BoardUndo {
  return { ...u, [before.id]: [...(u[before.id] ?? []), { board: before, label }].slice(-HISTORY_MAX) };
}

/** The active Board's last step, or null. */
export function lastStep(s: RealmBoards, u: BoardUndo): UndoStep | null {
  const steps = u[s.active];
  return steps && steps.length ? (steps[steps.length - 1] as UndoStep) : null;
}

/** Puts the active Board back as it was before its last recorded change; the other Boards are not touched. */
export function undoStep(s: RealmBoards, u: BoardUndo): { state: RealmBoards; undo: BoardUndo } | null {
  const step = lastStep(s, u);
  if (!step || !s.boards.some((b) => b.id === s.active)) return null;
  return { state: replaceBoard(s, step.board), undo: { ...u, [s.active]: (u[s.active] ?? []).slice(0, -1) } };
}
