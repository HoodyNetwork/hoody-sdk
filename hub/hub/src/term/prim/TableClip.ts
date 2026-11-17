// ClipText: one line of text that gives way by its kind (TableCells CellCut) inside whatever width its row leaves it:
// it measures its own box and cuts the string itself (one-cell "…", at the end, the start, or keeping a path's tail),
// instead of the engine's `truncate` (which cuts in the middle with "..."). For list rows, Logs-style lines and any
// cell whose width is only known after layout.
import { createContext, createElement, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Box } from './Box';
import { OneLine, Text } from './Text';
import { cutCells, cellWidth, type CellCut } from './TableCells';
import { TableMark } from './TableMark';
import type { Colour } from './tokens';

export interface ClipTextProps {
  text: string;
  cut?: CellCut;
  colour?: Colour;
  bold?: boolean;
  /** Underlined (a focused group name). */
  underline?: boolean;
  /** Grow into spare room (default true). */
  grow?: boolean;
}

export function ClipText({ text, cut = 'end', colour, bold, underline, grow = true }: ClipTextProps): ReactElement {
  const [w, setW] = useState<number | null>(null);
  const shown = w === null ? text : cutCells(text, w, cut);
  // Cut: the screen shows "hooks.exam…", the semantics (an agent, a screen reader, row names) keep the whole value.
  const isCut = shown !== text;
  return createElement(
    Box,
    { dir: 'row', grow: grow ? 1 : 0, shrink: 1, minWidth: 0, width: grow ? undefined : cellWidth(text), clip: true, onSize: (width: number) => setW((old) => (old === width ? old : width)), ...(isCut ? { sem: { name: text } } : {}) },
    // The text is exactly as wide as what it shows and never shrinks: a word-wrapping text laid out narrower than this
    // box (a stale measure after a sibling gave room back) wrapped at a break and lost its end with no mark
    // ("POST hooks.example." for "POST hooks.example.org"). The cut above already fits it to the box.
    createElement(Text, { colour, bold, ...(underline ? { underline } : {}), maxLines: 1, width: cellWidth(shown), shrink: 0, ...(isCut ? { sem: { hidden: true } } : {}) }, shown),
  );
}

interface LaidNode {
  x: number; y: number; width: number; height: number;
  plainText?: string;
  lineInfo?: { lineWidthCols?: number[] };
  virtualLineCount?: number;
  _overflow?: string;
  /** Its own width option (a number when the box was given one). */
  _width?: unknown;
  /** Engine id; `~cut` at its end: the box declares it drops what does not fit (Box `drops`). */
  id?: string;
  getChildren?(): LaidNode[];
  /** Engine layout reads (yoga): 1 = wrap; 2 = row; the column gap. */
  getFlexWrap?(): number;
  getFlexDirection?(): number;
  getGap?(gutter: number): { value?: number | null } | undefined;
  __cutMarked?: boolean;
  /** One of ClipRow's own "…" boxes: never read as content (its mark would push the next mark right). */
  __clipMark?: boolean;
}

/** One "…" a clipping box draws over a loss: its column and line, relative to the box. */
/** `blank`: cells after the mark drawn blank (a cut right after a blank pulls the mark back to the words and hides the
 *  clipped letters behind it). */
export interface ClipMark { col: number; row: number; blank?: number }

/** Where the "…" marks go in a clipping box whose texts lose something (empty when nothing is lost). A shown line
 *  running past the right edge: the box's last column on that line. A text wrapped onto lines the box does not show:
 *  right after its last shown line ("Can't open…" for "Can't open here yet" cut at a word break), or the last column.
 *  A whole line below the box (a stacked block in a one-line row): right after the words of the last shown line. */
export function clipMarksOf(box: LaidNode): ClipMark[] {
  return clipStateOf(box).marks;
}

/** clipMarksOf, whether a whole line below the box is dropped (ClipRow then keeps one cell for its mark), and `natural`:
 *  the cells its shown lines need from the box's left edge (a part that cuts itself counts at its own edge), plus the
 *  mark's cell when a line is dropped. The table reads it as the column's want (DataTableTermLayout growFixed). */
