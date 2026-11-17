// Dragging Files rows onto a folder (move, or copy with the copy key; to the other pane, copy, or
// move with the key). The kit carries the drag
// (kit/data/drag.tsx); this module holds what Files puts on it and how a drop is judged. A drop only opens the page's
// own Copy / Move dialog (TransferDialog or SeveralDialog), which plans and asks as the menus do: nothing is sent here.
//
// Browsers hide a drag's payload until the drop, so the drag this tab started is also kept here while it lasts: a
// target judges it on dragover. A drag from another tab or window is not taken (the rows menus cover it): each drag
// carries a fresh id, and a drop is taken only when its payload is the kept one, id included.
export { FILES_ROW, rowPayloadOf, rowsMayGo, rowsNoGo, dropHow, sameDrag } from './rowdrag.pure';
export type { RowPayload, DragSource, DropHow, NoGo } from './rowdrag.pure';
import type { RowPayload, DragSource } from './rowdrag.pure';

let current: RowPayload | null = null;
let source: DragSource | null = null;
let listening = false;
const forget = () => {
  current = null;
  source = null;
};
const newId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** The payload of a drag starting now. `ok` false (a dragged row can't change): no target takes this drag. */
export function startRowDrag(p: Omit<RowPayload, 'drag'>, ok: boolean, from: DragSource): RowPayload {
  const out: RowPayload = { ...p, drag: newId() };
  current = ok ? out : null;
  source = ok ? from : null;
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    // The drag is over when its source gets dragend (it bubbles here unless a refresh removed the source row
    // meanwhile), after a drop here has been handled (bubble: the frames' handlers run first), or at the next press
    // (no browser sends a pointerdown while a drag lasts). Without any of these, draggingRows asks the source.
    // Never on pointermove: Firefox and WebKit send one right after dragstart (with a button held or none), and
    // ending the drag there would make every target refuse it in both.
    // A source row out of the page keeps its dragend to itself, and WebKit sends none when nothing took the drop: the
    // table hears the row's own dragend, or pointer moves with no drag event past a lull, and calls endRowDrag. The
    // window losing focus ends the drag too: a press in another page or frame is never seen here, and a drag left
    // registered would take a later drop carrying its payload.
    document.addEventListener('dragend', forget);
    document.addEventListener('drop', forget);
    window.addEventListener('pointerdown', forget, true);
    window.addEventListener('blur', forget);
  }
  return out;
}

/** The drag's source row got its dragend (RowDrag.onEnd): the drag is over, whoever started it. */
export function endRowDrag(): void {
  forget();
}

/** The view that started the drag unmounts: its drag is over. */
export function endRowDragFrom(from: DragSource): void {
  if (source === from) forget();
}

/** The drag this tab started, while it lasts and its source still holds it (a source gone ends it here, with no
 *  event needed in this window: a page that saw the payload can't bring it back). */
export function draggingRows(): RowPayload | null {
  if (current && !(source?.(current) ?? false)) forget();
  return current;
}
