// Drag and drop on a DataTable, one API for both uses: a page drags its own rows (Files: move or copy between folders)
// and drops files from the computer (Files: Upload). The kit owns the events, the drop effect, the highlight, the hint
// beside the pointer and its live region; the page owns what is taken and what a drop does (it opens the page's own
// dialog, it never sends anything itself). No keyboard or touch path by design: every drop has a menu or button twin.
// From the start of a drag the dragged rows are dimmed and the pointer carries the page's own words for what is
// dragged (RowDrag.preview: a name, or "3 items"); both go when the drag ends, however it ends.
import { type DragEvent, type DragEventHandler, type MouseEvent, type MouseEventHandler, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isApplePlatform } from '../controls/Kbd';
import { SR_ONLY } from '../controls/SrOnly';
import s from './DataTable.module.css';

/** What a drag carries, as the drop handler and `accept` see it. */
export interface DragInfo {
  /** The data types on the drag: a page's own type (e.g. 'application/x-hoody-files-row') and/or 'Files' (OS files).
   *  At the drop it holds only the type that was dropped. */
  readonly types: readonly string[];
  /** The copy modifier is held: Option on macOS, Ctrl elsewhere (copyKeyName). */
  readonly copy: boolean;
}

/** What was dropped, as `onDrop` gets it: a page type's parsed payload, or the files from the computer. */
export interface DropData {
  /** Which of the target's types was dropped. */
  readonly type: string;
  /** A page type: its JSON, parsed. Never trusted: the page validates it. */
  readonly payload?: unknown;
  /** 'Files': the regular files dropped from the computer. */
  readonly files?: readonly File[];
  /** 'Files': dropped folders, not taken (they have no bytes of their own here). */
  readonly folders?: number;
}

/** How a table's rows are dragged (DataTable `rowDrag`): the page's type and what a drag carries. */
export interface RowDrag<T> {
  /** The page's own MIME type; the payload is JSON under it. */
  readonly type: string;
  /** May this row start a drag (default: every row). */
  readonly canDrag?: (row: T) => boolean;
  /** The payload of the dragged rows: the dragged row alone, or every selected row when it is selected. */
  readonly payload: (rows: readonly T[]) => unknown;
  /** Plain text for other apps (text/plain), e.g. the names. Optional. */
  readonly text?: (rows: readonly T[]) => string;
  /** The words the pointer carries while these rows are dragged: the one name, or a count ("3 items"). Without it the
   *  browser draws its own picture of the row under the pointer. */
  readonly preview?: (rows: readonly T[]) => string;
  /** The drag is over: its source row got dragend, wherever the row is by then (dropped, cancelled, or the row no
   *  longer in the page), or the pointer moved on with no drag event (a drag that ended with no event here). */
  readonly onEnd?: () => void;
}

/** What a row under a dragging pointer is (DropTarget.rowTarget). */
export type RowTarget ='row' | 'body' | 'none';

/** How a table takes drops (DataTable `drop`): which types, where, with what words, and what the page does with one. */
export interface DropTarget<T> {
  /** The types this table takes. A drag with none of them shows no drop anywhere. */
  readonly types: readonly string[];
  /** What a row under the pointer is: 'row' = the drop goes into this row (a folder), 'body' = the row means the
   *  table's own place (a file row), 'none' = no drop at all here (never the body instead). Default 'body'. */
  readonly rowTarget?: (row: T, drag: DragInfo) => RowTarget;
  /** Whether the drop is taken where it lands: `over` is the row ('row') or null (the body). Asked on dragover with
   *  the types and the modifier only (browsers hide the payload until the drop), and again at the drop. */
  readonly accept: (over: T | null, drag: DragInfo) => boolean;
  /** The words shown beside the pointer and announced while over an accepting target ("Move to projects"). Name the
   *  copy key in them where it matters (copyKeyName). */
  readonly hint: (over: T | null, drag: DragInfo) => string;
  /** Whether a drop taken here copies (the drop effect the browser shows). Default: OS files, or the copy key held.
   *  A page whose drop copies without the key (Files: rows dragged to the other pane) says so here. */
  readonly copies?: (over: T | null, drag: DragInfo) => boolean;
  /** The words shown beside the pointer and announced while over a target that does NOT take the drag, saying why
   *  ("Copying between computers isn't available yet"), or null for none (default: none). Nothing is
   *  marked and the drop effect stays none. Announced once on entering: the words change only when the reason does. */
  readonly refusal?: (over: T | null, drag: DragInfo) => string | null;
  /** The drop: the page opens its own dialog. */
  readonly onDrop: (over: T | null, data: DropData, drag: DragInfo) => void;
  /** The table's body is not its own target: the drop area around it (DropArea, given this same DropTarget) takes
   *  those spots, so a drop on the body and one beside the table are marked and act the same. The table still judges
   *  its rows ('row' and 'none'). Default false. Only with such an area: without one the body takes nothing. */
  readonly bodyByArea?: boolean;
}