export function clipStateOf(box: LaidNode): { marks: ClipMark[]; dropped: boolean; natural: number; roomy: boolean } {
  if (box.width <= 0 || box.height <= 0) return { marks: [], dropped: false, natural: 0, roomy: false };
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const at = new Map<number, number>();
  const blanks = new Map<number, number>();
  const put = (col: number, y: number): void => {
    const c = Math.max(0, Math.min(col, right - 1) - box.x);
    const r = y - box.y;
    if (c >= (at.get(r) ?? 0)) blanks.delete(r);
    at.set(r, Math.max(at.get(r) ?? 0, c));
  };
  // A right-edge cut whose last shown cell before the mark is a blank: the mark goes right after the words (as clipCells:
  // "atlas stopped…", never "atlas stopped …") and the cells from there to the edge are drawn blank.
  const putEdge = (line: string | undefined, x: number, y: number): void => {
    const edge = right - 1;
    if (line !== undefined) {
      let shown = '';
      let w = 0;
      for (const ch of line) { const cw = cellWidth(ch); if (x + w + cw > edge) break; shown += ch; w += cw; }
      const words = shown.trimEnd();
      if (words.length > 0 && words.length < shown.length) {
        const col = x + cellWidth(words);
        const r = y - box.y;
        if (col - box.x >= (at.get(r) ?? 0)) { at.set(r, col - box.x); blanks.set(r, edge - col); }
        return;
      }
    }
    put(edge, y);
  };
  // `r`, `b`: the tightest right and bottom edges of the clipping boxes between the text and this box; only a text whose
  // boxes reach this box's edge (or past it) is cut by it. A clipping box that only SHRANK to the edge (no width of its
  // own: a span the row squeezed) is the cell's cut, so its unwrapped line is marked; `own` is the tightest edge of the
  // boxes with a width of their own or that declare they drop (`drops`), which must lie past this box's edge. A text clipped
  // tighter inside (a tag that gives way whole, shrunk to nothing; a part that cuts itself) is that part's own business:
  // only what this box's own edge cuts gets the mark.
  // A line below this box's last shown line (a cell's stacked block in a one-line row: a name over its note) is dropped
  // whole: the last shown line ends in one "…" right after its words (`ink`: where the words of that line end).
  let dropped = false;
  let ink = -1;
  let natural = 0;
  // A row that wrapped (a cell's inline row: "Web address" over "seen 09:00 AM"): the cells its parts need on ONE line,
  // from the box's left edge. Without it a cell reported less while wrapped than once it had been drawn whole, and the
  // table's column kept whichever it heard first (tunnels 120 -> 200 -> 120 was not the fresh 120 frame).
  let unwrapped = 0;
  const widthOf = (k: LaidNode): number => (typeof k.plainText === 'string' ? Math.max(0, ...k.plainText.split('\n').map((l) => cellWidth(l))) : k.width);
  // `need`: as `own`, for the cells a part NEEDS: the edge of a box at the width it was GIVEN (its own width option),
  // not the width the row squeezed it to, and a box that only declares it drops (a tag that gives way whole) is no
  // edge. So the need is the same in a narrow column and a wide one (a text with its own width squeezed to 10 cells
  // reported 10, market RAM; a tag that had given way was not counted, schedules Name 31 or 36), and the column's want
  // never depends on the widths the table passed through.
  const walk = (n: LaidNode, r: number, b: number, own: number, need: number): void => {
    if (typeof n.plainText === 'string') {
      if (!n.plainText.trim() || n.y + n.height <= box.y) return;
      if (n.y >= bottom) {
        // Dropped by THIS box's bottom edge (no tighter box inside already hid it), and not dropped sideways.
        if (b > n.y && r > n.x) dropped = true;
        return;
      }
      if (r <= n.x || b <= n.y) return; // dropped whole inside: nothing of it shows, nothing is cut
      // The line count is the layout's (virtualLineCount, known as soon as the text is measured); the per-line widths
      // come later with lineInfo, so a line whose width is not known yet counts as filling the text's box.
      const known = n.lineInfo?.lineWidthCols ?? n.plainText.split('\n').map((l) => cellWidth(l));
      const count = Math.max(known.length, n.virtualLineCount ?? 0, 1);
      const widths = Array.from({ length: count }, (_, i) => known[i] ?? n.width);
      const first = Math.max(0, box.y - n.y);
      const shownEnd = Math.min(widths.length, bottom - n.y);
      // Its words unwrapped (a pill wrapped at a word to fit shows fewer cells than it needs).
      const whole = Math.max(...n.plainText.split('\n').map((l) => cellWidth(l)));
      natural = Math.max(natural, Math.min(n.x + whole, need) - box.x);
      const lastRow = bottom - 1 - n.y;
      if (lastRow >= first && lastRow < shownEnd && r > n.x) ink = Math.max(ink, n.x + (widths[lastRow] ?? 0));
      // The words of line i when the text is unwrapped (its lines are its own): else only its width is known.
      const own_lines = n.plainText.split('\n');
      const lineOf = (i: number): string | undefined => (own_lines.length === widths.length ? own_lines[i] : undefined);
      if (r >= right && own > right) for (let i = first; i < shownEnd; i++) if (n.x + (widths[i] ?? 0) > right) putEdge(lineOf(i), n.x, n.y + i);
      if (b > bottom && shownEnd > first && widths.length > shownEnd && widths.slice(shownEnd).some((w) => w > 0)) {
        const last = shownEnd - 1;
        put(n.x + (widths[last] ?? 0) > right ? right - 1 : n.x + (widths[last] ?? 0), n.y + last);
      }
      return;
    }
    const clips = n._overflow === 'hidden' && n.width >= 0;
    const r2 = clips ? Math.min(r, n.x + n.width) : r;
    // Its own cut: a width of its own, or a box declaring it drops what does not fit (a tag that gives way whole).
    const ownCut = clips && (typeof n._width === 'number' || (typeof n.id === 'string' && n.id.endsWith('~cut')));
    const own2 = ownCut ? Math.min(own, n.x + n.width) : own;
    const given = typeof n._width === 'number' && n._width > 0 ? n._width : null;
    // A box with a width of its own needs that width, with or without content (the blank that holds a hidden tag's place).
    // It counts at the very edge too (`<=`): a tag that gave way in a cell just as wide as its title leaves its blank
    // in a box squeezed to nothing, whose right edge is the blank's own left. Past the edge it does not (the tag's
    // measuring copy sits far off to the right).
    if (given !== null && n.x <= r && n.y < bottom && n.y + n.height > box.y) natural = Math.max(natural, Math.min(n.x + given, need) - box.x);
    const need2 = clips && given !== null ? Math.min(need, n.x + given) : need;
    const b2 = clips ? Math.min(b, n.y + n.height) : b;
    const kids = (n.getChildren?.() ?? []).filter((k) => !k.__clipMark);
    if (kids.length > 1 && n.y < bottom && kids.some((k) => k.y !== kids[0]!.y) && n.getFlexWrap?.() === 1 && n.getFlexDirection?.() === 2) {
      const parts = kids.filter((k) => k.width > 0 && k.height > 0);
      const gap = Number(n.getGap?.(0)?.value) || 0;
      const line = parts.reduce((sum, k) => sum + widthOf(k), 0) + gap * Math.max(0, parts.length - 1);
      unwrapped = Math.max(unwrapped, Math.min(n.x + line, need2) - box.x);
    }
    for (const k of n.getChildren?.() ?? []) walk(k, r2, b2, own2, need2);
  };
  for (const k of box.getChildren?.() ?? []) if (!k.__clipMark) walk(k, Infinity, Infinity, Infinity, Infinity);
  if (dropped) put(ink >= 0 ? ink : box.x, bottom - 1);
  return { marks: [...at].map(([row, col]) => ({ col, row, ...(blanks.get(row) ? { blank: blanks.get(row) } : {}) })).sort((a, b) => a.row - b.row), dropped, natural: Math.max(natural + (dropped ? 1 : 0), unwrapped), roomy: dropped && unwrapped > 0 && natural + 1 <= unwrapped && box.width >= unwrapped };
}

