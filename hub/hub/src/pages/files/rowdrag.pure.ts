// What Files puts on a row drag and how a drop is judged, the stateless part (split out of rowdrag.ts so the terminal
// build shares it; the design notes are at the top of rowdrag.ts). rowdrag.ts re-exports every name here and keeps the
// drag this tab started (startRowDrag, endRowDragFrom, draggingRows: module state and document/window listeners).
import { blockedPath, cleanPath, joinPath } from './logic';
import type { DeleteItem } from './plan';

/** The drag type of Files rows. */
export const FILES_ROW = 'application/x-hoody-files-row';

export interface RowPayload {
  /** The pane the rows are dragged from (a drop on the other pane copies by default). */
  readonly pane: 'a' | 'b';
  /** The computer the rows are on (its id). */
  readonly computer: string;
  /** The folder they are listed in. */
  readonly folder: string;
  readonly items: readonly DeleteItem[];
  /** This drag's own id (fresh per drag). */
  readonly drag: string;
}

/** Whether the drag's source still holds it: the folder view that started it shows the same computer and folder, and
 *  its listing still has every dragged item (a removed row is gone from it). Asked each time a target reads the drag;
 *  the view ends its drag when it unmounts (endRowDragFrom). */
export type DragSource = (p: RowPayload) => boolean;
const DRAG_ID = /^[a-z0-9-]{8,64}$/;

const MAX_ITEMS = 5000;
// Canonical only: what cleanPath gives back unchanged (no empty, '.' or '..' parts, no trailing slash, not too long).
const isPath = (v: unknown): v is string => typeof v === 'string' && cleanPath(v) === v;
const numOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));

/** A dropped payload, checked field by field (it came through the browser: never trusted), or null. */
export function rowPayloadOf(v: unknown): RowPayload | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.pane !== 'a' && o.pane !== 'b') return null;
  if (typeof o.computer !== 'string' || !o.computer || !isPath(o.folder) || !Array.isArray(o.items)) return null;
  if (typeof o.drag !== 'string' || !DRAG_ID.test(o.drag)) return null;
  const folder = o.folder;
  const items = o.items as unknown[];
  if (items.length === 0 || items.length > MAX_ITEMS) return null;
  const out: DeleteItem[] = [];
  for (const it of items) {
    if (typeof it !== 'object' || it === null) return null;
    const x = it as Record<string, unknown>;
    if (typeof x.name !== 'string' || !x.name || x.name.includes('/') || typeof x.dir !== 'boolean' || !numOrNull(x.size) || !numOrNull(x.modified)) return null;
    if (x.path !== joinPath(folder, x.name)) return null;
    out.push({ path: x.path, name: x.name, dir: x.dir, size: x.size as number | null, modified: x.modified as number | null });
  }
  return { pane: o.pane, computer: o.computer, folder, items: out, drag: o.drag };
}

const inside = (path: string, root: string) => path === root || path.startsWith(root + '/');

/** May these rows go into `dest` on `computer`: the same computer, another folder than their own, never a folder into
 *  itself, never a path core can't address. */
export function rowsMayGo(p: RowPayload, computer: string, dest: string): boolean {
  if (p.computer !== computer || dest === p.folder || blockedPath(dest)) return false;
  return !p.items.some((x) => x.dir && inside(dest, x.path));
}

/** Why these rows can't go into `dest` on their own computer (rowsMayGo refuses it), for the words a target shows:
 *  'here' the folder they are in, 'intoItself' a dragged folder or a folder inside it, 'blocked' a path core can't
 *  address. null: they may go, or the computer differs (dropHow's 'otherComputer'). */
export type NoGo = 'here' | 'intoItself' | 'blocked';
export function rowsNoGo(p: RowPayload, dest: string): NoGo | null {
  if (dest === p.folder) return 'here';
  if (p.items.some((x) => x.dir && inside(dest, x.path))) return 'intoItself';
  return blockedPath(dest) ? 'blocked' : null;
}

/** What a drop of these rows does on pane `to.pane`, showing `to.computer`, into `to.dest` (one table for
 *  dragover and the drop): on their own pane a move, or a copy with the copy key (`copyKey`); on the other pane a
 *  copy, or a move with the key. 'otherComputer': the other pane shows another computer, and the Hub has no way to
 *  copy between computers yet, so it refuses (with words). null: no drop at all (rowsMayGo refuses). */
export type DropHow = 'move' | 'copy' | 'otherComputer' | null;
export function dropHow(p: RowPayload, to: { readonly pane: 'a' | 'b'; readonly computer: string; readonly dest: string }, copyKey: boolean): DropHow {
  if (p.pane !== to.pane && p.computer !== to.computer) return 'otherComputer';
  if (!rowsMayGo(p, to.computer, to.dest)) return null;
  const across = p.pane !== to.pane;
  return across !== copyKey ? 'copy' : 'move';
}

/** Two payloads are the same drag (the dropped one is the one this tab started: same id, same rows). */
export function sameDrag(a: RowPayload, b: RowPayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