/** The key that turns a move into a copy while dragging: Option on Apple systems, Ctrl elsewhere. */
export function copyKeyName(apple = isApplePlatform()): 'Option' | 'Ctrl' {
  return apple ? 'Option' : 'Ctrl';
}

/** The copy modifier is held on this drag event. */
export function isCopyDrag(e: { altKey: boolean; ctrlKey: boolean }, apple = isApplePlatform()): boolean {
  return apple ? e.altKey : e.ctrlKey;
}

const FILES = 'Files';
/** A drag that ends with no event here is over once the pointer moves this often with no button held and no drag
 *  event among the moves, this long (ms) after the last one. Browsers send no pointer moves while a drag lasts, past
 *  the few right after dragstart: Firefox's with the button held (left out), WebKit's one with none (the count and the
 *  lull leave it out). */
const LULL_MOVES = 3;
const LULL_MS = 300;
/** The drag events that show a drag still lasts (sent while the pointer moves, and on a timer while it rests). */
const STILL_DRAGGING = ['drag', 'dragenter', 'dragover', 'dragleave'] as const;
/** A drag that starts on one of these inside a row is not a row drag (a checkbox, the menu, a text field, a link). */
const NO_DRAG = 'button, a, input, textarea, select, label, [role="checkbox"], [contenteditable="true"], [data-row-actions], [data-row-menu]';

/** How many frames that take OS files, and pages that ask for it (useRefuseStrayFiles), are mounted: while any is, a
 *  file dropped anywhere nothing takes it is refused (no drop effect), so the browser never opens it in place of the Hub. */
let fileFrames = 0;
const refuseStray = (e: globalThis.DragEvent) => {
  if (e.defaultPrevented || !Array.from(e.dataTransfer?.types ?? []).includes(FILES)) return;
  e.preventDefault();
  if (e.type === 'dragover' && e.dataTransfer) e.dataTransfer.dropEffect = 'none';
};
/** While `on`, a file from the computer dropped where nothing on the page takes it is refused (no drop effect), so the
 *  browser never opens it in place of the Hub. A table with a Files drop target does this itself; a page that takes
 *  files only in some states (its table can be missing) calls it for its whole life. */
export function useRefuseStrayFiles(on: boolean) {
  useEffect(() => {
    if (!on) return undefined;
    if (fileFrames++ === 0) {
      document.addEventListener('dragover', refuseStray);
      document.addEventListener('drop', refuseStray);
    }
    return () => {
      if (--fileFrames === 0) {
        document.removeEventListener('dragover', refuseStray);
        document.removeEventListener('drop', refuseStray);
      }
    };
  }, [on]);
}

/** Regular files of a drop, and how many folders came with them (a folder's File reads fail: never taken). */
function filesOf(dt: DataTransfer): { files: File[]; folders: number } {
  const items = Array.from(dt.items ?? []).filter((it) => it.kind === 'file');
  if (!items.length) return { files: Array.from(dt.files ?? []), folders: 0 };
  const files: File[] = [];
  let folders = 0;
  for (const it of items) {
    const entry = typeof it.webkitGetAsEntry === 'function' ? it.webkitGetAsEntry() : null;
    if (entry && !entry.isFile) {
      folders++;
      continue;
    }
    const f = it.getAsFile();
    if (f) files.push(f);
  }
  return { files, folders };
}

type Spot = { kind: 'row'; row: unknown; el: HTMLElement } | { kind: 'body' } | { kind: 'none' };

/** The drop handlers and mark useTableDrag puts on the table's frame. */
export interface FrameDropProps {
  'data-drop-frame'?: string;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDragLeave?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
}
/** The drag handlers and mark useTableDrag puts on one row. */
export interface RowDragProps {
  'data-drop-row'?: string;
  /** This row is being dragged (the row a drag started on, and every selected row it carries): drawn dimmed. */
  'data-dragging'?: '';
  draggable?: true;
  onMouseDownCapture?: MouseEventHandler<HTMLElement>;
  onDragStart?: DragEventHandler<HTMLElement>;
}