/**
 * ClipRow: a one-line box for element content (a compat <span> with an icon, a name and a dim note) that may not fit
 * its cell. What does not fit is clipped at the box edge as before, and the loss is marked with one "…" at the end
 * (the table rule: a cut is always one "…" at its end), whether the words ran past the right edge or wrapped onto a
 * line the cell does not show. The box carries `__cutMarked` while it draws a mark (the table gate reads it). The mark
 * is a TableMark: left out of the engine's selection, so copying a cut cell gives its whole value, never the "…".
 */
interface Rgba { a: number }
interface PaintNode { x: number; y: number; width: number; parent?: PaintNode | null; backgroundColor?: Rgba }
interface PaintBuffer { setCell(x: number, y: number, char: string, fg: Rgba, bg: Rgba): void }
/**
 * Paints the cells after a mark's "…" (its `blank`) as plain spaces on the background under them, so the clipped
 * letter there is hidden. A space drawn as text keeps the cell below (the engine blends a blank over what is there), and
 * a filler character (U+00A0) would be copied by a selection or the terminal's own copy: the cells are written directly,
 * a plain " " on the nearest ancestor's own background (the row's hover or selected fill included, read every frame).
 */
function blankAfterMark(this: PaintNode, buf: PaintBuffer): void {
  let bg = this.backgroundColor;
  for (let p = this.parent; p; p = p.parent) { if (p.backgroundColor && p.backgroundColor.a > 0) { bg = p.backgroundColor; break; } }
  if (!bg) return;
  for (let i = 1; i < this.width; i++) buf.setCell(this.x + i, this.y, ' ', bg, bg);
}
/** Tags a ClipRow mark box (clipStateOf skips it). */
const markRef = (n: unknown): void => { if (n) (n as LaidNode).__clipMark = true; };

/** Asks the ClipRow around a part to measure again: for a part whose need changes while no box of the row changes
 *  size (a tag that gives way learns its width only after the cell was measured without it; in a cell exactly as wide
 *  as its title nothing resizes then, so the column kept the title's width or the tag's by what was drawn first). */
export const ClipRemeasure = createContext<(() => void) | null>(null);

/** `remeasure`: when it changes, the row measures again and reports its natural width (a table's new row set: the want it
 *  heard is cleared, and a cell whose size did not change would never report again; files at 80x24 after a refetch cut
 *  "Can't open here yet" while Kind kept cells its words never use). */
/** `onLines`: the lines its content takes (a stacked block: a name over its note; a note that wraps), for a table row
 *  that grows to its tallest cell instead of dropping line 2. */
export function ClipRow({ children, onNatural, remeasure, onLines }: { children?: ReactNode; onNatural?: (cells: number) => void; remeasure?: unknown; onLines?: (lines: number) => void }): ReactElement {
  const self = useRef<LaidNode | null>(null);
  const inner = useRef<LaidNode | null>(null);
  const lines = useRef(onLines);
  lines.current = onLines;
  const [marks, setMarks] = useState<readonly ClipMark[]>([]);
  // A dropped line below: one cell kept on the right for the "…" after the words (the box is as wide as its content).
  const [dropped, setDropped] = useState(false);
  const queued = useRef(false);
  // The report goes to the callback of the LATEST render: a read queued under an earlier one (the table's row set before
  // this one) reported to that row set's callback, which threw away what the cells of the new row set had reported; a
  // cell whose size then never changed did not report again (tunnels: Port kept 12 cells for "3000" in some runs).
  const report = useRef(onNatural);
  report.current = onNatural;
  const run = (): void => {
    queued.current = false;
    const n = self.current;
    if (!n) return;
    const st = clipStateOf(n);
    const next = st.marks;
    // A wrapped row the box now has room for on one line keeps no cell for a mark: with it the row had one cell too few
    // to go back onto one line, and stayed wrapped under a column as wide as its words.
    setDropped(st.dropped && !st.roomy);
    report.current?.(st.natural);
    if (inner.current && inner.current.height > 0) lines.current?.(inner.current.height);
    n.__cutMarked = next.length > 0;
    setMarks((old) => (old.length === next.length && old.every((m, i) => m.col === next[i]!.col && m.row === next[i]!.row && m.blank === next[i]!.blank) ? old : next));
  };
  // A box hears its new size before its children are laid out in the same pass: read them once the pass is over.
  const check = (): void => { if (!queued.current) { queued.current = true; setTimeout(run, 0); } };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs only when the row set changes; check reads refs
  useEffect(() => { if (remeasure !== undefined) check(); }, [remeasure]);
  const latest = useRef(check);
  latest.current = check;
  const again = useMemo(() => (): void => latest.current(), []);
  return createElement(ClipRemeasure.Provider, { value: again }, createElement(
    Box,
    { dir: 'row', shrink: 1, minWidth: 0, clip: true, drops: true, align: 'start', ...(dropped ? { pad: { right: 1 } } : {}), boxRef: (n: unknown) => { self.current = n as LaidNode | null; }, onSize: check },
    // Its own height is its content's (align start), so a word wrapping onto a second line resizes it and re-checks.
    // One line (OneLine clip): its Texts never wrap or shrink, so the line keeps its natural width and the cut is
    // this box's edge with one "…" at the END, never a word break ("Can't open…" for "Can't open here yet").
    createElement(Box, { dir: 'row', shrink: 1, minWidth: 0, clip: false, onSize: check, boxRef: (n: unknown) => { inner.current = n as LaidNode | null; } }, createElement(OneLine, { mode: 'clip' }, children)),
    ...marks.map((m) => createElement(Box, { key: `cut${m.row}`, boxRef: markRef, width: 1 + (m.blank ?? 0), height: 1, shrink: 0, raw: { position: 'absolute', left: m.col, top: m.row, ...(m.blank ? { renderAfter: blankAfterMark } : {}) } }, createElement(TableMark, null, '\u2026'))),
  ));
}