/** What useTableDrag returns for the table to spread and render. */
export interface TableDrag {
  /** Spread on the table's frame (its empty state included): the drop target. */
  readonly frameProps: FrameDropProps;
  /** Spread on a row: drag start, and its mark as this table's own row. */
  readonly rowProps: (id: string, row: unknown) => RowDragProps;
  /** The hint beside the pointer and its live region: render once inside the table. */
  readonly hint: ReactNode;
}

/**
 * A drop target that is no table: a plain div around one (Files: the whole folder view, its bar and the room below a
 * short listing), taking a drop where the table's body would, ringed while it does. It fills its parent as a column
 * (a flex child that grows), so the room below a short listing is its own. A table inside it judges its own
 * spots first (its rows, and its body unless the DropTarget says bodyByArea, claim the drag, refused or not); the area
 * takes every other spot, but none in a portal (a dialog the page opened). The same DropTarget as the table's: `over`
 * is always null here. It draws nothing else: its children are the page's.
 */
export function DropArea<T>({ drop, children }: { drop: DropTarget<T> | undefined; children?: ReactNode }) {
  // Every spot of the area is its body, the spots a table inside leaves to it (bodyByArea) included.
  const { frameProps: own, hint } = useTableDrag<T>(undefined, drop && { ...drop, bodyByArea: false }, () => undefined, () => []);
  // Only what is drawn inside the area: React passes a portal's events (a dialog or menu the page opened) up its own
  // tree, and a drop on an open dialog is never the area's.
  const drawnIn = (e: DragEvent<HTMLElement>) => e.target instanceof Node && e.currentTarget.contains(e.target);
  return (
    <div
      className={s.dropArea}
      {...own}
      onDragOver={own.onDragOver && ((e) => { if (drawnIn(e)) own.onDragOver?.(e); })}
      onDrop={own.onDrop && ((e) => { if (drawnIn(e)) own.onDrop?.(e); })}
    >
      {children}
      {hint}
    </div>
  );
}

/** Drag events a drop frame already handled (took over, or refused with no effect): an enclosing frame (a table
 *  around a nested one) leaves them alone. A frame that does not take the drag's types claims nothing, so its
 *  surroundings still judge it as their body. */
const claimed = new WeakSet<Event>();

/**
 * The table's drag and drop. `rowOf(id)` is the row a `data-row-id` names; `draggedOf(id)` the rows a drag from that
 * row carries (the row alone, or every selected row when it is selected). `off`: this presentation takes no drag or
 * drop (cards); a table that takes OS files still refuses them page-wide, so the browser never opens one. `idOf`: a
 * row's id, so every row a drag carries is dimmed (without it, only the row the drag started on).
 */
export function useTableDrag<T>(
  rowDrag: RowDrag<T> | undefined,
  dropProp: DropTarget<T> | undefined,
  rowOf: (id: string) => T | undefined,
  draggedOf: (id: string) => readonly T[],
  off = false,
  idOf?: (row: T) => string,
): TableDrag {
  const drop = off ? undefined : dropProp;
  // Only the hint's words are React state: the marked row or frame is set on the element itself, so moving across
  // rows renders nothing while the words stay the same (dragover fires many times a second).
  const [text, setText] = useState<string | null>(null);
  // The words say why this target refuses the drag (DropTarget.refusal), not what a drop does.
  const [refused, setRefused] = useState(false);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const downOn = useRef<EventTarget | null>(null);
  const marked = useRef<HTMLElement | null>(null);
  // Marks this table's own rows: a nested table's rows (an expanded row's sub-table) are never this table's targets.
  const uid = useId();
  // The ids of the rows being dragged from this table (state: a row scrolled back into a virtual list is still dimmed).
  const [dragging, setDragging] = useState<ReadonlySet<string> | null>(null);
  // Ends the drag this table started (its dimming and listeners), while one lasts.
  const live = useRef<(() => void) | null>(null);
  useEffect(() => () => live.current?.(), []);
  useRefuseStrayFiles(Boolean(dropProp?.types.includes(FILES)));

  const mark = (el: HTMLElement | null) => {
    if (marked.current === el) return;
    marked.current?.removeAttribute('data-drop-over');
    el?.setAttribute('data-drop-over', '');
    marked.current = el;
  };
  const clear = () => {
    mark(null);
    setText(null);
    setRefused(false);
  };
  // Beside the pointer, moved without a render; held inside the window's end edge, so the words are never cut there.
  const putHint = () => {
    const el = hintRef.current;
    if (!el) return;
    const room = el.offsetWidth > 0 ? Math.max(0, window.innerWidth - el.offsetWidth - 4) : Infinity;
    el.style.transform = `translate(${Math.min(pointer.current.x + 14, room)}px, ${pointer.current.y + 14}px)`;
  };
  const placeHint = (e: DragEvent<HTMLElement>) => {
    pointer.current = { x: e.clientX, y: e.clientY };
    putHint();
  };
  useEffect(() => () => mark(null), []);
  // A drag that ends anywhere (dropped elsewhere, or cancelled with Esc over this table: not every browser sends
  // dragleave first) leaves no mark and no hint here.
  useEffect(() => {
    if (!dropProp) return undefined;
    const done = () => clear();
    document.addEventListener('dragend', done, true);
    return () => document.removeEventListener('dragend', done, true);
  }, [Boolean(dropProp)]); // eslint-disable-line react-hooks/exhaustive-deps
  // Drops turned off mid-drag (the prop gone, or cards): no drag event follows here, so the mark and hint go now.
  const dropping = Boolean(drop);
  useEffect(() => {
    if (!dropping) clear();
  }, [dropping]); // eslint-disable-line react-hooks/exhaustive-deps

  /** What is under the pointer: a row of this table (never a group header, never a nested table's row) or the body. */
  const spotAt = (e: DragEvent<HTMLElement>, info: DragInfo): Spot => {
    const frame = e.currentTarget;
    const el = (e.target as Element | null)?.closest?.('[data-row-id]') as HTMLElement | null;
    if (!el || !frame.contains(el) || el.getAttribute('data-drop-row') !== uid) return { kind: 'body' };
    const row = rowOf(el.getAttribute('data-row-id') ?? '');
    if (row === undefined) return { kind: 'body' };
    const kind = drop?.rowTarget?.(row, info) ?? 'body';
    return kind === 'row' ? { kind, row, el } : { kind };
  };

  let frameProps: FrameDropProps = {};
  if (drop) {
    const typesOf = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []);
    const taken = (types: readonly string[]) => drop.types.find((t) => types.includes(t));
    frameProps = {
      'data-drop-frame': uid,
      onDragOver: (e: DragEvent<HTMLElement>) => {
        const types = typesOf(e);
        if (claimed.has(e.nativeEvent)) {
          // A nested frame owns this spot: this frame shows nothing for it.
          clear();
          return;
        }
        if (!taken(types)) return;
        const info: DragInfo = { types, copy: isCopyDrag(e) };
        const spot = spotAt(e, info);
        if (spot.kind === 'body' && drop.bodyByArea) {
          // The area around the table judges this spot (it sees the event next): nothing shows here.
          clear();
          return;
        }
        claimed.add(e.nativeEvent);
        // Taken over even where nothing drops (dropEffect none), so the browser never opens a dropped file.
        e.preventDefault();
        const at = spot.kind === 'row' ? (spot.row as T) : null;
        if (spot.kind === 'none' || !drop.accept(at, info)) {
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
          mark(null);
          const why = spot.kind === 'none' ? null : (drop.refusal?.(at, info) ?? null);
          setRefused(why !== null);
          setText((cur) => (cur === why ? cur : why));
          if (why !== null) placeHint(e);
          return;
        }
        const copies = drop.copies ? drop.copies(at, info) : types.includes(FILES) || info.copy;
        if (e.dataTransfer) e.dataTransfer.dropEffect = copies ? 'copy' : 'move';
        mark(spot.kind === 'row' ? spot.el : e.currentTarget);
        const words = drop.hint(at, info);
        setRefused(false);
        setText((cur) => (cur === words ? cur : words));
        placeHint(e);
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        // Only when the pointer leaves the frame (moving between its children fires leave too).
        const to = e.relatedTarget as Node | null;
        if (!to || !e.currentTarget.contains(to)) clear();
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        clear();
        const type = taken(typesOf(e));
        if (claimed.has(e.nativeEvent) || !type) return;
        const info: DragInfo = { types: [type], copy: isCopyDrag(e) };
        const spot = spotAt(e, info);
        if (spot.kind === 'body' && drop.bodyByArea) return; // the area around the table takes it
        claimed.add(e.nativeEvent);
        e.preventDefault();
        if (spot.kind === 'none') return;
        const at = spot.kind === 'row' ? (spot.row as T) : null;
        let data: DropData;
        if (type === FILES) {
          const got = filesOf(e.dataTransfer);
          if (!got.files.length && !got.folders) return;
          data = { type, files: got.files, folders: got.folders };
        } else {
          try {
            data = { type, payload: JSON.parse(e.dataTransfer.getData(type)) as unknown };
          } catch {
            return; // a payload that is not ours: dropped silently
          }
        }
        if (!drop.accept(at, info)) return;
        drop.onDrop(at, data, info);
      },
    };
  }

  const rowProps = (id: string, row: unknown): RowDragProps => {
    const own: RowDragProps = { ...(drop ? { 'data-drop-row': uid } : {}), ...(dragging?.has(id) ? { 'data-dragging': '' as const } : {}) };
    if (off || !rowDrag || (rowDrag.canDrag && !rowDrag.canDrag(row as T))) return own;
    return {
      ...own,
      draggable: true,
      onMouseDownCapture: (e: MouseEvent<HTMLElement>) => {
        downOn.current = e.target;
      },
      onDragStart: (e: DragEvent<HTMLElement>) => {
        const from = (downOn.current ?? e.target) as Element | null;
        downOn.current = null;
        if (from?.closest?.(NO_DRAG) && e.currentTarget.contains(from)) {
          e.preventDefault();
          return;
        }
        const rows = draggedOf(id);
        e.dataTransfer.effectAllowed = 'copyMove';
        e.dataTransfer.setData(rowDrag.type, JSON.stringify(rowDrag.payload(rows)));
        if (rowDrag.text) e.dataTransfer.setData('text/plain', rowDrag.text(rows));
        const words = rowDrag.preview?.(rows);
        if (words && typeof e.dataTransfer.setDragImage === 'function') {
          // The browser copies the picture when this handler returns: the element lives off-screen until the next task.
          const ghost = document.createElement('div');
          ghost.className = s.dragGhost ?? '';
          ghost.setAttribute('data-drag-ghost', '');
          ghost.setAttribute('aria-hidden', 'true');
          ghost.textContent = words;
          document.body.appendChild(ghost);
          e.dataTransfer.setDragImage(ghost, 12, 12);
          setTimeout(() => ghost.remove(), 0);
        }
        // Dimmed on the next frame: after the browser took its picture of the row, and never by changing the page
        // inside dragstart (a browser may end a drag whose source changes there).
        const ids = new Set(idOf ? rows.map(idOf) : []).add(id);
        live.current?.();
        const el = e.currentTarget;
        const frame = requestAnimationFrame(() => setDragging(ids));
        // Listening from dragstart itself, so an end before that frame is seen too. The drag's own row can be out of
        // the page before its dragend (a refresh, a virtual list scrolled on): that dragend never reaches the document,
        // but Chromium and Firefox still send it to the row, so it is heard on the row. The document's drop, the next
        // press or the window losing focus end the dimming too. A drag that ends with none of these (WebKit sends no
        // dragend when nothing took the drop) is over once the pointer moves on, released, with no drag event
        // (LULL_MOVES).
        let dimming = true;
        let moves = 0;
        let lastDrag = e.timeStamp;
        const stillDragging = (ev: Event) => {
          moves = 0;
          lastDrag = ev.timeStamp;
        };
        const moved = (ev: PointerEvent) => {
          if (ev.buttons === 0 && ++moves >= LULL_MOVES && ev.timeStamp - lastDrag > LULL_MS) done();
        };
        const end = () => {
          if (!dimming) return;
          dimming = false;
          cancelAnimationFrame(frame);
          document.removeEventListener('drop', end, true);
          window.removeEventListener('pointerdown', end, true);
          window.removeEventListener('blur', end);
          for (const t of STILL_DRAGGING) document.removeEventListener(t, stillDragging, true);
          window.removeEventListener('pointermove', moved, true);
          setDragging(null);
        };
        const done = () => {
          el.removeEventListener('dragend', done);
          end();
          clear();
          rowDrag.onEnd?.();
        };
        live.current = () => {
          el.removeEventListener('dragend', done);
          end();
        };
        el.addEventListener('dragend', done);
        document.addEventListener('drop', end, true);
        window.addEventListener('pointerdown', end, true);
        window.addEventListener('blur', end);
        for (const t of STILL_DRAGGING) document.addEventListener(t, stillDragging, true);
        window.addEventListener('pointermove', moved, true);
      },
    };
  };

  const hint =
    drop && typeof document !== 'undefined' ? (
      <>
        <div role="status" aria-live="polite" className={SR_ONLY}>
          {text ?? ''}
        </div>
        {text !== null &&
          createPortal(
            <div ref={hintRef} className={s.dropHint} aria-hidden="true" data-drop-hint="" {...(refused ? { 'data-drop-refused': '' } : {})}>
              {text}
            </div>,
            document.body,
          )}
      </>
    ) : null;
  // The hint's first frame: placed where the pointer is, before it paints.
  useLayoutEffect(() => {
    putHint();
  }, [text]);

  return { frameProps, rowProps, hint };
}
